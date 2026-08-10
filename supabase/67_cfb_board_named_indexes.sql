-- ===========================================================================
-- 67_cfb_board_named_indexes.sql
--
-- THE BOARD LISTS THE NAMED ROWS, SO THE BOARD NEEDS INDEXES OVER THE NAMED ROWS.
--
-- cfb/board.js now sends `display_name=not.is.null` on the list and on every
-- placing, because two different questions get asked of this table and the board
-- should not have to pick one:
--
--   how many seasons were PLAYED in this window   -- activity, guests included
--   how many are ON THE BOARD                      -- who signed in for one
--
-- The list and every "you came 40th" are the second of those. Without a partial
-- index that predicate is a filter: Postgres walks the mode/score index, fetches
-- each candidate row from the heap to look at display_name, and throws away the
-- guest ones. On a young board that is most of them, so the top-500 read touches
-- far more of the table than it returns and gets slower as guests accumulate --
-- which is exactly backwards, since guest seasons are the ones a growing game
-- makes most of.
--
-- With the index below the predicate is satisfied by the index itself. The named
-- rows are the only ones in it, they are already in board order, and a 500-row
-- read is 500 index entries however many guest seasons sit beside them.
--
-- Mirrors ps_runs_named_score_idx / ps_runs_named_rating_idx in
-- 55_football_avatars_setup.sql, which have been serving the football board this
-- way since the avatars shipped.
--
-- SAFE TO RUN TWICE. Every statement is if-not-exists.
-- SAFE TO RUN BEFORE THE CLIENT SHIPS: an index nothing queries yet costs a
-- little space and a little insert time and changes no behaviour.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- One per axis, shaped exactly like the four in 63_cfb_run_mode.sql: the mode
-- leads, because it is an equality on every board query and a leading equality
-- followed by the sort column is what lets one index scan satisfy the filter and
-- the order together. created_at trails, so the day and week windows are tested
-- from inside the index rather than as a heap fetch per candidate row.
--
-- No separate index for a REVERSED board. Postgres reads an index backwards as
-- happily as forwards, and ORDER_TIEBREAK in cfb/board.js flips the tiebreak
-- along with the sort key so that a reversed board is a clean backward scan
-- rather than a backward scan plus an Incremental Sort.
-- ---------------------------------------------------------------------------

-- Record. `score` is the derived column cfb_submit_run() writes; see
-- 62_cfb_leaderboard.sql for why the client never sends it.
create index if not exists cfb_runs_mode_named_score_idx
  on cfb_runs (run_mode, score desc, created_at asc)
  where display_name is not null;

-- Team overall.
create index if not exists cfb_runs_mode_named_overall_idx
  on cfb_runs (run_mode, overall desc, created_at asc)
  where display_name is not null;

-- The national ranking, the one axis where LOW IS BEST: No. 1 in the country is
-- first. Its own index rather than a backward scan of another, because nothing
-- else on this table orders this way.
create index if not exists cfb_runs_mode_named_rank_idx
  on cfb_runs (run_mode, national_rank asc, created_at asc)
  where display_name is not null;

-- NOT AN AXIS. This one serves the COUNT -- "12 on the board" -- which asks for a
-- mode, a time window and nothing else. None of the three above can answer it:
-- created_at is their LAST key, so a window is a filter on them rather than a
-- range, and Postgres falls back to a bitmap heap scan that reads a couple of
-- thousand pages to count a thousand rows.
--
-- Measured on 200,000 rows, 40,000 of them named, counting the day window:
--   without this index   Bitmap Heap Scan, 2,194 buffers, 2,158 heap blocks
--   with it              Index Only Scan,      7 buffers, 0 heap fetches
--
-- It runs on every paint of the board, so it is worth its own index.
create index if not exists cfb_runs_mode_named_created_idx
  on cfb_runs (run_mode, created_at desc)
  where display_name is not null;

-- ---------------------------------------------------------------------------
-- The four from 63 STAY. They are not redundant with the three above: the
-- activity count ("224 seasons played today") deliberately includes guests, and
-- a partial index cannot answer a query that does not carry its predicate.
-- ---------------------------------------------------------------------------

-- PostgREST caches the schema; nothing here changes it, but reloading is free
-- and keeps this file's shape the same as every other in this directory.
notify pgrst, 'reload schema';
