-- ---------------------------------------------------------------------------
-- 104_runtour_bundle_redeem.sql : deliver the Run The Bundle grant into the
-- Run The Tour wallet
--
-- Safe to run more than once.
--
-- RUN THIS BEFORE RUN THE BUNDLE GOES ON SALE. functions/api/stripe/README.md
-- says the bundle must not sell until this redemption exists, and it is right:
-- the webhook writes the runtour_pack row and stops there, so today a buyer
-- would pay, the row would land, and no coins and no pack would ever reach
-- them.
--
-- WHAT THIS IS. 101_premium_bundles.sql stamps fulfilled_at at write time for
-- every product the database itself honors from then on. runtour_pack is the
-- one it leaves null, because the wallet it pays into is the golf side's. That
-- null is the work queue, and this is the thing that drains it.
--
-- WHY IT IS A SERVER FUNCTION AND NOT CLIENT CODE. Two reasons, either enough
-- on its own. premium_unlocks has exactly one RLS policy, select-own, so a
-- client cannot stamp fulfilled_at at all. And golf/index.html's own rule is
-- that purchased coins live only on the server, "credited by the Stripe
-- webhook, read via runtour_wallet(), spent via runtour_spend_paid()", so that
-- a tampered client cannot mint them. A client-side credit would be precisely
-- the thing that rule exists to prevent.
--
-- EXACTLY ONCE, AND THE SHAPE THAT GUARANTEES IT. These are coins with real
-- money behind them, so the claim IS the update:
--
--     update ... where fulfilled_at is null returning payload
--
-- and only what that statement actually returned gets paid. Two calls racing
-- each other do not need a lock taken by hand: the second blocks on the row
-- lock the first is holding, and when it wakes it re-checks its WHERE against
-- the committed row, finds fulfilled_at no longer null, matches nothing and
-- credits nothing. supabase/test/bundle_concurrent.sh drives exactly that with
-- two live sessions rather than trusting the paragraph.
--
-- THE AMOUNTS COME OUT OF THE PAYLOAD, NEVER OUT OF THIS FILE. The catalog is
-- functions/api/stripe/_bundles.js and the coin figure has already moved once
-- (102,000 -> 100,000). A number written down here would quietly pay the wrong
-- amount the next time it moves, and nothing would fail.
--
-- WHAT THIS DOES NOT DO: the packs. Those are granted client-side, the way the
-- coin-bucket bonus packs already are (maybeBucketRewards in golf/index.html,
-- keyed on a grow-only cloud-synced set). Splitting them off is deliberate:
-- the row survives redemption, so the client can re-derive the pack from it
-- forever, and a client that dies between the credit and the pack loses
-- nothing. Coins and packs settle independently and neither can double.
-- ---------------------------------------------------------------------------

-- ONE TRANSACTION, and not as a formality. psql and the Supabase SQL editor
-- both carry on after a failed statement unless told otherwise, so without this
-- the preflight below would raise, be read, and then the function would be
-- created anyway against the schema the preflight just rejected. It would then
-- fail at runtime, for a real buyer, instead of here. Caught by running it: the
-- function existed after a preflight that had aborted.
begin;

-- ---------------------------------------------------------------------------
-- 0. Preflight.
-- ---------------------------------------------------------------------------
-- The wallet's own migration is not in this repository: coin_wallet and
-- runtour_wallet() are live in the database, and what is known about their
-- shape here is what golf/index.html reads back from them. So rather than
-- assume, check, and fail with the real column list in the error when the
-- assumption is wrong. A migration that stops here has changed nothing.
--
-- The nullability check is not pedantry. The credit below upserts, because a
-- buyer who has never bought coins has no wallet row at all. If some other
-- column is NOT NULL with no default, that insert fails, and it fails for the
-- first real buyer rather than here. Better here.
do $$
declare
  v_missing text;
  v_needy   text;
begin
  if to_regclass('public.premium_unlocks') is null then
    raise exception 'public.premium_unlocks does not exist: run 101_premium_bundles.sql first';
  end if;
  if to_regclass('public.coin_wallet') is null then
    raise exception 'public.coin_wallet does not exist. This function credits the Run The Tour wallet; if that table is named something else, change the two statements below and this check together.';
  end if;

  select string_agg(c, ', ') into v_missing
  from unnest(array['user_id','paid_coins','lifetime_granted']) c
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'coin_wallet' and column_name = c);

  if v_missing is not null then
    raise exception 'public.coin_wallet is missing %; it actually has: %', v_missing,
      (select string_agg(column_name, ', ' order by ordinal_position)
         from information_schema.columns
        where table_schema = 'public' and table_name = 'coin_wallet');
  end if;

  -- any OTHER column that a bare insert could not satisfy
  select string_agg(column_name, ', ' order by ordinal_position) into v_needy
  from information_schema.columns
  where table_schema = 'public' and table_name = 'coin_wallet'
    and is_nullable = 'NO' and column_default is null
    and column_name not in ('user_id','paid_coins','lifetime_granted');

  if v_needy is not null then
    raise exception 'public.coin_wallet.% is NOT NULL with no default, so the wallet row this creates for a buyer who has never bought coins would fail to insert. Give it a default, or add it to the insert below.', v_needy;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. The redemption.
-- ---------------------------------------------------------------------------
-- Called by the golf page on sign-in and on opening the shop, so the common
-- case by a very long way is a player with nothing to claim. That case is one
-- update matching nothing on the (user_id, product) primary key, and returns
-- coins 0. Cheap enough to call on every load, which is the point: there is no
-- separate "did I buy the bundle" question to ask first.
--
-- Written as a set rather than a single row. The primary key means there can
-- only be one runtour_pack per account today, but a future second grant should
-- be paid rather than silently dropped by a limit 1.
create or replace function public.runtour_redeem_unlocks()
returns table (coins bigint, packs jsonb, paid_coins bigint)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid   uuid   := auth.uid();
  v_coins bigint := 0;
  v_packs jsonb  := '[]'::jsonb;
  r       record;
begin
  if v_uid is null then
    raise exception 'runtour_redeem_unlocks: not signed in' using errcode = '28000';
  end if;

  for r in
    with claimed as (
      update public.premium_unlocks u
         set fulfilled_at = now()
       where u.user_id = v_uid
         and u.product = 'runtour_pack'
         and u.fulfilled_at is null
      returning u.payload
    )
    select payload from claimed
  loop
    -- greatest(0, ...) so a payload written with a negative or absent coin
    -- figure credits nothing instead of taking coins away
    v_coins := v_coins + greatest(0, coalesce((r.payload ->> 'coins')::bigint, 0));
    if jsonb_typeof(r.payload -> 'packs') = 'array' then
      v_packs := v_packs || (r.payload -> 'packs');
    end if;
  end loop;

  if v_coins > 0 then
    insert into public.coin_wallet as w (user_id, paid_coins, lifetime_granted)
    values (v_uid, v_coins, v_coins)
    on conflict (user_id) do update
      set paid_coins       = w.paid_coins + excluded.paid_coins,
          lifetime_granted = w.lifetime_granted + excluded.lifetime_granted;
  end if;

  -- packs is what this call claimed, for the receipt line and for anyone
  -- reading the logs. It is NOT how the client grants them: the client reads
  -- the row itself, so that a dropped response cannot lose a pack. One reader,
  -- one writer, no way to grant twice.
  return query
    select v_coins,
           v_packs,
           coalesce((select w.paid_coins from public.coin_wallet w where w.user_id = v_uid), 0)::bigint;
end $$;

revoke all on function public.runtour_redeem_unlocks() from public;
grant execute on function public.runtour_redeem_unlocks() to authenticated;

commit;
