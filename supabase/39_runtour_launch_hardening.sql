-- ============================================================================
-- 39_runtour_launch_hardening.sql — pre-launch hardening for the public boards
-- ============================================================================
-- Three independent, launch-readiness fixes, all safe to apply together and
-- idempotent (safe to re-run). Apply in the Supabase SQL editor.
--
--   1. Profanity-sanitize the public `golfer_name`. Signed-in players type a free
--      golfer name that renders publicly on the leaderboard next to ads; today it's
--      only XSS-stripped + length-capped, never profanity-checked (usernames ARE,
--      via 29_username_filter.sql, but the golfer name is separate). We SANITIZE
--      (fall back to a neutral name) rather than REJECT, so a real season is never
--      lost just because someone put something rude in the name field. Guests are
--      unaffected — their name is hardcoded server-side to 'Guest Player'.
--
--   2. Clamp `wins`/`majors` to a sane per-season ceiling. Both boards can sort by
--      wins and majors (28/38), but the submit RPCs only floored them at 0 — a
--      forger could post wins:1000000 / majors:1000000 (or as an anonymous guest)
--      and permanently top those sorts. A real season physically can't exceed ~24
--      events / ~5 majors, so caps of 40 / 10 never clip a legitimate season while
--      killing the forgery. (Earnings/net/ovr/rep were already clamped in 34/37.)
--
--   3. Add indexes for the board sort columns + the career-board grouping. The
--      boards sort by net/wins/majors/ovr/rep (not just earnings, which already had
--      an index from 22), and the career board GROUPs BY (user_id, career_id). At
--      launch scale these want indexes so the per-request sort/group stays cheap.
--
-- NOTE: this REDEFINES runtour_submit_season and runtour_submit_season_guest with
-- the SAME signatures/behavior as 34/37, changing only the golfer_name handling
-- (fix 1) and the wins/majors clamp (fix 2). The client calls are unchanged.
-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- fix 1 helper: return a display name with any blocklisted profanity/slur
-- replaced by a neutral fallback. Reuses the same normalization + blocklist as
-- username_ok (29), but WITHOUT the username FORMAT rule, since a golfer display
-- name legitimately contains spaces/punctuation and mixed case. Also does the
-- XSS strip (< > &) + length cap the submit function used to do inline.
-- ---------------------------------------------------------------------------
create or replace function public.runtour_clean_name(p_name text, p_fallback text)
returns text language plpgsql immutable set search_path = public as $$
declare
  cleaned text;
  norm    text;
  blocked text[] := array[
    'fuck','shit','bitch','cunt','asshole','dick','pussy','cock','whore','slut',
    'bastard','twat','wank','jizz',
    'nigger','nigga','chink','spic','kike','gook','wetback','beaner','tranny',
    'paki','retard','faggot','fag'
  ];
  term text;
begin
  -- strip angle brackets/ampersand (XSS), cap length, trim
  cleaned := btrim(left(regexp_replace(coalesce(p_name, ''), '[<>&]', '', 'g'), 24));
  if cleaned = '' then
    return p_fallback;
  end if;
  -- normalize for the blocklist scan only: fold case, drop everything but letters,
  -- then fold common leetspeak digits (same idea as username_ok). Dropping spaces
  -- and punctuation also catches "f u c k" / "f-u-c-k" style spacing evasions.
  norm := translate(regexp_replace(lower(cleaned), '[^a-z0-9]', '', 'g'),
                    '013457', 'oieast');
  foreach term in array blocked loop
    if position(term in norm) > 0 then
      return p_fallback;
    end if;
  end loop;
  return cleaned;
end; $$;

-- ---------------------------------------------------------------------------
-- fix 1 + 2: signed-in season submit (redefine of 34's function; identical
-- signature + behavior except golfer_name is now profanity-sanitized and
-- wins/majors are clamped to a sane ceiling).
-- ---------------------------------------------------------------------------
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
  v_cap  bigint := (v_ovr::bigint) * 2000000;
  v_earn bigint := greatest(0, least(coalesce(p_earnings, 0), v_cap));
  v_net  bigint := least(coalesce(p_net, 0), v_cap);
  v_rep  int    := greatest(0, least(1000000, coalesce(p_rep_pts, 0)));
  -- a season physically can't exceed ~24 events / ~5 majors; these caps are well
  -- above any real season yet block the forged wins:1e6 / majors:1e6 exploit.
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

-- ---------------------------------------------------------------------------
-- fix 2: guest season submit (redefine of 37's function; identical except
-- wins/majors are clamped). golfer_name stays hardcoded 'Guest Player'.
-- ---------------------------------------------------------------------------
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
  v_ovr  int    := greatest(40, least(99, coalesce(p_ovr, 80)));
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

grant execute on function public.runtour_clean_name(text,text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- fix 3: indexes for the board sort columns + career-board grouping.
-- (season_earnings already indexed in 22.) Plain CREATE INDEX takes a brief lock;
-- if runtour_scores is already very large, run these one at a time with
-- CREATE INDEX CONCURRENTLY (outside a transaction) instead.
-- ---------------------------------------------------------------------------
create index if not exists idx_runtour_scores_net    on public.runtour_scores (season_net desc);
create index if not exists idx_runtour_scores_wins   on public.runtour_scores (wins desc);
create index if not exists idx_runtour_scores_majors on public.runtour_scores (majors desc);
create index if not exists idx_runtour_scores_ovr    on public.runtour_scores (ovr desc);
create index if not exists idx_runtour_scores_rep    on public.runtour_scores (rep_pts desc);
create index if not exists idx_runtour_scores_career on public.runtour_scores (user_id, career_id);
