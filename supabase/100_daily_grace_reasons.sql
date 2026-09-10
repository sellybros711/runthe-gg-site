-- ---------------------------------------------------------------------------
-- 100_daily_grace_reasons.sql : two ways to earn a second run in a day, and a
-- ledger that can hold both.
--
-- Safe to run more than once. Run 99_daily_attempts.sql first.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS WRONG WITH 99
-- ---------------------------------------------------------------------------
-- 99 counted extra attempts in a single `granted` column capped at one, because
-- when it was written there was exactly one way to earn one: a run that died in
-- its first season. There are two now. The second is beating a boss.
--
-- A player can earn both on the same day, and it is not a stretch: get fired in
-- season one, take the extra run, and ride that one to season ten and win the
-- boss game. Under 99 the second reward did NOTHING. greatest(granted, 1) is
-- already 1, the check constraint forbids 2, and the call returned success. No
-- error anywhere, a reward the game promised and did not pay.
--
-- So the count becomes two flags. Each reason is earned at most once a day, the
-- allowance is 1 + however many are set, and a client repeating a claim gets the
-- same answer as the first time rather than a second attempt.
-- ---------------------------------------------------------------------------

-- ---------- 1) the two reasons --------------------------------------------
alter table public.ps_daily_attempts
  add column if not exists grace_fired boolean not null default false;
alter table public.ps_daily_attempts
  add column if not exists grace_boss  boolean not null default false;

-- Anything 99 granted was the season-one mercy, because it was the only reason
-- that existed. Carried across so a day already in progress keeps what it earned.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'ps_daily_attempts'
                and column_name = 'granted') then
    update public.ps_daily_attempts set grace_fired = true
     where granted >= 1 and grace_fired = false;
    alter table public.ps_daily_attempts drop constraint if exists ps_daily_attempts_granted_ck;
    alter table public.ps_daily_attempts drop column granted;
  end if;
end $$;

-- ---------- 2) how the day stands ------------------------------------------
create or replace function public.ps_attempts_state(p_mode text)
returns table (used int, allowance int, resets_at timestamptz)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.ps_daily_attempts%rowtype;
begin
  if p_mode is null or p_mode not in ('dynasty', 'trade') then
    raise exception 'unknown mode';
  end if;
  if v_user is null then
    return query select 0, 1, public.ps_eastern_reset();
    return;
  end if;
  select * into v_row from public.ps_daily_attempts
   where user_id = v_user and mode = p_mode and day = public.ps_eastern_day();
  if not found then
    return query select 0, 1, public.ps_eastern_reset();
  else
    return query select v_row.used,
      1 + (case when v_row.grace_fired then 1 else 0 end)
        + (case when v_row.grace_boss  then 1 else 0 end),
      public.ps_eastern_reset();
  end if;
end $$;

-- ---------- 3) spending one ------------------------------------------------
create or replace function public.ps_attempt_spend(p_mode text)
returns table (ok boolean, used int, allowance int, resets_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_day  date := public.ps_eastern_day();
  v_used int;
  v_allow int;
begin
  if p_mode is null or p_mode not in ('dynasty', 'trade') then
    raise exception 'unknown mode';
  end if;
  if v_user is null then
    raise exception 'sign in to play';
  end if;

  insert into public.ps_daily_attempts (user_id, mode, day, used)
  values (v_user, p_mode, v_day, 0)
  on conflict (user_id, mode, day) do nothing;

  select a.used,
         1 + (case when a.grace_fired then 1 else 0 end)
           + (case when a.grace_boss  then 1 else 0 end)
    into v_used, v_allow
    from public.ps_daily_attempts a
   where a.user_id = v_user and a.mode = p_mode and a.day = v_day
     for update;

  if v_used >= v_allow then
    return query select false, v_used, v_allow, public.ps_eastern_reset();
    return;
  end if;

  update public.ps_daily_attempts a
     set used = a.used + 1, last_at = now()
   where a.user_id = v_user and a.mode = p_mode and a.day = v_day
   returning a.used into v_used;

  return query select true, v_used, v_allow, public.ps_eastern_reset();
end $$;

-- ---------- 4) earning one -------------------------------------------------
-- p_reason is 'fired' (a run that died in its first season) or 'boss' (a boss
-- game won). Each is worth one extra attempt a day and no more.
--
-- THE SERVER STILL DOES NOT CHECK THE CLAIM, for the reason 99 gives: the worst a
-- lying client achieves is the attempts the game was already willing to hand out,
-- because a flag that is already true stays true. What the reason DOES buy is
-- that the two rewards cannot be collapsed into one, which is the bug this file
-- exists to fix.
create or replace function public.ps_attempt_grace(p_mode text, p_reason text)
returns table (used int, allowance int, resets_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_day  date := public.ps_eastern_day();
  v_used int;
  v_allow int;
begin
  if p_mode is null or p_mode not in ('dynasty', 'trade') then
    raise exception 'unknown mode';
  end if;
  if p_reason is null or p_reason not in ('fired', 'boss') then
    raise exception 'unknown reason';
  end if;
  if v_user is null then
    raise exception 'sign in to play';
  end if;

  insert into public.ps_daily_attempts (user_id, mode, day, used, grace_fired, grace_boss)
  values (v_user, p_mode, v_day, 0, p_reason = 'fired', p_reason = 'boss')
  on conflict (user_id, mode, day)
    do update set grace_fired = public.ps_daily_attempts.grace_fired or p_reason = 'fired',
                  grace_boss  = public.ps_daily_attempts.grace_boss  or p_reason = 'boss',
                  last_at = now();

  select a.used,
         1 + (case when a.grace_fired then 1 else 0 end)
           + (case when a.grace_boss  then 1 else 0 end)
    into v_used, v_allow
    from public.ps_daily_attempts a
   where a.user_id = v_user and a.mode = p_mode and a.day = v_day;

  return query select v_used, v_allow, public.ps_eastern_reset();
end $$;

-- ---------- 5) grants ------------------------------------------------------
-- The one-argument grace from 99 is gone, so its grant goes with it rather than
-- being left executable on a signature nothing calls.
drop function if exists public.ps_attempt_grace(text);

revoke all on function public.ps_attempts_state(text) from public;
revoke all on function public.ps_attempt_spend(text) from public;
revoke all on function public.ps_attempt_grace(text, text) from public;
grant execute on function public.ps_attempts_state(text) to anon, authenticated;
grant execute on function public.ps_attempt_spend(text) to authenticated;
grant execute on function public.ps_attempt_grace(text, text) to authenticated;

notify pgrst, 'reload schema';
