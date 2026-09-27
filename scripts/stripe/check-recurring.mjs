/* A recurring bundle, driven through the real endpoints against a fake Stripe and
 * a fake Supabase.
 *
 *   node scripts/stripe/check-recurring.mjs
 *
 * Run The Diamond Pro is $14.99 a year. verify-bundles.mjs reads the files for the
 * shape of that; this one RUNS them, because every way a subscription goes wrong is
 * a sale that looks fine and a grant that is quietly wrong: a checkout Stripe
 * refuses, a renewal that never moves the end date, a cancellation that leaves a
 * free year behind, a lifetime buyer turned into a year, or a baseball renewal
 * written over somebody's Arcade Card row. Needs no network and no keys.
 */
import { onRequestPost as checkout } from '../../functions/api/stripe/checkout-bundle.js';
import { onRequestPost as webhook } from '../../functions/api/stripe/webhook.js';
import { createHmac } from 'node:crypto';

let fails = 0, passes = 0;
const claim = (ok, what, why) => {
  if (ok) { passes++; console.log('  ok    ' + what); }
  else { fails++; console.log('  FAIL  ' + what + (why ? '  (' + why + ')' : '')); }
};
const head = (t) => console.log('\n' + t);

const env = {
  STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_test',
  STRIPE_PRICE_RTD_PRO: 'price_pro_year', STRIPE_PRICE_PS_PREMIUM_BUNDLE: 'price_ps_once',
  STRIPE_PRICE_RUN_THE_BUNDLE: 'price_rtb_once',
  SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE: 'service', SITE_URL: 'https://runthe.gg',
};
const USER = 'user-1';
const DAY = 86400000;

/* THE FAKE. One array of premium_unlocks rows, one of subscriptions rows, the
   Stripe subscriptions by id, and a log of every request. */
let db, subsTable, stripeSubs, stripeInvoices, stripeCharges, sent;
function reset() { db = []; subsTable = []; stripeSubs = {}; stripeInvoices = {}; stripeCharges = {}; sent = []; }
globalThis.fetch = async (url, init = {}) => {
  const u = String(url), method = init.method || 'GET';
  const body = init.body instanceof URLSearchParams ? Object.fromEntries(init.body) :
    typeof init.body === 'string' ? (() => { try { return JSON.parse(init.body); } catch (_) { return init.body; } })() : null;
  sent.push({ url: u, method, body });
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
  if (u.endsWith('/auth/v1/user')) return J({ id: USER });
  if (u.includes('/rest/v1/stripe_events')) return method === 'DELETE' ? J({}) : new Response('', { status: 201 });
  if (u.includes('/rest/v1/premium_unlocks')) {
    if (method === 'POST') {
      for (const r of body) {
        const i = db.findIndex((x) => x.user_id === r.user_id && x.product === r.product);
        if (i >= 0) db[i] = Object.assign({}, db[i], r); else db.push(Object.assign({}, r));
      }
      return new Response('', { status: 201 });
    }
    const q = new URL(u).searchParams;
    let rows = db.filter((r) => r.user_id === (q.get('user_id') || '').replace('eq.', ''));
    if (q.get('product')) rows = rows.filter((r) => r.product === q.get('product').replace('eq.', ''));
    if (q.get('source')) rows = rows.filter((r) => !String(r.source || '').startsWith('fantasy:'));
    return J(rows);
  }
  if (u.includes('/rest/v1/subscriptions')) {
    if (method === 'POST') { subsTable.push(body); return new Response('', { status: 201 }); }
    return J([]);
  }
  if (u.startsWith('https://api.stripe.com/v1/checkout/sessions')) return J({ url: 'https://checkout.stripe.com/c/x' });
  const m = /\/v1\/subscriptions\/([^/?]+)/.exec(u);
  if (m) return stripeSubs[m[1]] ? J(stripeSubs[m[1]]) : J({ error: { message: 'no such' } }, 404);
  const mi = /\/v1\/invoices\/([^/?]+)/.exec(u);
  if (mi) return stripeInvoices[mi[1]] ? J(stripeInvoices[mi[1]]) : J({ error: { message: 'no such' } }, 404);
  const mc = /\/v1\/charges\/([^/?]+)/.exec(u);
  if (mc) return stripeCharges[mc[1]] ? J(stripeCharges[mc[1]]) : J({ error: { message: 'no such' } }, 404);
  return J({ error: 'unexpected ' + u }, 500);
};

const buy = (bundle) => checkout({ env, request: new Request('https://runthe.gg/api/stripe/checkout-bundle', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user-jwt', Origin: 'https://runthe.gg' },
  body: JSON.stringify({ bundle, return_path: '/baseball/' }) }) });
const sessionForm = () => (sent.find((s) => s.url.includes('/v1/checkout/sessions')) || {}).body || {};

let evn = 0;
async function deliver(type, object) {
  const payload = JSON.stringify({ id: 'evt_' + (++evn), type, data: { object } });
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(t + '.' + payload).digest('hex');
  const res = await webhook({ env, request: new Request('https://runthe.gg/api/stripe/webhook', {
    method: 'POST', headers: { 'stripe-signature': 't=' + t + ',v1=' + sig }, body: payload }) });
  return { status: res.status, text: await res.text() };
}
const pro = () => db.find((r) => r.product === 'rtd_premium');
const near = (iso, ms, tol = 60000) => iso && Math.abs(Date.parse(iso) - ms) < tol;
const sub = (o) => Object.assign({ id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: false,
  metadata: { supabase_user_id: USER, bundle: 'diamond-pro' } }, o);

// ══ checkout ════════════════════════════════════════════════════════════════
head('1. THE CHECKOUT OPENS AS A SUBSCRIPTION');
reset();
let r = await buy('diamond-pro'); let d = await r.json();
let f = sessionForm();
claim(d.url && f.mode === 'subscription', 'Pro opens in subscription mode', JSON.stringify(d) + ' mode=' + f.mode);
claim(f['line_items[0][price]'] === 'price_pro_year', 'with the yearly price');
claim(f['subscription_data[metadata][bundle]'] === 'diamond-pro' && f['subscription_data[metadata][supabase_user_id]'] === USER,
  'and the bundle and the user ride on the subscription, where renewals can find them');
claim(!('customer_creation' in f), 'and it does not send customer_creation, which subscription mode refuses');
reset(); await buy('perfect-season'); f = sessionForm();
claim(f.mode === 'payment' && f.customer_creation === 'always', 'a one-time bundle is unchanged');

head('2. WHO MAY BUY IT');
reset(); db.push({ user_id: USER, product: 'rtd_premium', source: 'subscription:diamond-pro', expires_at: new Date(Date.now() + 90 * DAY).toISOString() });
d = await (await buy('diamond-pro')).json();
claim(d.error === 'already_owned', 'a running subscription cannot be bought twice');
reset(); db.push({ user_id: USER, product: 'rtd_premium', source: 'subscription:diamond-pro', expires_at: new Date(Date.now() - 10 * DAY).toISOString() });
d = await (await buy('diamond-pro')).json();
claim(!!d.url, 'a lapsed one can subscribe again', JSON.stringify(d));
reset(); db.push({ user_id: USER, product: 'rtd_premium', source: 'bundle:diamond-pro', expires_at: null });
d = await (await buy('diamond-pro')).json();
claim(d.error === 'already_owned', 'somebody who bought the old $9.99 for good is not sold a year');

// ══ the webhook ═════════════════════════════════════════════════════════════
head('3. THE GRANT FOLLOWS THE SUBSCRIPTION');
reset();
const end1 = Math.floor(Date.now() / 1000) + 365 * 86400;
stripeSubs.sub_1 = sub({ current_period_end: end1 });
let res = await deliver('checkout.session.completed', { id: 'cs_1', mode: 'subscription', payment_status: 'paid',
  client_reference_id: USER, customer: 'cus_1', subscription: 'sub_1', metadata: { supabase_user_id: USER, bundle: 'diamond-pro' } });
claim(res.status === 200 && pro() && near(pro().expires_at, end1 * 1000 + 3 * DAY), 'the first payment grants Pro to the end of the year, plus three days', JSON.stringify(res) + JSON.stringify(pro()));
claim(pro() && pro().source === 'subscription:diamond-pro' && pro().payload.stripe_customer === 'cus_1',
  'recorded as a subscription, with the customer the billing portal needs');
const started = pro() && pro().granted_at;
claim(!subsTable.length, 'and the Arcade Card\'s subscriptions table is never written');

const end2 = end1 + 365 * 86400;
stripeSubs.sub_1 = sub({ items: { data: [{ current_period_end: end2 }] } });
res = await deliver('customer.subscription.updated', sub({ current_period_end: end1 - 1000 }));
claim(near(pro().expires_at, end2 * 1000 + 3 * DAY), 'a renewal moves the end out a year, read back from Stripe, period end on the item');
claim(pro().granted_at === started, 'and keeps the day Pro started');

stripeSubs.sub_1 = sub({ status: 'past_due', current_period_end: end2 });
await deliver('customer.subscription.updated', sub({ status: 'past_due' }));
claim(near(pro().expires_at, Date.now() + 7 * DAY), 'a failed renewal gives a week, not the year it did not pay for');

stripeSubs.sub_1 = sub({ status: 'active', cancel_at_period_end: true, current_period_end: end2 });
await deliver('customer.subscription.updated', sub({ cancel_at_period_end: true }));
claim(near(pro().expires_at, end2 * 1000 + 3 * DAY), 'cancelling keeps what was paid for, to the end of the period');

stripeSubs.sub_1 = sub({ status: 'canceled', current_period_end: end2 });
await deliver('customer.subscription.deleted', sub({ status: 'canceled' }));
claim(near(pro().expires_at, Date.now()), 'and when it ends, Pro ends');
/* A stale "active" event delivered after the cancellation: the webhook reads the
   subscription back from Stripe, which still says canceled. */
await deliver('customer.subscription.updated', sub({ status: 'active', current_period_end: end2 }));
claim(near(pro().expires_at, Date.now()), 'an old "active" event arriving late does not hand back a year');
claim(!subsTable.length, 'none of it touched the subscriptions table');

head('4. WHAT A SUBSCRIPTION EVENT MAY NOT DO');
reset(); db.push({ user_id: USER, product: 'rtd_premium', source: 'bundle:diamond-pro', expires_at: null, granted_at: '2026-01-01T00:00:00Z' });
stripeSubs.sub_1 = sub({ status: 'canceled', current_period_end: end1 });
await deliver('customer.subscription.deleted', sub({ status: 'canceled' }));
claim(pro().expires_at === null, 'a lifetime grant is never given an end date');
reset();
const arcade = { id: 'sub_a', customer: 'cus_a', status: 'active', current_period_end: end1, metadata: { supabase_user_id: USER },
  items: { data: [{ price: { id: 'price_arcade' } }] } };
await deliver('customer.subscription.updated', arcade);
claim(subsTable.length === 1 && !db.length, 'an Arcade Card subscription still goes to its own table, and grants no baseball Pro');

head('5. A REFUND OR A CHARGEBACK ENDS IT, AND STAYS ENDED');
/* Stripe does not cancel a subscription when its charge is refunded, so everything
   after the refund still reads `active` for the period it took back. */
async function subscribed(end) {
  reset();
  stripeSubs.sub_1 = sub({ current_period_end: end });
  await deliver('checkout.session.completed', { id: 'cs_1', mode: 'subscription', payment_status: 'paid',
    client_reference_id: USER, customer: 'cus_1', subscription: 'sub_1', metadata: { supabase_user_id: USER, bundle: 'diamond-pro' } });
  stripeInvoices.in_1 = { id: 'in_1', subscription: 'sub_1' };
}
await subscribed(end1);
res = await deliver('charge.refunded', { id: 'ch_p', invoice: 'in_1', amount: 1499, amount_refunded: 500, refunded: false });
claim(res.status === 200 && near(pro().expires_at, end1 * 1000 + 3 * DAY), 'a partial refund changes nothing');
res = await deliver('charge.refunded', { id: 'ch_1', invoice: 'in_1', amount: 1499, amount_refunded: 1499, refunded: true });
claim(res.status === 200 && near(pro().expires_at, Date.now()), 'a full refund ends Pro now', JSON.stringify(res) + JSON.stringify(pro()));
claim(pro().payload.refunded_through === end1, 'and remembers the period it took back', JSON.stringify(pro().payload));
claim(pro().source === 'subscription:diamond-pro' && pro().payload.stripe_customer === 'cus_1',
  'and keeps the customer, so the receipt can still open the portal');
await deliver('customer.subscription.updated', sub({ current_period_end: end1 }));
claim(near(pro().expires_at, Date.now()), 'a later event for the same period, still reading active, grants nothing');
await deliver('charge.refunded', { id: 'ch_1', invoice: 'in_1', amount: 1499, amount_refunded: 1499, refunded: true });
claim(near(pro().expires_at, Date.now()) && pro().payload.refunded_through === end1, 'a refund delivered twice is the same answer');
stripeSubs.sub_1 = sub({ current_period_end: end2 });
await deliver('invoice.paid', { id: 'in_2', subscription: 'sub_1' });
await deliver('customer.subscription.updated', sub({ current_period_end: end2 }));
claim(near(pro().expires_at, end2 * 1000 + 3 * DAY), 'a paid renewal into a LATER period grants that period');
claim(!subsTable.length, 'none of it touched the subscriptions table');

await subscribed(end1);
stripeCharges.ch_d = { id: 'ch_d', invoice: 'in_1', amount: 1499, amount_refunded: 0 };
res = await deliver('charge.dispute.created', { id: 'dp_1', charge: 'ch_d' });
claim(res.status === 200 && near(pro().expires_at, Date.now()) && pro().payload.refunded_through === end1,
  'a chargeback ends it the same way, found through the charge', JSON.stringify(res));

reset(); db.push({ user_id: USER, product: 'rtd_premium', source: 'bundle:diamond-pro', expires_at: null, payload: {} });
stripeSubs.sub_1 = sub({ current_period_end: end1 });
stripeInvoices.in_1 = { id: 'in_1', subscription: 'sub_1' };
await deliver('charge.refunded', { id: 'ch_1', invoice: 'in_1', amount: 1499, amount_refunded: 1499, refunded: true });
claim(pro().expires_at === null, 'a refund on a subscription never reaches a lifetime grant');

reset(); db.push({ user_id: USER, product: 'rtd_premium', source: 'bundle:diamond-pro', expires_at: null, payload: {} });
res = await deliver('charge.refunded', { id: 'ch_once', invoice: null, amount: 999, amount_refunded: 999, refunded: true });
claim(res.status === 200 && pro().expires_at === null && !sent.some((x) => x.url.includes('/v1/invoices/')),
  'a refund of the old $9.99 one-time Pro changes nothing and asks Stripe for nothing');

console.log(`\n${fails ? fails + ' of ' + (fails + passes) + ' checks FAILED' : 'All ' + passes + ' checks passed.'}`);
process.exit(fails ? 1 : 0);
