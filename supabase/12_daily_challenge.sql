-- ============================================================================
-- 12_daily_challenge.sql  —  Daily Challenge: results, streaks, leaderboard
-- ============================================================================
-- One themed Full draft per day, the same for everyone (the client seeds the
-- spins from the UTC date). Unlimited replays, but only the FIRST completed
-- attempt of the day is ranked and counts toward the streak.
--
--   • daily_results   — one ranked row per user per UTC day (unique)
--   • submit_daily()   — server-recomputes the score (same anti-forgery as the
--                        main board), records the first attempt only, and updates
--                        the player's streak on profiles
--
-- Run AFTER 11_grant_authenticated_read.sql. Idempotent.
-- ----------------------------------------------------------------------------

create table if not exists daily_results (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,                 -- the UTC challenge day (server-set)
  theme_id    text,                          -- display label of the day's theme
  overall     numeric(5,1) not null,
  progress    int  not null default 0,
  result      text,
  furthest    text,
  player_ids  text[],
  slots       text[],
  name        text,
  flag        text,
  created_at  timestamptz not null default now(),
  unique (user_id, date)                     -- first attempt of the day wins
);

alter table daily_results enable row level security;

-- World-readable board (names come from profiles, server-attributed).
drop policy if exists daily_results_public_read on daily_results;
create policy daily_results_public_read on daily_results
  for select to anon, authenticated using (true);

grant select on table daily_results to anon, authenticated;

-- Board ordering: today's rows by overall, then progress, then earliest.
create index if not exists daily_results_board_idx
  on daily_results (date, overall desc, progress desc, created_at asc);

-- ---------------------------------------------------------------------------
-- submit_daily()  —  record the first attempt + extend the streak
-- ---------------------------------------------------------------------------
-- Mirrors submit_draft scoring (avg(wc_overall) + 0.15·#99, × leadership). The
-- day is the SERVER's UTC date — the client can't backfill another day. Returns
-- the new row id on the first attempt, or NULL if today was already recorded.
create or replace function submit_daily(
  p_player_ids text[],
  p_progress   int,
  p_result     text   default null,
  p_furthest   text   default null,
  p_slots      text[] default null,
  p_theme      text   default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
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
  v_prog     int  := GREATEST(0, LEAST(6, coalesce(p_progress, 0)));
  v_user     uuid := auth.uid();
  v_today    date := (now() at time zone 'utc')::date;
  v_name     text;
  v_flag     text;
  v_id       bigint;
  v_last     date;
  v_cur      int;
  v_long     int;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;

  -- daily is a Full draft → exactly 11 distinct, known players
  IF n_ids <> 11 THEN RAISE EXCEPTION 'daily needs 11 players, got %', n_ids; END IF;
  IF n_ids <> n_distinct THEN RAISE EXCEPTION 'duplicate players not allowed'; END IF;

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

  v_base    := round(v_avg + v_num99 * 0.15, 1);
  v_mult    := power(1.005, v_caps) * power(1.02, v_awards);
  v_overall := round(v_base * v_mult, 1);

  SELECT username::text, nullif(flag,'') INTO v_name, v_flag
  FROM profiles WHERE id = v_user;

  INSERT INTO daily_results (user_id, date, theme_id, overall, progress, result,
                             furthest, player_ids, slots, name, flag)
  VALUES (v_user, v_today, p_theme, v_overall, v_prog, p_result, p_furthest,
          p_player_ids,
          CASE WHEN coalesce(cardinality(p_slots),0) = n_ids THEN p_slots ELSE NULL END,
          v_name, v_flag)
  ON CONFLICT (user_id, date) DO NOTHING
  RETURNING id INTO v_id;

  -- Streak only moves on the FIRST completion of the day (v_id IS NOT NULL).
  IF v_id IS NOT NULL THEN
    SELECT last_played_date, current_streak, longest_streak
      INTO v_last, v_cur, v_long
      FROM profiles WHERE id = v_user FOR UPDATE;
    IF v_last = v_today THEN
      NULL;                                   -- already counted (defensive)
    ELSIF v_last = v_today - 1 THEN
      v_cur := coalesce(v_cur, 0) + 1;        -- consecutive day → extend
    ELSE
      v_cur := 1;                             -- gap (or first ever) → restart
    END IF;
    v_long := GREATEST(coalesce(v_long, 0), v_cur);
    UPDATE profiles
       SET current_streak = v_cur,
           longest_streak = v_long,
           last_played_date = v_today
     WHERE id = v_user;
  END IF;

  RETURN v_id;  -- NULL ⇒ today's attempt was already on record
END;
$$;

REVOKE ALL ON FUNCTION submit_daily(text[], int, text, text, text[], text) FROM public;
GRANT  EXECUTE ON FUNCTION submit_daily(text[], int, text, text, text[], text) TO authenticated;
