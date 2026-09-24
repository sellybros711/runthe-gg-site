-- ---------------------------------------------------------------------------
-- 101_premium_bundles.sql : one-time premium purchases (Perfect Season Premium
-- Bundle, Run The Bundle)
--
-- Safe to run more than once.
--
-- RUN THIS BEFORE EITHER BUNDLE'S STRIPE PRICE ENV VAR IS SET. The webhook
-- grants a paid bundle by inserting into premium_unlocks; until this table
-- exists every grant it tries throws, the webhook returns 500, and Stripe
-- retries into the same wall. Nobody loses money (the retry succeeds once the
-- table exists), but the order is still: migration, then env vars, then sell.
--
-- WHAT THIS IS. The subscriptions table (53_grid_pro.sql) holds ONE recurring
-- entitlement per user and is written by Stripe subscription events. A bundle
-- is a different shape: one payment, several grants, some permanent (the NFL
-- and CFB premium modes), one time-boxed (a year of the Arcade Card), one
-- consumable (Run The Tour coins + packs). So bundles get their own table, one
-- row per (user, product), written ONLY by the webhook's service role, readable
-- by the owner. dynasty-access.js says the thing that decides a PAID mode has
-- to be the database and not a list shipped in the page: this table is that
-- database.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The unlocks.
-- ---------------------------------------------------------------------------
-- product is constrained BY NAME, the ps_runs_run_mode_ck pattern: an unknown
-- product is rejected loudly at insert instead of granted silently and honored
-- by nothing. Adding a product means editing this constraint AND the catalog in
-- functions/api/stripe/_bundles.js; verify-bundles.mjs fails if they drift.
--
--   ps_premium        Perfect Season (NFL): dynasty + one franchise dynasty. Permanent.
--   cfb_premium       CFB: commissioner mode. Permanent.
--   arcade_card_year  12 months of Arcade Card. expires_at carries the end.
--   runtour_pack      Run The Tour coins + packs. payload says what; the golf
--                     backend credits the wallet and stamps fulfilled_at.
create table if not exists public.premium_unlocks (
  user_id      uuid not null references auth.users(id) on delete cascade,
  product      text not null,
  source       text not null default 'stripe',   -- 'bundle:<key>' from the webhook, 'comp' by hand
  payload      jsonb not null default '{}'::jsonb,
  expires_at   timestamptz,                      -- null = permanent
  granted_at   timestamptz not null default now(),
  fulfilled_at timestamptz,                      -- null until delivered out of band (runtour_pack)
  primary key (user_id, product),
  constraint premium_unlocks_product_ck
    check (product in ('ps_premium', 'cfb_premium', 'arcade_card_year', 'runtour_pack'))
);

alter table public.premium_unlocks enable row level security;

-- each signed-in user may read their own unlocks; nobody writes from the client
drop policy if exists "premium_unlocks read own" on public.premium_unlocks;
create policy "premium_unlocks read own" on public.premium_unlocks
  for select using (auth.uid() = user_id);

-- no insert/update/delete policies: only the service-role key (webhook) writes.

-- ---------------------------------------------------------------------------
-- 2. The one question the game pages ask.
-- ---------------------------------------------------------------------------
-- Returns the caller's live product keys. "Live" means unexpired; a permanent
-- unlock has no expiry. The football and CFB pages ask this once at load and
-- gate their premium mode cards on the answer, which replaces (for paid access)
-- the tester lists in dynasty-access.js and commish/access.js.
create or replace function public.premium_products()
returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(product), '{}')
  from public.premium_unlocks
  where user_id = auth.uid()
    and (expires_at is null or expires_at > now());
$$;

grant execute on function public.premium_products() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The Arcade Card honors a bundle year.
-- ---------------------------------------------------------------------------
-- Same function 69_arcade_card.sql defined, with one more way to be a member:
-- an unexpired arcade_card_year unlock. The bundle never writes a subscriptions
-- row, so a buyer who later starts (or already has) a real Arcade subscription
-- keeps both intact: the subscription events own the subscriptions row, the
-- bundle year sits here, and this OR honors whichever is alive. The one-day
-- grace on the subscription branch is kept as-is; the bundle branch needs none,
-- because expires_at is written a year out by our own webhook, not by a renewal
-- that might land late.
create or replace function public.arcade_card_active(p_uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = p_uid
      and s.status in ('active','trialing')
      and (s.current_period_end is null or s.current_period_end > now() - interval '1 day')
  )
  or exists (
    select 1 from public.premium_unlocks u
    where u.user_id = p_uid
      and u.product = 'arcade_card_year'
      and (u.expires_at is null or u.expires_at > now())
  );
$$;
