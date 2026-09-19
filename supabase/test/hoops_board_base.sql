-- ---------------------------------------------------------------------------
-- A stand-in schema for testing 108_hoops_leaderboard.sql against a real
-- Postgres.
--
--   createdb hoops_board
--   psql -d hoops_board -c 'create role authenticated; create role anon;'
--   psql -d hoops_board -f supabase/test/hoops_board_base.sql
--   psql -d hoops_board -f supabase/108_hoops_leaderboard.sql
--   psql -d hoops_board -f supabase/test/hoops_board_test.sql
--
-- The last file prints one line per check. Every line should start with " ok ".
--
-- WHAT THE STAND-IN IS AND IS NOT, the same rule the other files in this
-- directory follow: only what 108 reads or writes, which is auth.uid() and the
-- username column of profiles. A stand-in carrying the whole site schema would
-- hide a missing dependency, which is most of what a migration test is for.
-- ---------------------------------------------------------------------------

drop schema if exists auth cascade;
create schema auth;
create table auth.users (id uuid primary key);
create table auth.session (uid uuid);
create or replace function auth.uid() returns uuid
  language sql stable as $$ select uid from auth.session limit 1 $$;

drop table if exists public.rtf_runs cascade;
drop table if exists public.profiles cascade;

create table public.profiles (
  id       uuid primary key references auth.users(id) on delete cascade,
  username text unique
);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002');
insert into public.profiles (id, username) values
  ('00000000-0000-0000-0000-000000000001', 'jordan'),
  ('00000000-0000-0000-0000-000000000002', 'pippen');

insert into auth.session (uid) values (null);

-- Who the next call is made as. null is a signed out visitor, which is the
-- state most of the checks below run in, because a run recorded by somebody
-- with no account is the ordinary case and not the edge one.
create or replace function be(n integer) returns void
  language sql as $$
  update auth.session
     set uid = case when n is null then null
               else ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid end;
$$;

-- TODAY'S DAY NUMBER, worked out the same way the function does, because a
-- test that hardcoded a day would start failing on a date nobody chose. It is
-- a second implementation of one line, which is a shape this repo distrusts,
-- so the first check in the test file is the two of them agreeing through a
-- real submit.
create or replace function today_day() returns int
  language sql stable as $$
  select (((now() at time zone 'America/New_York')::date - date '2026-09-18') + 1)::int
$$;

-- One legal roster, so a check that is about something else does not have to
-- write six picks out again. The ids are the shape players.json uses.
create or replace function six(tag text default 'a') returns text[]
  language sql immutable as $$
  select array[
    'jordami01|1996|CHI', 'pippesc01|1996|CHI', 'rodmade01|1996|CHI',
    'kukocto01|1996|CHI', 'harpero01|1996|CHI',
    'longolu01|199' || (abs(hashtext(tag)) % 10)::text || '|CHI'
  ]::text[]
  -- The sixth pick varies with the tag so two calls can be two different
  -- rosters, which is what the double submit guard needs to be asked about.
  -- A DIGIT AND NOT A HASH CHARACTER: md5 is hex, so one call in three would
  -- have produced a season ending in a letter and been refused by the pick
  -- format check, on a line that has nothing to do with what was being tested.
$$;
