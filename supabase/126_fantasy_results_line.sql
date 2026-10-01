-- ---------------------------------------------------------------------------
-- 126_fantasy_results_line.sql : what each man did, beside what it scored
--
--   psql ... -f supabase/126_fantasy_results_line.sql
--
-- Needs 109 and 110. Safe to run twice.
--
-- Asked for by the owner from the live board: a lineup folded out under a row showed each
-- man's points and nothing about how he got them. `fantasy_results` held one number a man.
--
-- The writers already had the sentence. `weekly-results.mjs` builds `277 pass yds, 2 TD`
-- off nflverse and `espn-box.mjs` builds the same off the box score, and both handed it to
-- `resultsSQL`, which dropped it on the way to the table. This column is where it lands.
--
-- IT IS DISPLAY AND NOTHING READS IT FOR A SCORE. Every total on the site is `half_ppr`
-- summed at read time, so a missing or stale line can never move a place.
--
-- THE WRITER ASKS WHETHER THIS COLUMN EXISTS before it writes it, so the live job keeps
-- scoring against a database that has not run this file yet. See `resultsSQL` in
-- `football/build/publish-week.mjs`.
--
-- PUBLIC READ ALREADY. 110 grants select on the whole table, and a table grant covers a
-- column added after it.
-- ---------------------------------------------------------------------------

alter table public.fantasy_results add column if not exists line text;

notify pgrst, 'reload schema';
