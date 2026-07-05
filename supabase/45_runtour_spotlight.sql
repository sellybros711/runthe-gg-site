-- ============================================================================
-- 45_runtour_spotlight.sql  —  Monthly Spotlight → server-based board + records
-- ============================================================================
-- The Monthly Spotlight (a special weeklong event on a marquee course, tough
-- weather) previously stored its scores ONLY in the browser (bag_special) and
-- never reached the public board or course records. This makes the Spotlight
-- fully server-based, mirroring the Daily Challenge / Legend plumbing:
--   • an `is_spotlight` flag on runtour_daily_scores (like `is_legend`)
--   • runtour_daily_board(day, limit, legend, spotlight)   — spotlight's own board
--   • runtour_course_records(legend, spotlight)            — spotlight's own records
--
-- A Spotlight round is submitted with p_day = the spotlight's live date key and
-- p_is_spotlight = true, so it lives on its OWN board (separate from the regular
-- daily on the same calendar day) and its OWN course-record bucket (fair — the
-- Spotlight is played in forced tough weather, so it must not mix with the normal
-- daily records for the same course).
--
-- IMPORTANT — uniqueness fix: the old `unique(user_id, day)` meant a legend or
-- spotlight round on the SAME calendar day as the regular daily would collide and
-- overwrite it. This widens the key to (user_id, day, is_legend, is_spotlight) so
-- the three round types coexist per day (also fixes the latent legend/human clash).
--
-- Same integrity posture as 24/30: name attributed from `profiles`, to_par clamped
-- to an OVR-scaled floor, all writes via SECURITY DEFINER. Idempotent; apply in the
-- Supabase SQL editor AFTER 24_runtour_daily.sql and 30_runtour_legend.sql.
-- ----------------------------------------------------------------------------

alter table public.runtour_daily_scores add column if not exists is_spotlight boolean not null default false;
create index if not exists runtour_daily_spotlight_idx on public.runtour_daily_scores (day, is_spotlight, to_par);

-- widen uniqueness so daily / legend / spotlight rounds on the same day coexist
alter table public.runtour_daily_scores drop constraint if exists runtour_daily_scores_user_id_day_key;
create unique index if not exists runtour_daily_uniq on public.runtour_daily_scores (user_id, day, is_legend, is_spotlight);

-- ---------------------------------------------------------------------------
-- submit (upsert) — now also carries is_spotlight; upsert on the widened key
-- ---------------------------------------------------------------------------
drop function if exists public.runtour_submit_daily(int,text,int,int,boolean,text,jsonb,jsonb,boolean);

create or replace function public.runtour_submit_daily(
  p_day         int,
  p_course      text,
  p_to_par      int,
  p_ovr         int,
  p_won         boolean default false,
  p_golfer      text    default 'Your Golfer',
  p_skills      jsonb   default null,
  p_decisions   jsonb   default null,
  p_is_legend   boolean default false,
  p_is_spotlight boolean default false
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text;
  v_ovr   int  := greatest(40, least(99, coalesce(p_ovr, 80)));
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
    user_id, display_name, golfer_name, day, course_key, to_par, ovr, won, skills, decisions, is_legend, is_spotlight)
  values (
    v_uid, v_name,
    coalesce(nullif(left(regexp_replace(coalesce(p_golfer,''), '[<>&]', '', 'g'), 24), ''), 'Your Golfer'),
    p_day,
    left(regexp_replace(coalesce(p_course,''), '[<>&]', '', 'g'), 48),
    v_topar, v_ovr, coalesce(p_won, false), p_skills, p_decisions,
    coalesce(p_is_legend, false), coalesce(p_is_spotlight, false))
  on conflict (user_id, day, is_legend, is_spotlight) do update
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
-- today's board — filterable by legend AND spotlight (both default false = human daily)
-- ---------------------------------------------------------------------------
drop function if exists public.runtour_daily_board(int,int,boolean);

create or replace function public.runtour_daily_board(
  p_day int, p_limit int default 50, p_legend boolean default false, p_spotlight boolean default false)
returns table(rank int, user_id uuid, display_name text, golfer_name text,
              course_key text, ovr int, to_par int, won boolean)
language sql stable security definer set search_path = public as $$
  select (row_number() over (order by s.to_par asc, s.created_at asc))::int as rank,
         s.user_id, s.display_name, s.golfer_name, s.course_key, s.ovr, s.to_par, s.won
  from public.runtour_daily_scores s
  where s.day = p_day
    and s.is_legend    = coalesce(p_legend, false)
    and s.is_spotlight = coalesce(p_spotlight, false)
  order by s.to_par asc, s.created_at asc
  limit greatest(1, least(200, coalesce(p_limit, 50)));
$$;

-- ---------------------------------------------------------------------------
-- all-time course records — filterable by legend AND spotlight
-- ---------------------------------------------------------------------------
drop function if exists public.runtour_course_records(boolean);

create or replace function public.runtour_course_records(
  p_legend boolean default false, p_spotlight boolean default false)
returns table(course_key text, user_id uuid, display_name text, golfer_name text,
              to_par int, ovr int, day int)
language sql stable security definer set search_path = public as $$
  select distinct on (s.course_key)
         s.course_key, s.user_id, s.display_name, s.golfer_name, s.to_par, s.ovr, s.day
  from public.runtour_daily_scores s
  where s.is_legend    = coalesce(p_legend, false)
    and s.is_spotlight = coalesce(p_spotlight, false)
  order by s.course_key, s.to_par asc, s.created_at asc;
$$;

-- ---------------------------------------------------------------------------
-- my best round for a day — filterable by legend AND spotlight
-- ---------------------------------------------------------------------------
drop function if exists public.runtour_my_daily(int);

create or replace function public.runtour_my_daily(
  p_day int, p_legend boolean default false, p_spotlight boolean default false)
returns table(course_key text, to_par int, ovr int, won boolean)
language sql stable security definer set search_path = public as $$
  select s.course_key, s.to_par, s.ovr, s.won
  from public.runtour_daily_scores s
  where s.user_id = auth.uid() and s.day = p_day
    and s.is_legend    = coalesce(p_legend, false)
    and s.is_spotlight = coalesce(p_spotlight, false)
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- grants
-- ---------------------------------------------------------------------------
revoke all on function public.runtour_submit_daily(int,text,int,int,boolean,text,jsonb,jsonb,boolean,boolean) from public;
grant execute on function public.runtour_submit_daily(int,text,int,int,boolean,text,jsonb,jsonb,boolean,boolean) to authenticated;
grant execute on function public.runtour_daily_board(int,int,boolean,boolean)  to anon, authenticated;
grant execute on function public.runtour_course_records(boolean,boolean)       to anon, authenticated;
grant execute on function public.runtour_my_daily(int,boolean,boolean)         to authenticated;
