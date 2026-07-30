/* Stage 5, awards.
 *
 *   node CFB/build/05-awards.mjs
 *
 * Joins data/raw/cfb_awards.csv onto data/cfb_player_seasons.json, writing an
 * `awards` array on every player-season that won something. Idempotent.
 *
 * Same pattern as football/build/05-awards.mjs: awards are a hand-kept list
 * from a different source, and they do not touch a single number the game
 * simulates. A player is not better because he won the Heisman; he won the
 * Heisman because he was better, and the points already say so.
 *
 * THE JOIN is on normalised name plus season, with the school as a tie-break
 * rather than as part of the key (a player could transfer mid-career but the
 * award CSV uses one school name).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const CSV = path.join(DATA, 'raw', 'cfb_awards.csv');
const POOL = path.join(DATA, 'cfb_player_seasons.json');

export const AWARD_ORDER = [
  'Heisman Trophy',
];

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '')
  .replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
const key = (name, season) => norm(name) + '|' + season;

function parse(text) {
  const lines = text.trim().split(/\r?\n/);
  const head = lines[0].split(',').map((s) => s.trim());
  const want = ['season', 'player', 'team', 'award'];
  if (want.some((w, i) => head[i] !== w)) {
    throw new Error('cfb_awards.csv header is ' + head.join(',') + ', expected ' + want.join(','));
  }
  return lines.slice(1).filter((l) => l.trim()).map((l, i) => {
    const first = l.indexOf(',');
    const last = l.lastIndexOf(',');
    const mid = l.lastIndexOf(',', last - 1);
    if (first < 0 || mid <= first || last <= mid) throw new Error('cfb_awards.csv line ' + (i + 2));
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
if (unknown.length) throw new Error('cfb_awards.csv has awards this build does not rank: ' + unknown.join(', '));

const byKey = new Map();
for (const p of pool) {
  const k = key(p.name, p.season);
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(p);
}

const won = new Map();
const missed = [];
const ambiguous = [];
for (const r of rows) {
  const all = byKey.get(key(r.player, r.season)) || [];
  let p = all.length === 1 ? all[0] : null;
  if (all.length > 1) {
    const hit = all.filter((q) => q.school === r.team);
    if (hit.length === 1) p = hit[0];
    else { ambiguous.push(r); continue; }
  }
  if (!p) { missed.push(r); continue; }
  if (!won.has(p)) won.set(p, new Set());
  won.get(p).add(r.award);
}
if (ambiguous.length) {
  throw new Error('cannot tell which player these belong to, even with the school:\n' +
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
console.log(`        cfb_player_seasons.json is ${(bytes / 1024).toFixed(0)}KB`);

const per = {};
for (const p of pool) for (const a of (p.awards || [])) per[a] = (per[a] || 0) + 1;
console.log('\n  in the game:');
for (const a of AWARD_ORDER) console.log('   ' + String(per[a] || 0).padStart(4) + '  ' + a);

if (missed.length) {
  console.log('\n  not in the pool, so not shown anywhere:');
  for (const r of missed) console.log('   ' + r.season + '  ' + r.player.padEnd(22) + r.team.padEnd(18) + r.award);
}
