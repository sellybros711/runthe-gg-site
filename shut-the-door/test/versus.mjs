/* Shut The Door: the result's you against the real game names the real closer (the owner, 2026-11-10).
 *   node shut-the-door/test/versus.mjs
 *
 * For every pack the schedule can serve (its days, both rotations and its pack list), the label and
 * the verdict come from names.js versus() on the pack's own pitcher.name: "you vs <short name>",
 * "<short name> did better", "you did better", and a tie keeps "you matched history". The short name
 * is the one helper's (names.js shortName): a suffix stays with the surname and a surname of two words
 * stays whole. With no name the copy is the real game's, as before, never "them" or a blank.
 */
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const NM = require('../names.js');

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', 'data');
let fails = 0, oks = 0;
function check(name, cond, detail) {
  if (cond) oks++;
  else { fails++; console.log('FAIL ' + name + (detail ? ': ' + detail : '')); }
}

/* every pack the schedule can serve */
const sch = JSON.parse(readFileSync(join(DATA, 'schedule.json'), 'utf8'));
const ids = new Set([...Object.keys(sch.packs || {}), ...(sch.rotation || []), ...(sch.previewRotation || []), ...Object.values(sch.days || {}).map((d) => d.pack)]);
check('the schedule serves packs', ids.size > 0, String(ids.size));

for (const id of [...ids].sort()) {
  const entry = sch.packs[id];
  check(id + ' is in the schedule\'s pack list', !!entry);
  if (!entry) continue;
  const pack = JSON.parse(readFileSync(join(DATA, entry.file), 'utf8'));
  const scn = pack.scenario || pack;
  const full = scn.pitcher && scn.pitcher.name;
  check(id + ' carries the closer\'s name', typeof full === 'string' && full.trim().length > 0, String(full));
  const last = NM.shortName(full);
  const v = NM.versus(full);
  const words = full.trim().split(/\s+/);
  /* the short name is the name after the first, from the pack, never a stand in */
  check(id + ' short name is the pack\'s surname', last.length > 0 && full.trim().endsWith(last) && last === words.slice(1).join(' ') && !/^(them|him|history|the real game)$/i.test(last), full + ' -> ' + last);
  check(id + ' label is "you vs ' + last + '"', v.label === 'you vs ' + last, v.label);
  check(id + ' verdict when he did better names him', v.lost === last + ' did better', v.lost);
  check(id + ' verdict when you did better', v.beat === 'you did better', v.beat);
  check(id + ' a tie keeps the tie\'s words', v.matched === 'you matched history', v.matched);
  check(id + ' the card agrees with the schedule\'s card', !entry.card || !entry.card.pitcher || NM.shortName(entry.card.pitcher) === last, entry.card && entry.card.pitcher);
}

/* suffixes and surnames of more than one word: the one helper's rule */
const CASES = [
  ['Koji Uehara', 'Uehara'],
  ['Francisco Rodríguez', 'Rodríguez'],
  ['Bobby Witt Jr.', 'Witt Jr.'],
  ['Ken Griffey Sr.', 'Griffey Sr.'],
  ['Jose De Leon', 'De Leon'],
  ['Gary Matthews Jr.', 'Matthews Jr.'],
  ['  Koji   Uehara  ', 'Uehara'],
  ['Ichiro', 'Ichiro'],
];
for (const [full, last] of CASES) {
  const v = NM.versus(full);
  check('"' + full + '" reads "you vs ' + last + '"', v.label === 'you vs ' + last, v.label);
  check('"' + full + '" reads "' + last + ' did better"', v.lost === last + ' did better', v.lost);
}

/* no name: the real game, exactly as before, never "them" or a blank */
for (const none of [null, undefined, '', '   ']) {
  const v = NM.versus(none);
  check('no name (' + JSON.stringify(none) + ') keeps the real game',
    v.label === 'you vs the real game' && v.beat === 'you rewrote history' && v.matched === 'you matched history' && v.lost === 'history did better', JSON.stringify(v));
  check('no name (' + JSON.stringify(none) + ') never reads "them" or a blank',
    Object.values(v).every((t) => !/\bthem\b/.test(t) && !/vs\s*$/.test(t) && !/^\s*did better/.test(t)), JSON.stringify(v));
}

console.log(`\n${oks} ok, ${fails} failed (${ids.size} scheduled packs)`);
process.exit(fails ? 1 : 0);
