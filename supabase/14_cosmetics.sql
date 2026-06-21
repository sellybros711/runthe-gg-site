-- ============================================================================
-- 14_cosmetics.sql  —  equippable Titles + name colours (server-verified)
-- ============================================================================
-- Phase 4. Players unlock titles by completing achievement tiers, and name
-- colours by total badges completed. They equip one of each; the equip RPC
-- recomputes everything server-side and refuses anything not earned.
--
--   • confed_of_code()   — player_id 3-letter prefix → confederation. The prefix
--                          is lossy (CHI=Chile/China, UNI=USA/UAE) so the two
--                          ambiguous codes default to the common country.
--   • _my_metrics()      — all achievement metrics for a user, from the already
--                          score-verified drafts/daily_results/profiles.
--   • get_my_stats()     — v2: now also returns confed/decade breadth + underdog.
--   • _ach_level()       — tiers reached for one achievement (0..4).
--   • set_cosmetics()    — verify + save profiles.equipped_title / name_color.
--
-- Run after 13_profile_stats.sql. Idempotent.
-- ----------------------------------------------------------------------------

alter table profiles
  add column if not exists equipped_title text,
  add column if not exists name_color    text;

-- ---- player_id prefix → confederation -------------------------------------
create or replace function confed_of_code(code text)
returns text language sql immutable as $$
  select case
    when code = any(array['ARG','BOL','BRA','CHI','COL','ECU','PAR','PER','URU']) then 'CONMEBOL'
    when code = any(array['ALG','ANG','CAP','CIV','CMR','DRC','EGY','GHA','MAR','NGA','RSA','SEN','TOG','TUN','ZAI']) then 'CAF'
    when code = any(array['AUS','IRN','IRQ','ISR','JOR','JPN','KOR','KSA','KUW','PRK','QAT','UZB']) then 'AFC'
    when code = any(array['CAN','CRC','CUR','HAI','HON','JAM','MEX','PAN','SLV','TRI','UNI']) then 'CONCACAF'
    when code = any(array['NZL']) then 'OFC'
    else 'UEFA'
  end;
$$;

-- ---- all metrics for a user (server-authoritative) -------------------------
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

create or replace function get_my_stats()
returns jsonb language plpgsql security definer set search_path=public stable as $$
begin
  if auth.uid() is null then raise exception 'must be signed in'; end if;
  return _my_metrics(auth.uid());
end;
$$;

-- ---- tiers reached for one achievement -------------------------------------
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
    else 0 end;
$$;

-- ---- equip a (verified) title + name colour --------------------------------
-- p_title  : '<achId>_<tierIdx>' (e.g. 'draftsman_2'), '' / null to clear.
-- p_color  : 'teal'|'blue'|'purple'|'gold'|'crimson'|'rainbow', '' / null = default.
create or replace function set_cosmetics(p_title text, p_color text)
returns void language plpgsql security definer set search_path=public as $$
declare
  uid uuid := auth.uid();
  mx  jsonb;
  v_ach text;
  v_tier int;
  v_badges int;
  v_req int;
begin
  if uid is null then raise exception 'must be signed in'; end if;
  mx := _my_metrics(uid);

  if p_title is not null and p_title <> '' then
    v_ach  := split_part(p_title,'_',1);
    v_tier := nullif(split_part(p_title,'_',2),'')::int;
    if v_tier is null or _ach_level(v_ach, mx) <= v_tier then
      raise exception 'title not earned: %', p_title;
    end if;
  end if;

  if p_color is not null and p_color <> '' and p_color <> 'default' then
    v_badges := _ach_level('draftsman',mx)+_ach_level('worldbeater',mx)+_ach_level('daily',mx)
              + _ach_level('galacticos',mx)+_ach_level('globetrotter',mx)+_ach_level('timetraveler',mx)
              + _ach_level('underdog',mx);
    v_req := case p_color when 'teal' then 3 when 'blue' then 6 when 'purple' then 10
                          when 'gold' then 15 when 'crimson' then 20 when 'rainbow' then 23 else 999 end;
    if v_badges < v_req then raise exception 'colour not unlocked: %', p_color; end if;
  end if;

  update profiles
     set equipped_title = nullif(p_title,''),
         name_color     = nullif(p_color,'')
   where id = uid;
end;
$$;

revoke all on function set_cosmetics(text, text) from public;
grant  execute on function set_cosmetics(text, text) to authenticated;
grant  execute on function get_my_stats() to authenticated;
-- profiles is already world-readable for the leaderboard; equipped_title and
-- name_color ride along on that existing select grant.
