-- ============================================================================
-- 22_runtour_leaderboard.sql  —  RunTheTour public leaderboard
-- ============================================================================
-- Adds the RunTheTour (golf game at /RunTheTour/) public leaderboard. Everything
-- here is namespaced `runtour_*` and is COMPLETELY SEPARATE from the World Cup
-- game (RunThePitch). It does NOT touch `drafts`, `wc_players`, `submit_draft`,
-- the daily-challenge tables, or any existing object. The only existing table it
-- READS is `profiles` (to attribute a player's username server-side, exactly like
-- submit_draft does) — it never writes to it.
--
-- Two boards:
--   • Single-season earnings  — each player's BEST single season, ranked
--   • Career earnings         — total earnings across all that player's seasons
--
-- Integrity: the season is simulated in the browser, so the submitted earnings
-- can't be recomputed server-side cheaply. We take the pragmatic route used for
-- launch: the name is server-attributed from `profiles` (never client-supplied,
-- so it can't be forged), and earnings are CLAMPED to a generous, OVR-scaled
-- ceiling so nobody can post a fantasy nine-figure season. We also store the
-- build's overall + skills, so a stricter deterministic-replay check can be
-- layered on later without a schema change.
--
-- Reuses the same Supabase project as RunThePitch and the same accounts
-- (auth.users / profiles), so a signed-in RunThe.GG player is the same identity
-- on both boards.
--
-- Idempotent: safe to re-run. Apply in the Supabase SQL editor.
-- ----------------------------------------------------------------------------

create table if not exists public.runtour_scores (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  display_name    text not null,
  golfer_name     text not null default 'Your Golfer',
  career_id       text,                          -- one bounded career = one universe (career_seed)
  ovr             int  not null,
  year            int  not null default 1,
  season_earnings bigint not null,
  season_net      bigint not null,
  wins            int  not null default 0,
  majors          int  not null default 0,
  skills          jsonb,
  created_at      timestamptz not null default now()
);
alter table public.runtour_scores add column if not exists career_id text;   -- safe if table pre-existed

create index if not exists runtour_scores_earn_idx on public.runtour_scores (season_earnings desc);
create index if not exists runtour_scores_user_idx on public.runtour_scores (user_id);

alter table public.runtour_scores enable row level security;

-- World-readable board; there is NO direct write policy. Every insert goes
-- through the SECURITY DEFINER function below, keeping validation server-side.
drop policy if exists runtour_scores_public_read on public.runtour_scores;
create policy runtour_scores_public_read on public.runtour_scores for select using (true);

-- ---------------------------------------------------------------------------
-- submit a finished season
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
  p_career_id text  default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid   := auth.uid();
  v_name text;
  v_ovr  int    := greatest(40, least(99, coalesce(p_ovr, 80)));
  v_year int    := greatest(1, least(99, coalesce(p_year, 1)));
  -- Generous, OVR-scaled ceiling (~$400k per overall point; ~$38M at OVR 95).
  -- Real seasons land far below this; the cap only kills forged submissions.
  v_cap  bigint := (v_ovr::bigint) * 400000;
  v_earn bigint := greatest(0, least(coalesce(p_earnings, 0), v_cap));
  v_net  bigint := least(coalesce(p_net, 0), v_cap);
  v_id   bigint;
begin
  if v_uid is null then
    raise exception 'sign in to post a score';
  end if;
  select username into v_name from profiles where id = v_uid;
  if v_name is null or length(trim(v_name)) = 0 then
    raise exception 'set a username on RunThe.GG first';
  end if;
  insert into public.runtour_scores(
    user_id, display_name, golfer_name, career_id, ovr, year,
    season_earnings, season_net, wins, majors, skills)
  values (
    v_uid, v_name,
    coalesce(nullif(left(regexp_replace(coalesce(p_golfer,''), '[<>&]', '', 'g'), 24), ''), 'Your Golfer'),
    left(coalesce(p_career_id,''),40),
    v_ovr, v_year,
    v_earn, v_net, greatest(0, coalesce(p_wins, 0)), greatest(0, coalesce(p_majors, 0)), p_skills)
  returning id into v_id;
  return v_id;
end; $$;

-- ---------------------------------------------------------------------------
-- single-season board: each player's BEST single season, top N by earnings
-- ---------------------------------------------------------------------------
create or replace function public.runtour_season_board(p_limit int default 50)
returns table(rank int, user_id uuid, display_name text, golfer_name text,
              ovr int, season_earnings bigint, season_net bigint)
language sql stable security definer set search_path = public as $$
  with best as (
    select distinct on (s.user_id)
           s.user_id, s.display_name, s.golfer_name, s.ovr, s.season_earnings, s.season_net
    from runtour_scores s
    order by s.user_id, s.season_earnings desc
  )
  select (row_number() over (order by season_earnings desc))::int as rank,
         user_id, display_name, golfer_name, ovr, season_earnings, season_net
  from best
  order by season_earnings desc
  limit greatest(1, least(200, coalesce(p_limit, 50)));
$$;

-- ---------------------------------------------------------------------------
-- career board: total earnings across all of a player's seasons, top N
-- ---------------------------------------------------------------------------
-- Career board = each player's BEST single bounded career (sum within one career_id),
-- so completed careers are comparable and multiple careers don't merge (spec §4/§7).
-- Rows with no career_id (legacy/one-off) are each treated as their own career.
create or replace function public.runtour_career_board(p_limit int default 50)
returns table(rank int, user_id uuid, display_name text, seasons int,
              career_earnings bigint, career_net bigint, wins int, majors int)
language sql stable security definer set search_path = public as $$
  with per_career as (
    select s.user_id,
           coalesce(s.career_id, 'legacy:'||s.id::text) as cid,
           max(s.display_name)            as display_name,
           count(*)::int                  as seasons,
           sum(s.season_earnings)::bigint as career_earnings,
           sum(s.season_net)::bigint      as career_net,
           sum(s.wins)::int               as wins,
           sum(s.majors)::int             as majors
    from runtour_scores s
    group by s.user_id, coalesce(s.career_id, 'legacy:'||s.id::text)
  ), best as (
    select distinct on (user_id) user_id, display_name, seasons, career_earnings, career_net, wins, majors
    from per_career
    order by user_id, career_earnings desc
  )
  select (row_number() over (order by career_earnings desc))::int as rank,
         user_id, display_name, seasons, career_earnings, career_net, wins, majors
  from best
  order by career_earnings desc
  limit greatest(1, least(200, coalesce(p_limit, 50)));
$$;

-- ---------------------------------------------------------------------------
-- grants — boards are public (anon + authenticated read); submit needs a login
-- ---------------------------------------------------------------------------
grant execute on function public.runtour_season_board(int)  to anon, authenticated;
grant execute on function public.runtour_career_board(int)  to anon, authenticated;
grant execute on function public.runtour_submit_season(text,int,int,bigint,bigint,int,int,jsonb,text) to authenticated;
