/* The checkout's rules about WHO may buy WHAT, driven through the real endpoint.
 *
 *   node scripts/stripe/check-checkout.mjs
 *
 * No network and no Stripe: every request the endpoint makes is answered here. The one that
 * would open a real checkout (POST /v1/checkout/sessions) is answered with a url that points
 * nowhere and the FORM IT WAS SENT is what gets asserted, so what reaches Stripe is checked
 * without anything reaching Stripe.
 *
 * THE SWITCH IS OFF IN THE REPO (YEARLY_LIVE in _bundles.js), so the endpoint is copied to a
 * scratch directory with it turned on for the yearly half. That copy is the only way to
 * drive the yearly rules without shipping the switch on, and it is thrown away after.
 *
 * What is asserted, the owner's rules in full:
 *   - the page must be showing the plan that is on sale, or the answer is offer_changed
 *   - sold yearly: a lifetime Perfect Season or Run The Bundle owner is refused Perfect
 *     Season yearly, a lifetime Run The Bundle owner is refused Run The Bundle yearly, a
 *     lifetime Perfect Season owner may buy Run The Bundle yearly, a live plan is refused a
 *     second copy, and a Fantasy pass or a lapsed plan is not ownership
 *   - a plan is a subscription session carrying the account and the plan on the
 *     SUBSCRIPTION, with no customer_creation (Stripe refuses it in that mode)
 *   - sold once: exactly the rule it always had, with ended rows no longer counted
 *   - with the database missing 124, the switch on still sells once
 */
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url).pathname;
let failed = 0, passed = 0;
const ok = (label, cond, detail) => {
  if (cond) { passed++; console.log('  ok  ' + label); }
  else { failed++; console.error('FAIL  ' + label + (detail ? '   ' + detail : '')); }
};

async function load(yearlyOn) {
  const dir = mkdtempSync(join(tmpdir(), 'checkout-'));
  cpSync(join(root, 'functions/api/stripe'), dir, { recursive: true });
  if (yearlyOn) {
    const f = join(dir, '_bundles.js');
    const src = readFileSync(f, 'utf8');
    if (!/export const YEARLY_LIVE = false;/.test(src)) throw new Error('no YEARLY_LIVE = false to turn on');
    writeFileSync(f, src.replace('export const YEARLY_LIVE = false;', 'export const YEARLY_LIVE = true;'));
  }
  const mod = await import(join(dir, 'checkout-bundle.js') + '?' + Math.random());
  return { mod, dir };
}

const env = {
  STRIPE_SECRET_KEY: 'sk_test_check', SUPABASE_URL: 'http://supabase.check', SUPABASE_SERVICE_ROLE: 'svc',
  SITE_URL: 'https://runthe.gg',
  STRIPE_PRICE_PS_PREMIUM_BUNDLE: 'price_ps_once', STRIPE_PRICE_RUN_THE_BUNDLE: 'price_rtb_once',
  STRIPE_PRICE_PS_YEAR: 'price_ps_year', STRIPE_PRICE_RTB_YEAR: 'price_rtb_year',
};

/* One account's world: its unlock rows, its plans, whether the database has 124. */
let world = { rows: [], subs: [], ready: true };
let sessions = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  const J = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (u.host === 'supabase.check') {
    if (u.pathname === '/auth/v1/user') return J(200, { id: 'u-1' });
    if (u.pathname === '/rest/v1/rpc/premium_yearly_ready') return world.ready ? J(200, 1) : J(404, { code: 'PGRST202' });
    if (u.pathname === '/rest/v1/premium_unlocks') {
      const fantasyOut = (u.searchParams.get('source') || '') === 'not.like.fantasy:*';
      return J(200, world.rows.filter((r) => !fantasyOut || !/^fantasy:/.test(r.source)));
    }
    if (u.pathname === '/rest/v1/premium_subscriptions') {
      if (!world.ready) return J(404, { code: 'PGRST205' });
      return J(200, world.subs);
    }
    if (u.pathname === '/rest/v1/subscriptions') return J(200, []);
    throw new Error('unexpected Supabase request ' + u.pathname);
  }
  if (u.host === 'api.stripe.com' && u.pathname === '/v1/checkout/sessions' && init.method === 'POST') {
    const form = new URLSearchParams(String(init.body));
    sessions.push(form);
    return J(200, { url: 'https://checkout.invalid/' + sessions.length });
  }
  throw new Error('a request left the check: ' + url);
};

async function buy(mod, bundle, plan) {
  const request = new Request('https://runthe.gg/api/stripe/checkout-bundle', {
    method: 'POST', headers: { Authorization: 'Bearer user-jwt', 'Content-Type': 'application/json' },
    body: JSON.stringify(plan === undefined ? { bundle } : { bundle, plan }),
  });
  const res = await mod.onRequestPost({ env, request });
  return { status: res.status, body: await res.json() };
}

const day = 86400e3;
const iso = (d) => new Date(Date.now() + d).toISOString();
const life = (product, source) => ({ product, source, expires_at: null });
const timed = (product, source, until) => ({ product, source, expires_at: until });
const sub = (bundle, status, until, cancel) => ({ bundle, status, access_until: until, cancel_at_period_end: !!cancel });

// ─── the switch off: sold once, exactly as before ───────────────────────────
console.log('SOLD ONCE (the switch off)');
{
  const { mod, dir } = await load(false);
  world = { rows: [], subs: [], ready: true }; sessions = [];
  let r = await buy(mod, 'perfect-season');
  ok('a page that sends no plan buys once', r.body.url && sessions[0].get('mode') === 'payment'
    && sessions[0].get('line_items[0][price]') === 'price_ps_once', JSON.stringify(r.body));
  ok('  with customer_creation, as payment mode needs', sessions[0].get('customer_creation') === 'always');
  r = await buy(mod, 'perfect-season', 'year');
  ok('a page showing yearly while once is on sale is told offer_changed',
    r.status === 409 && r.body.error === 'offer_changed' && r.body.plan === 'once', JSON.stringify(r.body));
  world.rows = [life('ps_premium', 'bundle:perfect-season')];
  r = await buy(mod, 'run-the-bundle', 'once');
  ok('a Perfect Season owner is still refused the one-time Run The Bundle', r.body.error === 'already_owned');
  world.rows = [timed('ps_premium', 'fantasy:2026-w3', iso(10 * day))];
  r = await buy(mod, 'perfect-season', 'once');
  ok('a Fantasy pass is not ownership', !!r.body.url, JSON.stringify(r.body));
  world.rows = [timed('ps_premium', 'sub:perfect-season', iso(-10 * day))];
  r = await buy(mod, 'perfect-season', 'once');
  ok('a plan that has ended is not ownership either', !!r.body.url, JSON.stringify(r.body));
  world.rows = [timed('ps_premium', 'sub:perfect-season', iso(100 * day))];
  r = await buy(mod, 'perfect-season', 'once');
  ok('a plan still running is', r.body.error === 'already_owned');
  rmSync(dir, { recursive: true, force: true });
}

// ─── the switch on ──────────────────────────────────────────────────────────
console.log('\nSOLD YEARLY (the switch on, in a scratch copy)');
{
  const { mod, dir } = await load(true);
  world = { rows: [], subs: [], ready: false }; sessions = [];
  let r = await buy(mod, 'perfect-season', 'once');
  ok('a database without 124 keeps selling once, switch or no switch',
    !!r.body.url && sessions[0].get('mode') === 'payment', JSON.stringify(r.body));

  world = { rows: [], subs: [], ready: true }; sessions = [];
  r = await buy(mod, 'perfect-season', 'once');
  ok('a page still showing once is told offer_changed, with the plan on sale',
    r.status === 409 && r.body.error === 'offer_changed' && r.body.plan === 'year');
  r = await buy(mod, 'perfect-season');
  ok('  and so is a page cached from before the switch, which sends no plan',
    r.body.error === 'offer_changed');

  r = await buy(mod, 'perfect-season', 'year');
  const f = sessions[sessions.length - 1];
  ok('a new buyer gets a subscription session at the yearly price',
    !!r.body.url && f.get('mode') === 'subscription' && f.get('line_items[0][price]') === 'price_ps_year');
  ok('  carrying the account and the plan on the subscription itself',
    f.get('subscription_data[metadata][supabase_user_id]') === 'u-1'
      && f.get('subscription_data[metadata][bundle]') === 'perfect-season');
  ok('  with no customer_creation, which Stripe refuses in subscription mode', !f.has('customer_creation'));
  ok('  and a success url that says it was a plan', /checkout=success&plan=year$/.test(f.get('success_url')));
  ok('  and promotion codes allowed, for a 100% off test purchase', f.get('allow_promotion_codes') === 'true');

  world.rows = [life('ps_premium', 'bundle:perfect-season'), life('cfb_premium', 'bundle:perfect-season')];
  r = await buy(mod, 'perfect-season', 'year');
  ok('a lifetime Perfect Season owner is refused Perfect Season yearly', r.status === 409 && r.body.error === 'already_owned');
  r = await buy(mod, 'run-the-bundle', 'year');
  ok('  and may buy Run The Bundle yearly, at the full yearly price',
    !!r.body.url && sessions[sessions.length - 1].get('line_items[0][price]') === 'price_rtb_year', JSON.stringify(r.body));

  world.rows = [life('ps_premium', 'bundle:run-the-bundle'), life('cfb_premium', 'bundle:run-the-bundle'),
    timed('arcade_card_year', 'bundle:run-the-bundle', iso(-5 * day)), life('runtour_pack', 'bundle:run-the-bundle')];
  r = await buy(mod, 'perfect-season', 'year');
  ok('a lifetime Run The Bundle owner is refused Perfect Season yearly', r.body.error === 'already_owned');
  r = await buy(mod, 'run-the-bundle', 'year');
  ok('  and Run The Bundle yearly too (owner decision)', r.body.error === 'already_owned');

  world.rows = [life('ps_premium', 'comp'), life('cfb_premium', 'comp')];
  r = await buy(mod, 'perfect-season', 'year');
  ok('a comped lifetime account is a lifetime owner', r.body.error === 'already_owned');

  world.rows = [timed('ps_premium', 'sub:perfect-season', iso(300 * day))];
  world.subs = [sub('perfect-season', 'active', iso(300 * day))];
  r = await buy(mod, 'perfect-season', 'year');
  ok('a live Perfect Season plan is refused a second copy', r.body.error === 'already_subscribed');
  r = await buy(mod, 'run-the-bundle', 'year');
  ok('  and is sent to change plan rather than stack Run The Bundle on top',
    r.body.error === 'already_subscribed' && r.body.change === true);
  world.subs = [sub('perfect-season', 'active', iso(300 * day), true)];
  r = await buy(mod, 'perfect-season', 'year');
  ok('  and a plan cancelled at its period end still counts until it ends', r.body.error === 'already_subscribed');
  world.subs = [sub('perfect-season', 'past_due', iso(3 * day))];
  r = await buy(mod, 'perfect-season', 'year');
  ok('  and so does one inside its grace', r.body.error === 'already_subscribed');

  world.rows = [timed('ps_premium', 'sub:run-the-bundle', iso(200 * day))];
  world.subs = [sub('run-the-bundle', 'active', iso(200 * day))];
  r = await buy(mod, 'run-the-bundle', 'year');
  ok('a live Run The Bundle plan is refused a second copy', r.body.error === 'already_subscribed' && !r.body.change);
  r = await buy(mod, 'perfect-season', 'year');
  ok('  and Perfect Season on top, which it already includes', r.body.error === 'already_subscribed');

  world.rows = [timed('ps_premium', 'sub:perfect-season', iso(-30 * day))];
  world.subs = [sub('perfect-season', 'canceled', iso(-30 * day))];
  r = await buy(mod, 'perfect-season', 'year');
  ok('a lapsed subscriber may buy again', !!r.body.url, JSON.stringify(r.body));

  world.rows = [timed('ps_premium', 'fantasy:2026-w3', iso(20 * day)), timed('cfb_premium', 'fantasy:2026-w3', iso(20 * day))];
  world.subs = [];
  r = await buy(mod, 'perfect-season', 'year');
  ok('a Fantasy pass holder may subscribe', !!r.body.url, JSON.stringify(r.body));

  const d = await import(join(dir, 'checkout-bundle.js') + '?rtd');
  world = { rows: [], subs: [], ready: true };
  env.STRIPE_PRICE_RTF_PRO = 'price_rtf';
  r = await buy(d, 'floor-pro', 'year');
  ok('a bundle with no yearly plan ignores the plan it is sent and sells once',
    !!r.body.url && sessions[sessions.length - 1].get('mode') === 'payment');

  /* Run The Diamond Pro renews, but on its own Price rather than as a yearly plan, so
     it opens a subscription whatever plan it is sent and is never filed as 'year'. */
  env.STRIPE_PRICE_RTD_PRO = 'price_rtd';
  r = await buy(d, 'diamond-pro', 'year');
  const rs = sessions[sessions.length - 1];
  ok('a recurring bundle opens a subscription', !!r.body.url && rs.get('mode') === 'subscription');
  ok('  carrying the account and the bundle on the subscription',
    rs.get('subscription_data[metadata][supabase_user_id]') && rs.get('subscription_data[metadata][bundle]') === 'diamond-pro');
  ok('  and it is not filed as a yearly plan', rs.get('metadata[plan]') !== 'year', rs.get('metadata[plan]'));
  rmSync(dir, { recursive: true, force: true });
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
