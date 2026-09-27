/* The bundle catalog agrees with everything that trusts it, or this fails.
 *
 *   node scripts/stripe/verify-bundles.mjs
 *
 * Needs no network. What it guards, and why each one is a silent failure
 * without it:
 *
 * 1. Every product a bundle grants is in premium_unlocks_product_ck, and every
 *    product the constraint allows is granted by some bundle. Drift one way and
 *    the webhook 500s on a PAID session; drift the other and the constraint is
 *    dead weight that stops protecting anything.
 * 2. The env var each bundle reads is the env var the setup script prints, so
 *    the runbook's copy-paste lines configure the endpoint that actually runs.
 * 3. Return roots are absolute directories and the default is inside them,
 *    because the open-redirect defense in checkout-bundle.js is only as good
 *    as this list.
 * 4. Run The Bundle contains everything Perfect Season Premium does, which is
 *    what "discounted bundle that includes both" means; losing a grant in an
 *    edit would quietly sell less than the copy says.
 * 5. The webhook subscribes to async_payment_succeeded, without which a
 *    delayed-payment buyer pays and receives nothing.
 * 6. The webhook grants on 'no_payment_required' as well as 'paid'. Checkout
 *    sends allow_promotion_codes, and a 100% off code produces the former: on
 *    'paid' alone the comp'd buyer gets a receipt and no bundle, with nothing
 *    logging an error anywhere.
 * 7. A stored customer id Stripe refuses (a test-mode leftover, a deleted
 *    customer) is dropped and the session retried, rather than failing a
 *    purchase over an optimisation. This is not hypothetical: it blocked the
 *    first live test, with a test-mode customer against a live key.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { BUNDLES, YEARLY_LIVE, yearlyProducts, yearlyBonus } from '../../functions/api/stripe/_bundles.js';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

let failed = 0;
const bad = (msg) => { failed++; console.error('FAIL  ' + msg); };
const ok = (msg) => console.log('  ok  ' + msg);

// 1. catalog products <-> SQL check constraint, both directions.
// THE LAST DEFINITION WINS, because a later migration drops and re-adds the
// constraint to add a product (121 did, for rtd_premium). So every migration is
// read in NUMERIC order (a text sort puts 99_ after 121_) and the final match is
// the one the database holds. Reading 101 alone would compare the catalog to a
// list that no longer exists.
const migs = readdirSync(new URL('supabase/', root))
  .filter((f) => /^\d+_.*\.sql$/.test(f))
  .sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b));
let ckMatch = null, ckFile = null;
for (const f of migs) {
  const all = [...read('supabase/' + f).matchAll(/premium_unlocks_product_ck\s*\n?\s*check\s*\(product in \(([^)]*)\)\)/g)];
  if (all.length) { ckMatch = all[all.length - 1]; ckFile = f; }
}
if (!ckMatch) {
  bad('could not find premium_unlocks_product_ck in any migration');
} else {
  const allowed = new Set([...ckMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
  const granted = new Set(Object.values(BUNDLES).flatMap((b) => b.grants.map((g) => g.product)));
  for (const p of granted) if (!allowed.has(p)) bad(`catalog grants '${p}' but the check constraint rejects it`);
  for (const p of allowed) if (!granted.has(p)) bad(`constraint allows '${p}' but no bundle grants it`);
  if (![...granted].some((p) => !allowed.has(p)) && ![...allowed].some((p) => !granted.has(p))) {
    ok(`products agree with the constraint in ${ckFile}: ${[...allowed].sort().join(', ')}`);
  }
}

// 2. env vars: unique across bundles, and each printed by the setup script
const setup = read('scripts/stripe/setup-premium-bundles.mjs');
const envVars = Object.values(BUNDLES).map((b) => b.envPrice);
if (new Set(envVars).size !== envVars.length) bad('two bundles share a price env var');
for (const v of envVars) {
  if (!setup.includes(`'${v}'`)) bad(`${v} is read by the endpoint but never printed by setup-premium-bundles.mjs`);
}
if (new Set(envVars).size === envVars.length && envVars.every((v) => setup.includes(`'${v}'`))) {
  ok('price env vars are unique and the setup script prints them: ' + envVars.join(', '));
}

// 3. return-path allow-lists are usable as prefixes
for (const [key, b] of Object.entries(BUNDLES)) {
  for (const r of b.returnRoots) {
    if (!/^\/[a-z-]+\/$/.test(r)) bad(`${key}: return root '${r}' is not an absolute /dir/ prefix`);
  }
  if (!b.returnRoots.some((r) => b.defaultReturn.indexOf(r) === 0)) {
    bad(`${key}: defaultReturn '${b.defaultReturn}' is outside its own returnRoots`);
  }
}
ok('return roots are absolute directory prefixes and each default is inside them');

// 4. Run The Bundle is a superset of Perfect Season Premium
const ps = new Set(BUNDLES['perfect-season'].grants.map((g) => g.product));
const rtb = new Set(BUNDLES['run-the-bundle'].grants.map((g) => g.product));
for (const p of ps) if (!rtb.has(p)) bad(`run-the-bundle is missing '${p}' from perfect-season`);
if ([...ps].every((p) => rtb.has(p))) ok('run-the-bundle contains everything perfect-season does');

// 5. the webhook handles delayed payment methods
const webhook = read('functions/api/stripe/webhook.js');
if (!webhook.includes('checkout.session.async_payment_succeeded')) {
  bad('webhook.js does not handle checkout.session.async_payment_succeeded');
} else {
  ok('webhook handles async_payment_succeeded');
}

// 6. a fully discounted session still grants
const checkout = read('functions/api/stripe/checkout-bundle.js');
if (checkout.includes('allow_promotion_codes') && !webhook.includes('no_payment_required')) {
  bad('checkout allows promotion codes but the webhook only grants on payment_status paid, so a 100% off code takes the order and grants nothing');
} else {
  ok('a fully discounted session (no_payment_required) still grants');
}

// 7. a stored customer id that Stripe refuses does not kill the sale
if (checkout.includes("form.set('customer'")) {
  if (!checkout.includes('isMissingCustomer')) {
    bad('checkout reuses a stored stripe_customer_id but never retries without it, so a test-mode or deleted customer blocks the purchase outright');
  } else {
    ok('a stored customer id Stripe refuses is dropped and the session retried');
  }
}

// 8. THE YEARLY PLANS (supabase/124_premium_yearly.sql). Four things that are each written in
// two places, and each pair drifts silently: a plan that keeps alive a different list from the
// one the catalog sells, a yearly price nobody reads, a bonus that is not a product the table
// takes, and a plan event the webhook is not subscribed to (a renewal that nothing extends).
const yearly = Object.entries(BUNDLES).filter(([, b]) => b.year);
let sqlProducts = null, sqlFile = null;
for (const f of migs) {
  const m = read('supabase/' + f).match(/function public\.premium_bundle_products[\s\S]*?\$\$([\s\S]*?)\$\$/);
  if (m) { sqlProducts = m[1]; sqlFile = f; }
}
if (!yearly.length) {
  ok('no yearly plans in the catalog');
} else if (!sqlProducts) {
  bad('the catalog has yearly plans and no migration defines premium_bundle_products()');
} else {
  for (const [key] of yearly) {
    const m = sqlProducts.match(new RegExp("when '" + key + "' then array\\[([^\\]]*)\\]"));
    const inSql = m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort() : null;
    const inJs = yearlyProducts(key).slice().sort();
    if (!inSql) bad(`${key}: premium_bundle_products() in ${sqlFile} has no row for it`);
    else if (inSql.join() !== inJs.join()) bad(`${key}: the plan keeps ${inSql.join(', ')} alive in SQL and sells ${inJs.join(', ')} in the catalog`);
    else ok(`${key}: the yearly plan keeps alive what the catalog sells (${inJs.join(', ')})`);
  }
  const years = yearly.map(([, b]) => b.year.envPrice);
  const readme = read('functions/api/stripe/README.md');
  const offerSrc = read('functions/api/stripe/_offer.js');
  if (new Set([...envVars, ...years]).size !== envVars.length + years.length) bad('a yearly price env var is shared with another price');
  for (const v of years) {
    if (!checkout.includes(v)) bad(`${v} is not named in checkout-bundle.js's header`);
    if (!readme.includes(v)) bad(`${v} is not recorded in functions/api/stripe/README.md`);
  }
  if (years.every((v) => checkout.includes(v) && readme.includes(v))) ok('yearly price env vars are unique and recorded: ' + years.join(', '));
  if (!/premium_yearly_ready/.test(offerSrc)) bad('_offer.js sells a plan without asking the database for premium_yearly_ready()');
  else ok('a plan is only sold once the database answers premium_yearly_ready()');
  for (const [key] of yearly) {
    const bonus = yearlyBonus(key);
    const b = BUNDLES[key];
    if (b.year.bonus && !bonus) bad(`${key}: the yearly bonus names ${b.year.bonus}, which is not one of the bundle's grants`);
  }
  for (const ev of ['invoice.paid', 'customer.subscription.updated', 'customer.subscription.deleted',
    'charge.refunded', 'charge.dispute.created']) {
    if (!webhook.includes("'" + ev + "'")) bad(`the webhook does not handle ${ev}, which a yearly plan needs`);
  }
  ok('the webhook handles every plan event');
  console.log('  ..  the yearly switch (YEARLY_LIVE) is ' + (YEARLY_LIVE ? 'ON' : 'off'));
}

if (failed) {
  console.error('\n' + failed + ' check(s) failed.');
  process.exit(1);
}
console.log('\nAll bundle checks passed.');
