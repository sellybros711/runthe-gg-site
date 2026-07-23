-- ============================================================================
-- 67_runtour_course_records_look.sql — course records return each holder's LOOK
-- ============================================================================
-- Owner: the Daily result screen's course-record bubble shows the record
-- holder's full pixel golfer "to make it more of something worth playing for".
-- The record IS a runtour_daily_scores row, which has stored `look` since 53_,
-- but runtour_course_records never returned it. This appends `look jsonb` to
-- the return shape (drop + recreate — return-type change; deployed clients
-- read fields by name, so the extra column is harmless). Body otherwise
-- identical to 49_ (tied co-holders, earliest first; legend/spotlight scoping).
-- Cheap: one grouped row set per course, never a full-table jsonb sort.
-- Safe + idempotent. Run AFTER 49 and 53.
-- ============================================================================

drop function if exists public.runtour_course_records(boolean,boolean);

create function public.runtour_course_records(
  p_legend boolean default false, p_spotlight boolean default false)
returns table(course_key text, user_id uuid, display_name text, golfer_name text,
              to_par int, ovr int, day int, look jsonb)
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
           s.course_key, s.user_id, s.display_name, s.golfer_name, s.to_par, s.ovr, s.day, s.look, s.created_at
    from scoped s
    join best b on b.course_key = s.course_key and s.to_par = b.best_par
    order by s.course_key, s.user_id, s.created_at asc
  )
  select course_key, user_id, display_name, golfer_name, to_par, ovr, day, look
  from ties
  order by course_key, created_at asc;   -- earliest holder first
$$;

grant execute on function public.runtour_course_records(boolean,boolean) to anon, authenticated;
