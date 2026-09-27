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
 *   rtd_premium       Run The Diamond Pro: the six extra baseball modes with
 *                     no daily limit. Permanent. The page asks
 *                     premium_products() and the meter (rtd_mode_spend in
 *                     supabase/121_baseball_pro.sql) reads this table itself.
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
   * The tour grant is the Large Bucket ($9.99 on its own: 102,000 coins and one
   * Tour Pack) with the coins ROUNDED DOWN to a flat 100,000, an owner call in
   * 2026-09. The pack is unchanged and is deliberately the `tour` tier, which
   * PACK_TYPES in golf/index.html names "Tour Pack" and prices at 22,000 coins,
   * one step above the base Pro Shop Pack and one below Champion.
   *
   * THE $9.99 IT IS VALUED AT IN THE README STILL HOLDS, and the reason is worth
   * writing down because "we give less, so it is worth less" is the obvious and
   * wrong reading. That claim is what a player would have to SPEND to get this,
   * and the buckets are fixed sizes: below Large is Medium at 45,000 coins and no
   * pack at all. So the cheapest way to buy 100,000 coins and a Tour Pack is
   * still the $9.99 Large Bucket, exactly as it was at 102,000. Nothing about the
   * "$80 of value" arithmetic moves.
   *
   * If the golf economy re-anchors again, re-check this against BUCKETS and
   * PACK_TYPES in golf/index.html. */
  'run-the-bundle': {
    name: 'Run The Bundle',
    envPrice: 'STRIPE_PRICE_RUN_THE_BUNDLE',
    grants: [
      { product: 'ps_premium' },
      { product: 'cfb_premium' },
      { product: 'arcade_card_year', months: 12 },
      { product: 'runtour_pack', payload: { coins: 100000, packs: [{ tier: 'tour', n: 1 }] } },
    ],
    returnRoots: ['/football/', '/cfb/', '/golf/', '/arcade/'],
    defaultReturn: '/football/',
  },

  /* Run The Diamond Pro: the baseball game's own tier, $14.99 A YEAR, renewing.
   *
   * IT WAS $9.99 ONCE and became a subscription on the owner's call (2026-09),
   * because the Stripe Price behind STRIPE_PRICE_RTD_PRO is now recurring.
   * `recurring: true` is what tells the two files that read this: the checkout
   * opens in subscription mode (a recurring Price in payment mode is refused by
   * Stripe outright), and the webhook writes the grant with an end date that
   * follows the subscription, moved forward on every renewal and pulled in on
   * a cancellation or a failed payment. It is still ONE premium_unlocks row, so
   * nothing that reads Pro changed, and it never touches the `subscriptions`
   * table, which is the Arcade Card's and holds one row a user.
   *
   * THE ONE BUNDLE THAT BELONGS TO ONE GAME, and that is the owner's decision
   * (2026-09) rather than a slip. CLAUDE.md says never to build a price or an
   * unlock for one game, and the reason behind it is the second payment path.
   * That reason still holds and is kept: this is a row in this catalog, sold
   * through the same checkout-bundle.js and granted by the same webhook, so
   * there is still exactly one way money reaches the site. What is new is only
   * that the product is baseball's alone.
   *
   * It is NOT in Run The Bundle. That would change what the $34.99 contains and
   * what its "$80 of value" claim adds up to, which is its own decision. */
  'diamond-pro': {
    name: 'Run The Diamond Pro',
    envPrice: 'STRIPE_PRICE_RTD_PRO',
    recurring: true,
    grants: [
      { product: 'rtd_premium' },
    ],
    returnRoots: ['/baseball/'],
    defaultReturn: '/baseball/',
  },

  /* Run The Floor Pro: basketball's own tier, the same shape as Diamond Pro.
   * $9.99 once. Opens endless Fix History and Six Passes, rebuilding any team,
   * and making any two player puzzle. The dailies, Conquest and Quick Draft stay
   * free, and a friend opening a shared link plays free. See 123_hoops_pro.sql. */
  'floor-pro': {
    name: 'Run The Floor Pro',
    envPrice: 'STRIPE_PRICE_RTF_PRO',
    grants: [
      { product: 'rtf_premium' },
    ],
    returnRoots: ['/hoops/'],
    defaultReturn: '/hoops/',
  },
};

export function bundleByKey(key) {
  return Object.prototype.hasOwnProperty.call(BUNDLES, key) ? BUNDLES[key] : null;
}
