-- ============================================================================
-- 48_runtour_fans.sql — add a "Fans" (follower count) leaderboard category
-- ============================================================================
-- Adds a `followers` column to runtour_scores (the player's fan following at the
-- time the season was posted), threads an optional p_followers param through both
-- submit functions, and lets both boards be sorted by 'fans' + return the value.
-- Fully backward compatible: p_followers defaults to 0, and because it's a new
-- trailing defaulted arg, the OLD client calls (without p_followers) still resolve
-- to these functions unchanged. The client tries WITH p_followers first and falls
-- back to WITHOUT on error, so deploying the client before this migration is safe.
-- Apply in the Supabase SQL editor AFTER 39_runtour_launch_hardening.sql and
-- 38_runtour_board_dir.sql. Idempotent: safe to re-run.
-- ----------------------------------------------------------------------------

alter table public.runtour_scores add column if not exists followers bigint not null default 0;
create index if not exists runtour_scores_followers_idx on public.runtour_scores(followers desc);

-- ---- submit (signed-in): add p_followers (clamped) ----
create or replace function public.runtour_submit_season(
  p_golfer    text,
  p_ovr       int,
  p_year      int,
  p_earnings  bigint,
  p_net       bigint,
  p_wins      int    default 0,
  p_majors    int    default 0,
  p_skills    jsonb  default null,
  p_career_id text   default null,
  p_rep_pts   int    default 0,
  p_followers bigint default 0
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid   := auth.uid();
  v_name text;
  v_ovr  int    := greatest(40, least(99, coalesce(p_ovr, 80)));
  v_year int    := greatest(1, least(99, coalesce(p_year, 1)));
  v_cap  bigint := (v_ovr::bigint) * 2000000;
  v_earn bigint := greatest(0, least(coalesce(p_earnings, 0), v_cap));
  v_net  bigint := least(coalesce(p_net, 0), v_cap);
  v_rep  int    := greatest(0, least(1000000, coalesce(p_rep_pts, 0)));
  v_wins int    := greatest(0, least(40, coalesce(p_wins, 0)));
  v_maj  int    := greatest(0, least(10, coalesce(p_majors, 0)));
  v_fol  bigint := greatest(0, least(2000000000, coalesce(p_followers, 0)));   -- cap at 2B (well above any real following)
  v_id   bigint;
begin
  if v_uid is null then raise exception 'sign in to post a score'; end if;
  select username into v_name from profiles where id = v_uid;
  if v_name is null or length(trim(v_name)) = 0 then
    raise exception 'set a username on RunThe.GG first';
  end if;
  insert into public.runtour_scores(
    user_id, display_name, golfer_name, career_id, ovr, year,
    season_earnings, season_net, wins, majors, skills, rep_pts, followers)
  values (
    v_uid, v_name,
    public.runtour_clean_name(p_golfer, 'Your Golfer'),
    left(coalesce(p_career_id,''),40),
    v_ovr, v_year,
    v_earn, v_net, v_wins, v_maj, p_skills, v_rep, v_fol)
  returning id into v_id;
  return v_id;
end; $$;

-- ---- submit (guest): add p_followers (clamped) ----
create or replace function public.runtour_submit_season_guest(
  p_ovr       int,
  p_year      int,
  p_earnings  bigint,
  p_net       bigint,
  p_wins      int    default 0,
  p_majors    int    default 0,
  p_skills    jsonb  default null,
  p_career_id text   default null,
  p_followers bigint default 0
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_ovr  int    := greatest(40, least(99, coalesce(p_ovr, 80)));
  v_year int    := greatest(1, least(99, coalesce(p_year, 1)));
  v_cap  bigint := (v_ovr::bigint) * 2000000;
  v_earn bigint := greatest(0, least(coalesce(p_earnings, 0), v_cap));
  v_net  bigint := least(coalesce(p_net, 0), v_cap);
  v_wins int    := greatest(0, least(40, coalesce(p_wins, 0)));
  v_maj  int    := greatest(0, least(10, coalesce(p_majors, 0)));
  v_fol  bigint := greatest(0, least(2000000000, coalesce(p_followers, 0)));
  v_id   bigint;
begin
  insert into public.runtour_scores(
    user_id, display_name, golfer_name, career_id, ovr, year,
    season_earnings, season_net, wins, majors, skills, rep_pts, is_guest, followers)
  values (
    null, 'Anonymous', 'Guest Player',
    left(coalesce(p_career_id,''),40),
    v_ovr, v_year,
    v_earn, v_net, v_wins, v_maj, p_skills, 0, true, v_fol)
  returning id into v_id;
  return v_id;
end; $$;

-- ---- boards: return `followers` + support p_sort='fans' (redefine of 38's 3-arg fns) ----
create or replace function public.runtour_season_board(
    p_limit int default 100, p_sort text default 'earnings', p_dir text default 'desc')
returns table(rank int, user_id uuid, display_name text, golfer_name text,
              ovr int, year int, season_earnings bigint, season_net bigint, wins int, majors int,
              rep_pts int, skills jsonb, followers bigint)
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
  ), numbered as (
    select (row_number() over (order by sortk desc, season_earnings desc, id))::int as rank,
           user_id, display_name, golfer_name, ovr, year, season_earnings, season_net, wins, majors, rep_pts, skills, followers
    from ranked
  )
  select rank, user_id, display_name, golfer_name, ovr, year, season_earnings, season_net, wins, majors, rep_pts, skills, followers
  from numbered
  order by (case when lower(coalesce(p_dir,'desc'))='asc' then -rank else rank end)
  limit greatest(1, least(500, coalesce(p_limit, 100)));
$$;

create or replace function public.runtour_career_board(
    p_limit int default 100, p_sort text default 'earnings', p_dir text default 'desc')
returns table(rank int, user_id uuid, display_name text, golfer_name text, seasons int,
              career_earnings bigint, career_net bigint, wins int, majors int, rep_pts int, skills jsonb, followers bigint)
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
           sum(s.majors)::int                                as majors,
           max(s.followers)::bigint                          as followers
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
         when 'fans'    then pc.followers::numeric
         else                pc.career_earnings::numeric
       end) as sortk
    from per_career pc left join urep u on u.user_id = pc.user_id
  ), numbered as (
    select (row_number() over (order by sortk desc, career_earnings desc))::int as rank,
           user_id, display_name, golfer_name, seasons, career_earnings, career_net, wins, majors, rep_pts, skills, followers
    from joined
  )
  select rank, user_id, display_name, golfer_name, seasons, career_earnings, career_net, wins, majors, rep_pts, skills, followers
  from numbered
  order by (case when lower(coalesce(p_dir,'desc'))='asc' then -rank else rank end)
  limit greatest(1, least(500, coalesce(p_limit, 100)));
$$;

grant execute on function public.runtour_season_board(int,text,text) to anon, authenticated;
grant execute on function public.runtour_career_board(int,text,text) to anon, authenticated;
