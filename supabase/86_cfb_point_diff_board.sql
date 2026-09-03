-- ---------------------------------------------------------------------------
-- 86: the college board's third axis becomes POINT DIFFERENTIAL.
--
-- WHY THE AXIS CHANGED. "Final ranking" sorted on national_rank, and the top of
-- that board was a column of "#1" going down the page: every season good enough
-- to be near the top of any list finished first in the country, so the axis that
-- was meant to separate them agreed with all of them. It ranked, and it did not
-- discriminate. Point differential is the same season measured with a ruler
-- instead of a place: it runs from about minus thirty to about plus forty, every
-- row has its own value, and it says which 14-1 was the better 14-1, which is
-- exactly the question the ranking column could not answer.
--
-- NOTHING IS BACKFILLED AND NOTHING NEEDS TO BE. point_diff has been NOT NULL on
-- cfb_runs since 62 and already feeds the derived `score` column that the Record
-- axis orders on, so every season ever recorded already carries the number this
-- axis sorts by. This migration is indexes and nothing else.
--
-- Safe to run more than once, and safe to run while the game is live: creating an
-- index takes a lock that blocks writes for the duration, which on a table this
-- size is well under a second. Use CREATE INDEX CONCURRENTLY instead if that is
-- ever not true.
-- ---------------------------------------------------------------------------

-- The two the new axis needs, mirroring 63 and 67 key for key so every board sort
-- still has a named twin and the planner has the same choice either way.
-- DESCENDING, because a bigger differential is a better season: this axis runs the
-- ordinary way and not backwards like the ranking one it replaces.
create index if not exists cfb_runs_mode_diff_idx
  on cfb_runs (run_mode, point_diff desc, created_at asc);
create index if not exists cfb_runs_named_diff_idx
  on cfb_runs (run_mode, point_diff desc, created_at asc) where display_name is not null;

-- And the two that served the axis being retired. An index nothing orders by is
-- dead weight on every insert, which is the same reasoning 63 used when it dropped
-- the four from 62 that could not serve a mode-filtered board.
--
-- national_rank ITSELF IS NOT GOING ANYWHERE. The column stays, the row still
-- prints "#1" beside the record, and cfb_submit_run still stores it. What is going
-- is the ability to ORDER a whole board by it, and if that axis is ever wanted
-- back these two lines are all it takes.
drop index if exists cfb_runs_mode_rank_idx;
drop index if exists cfb_runs_named_rank_idx;

-- The planner will not use a new index until it knows the shape of the column, and
-- point_diff has never been a sort key before.
analyze cfb_runs;
