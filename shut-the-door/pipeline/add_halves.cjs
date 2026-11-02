/* Rules 8: a committed pack becomes the closer's outing to the end of the game.
 *
 *   node shut-the-door/pipeline/add_halves.cjs <committed pack.json> <staged pack.json> <out pack.json>
 *
 * The staged pack is build_packs.py's run on the spot after halves.py wrote its halves into the
 * verify file: the same batters in the same order, then the later halves' new batters (a defensive
 * substitution, a pinch hitter), and scenario.halves, between and line. This keeps every part of
 * the committed pack as it is (its first batters' library, the pitches they point at, the
 * advancement table, the arsenal with its speeds and spin) and adds only what the later halves
 * need, so an outing played under rules 7 on the first half replays exactly:
 *   - each new batter's record and library, his real pitches appended to pack.pitches (the
 *     committed pitches keep their indices)
 *   - scenario.halves, between, line, the setup and realFaced, the sources
 *   - reveal (every half he pitched) and reveal1 (the first half's, what a rules 7 outing is shown)
 * pool.js then solves the table over every half and plays the pool through them.
 */
'use strict';
const fs = require('fs');
const [a, b, out] = process.argv.slice(2);
const pack = JSON.parse(fs.readFileSync(a, 'utf8'));
const stage = JSON.parse(fs.readFileSync(b, 'utf8'));
const sc = pack.scenario, ss = stage.scenario;
if (!ss.halves || ss.halves.length < 2) throw new Error('the staged pack has one half');
const n = sc.batters.length, n0 = pack.pitches.length;
for (let i = 0; i < n; i++) {
  if (String(sc.batters[i].id) !== String(ss.batters[i].id)) throw new Error(`batter ${i} is ${sc.batters[i].name} here and ${ss.batters[i].name} staged`);
  if (JSON.stringify(sc.batters[i]) !== JSON.stringify(ss.batters[i])) throw new Error(`batter ${i} (${sc.batters[i].name}) was built differently`);
}
const byId = new Map(pack.pitches.map((p, i) => [p[0], i]));
const ref = v => {
  if (v == null || v < 0) return v;
  const p = stage.pitches[Math.floor(v / 3)];
  let i = byId.get(p[0]);
  if (i == null) { i = pack.pitches.length; pack.pitches.push(p); byId.set(p[0], i); }
  return i * 3 + (v % 3);
};
for (let i = n; i < ss.batters.length; i++) {
  sc.batters.push(ss.batters[i]);
  const lib = {};
  for (const [t, e] of Object.entries(stage.library[i])) lib[t] = { p: e.p, x: e.x.map(row => row.map(ref)) };
  pack.library.push(lib);
}
for (const k of ['halves', 'between', 'line', 'setup', 'realFaced', 'sources']) sc[k] = ss[k];
pack.reveal1 = pack.reveal;
pack.reveal = stage.reveal;
fs.writeFileSync(out, JSON.stringify(pack));
console.log(`${sc.id}: ${ss.batters.length - n} batter(s) added (${ss.batters.slice(n).map(x => x.name).join(', ')}), ` +
  `${pack.pitches.length - n0} pitches added, halves ${sc.halves.map(h => h.half + ' ' + h.inning).join(', ')}`);
