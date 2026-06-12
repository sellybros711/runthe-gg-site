-- ============================================================================
-- 05_friendly_challenges.sql  —  Friendly mode via short share links
-- ============================================================================
-- The old Friendly link embedded the WHOLE lineup in the URL as base64. Those
-- links were enormous and got truncated/mangled by iMessage, WhatsApp, etc., so
-- recipients landed on a broken page. This stores the challenge server-side and
-- hands out a short code, e.g.  https://runthe.gg/?c=AB12CD
--
-- All access is through SECURITY DEFINER functions; the tables have RLS on with
-- no policies, so anon can't read/write them directly — only via these RPCs.
--
-- Run any time (independent of the leaderboard migrations).
-- ----------------------------------------------------------------------------

-- challenge store: a short code → the challenger's encoded lineup payload
CREATE TABLE IF NOT EXISTS friendly_challenges (
  code       text PRIMARY KEY,
  payload    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE friendly_challenges ENABLE ROW LEVEL SECURITY;

-- global "how many friendlies have been played" counter
CREATE TABLE IF NOT EXISTS friendly_stats (
  id           int PRIMARY KEY,
  total_played int NOT NULL DEFAULT 0,
  last_played  timestamptz
);
ALTER TABLE friendly_stats ENABLE ROW LEVEL SECURITY;
INSERT INTO friendly_stats(id, total_played) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;

-- Create a challenge: stores the payload under a fresh 6-char code and returns
-- the code. Uses an unambiguous alphabet (no 0/O/1/I/L) and retries on the rare
-- collision.
CREATE OR REPLACE FUNCTION create_friendly_challenge(p_payload jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code     text;
  v_try      int := 0;
  i          int;
BEGIN
  -- minimal sanity check: the payload must carry the lineup array
  IF p_payload IS NULL OR jsonb_typeof(p_payload->'p') <> 'array' THEN
    RAISE EXCEPTION 'invalid challenge payload';
  END IF;

  LOOP
    v_try := v_try + 1;
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_alphabet, 1 + floor(random()*length(v_alphabet))::int, 1);
    END LOOP;
    BEGIN
      INSERT INTO friendly_challenges(code, payload) VALUES (v_code, p_payload);
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      IF v_try > 8 THEN RAISE EXCEPTION 'could not allocate a challenge code'; END IF;
    END;
  END LOOP;
END;
$$;

-- Fetch a challenge payload by code (case-insensitive). NULL if it doesn't exist.
CREATE OR REPLACE FUNCTION get_friendly_challenge(p_code text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT payload FROM friendly_challenges WHERE code = upper(p_code);
$$;

-- Bump the global friendly-match counter (called when a match finishes).
CREATE OR REPLACE FUNCTION increment_friendly_played()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO friendly_stats(id, total_played, last_played) VALUES (1, 1, now())
  ON CONFLICT (id) DO UPDATE
    SET total_played = friendly_stats.total_played + 1,
        last_played  = now();
END;
$$;

REVOKE ALL ON FUNCTION create_friendly_challenge(jsonb)  FROM public;
REVOKE ALL ON FUNCTION get_friendly_challenge(text)       FROM public;
REVOKE ALL ON FUNCTION increment_friendly_played()        FROM public;
GRANT  EXECUTE ON FUNCTION create_friendly_challenge(jsonb) TO anon, authenticated;
GRANT  EXECUTE ON FUNCTION get_friendly_challenge(text)     TO anon, authenticated;
GRANT  EXECUTE ON FUNCTION increment_friendly_played()      TO anon, authenticated;

-- Optional housekeeping: drop challenges older than 7 days. Run manually or
-- schedule via pg_cron if available.
--   DELETE FROM friendly_challenges WHERE created_at < now() - interval '7 days';
