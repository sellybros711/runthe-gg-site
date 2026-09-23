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

-- ---------------------------------------------------------------------------
-- THE REAL `profiles`, AND THIS USED TO BE THE COLUMN 109 HAPPENED TO READ.
--
-- It was written `create table public.profiles (id, display_name)` under a comment
-- reading "Only the column 109 reads", which is a fixture built to agree with the code it
-- stands in for rather than with the table that actually exists. `supabase/10_accounts.sql`
-- has no `display_name` at all: an account's name is `username`, a citext, and every other
-- board on this site copies it out with `select username::text`.
--
-- SO EVERY SQL TEST IN 109, 110, 111 AND 112 PASSED AGAINST A TABLE PRODUCTION DOES NOT
-- HAVE, and `fantasy_submit` raised `column p.display_name does not exist` on the first real
-- entry anybody tried to make. Reported by a player as "nothing happens when I press
-- submit", because the page had nowhere to say it.
--
-- It is the real shape now, down to the citext and the unique constraint, so a fixture can
-- no longer certify a function the live database will refuse. The columns this file leaves
-- out (`flag`, the streak counters, `created_at`) are ones no fantasy function reads;
-- what matters is that the NAME is where 10_accounts puts it.
-- ---------------------------------------------------------------------------
create extension if not exists citext;
drop table if exists public.profiles cascade;
create table public.profiles (
  id       uuid primary key references auth.users(id) on delete cascade,
  username citext unique
);
