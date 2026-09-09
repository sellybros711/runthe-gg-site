-- ---------------------------------------------------------------------------
-- Stand-in schema for the Run The Bundle redemption test.
--
-- Two of these tables are the real thing and one is a reconstruction, and the
-- difference matters when you read a passing test:
--
--   auth / become()      the same stand-ins daily_base.sql uses
--   premium_unlocks      copied from 101_premium_bundles.sql, which is in this
--                        repository, so it is exact
--   coin_wallet          RECONSTRUCTED. The Run The Tour store migrations are
--                        not in this repository. The column names below are the
--                        ones golf/index.html reads back out of
--                        runtour_wallet(): paid_coins, lifetime_purchased,
--                        lifetime_granted, daily_tokens, pass_active,
--                        pass_period. That is a contract the client depends on,
--                        not a guess, but it is the FUNCTION's output shape and
--                        the table underneath could name a column differently.
--
-- So what the test proves is the redemption's behaviour: exactly once, under
-- concurrency, off the payload, cheap when there is nothing to do. What it
-- cannot prove is that production's wallet table has these column names. The
-- migration's preflight is what covers that: run it against the real database
-- and it either applies or names the columns coin_wallet actually has.
-- ---------------------------------------------------------------------------

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

-- ---- the wallet, reconstructed from the client's reads ----------------------
drop table if exists public.coin_wallet cascade;
create table public.coin_wallet (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  paid_coins         bigint      not null default 0,
  lifetime_purchased bigint      not null default 0,
  lifetime_granted   bigint      not null default 0,
  daily_tokens       integer     not null default 0,
  pass_active        boolean     not null default false,
  pass_period        text,
  updated_at         timestamptz not null default now()
);

-- ---- premium_unlocks, straight out of 101 ----------------------------------
drop table if exists public.premium_unlocks cascade;
create table public.premium_unlocks (
  user_id      uuid not null references auth.users(id) on delete cascade,
  product      text not null,
  source       text not null default 'stripe',
  payload      jsonb not null default '{}'::jsonb,
  expires_at   timestamptz,
  granted_at   timestamptz not null default now(),
  fulfilled_at timestamptz,
  primary key (user_id, product),
  constraint premium_unlocks_product_ck
    check (product in ('ps_premium', 'cfb_premium', 'arcade_card_year', 'runtour_pack'))
);
alter table public.premium_unlocks enable row level security;
create policy "premium_unlocks read own" on public.premium_unlocks
  for select using (auth.uid() = user_id);
