-- ============================================================================
-- 24_runtour_daily.sql  —  RunTheTour Daily Challenge (global board + course records)
-- ============================================================================
-- Backs the Daily Challenge at /golf: one round a day at a rotating real course,
-- where the goal is to beat the tour scoring average and the lowest round ever at
-- each course is its "course record". This stores each player's BEST round of the
-- day and surfaces two things:
--   • runtour_daily_board(day)    — today's global leaderboard (lowest to-par)
--   • runtour_course_records()    — the all-time record holder at every course
--
-- Like 22/23, everything here is namespaced `runtour_*` and is COMPLETELY SEPARATE
-- from the World Cup game (RunThePitch). It does NOT touch `drafts`, `wc_players`,
-- `submit_draft`, the old `12_daily_challenge` tables, or any existing object. The
-- only existing table it READS is `profiles` (to attribute a username server-side,
-- exactly like submit_draft / runtour_submit_season) — it never writes to it.
--
-- Integrity stance (same pragmatic launch posture as the leaderboard): the round is
-- simulated in the browser and the per-hole RNG is seeded only by (day, course,
-- hole), so a server re-sim is possible later WITHOUT a schema change (we store the
-- build's ovr + skills + decisions). For now the name is server-attributed from
-- `profiles` (can't be forged) and `to_par` is CLAMPED to a plausible, OVR-scaled
-- floor so nobody can post an impossible round. One ranked play per (user, day):
-- the submit upserts and keeps the LOWER score, matching "best of your 3 attempts".
--
-- Idempotent: safe to re-run. Apply in the Supabase SQL editor.
-- ----------------------------------------------------------------------------

create table if not exists public.runtour_daily_scores (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  golfer_name  text not null default 'Your Golfer',
  day          int  not null,                 -- UTC date as YYYYMMDD (matches the client day-seed)
  course_key   text not null,
  to_par       int  not null,                 -- best round of the day (may be negative)
  ovr          int  not null,
  won          boolean not null default false,-- beat that course's tour scoring average
  skills       jsonb,                         -- the build (for a later deterministic re-sim)
  decisions    jsonb,                         -- {plan, attacks:[...]} (re-sim inputs)
  created_at   timestamptz not null default now(),
  unique (user_id, day)                       -- one ranked round per player per day
);

create index if not exists runtour_daily_day_idx    on public.runtour_daily_scores (day, to_par);
create index if not exists runtour_daily_course_idx  on public.runtour_daily_scores (course_key, to_par);

alter table public.runtour_daily_scores enable row level security;

-- World-readable; there is NO direct write policy. Every write goes through the
-- SECURITY DEFINER function below, keeping validation + name attribution server-side.
drop policy if exists runtour_daily_public_read on public.runtour_daily_scores;
create policy runtour_daily_public_read on public.runtour_daily_scores for select using (true);

-- ---------------------------------------------------------------------------
-- submit (upsert) the player's BEST round of the day — keeps the lower to_par
-- ---------------------------------------------------------------------------
create or replace function public.runtour_submit_daily(
  p_day       int,
  p_course    text,
  p_to_par    int,
  p_ovr       int,
  p_won       boolean default false,
  p_golfer    text    default 'Your Golfer',
  p_skills    jsonb   default null,
  p_decisions jsonb   default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text;
  v_ovr   int  := greatest(40, least(99, coalesce(p_ovr, 80)));
  -- plausible floor: a great build can go low, but not impossibly low. ~0.6 strokes
  -- per overall point below par → OVR 80 ≈ -12, OVR 90 ≈ -18, OVR 99 ≈ -23.
  v_floor int  := -((v_ovr - 60) * 6 / 10);
  v_topar int  := greatest(v_floor, least(40, coalesce(p_to_par, 0)));
  v_id    bigint;
begin
  if v_uid is null then
    raise exception 'sign in to post a daily score';
  end if;
  select username into v_name from profiles where id = v_uid;
  if v_name is null or length(trim(v_name)) = 0 then
    raise exception 'set a username on RunThe.GG first';
  end if;
  insert into public.runtour_daily_scores(
    user_id, display_name, golfer_name, day, course_key, to_par, ovr, won, skills, decisions)
  values (
    v_uid, v_name,
    coalesce(nullif(left(regexp_replace(coalesce(p_golfer,''), '[<>&]', '', 'g'), 24), ''), 'Your Golfer'),
    p_day,
    left(regexp_replace(coalesce(p_course,''), '[<>&]', '', 'g'), 48),
    v_topar, v_ovr, coalesce(p_won, false), p_skills, p_decisions)
  on conflict (user_id, day) do update
    set to_par     = excluded.to_par,
        ovr        = excluded.ovr,
        won        = excluded.won,
        course_key = excluded.course_key,
        golfer_name= excluded.golfer_name,
        display_name = excluded.display_name,
        skills     = excluded.skills,
        decisions  = excluded.decisions,
        created_at = now()
    where excluded.to_par < public.runtour_daily_scores.to_par   -- only when it's actually better
  returning id into v_id;
  return v_id;   -- null if the existing score was already as good or better
end; $$;

-- ---------------------------------------------------------------------------
-- today's global board: lowest to_par for a given day, top N
-- ---------------------------------------------------------------------------
create or replace function public.runtour_daily_board(p_day int, p_limit int default 50)
returns table(rank int, user_id uuid, display_name text, golfer_name text,
              course_key text, ovr int, to_par int, won boolean)
language sql stable security definer set search_path = public as $$
  select (row_number() over (order by s.to_par asc, s.created_at asc))::int as rank,
         s.user_id, s.display_name, s.golfer_name, s.course_key, s.ovr, s.to_par, s.won
  from public.runtour_daily_scores s
  where s.day = p_day
  order by s.to_par asc, s.created_at asc
  limit greatest(1, least(200, coalesce(p_limit, 50)));
$$;

-- ---------------------------------------------------------------------------
-- all-time course records: the lowest round ever at each course + its holder
-- ---------------------------------------------------------------------------
create or replace function public.runtour_course_records()
returns table(course_key text, user_id uuid, display_name text, golfer_name text,
              to_par int, ovr int, day int)
language sql stable security definer set search_path = public as $$
  select distinct on (s.course_key)
         s.course_key, s.user_id, s.display_name, s.golfer_name, s.to_par, s.ovr, s.day
  from public.runtour_daily_scores s
  order by s.course_key, s.to_par asc, s.created_at asc;
$$;

-- ---------------------------------------------------------------------------
-- this user's own submitted round for a day (to reconcile local vs server)
-- ---------------------------------------------------------------------------
create or replace function public.runtour_my_daily(p_day int)
returns table(course_key text, to_par int, ovr int, won boolean)
language sql stable security definer set search_path = public as $$
  select course_key, to_par, ovr, won
  from public.runtour_daily_scores
  where user_id = auth.uid() and day = p_day;
$$;

-- ---------------------------------------------------------------------------
-- grants — boards/records are public (anon + authenticated read); submit needs login
-- ---------------------------------------------------------------------------
revoke all on function public.runtour_submit_daily(int,text,int,int,boolean,text,jsonb,jsonb) from public;
grant execute on function public.runtour_submit_daily(int,text,int,int,boolean,text,jsonb,jsonb) to authenticated;
grant execute on function public.runtour_daily_board(int,int)    to anon, authenticated;
grant execute on function public.runtour_course_records()        to anon, authenticated;
grant execute on function public.runtour_my_daily(int)           to authenticated;
