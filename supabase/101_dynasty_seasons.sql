-- ---------------------------------------------------------------------------
-- 101_dynasty_seasons.sql : Dynasty is metered in SEASONS, not in runs.
--
-- Safe to run more than once. Run 99_daily_attempts.sql and
-- 100_daily_grace_reasons.sql first.
--
-- ---------------------------------------------------------------------------
-- WHAT CHANGED, AND WHY THE OLD RULE HAD TO GO
-- ---------------------------------------------------------------------------
-- 99 metered a START. One dynasty a day, and once one was under way it was free
-- for ever: a free player could begin a run on Monday and still be playing that
-- same run at season 60 without the game ever asking again. The free tier was
-- the entire mode with a wait in front of it, and the only thing the bundle
-- actually sold was the right to re-draft.
--
-- The rule now is a budget of SEASONS. Three a day, spent one per kickoff, on
-- whichever run the player is in. The run itself never expires. Spend the third
-- and the dynasty is saved exactly where it stands; the fourth season is waiting
-- after the reset. What the bundle sells is the budget going away.
--
-- THE TRADE MACHINE IS UNCHANGED. It has no seasons to count: one run is one
-- season, so a start and a season are the same event there and one a day still
-- means what it always said. The `unit` column below is what tells the page
-- which of the two rules it is reading.
--
-- ---------------------------------------------------------------------------
-- A FIRING ENDS THE DAY
-- ---------------------------------------------------------------------------
-- Otherwise the budget buys the one thing the meter exists to discourage. Fired
-- in season one with two seasons left, the cheapest move is to re-draft and spend
-- them on fresh season ones, over and over, which is also the worst way anybody
-- could meet this mode. So the day ends where the run does, and `ended` is the
-- flag that says so.
--
-- THE SEASON ONE MERCY GOES WITH IT. In 99 and 100 a run that died in its first
-- season handed back the day, because losing your single daily run a quarter of
-- an hour after arriving was the worst first impression the mode could make.
-- Under a three season budget that mercy would be the reroll button: die early,
-- take the refund, draft again. The firing is the end of the day now whenever
-- it lands. 'fired' stays a legal reason below and does nothing, so a page
-- still holding the old script asks for something it cannot have and gets a
-- plain answer rather than an error.
--
-- ---------------------------------------------------------------------------
-- WHAT A BOSS BATTLE IS STILL WORTH
-- ---------------------------------------------------------------------------
-- One more season that day, and it is the only bonus left. Reaching a boss at
-- all takes six seasons, which is two full days of the budget, so it is never a
-- consolation: it is the reward for the hardest thing the mode asks, and it pays
-- in exactly the currency the mode is now counting.
--
-- ---------------------------------------------------------------------------
-- THESE FUNCTIONS ARE DROPPED AND REBUILT, NOT REPLACED
-- ---------------------------------------------------------------------------
-- All three return a table, and Postgres refuses to change the shape of one
-- under `create or replace`. Two columns are being added, so each is dropped
-- first. That is a real gap, a fraction of a second where PostgREST answers 404
-- and the page has no opinion about the day, and the page fails OPEN on exactly
-- that: no answer means play. Adding columns rather than changing them is also
-- what keeps a page loaded a moment ago working, because an extra key in the
-- JSON is a key nobody reads.
-- ---------------------------------------------------------------------------

-- ---------- 1) the day can end before the budget does -----------------------
alter table public.ps_daily_attempts
  add column if not exists ended boolean not null default false;

-- grace_fired is left in place and is no longer read by anything. Dropping it
-- would mean 100 re-adds it on any re-run of these files in order, and a column
-- nobody reads costs a byte a row.

-- ---------- 2) the two numbers, named once ---------------------------------
-- The budget is here rather than in the page because the page is the thing that
-- must not be able to set it. Changing the free allowance is changing this line.
create or replace function public.ps_day_allowance(p_mode text, p_boss boolean)
returns int
language sql
immutable
as $$
  select case when p_mode = 'dynasty'
              then 3 + (case when p_boss then 1 else 0 end)
              else 1 end
$$;

-- What one unit of the allowance buys, so the page can word the screen without
-- holding a second copy of the rule.
create or replace function public.ps_day_unit(p_mode text)
returns text
language sql
immutable
as $$ select case when p_mode = 'dynasty' then 'season' else 'run' end $$;

-- ---------- 3) how the day stands, without spending any of it ---------------
drop function if exists public.ps_attempts_state(text);
create function public.ps_attempts_state(p_mode text)
returns table (used int, allowance int, resets_at timestamptz, unit text, ended boolean)
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
    /* A guest has no ledger and cannot start either mode anyway, both being behind
       the account wall. Answering "nothing used, a full day available" keeps the
       front page drawable rather than making it depend on being signed in. */
    return query select 0, public.ps_day_allowance(p_mode, false),
      public.ps_eastern_reset(), public.ps_day_unit(p_mode), false;
    return;
  end if;
  select * into v_row from public.ps_daily_attempts
   where user_id = v_user and mode = p_mode and day = public.ps_eastern_day();
  if not found then
    return query select 0, public.ps_day_allowance(p_mode, false),
      public.ps_eastern_reset(), public.ps_day_unit(p_mode), false;
  else
    return query select v_row.used,
      public.ps_day_allowance(p_mode, v_row.grace_boss),
      public.ps_eastern_reset(), public.ps_day_unit(p_mode), v_row.ended;
  end if;
end $$;

-- ---------- 4) spending one -------------------------------------------------
-- Called at KICKOFF, once per season, and the page marks the run with the season
-- it paid for so a reload in the middle of one cannot be charged twice.
--
-- Returns whether it was allowed along with the numbers, so one round trip both
-- decides and tells the page what to draw.
drop function if exists public.ps_attempt_spend(text);
create function public.ps_attempt_spend(p_mode text)
returns table (ok boolean, used int, allowance int, resets_at timestamptz, unit text, ended boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_day  date := public.ps_eastern_day();
  v_used int;
  v_allow int;
  v_ended boolean;
begin
  if p_mode is null or p_mode not in ('dynasty', 'trade') then
    raise exception 'unknown mode';
  end if;
  if v_user is null then
    raise exception 'sign in to play';
  end if;

  /* The row is created on the first spend of the day and locked for the rest of
     this statement, so two taps in the same second cannot both read two and
     both be allowed. */
  insert into public.ps_daily_attempts (user_id, mode, day, used)
  values (v_user, p_mode, v_day, 0)
  on conflict (user_id, mode, day) do nothing;

  select a.used, public.ps_day_allowance(p_mode, a.grace_boss), a.ended
    into v_used, v_allow, v_ended
    from public.ps_daily_attempts a
   where a.user_id = v_user and a.mode = p_mode and a.day = v_day
     for update;

  if v_ended or v_used >= v_allow then
    return query select false, v_used, v_allow, public.ps_eastern_reset(),
      public.ps_day_unit(p_mode), v_ended;
    return;
  end if;

  update public.ps_daily_attempts a
     set used = a.used + 1, last_at = now()
   where a.user_id = v_user and a.mode = p_mode and a.day = v_day
   returning a.used into v_used;

  return query select true, v_used, v_allow, public.ps_eastern_reset(),
    public.ps_day_unit(p_mode), v_ended;
end $$;

-- ---------- 5) earning one --------------------------------------------------
-- 'boss' is a boss battle won and is worth one more season today, once.
-- 'fired' is accepted and does nothing, for the reason written at the top.
--
-- THE SERVER STILL DOES NOT CHECK THE CLAIM, for the reason 99 gives: the worst
-- a lying client achieves is the season the game was already willing to hand
-- out, because a flag that is already true stays true.
drop function if exists public.ps_attempt_grace(text, text);
create function public.ps_attempt_grace(p_mode text, p_reason text)
returns table (used int, allowance int, resets_at timestamptz, unit text, ended boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_day  date := public.ps_eastern_day();
  v_used int;
  v_allow int;
  v_ended boolean;
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

  insert into public.ps_daily_attempts (user_id, mode, day, used, grace_boss)
  values (v_user, p_mode, v_day, 0, p_reason = 'boss')
  on conflict (user_id, mode, day)
    do update set grace_boss = public.ps_daily_attempts.grace_boss or p_reason = 'boss',
                  last_at = now();

  select a.used, public.ps_day_allowance(p_mode, a.grace_boss), a.ended
    into v_used, v_allow, v_ended
    from public.ps_daily_attempts a
   where a.user_id = v_user and a.mode = p_mode and a.day = v_day;

  return query select v_used, v_allow, public.ps_eastern_reset(),
    public.ps_day_unit(p_mode), v_ended;
end $$;

-- ---------- 6) ending the day ----------------------------------------------
-- The run is over, so the day is. Idempotent, because the results screen it is
-- called from can be reopened from a save.
--
-- A LYING CLIENT CAN ONLY HURT ITSELF HERE, which is why this needs no proof
-- either: the sole thing it can do is end a day that belongs to it.
create or replace function public.ps_attempt_day_end(p_mode text)
returns table (used int, allowance int, resets_at timestamptz, unit text, ended boolean)
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

  insert into public.ps_daily_attempts (user_id, mode, day, used, ended)
  values (v_user, p_mode, v_day, 0, true)
  on conflict (user_id, mode, day)
    do update set ended = true, last_at = now();

  select a.used, public.ps_day_allowance(p_mode, a.grace_boss)
    into v_used, v_allow
    from public.ps_daily_attempts a
   where a.user_id = v_user and a.mode = p_mode and a.day = v_day;

  return query select v_used, v_allow, public.ps_eastern_reset(),
    public.ps_day_unit(p_mode), true;
end $$;

-- ---------- 7) grants -------------------------------------------------------
-- Rebuilt functions lose their grants with the drop, so every one is restated.
revoke all on function public.ps_attempts_state(text) from public;
revoke all on function public.ps_attempt_spend(text) from public;
revoke all on function public.ps_attempt_grace(text, text) from public;
revoke all on function public.ps_attempt_day_end(text) from public;
grant execute on function public.ps_attempts_state(text) to anon, authenticated;
grant execute on function public.ps_attempt_spend(text) to authenticated;
grant execute on function public.ps_attempt_grace(text, text) to authenticated;
grant execute on function public.ps_attempt_day_end(text) to authenticated;
grant execute on function public.ps_day_allowance(text, boolean) to anon, authenticated;
grant execute on function public.ps_day_unit(text) to anon, authenticated;

notify pgrst, 'reload schema';
