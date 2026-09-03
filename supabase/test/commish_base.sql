-- ---------------------------------------------------------------------------
-- A stand-in schema for testing 95_commish_choices.sql against a real Postgres.
--
--   createdb commish_test
--   psql -d commish_test -f supabase/test/commish_base.sql
--   psql -d commish_test -f supabase/95_commish_choices.sql
--   psql -d commish_test -f supabase/test/commish_test.sql
--
-- The last file prints one line per check. Every line should start with " ok ".
--
-- It needs roles Supabase has and a bare cluster does not:
--   create role authenticated;  create role anon;
--
-- WHAT THE STAND-IN IS AND IS NOT, same as ideas_base.sql: only what 95 reads or writes,
-- which here is auth.uid() and auth.users and nothing else at all. 95 joins to no
-- profile, reads no other game's table and returns no name, because a split is a count
-- and a count has no author. If this file ever needs a second table, that is worth
-- noticing rather than adding.
-- ---------------------------------------------------------------------------

drop schema if exists auth cascade;
create schema auth;
create table auth.users (id uuid primary key);
-- WHO IS CALLING, settable, because every interesting check in the test file is "the
-- same call from two different people". Supabase sets this from the JWT; a bare cluster
-- has nothing to set it from, so the test moves a row.
create table auth.session (uid uuid);
create or replace function auth.uid() returns uuid
  language sql stable as $$ select uid from auth.session limit 1 $$;

drop table if exists public.commish_choices cascade;
drop table if exists public.commish_tally cascade;

-- Two commissioners and a crowd. The crowd exists because the floor in splits.js is
-- eight, so nothing about a real split can be tested with fewer than eight people.
insert into auth.users (id)
select ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid
  from generate_series(1, 30) as i;

insert into auth.session (uid)
values ('00000000-0000-0000-0000-000000000001'::uuid);

-- Become somebody, by number.
create or replace function be(n integer) returns void
  language sql as $$
  update auth.session
     set uid = case when n is null then null
               else ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid end;
$$;
