-- ============================================================================
-- 19_quick_hard_badges.sql  —  Quick Draw + Hard Mode achievements
-- ============================================================================
-- Quick Draw  — complete Quick Draft (6-player) tournaments. Derived from
--               existing metrics (games - full_games); no new metric needed.
-- Hard Mode   — win the World Cup on Hard difficulty. Needs a new hard_wins
--               metric, added to _my_metrics() (get_my_stats() returns it too,
--               since it just wraps _my_metrics).
--
-- As with 18, the client already computes these for the signed-in player's own
-- profile; this keeps the leaderboard's per-player badge tier in sync and
-- backfills everyone. Run after 18_more_badges.sql. Idempotent.
-- ----------------------------------------------------------------------------

-- _my_metrics(): add hard_wins (World Cup wins on Hard). Full redefinition.
create or replace function _my_metrics(uid uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  v_confed int;
  v_decade int;
begin
  v_confed := greatest(
    coalesce((select max(c) from (
      select count(distinct confed_of_code(split_part(pid,'_',1))) c
      from drafts d, unnest(d.player_ids) pid where d.user_id=uid group by d.id) a),0),
    coalesce((select max(c) from (
      select count(distinct confed_of_code(split_part(pid,'_',1))) c
      from daily_results dr, unnest(dr.player_ids) pid where dr.user_id=uid group by dr.id) b),0));
  v_decade := greatest(
    coalesce((select max(c) from (
      select count(distinct (nullif(split_part(pid,'_',2),'')::int/10)) c
      from drafts d, unnest(d.player_ids) pid where d.user_id=uid group by d.id) a),0),
    coalesce((select max(c) from (
      select count(distinct (nullif(split_part(pid,'_',2),'')::int/10)) c
      from daily_results dr, unnest(dr.player_ids) pid where dr.user_id=uid group by dr.id) b),0));

  return jsonb_build_object(
    'games',          (select count(*) from drafts where user_id=uid),
    'wins',           (select count(*) from drafts where user_id=uid and progress>=6),
    'finals',         (select count(*) from drafts where user_id=uid and progress>=5),
    'best_overall',   (select coalesce(max(overall),0) from drafts where user_id=uid),
    'avg_overall',    (select coalesce(round(avg(overall),1),0) from drafts where user_id=uid),
    'full_games',     (select count(*) from drafts where user_id=uid and draft_type='full'),
    'hard_wins',      (select count(*) from drafts where user_id=uid and mode='hard' and progress>=6),
    'daily_games',    (select count(*) from daily_results where user_id=uid),
    'daily_wins',     (select count(*) from daily_results where user_id=uid and progress>=6),
    'legends',        (select count(distinct pid) from (
                          select unnest(player_ids) pid from drafts        where user_id=uid
                          union select unnest(player_ids) pid from daily_results where user_id=uid) s),
    'current_streak', (select coalesce(current_streak,0) from profiles where id=uid),
    'longest_streak', (select coalesce(longest_streak,0) from profiles where id=uid),
    'confed_breadth', v_confed,
    'decade_breadth', v_decade,
    'underdog_progress', coalesce((select max(progress) from (
                          select progress from drafts where user_id=uid and overall>0 and overall<=85
                          union all
                          select progress from daily_results where user_id=uid and overall>0 and overall<=85) u), -1)
  );
end;
$$;

-- _ach_level(): add quickdraw (games-full_games) + hardmode (hard_wins).
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
    when 'quickdraw'    then (case when ((mx->>'games')::int-(mx->>'full_games')::int)>=150 then 3 when ((mx->>'games')::int-(mx->>'full_games')::int)>=50 then 2 when ((mx->>'games')::int-(mx->>'full_games')::int)>=10 then 1 else 0 end)
    when 'hardmode'     then (case when (mx->>'hard_wins')::int>=15 then 3 when (mx->>'hard_wins')::int>=5 then 2 when (mx->>'hard_wins')::int>=1 then 1 else 0 end)
    else 0 end;
$$;

-- _my_badges(): include the two new achievements in the total.
create or replace function _my_badges(uid uuid)
returns int language sql stable security definer set search_path=public as $$
  select coalesce(
      _ach_level('draftsman',m)    + _ach_level('worldbeater',m) + _ach_level('daily',m)
    + _ach_level('galacticos',m)   + _ach_level('globetrotter',m)+ _ach_level('timetraveler',m)
    + _ach_level('underdog',m)
    + _ach_level('collector',m)    + _ach_level('finalist',m)    + _ach_level('dailyace',m)
    + _ach_level('dailygrind',m)   + _ach_level('fullxi',m)
    + _ach_level('quickdraw',m)    + _ach_level('hardmode',m), 0)
  from (select _my_metrics(uid) as m) x;
$$;

-- Backfill everyone so leaderboard tiers update right away.
update profiles p set badges = _my_badges(p.id);
