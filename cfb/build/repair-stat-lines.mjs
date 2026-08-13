/* A stand-in for the stat lines that came out blank, in the SHIPPED player file.
 *
 *   node cfb/build/repair-stat-lines.mjs [--check]
 *
 * WHAT WENT WRONG. statLine() in stage 1 has a threshold per category so that a running
 * back who threw one trick-play pass does not carry "8 pass yds, 0 TD, 0 INT" under his
 * name. Ninety-three players cleared none of the three, and the function handed back an
 * empty string. On screen that is a name, a team, a blank where the season should be and
 * a fantasy average sitting next to it, which reads as broken data rather than as a quiet
 * season. Every one of them is a man who just scraped past the six-game minimum: fifty-one
 * played exactly six, and a backup quarterback with twenty-five completions is the shape
 * of it.
 *
 * WHY THIS IS A STAND-IN AND NOT THE FIX. The fix is in stage 1, which now falls back to
 * the real numbers when no category clears its bar. Stage 1 needs a CFBD key, and the
 * per-game totals it prints from are not in the shipped file: the file keeps fantasy
 * points per game split by phase, and points cannot be turned back into yards, touchdowns
 * and interceptions. So this writes the only true thing the row can support, out of the
 * two exact numbers it does have: how many games, and which phase the man's production
 * actually came in.
 *
 * IT INVENTS NOTHING. There is no yardage here and no guess at one, and the next keyed
 * rebuild overwrites every one of these with the real line.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, toCSV, parseCSVObjects } from './lib.mjs';

const check = process.argv.includes('--check');

/* Which phase the season happened in, off the exact per-phase averages on the row. */
function standIn(p) {
  const games = Number(p.games_played) || 0;
  const g = games + (games === 1 ? ' game' : ' games');
  const phases = [
    ['passing', Number(p.pass_ppg) || 0],
    ['rushing', Number(p.rush_ppg) || 0],
    ['receiving', Number(p.rec_ppg) || 0],
  ].sort((a, b) => b[1] - a[1]);
  if (phases[0][1] <= 0) return g + ', no offensive stats recorded';
  return g + ', mostly ' + phases[0][0];
}

const file = path.join(DATA_DIR, 'cfb_player_seasons.json');
const players = JSON.parse(fs.readFileSync(file, 'utf8'));
const fixed = [];
for (const p of players) {
  if (p.stat_line && String(p.stat_line).trim()) continue;
  p.stat_line = standIn(p);
  fixed.push(p.name + ' ' + p.season + ' ' + p.school + '  ->  ' + p.stat_line);
}
console.log('blank stat lines filled: ' + fixed.length + ' of ' + players.length);
for (const f of fixed.slice(0, 10)) console.log('  ' + f);
if (fixed.length > 10) console.log('  ... and ' + (fixed.length - 10) + ' more');
if (!check) fs.writeFileSync(file, JSON.stringify(players));

/* The CSV is the same data and should not disagree with it. */
const csvPath = path.join(DATA_DIR, 'cfb_player_seasons.csv');
if (fs.existsSync(csvPath)) {
  const rows = parseCSVObjects(fs.readFileSync(csvPath, 'utf8'));
  const cols = Object.keys(rows[0]);
  let n = 0;
  for (const r of rows) {
    if (r.stat_line && String(r.stat_line).trim()) continue;
    r.stat_line = standIn(r); n++;
  }
  console.log('csv: ' + n + ' filled');
  if (!check && n) fs.writeFileSync(csvPath, toCSV(rows, cols));
}

const left = players.filter((p) => !p.stat_line || !String(p.stat_line).trim()).length;
console.log('players still showing nothing: ' + left);
console.log(check ? '\nchecked only, nothing written' : '\nwritten');
process.exit(left ? 1 : 0);
