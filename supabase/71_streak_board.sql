-- Run The Arcade — all-time best-streak leaderboard (per game)
-- Run once in the Supabase SQL editor (after 52_grid_daily.sql).
--
-- The pre-game screen (cardholders) shows an all-time leaderboard for each
-- streak game. grid_streaks already stores best_streak per user per game and is
-- publicly readable, but the display name lives in profiles. This SECURITY
-- DEFINER function joins the two and returns the top best streaks for one game,
-- newest tie-break last. It is game-key agnostic (no game list hardcoded).

create or replace function public.grid_streak_board(p_game text, p_limit int default 10)
returns table(display_name text, best_streak int, current_streak int)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(p.username, ''), 'Player') as display_name,
         s.best_streak,
         s.streak as current_streak
  from grid_streaks s
  left join profiles p on p.id = s.user_id
  where s.game = p_game
    and s.best_streak > 0
  order by s.best_streak desc, s.streak desc, s.updated_at asc
  limit least(greatest(coalesce(p_limit, 10), 1), 100);
$$;

revoke all on function public.grid_streak_board(text, int) from public;
grant execute on function public.grid_streak_board(text, int) to anon, authenticated;
