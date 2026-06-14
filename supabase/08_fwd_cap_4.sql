-- ============================================================================
-- 08_fwd_cap_4.sql  —  Limit forwards to 4 in the Full-draft flex builder
-- ============================================================================
-- Forwards are now capped at 4 (DEF/MID stay at 5). Legal full shapes become:
--   3-5-2, 3-4-3, 3-3-4, 4-4-2, 4-3-3, 4-2-4, 5-3-2, 5-2-3   (FWD 2-4)
-- i.e. 3-2-5 (five forwards) is no longer allowed. DEF 3-5, MID 2-5, FWD 2-4,
-- outfield = 10. Scoring is unchanged. Quick-draft validation is unchanged.
--
-- Run AFTER 07_full_flex_shape.sql (this only replaces the function body).
-- ----------------------------------------------------------------------------

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
  IF v_dtype = 'full' THEN
    IF n_ids <> 11 THEN RAISE EXCEPTION 'full draft needs 11 players, got %', n_ids; END IF;
  ELSE
    IF n_ids <> 6  THEN RAISE EXCEPTION 'quick draft needs 6 players, got %',  n_ids; END IF;
  END IF;
  IF n_ids <> n_distinct THEN RAISE EXCEPTION 'duplicate players not allowed'; END IF;

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

  IF n_gk <> 1 THEN RAISE EXCEPTION 'squad must have exactly 1 GK'; END IF;
  IF v_dtype = 'full' THEN
    -- flex builder: DEF 3-5, MID 2-5, FWD 2-4, outfield = 10
    IF n_def NOT BETWEEN 3 AND 5 OR n_mid NOT BETWEEN 2 AND 5
       OR n_fwd NOT BETWEEN 2 AND 4 OR (n_def + n_mid + n_fwd) <> 10 THEN
      RAISE EXCEPTION 'invalid formation shape D% M% F%', n_def, n_mid, n_fwd;
    END IF;
  ELSE
    IF n_def <> 2 OR n_mid NOT BETWEEN 1 AND 2 OR n_fwd NOT BETWEEN 1 AND 2
       OR (n_mid + n_fwd) <> 3 THEN
      RAISE EXCEPTION 'invalid quick squad shape D% M% F%', n_def, n_mid, n_fwd;
    END IF;
  END IF;

  v_base    := round(v_avg + v_num99 * 0.15, 1);
  v_mult    := power(1.005, v_caps) * power(1.02, v_awards);
  v_overall := round(v_base * v_mult, 1);

  INSERT INTO drafts (overall, progress, mode, result, furthest, draft_type, player_ids, slots)
  VALUES (v_overall, v_prog,
          CASE WHEN p_mode = 'hard' THEN 'hard' ELSE 'easy' END,
          p_result, p_furthest, v_dtype, p_player_ids,
          CASE WHEN coalesce(cardinality(p_slots),0) = n_ids THEN p_slots ELSE NULL END)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION submit_draft(text[], int, text, text, text, text, text[]) FROM public;
GRANT  EXECUTE ON FUNCTION submit_draft(text[], int, text, text, text, text, text[]) TO anon, authenticated;
