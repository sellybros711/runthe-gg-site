-- ---------------------------------------------------------------------------
-- 123_hoops_pro.sql : Run The Floor Pro
--
--   psql ... -f supabase/123_hoops_pro.sql
--
-- Needs 101 (premium_unlocks) and 121 (the constraint's current list). Safe to
-- run more than once.
--
-- RUN THIS BEFORE STRIPE_PRICE_RTF_PRO IS SET, for the reason 101 and 121 give:
-- the webhook grants a paid session by inserting into premium_unlocks, and until
-- the constraint below allows 'rtf_premium' every such insert is refused, the
-- webhook answers 500, and Stripe retries into the same wall. Nobody loses money
-- (the retry lands once this has run), but the order is migration, env var, sell.
--
-- WHAT IS SOLD. 'rtf_premium' is a permanent unlock bought once for $9.99 (the
-- amount lives in Stripe, see scripts/stripe/setup-premium-bundles.mjs). It opens
-- endless Fix History and Six Passes, rebuilding any team, and making any two
-- player puzzle to send to a friend. The two dailies, Conquest and Quick Draft
-- are free for everybody and never sold, and a friend opening a link plays free.
--
-- NOTHING ELSE IS NEEDED ON THE SERVER, and that is not an oversight. An endless
-- or picked puzzle is built in the browser off a number and files nothing to the
-- board, so there is no table to meter and no submit to refuse. The page asks
-- premium_products() for 'rtf_premium', which 101 already answers. The gate is a
-- convenience rather than a lock, and CLAUDE.md says so: nothing competitive
-- depends on it.
-- ---------------------------------------------------------------------------

-- 121's list plus one. scripts/stripe/verify-bundles.mjs reads the LAST
-- definition of this constraint across every migration, so this is the one it
-- holds the catalog to now.
alter table public.premium_unlocks
  drop constraint if exists premium_unlocks_product_ck;
alter table public.premium_unlocks
  add constraint premium_unlocks_product_ck
    check (product in ('ps_premium', 'cfb_premium', 'arcade_card_year', 'runtour_pack', 'rtd_premium', 'rtf_premium'));
