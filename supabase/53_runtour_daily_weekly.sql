-- ============================================================================
-- 53_runtour_daily_weekly.sql — Daily + Weekly leaderboard tabs (with golfers)
-- ============================================================================
-- Two things:
--   1. A `look` jsonb column on runtour_daily_scores (golfer appearance), threaded
--      through runtour_submit_daily and returned by runtour_daily_board, so the
--      Daily leaderboard tab can show each player's customized golfer on the podium.
--   2. A NEW runtour_daily_week_board(p_from, p_to, p_limit) that aggregates the
--      REGULAR daily rounds (is_legend=false, is_spotlight=false) over a day range
--      [p_from..p_to] into a weekly board: per player, ranked by cumulative to-par
--      (most under par wins), with days-played, best round, and their golfer look.
--
-- The client passes the min/max packed day keys (YYYYMMDD ints) of the current
-- weekly-challenge week window, so the Weekly board rotates on the same cadence.
-- Fully backward compatible + fail-open: p_look defaults null (default golfer),
-- the client tries submit WITH p_look and falls back WITHOUT, and the Weekly tab
-- degrades gracefully if this RPC isn't present yet.
-- Apply in the Supabase SQL editor AFTER 45_runtour_spotlight.sql and
-- 49_runtour_course_record_ties.sql. Idempotent.
-- ----------------------------------------------------------------------------

alter table public.runtour_daily_scores add column if not exists look jsonb;

-- ---- submit: add p_look (insert + carry on the keep-the-lower upsert) ----
drop function if exists public.runtour_submit_daily(int,text,int,int,boolean,text,jsonb,jsonb,boolean,boolean);

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
  p_is_spotlight boolean default false,
  p_look        jsonb   default null
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
    user_id, display_name, golfer_name, day, course_key, to_par, ovr, won, skills, decisions, is_legend, is_spotlight, look)
  values (
    v_uid, v_name,
    coalesce(nullif(left(regexp_replace(coalesce(p_golfer,''), '[<>&]', '', 'g'), 24), ''), 'Your Golfer'),
    p_day,
    left(regexp_replace(coalesce(p_course,''), '[<>&]', '', 'g'), 48),
    v_topar, v_ovr, coalesce(p_won, false), p_skills, p_decisions,
    coalesce(p_is_legend, false), coalesce(p_is_spotlight, false), p_look)
  on conflict (user_id, day, is_legend, is_spotlight) do update
    set to_par     = excluded.to_par,
        ovr        = excluded.ovr,
        won        = excluded.won,
        course_key = excluded.course_key,
        golfer_name= excluded.golfer_name,
        display_name = excluded.display_name,
        skills     = excluded.skills,
        decisions  = excluded.decisions,
        look       = excluded.look,
        created_at = now()
    where excluded.to_par < public.runtour_daily_scores.to_par
  returning id into v_id;
  return v_id;
end; $$;

-- ---- today's board: return `look` ----
drop function if exists public.runtour_daily_board(int,int,boolean,boolean);

create or replace function public.runtour_daily_board(
  p_day int, p_limit int default 50, p_legend boolean default false, p_spotlight boolean default false)
returns table(rank int, user_id uuid, display_name text, golfer_name text,
              course_key text, ovr int, to_par int, won boolean, look jsonb)
language sql stable security definer set search_path = public as $$
  select (row_number() over (order by s.to_par asc, s.created_at asc))::int as rank,
         s.user_id, s.display_name, s.golfer_name, s.course_key, s.ovr, s.to_par, s.won, s.look
  from public.runtour_daily_scores s
  where s.day = p_day
    and s.is_legend    = coalesce(p_legend, false)
    and s.is_spotlight = coalesce(p_spotlight, false)
  order by s.to_par asc, s.created_at asc
  limit greatest(1, least(200, coalesce(p_limit, 50)));
$$;

-- ---- NEW: weekly board — aggregate regular daily rounds over a day range ----
create or replace function public.runtour_daily_week_board(
  p_from int, p_to int, p_limit int default 50)
returns table(rank int, user_id uuid, display_name text, golfer_name text,
              days_played int, total_to_par int, best_to_par int, ovr int, look jsonb)
language sql stable security definer set search_path = public as $$
  with agg as (
    select s.user_id,
           (array_agg(s.display_name order by s.day desc))[1] as display_name,
           (array_agg(s.golfer_name  order by s.day desc))[1] as golfer_name,
           (array_agg(s.look         order by s.day desc))[1] as look,
           (array_agg(s.ovr          order by s.day desc))[1] as ovr,
           count(*)::int              as days_played,
           sum(s.to_par)::int         as total_to_par,
           min(s.to_par)::int         as best_to_par
    from public.runtour_daily_scores s
    where s.day between least(p_from,p_to) and greatest(p_from,p_to)
      and s.is_legend = false and s.is_spotlight = false
      and s.user_id is not null
    group by s.user_id
  ), numbered as (
    select (row_number() over (order by total_to_par asc, days_played desc, best_to_par asc))::int as rank,
           user_id, display_name, golfer_name, days_played, total_to_par, best_to_par, ovr, look
    from agg
  )
  select rank, user_id, display_name, golfer_name, days_played, total_to_par, best_to_par, ovr, look
  from numbered
  order by rank
  limit greatest(1, least(200, coalesce(p_limit, 50)));
$$;

-- ---- grants ----
revoke all on function public.runtour_submit_daily(int,text,int,int,boolean,text,jsonb,jsonb,boolean,boolean,jsonb) from public;
grant execute on function public.runtour_submit_daily(int,text,int,int,boolean,text,jsonb,jsonb,boolean,boolean,jsonb) to authenticated;
grant execute on function public.runtour_daily_board(int,int,boolean,boolean)        to anon, authenticated;
grant execute on function public.runtour_daily_week_board(int,int,int)               to anon, authenticated;
