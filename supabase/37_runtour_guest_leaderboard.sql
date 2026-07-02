-- ============================================================================
-- 37_runtour_guest_leaderboard.sql — guest (signed-out) leaderboard posting + season rank
-- ============================================================================
-- Owner's ask: "I want to enhance the leaderboard functionality... guests should be
-- allowed for their scores to be logged on to the leaderboard. But instead of it
-- saying their username and their golfer name, it'll just say anonymous and guest
-- player." Also: "on the season results page, there should be a little message
-- telling them how highly their season ranked amongst all seasons."
--
-- Part 1 — guest posting:
-- runtour_scores.user_id is currently `not null`, and the only submit function
-- (runtour_submit_season) hard-requires auth.uid() + a profiles.username lookup —
-- a signed-out player's finished season is queued client-side forever and never
-- reaches this table. Fix: make user_id nullable, add an `is_guest` flag, and add
-- a SEPARATE submit function for guests that takes NO identity from the client at
-- all — display_name/golfer_name are hardcoded server-side to 'Anonymous' /
-- 'Guest Player' (not merely defaulted — a guest can't spoof a real name even by
-- tampering with the RPC call), and reuses the same OVR-scaled earnings cap as the
-- signed-in path (34_runtour_purse_inflation_cap.sql's $2,000,000/OVR-point ceiling)
-- so the anti-forgery guarantee is identical either way.
--
-- Note on abuse surface: an unauthenticated RPC is inherently more spammable than
-- the signed-in one (no account to rate-limit against). The existing earnings cap
-- is the only guard here, same trade-off the owner accepted implicitly by wanting
-- guest posting at all; if it turns out to attract spam, a per-IP/edge-function
-- throttle can be layered on later without another schema change.
--
-- Both boards (runtour_season_board / runtour_career_board, see
-- 26_runtour_board_all_entries.sql + 28_runtour_sort.sql) already show every row
-- with NO per-user dedup, so a null user_id needs no special-casing there — every
-- guest season/career already appears as its own independent row, same as before.
--
-- Part 2 — season rank: a small read-only RPC that answers "how many seasons all
-- time earned more than mine, and how many seasons exist in total" against the RAW
-- (non-deduped) table — deliberately NOT the per-user "best season" framing, since
-- the ask is "how highly did my season rank amongst all seasons", not "amongst all
-- players". Ties share a rank (rank = count(strictly greater) + 1).
--
-- Idempotent: safe to re-run. Apply in the Supabase SQL editor.
-- ----------------------------------------------------------------------------

alter table public.runtour_scores alter column user_id drop not null;
alter table public.runtour_scores add column if not exists is_guest boolean not null default false;
alter table public.runtour_scores drop constraint if exists runtour_scores_guest_identity_chk;
alter table public.runtour_scores add constraint runtour_scores_guest_identity_chk
  check (is_guest or user_id is not null);

-- ---------------------------------------------------------------------------
-- submit a finished season as a GUEST (no auth.uid() required). Name fields are
-- fixed server-side — nothing client-supplied ever reaches display_name/golfer_name.
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
  v_cap  bigint := (v_ovr::bigint) * 2000000;   -- same ceiling as runtour_submit_season (migration 34)
  v_earn bigint := greatest(0, least(coalesce(p_earnings, 0), v_cap));
  v_net  bigint := least(coalesce(p_net, 0), v_cap);
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
end; $$;

-- ---------------------------------------------------------------------------
-- how did a season with these earnings rank against every season ever posted?
-- (rank = 1 means nobody, including this row if already inserted, out-earned it)
-- ---------------------------------------------------------------------------
create or replace function public.runtour_season_rank(p_earnings bigint)
returns table(rank bigint, total bigint)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.runtour_scores where season_earnings > coalesce(p_earnings, 0)) + 1 as rank,
    (select count(*) from public.runtour_scores) as total;
$$;

grant execute on function public.runtour_submit_season_guest(int,int,bigint,bigint,int,int,jsonb,text) to anon, authenticated;
grant execute on function public.runtour_season_rank(bigint) to anon, authenticated;
