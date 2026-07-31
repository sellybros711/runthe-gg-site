-- Enough of Supabase to run 62_cfb_leaderboard.sql against a bare Postgres and
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

create role anon;
create role authenticated;
