-- ---------------------------------------------------------------------------
-- A stand-in schema for testing 134_arcade_lab.sql against a real Postgres.
--
--   createdb lab
--   psql -d lab -c 'create role authenticated; create role anon; create role service_role;'
--   psql -d lab -f supabase/test/arcade_lab_base.sql
--   psql -d lab -f supabase/134_arcade_lab.sql
--   psql -d lab -f supabase/134_arcade_lab.sql      (twice: it is idempotent)
--   psql -d lab -f supabase/test/arcade_lab_test.sql
--
-- Only what 134 reads: auth.users and profiles, in their real shape.
-- ---------------------------------------------------------------------------
create extension if not exists citext;
drop schema if exists auth cascade;
create schema auth;
create table auth.users (id uuid primary key);
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b2');
drop table if exists public.profiles cascade;
create table public.profiles (id uuid primary key references auth.users(id), username citext unique);
insert into public.profiles values ('00000000-0000-0000-0000-0000000000a1', 'alpha'), ('00000000-0000-0000-0000-0000000000b2', 'beta');
