-- ---------------------------------------------------------------------------
-- fantasy_status.sql : what is the poller actually doing?
--
-- Paste into the Supabase SQL editor, or run it through the "Fantasy: poller
-- status" workflow. It READS ONLY: no table is written, no function is called,
-- nothing is created.
--
--
-- WHY THIS EXISTS RATHER THAN READING THE WORKER LOG
-- ---------------------------------------------------------------------------
-- The Worker logs everything it decides, and Cloudflare's log is reachable by
-- exactly one thing: somebody with the dashboard open or wrangler installed.
-- Not by a workflow, not by anything reading the database, and not by anybody
-- looking at this an hour later, because a tail shows what happens next rather
-- than what already did.
--
-- So the durable record is in the database and this reads it back. Observe
-- mode writes one bookkeeping row per tick that had a plan, with the plan in
-- it, which is what makes a schedule checkable BEFORE it has spent anything.
--
--
-- HOW TO READ IT, TOP DOWN
-- ---------------------------------------------------------------------------
--   1  the budget      is anything being spent, and against what cap
--   2  the last ticks  is the Worker running at all, and in which mode
--   3  the plan        which games it would poll, and what that would cost
--   4  the schedule    every upcoming game and where the ladder puts it
--   5  the data        how much has actually been collected
--   6  the gaps        names it could not resolve, which is where a silent
--                      hole in the projections comes from
-- ---------------------------------------------------------------------------
\pset pager off

\echo ''
\echo '=== 1. THE BUDGET ================================================'
select period,
       credits_used   as used,
       credits_cap    as cap,
       credits_cap - credits_used as remaining,
       vendor_remaining as "provider says left",
       updated_at
  from public.fantasy_poll_budget
 order by period desc
 limit 3;

\echo ''
\echo '=== 2. THE LAST TICKS THAT DID SOMETHING ========================='
-- Only ticks with a row. A quiet tick writes nothing at all, by design, so an
-- empty table here means either nothing has been due or the Worker is not
-- running, and section 4 is what tells those two apart.
select id,
       started_at,
       coalesce(raw->>'mode', 'live') as mode,
       coalesce(raw->>'stage', 'poll') as stage,
       coalesce(event_id, '(none)') as event,
       credits_charged as credits,
       ok,
       left(coalesce(error, ''), 70) as error
  from public.fantasy_poll_runs
 order by started_at desc
 limit 20;

\echo ''
\echo '--- IS IT RUNNING AT ALL? ---'
-- The question the first status run could not answer, because a database with
-- no rows reads the same whether the Worker is ticking happily with nothing to
-- do, failing on every call, or not deployed. A heartbeat lands four times an
-- hour, so anything over about twenty minutes old means it has stopped.
--
-- NEVER DOES NOT PROVE THE WORKER IS DOWN, and the heartbeat cannot tell you
-- that it does, because the heartbeat is written to this same table. Every row
-- this section counts arrives through one insert, so a database that refuses
-- that insert reads exactly like a Worker that is not running: no heartbeat,
-- no failure row, no throw. That is the state this actually shipped in, for an
-- evening, while Cloudflare reported 184 successful ticks and zero errors.
--
-- The Worker log is the one channel that does not share the failure, and it is
-- persisted rather than a tail (observability is on in wrangler.toml). So NEVER
-- here plus successful ticks there means the WRITE is being refused, and
-- store.openRun.failed in the log carries the reason verbatim.
select coalesce(
         to_char(max(started_at), 'YYYY-MM-DD HH24:MI:SS'),
         'NEVER. No tick has ever written a row.') as "last sign of life",
       coalesce(
         round(extract(epoch from (now() - max(started_at))) / 60.0)::text || ' min ago',
         '') as "how long ago"
  from public.fantasy_poll_runs;

\echo ''
\echo '=== 3. WHAT THE LAST OBSERVE TICK WOULD HAVE POLLED =============='
-- The plan, unpacked. This is the number to look at before turning it live:
-- it is what the next tick would spend if it were allowed to.
select r.started_at,
       (p->>'matchup')   as matchup,
       (p->>'kickoff')::timestamptz as kickoff,
       round((p->>'hoursOut')::numeric, 2) as "hours out",
       (p->>'everyMin')  as "poll every (min)",
       (r.raw->>'creditsPerSweep') as "credits each",
       (r.raw->>'wouldHaveCharged') as "this tick would cost"
  from public.fantasy_poll_runs r
  cross join lateral jsonb_array_elements(r.raw->'plan') as p
 where r.raw->>'mode' = 'observe'
   and r.started_at = (select max(started_at) from public.fantasy_poll_runs
                        where raw->>'mode' = 'observe')
 order by (p->>'hoursOut')::numeric;

\echo ''
\echo '=== 4. EVERY UPCOMING GAME, AND WHERE THE LADDER PUTS IT ========='
-- THE LADDER IS DESCRIBED HERE IN SQL AND LIVES IN JAVASCRIPT, which makes
-- this a second copy of one answer and therefore a thing that drifts. It is
-- written anyway, and labelled, because the question it answers is "is the
-- Worker seeing the same games I am" and that needs no precision. Trust
-- section 3 for what it will actually do; this is orientation.
select away_team || ' at ' || home_team as matchup,
       commence_time as kickoff,
       round(extract(epoch from (commence_time - now())) / 3600.0, 1) as "hours out",
       case
         when commence_time <= now() then 'kicked off'
         when commence_time - now() > interval '72 hours' then 'not watched yet'
         when commence_time - now() > interval '12 hours' then 'every 6h'
         when commence_time - now() > interval '4 hours'  then 'every 1h'
         else 'EVERY 10 MIN'
       end as "lean ladder says",
       polling_closed as closed
  from public.fantasy_events
 where not polling_closed
 order by commence_time
 limit 20;

\echo ''
\echo '=== 5. WHAT HAS ACTUALLY BEEN COLLECTED =========================='
-- ATTRIBUTED IS THE COLUMN THAT WAS MISSING, and its absence hid a real
-- failure for a whole evening. "players_seen" counts distinct RAW names, so it
-- reads 16 whether every quote is attached to a player or none of them is. It
-- said 16 while player_name_norm was not even a column on this table and
-- PostgREST was discarding it on every insert.
--
-- A quote with no player_id is a quote no projection can ever be built from.
-- That is the number, and it belongs beside the total rather than being
-- inferred from section 6 being empty.
select (select count(*) from public.fantasy_events)          as events,
       (select count(*) from public.fantasy_odds_snapshots)  as snapshots,
       (select count(*) from public.fantasy_odds_snapshots
         where player_id is not null)                        as attributed,
       (select count(distinct player_id) from public.fantasy_odds_snapshots
         where player_id is not null)                        as players_matched,
       (select count(*) from public.fantasy_players)         as crosswalk,
       (select count(*) from public.fantasy_projections)     as projections,
       (select max(captured_at) from public.fantasy_odds_snapshots) as newest_quote;

\echo ''
\echo '=== 6. NAMES NOTHING COULD RESOLVE =============================='
-- A dropped player and a player with genuinely no market look identical on a
-- screen, and only one of them is honest. Anything here is a projection that
-- will silently not exist.
select name_raw, market, seen_count, last_seen
  from public.fantasy_unmatched_players
 where resolved_to is null
 order by last_seen desc
 limit 15;

\echo ''
