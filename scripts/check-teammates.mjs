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
import { readFileSync, readdirSync } from 'node:fs';
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

/* ---- one record is one man ---------------------------------------------------
 * jerseys.js keys on the name, so a father and a son arrive as one record, and
 * 68 of its 2323 names were exactly that. Zach Thomas held Miami from 1996 at
 * number 54 and the Rams, Texans, Colts and Titans from 2023 at 57, 74, 64 and
 * 72: a Hall of Fame linebacker and an offensive lineman who was two when the
 * first was drafted. Merged, he is a BRIDGE, and Chain will route a 1996
 * Dolphin to a 2026 Titan through him in three links.
 *
 * That failure is invisible from inside: the deck and the routes above are both
 * derived from the same graph, so the check confirms a route that cannot be
 * walked. It has to be caught on the shape of a career instead. The builder
 * splits at an 11 year hole, so nothing here should carry one. */
{
  const HOLE = 11;
  const wide = [];
  D.players.forEach((p, i) => {
    const st = p[3].slice().sort((a, b) => a[1] - b[1] || a[2] - b[2]);
    let reach = 0;
    for (const s of st) {
      if (reach && s[1] - reach >= HOLE) {
        wide.push(name(i) + ' (' + sport(i) + '): nothing between ' + reach + ' and ' + s[1]);
        break;
      }
      reach = Math.max(reach, s[2]);
    }
  });
  if (wide.length) {
    bad.push(wide.length + ' record' + (wide.length === 1 ? '' : 's') +
      ' span a gap of ' + HOLE + ' years or more, which is two men under one name: ' +
      wide.slice(0, 4).join('; '));
  }
}

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

/* ---- every printed slot is on its own answer key -----------------------------
 * Roll Call prints the recognizable part of a squad as blanks and judges
 * everything else against arcade/rosters/<sport>-<decade>.js. A slot whose man
 * is missing from that page is a board asking for a name its own roster would
 * deny, and the first cut of these files had 383 of them: the NFL fetch was
 * filtering on a weekly status column that has A.J. Brown down as inactive.
 * Nothing about it FAILED, because the on-board branch runs before the roster
 * lookup, which is exactly why it needs asserting here rather than noticing. */
const RD = 'arcade/rosters';
let shards = null;
try { shards = readdirSync(RD).filter((f) => /-\d{4}\.js$/.test(f)); } catch (e) { shards = null; }
if (!shards || !shards.length) {
  console.log('note: no roster shards in ' + RD + ' yet, skipping the slot check');
} else {
  const box = { console };
  box.self = box; box.window = box; box.globalThis = box;
  createContext(box);
  for (const f of shards) runInContext(readFileSync(RD + '/' + f, 'utf8'), box);
  const nk = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
  const lk = (x) => nk(String(x || '').replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, ''));
  let noPage = 0, checked = 0;
  for (const r of D.roll) {
    const sp = sport(r[2][0]);
    const pack = box['RTG_ROSTERS_' + sp + '_' + (Math.floor(r[1] / 10) * 10)];
    const ti = pack ? pack.teams.indexOf(D.teams[r[0]]) : -1;
    const list = (ti >= 0) ? (pack.r[ti] || {})[r[1]] : null;
    if (!list) { noPage++; continue; }
    checked++;
    const exact = new Set(list.map((x) => nk(pack.names[x[0]])));
    const fuzzy = new Set(list.map((x) => lk(pack.names[x[0]])));
    for (const i of r[2]) {
      const n = name(i);
      if (!exact.has(nk(n)) && !fuzzy.has(lk(n))) {
        bad.push('board ' + D.teams[r[0]] + ' ' + r[1] + ': ' + n +
                 ' is a printed slot but is not on its own roster page');
      }
    }
  }
  if (noPage) bad.push(noPage + ' of ' + D.roll.length + ' boards have no roster page in ' + RD);
  console.log('roster pages: ' + checked + ' of ' + D.roll.length + ' boards checked against theirs');
}

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
