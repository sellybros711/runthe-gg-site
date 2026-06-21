-- ============================================================================
-- 15_name_tiers.sql  —  replace equippable cosmetics with an automatic tier
-- ============================================================================
-- Simpler than 14's titles/colours: a player's name TIER is derived from how
-- many achievement badges they've completed (0..23), so it climbs automatically:
--   Bronze 0% · Silver 25% · Gold 50% · Legend 75%  (the client maps badges→tier).
--
-- We store the badge count on the profile so the leaderboard can colour every
-- name with one cheap read instead of recomputing each player's achievements.
--   • profiles.badges        — cached achievement-badge count (0..23)
--   • _my_badges()           — sum of achievement tiers reached (uses 14's helpers)
--   • refresh_my_badges()    — recompute + store for the caller; client calls it
--                              on profile open and after a game.
--
-- The 14 columns equipped_title / name_color are now unused (left in place).
-- Run after 14_cosmetics.sql. Idempotent.
-- ----------------------------------------------------------------------------

alter table profiles add column if not exists badges int not null default 0;

create or replace function _my_badges(uid uuid)
returns int language sql stable security definer set search_path=public as $$
  select coalesce(
      _ach_level('draftsman',m)    + _ach_level('worldbeater',m) + _ach_level('daily',m)
    + _ach_level('galacticos',m)   + _ach_level('globetrotter',m)+ _ach_level('timetraveler',m)
    + _ach_level('underdog',m), 0)
  from (select _my_metrics(uid) as m) x;
$$;

create or replace function refresh_my_badges()
returns int language plpgsql security definer set search_path=public as $$
declare uid uuid := auth.uid(); b int;
begin
  if uid is null then raise exception 'must be signed in'; end if;
  b := _my_badges(uid);
  update profiles set badges = b where id = uid;
  return b;
end;
$$;

revoke all on function refresh_my_badges() from public;
grant  execute on function refresh_my_badges() to authenticated;
-- profiles is already world-readable (badges rides along on the existing grant).
