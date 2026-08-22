-- ---------------------------------------------------------------------------
-- A stand-in schema for testing 92_ideas_board.sql against a real Postgres.
--
--   createdb ideas_test
--   psql -d ideas_test -f supabase/test/ideas_base.sql
--   psql -d ideas_test -f supabase/92_ideas_board.sql
--   psql -d ideas_test -f supabase/test/ideas_test.sql
--
-- The last file prints one line per check. Every line should start with " ok ".
--
-- It needs roles Supabase has and a bare cluster does not:
--   create role authenticated;  create role anon;
--
-- WHAT THE STAND-IN IS AND IS NOT. Only the columns 92 reads or writes, plus auth.uid()
-- and auth.users. It is deliberately NOT a copy of the real schema: the point is to find
-- out whether 92 is self-contained, and a stand-in that carried everything would hide a
-- missing dependency by accident.
-- ---------------------------------------------------------------------------

drop schema if exists auth cascade;
create schema auth;
create table auth.users (id uuid primary key);
create table auth.session (uid uuid);
create or replace function auth.uid() returns uuid
  language sql stable as $$ select uid from auth.session limit 1 $$;

drop table if exists public.idea_votes cascade;
drop table if exists public.ideas cascade;
drop table if exists public.profiles cascade;

-- Only the seven fields the read view joins on.
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  username        text unique,
  avatar_color    text,
  avatar_initials text,
  crest_mark      text,
  crest_rung      smallint,
  crest_tier      text,
  crest_ring      text
);

-- A helper for the tests: make an account and become it.
create or replace function public.mkuser(p_name text) returns uuid
language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users(id) values (v_id);
  insert into public.profiles(id, username, avatar_color, avatar_initials)
    values (v_id, p_name, 'KC', upper(substr(p_name,1,2)));
  return v_id;
end $$;

create or replace function public.become(p_id uuid) returns void
language sql as $$
  delete from auth.session; insert into auth.session values (p_id);
$$;
