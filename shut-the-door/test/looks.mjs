/* The hitters' looks (3d/looks.js, 3d/looks-data.js): every pack hitter is in the data, every
 * number is a real one or null, a hand-set value carries its source, and a hitter with no data
 * keeps the hash's look exactly.
 *
 *   node shut-the-door/test/looks.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { look, hash, BEARD } from '../3d/looks.js';
import { LOOKS } from '../3d/looks-data.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKS = path.join(HERE, '..', 'data', 'packs');
let bad = 0;
const fail = (m) => { bad++; console.error('FAIL ' + m); };

for (const f of fs.readdirSync(PACKS).filter((x) => x.endsWith('.json')).sort()) {
  const sc = JSON.parse(fs.readFileSync(path.join(PACKS, f), 'utf8')).scenario;
  const g = LOOKS.games[sc.id];
  if (!g) { fail(`${sc.id}: no game in looks-data.js`); continue; }
  for (const b of sc.batters) {
    const h = g.hitters[b.id], p = LOOKS.players[b.id];
    if (!h || !p) { fail(`${sc.id} ${b.name}: not in looks-data.js`); continue; }
    if (h.number !== null && !/^\d{1,2}$/.test(h.number)) fail(`${sc.id} ${b.name}: number ${h.number}`);
    if (h.number !== null && !['box', 'roster'].includes(h.numberSrc)) fail(`${sc.id} ${b.name}: number with no source`);
    if (h.beard !== null && (!(h.beard in BEARD) || !h.beardSrc)) fail(`${sc.id} ${b.name}: beard ${h.beard} without a source`);
    if (p.tone !== null && (!(p.tone >= 0 && p.tone <= 1) || !p.toneSrc)) fail(`${b.name}: tone ${p.tone} without a source`);
    const L = look(b.id, sc.id);
    if (h.number !== null && L.number !== h.number) fail(`${sc.id} ${b.name}: look number ${L.number}, data ${h.number}`);
    if (p.heightIn && L.heightIn !== p.heightIn) fail(`${b.name}: look height`);
  }
}
// no data: the hash's look, field for field, with no build handed on
const none = look('nobody:at-all', 'no-game');
if ('heightIn' in none) fail('a hitter with no data was handed a build');
if (none.tone !== +(((hash('nobody:at-all') >>> 0) & 1023) / 1023).toFixed(3)) fail('the hash tone moved');
// the catcher, fielders and umpires are never looked up
if (Object.keys(LOOKS.players).some((k) => /:(f|r|u)\d$/.test(k))) fail('a generic figure is in the data');
console.log(bad ? `${bad} failed` : 'looks ok');
process.exit(bad ? 1 : 0);
