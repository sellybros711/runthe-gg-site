-- ---------------------------------------------------------------------------
-- 83_referrals.sql : invite a friend, both of you get an extra go today.
--
-- THE PROMOTION. A player shares their link. Someone new signs up through it.
-- The moment that signup lands, BOTH accounts get one extra attempt on each of
-- today's free games (Common Ground, Sportegories, Alma Mater, Career Path),
-- the daily puzzles and streak games a free account can play.
--
-- HOW THE REWARD IS REAL. The daily cap is enforced server-side in
-- arcade_spend_game (71_arcade_free_games.sql), which hard-coded cap := 1. A
-- reward that only bumped a localStorage number would be refused by the server
-- the moment the extra play was spent. So the bonus lives in a table the spend
-- function reads: cap := 1 + today's bonus. This file supersedes the 71
-- versions of arcade_spend_game and arcade_game_status; everything else in 71
-- stands.
--
-- ANTI-ABUSE. One referral row per referred account, ever. No self-referral.
-- The referred account must be genuinely new (created in the last 24h), so an
-- established account cannot walk through a link to farm a bonus. The referrer
-- can earn from several friends, but the bonus a single day can grant one
-- account is clamped, so no one day becomes unlimited. Fake signups remain the
-- one vector every referral program shares; email confirmation is the gate on
-- that, and Supabase auth owns it.
--
-- Idempotent: safe to run more than once.
-- ---------------------------------------------------------------------------

-- ---------- 1) a short, shareable code per user -----------------------------
create table if not exists public.referral_codes (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  code       text unique not null,
  created_at timestamptz not null default now()
);
alter table public.referral_codes enable row level security;
-- a code is a public handle: anyone may resolve one to know whose it is, which
-- is what the join page needs to greet the invitee by name.
drop policy if exists "referral_codes read" on public.referral_codes;
create policy "referral_codes read" on public.referral_codes for select using (true);

-- ---------- 2) who referred whom (one referral per referred account) --------
create table if not exists public.referrals (
  id           bigserial primary key,
  referrer_id  uuid not null references auth.users(id) on delete cascade,
  referred_id  uuid not null unique references auth.users(id) on delete cascade,
  code         text not null,
  created_at   timestamptz not null default now(),
  constraint referrals_no_self check (referrer_id <> referred_id)
);
alter table public.referrals enable row level security;
drop policy if exists "referrals read own" on public.referrals;
create policy "referrals read own" on public.referrals
  for select using (auth.uid() = referrer_id or auth.uid() = referred_id);
create index if not exists referrals_referrer_idx on public.referrals(referrer_id);

-- ---------- 3) bonus attempts, one row per grant ----------------------------
-- Summed per (user, day) at spend time. A dedicated table (not a counter on the
-- user) so a future promo can grant from the same pool and the history stays
-- auditable. `source` names why; `ref_id` links a referral grant to its row.
create table if not exists public.arcade_bonus_grants (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  bonus_date date not null,
  amount     int  not null default 1 check (amount > 0),
  source     text not null default 'referral',
  ref_id     bigint references public.referrals(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.arcade_bonus_grants enable row level security;
drop policy if exists "arcade_bonus_grants read own" on public.arcade_bonus_grants;
create policy "arcade_bonus_grants read own" on public.arcade_bonus_grants
  for select using (auth.uid() = user_id);
create index if not exists arcade_bonus_grants_user_day
  on public.arcade_bonus_grants(user_id, bonus_date);

-- Most a single day's bonuses can raise one account's per-game cap. Keeps a
-- prolific referrer from turning a day unlimited while still rewarding them.
create or replace function public.arcade_bonus_cap()
returns int language sql immutable as $$ select 3 $$;

-- Today's applied bonus for a user: summed grants for the NY date, clamped.
create or replace function public.arcade_bonus_today(p_uid uuid)
returns int
language sql stable security definer set search_path = public as $$
  select least(
    coalesce((select sum(amount)::int from public.arcade_bonus_grants
              where user_id = p_uid
                and bonus_date = (now() at time zone 'America/New_York')::date), 0),
    public.arcade_bonus_cap());
$$;

-- ---------- 4) code generation + lookup -------------------------------------
-- 8 chars from an alphabet with no 0/O/1/I/L, so a code read aloud or typed
-- back is unambiguous. Collisions are astronomically unlikely at this size, but
-- the loop retries on the off chance rather than trusting luck.
create or replace function public.referral_my_code()
returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_code text;
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
  i int;
begin
  if uid is null then raise exception 'sign in first'; end if;
  select code into v_code from public.referral_codes where user_id = uid;
  if v_code is not null then return v_code; end if;

  for attempt in 1..10 loop
    candidate := '';
    for i in 1..8 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      insert into public.referral_codes (user_id, code) values (uid, candidate)
      returning code into v_code;
      return v_code;
    exception when unique_violation then
      -- either this user raced themselves or the code collided; loop retries,
      -- and a second read catches the case where our own row now exists.
      select code into v_code from public.referral_codes where user_id = uid;
      if v_code is not null then return v_code; end if;
    end;
  end loop;
  raise exception 'could not allocate a referral code';
end $$;

-- Whose code is this? Public: the join page greets the invitee by username.
create or replace function public.referral_lookup(p_code text)
returns json
language sql stable security definer set search_path = public as $$
  select case when rc.user_id is null then json_build_object('found', false)
              else json_build_object('found', true,
                     'username', coalesce(p.username, 'a friend')) end
  from (select 1) one
  left join public.referral_codes rc on rc.code = upper(trim(coalesce(p_code, '')))
  left join public.profiles p on p.id = rc.user_id;
$$;

-- ---------- 5) claim a referral (called by the invitee after signup) --------
-- Grants the bonus to both accounts for today. All the guards live here.
create or replace function public.referral_claim(p_code text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  uid       uuid := auth.uid();
  d         date := (now() at time zone 'America/New_York')::date;
  v_code    text := upper(trim(coalesce(p_code, '')));
  v_ref     uuid;
  v_created timestamptz;
  v_id      bigint;
  v_name    text;
begin
  if uid is null then
    return json_build_object('ok', false, 'reason', 'not_signed_in');
  end if;
  if v_code = '' then
    return json_build_object('ok', false, 'reason', 'no_code');
  end if;

  select user_id into v_ref from public.referral_codes where code = v_code;
  if v_ref is null then
    return json_build_object('ok', false, 'reason', 'bad_code');
  end if;
  if v_ref = uid then
    return json_build_object('ok', false, 'reason', 'self');
  end if;

  -- Already referred once? Then this is settled; report it without regranting.
  if exists (select 1 from public.referrals where referred_id = uid) then
    return json_build_object('ok', false, 'reason', 'already_referred');
  end if;

  -- The reward is for NEW players arriving through a link, not established
  -- accounts walking through one to farm bonuses.
  select created_at into v_created from auth.users where id = uid;
  if v_created is null or v_created < now() - interval '24 hours' then
    return json_build_object('ok', false, 'reason', 'account_not_new');
  end if;

  insert into public.referrals (referrer_id, referred_id, code)
    values (v_ref, uid, v_code)
    returning id into v_id;

  -- both sides, today
  insert into public.arcade_bonus_grants (user_id, bonus_date, amount, source, ref_id)
    values (uid,   d, 1, 'referral_joined',  v_id),
           (v_ref, d, 1, 'referral_invited', v_id);

  select username into v_name from public.profiles where id = v_ref;
  return json_build_object('ok', true,
                           'referrer', coalesce(v_name, 'a friend'),
                           'bonus', 1);
exception when unique_violation then
  -- the referred_id unique key fired between the check and the insert (a double
  -- claim racing itself). The referral exists; treat it as settled, not an error.
  return json_build_object('ok', false, 'reason', 'already_referred');
end $$;

-- How many friends has the caller brought in, and how many bonuses pending
-- today? Powers the share card's little tally.
create or replace function public.referral_stats()
returns json
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return json_build_object('signed_in', false); end if;
  return json_build_object(
    'signed_in', true,
    'invited', (select count(*)::int from public.referrals where referrer_id = uid),
    'bonus_today', public.arcade_bonus_today(uid));
end $$;

-- ---------- 6) spend + status, now bonus-aware ------------------------------
-- Supersedes the 71 versions. The only change is cap := 1 + today's bonus.
create or replace function public.arcade_spend_game(p_game text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  d   date := (now() at time zone 'America/New_York')::date;
  cap int;
  g   text := lower(coalesce(p_game, ''));
  v_plays int;
begin
  if uid is null then
    return json_build_object('ok', false, 'reason', 'not_signed_in');
  end if;
  if public.arcade_card_active(uid) then
    return json_build_object('ok', true, 'unlimited', true);
  end if;
  if not public.arcade_free_game(g) then
    return json_build_object('ok', false, 'reason', 'card_only', 'game', g);
  end if;

  cap := 1 + public.arcade_bonus_today(uid);

  insert into public.arcade_game_plays (user_id, play_date, game, plays)
    values (uid, d, g, 1)
    on conflict (user_id, play_date, game)
      do update set plays = public.arcade_game_plays.plays + 1
      where public.arcade_game_plays.plays < cap
    returning plays into v_plays;

  if v_plays is null then                    -- this game is used up for today
    select plays into v_plays from public.arcade_game_plays
      where user_id = uid and play_date = d and game = g;
    return json_build_object('ok', false, 'reason', 'spent', 'game', g,
                             'unlimited', false, 'used', coalesce(v_plays, cap), 'remaining', 0);
  end if;

  return json_build_object('ok', true, 'unlimited', false, 'game', g,
                           'used', v_plays, 'remaining', cap - v_plays, 'cap', cap);
end $$;

create or replace function public.arcade_game_status()
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  d   date := (now() at time zone 'America/New_York')::date;
  v_plays json;
  v_bonus int;
begin
  if uid is null then
    return json_build_object('signed_in', false);
  end if;
  if public.arcade_card_active(uid) then
    return json_build_object('signed_in', true, 'unlimited', true);
  end if;
  select coalesce(json_object_agg(game, plays), '{}'::json) into v_plays
    from public.arcade_game_plays where user_id = uid and play_date = d;
  v_bonus := public.arcade_bonus_today(uid);
  return json_build_object('signed_in', true, 'unlimited', false,
                           'cap', 1 + v_bonus, 'bonus', v_bonus, 'plays', v_plays,
                           'free', json_build_array('match','sportegories','almamater','career'));
end $$;

-- ---------- 7) grants -------------------------------------------------------
revoke all on function public.referral_my_code()        from public, anon;
revoke all on function public.referral_claim(text)      from public, anon;
revoke all on function public.referral_stats()          from public, anon;
grant execute on function public.referral_my_code()      to authenticated;
grant execute on function public.referral_claim(text)    to authenticated;
grant execute on function public.referral_stats()        to authenticated;
grant execute on function public.referral_lookup(text)   to authenticated, anon;
grant execute on function public.arcade_bonus_today(uuid) to authenticated;
grant execute on function public.arcade_bonus_cap()       to authenticated, anon;
grant execute on function public.arcade_spend_game(text)  to authenticated;
grant execute on function public.arcade_game_status()     to authenticated;

notify pgrst, 'reload schema';

-- ---------- 8) sanity check -------------------------------------------------
-- No referral may point at itself, and no account may be referred twice. Both
-- are enforced by constraints above; this should always return zero rows.
select 'self-referral' as problem, count(*) from public.referrals where referrer_id = referred_id
union all
select 'double-referred', count(*) - count(distinct referred_id) from public.referrals;
