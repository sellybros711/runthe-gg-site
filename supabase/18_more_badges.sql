-- ============================================================================
-- 18_more_badges.sql  —  five new achievements (server badge counting)
-- ============================================================================
-- Adds Collector, Finalist, Daily Ace, Daily Grinder and Full XI to the
-- server-side badge math so every player's cached profiles.badges (which colours
-- their name tier on the leaderboard) includes the new tiers. All five read
-- metrics _my_metrics() already returns (legends, finals, daily_wins,
-- daily_games, full_games) — no metric changes needed.
--
-- The CLIENT already computes these for the signed-in player's own profile, so
-- this migration only keeps the leaderboard's per-player tier in sync. Players'
-- badges refresh automatically (profile open / after a game via
-- refresh_my_badges); the backfill at the bottom updates everyone immediately.
--
-- Run after 15_name_tiers.sql. Idempotent.
-- ----------------------------------------------------------------------------

-- tiers reached for one achievement (0..4) — now including the five new ones
create or replace function _ach_level(ach text, mx jsonb)
returns int language sql immutable as $$
  select case ach
    when 'draftsman'    then (case when (mx->>'games')::int>=500 then 4 when (mx->>'games')::int>=200 then 3 when (mx->>'games')::int>=100 then 2 when (mx->>'games')::int>=50 then 1 else 0 end)
    when 'worldbeater'  then (case when (mx->>'wins')::int>=50 then 3 when (mx->>'wins')::int>=10 then 2 when (mx->>'wins')::int>=1 then 1 else 0 end)
    when 'daily'        then (case when (mx->>'longest_streak')::int>=100 then 3 when (mx->>'longest_streak')::int>=30 then 2 when (mx->>'longest_streak')::int>=7 then 1 else 0 end)
    when 'galacticos'   then (case when (mx->>'best_overall')::numeric>=105 then 3 when (mx->>'best_overall')::numeric>=100 then 2 when (mx->>'best_overall')::numeric>=95 then 1 else 0 end)
    when 'globetrotter' then (case when (mx->>'confed_breadth')::int>=6 then 3 when (mx->>'confed_breadth')::int>=5 then 2 when (mx->>'confed_breadth')::int>=4 then 1 else 0 end)
    when 'timetraveler' then (case when (mx->>'decade_breadth')::int>=7 then 3 when (mx->>'decade_breadth')::int>=6 then 2 when (mx->>'decade_breadth')::int>=5 then 1 else 0 end)
    when 'underdog'     then (case when (mx->>'underdog_progress')::int>=6 then 4 when (mx->>'underdog_progress')::int>=4 then 3 when (mx->>'underdog_progress')::int>=3 then 2 when (mx->>'underdog_progress')::int>=2 then 1 else 0 end)
    when 'collector'    then (case when (mx->>'legends')::int>=600 then 4 when (mx->>'legends')::int>=350 then 3 when (mx->>'legends')::int>=150 then 2 when (mx->>'legends')::int>=50 then 1 else 0 end)
    when 'finalist'     then (case when (mx->>'finals')::int>=75 then 3 when (mx->>'finals')::int>=25 then 2 when (mx->>'finals')::int>=5 then 1 else 0 end)
    when 'dailyace'     then (case when (mx->>'daily_wins')::int>=30 then 3 when (mx->>'daily_wins')::int>=10 then 2 when (mx->>'daily_wins')::int>=1 then 1 else 0 end)
    when 'dailygrind'   then (case when (mx->>'daily_games')::int>=150 then 3 when (mx->>'daily_games')::int>=50 then 2 when (mx->>'daily_games')::int>=10 then 1 else 0 end)
    when 'fullxi'       then (case when (mx->>'full_games')::int>=150 then 3 when (mx->>'full_games')::int>=50 then 2 when (mx->>'full_games')::int>=10 then 1 else 0 end)
    else 0 end;
$$;

-- total badges = sum of tiers reached across ALL achievements (old + new)
create or replace function _my_badges(uid uuid)
returns int language sql stable security definer set search_path=public as $$
  select coalesce(
      _ach_level('draftsman',m)    + _ach_level('worldbeater',m) + _ach_level('daily',m)
    + _ach_level('galacticos',m)   + _ach_level('globetrotter',m)+ _ach_level('timetraveler',m)
    + _ach_level('underdog',m)
    + _ach_level('collector',m)    + _ach_level('finalist',m)    + _ach_level('dailyace',m)
    + _ach_level('dailygrind',m)   + _ach_level('fullxi',m), 0)
  from (select _my_metrics(uid) as m) x;
$$;

-- Backfill every existing profile so leaderboard name tiers update right away.
update profiles p set badges = _my_badges(p.id);
