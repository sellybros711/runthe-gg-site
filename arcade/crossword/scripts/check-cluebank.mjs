/* Validate arcade/cluebank.js against the live corpus.
 *
 * A curated clue is only useful if it actually reaches a player, so this fails
 * loudly on:
 *   - a name the corpus does not contain (typo, wrong spelling, wrong sport)
 *   - a clue that contains the player's own surname (the crossword answer)
 *   - a predicate that does not start with "who"/"whose"/"an "/"the ", which
 *     both games rely on to build their sentence
 *   - a duplicate (sport, name) entry
 * and reports how much of the crossword's real answer flow the bank covers.
 *
 * Run: node arcade/crossword/scripts/check-cluebank.mjs
 */
import { createRequire } from 'module';
const require = createRequire(new URL('../../../', import.meta.url));
globalThis.window = globalThis; globalThis.self = globalThis;

globalThis.GRID_ENTITIES = require('./arcade/match/entities.js');
globalThis.RTG_CLUES = require('./arcade/cluebank.js');
for (const f of ['./arcade/former.js', './arcade/stars.js', './arcade/awards.js',
                 './arcade/supplement.js', './arcade/data.js']) {
  try { require(f); } catch (e) { /* optional layers */ }
}
const corpus = globalThis.GRID_ENTITIES || [];
const BANK = require('./arcade/cluebank.js');
const gen = require('./arcade/crossword/gen.js');

let errors = 0;
const err = m => { console.error('  FAIL ' + m); errors++; };

/* ---- 1. every curated name resolves to a corpus entity ------------------- */
const byKey = new Map();
for (const e of corpus) {
  if (!e || !e.name || !e.sport) continue;
  byKey.set(BANK.key(e.sport, e.name), e);
}
const seen = new Set();
// Parse only the data array — the file's header comment shows an example
// entry in the same shape, and counting it would fake a duplicate.
const srcAll = require('fs').readFileSync(new URL('../../cluebank.js', import.meta.url), 'utf8');
const src = srcAll.slice(srcAll.indexOf('var P = ['));
const entries = [...src.matchAll(/\{\s*n:'((?:[^'\\]|\\.)*)',\s*s:'(NBA|NFL|MLB)'/g)]
  .map(m => ({ n: m[1].replace(/\\'/g, "'"), s: m[2] }));

console.log(`cluebank: ${BANK.players} players, ${BANK.clues} clues`);
console.log(`parsed ${entries.length} entry headers from source\n`);
if (entries.length !== BANK.players) err(`parsed ${entries.length} headers but module reports ${BANK.players} players`);

console.log('1) names resolve against the corpus');
for (const { n, s } of entries) {
  const k = BANK.key(s, n);
  if (seen.has(k)) err(`duplicate entry: ${s} ${n}`);
  seen.add(k);
  if (!byKey.has(k)) err(`no corpus entity for ${s} "${n}"`);
}
if (!errors) console.log('  ok — every curated player exists in the corpus');

/* ---- 2. clue hygiene ------------------------------------------------------ */
console.log('\n2) clue hygiene (no leaked surname, valid predicate opener)');
const before = errors;
for (const { n, s } of entries) {
  const parts = n.trim().split(/\s+/).filter(p => !/^(Jr\.?|Sr\.?|II|III|IV)$/i.test(p));
  const surname = (parts[parts.length - 1] || '').replace(/[^A-Za-z]/g, '').toLowerCase();
  for (const c of BANK.get(s, n)) {
    if (!/^(whose |who )/.test(c.x)) err(`${s} ${n}: predicate must open with who/whose -> "${c.x.slice(0, 48)}..."`);
    if (surname.length > 2 && new RegExp('\\b' + surname + '\\b', 'i').test(c.x))
      err(`${s} ${n}: clue leaks the answer "${surname}"`);
    if (/\s$/.test(c.x) || /[.]$/.test(c.x)) err(`${s} ${n}: predicate should not end with a period or space`);
  }
}
if (errors === before) console.log('  ok — no leaked answers, all predicates well-formed');

/* ---- 3. coverage of the crossword's actual answer flow -------------------- */
console.log('\n3) coverage of a year of crossword answers');
const pool = gen._internal.buildPool(corpus);
const poolBy = new Map(pool.map(p => [p.w, p]));
let playerSlots = 0, coveredSlots = 0;
const uncovered = new Map();
const d0 = new Date('2026-08-13T00:00:00Z');
for (let i = 0; i < 365; i++) {
  const d = new Date(d0.getTime() + i * 86400000).toISOString().slice(0, 10);
  const p = gen.forDate(d, corpus);
  if (!p) continue;
  for (const en of p.entries) {
    const pw = poolBy.get(en.answer);
    if (!pw || !pw.e) continue;
    playerSlots++;
    if (BANK.has(pw.e.sport, pw.e.name)) coveredSlots++;
    else uncovered.set(pw.e.sport + '|' + pw.e.name, (uncovered.get(pw.e.sport + '|' + pw.e.name) || 0) + 1);
  }
}
const pct = playerSlots ? (100 * coveredSlots / playerSlots).toFixed(1) : '0';
console.log(`  ${coveredSlots}/${playerSlots} player clue slots curated (${pct}%)`);
const top = [...uncovered.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
console.log('  most-used players still on the generated fallback:');
top.forEach(([k, n]) => console.log(`    ${String(n).padStart(2)}x  ${k}`));

console.log(errors ? `\n${errors} FAILURE(S)` : '\nALL CHECKS PASS');
process.exit(errors ? 1 : 0);
