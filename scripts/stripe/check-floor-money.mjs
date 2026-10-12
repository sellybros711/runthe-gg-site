/* Run The Floor's real money, shipped dark: the coin buckets and the Floor Pass.
 *
 *   node scripts/stripe/check-floor-money.mjs
 *
 * No network and no Stripe. Every request the checkout and the webhook make is
 * answered here, and the one that would open a real checkout is answered with a
 * url that points nowhere: the FORM it was sent is what is asserted. Stripe is
 * live and has no test mode, so nothing in this file may reach it.
 *
 * What it holds:
 *   1. every switch is off, and the page's copy agrees with the server's
 *   2. the page's buckets are the server's buckets, coin for coin and cent for cent
 *   3. the server's pass season ends when hoops/pass.js says, across both clock changes
 *   4. the price the pass sheet prints is the price the setup script mints
 *   5. off, the checkout sells neither; on (a scratch copy), it sells each correctly
 *   6. the webhook files a bucket off the catalog and a pass to the season's end
 *   7. the page's cover(): a short press spends exactly the shortfall, once
 */
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const root = new URL('../../', import.meta.url).pathname;
const require = createRequire(import.meta.url);
let failed = 0, passed = 0;
const ok = (label, cond, detail) => {
  if (cond) { passed++; console.log('  ok  ' + label); }
  else { failed++; console.error('FAIL  ' + label + (detail ? '   ' + detail : '')); }
};
const read = (p) => readFileSync(join(root, p), 'utf8');
const flagOf = (src, name) => { const m = new RegExp('(?:export const|var) ' + name + ' = (true|false);').exec(src); return m ? m[1] === 'true' : null; };

/* ─── 1. the switches ────────────────────────────────────────────────────── */
console.log('1. every switch is off, and the page agrees with the server');
const bundlesSrc = read('functions/api/stripe/_bundles.js');
const econSrc = read('hoops/economy.js');
const passSrc = read('hoops/pass.js');
const sPass = flagOf(bundlesSrc, 'PASS_PAID_ENABLED'), sBuck = flagOf(bundlesSrc, 'BUCKETS_ENABLED');
const pPass = flagOf(passSrc, 'PASS_PAID_ENABLED'), pBuck = flagOf(econSrc, 'BUCKETS_ENABLED');
ok('the server says the pass is not on sale', sPass === false, String(sPass));
ok('the server says the buckets are not on sale', sBuck === false, String(sBuck));
ok('the page agrees about the pass', pPass === sPass, pPass + ' against ' + sPass);
ok('the page agrees about the buckets', pBuck === sBuck, pBuck + ' against ' + sBuck);

const B = await import(join(root, 'functions/api/stripe/_bundles.js') + '?' + Math.random());
const X = require(join(root, 'hoops/economy.js'));
const P = require(join(root, 'hoops/pass.js'));

/* ─── 2. the buckets ─────────────────────────────────────────────────────── */
console.log('2. the page draws the buckets the server sells');
const sk = Object.keys(B.BUCKETS), pk = Object.keys(X.BUCKETS);
ok('the same five buckets', sk.length === 5 && sk.join() === pk.join(), pk.join() + ' against ' + sk.join());
for (const k of sk) {
  const s = B.BUCKETS[k], p = X.BUCKETS[k] || {};
  ok(k + ' matches (name, cents, coins, packs)', s.name === p.name && s.cents === p.cents && s.coins === p.coins && JSON.stringify(s.packs) === JSON.stringify(p.packs));
  ok(k + ' is a pack the game has', s.packs.every((x) => X.PACKS[x]));
}
const per = sk.map((k) => B.BUCKETS[k].coins / B.BUCKETS[k].cents);
ok('a bigger bucket is never worse coins a dollar', per.every((v, i) => i === 0 || v >= per[i - 1]), per.map((v) => v.toFixed(1)).join(' '));

/* ─── 3. the season ──────────────────────────────────────────────────────── */
console.log('3. the server ends a pass when the game ends its season');
const times = [];
for (let d = -2; d < 200; d++) for (const h of [0, 4, 5, 6, 12, 23]) times.push(Date.UTC(2026, 9, 12) + d * 864e5 + h * 36e5);
times.push(Date.UTC(2026, 10, 1, 5, 30), Date.UTC(2026, 10, 1, 6, 30), Date.UTC(2027, 2, 14, 6, 30), Date.UTC(2027, 2, 14, 7, 30));
let bad = null;
for (const t of times) {
  const s = B.passSeason(t), g = P.season(t);
  if (s.n !== g.n || s.endsAt !== P.endsAt(g.n)) { bad = new Date(t).toISOString() + ' server ' + s.n + '/' + s.endsAt + ' game ' + g.n + '/' + P.endsAt(g.n); break; }
}
ok('season and its end agree at ' + times.length + ' instants, over both clock changes', !bad, bad);
ok('the epoch and the length are one answer', B.PASS_EPOCH === P.EPOCH && B.PASS_LEN === P.LEN);

/* ─── 4. the price ───────────────────────────────────────────────────────── */
console.log('4. the price on the sheet is the price minted');
const setupSrc = read('scripts/stripe/setup-premium-bundles.mjs');
const mint = /lookupKey: 'rtf_pass_season',[\s\S]{0,200}?amountCents: (\d+)/.exec(setupSrc);
const shown = /var PASS_PRICE = '([\d.]+)';/.exec(read('hoops/pass-ui.js'));
ok('the setup script mints the pass', !!mint);
ok('the pass sheet prints the minted price', mint && shown && (+mint[1] / 100).toFixed(2) === shown[1], (shown && shown[1]) + ' against ' + (mint && mint[1]));
const minted = sk.every((k) => new RegExp("'" + B.BUCKETS[k].envPrice + "'|" + k).test(setupSrc) || /BUCKETS/.test(setupSrc));
ok('the setup script mints the buckets', minted);

/* ─── 5. the checkout ────────────────────────────────────────────────────── */
console.log('5. the checkout sells nothing off, and the right thing on');
async function loadCheckout(on) {
  const dir = mkdtempSync(join(tmpdir(), 'floormoney-'));
  cpSync(join(root, 'functions/api/stripe'), dir, { recursive: true });
  const f = join(dir, '_bundles.js');
  let src = readFileSync(f, 'utf8');
  src = src.replace(/export const PASS_PAID_ENABLED = (true|false);/, 'export const PASS_PAID_ENABLED = ' + on + ';')
           .replace(/export const BUCKETS_ENABLED = (true|false);/, 'export const BUCKETS_ENABLED = ' + on + ';');
  writeFileSync(f, src);
  const co = await import(join(dir, 'checkout-bundle.js') + '?' + Math.random());
  const wh = await import(join(dir, 'webhook.js') + '?' + Math.random());
  return { co, wh, dir };
}
const env = {
  STRIPE_SECRET_KEY: 'sk_test_check', SUPABASE_URL: 'http://supabase.check', SUPABASE_SERVICE_ROLE: 'svc',
  SITE_URL: 'https://runthe.gg', STRIPE_PRICE_RTF_PASS: 'price_pass',
  STRIPE_PRICE_RTF_COINS_1: 'price_c1', STRIPE_PRICE_RTF_COINS_2: 'price_c2', STRIPE_PRICE_RTF_COINS_3: 'price_c3',
  STRIPE_PRICE_RTF_COINS_4: 'price_c4', STRIPE_PRICE_RTF_COINS_5: 'price_c5',
};
let rows = [], sessions = [], posts = [], escaped = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  const J = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (u.host === 'supabase.check') {
    if (u.pathname === '/auth/v1/user') return J(200, { id: 'u-1', email: 'a@b.c' });
    if (u.pathname === '/rest/v1/premium_unlocks' && (init.method || 'GET') === 'GET') return J(200, rows);
    if (u.pathname === '/rest/v1/rpc/premium_yearly_ready') return J(200, 1);
    if (u.pathname === '/rest/v1/premium_subscriptions' || u.pathname === '/rest/v1/subscriptions') return J(200, []);
    if (init.method === 'POST') { posts.push({ path: u.pathname, query: u.search, body: JSON.parse(String(init.body || 'null')) }); return J(201, true); }
    return J(200, []);
  }
  if (u.host === 'api.stripe.com' && u.pathname === '/v1/checkout/sessions' && init.method === 'POST') {
    sessions.push(new URLSearchParams(String(init.body)));
    return J(200, { url: 'https://checkout.invalid/' + sessions.length, id: 'cs_check' });
  }
  if (u.host === 'api.stripe.com' && u.pathname.startsWith('/v1/customers')) return J(200, { data: [], id: 'cus_check' });
  escaped.push(String(url));
  throw new Error('unexpected request ' + url);
};
const press = async (co, body, e = env) => {
  const req = new Request('https://runthe.gg/api/stripe/checkout-bundle', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok', Origin: 'https://runthe.gg' }, body: JSON.stringify(body),
  });
  const r = await co.onRequestPost({ request: req, env: e });
  let j = {}; try { j = await r.json(); } catch (x) {}
  return { status: r.status, body: j };
};

const off = await loadCheckout(false), on = await loadCheckout(true);
try {
  sessions = [];
  let r = await press(off.co, { bucket: 'floor-coins-3', return_path: '/hoops/' });
  ok('off: a bucket is refused, not_on_sale', r.status === 403 && r.body.error === 'not_on_sale', r.status + ' ' + JSON.stringify(r.body));
  r = await press(off.co, { bundle: 'floor-pass', return_path: '/hoops/' });
  ok('off: the pass is refused, not_on_sale', r.status === 403 && r.body.error === 'not_on_sale', r.status + ' ' + JSON.stringify(r.body));
  ok('off: nothing reached Stripe', sessions.length === 0, String(sessions.length));

  r = await press(on.co, { bucket: 'floor-coins-4', return_path: '/hoops/' });
  const f = sessions[sessions.length - 1];
  ok('on: a bucket opens a checkout', r.status === 200 && /checkout\.invalid/.test(r.body.url || ''), r.status + ' ' + JSON.stringify(r.body));
  ok('on: it is one payment, not a subscription', f && f.get('mode') === 'payment');
  ok('on: it is the bucket\'s own price', f && f.get('line_items[0][price]') === 'price_c4');
  ok('on: the bucket rides on the session for the webhook', f && f.get('metadata[bucket]') === 'floor-coins-4');
  ok('on: it carries the account', f && (f.get('client_reference_id') === 'u-1' || f.get('metadata[user_id]') === 'u-1'));
  r = await press(on.co, { bucket: 'floor-coins-9', return_path: '/hoops/' });
  ok('on: a bucket that is not one is refused', r.status >= 400 && r.status < 500, String(r.status));
  r = await press(on.co, { bucket: 'floor-coins-1', return_path: '/hoops/' }, Object.assign({}, env, { STRIPE_PRICE_RTF_COINS_1: '' }));
  ok('on: a bucket with no price set sells nothing (503)', r.status === 503, String(r.status));

  const n0 = sessions.length;
  r = await press(on.co, { bundle: 'floor-pass', return_path: '/hoops/' });
  const fp = sessions[sessions.length - 1];
  ok('on: the pass opens a checkout', r.status === 200 && sessions.length === n0 + 1, r.status + ' ' + JSON.stringify(r.body));
  ok('on: the pass is one payment at its own price', fp && fp.get('mode') === 'payment' && fp.get('line_items[0][price]') === 'price_pass');
  rows = [{ product: 'rtf_pass', source: 'bundle:floor-pass', expires_at: new Date(Date.now() + 864e5).toISOString() }];
  r = await press(on.co, { bundle: 'floor-pass', return_path: '/hoops/' });
  ok('on: a pass already running this season is refused', r.status === 409 && r.body.error === 'already_owned', r.status + ' ' + JSON.stringify(r.body));
  rows = [{ product: 'rtf_pass', source: 'bundle:floor-pass', expires_at: new Date(Date.now() - 864e5).toISOString() }];
  r = await press(on.co, { bundle: 'floor-pass', return_path: '/hoops/' });
  ok('on: last season\'s pass does not stop this season\'s', r.status === 200, String(r.status));
  rows = [];

  /* ─── 6. the webhook ─────────────────────────────────────────────────── */
  console.log('6. the webhook files what the catalog says, not what the session says');
  posts = [];
  await on.wh.handleEvent(env, 'checkout.session.completed', { id: 'cs_live_bucket1', mode: 'payment', payment_status: 'paid', client_reference_id: 'u-1', metadata: { user_id: 'u-1', bucket: 'floor-coins-5', coins: '99999999' }, amount_total: 1 });
  const buy = posts.find((p) => p.path === '/rest/v1/rpc/rtf_coin_buy');
  ok('a paid bucket is filed through rtf_coin_buy', !!buy);
  ok('the coins and packs are the catalog\'s', buy && buy.body.p_coins === 750000 && JSON.stringify(buy.body.p_packs) === '["hof","hof","hof"]', JSON.stringify(buy && buy.body));
  ok('it is keyed on the session', buy && buy.body.p_session === 'cs_live_bucket1' && buy.body.p_user === 'u-1');
  ok('a bucket is never a premium_unlocks row', !posts.some((p) => p.path === '/rest/v1/premium_unlocks'));
  posts = [];
  await on.wh.handleEvent(env, 'checkout.session.completed', { id: 'cs_live_bucket2', mode: 'payment', payment_status: 'unpaid', client_reference_id: 'u-1', metadata: { user_id: 'u-1', bucket: 'floor-coins-2' } });
  ok('an unpaid session files nothing', !posts.some((p) => p.path === '/rest/v1/rpc/rtf_coin_buy'));
  let threw = false;
  try { await on.wh.handleEvent(env, 'checkout.session.completed', { id: 'cs_live_bucket3', mode: 'payment', payment_status: 'paid', client_reference_id: 'u-1', metadata: { user_id: 'u-1', bucket: 'floor-coins-7' } }); } catch (e) { threw = true; }
  ok('an unknown bucket throws, so Stripe retries and the dashboard shows it', threw);
  posts = [];
  await off.wh.handleEvent(env, 'checkout.session.completed', { id: 'cs_live_bucket4', mode: 'payment', payment_status: 'paid', client_reference_id: 'u-1', metadata: { user_id: 'u-1', bucket: 'floor-coins-1' } });
  ok('a session paid before the switch went off is still delivered', posts.some((p) => p.path === '/rest/v1/rpc/rtf_coin_buy'));

  posts = [];
  const t0 = Date.now();
  await on.wh.handleEvent(env, 'checkout.session.completed', { id: 'cs_live_pass1', mode: 'payment', payment_status: 'paid', client_reference_id: 'u-1', metadata: { user_id: 'u-1', bundle: 'floor-pass' } });
  const grant = posts.find((p) => p.path === '/rest/v1/premium_unlocks');
  const row = grant && grant.body && grant.body[0];
  ok('a paid pass is one premium_unlocks row', !!row && grant.body.length === 1 && row.product === 'rtf_pass');
  ok('it ends at the pass season\'s end', row && Date.parse(row.expires_at) === P.endsAt(P.season(t0).n), row && row.expires_at);
  ok('it records the season', row && row.payload && row.payload.season === P.season(t0).n);
  ok('a second delivery merges into the same row', grant && /on_conflict=user_id,product/.test(grant.query));
} finally {
  rmSync(off.dir, { recursive: true, force: true });
  rmSync(on.dir, { recursive: true, force: true });
}
ok('nothing escaped to the network', escaped.length === 0, escaped.join(' '));

/* ─── 7. the page's cover ────────────────────────────────────────────────── */
console.log('7. the page spends exactly the shortfall, once, and only when on');
async function loadPage(on) {
  const dir = mkdtempSync(join(tmpdir(), 'floorpage-'));
  for (const f of ['economy.js', 'catalog.js', 'packs.js', 'daily.js', 'pass.js', 'idles.js', 'wardrobe.js']) cpSync(join(root, 'hoops', f), join(dir, f));
  const e = join(dir, 'economy.js');
  writeFileSync(e, readFileSync(e, 'utf8').replace(/var BUCKETS_ENABLED = (true|false);/, 'var BUCKETS_ENABLED = ' + on + ';'));
  return { W: require(join(dir, 'wardrobe.js')), X: require(join(dir, 'economy.js')), dir };
}
const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
/* the modules bind their siblings by require while there is no window, so the
   window (the account and its two wallet doors) goes in after they load */
const dark = await loadPage(false), lit = await loadPage(true);
let srv = { balance: 0, spends: {} }, spendCalls = 0;
globalThis.window = {
  RTF_AUTH: {
    state: () => ({ signedIn: true, user: { id: 'u-1' } }),
    walletState: async () => ({ balance: srv.balance, buys: [{ session: 'cs_live_bucket1', packs: ['hof'], refunded: false }] }),
    walletSpend: async (key, coins) => {
      spendCalls++;
      if (srv.spends[key] != null) return { ok: true, again: true, balance: srv.balance };
      if (srv.balance < coins) return { ok: false, why: 'coins' };
      srv.spends[key] = coins; srv.balance -= coins; return { ok: true, balance: srv.balance };
    },
    premiumProducts: async () => [],
  },
};

try {
  srv = { balance: 50000, spends: {} }; spendCalls = 0;
  await dark.W.wallet.paidRefresh();
  ok('dark: the page reads no paid balance', dark.W.wallet.paid() === 0);
  const c0 = await dark.W.wallet.cover(10000);
  ok('dark: cover asks the server for nothing', c0.ok === false && spendCalls === 0);

  for (const k of Object.keys(store)) delete store[k];
  lit.W.wallet.reload();
  await lit.W.wallet.paidRefresh();
  ok('lit: the page reads the server\'s paid balance', lit.W.wallet.paid() === 50000, String(lit.W.wallet.paid()));
  ok('lit: the balance shown counts it', lit.W.wallet.balance() === lit.X.balance(lit.W.wallet.load()) + 50000);
  ok('lit: a bucket\'s pack is filed as a free pack, once', lit.W.shop.credits('hof').filter((c) => /^buy:cs_live_bucket1:/.test(c.key)).length === 1);
  await lit.W.wallet.paidRefresh();
  ok('lit: reading again files it no second time', lit.W.shop.credits('hof').filter((c) => /^buy:cs_live_bucket1:/.test(c.key)).length === 1);
  const before = lit.X.balance(lit.W.wallet.load());
  const c1 = await lit.W.wallet.cover(before + 12000);
  ok('lit: cover moves exactly the shortfall', c1.ok && c1.moved === 12000 && srv.balance === 38000, JSON.stringify(c1) + ' server ' + srv.balance);
  ok('lit: and files it in the ledger under the same key', lit.X.balance(lit.W.wallet.load()) === before + 12000 && Object.keys(lit.W.wallet.load().e).some((k) => /^paid:top:/.test(k)));
  const c2 = await lit.W.wallet.cover(10);
  ok('lit: a press the ledger already covers asks nothing', c2.ok && c2.moved === 0 && spendCalls === 1);
  const c3 = await lit.W.wallet.cover(lit.X.balance(lit.W.wallet.load()) + 999999);
  ok('lit: a shortfall past the paid balance is refused and moves nothing', c3.ok === false && srv.balance === 38000);
  /* covered(): a short press is tried, covered and tried once more */
  let tries = 0;
  const r = await lit.W.shop.covered(500, () => (++tries === 1 ? { err: 'coins' } : { ok: 1 }));
  ok('lit: covered() retries a short press once after covering', tries === 2 && r && r.ok === 1, String(tries));
  /* a bought pass (the rtf_pass row) opens the premium lane; on sale alone does not */
  window.RTF_AUTH.premiumProducts = async () => [];
  await lit.W.pass.refreshOwned(true);
  ok('lit: on sale or not, no row means the lane is shut', lit.W.pass.paidOpen() === false && lit.W.pass.owned() === false);
  window.RTF_AUTH.premiumProducts = async () => ['rtf_pass'];
  await lit.W.pass.refreshOwned(true);
  ok('lit: the rtf_pass row opens the lane', lit.W.pass.paidOpen() === true && lit.W.pass.owned() === true);
  window.RTF_AUTH.premiumProducts = async () => null;
  await lit.W.pass.refreshOwned(true);
  ok('lit: a read that fails takes nothing away', lit.W.pass.owned() === true);
  const st0 = window.RTF_AUTH.state;
  window.RTF_AUTH.state = () => ({ signedIn: false });
  ok('lit: signed out, a remembered pass opens nothing', lit.W.pass.paidOpen() === false);
  window.RTF_AUTH.state = st0;
} finally {
  rmSync(dark.dir, { recursive: true, force: true });
  rmSync(lit.dir, { recursive: true, force: true });
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
