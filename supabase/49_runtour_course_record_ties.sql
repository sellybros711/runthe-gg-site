-- ============================================================================
-- 49_runtour_course_record_ties.sql — course records can be TIED (co-held)
-- ============================================================================
-- The old runtour_course_records() used `distinct on (course_key)` so exactly ONE
-- player held each course record — anyone who tied the low score was excluded.
-- This redefines it to return EVERY player tied for the lowest score at each
-- course (one row per co-holder, earliest-achieved first), deduped so a player
-- who tied the record on multiple days appears once. Same return columns, so it's
-- a drop-in: the client groups the rows by course_key and lists all holders.
-- Covers the daily (default), Legend (p_legend), and Spotlight (p_spotlight)
-- record boards, same as before. Apply in the Supabase SQL editor AFTER
-- 45_runtour_spotlight.sql. Idempotent: safe to re-run.
-- ----------------------------------------------------------------------------

create or replace function public.runtour_course_records(
  p_legend boolean default false, p_spotlight boolean default false)
returns table(course_key text, user_id uuid, display_name text, golfer_name text,
              to_par int, ovr int, day int)
language sql stable security definer set search_path = public as $$
  with scoped as (
    select s.*
    from public.runtour_daily_scores s
    where s.is_legend    = coalesce(p_legend, false)
      and s.is_spotlight = coalesce(p_spotlight, false)
  ),
  best as (   -- the lowest score posted at each course
    select course_key, min(to_par) as best_par
    from scoped
    group by course_key
  ),
  ties as (   -- every co-holder, deduped to their earliest achievement of that low score
    select distinct on (s.course_key, s.user_id)
           s.course_key, s.user_id, s.display_name, s.golfer_name, s.to_par, s.ovr, s.day, s.created_at
    from scoped s
    join best b on b.course_key = s.course_key and s.to_par = b.best_par
    order by s.course_key, s.user_id, s.created_at asc
  )
  select course_key, user_id, display_name, golfer_name, to_par, ovr, day
  from ties
  order by course_key, created_at asc;   -- earliest holder first
$$;

grant execute on function public.runtour_course_records(boolean,boolean) to anon, authenticated;
