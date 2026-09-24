-- ---------------------------------------------------------------------------
-- 114_fantasy_resolve.sql : attach stored quotes to players, set based
--
-- The crosswalk arrives AFTER the quotes do, and that is the normal case
-- rather than a mistake. 192 real quotes were collected before
-- fantasy_players had a single row in it, every one stored with player_id
-- null, because parse.mjs deliberately keeps a quote it cannot attribute:
-- "throwing the data away is how you end up unable to backfill once somebody
-- works out who it was."
--
-- This is the working out. It runs at the end of every pipeline run, so a
-- player added to the crosswalk today collects the quotes that were already
-- waiting for him.
--
--
-- WHY IT IS A FUNCTION AND NOT A LOOP IN THE PIPELINE
-- ---------------------------------------------------------------------------
-- The pipeline speaks PostgREST, which is one HTTP request per statement. The
-- obvious client side shape is "for each player, patch the snapshots whose
-- name matches", which is a thousand round trips to do one join. Worse, it
-- races the poller: a sweep landing mid-loop writes rows the loop has already
-- passed, and they stay null until the next run with nothing saying so.
--
-- One statement, one join, one moment.
--
--
-- IT NEVER OVERWRITES AN ATTRIBUTION
-- ---------------------------------------------------------------------------
-- `where player_id is null` on both updates. A row that already names a player
-- was attributed by the Worker against the crosswalk as it stood, and if the
-- crosswalk later changes its mind about a name, silently rewriting history is
-- the worst way to find out. The alias table is where a correction belongs,
-- and a re-attribution should be a deliberate act with its own migration.
--
--
-- THE COUNTS ARE RETURNED RATHER THAN LOGGED
-- ---------------------------------------------------------------------------
-- The pipeline prints them and the workflow shows them, so a run that resolved
-- nothing is visible in the run itself. A function that did the work and said
-- nothing would make "the crosswalk is not matching" indistinguishable from
-- "there was nothing left to match", which is the pair of states this whole
-- feature has already spent two evenings failing to tell apart.
-- ---------------------------------------------------------------------------

create or replace function public.fantasy_resolve_names()
returns table (snapshots_attached bigint, unmatched_resolved bigint)
language plpgsql security definer set search_path = public as $$
declare
  v_snap bigint;
  v_unm  bigint;
begin
  with hit as (
    update public.fantasy_odds_snapshots s
       set player_id = a.player_id
      from public.fantasy_player_aliases a
     where s.player_id is null
       and s.player_name_norm = a.alias_norm
    returning 1
  )
  select count(*) into v_snap from hit;

  -- A RESOLVED ROW IS KEPT, NEVER DELETED, which is 110's own note on this
  -- table: the useful question a month from now is which spellings keep
  -- turning up, and a deleted row cannot answer it.
  with hit as (
    update public.fantasy_unmatched_players u
       set resolved_to = a.player_id
      from public.fantasy_player_aliases a
     where u.resolved_to is null
       and u.name_norm = a.alias_norm
    returning 1
  )
  select count(*) into v_unm from hit;

  return query select v_snap, v_unm;
end $$;

-- Service role only, and for 113's reason: Postgres grants EXECUTE on a new
-- function to PUBLIC, so this revoke is what keeps a browser out and the grant
-- under it is what lets the backend in. Written here as well as covered by
-- re-running 113, so this file stands on its own.
revoke all on function public.fantasy_resolve_names() from public;
grant execute on function public.fantasy_resolve_names() to service_role;
