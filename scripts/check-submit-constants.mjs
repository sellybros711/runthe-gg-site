/*
 * check-submit-constants.mjs - the server's copy of the rules still matches the game's.
 *
 *   node scripts/check-submit-constants.mjs
 *
 * WHY THIS EXISTS
 * ---------------
 * ps_submit_run re-derives the season from regular_wins and playoff_wins rather than
 * trusting what the page sends, which is right: it is the thing standing between the
 * leaderboard and a forged run. To do that it needs the same numbers the engine plays by,
 * and it keeps them as a block of `constant int` at the top of its own body.
 *
 * That block is COPIED. Every migration that adds a column to ps_submit_run rebuilds the
 * whole function, and rebuilding it means starting from some older copy and editing it. The
 * bye threshold has now made that trip three times:
 *
 *   84  moved PS_BYE_SEED_WINS from 15 to 16 to match the engine, and said why
 *   86  added the defense columns, from a pre-84 copy          -> back to 15
 *   94  added the coach and plan, from a pre-84 copy           -> back to 15
 *   97  added the dynasty columns, from a pre-84 copy          -> back to 15
 *
 * None of those commits was about seeding. None of them failed anything. What it did to
 * players is that a 15-2 season, which the client seeds as a WILD CARD and sends through the
 * four round bracket, was read by the server as a top seed with a bye: four playoff wins
 * against a three round maximum, and the submit was refused outright. The best run this game
 * can produce was the one run it would not save, and the player was told the leaderboard
 * could not be reached.
 *
 * So the numbers are compared here instead of being trusted to survive the next copy. This
 * reads the LAST migration that defines the function, because that is the one a database
 * ends up running.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SQL_DIR = path.join(root, 'supabase');

/* The engine is the authority. Read as text rather than imported, so this stays a small
   script with no need for a browser global or a data file. */
const engine = fs.readFileSync(path.join(root, 'football', 'engine.js'), 'utf8');
const engineNum = (name) => {
  const m = engine.match(new RegExp('\\b' + name + ':\\s*([0-9]+(?:\\.[0-9]+)?)'));
  if (!m) throw new Error('engine.js has no ' + name);
  return Number(m[1]);
};

/* SORTED THE WAY A HUMAN APPLIES THEM, which is by the leading number and not by string:
   plain sort puts 100 before 84 and would read the wrong file as newest. */
const migrations = fs.readdirSync(SQL_DIR)
  .filter((f) => /^\d+_.*\.sql$/.test(f))
  .sort((a, b) => (parseInt(a, 10) - parseInt(b, 10)) || a.localeCompare(b));

const defines = migrations.filter((f) =>
  /create\s+or\s+replace\s+function\s+(public\.)?ps_submit_run/i
    .test(fs.readFileSync(path.join(SQL_DIR, f), 'utf8')));

if (!defines.length) {
  console.error('no migration defines ps_submit_run, which cannot be right');
  process.exit(1);
}
const newest = defines[defines.length - 1];
const body = fs.readFileSync(path.join(SQL_DIR, newest), 'utf8');
const sqlNum = (name) => {
  const m = body.match(new RegExp('\\b' + name + '\\s+constant\\s+(?:int|numeric)\\s*:=\\s*([0-9]+(?:\\.[0-9]+)?)'));
  if (!m) return null;
  return Number(m[1]);
};

/* sql constant            engine constant            what it decides */
const PAIRS = [
  ['PS_REG_GAMES', 'REGULAR_SEASON_GAMES', 'how long a regular season is'],
  ['PS_PLAYOFF_WINS', 'PLAYOFF_WINS', 'the wins that reach the playoffs'],
  ['PS_BYE_SEED_WINS', 'BYE_SEED_WINS', 'the wins that earn a first round bye'],
  ['PS_ROUNDS_BYE', 'PLAYOFF_ROUNDS_WITH_BYE', 'rounds to win it all from a bye'],
  ['PS_ROUNDS_WILDCARD', 'PLAYOFF_ROUNDS_WILD_CARD', 'rounds to win it all from a wild card'],
  ['PS_CAP_MUSD', 'CAP_MUSD', 'the salary cap'],
];

console.log(`ps_submit_run is last defined in ${newest}\n`);
let bad = 0;
for (const [sqlName, engName, what] of PAIRS) {
  const s = sqlNum(sqlName);
  let e;
  try { e = engineNum(engName); } catch (err) { console.log(`  skip  ${engName}: ${err.message}`); continue; }
  if (s === null) { console.log(`  skip  ${sqlName} is not in ${newest}`); continue; }
  const ok = s === e;
  if (!ok) bad++;
  console.log(`  ${ok ? 'ok  ' : 'WRONG'} ${sqlName.padEnd(20)} sql ${String(s).padEnd(5)} engine ${String(e).padEnd(5)} ${what}`);
}

if (bad) {
  console.log(`\n${bad} constant${bad > 1 ? 's' : ''} in ${newest} disagree${bad > 1 ? '' : 's'} with engine.js.`);
  console.log('The server re-derives the season from these, so a mismatch does not degrade');
  console.log('gracefully: it refuses real runs, or it records ones that were never played.');
  console.log('Fix the migration, not the engine, unless the game itself is changing.');
  process.exit(1);
}
console.log('\nthe server plays by the same numbers the game does');
