-- ============================================================================
-- 121_newsletter.sql  -  the release newsletter
-- ============================================================================
-- One list, one row per address. Two ways onto it:
--
--   * A SIGNED-IN player ticks a box (home page or a game's profile). The address
--     is the one on their account, read here from auth.users, never sent by the
--     page. The account's address was confirmed when it was made, so the row goes
--     straight to 'active'.
--   * A GUEST types an address on the home page. That goes through the Cloudflare
--     function /api/newsletter/subscribe, which calls newsletter_guest_request()
--     with the service role and mails a confirm link. The row is 'pending' until
--     the link is followed. Nobody is mailed a newsletter they did not confirm.
--
-- EMAIL ADDRESSES ARE NOT PUBLIC, and that is why this is its own table.
-- `profiles` is world-readable (the leaderboards read usernames from it), so an
-- address must never be a column there. This table has RLS on and NO policies:
-- the anon and authenticated roles cannot select it at all. Signed-in players
-- only ever see their own status, through newsletter_status(), which returns one
-- word and never an address.
--
-- The sender (scripts/newsletter/send.mjs, run by .github/workflows/newsletter.yml)
-- reads the active rows with the service role and records each issue it sends in
-- newsletter_issues, so the next draft knows where the last one left off.
--
-- Idempotent: safe to re-run. Needs 10_accounts.sql (citext).
-- ----------------------------------------------------------------------------

create extension if not exists citext;
create extension if not exists pgcrypto;

create table if not exists public.newsletter_subscribers (
  id               bigserial primary key,
  email            citext not null unique,
  user_id          uuid references auth.users(id) on delete set null,
  status           text not null default 'pending'
                     check (status in ('pending','active','unsubscribed')),
  source           text not null default '',
  confirm_token    uuid not null default gen_random_uuid(),
  unsub_token      uuid not null default gen_random_uuid(),
  confirm_sends    int  not null default 0,
  confirm_sent_at  timestamptz,
  created_at       timestamptz not null default now(),
  confirmed_at     timestamptz,
  unsubscribed_at  timestamptz
);
create index if not exists newsletter_subscribers_user on public.newsletter_subscribers (user_id);
create index if not exists newsletter_subscribers_active on public.newsletter_subscribers (status) where status = 'active';

alter table public.newsletter_subscribers enable row level security;
revoke all on public.newsletter_subscribers from anon, authenticated;

create table if not exists public.newsletter_issues (
  id          bigserial primary key,
  subject     text not null,
  commit_sha  text,
  recipients  int  not null default 0,
  sent_at     timestamptz not null default now()
);
alter table public.newsletter_issues enable row level security;
revoke all on public.newsletter_issues from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Signed-in players
-- ---------------------------------------------------------------------------

-- 'active', 'pending', 'unsubscribed' or 'none', for the signed-in account.
-- Matched on the account id first and the account's address second, so a player
-- who joined as a guest and later made an account with the same address sees
-- the box already ticked.
create or replace function public.newsletter_status()
returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_st    text;
begin
  if v_uid is null then return 'none'; end if;
  select u.email into v_email from auth.users u where u.id = v_uid;
  select s.status into v_st from newsletter_subscribers s
   where s.user_id = v_uid or (v_email is not null and s.email = v_email::citext)
   order by (s.user_id = v_uid) desc nulls last
   limit 1;
  return coalesce(v_st, 'none');
end $$;

-- Tick or untick the box. Returns the new status.
create or replace function public.newsletter_set(p_on boolean, p_source text default '')
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then raise exception 'sign in first'; end if;
  select u.email into v_email from auth.users u where u.id = v_uid;
  if v_email is null or v_email = '' then raise exception 'this account has no email address'; end if;

  if p_on then
    insert into newsletter_subscribers (email, user_id, status, source, confirmed_at)
    values (v_email::citext, v_uid, 'active', left(coalesce(p_source,''), 40), now())
    on conflict (email) do update
       set user_id = v_uid,
           status = 'active',
           confirmed_at = coalesce(newsletter_subscribers.confirmed_at, now()),
           unsubscribed_at = null,
           source = case when newsletter_subscribers.source = '' then excluded.source
                         else newsletter_subscribers.source end;
    return 'active';
  end if;

  update newsletter_subscribers
     set status = 'unsubscribed', unsubscribed_at = now(), user_id = v_uid
   where email = v_email::citext or user_id = v_uid;
  return 'unsubscribed';
end $$;

revoke all on function public.newsletter_status() from public, anon;
revoke all on function public.newsletter_set(boolean, text) from public, anon;
grant execute on function public.newsletter_status() to authenticated;
grant execute on function public.newsletter_set(boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Guests, through the Cloudflare functions (service role only)
-- ---------------------------------------------------------------------------

-- Returns the confirm token when a confirm email should go out, and NULL when it
-- should not: the address is already on the list, or a link was mailed to it
-- recently. The function answers the page the same way in every case, so the
-- form cannot be used to find out who is subscribed.
--
-- The cooldown is what stops the form being used to mail a stranger over and
-- over: one confirm email per address per 15 minutes, and none at all once five
-- have gone unanswered.
create or replace function public.newsletter_guest_request(p_email text, p_source text default '')
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_row newsletter_subscribers%rowtype;
  v_email citext := lower(trim(p_email))::citext;
begin
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
    raise exception 'that does not look like an email address';
  end if;

  select * into v_row from newsletter_subscribers where email = v_email for update;

  if not found then
    insert into newsletter_subscribers (email, status, source, confirm_sends, confirm_sent_at)
    values (v_email, 'pending', left(coalesce(p_source,''), 40), 1, now())
    returning * into v_row;
    return v_row.confirm_token;
  end if;

  if v_row.status = 'active' then return null; end if;
  if v_row.confirm_sent_at is not null and v_row.confirm_sent_at > now() - interval '15 minutes' then return null; end if;
  if v_row.status = 'pending' and v_row.confirm_sends >= 5 then return null; end if;

  update newsletter_subscribers
     set status = 'pending',
         confirm_token = case when v_row.status = 'unsubscribed' then gen_random_uuid() else confirm_token end,
         confirm_sends = case when v_row.status = 'unsubscribed' then 1 else confirm_sends + 1 end,
         confirm_sent_at = now()
   where id = v_row.id
   returning * into v_row;
  return v_row.confirm_token;
end $$;

-- Follow a confirm link. true when the token named a row, which is then active.
create or replace function public.newsletter_confirm(p_token uuid)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  update newsletter_subscribers
     set status = 'active', confirmed_at = coalesce(confirmed_at, now()), unsubscribed_at = null
   where confirm_token = p_token and status <> 'unsubscribed';
  return found;
end $$;

-- Follow an unsubscribe link. true when the token named a row.
create or replace function public.newsletter_unsubscribe(p_token uuid)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  update newsletter_subscribers
     set status = 'unsubscribed', unsubscribed_at = coalesce(unsubscribed_at, now())
   where unsub_token = p_token;
  return found;
end $$;

revoke all on function public.newsletter_guest_request(text, text) from public, anon, authenticated;
revoke all on function public.newsletter_confirm(uuid) from public, anon, authenticated;
revoke all on function public.newsletter_unsubscribe(uuid) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.newsletter_guest_request(text, text) to service_role';
    execute 'grant execute on function public.newsletter_confirm(uuid) to service_role';
    execute 'grant execute on function public.newsletter_unsubscribe(uuid) to service_role';
    execute 'grant select, update on public.newsletter_subscribers to service_role';
    execute 'grant select, insert on public.newsletter_issues to service_role';
    execute 'grant usage on sequence public.newsletter_issues_id_seq to service_role';
  end if;
end $$;
