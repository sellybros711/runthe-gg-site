-- ---------------------------------------------------------------------------
-- 99_daily_attempts.sql : one Dynasty run a day, one Trade Machine run a day,
-- counted where the client cannot edit it.
--
-- Safe to run more than once.
--
-- ---------------------------------------------------------------------------
-- WHAT IS BEING COUNTED, AND WHAT IS DELIBERATELY NOT
-- ---------------------------------------------------------------------------
-- An ATTEMPT is STARTING a run. Continuing one is free, always, on any day and
-- for as many days as the run lasts. That is the whole rule and it is the reason
-- this table has no notion of a run in progress: resuming never reaches the
-- server, because there is nothing to check.
--
-- Metering starts rather than play also puts the limit on the right behaviour.
-- The player working through one long dynasty is never touched by it. The one it
-- meets is the player rerolling a bad draft, which is the impatient thing a
-- subscription is worth buying to do.
--
-- ---------------------------------------------------------------------------
-- WHY THIS CANNOT LIVE IN localStorage
-- ---------------------------------------------------------------------------
-- The moment the limit gates a paid tier it is worth bypassing, and in the
-- browser it is bypassed by clearing site data or opening a private window. A
-- free tier that is unlimited for anyone who knows that is not a free tier, and
-- the subscription it gates is worth nothing. So the count lives here, keyed on
-- auth.uid(), and the page asks rather than decides.
--
-- ---------------------------------------------------------------------------
-- THE DAY IS EASTERN, BECAUSE THE REST OF THE GAME'S DAY ALREADY IS
-- ---------------------------------------------------------------------------
-- board.js windows Today and This week on America/New_York (see cutoffISO), for
-- the reason written out there: a board where everyone's day starts at a
-- different moment is not one board. If the allowance rolled over at UTC
-- midnight it would reset at 8pm Eastern, four hours before the leaderboard's
-- day did, and the game would hold two different opinions about what day it is.
-- One zone, named once, used by both.
-- ---------------------------------------------------------------------------

-- ---------- 1) the ledger ---------------------------------------------------
-- One row per player per mode per day. A counter rather than a row per start,
-- because the only question ever asked of it is "how many so far today".
create table if not exists public.ps_daily_attempts (
  user_id  uuid    not null references auth.users(id) on delete cascade,
  mode     text    not null,
  day      date    not null,
  used     int     not null default 0,
  -- EXTRA ATTEMPTS GRANTED TODAY, and the only one the game grants is the mercy
  -- for a run that died in its first season. Bounded to one below, which is what
  -- makes it safe to let the client ask for it.
  granted  int     not null default 0,
  first_at timestamptz not null default now(),
  last_at  timestamptz not null default now(),
  primary key (user_id, mode, day),
  constraint ps_daily_attempts_mode_ck check (mode in ('dynasty', 'trade')),
  constraint ps_daily_attempts_used_ck check (used >= 0 and used <= 100),
  constraint ps_daily_attempts_granted_ck check (granted >= 0 and granted <= 1)
);

alter table public.ps_daily_attempts enable row level security;

-- A player may read their own ledger and nothing else. Writes go through the
-- functions below, which are the only things that may add to a count.
drop policy if exists "own attempts" on public.ps_daily_attempts;
create policy "own attempts" on public.ps_daily_attempts
  for select using (auth.uid() = user_id);

grant select on public.ps_daily_attempts to authenticated;

-- ---------- 2) the day, in one place ---------------------------------------
-- Immutable per call rather than a constant, so every function below and every
-- reader agrees on where the boundary is.
create or replace function public.ps_eastern_day()
returns date
language sql
stable
as $$ select (now() at time zone 'America/New_York')::date $$;

-- The instant the allowance next rolls over, as a real timestamptz, so the page
-- can draw a countdown off the server's clock instead of the device's. A phone
-- with the wrong date must not be able to talk itself into another run.
create or replace function public.ps_eastern_reset()
returns timestamptz
language sql
stable
as $$
  select ((now() at time zone 'America/New_York')::date + 1)::timestamp
         at time zone 'America/New_York'
$$;

-- ---------- 3) how the day stands, without spending anything ---------------
-- What the button reads on every paint. Never writes, so drawing the front page
-- can never cost somebody a run.
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
    /* A guest has no ledger and cannot start either mode anyway: both are behind
       the account wall. Answering "nothing used, one available" keeps the button
       drawable rather than making the front page depend on being signed in. */
    return query select 0, 1, public.ps_eastern_reset();
    return;
  end if;
  select * into v_row from public.ps_daily_attempts
   where user_id = v_user and mode = p_mode and day = public.ps_eastern_day();
  if not found then
    return query select 0, 1, public.ps_eastern_reset();
  else
    return query select v_row.used, 1 + v_row.granted, public.ps_eastern_reset();
  end if;
end $$;

-- ---------- 4) spending one ------------------------------------------------
-- Called at KICKOFF, not when the draft wheel opens. A draft somebody backs out
-- of costs nothing, because losing a day to a misclick is the kind of thing that
-- makes a player stop trusting the screen.
--
-- Returns whether it was allowed along with the numbers, so one round trip both
-- decides and tells the page what to draw.
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

  /* The row is created on the first attempt of the day and locked for the rest
     of this statement, so two taps in the same second cannot both read zero and
     both be allowed. */
  insert into public.ps_daily_attempts (user_id, mode, day, used)
  values (v_user, p_mode, v_day, 0)
  on conflict (user_id, mode, day) do nothing;

  select a.used, 1 + a.granted into v_used, v_allow
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

-- ---------- 5) the mercy ---------------------------------------------------
-- A run that ended in its first season gives one more attempt today.
--
-- THE SERVER DOES NOT CHECK THE REASON, AND DOES NOT NEED TO. It could: the
-- season is on ps_runs. But the grant is capped at one per player per mode per
-- day by the column's own constraint and by the greatest() below, so the worst a
-- client can do by lying is award itself the single extra attempt the game was
-- willing to give it anyway. Verifying a claim whose only possible outcome is
-- already the sanctioned one buys nothing and costs a join on every firing.
create or replace function public.ps_attempt_grace(p_mode text)
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
  if v_user is null then
    raise exception 'sign in to play';
  end if;

  insert into public.ps_daily_attempts (user_id, mode, day, used, granted)
  values (v_user, p_mode, v_day, 0, 1)
  on conflict (user_id, mode, day)
    do update set granted = greatest(public.ps_daily_attempts.granted, 1),
                  last_at = now();

  select a.used, 1 + a.granted into v_used, v_allow
    from public.ps_daily_attempts a
   where a.user_id = v_user and a.mode = p_mode and a.day = v_day;

  return query select v_used, v_allow, public.ps_eastern_reset();
end $$;

-- ---------- 6) grants ------------------------------------------------------
-- Guests can read state (they get the drawable default) and can call nothing
-- that writes. Everything that spends or grants needs an account, which both
-- modes already require.
revoke all on function public.ps_attempts_state(text) from public;
revoke all on function public.ps_attempt_spend(text) from public;
revoke all on function public.ps_attempt_grace(text) from public;
grant execute on function public.ps_attempts_state(text) to anon, authenticated;
grant execute on function public.ps_attempt_spend(text) to authenticated;
grant execute on function public.ps_attempt_grace(text) to authenticated;
grant execute on function public.ps_eastern_day() to anon, authenticated;
grant execute on function public.ps_eastern_reset() to anon, authenticated;

notify pgrst, 'reload schema';
