-- ---------------------------------------------------------------------------
-- A stand-in test for the daily allowance against a real Postgres.
--
--   createdb daily
--   psql -d daily -f supabase/test/daily_base.sql
--   psql -d daily -f supabase/99_daily_attempts.sql
--   psql -d daily -f supabase/test/daily_upgrade_seed.sql
--   psql -d daily -f supabase/100_daily_grace_reasons.sql
--   psql -d daily -f supabase/test/daily_test.sql
--
-- Run 99 BEFORE 100 rather than 100 alone. 100 alters what 99 created, and
-- running the pair in order, with a day already in progress between them, is the
-- only thing here that exercises the upgrade a deployed database actually takes.
--
-- Every line below should read " ok ".
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP 0
\pset tuples_only on
\pset format unaligned

insert into auth.users(id) values ('11111111-1111-1111-1111-111111111111') on conflict do nothing;
insert into auth.users(id) values ('22222222-2222-2222-2222-222222222222') on conflict do nothing;
insert into auth.users(id) values ('33333333-3333-3333-3333-333333333333') on conflict do nothing;

create or replace function public.q(p_sql text) returns text
language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $$;

-- ---------- the day that was already running when 100 landed ----------
-- Seeded by daily_upgrade_seed.sql under 99: one firing, both attempts spent.
-- 100 drops the column that recorded the firing, so the numbers have to survive
-- the migration rather than be recomputed from nothing.
select public.become('44444444-4444-4444-4444-444444444444');
select case when (select allowance from public.ps_attempts_state('dynasty')) = 2
        and  (select used from public.ps_attempts_state('dynasty')) = 2
  then ' ok  a day in progress keeps what it earned under 99'
  else ' FAIL the upgrade lost an earned attempt' end;
select case when (select grace_fired from public.ps_daily_attempts
                   where user_id = '44444444-4444-4444-4444-444444444444'
                     and mode = 'dynasty' and day = public.ps_eastern_day()) is true
  then ' ok  and 99''s grant reads as the season-one firing' else ' FAIL backfill wrong' end;
select case when (select ok from public.ps_attempt_spend('dynasty')) is false
  then ' ok  and cannot start again' else ' FAIL the upgrade handed out a free run' end;
select public.ps_attempt_grace('dynasty', 'boss');
select case when (select allowance from public.ps_attempts_state('dynasty')) = 3
  then ' ok  and can still earn the boss attempt after upgrading' else ' FAIL boss grace lost' end;

-- ---------- the ordinary day ----------
select public.become('11111111-1111-1111-1111-111111111111');

select case when (select allowance from public.ps_attempts_state('dynasty')) = 1
        and  (select used from public.ps_attempts_state('dynasty')) = 0
  then ' ok  a fresh day offers one attempt' else ' FAIL fresh state' end;

select case when (select ok from public.ps_attempt_spend('dynasty')) is true
  then ' ok  the first start is allowed' else ' FAIL first start refused' end;

select case when (select ok from public.ps_attempt_spend('dynasty')) is false
  then ' ok  the second start is refused' else ' FAIL second start allowed' end;

-- READING NEVER SPENDS. The button paints on every return to the front page.
select public.ps_attempts_state('dynasty');
select public.ps_attempts_state('dynasty');
select case when (select used from public.ps_attempts_state('dynasty')) = 1
  then ' ok  reading state does not spend' else ' FAIL state is a write' end;

-- ---------- the two modes are separate ----------
select case when (select ok from public.ps_attempt_spend('trade')) is true
  then ' ok  Trade Machine has its own allowance' else ' FAIL modes share a count' end;

-- ---------- getting fired in season one ----------
select public.ps_attempt_grace('dynasty', 'fired');
select case when (select allowance from public.ps_attempts_state('dynasty')) = 2
  then ' ok  a first-season firing adds one attempt' else ' FAIL fired grace did not apply' end;
select case when (select ok from public.ps_attempt_spend('dynasty')) is true
  then ' ok  the granted attempt can be spent' else ' FAIL granted attempt refused' end;
select case when (select ok from public.ps_attempt_spend('dynasty')) is false
  then ' ok  and the day is done after it' else ' FAIL a third start allowed' end;

-- ASKED TWICE, GRANTED ONCE. The client can call this as often as it likes.
select public.ps_attempt_grace('dynasty', 'fired');
select public.ps_attempt_grace('dynasty', 'fired');
select public.ps_attempt_grace('dynasty', 'fired');
select case when (select allowance from public.ps_attempts_state('dynasty')) = 2
  then ' ok  one reason cannot be farmed' else ' FAIL repeated grace stacked' end;

-- ---------- BOTH REASONS IN ONE DAY ----------
-- The whole point of 100. Fired in season one, take the extra run, ride it to
-- season ten and beat the boss. Under 99 this second reward did nothing at all.
select public.ps_attempt_grace('dynasty', 'boss');
select case when (select allowance from public.ps_attempts_state('dynasty')) = 3
  then ' ok  a boss win stacks on top of a firing' else ' FAIL the two reasons collapsed into one' end;
select case when (select ok from public.ps_attempt_spend('dynasty')) is true
  then ' ok  the boss attempt can be spent' else ' FAIL boss attempt refused' end;
select case when (select ok from public.ps_attempt_spend('dynasty')) is false
  then ' ok  and three is the ceiling' else ' FAIL a fourth start allowed' end;

-- AND THE BOSS REASON IS ITS OWN ONE-SHOT TOO.
select public.ps_attempt_grace('dynasty', 'boss');
select public.ps_attempt_grace('dynasty', 'boss');
select case when (select allowance from public.ps_attempts_state('dynasty')) = 3
  then ' ok  the boss reason cannot be farmed either' else ' FAIL repeated boss grace stacked' end;

-- ---------- a boss win with no firing behind it ----------
select public.become('33333333-3333-3333-3333-333333333333');
select public.ps_attempt_grace('dynasty', 'boss');
select case when (select allowance from public.ps_attempts_state('dynasty')) = 2
  then ' ok  a boss win alone is worth one attempt' else ' FAIL boss grace alone wrong' end;
-- One spend per statement. Three of them inside one AND leaves the order they
-- run in up to the planner, and a spend is not a pure read.
select case when (select ok from public.ps_attempt_spend('dynasty')) is true
  then ' ok  and buys a first start' else ' FAIL boss-only first start refused' end;
select case when (select ok from public.ps_attempt_spend('dynasty')) is true
  then ' ok  and a second' else ' FAIL boss-only second start refused' end;
select case when (select ok from public.ps_attempt_spend('dynasty')) is false
  then ' ok  and no third' else ' FAIL boss-only third start allowed' end;

-- A REASON THE GAME DOES NOT GRANT IS NOT A REASON.
select case when public.q('select * from public.ps_attempt_grace(''dynasty'', ''vibes'')') like '%unknown reason%'
  then ' ok  an invented reason is refused' else ' FAIL any string grants an attempt' end;
select case when public.q('select * from public.ps_attempt_grace(''dynasty'', null)') like '%unknown reason%'
  then ' ok  and so is no reason at all' else ' FAIL a null reason granted' end;

-- THE ONE-ARGUMENT GRACE IS GONE, so an old cached board.js cannot quietly keep
-- calling it and half-working.
select case when public.q('select * from public.ps_attempt_grace(''dynasty'')') like '%function%'
  then ' ok  the one-argument grace no longer exists' else ' FAIL 99''s signature survived' end;

-- ---------- yesterday does not count ----------
select public.become('11111111-1111-1111-1111-111111111111');
update public.ps_daily_attempts set day = public.ps_eastern_day() - 1
 where user_id = '11111111-1111-1111-1111-111111111111' and mode = 'dynasty';
select case when (select used from public.ps_attempts_state('dynasty')) = 0
        and  (select allowance from public.ps_attempts_state('dynasty')) = 1
  then ' ok  a new day starts clean' else ' FAIL yesterday leaked into today' end;

-- ---------- one player's day is not another's ----------
select public.become('22222222-2222-2222-2222-222222222222');
select case when (select used from public.ps_attempts_state('dynasty')) = 0
  then ' ok  another player has their own day' else ' FAIL counts are shared' end;
select case when (select ok from public.ps_attempt_spend('dynasty')) is true
  then ' ok  and can still start' else ' FAIL blocked by somebody else' end;

-- ---------- guests ----------
select public.become(null);
select case when public.q('select * from public.ps_attempt_spend(''dynasty'')') like '%sign in%'
  then ' ok  a guest cannot spend' else ' FAIL guest spent an attempt' end;
select case when public.q('select * from public.ps_attempt_grace(''dynasty'', ''fired'')') like '%sign in%'
  then ' ok  a guest cannot be granted' else ' FAIL guest granted' end;
select case when (select allowance from public.ps_attempts_state('dynasty')) = 1
  then ' ok  a guest still reads a drawable state' else ' FAIL guest state unusable' end;

-- ---------- bad input ----------
select public.become('11111111-1111-1111-1111-111111111111');
select case when public.q('select * from public.ps_attempts_state(''golf'')') like '%unknown mode%'
  then ' ok  an unknown mode is refused' else ' FAIL unknown mode accepted' end;
select case when public.q('select * from public.ps_attempt_grace(''golf'', ''fired'')') like '%unknown mode%'
  then ' ok  and cannot be granted either' else ' FAIL unknown mode granted' end;

-- ---------- the reset instant is in the future and inside a day ----------
select case when public.ps_eastern_reset() > now()
        and  public.ps_eastern_reset() <= now() + interval '1 day'
  then ' ok  the reset is the next Eastern midnight' else ' FAIL reset instant wrong' end;

-- ---------- one player cannot read another's ledger ----------
-- AS `authenticated`, WHICH IS HOW IT ACTUALLY ARRIVES. The owner of a table
-- bypasses its RLS, so asserting this as the superuser passes on a table with no
-- policy at all and tells you nothing. Supabase hands every browser request to
-- anon or authenticated, and neither owns this table. SET ROLE and not SET LOCAL
-- ROLE: psql runs each statement in its own transaction, so a LOCAL set is undone
-- before the next line and the check silently runs as the owner again.
set role authenticated;
select case when (select count(*) from public.ps_daily_attempts
                   where user_id = '22222222-2222-2222-2222-222222222222') = 0
  then ' ok  RLS hides another player''s ledger' else ' FAIL ledger is world readable' end;
select case when (select count(*) from public.ps_daily_attempts) > 0
  then ' ok  and shows the reader their own' else ' FAIL RLS hid everything' end;
reset role;
