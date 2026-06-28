-- RunTheTour data reset — clean slate for the achievements relaunch.
-- Run in the Supabase SQL editor. Affects ONLY the runtour_* tables (the golf game);
-- the other game's tables are untouched. This clears all leaderboards, synced stats,
-- and daily/course-record history for every user. Client-side local data is wiped
-- separately by the in-game RESET_EPOCH bump on each player's next load.
do $$
begin
  if to_regclass('public.runtour_scores')       is not null then truncate table public.runtour_scores; end if;
  if to_regclass('public.runtour_stats')        is not null then truncate table public.runtour_stats; end if;
  if to_regclass('public.runtour_daily_scores') is not null then truncate table public.runtour_daily_scores; end if;
end $$;
