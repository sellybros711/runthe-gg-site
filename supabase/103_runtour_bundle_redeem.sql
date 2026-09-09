-- ---------------------------------------------------------------------------
-- 103_runtour_bundle_redeem.sql : Run The Bundle delivery into Run The Tour
--
-- Safe to run more than once.
--
-- WHAT: the missing half of the Run The Bundle. The Stripe webhook records the
-- golf grant as a premium_unlocks row (product 'runtour_pack', payload
-- {"coins":100000,"packs":[{"tier":"tour","n":1}]}, fulfilled_at null) and
-- this file gives the golf game the RPC that honors it:
-- runtour_redeem_bundle() credits the caller's coin wallet, stamps the row
-- fulfilled, and hands back what was delivered so the page can celebrate and
-- grant the pack. golf/index.html calls it once per sign-in, beside the
-- referral claim, and swallows errors, so a database still on 102 just means
-- the coins keep waiting.
--
-- WHY AN RPC AND NOT THE WEBHOOK. Coins are server state (coin_wallet) but
-- packs are an inherently client-side store: the pass packs and the bucket
-- bonus packs are both granted by the page (see maybePassRewards and
-- maybeBucketRewards in golf/index.html), so the webhook could only ever
-- deliver half the grant. The RPC delivers the coins and REPORTS the packs in
-- one transaction, and the page grants them the way it grants every other
-- pack. Credit and stamp commit together or not at all: any failure rolls the
-- whole thing back and the row keeps waiting, so a bad day loses nothing.
--
-- ONE TRANSACTION IS ALSO THE DOUBLE-CREDIT GUARD. The row is taken FOR
-- UPDATE where fulfilled_at is null; a second tab waits on the lock, re-reads
-- under READ COMMITTED, finds the predicate no longer true, and gets the
-- nothing-waiting answer instead of a second wallet credit.
--
-- THE WALLET IS ANOTHER MIGRATION'S TABLE. coin_wallet comes from the golf
-- side's migration 70, which does not live in this repository, so the
-- preflight below proves the three columns this file touches actually exist
-- and fails LOUDLY at run time if they do not, rather than minting an RPC
-- that dies on its first real purchase.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 0. Preflight: the tables this function writes must look like it expects.
-- ---------------------------------------------------------------------------
do $$
declare
  missing text;
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'premium_unlocks') then
    raise exception 'premium_unlocks does not exist: run 101_premium_bundles.sql first';
  end if;
  select string_agg(c, ', ') into missing
  from unnest(array['user_id', 'paid_coins', 'lifetime_granted']) as c
  where not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'coin_wallet'
                      and column_name = c);
  if missing is not null then
    raise exception 'coin_wallet is missing column(s): %. This file assumes the golf migration-70 wallet (the one runtour_wallet() reads). Adjust it to the real schema before running.', missing;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. The redemption.
-- ---------------------------------------------------------------------------
-- Returns what was delivered as jsonb, e.g.
--   {"coins": 100000, "packs": [{"tier": "tour", "n": 1}]}
-- or null when nothing was waiting, which is almost every call: the page asks
-- on every sign-in and almost nobody has an unredeemed bundle.
create or replace function public.runtour_redeem_bundle()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_row   public.premium_unlocks%rowtype;
  v_coins int;
  v_packs jsonb;
begin
  if v_uid is null then
    return null;
  end if;

  select * into v_row
  from public.premium_unlocks
  where user_id = v_uid and product = 'runtour_pack' and fulfilled_at is null
  for update;
  if not found then
    return null;
  end if;

  -- What the webhook promised. Clamped rather than trusted: the payload is our
  -- own writing, but a wallet credit is the wrong place to find out otherwise.
  v_coins := greatest(0, coalesce((v_row.payload->>'coins')::int, 0));
  v_packs := coalesce(v_row.payload->'packs', '[]'::jsonb);
  if jsonb_typeof(v_packs) <> 'array' then v_packs := '[]'::jsonb; end if;

  if v_coins > 0 then
    update public.coin_wallet
       set paid_coins       = coalesce(paid_coins, 0) + v_coins,
           lifetime_granted = coalesce(lifetime_granted, 0) + v_coins
     where user_id = v_uid;
    if not found then
      -- A buyer who has never opened Run The Tour has no wallet row yet.
      -- Insert only the columns this file owns an opinion about; everything
      -- else takes the table's own defaults.
      insert into public.coin_wallet (user_id, paid_coins, lifetime_granted)
      values (v_uid, v_coins, v_coins);
    end if;
  end if;

  update public.premium_unlocks
     set fulfilled_at = now()
   where user_id = v_uid and product = 'runtour_pack' and fulfilled_at is null;

  return jsonb_build_object('coins', v_coins, 'packs', v_packs);
end;
$$;

grant execute on function public.runtour_redeem_bundle() to authenticated;
