-- ============================================================================
-- 04_store_lineup.sql  —  Persist each draft's lineup so the leaderboard can
--                          show the squad behind a score.
-- ============================================================================
-- submit_draft() already RECEIVES the drafted player ids (to recompute the score
-- server-side, see 03_harden_submit_draft.sql) but it threw them away after
-- scoring. This stores them in a new drafts.player_ids column so a leaderboard
-- row can be expanded into the full XI/VI that produced it.
--
-- Run AFTER 03_harden_submit_draft.sql. Existing rows keep player_ids = NULL
-- (their lineup predates this feature); new saves carry the lineup going forward.
--
-- `slots` is a parallel array of slot labels (GK/DEF/MID/FWD/FLEX) in the same
-- order as player_ids. It is DISPLAY-ONLY — the score is still recomputed from
-- player_ids, so a mislabeled slot can never affect ranking.
-- ----------------------------------------------------------------------------

ALTER TABLE drafts ADD COLUMN IF NOT EXISTS player_ids text[];
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS slots      text[];

-- Re-create submit_draft with the SAME validation/scoring as 03, but now also
-- writing the authoritative player_ids onto the row.
CREATE OR REPLACE FUNCTION submit_draft(
  p_player_ids text[],
  p_progress   int,
  p_mode       text   DEFAULT 'easy',
  p_result     text   DEFAULT NULL,
  p_furthest   text   DEFAULT NULL,
  p_draft_type text   DEFAULT 'quick',
  p_slots      text[] DEFAULT NULL
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

  -- store slots only when the array lines up with the ids (else leave NULL)
  INSERT INTO drafts (overall, progress, mode, result, furthest, draft_type, player_ids, slots)
  VALUES (v_overall, v_prog,
          CASE WHEN p_mode = 'hard' THEN 'hard' ELSE 'easy' END,
          p_result, p_furthest, v_dtype, p_player_ids,
          CASE WHEN coalesce(cardinality(p_slots),0) = n_ids THEN p_slots ELSE NULL END)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Drop the older 6-arg signature so PostgREST always resolves to this 7-arg one.
DROP FUNCTION IF EXISTS submit_draft(text[], int, text, text, text, text);

REVOKE ALL ON FUNCTION submit_draft(text[], int, text, text, text, text, text[]) FROM public;
GRANT  EXECUTE ON FUNCTION submit_draft(text[], int, text, text, text, text, text[]) TO anon, authenticated;
