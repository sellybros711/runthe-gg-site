-- ============================================================================
-- 32_runtour_launch_reset.sql — clear the leaderboard for public launch
-- ============================================================================
-- Run in the Supabase SQL editor. Affects ONLY the runtour_* tables (the golf
-- game); the other game's tables are untouched. Wipes every posted season/
-- career (runtour_scores), synced lifetime stats/badges (runtour_stats), and
-- every daily-challenge round + course record (runtour_daily_scores) — a
-- clean slate for public launch.
--
-- IMPORTANT — run this AFTER the client fix in the same deploy that corrects
-- the season/daily submission bug (flushPendingSeasons/sbSubmitDaily weren't
-- checking the RPC's returned `error`, so a rejected submission looked
-- identical to a successful one and was silently dropped instead of retried).
-- Wiping first and finding out the submit path is still broken would just
-- leave the fresh board empty forever — confirm a newly completed season
-- posts correctly before running this.
--
-- This does NOT touch any player's local device data (career saves, streaks,
-- achievements) — that's a separate, much bigger lever (RESET_ENABLED /
-- RESET_EPOCH in build-a-golfer.html) not part of this launch-prep wipe.
-- ----------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.runtour_scores')       is not null then truncate table public.runtour_scores; end if;
  if to_regclass('public.runtour_stats')        is not null then truncate table public.runtour_stats; end if;
  if to_regclass('public.runtour_daily_scores') is not null then truncate table public.runtour_daily_scores; end if;
end $$;
