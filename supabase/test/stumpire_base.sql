-- ---------------------------------------------------------------------------
-- A stand-in schema for testing 133_stumpire.sql against a real Postgres.
--
--   createdb stump
--   psql -d stump -c 'create role authenticated; create role anon; create role service_role;'
--   psql -d stump -f supabase/test/stumpire_base.sql
--   psql -d stump -f supabase/133_stumpire.sql
--   psql -d stump -f supabase/test/stumpire_test.sql
--
-- Only what 133 reads: auth.users. Every line of the test should start " ok ".
-- ---------------------------------------------------------------------------
drop schema if exists auth cascade;
create schema auth;
create table auth.users (id uuid primary key);
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),   -- admin
  ('00000000-0000-0000-0000-00000000000b'),   -- tester
  ('00000000-0000-0000-0000-00000000000c');   -- nobody
