-- Enough of Supabase to run 67_setlist_leaderboard.sql against a bare Postgres and
-- exercise it for real. NOT part of the deploy: the production project already
-- has every one of these, created by Supabase itself or by 10_accounts.sql.
--
-- auth.uid() is a settable stand-in here so a test can submit as a guest, as one
-- account and then as another without an auth server in the loop.
create schema if not exists auth;
create extension if not exists citext;

create table if not exists auth.users (id uuid primary key);

-- The real one reads a JWT claim. This reads a session setting, which is the
-- same thing from the function's point of view: a uuid or null.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

-- profiles, as 10_accounts.sql creates it: citext-unique username.
create table if not exists profiles (
  id       uuid primary key,
  username citext unique
);

-- The two accounts every suite here signs in as. Seeded with the schema rather than
-- by hand, because segue_submit_run() reads the display name OUT of this table: an
-- empty profiles does not fail loudly, it records the show under a null name, and
-- the suite that checks the name then fails on a database that was simply never
-- filled in. Setting up a fresh test database must not be a step somebody remembers.
--
-- segue_attended references auth.users, so the two accounts have to exist there
-- too or every attendance test fails on a foreign key rather than on its subject.
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222')
on conflict (id) do nothing;

insert into profiles (id, username) values
  ('11111111-1111-1111-1111-111111111111', 'rickspringfield'),
  ('22222222-2222-2222-2222-222222222222', 'peterframpton')
on conflict (id) do nothing;

/* ROLES ARE CLUSTER-WIDE, not per database, so a second test database in the
   same cluster finds these already there and a bare `create role` aborts the
   whole file under ON_ERROR_STOP. Guarded, so setting up another database is
   not a step somebody has to know about. */
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end $$;
