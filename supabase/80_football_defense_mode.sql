-- 80_football_defense_mode.sql : the Defense Draft gets its own board.
--
-- The mode drafts six defenders under the same cap and is scored on how few
-- points the other team put up. It is ranked apart from the draft modes for the
-- same reason the Trade Machine is: it is not the same competition. A defensive
-- roster's team rating is a different quantity built from a different pool
-- (IDP points rather than PPR points), so a defense run and an offense run on
-- one board would be two numbers that look alike and mean different things.
--
-- WITHOUT THIS FILE THE MODE CANNOT RECORD A SINGLE RUN. ps_runs_run_mode_ck is
-- a check constraint listing the modes by name, so a submit carrying
-- run_mode='defense' is rejected outright by the database, not degraded. The
-- game's own card stays disabled and says Coming Soon until this has been
-- applied, which is the honest state: the mode is playable and its seasons
-- would go nowhere.
--
-- Order of operations, if that gating is being lifted:
--   1. run this file
--   2. flip DEFENSE_LIVE in football/index.html
--   3. deploy
-- The other order records nothing and shows the player a saved-run failure they
-- can do nothing about.

-- ---------------------------------------------------------------------------
-- 1. Let the mode exist.
-- ---------------------------------------------------------------------------
alter table ps_runs drop constraint if exists ps_runs_run_mode_ck;
alter table ps_runs add  constraint ps_runs_run_mode_ck
  check (run_mode in ('free', 'daily', 'club', 'era', 'trade', 'defense'));

-- A defense run carries no franchise and no era, the same as free play and the
-- Trade Machine. Nothing to add for it: the existing constraints already say a
-- franchise is required only for 'club' and an era only for 'era'.

-- ---------------------------------------------------------------------------
-- 2. The board.
-- ---------------------------------------------------------------------------
-- One board serves the whole mode, the way one serves the Trade Machine: the
-- mode IS the competition, so there is no second field to lead the index with.
--
-- Partial on run_mode='defense' rather than leading with it, which is the shape
-- 59_football_era_mode.sql explains: with the mode in the WHERE clause the index
-- holds only this mode's rows and the axis leads, so Today is an index condition
-- rather than a filter over everybody else's seasons.
create index if not exists ps_runs_def_score_idx
  on ps_runs (score desc, created_at asc) where run_mode = 'defense';
create index if not exists ps_runs_def_rating_idx
  on ps_runs (team_rating desc, created_at asc) where run_mode = 'defense';

-- The named board. Every ranking read asks for display_name is not null, and
-- these partial indexes are why that is free rather than a scan: see the note in
-- board.js about 2,000,000 rows of which 20 were named.
create index if not exists ps_runs_def_named_score_idx
  on ps_runs (score desc, created_at asc)
  where run_mode = 'defense' and display_name is not null;
create index if not exists ps_runs_def_named_rating_idx
  on ps_runs (team_rating desc, created_at asc)
  where run_mode = 'defense' and display_name is not null;

comment on constraint ps_runs_run_mode_ck on ps_runs is
  'Every mode the football game can record. Widening this is what makes a new '
  'mode recordable; the game gates its own entry point separately, so both have '
  'to move for a mode to go live.';
