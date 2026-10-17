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

/* THE YEARLY SWITCH. One flag. On since launch (2026-09-27); false is the kill switch.
 *
 * Off, the store sells the one-time bundles exactly as it always has. On, it sells
 * Perfect Season and Run The Bundle as yearly plans (the `year` block on each
 * below) and stops selling them once. Nothing else on the site reads a flag: the
 * page asks /api/stripe/offer, which answers from here, so a flip is one line
 * here and a deploy.
 *
 * ON IS NOT ENOUGH ON ITS OWN, deliberately. _offer.js only answers 'year' when
 * this is true AND both yearly price env vars are set AND the database answers
 * premium_yearly_ready() (supabase/124_premium_yearly.sql). Any of those missing
 * and the answer is 'once', so flipping this ahead of the migration keeps selling
 * the product the database can record rather than a plan it cannot.
 *
 * A LIFETIME BUYER IS UNTOUCHED EITHER WAY. Their rows have no end date and 124
 * refuses any update that would give them one. */
export const YEARLY_LIVE = true;

/* RUN THE FLOOR'S REAL MONEY, SHIPPED DARK (hoops/design/ECONOMY.md section 9).
 *
 * Two switches, both OFF, and each is the whole of its own go-live:
 *
 *   PASS_PAID_ENABLED  the Floor Pass premium lane is on sale, $9.99 a season
 *                      (the `floor-pass` row below). Off, checkout-bundle.js
 *                      answers 403 not_on_sale for it whatever the env vars say.
 *   BUCKETS_ENABLED    the five coin buckets (BUCKETS below) are on sale. Off,
 *                      the bucket path answers 403 not_on_sale.
 *
 * OFF IS NOT THE ONLY GATE, deliberately. Each needs its price env var set and
 * its migration deployed (141 for the buckets, 142 for the pass), so a switch
 * flipped early sells nothing it cannot deliver: no price is 503, and a webhook
 * against a database without the migration fails loudly and Stripe retries.
 * hoops/economy.js carries the same two names for the page, and
 * scripts/stripe/check-floor-money.mjs holds the two copies together. */
export const PASS_PAID_ENABLED = false;
export const BUCKETS_ENABLED = false;

export const BUNDLES = {
  /* Perfect Season Premium Bundle: dynasty + one franchise dynasty (NFL) and
   * commissioner mode (CFB). Sold once and for good, or yearly (see YEARLY_LIVE). */
  'perfect-season': {
    name: 'Perfect Season Premium Bundle',
    envPrice: 'STRIPE_PRICE_PS_PREMIUM_BUNDLE',
    grants: [
      { product: 'ps_premium' },
      { product: 'cfb_premium' },
    ],
    returnRoots: ['/football/', '/cfb/'],
    defaultReturn: '/football/',
    /* $19.99 a year. While it is paid for it grants what the one-time bundle grants,
       and when it stops they stop. The products it keeps alive are the grants above;
       supabase/124's premium_bundle_products() is the same list and verify-bundles.mjs
       holds the two together. */
    year: { envPrice: 'STRIPE_PRICE_PS_YEAR' },
  },

  /* Run The Bundle: everything above, plus a year of the Arcade Card and a
   * Run The Tour coin + pack drop. Sold once, or yearly (see YEARLY_LIVE).
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
    /* $34.99 a year. The two games and the Arcade Card while it is paid for. The Run
       The Tour coins and pack above are a BONUS, handed over once per account ever:
       not on a renewal, not on a second plan, and not to an account that already got
       them from the one-time bundle. 124 writes that row insert-if-absent, so "once"
       is the database's rule rather than a thing this code has to remember. */
    year: { envPrice: 'STRIPE_PRICE_RTB_YEAR', bonus: 'runtour_pack' },
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
   * $14.99 A YEAR, renewing, the owner's call (2026-10) before it ever went on
   * sale (it was planned at $9.99 once). `recurring: true` does exactly what it
   * does for Diamond Pro: the checkout opens in subscription mode and the
   * webhook writes one premium_unlocks row whose end follows the subscription.
   * Opens endless Fix History and Six Passes, rebuilding any team, making any
   * two player puzzle, the high school road and the family tree. The dailies,
   * Conquest, Classic and Career from draft night stay free, and a friend
   * opening a shared link plays free. See 123_hoops_pro.sql. */
  /* The Floor Pass premium lane, $9.99 A SEASON, one-time, SHIPPED DARK (see
   * PASS_PAID_ENABLED above). A season is sixty Eastern days from 2026-10-12, so
   * the grant is one premium_unlocks row with an end date at the season's last
   * Eastern midnight (`season: true`, worked out by passSeason below), written
   * straight rather than through 124's premium_grant_bundle, which knows months
   * and nothing about seasons. A pass for the season it is bought in and no
   * other: the next season is a new purchase, and one already running is refused
   * by the one bundle per account rule, because its row is live. */
  'floor-pass': {
    name: 'Floor Pass',
    envPrice: 'STRIPE_PRICE_RTF_PASS',
    live: PASS_PAID_ENABLED,
    season: true,
    grants: [
      { product: 'rtf_pass' },
    ],
    returnRoots: ['/hoops/'],
    defaultReturn: '/hoops/',
  },

  'floor-pro': {
    name: 'Run The Floor Pro',
    envPrice: 'STRIPE_PRICE_RTF_PRO',
    recurring: true,
    grants: [
      { product: 'rtf_premium' },
    ],
    returnRoots: ['/hoops/'],
    defaultReturn: '/hoops/',
  },
};

/* WHAT A YEARLY PLAN KEEPS ALIVE: its bundle's grants, minus the bonus, minus any
   term (the plan's own period is the term). */
export function yearlyProducts(key) {
  const b = bundleByKey(key);
  if (!b || !b.year) return [];
  return b.grants.map(function (g) { return g.product; })
    .filter(function (p) { return p !== b.year.bonus; });
}

/* The payload the bonus row carries, read off the bundle's own grant so the coins
   are written in one place. Null for a plan with no bonus. */
export function yearlyBonus(key) {
  const b = bundleByKey(key);
  if (!b || !b.year || !b.year.bonus) return null;
  const g = b.grants.find(function (x) { return x.product === b.year.bonus; });
  return g ? (g.payload || {}) : null;
}

/* Which yearly plan a Stripe price belongs to. A plan changed in the Customer Portal
   keeps the metadata it was bought with, so the PRICE is the truth about what it now
   is. Null for a price that is not one of ours (the Arcade Card's, say). */
export function bundleForYearPrice(env, priceId) {
  if (!priceId) return null;
  for (const key of Object.keys(BUNDLES)) {
    const y = BUNDLES[key].year;
    if (y && env && env[y.envPrice] && env[y.envPrice] === priceId) return key;
  }
  return null;
}

export function bundleByKey(key) {
  return Object.prototype.hasOwnProperty.call(BUNDLES, key) ? BUNDLES[key] : null;
}

/* THE COIN BUCKETS, Run The Floor, SHIPPED DARK (BUCKETS_ENABLED above). Run The
 * Tour's own sizes and prices. A bucket is a CONSUMABLE, bought as often as
 * anybody likes, so it is not a premium_unlocks row (one row a product): the
 * webhook records each paid session in rtf_coin_buys (supabase/141_hoops_wallet.sql)
 * through rtf_coin_buy, keyed on the session so a retried delivery pays once.
 * Paid coins live ONLY on the server; the page spends them through rtf_wallet_spend.
 * The packs are free pack credits the page files once, keyed on the session. */
export const BUCKETS = {
  'floor-coins-1': { name: 'Handful of Coins', envPrice: 'STRIPE_PRICE_RTF_COINS_1', cents: 199, coins: 15000, packs: [] },
  'floor-coins-2': { name: 'Bag of Coins', envPrice: 'STRIPE_PRICE_RTF_COINS_2', cents: 499, coins: 45000, packs: [] },
  'floor-coins-3': { name: 'Bucket of Coins', envPrice: 'STRIPE_PRICE_RTF_COINS_3', cents: 999, coins: 102000, packs: ['league'] },
  'floor-coins-4': { name: 'Crate of Coins', envPrice: 'STRIPE_PRICE_RTF_COINS_4', cents: 1999, coins: 285000, packs: ['hof'] },
  'floor-coins-5': { name: 'Vault of Coins', envPrice: 'STRIPE_PRICE_RTF_COINS_5', cents: 4999, coins: 750000, packs: ['hof', 'hof', 'hof'] },
};
export const BUCKET_RETURN = '/hoops/';
export function bucketByKey(key) {
  return Object.prototype.hasOwnProperty.call(BUCKETS, key) ? BUCKETS[key] : null;
}

/* PUTT PUTT LIVES, two packs, SHIPPED DARK (PUTT_LIVES_ENABLED). The owner's calls:
 * nine lives for $4.99 (2026-10-16), and three for $2.99 beside it (2026-10-17).
 *
 * CONSUMABLES, like a coin bucket: bought as often as anybody runs out. A pack is
 * sold only to a signed in player missing at least its `lives` on the server
 * (checkout answers 409 lives_left otherwise), so nobody pays for lives they
 * could not hold. The page sends the pack's KEY and the session carries the key;
 * the webhook reads the lives off this catalog, never off the session, and files
 * the paid session in putt_lives_buys (supabase/149_putt_lives_buy.sql) through
 * putt_lives_buy, keyed on the session. That same call cancels the clocks of the
 * lives it hands back. Lives are the server's (146): the page only ever reads them.
 *
 * The order here is the order the Out of Lives sheet shows them: nine first.
 *
 * OFF IS NOT THE ONLY GATE. Each pack needs its own price env var set (503
 * without) and 149 deployed (the webhook fails loudly without it and Stripe
 * retries). golf/putt/putt.js carries the switch and a copy of these packs for
 * the page, and scripts/stripe/check-putt-lives.mjs holds the two together. */
export const PUTT_LIVES_ENABLED = true;
export const PUTT_LIVES = {
  nine:  { name: 'Putt Putt Lives: 9', envPrice: 'STRIPE_PRICE_PUTT_LIVES_9', lookupKey: 'putt_lives_nine',  cents: 499, lives: 9 },
  three: { name: 'Putt Putt Lives: 3', envPrice: 'STRIPE_PRICE_PUTT_LIVES_3', lookupKey: 'putt_lives_three', cents: 299, lives: 3 },
};
export function puttLivesPack(key) {
  return Object.prototype.hasOwnProperty.call(PUTT_LIVES, key) ? PUTT_LIVES[key] : null;
}
export const PUTT_LIVES_RETURN = '/golf/';

/* THE PASS SEASON, the same arithmetic as hoops/pass.js: sixty Eastern days
 * from the epoch, ending at the Eastern midnight after the last day. A grant
 * bought on the last evening still runs to that midnight. check-floor-money.mjs
 * holds this to pass.js across both clock changes. */
export const PASS_EPOCH = '2026-10-12', PASS_LEN = 60;
function dnum(d) { const p = String(d).split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5); }
function easternDay(t) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
  return f.format(new Date(t));
}
function etMidnight(dayN) {
  const base = dayN * 864e5;
  const h = +new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(new Date(base + 12 * 36e5));
  return base + (12 - h) * 36e5;
}
export function passSeason(t) {
  const el = Math.max(0, dnum(easternDay(t == null ? Date.now() : t)) - dnum(PASS_EPOCH));
  const n = Math.floor(el / PASS_LEN) + 1;
  return { n: n, endsAt: etMidnight(dnum(PASS_EPOCH) + n * PASS_LEN) };
}
