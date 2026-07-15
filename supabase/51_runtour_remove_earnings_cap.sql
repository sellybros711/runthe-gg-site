-- ============================================================================
-- 51_runtour_remove_earnings_cap.sql — REMOVE the OVR-based earnings/net ceiling
-- ============================================================================
-- Owner: "remove that formula that lowers people's scores. It's bad for the game."
--
-- Background: 33/34 (and the superseded 50) clamped a posted season's earnings AND
-- net to `OVR * <multiplier>` as an anti-forgery guard. In practice that formula
-- LOWERED legitimate high scores and collapsed different seasons onto identical
-- round numbers (OVR 92 -> $184,000,000, 91 -> $182,000,000, ...), which read as
-- "the system is fixing scores." This migration removes that ceiling entirely:
-- a season now stores exactly the earnings/net it was submitted with (only floored
-- at 0 so a negative can't sort weirdly). No OVR-based cap on either the signed-in
-- or the guest submit path. Supersedes the `v_cap` in 33/34/37/50.
--
-- Trade-off (accepted): without the cap, a hand-crafted RPC call could post an
-- inflated number. The wins/majors sanity clamps (39_runtour_launch_hardening.sql:
-- wins<=40, majors<=10) and the profanity/name filters stay in place; only the
-- dollar ceiling is gone. If abuse ever shows up post-launch, a much higher fixed
-- ceiling (not OVR-scaled, so it never lowers a real score) can be added later.
--
-- NOTE: this only changes FUTURE submissions. Rows already stored at a clamped
-- value keep that value — to clear the old identical/clamped rows and let the board
-- repopulate cleanly, uncomment the truncate at the bottom (optional, destructive:
-- it empties the season/career board; daily records + lifetime stats are untouched).
--
-- Idempotent: safe to re-run. Apply in the Supabase SQL editor.
-- ----------------------------------------------------------------------------

-- 1) signed-in submit: no OVR cap, store earnings/net as submitted (floor at 0).
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
  -- no OVR-based ceiling (owner: it lowered real scores). Just keep it non-negative.
  v_earn bigint := greatest(0, coalesce(p_earnings, 0));
  v_net  bigint := coalesce(p_net, 0);
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

-- 2) guest submit: same — drop the cap (if the guest board is in use).
do $$ begin
  if to_regprocedure('public.runtour_submit_season_guest(int,int,bigint,bigint,int,int,jsonb,text)') is not null then
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
    language plpgsql security definer set search_path = public as $f$
    declare
      v_ovr  int    := greatest(40, least(99, coalesce(p_ovr, 80)));
      v_year int    := greatest(1, least(99, coalesce(p_year, 1)));
      v_earn bigint := greatest(0, coalesce(p_earnings, 0));   -- no OVR cap
      v_net  bigint := coalesce(p_net, 0);
      v_id   bigint;
    begin
      insert into public.runtour_scores(
        user_id, display_name, golfer_name, career_id, ovr, year,
        season_earnings, season_net, wins, majors, skills, rep_pts, is_guest)
      values (
        null, 'Anonymous', 'Guest Player',
        left(coalesce(p_career_id,''),40),
        v_ovr, v_year,
        v_earn, v_net, greatest(0, coalesce(p_wins, 0)), greatest(0, coalesce(p_majors, 0)), p_skills, 0, true)
      returning id into v_id;
      return v_id;
    end; $f$;
    grant execute on function public.runtour_submit_season_guest(int,int,bigint,bigint,int,int,jsonb,text) to anon, authenticated;
  end if;
end $$;

-- 3) OPTIONAL: clear the old clamped/identical rows so the board repopulates cleanly.
--    Uncomment to run (destructive: empties the season/career board only).
-- do $$ begin
--   if to_regclass('public.runtour_scores') is not null then
--     truncate table public.runtour_scores;
--   end if;
-- end $$;
