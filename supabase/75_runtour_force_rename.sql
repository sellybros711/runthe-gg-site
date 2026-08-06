-- ============================================================================
-- 75_runtour_force_rename.sql — moderation: retire an abusive username and make
--                               its owner pick a new one
-- ============================================================================
-- Owner: a player registered the username "georgefloyd69" — a real person's name
-- used as a joke. It is displayed publicly on every leaderboard, so it needs to
-- come down now, and the account needs to choose something else.
--
-- Three things have to happen, because the username is DENORMALISED:
--   1. profiles.username is the live name (leaderboard joins, h2h, pro names).
--   2. runtour_scores.display_name / runtour_daily_scores.display_name are
--      FROZEN COPIES taken at submit time — renaming the profile alone would
--      leave the old name sitting on every season and daily round they posted.
--      drafts.username is the same story on the soccer side of RunThe.GG.
--   3. username_ok must reject the name so it (or a trivial variant) can never
--      be taken again, by them or anyone else.
--
-- This is written as a REUSABLE moderation tool, not a one-off hand edit, so the
-- next bad name is one function call. It is service_role-only: it can never be
-- invoked from a browser.
--
-- Run AFTER 29_username_filter.sql. Idempotent; safe to re-run.
-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Block the name for good (substring match on the normalised string, so
--    georgefloyd69 / george_floyd / G3orgeFloyd are all rejected).
--    Same body as 29, with a "real people mocked as usernames" section added.
-- ---------------------------------------------------------------------------
create or replace function username_ok(p text)
returns boolean language plpgsql immutable as $$
declare
  norm text;
  blocked text[] := array[
    -- profanity
    'fuck','shit','bitch','cunt','asshole','dick','pussy','cock','whore','slut',
    'bastard','twat','wank','jizz',
    -- slurs (racial / ethnic / religious / homophobic / ableist)
    'nigger','nigga','chink','spic','kike','gook','wetback','beaner','tranny',
    'paki','retard','faggot','fag',
    -- real people whose names get registered to mock them / their deaths
    'georgefloyd','adolfhitler','hitler','osamabinladen','binladen'
  ];
  term text;
begin
  if p is null or p !~ '^[A-Za-z0-9_]{3,20}$' then
    return false;
  end if;
  -- fold case, drop underscores, and fold common leetspeak digits so trivial
  -- evasions (e.g. "n1gg3r", "fuck_you") still get caught.
  norm := translate(lower(replace(p, '_', '')), '013457', 'oieast');
  foreach term in array blocked loop
    if position(term in norm) > 0 then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The "you must pick a new name" flag.
--    Its own table with OWNER-ONLY rls — profiles is world-readable, so putting
--    a moderation flag there would publish who has been actioned.
-- ---------------------------------------------------------------------------
create table if not exists public.runtour_name_flags (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  reason     text not null default 'Your username broke our rules and was removed.',
  old_name   text,
  created_at timestamptz not null default now()
);
alter table public.runtour_name_flags enable row level security;
drop policy if exists runtour_name_flags_owner_read on public.runtour_name_flags;
create policy runtour_name_flags_owner_read on public.runtour_name_flags
  for select to authenticated using (auth.uid() = user_id);
grant select on table public.runtour_name_flags to authenticated;   -- read only; set by the tool below

-- the client asks "do I have to rename?" on sign-in; nobody can read anyone else's
create or replace function public.runtour_my_name_flag()
returns table(reason text)
language sql stable security definer set search_path = public as $$
  select f.reason from public.runtour_name_flags f where f.user_id = auth.uid();
$$;
revoke all on function public.runtour_my_name_flag() from public;
grant execute on function public.runtour_my_name_flag() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The moderation action itself.
--    Renames the account to a neutral placeholder, scrubs every frozen copy of
--    the old name, and flags the account so the game forces a rename on next
--    load. Returns the affected user id (null if that username doesn't exist).
--    NOT granted to anon/authenticated — service_role / SQL editor only.
-- ---------------------------------------------------------------------------
create or replace function public.runtour_force_rename(p_username text, p_reason text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid;
  v_old  text;
  v_new  text;
  v_try  int := 0;
begin
  select id, username::text into v_uid, v_old from public.profiles
   where username = p_username::citext;
  if v_uid is null then
    return null;                                   -- nothing to do (already renamed, or never existed)
  end if;

  -- a neutral, always-valid placeholder: player_<8 hex of the uid> (15 chars)
  v_new := 'player_' || substr(replace(v_uid::text,'-',''), 1, 8);
  while exists (select 1 from public.profiles where username = v_new::citext and id <> v_uid) and v_try < 20 loop
    v_try := v_try + 1;
    v_new := 'player_' || substr(replace(v_uid::text,'-',''), 1, 6) || lpad(v_try::text, 2, '0');
  end loop;

  update public.profiles set username = v_new where id = v_uid;

  -- scrub the FROZEN copies so the old name stops showing on posted rows
  if to_regclass('public.runtour_scores') is not null then
    update public.runtour_scores set display_name = v_new where user_id = v_uid;
  end if;
  if to_regclass('public.runtour_daily_scores') is not null then
    update public.runtour_daily_scores set display_name = v_new where user_id = v_uid;
  end if;
  if to_regclass('public.drafts') is not null
     and exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='drafts' and column_name='username') then
    execute 'update public.drafts set username = $1 where user_id = $2' using v_new, v_uid;
  end if;

  insert into public.runtour_name_flags(user_id, reason, old_name)
  values (v_uid,
          coalesce(p_reason, 'Your username broke our rules and was removed. Please choose a new one.'),
          v_old)
  on conflict (user_id) do update
    set reason = excluded.reason, old_name = coalesce(public.runtour_name_flags.old_name, excluded.old_name);

  return v_uid;
end;
$$;
revoke all on function public.runtour_force_rename(text,text) from public;
-- deliberately NOT granted to anon/authenticated: SQL editor / service_role only

-- ---------------------------------------------------------------------------
-- 4. Clearing the flag: picking a valid new username is what un-flags you.
--    (username_ok above already refuses the retired name, so they can't retake it.)
-- ---------------------------------------------------------------------------
create or replace function set_username(p_username text)
returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'must be signed in';
  end if;
  if not username_ok(p_username) then
    raise exception 'username must be 3-20 letters, numbers or underscores';
  end if;
  insert into profiles (id, username) values (uid, p_username)
    on conflict (id) do update set username = excluded.username;
  delete from public.runtour_name_flags where user_id = uid;   -- rename satisfied
exception when unique_violation then
  raise exception 'username taken';
end;
$$;
revoke all on function set_username(text) from public;
grant  execute on function set_username(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Action the reported account. No-op if it has already been handled.
-- ---------------------------------------------------------------------------
select public.runtour_force_rename(
  'georgefloyd69',
  'Your username broke our community rules and was removed. Please choose a new one to keep playing.'
);
