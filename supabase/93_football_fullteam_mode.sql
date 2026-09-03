-- ---------------------------------------------------------------------------
-- 93_football_fullteam_mode.sql : Full Team, twelve men and one cap
--
-- Safe to run more than once.
--
-- RUN THIS BEFORE ANYBODY IS ADDED TO THE TESTER LIST IN
-- football/fullteam-access.js. That order is not a preference, it is the lesson
-- 80_football_defense_mode.sql wrote down after the defense draft learned it:
-- ps_runs_run_mode_ck lists the recordable modes BY NAME, so until this file has
-- been applied the database rejects every full team run outright. The mode plays
-- perfectly and every season it produces vanishes on submit, and a tester whose
-- season is thrown away learns exactly as little as no tester at all.
--
-- The page gates itself separately (FULLTEAM_LIVE and the tester list), so both
-- have to move for the mode to reach anybody.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Let the mode exist.
-- ---------------------------------------------------------------------------
alter table ps_runs drop constraint if exists ps_runs_run_mode_ck;
alter table ps_runs add  constraint ps_runs_run_mode_ck
  check (run_mode in ('free', 'daily', 'club', 'era', 'trade', 'defense', 'fullteam'));

-- A full team run carries no franchise and no era, the same as free play, the
-- Trade Machine and the defense draft. Nothing to add: the existing constraints
-- already require a franchise only for 'club' and an era only for 'era'.

-- ---------------------------------------------------------------------------
-- 2. The board.
-- ---------------------------------------------------------------------------
-- One board serves the whole mode, the way one serves the Trade Machine and the
-- defense draft: the mode IS the competition, so there is no second field to
-- lead the index with.
--
-- Partial on run_mode rather than leading with it, which is the shape
-- 59_football_era_mode.sql explains: with the mode in the WHERE clause the index
-- holds only this mode's rows and the axis leads, so Today is an index condition
-- rather than a filter over everybody else's seasons.
create index if not exists ps_runs_full_score_idx
  on ps_runs (score desc, created_at asc) where run_mode = 'fullteam';
create index if not exists ps_runs_full_rating_idx
  on ps_runs (team_rating desc, created_at asc) where run_mode = 'fullteam';

-- The named board. Every ranking read asks for display_name is not null, and
-- these partial indexes are why that is free rather than a scan: see the note in
-- board.js about 2,000,000 rows of which 20 were named.
create index if not exists ps_runs_full_named_score_idx
  on ps_runs (score desc, created_at asc)
  where run_mode = 'fullteam' and display_name is not null;
create index if not exists ps_runs_full_named_rating_idx
  on ps_runs (team_rating desc, created_at asc)
  where run_mode = 'fullteam' and display_name is not null;

comment on constraint ps_runs_run_mode_ck on ps_runs is
  'Every mode the football game can record. Widening this is what makes a new '
  'mode recordable; the game gates its own entry point separately, so both have '
  'to move for a mode to go live.';

-- ---------------------------------------------------------------------------
-- 3. What this file deliberately does NOT do
-- ---------------------------------------------------------------------------
-- IT DOES NOT WIDEN ANY ROSTER-SIZE CHECK, because there is not one to widen.
-- ps_submit_run validates the roster it is handed, and a full team run submits
-- twelve men where every other mode submits six. If a future migration adds a
-- server-side check on picks or slots, it has to read the mode: a flat "six" is
-- correct today only because no mode has ever had another number, which is the
-- same coincidence slotsLeft() in run.js was relying on until Full Team.
--
-- IT DOES NOT GATE ON PAYMENT. Full Team is intended as the first paid mode, and
-- nothing here knows about that. While it is a preview for named accounts the
-- page's own list is enough, because the worst case is somebody seeing an
-- unannounced game mode. The moment it is SOLD, that stops being true: a list
-- shipped in a public JavaScript file is readable and forgeable by anybody who
-- opens a console, so the authority has to move into ps_submit_run before money
-- is involved.

analyze ps_runs;

notify pgrst, 'reload schema';
