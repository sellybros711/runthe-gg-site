/* The idles, painted headless.
 *
 *   node hoops/check-idles.mjs
 *
 * An idle is keyframes on the rig (hoops/idles.js), worn in the `idle` slot
 * (hoops/catalog.js) and played by live() in baller.js. What it holds:
 *   1. the catalogue and idles.js name the same idles, and every idle row is
 *      one of the two looks' idle slot
 *   2. every loop fits the paint budget (MAX_FRAMES), its sequence only names
 *      frames that exist, and it CLOSES: the last step blends back to key 0
 *   3. every frame paints on three builds and the tallest man, no part
 *      touches the grid's edge, and the head, both hands and both shoes are
 *      drawn on every frame
 *   4. an idle MOVES: no two keys are the same picture
 *   5. one that holds the ball draws it, and one that does not, does not
 *   6. the flourish plays one loop in FLAIR_EVERY, and never otherwise
 *   7. the still (reduced motion, a still figure) is the signature frame
 *   8. a frame that is not a frame is no frame: frOf refuses it, and paint
 *      draws the standing figure exactly
 *   9. an idle he does not own is the look's default, the old figure, and
 *      resolve() never hands an idle to baller.js as wear
 *  10. an exclusive idle is earned and never sold; a sold one prices a step up
 *  11. on the page: idles.js loads, a live figure plays its idle (the canvas
 *      changes over time), and under reduced motion it is the still <img>
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const B = require('./baller.js'), CAT = require('./catalog.js'), I = require('./idles.js'), X = require('./economy.js');
globalThis.localStorage = { _m: {}, getItem(k){ return this._m[k] == null ? null : this._m[k]; }, setItem(k, v){ this._m[k] = String(v); }, removeItem(k){ delete this._m[k]; } };
const W = require('./wardrobe.js');

let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL ' + msg); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const LOOK = { skin: 4, hair: 'fade', hc: 0, beard: 'stubble', build: 'standard' };
const KEYED = Object.keys(I._defs);

/* 1 */
{
  const rows = CAT.ITEMS.filter((i) => i.slot === 'idle').map((i) => i.id).sort();
  ok(same(rows, I.IDS.slice().sort()), '1 the catalogue and idles.js name the same idles (' + rows.length + ' rows, ' + I.IDS.length + ' in idles.js)');
  ok(CAT.STREET_SLOTS.indexOf('idle') >= 0 && CAT.COURT_SLOTS.indexOf('idle') >= 0, '1 both looks have an idle slot');
  for (const it of CAT.ITEMS.filter((i) => i.slot === 'idle')) ok(it.ctx === 'both' && it.k === 'idle', '1 ' + it.id + ' is worn in either look');
  ok(CAT.item(I.DEFAULT.street).free && CAT.item(I.DEFAULT.court).free, '1 both defaults are free');
}

/* 2 */
for (const id of KEYED) {
  const d = I.def(id), raw = I._defs[id], tw = raw.tw == null ? 1 : raw.tw;
  ok(d.f.length <= I.MAX_FRAMES, '2 ' + id + ' fits the paint budget (' + d.f.length + ' frames)');
  ok(d.seq.concat(d.fl || []).every((s) => d.f[s[0]] && s[1] > 0), '2 ' + id + ' only plays frames it has');
  ok(d.seq.length === raw.keys.length * (tw + 1), '2 ' + id + ' closes its loop (' + d.seq.length + ' steps for ' + raw.keys.length + ' keys)');
  /* the step after the last is key 0 again, so the last frame sits between them */
  const last = d.f[d.seq[d.seq.length - 1][0]], k0 = d.f[d.seq[0][0]], kl = d.f[d.seq[d.seq.length - 1 - tw][0]];
  if (tw) { const r = (f) => f.a['1'][0]; ok((r(last) - r(k0)) * (r(last) - r(kl)) <= 0.0001, '2 ' + id + ' blends its last key back to its first'); }
  if (d.fl) ok(d.fl.length && d.f[d.fl[d.fl.length - 1][0]], '2 ' + id + ' has a flourish to play');
}

/* 3, 4, 5 */
const BUILDS = [LOOK, Object.assign({}, LOOK, { build: 'lean' }), Object.assign({}, LOOK, { build: 'strong' }), Object.assign({}, LOOK, { ht: 88, wt: 250 })];
for (const id of KEYED) {
  const d = I.def(id), edge = [], miss = [], pics = new Set();
  let balls = 0;
  d.f.forEach((f, fi) => {
    BUILDS.forEach((lk, bi) => {
      const o = { fr: f, c1: '#e8660f', c2: '#16181f', num: 23 };
      if (d.hold) o.hold = d.hold;
      const parts = B.paint(lk, Object.assign({ parts: true }, o)), names = new Set();
      for (let y = 0; y < B.H; y++) for (let x = 0; x < B.W; x++) {
        const n = parts[y][x]; if (!n) continue;
        names.add(n);
        if (x === 0 || x === B.W - 1 || y === 0 || y === B.H - 1) edge.push(fi + ':' + bi + ' ' + n);
      }
      const has = (re) => [...names].some((n) => re.test(n));
      for (const [need, re] of [['head', /^head$/], ['right hand', /^hand1$/], ['left hand', /^hand-1$/], ['shoe', /^shoe/]]) if (!has(re)) miss.push(fi + ':' + bi + ' ' + need);
      if (has(/^ball$/)) balls++;
      if (bi === 0) pics.add(JSON.stringify(B.paint(lk, o)));
    });
  });
  ok(!edge.length, '3 ' + id + ' never touches the grid edge (' + edge.slice(0, 3).join(', ') + ')');
  ok(!miss.length, '3 ' + id + ' always draws the head, both hands and the shoes (' + miss.slice(0, 3).join(', ') + ')');
  const keys = new Set(d.seq.map((s) => s[0]).filter((fi, i) => i % ((I._defs[id].tw == null ? 1 : I._defs[id].tw) + 1) === 0));
  ok(pics.size >= Math.min(keys.size, 2), '4 ' + id + ' moves (' + pics.size + ' different pictures)');
  if (d.hold === 'ball') ok(balls === d.f.length * BUILDS.length, '5 ' + id + ' holds the ball on every frame');
  else ok(balls === 0, '5 ' + id + ' holds no ball');
}

/* 6 */
for (const id of KEYED) {
  const d = I.def(id), n = I.FLAIR_EVERY;
  const lens = [...Array(n * 2).keys()].map((k) => B._idleStep(d, k).length);
  if (d.fl) ok(lens.filter((l) => l > d.seq.length).length === 2 && lens[n - 1] > d.seq.length && lens[2 * n - 1] > d.seq.length, '6 ' + id + ' plays its flourish one loop in ' + n);
  else ok(lens.every((l) => l === d.seq.length), '6 ' + id + ' has no flourish and never plays one');
}

/* 7 */
for (const id of KEYED) {
  const d = I.def(id), st = B._idleStill({ idle: d, scale: 3 });
  ok(st.fr === d.f[d.sig] && !st.idle && st.scale === 3, '7 ' + id + "'s still is its signature frame");
  ok(!!st.hold === !!d.hold, '7 ' + id + "'s still holds the ball when the idle does");
}

/* 8 */
{
  const stand = JSON.stringify(B.paint(LOOK, {}));
  const bad = [null, 7, 'x', {}, { a: {} }, { a: { '1': [1, 'b'], '-1': [9, 4] } }, { a: { '1': [NaN, 4], '-1': [9, 4] } }, { a: { '1': [1, 2, 3, 4, 5, 6, 7], '-1': [9, 4] } }];
  for (const b of bad) {
    ok(B._frOf(b) === null, '8 frOf refuses ' + JSON.stringify(b));
    ok(JSON.stringify(B.paint(LOOK, { fr: b })) === stand, '8 a refused frame paints the standing figure (' + JSON.stringify(b) + ')');
  }
  const big = B._frOf({ a: { '1': [9, 4], '-1': [9, 4] }, dip: 99, sp: -99, lift: { '1': 9 } });
  ok(big && big.dip === 4 && big.sp === -1 && big.lift['1'] === 2, '8 a frame out of range is clamped onto the rig');
  ok(JSON.stringify(B.paint(LOOK, { fr: I.def('id_flex').f[1] })) !== stand, '8 a real frame is not the standing figure');
}

/* 9 */
{
  W._reset(); localStorage._m = {};
  ok(W.idleOf('court') === 'id_dribble' && W.idleOf('street') === 'id_stand', '9 a new player stands off court and dribbles on court');
  ok(W.idle({ pose: 'stand' }, 'court').pose === 'ball' && !W.idle({}, 'court').idle, '9 the default court idle is the old dribble, exactly');
  ok(!W.idle({ pose: 'ball' }, 'street').idle && W.idle({ pose: 'ball' }, 'street').pose === 'stand', '9 the default street idle is the old standing figure');
  ok(W.idleOf('court', { idle: 'id_flex' }) === 'id_dribble', '9 an idle he does not own is the default');
  ok(W.idleOf('court', { idle: 'id_flex' }, true) === 'id_flex', '9 trying an idle on plays it');
  ok(!W.equip('court', 'idle', 'id_flex'), '9 the closet refuses an idle he does not own');
  W.grant('id_flex');
  ok(W.equip('court', 'idle', 'id_flex') && W.idleOf('court') === 'id_flex', '9 an owned idle is worn');
  const o = W.idle({ pose: 'ball' }, 'court');
  ok(o.idle && o.idle.id === 'id_flex' && o.pose === 'stand', '9 a keyframe idle stands and carries its frames');
  ok(W.idleOf('street') === 'id_stand', '9 each look keeps its own idle');
  ok(!('idle' in CAT.resolve({ idle: 'id_flex', top: 'st_tee_white' }, 'street', true)) && !('idle' in CAT.resolve({ idle: 'id_flex' }, 'court', true)), '9 resolve never hands an idle to baller.js as wear');
  ok(W.idleOf('court', { idle: 'tee_black' }, true) === 'id_dribble', '9 a piece that is not an idle in the idle slot is the default');
}

/* 10 */
{
  const STEP = { common: 'rare', rare: 'epic', epic: 'legendary', legendary: 'legendary' };
  for (const it of CAT.ITEMS.filter((i) => i.slot === 'idle')) {
    if (it.excl) ok(!CAT.sold(it) && it.earn && X.priceOf(it) === 0, '10 the exclusive idle ' + it.id + ' is earned and never sold');
    else if (it.free) ok(!CAT.sold(it), '10 the free idle ' + it.id + ' is not sold');
    else ok(X.priceOf(it) === X.PRICE[STEP[it.rarity]], '10 ' + it.id + ' prices one rarity up (' + X.priceOf(it) + ')');
  }
}

/* 11 */
async function browser(){
  const pw = createRequire('/opt/node22/lib/node_modules/')('playwright');
  const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.woff2': 'font/woff2' };
  async function serve(route){
    const u = new URL(route.request().url());
    if (u.hostname !== 'local.test') return route.abort();
    if (u.pathname.startsWith('/sb/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    let rel = decodeURIComponent(u.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const f = path.join(ROOT, rel);
    if (!fs.existsSync(f)) return route.abort();
    await route.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  }
  const b = await pw.chromium.launch(fs.existsSync(CHROME) ? { executablePath: CHROME } : {});
  for (const reduced of [false, true]) {
    const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const page = await ctx.newPage(), boom = [];
    page.on('pageerror', (e) => boom.push(String(e).slice(0, 200)));
    await page.addInitScript(() => { try { localStorage.setItem('rtf.guide.v1', '1'); } catch (e) {} window.RTF_BOARD_URL = 'http://local.test/sb'; });
    await page.route('**/*', serve);
    await page.goto('http://local.test/hoops/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.RTF_BALLER && window.RTF_IDLES, null, { timeout: 30000 });
    const tag = await page.evaluate(() => {
      const d = document.createElement('div'); d.id = 'idle-probe'; document.body.appendChild(d);
      d.innerHTML = window.RTF_BALLER.img(window.RTF_BALLER.lookFor('idle-check'), { c1: '#e8660f', c2: '#16181f', num: 7, pose: 'stand', scale: 2, idle: window.RTF_IDLES.def('id_jacks') });
      return d.firstChild && d.firstChild.tagName;
    });
    if (reduced) ok(tag === 'IMG', '11 under reduced motion an idle is the still <img> (' + tag + ')');
    else {
      ok(tag === 'CANVAS', '11 an idle is a live figure (' + tag + ')');
      /* wait for the frames, then read the canvas at moments a key apart */
      const seen = new Set();
      for (let i = 0; i < 40 && seen.size < 3; i++) {
        await page.waitForTimeout(110);
        seen.add(await page.evaluate(() => { const c = document.querySelector('#idle-probe canvas'); return c ? c.toDataURL().length + ':' + c.toDataURL().slice(-60) : ''; }));
      }
      ok(seen.size >= 3, '11 the live idle plays (' + seen.size + ' different pictures)');
    }
    ok(!boom.length, '11 no page errors (' + boom.join(' | ') + ')');
    await ctx.close();
  }
  await b.close();
}
await browser();

console.log((fails ? 'FAILED ' : 'ok ') + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
