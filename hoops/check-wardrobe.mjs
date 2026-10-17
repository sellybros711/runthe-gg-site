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
 *   9. the item pass's rules (the owner's call, 2026-10-17, review 9):
 *      R1 an item reads at size, R2 every catalogue colour is drawn,
 *      R3 no two items in a slot look alike. What waits for the item
 *      redraws (PR 2) is listed in WAITS and printed on every run.
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const B = require('./baller.js'), CAT = require('./catalog.js');

let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL ' + msg); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/* an idle is motion, not wear: hoops/check-idles.mjs holds those rows. A
   nameplate and a card backdrop dress the player card, not the man:
   hoops/check-card.mjs holds those. */
const WEAR = CAT.ITEMS.filter((i) => !(CAT.NOWEAR || { idle: 1 })[i.slot]);
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
  /* every real man is drawn in the one warm tone, whatever look he was hashed */
  const headOf = (lk) => { const parts = B.paint(lk, Object.assign({ faceless: 1, parts: 1 }, UNI)), cols = B.paint(lk, Object.assign({ faceless: 1 }, UNI)), out = new Set();
    parts.forEach((r, y) => r.forEach((p, x) => { if (p === 'head' && cols[y][x]) out.add(cols[y][x]); })); return [...out].sort(); };
  const h0 = headOf(Object.assign({}, LOOK, { skin: 0 })), h7 = headOf(Object.assign({}, LOOK, { skin: 7 }));
  const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const warm = h0.length > 2 && h0.every((c) => /^#[0-9a-f]{6}$/i.test(c)) && h0.filter((c) => { const [r, , bl] = rgb(c); return r > bl + 12; }).length >= h0.length * 0.6;
  ok(h0.length > 2 && same(h0, h7) && warm, '8 every real player has the same warm skin, never a tone of his own (' + h0.slice(0, 3).join(' ') + ')');
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

/* 9: THE ITEM PASS. Review 9 painted every item and found ones that were not
   there: a headband inside the hair (4 pixels on court, and a black one on
   black hair invisible), socks that changed no pixel under jeans, a camo and
   a puffer's orange that were never drawn, and pairs a player could not tell
   apart. Every check above was green. These rules hold what a player sees.

   Each item is drawn the way the closet draws it (standing, two fine pixels a
   cell, over the starter tee and jeans off court and over the uniform on it)
   and the way the court sprite draws it (one pixel a cell).
     R1 READS AT SIZE: it changes at least 15 pixels on the court sprite and 60
        in the closet. A smaller item is drawn bigger.
     R2 EVERY COLOUR IS DRAWN: swap one of its catalogue colours for another
        and the closet picture moves. Colour never moves geometry, so a shape
        is asked once for each number of colours it is given.
     R3 NO LOOK-ALIKES: two items in a slot differ in at least 40 closet
        pixels a player can tell apart (more than 40 apart in RGB).
   CLOSE_UP is the owner's call (2026-10-17, decision 5): the mouthguard is
   drawn bigger and accepted as a close-up item, so it is held to the most a
   mouth can show, not to a jacket's numbers.

   WAITS is the work the owner approved for the item redraws (PR 2), and only
   that. An item on it is excused from R1, and a look-alike pair only when both
   items are on the same line. It is printed on every run, and an item that no
   longer needs its excuse fails until it comes off the list, so the list only
   shrinks. */
{
  const STARTER = { top: { k: 'tee', c: ['#f1f0ea', '#d8d6cc'] }, bottom: { k: 'jeans', c: ['#3d5a86'] } };
  const R1_COURT = 15, R1_CLOSET = 60, R3_PX = 40, R3_RGB = 40;
  const CLOSE_UP = { guard: { court: 5, closet: 20, apart: 15 } };
  const WAITS = {
    'PR 2 glasses: bigger lenses, a brow bar, thicker rims, each shape its own silhouette': ['shades_night', 'shades_tort', 'shades_gold', 'ps1_shades', 'frames_tort', 'frames_black', 'frames_gold', 'sport_smoke', 'sport_ice'],
    'PR 2 watch: moved to the near wrist, where the camera sees its face': ['watch_gold', 'watch_steel', 'watch_field', 'watch_ice'],
    'PR 2 held items: the phone and the coffee drawn bigger': ['phone_blue', 'phone_spooky', 'coffee_cup'],
    'PR 2 shoes: a bigger foot for all, a welt and toe cap on dress shoes': ['st_sneaker_white', 'st_sneaker_black', 'hitop_white', 'hitop_ice', 'hitop_black', 'dress_oxford', 'dress_patent', 'slide_black', 'slide_gold'],
    'PR 2 tees: a chest print for rare and up, a ringer trim that reads': ['st_tee_white', 'tee_cream', 'tee_black', 'tee_navy', 'tee_tour', 'tee_pixel', 'tee_ringer', 'tee_pumpkin', 'ex_rookie_tee', 'longsleeve_white', 'ps1_long'],
    'PR 2 materials and palette: satin, fleece and mesh drawn, navy told from black and charcoal': ['st_hoodie_navy', 'hoodie_black', 'ex_hallows_hoodie', 'ps1_hoodie', 'puffer_black', 'puffer_navy', 'blazer_charcoal', 'blazer_navy', 'bomber_black', 'bomber_navy', 'bomber_satin', 'jeans_raw', 'jeans_black', 'jeans_selvedge', 'ex_draft_trousers', 'sweats_charcoal', 'sweats_navy', 'shorts_navy', 'shorts_mesh'],
    'PR 2 rarity on the body: a signature detail for a legendary chain': ['ex_ring_cuban', 'cuban_gold', 'ps1_chain'],
    'PR 2 small court pieces: tails past the head, and bands, tape, socks and specs drawn bigger': ['st_band_white', 'band_black', 'band_tied_black', 'band_tied_white', 'st_wrist_white', 'wrist_gold', 'wrist_black', 'wrist_red', 'wrist_royal', 'wrist_orange', 'tape_white', 'tape_black', 'tape_gold', 'csocks_crew_black', 'csocks_crew_purple', 'csocks_low_white', 'csocks_low_black', 'goggles_specs', 'goggles_white', 'goggles_gold'],
  };
  const waitOf = {};
  for (const why in WAITS) for (const id of WAITS[why]) { ok(!!CAT.item(id), '9 the PR 2 list names a real item (' + id + ')'); ok(!waitOf[id], '9 ' + id + ' is on one PR 2 line only'); waitOf[id] = why; }
  const KIT = { c1: '#1d428a', c2: '#ffc72c', num: '23' };
  const isCourt = (it) => it.ctx === 'court';
  const fig = (it, res, c) => { const o = Object.assign({}, KIT, { pose: 'stand', res });
    if (it) { const w = { [it.slot]: { k: it.k, c: c || it.c } }; if (isCourt(it)) o.cwear = w; else { o.ctx = 'street'; o.wear = Object.assign({}, STARTER, w); } }
    else if (c === 'street') { o.ctx = 'street'; o.wear = STARTER; }
    return B.paint(LOOK, o); };
  const flat = (g) => { const a = new Int32Array(g.length * g[0].length); let i = 0; for (const r of g) for (const c of r) a[i++] = c ? parseInt(c.slice(1), 16) : -1; return a; };
  const moved = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };
  const apart = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) { const x = a[i], y = b[i]; if (x === y) continue;
    if (x < 0 || y < 0) { n++; continue; }
    const dr = (x >> 16) - (y >> 16), dg = ((x >> 8) & 255) - ((y >> 8) & 255), db = (x & 255) - (y & 255); if (dr * dr + dg * dg + db * db > R3_RGB * R3_RGB) n++; } return n; };
  const base = { street: [flat(fig(null, 1, 'street')), flat(fig(null, 2, 'street'))], court: [flat(fig(null, 1)), flat(fig(null, 2))] };
  /* the starter pieces the others are measured over are the base itself */
  const isBase = (it) => it.free && STARTER[it.slot] && !isCourt(it) || it.id === 'st_sneaker_white';
  const closet = {}, r1 = {}, excused = { r1: [], r3: [] }, needed = {};
  let r1n = 0, r3n = 0, r2n = 0;
  for (const it of WEAR) {
    const ctx = isCourt(it) ? 'court' : 'street', g2 = flat(fig(it, 2));
    closet[it.id] = g2;
    if (isBase(it)) continue;
    const lim = CLOSE_UP[it.slot] || { court: R1_COURT, closet: R1_CLOSET };
    const d1 = moved(base[ctx][0], flat(fig(it, 1))), d2 = moved(base[ctx][1], g2), pass = d1 >= lim.court && d2 >= lim.closet;
    r1[it.id] = [d1, d2];
    if (!pass && waitOf[it.id]) { excused.r1.push(it.id); needed[it.id] = 1; continue; }
    r1n++; ok(pass, '9 R1 ' + it.id + ' (' + it.name + ') reads at size: ' + d1 + ' court pixels (needs ' + lim.court + '), ' + d2 + ' in the closet (needs ' + lim.closet + ')');
  }
  /* R2: a shape asked once for each number of colours */
  const asked = new Set();
  for (const it of WEAR) {
    const key = (isCourt(it) ? 'court' : 'street') + ':' + it.slot + ':' + it.k + ':' + it.c.length;
    if (asked.has(key)) continue; asked.add(key);
    it.c.forEach((col, i) => { const c2 = it.c.slice(); c2[i] = col.toLowerCase() === '#ff00ff' ? '#00ff00' : '#ff00ff';
      r2n++; ok(moved(closet[it.id], flat(fig(it, 2, c2))) > 0, '9 R2 ' + it.slot + ':' + it.k + ' draws its colour ' + (i + 1) + ' of ' + it.c.length + ' (' + it.id + ', ' + col + ')'); });
  }
  /* R3 */
  const groups = {};
  for (const it of WEAR) { const g = (isCourt(it) ? 'court' : 'street') + ':' + it.slot; (groups[g] = groups[g] || []).push(it); }
  for (const g in groups) { const L = groups[g];
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j], need = (CLOSE_UP[a.slot] || {}).apart || R3_PX, d = apart(closet[a.id], closet[b.id]);
      if (d < need && waitOf[a.id] && waitOf[a.id] === waitOf[b.id]) { excused.r3.push(a.id + ' ~ ' + b.id + ' (' + d + ')'); needed[a.id] = needed[b.id] = 1; continue; }
      r3n++; ok(d >= need, '9 R3 ' + a.id + ' (' + a.name + ') and ' + b.id + ' (' + b.name + ') are told apart: ' + d + ' closet pixels differ (needs ' + need + ')');
    } }
  /* the list only shrinks */
  for (const id in waitOf) ok(needed[id], '9 ' + id + ' reads at size and has no look-alike now: take it off the PR 2 list');
  console.log('item pass: R1 ' + r1n + ' items, R2 ' + r2n + ' colours, R3 ' + r3n + ' pairs held');
  console.log('WAITING FOR PR 2 (the owner approved these redraws, review 9): ' + excused.r1.length + ' items excused from R1, ' + excused.r3.length + ' look-alike pairs excused from R3');
  for (const why in WAITS) {
    const ids = WAITS[why], s1 = excused.r1.filter((id) => ids.indexOf(id) >= 0), s3 = excused.r3.filter((p) => ids.indexOf(p.split(' ')[0]) >= 0);
    console.log('  ' + why + ':');
    if (s1.length) console.log('    R1: ' + s1.map((id) => id + ' ' + r1[id].join('/')).join(', '));
    if (s3.length) console.log('    R3: ' + s3.join(', '));
  }
}

console.log((fails ? 'FAILED ' : 'ok ') + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
