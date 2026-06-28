-- ============================================================================
-- 26_runtour_board_all_entries.sql — every season & every career is its own row
-- ============================================================================
-- Previously both boards used `distinct on (user_id)`, so a player collapsed to a
-- single best entry. Owner wants EVERY season and EVERY career sim to be its own
-- leaderboard entry (a player can appear many times) so you can see the best of all
-- career sims, plus every career — completed, reset, or abandoned early (a career is
-- just the seasons sharing one career_id; reset/abandoned careers keep the seasons
-- they posted, so they remain ranked).
--
-- The return signatures change (season board +year, career board +golfer_name), so
-- the old functions are dropped first. Idempotent: safe to re-run.
-- Apply in the Supabase SQL editor. No data migration needed — all season rows are
-- already stored individually in runtour_scores.
-- ----------------------------------------------------------------------------

drop function if exists public.runtour_season_board(int);
drop function if exists public.runtour_career_board(int);

-- single-season board: EVERY posted season, ranked by earnings (one row per season)
create or replace function public.runtour_season_board(p_limit int default 100)
returns table(rank int, user_id uuid, display_name text, golfer_name text,
              ovr int, year int, season_earnings bigint, season_net bigint)
language sql stable security definer set search_path = public as $$
  select (row_number() over (order by s.season_earnings desc, s.id))::int as rank,
         s.user_id, s.display_name, s.golfer_name, s.ovr, s.year, s.season_earnings, s.season_net
  from runtour_scores s
  order by s.season_earnings desc, s.id
  limit greatest(1, least(500, coalesce(p_limit, 100)));
$$;

-- career board: EVERY career (seasons grouped by career_id), ranked by total earnings.
-- A player appears once PER career sim — completed, reset, or in-progress. Rows with no
-- career_id (legacy/one-off) are each their own career.
create or replace function public.runtour_career_board(p_limit int default 100)
returns table(rank int, user_id uuid, display_name text, golfer_name text, seasons int,
              career_earnings bigint, career_net bigint, wins int, majors int)
language sql stable security definer set search_path = public as $$
  with per_career as (
    select s.user_id,
           coalesce(s.career_id, 'legacy:'||s.id::text)      as cid,
           max(s.display_name)                               as display_name,
           (array_agg(s.golfer_name order by s.year desc))[1] as golfer_name,
           count(*)::int                                     as seasons,
           sum(s.season_earnings)::bigint                    as career_earnings,
           sum(s.season_net)::bigint                         as career_net,
           sum(s.wins)::int                                  as wins,
           sum(s.majors)::int                                as majors
    from runtour_scores s
    group by s.user_id, coalesce(s.career_id, 'legacy:'||s.id::text)
  )
  select (row_number() over (order by career_earnings desc))::int as rank,
         user_id, display_name, golfer_name, seasons, career_earnings, career_net, wins, majors
  from per_career
  order by career_earnings desc
  limit greatest(1, least(500, coalesce(p_limit, 100)));
$$;

grant execute on function public.runtour_season_board(int) to anon, authenticated;
grant execute on function public.runtour_career_board(int) to anon, authenticated;
