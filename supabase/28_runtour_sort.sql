-- ============================================================================
-- 28_runtour_sort.sql — sort the season & career boards by ANY stat category
-- ============================================================================
-- Lets the client rank EITHER board by earnings, profit, wins, majors, OVR /
-- seasons, or Tour Rep, so a player can top many different leaderboards. Each
-- board takes a p_sort key and orders by it (top-N is fetched BY that stat, not
-- just earnings), with earnings + id as stable tiebreakers. The season board now
-- also returns wins + majors. Return signatures change, so the old functions are
-- dropped first. Idempotent: safe to re-run. Apply in the Supabase SQL editor.
-- ----------------------------------------------------------------------------

drop function if exists public.runtour_season_board(int);
drop function if exists public.runtour_season_board(int,text);
drop function if exists public.runtour_career_board(int);
drop function if exists public.runtour_career_board(int,text);

-- single-season board: every posted season, ranked by the chosen stat
create or replace function public.runtour_season_board(p_limit int default 100, p_sort text default 'earnings')
returns table(rank int, user_id uuid, display_name text, golfer_name text,
              ovr int, year int, season_earnings bigint, season_net bigint, wins int, majors int, rep_pts int)
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
  )
  select (row_number() over (order by sortk desc, season_earnings desc, id))::int as rank,
         user_id, display_name, golfer_name, ovr, year, season_earnings, season_net, wins, majors, rep_pts
  from ranked
  order by sortk desc, season_earnings desc, id
  limit greatest(1, least(500, coalesce(p_limit, 100)));
$$;

-- career board: every career (seasons grouped by career_id), ranked by the chosen stat
create or replace function public.runtour_career_board(p_limit int default 100, p_sort text default 'earnings')
returns table(rank int, user_id uuid, display_name text, golfer_name text, seasons int,
              career_earnings bigint, career_net bigint, wins int, majors int, rep_pts int)
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
  )
  select (row_number() over (order by sortk desc, career_earnings desc))::int as rank,
         user_id, display_name, golfer_name, seasons, career_earnings, career_net, wins, majors, rep_pts
  from joined
  order by sortk desc, career_earnings desc
  limit greatest(1, least(500, coalesce(p_limit, 100)));
$$;

grant execute on function public.runtour_season_board(int,text) to anon, authenticated;
grant execute on function public.runtour_career_board(int,text) to anon, authenticated;
