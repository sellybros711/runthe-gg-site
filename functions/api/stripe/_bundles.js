/* THE PREMIUM BUNDLE CATALOG, in one file, because three things ask.
 *
 * checkout-bundle.js needs the price env var and the allow-list of bundle keys,
 * webhook.js needs the grants a paid session delivers, and verify-bundles.mjs
 * needs both so it can catch the two files drifting apart. A bundle written in
 * two places is a bundle that sells one thing and delivers another, so it is
 * written here once.
 *
 * Files prefixed with "_" are NOT routed by Cloudflare Pages: this is a private
 * module, not an endpoint.
 *
 * PRICES ARE NOT IN THIS FILE ON PURPOSE. The dollar amount lives in Stripe (the
 * Price object) and reaches the code only as an env var holding a price_... id,
 * the same way the Arcade Card works. Changing a price is a Stripe Dashboard
 * action plus an env var swap, never a deploy. The recommended amounts are in
 * scripts/stripe/setup-premium-bundles.mjs, which creates the Prices.
 *
 * EVERY product KEY HERE MUST ALSO BE IN premium_unlocks_product_ck
 * (supabase/101_premium_bundles.sql). The database rejects an unknown product
 * outright, which turns "we shipped a grant the table refuses" into a webhook
 * 500 that Stripe retries and surfaces, rather than a silent nothing. Adding a
 * product means editing the constraint first, then this file, in that order,
 * for the reason 93_football_fullteam_mode.sql wrote down. verify-bundles.mjs
 * checks the two lists agree.
 *
 * What each product means:
 *   ps_premium        Perfect Season (NFL) premium: dynasty mode + the one
 *                     franchise dynasty mode. Permanent. Fulfilled by existing:
 *                     the game asks premium_products() and the row is the answer.
 *   cfb_premium       Perfect Season College premium: commissioner mode.
 *                     Permanent. Fulfilled the same way.
 *   arcade_card_year  12 months of Run The Arcade Card. Time-boxed via
 *                     expires_at; arcade_card_active() reads this table too, so
 *                     no subscriptions row is written and a real Stripe
 *                     subscription is never clobbered by a bundle purchase.
 *   runtour_pack      Coins + bonus packs in Run The Tour. The wallet that gets
 *                     credited (coin_wallet, runtour_wallet()) belongs to the
 *                     golf backend, so the webhook records the grant here as
 *                     UNFULFILLED (fulfilled_at null) and the golf side redeems
 *                     it. The payload says what to credit. See the README's
 *                     go-live checklist: this redemption must be wired before
 *                     the bundle sells.
 */

export const BUNDLES = {
  /* Perfect Season Premium Bundle: dynasty + one franchise dynasty (NFL) and
   * commissioner mode (CFB). One-time purchase, permanent unlock. */
  'perfect-season': {
    name: 'Perfect Season Premium Bundle',
    envPrice: 'STRIPE_PRICE_PS_PREMIUM_BUNDLE',
    grants: [
      { product: 'ps_premium' },
      { product: 'cfb_premium' },
    ],
    returnRoots: ['/football/', '/cfb/'],
    defaultReturn: '/football/',
  },

  /* Run The Bundle: everything above, plus a year of the Arcade Card and a
   * Run The Tour coin + pack drop. One-time purchase.
   *
   * The tour grant matches the Large Bucket (102,000 coins + 1 Tour pack,
   * $9.99 on its own), chosen so the bundle line item is a real, priced thing
   * a player can compare against the golf shop rather than a made-up number.
   * If the golf economy re-anchors again, re-check this against BUCKETS in
   * golf/index.html. */
  'run-the-bundle': {
    name: 'Run The Bundle',
    envPrice: 'STRIPE_PRICE_RUN_THE_BUNDLE',
    grants: [
      { product: 'ps_premium' },
      { product: 'cfb_premium' },
      { product: 'arcade_card_year', months: 12 },
      { product: 'runtour_pack', payload: { coins: 102000, packs: [{ tier: 'tour', n: 1 }] } },
    ],
    returnRoots: ['/football/', '/cfb/', '/golf/', '/arcade/'],
    defaultReturn: '/football/',
  },
};

export function bundleByKey(key) {
  return Object.prototype.hasOwnProperty.call(BUNDLES, key) ? BUNDLES[key] : null;
}
