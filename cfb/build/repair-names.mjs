/* A one-off repair of names in the SHIPPED data files.
 *
 *   node cfb/build/repair-names.mjs [--check]
 *
 * WHY THIS EXISTS AT ALL. Stages 1 and 3 fetch from the CFBD API and need a key, so
 * the ordinary way to change how a name is spelled is to re-run them. Two name bugs
 * were found by a player looking at the screen, and neither is worth a full refetch:
 *
 *   "Isaih Pacheco", and six Scottish surnames arriving as "Mcmillan", and two
 *   suffixes arriving as "Ii". Fixed by fixName() in lib.mjs, now applied in stage 1.
 *
 *   A hundred and fourteen chemistry labels reading "Sr. threw Robiskie 8 touchdowns"
 *   or "Smith threw Jr. 43 catches", because stage 3 took a surname with
 *   split(' ').pop() and a suffix is not a surname. Fixed by lastName(), now used in
 *   stage 3.
 *
 * So this applies exactly those two functions to the files already on disk. It is
 * idempotent: a rebuild with a key produces the same output, and running this again
 * changes nothing. --check reports what would change and writes nothing, which is how
 * this is used once the pipeline has caught up.
 *
 * The battery labels are REBUILT from the player names rather than edited in place, so
 * the fixed spelling and the fixed surname land together and a label can never disagree
 * with the player it names.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, fixName, lastName, toCSV, parseCSVObjects } from './lib.mjs';

const check = process.argv.includes('--check');
const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
const write = (f, v) => { if (!check) fs.writeFileSync(path.join(DATA_DIR, f), JSON.stringify(v)); };

/* ── players ── */
const players = read('cfb_player_seasons.json');
const renamed = [];
for (const p of players) {
  const fixed = fixName(p.name);
  if (fixed !== p.name) { renamed.push([p.name, fixed]); p.name = fixed; }
}
const uniq = [...new Set(renamed.map((r) => r[0] + ' -> ' + r[1]))];
console.log('players: ' + renamed.length + ' rows respelled, ' + uniq.length + ' distinct');
for (const u of uniq) console.log('  ' + u);
write('cfb_player_seasons.json', players);

/* The CSV is not read by the game, but it is the same data and a reader who opens it
   should not find a name the game does not use. */
const csvPath = path.join(DATA_DIR, 'cfb_player_seasons.csv');
if (fs.existsSync(csvPath)) {
  const rows = parseCSVObjects(fs.readFileSync(csvPath, 'utf8'));
  const cols = Object.keys(rows[0]);
  let n = 0;
  for (const r of rows) { const f = fixName(r.name); if (f !== r.name) { r.name = f; n++; } }
  console.log('csv: ' + n + ' rows respelled');
  if (!check && n) fs.writeFileSync(csvPath, toCSV(rows, cols));
}

/* ── battery labels ── */
const nameOf = new Map();
for (const p of players) nameOf.set(p.player_id + '|' + p.season, p.name);

const battery = read('cfb_battery.json');
let relabelled = 0, unresolved = 0;
const samples = [];
for (const [qbKey, list] of Object.entries(battery)) {
  for (const link of list) {
    const qb = nameOf.get(qbKey), rec = nameOf.get(link.receiver);
    if (!qb || !rec) { unresolved++; continue; }
    const season = Number(qbKey.split('|')[1]);
    /* Which of the two templates this link used is read off the label itself rather
       than recomputed from a threshold, so this repair cannot quietly reclassify a
       link that stage 3 would have written the other way. */
    const isTd = / touchdowns in /.test(link.label);
    const next = isTd
      ? `${lastName(qb)} threw ${lastName(rec)} ${link.rec_tds} touchdowns in ${season}`
      : `${lastName(qb)} threw ${lastName(rec)} ${link.receptions} catches in ${season}`;
    if (next !== link.label) {
      if (samples.length < 8) samples.push(link.label + '   ->   ' + next);
      link.label = next; relabelled++;
    }
  }
}
console.log('battery: ' + relabelled + ' labels rewritten, ' + unresolved + ' links whose players are not in the file');
for (const s of samples) console.log('  ' + s);
write('cfb_battery.json', battery);

/* ── what is left ── */
const bad = [];
for (const list of Object.values(battery)) {
  for (const l of list) if (/(^|\s)(Jr\.|Sr\.|II|III|IV|V)\s+threw|threw\s+(Jr\.|Sr\.|II|III|IV|V)\s/.test(l.label)) bad.push(l.label);
}
console.log('battery labels still naming a suffix: ' + bad.length);
for (const b of bad.slice(0, 5)) console.log('  ' + b);
console.log(check ? '\nchecked only, nothing written' : '\nwritten');
process.exit(bad.length ? 1 : 0);
