-- ---------------------------------------------------------------------------
-- 139_segue_daily.sql: Segue's daily challenge.
--
-- Everybody gets the same shows on the same day. The page seeds its draw from
-- the band and the Eastern calendar date, and files the night with
-- rng_seed = 'daily:YYYY-MM-DD'. This file turns that into something the board
-- can filter and the database can hold to its rules.
--
-- WHY IT RIDES ON rng_seed. segue_submit_run() already accepts and stores it,
-- and nothing read it. Using it means this migration adds a column, two indexes
-- and a trigger, and does not restate the submit function at all, so nothing
-- 67 checks can drift from a second copy of it.
--
-- Alters segue_runs by adding one generated column. Idempotent: every statement
-- can run twice.
--
-- WITHOUT IT the daily still plays. Its submit lands as an ordinary night (the
-- seed is stored and ignored), the daily board's filter is a 400, and the page
-- says the daily board is not up yet.
-- ---------------------------------------------------------------------------

-- The day a night was a daily for, or null. Generated, so a client cannot set
-- it apart from the seed it came from.
alter table segue_runs
  add column if not exists daily text
  generated always as (
    case when rng_seed ~ '^daily:[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         then substr(rng_seed, 7) end
  ) stored;

-- The daily board and its counts: one day, best first.
create index if not exists segue_runs_daily_idx
  on segue_runs (band, daily, total desc, created_at asc)
  where daily is not null;

-- ONE TRY PER ACCOUNT PER DAY. The page holds a guest to it on the device; an
-- account is held here, so a second phone or a cleared browser cannot buy a
-- second look at the same shows.
create unique index if not exists segue_runs_daily_once
  on segue_runs (band, daily, user_id)
  where daily is not null and user_id is not null;

-- ONLY TODAY'S, OR YESTERDAY'S. Yesterday is allowed because a night started at
-- 11:50pm Eastern is filed after midnight. Anything older is a replay of a day
-- whose shows everybody now knows. Read off rng_seed rather than the generated
-- column, because a BEFORE trigger runs before generated columns are computed.
create or replace function segue_runs_daily_check()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_day  date;
  v_today date := (now() at time zone 'America/New_York')::date;
begin
  if new.rng_seed is null or new.rng_seed !~ '^daily:[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return new;
  end if;
  begin
    v_day := substr(new.rng_seed, 7)::date;
  exception when others then
    raise exception 'not a daily: %', new.rng_seed;
  end;
  if v_day > v_today or v_day < v_today - 1 then
    raise exception 'the % daily is closed', v_day;
  end if;
  return new;
end $$;

drop trigger if exists segue_runs_daily_check on segue_runs;
create trigger segue_runs_daily_check
  before insert on segue_runs
  for each row execute function segue_runs_daily_check();
