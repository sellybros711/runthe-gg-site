-- Run The Floor Pro (123_hoops_pro.sql): the product the webhook may grant.
--
--   createdb rtf_pro
--   psql -d rtf_pro -c 'create role authenticated; create role anon;'
--   psql -d rtf_pro -f supabase/test/baseball_pro_base.sql
--   psql -d rtf_pro -f supabase/101_premium_bundles.sql
--   psql -d rtf_pro -f supabase/121_baseball_pro.sql
--   psql -d rtf_pro -f supabase/123_hoops_pro.sql
--   psql -d rtf_pro -f supabase/123_hoops_pro.sql   (twice: it is idempotent)
--   psql -d rtf_pro -v ON_ERROR_STOP=1 -f supabase/test/hoops_pro_test.sql
--
-- The page asks premium_products() and nothing else, so the claims are about
-- that answer and about the constraint the webhook writes through.

\set ON_ERROR_STOP 1

do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a';
  refused boolean := false;
begin
  -- the grant the webhook writes for the floor-pro bundle is accepted
  insert into public.premium_unlocks (user_id, product, source) values (a, 'rtf_premium', 'test');
  perform set_config('test.uid', a::text, true);
  assert 'rtf_premium' = any(public.premium_products()), 'an owner reads rtf_premium back';

  -- every product 121 allowed is still allowed: 123 restates the list, and a
  -- restatement that dropped one would 500 that game's webhook
  insert into public.premium_unlocks (user_id, product, source) values
    (a, 'ps_premium', 'test'), (a, 'cfb_premium', 'test'), (a, 'rtd_premium', 'test'),
    (a, 'arcade_card_year', 'test'), (a, 'runtour_pack', 'test');

  -- an unknown product is still refused loudly
  begin
    insert into public.premium_unlocks (user_id, product, source) values (a, 'nope_premium', 'test');
  exception when check_violation then refused := true;
  end;
  assert refused, 'an unknown product is refused by the constraint';

  -- an ended grant stops answering, the way a comp with an end date should
  update public.premium_unlocks set expires_at = now() - interval '1 day' where user_id = a and product = 'rtf_premium';
  assert not ('rtf_premium' = any(public.premium_products())), 'an expired rtf_premium no longer opens Pro';
  raise notice 'hoops_pro_test: all claims hold';
end $$;
