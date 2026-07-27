/* Stage 5, awards.
 *
 *   node football/build/05-awards.mjs
 *
 * Joins data/raw/awards.csv onto data/player_seasons.json, writing an `awards`
 * array on every player-season that won something. Idempotent: it rebuilds the
 * field from the CSV every run, so a corrected row in the CSV corrects the game.
 *
 * A SEPARATE STAGE, NOT PART OF 01-players.
 * Awards are a hand-kept list from a different source than the weekly stats, and
 * they do not touch a single number the game simulates: not the price, not the
 * points, not the chemistry. A player is not better because he won MVP; he won
 * MVP because he was better, and the points already say so. Folding this into the
 * pricing stage would invite exactly that mistake. It also means this runs offline
 * against the shipped data, without refetching nflverse.
 *
 * THE JOIN is on normalised name plus season, with the club as a tie-break rather
 * than as part of the key. It cannot be part of the key: the CSV carries the code a
 * club wore that year (STL, SD, OAK) and the player rows carry today's franchise
 * (LAR, LAC, LV), so matching on it directly would reject correct rows. And it
 * cannot be left out either, because name plus season is not unique here. See the
 * note above the lookup.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

/* The engine, for eraCode only: the CSV says the code the club wore that year and
   the pool says today's franchise, and the two have to be reconciled to tell two
   players of the same name apart. */
const E = createRequire(import.meta.url)('../engine.js');

const DATA = path.join(import.meta.dirname, '..', 'data');
const CSV = path.join(DATA, 'raw', 'awards.csv');
const POOL = path.join(DATA, 'player_seasons.json');

/* Most prestigious first. The headline award on a tile is whichever of a player's
   comes first here, so this order is the one the player sees. Man of the Year is
   last on purpose: it is a community award and should never displace an on-field
   one, but it is real and worth showing. */
export const AWARD_ORDER = [
  'MVP',
  'Super Bowl MVP',
  'Offensive Player of the Year',
  'Offensive Rookie of the Year',
  'First Team All-Pro',
  'Comeback Player of the Year',
  'Walter Payton Man of the Year',
];

/* Where nflverse spells a name differently from the award lists. An explicit table
   rather than a fuzzy match, because a fuzzy match over 9,411 names will eventually
   attach an MVP to the wrong man. */
const ALIASES = {
  'michael vick': 'mike vick',
};

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '')
  .replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
const key = (name, season) => { const n = norm(name); return (ALIASES[n] || n) + '|' + season; };

/* One line at a time, because a player's name can contain a comma and the award
   never does. season,player,team,award with exactly four fields. */
function parse(text) {
  const lines = text.trim().split(/\r?\n/);
  const head = lines[0].split(',').map((s) => s.trim());
  const want = ['season', 'player', 'team', 'award'];
  if (want.some((w, i) => head[i] !== w)) {
    throw new Error('awards.csv header is ' + head.join(',') + ', expected ' + want.join(','));
  }
  return lines.slice(1).filter((l) => l.trim()).map((l, i) => {
    const first = l.indexOf(',');
    const last = l.lastIndexOf(',');
    const mid = l.lastIndexOf(',', last - 1);
    if (first < 0 || mid <= first || last <= mid) throw new Error('awards.csv line ' + (i + 2));
    return {
      season: Number(l.slice(0, first)),
      player: l.slice(first + 1, mid).trim(),
      team: l.slice(mid + 1, last).trim(),
      award: l.slice(last + 1).trim(),
    };
  });
}

const rows = parse(fs.readFileSync(CSV, 'utf8'));
const pool = JSON.parse(fs.readFileSync(POOL, 'utf8'));

const unknown = [...new Set(rows.map((r) => r.award))].filter((a) => !AWARD_ORDER.includes(a));
if (unknown.length) throw new Error('awards.csv has awards this build does not rank: ' + unknown.join(', '));

/* NAME PLUS SEASON IS NOT UNIQUE, which is the whole reason the team column is
   here. Nineteen pairs collide in this pool, and several of them won something:
   there are two Adrian Petersons in 2007, 2008 and 2009, two Steve Smiths from 2008
   to 2012, two Alex Smiths, two David Johnsons in 2016. Attaching 2007 Offensive
   Rookie of the Year to the wrong Adrian Peterson is exactly the kind of error
   nobody would ever notice, so a collision is resolved on the club code of the
   year, and an award that still cannot be placed stops the build. */
const byKey = new Map();
for (const p of pool) {
  const k = key(p.name, p.season);
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(p);
}

const won = new Map();                       // pool row -> Set of awards
const missed = [];
const ambiguous = [];
for (const r of rows) {
  const all = byKey.get(key(r.player, r.season)) || [];
  let p = all.length === 1 ? all[0] : null;
  if (all.length > 1) {
    const hit = all.filter((q) => E.eraCode(q.franchise, q.season) === r.team);
    if (hit.length === 1) p = hit[0];
    else { ambiguous.push(r); continue; }
  }
  if (!p) { missed.push(r); continue; }
  if (!won.has(p)) won.set(p, new Set());
  won.get(p).add(r.award);
}
if (ambiguous.length) {
  throw new Error('cannot tell which player these belong to, even with the club:\n' +
    ambiguous.map((r) => '  ' + r.season + ' ' + r.player + ' (' + r.team + ') ' + r.award).join('\n'));
}

let cleared = 0, set = 0;
for (const p of pool) {
  if (p.awards) cleared++;
  delete p.awards;
  const mine = won.get(p);
  if (!mine) continue;
  p.awards = AWARD_ORDER.filter((a) => mine.has(a));
  set++;
}

fs.writeFileSync(POOL, JSON.stringify(pool));

const bytes = fs.statSync(POOL).size;
console.log(`awards: ${rows.length} rows in the CSV, ${rows.length - missed.length} joined, ` +
  `${missed.length} unmatched`);
console.log(`        ${set} player-seasons now carry an award (${cleared} did before this run)`);
console.log(`        player_seasons.json is ${(bytes / 1024).toFixed(0)}KB`);

const per = {};
for (const p of pool) for (const a of (p.awards || [])) per[a] = (per[a] || 0) + 1;
console.log('\n  in the game:');
for (const a of AWARD_ORDER) console.log('   ' + String(per[a] || 0).padStart(4) + '  ' + a);

/* EVERY UNMATCHED ROW IS PRINTED. Most of them should not match: this pool is
   skill positions with eight or more games for one club, and a First Team All-Pro
   return specialist is neither. Printing them all is what stops a future data drop
   from quietly dropping an MVP. */
if (missed.length) {
  console.log('\n  not in the pool, so not shown anywhere:');
  for (const r of missed) console.log('   ' + r.season + '  ' + r.player.padEnd(22) + r.team.padEnd(5) + r.award);
}
