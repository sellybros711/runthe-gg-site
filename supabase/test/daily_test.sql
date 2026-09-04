-- ---------------------------------------------------------------------------
-- A stand-in test for 99_daily_attempts.sql against a real Postgres.
--
--   createdb daily
--   psql -d daily -f supabase/test/daily_base.sql
--   psql -d daily -f supabase/99_daily_attempts.sql
--   psql -d daily -f supabase/test/daily_test.sql
--
-- Every line below should read " ok ".
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP 0
\pset tuples_only on
\pset format unaligned

insert into auth.users(id) values ('11111111-1111-1111-1111-111111111111') on conflict do nothing;
insert into auth.users(id) values ('22222222-2222-2222-2222-222222222222') on conflict do nothing;

create or replace function public.q(p_sql text) returns text
language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $$;

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

-- ---------- the mercy ----------
select public.ps_attempt_grace('dynasty');
select case when (select allowance from public.ps_attempts_state('dynasty')) = 2
  then ' ok  the grace adds one attempt' else ' FAIL grace did not apply' end;
select case when (select ok from public.ps_attempt_spend('dynasty')) is true
  then ' ok  the granted attempt can be spent' else ' FAIL granted attempt refused' end;
select case when (select ok from public.ps_attempt_spend('dynasty')) is false
  then ' ok  and the day is done after it' else ' FAIL a third start allowed' end;

-- ASKED TWICE, GRANTED ONCE. The client can call this as often as it likes.
select public.ps_attempt_grace('dynasty');
select public.ps_attempt_grace('dynasty');
select public.ps_attempt_grace('dynasty');
select case when (select allowance from public.ps_attempts_state('dynasty')) = 2
  then ' ok  the grace cannot be farmed' else ' FAIL repeated grace stacked' end;

-- ---------- yesterday does not count ----------
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
select case when public.q('select * from public.ps_attempt_grace(''dynasty'')') like '%sign in%'
  then ' ok  a guest cannot be granted' else ' FAIL guest granted' end;
select case when (select allowance from public.ps_attempts_state('dynasty')) = 1
  then ' ok  a guest still reads a drawable state' else ' FAIL guest state unusable' end;

-- ---------- bad input ----------
select public.become('11111111-1111-1111-1111-111111111111');
select case when public.q('select * from public.ps_attempts_state(''golf'')') like '%unknown mode%'
  then ' ok  an unknown mode is refused' else ' FAIL unknown mode accepted' end;

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
