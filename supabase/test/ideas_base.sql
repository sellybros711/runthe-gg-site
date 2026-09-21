-- ---------------------------------------------------------------------------
-- A stand-in schema for testing 92_ideas_board.sql against a real Postgres.
--
--   psql -d postgres -c 'create role anon' -c 'create role authenticated'
--   createdb ideas_test
--   psql -d ideas_test -f supabase/test/ideas_base.sql
--   psql -d ideas_test -f supabase/92_ideas_board.sql
--   psql -d ideas_test -f supabase/test/ideas_test.sql
--
-- The last file prints one line per check. Every line should start with " ok ".
--
-- THE TWO ROLES COME FIRST, and are the two Supabase has that a bare cluster does not.
-- This file and 92 both grant to them, so creating them afterwards is too late. The last
-- third of ideas_test.sql switches into them to read the board the way a browser does,
-- which is the only part of the suite that can see a missing grant.
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
-- SECURITY DEFINER, so the switched-role checks at the bottom of ideas_test.sql can call
-- it. On real Supabase auth.uid() reads a GUC and anybody can call it; here it reads a
-- table, and a plain invoker function would need anon to hold a grant on auth.session.
-- That grant would be a fact about the harness masquerading as a fact about 92.
create or replace function auth.uid() returns uuid
  language sql stable security definer as $$ select uid from auth.session limit 1 $$;
grant usage on schema auth to anon, authenticated;

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

-- ---------------------------------------------------------------------------
-- WHAT PRODUCTION ALREADY GRANTS, and 92 therefore should not.
--
-- ideas_public joins profiles, and it is a security_invoker view, so a browser reading
-- the board reads profiles under its own privileges. On the live database that grant is
-- already there: every game on the site reads profiles straight from the client for the
-- signed in username and crest. 10_accounts.sql owns that table and its world-readable
-- policy, so the grant belongs here as a precondition rather than inside 92.
--
-- The two roles themselves are Supabase's and a bare cluster has neither:
--   create role anon;  create role authenticated;
-- ---------------------------------------------------------------------------
grant select on public.profiles to anon, authenticated;
