#!/usr/bin/env node
/* build-teammates.mjs
 *
 * Builds arcade/teammates.js, the data file behind two games:
 *
 *   Roll Call : one club, one season, name as many of that roster as you can
 *   Chain     : two players, connect them through shared teammates
 *
 * Both questions are the same fact seen from two sides ("who was there with
 * whom, and when"), so they share one file rather than two that can disagree.
 *
 * WHERE IT COMES FROM. arcade/jerseys.js holds 7,000 jersey stints as
 * (player, club, first year, last year, number). A stint is a roster
 * membership with dates on it, which is exactly what both games need. The
 * stints are joined by name and sport to the merged entity pool that every
 * other game reads (entities.js + former.js + stars.js + awards.js +
 * supplement.js, folded together by data.js).
 *
 * WHO IS IN. RTG_KNOWN, the arcade's one shared answer to "would a fan
 * recognise this name?". Not a fame number: fame 4 is most of the file, and
 * lasting eight years in the NFL is longevity rather than fame. Using the
 * shared test means these two games hold exactly the bar the other nine hold,
 * and any future widening of it reaches all eleven at once.
 *
 * WHAT COMES OUT. window.RTG_TEAMMATES:
 *   sports  [name]                     index space for the arrays below
 *   teams   [name]
 *   players [name, sportIdx, fame, [[teamIdx, y0, y1, number], ...]]
 *   roll    [[teamIdx, year, [playerIdx, ...]], ...]   Roll Call's deck
 *   chain   [[fromIdx, toIdx, links], ...]             Chain's deck
 *
 * Adjacency is NOT shipped. Two players are teammates when they hold stints at
 * the same club whose year ranges overlap, which the page derives at load in a
 * few milliseconds from the stints it already has. Shipping 13,000 edges as
 * well would be the same fact stored twice, and the copy that drifts is always
 * the derived one.
 *
 * Reads only files already in the repo, so it runs offline.
 *
 *   node scripts/build-teammates.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const root = new URL('..', import.meta.url).pathname;

/* The arcade's data layer is browser UMD: it hangs itself off `self`. A vm
   context with self pointing at itself is the smallest honest browser. */
const ctx = createContext({ console });
ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx;
for (const f of ['arcade/match/entities.js', 'arcade/former.js', 'arcade/stars.js',
                 'arcade/awards.js', 'arcade/supplement.js', 'arcade/data.js',
                 'arcade/jerseys.js']) {
  runInContext(readFileSync(root + f, 'utf8'), ctx, { filename: f });
}
const ENT = ctx.GRID_ENTITIES, KNOWN = ctx.RTG_KNOWN, JERSEYS = ctx.RTG_JERSEYS;
if (!ENT || !KNOWN || !JERSEYS) throw new Error('the arcade data layer did not load');

/* Join on name and sport, not id. Curated stars live in entities.js under ids
   like "nba_lebron-james" while the scraped feeds key on gsis and personId, so
   a name join is the only one that reaches everybody. Same key the Number Game
   uses against the same file. */
const nkey = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z]/g, '');
const entBy = new Map();
for (const e of ENT) if (e && e.name && e.sport) entBy.set(e.sport + '|' + nkey(e.name), e);

// ---------- players and their stints -----------------------------------------
const SPORTS = [], TEAMS = [], iS = new Map(), iT = new Map();
const idx = (arr, map, v) => { if (!map.has(v)) { map.set(v, arr.length); arr.push(v); } return map.get(v); };

const byPlayer = new Map();
let joined = 0, skipped = 0;
for (const s of JERSEYS.stints) {
  if (!s || !s.name || !s.sport || !s.team) continue;
  const e = entBy.get(s.sport + '|' + nkey(s.name));
  if (!e || !KNOWN(e)) { skipped++; continue; }
  const y0 = +s.y0 || 0, y1 = +s.y1 || y0;
  if (!y0) continue;
  const k = s.sport + '|' + s.name;
  let p = byPlayer.get(k);
  if (!p) { p = { name: s.name, sport: s.sport, f: e.f | 0, st: [] }; byPlayer.set(k, p); }
  p.st.push({ team: s.team, y0, y1: Math.max(y0, y1), num: (s.num == null ? -1 : +s.num) });
  joined++;
}
const P = [...byPlayer.values()].sort((a, b) => a.sport.localeCompare(b.sport) || a.name.localeCompare(b.name));
P.forEach((p, i) => { p.i = i; });

// ---------- teammates ---------------------------------------------------------
/* Same club, overlapping years. Keyed by the RECORD, never by the name alone:
   name-keyed, the NFL's Chris Davis merges with the MLB's and the three sports
   appear to be one connected graph. It is the trap the two Josh Allens sprang
   on Sportegories, and it silently makes an unsolvable puzzle look solvable. */
const rosterOf = new Map();                 // "sport|team" -> [{i, y0, y1}]
for (const p of P) for (const s of p.st) {
  const k = p.sport + '|' + s.team;
  if (!rosterOf.has(k)) rosterOf.set(k, []);
  rosterOf.get(k).push({ i: p.i, y0: s.y0, y1: s.y1 });
}
const adj = P.map(() => new Set());
for (const list of rosterOf.values()) {
  for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
    const x = list[a], y = list[b];
    if (x.i === y.i || x.y0 > y.y1 || y.y0 > x.y1) continue;
    adj[x.i].add(y.i); adj[y.i].add(x.i);
  }
}

// ---------- Roll Call deck ----------------------------------------------------
/* A club and a single season. The slots ARE the answer list, so the count on
   screen is a promise: every blank has a name behind it that we hold. */
const MIN_ROSTER = 6;                       // fewer than this and the board looks thin
const MAX_ROSTER = 16;                      // more and 90 seconds is not a chance
const season = new Map();                   // "sport|team|year" -> Set(playerIdx)
for (const p of P) for (const s of p.st) {
  for (let y = s.y0; y <= s.y1; y++) {
    const k = p.sport + '|' + s.team + '|' + y;
    if (!season.has(k)) season.set(k, new Set());
    season.get(k).add(p.i);
  }
}
const roll = [];
for (const [k, set] of season) {
  if (set.size < MIN_ROSTER) continue;
  const [sport, team, year] = k.split('|');
  const ids = [...set].sort((a, b) => (P[b].f | 0) - (P[a].f | 0) || P[a].name.localeCompare(P[b].name));
  const kept = ids.slice(0, MAX_ROSTER);
  // One name on the board has to be a household one, or the round opens with
  // nothing at all to grab hold of.
  if (!kept.some((i) => (P[i].f | 0) >= 5)) continue;
  roll.push({ team, year: +year, sport, ids: kept, star: kept.reduce((n, i) => n + ((P[i].f | 0) >= 5 ? 1 : 0), 0) });
}
/* Deal the deck so consecutive days move around: a fortnight of Yankees teams
   is one club's fans playing and everybody else bouncing. Sort by sport in
   rotation, then by how star-heavy the roster is. */
roll.sort((a, b) => b.star - a.star || b.ids.length - a.ids.length);
const bySport = { NFL: [], NBA: [], MLB: [] };
for (const r of roll) (bySport[r.sport] || (bySport[r.sport] = [])).push(r);
const rollDeck = [];
for (let n = 0; rollDeck.length < roll.length; n++) {
  let moved = false;
  for (const sp of ['NFL', 'NBA', 'MLB']) {
    const q = bySport[sp];
    if (q && q[n]) { rollDeck.push(q[n]); moved = true; }
  }
  if (!moved) break;
}
const seenTeam = new Map();                 // keep one club from opening two weeks running
const spaced = [];
const pending = rollDeck.slice();
while (pending.length) {
  let took = -1;
  for (let i = 0; i < pending.length; i++) {
    const last = seenTeam.get(pending[i].sport + '|' + pending[i].team);
    if (last == null || spaced.length - last >= 10) { took = i; break; }
  }
  if (took < 0) took = 0;                   // nothing far enough away: take the next
  const r = pending.splice(took, 1)[0];
  seenTeam.set(r.sport + '|' + r.team, spaced.length);
  spaced.push(r);
}

// ---------- Chain deck --------------------------------------------------------
/* Every pair at distance 2 is one name in the middle, and there are 113,000 of
   them, which is a puzzle you solve by naming the most famous player on either
   club. Distance 3 is two names and a decision. Endpoints are icons, so the
   ask reads as a challenge rather than a quiz on somebody you half remember. */
const CHAIN_LINKS = 3;
const CHAIN_MAX = 900;
function bfs(src, cap) {
  const d = new Int16Array(P.length).fill(-1);
  d[src] = 0; const q = [src];
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    if (d[c] >= cap) continue;
    for (const n of adj[c]) if (d[n] < 0) { d[n] = d[c] + 1; q.push(n); }
  }
  return d;
}
const icons = P.filter((p) => (p.f | 0) >= 5 && adj[p.i].size > 0).map((p) => p.i);
const chain = [];
const usedEnd = new Map();
for (const a of icons) {
  const d = bfs(a, CHAIN_LINKS);
  for (const b of icons) {
    if (b <= a || d[b] !== CHAIN_LINKS) continue;
    // No player anchors more than a handful of puzzles, or the deck is six
    // people wearing different hats.
    if ((usedEnd.get(a) || 0) >= 6 || (usedEnd.get(b) || 0) >= 6) continue;
    usedEnd.set(a, (usedEnd.get(a) || 0) + 1);
    usedEnd.set(b, (usedEnd.get(b) || 0) + 1);
    chain.push([a, b, CHAIN_LINKS]);
  }
}
// rotate sports through the deck the same way Roll Call does
const chainBy = { NFL: [], NBA: [], MLB: [] };
for (const c of chain) (chainBy[P[c[0]].sport] || (chainBy[P[c[0]].sport] = [])).push(c);
const chainDeck = [];
for (let n = 0; chainDeck.length < chain.length; n++) {
  let moved = false;
  for (const sp of ['NFL', 'NBA', 'MLB']) {
    const q = chainBy[sp];
    if (q && q[n]) { chainDeck.push(q[n]); moved = true; }
  }
  if (!moved) break;
}
const chainOut = chainDeck.slice(0, CHAIN_MAX);

// ---------- emit --------------------------------------------------------------
/* Intern the strings first. The decks below index into TEAMS, so filling it as
   a side effect of building `players` inside the object literal would make this
   file depend on property evaluation order to be correct. */
const players = P.map((p) => [
  p.name, idx(SPORTS, iS, p.sport), p.f | 0,
  p.st.map((s) => [idx(TEAMS, iT, s.team), s.y0, s.y1, s.num])
]);
const out = {
  updated: new Date().toISOString().slice(0, 10),
  sports: SPORTS, teams: TEAMS, players: players,
  roll: spaced.map((r) => [iT.get(r.team), r.year, r.ids]),
  chain: chainOut
};
const body = '/* GENERATED by scripts/build-teammates.mjs. Do not edit by hand.\n' +
  ' * Jersey stints for players who clear RTG_KNOWN, plus the daily decks for\n' +
  ' * Roll Call (a club and a season) and Chain (two players to connect).\n' +
  ' * Teammate adjacency is derived at load from the stints, never shipped. */\n' +
  'window.RTG_TEAMMATES = ' + JSON.stringify(out) + ';\n';
writeFileSync(root + 'arcade/teammates.js', body);

// ---------- report ------------------------------------------------------------
const degs = adj.map((s) => s.size).sort((a, b) => a - b);
const edges = degs.reduce((a, b) => a + b, 0) / 2;
const sportCount = {};
for (const p of P) sportCount[p.sport] = (sportCount[p.sport] || 0) + 1;
const rollSizes = spaced.map((r) => r.ids.length);
console.log('players          ' + P.length + '  ' + JSON.stringify(sportCount));
console.log('stints           ' + joined + ' kept, ' + skipped + ' dropped as unrecognisable');
console.log('teammate edges   ' + edges + '  (median ' + degs[degs.length >> 1] + ' per player)');
console.log('Roll Call deck   ' + spaced.length + ' team seasons, ' +
  Math.round(rollSizes.reduce((a, b) => a + b, 0) / rollSizes.length) + ' names each on average, ' +
  (spaced.length / 365).toFixed(1) + ' years of daily puzzles');
console.log('Chain deck       ' + chainOut.length + ' pairs at ' + CHAIN_LINKS + ' links, ' +
  (chainOut.length / 365).toFixed(1) + ' years');
console.log('data file        ' + Math.round(body.length / 1024) + ' KB  -> arcade/teammates.js');
