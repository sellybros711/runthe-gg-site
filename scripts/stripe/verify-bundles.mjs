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
import { readFileSync } from 'node:fs';
import { BUNDLES } from '../../functions/api/stripe/_bundles.js';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

let failed = 0;
const bad = (msg) => { failed++; console.error('FAIL  ' + msg); };
const ok = (msg) => console.log('  ok  ' + msg);

// 1. catalog products <-> SQL check constraint, both directions
const sql = read('supabase/101_premium_bundles.sql');
const ckMatch = sql.match(/premium_unlocks_product_ck\s*\n?\s*check\s*\(product in \(([^)]*)\)\)/);
if (!ckMatch) {
  bad('could not find premium_unlocks_product_ck in supabase/101_premium_bundles.sql');
} else {
  const allowed = new Set([...ckMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
  const granted = new Set(Object.values(BUNDLES).flatMap((b) => b.grants.map((g) => g.product)));
  for (const p of granted) if (!allowed.has(p)) bad(`catalog grants '${p}' but the check constraint rejects it`);
  for (const p of allowed) if (!granted.has(p)) bad(`constraint allows '${p}' but no bundle grants it`);
  if (![...granted].some((p) => !allowed.has(p)) && ![...allowed].some((p) => !granted.has(p))) {
    ok(`products agree with the constraint: ${[...allowed].sort().join(', ')}`);
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

if (failed) {
  console.error('\n' + failed + ' check(s) failed.');
  process.exit(1);
}
console.log('\nAll bundle checks passed.');
