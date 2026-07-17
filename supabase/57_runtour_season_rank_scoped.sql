-- CS413: season-rank on TODAY's + THIS WEEK's + ALL-TIME season boards.
-- The season summary shows where this season's earnings rank among seasons posted today, this week, and
-- of all time. The two window boundaries are passed from the client (which knows the game's ET day/week),
-- both nullable so the old 1-arg call still resolves (Postgres default args) and returns just all-time.
-- Backward compatible: the return keeps rank/total (all-time) as the first columns the existing client reads,
-- and adds today_rank/today_total/week_rank/week_total.
-- Drop the old 1-arg version from migration 37 first, else a 1-arg call is ambiguous with the new defaulted
-- 3-arg one (and a 1-arg call still resolves to the 3-arg via its default nulls). Also lets the return-shape change.
drop function if exists public.runtour_season_rank(bigint);
create or replace function public.runtour_season_rank(
  p_earnings    bigint,
  p_since_today timestamptz default null,
  p_since_week  timestamptz default null
)
returns table(
  rank bigint, total bigint,
  today_rank bigint, today_total bigint,
  week_rank bigint, week_total bigint
)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.runtour_scores where season_earnings > coalesce(p_earnings,0)) + 1,
    (select count(*) from public.runtour_scores),
    case when p_since_today is null then null else
      (select count(*) from public.runtour_scores where created_at >= p_since_today and season_earnings > coalesce(p_earnings,0)) + 1 end,
    case when p_since_today is null then null else
      (select count(*) from public.runtour_scores where created_at >= p_since_today) end,
    case when p_since_week is null then null else
      (select count(*) from public.runtour_scores where created_at >= p_since_week and season_earnings > coalesce(p_earnings,0)) + 1 end,
    case when p_since_week is null then null else
      (select count(*) from public.runtour_scores where created_at >= p_since_week) end;
$$;

grant execute on function public.runtour_season_rank(bigint, timestamptz, timestamptz) to anon, authenticated;
