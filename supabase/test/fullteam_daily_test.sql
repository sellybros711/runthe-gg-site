-- ---------------------------------------------------------------------------
-- 105_fullteam_daily.sql against a real Postgres, and 102 underneath it.
--
--   createdb fullteam
--   psql -d fullteam -f supabase/test/daily_base.sql
--   psql -d fullteam -f supabase/99_daily_attempts.sql
--   psql -d fullteam -f supabase/100_daily_grace_reasons.sql
--   psql -d fullteam -f supabase/101_dynasty_seasons.sql
--   psql -d fullteam -f supabase/102_dynasty_rolling_day.sql
--   psql -d fullteam -f supabase/105_fullteam_daily.sql
--   psql -d fullteam -f supabase/test/fullteam_daily_test.sql
--
-- Every line below should read " ok ".
--
-- ---------------------------------------------------------------------------
-- WHY THIS FILE EXISTS AT ALL
-- ---------------------------------------------------------------------------
-- daily_test.sql tests the 99 -> 100 upgrade and stops there. 101 and 102 had
-- NO test, and that is exactly how ps_attempt_spend('dynasty') shipped throwing
-- on its own increment: `set used = used + 1` is ambiguous with the function's
-- own OUT parameter, Postgres refused the statement, and the page swallowed it
-- because dailySpend() fails open on purpose. A dynasty budget of three a day
-- silently never decremented and nothing anywhere reported it.
--
-- So section 1 below is a regression test for that, written as what a player
-- would notice rather than as the error text: spend three and the third one is
-- the last. It fails on unpatched 102 and nothing else here does.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP 0
\pset tuples_only on
\pset format unaligned

insert into auth.users(id) values ('aaaaaaaa-0000-0000-0000-000000000001') on conflict do nothing;
insert into auth.users(id) values ('aaaaaaaa-0000-0000-0000-000000000002') on conflict do nothing;

create or replace function public.q(p_sql text) returns text
language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $$;

-- ---------- 1) the dynasty counter actually counts --------------------------
select public.become('aaaaaaaa-0000-0000-0000-000000000001');

select case when public.q($$select public.ps_attempt_spend('dynasty')$$) = 'ok'
  then ' ok  a dynasty season can be spent without throwing'
  else ' FAIL dynasty spend raised: ' || public.q($$select public.ps_attempt_spend('dynasty')$$) end;

select case when (select used from public.ps_attempt_spend('dynasty')) = 2
  then ' ok  and the second one reads 2, so the counter moves'
  else ' FAIL the dynasty counter did not move' end;

select case when (select ok from public.ps_attempt_spend('dynasty')) is true
        and  (select ok from public.ps_attempt_spend('dynasty')) is false
  then ' ok  the third is allowed and the fourth is refused'
  else ' FAIL the dynasty budget is not three' end;

-- ---------- 2) Full Team is a mode the ledger accepts -----------------------
select public.become('aaaaaaaa-0000-0000-0000-000000000002');

select case when public.q($$select public.ps_attempts_state('full')$$) = 'ok'
  then ' ok  full is a known mode'
  else ' FAIL full was refused: ' || public.q($$select public.ps_attempts_state('full')$$) end;

select case when (select allowance from public.ps_attempts_state('full')) = 1
  then ' ok  the allowance is one'
  else ' FAIL the full allowance is not one' end;

select case when (select unit from public.ps_attempts_state('full')) = 'run'
  then ' ok  and the unit is a run, not a season'
  else ' FAIL the full unit is wrong' end;

select case when (select used from public.ps_attempts_state('full')) = 0
  then ' ok  a fresh day has nothing used'
  else ' FAIL a fresh full day is not empty' end;

-- READING IS NEVER A WRITE. The front page draws this on every repaint, so if
-- state spent anything the door would cost a run to look at.
select case when (select count(*) from public.ps_daily_attempts
                   where user_id = 'aaaaaaaa-0000-0000-0000-000000000002' and mode = 'full') = 0
  then ' ok  and reading the state wrote no row'
  else ' FAIL ps_attempts_state(full) is a write' end;

-- ---------- 3) one a day, and the second is refused -------------------------
select case when (select ok from public.ps_attempt_spend('full')) is true
  then ' ok  the first run of the day is allowed'
  else ' FAIL the first full run was refused' end;

select case when (select ok from public.ps_attempt_spend('full')) is false
  then ' ok  and the second is refused'
  else ' FAIL a second full run was allowed' end;

select case when (select used from public.ps_attempts_state('full')) = 1
        and  (select allowance from public.ps_attempts_state('full')) = 1
  then ' ok  the state says one of one'
  else ' FAIL the spent full state is wrong' end;

-- ---------- 4) the three modes do not share a count -------------------------
-- The key is (user, mode, day), so this is really a test that p_mode reaches
-- every WHERE clause in the branch. It would pass trivially if the branch still
-- said 'trade' everywhere, and fail loudly the moment one of them was missed.
select case when (select ok from public.ps_attempt_spend('trade')) is true
  then ' ok  a spent full day leaves the Trade Machine alone'
  else ' FAIL full and trade share a count' end;

select case when (select used from public.ps_attempts_state('full')) = 1
        and  (select used from public.ps_attempts_state('trade')) = 1
  then ' ok  and each mode counts its own'
  else ' FAIL the two counts ran together' end;

select case when (select count(distinct mode) from public.ps_daily_attempts
                   where user_id = 'aaaaaaaa-0000-0000-0000-000000000002') = 2
  then ' ok  two rows, one per mode'
  else ' FAIL the ledger did not key on mode' end;

-- ---------- 5) one player's day is their own --------------------------------
select public.become('aaaaaaaa-0000-0000-0000-000000000001');
select case when (select used from public.ps_attempts_state('full')) = 0
  then ' ok  another player has their own full day'
  else ' FAIL a full day leaked between accounts' end;

-- ---------- 6) a guest, and an unknown mode ---------------------------------
-- A guest gets the drawable default rather than an exception, so the front page
-- never depends on being signed in to render a door.
delete from auth.session;
select case when (select allowance from public.ps_attempts_state('full')) = 1
        and  (select used from public.ps_attempts_state('full')) = 0
  then ' ok  a guest reads a drawable state'
  else ' FAIL guest full state unusable' end;

select case when public.q($$select public.ps_attempt_spend('full')$$) = 'sign in to play'
  then ' ok  and cannot spend one'
  else ' FAIL a guest spent a full run' end;

select case when public.q($$select public.ps_attempts_state('fullteam')$$) = 'unknown mode'
  then ' ok  a mode that does not exist is still refused'
  else ' FAIL an unknown mode was accepted' end;

select case when public.q($$insert into public.ps_daily_attempts(user_id,mode,day,used)
                            values ('aaaaaaaa-0000-0000-0000-000000000001','gauntlet',
                                    public.ps_eastern_day(),0)$$) like '%ps_daily_attempts_mode_ck%'
  then ' ok  and the table refuses it too'
  else ' FAIL the mode constraint is not holding' end;

-- ---------- 7) ending the day ------------------------------------------------
-- Full Team's day ends at Eastern midnight whatever happens to the run, so this
-- marks the ledger and starts no clock. The dynasty is the only mode with one.
select public.become('aaaaaaaa-0000-0000-0000-000000000002');
select case when (select ended from public.ps_attempt_day_end('full')) is true
  then ' ok  a full day can be marked ended'
  else ' FAIL full day_end did not mark it' end;

select case when (select resets_at from public.ps_attempts_state('full')) = public.ps_eastern_reset()
  then ' ok  and it still resets at Eastern midnight rather than on a clock'
  else ' FAIL full grew a rolling clock' end;

select case when (select ok from public.ps_attempt_spend('full')) is false
  then ' ok  an ended day refuses a run'
  else ' FAIL an ended full day still allowed a run' end;
