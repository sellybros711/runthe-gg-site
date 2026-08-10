-- ---------------------------------------------------------------------------
-- 67. The college board lists NAMED seasons only.
--
-- Run this on a project that already has 62, 63, 64 and 66. It is index-only:
-- no table, function or policy changes, nothing is deleted, and it is safe to
-- run twice.
--
-- WHY. A guest season is a real season. It is played, it is recorded, and it
-- counts towards how many seasons the game has produced. What it does not carry
-- is a name, so listing it puts a row reading "Anonymous" on a board whose whole
-- job is to say who did what. The football game has always drawn the line here
-- and the college game did not, which is the entire bug: cfb/board.js now sends
-- `display_name=not.is.null` on the list, on every placing and on the field size
-- those placings are quoted against, and sends it on none of the activity counts.
--
-- NOTHING IS DELETED, DELIBERATELY. The guest rows stay in cfb_runs. They are
-- what the "N seasons today" line counts, they are what a player claims when they
-- sign in afterwards (see cfb_claim_run() in 62, which stamps user_id and
-- display_name onto a run that was played signed out), and deleting them would
-- throw away both. A guest row is not junk data; it is a season waiting for a
-- name. Filtering is reversible in a way that a delete is not.
--
-- WHY THIS FILE EXISTS AT ALL, rather than the client just adding a filter. On a
-- board where most rows are guests, `display_name is not null` applied to the
-- existing indexes is a filter evaluated AFTER the scan: Postgres walks the mode
-- index in score order and throws away most of what it reads, so the top-100 read
-- degrades with the number of seasons PLAYED. Measured on the football table at
-- two million rows of which twenty were named, the same query went from 246ms and
-- 666,726 rows scanned to 0.03ms off 16kB once the partial indexes existed.
--
-- A partial index holds only the rows matching its WHERE, so these four grow with
-- the number of people who have signed in and never with the number of seasons
-- played. They mirror the four in 63 exactly, key for key, so every board sort
-- has a named twin and the planner has the same choice either way.
-- ---------------------------------------------------------------------------

create index if not exists cfb_runs_named_score_idx
  on cfb_runs (run_mode, score desc, created_at asc) where display_name is not null;
create index if not exists cfb_runs_named_created_idx
  on cfb_runs (run_mode, created_at desc, score desc) where display_name is not null;
create index if not exists cfb_runs_named_overall_idx
  on cfb_runs (run_mode, overall desc, created_at asc) where display_name is not null;
-- Ascending, because No. 1 is the best. Same reason 63 gives it its own index.
create index if not exists cfb_runs_named_rank_idx
  on cfb_runs (run_mode, national_rank asc, created_at asc) where display_name is not null;

-- The planner will not use a new index until it knows the selectivity of the
-- predicate that chooses it, and on a young table "most rows are guests" is
-- exactly the fact it has no statistics for yet.
analyze cfb_runs;

-- No column, function or grant changed, so PostgREST's schema cache is already
-- correct and no reload is needed. Left unsaid rather than sent, because a
-- pointless notify in a migration reads like a copied line nobody checked.
