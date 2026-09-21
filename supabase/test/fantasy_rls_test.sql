-- ---------------------------------------------------------------------------
-- 109, 110 and 111 against a real Postgres.
--
--   createdb fantasy
--   psql -d fantasy -c 'create role authenticated; create role anon; create role service_role;'
--   psql -d fantasy -f supabase/test/fantasy_base.sql
--   psql -d fantasy -f supabase/109_fantasy_access.sql
--   psql -d fantasy -f supabase/110_fantasy_core.sql
--   psql -d fantasy -f supabase/111_fantasy_model.sql
--   psql -d fantasy -f supabase/test/fantasy_rls_test.sql
--
-- One line per check, every one starting " ok ".
--
--
-- WHAT THIS FILE IS ACTUALLY FOR
-- ---------------------------------------------------------------------------
-- It is the acceptance criterion the brief writes as "curl against any
-- fantasy_ table with the anon key and no session returns zero rows", proved
-- rather than asserted. The anon key is published in the page source of every
-- game on this site, so it is not a secret and RLS is the only thing standing
-- between a stranger with that key and an unreleased product.
--
-- EVERY WAY THIS BREAKS IS SILENT. A table created without RLS renders no
-- error, fails no migration and looks exactly like a table with RLS on. The
-- only symptom is that somebody who should see nothing sees everything, and
-- nobody is going to report that.
--
--
-- IT SEEDS ROWS FIRST, AND THAT IS THE HALF MOST EASILY LEFT OUT
-- ---------------------------------------------------------------------------
-- A "stranger reads zero rows" check passes perfectly against an empty
-- database, which is the state this test would otherwise run in. So every
-- table is given a row as the service role BEFORE anybody is denied anything,
-- and the member case asserts a count that is NOT zero. Without that pair the
-- file certifies nothing, which is the same trap hoops/check-board.mjs wrote
-- up as "an assertion that could only pass".
--
--
-- IT RUNS AS A ROLE, NEVER AS THE SUPERUSER
-- ---------------------------------------------------------------------------
-- postgres has BYPASSRLS, so every check below would pass with every policy
-- deleted if it ran as the owner. `set role` is what makes the checks real.
-- FORCE ROW LEVEL SECURITY in 110 and 111 covers the related trap, which is
-- the table's owner silently skipping its own policy.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\pset pager off
set client_min_messages = notice;

create or replace function pg_temp.ck(label text, cond boolean) returns void
language plpgsql as $$
begin
  raise notice '%', (case when cond then ' ok  ' else ' FAIL ' end) || label;
end $$;

-- Did this call raise? Returns the message, or null when it went through, so a
-- check can assert BOTH that it was refused and that it was refused for the
-- reason meant. A bare "it threw" passes when the function throws on a typo.
create or replace function pg_temp.boom(sql text) returns text
language plpgsql as $$
begin
  execute sql;
  return null;
exception when others then
  return sqlerrm;
end $$;

-- Every table the feature owns, in one list. Adding a table to 110 or 111 and
-- not to this array is the one way to be missed, which is why the preflight
-- carries the same list and why they are worth keeping in step.
create or replace function pg_temp.tables() returns text[]
language sql immutable as $$ select array[
  'fantasy_access_allowlist','fantasy_players','fantasy_player_aliases',
  'fantasy_unmatched_players','fantasy_events','fantasy_odds_snapshots',
  'fantasy_line_movement','fantasy_projections','fantasy_poll_runs',
  'fantasy_priors','fantasy_team_totals','fantasy_sim_runs'
] $$;

-- How many rows the CURRENT role can see across the whole feature. One number,
-- because the claim is about all of them at once and a per-table report would
-- be twelve lines saying the same thing.
--
-- SECURITY INVOKER (the default) is load-bearing: written as DEFINER it would
-- run as postgres and cheerfully report every row to everybody.
--
-- A REFUSED TABLE COUNTS AS ZERO ROWS, WHICH IS TRUE AND IS NOT THE WHOLE
-- TRUTH. There are two different ways a read returns nothing here and they are
-- worth telling apart, because only one of them is the RLS policy doing its
-- job:
--
--   no grant   the role may not look at the table at all, and is refused
--              before any policy is consulted
--   policy     the role may look, and the policy answers it no rows
--
-- Both are a pass for "sees nothing". Collapsing them would let a missing
-- grant hide a missing policy, so denied() counts them separately and the
-- checks below assert which mechanism is doing the work in each case.
create or replace function pg_temp.visible() returns bigint
language plpgsql as $$
declare t text; n bigint; s bigint := 0;
begin
  foreach t in array pg_temp.tables() loop
    begin
      execute format('select count(*) from public.%I', t) into n;
      s := s + n;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
  return s;
end $$;

-- How many of the tables refuse the current role outright.
create or replace function pg_temp.denied() returns int
language plpgsql as $$
declare t text; n bigint; d int := 0;
begin
  foreach t in array pg_temp.tables() loop
    begin
      execute format('select count(*) from public.%I', t) into n;
    exception when insufficient_privilege then
      d := d + 1;
    end;
  end loop;
  return d;
end $$;

-- Same walk, but reporting WHICH table leaked, because "seventeen rows
-- visible" is not something anybody can act on.
create or replace function pg_temp.leaks() returns text
language plpgsql as $$
declare t text; n bigint; out_ text := '';
begin
  foreach t in array pg_temp.tables() loop
    begin
      execute format('select count(*) from public.%I', t) into n;
      if n > 0 then out_ := out_ || t || '(' || n || ') '; end if;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
  return out_;
end $$;


-- ===========================================================================
-- Fixture. Written as the owner, before anybody is denied anything.
-- ===========================================================================
-- IT RESETS ITS OWN FIXTURE FIRST, because it changes one. Run twice against
-- the same database without this, the second run reported FOUR failures on
-- code that had not changed: the budget was already spent past its test cap,
-- the projection inserts conflicted with the rows the first run left, and
-- every snapshot count was three higher than the check expected.
--
-- That is hoops_board_test.sql's lesson (its header records the same thing
-- happening to three name checks) and it is worth restating, because a suite
-- that only passes on a fresh database is a suite people stop running.
--
-- TRUNCATE rather than DELETE: the snapshot table is partitioned and CASCADE
-- reaches its partitions, and resetting the sequences means the poll_runs id
-- the fixture pins is free again.
truncate
  public.fantasy_odds_snapshots,
  public.fantasy_line_movement,
  public.fantasy_projections,
  public.fantasy_priors,
  public.fantasy_team_totals,
  public.fantasy_sim_runs,
  public.fantasy_poll_runs,
  public.fantasy_player_aliases,
  public.fantasy_unmatched_players,
  public.fantasy_events,
  public.fantasy_players,
  public.fantasy_poll_budget
  restart identity cascade;

insert into public.fantasy_players (player_id, full_name, search_name, position, team)
values ('00-0036900', 'Ja''Marr Chase', 'jamarr chase', 'WR', 'CIN')
    on conflict (player_id) do nothing;

insert into public.fantasy_player_aliases (alias_norm, player_id, source)
values ('jamarr chase', '00-0036900', 'test') on conflict (alias_norm) do nothing;

insert into public.fantasy_unmatched_players (name_raw, name_norm, market)
values ('Some Guy', 'some guy', 'player_reception_yds')
    on conflict (name_norm, market) do nothing;

insert into public.fantasy_events (event_id, season, week, commence_time, home_team, away_team)
values ('evt1', 2026, 3, '2026-09-27T17:00:00Z', 'CIN', 'PIT')
    on conflict (event_id) do nothing;

insert into public.fantasy_poll_runs (id, ok, event_id, markets, credits_charged, rows_written)
values (1, true, 'evt1', array['player_reception_yds'], 1, 1)
    on conflict (id) do nothing;

insert into public.fantasy_odds_snapshots
  (season, week, event_id, book, market, player_id, player_name_raw,
   line, over_price, under_price, book_last_update, poll_id)
values (2026, 3, 'evt1', 'draftkings', 'player_reception_yds', '00-0036900',
        'Ja''Marr Chase', 61.5, -110, -110, '2026-09-26T12:00:00Z', 1)
    on conflict do nothing;

insert into public.fantasy_line_movement
  (season, week, player_id, market, open_line, current_line, delta, book_count)
values (2026, 3, '00-0036900', 'player_reception_yds', 48.5, 61.5, 13.0, 5)
    on conflict do nothing;

insert into public.fantasy_projections
  (season, week, player_id, scoring_profile, dist_params, quantiles,
   mean_pts, sd_pts, devig_method, market_count, source_poll_id)
values (2026, 3, '00-0036900', 'ppr', '{"k":2.1}'::jsonb,
        '{"p10":6.1,"p50":15.2,"p90":27.8}'::jsonb, 16.4, 8.2, 'shin', 4, 1)
    on conflict do nothing;

insert into public.fantasy_priors (kind, version, season, week, scope_key, payload)
values ('correlation', '2026-09-21', 2026, 3, '', '{"qb_wr":0.34}'::jsonb)
    on conflict do nothing;

insert into public.fantasy_team_totals (season, week, team, game_total, spread, implied_total)
values (2026, 3, 'CIN', 47.5, -3.5, 25.5) on conflict do nothing;

insert into public.fantasy_sim_runs
  (roster_hash, league_hash, season, as_of_week, scoring_profile, n_sims, payload)
values ('r1', 'l1', 2026, 3, 'ppr', 10000, '{"playoff":0.41}'::jsonb)
    on conflict do nothing;

select pg_temp.ck('fixture: every table has a row to leak',
  pg_temp.visible() >= 12);


-- ===========================================================================
-- 1. THE GATE
-- ===========================================================================
select auth.sign_out();
set role anon;
select pg_temp.ck('signed out: fantasy_gate() is false', public.fantasy_gate() = false);
reset role;

select auth.become('00000000-0000-0000-0000-00000000000c');  -- astranger
set role authenticated;
select pg_temp.ck('signed in, not on the list: fantasy_gate() is false',
  public.fantasy_gate() = false);
reset role;

select auth.become('00000000-0000-0000-0000-00000000000a');  -- MalikWillisLover
set role authenticated;
select pg_temp.ck('signed in, on the list: fantasy_gate() is true',
  public.fantasy_gate() = true);
reset role;


-- ===========================================================================
-- 2. ZERO ROWS. The acceptance criterion.
-- ===========================================================================
select auth.sign_out();
set role anon;
select pg_temp.ck('ANON WITH THE PUBLISHED KEY SEES NOTHING: ' ||
  coalesce(nullif(pg_temp.leaks(), ''), 'no table returned a row'),
  pg_temp.visible() = 0);
-- And it is refused at the GRANT, before RLS is even asked. Nothing under
-- /fantasy is granted to anon, so a signed-out reader never reaches a policy.
select pg_temp.ck('and every table refuses the anon role outright',
  pg_temp.denied() = array_length(pg_temp.tables(), 1));
reset role;

select auth.become('00000000-0000-0000-0000-00000000000c');
set role authenticated;
select pg_temp.ck('SIGNED IN BUT NOT ALLOWLISTED SEES NOTHING: ' ||
  coalesce(nullif(pg_temp.leaks(), ''), 'no table returned a row'),
  pg_temp.visible() = 0);
-- THIS IS THE ONE THE POLICY HAS TO CARRY. A signed-in stranger holds the
-- grant, so nothing is refused: every table opens, looks, and hands back
-- nothing. If denied() were non-zero here the grant would be hiding a policy
-- that might not exist, and the day somebody adds the grant it would leak.
select pg_temp.ck('and it is the POLICY refusing them, not a missing grant',
  pg_temp.denied() = 0);
reset role;

-- And the other half, without which the two checks above pass on an empty
-- database and mean nothing.
select auth.become('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select pg_temp.ck('a member can actually read the feature',
  pg_temp.visible() >= 12);

-- A member reads their OWN allowlist row and NOT the other member's. This is
-- the check that says nobody can enumerate the testers.
select pg_temp.ck('a member sees exactly one allowlist row, their own',
  (select count(*) from public.fantasy_access_allowlist) = 1
  and (select user_id from public.fantasy_access_allowlist)
      = '00000000-0000-0000-0000-00000000000a'::uuid);
reset role;


-- ===========================================================================
-- 3. NOBODY WRITES FROM A BROWSER
-- ===========================================================================
select pg_temp.ck('no fantasy_ table has a write policy',
  not exists (select 1 from pg_policies
               where schemaname = 'public' and tablename like 'fantasy%'
                 and cmd <> 'SELECT'));

select auth.become('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select pg_temp.ck('even an allowlisted member cannot insert a player',
  pg_temp.boom($$insert into public.fantasy_players
     (player_id, full_name, search_name) values ('x','X','x')$$) is not null);
select pg_temp.ck('even an allowlisted member cannot add themselves a friend',
  pg_temp.boom($$insert into public.fantasy_access_allowlist (user_id, note)
     values ('00000000-0000-0000-0000-00000000000c','sneaked in')$$) is not null);
select pg_temp.ck('a member cannot delete a projection',
  pg_temp.boom($$delete from public.fantasy_projections$$) is not null);
reset role;


-- ===========================================================================
-- 4. THE CREDIT CAP
-- ===========================================================================
-- THE OUT PARAMETER TRAP FIRST. 102_dynasty_rolling_day.sql declared a
-- function RETURNS TABLE (ok, used, ...) and then wrote `set used = used + 1`,
-- which Postgres refuses as ambiguous. It threw on every dynasty kickoff and
-- nothing said so, because the caller failed open. So the very first thing
-- asked of this function is whether calling it raises at all.
select pg_temp.ck('fantasy_budget_spend does not throw (the 102 ambiguity bug)',
  pg_temp.boom($$select * from public.fantasy_budget_spend(1)$$) is null);

-- Reset to a small cap so the ceiling is reachable in a test.
update public.fantasy_poll_budget
   set credits_used = 0, credits_cap = 10
 where period = date_trunc('month', now() at time zone 'utc')::date;

-- A STATEMENT CANNOT SEE ITS OWN WRITE, and the first draft of the next three
-- checks was written as one expression that called the function and then read
-- the table beside it:
--
--   (select allowed from fantasy_budget_spend(6)) = true
--   and (select credits_used from fantasy_poll_budget ...) = 6
--
-- A statement takes its snapshot before it runs. The volatile function gets a
-- fresh command snapshot and does the update; the sibling subquery is still on
-- the statement's original one and reads the OLD number. It reported 0 against
-- an expected 6 and looked exactly like a function that had failed to
-- increment. It had incremented perfectly.
--
-- So the call and the assertion about its effect are always separate
-- statements here. Worth knowing before writing the next one of these.
create temp table spend_result as
  select * from public.fantasy_budget_spend(6);

select pg_temp.ck('a spend inside the cap is allowed',
  (select allowed from spend_result) = true);

select pg_temp.ck('and it incremented the running total',
  (select credits_used from public.fantasy_poll_budget
    where period = date_trunc('month', now() at time zone 'utc')::date) = 6);

select pg_temp.ck('a spend that would break the cap is refused',
  (select allowed from public.fantasy_budget_spend(6)) = false);

-- THE HALF THAT MATTERS MORE. A refusal that still incremented would let a
-- Worker retrying in a loop dig the hole deeper while being told no.
select pg_temp.ck('a refused spend does not increment',
  (select credits_used from public.fantasy_poll_budget
    where period = date_trunc('month', now() at time zone 'utc')::date) = 6);

select pg_temp.ck('a spend that exactly fills the cap is allowed',
  (select allowed from public.fantasy_budget_spend(4)) = true);

select pg_temp.ck('and the next one is not',
  (select allowed from public.fantasy_budget_spend(1)) = false);

select pg_temp.ck('a negative spend is refused loudly rather than crediting us',
  pg_temp.boom($$select * from public.fantasy_budget_spend(-100)$$) is not null);

-- The vendor's own count is adopted when it is HIGHER and ignored when lower,
-- because lower means our cost model under-counts and taking it would loosen
-- the cap on the strength of a number we do not understand yet.
select public.fantasy_budget_observe(null, 50);
select pg_temp.ck('a higher vendor count is adopted',
  (select credits_used from public.fantasy_poll_budget
    where period = date_trunc('month', now() at time zone 'utc')::date) = 50);
select public.fantasy_budget_observe(null, 2);
select pg_temp.ck('a lower vendor count is ignored',
  (select credits_used from public.fantasy_poll_budget
    where period = date_trunc('month', now() at time zone 'utc')::date) = 50);

-- The budget is readable by a member and invisible to everybody else, which is
-- the brief's "the cap is enforced and observable" without it being public.
select auth.become('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select pg_temp.ck('a member can read the budget state',
  (select count(*) from public.fantasy_budget_state()) = 1);
reset role;

select auth.become('00000000-0000-0000-0000-00000000000c');
set role authenticated;
select pg_temp.ck('a stranger reads no budget state',
  (select count(*) from public.fantasy_budget_state()) = 0);
select pg_temp.ck('and cannot read the budget table at all',
  pg_temp.boom($$select * from public.fantasy_poll_budget$$) is not null);
reset role;


-- ===========================================================================
-- 5. A PROJECTION CANNOT BE FABRICATED
-- ===========================================================================
-- The brief's strongest instruction: a player with no posted props gets no
-- projection, and a made-up number sitting in the same table as a
-- market-derived one is worse than an obvious gap. Enforced in the schema so
-- there is no code path that can write one, not even by mistake.
select pg_temp.ck('a projection claiming zero markets is refused',
  pg_temp.boom($$insert into public.fantasy_projections
    (season, week, player_id, scoring_profile, dist_params, quantiles,
     mean_pts, sd_pts, devig_method, market_count, source_poll_id)
    values (2026, 4, '00-0036900', 'ppr', '{}'::jsonb, '{}'::jsonb,
            12.0, 5.0, 'shin', 0, 1)$$) is not null);

select pg_temp.ck('a projection with one market is accepted',
  pg_temp.boom($$insert into public.fantasy_projections
    (season, week, player_id, scoring_profile, dist_params, quantiles,
     mean_pts, sd_pts, devig_method, market_count, source_poll_id)
    values (2026, 5, '00-0036900', 'ppr', '{}'::jsonb, '{}'::jsonb,
            12.0, 5.0, 'shin', 1, 1)$$) is null);

-- Scoring-profile-specific, and the key is what enforces it. The same player
-- in the same week under two profiles is two rows, never one row adjusted
-- afterwards.
-- Two statements, for the snapshot reason written out at the budget checks.
select pg_temp.ck('a second scoring profile for the same player and week is accepted',
  pg_temp.boom($$insert into public.fantasy_projections
    (season, week, player_id, scoring_profile, dist_params, quantiles,
     mean_pts, sd_pts, devig_method, market_count, source_poll_id)
    values (2026, 3, '00-0036900', 'half_ppr', '{}'::jsonb, '{}'::jsonb,
            13.9, 7.7, 'shin', 4, 1)$$) is null);

select pg_temp.ck('and both profiles are stored, never one adjusted afterwards',
  (select count(*) from public.fantasy_projections
    where season = 2026 and week = 3 and player_id = '00-0036900') = 2);

-- The same profile twice is the SAME row, so a re-run of the projection job
-- cannot double up. Without this the key would be decoration.
select pg_temp.ck('the same profile twice conflicts rather than duplicating',
  pg_temp.boom($$insert into public.fantasy_projections
    (season, week, player_id, scoring_profile, dist_params, quantiles,
     mean_pts, sd_pts, devig_method, market_count, source_poll_id)
    values (2026, 3, '00-0036900', 'ppr', '{}'::jsonb, '{}'::jsonb,
            1.0, 1.0, 'shin', 1, 1)$$) is not null);


-- ===========================================================================
-- 6. SNAPSHOT IDEMPOTENCY
-- ===========================================================================
-- "The pipeline must be re-runnable for any historical window without
-- duplicating rows." Here that falls out of the unique key rather than out of
-- a careful caller, which is the difference between a property and a habit.
create or replace function pg_temp.snap(p_line numeric, p_upd text)
returns void language sql as $$
  insert into public.fantasy_odds_snapshots
    (season, week, event_id, book, market, player_id, player_name_raw,
     line, over_price, under_price, book_last_update, poll_id)
  values (2026, 3, 'evt1', 'fanduel', 'player_rush_yds', '00-0036900',
          'Ja''Marr Chase', p_line, -110, -110, p_upd::timestamptz, 1)
      on conflict do nothing;
$$;

select pg_temp.snap(30.5, '2026-09-26T12:00:00Z');
select pg_temp.snap(30.5, '2026-09-26T12:00:00Z');
select pg_temp.snap(30.5, '2026-09-26T12:00:00Z');
select pg_temp.ck('re-polling an unchanged quote writes one row, not three',
  (select count(*) from public.fantasy_odds_snapshots
    where book = 'fanduel' and market = 'player_rush_yds') = 1);

-- And the other direction, because a key that collapsed genuine movement
-- would pass the check above perfectly.
select pg_temp.snap(34.5, '2026-09-26T18:00:00Z');
select pg_temp.ck('a line that actually moved writes a second row',
  (select count(*) from public.fantasy_odds_snapshots
    where book = 'fanduel' and market = 'player_rush_yds') = 2);

-- A LINE THAT MOVES AWAY AND COMES BACK IS TWO EVENTS, NOT ONE. A key written
-- on the CONTENT would collapse the round trip and the movement panel would
-- show a line that never moved.
select pg_temp.snap(30.5, '2026-09-26T22:00:00Z');
select pg_temp.ck('a line returning to its old number is still a third row',
  (select count(*) from public.fantasy_odds_snapshots
    where book = 'fanduel' and market = 'player_rush_yds') = 3);


-- ===========================================================================
-- 7. A SEASON WITH NO PARTITION FAILS LOUDLY
-- ===========================================================================
-- Partitioning by season means somebody has to add a partition once a year.
-- The failure has to be an error rather than a silent drop, or the first
-- symptom of a forgotten partition is a season quietly collecting nothing.
select pg_temp.ck('an insert for a season with no partition raises',
  pg_temp.boom($$insert into public.fantasy_odds_snapshots
    (season, week, event_id, book, market, player_name_raw, book_last_update)
    values (2099, 1, 'evt1', 'x', 'y', 'Z', now())$$) is not null);

select pg_temp.ck('this season does have one',
  to_regclass('public.fantasy_odds_snapshots_2026') is not null);


-- ===========================================================================
-- 8. THE SEED RESOLVES A NAME AS TYPED
-- ===========================================================================
-- 72_comp_passes.sql wrote up the trap: set_username stores the casing
-- somebody typed, so an exact-case match silently misses them. The fixture
-- stores 'MalikWillisLover' in mixed case for exactly this check.
select pg_temp.ck('a mixed case username was resolved by the seed',
  exists (select 1 from public.fantasy_access_allowlist
           where user_id = '00000000-0000-0000-0000-00000000000a'));
select pg_temp.ck('and the account that is on no list was not',
  not exists (select 1 from public.fantasy_access_allowlist
               where user_id = '00000000-0000-0000-0000-00000000000c'));

select auth.sign_out();
