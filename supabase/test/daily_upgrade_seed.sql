-- ---------------------------------------------------------------------------
-- A day already in progress under 99, to be left sitting in the table while 100
-- runs over it. Loaded BETWEEN the two migrations:
--
--   psql -d daily -f supabase/99_daily_attempts.sql
--   psql -d daily -f supabase/test/daily_upgrade_seed.sql
--   psql -d daily -f supabase/100_daily_grace_reasons.sql
--   psql -d daily -f supabase/test/daily_test.sql
--
-- This player was fired in season one this morning and took the extra run. 100
-- drops the column that is holding that fact, so if the backfill is wrong they
-- lose an attempt they already earned. daily_test.sql asserts they did not.
-- ---------------------------------------------------------------------------
insert into auth.users(id) values ('44444444-4444-4444-4444-444444444444') on conflict do nothing;
select public.become('44444444-4444-4444-4444-444444444444');
select public.ps_attempt_spend('dynasty');
select public.ps_attempt_grace('dynasty');
select public.ps_attempt_spend('dynasty');
