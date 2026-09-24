-- ---------------------------------------------------------------------------
-- A stand-in schema for testing 97_baseball_leaderboard.sql against a real
-- Postgres.
--
--   createdb rtd_test
--   psql -d rtd_test -f supabase/test/baseball_board_base.sql
--   psql -d rtd_test -f supabase/97_baseball_leaderboard.sql
--   psql -d rtd_test -f supabase/test/baseball_board_test.sql
--
-- The last file prints one line per check. Every line should start with "ok".
--
-- This file supplies only what the migration leans on and Supabase already has:
-- the two roles, a `profiles` table, and an auth.uid() the test can steer.
-- ---------------------------------------------------------------------------

create extension if not exists citext;

do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $$;

create schema if not exists auth;

-- 10_accounts.sql, reduced to the two columns rtd_submit_run() reads.
create table if not exists profiles (
  id       uuid primary key,
  username citext unique
);

-- The real auth.uid() reads the request's JWT. This one reads a GUC, so a test
-- can be anonymous (the default) or signed in:
--   set local test.uid = '...uuid...';
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
