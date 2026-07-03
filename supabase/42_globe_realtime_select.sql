-- ============================================================================
-- 42_globe_realtime_select.sql  —  enable realtime for RunTheGlobe online
-- ============================================================================
-- 41_globe_online.sql locks the globe_* tables with RLS and NO policies, so all
-- ACCESS goes through SECURITY DEFINER RPCs. That's good for writes, but Supabase
-- Realtime only delivers a `postgres_changes` event to a client that is allowed
-- to SELECT the changed row under RLS. With no SELECT policy, realtime delivers
-- NOTHING and the client silently falls back to 3.5s polling.
--
-- This migration adds READ-ONLY policies so live lobby / leaderboard updates push
-- instantly. Writes stay fully locked: there are still NO insert/update/delete
-- policies, so the only way to change these tables is the SECURITY DEFINER
-- functions from 41 (which enforce all the rules). Lobby/team/stage rows are not
-- sensitive (team names, flags, times), so world-readable is fine — the same
-- posture as the public leaderboard.
--
-- Idempotent. Run after 41_globe_online.sql.
-- ----------------------------------------------------------------------------

drop policy if exists globe_lobbies_read on globe_lobbies;
create policy globe_lobbies_read on globe_lobbies for select using (true);

drop policy if exists globe_teams_read on globe_teams;
create policy globe_teams_read on globe_teams for select using (true);

drop policy if exists globe_stage_read on globe_stage;
create policy globe_stage_read on globe_stage for select using (true);

-- (Re)ensure the tables are in the realtime publication — safe to re-run.
do $$
begin
  begin execute 'alter publication supabase_realtime add table globe_lobbies'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table globe_teams';   exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table globe_stage';   exception when others then null; end;
end $$;
