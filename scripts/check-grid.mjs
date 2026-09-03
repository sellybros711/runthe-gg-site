#!/usr/bin/env node
/* check-grid.mjs — the daily grid must be solvable by a person, every day.
 *
 * The failure mode this guards is the one three other games already had: a
 * puzzle built from every row in the database rather than from the players
 * anyone can name. A grid can be "valid" — an answer exists — and still be
 * unplayable, because the only answer is a 1974 backup nobody has heard of.
 *
 * So these tests do not check that grids generate. They check that every cell
 * of every grid, for a month, has several answers a fan could actually produce,
 * and that the boards do not all look the same.
 *
 *   node scripts/check-grid.mjs
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const R = '/home/user/runthe-gg-site/arcade/';
const win = {}; globalThis.window = win; globalThis.self = win;
for (const f of ['match/entities.js','former.js','stars.js','awards.js','supplement.js','data.js'])
  try { new Function('window','self','module','exports', readFileSync(R+f,'utf8'))(win, win, undefined, undefined); } catch (e) {}
const G = require('../arcade/grid/generator.js');
const ENT = win.GRID_ENTITIES, KNOWN = win.RTG_KNOWN;
const byId = {}; ENT.forEach(e => { byId[e.id] = e; });

let pass = 0, fail = 0; const bad = [];
const is = (a, b, what) => {
  if (a === b) { pass++; return; }
  fail++; bad.push(`${what}\n      expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};
const ok = (cond, what) => is(!!cond, true, what);

const DAYS = Array.from({ length: 30 }, (_, i) =>
  new Date(Date.UTC(2026, 7, 16 + i)).toISOString().slice(0, 10));

for (const sport of [null, 'NBA', 'NFL', 'MLB']) {
  const label = sport || 'ALL';
  let built = 0, minCell = Infinity, totalCells = 0, sumAnswers = 0;
  const rowLabels = new Set(), colKinds = {}, dupes = [];
  const seen = new Set();

  for (const d of DAYS) {
    const g = G.build((sport ? sport.toLowerCase() + '-' : '') + d, { entities: ENT, known: KNOWN, sport });
    if (!g) continue;
    built++;

    // every cell has to be fillable by a recognisable player
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const ids = g.cells[`${r},${c}`] || [];
      totalCells++; sumAnswers += ids.length;
      if (ids.length < minCell) minCell = ids.length;
      if (ids.length < G.MIN_ANSWERS) bad.push(`${label} ${d}: cell ${r},${c} has only ${ids.length}`);
      // and the stored answers must genuinely satisfy both constraints
      if (ids.length && !G.satisfies(byId[ids[0]], g.rows[r], g.cols[c]))
        bad.push(`${label} ${d}: cell ${r},${c} lists a player who does not satisfy it`);
      // ...and be someone a fan could name
      if (ids.length && !KNOWN(byId[ids[0]]))
        bad.push(`${label} ${d}: cell ${r},${c} answer is not recognisable`);
    }
    // no constraint may appear twice on the board
    const all = [...g.rows, ...g.cols].map(c => c.k + '|' + c.v);
    if (new Set(all).size !== 6) dupes.push(d);
    g.rows.forEach(c => rowLabels.add(c.label));
    g.cols.forEach(c => { colKinds[c.k] = (colKinds[c.k] || 0) + 1; });
    seen.add(all.join('//'));
  }

  is(built, DAYS.length, `${label}: a grid every day`);
  ok(minCell >= G.MIN_ANSWERS, `${label}: thinnest cell has at least ${G.MIN_ANSWERS} answers (was ${minCell})`);
  is(dupes.length, 0, `${label}: no constraint repeats on a board`);
  is(seen.size, built, `${label}: every day is a different board`);
  ok(rowLabels.size >= 10, `${label}: rows draw on many franchises (${rowLabels.size})`);
  ok(Object.keys(colKinds).length >= 2, `${label}: columns are not all one kind (${JSON.stringify(colKinds)})`);
  console.log(`${label.padEnd(4)} ${built}/30 grids | thinnest cell ${minCell} | avg answers/cell ${(sumAnswers/totalCells).toFixed(1)} | row franchises ${rowLabels.size} | col kinds ${JSON.stringify(colKinds)}`);
}

/* Determinism: the archive replays past days, and everyone must get the same
   board on the same date, so the same seed has to produce the same grid. */
const a = G.build('2026-09-01', { entities: ENT, known: KNOWN });
const b = G.build('2026-09-01', { entities: ENT, known: KNOWN });
is(JSON.stringify(a.rows) + JSON.stringify(a.cols), JSON.stringify(b.rows) + JSON.stringify(b.cols),
  'determinism: one seed, one grid');
const c = G.build('2026-09-02', { entities: ENT, known: KNOWN });
ok(JSON.stringify(a.rows) + JSON.stringify(a.cols) !== JSON.stringify(c.rows) + JSON.stringify(c.cols),
  'determinism: a different day is a different grid');

/* Grading is a different question from generation: the puzzle is built from
   players a fan can name, but ANY real player who fits should count. */
const g = G.build('2026-09-03', { entities: ENT, known: KNOWN });
const cell = g.cells['0,0'];
ok(cell.length >= 3, 'grading: the sample cell has answers');
ok(G.satisfies(byId[cell[0]], g.rows[0], g.cols[0]), 'grading: a listed answer satisfies both axes');
const wrong = ENT.find(e => e.id !== cell[0] && !G.satisfies(e, g.rows[0], g.cols[0]));
is(G.satisfies(wrong, g.rows[0], g.cols[0]), false, 'grading: a player who does not fit is rejected');

console.log('\n' + (bad.length ? bad.slice(0, 12).map(b => '  FAIL ' + b).join('\n') + '\n' : ''));
console.log(`${pass} passed, ${fail + bad.filter(b => !b.includes('expected')).length} failed`);
process.exit(fail || bad.some(b => !b.includes('expected')) ? 1 : 0);
