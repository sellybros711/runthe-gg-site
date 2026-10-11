/* The wardrobe, painted headless.
 *
 *   node hoops/check-wardrobe.mjs
 *
 * paint() returns a grid in node, so every item is drawn for real, in every
 * pose it has to survive, on every build. What it holds:
 *   1. every catalogue item names a shape baller.js knows, in its own slot
 *   2. every item paints, in the street look, on three builds and four poses,
 *      and no part of it touches the grid's edge (an edge eats the outline)
 *   3. every item changes the picture, so none is drawn as nothing
 *   4. the street look carries no number and the court look is untouched by
 *      wear (check-sprite holds the 960 court sprites byte for byte)
 *   5. an unknown shape, slot or colour falls back to the starter piece
 *   6. the outfit is in the cache key, or a changed fit draws stale
 *   7. resolve() never dresses a man in something he does not own
 *   8. a real player is never dressed (faceless drops the street look)
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const B = require('./baller.js'), CAT = require('./catalog.js');

let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL ' + msg); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const LOOK = { skin: 4, hair: 'fade', hc: 0, beard: 'stubble', build: 'standard' };

/* 1 */
for (const it of CAT.ITEMS) {
  const slots = it.ctx === 'court' ? CAT.COURT_SLOTS : CAT.STREET_SLOTS;
  ok(slots.indexOf(it.slot) >= 0, '1 ' + it.id + ' is in a real slot');
  if (it.ctx !== 'court') ok((B.WEAR_KINDS[it.slot] || []).indexOf(it.k) >= 0, '1 ' + it.id + ' names a shape baller.js knows (' + it.slot + ':' + it.k + ')');
  ok(Array.isArray(it.c) && it.c.every((x) => /^#[0-9a-f]{6}$/i.test(x)), '1 ' + it.id + ' has hex colours');
}
ok(new Set(CAT.ITEMS.map((i) => i.id)).size === CAT.ITEMS.length, '1 every id is unique');

/* 2 and 3 */
const base = { top: { k: 'tee', c: ['#f1f0ea', '#d8d6cc'] } };
/* the held ball already reaches the edge in the court drawing (heldX keeps
   its centre on the grid, not all of it), so it is not the wardrobe's to hold */
const edgeOf = (L, o) => { const g = B.paint(L, Object.assign({}, o, { parts: 1 })), h = g.length, w = g[0].length, on = (n) => n && n !== 'ball';
  for (let y = 0; y < h; y++) if (on(g[y][0]) || on(g[y][w - 1])) return 'side ' + y + ' ' + (g[y][0] || g[y][w - 1]);
  for (let x = 0; x < w; x++) if (on(g[0][x])) return 'top ' + x + ' ' + g[0][x]; return null; };
const plain = {};
for (const build of ['lean', 'standard', 'strong']) for (const pose of ['stand', 'walk1', 'cheer1', 'ball']) {
  const L = Object.assign({}, LOOK, { build });
  plain[build + pose] = JSON.stringify(B.paint(L, { ctx: 'street', wear: base, pose }));
  for (const it of CAT.ITEMS) {
    if (it.ctx === 'court') continue;
    /* socks only show under shorts, so they are judged in shorts */
    const under = it.slot === 'socks' ? { bottom: { k: 'shorts', c: ['#3a3f4a'] } } : {};
    const wear = Object.assign({}, base, under, { [it.slot]: { k: it.k, c: it.c } });
    let g = null;
    try { g = B.paint(L, { ctx: 'street', wear, pose }); } catch (e) { ok(false, '2 ' + it.id + ' paints on ' + build + ' ' + pose + ': ' + e.message); continue; }
    const e = edgeOf(L, { ctx: 'street', wear, pose });
    ok(!e, '2 ' + it.id + ' stays inside the grid on ' + build + ' ' + pose + (e ? ' (' + e + ')' : ''));
    const ref = it.slot === 'socks' ? JSON.stringify(B.paint(L, { ctx: 'street', wear: Object.assign({}, base, under), pose })) : plain[build + pose];
    /* a hand holding a ball holds nothing else: a held item is dropped, not drawn through the ball */
    if (it.slot === 'held' && pose === 'ball') ok(JSON.stringify(g) === ref, '3 ' + it.id + ' is not drawn while he holds the ball');
    else if (!it.free) ok(JSON.stringify(g) !== ref, '3 ' + it.id + ' changes the picture on ' + build + ' ' + pose);
  }
}
/* a heavy, tall man in everything at once */
{
  const all = {};
  for (const it of CAT.ITEMS) if (it.ctx !== 'court' && !it.free) all[it.slot] = { k: it.k, c: it.c };
  for (const L of [Object.assign({}, LOOK, { ht: 92, wt: 360, build: 'strong' }), Object.assign({}, LOOK, { ht: 66, wt: 140, build: 'lean' })]) for (const pose of ['stand', 'walk2', 'cheer0', 'wave1']) {
    const e = edgeOf(L, { ctx: 'street', wear: all, pose });
    ok(!e, '2 the whole fit stays inside the grid at ' + L.ht + '" ' + L.wt + 'lb ' + pose + (e ? ' (' + e + ')' : ''));
  }
}

/* 4 */
{
  const court = B.paint(LOOK, { c1: '#1d428a', c2: '#ffc72c', num: '23' });
  ok(same(court, B.paint(LOOK, { c1: '#1d428a', c2: '#ffc72c', num: '23', wear: { top: { k: 'hoodie', c: ['#ff0000'] } } })), '4 wear without the street look changes nothing');
  const st = B.paint(LOOK, { c1: '#1d428a', c2: '#ffc72c', num: '23', ctx: 'street', wear: base, res: 3 });
  const st2 = B.paint(LOOK, { c1: '#1d428a', c2: '#ffc72c', num: '', ctx: 'street', wear: base, res: 3 });
  ok(same(st, st2), '4 the street look carries no number');
  ok(!same(court, B.paint(LOOK, { c1: '#1d428a', c2: '#ffc72c', num: '23', ctx: 'street' })), '4 the street look is not the uniform');
}

/* 5 */
{
  const n = B.wearNorm({ top: { k: 'cape', c: ['#fff'] }, hat: { k: 'beanie', c: ['red', '#123456'] }, wings: { k: 'x' } });
  ok(n.top && n.top.k === 'tee', '5 an unknown shape falls back to the starter tee');
  ok(n.hat && n.hat.k === 'beanie' && same(n.hat.c, ['#123456']), '5 a bad colour is dropped and the good one kept');
  ok(!('wings' in n), '5 an unknown slot is dropped');
  ok(n.bottom && n.bottom.k === 'jeans', '5 no bottoms is the starter jeans, never bare legs');
}

/* 6: the cache key. url() needs a canvas, so ask the key through two
   different outfits drawing two different grids and the same outfit
   drawing the same one; the key function is what url and live share. */
{
  const a = B.paint(LOOK, { ctx: 'street', wear: base }), b = B.paint(LOOK, { ctx: 'street', wear: { top: { k: 'hoodie', c: ['#8f939c'] } } });
  ok(!same(a, b), '6 two outfits draw two pictures');
  const src = require('node:fs').readFileSync(new URL('./baller.js', import.meta.url), 'utf8');
  const keyFn = src.match(/function keyOf\([^]*?\n/)[0], setKey = src.match(/var key = JSON\.stringify\(\[normal\(look\)[^\n]*/)[0];
  ok(/wearKey\(o\)/.test(keyFn) && /wearKey\(o\)/.test(setKey), '6 the outfit is in the url key and the live frame key');
}

/* 7 */
{
  const r = CAT.resolve({ hat: 'beanie_orange', top: 'hoodie_heather', outer: 'nope' }, 'street', []);
  ok(!r.hat && r.top && r.top.k === 'tee', '7 an item not owned falls back to the starter piece');
  const r2 = CAT.resolve({ hat: 'beanie_orange', top: 'hoodie_heather' }, 'street', ['beanie_orange', 'hoodie_heather']);
  ok(r2.hat && r2.hat.k === 'beanie' && r2.top.k === 'hoodie', '7 an owned item is worn');
  ok(!CAT.resolve({ top: 'jeans_raw' }, 'street', true).top || CAT.resolve({ top: 'jeans_raw' }, 'street', true).top.k === 'tee', '7 an item in the wrong slot is not worn');
  ok(CAT.resolve({ shoes: 'hitop_red' }, 'court', true).shoes, '7 shoes cross between the two looks');
}

/* 8 */
{
  const g = B.paint(LOOK, { faceless: 1, c1: '#1d428a', c2: '#ffc72c', ctx: 'street', wear: { hat: { k: 'beanie', c: ['#d9772b'] } } });
  const f = B.paint(LOOK, { faceless: 1, c1: '#1d428a', c2: '#ffc72c' });
  ok(same(g, f), '8 a real player is never dressed: faceless drops the street look');
}

console.log((fails ? 'FAILED ' : 'ok ') + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
