-- ============================================================================
-- 38_runtour_board_dir.sql — true "bottom N" leaderboard (top 200 AND bottom 200)
-- ============================================================================
-- Before this, both boards only ever returned the TOP p_limit rows ordered by
-- the chosen stat (desc), and the client faked "low → high" by reversing that
-- fetched slice — so low→high showed the lowest of the TOP 200, not the true
-- lowest in the database. This adds a `p_dir` param:
--   p_dir = 'desc' (default) → the top N (rank 1 = best), exactly as before.
--   p_dir = 'asc'            → the bottom N (the genuinely worst N rows).
-- The `rank` returned is ALWAYS the true position from the top (computed over
-- every posted row), so a bottom-board row shows its real global rank (e.g. the
-- single worst season shows rank = total count), not a misleading "1".
-- Backward compatible: p_dir defaults to 'desc', and because it has a default,
-- existing 2-arg callers (runtour_season_board(200,'earnings')) still resolve to
-- this function unchanged. Apply in the Supabase SQL editor AFTER
-- 31_runtour_archetype.sql. Idempotent: safe to re-run.
-- ----------------------------------------------------------------------------

drop function if exists public.runtour_season_board(int,text);
drop function if exists public.runtour_career_board(int,text);
drop function if exists public.runtour_season_board(int,text,text);
drop function if exists public.runtour_career_board(int,text,text);

create or replace function public.runtour_season_board(
    p_limit int default 100, p_sort text default 'earnings', p_dir text default 'desc')
returns table(rank int, user_id uuid, display_name text, golfer_name text,
              ovr int, year int, season_earnings bigint, season_net bigint, wins int, majors int,
              rep_pts int, skills jsonb)
language sql stable security definer set search_path = public as $$
  with ranked as (
    select s.*,
      (case lower(coalesce(p_sort,'earnings'))
         when 'net'     then s.season_net::numeric
         when 'wins'    then s.wins::numeric
         when 'majors'  then s.majors::numeric
         when 'ovr'     then s.ovr::numeric
         when 'rep'     then s.rep_pts::numeric
         else                s.season_earnings::numeric
       end) as sortk
    from runtour_scores s
  ), numbered as (
    select (row_number() over (order by sortk desc, season_earnings desc, id))::int as rank,
           user_id, display_name, golfer_name, ovr, year, season_earnings, season_net, wins, majors, rep_pts, skills
    from ranked
  )
  select rank, user_id, display_name, golfer_name, ovr, year, season_earnings, season_net, wins, majors, rep_pts, skills
  from numbered
  -- desc → best first (rank asc); asc → worst first (rank desc), i.e. the true bottom N
  order by (case when lower(coalesce(p_dir,'desc'))='asc' then -rank else rank end)
  limit greatest(1, least(500, coalesce(p_limit, 100)));
$$;

create or replace function public.runtour_career_board(
    p_limit int default 100, p_sort text default 'earnings', p_dir text default 'desc')
returns table(rank int, user_id uuid, display_name text, golfer_name text, seasons int,
              career_earnings bigint, career_net bigint, wins int, majors int, rep_pts int, skills jsonb)
language sql stable security definer set search_path = public as $$
  with per_career as (
    select s.user_id,
           coalesce(s.career_id, 'legacy:'||s.id::text)      as cid,
           max(s.display_name)                               as display_name,
           (array_agg(s.golfer_name order by s.year desc))[1] as golfer_name,
           (array_agg(s.skills order by s.year desc))[1]      as skills,
           count(*)::int                                     as seasons,
           sum(s.season_earnings)::bigint                    as career_earnings,
           sum(s.season_net)::bigint                         as career_net,
           sum(s.wins)::int                                  as wins,
           sum(s.majors)::int                                as majors
    from runtour_scores s
    group by s.user_id, coalesce(s.career_id, 'legacy:'||s.id::text)
  ), urep as ( select user_id, max(rep_pts) as rep_pts from runtour_scores group by user_id ),
  joined as (
    select pc.*, coalesce(u.rep_pts,0) as rep_pts,
      (case lower(coalesce(p_sort,'earnings'))
         when 'net'     then pc.career_net::numeric
         when 'wins'    then pc.wins::numeric
         when 'majors'  then pc.majors::numeric
         when 'seasons' then pc.seasons::numeric
         when 'rep'     then coalesce(u.rep_pts,0)::numeric
         else                pc.career_earnings::numeric
       end) as sortk
    from per_career pc left join urep u on u.user_id = pc.user_id
  ), numbered as (
    select (row_number() over (order by sortk desc, career_earnings desc))::int as rank,
           user_id, display_name, golfer_name, seasons, career_earnings, career_net, wins, majors, rep_pts, skills
    from joined
  )
  select rank, user_id, display_name, golfer_name, seasons, career_earnings, career_net, wins, majors, rep_pts, skills
  from numbered
  order by (case when lower(coalesce(p_dir,'desc'))='asc' then -rank else rank end)
  limit greatest(1, least(500, coalesce(p_limit, 100)));
$$;

grant execute on function public.runtour_season_board(int,text,text) to anon, authenticated;
grant execute on function public.runtour_career_board(int,text,text) to anon, authenticated;
