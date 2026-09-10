#!/usr/bin/env node
/* WHICH CLUB IS A PLAYER'S CLUB? -> arcade/primary.js (window.RTG_PRIMARY)
 *
 * A player wrote in about Alma Mater: it captioned Tom Seaver "MLB . BOSTON
 * RED SOX". He pitched sixteen games there in 1986, at the end of twenty
 * years, eleven of them with the Mets.
 *
 * The caption was taking the LAST entry of the entity's team list. Measured
 * against real tenure that is right 9% of the time. It said California Angels
 * for Nolan Ryan, Montreal Expos for Randy Johnson (eleven innings), Arizona
 * Cardinals for Emmitt Smith and Atlanta Falcons for Brett Favre.
 *
 * The list is not a career order either, so there is no index that answers the
 * question: Randy Johnson's list ENDS with the club he started at. The first
 * entry is right 71% of the time, which is better and still not an answer.
 *
 * The answer is tenure. Basketball is counted from hoops/data/players.json,
 * one row per player per season back to 1974, which is the question asked and
 * answered directly. Football and baseball are counted from the jersey stints,
 * which infer it from shirt numbers and only reach 1990.
 *
 * IT DOES NOT ANSWER FOR EVERYBODY, and that is the point. A consumer reads
 * `e.pt` and falls back to `e.t[0]`, so a player this file declines is handed
 * the first club rather than the last. Scored against the basketball data,
 * which is independent of the stints: the rule today is right 15% of the time,
 * the first club alone 62%, and this 98%. The seven it still misses are all
 * careers that began before 1974, where declining is the correct answer and
 * the fallback simply is not very good.
 *
 * NAMES THAT ARE TWO PEOPLE ARE LEFT OUT. jerseys.js keys on the name, so 68
 * of its 2323 names hold two careers (see the same problem, at length, in
 * scripts/build-teammates.mjs). For a teammate graph that can be split, because
 * the graph addresses a person. This file is addressed BY NAME, so there is
 * nothing to split into: both Zach Thomases would be handed whichever club won.
 * Better to say nothing and let the fallback take it.
 *
 * Reads only files already in the repo, so it runs offline.
 *
 *   node scripts/build-primary.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const box = {};
// eslint-disable-next-line no-new-func
new Function('window', 'self', readFileSync(root + 'arcade/jerseys.js', 'utf8'))(box, box);
const STINTS = (box.RTG_JERSEYS && box.RTG_JERSEYS.stints) || [];
if (!STINTS.length) { console.error('arcade/jerseys.js has no stints'); process.exit(1); }

/* The same key every other arcade file joins on. */
const nk = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');

const by = new Map();
for (const s of STINTS) {
  if (!s || !s.name || !s.sport || !s.team) continue;
  const y0 = +s.y0 || 0;
  if (!y0) continue;
  const k = s.sport + '|' + nk(s.name);
  if (!by.has(k)) by.set(k, []);
  by.get(k).push({ team: s.team, y0, y1: Math.max(y0, +s.y1 || y0) });
}

/* BASKETBALL HAS BETTER DATA IN THIS REPO, so basketball does not use the
 * stints at all.
 *
 * hoops/data/players.json is one row per player per SEASON, 1974 to 2025, with
 * the club he played it for. That is the question this file asks, answered
 * directly, where the stints answer it by inference from jersey numbers and
 * only back to 1990. Measured against it, the stints put Anthony Davis at the
 * Lakers and Pau Gasol at the Lakers, both of whom spent longer where they
 * started, because a spell the number scrape missed is a spell that never
 * happened as far as counting is concerned.
 *
 * It is a build-time read of a file that already ships for another game, so it
 * costs the arcade nothing. Football and baseball keep the stints, which is
 * the only tenure this repo holds for them.
 */
const NBA_SRC = 'hoops/data/players.json';
let nbaSeasons = 0;
try {
  const rows = JSON.parse(readFileSync(root + NBA_SRC, 'utf8'));
  const codes = JSON.parse(readFileSync(root + 'hoops/data/teams.json', 'utf8')).teams;
  const full = {};
  for (const t of (Array.isArray(codes) ? codes : Object.values(codes))) full[t.code] = t.full;
  /* Basketball's own rows replace anything the stints had for it, rather than
     merging: two sources counting the same seasons would count them twice. */
  for (const k of [...by.keys()]) if (k.slice(0, 3) === 'NBA') by.delete(k);
  for (const r of rows) {
    if (!r || !r.n || !r.t || !r.s) continue;
    const team = full[r.t];
    if (!team) continue;                      // a code with no franchise row
    const k = 'NBA|' + nk(r.n);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push({ team, y0: +r.s, y1: +r.s });
    nbaSeasons++;
  }
} catch (e) {
  console.log('note: ' + NBA_SRC + ' not readable, basketball falls back to the stints (' + e.message + ')');
}

/* Two careers with an 11 year hole between them are two men. Same threshold
   build-teammates.mjs splits on, for the same reason and off the same data. */
const SPLIT_GAP = 11;
function isTwoPeople(st) {
  const s = st.slice().sort((a, b) => a.y0 - b.y0);
  let reach = 0;
  for (const x of s) {
    if (reach && x.y0 - reach >= SPLIT_GAP) return true;
    reach = Math.max(reach, x.y1);
  }
  return false;
}

/* THE STINTS START IN 1990, AND A TRUNCATED CAREER GIVES A CONFIDENT WRONG
 * ANSWER, which is worse than no answer at all because the fallback is decent.
 *
 * Charles Barkley was a 76er for eight seasons and jerseys.js holds two of
 * them, so counting seasons makes him a Rocket. Randy Johnson pitched ten
 * years in Seattle and the file starts after all of them, so it makes him a
 * Diamondback. Both of those read as authoritative and both are wrong.
 *
 * So a career that reaches the floor is not counted at all. It falls through
 * to e.t[0], which for those two is the 76ers and the Mariners: right, by
 * declining to answer rather than by knowing. The floor is read from the data
 * rather than written down, so it moves when the scrape does.
 */
/* PER SPORT, because the sports no longer share a source: basketball reaches
   back to 1974 and the other two begin in 1990, and one floor for all three
   would throw away every basketball career that started in the early nineties
   for a reason that does not apply to it. Read from the data rather than
   written down, so it moves when a scrape does. */
const FLOOR = {};
for (const [k, st] of by) {
  const sp = k.slice(0, k.indexOf('|'));
  for (const x of st) if (!(sp in FLOOR) || x.y0 < FLOOR[sp]) FLOOR[sp] = x.y0;
}
let two = 0, single = 0, cut = 0;
const out = [];
for (const [k, st] of by) {
  if (isTwoPeople(st)) { two++; continue; }
  /* At the floor, or one season above it: a career that was already running
     when the record begins is a career this file cannot measure. */
  const sp = k.slice(0, k.indexOf('|'));
  if (Math.min.apply(null, st.map((x) => x.y0)) <= FLOOR[sp] + 1) { cut++; continue; }
  const seasons = {};
  const lastYear = {};
  for (const x of st) {
    seasons[x.team] = (seasons[x.team] || 0) + (x.y1 - x.y0 + 1);
    lastYear[x.team] = Math.max(lastYear[x.team] || 0, x.y1);
  }
  const teams = Object.keys(seasons);
  if (teams.length === 1) { single++; }
  /* Most seasons wins. A tie goes to the later spell, which is the one a fan
     is likelier to picture, and a tie on that too goes to the name so the
     output is stable between builds rather than depending on object order. */
  teams.sort((a, b) => seasons[b] - seasons[a] || lastYear[b] - lastYear[a] || (a < b ? -1 : 1));
  const i = k.indexOf('|');
  out.push([k.slice(0, i), k.slice(i + 1), teams[0], seasons[teams[0]]]);
}
out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : (a[1] < b[1] ? -1 : 1)));

/* Compact, the way the packed datasets are: the sports and the clubs written
   once, every row two small integers and a name. */
const SPORTS = [], TEAMS = [], iS = new Map(), iT = new Map();
const idx = (arr, map, v) => { if (!map.has(v)) { map.set(v, arr.length); arr.push(v); } return map.get(v); };
const rows = out.map((r) => [r[1], idx(SPORTS, iS, r[0]), idx(TEAMS, iT, r[2]), r[3]]);

const body =
  '/*\n' +
  ' * GENERATED by scripts/build-primary.mjs. Do not edit.\n' +
  ' * The club each player spent longest at, from the jersey stints. The team\n' +
  ' * list on an entity is not a career order, so no index into it answers this:\n' +
  ' * its last entry is the right club 9% of the time and its first 71%.\n' +
  ' * A consumer reads e.pt and falls back to e.t[0].\n' +
  ' */\n' +
  'window.RTG_PRIMARY=(function(){\n' +
  'var S=' + JSON.stringify(SPORTS) + ',T=' + JSON.stringify(TEAMS) + ',R=' + JSON.stringify(rows) + ';\n' +
  'var m={};for(var i=0;i<R.length;i++){m[S[R[i][1]]+"|"+R[i][0]]=T[R[i][2]];}\n' +
  /* of() takes the NAME, not a key, and normalises it here. The arcade has
     three name normalisations in it already and a caller picking the wrong one
     gets a silent miss rather than an error, so the file that owns the keys
     owns the spelling of them too. */
  'function nk(s){return String(s||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"")' +
  '.toLowerCase().replace(/[^a-z0-9]/g,"");}\n' +
  'return {updated:' + JSON.stringify(new Date().toISOString().slice(0, 10)) + ',count:R.length,' +
  'of:function(sport,name){return m[sport+"|"+nk(name)]||null;}};\n' +
  '})();\n';
writeFileSync(root + 'arcade/primary.js', body);

console.log('players         ' + rows.length + ' given a club');
console.log('  one club only ' + single);
console.log('  left out      ' + two + ' names holding two careers, which no single club answers');
console.log('                ' + cut + ' careers already running at the earliest season held, too truncated to count');
console.log('sources         basketball ' + nbaSeasons + ' seasons from ' + NBA_SRC + '; football and baseball from the jersey stints');
console.log('  earliest held ' + Object.keys(FLOOR).sort().map(function(s){return s+' '+FLOOR[s];}).join(', '));
console.log('clubs           ' + TEAMS.length + ' across ' + SPORTS.length + ' sports');
console.log('data file       ' + Math.round(body.length / 1024) + ' KB  -> arcade/primary.js');
