/* Packs, shards and the exchange.
 *
 *   node hoops/check-packs.mjs            the rules, then the shop on a phone
 *   node hoops/check-packs.mjs --quick    the rules only
 *
 * The rules are hoops/packs.js, the door is RTF_WARD.shop, the screen is
 * hoops/shop-ui.js. What it holds:
 *   1. the packs are Run The Tour's: prices, odds that add to one, pity, the
 *      odds printed on every pack
 *   2. a pack rolls its own odds (measured over many fresh rolls)
 *   3. pity: so many opens without an epic or better (or a legendary) and the
 *      next is one, shared across the packs, read off the log
 *   4. a duplicate gives a shard of its rarity, and coins back only when the
 *      pack was bought; a free pack never mints coins
 *   5. five for the price of four is one charge and five items
 *   6. two devices: the same open is one charge and one item, the merge is
 *      the same in either order and twice, and a legendary choice survives it
 *   7. the exchange: ten shards for one rarity up (one he does not own first),
 *      ten legendaries for coins, a Hall of Fame Pack and a pick of three
 *   8. a free pack opens once, keyed, on every device
 *   9. a drop's pieces are only in a pack while the drop is live, and the
 *      seasonal pack only then
 *  10. the door: a guest opens nothing; EVERY PIECE IS PACK ONLY, so no
 *      piece is bought outright by anybody, and the odds the closet prints
 *      (chance, best) are the odds an open actually rolls
 *  11. the welcome Streetball Pack is granted once by settle
 *  12. the shop on a phone: packs with odds, a free pack opened, the reveal
 *      wearing the piece, the welcome panel, the closet's pack panel in
 *      place of a Buy (its button opens the packs), nothing wide
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUICK = process.argv.includes('--quick');
globalThis.localStorage = { _m: {}, getItem(k){ return this._m[k] == null ? null : this._m[k]; }, setItem(k, v){ this._m[k] = String(v); }, removeItem(k){ delete this._m[k]; } };
const CAT = require('./catalog.js'), X = require('./economy.js'), P = require('./packs.js'), W = require('./wardrobe.js');

let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL ' + msg); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/* a seeded rng, so a failure can be read twice */
function rng(seed){ let s = Math.imul(seed >>> 0 || 1, 2654435761) >>> 0 || 1; for (let i = 0; i < 4; i++) { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; } return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const rich = (n) => { const w = X.fresh(); X.award(w, 'seed', n || 10000000, 'x', { t: 1 }); return w; };
const T0 = Date.parse('2026-09-01T12:00:00Z');   /* no drop live */

/* 1 */
{
  ok(same(X.PACKS.street.price, 8000) && X.PACKS.league.price === 22000 && X.PACKS.hof.price === 45000 && X.PACKS.season.price === 30000, '1 the packs cost what Run The Tour\'s do');
  for (const id of P.IDS) {
    const p = P.packOf(id), s = p.odds.reduce((a, b) => a + b, 0);
    ok(Math.abs(s - 1) < 1e-9, '1 ' + id + "'s odds add to one (" + s + ')');
    ok(p.pity[0] < p.pity[1], '1 ' + id + ' guarantees an epic sooner than a legendary');
    ok(/% common .*% rare .*% epic .*% legendary/.test(P.oddsText(id)), '1 ' + id + "'s odds are printed (" + P.oddsText(id) + ')');
  }
  ok(X.BUNDLE_N === 5 && X.BUNDLE_PAY === 4, '1 five for the price of four');
  ok(X.EXCHANGE_COST === 10 && X.LEG_EXCHANGE_COINS === 25000, '1 ten shards an exchange, 25,000 coins for legendaries');
}

/* 2 */
for (const id of ['street', 'league', 'hof']) {
  const st = W.clean({}), r = rng(7), n = 20000, got = { common: 0, rare: 0, epic: 0, legendary: 0 };
  for (let i = 0; i < n; i++) got[P.rollRarity(id, st, r)]++;
  const p = P.packOf(id).odds;
  P.RANK.forEach((k, i) => ok(Math.abs(got[k] / n - p[i]) < 0.015, '2 ' + id + ' rolls ' + k + ' at its odds (' + (got[k] / n).toFixed(3) + ' against ' + p[i] + ')'));
}

/* 3 */
{
  /* a log of commons to the edge of pity, on another pack: pity is shared */
  const st = W.clean({});
  for (let i = 0; i < X.PACKS.street.pity[0] - 1; i++) st.po['f' + i] = [T0 + i, 'hof', 'common', 'tee_black', 0, 1, ''];
  ok(P.pity(st).sinceEpic === X.PACKS.street.pity[0] - 1, '3 pity is read off the log');
  const all = Array.from({ length: 200 }, (_, i) => P.rollRarity('street', st, rng(i + 1)));
  ok(all.every((r) => r === 'epic' || r === 'legendary'), '3 the open after ' + (X.PACKS.street.pity[0] - 1) + ' without an epic is epic or better, whichever pack they came from');
  const st2 = W.clean({});
  for (let i = 0; i < X.PACKS.street.pity[1] - 1; i++) st2.po['f' + i] = [T0 + i, 'street', i % 9 === 8 ? 'epic' : 'rare', 'tee_black', 0, 1, ''];
  ok(Array.from({ length: 100 }, (_, i) => P.rollRarity('street', st2, rng(i + 3))).every((r) => r === 'legendary'), '3 the open after ' + (X.PACKS.street.pity[1] - 1) + ' without a legendary is legendary');
  st2.po.z = [T0 + 999, 'street', 'legendary', 'tee_black', 0, 1, ''];
  ok(P.pity(st2).sinceLeg === 0 && P.pity(st2).sinceEpic === 0, '3 a legendary resets both');
  /* pity over a long run: no stretch longer than the floor */
  const st3 = W.clean({}), w3 = rich(), r3 = rng(11);
  let gap = 0, worst = 0;
  for (let i = 0; i < 400; i++) { const o = P.open(st3, w3, 'street', { rng: r3, t: T0 + i, id: 'q' + i }); if (o.rarity === 'epic' || o.rarity === 'legendary') gap = 0; else worst = Math.max(worst, ++gap); }
  ok(worst < X.PACKS.street.pity[0], '3 four hundred Streetball Packs never go ' + X.PACKS.street.pity[0] + ' without an epic or better (longest ' + worst + ')');
}

/* 4 */
{
  const st = W.clean({}), w = rich(), it = CAT.ITEMS.find((i) => CAT.sold(i) && i.rarity === 'common' && !i.drop);
  /* every common owned but one, so a common is a duplicate */
  CAT.ITEMS.filter((i) => CAT.sold(i)).forEach((i) => { st.own[i.id] = 1; });
  const before = X.balance(w);
  const r = P.open(st, w, 'street', { rng: () => 0.01, t: T0, id: 'd1' });
  ok(r.dup && r.rarity === 'common', '4 a pull he has is a duplicate');
  ok(P.shards(st).common === 1, '4 a duplicate gives a shard of its rarity');
  ok(X.balance(w) === before - 8000 + X.DUPE_REFUND.common && r.refund === X.DUPE_REFUND.common, '4 a bought duplicate gives coins back (' + r.refund + ')');
  P.grantCredit(st, 'gift', 'street', T0);
  const b2 = X.balance(w), r2 = P.open(st, w, 'street', { rng: () => 0.01, t: T0 + 1, id: 'd2', credit: 'gift' });
  ok(r2.dup && r2.refund === 0 && X.balance(w) === b2 && P.shards(st).common === 2, '4 a free duplicate gives the shard and no coins');
}

/* 5 */
{
  const st = W.clean({}), w = rich(), b = X.balance(w);
  const r = P.openBundle(st, w, 'league', { rng: rng(5), t: T0, id: 'bb' });
  ok(r.results.length === 5 && Object.keys(st.po).length === 5, '5 a bundle opens five');
  const refunds = r.results.reduce((a, x) => a + x.refund, 0);
  ok(X.balance(w) === b - 4 * 22000 + refunds && Object.keys(w.s).filter((k) => /^pkb:/.test(k)).length === 1, '5 and charges four, once');
  ok(P.openBundle(st, w, 'league', { id: 'bb' }).err === 'already', '5 the same bundle is not opened twice');
}

/* 6 */
{
  const a = W.clean({}), wa = rich(), r = P.open(a, wa, 'hof', { rng: rng(2), t: T0, id: 'same' });
  const b = W.clean(JSON.parse(JSON.stringify(a))), wb = JSON.parse(JSON.stringify(wa));
  P.open(a, wa, 'street', { rng: rng(3), t: T0 + 5, id: 'onA' });
  P.open(b, wb, 'league', { rng: rng(4), t: T0 + 6, id: 'onB' });
  const m1 = W.merge(a, b), m2 = W.merge(b, a);
  ok(same(m1, m2), '6 the merge is the same in either order');
  ok(same(W.merge(m1, m1), m1), '6 and the same twice');
  ok(Object.keys(m1.po).length === 3 && m1.own[r.item.id], '6 nothing either device opened is lost, and the shared open is one');
  const mw = X.merge(wa, wb);
  ok(Object.keys(mw.s).filter((k) => k === 'pk:same').length === 1 && X.balance(mw) === 10000000 - 45000 - 8000 - 22000 + (r.refund || 0) + (mw.e['dr:onA'] ? mw.e['dr:onA'][0] : 0) + (mw.e['dr:onB'] ? mw.e['dr:onB'][0] : 0), '6 the shared open is charged once after the merge');
  ok(W.progress(m1) >= W.progress(a) && W.progress(m1) >= W.progress(b), '6 the record\'s progress only grows');
  /* a legendary exchange chosen on one device survives a merge with the other */
  const c = W.clean({}); for (let i = 0; i < 10; i++) P.grantShards(c, 's' + i, 'legendary', 1, T0);
  const ex = P.exchange(c, rich(), 'legendary', { rng: rng(9), t: T0, id: 'L1' });
  const d = W.clean(JSON.parse(JSON.stringify(c)));
  P.choose(c, 'L1', ex.offer[1].id);
  ok(W.merge(d, c).sx.L1[3] === ex.offer[1].id && W.merge(c, d).sx.L1[3] === ex.offer[1].id, '6 a legendary chosen on one device stands after the merge');
}

/* 7 */
{
  const st = W.clean({}), w = rich();
  ok(P.exchange(st, w, 'common').err === 'shards', '7 nine shards or fewer is no exchange');
  for (let i = 0; i < 10; i++) P.grantShards(st, 'c' + i, 'common', 1, T0);
  /* own every rare but one: the exchange finds the one */
  const rares = CAT.ITEMS.filter((i) => CAT.sold(i) && i.rarity === 'rare' && !i.drop);
  rares.slice(1).forEach((i) => { st.own[i.id] = 1; });
  const finds = Array.from({ length: 12 }, (_, i) => { const c = W.clean(JSON.parse(JSON.stringify(st))); const x = P.exchange(c, rich(), 'common', { rng: rng(100 + i), t: T0, id: 'y' }); return x.item && x.item.id; });
  ok(finds.every((f) => f === rares[0].id), '7 the exchange finds the one rare he lacks, every time (' + finds.filter((f) => f === rares[0].id).length + ' of 12)');
  const r = P.exchange(st, w, 'common', { rng: rng(1), t: T0, id: 'x1' });
  ok(r.item && r.item.rarity === 'rare' && !r.dup && r.item.id === rares[0].id, '7 ten commons spin for a rare, the one he does not own');
  ok(P.shards(st).common === 0 && st.own[rares[0].id], '7 the shards are spent and the rare is his');
  for (let i = 0; i < 10; i++) P.grantShards(st, 'c2' + i, 'common', 1, T0);
  const r2 = P.exchange(st, w, 'common', { rng: rng(2), t: T0, id: 'x2' });
  ok(r2.dup && P.shards(st).rare === 1, '7 a won rare he has gives a rare shard back');
  for (let i = 0; i < 10; i++) P.grantShards(st, 'l' + i, 'legendary', 1, T0);
  const b = X.balance(w), L = P.exchange(st, w, 'legendary', { rng: rng(4), t: T0, id: 'L' });
  ok(L.offer.length === 3 && new Set(L.offer.map((i) => i.id)).size === 3 && L.offer.every((i) => i.rarity === 'legendary'), '7 ten legendaries offer three different legendaries');
  ok(X.balance(w) === b + 25000 && P.credits(st, 'hof').length === 1, '7 and pay 25,000 coins and a Hall of Fame Pack');
  ok(P.pendingChoice(st) && P.pendingChoice(st).id === 'L', '7 the choice waits, across a reload');
  ok(P.choose(st, 'L', 'tee_black').err === 'choice', '7 only one of the three can be chosen');
  const ch = P.choose(st, 'L', L.offer[2].id);
  ok(ch.item && st.own[L.offer[2].id] && !P.pendingChoice(st), '7 the chosen legendary is his');
  ok(P.choose(st, 'L', L.offer[0].id).err === 'choice', '7 and it is chosen once');
}

/* 8 */
{
  const st = W.clean({}), w = rich();
  ok(P.grantCredit(st, 'welcome', 'street', T0) && !P.grantCredit(st, 'welcome', 'street', T0), '8 a free pack is given once for a key');
  ok(P.open(st, w, 'league', { credit: 'welcome' }).err === 'credit', '8 a Streetball credit does not open a League Pack');
  const r = P.open(st, w, 'street', { credit: 'welcome', rng: rng(1), t: T0, id: 'c:welcome' });
  ok(!r.err && !r.paid && X.balance(w) === 10000000, '8 a free pack costs nothing');
  ok(P.open(st, w, 'street', { credit: 'welcome', id: 'c:welcome2' }).err === 'credit', '8 and opens once');
  /* the door keys a free open on its credit, so two devices file one open */
  const both = W.merge(st, st);
  ok(Object.keys(both.po).filter((k) => /^c:welcome$/.test(k)).length === 1, '8 the free open is keyed on its credit');
}

/* 9 */
{
  const drop = CAT.DROPS[0], inDrop = Date.parse(drop.from + 'T16:00:00Z'), outDrop = Date.parse('2026-01-15T16:00:00Z');
  ok(!P.pool(X.dayOf(outDrop)).some((i) => i.drop), '9 outside a drop no drop piece is in a pack');
  ok(P.pool(X.dayOf(inDrop)).some((i) => i.drop === drop.id), '9 during the drop its pieces are');
  ok(!P.available('season', X.dayOf(outDrop)) && P.available('season', X.dayOf(inDrop)), '9 the seasonal pack is only on the shelf during a drop');
  const st = W.clean({}), w = rich(), r = rng(8); let hits = 0;
  for (let i = 0; i < 300; i++) { const o = P.open(st, w, 'season', { rng: r, t: inDrop, id: 's' + i }); if (o.item && o.item.drop === drop.id) hits++; }
  const share = P.pool(X.dayOf(inDrop)).filter((i) => i.drop === drop.id).length / P.pool(X.dayOf(inDrop)).length;
  ok(hits / 300 > share * 3, '9 the seasonal pack leans toward the drop (' + hits + ' of 300, against ' + Math.round(share * 300) + ' by chance)');
  ok(P.open(W.clean({}), rich(), 'season', { t: outDrop }).err === 'pack', '9 and refuses outside it');
}

/* 10 */
{
  W._reset(); localStorage._m = {};
  W.shop._auth(() => false);
  ok(W.shop.open('street').err === 'signin', '10 a guest opens nothing');
  W.shop._auth(() => true);
  ok(W.shop.open('street').err === 'coins', '10 an empty wallet opens nothing');
  W.wallet.award('give', 100000, 'x');
  /* PACK ONLY: every piece in the catalogue is refused outright, and nothing
     is spent or granted by trying */
  const refused = CAT.ITEMS.filter((it) => W.shop.buy(it.id).err !== 'packonly').map((it) => it.id);
  ok(!refused.length, '10 no piece is bought outright (' + refused.slice(0, 3).join(', ') + ')');
  ok(W.wallet.balance() === 100000 && !Object.keys(W.load().own).length, '10 and refusing spent nothing and gave nothing');
  /* the odds: one open of a pack lands on exactly one piece of the pool */
  for (const pk of P.IDS.filter((x) => P.available(x))) {
    const sum = P.pool().reduce((a, it) => a + P.chance(it.id, pk), 0);
    ok(Math.abs(sum - 1) < 1e-9, '10 the ' + pk + ' pack\'s odds over its pool add to 1 (' + sum + ')');
  }
  ok(CAT.ITEMS.filter((it) => !CAT.sold(it)).every((it) => P.best(it.id) === null && P.IDS.every((pk) => P.chance(it.id, pk) === 0)), '10 an exclusive or a starter is in no pack');
  const leg = P.pool().find((it) => it.rarity === 'legendary');
  ok(P.best(leg.id).pack === 'hof', '10 a legendary\'s best odds are the Hall of Fame Pack (' + P.best(leg.id).pack + ')');
  /* and those are the odds open() rolls: a fresh record each time, so pity
     never steps in, and a seeded stream so the count is the same every run */
  {
    let seed = 7; const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const tgt = P.pool().find((it) => it.rarity === 'common'), N = 40000, t = Date.now();
    let hit = 0;
    for (let i = 0; i < N; i++) { const ww = X.fresh(); X.award(ww, 'mc', 8000, 'x'); const r = P.open({ own: {} }, ww, 'street', { id: 'mc' + i, rng, t }); if (r.item && r.item.id === tgt.id) hit++; }
    const want = P.chance(tgt.id, 'street') * N, sd = Math.sqrt(want);
    ok(Math.abs(hit - want) < 4 * sd, '10 one piece turns up as often as chance() says (' + hit + ' against ' + Math.round(want) + ')');
  }
  const o = W.shop.open('street');
  ok(!o.err && W.wallet.balance() === 100000 - 8000 + (o.refund || 0) && Object.keys(W.load().po).length === 1, '10 the door opens a pack and saves both records');
  W._reset(); localStorage._m = {};
}

/* 11 */
{
  const E = require('./earn.js');
  W._reset(); localStorage._m = {};
  E._use({ econ: X, wallet: W.wallet, badges: { earned: () => [] }, signedIn: () => true, notify: () => {}, ward: W, packs: P });
  E.settle({});
  ok(P.credits(W.load(), 'street').some((c) => c.key === 'welcome'), '11 settle gives the welcome Streetball Pack');
  E._use({ econ: X, wallet: W.wallet, badges: { earned: () => [] }, signedIn: () => true, notify: () => {}, ward: W, packs: P });
  E.settle({});
  ok(P.credits(W.load()).length === 1, '11 and only once');
  W._reset(); localStorage._m = {};
}

/* 12 */
async function browser(){
  const pw = (() => { try { return require('playwright'); } catch (e) { return createRequire('/opt/node22/lib/node_modules/')('playwright'); } })();
  const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.woff2': 'font/woff2' };
  const out = [];
  async function serve(route){
    const u = new URL(route.request().url());
    if (/stripe|checkout/.test(u.pathname)) { out.push(u.href); return route.abort(); }
    if (u.hostname !== 'local.test') return route.abort();
    if (u.pathname.startsWith('/sb/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    let rel = decodeURIComponent(u.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const f = path.join(ROOT, rel);
    if (!fs.existsSync(f)) return route.abort();
    await route.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  }
  const b = await pw.chromium.launch(fs.existsSync(CHROME) ? { executablePath: CHROME } : {});
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage(), boom = [];
  page.on('pageerror', (e) => boom.push(String(e).slice(0, 200)));
  await page.addInitScript(() => { try { localStorage.setItem('rtf.guide.v1', '1'); localStorage.setItem('rtf.scenes.v1', 'off'); } catch (e) {} window.RTF_BOARD_URL = 'http://local.test/sb'; });
  await page.route('**/*', serve);
  await page.goto('http://local.test/hoops/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b-career:not([disabled])', { state: 'attached', timeout: 30000 });
  ok(await page.evaluate(() => !!(window.RTF_PACKS && window.RTF_SHOP && window.RTF_WARD.shop)), '12 the shop\'s modules load on the page');
  await page.locator('#ch-title').click();
  await page.waitForSelector('#cr-go', { timeout: 10000 });
  await page.click('[data-bstep="start"]').catch(() => {});
  await page.click('#cr-go');
  await page.waitForSelector('#cr-lookbtn', { timeout: 20000 });
  await page.click('#cr-lookbtn');
  await page.waitForSelector('[data-ltab="shop"]', { timeout: 10000 });
  await page.click('[data-ltab="shop"]');
  await page.waitForSelector('#cr-closet .sh-pack');
  const g = await page.evaluate(() => ({ packs: document.querySelectorAll('#cr-closet .sh-pack').length, odds: [...document.querySelectorAll('#cr-closet .sh-odds')].every((p) => /% legendary/.test(p.textContent)), btn: document.querySelector('#cr-closet .sh-open').textContent }));
  ok(g.packs === 3 && g.odds, '12 three packs on the shelf outside a drop, each with its odds (' + g.packs + ')');
  ok(/Sign in/.test(g.btn), '12 a guest is asked to sign in (' + g.btn + ')');
  /* signed in, with the welcome settled */
  await page.evaluate(() => { const st = RTF_AUTH.state; RTF_AUTH.state = () => Object.assign({}, st(), { signedIn: true }); RTF_EARN.settle({}); RTF_WALLET.award('give', 60000, 'x'); });
  await page.click('[data-ltab="shop"]');
  await page.waitForSelector('#cr-closet .sh-welcome');
  ok(await page.evaluate(() => /already counted|from here on/.test(document.querySelector('#cr-closet .sh-welcome').textContent)), '12 the welcome says the badges already held were counted');
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT.replace('.png', '-shop.png'), fullPage: true });
  await page.click('#cr-closet [data-free="welcome"]');
  await page.waitForSelector('.sh-ov .sh-reveal .sh-card');
  const rv = await page.evaluate(() => ({ n: document.querySelectorAll('.sh-ov .sh-reveal .sh-card').length, fig: !!document.querySelector('.sh-ov .sh-reveal .sh-cfig img, .sh-ov .sh-reveal .sh-cfig canvas'), credits: RTF_WARD.shop.credits().length, look: document.querySelector('.sh-ov .sh-cl').textContent, coins: RTF_WALLET.balance() }));
  ok(rv.n === 1 && rv.fig, '12 the free pack opens to one piece, worn by his own player');
  ok(/Off court|On court|Either look/.test(rv.look), '12 the reveal says which look it is for (' + rv.look + ')');
  ok(rv.credits === 0 && rv.coins >= 60000, '12 the free pack is used and cost nothing');
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT.replace('.png', '-reveal.png') });
  await page.click('.sh-ov .sh-done');
  ok(await page.evaluate(() => !document.querySelector('.sh-ov')), '12 Nice closes the show');
  await page.click('#cr-closet .sh-wok');
  ok(await page.evaluate(() => !document.querySelector('#cr-closet .sh-welcome')), '12 the welcome is said once');
  /* a coin pack asks twice */
  await page.click('#cr-closet [data-open="street"]');
  const armed = await page.evaluate(() => ({ t: document.querySelector('#cr-closet [data-open="street"]').textContent, opens: Object.keys(JSON.parse(localStorage.getItem('rtf.ward.v1')).po || {}).length }));
  ok(/again/.test(armed.t) && armed.opens === 1, '12 the first press on a coin pack only names the price');
  await page.click('#cr-closet [data-open="street"]');
  await page.waitForSelector('.sh-ov .sh-reveal .sh-card');
  ok(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('rtf.ward.v1')).po).length === 2), '12 the second press opens it');
  await page.click('.sh-ov .sh-done');
  const wide = await page.evaluate(() => [...document.querySelectorAll('#cr-sheet *')].filter((el) => { const r = el.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 && !el.closest('.k-tabs'); }).map((e) => e.className).slice(0, 3));
  ok(!wide.length, '12 nothing in the shop runs off a 375px phone (' + wide.join(', ') + ')');
  /* the closet has no Buy: a piece he does not own names its pack and the
     odds, and the panel's button opens the packs */
  await page.click('[data-ltab="street"]');
  await page.waitForSelector('#cr-closet .cl-tile');
  await page.click('#cr-closet [data-slot="top"]');
  const id = await page.evaluate(() => { const t = [...document.querySelectorAll('#cr-closet .cl-tile.lock')].find((x) => RTF_CATALOG.sold(RTF_CATALOG.item(x.dataset.id)) && RTF_PACKS.best(x.dataset.id)); return t && t.dataset.id; });
  await page.click('#cr-closet .cl-tile[data-id="' + id + '"]');
  const pk = await page.evaluate((id) => {
    const b = RTF_PACKS.best(id), pn = document.querySelector('#cr-closet .cl-pk');
    return { buy: !!document.querySelector('#cr-closet .cl-buy'), price: /\d+K|Buy/.test(document.querySelector('#cr-closet .cl-grid').innerText), text: pn ? pn.innerText : '',
      name: RTF_PACKS.packOf(b.pack).name, n: Math.round(1 / b.chance).toLocaleString('en-US') };
  }, id);
  ok(!pk.buy && !pk.price, '12 the closet offers no Buy and prints no price on a tile');
  ok(pk.text.toUpperCase().includes(pk.name.toUpperCase()) && pk.text.includes('1 in ' + pk.n), '12 it names the best pack and the odds of one open (' + pk.text.replace(/\s+/g, ' ') + ')');
  await page.click('#cr-closet .cl-topacks');
  await page.waitForSelector('#cr-closet .sh-pack');
  ok(await page.evaluate((id) => !RTF_WARD.owns(id) && document.querySelector('[data-ltab="shop"]').getAttribute('aria-selected') === 'true', id), '12 and its button opens the packs without granting anything');
  ok(!out.length, '12 no request reached a payment endpoint (' + out.join(', ') + ')');

  /* PAID COINS, SHIPPED DARK (Phase 6). Off, the shop draws no bucket and a
     short press is only a short press. On (flipped in the page), the shelf
     draws the five buckets, a short pack is covered out of bought coins and
     opened, and a bucket press goes to the site's one checkout, which is
     stopped here before it leaves. */
  await page.click('[data-ltab="shop"]');
  await page.waitForSelector('#cr-closet .sh-pack');
  ok(await page.evaluate(() => !document.querySelector('#cr-closet .sh-bucket') && RTF_WALLET.paid() === 0), '12b dark: no coin bucket on the shelf and no paid balance');
  await page.evaluate(() => {
    RTF_ECON.BUCKETS_ENABLED = true;
    window.__spent = [];
    RTF_AUTH.token = () => 'tok';
    RTF_AUTH.walletState = async () => ({ balance: 200000, buys: [] });
    RTF_AUTH.walletSpend = async (k, c) => { window.__spent.push([k, c]); return { ok: true, balance: 200000 - c }; };
    return RTF_WALLET.paidRefresh();
  });
  await page.click('[data-ltab="shop"]');
  await page.waitForSelector('#cr-closet .sh-bucket');
  const bk = await page.evaluate(() => ({ n: document.querySelectorAll('#cr-closet .sh-bucket').length, p: [...document.querySelectorAll('#cr-closet .sh-bprice')].map((e) => e.textContent).join(' '), bal: RTF_WALLET.balance(), led: RTF_ECON.balance(RTF_WALLET.load()) }));
  ok(bk.n === 5 && /\$1\.99/.test(bk.p) && /\$49\.99/.test(bk.p), '12b lit: the five buckets with their prices (' + bk.p + ')');
  ok(bk.bal === bk.led + 200000, '12b lit: the balance shown counts the bought coins');
  /* spend the ledger down below a Hall of Fame Pack, then open one */
  const opens0 = await page.evaluate(() => Object.keys(RTF_WARD.load().po || {}).length);
  const short = await page.evaluate(() => { const led = RTF_ECON.balance(RTF_WALLET.load()); const price = RTF_ECON.PACKS.hof.price; if (led >= price) RTF_WALLET.spend('drain', led - price + 1000, 'test'); return price - RTF_ECON.balance(RTF_WALLET.load()); });
  await page.click('#cr-closet [data-open="hof"]');
  await page.click('#cr-closet [data-open="hof"]');
  await page.waitForFunction(() => window.__spent.length > 0, null, { timeout: 5000 }).catch(() => {});
  const sp = await page.evaluate(() => window.__spent.slice());
  ok(sp.length === 1 && sp[0][1] === short, '12b lit: a short pack spends exactly the shortfall of bought coins (' + JSON.stringify(sp) + ' against ' + short + ')');
  ok(await page.evaluate((n) => Object.keys(RTF_WARD.load().po || {}).length === n + 1, opens0), '12b lit: and the pack opened, once');
  await page.evaluate(() => { const o = document.querySelector('.sh-ov'); if (o) o.remove(); });
  await page.click('[data-ltab="shop"]');
  await page.waitForSelector('#cr-closet .sh-bucket');
  await page.click('#cr-closet [data-bucket="floor-coins-3"]');
  await page.waitForTimeout(400);
  ok(out.some((u) => /checkout-bundle/.test(u)), '12b lit: a bucket press goes to the one checkout, stopped before it leaves (' + out.join(', ') + ')');
  out.length = 0;
  await page.evaluate(() => { RTF_ECON.BUCKETS_ENABLED = false; });
  ok(!boom.length, '12 nothing threw (' + boom.join(' | ') + ')');

  /* THE SHOW, with motion: the pack, the tear, a reel that stops on the
     item already won, and the reveal. A reel that lands on anything else
     is a picture lying about what was granted. */
  const mctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const mp = await mctx.newPage(), mboom = [];
  mp.on('pageerror', (e) => mboom.push(String(e).slice(0, 200)));
  await mp.addInitScript(() => { try { localStorage.setItem('rtf.guide.v1', '1'); localStorage.setItem('rtf.scenes.v1', 'off'); } catch (e) {} window.RTF_BOARD_URL = 'http://local.test/sb'; });
  await mp.route('**/*', serve);
  await mp.goto('http://local.test/hoops/', { waitUntil: 'domcontentloaded' });
  await mp.waitForSelector('#b-career:not([disabled])', { state: 'attached', timeout: 30000 });
  await mp.locator('#ch-title').click();
  await mp.waitForSelector('#cr-go', { timeout: 10000 });
  await mp.click('[data-bstep="start"]').catch(() => {});
  await mp.click('#cr-go');
  await mp.waitForSelector('#cr-lookbtn', { timeout: 20000 });
  await mp.click('#cr-lookbtn');
  await mp.evaluate(() => { const st = RTF_AUTH.state; RTF_AUTH.state = () => Object.assign({}, st(), { signedIn: true }); RTF_EARN.settle({}); RTF_WARD.shop.seenWelcome(); RTF_WALLET.award('give', 200000, 'x'); });
  await mp.click('[data-ltab="shop"]');
  await mp.waitForSelector('#cr-closet .sh-pack');
  const art = await mp.evaluate(() => ({ packs: [...document.querySelectorAll('#cr-closet .sh-pack img.sh-packimg')].filter((i) => /^data:image\/png/.test(i.src)).length, coin: !!document.querySelector('#cr-closet .sh-wallet img.sh-coinbig'), gems: document.querySelectorAll('#cr-closet .sh-gemc img').length }));
  ok(art.packs === 3 && art.coin && art.gems === 4, '13 every pack on the shelf is drawn as pixel art, with the coin and four shard gems (' + JSON.stringify(art) + ')');
  if (process.env.SHOT) await mp.screenshot({ path: process.env.SHOT.replace('.png', '-shelf.png'), fullPage: true });
  await mp.click('#cr-closet [data-open="league"]');
  await mp.click('#cr-closet [data-open="league"]');
  await mp.waitForSelector('.sh-ov .sh-hero');
  if (process.env.SHOT) await mp.screenshot({ path: process.env.SHOT.replace('.png', '-stage.png') });
  ok(await mp.evaluate(() => !document.querySelector('.sh-ov .sh-reveal')), '13 a pack opens on its stand, not on the answer');
  await mp.click('.sh-ov .sh-tear');
  await mp.waitForSelector('.sh-ov .sh-reel', { timeout: 5000 });
  await mp.waitForTimeout(2200);
  if (process.env.SHOT) await mp.screenshot({ path: process.env.SHOT.replace('.png', '-reel.png') });
  await mp.waitForSelector('.sh-ov .sh-cell.win', { timeout: 9000 });
  const landed = await mp.evaluate(() => {
    const box = document.querySelector('.sh-reel').getBoundingClientRect(), w = document.querySelector('.sh-cell.win'), r = w.getBoundingClientRect();
    const mid = box.left + box.width / 2;
    const po = JSON.parse(localStorage.getItem('rtf.ward.v1')).po, last = Object.values(po).sort((a, b) => b[0] - a[0])[0];
    return { win: w.getAttribute('data-win'), granted: last[3], under: r.left <= mid && r.right >= mid };
  });
  ok(landed.win === landed.granted, '13 the reel stops on the item that was granted (' + landed.win + ' / ' + landed.granted + ')');
  ok(landed.under, '13 and that cell is the one under the pointer');
  await mp.waitForSelector('.sh-ov .sh-reveal .sh-rcard', { timeout: 4000 });
  if (process.env.SHOT) await mp.screenshot({ path: process.env.SHOT.replace('.png', '-big.png') });
  ok(await mp.evaluate((g) => document.querySelector('.sh-rcard').getAttribute('data-id') === g, landed.granted), '13 the reveal is the same item');
  await mp.click('.sh-ov .sh-done');
  /* five at once flip over one by one, then sit as a summary */
  await mp.click('#cr-closet [data-open5="street"]');
  await mp.click('#cr-closet [data-open5="street"]');
  await mp.waitForSelector('.sh-ov .sh-tear');
  await mp.click('.sh-ov .sh-tear');
  await mp.waitForSelector('.sh-ov .sh-fl', { timeout: 5000 });
  ok(await mp.evaluate(() => document.querySelectorAll('.sh-ov .sh-fl').length === 5), '13 a bundle deals five cards face down');
  await mp.waitForSelector('.sh-ov .sh-reveal .sh-cards.many', { timeout: 9000 });
  if (process.env.SHOT) await mp.screenshot({ path: process.env.SHOT.replace('.png', '-five.png') });
  ok(await mp.evaluate(() => document.querySelectorAll('.sh-ov .sh-reveal .sh-card').length === 5), '13 and lands on all five');
  await mp.click('.sh-ov .sh-done');
  /* the closet draws every piece as its own pixel icon, framed in its rarity */
  for (const tab of ['street', 'court']) {
    await mp.click('[data-ltab="' + tab + '"]');
    await mp.waitForSelector('#cr-closet .cl-tile');
    const slots = await mp.evaluate(() => [...document.querySelectorAll('#cr-closet [data-slot]')].map((b) => b.getAttribute('data-slot')));
    let bad = [];
    for (const sl of slots) {
      await mp.click('#cr-closet [data-slot="' + sl + '"]');
      bad = bad.concat(await mp.evaluate(() => [...document.querySelectorAll('#cr-closet .cl-tile[data-id]:not([data-id=""])')].filter((t) => !t.querySelector('.cl-sw img.cl-ic[src^="data:image/png"]')).map((t) => t.dataset.id)));
    }
    ok(!bad.length && slots.length > 10, '13 every ' + tab + ' tile carries its pixel icon (' + bad.slice(0, 3).join(', ') + ')');
    if (process.env.SHOT) { await mp.click('#cr-closet [data-slot="top"], #cr-closet [data-slot="band"]'); await mp.screenshot({ path: process.env.SHOT.replace('.png', '-closet-' + tab + '.png') }); }
  }
  ok(!mboom.length, '13 nothing threw in the show (' + mboom.join(' | ') + ')');
  await mctx.close();
  ok(!out.length, '13 no request reached a payment endpoint during the show');
  await b.close();
}
if (!QUICK) await browser();

console.log((fails ? 'FAILED ' : 'ok ') + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
