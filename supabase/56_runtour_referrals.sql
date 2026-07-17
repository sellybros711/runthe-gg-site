-- ============================================================================
-- 56_runtour_referrals.sql — "invite a friend, you both get a free pack"
-- ============================================================================
-- Share link is …/golf?ref=<your username>. When a NEW account signs up with it,
-- the client calls runtour_redeem_referral(<username>): it records the referral
-- (once per referred user, ever) and queues a free pack for BOTH the new player
-- and the referrer. Each client claims its own queued packs via
-- runtour_claim_rewards() on sign-in (grants them into the local Pro Shop, synced).
--
-- Anti-abuse: a user can only be referred ONCE (PK); can't refer themselves; the
-- referred account must be genuinely NEW (created within ~2 days); the referrer is
-- resolved from a real username; and a referrer earns pack credit for at most
-- REFERRER_CAP referrals (still records the rest, just no extra pack). RLS on with
-- NO direct policies — the two SECURITY DEFINER functions are the only access path.
-- Idempotent; safe to re-run. Depends on profiles + auth.users.
-- ----------------------------------------------------------------------------

create table if not exists public.runtour_referrals (
  referred_user_id uuid primary key references auth.users(id) on delete cascade,
  referrer_user_id uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now()
);
alter table public.runtour_referrals enable row level security;
create index if not exists runtour_referrals_referrer_idx on public.runtour_referrals(referrer_user_id);

create table if not exists public.runtour_pending_rewards (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  free_packs int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.runtour_pending_rewards enable row level security;

-- ---- redeem a referral code (the referrer's username). Queues a pack for both sides. ----
create or replace function public.runtour_redeem_referral(p_ref_code text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_ref     uuid;
  v_created timestamptz;
  v_cnt     int;
begin
  if v_uid is null then return 'noauth'; end if;
  if p_ref_code is null or length(btrim(p_ref_code)) = 0 then return 'nocode'; end if;
  select id into v_ref from public.profiles where lower(username) = lower(btrim(p_ref_code)) limit 1;
  if v_ref is null then return 'badref'; end if;
  if v_ref = v_uid then return 'self'; end if;
  -- the referred account must be genuinely NEW (blocks old accounts from farming referrals)
  select created_at into v_created from auth.users where id = v_uid;
  if v_created is null or v_created < now() - interval '2 days' then return 'notnew'; end if;
  -- record the referral (PK / conflict → only ever counts once per referred user)
  insert into public.runtour_referrals(referred_user_id, referrer_user_id) values (v_uid, v_ref)
    on conflict (referred_user_id) do nothing;
  if not found then return 'already'; end if;
  -- queue a pack for the NEW user
  insert into public.runtour_pending_rewards(user_id, free_packs, updated_at) values (v_uid, 1, now())
    on conflict (user_id) do update set free_packs = public.runtour_pending_rewards.free_packs + 1, updated_at = now();
  -- queue a pack for the REFERRER, up to a soft cap
  select count(*) into v_cnt from public.runtour_referrals where referrer_user_id = v_ref;
  if v_cnt <= 50 then
    insert into public.runtour_pending_rewards(user_id, free_packs, updated_at) values (v_ref, 1, now())
      on conflict (user_id) do update set free_packs = public.runtour_pending_rewards.free_packs + 1, updated_at = now();
  end if;
  return 'ok';
end; $$;
grant execute on function public.runtour_redeem_referral(text) to authenticated;

-- ---- claim the caller's queued free packs (returns the count, then resets to 0) ----
create or replace function public.runtour_claim_rewards()
returns int language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_n int := 0;
begin
  if v_uid is null then return 0; end if;
  select free_packs into v_n from public.runtour_pending_rewards where user_id = v_uid for update;
  if v_n is null then return 0; end if;
  if v_n > 0 then update public.runtour_pending_rewards set free_packs = 0, updated_at = now() where user_id = v_uid; end if;
  return v_n;
end; $$;
grant execute on function public.runtour_claim_rewards() to authenticated;
