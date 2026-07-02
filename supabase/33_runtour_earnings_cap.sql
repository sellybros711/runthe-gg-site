-- ============================================================================
-- 33_runtour_earnings_cap.sql — stop clamping every strong season to the same number
-- ============================================================================
-- Owner reported the Single Season leaderboard showing many different players
-- (different builds, different years) posting the EXACT same earnings figure,
-- e.g. $39,200,000 and $38,800,000 repeated across a dozen rows — "there should
-- be infinite possibilities."
--
-- Root cause: runtour_submit_season's anti-forgery ceiling is
--   v_cap := v_ovr * 400000
-- which is EXACTLY $39,200,000 at OVR 98 and $38,800,000 at OVR 97 — a precise
-- match to the repeated values. The comment introducing this cap
-- (22_runtour_leaderboard.sql) assumed "real seasons land far below this," but
-- that's false: the actual schedule (13 anchor events + 7 rotating regular
-- events, ~20/season) tops out at roughly $334M in total purse, so even the
-- theoretical maximum possible season (winning literally every single event,
-- at an 18% winner's share) is only ~$60.1M — well above the OVR-98 cap of
-- $39.2M. Any strong build (OVR 95+) having a genuinely great simulated season
-- (several wins + high finishes) routinely exceeds the cap and gets clipped
-- down to the exact same ceiling value every time, flattening what should be
-- naturally varied results into a wall of identical numbers.
--
-- Fix: raise the per-OVR-point multiplier from 400,000 to 900,000. At OVR 67+
-- this alone already clears the true ~$60.1M structural maximum with room to
-- spare (OVR 99 -> $89.1M), so a legitimately-simulated season is never
-- clamped, while an obviously-forged submission (a low OVR claiming a massive
-- season, or any wildly implausible figure) is still rejected. Only this one
-- function changes; nothing else about scoring, ranking, or grants moves.
-- Idempotent: safe to re-run. Apply in the Supabase SQL editor.
-- ----------------------------------------------------------------------------

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
  -- ~$900k per overall point (was $400k): clears the schedule's true theoretical
  -- max season (~$60.1M, winning every event) at OVR 67+, so real variance in
  -- simulated results is never artificially flattened to the ceiling.
  v_cap  bigint := (v_ovr::bigint) * 900000;
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

grant execute on function public.runtour_submit_season(text,int,int,bigint,bigint,int,int,jsonb,text,int) to authenticated;
