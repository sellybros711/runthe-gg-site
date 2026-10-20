-- ---------------------------------------------------------------------------
-- 154_dynasty_day_end_lapsed.sql against a real Postgres, on 102 and 105.
--
--   createdb dayend
--   psql -d dayend -f supabase/test/daily_base.sql
--   psql -d dayend -f supabase/99_daily_attempts.sql
--   psql -d dayend -f supabase/100_daily_grace_reasons.sql
--   psql -d dayend -f supabase/101_dynasty_seasons.sql
--   psql -d dayend -f supabase/102_dynasty_rolling_day.sql
--   psql -d dayend -f supabase/105_fullteam_daily.sql
--   psql -d dayend -f supabase/154_dynasty_day_end_lapsed.sql
--   psql -d dayend -f supabase/test/dynasty_day_end_test.sql
--
-- Every line below should read " ok ". On a fresh database every time: this
-- file spends the budget it tests. Without 154, section 2 fails: an expired
-- lock is stamped with a fresh 24 hours, which is the reported bug (the
-- countdown read 1 second, then 24 hours).
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP 0
\pset tuples_only on
\pset format unaligned

insert into auth.users(id) values ('bbbbbbbb-0000-0000-0000-000000000001') on conflict do nothing;
insert into auth.users(id) values ('bbbbbbbb-0000-0000-0000-000000000002') on conflict do nothing;
select public.become('bbbbbbbb-0000-0000-0000-000000000001');

-- ---------- 1) the day ends and the clock starts ----------------------------
select public.ps_attempt_spend('dynasty');
select public.ps_attempt_spend('dynasty');
select public.ps_attempt_spend('dynasty');

select case when (select resets_at from public.ps_attempt_day_end('dynasty', false))
                 between now() + interval '23 hours 59 minutes' and now() + interval '24 hours 1 minute'
  then ' ok  three seasons played, the day ends and a 24 hour wait starts'
  else ' FAIL the spent day did not start a 24 hour wait' end;

-- A wait already running is never pushed further out.
update public.ps_dynasty_day set locked_until = now() + interval '1 hour'
 where user_id = 'bbbbbbbb-0000-0000-0000-000000000001';
select case when (select resets_at from public.ps_attempt_day_end('dynasty', false))
                 < now() + interval '2 hours'
  then ' ok  a running wait is never extended'
  else ' FAIL a running wait was restarted' end;

-- ---------- 2) the wait runs out, and a late report does not restart it -----
-- One second past the end: the moment the player reopened the sheet.
update public.ps_dynasty_day set locked_until = now() - interval '1 second'
 where user_id = 'bbbbbbbb-0000-0000-0000-000000000001';

select case when (select resets_at from public.ps_attempt_day_end('dynasty', false)) is null
  then ' ok  a report after the wait ended starts no new wait'
  else ' FAIL an expired wait was stamped with a fresh 24 hours' end;

select case when (select used from public.ps_attempts_state('dynasty')) = 0
        and  (select resets_at from public.ps_attempts_state('dynasty')) is null
  then ' ok  and the state reads a fresh day'
  else ' FAIL the state is still locked after the wait ended' end;

select case when (select resets_at from public.ps_attempt_day_end('dynasty', true)) is null
  then ' ok  a late firing report does not lock it either'
  else ' FAIL a stale firing report locked the new day' end;

-- One statement per write: ps_attempts_state is `stable`, so read in the same
-- statement as a spend it sees the row as it was before the spend.
select case when (select ok from public.ps_attempt_spend('dynasty')) is true
  then ' ok  and the next kickoff is allowed'
  else ' FAIL the next kickoff was refused' end;

select case when (select used from public.ps_attempts_state('dynasty')) = 1
  then ' ok  and it opens the new day with one season used'
  else ' FAIL the new day did not open' end;

-- ---------- 3) an open window with seasons left is not ended by a report ----
select case when (select resets_at from public.ps_attempt_day_end('dynasty', false)) is null
  then ' ok  a stale report with seasons still left changes nothing'
  else ' FAIL a day with seasons left was locked' end;

-- ---------- 4) a firing still ends the day at once --------------------------
select case when (select ended from public.ps_attempt_day_end('dynasty', true)) is true
  then ' ok  a firing ends the day with seasons left'
  else ' FAIL a firing did not end the day' end;

select case when (select resets_at from public.ps_attempts_state('dynasty')) > now() + interval '23 hours'
  then ' ok  and the 24 hour wait starts'
  else ' FAIL a firing started no wait' end;

-- ---------- 5) the repair: budget gone, no clock yet ------------------------
select public.become('bbbbbbbb-0000-0000-0000-000000000002');
select public.ps_attempt_spend('dynasty');
select public.ps_attempt_spend('dynasty');
select public.ps_attempt_spend('dynasty');
select case when (select resets_at from public.ps_attempt_day_end('dynasty', false)) > now() + interval '23 hours'
  then ' ok  a spent day with no clock on it still starts one'
  else ' FAIL the repair path no longer starts the clock' end;

-- ---------- 6) the other modes are untouched --------------------------------
select case when (select ended from public.ps_attempt_day_end('full')) is true
        and  (select resets_at from public.ps_attempts_state('full')) = public.ps_eastern_reset()
  then ' ok  Full Team still ends on the calendar day'
  else ' FAIL the calendar-day branch changed' end;
