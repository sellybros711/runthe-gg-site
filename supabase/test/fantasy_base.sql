-- fantasy_base.sql : the bits of Supabase a bare Postgres does not have.
--
-- The same shape as `dynboard_base.sql`, plus `profiles`, because `fantasy_submit` reads
-- the display name out of it rather than taking one as an argument.

do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $$;

drop schema if exists auth cascade;
create schema auth;
create table auth.users (id uuid primary key);
create table auth.session (uid uuid);
create or replace function auth.uid() returns uuid
  language sql stable security definer as $$ select uid from auth.session limit 1 $$;
grant usage on schema auth to anon, authenticated;

create or replace function public.become(p uuid) returns void
  language sql as $$ delete from auth.session; insert into auth.session values (p); $$;

/* Signing out is its own state and the tests need it: `fantasy_submit` refusing a stranger
   is one of the claims, and it cannot be made by becoming somebody. */
create or replace function public.become_nobody() returns void
  language sql as $$ delete from auth.session; $$;

-- Only the column 109 reads.
drop table if exists public.profiles cascade;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text
);
