-- ============================================================================
-- 09_record_all_completed.sql  —  Never drop a completed draft
-- ============================================================================
-- Reports came in that completed drafts were missing from the leaderboard. The
-- previous submit_draft() (03/04/07/08) RAISEd — and therefore inserted nothing —
-- whenever a squad's positional shape didn't match a hard-coded formation range
-- (e.g. a future client formation the DB hadn't been migrated for, or a GK count
-- mismatch). A raised exception means the row is never written, so the player's
-- score silently never reaches the board.
--
-- Policy change: a completed draft is ALWAYS recorded. We keep the checks that
-- are required to compute a trustworthy score and nothing more:
--   • correct player COUNT for the draft type (6 Quick / 11 Full)
--   • no DUPLICATE players (else you could stack one 99-rated player six times)
--   • every id KNOWN in wc_players (so the score is recomputed from real ratings)
-- The score stays server-recomputed (anti-forgery intact: avg(wc_overall) +
-- 0.15·#99, × leadership), and it is formation-independent — so dropping the
-- shape RAISEs cannot let anyone forge a higher number. It only stops valid,
-- finished squads from being thrown away.
--
-- Run AFTER 08_fwd_cap_4.sql (this only replaces the function body).
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
  -- ---- minimal validation: only what's needed to score honestly ----
  IF v_dtype = 'full' THEN
    IF n_ids <> 11 THEN RAISE EXCEPTION 'full draft needs 11 players, got %', n_ids; END IF;
  ELSE
    IF n_ids <> 6  THEN RAISE EXCEPTION 'quick draft needs 6 players, got %',  n_ids; END IF;
  END IF;
  IF n_ids <> n_distinct THEN RAISE EXCEPTION 'duplicate players not allowed'; END IF;

  -- ---- pull authoritative ratings for the submitted ids ----
  SELECT count(*),
         avg(wc_overall),
         count(*) FILTER (WHERE wc_overall >= 99),
         count(*) FILTER (WHERE is_captain),
         coalesce(sum(coalesce(array_length(string_to_array(nullif(award,''),'|'),1),0)),0)
    INTO n_found, v_avg, v_num99, v_caps, v_awards
  FROM wc_players
  WHERE player_id = ANY(p_player_ids);

  IF n_found <> n_ids THEN
    RAISE EXCEPTION 'unknown player id(s): % of % matched', n_found, n_ids;
  END IF;

  -- NOTE: positional shape (GK count, DEF/MID/FWD ranges) is intentionally NOT
  -- validated here. The client enforces a legal formation before a draft can be
  -- completed; the server only needs a real, countable, non-duplicated squad to
  -- compute a trustworthy score. This guarantees every completed draft is saved
  -- even if client formation rules change ahead of a DB migration.

  -- ---- recompute the score (formation-independent) ----
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
