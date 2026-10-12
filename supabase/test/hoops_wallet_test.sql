-- Run The Floor's paid coins (141_hoops_wallet.sql).
--
--   createdb rtf_wallet
--   psql -d rtf_wallet -f supabase/test/baseball_pro_base.sql
--   psql -d rtf_wallet -f supabase/141_hoops_wallet.sql
--   psql -d rtf_wallet -f supabase/141_hoops_wallet.sql   (twice: it is idempotent)
--   psql -d rtf_wallet -v ON_ERROR_STOP=1 -f supabase/test/hoops_wallet_test.sql

\set ON_ERROR_STOP 1

do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a';
  b uuid := '00000000-0000-0000-0000-00000000000b';
  s jsonb; r jsonb; refused boolean; ok boolean;
begin
  -- the webhook files a bucket once, keyed on the session
  assert public.rtf_coin_buy('cs_test_aaaaaa', a, 'floor-coins-3', 102000, array['league']), 'a bucket is filed';
  assert not public.rtf_coin_buy('cs_test_aaaaaa', a, 'floor-coins-3', 102000, array['league']), 'Stripe retrying the same session files nothing';
  refused := false;
  begin perform public.rtf_coin_buy('cs_test_bbbbbb', a, 'floor-coins-3', 102000, array['gold']); exception when check_violation then refused := true; end;
  assert refused, 'a pack that is not a pack is refused';

  -- a guest sees nothing and spends nothing
  perform set_config('test.uid', '', true);
  refused := false;
  begin perform public.rtf_wallet_state(); exception when others then refused := true; end;
  assert refused, 'a guest has no wallet';

  -- the owner sees the balance and the buy, with its pack
  perform set_config('test.uid', a::text, true);
  s := public.rtf_wallet_state();
  assert (s ->> 'balance')::int = 102000, 'the balance is what was bought';
  assert jsonb_array_length(s -> 'buys') = 1 and s -> 'buys' -> 0 ->> 'session' = 'cs_test_aaaaaa' and s -> 'buys' -> 0 -> 'packs' ->> 0 = 'league', 'the buy comes back with its packs';

  -- a spend is keyed: twice is one spend
  r := public.rtf_wallet_spend('top:abc123', 40000);
  assert (r ->> 'ok')::boolean and (r ->> 'balance')::int = 62000 and not (r ->> 'again')::boolean, 'a spend moves coins';
  r := public.rtf_wallet_spend('top:abc123', 40000);
  assert (r ->> 'again')::boolean and (r ->> 'balance')::int = 62000, 'the same key again charges nothing';
  refused := false;
  begin perform public.rtf_wallet_spend('top:abc123', 1000); exception when others then refused := true; end;
  assert refused, 'a key cannot be reused for another amount';
  refused := false;
  begin perform public.rtf_wallet_spend('top:big', 62001); exception when others then refused := true; end;
  assert refused, 'a spend past the balance is refused';
  assert (public.rtf_wallet_state() ->> 'balance')::int = 62000, 'a refused spend changes nothing';
  refused := false;
  begin perform public.rtf_wallet_spend('bad key!', 10); exception when others then refused := true; end;
  assert refused, 'a key that is not one is refused';

  -- somebody else sees none of it and cannot spend it
  perform set_config('test.uid', b::text, true);
  s := public.rtf_wallet_state();
  assert (s ->> 'balance')::int = 0 and jsonb_array_length(s -> 'buys') = 0, 'another account sees nothing';
  refused := false;
  begin perform public.rtf_wallet_spend('top:steal', 10); exception when others then refused := true; end;
  assert refused, 'another account cannot spend it';

  -- a refund takes the unspent coins back and leaves the spent ones spent
  assert public.rtf_coin_refund('cs_test_aaaaaa'), 'a refund is filed';
  assert not public.rtf_coin_refund('cs_test_aaaaaa'), 'a refund is filed once';
  perform set_config('test.uid', a::text, true);
  s := public.rtf_wallet_state();
  assert (s ->> 'balance')::int = 0 and (s -> 'buys' -> 0 ->> 'refunded')::boolean, 'a refunded bucket is gone from the balance and marked';

  raise notice 'hoops wallet: all claims hold';
end $$;

-- the browser roles cannot read the tables or call the writer
do $$ declare ok boolean; begin
  ok := has_table_privilege('authenticated', 'public.rtf_coin_buys', 'select') or has_table_privilege('anon', 'public.rtf_coin_spends', 'select');
  assert not ok, 'no browser role reads the tables';
  assert not has_function_privilege('authenticated', 'public.rtf_coin_buy(text,uuid,text,integer,text[])', 'execute'), 'a browser cannot file a buy';
  assert not has_function_privilege('authenticated', 'public.rtf_coin_refund(text)', 'execute'), 'a browser cannot file a refund';
  assert has_function_privilege('authenticated', 'public.rtf_wallet_spend(text,integer)', 'execute'), 'a signed in browser can spend';
end $$;
