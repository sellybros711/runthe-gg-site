-- CS483t: rank a completed CAREER on TODAY's + THIS WEEK's + all-time career boards, by total career
-- earnings (the sum of that career's posted season earnings) - mirroring runtour_season_rank (migration 57)
-- but AGGREGATED per career (user_id + career_id, matching runtour_career_board's grouping). A career's
-- "when" for the today/week windows is its COMPLETION time = the latest created_at among its seasons, so a
-- career finished today counts as "today". Window boundaries come from the client (the game's ET day start
-- and the UTC week block); both nullable so a 1-arg call resolves via defaults and returns just all-time.
-- Returns rank/total (all-time) first, then today_rank/today_total, week_rank/week_total.
-- Grant to anon + authenticated for parity with the boards (career mode requires an account anyway).
-- Apply in the Supabase SQL editor AFTER 58_runtour_board_scoped.sql. Idempotent. The client tries the
-- 3-arg call and falls back to 1-arg on error, so deploying the client before this migration is safe (the
-- career-rank card just doesn't appear until the RPC exists).
-- ----------------------------------------------------------------------------

drop function if exists public.runtour_career_rank(bigint);

create or replace function public.runtour_career_rank(
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
  with per_career as (
    select sum(s.season_earnings)::bigint as earnings,
           max(s.created_at)              as done_at
    from public.runtour_scores s
    group by s.user_id, coalesce(s.career_id, 'legacy:'||s.id::text)
  )
  select
    (select count(*) from per_career where earnings > coalesce(p_earnings,0)) + 1,
    (select count(*) from per_career),
    case when p_since_today is null then null else
      (select count(*) from per_career where done_at >= p_since_today and earnings > coalesce(p_earnings,0)) + 1 end,
    case when p_since_today is null then null else
      (select count(*) from per_career where done_at >= p_since_today) end,
    case when p_since_week is null then null else
      (select count(*) from per_career where done_at >= p_since_week and earnings > coalesce(p_earnings,0)) + 1 end,
    case when p_since_week is null then null else
      (select count(*) from per_career where done_at >= p_since_week) end;
$$;

grant execute on function public.runtour_career_rank(bigint, timestamptz, timestamptz) to anon, authenticated;
