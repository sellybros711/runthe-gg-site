-- ============================================================================
-- 02_wc_players.sql  —  Authoritative player-ratings table (server source of truth)
-- ============================================================================
-- The leaderboard can only be trustworthy if the SERVER knows each player's real
-- rating. This table holds it; submit_draft() (file 03) recomputes every score
-- from these rows instead of trusting the browser.
--
-- After creating the table, load the data with the generated CSV:
--   Supabase Dashboard → Table editor → wc_players → Insert → Import data from CSV
--   → upload supabase/wc_players.csv  (9,976 rows; columns line up 1:1).
-- Re-run this whole file after every player-data swap, then re-import the CSV.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wc_players (
  player_id   text PRIMARY KEY,
  wc_overall  int  NOT NULL,
  position    text NOT NULL,          -- GK | DEF | MID | FWD
  is_captain  boolean NOT NULL DEFAULT false,
  award       text NOT NULL DEFAULT '' -- '' | 'golden_boot' | 'golden_ball|golden_boot' ...
);

-- Read-only to the public; only the SECURITY DEFINER function needs it. No anon
-- policy is added, so with RLS on, anon cannot read it directly (it doesn't need
-- to — submit_draft runs as definer).
ALTER TABLE wc_players ENABLE ROW LEVEL SECURITY;

-- If you re-import, clear first:  TRUNCATE wc_players;
