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
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
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

/* TWO MEN, ONE NAME.
 *
 * jerseys.js keys on the name, so a father and a son, or two unrelated players
 * born twenty years apart, arrive as one record. 68 of its 2323 names are like
 * that. The one that gave it away: Zach Thomas holds Miami 1996 to 2007 at
 * number 54 and then the Rams, Texans, Colts and Titans from 2023 at 57, 74,
 * 64 and 72. Those are a Hall of Fame linebacker and an offensive lineman who
 * was two years old when the first one was drafted.
 *
 * It matters here more than anywhere else on the site, because THIS file is
 * the one that says who played beside whom. Merged, Zach Thomas is a bridge:
 * Chain will happily route a 1996 Dolphin to a 2026 Titan in three links
 * through a man who is two men. The puzzle is unsolvable and looks fine, and
 * check-teammates confirms the route, because the deck and the check read the
 * same graph.
 *
 * SPLIT ON THE GAP, and only where the gap is not arguable. Every one of the
 * 33 names with an 11 year hole in the middle is two people; I read all 33.
 * Between 6 and 10 years it is about half and half, and the half that is real
 * includes Michael Jordan (1995 Bulls to 2002 Wizards), John Smoltz, Charlie
 * Batch and Klay Thompson, so a threshold of 6 would cut the most recognisable
 * node in the graph in half to fix a handful of others. Those keep their merge
 * and it is recorded here rather than left to be rediscovered.
 *
 * The named list below is for the clear ones inside that band: fathers and
 * sons, and two cases where the positions make it plain. Add to it the day
 * somebody spots another; it needs nothing else rebuilt.
 *
 * Splitting cannot invent an edge. The worst a wrong split does is drop a real
 * teammate link, which makes the deck slightly smaller. A wrong merge makes
 * the game lie, so where the two errors are not equal this leans to splitting. */
const SPLIT_GAP = 11;   // an 11 year hole, inclusive: every one of those 33 was two men
const ALSO_SPLIT = new Set([
  'NBA|Patrick Ewing',        // and Patrick Ewing Jr.
  'NBA|Glen Rice',            // and Glen Rice Jr.
  'NBA|Glenn Robinson',       // and Glenn Robinson III
  'NFL|Antoine Winfield',     // and Antoine Winfield Jr.
  'NFL|Jimmy Smith',          // Jaguars receiver, then a Ravens cornerback
  'NFL|Andre Johnson',        // a 1996 lineman, then the Texans receiver
  'NFL|Mario Williams',       // the Texans end, then a 2025 Ram
  'MLB|Luis Castillo'         // the Marlins second baseman, then the Reds pitcher
]);

const byName = new Map();
let joined = 0, skipped = 0;
for (const s of JERSEYS.stints) {
  if (!s || !s.name || !s.sport || !s.team) continue;
  const e = entBy.get(s.sport + '|' + nkey(s.name));
  if (!e || !KNOWN(e)) { skipped++; continue; }
  const y0 = +s.y0 || 0, y1 = +s.y1 || y0;
  if (!y0) continue;
  const k = s.sport + '|' + s.name;
  let g = byName.get(k);
  if (!g) { g = { name: s.name, sport: s.sport, f: e.f | 0, st: [] }; byName.set(k, g); }
  g.st.push({ team: s.team, y0, y1: Math.max(y0, y1), num: (s.num == null ? -1 : +s.num) });
  joined++;
}

/* Walk each name's stints in year order and start a new person wherever the
   next one begins more than the threshold after everything before it has
   ended. `reach` is the running end, not the previous stint's, because a
   player holds two clubs in one year often enough that sorting alone would
   invent a gap. */
const byPlayer = [];
let split = 0;
for (const g of byName.values()) {
  const gap = ALSO_SPLIT.has(g.sport + '|' + g.name) ? 5 : SPLIT_GAP;
  const st = g.st.slice().sort((a, b) => a.y0 - b.y0 || a.y1 - b.y1);
  let cur = [], reach = 0;
  const people = [];
  for (const s of st) {
    if (cur.length && s.y0 - reach >= gap) { people.push(cur); cur = []; reach = 0; }
    cur.push(s);
    reach = Math.max(reach, s.y1);
  }
  if (cur.length) people.push(cur);
  if (people.length > 1) split++;
  for (const stints of people) byPlayer.push({ name: g.name, sport: g.sport, f: g.f, st: stints });
}
const P = byPlayer.sort((a, b) => a.sport.localeCompare(b.sport) || a.name.localeCompare(b.name) ||
                                  a.st[0].y0 - b.st[0].y0);
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

// ---------- the answer key a board is judged against --------------------------
/* Roll Call prints the recognizable part of a squad as blanks and judges every
   OTHER name the player types against arcade/rosters/<sport>-<decade>.js. So
   a board is only playable if that page exists and carries the men on it.
   Neither used to be checked here, and both were false: seven team seasons had
   no page at all, and two boards printed a slot the page denies.
   check-teammates.mjs found the second pair and this is where they came from,
   so the filter belongs at the point the board is made rather than in a check
   that can only say no afterwards. */
const nkRoster = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');
const lkRoster = (x) => nkRoster(String(x || '').replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, ''));
const ROSTER_PAGES = (() => {
  const box = { console };
  box.self = box; box.window = box; box.globalThis = box;
  createContext(box);
  let files = [];
  try { files = readdirSync(root + 'arcade/rosters').filter((f) => /-\d{4}\.js$/.test(f)); } catch { files = []; }
  for (const f of files) runInContext(readFileSync(root + 'arcade/rosters/' + f, 'utf8'), box);
  return { box, files };
})();
/* The set of names a given club and season will accept, or null when there is
   no page for it. Null means the board cannot be judged and must not ship. */
function rosterNames(sport, team, year) {
  const pack = ROSTER_PAGES.box['RTG_ROSTERS_' + sport + '_' + (Math.floor(year / 10) * 10)];
  if (!pack) return null;
  const ti = pack.teams.indexOf(team);
  if (ti < 0) return null;
  const list = (pack.r[ti] || {})[year];
  if (!list || !list.length) return null;
  const exact = new Set(), fuzzy = new Set();
  for (const x of list) { exact.add(nkRoster(pack.names[x[0]])); fuzzy.add(lkRoster(pack.names[x[0]])); }
  return { exact, fuzzy };
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
let noPage = 0, offPage = 0, thinned = 0;
for (const [k, set] of season) {
  if (set.size < MIN_ROSTER) continue;
  const [sport, team, year] = k.split('|');
  /* No answer key, no board. Every name the player types that is not a printed
     slot is judged against this page, so a season without one refuses correct
     answers all round. */
  const page = rosterNames(sport, team, +year);
  if (!page) { noPage++; continue; }
  let ids = [...set].sort((a, b) => (P[b].f | 0) - (P[a].f | 0) || P[a].name.localeCompare(P[b].name));
  /* And no slot the page denies. The stints and the roster pages are separate
     scrapes on separate schedules, so they disagree at the edges: a player who
     moved in free agency lands in one before the other. The page wins, because
     the page is what the game will judge against. */
  const before = ids.length;
  ids = ids.filter((i) => page.exact.has(nkRoster(P[i].name)) || page.fuzzy.has(lkRoster(P[i].name)));
  offPage += before - ids.length;
  if (ids.length < MIN_ROSTER) { thinned++; continue; }
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
console.log('  same name      ' + split + ' names held two careers too far apart to be one man, split');
console.log('teammate edges   ' + edges + '  (median ' + degs[degs.length >> 1] + ' per player)');
console.log('Roll Call deck   ' + spaced.length + ' team seasons, ' +
  Math.round(rollSizes.reduce((a, b) => a + b, 0) / rollSizes.length) + ' names each on average, ' +
  (spaced.length / 365).toFixed(1) + ' years of daily puzzles');
console.log('  answer keys    ' + ROSTER_PAGES.files.length + ' roster pages; dropped ' + noPage +
  ' seasons with no page, ' + thinned + ' left too thin, and ' + offPage +
  ' slots the page denies');
console.log('Chain deck       ' + chainOut.length + ' pairs at ' + CHAIN_LINKS + ' links, ' +
  (chainOut.length / 365).toFixed(1) + ' years');
console.log('data file        ' + Math.round(body.length / 1024) + ' KB  -> arcade/teammates.js');
