-- ---------------------------------------------------------------------------
-- 115_fantasy_snapshot_norm.sql
--
-- The Worker has been sending a field that does not exist, and PostgREST has
-- been throwing it away on every insert without a word.
--
--
-- WHAT WAS ACTUALLY HAPPENING
-- ---------------------------------------------------------------------------
-- parse.mjs builds every snapshot row with player_name_norm on it, and has
-- since the day it was written. 110 never declared that column. The 192 real
-- quotes collected on 24 September stored perfectly, the poller reported
-- success, and the normalised name, the ONE field a stored quote needs in
-- order ever to find its player, was discarded at the door.
--
-- Nothing threw. The insert returned 201. It was found only because
-- fantasy_resolve_names() tried to join on the column and came back
-- 42703 "column s.player_name_norm does not exist", which is the third time
-- this week a real failure has been visible only because something downstream
-- asked a question the write itself never did.
--
--
-- WHY NOT NORMALISE IN SQL AND SKIP THE COLUMN
-- ---------------------------------------------------------------------------
-- Because that is a THIRD implementation of the name rule.
--
-- It already exists twice by necessity: normName() in a Cloudflare Worker and
-- norm_name() in Python, pinned against each other by
-- fantasy/lib/name-fixture.json because the hot path and the cold path cannot
-- share a runtime. A generated column here would add a third, in a third
-- dialect, with its own view of what \b means, and nothing in the fixture can
-- reach it. The whole join in this product is a string equality between these
-- implementations. Two is the minimum. Three is a choice.
--
-- So the column is plain text, written by the one process that already knows
-- the answer.
--
--
-- THE BACKFILL COMES FROM fantasy_unmatched_players, AND THAT IS THE ONLY
-- HONEST SOURCE THERE IS
-- ---------------------------------------------------------------------------
-- The 192 rows already stored have no norm on them and it cannot be computed
-- here for the reason above. But the Worker ALSO wrote an unmatched row for
-- each of those names, carrying name_raw and name_norm together, produced by
-- the real normaliser at the moment the quote arrived.
--
-- So that table is a raw-to-normalised dictionary written by the authority,
-- and joining through it recovers the field without anybody guessing. Rows it
-- cannot cover keep a null norm and are picked up by nothing, which is the
-- right outcome: a guess here attaches somebody's numbers to another player.
--
--
-- THE INDEX IS PARTIAL ON PURPOSE
-- ---------------------------------------------------------------------------
-- fantasy_resolve_names() only ever reads rows with no player_id, and once the
-- crosswalk is warm that is a small and shrinking slice of a table that grows
-- by thousands a week. A full index would be mostly rows the resolver will
-- never look at again.
-- ---------------------------------------------------------------------------

-- On a partitioned table this propagates to every partition, existing and
-- future. if not exists so re-running is a no-op.
alter table public.fantasy_odds_snapshots
  add column if not exists player_name_norm text;

comment on column public.fantasy_odds_snapshots.player_name_norm is
  'Lowercased, suffix-stripped name, written by normName() in the Worker. '
  'NEVER computed in SQL: the rule already exists twice by necessity and '
  'fantasy/lib/name-fixture.json is what holds those two together. A third '
  'implementation here could not be covered by it.';

create index if not exists fantasy_odds_unattributed
  on public.fantasy_odds_snapshots (player_name_norm)
  where player_id is null;

-- Recover the field for everything already stored. Idempotent: it only ever
-- writes where the norm is still null.
update public.fantasy_odds_snapshots s
   set player_name_norm = u.name_norm
  from public.fantasy_unmatched_players u
 where s.player_name_norm is null
   and s.player_name_raw = u.name_raw;

-- ---------------------------------------------------------------------------
-- And 114's function, which referenced the column before it existed.
-- Unchanged apart from now being able to run.
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

revoke all on function public.fantasy_resolve_names() from public;
grant execute on function public.fantasy_resolve_names() to service_role;
