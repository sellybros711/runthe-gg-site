-- ============================================================================
-- 58_runtour_board_scoped.sql — date-scoped Single-Season & Career boards.
-- ============================================================================
-- Adds an optional p_since timestamptz to runtour_season_board and
-- runtour_career_board. When non-null, only runtour_scores rows posted at or
-- after p_since are counted (the client passes the ET day start for "Today" and
-- the week block start for "This week"); null = the existing all-time board.
--
-- Backward compatible: p_since is a new trailing defaulted arg, so a 3-arg call
-- still resolves to the new function (default null → all-time). The old 3-arg
-- overloads from migration 52 are DROPPED first so a 3-arg call is unambiguous
-- and the return type can be redefined cleanly (it is unchanged here). The client
-- tries WITH p_since first and falls back to WITHOUT on error, so deploying the
-- client before this migration is safe (windows just show the all-time board).
-- Apply in the Supabase SQL editor AFTER 57_runtour_season_rank_scoped.sql. Idempotent.
-- ----------------------------------------------------------------------------

drop function if exists public.runtour_season_board(int,text,text);
drop function if exists public.runtour_career_board(int,text,text);
drop function if exists public.runtour_season_board(int,text,text,timestamptz);
drop function if exists public.runtour_career_board(int,text,text,timestamptz);

create or replace function public.runtour_season_board(
    p_limit int default 100, p_sort text default 'earnings', p_dir text default 'desc',
    p_since timestamptz default null)
returns table(rank int, user_id uuid, display_name text, golfer_name text,
              ovr int, year int, season_earnings bigint, season_net bigint, wins int, majors int,
              rep_pts int, skills jsonb, followers bigint, look jsonb)
language sql stable security definer set search_path = public as $$
  with ranked as (
    select s.*,
      (case lower(coalesce(p_sort,'earnings'))
         when 'net'     then s.season_net::numeric
         when 'wins'    then s.wins::numeric
         when 'majors'  then s.majors::numeric
         when 'ovr'     then s.ovr::numeric
         when 'rep'     then s.rep_pts::numeric
         when 'fans'    then s.followers::numeric
         else                s.season_earnings::numeric
       end) as sortk
    from runtour_scores s
    where (p_since is null or s.created_at >= p_since)
  ), numbered as (
    select (row_number() over (order by sortk desc, season_earnings desc, id))::int as rank,
           user_id, display_name, golfer_name, ovr, year, season_earnings, season_net, wins, majors, rep_pts, skills, followers, look
    from ranked
  )
  select rank, user_id, display_name, golfer_name, ovr, year, season_earnings, season_net, wins, majors, rep_pts, skills, followers, look
  from numbered
  order by (case when lower(coalesce(p_dir,'desc'))='asc' then -rank else rank end)
  limit greatest(1, least(500, coalesce(p_limit, 100)));
$$;

create or replace function public.runtour_career_board(
    p_limit int default 100, p_sort text default 'earnings', p_dir text default 'desc',
    p_since timestamptz default null)
returns table(rank int, user_id uuid, display_name text, golfer_name text, seasons int,
              career_earnings bigint, career_net bigint, wins int, majors int, rep_pts int, skills jsonb, followers bigint, look jsonb)
language sql stable security definer set search_path = public as $$
  with per_career as (
    select s.user_id,
           coalesce(s.career_id, 'legacy:'||s.id::text)      as cid,
           max(s.display_name)                               as display_name,
           (array_agg(s.golfer_name order by s.year desc))[1] as golfer_name,
           (array_agg(s.skills order by s.year desc))[1]      as skills,
           (array_agg(s.look order by s.year desc))[1]        as look,
           count(*)::int                                     as seasons,
           sum(s.season_earnings)::bigint                    as career_earnings,
           sum(s.season_net)::bigint                         as career_net,
           sum(s.wins)::int                                  as wins,
           sum(s.majors)::int                                as majors,
           max(s.followers)::bigint                          as followers
    from runtour_scores s
    where (p_since is null or s.created_at >= p_since)
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
         when 'fans'    then pc.followers::numeric
         else                pc.career_earnings::numeric
       end) as sortk
    from per_career pc left join urep u on u.user_id = pc.user_id
  ), numbered as (
    select (row_number() over (order by sortk desc, career_earnings desc))::int as rank,
           user_id, display_name, golfer_name, seasons, career_earnings, career_net, wins, majors, rep_pts, skills, followers, look
    from joined
  )
  select rank, user_id, display_name, golfer_name, seasons, career_earnings, career_net, wins, majors, rep_pts, skills, followers, look
  from numbered
  order by (case when lower(coalesce(p_dir,'desc'))='asc' then -rank else rank end)
  limit greatest(1, least(500, coalesce(p_limit, 100)));
$$;

grant execute on function public.runtour_season_board(int,text,text,timestamptz) to anon, authenticated;
grant execute on function public.runtour_career_board(int,text,text,timestamptz) to anon, authenticated;
