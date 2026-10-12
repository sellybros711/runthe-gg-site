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
 */
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

console.log((fails ? 'FAILED ' : 'ok ') + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
