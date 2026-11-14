-- A stand-in schema for testing 170_game_events.sql against a real Postgres.
--   createdb ev
--   psql -d ev -c 'create role authenticated; create role anon; create role service_role;'
--   psql -d ev -f supabase/test/game_events_base.sql
--   psql -d ev -f supabase/170_game_events.sql     (twice: it is idempotent)
--   psql -d ev -f supabase/test/game_events_test.sql
-- Only what 170 reads: auth.users and stumpire_testers.
drop schema if exists auth cascade;
create schema auth;
create table auth.users (id uuid primary key);
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c'), ('00000000-0000-0000-0000-00000000000d'),
  ('00000000-0000-0000-0000-00000000000e'), ('00000000-0000-0000-0000-0000000000ad');
drop table if exists public.stumpire_testers cascade;
create table public.stumpire_testers (user_id uuid primary key references auth.users(id), role text not null);
insert into public.stumpire_testers values
  ('00000000-0000-0000-0000-00000000000a', 'tester'), ('00000000-0000-0000-0000-00000000000b', 'tester'),
  ('00000000-0000-0000-0000-00000000000c', 'tester'), ('00000000-0000-0000-0000-00000000000d', 'tester'),
  ('00000000-0000-0000-0000-00000000000e', 'tester'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin');
