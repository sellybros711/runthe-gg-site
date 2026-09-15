-- ---------------------------------------------------------------------------
-- 105_fullteam_daily.sql : Full Team is one run a day, free, and the bundle
--                          removes the limit.
--
-- Safe to run more than once. Run it AFTER 102_dynasty_rolling_day.sql, whose
-- four functions it replaces and whose ps_dynasty_day table it reads. On a
-- database that has never had 102 it stops at the first function with
--
--     ERROR: relation "public.ps_dynasty_day" does not exist
--
-- which is the honest failure: run 102 first.
--
-- ON A DATABASE THAT ALREADY HAS 102, THIS FILE IS ENOUGH ON ITS OWN, including
-- for the ambiguity bug described below: it restates ps_attempt_spend, so the
-- corrected increment arrives with it and 102 does not need running again.
-- Verified by deploying the unpatched 102 and then this file alone.
--
-- ---------------------------------------------------------------------------
-- WHY A METER AND NOT A DOOR
-- ---------------------------------------------------------------------------
-- Full Team could have been sold outright: it is the most distinctive mode on
-- the page and the obvious thing to put behind the bundle at launch. It is not,
-- for a reason this repo has already written down twice and learned the hard way
-- once. Commissioner Mode used to stop a non-owner dead, which meant the only
-- way to find out whether the mode was worth $19.99 was to pay $19.99, and "a
-- store you can only reach by being refused is a wall".
--
-- It is also the badge cabinet. CATALOG.length is the denominator crest.js
-- divides by and it is deliberately ONE NUMBER FOR EVERYBODY, so that two
-- identical cabinets cannot rank differently. Full Team's shelf is 24 badges and
-- the catalog goes 457 -> 481 the day the mode launches. Behind a hard gate that
-- caps every free account's GOAT at 95.0% permanently, by badges no amount of
-- play can reach. Every other limit on this site is a WAIT. That one would be a
-- ceiling, and a ceiling nobody can see the reason for.
--
-- So: one run a day, and ps_premium removes the counting. Which is what the
-- store card has always promised, in the one word it leads with.
--
-- ---------------------------------------------------------------------------
-- WHY IT IS THE TRADE MACHINE'S RULE AND NOT DYNASTY'S
-- ---------------------------------------------------------------------------
-- The two allowances differ on purpose and must not be unified: a dynasty season
-- is a draft and a schedule and three of them is one sitting, while a dynasty
-- itself has no length. A FULL TEAM RUN IS ONE SEASON, exactly as a Trade
-- Machine run is, so there is no finished-the-day moment separate from the run
-- for a personal rolling clock to hang on. It takes the Eastern calendar day and
-- the count of 1 that ps_day_allowance already answers for anything that is not
-- a dynasty.
--
-- ---------------------------------------------------------------------------
-- WHAT ACTUALLY CHANGES BELOW
-- ---------------------------------------------------------------------------
-- Less than it looks. ps_day_allowance and ps_day_unit already answer 1 and
-- 'run' for every mode that is not 'dynasty', so neither is touched. What stood
-- in the way was two things:
--
--   1. the table's CHECK constraint, which named the two modes that existed
--   2. the `p_mode not in ('dynasty','trade')` guard at the top of four
--      functions, and the literal 'trade' hardcoded through the branch under it
--
-- So the non-dynasty branch is generalised to p_mode. It was already the
-- "anything that is not a dynasty" branch in shape; it just said 'trade' eight
-- times where it meant "the mode that was asked for". That is the only reason
-- these four bodies are restated here rather than a one-line alter.
--
-- ---------------------------------------------------------------------------
-- AND IT CARRIES A FIX 102 NEEDED ANYWAY
-- ---------------------------------------------------------------------------
-- ps_attempt_spend's dynasty branch incremented with an unqualified
--
--     update public.ps_dynasty_day set used = used + 1
--
-- and this function RETURNS TABLE (ok, used, allowance, ...), which makes `used`
-- an OUT parameter. Postgres refuses the statement as ambiguous, so the call
-- THREW on every dynasty kickoff that reached it. Nothing said so: dailySpend()
-- in the page catches and fails open by design, so the season went ahead and was
-- never counted, and a three-a-day budget silently never decremented. The trade
-- branch below it has always had the alias, which is why only one mode was hit.
-- 102 is corrected in place as well; this file would carry the fix regardless,
-- since it restates the function.
-- ---------------------------------------------------------------------------

-- ---------- 1) the ledger admits a third mode -------------------------------
-- Dropped and re-added rather than altered, because a CHECK cannot be widened in
-- place. Nothing is rewritten: every existing row names a mode still in the
-- list, so the validation pass finds nothing to complain about.
alter table public.ps_daily_attempts
  drop constraint if exists ps_daily_attempts_mode_ck;
alter table public.ps_daily_attempts
  add constraint ps_daily_attempts_mode_ck
  check (mode in ('dynasty', 'trade', 'full'));

-- ---------- 2) how the day stands, without spending any of it ---------------
-- Never writes, so drawing the front page can never cost somebody a run.
create or replace function public.ps_attempts_state(p_mode text)
returns table (used int, allowance int, resets_at timestamptz, unit text, ended boolean)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_user  uuid := auth.uid();
  v_row   public.ps_daily_attempts%rowtype;
  v_dyn   public.ps_dynasty_day%rowtype;
  v_allow int;
begin
  if p_mode is null or p_mode not in ('dynasty', 'trade', 'full') then
    raise exception 'unknown mode';
  end if;

  if p_mode = 'dynasty' then
    /* A guest has no window and cannot start the mode anyway, it being behind
       the account wall. Answering "a full budget, no clock" keeps the front page
       drawable rather than making it depend on being signed in. */
    if v_user is null then
      return query select 0, public.ps_day_allowance('dynasty', false),
        null::timestamptz, 'season'::text, false;
      return;
    end if;
    select * into v_dyn from public.ps_dynasty_day where user_id = v_user;
    /* No window yet, or one whose wait has run out. Both are a fresh budget. */
    if not found or (v_dyn.locked_until is not null and v_dyn.locked_until <= now()) then
      return query select 0, public.ps_day_allowance('dynasty', false),
        null::timestamptz, 'season'::text, false;
      return;
    end if;
    v_allow := public.ps_day_allowance('dynasty', v_dyn.grace_boss);
    if v_dyn.locked_until is not null then
      return query select v_allow, v_allow, v_dyn.locked_until, 'season'::text, v_dyn.ended_fired;
    else
      return query select v_dyn.used, v_allow, null::timestamptz, 'season'::text, false;
    end if;
    return;
  end if;

  -- The calendar-day modes: the Trade Machine, and now Full Team. One row per
  -- player per mode per day, exactly as 99 left it, with p_mode where the mode
  -- used to be spelled out.
  if v_user is null then
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
    return query select v_row.used, public.ps_day_allowance(p_mode, v_row.grace_boss),
      public.ps_eastern_reset(), public.ps_day_unit(p_mode), v_row.ended;
  end if;
end $$;

-- ---------- 3) spending one -------------------------------------------------
-- Called at KICKOFF, not when the draft wheel opens, so a draft somebody backs
-- out of costs nothing. For Full Team that gap is twelve picks wide, which is
-- the longest browse on the site, and charging for it would be charging for
-- looking.
create or replace function public.ps_attempt_spend(p_mode text)
returns table (ok boolean, used int, allowance int, resets_at timestamptz, unit text, ended boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_day   date := public.ps_eastern_day();
  v_dyn   public.ps_dynasty_day%rowtype;
  v_used  int;
  v_allow int;
  v_ended boolean;
begin
  if p_mode is null or p_mode not in ('dynasty', 'trade', 'full') then
    raise exception 'unknown mode';
  end if;
  if v_user is null then
    raise exception 'sign in to play';
  end if;

  if p_mode = 'dynasty' then
    /* The row is created on the first season ever played and locked for the rest
       of this statement, so two taps in the same second cannot both read two and
       both be allowed. */
    insert into public.ps_dynasty_day (user_id) values (v_user)
    on conflict (user_id) do nothing;
    select * into v_dyn from public.ps_dynasty_day where user_id = v_user for update;

    if v_dyn.locked_until is not null and v_dyn.locked_until > now() then
      v_allow := public.ps_day_allowance('dynasty', v_dyn.grace_boss);
      return query select false, v_allow, v_allow, v_dyn.locked_until,
        'season'::text, v_dyn.ended_fired;
      return;
    end if;

    /* The wait is over, so this kickoff opens a fresh window. The boss bonus goes
       with the old one: it buys a fourth season in the day it was won and is not
       a credit to carry. */
    if v_dyn.locked_until is not null then
      update public.ps_dynasty_day
         set used = 0, grace_boss = false, ended_fired = false, locked_until = null,
             started_at = now(), last_at = now()
       where user_id = v_user
       returning * into v_dyn;
    end if;

    v_allow := public.ps_day_allowance('dynasty', v_dyn.grace_boss);
    /* The budget is gone and nothing has closed the window yet, which is the
       few seconds between a third season's last snap and the page saying so.
       Refused, with no reset time: a null there is what tells the page it still
       has a day to end. */
    if v_dyn.used >= v_allow then
      return query select false, v_dyn.used, v_allow, null::timestamptz, 'season'::text, false;
      return;
    end if;

    /* ALIASED. See the note at the top of this file: unqualified, `used` is
       ambiguous with this function's own OUT parameter and the whole statement
       is refused, which threw on every dynasty kickoff and was swallowed by a
       client that fails open. */
    update public.ps_dynasty_day d set used = d.used + 1, last_at = now()
     where d.user_id = v_user
     returning d.* into v_dyn;
    return query select true, v_dyn.used, v_allow, null::timestamptz, 'season'::text, false;
    return;
  end if;

  -- The calendar-day modes.
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

-- ---------- 4) earning one --------------------------------------------------
-- Full Team earns neither reason and never calls this. Answered anyway, the way
-- the Trade Machine's branch always has been, so a client that asks gets a state
-- back rather than an exception.
create or replace function public.ps_attempt_grace(p_mode text, p_reason text)
returns table (used int, allowance int, resets_at timestamptz, unit text, ended boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_day   date := public.ps_eastern_day();
  v_dyn   public.ps_dynasty_day%rowtype;
  v_used  int;
  v_allow int;
  v_ended boolean;
begin
  if p_mode is null or p_mode not in ('dynasty', 'trade', 'full') then
    raise exception 'unknown mode';
  end if;
  if p_reason is null or p_reason not in ('fired', 'boss') then
    raise exception 'unknown reason';
  end if;
  if v_user is null then
    raise exception 'sign in to play';
  end if;

  if p_mode = 'dynasty' then
    insert into public.ps_dynasty_day (user_id) values (v_user)
    on conflict (user_id) do nothing;
    select * into v_dyn from public.ps_dynasty_day where user_id = v_user for update;

    if v_dyn.locked_until is not null and v_dyn.locked_until <= now() then
      update public.ps_dynasty_day
         set used = 0, grace_boss = false, ended_fired = false, locked_until = null,
             started_at = now(), last_at = now()
       where user_id = v_user
       returning * into v_dyn;
    end if;

    if p_reason = 'boss' and v_dyn.locked_until is null and not v_dyn.grace_boss then
      update public.ps_dynasty_day set grace_boss = true, last_at = now()
       where user_id = v_user
       returning * into v_dyn;
    end if;

    v_allow := public.ps_day_allowance('dynasty', v_dyn.grace_boss);
    if v_dyn.locked_until is not null then
      return query select v_allow, v_allow, v_dyn.locked_until, 'season'::text, v_dyn.ended_fired;
    else
      return query select v_dyn.used, v_allow, null::timestamptz, 'season'::text, false;
    end if;
    return;
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

-- ---------- 5) ending the day -----------------------------------------------
-- Only the dynasty has a clock for this to start. A calendar-day mode's day ends
-- at Eastern midnight whatever happens to the run, so this marks the ledger and
-- changes no clock.
create or replace function public.ps_attempt_day_end(p_mode text, p_fired boolean default false)
returns table (used int, allowance int, resets_at timestamptz, unit text, ended boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_day   date := public.ps_eastern_day();
  v_dyn   public.ps_dynasty_day%rowtype;
  v_used  int;
  v_allow int;
begin
  if p_mode is null or p_mode not in ('dynasty', 'trade', 'full') then
    raise exception 'unknown mode';
  end if;
  if v_user is null then
    raise exception 'sign in to play';
  end if;

  if p_mode = 'dynasty' then
    insert into public.ps_dynasty_day (user_id) values (v_user)
    on conflict (user_id) do nothing;
    select * into v_dyn from public.ps_dynasty_day where user_id = v_user for update;

    /* NEVER EXTENDS A WAIT THAT IS ALREADY RUNNING. The results screen this is
       called from can be reopened from a save, and a second call that pushed the
       clock out another day would turn revisiting your own run into a
       punishment. */
    if v_dyn.locked_until is null or v_dyn.locked_until <= now() then
      update public.ps_dynasty_day
         set locked_until = now() + public.ps_dynasty_wait(),
             ended_fired  = coalesce(p_fired, false),
             last_at      = now()
       where user_id = v_user
       returning * into v_dyn;
    end if;

    v_allow := public.ps_day_allowance('dynasty', v_dyn.grace_boss);
    return query select v_allow, v_allow, v_dyn.locked_until, 'season'::text, v_dyn.ended_fired;
    return;
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

-- ---------- 6) grants -------------------------------------------------------
-- Unchanged from 102 and restated because create or replace does not reset them
-- but a dropped and recreated function would. Guests can read state and can call
-- nothing that writes.
revoke all on function public.ps_attempts_state(text) from public;
revoke all on function public.ps_attempt_spend(text) from public;
revoke all on function public.ps_attempt_grace(text, text) from public;
revoke all on function public.ps_attempt_day_end(text, boolean) from public;
grant execute on function public.ps_attempts_state(text) to anon, authenticated;
grant execute on function public.ps_attempt_spend(text) to authenticated;
grant execute on function public.ps_attempt_grace(text, text) to authenticated;
grant execute on function public.ps_attempt_day_end(text, boolean) to authenticated;

notify pgrst, 'reload schema';
