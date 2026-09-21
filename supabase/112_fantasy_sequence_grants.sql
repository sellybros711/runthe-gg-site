-- ---------------------------------------------------------------------------
-- 112_fantasy_sequence_grants.sql
--
-- The Worker could not insert a single row, and the reason was one grant.
--
--
-- WHAT ACTUALLY HAPPENED
-- ---------------------------------------------------------------------------
-- The poller ticked every minute for an hour. Cloudflare reported 184
-- successful invocations and zero errors. fantasy_events filled up with all
-- seventeen games. fantasy_poll_runs stayed empty, and the status query said
-- "NEVER. No tick has ever written a row."
--
-- Every insert was coming back:
--
--   403 {"code":"42501","message":"permission denied for sequence
--        fantasy_poll_runs_id_seq"}
--
-- BYPASSRLS IS NOT A BYPASS OF PRIVILEGES, and believing otherwise is the
-- whole bug. service_role skips row level security. It does not skip ordinary
-- table, function or sequence grants: those are a separate mechanism and
-- nothing about the role touches them. 111 carried a comment asserting the
-- opposite in as many words, which is why nobody looked here.
--
-- A `bigserial` column is `integer` plus a `DEFAULT nextval('...')`, and
-- nextval is a privileged operation on the sequence. So a role can hold INSERT
-- on the table, be handed a row with no id in it, and be refused at the
-- default. The table grant and the sequence grant are two grants, and only one
-- of them arrived.
--
--
-- WHY fantasy_events HID IT, WHICH IS THE PART WORTH REMEMBERING
-- ---------------------------------------------------------------------------
-- Its primary key is `event_id text`, supplied by the odds provider. No
-- sequence, no nextval, no grant needed. It is also the FIRST table the sweep
-- writes to, so it was the table everybody pointed at to prove the service key
-- worked. The one table that could not have caught this was the one used as
-- evidence that there was nothing to catch.
--
--
-- WHAT THIS WOULD HAVE COST IN LIVE MODE
-- ---------------------------------------------------------------------------
-- Five tables here have a bigserial primary key, and fantasy_odds_snapshots is
-- one of them. So a live poller would have spent credits on every sweep and
-- stored nothing at all: the product's entire input, refused, with the run log
-- that would have said so refused by the same grant.
--
--
-- IT IS WRITTEN OVER THE CATALOG RATHER THAN AS A LIST OF NAMES
-- ---------------------------------------------------------------------------
-- A hand written list is a second copy of the answer and drifts the first time
-- somebody adds a table. This asks which sequences exist and grants on all of
-- them, so a table added in 113 is covered by re-running this file rather than
-- by anybody remembering it is here.
--
-- It is scoped to `fantasy%` because everything this feature owns carries that
-- prefix, and the brief requires the whole thing be removable in one pass.
--
-- Re-running it is a no-op. GRANT is idempotent.
--
--
-- ONLY service_role, AND DELIBERATELY NOT authenticated
-- ---------------------------------------------------------------------------
-- Nothing in a browser writes to any of these tables. Every fantasy_ table is
-- FORCE ROW LEVEL SECURITY with a read policy and no write policy, and the
-- preflight asserts that nobody has a write policy at all. A sequence grant to
-- authenticated would hand a signed in browser the ability to burn ids on a
-- table it cannot insert into, which is useless to them and is the kind of
-- grant that becomes load bearing later by accident.
-- ---------------------------------------------------------------------------

do $$
declare
  s record;
  n int := 0;
begin
  for s in
    select schemaname, sequencename
      from pg_sequences
     where schemaname = 'public'
       and sequencename like 'fantasy%'
  loop
    execute format('grant usage, select on sequence %I.%I to service_role',
                   s.schemaname, s.sequencename);
    n := n + 1;
  end loop;

  -- LOUD IF IT FOUND NOTHING. A loop over an empty set is a successful run
  -- that granted nothing, which is exactly what this file exists to stop being
  -- invisible. Five sequences is what 110 and 111 create today.
  if n = 0 then
    raise exception 'no fantasy sequences found. Did 110 and 111 actually run?';
  end if;

  raise notice 'granted usage on % fantasy sequences to service_role', n;
end $$;

-- AND THE SAME FOR ANYTHING ADDED LATER, so the next table does not repeat
-- this. Default privileges apply to objects created FROM NOW ON by the role
-- that runs this, which for a migration pasted into the Supabase SQL editor is
-- the same role that will create the next one.
--
-- This is a safety net and not the fix. The loop above is the fix, because
-- default privileges do nothing for the five sequences that already exist,
-- which is the trap this whole file is about.
alter default privileges in schema public
  grant usage, select on sequences to service_role;

-- ---------------------------------------------------------------------------
-- Read it back. Anything false here means the Worker still cannot write.
-- ---------------------------------------------------------------------------
select sequencename as sequence,
       has_sequence_privilege('service_role', schemaname || '.' || sequencename, 'USAGE')
         as "service_role can use it"
  from pg_sequences
 where schemaname = 'public'
   and sequencename like 'fantasy%'
 order by sequencename;
