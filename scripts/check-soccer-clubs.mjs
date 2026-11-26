#!/usr/bin/env node
/* ONE NAME PER CLUB IN RUN THE PITCH.
 *   node scripts/check-soccer-clubs.mjs
 * The World Cup rosters spelled 40 clubs two ways (Al Hilal and Al-Hilal, Internazionale and Inter
 * Milan), which splits a club in two for anything that groups by club (the Club Draft plan does),
 * and listed one federation as a club. scripts/soccer-club-names.json holds the decisions and
 * scripts/convertData.js applies them. This fails on:
 *   - two names in data/players_all.json that normalize alike and are in neither `same` nor `apart`
 *     (decide it in the json: one club, or two clubs that share a name);
 *   - a `same` spelling still in the data (the converter was not re-run), or a `not_a_club` name;
 *   - a `same` entry pointing at a name that is itself renamed (chains hide mistakes);
 *   - a club row with no club_id, one id over several names that is not a declared era list, two
 *     clubs kept apart under one id, or a display name for an id that does not exist.
 * Normalizing: accents, punctuation and club-form words (FC, AC, CD, IF, Club...) set aside.
 */
import { readFileSync } from 'node:fs';

const rows = JSON.parse(readFileSync('data/players_all.json', 'utf8'));
const NAMES = JSON.parse(readFileSync('scripts/soccer-club-names.json', 'utf8'));
const STOP = new Set(['fc', 'cf', 'sc', 'ac', 'afc', 'cd', 'ca', 'sk', 'fk', 'sv', 'bk', 'if', 'club', 'de',
  'the', 'sport', 'cp', 'ss', 'as', 'us', 'rc', 'rcd', 'ud', 'sd', 'vfl', 'vfb', 'tsg', 'sl', 'sad', 'cs', 'ad',
  'asd', 'calcio', 'football', 'futebol', 'futbol', 'clube', 'sg', 'taz']);
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ')
  .split(/\s+/).filter((w) => w && !STOP.has(w)).join(' ');

const problems = [];
const clubs = new Map();
for (const r of rows) if (r.club_at_tournament) clubs.set(r.club_at_tournament, (clubs.get(r.club_at_tournament) || 0) + 1);

for (const from of Object.keys(NAMES.same)) {
  if (clubs.has(from)) problems.push(`"${from}" is still in the data; re-run node scripts/convertData.js`);
  if (NAMES.same[NAMES.same[from]]) problems.push(`"${from}" points at "${NAMES.same[from]}", which is itself renamed`);
}
for (const c of NAMES.not_a_club) if (clubs.has(c)) problems.push(`"${c}" is not a club and is still in the data`);

const apart = new Set(NAMES.apart.map(([a, b]) => [a, b].sort().join(' | ')));
// names declared as eras of one club are decided too: one club, two names of their time
for (const e of NAMES.eras) for (const a of e.names) for (const b of e.names) if (a < b) apart.add([a, b].join(' | '));
const by = new Map();
for (const c of clubs.keys()) { const k = norm(c); (by.get(k) || by.set(k, []).get(k)).push(c); }
for (const group of by.values()) {
  if (group.length < 2) continue;
  for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
    const pair = [group[i], group[j]].sort();
    if (!apart.has(pair.join(' | '))) problems.push(`undecided: "${pair[0]}" (${clubs.get(pair[0])}) and "${pair[1]}" (${clubs.get(pair[1])}): add one to \`same\` (a spelling), the pair to \`eras\` (one club renamed) or to \`apart\` (two clubs)`);
  }
}

/* ONE CLUB, ONE ID, ACROSS ITS NAMES (the owner's ruling, 2026-11-26: a renamed club is one club,
   shown under the name it had then). Every club row carries a club_id; an id that covers more than
   one name must be a declared era list; two clubs kept apart must not share an id; and `display`,
   the short-name slot, may only name ids that exist. */
const idNames = new Map();
for (const r of rows) {
  if (!r.club_at_tournament) { if (r.club_id) problems.push(`${r.player_id} has a club_id and no club`); continue; }
  if (!r.club_id) { problems.push(`${r.player_id} (${r.club_at_tournament}) has no club_id; re-run node scripts/convertData.js`); continue; }
  (idNames.get(r.club_id) || idNames.set(r.club_id, new Set()).get(r.club_id)).add(r.club_at_tournament);
}
const eraIds = new Map(NAMES.eras.map((e) => [e.id, new Set(e.names)]));
for (const [id, names] of idNames) {
  if (names.size < 2) continue;
  const era = eraIds.get(id);
  if (!era || [...names].some((n) => !era.has(n))) problems.push(`club_id "${id}" covers ${[...names].join(' and ')} without an \`eras\` entry`);
}
for (const e of NAMES.eras) for (const n of e.names) if (!clubs.has(n)) problems.push(`era name "${n}" (${e.id}) is not in the data`);
const idOf = new Map(); for (const r of rows) if (r.club_at_tournament) idOf.set(r.club_at_tournament, r.club_id);
for (const [a, b] of NAMES.apart) if (idOf.has(a) && idOf.get(a) === idOf.get(b)) problems.push(`"${a}" and "${b}" are kept apart but share club_id "${idOf.get(a)}": set one in \`ids\``);
for (const id of Object.keys(NAMES.display || {})) if (!idNames.has(id)) problems.push(`display name for unknown club_id "${id}"`);

if (problems.length) {
  console.log(problems.length + ' club name problem(s):\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`soccer clubs ok: ${idNames.size} clubs under ${clubs.size} names, ${Object.keys(NAMES.same).length} spellings joined, ${NAMES.eras.length} clubs with era names, ${NAMES.apart.length} look-alike pairs kept apart`);
