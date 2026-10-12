-- ---------------------------------------------------------------------------
-- 141_hoops_wallet.sql : Run The Floor's PAID coins (coin buckets), shipped dark
--
--   psql ... -f supabase/141_hoops_wallet.sql
--
-- Safe to run more than once. Needs nothing but auth.uid().
--
-- WHAT THIS IS. Run The Floor's coins are EARNED by playing and kept in a keyed
-- ledger in the account's own record (hoops/economy.js, the shelf's `wallet`
-- slot). A coin BOUGHT with money must never live there: the page writes that
-- record, so a coin it holds is a coin a player can forge. Paid coins live here
-- and only here, and the page never adds one. It asks rtf_wallet_state() what
-- has been bought, and spends through rtf_wallet_spend(), which moves coins out
-- of this balance under a key the page also files in its ledger, so a spend that
-- lands twice is charged once.
--
-- WHO WRITES. Only the Stripe webhook, through rtf_coin_buy(), with the service
-- role: a paid checkout session for a bucket (functions/api/stripe/_bundles.js
-- BUCKETS) is recorded once, keyed on the session, so Stripe retrying the same
-- delivery pays once. Nobody else can insert, and no browser role can read the
-- tables at all; both functions a browser calls are security definer and read
-- only the caller's own rows.
--
-- REFUNDS. rtf_coin_refund(session) takes a refunded bucket's coins back off the
-- balance (floored at zero for what is shown; what was already spent stays
-- spent). It is called by hand from the dashboard today, and the README says so:
-- a bucket refund is rare enough that wiring the charge event to a session is
-- not worth its code yet.
--
-- SHIPPED DARK. BUCKETS_ENABLED is false in _bundles.js and in hoops/economy.js,
-- and nothing sells a bucket until it is flipped. This file is safe to deploy
-- first and is meant to be: a webhook delivery against a database without it
-- fails loudly and Stripe retries.
-- ---------------------------------------------------------------------------

create table if not exists public.rtf_coin_buys (
  session_id  text primary key check (session_id ~ '^[A-Za-z0-9_]{6,200}$'),
  user_id     uuid not null,
  bucket      text not null check (bucket ~ '^floor-coins-[1-9]$'),
  coins       integer not null check (coins > 0 and coins <= 1000000),
  packs       text[] not null default '{}' check (packs <@ array['street','league','hof']::text[] and cardinality(packs) <= 5),
  refunded_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists rtf_coin_buys_user on public.rtf_coin_buys (user_id);

create table if not exists public.rtf_coin_spends (
  user_id    uuid not null,
  key        text not null check (key ~ '^[A-Za-z0-9:_.-]{1,80}$'),
  coins      integer not null check (coins > 0 and coins <= 1000000),
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- No policies: RLS on with none is no rows for anon and authenticated, and the
-- grants are taken away as well, so the only door is the functions below.
alter table public.rtf_coin_buys enable row level security;
alter table public.rtf_coin_spends enable row level security;
revoke all on public.rtf_coin_buys from anon, authenticated;
revoke all on public.rtf_coin_spends from anon, authenticated;

-- ─── the webhook's writer ───────────────────────────────────────────────────
create or replace function public.rtf_coin_buy(p_session text, p_user uuid, p_bucket text, p_coins integer, p_packs text[] default '{}')
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  insert into public.rtf_coin_buys (session_id, user_id, bucket, coins, packs)
  values (p_session, p_user, p_bucket, p_coins, coalesce(p_packs, '{}'))
  on conflict (session_id) do nothing;
  return found;
end $$;
revoke all on function public.rtf_coin_buy(text, uuid, text, integer, text[]) from public, anon, authenticated;

create or replace function public.rtf_coin_refund(p_session text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.rtf_coin_buys set refunded_at = now() where session_id = p_session and refunded_at is null;
  return found;
end $$;
revoke all on function public.rtf_coin_refund(text) from public, anon, authenticated;

-- ─── the page's two doors ───────────────────────────────────────────────────
-- What this account has bought and spent, and the balance. The buys come back
-- so the page can file each bucket's packs once, keyed on the session.
create or replace function public.rtf_wallet_state()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_in bigint; v_out bigint;
begin
  if v_uid is null then raise exception 'sign in to see your coins'; end if;
  select coalesce(sum(coins), 0) into v_in from public.rtf_coin_buys where user_id = v_uid and refunded_at is null;
  select coalesce(sum(coins), 0) into v_out from public.rtf_coin_spends where user_id = v_uid;
  return jsonb_build_object(
    'paid_in', v_in, 'paid_out', v_out, 'balance', greatest(0, v_in - v_out),
    'buys', coalesce((select jsonb_agg(jsonb_build_object('session', session_id, 'bucket', bucket, 'coins', coins,
        'packs', to_jsonb(packs), 'at', created_at, 'refunded', refunded_at is not null) order by created_at)
      from public.rtf_coin_buys where user_id = v_uid), '[]'::jsonb));
end $$;
revoke all on function public.rtf_wallet_state() from public, anon;
grant execute on function public.rtf_wallet_state() to authenticated;

-- Spend paid coins under a key. The same key twice is ONE spend (the second
-- answers again = true and charges nothing), so a press whose answer was lost
-- can be sent again. Locked per account, so two devices spending at once cannot
-- both pass the balance check on the same coins.
create or replace function public.rtf_wallet_spend(p_key text, p_coins integer)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_in bigint; v_out bigint; v_had integer;
begin
  if v_uid is null then raise exception 'sign in to spend coins'; end if;
  if p_coins is null or p_coins <= 0 or p_coins > 1000000 then raise exception 'coins looks wrong'; end if;
  if p_key is null or p_key !~ '^[A-Za-z0-9:_.-]{1,80}$' then raise exception 'key looks wrong'; end if;
  perform pg_advisory_xact_lock(hashtext('rtf_wallet:' || v_uid::text));
  select coins into v_had from public.rtf_coin_spends where user_id = v_uid and key = p_key;
  if found then
    if v_had <> p_coins then raise exception 'that key was spent for a different amount'; end if;
  else
    select coalesce(sum(coins), 0) into v_in from public.rtf_coin_buys where user_id = v_uid and refunded_at is null;
    select coalesce(sum(coins), 0) into v_out from public.rtf_coin_spends where user_id = v_uid;
    if v_in - v_out < p_coins then raise exception 'not enough coins'; end if;
    insert into public.rtf_coin_spends (user_id, key, coins) values (v_uid, p_key, p_coins);
  end if;
  select coalesce(sum(coins), 0) into v_in from public.rtf_coin_buys where user_id = v_uid and refunded_at is null;
  select coalesce(sum(coins), 0) into v_out from public.rtf_coin_spends where user_id = v_uid;
  return jsonb_build_object('ok', true, 'again', v_had is not null, 'balance', greatest(0, v_in - v_out));
end $$;
revoke all on function public.rtf_wallet_spend(text, integer) from public, anon;
grant execute on function public.rtf_wallet_spend(text, integer) to authenticated;
