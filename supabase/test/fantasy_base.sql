-- ---------------------------------------------------------------------------
-- A stand-in schema for testing 109, 110 and 111 against a real Postgres.
--
--   createdb fantasy
--   psql -d fantasy -c 'create role authenticated; create role anon; create role service_role;'
--   psql -d fantasy -f supabase/test/fantasy_base.sql
--   psql -d fantasy -f supabase/109_fantasy_access.sql
--   psql -d fantasy -f supabase/110_fantasy_core.sql
--   psql -d fantasy -f supabase/111_fantasy_model.sql
--   psql -d fantasy -f supabase/test/fantasy_rls_test.sql
--
-- The last file prints one line per check. Every line should start with " ok ".
--
-- WHAT THE STAND-IN IS AND IS NOT, the same rule every other file in this
-- directory follows: only what the three migrations actually read, which is
-- auth.uid(), auth.users and the username column of profiles. A stand-in
-- carrying the whole site schema would hide a missing dependency, and finding
-- a missing dependency is most of what a migration test is for.
--
-- profiles.username IS CITEXT HERE, matching 10_accounts.sql rather than the
-- plain text the other stubs in this directory use. That is deliberate: 109's
-- seed resolves usernames through this column, and the trap it is written
-- around ("set_username stores the casing somebody typed and an exact-case
-- match silently misses them", from 72_comp_passes.sql) only exists if the
-- type is right. Against plain text the seed would pass here and miss a real
-- account with a capital letter in its name.
-- ---------------------------------------------------------------------------

create extension if not exists citext;

drop schema if exists auth cascade;
create schema auth;

create table auth.users (id uuid primary key);

-- WHO IS SIGNED IN, FOR THE DURATION OF A TEST. The real auth.uid() reads a
-- JWT claim. This reads a one row table, so a test can switch account between
-- two statements, which is exactly what the RLS test has to do.
--
-- An EMPTY table means signed out, and auth.uid() then answers null, which is
-- what the anon case has to look like. That is the case the whole gate turns
-- on, so it gets its own helper rather than being written by hand each time.
create table auth.session (uid uuid);
create or replace function auth.uid() returns uuid
  language sql stable as $$ select uid from auth.session limit 1 $$;

create or replace function auth.become(p uuid) returns void
  language sql as $$ delete from auth.session; insert into auth.session values (p); $$;

create or replace function auth.sign_out() returns void
  language sql as $$ delete from auth.session; $$;

create table public.profiles (
  id       uuid primary key references auth.users(id) on delete cascade,
  username citext unique
);

-- Three accounts, and the third is the one that matters. Two will be seeded
-- onto the allowlist by 109. The third is a real, signed-in account that is
-- NOT on it, which is the case the gate exists for and the case a test written
-- only against signed-out visitors would never touch.
--
-- 'MalikWillisLover' is stored with the casing somebody would actually type.
-- 109's seed lowercases before matching. Written here in mixed case on purpose
-- so that a seed which stopped doing that fails this file rather than failing
-- in production against a real account.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c');

insert into public.profiles (id, username) values
  ('00000000-0000-0000-0000-00000000000a', 'MalikWillisLover'),
  ('00000000-0000-0000-0000-00000000000b', 'runnyj'),
  ('00000000-0000-0000-0000-00000000000c', 'astranger');

-- ---------------------------------------------------------------------------
-- The grants a real Supabase project already has
-- ---------------------------------------------------------------------------
-- Without these the RLS test cannot tell a policy denying a row from a role
-- that was never allowed to look at the schema, and those two failures read
-- identically from the client. Real Supabase grants schema usage to anon and
-- authenticated on both schemas, so the stub does too. Anything narrower here
-- would make the test pass for the wrong reason.
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth   to anon, authenticated, service_role;

-- The stub's auth.uid() reads a table where the real one reads a JWT claim, so
-- the calling role needs to be able to see it. This grant exists only in the
-- stand-in and has no equivalent in production.
grant select on auth.session to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
