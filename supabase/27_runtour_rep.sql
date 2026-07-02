-- ============================================================================
-- 27_runtour_rep.sql — show each player's Tour Rep rank on the leaderboard
-- ============================================================================
-- Stores the player's account-level Tour Rep points with each season submission
-- (client-derived from achievements, clamped) and surfaces the player's BEST
-- rep_pts on every leaderboard row, so their current rank shows beside their name.
-- Idempotent: safe to re-run. Apply in the Supabase SQL editor.
-- ----------------------------------------------------------------------------

alter table public.runtour_scores add column if not exists rep_pts int not null default 0;

-- submit: now also takes the player's current Tour Rep points
drop function if exists public.runtour_submit_season(text,int,int,bigint,bigint,int,int,jsonb,text);
create or replace function public.runtour_submit_season(
  p_golfer    text,
  p_ovr       int,
  p_year      int,
  p_earnings  bigint,
  p_net       bigint,
  p_wins      int   default 0,
  p_majors    int   default 0,
  p_skills    jsonb default null,
  p_career_id text  default null,
  p_rep_pts   int   default 0
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid   := auth.uid();
  v_name text;
  v_ovr  int    := greatest(40, least(99, coalesce(p_ovr, 80)));
  v_year int    := greatest(1, least(99, coalesce(p_year, 1)));
  v_cap  bigint := (v_ovr::bigint) * 400000;
  v_earn bigint := greatest(0, least(coalesce(p_earnings, 0), v_cap));
  v_net  bigint := least(coalesce(p_net, 0), v_cap);
  v_rep  int    := greatest(0, least(1000000, coalesce(p_rep_pts, 0)));
  v_id   bigint;
begin
  if v_uid is null then raise exception 'sign in to post a score'; end if;
  select username into v_name from profiles where id = v_uid;
  if v_name is null or length(trim(v_name)) = 0 then
    raise exception 'set a username on RunThe.GG first';
  end if;
  insert into public.runtour_scores(
    user_id, display_name, golfer_name, career_id, ovr, year,
    season_earnings, season_net, wins, majors, skills, rep_pts)
  values (
    v_uid, v_name,
    coalesce(nullif(left(regexp_replace(coalesce(p_golfer,''), '[<>&]', '', 'g'), 24), ''), 'Your Golfer'),
    left(coalesce(p_career_id,''),40),
    v_ovr, v_year,
    v_earn, v_net, greatest(0, coalesce(p_wins, 0)), greatest(0, coalesce(p_majors, 0)), p_skills, v_rep)
  returning id into v_id;
  return v_id;
end; $$;

-- single-season board: every season, + the player's best rep_pts on each of their rows
drop function if exists public.runtour_season_board(int);
create or replace function public.runtour_season_board(p_limit int default 100)
returns table(rank int, user_id uuid, display_name text, golfer_name text,
              ovr int, year int, season_earnings bigint, season_net bigint, rep_pts int)
language sql stable security definer set search_path = public as $$
  select (row_number() over (order by s.season_earnings desc, s.id))::int as rank,
         s.user_id, s.display_name, s.golfer_name, s.ovr, s.year, s.season_earnings, s.season_net,
         max(s.rep_pts) over (partition by s.user_id) as rep_pts
  from runtour_scores s
  order by s.season_earnings desc, s.id
  limit greatest(1, least(500, coalesce(p_limit, 100)));
$$;

-- career board: every career, + the player's best rep_pts (account-level current rank)
drop function if exists public.runtour_career_board(int);
create or replace function public.runtour_career_board(p_limit int default 100)
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
  ), urep as ( select user_id, max(rep_pts) as rep_pts from runtour_scores group by user_id )
  select (row_number() over (order by pc.career_earnings desc))::int as rank,
         pc.user_id, pc.display_name, pc.golfer_name, pc.seasons, pc.career_earnings, pc.career_net,
         pc.wins, pc.majors, coalesce(u.rep_pts,0) as rep_pts
  from per_career pc left join urep u on u.user_id = pc.user_id
  order by pc.career_earnings desc
  limit greatest(1, least(500, coalesce(p_limit, 100)));
$$;

grant execute on function public.runtour_submit_season(text,int,int,bigint,bigint,int,int,jsonb,text,int) to authenticated;
grant execute on function public.runtour_season_board(int) to anon, authenticated;
grant execute on function public.runtour_career_board(int) to anon, authenticated;
