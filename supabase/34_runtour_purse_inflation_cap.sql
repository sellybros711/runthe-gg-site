-- ============================================================================
-- 34_runtour_purse_inflation_cap.sql — raise the earnings ceiling for purse inflation
-- ============================================================================
-- Added year-over-year purse inflation client-side this session (~3.2%/yr compounding,
-- see CLAUDE.md CS78) so a long career's prize money keeps feeling current instead of a
-- flat number frozen at year-1 levels for 30-40 seasons. That changes the true theoretical
-- maximum possible season (winning literally every event, at an 18% winner's share):
--
--   year 1  (no inflation yet):  ~$59.6M   (unchanged from before)
--   year 15 (x1.55 inflation):   ~$91.9M
--   year 30 (x2.49 inflation):  ~$147.4M
--
-- The existing anti-forgery ceiling (33_runtour_earnings_cap.sql) is `v_ovr * 900000`,
-- which tops out at $89.1M for OVR 99 — comfortably covers year 1 but would silently
-- clamp a genuine, honestly-simulated OVR-90+ season from around year 15 onward once
-- inflation is in the picture, exactly the "everyone posts the same number" bug fixed in
-- 33 in the first place, just re-appearing later in a long career instead of immediately.
--
-- Fix: raise the per-OVR-point multiplier from 900,000 to 2,000,000. At OVR 74+ this
-- clears the true year-30 maximum (~$147.4M) with ~34% headroom to spare (OVR 99 ->
-- $198M), so a legitimately-simulated late-career season is never clamped, while an
-- obviously-forged submission (a low OVR claiming an enormous season) is still rejected.
-- The Legend Circuit does not submit to this leaderboard at all (a deliberate scope
-- decision from CS76), so its own further-inflated purses (up to ~x3.6 by year 42) never
-- interact with this cap. Only this one function changes; nothing else about scoring,
-- ranking, or grants moves. Idempotent: safe to re-run. Apply in the Supabase SQL editor.
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
  -- ~$2M per overall point (was $900k): clears the year-30 theoretical max with purse
  -- inflation factored in (~$147.4M at OVR 99, winning every event) with room to spare,
  -- so real variance in simulated late-career seasons is never artificially flattened.
  v_cap  bigint := (v_ovr::bigint) * 2000000;
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
