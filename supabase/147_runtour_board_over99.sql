-- ---------------------------------------------------------------------------
-- 147_runtour_board_over99.sql : the season board keeps an overall past 99.
--
-- Safe to run more than once. Needs 39_runtour_launch_hardening.sql.
--
-- The owner's call (2026-10-16): gear may carry a golfer's overall past 99, and
-- every screen shows it. 39 stored a season's overall clamped to 99, so a golfer
-- whose own card read 102 sat on the board at 99. The page's own ceiling for a
-- geared golfer is 112 (ovrFromSkills with allowOver); the board now keeps up
-- to that. Nothing else in either function changes. The earnings cap is still
-- 2,000,000 a point of overall, so a 102 may post up to 204,000,000.
--
-- The table's own definition is older than this repo. If it carries a check
-- that holds ovr to 99, it is replaced by one that holds it to 40-112.
-- ---------------------------------------------------------------------------

do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.runtour_scores'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%ovr%' loop
    execute format('alter table public.runtour_scores drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.runtour_scores drop constraint if exists runtour_scores_ovr_range;
alter table public.runtour_scores add constraint runtour_scores_ovr_range check (ovr is null or ovr between 40 and 112);

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
  v_ovr  int    := greatest(40, least(112, coalesce(p_ovr, 80)));   -- 39 held this to 99
  v_year int    := greatest(1, least(99, coalesce(p_year, 1)));
  v_cap  bigint := (v_ovr::bigint) * 2000000;
  v_earn bigint := greatest(0, least(coalesce(p_earnings, 0), v_cap));
  v_net  bigint := least(coalesce(p_net, 0), v_cap);
  v_rep  int    := greatest(0, least(1000000, coalesce(p_rep_pts, 0)));
  v_wins int    := greatest(0, least(40, coalesce(p_wins, 0)));
  v_maj  int    := greatest(0, least(10, coalesce(p_majors, 0)));
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
    public.runtour_clean_name(p_golfer, 'Your Golfer'),
    left(coalesce(p_career_id,''),40),
    v_ovr, v_year,
    v_earn, v_net, v_wins, v_maj, p_skills, v_rep)
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.runtour_submit_season_guest(
  p_ovr       int,
  p_year      int,
  p_earnings  bigint,
  p_net       bigint,
  p_wins      int   default 0,
  p_majors    int   default 0,
  p_skills    jsonb default null,
  p_career_id text  default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_ovr  int    := greatest(40, least(112, coalesce(p_ovr, 80)));   -- 39 held this to 99
  v_year int    := greatest(1, least(99, coalesce(p_year, 1)));
  v_cap  bigint := (v_ovr::bigint) * 2000000;
  v_earn bigint := greatest(0, least(coalesce(p_earnings, 0), v_cap));
  v_net  bigint := least(coalesce(p_net, 0), v_cap);
  v_wins int    := greatest(0, least(40, coalesce(p_wins, 0)));
  v_maj  int    := greatest(0, least(10, coalesce(p_majors, 0)));
  v_id   bigint;
begin
  insert into public.runtour_scores(
    user_id, display_name, golfer_name, career_id, ovr, year,
    season_earnings, season_net, wins, majors, skills, rep_pts, is_guest)
  values (
    null, 'Anonymous', 'Guest Player',
    left(coalesce(p_career_id,''),40),
    v_ovr, v_year,
    v_earn, v_net, v_wins, v_maj, p_skills, 0, true)
  returning id into v_id;
  return v_id;
end; $$;
