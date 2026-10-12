-- ---------------------------------------------------------------------------
-- 142_hoops_pass.sql : the Floor Pass premium lane as a product, shipped dark
--
--   psql ... -f supabase/142_hoops_pass.sql
--
-- Needs 101 (premium_unlocks) and 123 (the constraint's current list). Safe to
-- run more than once.
--
-- RUN THIS BEFORE STRIPE_PRICE_RTF_PASS IS SET, for 101's and 123's reason: the
-- webhook grants a paid pass by writing premium_unlocks, and until the
-- constraint allows 'rtf_pass' that write is refused, the webhook answers 500,
-- and Stripe retries into the same wall.
--
-- WHAT IS SOLD. 'rtf_pass' opens the Floor Pass's premium lane for ONE season
-- (sixty Eastern days; hoops/pass.js). It is one row with an end date at the
-- season's last Eastern midnight, written by the webhook straight (not through
-- 124's premium_grant_bundle, which counts in months), and premium_products()
-- stops answering it when the season ends. The next season is a new purchase.
-- PASS_PAID_ENABLED is false in _bundles.js and hoops/economy.js, so nothing
-- sells it until it is flipped.
-- ---------------------------------------------------------------------------

-- 123's list plus one. scripts/stripe/verify-bundles.mjs reads the LAST
-- definition of this constraint across every migration.
alter table public.premium_unlocks
  drop constraint if exists premium_unlocks_product_ck;
alter table public.premium_unlocks
  add constraint premium_unlocks_product_ck
    check (product in ('ps_premium', 'cfb_premium', 'arcade_card_year', 'runtour_pack', 'rtd_premium', 'rtf_premium', 'rtf_pass'));
