-- ---------------------------------------------------------------------------
-- The Run The Bundle redemption, against a real Postgres.
--
--   createdb bundle
--   psql -d bundle -f supabase/test/bundle_base.sql
--   psql -d bundle -f supabase/104_runtour_bundle_redeem.sql
--   psql -d bundle -f supabase/test/bundle_test.sql
--   bash supabase/test/bundle_concurrent.sh          # the two-session race
--   bash supabase/test/bundle_preflight.sh           # what happens on a wallet
--                                                    # shaped differently
--
-- The order matters: bundle_test.sql mutates as it goes and assumes it starts
-- from a database that has just been built, so re-run it against a fresh one
-- rather than twice against the same.
--
-- Every line below should read " ok ".
--
-- The row this drives is inserted by hand with source 'comp' and the payload
-- shape the webhook writes, which is the same thing supabase/comp_premium.sql
-- gives a tester.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP 0
\pset tuples_only on
\pset format unaligned

insert into auth.users(id) values
  ('11111111-1111-1111-1111-111111111111'),   -- a buyer
  ('22222222-2222-2222-2222-222222222222'),   -- a player who has bought nothing
  ('33333333-3333-3333-3333-333333333333'),   -- a buyer who already spends coins
  ('44444444-4444-4444-4444-444444444444'),   -- a buyer whose payload is malformed
  ('55555555-5555-5555-5555-555555555555')    -- a buyer with the other three products too
on conflict do nothing;

create or replace function public.q(p_sql text) returns text
language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $$;

-- call the redemption for its effect, without printing the row
create or replace function public.redeem() returns void
language plpgsql as $$ begin perform * from public.runtour_redeem_unlocks(); end $$;

-- the plan for a statement, as text, so a test can assert how it is executed
create or replace function public.plan(p_sql text) returns text
language plpgsql as $$
declare l text; out text := '';
begin for l in execute 'explain ' || p_sql loop out := out || l || ' '; end loop; return out; end $$;

-- the payload the webhook writes for run-the-bundle, verbatim
create or replace function public.grant_pack(p_uid uuid, p_payload jsonb) returns void
language sql as $$
  insert into public.premium_unlocks (user_id, product, source, payload, expires_at, fulfilled_at)
  values (p_uid, 'runtour_pack', 'comp', p_payload, null, null)
  on conflict (user_id, product) do update
    set payload = excluded.payload, fulfilled_at = null, granted_at = now();
$$;

\echo '---------- a buyer redeems ----------'
select public.grant_pack('11111111-1111-1111-1111-111111111111',
  '{"checkout_session":"cs_test_1","stripe_customer":"cus_test_1","coins":100000,"packs":[{"tier":"tour","n":1}]}'::jsonb);
select public.become('11111111-1111-1111-1111-111111111111');

select case when (select coins from public.runtour_redeem_unlocks()) = 100000
  then ' ok  the coins come back off the payload'
  else ' FAIL ' || (select coins from public.runtour_redeem_unlocks())::text end;

select case when (select paid_coins from public.coin_wallet
                   where user_id = '11111111-1111-1111-1111-111111111111') = 100000
  then ' ok  and land in the wallet'
  else ' FAIL the wallet did not move' end;

select case when (select lifetime_granted from public.coin_wallet
                   where user_id = '11111111-1111-1111-1111-111111111111') = 100000
  then ' ok  counted as granted'
  else ' FAIL lifetime_granted did not move' end;

select case when (select lifetime_purchased from public.coin_wallet
                   where user_id = '11111111-1111-1111-1111-111111111111') = 0
  then ' ok  and not as purchased, which is a different thing'
  else ' FAIL a bundle grant was recorded as a coin purchase' end;

select case when (select fulfilled_at is not null from public.premium_unlocks
                   where user_id = '11111111-1111-1111-1111-111111111111'
                     and product = 'runtour_pack')
  then ' ok  the row is stamped'
  else ' FAIL fulfilled_at is still null' end;

select case when (select packs from public.runtour_redeem_unlocks()) = '[]'::jsonb
  then ' ok  a second call claims nothing'
  else ' FAIL ' || (select packs from public.runtour_redeem_unlocks())::text end;

-- the assertion the whole thing exists for
select case when (select paid_coins from public.coin_wallet
                   where user_id = '11111111-1111-1111-1111-111111111111') = 100000
  then ' ok  and calling it four more times does not pay again'
  else ' FAIL DOUBLE CREDIT' end
from (select public.runtour_redeem_unlocks(), public.runtour_redeem_unlocks(),
             public.runtour_redeem_unlocks(), public.runtour_redeem_unlocks()) _;

\echo '---------- what the caller gets back ----------'
select public.grant_pack('55555555-5555-5555-5555-555555555555',
  '{"coins":100000,"packs":[{"tier":"tour","n":1}]}'::jsonb);
insert into public.premium_unlocks (user_id, product, source, fulfilled_at) values
  ('55555555-5555-5555-5555-555555555555','ps_premium','comp',now()),
  ('55555555-5555-5555-5555-555555555555','cfb_premium','comp',now()),
  ('55555555-5555-5555-5555-555555555555','arcade_card_year','comp',now())
on conflict do nothing;
select public.become('55555555-5555-5555-5555-555555555555');

select case when packs = '[{"n": 1, "tier": "tour"}]'::jsonb and coins = 100000 and paid_coins = 100000
  then ' ok  coins, the packs to grant, and the new balance in one row'
  else ' FAIL ' || coins::text || ' / ' || packs::text || ' / ' || paid_coins::text end
from public.runtour_redeem_unlocks();

select case when (select count(*) from public.premium_unlocks
                   where user_id = '55555555-5555-5555-5555-555555555555'
                     and fulfilled_at is null) = 0
  then ' ok  the other three products are untouched by it'
  else ' FAIL it unstamped somebody else''s product' end;

select case when (select count(*) from public.premium_unlocks
                   where product <> 'runtour_pack' and fulfilled_at is null) = 0
  then ' ok  and it only ever claims runtour_pack'
  else ' FAIL ' end;

\echo '---------- a player with nothing to claim ----------'
select public.become('22222222-2222-2222-2222-222222222222');
select case when (select coins from public.runtour_redeem_unlocks()) = 0
  then ' ok  gets zero rather than an error'
  else ' FAIL ' end;
select case when (select count(*) from public.coin_wallet
                   where user_id = '22222222-2222-2222-2222-222222222222') = 0
  then ' ok  and no wallet row is conjured for them'
  else ' FAIL an empty wallet row was written on a no-op call' end;
select case when (select paid_coins from public.runtour_redeem_unlocks()) = 0
  then ' ok  their balance reads 0, not null'
  else ' FAIL ' end;

-- Requirement 4: the golf page calls this on sign-in and on every shop open, so
-- the do-nothing case has to be cheap. Cheap here means the claim finds its row
-- by the (user_id, product) primary key rather than reading the table. On the
-- five rows above the planner would pick a sequential scan whatever the index
-- said, so this fills the table first: an assertion that only holds because the
-- table is tiny is not an assertion about production.
insert into auth.users(id)
  select ('99999999-9999-9999-' || lpad(to_hex(g), 4, '0') || '-' || lpad(to_hex(g), 12, '0'))::uuid
  from generate_series(1, 5000) g on conflict do nothing;
insert into public.premium_unlocks (user_id, product, source, payload, fulfilled_at)
  select id, 'runtour_pack', 'comp', '{"coins":100000}'::jsonb, now()
  from auth.users where id::text like '99999999%' on conflict do nothing;
analyze public.premium_unlocks;

select case when public.plan($q$update public.premium_unlocks u set fulfilled_at = now()
      where u.user_id = '22222222-2222-2222-2222-222222222222'
        and u.product = 'runtour_pack' and u.fulfilled_at is null$q$) not like '%Seq Scan%'
  then ' ok  on 5000 rows the claim still goes straight to the primary key'
  else ' FAIL the do-nothing call reads the whole table: ' ||
       public.plan($q$update public.premium_unlocks u set fulfilled_at = now()
         where u.user_id = '22222222-2222-2222-2222-222222222222'
           and u.product = 'runtour_pack' and u.fulfilled_at is null$q$) end;

select case when (select count(*) from public.premium_unlocks where fulfilled_at is null) = 0
  then ' ok  and the 5000 stamped rows stay stamped'
  else ' FAIL ' end;

\echo '---------- the credit is added, not assigned ----------'
insert into public.coin_wallet (user_id, paid_coins, lifetime_purchased, lifetime_granted)
  values ('33333333-3333-3333-3333-333333333333', 4200, 45000, 0)
  on conflict (user_id) do nothing;
select public.grant_pack('33333333-3333-3333-3333-333333333333', '{"coins":100000,"packs":[{"tier":"tour","n":1}]}'::jsonb);
select public.become('33333333-3333-3333-3333-333333333333');
select public.redeem();

select case when (select paid_coins from public.coin_wallet
                   where user_id = '33333333-3333-3333-3333-333333333333') = 104200
  then ' ok  an existing balance is topped up, not overwritten'
  else ' FAIL ' || (select paid_coins from public.coin_wallet
                     where user_id = '33333333-3333-3333-3333-333333333333')::text end;
select case when (select lifetime_purchased from public.coin_wallet
                   where user_id = '33333333-3333-3333-3333-333333333333') = 45000
  then ' ok  and their real purchase history is left alone'
  else ' FAIL ' end;

\echo '---------- payloads that are wrong ----------'
select public.become('44444444-4444-4444-4444-444444444444');

select public.grant_pack('44444444-4444-4444-4444-444444444444', '{}'::jsonb);
select case when (select coins from public.runtour_redeem_unlocks()) = 0
  then ' ok  an empty payload credits nothing'
  else ' FAIL ' end;

select public.grant_pack('44444444-4444-4444-4444-444444444444', '{"coins":-5000}'::jsonb);
select case when (select coins from public.runtour_redeem_unlocks()) = 0
  then ' ok  a negative figure does not take coins away'
  else ' FAIL a payload could DRAIN a wallet' end;

select public.grant_pack('44444444-4444-4444-4444-444444444444', '{"coins":100000,"packs":"tour"}'::jsonb);
select case when (select packs from public.runtour_redeem_unlocks()) = '[]'::jsonb
  then ' ok  packs that are not an array are ignored rather than fatal'
  else ' FAIL ' end;

select case when (select paid_coins from public.coin_wallet
                   where user_id = '44444444-4444-4444-4444-444444444444') = 100000
  then ' ok  and the coins on that row still landed'
  else ' FAIL ' end;

-- the number is never written down in the function: change the payload, change the pay
select public.grant_pack('44444444-4444-4444-4444-444444444444', '{"coins":102000,"packs":[{"tier":"tour","n":2}]}'::jsonb);
select case when (select coins from public.runtour_redeem_unlocks()) = 102000
  then ' ok  a re-priced bundle pays the new price with no code change'
  else ' FAIL the amount is hardcoded somewhere' end;

\echo '---------- who may call it ----------'
select public.become(null);
select case when public.q('select public.runtour_redeem_unlocks()') like '%not signed in%'
  then ' ok  signed out is refused'
  else ' FAIL ' || public.q('select public.runtour_redeem_unlocks()') end;

select case when has_function_privilege('authenticated', 'public.runtour_redeem_unlocks()', 'execute')
  then ' ok  authenticated may execute it'
  else ' FAIL ' end;
select case when not has_function_privilege('anon', 'public.runtour_redeem_unlocks()', 'execute')
  then ' ok  anon may not'
  else ' FAIL anon can call the redemption' end;

select case when (select prosecdef from pg_proc where proname = 'runtour_redeem_unlocks')
  then ' ok  and it is security definer, because RLS gives the owner select and nothing else'
  else ' FAIL ' end;

\echo '---------- one caller cannot redeem another account ----------'
select public.grant_pack('22222222-2222-2222-2222-222222222222', '{"coins":100000}'::jsonb);
select public.become('11111111-1111-1111-1111-111111111111');
select public.redeem();
select case when (select fulfilled_at is null from public.premium_unlocks
                   where user_id = '22222222-2222-2222-2222-222222222222'
                     and product = 'runtour_pack')
  then ' ok  a signed-in caller claims only their own row'
  else ' FAIL one account redeemed another''s grant' end;
