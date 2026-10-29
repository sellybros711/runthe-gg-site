/* Run The Floor: the shop's pixel art (hoops/itemart.js), no browser.
 *
 *   node hoops/check-shopart.mjs
 *
 * 1. Every catalogue item draws an icon: not blank, in its own colour.
 * 2. Every mask fits inside the 14 cell field the light and the outline
 *    need, so no shape is clipped at the edge.
 * 3. Two different shapes never draw the same mask, and a new shape key or
 *    slot falls back rather than drawing nothing.
 * 4. The four packs are four different pictures, each in its own colour.
 * 5. The coin and the four shard gems draw.
 * 6. The coin is a round, shaded 12 cell coin, and every coin, gem, icon and
 *    pack the shop, the closet and the top bar draw is a whole number of CSS
 *    pixels a cell.
 */
import fs from 'node:fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
global.window = undefined;
const CAT = require('./catalog.js');
const A = require('./itemart.js');

let passes = 0, fails = 0;
function ok(c, m){ if (c) { passes++; console.log('  ok ' + m); } else { fails++; console.log('  FAIL ' + m); } }
const lit = (g) => g.filter(Boolean).length;

/* 1 */
const blank = [], offColour = [];
for (const it of CAT.ITEMS) {
  const g = A.iconGrid(it);
  if (lit(g) < 8) blank.push(it.id);
  const main = (it.c[0] || '').toLowerCase();
  if (main && !g.some((c) => c && c.toLowerCase() === main)) offColour.push(it.id);
}
ok(!blank.length, '1 every one of ' + CAT.ITEMS.length + ' items draws an icon (' + blank.slice(0, 4).join(', ') + ')');
ok(!offColour.length, '1 and each is drawn in its own first colour (' + offColour.slice(0, 4).join(', ') + ')');

/* 2 */
const wide = Object.entries(A.MASK).filter(([, m]) => m.length > A.ICON - 2 || m.some((r) => r.length > A.ICON - 2)).map(([k]) => k);
ok(!wide.length, '2 every mask fits the 14 cell field (' + wide.join(', ') + ')');
const clipped = CAT.ITEMS.filter((it) => {
  const g = A.iconGrid(it), m = A.maskFor(it);
  let cells = 0; m.forEach((r) => { for (const ch of r) if (ch !== '.') cells++; });
  return g.placed !== cells;
}).map((it) => it.id);
ok(!clipped.length, '2 no item loses a cell of its shape (' + clipped.slice(0, 3).join(', ') + ')');

/* 3 */
const seen = {}, dupes = [];
for (const [k, m] of Object.entries(A.MASK)) { const key = m.join('/'); if (seen[key]) dupes.push(seen[key] + '=' + k); seen[key] = k; }
ok(!dupes.length, '3 no two shapes share a mask (' + dupes.join(', ') + ')');
ok(lit(A.iconGrid({ id: 'x', slot: 'top', k: 'nope', c: ['#ff0000'] })) > 8, '3 an unknown shape falls back to its slot');
ok(lit(A.iconGrid({ id: 'y', slot: 'nope', k: 'nope', c: ['#00ff00'] })) > 8, '3 an unknown slot still draws a tag');
/* the card's nameplates and backdrops share one icon a slot on purpose: a
   design is told apart by its colours there, and check-card.mjs holds that
   every design draws its own picture on the card */
const SHAPED = CAT.ITEMS.filter((it) => it.slot !== 'plate' && it.slot !== 'bg');
const keys = new Set(SHAPED.map((it) => it.slot + ':' + it.k)), byMask = new Set(SHAPED.map((it) => A.maskFor(it).join('/')));
ok(byMask.size >= keys.size * 0.85, '3 the catalogue\'s shapes draw as distinct icons (' + byMask.size + ' of ' + keys.size + ')');

/* 4 */
const packs = Object.keys(A.PACK_PAL).map((id) => ({ id, g: A.packGrid(id) }));
ok(packs.every((p) => lit(p.g) > 1500 && p.g.length === A.PW * A.PH), '4 every pack fills its 40 by 60 grid');
ok(new Set(packs.map((p) => p.g.join(','))).size === packs.length, '4 the four packs are four different pictures');
ok(packs.every((p) => p.g.some((c) => c && c.toLowerCase() === A.PACK_PAL[p.id].a.toLowerCase())), '4 each pack wears its own colour');

/* 5 */
ok(lit(A.coinGrid().px) > 30, '5 the coin draws');
ok(['common', 'rare', 'epic', 'legendary'].every((r) => lit(A.gemGrid(r).px) > 15), '5 the four shard gems draw');
ok(new Set(['common', 'rare', 'epic', 'legendary'].map((r) => A.gemGrid(r).px.join(','))).size === 4, '5 and each in its rarity');

/* 6. THE COIN IS CLEAN PIXEL ART ON A WHOLE PIXEL GRID (B14, 2026-10-17).
   The old coin was an 8 cell octagon with a checker for a face, shown at 12,
   14, 18 and 24px (1.5 to 2.25 pixels a cell), and the top bar's coin was a
   round CSS gradient with no pixels at all. The coin is now a 12 cell round
   coin (rim, struck ring, raised bar), and every coin, gem, item icon and
   pack the shop and the closet draw is a whole number of CSS pixels a cell.
   Read from the CSS the files inject, so a size between cells fails here. */
const C = A.COIN;
ok(C && C.length === 12 && C.every((r) => r.length === 12) && A.COIN_N === 12, '6 the coin is a 12 by 12 grid (' + (C ? C.length + 'x' + C[0].length : 'none') + ')');
const sil = (C || []).map((r) => r.replace(/[^.]/g, '#'));
ok(sil.length && sil.every((r) => r === [...r].reverse().join('')) && sil.join() === [...sil].reverse().join(), '6 its outline is round: the same mirrored left to right and top to bottom');
ok(sil.length && sil.every((r) => (r.match(/#+/g) || []).length === 1), '6 and solid, with no hole in any row');
const cg = A.coinGrid(), cols = new Set(cg.px.filter(Boolean));
ok(cols.size >= 6 && lit(cg.px) >= 100, '6 the coin is shaded, not flat (' + cols.size + ' colours, ' + lit(cg.px) + ' cells)');
const src = (f) => fs.readFileSync(new URL('./' + f, import.meta.url), 'utf8');
/* every width a class is given in a file's CSS strings */
function widths(file, cls){
  const t = src(file), out = [];
  const re = new RegExp("'([^']*\\." + cls + "(?![\\w-])[^'{]*)\\{([^}]*)\\}", 'g');
  for (const m of t.matchAll(re)) { const w = /(?:^|;)width:(\d+(?:\.\d+)?)px/.exec(m[2]); if (w) out.push(+w[1]); }
  return out;
}
const GRID = [
  ['shop-ui.js', ['sh-coinbig', 'sh-coini'], A.COIN_N || 8, 'coin'], ['closet-ui.js', ['cl-coin'], A.COIN_N || 8, 'coin'], ['career-kit.js', ['k-cb'], A.COIN_N || 8, 'coin'],
  ['shop-ui.js', ['sh-gem', 'sh-gemi', 'sh-gembig'], 7, 'gem'],
  ['shop-ui.js', ['sh-cicon', 'sh-ricon', 'sh-ticon'], A.ICON, 'icon'], ['closet-ui.js', ['cl-ic', 'cl-si'], A.ICON, 'icon'],
  ['shop-ui.js', ['sh-bob', 'sh-fpack', 'sh-wpack', 'sh-flimg', 'sh-float'], A.PW, 'pack'], ['closet-ui.js', ['cl-pkimg'], A.PW, 'pack'],
];
const off = [], seenW = [];
for (const [f, list, n, what] of GRID) for (const cls of list) {
  const ws = widths(f, cls);
  if (!ws.length) off.push(cls + ' has no width');
  for (const w of ws) { seenW.push(cls); if (w % n) off.push(cls + ' ' + w + 'px is ' + (w / n).toFixed(2) + 'px ' + (what === 'icon' ? 'an ' : 'a ') + what + ' cell'); }
}
ok(seenW.length >= 17, '6 the sizes are found in the CSS (' + seenW.length + ')');
ok(!off.length, '6 every coin, gem, icon and pack in the shop, the closet and the top bar is a whole number of pixels a cell (' + off.join('; ') + ')');

console.log((fails ? 'FAILED ' : 'ok ') + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
