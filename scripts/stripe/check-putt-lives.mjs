/* Putt Putt lives for sale, shipped dark: nine lives back for $4.99.
 *
 *   node scripts/stripe/check-putt-lives.mjs
 *
 * No network and no Stripe. Every request the checkout and the webhook make is
 * answered here, and the one that would open a real checkout is answered with a
 * url that points nowhere: the FORM it was sent is what is asserted.
 *
 * What it holds:
 *   1. the page's switch, lives and price are the server's
 *   2. off, the checkout sells nothing; on (a scratch copy), it sells correctly,
 *      and only to a signed in player missing at least the lives it sells
 *   3. the webhook files the catalog's lives, keyed on the session, and only paid
 *   4. the setup script mints the price the catalog sells at
 *   5. the page offers the button only when every life it sells would land
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
const read = (p) => readFileSync(join(root, p), 'utf8');
const flagOf = (src, name) => { const m = new RegExp('(?:export const|var) ' + name + ' = (true|false);').exec(src); return m ? m[1] === 'true' : null; };

/* ─── 1. the page agrees with the server ─────────────────────────────────── */
console.log('1. the page\'s switch, lives and price are the server\'s');
const bundlesSrc = read('functions/api/stripe/_bundles.js');
const puttSrc = read('golf/putt/putt.js');
const sOn = flagOf(bundlesSrc, 'PUTT_LIVES_ENABLED'), pOn = flagOf(puttSrc, 'PUTT_LIVES_ENABLED');
ok('the server has a switch', sOn !== null);
ok('the page agrees about it', pOn === sOn, pOn + ' against ' + sOn);
const B = await import(join(root, 'functions/api/stripe/_bundles.js') + '?' + Math.random());
const pm = /var LIVES_BUY = \{ lives:(\d+), cents:(\d+) \};/.exec(puttSrc);
ok('the page names its lives and price', !!pm);
ok('the same number of lives', pm && +pm[1] === B.PUTT_LIVES.lives, pm && pm[1] + ' against ' + B.PUTT_LIVES.lives);
ok('the same price', pm && +pm[2] === B.PUTT_LIVES.cents, pm && pm[2] + ' against ' + B.PUTT_LIVES.cents);
ok('nine lives for $4.99, the owner\'s call', B.PUTT_LIVES.lives === 9 && B.PUTT_LIVES.cents === 499);

/* ─── 2. the checkout ────────────────────────────────────────────────────── */
console.log('2. the checkout sells nothing off, and the right thing on');
async function loadStripe(on) {
  const dir = mkdtempSync(join(tmpdir(), 'puttlives-'));
  cpSync(join(root, 'functions/api/stripe'), dir, { recursive: true });
  const f = join(dir, '_bundles.js');
  writeFileSync(f, readFileSync(f, 'utf8').replace(/export const PUTT_LIVES_ENABLED = (true|false);/, 'export const PUTT_LIVES_ENABLED = ' + on + ';'));
  const co = await import(join(dir, 'checkout-bundle.js') + '?' + Math.random());
  const wh = await import(join(dir, 'webhook.js') + '?' + Math.random());
  return { co, wh, dir };
}
const env = {
  STRIPE_SECRET_KEY: 'sk_test_check', SUPABASE_URL: 'http://supabase.check', SUPABASE_SERVICE_ROLE: 'svc',
  SITE_URL: 'https://runthe.gg', STRIPE_PRICE_PUTT_LIVES: 'price_lives',
};
const later = (h) => new Date(Date.now() + h * 3600e3).toISOString();
let lives = null, livesFail = false, signedIn = true, sessions = [], posts = [], escaped = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  const J = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (u.host === 'supabase.check') {
    if (u.pathname === '/auth/v1/user') return signedIn ? J(200, { id: 'u-1', email: 'a@b.c' }) : J(401, {});
    if (u.pathname === '/rest/v1/putt_lives') return livesFail ? J(500, {}) : J(200, lives ? [{ back_at: lives }] : []);
    if (u.pathname === '/rest/v1/premium_subscriptions' || u.pathname === '/rest/v1/subscriptions') return J(200, []);
    if (init.method === 'POST') { posts.push({ path: u.pathname, body: JSON.parse(String(init.body || 'null')) }); return J(200, true); }
    return J(200, []);
  }
  if (u.host === 'api.stripe.com' && u.pathname === '/v1/checkout/sessions' && init.method === 'POST') {
    sessions.push(new URLSearchParams(String(init.body)));
    return J(200, { url: 'https://checkout.invalid/' + sessions.length, id: 'cs_check' });
  }
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
const out = Array.from({ length: 9 }, (_, i) => later(i + 1));

const off = await loadStripe(false), on = await loadStripe(true);
try {
  lives = out;
  let r = await press(off.co, { putt_lives: true, return_path: '/golf/' });
  ok('off: refused, not_on_sale', r.status === 403 && r.body.error === 'not_on_sale', r.status + ' ' + JSON.stringify(r.body));
  ok('off: nothing reached Stripe', sessions.length === 0);

  r = await press(on.co, { putt_lives: true, return_path: '/golf/' });
  const f = sessions[sessions.length - 1];
  ok('on: out of lives opens a checkout', r.status === 200 && /checkout\.invalid/.test(r.body.url || ''), r.status + ' ' + JSON.stringify(r.body));
  ok('on: one payment, not a subscription', f && f.get('mode') === 'payment');
  ok('on: at the lives\' own price', f && f.get('line_items[0][price]') === 'price_lives');
  ok('on: the lives ride on the session for the webhook', f && f.get('metadata[putt_lives]') === '9');
  ok('on: it carries the account', f && f.get('client_reference_id') === 'u-1');
  ok('on: no promotion codes', f && !f.has('allow_promotion_codes'));
  ok('on: back to Putt Putt, paid', f && f.get('success_url') === 'https://runthe.gg/golf/?putt=lives_paid', f && f.get('success_url'));
  ok('on: back to Putt Putt, cancelled', f && f.get('cancel_url') === 'https://runthe.gg/golf/?putt=lives_cancelled');
  ok('on: never the edge function\'s ?purchase= return', f && !/purchase=/.test(f.get('success_url') + f.get('cancel_url')));
  r = await press(on.co, { putt_lives: true, return_path: 'https://evil.example/' });
  ok('on: a return path off the golf page is ignored', sessions[sessions.length - 1].get('success_url').indexOf('https://runthe.gg/golf/') === 0);

  const n0 = sessions.length;
  lives = out.slice(1);
  r = await press(on.co, { putt_lives: true });
  ok('on: a player with a life left is refused, lives_left', r.status === 409 && r.body.error === 'lives_left', r.status + ' ' + JSON.stringify(r.body));
  lives = out.slice(0, 8).concat([new Date(Date.now() - 60e3).toISOString()]);
  r = await press(on.co, { putt_lives: true });
  ok('on: a life whose clock has run out is a life held', r.status === 409);
  lives = null;
  r = await press(on.co, { putt_lives: true });
  ok('on: an account the server has no lives for has lost none', r.status === 409);
  lives = Array.from({ length: 12 }, (_, i) => later(i + 1));
  r = await press(on.co, { putt_lives: true });
  ok('on: a Tour Pass holder missing twelve may buy nine', r.status === 200);
  lives = out; livesFail = true;
  const n1 = sessions.length;
  r = await press(on.co, { putt_lives: true });
  ok('on: a lives read that fails sells nothing (503)', r.status === 503 && sessions.length === n1, String(r.status));
  livesFail = false; signedIn = false;
  r = await press(on.co, { putt_lives: true });
  ok('on: a guest is refused (401)', r.status === 401);
  signedIn = true;
  r = await press(on.co, { putt_lives: true }, Object.assign({}, env, { STRIPE_PRICE_PUTT_LIVES: '' }));
  ok('on: no price set sells nothing (503)', r.status === 503);
  ok('on: none of the refusals reached Stripe', sessions.length === n0 + 1, (sessions.length - n0) + ' sessions');

  /* ─── 3. the webhook ─────────────────────────────────────────────────── */
  console.log('3. the webhook files what the catalog says, not what the session says');
  posts = [];
  await on.wh.handleEvent(env, 'checkout.session.completed', { id: 'cs_live_lives1', mode: 'payment', payment_status: 'paid', client_reference_id: 'u-1', metadata: { supabase_user_id: 'u-1', putt_lives: '99' } });
  const buy = posts.find((p) => p.path === '/rest/v1/rpc/putt_lives_buy');
  ok('a paid session is filed through putt_lives_buy', !!buy);
  ok('the lives are the catalog\'s, not the session\'s', buy && buy.body.p_lives === 9, JSON.stringify(buy && buy.body));
  ok('it is keyed on the session and the account', buy && buy.body.p_session === 'cs_live_lives1' && buy.body.p_user === 'u-1');
  ok('it is never a premium_unlocks row', !posts.some((p) => p.path === '/rest/v1/premium_unlocks'));
  posts = [];
  await on.wh.handleEvent(env, 'checkout.session.completed', { id: 'cs_live_lives2', mode: 'payment', payment_status: 'unpaid', client_reference_id: 'u-1', metadata: { putt_lives: '9' } });
  ok('an unpaid session files nothing', posts.length === 0);
  await on.wh.handleEvent(env, 'checkout.session.async_payment_succeeded', { id: 'cs_live_lives2', mode: 'payment', payment_status: 'paid', client_reference_id: 'u-1', metadata: { putt_lives: '9' } });
  ok('and is filed when the delayed payment lands', posts.some((p) => p.path === '/rest/v1/rpc/putt_lives_buy'));
  posts = [];
  await off.wh.handleEvent(env, 'checkout.session.completed', { id: 'cs_live_lives3', mode: 'payment', payment_status: 'paid', client_reference_id: 'u-1', metadata: { putt_lives: '9' } });
  ok('a session paid before the switch went off is still delivered', posts.some((p) => p.path === '/rest/v1/rpc/putt_lives_buy'));
} finally {
  rmSync(off.dir, { recursive: true, force: true });
  rmSync(on.dir, { recursive: true, force: true });
}
ok('nothing escaped to the network', escaped.length === 0, escaped.join(' '));

/* ─── 4. the setup script ────────────────────────────────────────────────── */
console.log('4. the setup script mints the price the catalog sells at');
const setup = read('scripts/stripe/setup-premium-bundles.mjs');
ok('it mints the lives from the catalog', /envVar: PUTT_LIVES\.envPrice/.test(setup) && /amountCents: PUTT_LIVES\.cents/.test(setup));
ok('the webhook\'s migration is in the repo', /create or replace function public\.putt_lives_buy\(p_session text, p_user uuid, p_lives int\)/.test(read('supabase/149_putt_lives_buy.sql')));

/* ─── 5. the button ──────────────────────────────────────────────────────── */
console.log('5. the out of lives sheet offers the lives only when all of them would land');
const canSrc = /function canBuyLives\(st\)\{[^\n]*\}/.exec(puttSrc);
ok('the page has the rule', !!canSrc);
if (canSrc) {
  const make = (enabled, host, max) => new Function('PUTT_LIVES_ENABLED', 'LIVES_BUY', 'hostOf', 'livesMax', canSrc[0] + '; return canBuyLives;')(
    enabled, { lives: 9, cents: 499 }, () => host, () => max);
  const h = { buyLives() {} };
  ok('dark, never', !make(false, h, 9)({ lives: 0 }));
  ok('out of nine, offered', make(true, h, 9)({ lives: 0 }));
  ok('one left of nine, not offered', !make(true, h, 9)({ lives: 1 }));
  ok('nine left of a pass\'s eighteen, offered', make(true, h, 18)({ lives: 9 }));
  ok('ten left of eighteen, not offered', !make(true, h, 18)({ lives: 10 }));
  ok('a host with no checkout, never', !make(true, {}, 9)({ lives: 0 }));
}
const copy = />Get ' \+ LIVES_BUY\.lives \+ ' lives back · \$' \+ \(LIVES_BUY\.cents \/ 100\)\.toFixed\(2\)/.test(puttSrc);
ok('the button\'s lives and price come from LIVES_BUY', copy);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
