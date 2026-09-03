-- ---------------------------------------------------------------------------
-- 87: a third axis on every football board.
--
-- The sort bar has had two axes plus a mode-only third since 61. Record and team
-- rating both describe the roster you finished with; the third slot is where the
-- board says something the other two cannot, and until now only the Trade
-- Machine had one. This gives the other two families theirs:
--
--   offense boards (free, club, era)   POINT DIFFERENTIAL
--   the defense board                  POINTS ALLOWED PER GAME
--   the Trade Machine                  the GM rating, unchanged, from 61
--
-- WHY POINT DIFFERENTIAL IS WORTH AN AXIS WHEN IT IS ALREADY IN `score`. It is in
-- there as the TIEBREAK behind wins, which is a different question: score asks who
-- won most and settles ties by margin, so a 13-4 that won by forty a week ranks
-- under a 14-3 that squeaked all seventeen. On its own axis the ruler leads, and
-- the board answers which 13-4 was the better 13-4. The college game made exactly
-- this change in 86_cfb_point_diff_board.sql and this file is its twin.
--
-- WHY POINTS ALLOWED IS THE DEFENSE BOARD'S. Same argument the GM rating makes for
-- the Trade Machine: record and team rating measure a roster, and this is the one
-- number that measures what the roster was drafted to do.
--
-- LOWER IS BETTER ON THAT ONE, and it is the first axis in this game where that is
-- true. Nothing in the schema knows or needs to: the client opens the axis
-- ascending, and one index shape serves both directions either way (see below).
--
-- NOTHING IS BACKFILLED AND NOTHING NEEDS TO BE.
--   * point_diff has been on ps_runs since 50 and already feeds the generated
--     `score` column the Record axis orders on, so every season ever recorded
--     carries it.
--   * points_allowed arrived with 86_football_defense_stats.sql. Defense seasons
--     recorded before it have a null, and the board query appends
--     `points_allowed=not.is.null` for any axis that is not score, so those rows
--     drop out of this board rather than sorting to the top of it. That matters
--     more here than on any other axis: on a board where low is good, a null read
--     as zero would be the best season anybody has ever played.
--
-- This migration is indexes and nothing else. No column, no function, no
-- constraint, no grant. Safe to run more than once, and safe to run while the game
-- is live: creating an index takes a lock that blocks writes for its duration,
-- which on a table this size is well under a second. Use CREATE INDEX
-- CONCURRENTLY instead if that is ever not true.
--
-- Run 86_football_defense_stats.sql first if it has not been. Without
-- points_allowed on the table the four defense lines below fail, and because the
-- Supabase SQL editor runs a script as ONE TRANSACTION that failure would roll
-- back the offense indexes too.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Why every index below is DESCENDING even though one board opens ascending
-- ---------------------------------------------------------------------------
-- board.js orders `<axis>.<dir>,created_at.<opposite dir>`, and the reason is
-- written out there: Postgres can read an index backwards only when EVERY sort key
-- reverses together. `points_allowed asc, created_at desc` is the exact reverse of
-- `points_allowed desc, created_at asc`, so it is a clean backward scan of the one
-- index and needs no ascending twin. Measured at 0.060ms against 0.234ms for the
-- mismatched pair, which is why no axis in this schema has one.
-- ---------------------------------------------------------------------------

-- The free board. Leading with run_mode, mirroring ps_runs_rm_score_idx in 57.
create index if not exists ps_runs_rm_diff_idx
  on ps_runs (run_mode, point_diff desc, created_at asc);
create index if not exists ps_runs_rm_named_diff_idx
  on ps_runs (run_mode, point_diff desc, created_at asc) where display_name is not null;

-- The thirty two One Franchise boards. Partial on run_mode so franchise can lead,
-- which is the shape 57 explains: one club's rows are an index condition rather
-- than a filter over the other thirty one.
create index if not exists ps_runs_rmclub_diff_idx
  on ps_runs (franchise, point_diff desc, created_at asc) where run_mode = 'club';
create index if not exists ps_runs_rmclub_named_diff_idx
  on ps_runs (franchise, point_diff desc, created_at asc)
  where run_mode = 'club' and display_name is not null;

-- The era boards, same shape again, mirroring 59.
create index if not exists ps_runs_era_diff_idx
  on ps_runs (era, point_diff desc, created_at asc) where run_mode = 'era';
create index if not exists ps_runs_era_named_diff_idx
  on ps_runs (era, point_diff desc, created_at asc)
  where run_mode = 'era' and display_name is not null;

-- The defense board. One board rather than thirty two, so the axis leads directly,
-- mirroring ps_runs_def_score_idx in 80.
create index if not exists ps_runs_def_pa_idx
  on ps_runs (points_allowed desc, created_at asc) where run_mode = 'defense';
create index if not exists ps_runs_def_named_pa_idx
  on ps_runs (points_allowed desc, created_at asc)
  where run_mode = 'defense' and display_name is not null;

-- The planner will not use a new index until it knows the shape of the column, and
-- neither of these has ever been a sort key before.
analyze ps_runs;
