-- ============================================================================
-- 53_stripe_payments.sql  —  Coins + Extra Spins (Stripe-funded, server-verified)
-- ============================================================================
-- First Stripe integration for RunThe.gg. Two real-money products, both one-time
-- (mode=payment). Fulfillment is server-authoritative: the Stripe webhook Edge
-- Function is the ONLY thing that credits a wallet, and it does so by looking a
-- purchase up in stripe_catalog (keyed on the Price's stable lookup_key) — the
-- client never says how much to grant.
--
--   COINS  — bought in 4 packs, spent on cosmetics (buy a name-colour with coins
--            instead of grinding achievements for it).
--   SPINS  — "extra Daily Challenge spins", a SEPARATE product from coins. Bought
--            as a single spin or a 5-pack, consumed one at a time by the daily.
--
-- Design notes
--   • Grants are keyed on Stripe Price.lookup_key (stable, human-set) — NOT the
--     auto-generated price_id — so the code is portable across test/live and the
--     catalog is the single source of truth for "how much does this grant".
--   • fulfill_stripe_purchase() is idempotent per (event_id, line-item) so Stripe
--     retries / duplicate deliveries can't double-credit.
--   • Every balance change is mirrored into an append-only ledger for audit.
--   • Extensible on purpose: add a 'subscription' grant_kind later (#3), or a
--     one-time "supporter" lookup_key that grants an entitlement (#2), without
--     touching the fulfillment plumbing.
--
-- Run AFTER 14_cosmetics.sql (it augments set_cosmetics) and 52_grid_daily.sql.
-- Idempotent: safe to re-run.
-- ----------------------------------------------------------------------------

-- ===========================================================================
-- Catalog — Price.lookup_key → what it grants. Public-readable so the store UI
-- can render packs; authoritative for fulfillment.
-- ===========================================================================
create table if not exists stripe_catalog (
  lookup_key   text primary key,
  grant_kind   text   not null check (grant_kind in ('coins','spins')),
  grant_amount bigint not null check (grant_amount > 0),
  usd_cents    int    not null check (usd_cents >= 0),   -- display only
  title        text   not null,
  sort         int    not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

alter table stripe_catalog enable row level security;
drop policy if exists stripe_catalog_public_read on stripe_catalog;
create policy stripe_catalog_public_read on stripe_catalog
  for select to anon, authenticated using (active);
grant select on table stripe_catalog to anon, authenticated;

-- Seed / refresh the launch catalog. Amounts mirror the Stripe Prices created by
-- supabase/stripe/create_products.py (same lookup_keys). usd_cents is display only.
insert into stripe_catalog (lookup_key, grant_kind, grant_amount, usd_cents, title, sort) values
  ('coins_100',  'coins', 100,   99,  '100 Coins',           10),
  ('coins_600',  'coins', 600,   499, '600 Coins',           20),
  ('coins_1300', 'coins', 1300,  999, '1,300 Coins',         30),
  ('coins_2800', 'coins', 2800,  1999,'2,800 Coins',         40),
  ('spin_1',     'spins', 1,     49,  '1 Extra Daily Spin',  50),
  ('spin_5',     'spins', 5,     199, '5 Extra Daily Spins', 60)
on conflict (lookup_key) do update
  set grant_kind   = excluded.grant_kind,
      grant_amount = excluded.grant_amount,
      usd_cents    = excluded.usd_cents,
      title        = excluded.title,
      sort         = excluded.sort,
      active       = true;

-- ===========================================================================
-- Wallets — one row per user, per currency. Balances only ever move through the
-- SECURITY DEFINER functions below; there is no client write policy.
-- ===========================================================================
create table if not exists coin_wallets (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  balance    bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);
create table if not exists spin_wallets (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  balance    int not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

alter table coin_wallets enable row level security;
alter table spin_wallets enable row level security;

drop policy if exists coin_wallets_owner_read on coin_wallets;
create policy coin_wallets_owner_read on coin_wallets
  for select to authenticated using (user_id = auth.uid());
drop policy if exists spin_wallets_owner_read on spin_wallets;
create policy spin_wallets_owner_read on spin_wallets
  for select to authenticated using (user_id = auth.uid());

grant select on table coin_wallets to authenticated;
grant select on table spin_wallets to authenticated;

-- ===========================================================================
-- Ledgers — append-only audit of every balance change (grant from a purchase,
-- spend on a cosmetic, spin consumed, etc.). delta > 0 credit, delta < 0 debit.
-- ===========================================================================
create table if not exists coin_ledger (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  delta      bigint not null,
  reason     text   not null,               -- 'purchase' | 'spend:cosmetic' | ...
  ref        text,                          -- lookup_key, item id, idem key, ...
  balance_after bigint,
  created_at timestamptz not null default now()
);
create table if not exists spin_ledger (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  delta      int  not null,
  reason     text not null,
  ref        text,
  balance_after int,
  created_at timestamptz not null default now()
);
create index if not exists coin_ledger_user_idx on coin_ledger (user_id, created_at desc);
create index if not exists spin_ledger_user_idx on spin_ledger (user_id, created_at desc);

alter table coin_ledger enable row level security;
alter table spin_ledger enable row level security;
drop policy if exists coin_ledger_owner_read on coin_ledger;
create policy coin_ledger_owner_read on coin_ledger
  for select to authenticated using (user_id = auth.uid());
drop policy if exists spin_ledger_owner_read on spin_ledger;
create policy spin_ledger_owner_read on spin_ledger
  for select to authenticated using (user_id = auth.uid());
grant select on table coin_ledger to authenticated;
grant select on table spin_ledger to authenticated;

-- ===========================================================================
-- Stripe customer mapping — user_id ↔ Stripe Customer. Written by the checkout
-- Edge Function (service role) the first time a user pays.
-- ===========================================================================
create table if not exists stripe_customers (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique not null,
  created_at         timestamptz not null default now()
);
alter table stripe_customers enable row level security;
-- No client policies: only the service role (which bypasses RLS) touches this.

-- ===========================================================================
-- Fulfillment log — idempotency guard + audit for the webhook. One row per
-- (Stripe event, line item). A duplicate delivery hits the PK and no-ops.
-- ===========================================================================
create table if not exists stripe_fulfillments (
  idem_key   text primary key,             -- '<event_id>:<line_item_index>'
  event_id   text not null,
  event_type text not null,
  user_id    uuid,
  lookup_key text,
  quantity   int,
  created_at timestamptz not null default now()
);
alter table stripe_fulfillments enable row level security;
-- No client policies: service role only.

-- ===========================================================================
-- Cosmetic store — what a name-colour / title costs in COINS. Purchased items
-- land in owned_cosmetics and become equippable (see set_cosmetics below).
-- Placeholder prices — tune freely.
-- ===========================================================================
create table if not exists cosmetic_prices (
  item      text primary key,              -- 'color:<name>' | 'title:<ach>_<tier>'
  coin_cost int  not null check (coin_cost > 0),
  label     text not null,
  active    boolean not null default true
);
alter table cosmetic_prices enable row level security;
drop policy if exists cosmetic_prices_public_read on cosmetic_prices;
create policy cosmetic_prices_public_read on cosmetic_prices
  for select to anon, authenticated using (active);
grant select on table cosmetic_prices to anon, authenticated;

insert into cosmetic_prices (item, coin_cost, label) values
  ('color:teal',    150,  'Teal name'),
  ('color:blue',    300,  'Blue name'),
  ('color:purple',  600,  'Purple name'),
  ('color:gold',    1200, 'Gold name'),
  ('color:crimson', 2000, 'Crimson name'),
  ('color:rainbow', 3500, 'Rainbow name')
on conflict (item) do nothing;

create table if not exists owned_cosmetics (
  user_id    uuid not null references auth.users(id) on delete cascade,
  item       text not null,                -- matches cosmetic_prices.item
  source     text not null default 'purchased' check (source in ('purchased','earned','granted')),
  created_at timestamptz not null default now(),
  primary key (user_id, item)
);
alter table owned_cosmetics enable row level security;
drop policy if exists owned_cosmetics_owner_read on owned_cosmetics;
create policy owned_cosmetics_owner_read on owned_cosmetics
  for select to authenticated using (user_id = auth.uid());
grant select on table owned_cosmetics to authenticated;

-- ===========================================================================
-- get_my_wallet()  —  balances for the signed-in user (0 when no wallet yet).
-- ===========================================================================
create or replace function get_my_wallet()
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'must be signed in'; end if;
  return jsonb_build_object(
    'coins', coalesce((select balance from coin_wallets where user_id = uid), 0),
    'spins', coalesce((select balance from spin_wallets where user_id = uid), 0)
  );
end;
$$;
revoke all on function get_my_wallet() from public;
grant execute on function get_my_wallet() to authenticated;

-- ===========================================================================
-- fulfill_stripe_purchase()  —  the ONLY path that credits a wallet.
-- Called by the stripe-webhook Edge Function with the service role. Idempotent
-- on p_idem_key. Grants strictly from stripe_catalog (never client-supplied).
-- Returns jsonb {status, kind, amount, balance}.
--   status: 'granted' | 'duplicate' | 'unknown_sku' | 'no_user'
-- ===========================================================================
create or replace function fulfill_stripe_purchase(
  p_idem_key   text,
  p_event_id   text,
  p_event_type text,
  p_user_id    uuid,
  p_lookup_key text,
  p_quantity   int
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_kind   text;
  v_amount bigint;
  v_qty    int := greatest(1, coalesce(p_quantity, 1));
  v_total  bigint;
  v_bal    bigint;
  v_ins    int;
begin
  -- idempotency: first writer wins; a retry finds the row already present.
  insert into stripe_fulfillments (idem_key, event_id, event_type, user_id, lookup_key, quantity)
  values (p_idem_key, p_event_id, p_event_type, p_user_id, p_lookup_key, v_qty)
  on conflict (idem_key) do nothing;
  get diagnostics v_ins = row_count;   -- 1 if inserted, 0 if already fulfilled
  if v_ins = 0 then
    return jsonb_build_object('status','duplicate');
  end if;

  if p_user_id is null then
    return jsonb_build_object('status','no_user');
  end if;

  select grant_kind, grant_amount into v_kind, v_amount
    from stripe_catalog where lookup_key = p_lookup_key and active;
  if v_kind is null then
    return jsonb_build_object('status','unknown_sku','lookup_key',p_lookup_key);
  end if;

  v_total := v_amount * v_qty;

  if v_kind = 'coins' then
    insert into coin_wallets (user_id, balance, updated_at)
      values (p_user_id, v_total, now())
      on conflict (user_id) do update
        set balance = coin_wallets.balance + v_total, updated_at = now()
      returning balance into v_bal;
    insert into coin_ledger (user_id, delta, reason, ref, balance_after)
      values (p_user_id, v_total, 'purchase', p_lookup_key, v_bal);
  else -- spins
    insert into spin_wallets (user_id, balance, updated_at)
      values (p_user_id, v_total, now())
      on conflict (user_id) do update
        set balance = spin_wallets.balance + v_total, updated_at = now()
      returning balance into v_bal;
    insert into spin_ledger (user_id, delta, reason, ref, balance_after)
      values (p_user_id, v_total, 'purchase', p_lookup_key, v_bal);
  end if;

  return jsonb_build_object('status','granted','kind',v_kind,'amount',v_total,'balance',v_bal);
end;
$$;
-- Locked down to the service role (used by the webhook). Not callable by clients.
revoke all on function fulfill_stripe_purchase(text,text,text,uuid,text,int) from public;
revoke all on function fulfill_stripe_purchase(text,text,text,uuid,text,int) from anon, authenticated;
grant execute on function fulfill_stripe_purchase(text,text,text,uuid,text,int) to service_role;

-- ===========================================================================
-- spend_coins_on_cosmetic()  —  atomically pay COINS to own a cosmetic.
-- Raises on unknown item / insufficient balance. Idempotent-ish: re-buying an
-- owned item is a no-op refund-free error (already owned).
-- Returns jsonb {item, spent, balance}.
-- ===========================================================================
create or replace function spend_coins_on_cosmetic(p_item text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid   uuid := auth.uid();
  v_cost int;
  v_bal  bigint;
begin
  if uid is null then raise exception 'must be signed in'; end if;

  select coin_cost into v_cost from cosmetic_prices where item = p_item and active;
  if v_cost is null then raise exception 'unknown or inactive cosmetic: %', p_item; end if;

  if exists (select 1 from owned_cosmetics where user_id = uid and item = p_item) then
    raise exception 'already owned: %', p_item;
  end if;

  -- lock the wallet row, verify funds, debit.
  select balance into v_bal from coin_wallets where user_id = uid for update;
  if coalesce(v_bal, 0) < v_cost then
    raise exception 'insufficient coins: need %, have %', v_cost, coalesce(v_bal,0);
  end if;

  update coin_wallets set balance = balance - v_cost, updated_at = now()
   where user_id = uid returning balance into v_bal;

  insert into owned_cosmetics (user_id, item, source) values (uid, p_item, 'purchased');
  insert into coin_ledger (user_id, delta, reason, ref, balance_after)
    values (uid, -v_cost, 'spend:cosmetic', p_item, v_bal);

  return jsonb_build_object('item', p_item, 'spent', v_cost, 'balance', v_bal);
end;
$$;
revoke all on function spend_coins_on_cosmetic(text) from public;
grant execute on function spend_coins_on_cosmetic(text) to authenticated;

-- ===========================================================================
-- consume_spin()  —  spend ONE extra Daily Challenge spin. The client calls this
-- when the player uses a purchased spin beyond the free daily allotment. Returns
-- jsonb {remaining}. Raises when the player has none.
-- ===========================================================================
create or replace function consume_spin()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid   uuid := auth.uid();
  v_bal int;
begin
  if uid is null then raise exception 'must be signed in'; end if;
  select balance into v_bal from spin_wallets where user_id = uid for update;
  if coalesce(v_bal, 0) < 1 then raise exception 'no extra spins'; end if;
  update spin_wallets set balance = balance - 1, updated_at = now()
   where user_id = uid returning balance into v_bal;
  insert into spin_ledger (user_id, delta, reason, ref, balance_after)
    values (uid, -1, 'spend:daily_spin', null, v_bal);
  return jsonb_build_object('remaining', v_bal);
end;
$$;
revoke all on function consume_spin() from public;
grant execute on function consume_spin() to authenticated;

-- ===========================================================================
-- set_cosmetics (v3)  —  now honours PURCHASED cosmetics as well as EARNED ones.
-- Same signature/behaviour as 14_cosmetics.sql, plus: a title/colour also counts
-- as unlocked if the user owns it in owned_cosmetics ('title:<id>' / 'color:<name>').
-- Earned-by-achievement remains valid exactly as before.
-- ===========================================================================
create or replace function set_cosmetics(p_title text, p_color text)
returns void language plpgsql security definer set search_path=public as $$
declare
  uid uuid := auth.uid();
  mx  jsonb;
  v_ach text;
  v_tier int;
  v_badges int;
  v_req int;
  v_owned boolean;
begin
  if uid is null then raise exception 'must be signed in'; end if;
  mx := _my_metrics(uid);

  if p_title is not null and p_title <> '' then
    v_owned := exists (select 1 from owned_cosmetics where user_id = uid and item = 'title:'||p_title);
    if not v_owned then
      v_ach  := split_part(p_title,'_',1);
      v_tier := nullif(split_part(p_title,'_',2),'')::int;
      if v_tier is null or _ach_level(v_ach, mx) <= v_tier then
        raise exception 'title not earned: %', p_title;
      end if;
    end if;
  end if;

  if p_color is not null and p_color <> '' and p_color <> 'default' then
    v_owned := exists (select 1 from owned_cosmetics where user_id = uid and item = 'color:'||p_color);
    if not v_owned then
      v_badges := _ach_level('draftsman',mx)+_ach_level('worldbeater',mx)+_ach_level('daily',mx)
                + _ach_level('galacticos',mx)+_ach_level('globetrotter',mx)+_ach_level('timetraveler',mx)
                + _ach_level('underdog',mx);
      v_req := case p_color when 'teal' then 3 when 'blue' then 6 when 'purple' then 10
                            when 'gold' then 15 when 'crimson' then 20 when 'rainbow' then 23 else 999 end;
      if v_badges < v_req then raise exception 'colour not unlocked: %', p_color; end if;
    end if;
  end if;

  update profiles
     set equipped_title = nullif(p_title,''),
         name_color     = nullif(p_color,'')
   where id = uid;
end;
$$;
revoke all on function set_cosmetics(text, text) from public;
grant  execute on function set_cosmetics(text, text) to authenticated;
