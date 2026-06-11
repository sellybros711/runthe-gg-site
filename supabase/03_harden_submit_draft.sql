-- ============================================================================
-- 03_harden_submit_draft.sql  —  Server-side score recomputation (anti-forgery)
-- ============================================================================
-- Replaces the old submit_draft(p_overall,...) — which TRUSTED a browser-supplied
-- score — with one that takes the drafted player_ids and RECOMPUTES the team
-- overall from wc_players using the exact gameLogic formula. The client number is
-- never stored. A forger can no longer post an arbitrary 99; the most they can
-- claim is a structurally-valid squad whose score is bounded by real ratings
-- (~98.8 Quick / ~99.1 Full at the absolute cherry-pick ceiling).
--
-- Run AFTER 02_wc_players.sql and the CSV import.
-- ----------------------------------------------------------------------------

-- Records which draft size this row was (Quick=6 / Full=11). Harmless if it
-- already exists from the earlier feature work.
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS draft_type text NOT NULL DEFAULT 'quick';
UPDATE drafts SET draft_type = 'quick' WHERE draft_type IS NULL;

-- Drop the old, score-trusting signature so it can never be called again.
DROP FUNCTION IF EXISTS submit_draft(numeric, int, text, text, text);
DROP FUNCTION IF EXISTS submit_draft(numeric, integer, text, text, text);

CREATE OR REPLACE FUNCTION submit_draft(
  p_player_ids text[],
  p_progress   int,
  p_mode       text   DEFAULT 'easy',
  p_result     text   DEFAULT NULL,
  p_furthest   text   DEFAULT NULL,
  p_draft_type text   DEFAULT 'quick'
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n_ids      int := coalesce(cardinality(p_player_ids), 0);
  n_distinct int := coalesce(cardinality(ARRAY(SELECT DISTINCT unnest(p_player_ids))), 0);
  n_found    int;
  n_gk  int; n_def int; n_mid int; n_fwd int;
  v_avg      numeric;
  v_num99    int;
  v_caps     int;
  v_awards   int;
  v_base     numeric;
  v_mult     numeric;
  v_overall  numeric;
  v_dtype    text := CASE WHEN p_draft_type = 'full' THEN 'full' ELSE 'quick' END;
  v_prog     int  := GREATEST(0, LEAST(6, coalesce(p_progress, 0)));
  v_id       bigint;
BEGIN
  -- ---- structural validation (reject anything that isn't a real squad) ----
  IF v_dtype = 'full' THEN
    IF n_ids <> 11 THEN RAISE EXCEPTION 'full draft needs 11 players, got %', n_ids; END IF;
  ELSE
    IF n_ids <> 6  THEN RAISE EXCEPTION 'quick draft needs 6 players, got %',  n_ids; END IF;
  END IF;
  IF n_ids <> n_distinct THEN RAISE EXCEPTION 'duplicate players not allowed'; END IF;

  -- ---- pull authoritative ratings for the submitted ids ----
  SELECT count(*),
         count(*) FILTER (WHERE position = 'GK'),
         count(*) FILTER (WHERE position = 'DEF'),
         count(*) FILTER (WHERE position = 'MID'),
         count(*) FILTER (WHERE position = 'FWD'),
         avg(wc_overall),
         count(*) FILTER (WHERE wc_overall >= 99),
         count(*) FILTER (WHERE is_captain),
         coalesce(sum(coalesce(array_length(string_to_array(nullif(award,''),'|'),1),0)),0)
    INTO n_found, n_gk, n_def, n_mid, n_fwd, v_avg, v_num99, v_caps, v_awards
  FROM wc_players
  WHERE player_id = ANY(p_player_ids);

  IF n_found <> n_ids THEN
    RAISE EXCEPTION 'unknown player id(s): % of % matched', n_found, n_ids;
  END IF;

  -- exactly one keeper, and a plausible outfield shape for the draft size
  IF n_gk <> 1 THEN RAISE EXCEPTION 'squad must have exactly 1 GK'; END IF;
  IF v_dtype = 'full' THEN
    IF n_def NOT BETWEEN 3 AND 5 OR n_fwd NOT BETWEEN 1 AND 3
       OR n_mid NOT BETWEEN 3 AND 5 OR (n_def + n_mid + n_fwd) <> 10 THEN
      RAISE EXCEPTION 'invalid formation shape D% M% F%', n_def, n_mid, n_fwd;
    END IF;
  ELSE
    -- Quick: GK + 2 DEF + (MID/FWD)x3 incl. a FLEX → 2 DEF, 1-2 MID, 1-2 FWD
    IF n_def <> 2 OR n_mid NOT BETWEEN 1 AND 2 OR n_fwd NOT BETWEEN 1 AND 2
       OR (n_mid + n_fwd) <> 3 THEN
      RAISE EXCEPTION 'invalid quick squad shape D% M% F%', n_def, n_mid, n_fwd;
    END IF;
  END IF;

  -- ---- recompute the score (mirrors gameLogic computeResult + leadership) ----
  v_base    := round(v_avg + v_num99 * 0.15, 1);              -- uncapped — can exceed 100
  v_mult    := power(1.005, v_caps) * power(1.02, v_awards);   -- captain ×1.005, award ×1.02 (match client)
  v_overall := round(v_base * v_mult, 1);                      -- uncapped — can exceed 100

  INSERT INTO drafts (overall, progress, mode, result, furthest, draft_type)
  VALUES (v_overall, v_prog,
          CASE WHEN p_mode = 'hard' THEN 'hard' ELSE 'easy' END,
          p_result, p_furthest, v_dtype)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- anon may execute the function (it inserts as definer) but still has no direct
-- INSERT/UPDATE/DELETE on drafts, and no read on wc_players.
REVOKE ALL ON FUNCTION submit_draft(text[], int, text, text, text, text) FROM public;
GRANT  EXECUTE ON FUNCTION submit_draft(text[], int, text, text, text, text) TO anon, authenticated;
