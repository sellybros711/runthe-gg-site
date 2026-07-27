-- ============================================================================
-- 50_football_perfect_season.sql : leaderboard for The Perfect Season
-- ============================================================================
-- New, self-contained. Touches nothing that already exists: no existing table,
-- function, policy or grant is altered. Safe and idempotent, re-running it does
-- nothing new.
--
-- Run it once in the Supabase SQL editor. Until it is run, football/board.js
-- gets a 404 from every call, reports itself unavailable, and the game shows the
-- board as offline rather than showing wrong numbers.
--
-- WHAT IS TRUSTED AND WHAT IS NOT
-- -------------------------------
-- The season is simulated in the browser, so the browser is the only thing that
-- knows how many games you won. There is no way for this function to recompute
-- that without replaying the whole engine, so wins ARE client-reported and a
-- determined person can post a season they did not play.
--
-- What this function does instead is own every DERIVED field and refuse any row
-- that is not internally coherent. The client sends regular_wins and
-- playoff_wins and nothing else about the result; games, losses, the seed label,
-- made_playoffs, perfect and the ordering score are all computed here. That
-- makes a whole class of forgery and a whole class of client bug impossible
-- rather than merely unlikely:
--
--   * 20-0 with 17 games, or 18-2 in a season that has 17 regular games
--   * a title with fewer playoff wins than the bracket has rounds
--   * two playoff losses, when one loss ends it
--   * a wild-card team playing a top seed's three-game bracket
--   * a perfect flag on a season with a loss in it
--
-- The honest fix for the remaining hole is a Supabase edge function that loads
-- engine.js and replays the season from (picks, seed, rng_calls), which is why
-- those three columns are stored even though nothing reads them yet. Until then
-- the board is a participation and comparison board, and should not be treated
-- as the basis for a prize.
-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------
create table if not exists ps_runs (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  -- Accounts are not live yet. Nullable so anonymous runs record now and can be
  -- claimed later, the same shape 17_claim_draft.sql uses for the soccer game.
  user_id       uuid,

  -- The result, as the server computed it. None of these come from the client
  -- except regular_wins and playoff_wins.
  regular_wins  smallint not null,
  playoff_wins  smallint not null,
  wins          smallint not null,
  losses        smallint not null,
  games         smallint not null,
  title_won     boolean  not null,
  made_playoffs boolean  not null,
  perfect       boolean  not null,
  seed_label    text     not null,

  -- Descriptive, and shown on the board. Bounded, never free text.
  point_diff    numeric(4,1) not null,
  chemistry_pct numeric(5,2) not null,
  spend_musd    numeric(5,1) not null,
  respins       smallint     not null default 0,
  franchise     text,                       -- the club whose place you took

  -- THE DAILY CHALLENGE IS A SEPARATE COMPETITION, not a flag on this one.
  -- Everybody who plays a given day's daily gets the same six draws, so those runs
  -- are comparable with each other in a way no two free runs are. Mixing them would
  -- make the free board unfair in one direction (a free player can re-roll until the
  -- wheel is kind) and the daily board meaningless in the other.
  --
  -- daily_date, not just the boolean, because created_at is the wrong thing to
  -- window a daily board on. The puzzle is identified by its UTC date, and a run
  -- started at 23:58 and submitted at 00:03 was still that day's puzzle. Windowing
  -- on created_at would file it under the next day's board.
  daily         boolean      not null default false,
  daily_date    date,

  -- The roster's own strength, which is the board's second sort axis.
  --
  -- team_rating is not a made-up composite. resolveGame() scores a week as
  --   sum(ppr_ppg_mean) * chemistry * structure * defenseModifier
  -- so dropping the per-opponent term leaves the points a roster is expected to
  -- put up against an average defense. That is what the game already means by
  -- "squad FPPG" and "team shape" on the results page, multiplied together.
  squad_fppg     numeric(5,1),   -- summed ppr_ppg_mean, before any multiplier
  structure_mult numeric(4,3),   -- rosterStructure().multiplier
  team_rating    numeric(6,2),   -- squad_fppg * chemistry * structure
  -- yourProjected / bestProjected from bestPossibleSquad(), as a percentage.
  perfect_pct    smallint,

  -- The roster, as "<player_id>:<season>". Rows are rendered from these ids by
  -- the client against its own copy of player_seasons.json, so no player-supplied
  -- text is ever stored or displayed. That is deliberate: a free-text name or
  -- headline column would be an abuse surface with no accounts to attach it to.
  picks         text[] not null,
  slots         text[],

  -- For the replay verifier described above. Nothing reads these yet.
  seed          text,
  rng_calls     integer,

  -- ONE sortable key, so ranking is a single count(*) and one index covers it.
  -- Monotone in wins first, then point differential. The differential is shifted
  -- by 40 and clamped into 0..9999 so it can never carry into the wins digit:
  -- a 12-win season can never outrank a 13-win one however lopsided the scores.
  score integer generated always as (
    wins::int * 10000
    + least(9999, greatest(0, round((point_diff + 40) * 100)::int))
  ) stored
);

-- For a project where the table was created by an earlier version of this file.
-- create table if not exists does nothing to an existing table, so the newer
-- columns have to be added explicitly. Both paths end up identical.
alter table ps_runs add column if not exists squad_fppg     numeric(5,1);
alter table ps_runs add column if not exists structure_mult numeric(4,3);
alter table ps_runs add column if not exists team_rating    numeric(6,2);
alter table ps_runs add column if not exists perfect_pct    smallint;
alter table ps_runs add column if not exists daily_date     date;

-- Rows recorded before daily_date existed: a daily run's puzzle was the UTC date it
-- was played on, which is the best that can be recovered, and free runs stay null.
update ps_runs set daily_date = (created_at at time zone 'utc')::date
 where daily and daily_date is null;

comment on table ps_runs is
  'Completed runs of The Perfect Season (/football). Written only by ps_submit_run().';

-- ---------------------------------------------------------------------------
-- Indexes. Every query the client makes, and nothing speculative.
--
-- Measured on a local Postgres 16 with 2,000,006 rows, which is far more runs
-- than this game is likely to see. Every one of these is an index-only scan, no
-- heap access and no sequential scan:
--
--   board list, all time            0.16 ms
--   board list, this week           0.2  ms
--   your rank today, worst case     1.7  ms
--   total runs today                1.2  ms
--   your rank this week, worst case 5.6  ms
--   total runs this week            5.0  ms
--   your rank all time, worst case   49  ms
--   total runs all time              47  ms
--
-- "Worst case" means a bad run, where nearly every row in the table is better
-- and therefore has to be counted. The two all-time numbers are the only ones
-- that grow with the table rather than with the window, at roughly 25ms per
-- million rows. If this ever passes about 10 million runs (a ~270ms results
-- screen) the fix is a summary table of counts by score, not another index.
-- ---------------------------------------------------------------------------
-- EVERY board query now carries a mode, free play or daily, so the mode leads every
-- index. A leading equality column followed by the sort column is what lets Postgres
-- satisfy the filter and the order from one index scan.
--
-- One index per (axis, does it need a time window) and no more. Each leads with
-- `daily`, so the same index serves free play and the daily board.
--
-- THERE IS NO ASCENDING TWIN, and that only works because the client reverses the
-- TIEBREAK along with the sort key. Postgres reads an index backwards as happily as
-- forwards, but only when every sort key reverses together: `score asc, created_at
-- asc` against a (score desc, created_at asc) index is a backward scan plus an
-- Incremental Sort, while `score asc, created_at desc` is a clean backward scan.
-- Measured 0.234ms against 0.060ms at 2M rows. See ORDER_TIEBREAK in board.js.
create index if not exists ps_runs_mode_score_idx
  on ps_runs (daily, score desc, created_at asc);
create index if not exists ps_runs_mode_created_idx
  on ps_runs (daily, created_at desc, score desc);
-- The rating axis is deliberately NOT windowed for free play, so it needs no
-- created_at companion. See the note under the daily indexes.
create index if not exists ps_runs_mode_rating_idx
  on ps_runs (daily, team_rating desc, created_at asc);
-- The daily board is one puzzle, so the date IS the window: an equality, not a
-- range, which is why both axes are a plain index scan here.
create index if not exists ps_runs_daily_score_idx
  on ps_runs (daily_date, score desc, created_at asc);
create index if not exists ps_runs_daily_rating_idx
  on ps_runs (daily_date, team_rating desc, created_at asc);

-- WHY THE FREE RATING BOARD IS ALL-TIME ONLY
--
-- Ordering by team_rating over a created_at RANGE is the one query shape here that
-- no index can satisfy without a gamble. Postgres either walks the rating index in
-- order and throws away everything outside the window, or fetches the window and
-- sorts it, and it has to guess which is cheaper from a row estimate. When it
-- guesses wrong on a sparse window the cost is brutal: measured at 2M rows, a
-- window containing NO qualifying rows walked all 1.5M index entries to return
-- nothing, in 125ms.
--
-- So the client does not ask that question. The free rating board is all time, which
-- is the natural framing anyway ("the best roster anybody has built" is not a
-- daily question), and every rating query becomes an unwindowed index scan: 0.24ms
-- descending, 0.14ms ascending. The daily rating board keeps its window because
-- daily_date is an equality and lands in the index alongside the sort.
-- Claiming anonymous runs once accounts exist, and a player's own history.
create index if not exists ps_runs_user_idx       on ps_runs (user_id, created_at desc);

-- Indexes earlier versions of this file created, now superseded. The first five do
-- not lead with a mode, so none of them can serve a query that filters by one. The
-- last two were the same three columns under names that claimed to be free-play only
-- when they serve both modes. Dropped rather than left behind: every index still
-- costs write time on every insert.
drop index if exists ps_runs_score_idx;
drop index if exists ps_runs_created_idx;
drop index if exists ps_runs_score_only_idx;
drop index if exists ps_runs_rating_idx;
drop index if exists ps_runs_created_rating_idx;
drop index if exists ps_runs_free_score_idx;
drop index if exists ps_runs_free_created_idx;
drop index if exists ps_runs_free_rating_idx;
drop index if exists ps_runs_free_created_rating_idx;

-- ---------------------------------------------------------------------------
-- RLS: everyone reads, nobody writes directly. The RPC is the only writer.
-- ---------------------------------------------------------------------------
alter table ps_runs enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies
                 where tablename='ps_runs' and policyname='ps_runs_read') then
    create policy ps_runs_read on ps_runs for select using (true);
  end if;
end $$;

revoke all on ps_runs from anon, authenticated;
grant select on ps_runs to anon, authenticated;

-- ---------------------------------------------------------------------------
-- ps_submit_run()
-- ---------------------------------------------------------------------------
-- Returns the new row id. Raises with a readable message on anything incoherent,
-- so a client bug shows up as a failed submit rather than as a wrong board.
--
-- p_cap_musd is NOT accepted from the client on purpose. If the game's salary cap
-- changes, change PS_CAP_MUSD below in the same deploy, or legitimate rosters
-- will start being refused.
-- ---------------------------------------------------------------------------
-- The signature gained four arguments. create or replace would leave the older
-- one in place as an overload, and PostgREST would then have two candidates to
-- choose between, so the previous version is dropped by its exact signature first.
drop function if exists ps_submit_run(int,int,numeric,numeric,numeric,int,text,boolean,text[],text[],text,int);
drop function if exists ps_submit_run(int,int,numeric,numeric,numeric,int,text,boolean,text[],text[],text,int,numeric,numeric,numeric,int);

create or replace function ps_submit_run(
  p_regular_wins  int,
  p_playoff_wins  int,
  p_point_diff    numeric,
  p_chemistry_pct numeric,
  p_spend_musd    numeric,
  p_respins       int      default 0,
  p_franchise     text     default null,
  -- The daily puzzle's own date as 'YYYY-MM-DD', or null for a free run. This
  -- replaced a p_daily boolean: two arguments saying the same thing is two chances
  -- for a client to disagree with itself, and the date carries strictly more.
  p_daily_date    text     default null,
  p_picks         text[]   default null,
  p_slots         text[]   default null,
  p_seed          text     default null,
  p_rng_calls     int      default null,
  p_squad_fppg    numeric  default null,
  p_structure_mult numeric default null,
  p_team_rating   numeric  default null,
  p_perfect_pct   int      default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Must match football/engine.js CONSTANTS. Kept as literals rather than read
  -- from a config table so this file is a complete statement of the rules.
  PS_REG_GAMES       constant int := 17;
  PS_PLAYOFF_WINS    constant int := 12;   -- regular wins needed to get in
  PS_BYE_SEED_WINS   constant int := 15;   -- regular wins that skip a round
  PS_ROUNDS_BYE      constant int := 3;
  PS_ROUNDS_WILDCARD constant int := 4;
  PS_ROSTER_SIZE     constant int := 6;
  PS_CAP_MUSD        constant numeric := 140;

  v_reg     int := p_regular_wins;
  v_po      int := coalesce(p_playoff_wins, 0);
  v_rounds  int;
  v_title   boolean;
  v_made    boolean;
  v_po_games int;
  v_wins    int;
  v_losses  int;
  v_games   int;
  v_label   text;
  v_dupe    bigint;
  v_id      bigint;
  v_ddate   date;
  v_daily   boolean;
begin
  -- ---- free run or daily, decided here and not sent twice ----
  if p_daily_date is null or p_daily_date = '' then
    v_ddate := null; v_daily := false;
  else
    if p_daily_date !~ '^[12][0-9]{3}-[01][0-9]-[0-3][0-9]$' then
      raise exception 'daily date must be YYYY-MM-DD, got %', p_daily_date;
    end if;
    v_ddate := p_daily_date::date;
    v_daily := true;
    -- A day either side of now, for clients whose clock or timezone is off and for
    -- a run that was in progress across midnight UTC. Any wider and old puzzles
    -- could be back-filled once their answers are known.
    if v_ddate < (now() at time zone 'utc')::date - 1
       or v_ddate > (now() at time zone 'utc')::date + 1 then
      raise exception 'daily date % is not close enough to today', v_ddate;
    end if;
  end if;

  -- ---- the record has to be a record this game can produce ----
  if v_reg is null or v_reg < 0 or v_reg > PS_REG_GAMES then
    raise exception 'regular wins must be 0..% , got %', PS_REG_GAMES, v_reg;
  end if;

  if v_reg >= PS_BYE_SEED_WINS then
    v_rounds := PS_ROUNDS_BYE;   v_label := 'Top seed';
  elsif v_reg >= PS_PLAYOFF_WINS then
    v_rounds := PS_ROUNDS_WILDCARD; v_label := 'Wild card';
  else
    v_rounds := 0; v_label := 'Missed the playoffs';
  end if;
  v_made := v_rounds > 0;

  if not v_made then
    if v_po <> 0 then
      raise exception 'playoff wins with % regular wins, which misses the playoffs', v_reg;
    end if;
    v_po_games := 0;
    v_title := false;
  else
    if v_po < 0 or v_po > v_rounds then
      raise exception 'playoff wins must be 0..% for a % seed, got %', v_rounds, v_label, v_po;
    end if;
    v_title := v_po = v_rounds;
    -- One playoff loss ends the run, so a non-champion played exactly one game
    -- more than he won.
    v_po_games := case when v_title then v_rounds else v_po + 1 end;
  end if;

  v_wins   := v_reg + v_po;
  v_losses := (PS_REG_GAMES - v_reg) + (v_po_games - v_po);
  v_games  := PS_REG_GAMES + v_po_games;

  -- ---- the descriptive numbers have to be in range ----
  if p_point_diff is null or p_point_diff < -60 or p_point_diff > 60 then
    raise exception 'point differential out of range: %', p_point_diff;
  end if;
  if p_chemistry_pct is null or p_chemistry_pct < 0 or p_chemistry_pct > 100 then
    raise exception 'chemistry out of range: %', p_chemistry_pct;
  end if;
  if p_spend_musd is null or p_spend_musd < 0 or p_spend_musd > PS_CAP_MUSD then
    raise exception 'spend of % is outside the $%M cap', p_spend_musd, PS_CAP_MUSD;
  end if;
  if coalesce(p_respins, 0) < 0 or coalesce(p_respins, 0) > 3 then
    raise exception 'respins must be 0..3, got %', p_respins;
  end if;
  if p_franchise is not null and p_franchise !~ '^[A-Z]{2,3}$' then
    raise exception 'franchise code looks wrong: %', p_franchise;
  end if;

  -- The rating is client-reported for the same reason wins are: recomputing it
  -- needs the player prices and per-player scoring rates, which live in the
  -- browser's copy of player_seasons.json and not in this database. These bounds
  -- are a sanity check, not a fairness guarantee. For scale, simulator.js measures
  -- perfect play at 84 summed FPPG and a 1.017 structure, so about 90.
  if p_squad_fppg is not null and (p_squad_fppg < 0 or p_squad_fppg > 250) then
    raise exception 'squad FPPG out of range: %', p_squad_fppg;
  end if;
  if p_structure_mult is not null and (p_structure_mult < 0.2 or p_structure_mult > 2) then
    raise exception 'structure multiplier out of range: %', p_structure_mult;
  end if;
  if p_team_rating is not null and (p_team_rating < 0 or p_team_rating > 400) then
    raise exception 'team rating out of range: %', p_team_rating;
  end if;
  if p_perfect_pct is not null and (p_perfect_pct < 0 or p_perfect_pct > 100) then
    raise exception 'perfect percentage out of range: %', p_perfect_pct;
  end if;

  -- ---- the roster has to be six distinct, well-formed player-seasons ----
  if p_picks is null or cardinality(p_picks) <> PS_ROSTER_SIZE then
    raise exception 'a run has % picks, got %', PS_ROSTER_SIZE,
      coalesce(cardinality(p_picks), 0);
  end if;
  if cardinality(array(select distinct unnest(p_picks))) <> PS_ROSTER_SIZE then
    raise exception 'the same player cannot be signed twice';
  end if;
  if exists (select 1 from unnest(p_picks) k where k !~ '^[0-9A-Za-z-]{1,32}:[12][0-9]{3}$') then
    raise exception 'a pick is not of the form <player_id>:<season>';
  end if;
  if p_slots is not null then
    if cardinality(p_slots) <> PS_ROSTER_SIZE then
      raise exception 'slots must line up with picks';
    end if;
    if exists (select 1 from unnest(p_slots) s where s not in ('QB','RB','WR','TE','FLEX')) then
      raise exception 'unknown slot name';
    end if;
  end if;

  -- ---- swallow an accidental double submit ----
  -- A retry after a timeout, or a second tap on Share, should not put the same
  -- season on the board twice. Same roster, same result, inside a minute: return
  -- the row that is already there. This is NOT a rate limiter, it is idempotency.
  select id into v_dupe from ps_runs
   where picks = p_picks and regular_wins = v_reg and playoff_wins = v_po
     and daily = v_daily
     and created_at > now() - interval '1 minute'
   limit 1;
  if v_dupe is not null then return v_dupe; end if;

  insert into ps_runs (
    user_id, regular_wins, playoff_wins, wins, losses, games,
    title_won, made_playoffs, perfect, seed_label,
    point_diff, chemistry_pct, spend_musd, respins, franchise, daily, daily_date,
    picks, slots, seed, rng_calls,
    squad_fppg, structure_mult, team_rating, perfect_pct
  ) values (
    auth.uid(), v_reg, v_po, v_wins, v_losses, v_games,
    v_title, v_made, (v_title and v_losses = 0), v_label,
    round(p_point_diff, 1), round(p_chemistry_pct, 2), round(p_spend_musd, 1),
    coalesce(p_respins, 0), p_franchise, v_daily, v_ddate,
    p_picks, p_slots, p_seed, p_rng_calls,
    round(p_squad_fppg, 1), round(p_structure_mult, 3), round(p_team_rating, 2),
    p_perfect_pct
  ) returning id into v_id;

  return v_id;
end $$;

revoke all on function ps_submit_run(int,int,numeric,numeric,numeric,int,text,text,text[],text[],text,int,numeric,numeric,numeric,int) from public;
grant execute on function ps_submit_run(int,int,numeric,numeric,numeric,int,text,text,text[],text[],text,int,numeric,numeric,numeric,int)
  to anon, authenticated;

analyze ps_runs;
