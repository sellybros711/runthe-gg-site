-- ============================================================================
-- 52_runtour_wallet.sql  —  RunTheTour: server-authoritative PAID-coin wallet
-- ============================================================================
-- Phase 0 of monetization, model "A" (protect the money now, full lockdown
-- later). Real-money coins are tracked ONLY by the server and can never be set
-- from the browser. Earned (gameplay) coins keep their existing client-derived
-- flow — this migration does NOT touch bag_coins / coinBalance().
--
--   • coin_wallet     — one row/user: currently-available PURCHASED coins
--   • coin_purchase   — one row per Stripe purchase (idempotent on event id)
--   • coin_ledger     — append-only journal of every server-side coin change
--
-- Every mutation goes through a security-definer function; there are NO RLS
-- write policies, so PostgREST clients cannot INSERT/UPDATE/DELETE these tables
-- directly. Money-critical functions are granted to service_role only (the
-- Stripe webhook), never to anon/authenticated.
--
--   runtour_wallet()              (authenticated) read your own wallet
--   runtour_spend_paid(amt,item)  (authenticated) atomically spend paid coins
--   runtour_claim_founder()       (authenticated) one-time pre-launch bonus
--   runtour_credit_purchase(...)  (service_role)  webhook credits a purchase
--   runtour_refund_purchase(...)  (service_role)  chargeback / refund clawback
--   runtour_grant_coins(...)      (service_role)  admin / founder / support grants
--
-- Run AFTER 10_accounts.sql. Idempotent; safe to re-run.
-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists coin_wallet (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  paid_coins         bigint not null default 0,   -- currently-available purchased coins
  lifetime_purchased bigint not null default 0,   -- total ever bought (never decreases)
  lifetime_granted   bigint not null default 0,   -- total admin/founder grants (never decreases)
  updated_at         timestamptz not null default now(),
  constraint coin_wallet_nonneg check (paid_coins >= 0)
);
alter table coin_wallet enable row level security;
drop policy if exists coin_wallet_owner_read on coin_wallet;
create policy coin_wallet_owner_read on coin_wallet
  for select to authenticated using (auth.uid() = user_id);
grant select on table coin_wallet to authenticated;   -- read only; no write grants

create table if not exists coin_purchase (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  stripe_event   text unique,                  -- Stripe event.id → idempotency key
  stripe_session text,                          -- checkout.session.id
  stripe_pi      text,                          -- payment_intent id (used for refunds/disputes)
  package_id     text,                          -- server package key (e.g. 'tour', 'tour+fp')
  coins          bigint not null,               -- coins credited (incl. any first-purchase bonus)
  amount_cents   int,
  currency       text not null default 'usd',
  status         text not null default 'paid'
                 check (status in ('paid','refunded','disputed')),
  created_at     timestamptz not null default now()
);
alter table coin_purchase enable row level security;
drop policy if exists coin_purchase_owner_read on coin_purchase;
create policy coin_purchase_owner_read on coin_purchase
  for select to authenticated using (auth.uid() = user_id);
grant select on table coin_purchase to authenticated;
create index if not exists coin_purchase_user_idx on coin_purchase (user_id, created_at desc);
create index if not exists coin_purchase_pi_idx   on coin_purchase (stripe_pi);

create table if not exists coin_ledger (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  delta      bigint not null,                   -- +credit / -debit against paid_coins
  balance    bigint not null,                   -- paid_coins AFTER applying delta
  kind       text not null
             check (kind in ('purchase','refund','grant','founder','spend','adjust')),
  ref        text,                              -- stripe event / item id / support note
  created_at timestamptz not null default now()
);
alter table coin_ledger enable row level security;
drop policy if exists coin_ledger_owner_read on coin_ledger;
create policy coin_ledger_owner_read on coin_ledger
  for select to authenticated using (auth.uid() = user_id);
grant select on table coin_ledger to authenticated;
create index if not exists coin_ledger_user_idx on coin_ledger (user_id, created_at desc);
-- at most one founder bonus per account (race-safe guard)
create unique index if not exists coin_ledger_one_founder on coin_ledger (user_id) where kind = 'founder';

-- ---------------------------------------------------------------------------
-- Internal: apply a delta to a wallet + journal it, atomically. Not client-callable.
-- ---------------------------------------------------------------------------
create or replace function runtour_wallet_apply(p_user uuid, p_delta bigint, p_kind text, p_ref text)
returns bigint
language plpgsql security definer set search_path = public as $$
declare v_new bigint;
begin
  insert into coin_wallet (user_id) values (p_user) on conflict (user_id) do nothing;
  update coin_wallet
     set paid_coins = greatest(0, paid_coins + p_delta),
         lifetime_purchased = lifetime_purchased
           + (case when p_kind = 'purchase' and p_delta > 0 then p_delta else 0 end),
         lifetime_granted = lifetime_granted
           + (case when p_kind in ('grant','founder') and p_delta > 0 then p_delta else 0 end),
         updated_at = now()
   where user_id = p_user
   returning paid_coins into v_new;
  insert into coin_ledger (user_id, delta, balance, kind, ref)
    values (p_user, p_delta, v_new, p_kind, p_ref);
  return v_new;
end $$;
revoke all on function runtour_wallet_apply(uuid,bigint,text,text) from public;

-- ---------------------------------------------------------------------------
-- runtour_wallet()  —  the caller reads their own paid balance (0 if none)
-- ---------------------------------------------------------------------------
create or replace function runtour_wallet()
returns table (paid_coins bigint, lifetime_purchased bigint, lifetime_granted bigint)
language sql security definer set search_path = public as $$
  select coalesce(w.paid_coins,0), coalesce(w.lifetime_purchased,0), coalesce(w.lifetime_granted,0)
  from (select auth.uid() as uid) u
  left join coin_wallet w on w.user_id = u.uid;
$$;
revoke all on function runtour_wallet() from public;
grant execute on function runtour_wallet() to authenticated;

-- ---------------------------------------------------------------------------
-- runtour_spend_paid(amount, item)  —  atomically spend purchased coins.
-- The client spends earned coins locally first; it calls this ONLY for the
-- portion drawn from paid coins. Row-locked to prevent double-spend.
-- ---------------------------------------------------------------------------
create or replace function runtour_spend_paid(p_amount bigint, p_item text default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_bal bigint;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
  insert into coin_wallet (user_id) values (v_uid) on conflict (user_id) do nothing;
  select paid_coins into v_bal from coin_wallet where user_id = v_uid for update;
  if coalesce(v_bal,0) < p_amount then
    raise exception 'insufficient paid coins' using errcode = '23514';
  end if;
  return runtour_wallet_apply(v_uid, -p_amount, 'spend', p_item);
end $$;
revoke all on function runtour_spend_paid(bigint,text) from public;
grant execute on function runtour_spend_paid(bigint,text) to authenticated;

-- ---------------------------------------------------------------------------
-- runtour_claim_founder()  —  one-time "thank you" for pre-launch accounts.
-- Eligible = auth.users.created_at is before the launch cutoff. Idempotent via
-- the partial unique index on coin_ledger(kind='founder').
--   >>> TUNE BEFORE LAUNCH: set v_amount and v_cutoff to the real values. <<<
-- ---------------------------------------------------------------------------
create or replace function runtour_claim_founder()
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid        := auth.uid();
  v_amount bigint      := 15000;                                   -- "small bonus" (tunable)
  v_cutoff timestamptz := timestamptz '2026-08-01 00:00:00+00';   -- monetization launch instant (tunable)
  v_created timestamptz;
  v_new    bigint;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  select paid_coins into v_new from coin_wallet where user_id = v_uid;
  -- already claimed → no-op, return current balance
  if exists (select 1 from coin_ledger where user_id = v_uid and kind = 'founder') then
    return coalesce(v_new, 0);
  end if;
  select created_at into v_created from auth.users where id = v_uid;
  -- signed up after the cutoff → not a founder, no bonus
  if v_created is null or v_created >= v_cutoff then
    return coalesce(v_new, 0);
  end if;
  begin
    return runtour_wallet_apply(v_uid, v_amount, 'founder', 'founder_bonus');
  exception when unique_violation then           -- lost a concurrent-claim race
    select paid_coins into v_new from coin_wallet where user_id = v_uid;
    return coalesce(v_new, 0);
  end;
end $$;
revoke all on function runtour_claim_founder() from public;
grant execute on function runtour_claim_founder() to authenticated;

-- ---------------------------------------------------------------------------
-- runtour_credit_purchase(...)  —  service_role only (the Stripe webhook).
-- Doubly idempotent: skips if the Stripe event was already recorded, and the
-- unique(stripe_event) constraint backstops a concurrent duplicate.
-- ---------------------------------------------------------------------------
create or replace function runtour_credit_purchase(
  p_user text, p_event text, p_session text, p_pi text,
  p_package text, p_coins bigint, p_amount_cents int, p_currency text
) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_new bigint;
begin
  if p_user is null then raise exception 'missing user'; end if;
  v_uid := p_user::uuid;
  if p_coins is null or p_coins <= 0 then raise exception 'invalid coin amount'; end if;

  if p_event is not null and exists (select 1 from coin_purchase where stripe_event = p_event) then
    select paid_coins into v_new from coin_wallet where user_id = v_uid;
    return coalesce(v_new, 0);                    -- already fulfilled
  end if;

  begin
    insert into coin_purchase (user_id, stripe_event, stripe_session, stripe_pi,
                               package_id, coins, amount_cents, currency, status)
      values (v_uid, p_event, p_session, p_pi,
              p_package, p_coins, p_amount_cents, coalesce(p_currency,'usd'), 'paid');
  exception when unique_violation then             -- duplicate event delivered concurrently
    select paid_coins into v_new from coin_wallet where user_id = v_uid;
    return coalesce(v_new, 0);
  end;

  return runtour_wallet_apply(v_uid, p_coins, 'purchase', coalesce(p_event, p_session));
end $$;
revoke all on function runtour_credit_purchase(text,text,text,text,text,bigint,int,text) from public, anon, authenticated;
grant execute on function runtour_credit_purchase(text,text,text,text,text,bigint,int,text) to service_role;

-- ---------------------------------------------------------------------------
-- runtour_refund_purchase(ref)  —  service_role only. Clawback on refund/dispute.
-- ref is the Stripe event id OR the payment_intent id. Clamps at zero.
-- ---------------------------------------------------------------------------
create or replace function runtour_refund_purchase(p_ref text, p_status text default 'refunded')
returns bigint
language plpgsql security definer set search_path = public as $$
declare r coin_purchase%rowtype; v_new bigint;
begin
  select * into r from coin_purchase
   where stripe_event = p_ref or stripe_pi = p_ref
   order by created_at desc limit 1;
  if not found then return null; end if;
  if r.status <> 'paid' then                       -- already refunded/disputed
    select paid_coins into v_new from coin_wallet where user_id = r.user_id;
    return coalesce(v_new, 0);
  end if;
  update coin_purchase set status = coalesce(p_status,'refunded') where id = r.id;
  return runtour_wallet_apply(r.user_id, -r.coins, 'refund', p_ref);
end $$;
revoke all on function runtour_refund_purchase(text,text) from public, anon, authenticated;
grant execute on function runtour_refund_purchase(text,text) to service_role;

-- ---------------------------------------------------------------------------
-- runtour_grant_coins(user, coins, reason)  —  service_role only. Admin /
-- support adjustments and scripted grants. Journaled as 'grant'.
-- ---------------------------------------------------------------------------
create or replace function runtour_grant_coins(p_user text, p_coins bigint, p_reason text)
returns bigint
language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_coins is null or p_coins = 0 then raise exception 'bad grant'; end if;
  return runtour_wallet_apply(p_user::uuid, p_coins, 'grant', p_reason);
end $$;
revoke all on function runtour_grant_coins(text,bigint,text) from public, anon, authenticated;
grant execute on function runtour_grant_coins(text,bigint,text) to service_role;
