/* Applies school-colors.mjs to the already-built cfb_team_seasons.json.
 *
 *   node cfb/build/recolor.mjs
 *
 * 02-teams.mjs applies the same corrections at build time, but rebuilding needs the
 * CFBD API key and refetches twenty seasons to change ten hex values. This is the
 * same map against the file that is already there, and it is idempotent: run it
 * twice and the second run reports nothing to do.
 */
import fs from 'node:fs';
import { SCHOOL_COLORS } from './school-colors.mjs';

const PATH = 'cfb/data/cfb_team_seasons.json';
const teams = JSON.parse(fs.readFileSync(PATH, 'utf8'));

const changed = new Map();
for (const t of teams) {
  const fix = SCHOOL_COLORS[t.school];
  if (!fix) continue;
  if (t.color === fix.color && t.alt_color === fix.alt_color) continue;
  if (!changed.has(t.school)) {
    changed.set(t.school, `${t.color} ${t.alt_color}  ->  ${fix.color} ${fix.alt_color}`);
  }
  t.color = fix.color;
  t.alt_color = fix.alt_color;
}

if (!changed.size) { console.log('nothing to do: every correction is already applied'); process.exit(0); }
for (const [school, line] of changed) console.log('  ' + school.padEnd(20) + line);
fs.writeFileSync(PATH, JSON.stringify(teams));
console.log(`corrected ${changed.size} schools across ${teams.length} team seasons`);
