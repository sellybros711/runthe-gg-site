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
/* an idle is motion, not wear: hoops/check-idles.mjs holds those rows */
const WEAR = CAT.ITEMS.filter((i) => i.slot !== 'idle');
const LOOK = { skin: 4, hair: 'fade', hc: 0, beard: 'stubble', build: 'standard' };

/* 1 */
for (const it of WEAR) {
  const slots = it.ctx === 'court' ? CAT.COURT_SLOTS : CAT.STREET_SLOTS;
  ok(slots.indexOf(it.slot) >= 0, '1 ' + it.id + ' is in a real slot');
  if (it.ctx !== 'court') ok((B.WEAR_KINDS[it.slot] || []).indexOf(it.k) >= 0, '1 ' + it.id + ' names a shape baller.js knows (' + it.slot + ':' + it.k + ')');
  if (it.ctx !== 'street') ok((B.CWEAR_KINDS[it.slot === 'shoes' ? 'cshoes' : it.slot] || []).indexOf(it.k) >= 0, '1 ' + it.id + ' names a court shape baller.js knows (' + it.slot + ':' + it.k + ')');
  ok(Array.isArray(it.c) && it.c.every((x) => /^#[0-9a-f]{6}$/i.test(x)), '1 ' + it.id + ' has hex colours');
}
ok(new Set(CAT.ITEMS.map((i) => i.id)).size === CAT.ITEMS.length, '1 every id is unique');

/* 1b: the catalogue is the plan's (ECONOMY.md section 5) */
{
  const t = {};
  for (const it of WEAR) if (CAT.sold(it)) { const g = it.ctx === 'street' ? 'off' : 'on'; t[g] = t[g] || { common: 0, rare: 0, epic: 0, legendary: 0 }; t[g][it.rarity]++; }
  ok(same(t.off, { common: 70, rare: 55, epic: 33, legendary: 12 }), '1b off court is 70 common, 55 rare, 33 epic, 12 legendary (' + JSON.stringify(t.off) + ')');
  ok(same(t.on, { common: 30, rare: 26, epic: 16, legendary: 8 }), '1b on court is 30 common, 26 rare, 16 epic, 8 legendary (' + JSON.stringify(t.on) + ')');
  const X = require('./economy.js');
  for (const it of CAT.ITEMS) {
    ok(['common', 'rare', 'epic', 'legendary'].indexOf(it.rarity) >= 0, '1b ' + it.id + ' has a rarity');
    if (it.excl) ok(!CAT.sold(it) && it.earn && X.priceOf(it) === 0, '1b the exclusive ' + it.id + ' is earned and never sold');
    if (it.free) ok(!CAT.sold(it), '1b the free ' + it.id + ' is not sold');
  }
  ok(new Set(CAT.ITEMS.map((i) => i.name)).size === CAT.ITEMS.length, '1b every name is unique');
  for (const d of CAT.DROPS) {
    const items = CAT.ITEMS.filter((i) => i.drop === d.id), rw = CAT.item(d.reward);
    ok(items.length >= 6 && items.every(CAT.sold), '1b the ' + d.id + ' drop sells at least six pieces (' + items.length + ')');
    ok(rw && rw.excl && rw.earn === 'drop:' + d.id, '1b the ' + d.id + ' drop rewards an exclusive');
    ok(CAT.dropLive(d.id, d.from) && CAT.dropLive(d.id, d.to) && !CAT.dropLive(d.id, '2099-01-01'), '1b the ' + d.id + ' drop is live inside its window only');
  }
  ok(CAT.ITEMS.every((i) => !i.drop || CAT.DROPS.some((d) => d.id === i.drop)), '1b every drop an item names exists');
  /* no real brand, and no real club's name: an invented club's jersey is the only club wear */
  const BAD = /\b(nike|adidas|jordan|puma|reebok|converse|vans|supreme|rolex|cartier|beats|apple|gucci|prada|champion|starter|mitchell|spalding|wilson|hawks|celtics|nets|hornets|bulls|cavaliers|mavericks|nuggets|pistons|warriors|rockets|pacers|clippers|lakers|grizzlies|heat|bucks|timberwolves|pelicans|knicks|thunder|magic|76ers|sixers|suns|blazers|kings|spurs|raptors|jazz|wizards)\b/i;
  const bad = CAT.ITEMS.filter((i) => BAD.test(i.name));
  ok(!bad.length, '1b no real brand or club in a name (' + bad.map((i) => i.name).join(', ') + ')');
}

/* 2 and 3 */
const base = { top: { k: 'tee', c: ['#f1f0ea', '#d8d6cc'] } };
/* the held ball already reaches the edge in the court drawing (heldX keeps
   its centre on the grid, not all of it), so it is not the wardrobe's to hold */
const edgeOf = (L, o) => { const g = B.paint(L, Object.assign({}, o, { parts: 1 })), h = g.length, w = g[0].length, on = (n) => n && n !== 'ball';
  for (let y = 0; y < h; y++) if (on(g[y][0]) || on(g[y][w - 1])) return 'side ' + y + ' ' + (g[y][0] || g[y][w - 1]);
  for (let x = 0; x < w; x++) if (on(g[0][x])) return 'top ' + x + ' ' + g[0][x]; return null; };
/* Colour never moves geometry, so a SHAPE is drawn on every build and pose
   (and must stay on the grid there), and each colourway is drawn once, where
   it must change the picture. */
const firstOf = (items) => { const seen = new Map(); for (const it of items) { const key = it.slot + ':' + it.k; if (!seen.has(key)) seen.set(key, it); } return [...seen.values()]; };
const STREET = WEAR.filter((i) => i.ctx !== 'court'), COURT = WEAR.filter((i) => i.ctx !== 'street');
const underOf = (it) => it.slot === 'socks' ? { bottom: { k: 'shorts', c: ['#3a3f4a'] } } : {};
for (const build of ['lean', 'standard', 'strong']) for (const pose of ['stand', 'walk1', 'cheer1', 'ball']) {
  const L = Object.assign({}, LOOK, { build });
  for (const it of firstOf(STREET)) {
    const wear = Object.assign({}, base, underOf(it), { [it.slot]: { k: it.k, c: it.c } });
    let e = null;
    try { e = edgeOf(L, { ctx: 'street', wear, pose }); } catch (x) { ok(false, '2 ' + it.slot + ':' + it.k + ' paints on ' + build + ' ' + pose + ': ' + x.message); continue; }
    ok(!e, '2 ' + it.slot + ':' + it.k + ' stays inside the grid on ' + build + ' ' + pose + (e ? ' (' + e + ')' : ''));
  }
  /* a hand holding a ball holds nothing else: a held item is dropped, not drawn through the ball */
  if (pose === 'ball') for (const it of firstOf(STREET.filter((i) => i.slot === 'held'))) {
    ok(same(B.paint(L, { ctx: 'street', wear: Object.assign({}, base, { held: { k: it.k, c: it.c } }), pose }), B.paint(L, { ctx: 'street', wear: base, pose })), '3 ' + it.k + ' is not drawn while he holds the ball');
  }
}
{
  const refs = {};
  for (const it of STREET) {
    if (it.free) continue;
    const under = underOf(it), rk = JSON.stringify(under);
    refs[rk] = refs[rk] || JSON.stringify(B.paint(LOOK, { ctx: 'street', wear: Object.assign({}, base, under) }));
    ok(JSON.stringify(B.paint(LOOK, { ctx: 'street', wear: Object.assign({}, base, under, { [it.slot]: { k: it.k, c: it.c } }) })) !== refs[rk], '3 ' + it.id + ' changes the picture');
  }
  /* two items are never the same look under two names */
  const looks = new Map();
  for (const it of WEAR) { const key = it.ctx + it.slot + it.k + JSON.stringify(it.c); ok(!looks.has(key), '3 ' + it.id + ' is not ' + looks.get(key) + ' again'); looks.set(key, it.id); }
}
/* a heavy, tall man in everything at once */
{
  const all = {};
  for (const it of STREET) if (!it.free) all[it.slot] = { k: it.k, c: it.c };
  for (const L of [Object.assign({}, LOOK, { ht: 92, wt: 360, build: 'strong' }), Object.assign({}, LOOK, { ht: 66, wt: 140, build: 'lean' })]) for (const pose of ['stand', 'walk2', 'cheer0', 'wave1']) {
    const e = edgeOf(L, { ctx: 'street', wear: all, pose });
    ok(!e, '2 the whole fit stays inside the grid at ' + L.ht + '" ' + L.wt + 'lb ' + pose + (e ? ' (' + e + ')' : ''));
  }
}

/* 2c and 3c: the court accessories, over the uniform */
const UNI = { c1: '#1d428a', c2: '#ffc72c', num: '23' };
for (const build of ['lean', 'standard', 'strong']) for (const pose of ['stand', 'walk1', 'cheer1', 'ball']) {
  const L = Object.assign({}, LOOK, { build });
  for (const it of firstOf(COURT)) {
    const o = Object.assign({ pose, cwear: { [it.slot]: { k: it.k, c: it.c } } }, UNI);
    let e = null;
    try { e = edgeOf(L, o); } catch (x) { ok(false, '2c ' + it.slot + ':' + it.k + ' paints on court on ' + build + ' ' + pose + ': ' + x.message); continue; }
    ok(!e, '2c ' + it.slot + ':' + it.k + ' stays inside the grid on court on ' + build + ' ' + pose + (e ? ' (' + e + ')' : ''));
  }
}
{
  const ref = JSON.stringify(B.paint(LOOK, UNI));
  for (const it of COURT) if (!it.free) ok(JSON.stringify(B.paint(LOOK, Object.assign({ cwear: { [it.slot]: { k: it.k, c: it.c } } }, UNI))) !== ref, '3c ' + it.id + ' changes the court picture');
}
{
  /* everything at once, on the biggest and smallest man */
  const all = {};
  for (const it of COURT) if (it.ctx === 'court') all[it.slot] = { k: it.k, c: it.c };
  all.shoes = { k: 'hitop', c: ['#c8352e', '#f2f2f0', '#f2efe6'] };
  for (const L of [Object.assign({}, LOOK, { ht: 92, wt: 360, build: 'strong' }), Object.assign({}, LOOK, { ht: 66, wt: 140, build: 'lean' })]) for (const pose of ['stand', 'walk2', 'cheer0', 'ball']) {
    const e = edgeOf(L, Object.assign({ pose, cwear: all }, UNI));
    ok(!e, '2c the whole court kit stays inside the grid at ' + L.ht + '" ' + L.wt + 'lb ' + pose + (e ? ' (' + e + ')' : ''));
  }
  /* the jersey keeps its trim under new shoes: only the shoe changes */
  const plainU = B.paint(LOOK, Object.assign({}, UNI, { parts: 1 }));
  const shod = B.paint(LOOK, Object.assign({}, UNI, { cwear: { shoes: { k: 'sneaker', c: ['#c8352e', '#16181f', '#f2efe6'] } } }));
  const bare = B.paint(LOOK, UNI);
  let jerseyMoved = 0;
  for (let y = 0; y < plainU.length; y++) for (let x = 0; x < plainU[0].length; x++) if (plainU[y][x] && !/^shoe/.test(plainU[y][x]) && JSON.stringify(shod[y][x]) !== JSON.stringify(bare[y][x])) jerseyMoved++;
  ok(jerseyMoved === 0, '3c a court shoe changes the shoe and nothing else (' + jerseyMoved + ' other cells moved)');
  /* a suit is not a uniform: court wear goes with the uniform */
  ok(same(B.paint(LOOK, Object.assign({}, UNI, { pose: 'suit' })), B.paint(LOOK, Object.assign({}, UNI, { pose: 'suit', cwear: all }))), '3c nothing on court is worn with a suit');
  const n = B.cwearNorm({ band: { k: 'cape' }, shoes: { k: 'boot', c: ['#fff000'] }, knee: { k: 'pad', c: ['#123456', 'red'] } });
  ok(!n.band && !n.cshoes && n.knee && same(n.knee.c, ['#123456']), '5 a court shape that is not one is dropped, and a street-only shoe never goes on court');
  ok(B.cwearNorm({}) === null && B.cwearNorm(null) === null, '5 no court wear is no court wear');
  ok(same(B.paint(LOOK, Object.assign({ faceless: 1, cwear: all }, UNI)), B.paint(LOOK, Object.assign({ faceless: 1 }, UNI))), '8 a real player wears nothing from the court catalogue');
  const src = require('node:fs').readFileSync(new URL('./baller.js', import.meta.url), 'utf8');
  ok(/cwearKey\(o\)/.test(src.match(/function keyOf\([^]*?\n/)[0]) && /cwearKey\(o\)/.test(src.match(/var key = JSON\.stringify\(\[normal\(look\)[^\n]*/)[0]), '6 the court outfit is in the url key and the live frame key');
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
  ok(!CAT.resolve({ shoes: 'boot_wheat' }, 'court', true).shoes, '7 a street-only shoe stays off the court');
  ok(!CAT.resolve({ goggles: 'goggles_specs' }, 'street', true).goggles && CAT.resolve({ goggles: 'goggles_specs' }, 'court', true).goggles, '7 court gear is worn on court and not on the street');
}

/* 8 */
{
  const g = B.paint(LOOK, { faceless: 1, c1: '#1d428a', c2: '#ffc72c', ctx: 'street', wear: { hat: { k: 'beanie', c: ['#d9772b'] } } });
  const f = B.paint(LOOK, { faceless: 1, c1: '#1d428a', c2: '#ffc72c' });
  ok(same(g, f), '8 a real player is never dressed: faceless drops the street look');
}

console.log((fails ? 'FAILED ' : 'ok ') + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
