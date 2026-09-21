-- ---------------------------------------------------------------------------
-- 102_dynasty_rolling_day.sql : the dynasty day is 24 hours from the moment it
-- ends, per account, rather than a calendar day everybody shares.
--
-- Safe to run more than once. Run 99, 100 and 101 first.
--
-- ---------------------------------------------------------------------------
-- WHAT A CALENDAR RESET DOES TO A PLAYER WHO ARRIVES LATE
-- ---------------------------------------------------------------------------
-- 99 reset everybody at midnight Eastern, which is the right rule for a
-- leaderboard and the wrong one for an allowance. Somebody who sits down at
-- 11pm plays three seasons and gets three more an hour later. Somebody who sits
-- down at 9am waits fifteen hours for the same three. Same budget, wildly
-- different game, decided by nothing the player did.
--
-- So the clock is theirs now. It starts when their day ENDS, which is one of
-- exactly two moments:
--
--   they finish the third season and were not fired
--   they are fired, whenever that lands
--
-- and it runs for 24 hours from there. A run that stops in the middle is not a
-- day that ended: the seasons left are still there next time, whenever that is,
-- and no clock is running. What the wait follows is spending the budget, not
-- opening the game.
--
-- ---------------------------------------------------------------------------
-- THE TRADE MACHINE KEEPS THE CALENDAR DAY, AND THAT IS NOT AN OVERSIGHT
-- ---------------------------------------------------------------------------
-- One run there IS one sitting, so there is no "finished the day" moment
-- separate from the run itself, and nothing for a personal clock to hang on.
-- Its ledger is untouched: `ps_daily_attempts` still holds it, still keyed on
-- the Eastern day, and `unit` still answers 'run' for it. The page words every
-- countdown off that, so the two clocks never have to be told apart by hand.
--
-- ---------------------------------------------------------------------------
-- WHY DYNASTY GETS ITS OWN TABLE
-- ---------------------------------------------------------------------------
-- `ps_daily_attempts` is keyed on (user, mode, DAY). A rolling window has no
-- day to be keyed on, and one that happened to cross midnight would silently
-- become two rows and hand out a second budget. The shape of the key is the
-- rule, so a different rule needs a different table rather than a column bolted
-- to this one. The dynasty rows already in `ps_daily_attempts` stop being read
-- here; they are left alone rather than deleted, because nothing is cheaper
-- than not writing a migration that touches live rows for no reason.
-- ---------------------------------------------------------------------------

-- ---------- 1) the window ---------------------------------------------------
-- One row per player. No day, no mode: this table is Dynasty's and Dynasty has
-- one window at a time.
--
-- `locked_until` is the whole state machine, in one nullable column:
--
--   null                  the window is open. Seasons may be spent.
--   in the future         the day has ended and the wait is running.
--   in the past           the wait is over. Everything else in the row is stale
--                         and is rolled forward by the next write.
--
-- Rolling forward LAZILY rather than on a schedule is what lets the read below
-- stay `stable`: drawing the front page must never be able to change anybody's
-- allowance, so the reader computes the fresh view and only a spend writes it.
create table if not exists public.ps_dynasty_day (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  used         int     not null default 0,
  grace_boss   boolean not null default false,
  -- WHICH OF THE TWO ENDINGS this window had, because they are different
  -- sentences on screen: one says the dynasty is waiting where it stands, the
  -- other says the run is over.
  ended_fired  boolean not null default false,
  locked_until timestamptz,
  started_at   timestamptz not null default now(),
  last_at      timestamptz not null default now(),
  constraint ps_dynasty_day_used_ck check (used >= 0 and used <= 100)
);

alter table public.ps_dynasty_day enable row level security;

-- A player may read their own window and nothing else. Writes go through the
-- functions below, which are the only things that may spend or lock.
drop policy if exists "own dynasty day" on public.ps_dynasty_day;
create policy "own dynasty day" on public.ps_dynasty_day
  for select using (auth.uid() = user_id);

grant select on public.ps_dynasty_day to authenticated;

-- ---------- 2) how long the wait is, named once -----------------------------
create or replace function public.ps_dynasty_wait()
returns interval
language sql
immutable
as $$ select interval '24 hours' $$;

-- ---------- 3) how the day stands, without spending any of it ---------------
-- Never writes, so drawing the front page can never cost somebody a season.
--
-- A LOCKED WINDOW REPORTS `used` AT THE ALLOWANCE whatever it really was. A run
-- that died in season one leaves two seasons unspent, and reporting that
-- honestly would have the page work out "two left" and draw a playable door
-- over a locked account. The one thing this answer has to be unambiguous about
-- is whether the player may play, and every reader of it gets that from the
-- numbers alone rather than from remembering to check `ended` as well.
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
  if p_mode is null or p_mode not in ('dynasty', 'trade') then
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

  -- The Trade Machine, on the Eastern calendar day, exactly as 99 left it.
  if v_user is null then
    return query select 0, public.ps_day_allowance('trade', false),
      public.ps_eastern_reset(), 'run'::text, false;
    return;
  end if;
  select * into v_row from public.ps_daily_attempts
   where user_id = v_user and mode = 'trade' and day = public.ps_eastern_day();
  if not found then
    return query select 0, public.ps_day_allowance('trade', false),
      public.ps_eastern_reset(), 'run'::text, false;
  else
    return query select v_row.used, public.ps_day_allowance('trade', v_row.grace_boss),
      public.ps_eastern_reset(), 'run'::text, v_row.ended;
  end if;
end $$;

-- ---------- 4) spending one -------------------------------------------------
-- Called at KICKOFF, once per season, and the page marks the run with the season
-- it paid for so a reload in the middle of one cannot be charged twice.
--
-- SPENDING THE LAST ONE DOES NOT START THE CLOCK. The wait runs from the moment
-- the season ENDS, which is a different moment and is ps_attempt_day_end's job.
-- Starting it here would quietly hand back however long that season took.
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
  if p_mode is null or p_mode not in ('dynasty', 'trade') then
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

    /* ALIASED, AND THAT IS NOT A STYLE CHOICE. This function RETURNS TABLE (ok, used,
       allowance, ...), which makes `used` an OUT parameter, so an unqualified `set used =
       used + 1` is ambiguous between that parameter and the column and Postgres refuses the
       whole statement. It threw on every dynasty kickoff that got this far, and nothing said
       so on screen: dailySpend() catches and fails open, by design, so the season went ahead
       and was never counted. A three-a-day budget that silently never decrements is not a
       budget. The trade branch below has always had the alias, which is why only one of the
       two modes was affected. */
    update public.ps_dynasty_day d set used = d.used + 1, last_at = now()
     where d.user_id = v_user
     returning d.* into v_dyn;
    return query select true, v_dyn.used, v_allow, null::timestamptz, 'season'::text, false;
    return;
  end if;

  -- The Trade Machine, unchanged.
  insert into public.ps_daily_attempts (user_id, mode, day, used)
  values (v_user, 'trade', v_day, 0)
  on conflict (user_id, mode, day) do nothing;

  select a.used, public.ps_day_allowance('trade', a.grace_boss), a.ended
    into v_used, v_allow, v_ended
    from public.ps_daily_attempts a
   where a.user_id = v_user and a.mode = 'trade' and a.day = v_day
     for update;

  if v_ended or v_used >= v_allow then
    return query select false, v_used, v_allow, public.ps_eastern_reset(),
      'run'::text, v_ended;
    return;
  end if;

  update public.ps_daily_attempts a
     set used = a.used + 1, last_at = now()
   where a.user_id = v_user and a.mode = 'trade' and a.day = v_day
   returning a.used into v_used;

  return query select true, v_used, v_allow, public.ps_eastern_reset(),
    'run'::text, v_ended;
end $$;

-- ---------- 5) earning one --------------------------------------------------
-- 'boss' is a boss battle won and is worth one more season in the window it was
-- won in, once. 'fired' is accepted and does nothing, for the reason 101 gives.
--
-- NOT GRANTED INTO A CLOSED WINDOW. A boss is won during play, so this can only
-- arrive while the window is open; the guard is there because the one way it
-- could arrive late is a retry after the day ended, and crediting that would put
-- a fourth season into a budget nobody has started spending yet.
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
  if p_mode is null or p_mode not in ('dynasty', 'trade') then
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

  -- The Trade Machine earns neither and never calls this. Answered anyway.
  insert into public.ps_daily_attempts (user_id, mode, day, used, grace_boss)
  values (v_user, 'trade', v_day, 0, p_reason = 'boss')
  on conflict (user_id, mode, day)
    do update set grace_boss = public.ps_daily_attempts.grace_boss or p_reason = 'boss',
                  last_at = now();

  select a.used, public.ps_day_allowance('trade', a.grace_boss), a.ended
    into v_used, v_allow, v_ended
    from public.ps_daily_attempts a
   where a.user_id = v_user and a.mode = 'trade' and a.day = v_day;

  return query select v_used, v_allow, public.ps_eastern_reset(), 'run'::text, v_ended;
end $$;

-- ---------- 6) ending the day, and starting the clock -----------------------
-- The one call that starts a wait. Made at the moment the day ends and at no
-- other: the third season's results screen, or any season's if it fired them.
--
-- p_fired is which of the two endings it was, and it only decides what the page
-- says. Both cost the same 24 hours.
--
-- IT NEVER EXTENDS A WAIT THAT IS ALREADY RUNNING. The results screen it is
-- called from can be reopened from a save, and a second call that pushed the
-- clock out another day would turn revisiting your own run into a punishment.
-- Only an open window is closed here.
--
-- A LYING CLIENT CAN ONLY HURT ITSELF, which is why this needs no proof: the
-- sole thing it can do is end a day that belongs to it.
drop function if exists public.ps_attempt_day_end(text);
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
  if p_mode is null or p_mode not in ('dynasty', 'trade') then
    raise exception 'unknown mode';
  end if;
  if v_user is null then
    raise exception 'sign in to play';
  end if;

  if p_mode = 'dynasty' then
    insert into public.ps_dynasty_day (user_id) values (v_user)
    on conflict (user_id) do nothing;
    select * into v_dyn from public.ps_dynasty_day where user_id = v_user for update;

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

  -- The Trade Machine's day ends at midnight whatever happens to the run, so
  -- this marks the ledger and changes no clock.
  insert into public.ps_daily_attempts (user_id, mode, day, used, ended)
  values (v_user, 'trade', v_day, 0, true)
  on conflict (user_id, mode, day)
    do update set ended = true, last_at = now();

  select a.used, public.ps_day_allowance('trade', a.grace_boss)
    into v_used, v_allow
    from public.ps_daily_attempts a
   where a.user_id = v_user and a.mode = 'trade' and a.day = v_day;

  return query select v_used, v_allow, public.ps_eastern_reset(), 'run'::text, true;
end $$;

-- ---------- 7) grants -------------------------------------------------------
revoke all on function public.ps_attempts_state(text) from public;
revoke all on function public.ps_attempt_spend(text) from public;
revoke all on function public.ps_attempt_grace(text, text) from public;
revoke all on function public.ps_attempt_day_end(text, boolean) from public;
grant execute on function public.ps_attempts_state(text) to anon, authenticated;
grant execute on function public.ps_attempt_spend(text) to authenticated;
grant execute on function public.ps_attempt_grace(text, text) to authenticated;
grant execute on function public.ps_attempt_day_end(text, boolean) to authenticated;
grant execute on function public.ps_dynasty_wait() to anon, authenticated;

notify pgrst, 'reload schema';
