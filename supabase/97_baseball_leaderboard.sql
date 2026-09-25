-- ============================================================================
-- 97_baseball_leaderboard.sql : the leaderboard for Run The Diamond (/baseball)
-- ============================================================================
-- New and self-contained. Touches nothing that already exists: no existing
-- table, function, policy or grant is altered. Safe and idempotent, re-running
-- it does nothing new.
--
-- Run it once in the Supabase SQL editor. Until it is run, baseball/board.js
-- gets a 404 from every call, reports itself unavailable, and the game shows the
-- board as offline rather than showing wrong numbers.
--
-- THIS ADDS NO NEW ACCOUNT SYSTEM, the same as 62_cfb_leaderboard.sql. The site
-- already has one: `profiles` from 10_accounts.sql. A RunThe.GG account IS the
-- account here.
--
-- THE NAME IS NEVER SENT BY THE CLIENT. rtd_submit_run() reads it out of
-- profiles for auth.uid(). There is no free-text column a player can write into,
-- and the roster is stored as ids the client renders against its own copy of the
-- player data. Guests record and appear as Anonymous, the same trade the other
-- games make.
--
-- WHAT IS TRUSTED AND WHAT IS NOT
-- -------------------------------
-- The season is simulated in the browser, so the browser is the only thing that
-- knows how it went. This function cannot recompute that without replaying the
-- engine, so the record IS client-reported and a determined person can post a
-- season they did not play. What it does instead is own every derived field and
-- refuse any row that is not internally coherent.
--
-- BASEBALL HAS THE CLEANEST IDENTITIES OF THE THREE GAMES, because the schedule
-- is fixed and the playoff field is a pure win threshold. The client sends the
-- win count, the playoff wins and a handful of descriptive numbers. Everything
-- else is computed here, and these are impossible rather than merely unlikely:
--
--   * a record that does not add to 162
--   * a champion who missed the playoffs
--   * an 87-win division winner, or a 96-win wild card
--   * more playoff wins than the seed's bracket has rounds
--   * a title flag without the full bracket won
--   * a 116-win flag on a season that did not win 116
--   * a payroll above the cap plus the most re-spin fees payable
--   * chemistry above the engine's own ceiling
--   * a lineup roster submitted under All-Time Staff, or the reverse
--   * an all-time rank on a staff, which is not ranked against full clubs
--   * two runs from one browser on the same daily board
--
-- The honest fix for the remaining hole is an edge function that loads engine.js
-- and replays the season from (picks, slots, rng_seed, rng_calls), which is why
-- those four columns are stored even though nothing reads them yet. Until then
-- the board is a participation and comparison board, and should not be the basis
-- for a prize.
-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------
create table if not exists rtd_runs (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  -- Nullable so a guest's run records now and can be claimed on sign-in, the
  -- same shape 17_claim_draft.sql and 62_cfb_leaderboard.sql use.
  user_id       uuid,
  -- Denormalised on purpose, so a board read is an index-only scan rather than a
  -- join. rtd_rename_runs() below is what keeps the copy honest.
  display_name  text,

  -- The result. Only wins, playoff_wins and the descriptive block come from the
  -- client; everything else here is computed below.
  wins          smallint not null,
  losses        smallint not null,
  playoff_wins  smallint not null default 0,
  made_playoffs boolean  not null,
  seed_label    text     not null,
  playoff_rounds smallint not null,
  title_won     boolean  not null,
  tied_record   boolean  not null,          -- 116 wins
  is_goat       boolean  not null,          -- 117 or more

  -- Which game this was. A board is per mode: a Cap Survivor season and a
  -- Franchise season are not the same competition and should not share a list.
  run_mode      text not null default 'free',
  franchise     text,                        -- club code, One Franchise only
  era           text,                        -- decade label, Eras Draft only
  division      text,                        -- division name, Division Draft only

  -- The daily board. Null for an ordinary run, the EASTERN date for a daily one,
  -- because that is the calendar the page draws the board from (easternISO()).
  daily_key     date,
  -- One daily run per browser. Not an account check on purpose: the daily is
  -- playable signed out and an account requirement is the wrong friction, so
  -- this is a soft uniqueness that a determined person can clear their storage
  -- to beat. It stops the accident, not the attack.
  daily_client  text,

  -- Descriptive, and shown on the board. Bounded, never free text.
  rating        numeric(4,1),                -- 0..100, the number the player saw
  all_time_rank int,                         -- null for a staff, see below
  staff_era     numeric(4,2),                -- All-Time Staff only
  chemistry_pct numeric(5,2) not null default 0,
  spend_musd    numeric(6,2) not null default 0,
  respins       smallint     not null default 0,
  runs_for      int,
  runs_against  int,
  cuts          smallint not null default 0, -- Salary Cap Survivor
  trades        smallint not null default 0, -- The Trade Machine

  -- The single ordering axis, so "how many did better than me" is one indexed
  -- count rather than a sort over three columns. Wins dominate, then how far
  -- October went, then the roster's own rating as the tie-break.
  score         int not null,

  -- The roster, as "<player_id>|<season>|<role>". Rendered by the client against
  -- its own players.json, so no player-supplied text is stored or displayed.
  picks         text[] not null,
  slots         text[] not null,

  -- For the replay verifier described in the header. Nothing reads these yet.
  rng_seed      text,
  rng_calls     int
);

-- One daily result per browser per day. Partial, so ordinary runs are unaffected.
create unique index if not exists rtd_runs_daily_once
  on rtd_runs (daily_key, daily_client)
  where daily_key is not null and daily_client is not null;

create index if not exists rtd_runs_board_idx
  on rtd_runs (run_mode, score desc, created_at desc);
create index if not exists rtd_runs_daily_idx
  on rtd_runs (daily_key, score desc)
  where daily_key is not null;
create index if not exists rtd_runs_created_idx
  on rtd_runs (created_at desc);
create index if not exists rtd_runs_user_idx
  on rtd_runs (user_id, created_at desc)
  where user_id is not null;

-- ---------------------------------------------------------------------------
-- RLS: everyone reads, nobody writes directly. The RPC is the only writer.
-- ---------------------------------------------------------------------------
alter table rtd_runs enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies
                 where tablename='rtd_runs' and policyname='rtd_runs_read') then
    create policy rtd_runs_read on rtd_runs for select using (true);
  end if;
end $$;

revoke all on rtd_runs from anon, authenticated;
grant select on rtd_runs to anon, authenticated;

-- ---------------------------------------------------------------------------
-- rtd_board_day(): which daily board an instant belongs to
-- ---------------------------------------------------------------------------
-- The page names a daily by the date in America/New_York, which is when every
-- other calendar day on this site rolls. This was first written as the UTC date,
-- and the two disagree for four or five hours every evening (from 8pm Eastern in
-- summer, 7pm in winter): the page sent today, the server read tomorrow, and
-- every daily finished in that window was refused as backdated. The board fails
-- soft, so the only symptom was an evening's dailies missing from the board.
--
-- A function of its own so the rule can be tested at a fixed instant, since
-- nothing lets a test move now().
create or replace function rtd_board_day(p_at timestamptz default now())
returns date
language sql stable
set search_path = public
as $$ select (p_at at time zone 'America/New_York')::date $$;
revoke all on function rtd_board_day(timestamptz) from public;

-- ---------------------------------------------------------------------------
-- rtd_submit_run()
-- ---------------------------------------------------------------------------
-- Returns the new row id, or null when a daily has already been recorded for
-- this browser today. Raises with a readable message on anything incoherent, so
-- a client bug shows up as a failed submit rather than as a wrong board.
--
-- The constants below MUST match baseball/engine.js CONSTANTS. They are literals
-- rather than a read from a config table so this file is a complete statement of
-- the rules. If the cap or a playoff threshold changes, change them here in the
-- same deploy or legitimate seasons start being refused.
-- ---------------------------------------------------------------------------
drop function if exists rtd_submit_run(int,int,text,text,text,text,text,text,
  numeric,int,numeric,numeric,numeric,int,int,int,int,int,text[],text[],text,int);

create or replace function rtd_submit_run(
  p_wins          int,
  p_playoff_wins  int      default 0,
  p_run_mode      text     default 'free',
  p_franchise     text     default null,
  p_era           text     default null,
  p_division      text     default null,
  p_daily_key     text     default null,
  p_daily_client  text     default null,
  p_rating        numeric  default null,
  p_all_time_rank int      default null,
  p_staff_era     numeric  default null,
  p_chemistry_pct numeric  default 0,
  p_spend_musd    numeric  default 0,
  p_respins       int      default 0,
  p_runs_for      int      default null,
  p_runs_against  int      default null,
  p_cuts          int      default 0,
  p_trades        int      default 0,
  p_picks         text[]   default null,
  p_slots         text[]   default null,
  p_rng_seed      text     default null,
  p_rng_calls     int      default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  RTD_GAMES         constant int := 162;
  RTD_DIVISION_WINS constant int := 95;
  RTD_WILDCARD_WINS constant int := 88;
  RTD_ROUNDS_DIV    constant int := 3;   -- LDS, LCS, WS
  RTD_ROUNDS_WC     constant int := 4;   -- WC, LDS, LCS, WS
  RTD_RECORD_WINS   constant int := 116;
  RTD_GOAT_WINS     constant int := 117;
  RTD_ROSTER        constant int := 12;
  RTD_CAP           constant numeric := 170;
  -- Three re-spins at 5, 10 and 15 is the most anybody can be charged.
  RTD_MAX_FEES      constant numeric := 30;
  RTD_MAX_RESPINS   constant int := 3;
  -- CHEMISTRY.MAX is 0.15, which the game shows as +15.
  RTD_MAX_CHEM      constant numeric := 15;

  MODES constant text[] := array[
    'free','era','franchise','division','capsurvivor','staff','trade'];
  LINEUP_SLOTS constant text[] := array[
    'C','1B','2B','3B','SS','LF','CF','RF','DH','SP1','SP2','CL'];
  STAFF_SLOTS constant text[] := array[
    'SP1','SP2','SP3','SP4','SP5','RP1','RP2','RP3','RP4','RP5','SU','CL'];

  v_wins    int := p_wins;
  v_po      int := coalesce(p_playoff_wins, 0);
  v_mode    text := coalesce(nullif(trim(p_run_mode), ''), 'free');
  v_losses  int;
  v_made    boolean;
  v_label   text;
  v_rounds  int;
  v_title   boolean;
  v_tied    boolean;
  v_goat    boolean;
  v_score   int;
  v_user    uuid := auth.uid();
  v_name    text;
  v_daily   date;
  v_want    text[];
  v_id      bigint;
begin
  -- ---- the record ---------------------------------------------------------
  if v_wins is null or v_wins < 0 or v_wins > RTD_GAMES then
    raise exception 'wins out of range: %', v_wins;
  end if;
  -- The schedule is fixed, so this is an identity and not an estimate.
  v_losses := RTD_GAMES - v_wins;

  -- ---- the bracket, derived from the record alone -------------------------
  if v_wins >= RTD_DIVISION_WINS then
    v_made := true; v_label := 'Division winner'; v_rounds := RTD_ROUNDS_DIV;
  elsif v_wins >= RTD_WILDCARD_WINS then
    v_made := true; v_label := 'Wild card';       v_rounds := RTD_ROUNDS_WC;
  else
    v_made := false; v_label := 'Missed the playoffs'; v_rounds := 0;
  end if;

  if v_po < 0 then
    raise exception 'negative playoff wins';
  end if;
  if not v_made and v_po > 0 then
    raise exception 'playoff wins on a season that missed the playoffs';
  end if;
  if v_po > v_rounds then
    raise exception 'playoff wins (%) exceed the % rounds a % plays', v_po, v_rounds, v_label;
  end if;

  v_title := v_made and v_po = v_rounds;
  v_tied  := v_wins >= RTD_RECORD_WINS;
  v_goat  := v_wins >= RTD_GOAT_WINS;

  -- ---- the mode -----------------------------------------------------------
  if not (v_mode = any(MODES)) then
    raise exception 'unknown mode: %', v_mode;
  end if;
  -- A mode's own field is required, and no other mode may carry it.
  if (v_mode = 'franchise') <> (p_franchise is not null) then
    raise exception 'franchise is for One Franchise and nothing else';
  end if;
  if (v_mode = 'era') <> (p_era is not null) then
    raise exception 'era is for Eras Draft and nothing else';
  end if;
  if (v_mode = 'division') <> (p_division is not null) then
    raise exception 'division is for Division Draft and nothing else';
  end if;

  -- ---- the roster ---------------------------------------------------------
  if p_picks is null or array_length(p_picks, 1) <> RTD_ROSTER then
    raise exception 'a roster is % players', RTD_ROSTER;
  end if;
  if p_slots is null or array_length(p_slots, 1) <> RTD_ROSTER then
    raise exception 'a roster is % slots', RTD_ROSTER;
  end if;
  -- The slots have to be the mode's own. A staff filed under the lineup's
  -- positions is twelve arms recorded as a batting order.
  v_want := case when v_mode = 'staff' then STAFF_SLOTS else LINEUP_SLOTS end;
  if exists (select 1 from unnest(p_slots) s where not (s = any(v_want))) then
    raise exception 'slot names do not belong to mode %', v_mode;
  end if;
  if (select count(distinct s) from unnest(p_slots) s) <> RTD_ROSTER then
    raise exception 'every slot is filled once';
  end if;

  -- ---- money and chemistry ------------------------------------------------
  if p_respins < 0 or p_respins > RTD_MAX_RESPINS then
    raise exception 're-spins out of range: %', p_respins;
  end if;
  if p_spend_musd < 0 or p_spend_musd > RTD_CAP + RTD_MAX_FEES then
    raise exception 'payroll above the cap plus fees: %', p_spend_musd;
  end if;
  if p_chemistry_pct < -100 or p_chemistry_pct > RTD_MAX_CHEM then
    raise exception 'chemistry above the ceiling: %', p_chemistry_pct;
  end if;
  if p_rating is not null and (p_rating < 0 or p_rating > 100) then
    raise exception 'rating out of range: %', p_rating;
  end if;

  -- ---- what a staff is and is not -----------------------------------------
  -- A staff has no hitters, so it is not ranked against full team-seasons and
  -- carries an ERA instead. Everything else carries a rank and no ERA.
  if v_mode = 'staff' and p_all_time_rank is not null then
    raise exception 'a staff is not ranked against full clubs';
  end if;
  if v_mode <> 'staff' and p_staff_era is not null then
    raise exception 'staff ERA is for All-Time Staff and nothing else';
  end if;

  -- ---- the daily ----------------------------------------------------------
  if p_daily_key is not null then
    v_daily := p_daily_key::date;
    -- A daily is today's board. Backdating one is the cheapest possible forgery.
    if v_daily <> rtd_board_day(now()) then
      raise exception 'the daily board is today only';
    end if;
    if v_mode <> 'free' then
      raise exception 'the daily is played on the ordinary rules';
    end if;
  end if;

  -- ---- the ordering axis --------------------------------------------------
  -- Wins first, then how far October went, then the roster's rating as the
  -- tie-break, so two identical records are split by the better team.
  v_score := v_wins * 10000 + v_po * 1000 + round(coalesce(p_rating, 0) * 10)::int;

  -- ---- the name, read here and never sent ---------------------------------
  if v_user is not null then
    select username::text into v_name from profiles where id = v_user;
  end if;

  insert into rtd_runs (
    user_id, display_name,
    wins, losses, playoff_wins, made_playoffs, seed_label, playoff_rounds,
    title_won, tied_record, is_goat,
    run_mode, franchise, era, division,
    daily_key, daily_client,
    rating, all_time_rank, staff_era, chemistry_pct, spend_musd, respins,
    runs_for, runs_against, cuts, trades,
    score, picks, slots, rng_seed, rng_calls
  ) values (
    v_user, v_name,
    v_wins, v_losses, v_po, v_made, v_label, v_rounds,
    v_title, v_tied, v_goat,
    v_mode, p_franchise, p_era, p_division,
    v_daily, p_daily_client,
    p_rating, p_all_time_rank, p_staff_era,
    coalesce(p_chemistry_pct, 0), coalesce(p_spend_musd, 0), coalesce(p_respins, 0),
    p_runs_for, p_runs_against, coalesce(p_cuts, 0), coalesce(p_trades, 0),
    v_score, p_picks, p_slots, p_rng_seed, p_rng_calls
  )
  -- Second daily from the same browser: keep the first and say nothing. The
  -- client treats a null id as "already recorded", which is the truth.
  on conflict do nothing
  returning id into v_id;

  return v_id;
end $$;

revoke all on function rtd_submit_run(int,int,text,text,text,text,text,text,
  numeric,int,numeric,numeric,numeric,int,int,int,int,int,text[],text[],text,int)
  from public;
grant execute on function rtd_submit_run(int,int,text,text,text,text,text,text,
  numeric,int,numeric,numeric,numeric,int,int,int,int,int,text[],text[],text,int)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- rtd_claim_run(): a guest's run becomes theirs when they sign in
-- ---------------------------------------------------------------------------
create or replace function rtd_claim_run(p_id bigint)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_rows int;
begin
  if v_user is null then return false; end if;
  select username::text into v_name from profiles where id = v_user;
  update rtd_runs
     set user_id = v_user, display_name = v_name
   where id = p_id and user_id is null;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;
revoke all on function rtd_claim_run(bigint) from public;
grant execute on function rtd_claim_run(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- rtd_rename_runs(): what keeps the denormalised copy honest
-- ---------------------------------------------------------------------------
-- Call it after set_username(). Without it a rename leaves every past run under
-- the old name, which is the one real cost of not joining profiles on every read.
create or replace function rtd_rename_runs()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_rows int;
begin
  if v_user is null then return 0; end if;
  select username::text into v_name from profiles where id = v_user;
  update rtd_runs set display_name = v_name where user_id = v_user;
  get diagnostics v_rows = row_count;
  return v_rows;
end $$;
revoke all on function rtd_rename_runs() from public;
grant execute on function rtd_rename_runs() to authenticated;

analyze rtd_runs;
