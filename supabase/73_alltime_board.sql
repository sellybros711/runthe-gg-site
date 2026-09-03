-- Run The Arcade — all-time leaderboard (per game): each player's BEST result
-- ever, with the date they set it. Run once in the Supabase SQL editor
-- (after 52_grid_daily.sql). Idempotent — safe to re-run.
--
-- The pre-game screen (cardholders) shows an all-time leaderboard for every
-- game. Unlike grid_streak_board (consecutive-days streak) this ranks the single
-- best PLAYED result: run games (table/oddone/career/rankit/almamater/guess/
-- match) surface the longest run, the timed games (crossword/wordsearch) the
-- fastest clean time. grid_runs already collapses both into one ascending
-- `score`, so one function serves every game with no per-game branch.
--
-- DISTINCT ON (user_id) keeps one row per player — their best score, earliest
-- solve breaking a tie — and the outer query ranks those bests. display_name is
-- read live from profiles (never trusting the row's stored copy), so a rename
-- shows through. game-key agnostic; no game list hardcoded.

create or replace function public.grid_alltime_board(p_game text, p_limit int default 10)
returns table(display_name text, run_len smallint, base_seconds integer,
              flawless boolean, played_on date, score integer)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(p.username, ''), 'Player') as display_name,
         best.run_len,
         best.base_seconds,
         best.flawless,
         best.puzzle_date as played_on,
         best.score
  from (
    select distinct on (r.user_id)
           r.user_id, r.run_len, r.base_seconds, r.flawless, r.puzzle_date, r.score
    from grid_runs r
    where r.game = p_game
    order by r.user_id, r.score asc, r.created_at asc
  ) best
  left join profiles p on p.id = best.user_id
  order by best.score asc, best.puzzle_date asc
  limit least(greatest(coalesce(p_limit, 10), 1), 100);
$$;

revoke all on function public.grid_alltime_board(text, int) from public;
grant execute on function public.grid_alltime_board(text, int) to anon, authenticated;
