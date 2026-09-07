/* Create the premium bundle Products and Prices in Stripe, idempotently.
 *
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe/setup-premium-bundles.mjs
 *
 * Run it once against test mode, later once against live mode with the live
 * key. Nothing goes on sale by existing: a Price sits inert in Stripe until its
 * id lands in the Cloudflare env vars this script prints, and the site stays at
 * 503 stripe_not_configured until then.
 *
 * IDEMPOTENT VIA LOOKUP KEYS. Products have no natural key in Stripe, so each
 * Price carries a lookup_key and the script asks for that before creating
 * anything: run it twice and the second run just prints the same ids. Renaming
 * a product or changing copy is safe to re-run (the product is updated in
 * place); changing an AMOUNT is not an update, because Stripe prices are
 * immutable once created. To change an amount: edit it here, delete the "price"
 * line's lookup key in the Dashboard (or archive the old price), re-run, and
 * swap the env var to the new price id.
 *
 * THE AMOUNTS BELOW ARE THE OWNER'S DECISION (2026-09): $19.99 and $34.99,
 * both one-time. The reasoning lives in functions/api/stripe/README.md next to
 * the rest of the rollout runbook. If the decision changes before the first
 * run, edit here; after the first run, see the paragraph above.
 *
 * $34.99 IS MARKETED AS "$80 of value", and that number has to keep being
 * true, because it is a claim about prices we charge rather than a slogan.
 * It is the sum of the parts at their own list prices: $19.99 for the
 * Perfect Season bundle below, $49.99 for a year of the Arcade Card
 * (STRIPE_PRICE_ARCADE_ANNUAL) and $9.99 for the Large Bucket in Run The
 * Tour, whose 102,000 coins and one Tour pack are exactly what the bundle
 * grants. That is $79.97. Change any of those three and the claim moves, so
 * re-check it here before repeating it in any copy.
 */

const CATALOG = [
  {
    lookupKey: 'ps_premium_bundle_once',
    envVar: 'STRIPE_PRICE_PS_PREMIUM_BUNDLE',
    amountCents: 1999,
    product: {
      name: 'Perfect Season Premium Bundle',
      description: 'Dynasty mode and one franchise dynasty in Perfect Season, plus commissioner mode in the college game. One purchase, yours for good.',
      metadata: { site_bundle: 'perfect-season' },
    },
  },
  {
    lookupKey: 'run_the_bundle_once',
    envVar: 'STRIPE_PRICE_RUN_THE_BUNDLE',
    amountCents: 3499,
    product: {
      name: 'Run The Bundle',
      description: 'The Perfect Season Premium Bundle, 12 months of the Run The Arcade Card, and 102,000 coins plus a Tour pack in Run The Tour.',
      metadata: { site_bundle: 'run-the-bundle' },
    },
  },
];

const KEY = process.env.STRIPE_SECRET_KEY;
if (!KEY) {
  console.error('STRIPE_SECRET_KEY is not set. Nothing was created.');
  console.error('  STRIPE_SECRET_KEY=sk_test_... node scripts/stripe/setup-premium-bundles.mjs');
  process.exit(1);
}
const MODE = KEY.startsWith('sk_live') ? 'LIVE' : 'test';

async function stripe(method, path, params) {
  const res = await fetch('https://api.stripe.com' + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + KEY,
      ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(method + ' ' + path + ' -> ' + res.status + ': ' + (data.error && data.error.message));
  }
  return data;
}

const envLines = [];
for (const item of CATALOG) {
  const found = await stripe('GET', '/v1/prices?lookup_keys[]=' + encodeURIComponent(item.lookupKey) + '&limit=1');
  let price = found.data && found.data[0];

  if (price) {
    if (price.unit_amount !== item.amountCents) {
      console.log('! ' + item.lookupKey + ' exists at ' + fmt(price.unit_amount) + ', script says ' + fmt(item.amountCents) + '.');
      console.log('  Prices are immutable: archive the old one and re-run to mint the new amount. Keeping the existing price.');
    }
    // keep the product's copy current; name and description are safe to update
    await stripe('POST', '/v1/products/' + price.product, {
      name: item.product.name,
      description: item.product.description,
      'metadata[site_bundle]': item.product.metadata.site_bundle,
    });
    console.log('= ' + item.product.name + ': ' + price.id + ' (' + fmt(price.unit_amount) + ', already existed)');
  } else {
    const product = await stripe('POST', '/v1/products', {
      name: item.product.name,
      description: item.product.description,
      'metadata[site_bundle]': item.product.metadata.site_bundle,
    });
    price = await stripe('POST', '/v1/prices', {
      product: product.id,
      currency: 'usd',
      unit_amount: String(item.amountCents),
      lookup_key: item.lookupKey,
    });
    console.log('+ ' + item.product.name + ': ' + price.id + ' (' + fmt(price.unit_amount) + ', created)');
  }
  envLines.push(item.envVar + '=' + price.id);
}

console.log('\nCloudflare Pages env vars (' + MODE + ' mode):');
for (const line of envLines) console.log('  ' + line);
console.log('\nThe endpoints stay at 503 for these bundles until the vars above are set.');

function fmt(cents) {
  return '$' + (cents / 100).toFixed(2);
}
