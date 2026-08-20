#!/usr/bin/env node
/* check-teammates.mjs
 *
 * Reads arcade/teammates.js the way a browser does and asserts the two decks
 * are honest, using only what ships. The build script and the games each
 * derive teammate adjacency from the stints; this proves the derivation the
 * games will run agrees with the deck the builder wrote.
 *
 * What it asserts:
 *   Roll Call  every player in a team season really holds a stint at that club
 *              covering that year, and the board is between 6 and 16 names
 *   Chain      the shortest route between the two endpoints is EXACTLY the
 *              number of links the deck claims. One link fewer and the puzzle
 *              shows too many slots and cannot be filled; one more and it is
 *              unsolvable in the slots given.
 *
 *   node scripts/check-teammates.mjs
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const root = new URL('..', import.meta.url).pathname;
const ctx = createContext({});
ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx;
runInContext(readFileSync(root + 'arcade/teammates.js', 'utf8'), ctx, { filename: 'teammates.js' });
const D = ctx.RTG_TEAMMATES;
if (!D || !D.players) fail('arcade/teammates.js did not define RTG_TEAMMATES');

const bad = [];
const name = (i) => (D.players[i] ? D.players[i][0] : '#' + i);
const sport = (i) => D.sports[D.players[i][1]];
const stints = (i) => D.players[i][3];

// ---- adjacency, derived exactly as the game pages derive it -----------------
const rosters = new Map();
D.players.forEach((p, i) => p[3].forEach((s) => {
  const k = p[1] + '|' + s[0];
  if (!rosters.has(k)) rosters.set(k, []);
  rosters.get(k).push([i, s[1], s[2]]);
}));
const adj = D.players.map(() => new Set());
for (const list of rosters.values()) {
  for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
    const x = list[a], y = list[b];
    if (x[0] === y[0] || x[1] > y[2] || y[1] > x[2]) continue;
    adj[x[0]].add(y[0]); adj[y[0]].add(x[0]);
  }
}

// ---- Roll Call ---------------------------------------------------------------
let rollNames = 0;
D.roll.forEach(([team, year, ids], n) => {
  if (ids.length < 6 || ids.length > 16) {
    bad.push('roll #' + n + ' ' + year + ' ' + D.teams[team] + ': ' + ids.length + ' names');
  }
  rollNames += ids.length;
  for (const i of ids) {
    const ok = stints(i).some((s) => s[0] === team && s[1] <= year && year <= s[2]);
    if (!ok) bad.push('roll #' + n + ' ' + year + ' ' + D.teams[team] + ': ' + name(i) + ' has no stint there that year');
  }
  const sports = new Set(ids.map((i) => sport(i)));
  if (sports.size > 1) bad.push('roll #' + n + ' mixes sports: ' + [...sports].join(', '));
});

// ---- Chain -------------------------------------------------------------------
function dist(from, to, cap) {
  if (from === to) return 0;
  const seen = new Int16Array(D.players.length).fill(-1);
  seen[from] = 0;
  const q = [from];
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    if (seen[c] >= cap) continue;
    for (const n of adj[c]) {
      if (seen[n] >= 0) continue;
      seen[n] = seen[c] + 1;
      if (n === to) return seen[n];
      q.push(n);
    }
  }
  return -1;
}
D.chain.forEach(([a, b, links], n) => {
  const d = dist(a, b, links + 1);
  if (d !== links) {
    bad.push('chain #' + n + ' ' + name(a) + ' to ' + name(b) + ': deck says ' + links +
             ' links, the graph says ' + (d < 0 ? 'no route within ' + (links + 1) : d));
  }
  if (sport(a) !== sport(b)) bad.push('chain #' + n + ' crosses sports: ' + name(a) + ' / ' + name(b));
});

// ---- report ------------------------------------------------------------------
if (bad.length) {
  console.error(bad.length + ' problem' + (bad.length === 1 ? '' : 's') + ' in arcade/teammates.js\n');
  bad.slice(0, 25).forEach((b) => console.error('  ' + b));
  if (bad.length > 25) console.error('  ... and ' + (bad.length - 25) + ' more');
  process.exit(1);
}
console.log('teammates ok: ' + D.players.length + ' players, ' +
  D.roll.length + ' Roll Call boards (' + Math.round(rollNames / D.roll.length) + ' names each), ' +
  D.chain.length + ' Chain pairs, every route confirmed at its stated length');

function fail(m) { console.error(m); process.exit(1); }
