-- ============================================================================
-- 13_profile_stats.sql  —  server-computed profile stats (foundation for the
--                          collectibles / achievements / level system)
-- ============================================================================
-- Everything here is DERIVED from already-server-authoritative data: drafts are
-- score-verified by submit_draft(), daily_results by submit_daily(), and streaks
-- by submit_daily(). So aggregating them server-side gives cheat-resistant stats
-- that later phases (achievements, XP/level, collection) build on.
--
-- get_my_stats() returns one JSON object for the signed-in caller:
--   games, wins (progress=6), finals (>=5), best_overall, avg_overall,
--   full_games, daily_games, daily_wins, legends (distinct players ever drafted),
--   current_streak, longest_streak.
--
-- progress encoding (see client): 0 group · 1 R32 · 2 R16 · 3 QF · 4 SF ·
--                                 5 lost final · 6 champion.
-- Run after 12_daily_challenge.sql. Idempotent.
-- ----------------------------------------------------------------------------

create or replace function get_my_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  uid uuid := auth.uid();
  r   jsonb;
begin
  if uid is null then raise exception 'must be signed in'; end if;

  select jsonb_build_object(
    'games',          (select count(*)                       from drafts where user_id = uid),
    'wins',           (select count(*)                       from drafts where user_id = uid and progress >= 6),
    'finals',         (select count(*)                       from drafts where user_id = uid and progress >= 5),
    'best_overall',   (select coalesce(max(overall), 0)      from drafts where user_id = uid),
    'avg_overall',    (select coalesce(round(avg(overall),1),0) from drafts where user_id = uid),
    'full_games',     (select count(*)                       from drafts where user_id = uid and draft_type = 'full'),
    'daily_games',    (select count(*)                       from daily_results where user_id = uid),
    'daily_wins',     (select count(*)                       from daily_results where user_id = uid and progress >= 6),
    'legends',        (select count(distinct pid) from (
                          select unnest(player_ids) pid from drafts        where user_id = uid
                          union
                          select unnest(player_ids) pid from daily_results where user_id = uid
                       ) s),
    'current_streak', (select coalesce(current_streak, 0)    from profiles where id = uid),
    'longest_streak', (select coalesce(longest_streak, 0)    from profiles where id = uid)
  )
  into r;

  return coalesce(r, '{}'::jsonb);
end;
$$;

revoke all on function get_my_stats() from public;
grant  execute on function get_my_stats() to authenticated;
