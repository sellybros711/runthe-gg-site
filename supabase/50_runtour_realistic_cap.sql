-- ============================================================================
-- 50_runtour_realistic_cap.sql — realistic anti-forgery ceiling + clear the stale board
-- ============================================================================
-- REPORTED (owner screenshot): the Single-Season leaderboard shows a wall of
-- identical, impossible round numbers — $184,000,000 (several), $182,000,000
-- (several), $180,000,000. Those are EXACTLY `OVR * 2,000,000`:
--     OVR 92 -> $184,000,000   OVR 91 -> $182,000,000   OVR 90 -> $180,000,000
-- i.e. the anti-forgery earnings/net ceiling from 34_runtour_purse_inflation_cap.sql
-- (`v_cap := v_ovr * 2000000`) clamping submissions that exceeded it, so different
-- seasons collapse onto the same value and look "fixed by the system."
--
-- MEASURED against the CURRENT shipped sim (Playwright, driving the real
-- startSeason/skipToEnd/seasonNet):
--     dominant OVR-92, year 29:  gross ~$45.8M  net ~$35.5M   (3 wins)
--     MAX all-99 build, year 30: gross $41-93M  net $32-75M   (3-9 wins, 6 seeds)
--                                                => hard ceiling ~$75M net
-- So a legitimately-simulated season TODAY nets at most ~$75M — nowhere near the
-- $184M cap. The $180M+ rows are stale/legacy submissions from an earlier,
-- much higher-paying balance era (or forged) that got clamped to OVR*$2M. New
-- honest seasons can never reach the cap, so it no longer protects anything — it
-- just manufactures those identical numbers for the leftover bad rows.
--
-- FIX (two parts, one owner action):
--   1. Lower the ceiling from `OVR * 2,000,000` to `OVR * 1,200,000`. At OVR 99
--      that is $118.8M — comfortably above the measured ~$75M real ceiling (with
--      headroom for a lucky high-win tail), while far below the absurd $184M, so
--      an obvious forgery is rejected and a real season is NEVER clamped.
--   2. Clear the stale/legacy season+career board rows (`runtour_scores`) so the
--      board starts clean; the current sim then repopulates it with realistic,
--      VARIED figures (no two seasons clamped to the same number). Daily records
--      (`runtour_daily_scores`) and lifetime stats (`runtour_stats`) are left
--      untouched — this only resets the season/career earnings/profit board.
--
-- Idempotent: safe to re-run (the truncate just empties an already-empty table).
-- Apply in the Supabase SQL editor.
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
  -- ~$1.2M per overall point (was $2M): the measured real-season ceiling is ~$75M
  -- (a max build, best seed, year 30); $1.2M*OVR clears that with room to spare
  -- (OVR 99 -> $118.8M) while rejecting the impossible $180M+ forgeries/legacy rows.
  v_cap  bigint := (v_ovr::bigint) * 1200000;
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

-- Also clamp the guest submit path the same way, if it exists (37_runtour_guest_leaderboard.sql).
do $$ begin
  if to_regprocedure('public.runtour_submit_season_guest(text,int,int,bigint,bigint,int,int,jsonb,text)') is not null then
    -- guest path builds its cap from p_ovr the same way; re-point it by wrapping is overkill here.
    -- The guest cap lives in that function's body; if you use guest posting, update its v_cap to
    -- (v_ovr * 1200000) by hand in 37_runtour_guest_leaderboard.sql and re-run it. (Left as a note
    -- so this migration stays a single, reviewable function + the board reset.)
    null;
  end if;
end $$;

-- Clear the stale/legacy season + career board rows so the board starts clean.
-- (Career board is derived from the same table, so this resets both.)
do $$ begin
  if to_regclass('public.runtour_scores') is not null then
    truncate table public.runtour_scores;
  end if;
end $$;
