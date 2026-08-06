-- ===========================================================================
-- 73_runtour_pass_epoch_launch.sql  —  Season 1 starts on STORE LAUNCH DAY
-- ===========================================================================
-- OWNER DECISION (2026-08-05, go-live night): the Tour Pass 60-day season
-- clock resets so Season 1 Day 1 = Aug 6 2026 (US Eastern), the public store
-- launch day. Without this, launch-day buyers would join a Season 1 that
-- began Jul 1 with only ~23 days left.
--
-- This redefines ONLY runtour_pass_season() from migration 72 with the new
-- epoch (every other pass function calls this helper, so nothing else changes).
-- The client constant TOURPASS_EPOCH was updated to Aug 6 in the same deploy —
-- the two MUST always match.
--
-- Dev-account note: test passes bought against the old epoch stored period
-- 'S1'; the launch season is also 'S1'. Those test purchases were refunded
-- (pass revoked server-side), so no live entitlement carries over. Dev local
-- track state (bag_tourpass season 1) persists for dev accounts only.
--
-- Run AFTER 72. Idempotent — safe to re-run.
-- ===========================================================================

create or replace function runtour_pass_season(p_at timestamptz default now())
returns table (season int, season_day int, days_left int, period text)
language sql stable security definer set search_path = public as $$
  with e as (
    select greatest(0, (p_at at time zone 'America/New_York')::date
                       - date '2026-08-06')::int as el
  )
  select (el / 60) + 1                as season,
         (el % 60) + 1               as season_day,
         60 - (el % 60)              as days_left,
         'S' || ((el / 60) + 1)::text as period
  from e;
$$;
revoke all on function runtour_pass_season(timestamptz) from public;
grant execute on function runtour_pass_season(timestamptz) to authenticated, service_role;
