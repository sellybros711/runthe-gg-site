/* The dense mini crossword's validator (arcade/crossword/mini.js).
 *
 *   node scripts/check-crossword-mini.mjs           365 days from today
 *   node scripts/check-crossword-mini.mjs 60        a quicker run
 *   node scripts/check-crossword-mini.mjs --show 3  print the first three grids
 *
 * The rules a mini has to keep, every day:
 *   1. 5x5, or 6x6 with blocked corners. Rows are the size given.
 *   2. Every entry is three to five letters, and every maximal run of white
 *      cells across and down is exactly one entry. Nothing extra, nothing
 *      missing.
 *   3. Every white cell is in an across entry AND a down entry: every letter
 *      is crossed.
 *   4. The answers in the entries are the letters in the grid, and the
 *      numbering is the standard reading-order numbering.
 *   5. A clue is one short line: no line break, under 75 characters (a player
 *      clue) or 43 (a word clue), no dash, and never the answer inside it.
 *   6. At most two clues need real knowledge (the player answers), and no
 *      two of them cross. So every letter of a hard answer is crossed by an
 *      everyday word or a sports term: it can be got from the crossings.
 *   7. No answer twice in one grid.
 *   8. The same date makes the same grid.
 * Plus, over the whole run: every day makes a grid, and the word list itself
 * keeps the clue rules.
 */
import { createRequire } from 'module';
const require = createRequire(new URL('../', import.meta.url));
globalThis.window = globalThis; globalThis.self = globalThis;

globalThis.GRID_ENTITIES = require('./arcade/match/entities.js');
for (const f of ['./arcade/former.js', './arcade/stars.js', './arcade/awards.js',
                 './arcade/supplement.js', './arcade/cluebank.js', './arcade/primary.js',
                 './arcade/franchise.js', './arcade/data.js', './arcade/flags.js', './arcade/fame.js',
                 './arcade/crossword/gen.js', './arcade/crossword/data/mini-words.js']) {
  require(f);
}
const MINI = require('./arcade/crossword/mini.js');
const WORDS = globalThis.RTG_MINIWORDS;

const args = process.argv.slice(2);
const showAt = args.indexOf('--show');
const SHOW = showAt >= 0 ? +args[showAt + 1] || 3 : 0;
const DAYS = +args.find(a => /^\d+$/.test(a) && args.indexOf(a) !== showAt + 1) || 365;

let fails = 0;
const bad = m => { fails++; if (fails <= 40) console.log('  FAIL ' + m); };
const DASH = new RegExp("[" + String.fromCharCode(8211, 8212) + "]");

/* ---- the word list ------------------------------------------------------- */
console.log('word list');
const seenW = new Set();
const lens = {};
for (const [w, c, k] of WORDS) {
  if (!/^[A-Z]{3,5}$/.test(w)) bad(`${w}: not three to five letters A to Z`);
  if (seenW.has(w)) bad(`${w}: listed twice`);
  seenW.add(w);
  lens[w.length] = (lens[w.length] || 0) + 1;
  if (k !== 'w' && k !== 's') bad(`${w}: kind "${k}" is not w or s`);
  if (typeof c !== 'string' || !c.trim()) bad(`${w}: no clue`);
  else {
    if (/\n/.test(c)) bad(`${w}: clue has a line break`);
    if (c.length > 42) bad(`${w}: clue is ${c.length} characters: ${c}`);
    if (DASH.test(c)) bad(`${w}: clue has a dash: ${c}`);
    if (c.toUpperCase().split(/[^A-Z]+/).includes(w)) bad(`${w}: the answer is in its own clue: ${c}`);
  }
}
console.log(`  ${WORDS.length} words (${Object.entries(lens).map(([l, n]) => l + ' letters ' + n).join(', ')})`);

/* ---- the grids ----------------------------------------------------------- */
function runs(rows) {
  const S = rows.length, out = [];
  for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) {
    if (rows[r][c] === '#') continue;
    if ((c === 0 || rows[r][c - 1] === '#') && c + 1 < S && rows[r][c + 1] !== '#') {
      let e = c; while (e < S && rows[r][e] !== '#') e++; out.push({ dir: 'A', r, c, len: e - c });
    }
    if ((r === 0 || rows[r - 1][c] === '#') && r + 1 < S && rows[r + 1][c] !== '#') {
      let e = r; while (e < S && rows[e][c] !== '#') e++; out.push({ dir: 'D', r, c, len: e - r });
    }
  }
  return out;
}
function cellsOf(e) {
  const out = [];
  for (let k = 0; k < e.answer.length; k++) out.push((e.r + (e.dir === 'D' ? k : 0)) + ',' + (e.c + (e.dir === 'A' ? k : 0)));
  return out;
}
function check(P, day) {
  const S = P.size, rows = P.rows;
  if (S !== 5 && S !== 6) bad(`${day}: size ${S}`);
  if (!Array.isArray(rows) || rows.length !== S || rows.some(r => r.length !== S)) { bad(`${day}: rows are not ${S} by ${S}`); return; }
  // 2. runs are entries, one to one, 3 to 5 long
  const R = runs(rows);
  const key = e => e.dir + e.r + ',' + e.c;
  const byKey = new Map(P.entries.map(e => [key(e), e]));
  if (R.length !== P.entries.length) bad(`${day}: ${R.length} runs but ${P.entries.length} entries`);
  for (const run of R) {
    const e = byKey.get(key(run));
    if (!e) { bad(`${day}: a run at ${key(run)} has no entry`); continue; }
    if (e.answer.length !== run.len) bad(`${day}: ${e.answer} is ${e.answer.length} letters in a ${run.len} run`);
    if (run.len < 3 || run.len > 5) bad(`${day}: an entry of ${run.len} letters`);
  }
  // 3. every white cell crossed
  const across = new Set(), down = new Set();
  for (const e of P.entries) for (const k of cellsOf(e)) (e.dir === 'A' ? across : down).add(k);
  for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) {
    if (rows[r][c] === '#') continue;
    if (!across.has(r + ',' + c) || !down.has(r + ',' + c)) bad(`${day}: cell ${r},${c} is not crossed`);
  }
  // 4. letters match, numbering
  for (const e of P.entries) {
    cellsOf(e).forEach((k, i) => { const [r, c] = k.split(',').map(Number); if (rows[r][c] !== e.answer[i]) bad(`${day}: ${e.answer} does not match the grid`); });
  }
  const starts = [...new Set(R.map(x => x.r * 10 + x.c))].sort((a, b) => a - b);
  for (const e of P.entries) if (starts.indexOf(e.r * 10 + e.c) + 1 !== e.num) bad(`${day}: ${e.dir}${e.num} is numbered wrong`);
  // 5. clues
  for (const e of P.entries) {
    const c = String(e.clue || '');
    const max = e.deep ? 74 : 42;
    if (!c) bad(`${day}: ${e.answer} has no clue`);
    if (/\n/.test(c)) bad(`${day}: ${e.answer} clue has a line break`);
    if (c.length > max) bad(`${day}: ${e.answer} clue is ${c.length} characters: ${c}`);
    if (DASH.test(c)) bad(`${day}: ${e.answer} clue has a dash`);
    if (c.toUpperCase().replace(/[^A-Z]/g, ' ').split(/\s+/).includes(e.answer)) bad(`${day}: ${e.answer} is in its own clue: ${c}`);
  }
  // 6. at most two deep, none crossing
  const deep = P.entries.filter(e => e.deep);
  if (deep.length > 2) bad(`${day}: ${deep.length} clues that need real knowledge`);
  for (let i = 0; i < deep.length; i++) for (let j = i + 1; j < deep.length; j++) {
    const a = new Set(cellsOf(deep[i]));
    if (cellsOf(deep[j]).some(k => a.has(k))) bad(`${day}: ${deep[i].answer} and ${deep[j].answer} cross`);
  }
  for (const d of deep) {
    for (const k of cellsOf(d)) {
      const crosser = P.entries.find(e => e !== d && e.dir !== d.dir && cellsOf(e).includes(k));
      if (!crosser || crosser.deep) bad(`${day}: a letter of ${d.answer} is not crossed by an easy entry`);
    }
  }
  // 7. no repeats
  const ans = P.entries.map(e => e.answer);
  if (new Set(ans).size !== ans.length) bad(`${day}: an answer appears twice`);
}

console.log(`grids, ${DAYS} days`);
const t0 = Date.now();
const start = new Date();
const stats = { made: 0, size: {}, deep: {}, maxMs: 0, players: new Map(), words: new Map() };
for (let d = 0; d < DAYS; d++) {
  const dt = new Date(start.getTime() + d * 864e5);
  const day = dt.toISOString().slice(0, 10);
  const a = Date.now();
  const P = MINI.forDate(day);
  const ms = Date.now() - a;
  stats.maxMs = Math.max(stats.maxMs, ms);
  if (!P) { bad(`${day}: no grid`); continue; }
  stats.made++;
  stats.size[P.size] = (stats.size[P.size] || 0) + 1;
  const nd = P.entries.filter(e => e.deep).length;
  stats.deep[nd] = (stats.deep[nd] || 0) + 1;
  for (const e of P.entries) {
    const m = e.deep ? stats.players : stats.words;
    m.set(e.answer, (m.get(e.answer) || 0) + 1);
  }
  check(P, day);
  if (d < 3) {
    const again = JSON.stringify(MINI.forDate(day));
    if (again !== JSON.stringify(P)) bad(`${day}: the same date made a different grid`);
  }
  if (d < SHOW) {
    console.log('\n' + day + '\n' + P.rows.join('\n'));
    for (const e of P.entries) console.log(`  ${e.num}${e.dir} ${e.answer.padEnd(5)} ${e.deep ? '*' : ' '} ${e.clue}`);
  }
}
const top = m => [...m].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w, n]) => w + ' ' + n).join(', ');
console.log(`  ${stats.made} of ${DAYS} days made a grid in ${((Date.now() - t0) / 1000).toFixed(1)}s (slowest day ${stats.maxMs}ms)`);
console.log(`  sizes ${JSON.stringify(stats.size)}, player answers per grid ${JSON.stringify(stats.deep)}`);
console.log(`  ${stats.words.size} different words used; most used: ${top(stats.words)}`);
console.log(`  ${stats.players.size} different players; most used: ${top(stats.players)}`);
if (stats.maxMs > 1500) bad(`the slowest day took ${stats.maxMs}ms to build, which a phone will feel`);

console.log(fails ? `\n${fails} problem(s)` : '\nall rules hold');
process.exit(fails ? 1 : 0);
