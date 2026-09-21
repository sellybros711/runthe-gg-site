-- ---------------------------------------------------------------------------
-- A stand-in schema for testing 104_commish_free_clock.sql against a real
-- Postgres.
--
--   createdb clock_test
--   psql -d clock_test -f supabase/test/commish_clock_base.sql
--   psql -d clock_test -f supabase/104_commish_free_clock.sql
--   psql -d clock_test -f supabase/test/commish_clock_test.sql
--
-- The last file prints one line per check. Every line should start with " ok ".
--
-- It needs roles Supabase has and a bare cluster does not:
--   create role authenticated;  create role anon;
--
-- WHAT THE STAND-IN IS, same rule as commish_base.sql: only what 104 reads or
-- writes. That is auth.uid(), auth.users, and premium_unlocks, and the last one
-- is the whole reason this file is not commish_base.sql. 104 decides who is
-- paying by reading the entitlement table itself rather than trusting an
-- argument, so a test with no premium_unlocks in it cannot exercise the branch
-- that matters most.
--
-- premium_unlocks IS COPIED HERE RATHER THAN LOADED FROM 101. Running the real
-- 101_premium_bundles.sql needs public.subscriptions, which belongs to the
-- Arcade and has nothing to do with this, and it fails loudly halfway through on
-- a bare cluster. What 104 touches is four columns and the product constraint,
-- so those are what stand in. If 104 ever reads a fifth, this file has to grow
-- with it, and the check constraint is kept identical on purpose so a typo'd
-- product name is refused here exactly as it would be in production.
-- ---------------------------------------------------------------------------

drop schema if exists auth cascade;
create schema auth;
create table auth.users (id uuid primary key);
-- WHO IS CALLING, settable, because every interesting check in the test file is
-- "the same call from two different people". Supabase sets this from the JWT; a
-- bare cluster has nothing to set it from, so the test moves a row. A table
-- rather than a session setting: set_config(..., true) is transaction local and
-- psql runs each statement in its own transaction, so the caller would be
-- forgotten between two lines of the test.
create table auth.session (uid uuid);
create or replace function auth.uid() returns uuid
  language sql stable as $$ select uid from auth.session limit 1 $$;

drop table if exists public.commish_free_clock cascade;
drop table if exists public.premium_unlocks cascade;

-- The slice of 101_premium_bundles.sql that 104 reads. See the note above.
create table public.premium_unlocks (
  user_id      uuid not null references auth.users(id) on delete cascade,
  product      text not null,
  source       text,
  expires_at   timestamptz,
  granted_at   timestamptz not null default now(),
  primary key (user_id, product),
  constraint premium_unlocks_product_ck
    check (product in ('ps_premium', 'cfb_premium', 'arcade_card_year', 'runtour_pack'))
);

-- Two accounts: one that pays and one that does not. Everything in the test file
-- is one of those two doing the same thing and getting a different answer.
insert into auth.users (id)
select ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid
  from generate_series(1, 4) as i;

insert into auth.session (uid)
values ('00000000-0000-0000-0000-000000000001'::uuid);

-- Become somebody, by number. be(null) is a guest.
create or replace function be(n integer) returns void
  language sql as $$
  update auth.session
     set uid = case when n is null then null
               else ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid end;
$$;

-- The uuid of account n, so the test can assert on rows without spelling it out.
create or replace function who(n integer) returns uuid
  language sql immutable as $$
  select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid;
$$;
