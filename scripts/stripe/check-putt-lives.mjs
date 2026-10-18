/* Putt Putt lives for sale, shipped dark: nine lives back for $4.99, or three for $2.99.
 *
 *   node scripts/stripe/check-putt-lives.mjs
 *
 * No network and no Stripe. Every request the checkout and the webhook make is
 * answered here, and the one that would open a real checkout is answered with a
 * url that points nowhere: the FORM it was sent is what is asserted.
 *
 * What it holds:
 *   1. the page's switch, packs, lives and prices are the server's, in the same order
 *   2. off, the checkout sells nothing; on (a scratch copy), it sells each pack
 *      correctly, to a signed in player at any time, up to the cap on extra lives
 *   3. the webhook files the catalog's lives for the pack, keyed on the session,
 *      and only paid
 *   4. the setup script mints each price the catalog sells at
 *   5. the page offers a pack only when every life it sells would land, nine first
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
const blk = /var LIVES_BUY = \[([\s\S]*?)\];/.exec(puttSrc);
const page = blk ? [...blk[1].matchAll(/\{ pack:'(\w+)', lives:(\d+), cents:(\d+), tag:'[^']*' \}/g)].map((m) => ({ pack: m[1], lives: +m[2], cents: +m[3] })) : [];
const server = Object.entries(B.PUTT_LIVES).map(([pack, p]) => ({ pack, lives: p.lives, cents: p.cents }));
ok('the page names its packs', page.length > 0);
ok('the same packs, lives and prices, in the same order', JSON.stringify(page) === JSON.stringify(server), JSON.stringify(page) + ' against ' + JSON.stringify(server));
ok('nine lives for $4.99 and three for $2.99, the owner\'s calls, nine first',
  JSON.stringify(server) === JSON.stringify([{ pack: 'nine', lives: 9, cents: 499 }, { pack: 'three', lives: 3, cents: 299 }]));
ok('each pack has its own price variable', new Set(Object.values(B.PUTT_LIVES).map((p) => p.envPrice)).size === server.length);
ok('an unknown pack is no pack', B.puttLivesPack('ten') === null && B.puttLivesPack('__proto__') === null && B.puttLivesPack('constructor') === null);

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
  SITE_URL: 'https://runthe.gg', STRIPE_PRICE_PUTT_LIVES_9: 'price_lives9', STRIPE_PRICE_PUTT_LIVES_3: 'price_lives3',
};
const later = (h) => new Date(Date.now() + h * 3600e3).toISOString();
const sessionsByPI = {};
let lives = null, extra = 0, livesFail = false, signedIn = true, sessions = [], posts = [], escaped = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  const J = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (u.host === 'supabase.check') {
    if (u.pathname === '/auth/v1/user') return signedIn ? J(200, { id: 'u-1', email: 'a@b.c' }) : J(401, {});
    if (u.pathname === '/rest/v1/putt_lives') return livesFail ? J(500, {}) : J(200, lives ? [{ back_at: lives, extra }] : []);
    if (u.pathname === '/rest/v1/premium_subscriptions' || u.pathname === '/rest/v1/subscriptions') return J(200, []);
    if (init.method === 'POST') { posts.push({ path: u.pathname, body: JSON.parse(String(init.body || 'null')) }); return J(200, true); }
    return J(200, []);
  }
  if (u.host === 'api.stripe.com' && u.pathname === '/v1/checkout/sessions' && (init.method || 'GET') === 'GET') {
    const pi = u.searchParams.get('payment_intent');
    return J(200, { data: sessionsByPI[pi] ? [sessionsByPI[pi]] : [] });
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
const PRICE = { nine: 'price_lives9', three: 'price_lives3' }, LIVES = { nine: 9, three: 3 };

const off = await loadStripe(false), on = await loadStripe(true);
try {
  lives = out;
  let r = await press(off.co, { putt_lives: 'nine', return_path: '/golf/' });
  ok('off: refused, not_on_sale', r.status === 403 && r.body.error === 'not_on_sale', r.status + ' ' + JSON.stringify(r.body));
  r = await press(off.co, { putt_lives: 'three', return_path: '/golf/' });
  ok('off: the three-pack too', r.status === 403 && r.body.error === 'not_on_sale');
  ok('off: nothing reached Stripe', sessions.length === 0);

  for (const pack of ['nine', 'three']) {
    lives = out;
    r = await press(on.co, { putt_lives: pack, return_path: '/golf/' });
    const f = sessions[sessions.length - 1];
    ok('on, ' + pack + ': out of lives opens a checkout', r.status === 200 && /checkout\.invalid/.test(r.body.url || ''), r.status + ' ' + JSON.stringify(r.body));
    ok('on, ' + pack + ': one payment, not a subscription', f && f.get('mode') === 'payment');
    ok('on, ' + pack + ': at its own price', f && f.get('line_items[0][price]') === PRICE[pack], f && f.get('line_items[0][price]'));
    ok('on, ' + pack + ': the pack rides on the session for the webhook', f && f.get('metadata[putt_lives]') === pack);
    ok('on, ' + pack + ': it carries the account', f && f.get('client_reference_id') === 'u-1');
    ok('on, ' + pack + ': no promotion codes', f && !f.has('allow_promotion_codes'));
    ok('on, ' + pack + ': back to Putt Putt, paid, with the pack', f && f.get('success_url') === 'https://runthe.gg/golf/?putt=lives_paid&pack=' + pack, f && f.get('success_url'));
    ok('on, ' + pack + ': back to Putt Putt, cancelled', f && f.get('cancel_url') === 'https://runthe.gg/golf/?putt=lives_cancelled');
    ok('on, ' + pack + ': never the edge function\'s ?purchase= return', f && !/purchase=/.test(f.get('success_url') + f.get('cancel_url')));
  }
  r = await press(on.co, { putt_lives: 'nine', return_path: 'https://evil.example/' });
  ok('on: a return path off the golf page is ignored', sessions[sessions.length - 1].get('success_url').indexOf('https://runthe.gg/golf/') === 0);

  const n0 = sessions.length;
  for (const bad of [true, 9, 'ten', '__proto__', null]) {
    r = await press(on.co, { putt_lives: bad });
    ok('on: putt_lives ' + JSON.stringify(bad) + ' is no pack (400)', bad === null ? r.status !== 200 : (r.status === 400 && r.body.error === 'unknown_pack'), r.status + ' ' + JSON.stringify(r.body));
  }
  ok('on: and none of those reached Stripe', sessions.length === n0);

  // THE RULE (the owner, 2026-10-17): sold at any time, over the max too, up to the cap on extra lives
  const missing = (n) => Array.from({ length: n }, (_, i) => later(i + 1));
  const sold = async (pack, n, x0 = 0) => { lives = missing(n); extra = x0; const k = sessions.length; const x = await press(on.co, { putt_lives: pack }); extra = 0;
    return x.status === 200 && sessions.length === k + 1 ? true : (x.status === 409 && x.body.error === 'lives_full' ? false : x.status); };
  ok('on: nine, out of lives, sold', (await sold('nine', 9)) === true);
  ok('on: nine, missing one, sold (eight go over the max)', (await sold('nine', 1)) === true);
  ok('on: three, full, sold (all three go over)', (await sold('three', 0)) === true);
  ok('on: nine, full with 90 extra, sold (99 is the cap)', (await sold('nine', 0, 90)) === true);
  ok('on: nine, full with 91 extra, refused lives_full', (await sold('nine', 0, 91)) === false);
  ok('on: three, full with 97 extra, refused lives_full', (await sold('three', 0, 97)) === false);
  ok('on: nine, missing nine with 99 extra, sold (all nine come off clocks)', (await sold('nine', 9, 99)) === true);
  ok('on: the cap is the server\'s, 99', B.PUTT_LIVES_EXTRA_MAX === 99);

  const n2 = sessions.length;
  // two clocks running and one run out, 99 extra: three would put one over the cap. Counting the run out clock as
  // missing would wrongly make room for all three.
  lives = out.slice(0, 2).concat([new Date(Date.now() - 60e3).toISOString()]); extra = 99;
  r = await press(on.co, { putt_lives: 'three' });
  ok('on: a life whose clock has run out is a life held, so it makes no room', r.status === 409 && r.body.error === 'lives_full', r.status + ' ' + JSON.stringify(r.body));
  extra = 0;
  lives = null;
  r = await press(on.co, { putt_lives: 'three' });
  ok('on: an account the server has no row for may buy', r.status === 200);
  lives = out; livesFail = true;
  r = await press(on.co, { putt_lives: 'nine' });
  ok('on: a lives read that fails sells nothing (503), which is a database without 151 too', r.status === 503, String(r.status));
  livesFail = false; signedIn = false;
  r = await press(on.co, { putt_lives: 'three' });
  ok('on: a guest is refused (401)', r.status === 401);
  signedIn = true;
  r = await press(on.co, { putt_lives: 'three' }, Object.assign({}, env, { STRIPE_PRICE_PUTT_LIVES_3: '' }));
  ok('on: the three-pack with no price set sells nothing (503)', r.status === 503);
  r = await press(on.co, { putt_lives: 'nine' }, Object.assign({}, env, { STRIPE_PRICE_PUTT_LIVES_3: '' }));
  ok('on: and the nine-pack still sells on its own price', r.status === 200);
  r = await press(on.co, { putt_lives: 'nine' }, Object.assign({}, env, { STRIPE_PRICE_PUTT_LIVES_9: '' }));
  ok('on: the nine-pack with no price set sells nothing (503)', r.status === 503);
  ok('on: none of the refusals reached Stripe', sessions.length === n2 + 2, (sessions.length - n2) + ' sessions');

  /* ─── 3. the webhook ─────────────────────────────────────────────────── */
  console.log('3. the webhook files what the catalog says, not what the session says');
  for (const pack of ['nine', 'three']) {
    posts = [];
    await on.wh.handleEvent(env, 'checkout.session.completed', { id: 'cs_live_' + pack, mode: 'payment', payment_status: 'paid', client_reference_id: 'u-1', metadata: { supabase_user_id: 'u-1', putt_lives: pack } });
    const buy = posts.find((p) => p.path === '/rest/v1/rpc/putt_lives_buy');
    ok(pack + ': a paid session is filed through putt_lives_buy', !!buy);
    ok(pack + ': the lives are the catalog\'s', buy && buy.body.p_lives === LIVES[pack], JSON.stringify(buy && buy.body));
    ok(pack + ': keyed on the session and the account', buy && buy.body.p_session === 'cs_live_' + pack && buy.body.p_user === 'u-1');
    ok(pack + ': never a premium_unlocks row', !posts.some((p) => p.path === '/rest/v1/premium_unlocks'));
  }
  posts = [];
  let threw = null;
  try { await on.wh.handleEvent(env, 'checkout.session.completed', { id: 'cs_live_lives99', mode: 'payment', payment_status: 'paid', client_reference_id: 'u-1', metadata: { putt_lives: '99' } }); } catch (e) { threw = e; }
  ok('a paid session naming no pack is thrown, so Stripe retries', !!threw && posts.length === 0);
  posts = [];
  await on.wh.handleEvent(env, 'checkout.session.completed', { id: 'cs_live_lives2', mode: 'payment', payment_status: 'unpaid', client_reference_id: 'u-1', metadata: { putt_lives: 'three' } });
  ok('an unpaid session files nothing', posts.length === 0);
  await on.wh.handleEvent(env, 'checkout.session.async_payment_succeeded', { id: 'cs_live_lives2', mode: 'payment', payment_status: 'paid', client_reference_id: 'u-1', metadata: { putt_lives: 'three' } });
  const late = posts.find((p) => p.path === '/rest/v1/rpc/putt_lives_buy');
  ok('and is filed when the delayed payment lands, with three', late && late.body.p_lives === 3);
  posts = [];
  await off.wh.handleEvent(env, 'checkout.session.completed', { id: 'cs_live_lives3', mode: 'payment', payment_status: 'paid', client_reference_id: 'u-1', metadata: { putt_lives: 'nine' } });
  ok('a session paid before the switch went off is still delivered', posts.some((p) => p.path === '/rest/v1/rpc/putt_lives_buy'));
  /* ─── 3b. a refund or a chargeback takes the lives back (152) ─────────── */
  console.log('3b. a full refund or a chargeback takes a lives buy back; nothing else does');
  sessionsByPI.pi_lives = { id: 'cs_live_three', mode: 'payment', metadata: { putt_lives: 'three', supabase_user_id: 'u-1' } };
  sessionsByPI.pi_bundle = { id: 'cs_live_bundle', mode: 'payment', metadata: { bundle: 'perfect-season', supabase_user_id: 'u-1' } };
  const reclaims = () => posts.filter((p) => p.path === '/rest/v1/rpc/putt_lives_reclaim');
  posts = [];
  await on.wh.handleEvent(env, 'charge.refunded', { id: 'ch_1', object: 'charge', invoice: null, payment_intent: 'pi_lives', amount: 299, amount_refunded: 299, refunded: true });
  ok('a full refund of a lives buy is taken back, keyed on its session', reclaims().length === 1 && reclaims()[0].body.p_session === 'cs_live_three', JSON.stringify(posts));
  posts = [];
  await on.wh.handleEvent(env, 'charge.refunded', { id: 'ch_2', object: 'charge', invoice: null, payment_intent: 'pi_lives', amount: 299, amount_refunded: 100, refunded: false });
  ok('a partial refund takes nothing', reclaims().length === 0);
  posts = [];
  await on.wh.handleEvent(env, 'charge.dispute.created', { id: 'dp_1', object: 'dispute', charge: { id: 'ch_1', object: 'charge', invoice: null, payment_intent: 'pi_lives', amount: 299 } });
  ok('a chargeback takes it back too', reclaims().length === 1 && reclaims()[0].body.p_session === 'cs_live_three');
  posts = [];
  await on.wh.handleEvent(env, 'charge.refunded', { id: 'ch_3', object: 'charge', invoice: null, payment_intent: 'pi_bundle', amount: 1999, amount_refunded: 1999, refunded: true });
  ok('a refunded bundle is still left alone', reclaims().length === 0 && posts.length === 0, JSON.stringify(posts));
  posts = [];
  await off.wh.handleEvent(env, 'charge.refunded', { id: 'ch_4', object: 'charge', invoice: null, payment_intent: 'pi_lives', amount: 299, amount_refunded: 299, refunded: true });
  ok('a refund still takes lives back with the switch off', reclaims().length === 1);
  ok('the migration that does it grants the webhook', /grant execute on function public\.putt_lives_reclaim\(text\) to service_role/.test(read('supabase/152_putt_lives_refund.sql')));
} finally {
  rmSync(off.dir, { recursive: true, force: true });
  rmSync(on.dir, { recursive: true, force: true });
}
ok('nothing escaped to the network', escaped.length === 0, escaped.join(' '));

/* ─── 4. the setup script ────────────────────────────────────────────────── */
console.log('4. the setup script mints the price the catalog sells at');
const setup = read('scripts/stripe/setup-premium-bundles.mjs');
ok('it mints every pack from the catalog', /Object\.entries\(PUTT_LIVES\)\.map\(/.test(setup) && /envVar: p\.envPrice/.test(setup) && /amountCents: p\.cents/.test(setup) && /lookupKey: p\.lookupKey/.test(setup));
ok('each pack has its own lookup key', new Set(Object.values(B.PUTT_LIVES).map((p) => p.lookupKey)).size === server.length);
ok('the webhook\'s migration is in the repo', /create or replace function public\.putt_lives_buy\(p_session text, p_user uuid, p_lives int\)/.test(read('supabase/149_putt_lives_buy.sql')));

/* ─── 5. the buttons ─────────────────────────────────────────────────────── */
console.log('5. the page offers a pack at any time, up to the cap, on all three screens');
const canSrc = /function canBuyLives\(st, p\)\{[^\n]*\}/.exec(puttSrc);
ok('the page has the rule', !!canSrc);
if (canSrc) {
  const make = (enabled, host, max) => new Function('PUTT_LIVES_ENABLED', 'hostOf', 'livesMax', 'LIVES_EXTRA_MAX', canSrc[0] + '; return canBuyLives;')(
    enabled, () => host, () => max, 99);
  const h = { buyLives() {} }, P9 = { lives: 9 }, P3 = { lives: 3 };
  ok('dark, never', !make(false, h, 9)({ lives: 0 }, P9) && !make(false, h, 9)({ lives: 0 }, P3));
  ok('out of nine, both offered', make(true, h, 9)({ lives: 0 }, P9) && make(true, h, 9)({ lives: 0 }, P3));
  ok('full, both offered', make(true, h, 9)({ lives: 9 }, P9) && make(true, h, 9)({ lives: 9 }, P3));
  ok('a pass holder full, both offered', make(true, h, 18)({ lives: 18 }, P9) && make(true, h, 18)({ lives: 18 }, P3));
  ok('99 over the max: neither', !make(true, h, 9)({ lives: 108 }, P3));
  ok('91 over: three only', make(true, h, 9)({ lives: 100 }, P3) && !make(true, h, 9)({ lives: 100 }, P9));
  ok('a host with no checkout, never', !make(true, {}, 9)({ lives: 0 }, P3));
}
const copy = /function buyLabel\(p\)\{ return 'Get ' \+ p\.lives \+ ' lives · \$' \+ \(p\.cents \/ 100\)\.toFixed\(2\); \}/.test(puttSrc) && /'">' \+ buyLabel\(p\) \+ \(p\.tag \? '<small>'/.test(puttSrc);
ok('each button\'s lives and price come from LIVES_BUY', copy);
ok('the buttons are drawn in LIVES_BUY\'s order, which is nine first', /LIVES_BUY\.map\(function\(p\)\{ return canBuyLives\(st, p\)/.test(puttSrc) && page[0] && page[0].pack === 'nine');
ok('the page\'s cap is the server\'s', /^var LIVES_EXTRA_MAX = 99;$/m.test(puttSrc) && /check \(extra between 0 and 99\)/.test(read('supabase/151_putt_lives_extra.sql')));
ok('the buttons are on all three screens: out of lives, over par, the Lives sheet', (puttSrc.match(/buyRow\(st\)/g) || []).length >= 3 && /wireBuy\(over\)/.test(puttSrc) && /function livesSheet\(\)/.test(puttSrc));
ok('the hearts open the Lives sheet', /closest\('\.pp-hearts'\)[^\n]*livesSheet\(\)/.test(puttSrc));
ok('a bought life over the max is lost first and starts no clock', /if \(st\.lives > livesMax\(\)\)\{ st\.lives--; st\.lt = Date\.now\(\); psave\(st\); livesCall\('putt_lives_spend'\); return; \}/.test(puttSrc));
ok('a press sends the pack to the host', /S\.host\.buyLives\(pack\)/.test(puttSrc));
const hostSrc = read('golf/index.html');
ok('the host posts the pack it was handed', /buyLives:function\(pack\)\{ return puttBuyLives\(pack\); \}/.test(hostSrc) && /putt_lives:pack, return_path:'\/golf\/'/.test(hostSrc));
ok('the return waits for the pack it bought', /q\.get\('pack'\)/.test(hostSrc) && /bought\?bought\.lives:/.test(hostSrc));

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
