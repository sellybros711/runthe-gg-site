/*
 * ADD THE REAL SEASON TOTALS TO THE SHIPPED PLAYER DATA, AND CHANGE NOTHING ELSE.
 *
 *   node football/build/backfill-stats.mjs [--check]
 *
 * The pool has always carried a player's production as fantasy points: `fppg` and the
 * three-way split of where those points came from. That is what the sim runs on and it is
 * the right number there. It is the wrong number to put in front of somebody deciding
 * whether to keep a 31 year old receiver, because a points-per-game figure needs a scale
 * nobody is showing him. Yards, catches and touchdowns need no scale.
 *
 * Those numbers were already computed at build time (STAT_KEYS in 01-players.mjs) and then
 * spent on one thing: `stat_line`, a sentence. A sentence cannot be divided by games or
 * compared against last year, so the numbers behind it now ship too.
 *
 * WHY THIS EXISTS RATHER THAN A REBUILD: see backfill-bio.mjs, which is the same argument.
 * A rebuild today also refreshes the pool against a moved nflverse, which is its own
 * decision with its own testing.
 *
 * THE CHECK IS THE POINT. Summing weekly rows into a season is the exact thing 01-players
 * does, so this recomputes `stat_line` from its own totals and compares it against the
 * sentence already on the row. Every row matching means the sums are the shipped build's
 * sums, joined to the right man, in the right season, on the right club.
 *
 * One row does not match, and it is worth writing down what that means. Caleb Williams
 * gained five more rushing yards in 2025 than he had when the pool was built: nflverse
 * revised him after the fact. So the sentence and the numbers behind it would disagree on
 * one card, and the sentence is rewritten from the numbers rather than left to argue with
 * them. His fppg is a third of a tenth of a point stale as a result, which is not worth a
 * rebuild. A DOZEN rows drifting would mean something else entirely: that the pool itself
 * has moved and refreshing it is the job, not this. So that is where it stops.
 *
 * Offense only. The winter belongs to The Gauntlet, which is six offensive players, and
 * the defenders' pool is 7 MB before adding anything to it.
 */
import fs from 'fs';
import path from 'path';
import { DATA_DIR, SEASONS, nflverseCSV, parseCSVObjects, parseCSV, toCSV } from './lib.mjs';

const CHECK = process.argv.includes('--check');
const BASE = 'player_seasons';

/* The eight numbers a player's own card is made of, in the order a stat line reads them.
   Short keys because they are shipped 9,424 times: the file is downloaded by every visitor
   to every mode, and `passing_interceptions` costs 22 bytes a row to say INT. */
const KEYS = [
  ['pass_yds', 'passing_yards'], ['pass_td', 'passing_tds'], ['int', 'passing_interceptions'],
  ['rush_yds', 'rushing_yards'], ['rush_td', 'rushing_tds'],
  ['rec', 'receptions'], ['rec_yds', 'receiving_yards'], ['rec_td', 'receiving_tds'],
];

/* Summed but NOT shipped. Attempts and carries decide which lines a stat line prints, so
   the check below needs them and nothing on screen does. A field that ships and is never
   read is a field nobody notices going wrong. */
const GATE_KEYS = [['att', 'attempts'], ['car', 'carries']];
const ALL_KEYS = KEYS.concat(GATE_KEYS);

/* Copied from 01-players.mjs rather than imported, because importing that module runs it:
   it is a build script with a bare main() at the bottom, and asking it for one function
   rebuilds the pool. Kept identical on purpose; the check below fails loudly if it drifts. */
function statLine(position, t) {
  const n = (v) => v.toLocaleString('en-US');
  const parts = [];
  if (t.att >= 50) {
    parts.push(`${n(t.pass_yds)} pass yds`, `${t.pass_td} TD`, `${t.int} INT`);
  }
  const runs = t.rush_yds > 0
    && (position === 'RB' ? t.car > 0 : (t.rush_yds >= 100 || t.rush_td >= 2));
  if (runs) parts.push(`${n(t.rush_yds)} rush yds`, `${t.rush_td} TD`);
  if (t.rec >= 10 || (['WR', 'TE'].includes(position) && t.rec > 0)) {
    parts.push(`${t.rec} rec`, `${n(t.rec_yds)} yds`, `${t.rec_td} TD`);
  }
  return parts.join(', ');
}

const totals = new Map();
for (const season of SEASONS) {
  process.stderr.write(`\r${season}   `);
  const text = await nflverseCSV('stats_player', `stats_player_week_${season}.csv`);
  for (const r of parseCSVObjects(text)) {
    /* Regular season only, the same scope the pool was built on. Playoff weeks would put
       four extra games of production on exactly the players a visitor recognises. */
    if (r.season_type !== 'REG') continue;
    const key = `${r.player_id}|${season}`;
    let t = totals.get(key);
    if (!t) { t = {}; for (const [k] of ALL_KEYS) t[k] = 0; totals.set(key, t); }
    for (const [k, col] of ALL_KEYS) t[k] += Number(r[col]) || 0;
  }
}
process.stderr.write('\n');
console.log(`player-seasons summed: ${totals.size}`);

const jsonPath = path.join(DATA_DIR, `${BASE}.json`);
const rows = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

/* What each row gains: the counting stats, minus every one that is zero. A receiver has no
   interceptions and should not carry the word. */
function statsFor(r) {
  const t = totals.get(`${r.player_id}|${r.season}`);
  if (!t) return null;
  const out = {};
  for (const [k] of KEYS) if (t[k]) out[k] = t[k];
  return out;
}

const DRIFT_CEILING = 12;

let joined = 0, missing = 0, drifted = 0;
const out = rows.map((r) => {
  const t = totals.get(`${r.player_id}|${r.season}`);
  if (!t) { missing++; return { ...r, stats: null }; }
  joined++;
  const line = statLine(r.position, t);
  if (line === r.stat_line) return { ...r, stats: statsFor(r) };
  /* Upstream revised him. The sentence is rebuilt from the numbers, so the card cannot
     say one thing in words and another in figures. */
  drifted++;
  console.log(`  revised: ${r.name} ${r.season}`);
  console.log(`    was: ${r.stat_line}`);
  console.log(`    now: ${line}`);
  return { ...r, stat_line: line, stats: statsFor(r) };
});

console.log(`joined: ${joined}, no weekly rows: ${missing}, revised upstream: ${drifted}`);

if (drifted > DRIFT_CEILING) {
  console.log(`REFUSING: ${drifted} rows disagree with the shipped stat lines. That is the`
    + ' pool having moved, not a correction, and refreshing it is a rebuild.');
  process.exit(1);
}

if (CHECK) {
  /* THE POINT OF THE CHECK: prove the file gained a field and lost nothing. Read back off
     disk rather than trusted, and `stats` is compared as a whole against what this run
     would have written, so a stale file fails rather than passing quietly. */
  const now = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  let same = now.length === rows.length;
  let withStats = 0, matched = 0;
  for (let i = 0; i < now.length && same; i++) {
    const a = now[i];
    if (a.stats) withStats++;
    if (JSON.stringify(a.stats) === JSON.stringify(out[i].stats)) matched++;
    for (const k of Object.keys(a)) {
      if (k === 'stats' || k === 'stat_line') continue;
      if (JSON.stringify(a[k]) !== JSON.stringify(rows[i][k])) { same = false; break; }
    }
  }
  console.log(`${BASE}: ${now.length} rows, every other field unchanged: ${same ? 'yes' : 'NO'}`
    + `, with stats: ${withStats}, agreeing with a fresh sum: ${matched}`);
  if (!same || withStats === 0 || matched !== now.length) { console.log('FAILED'); process.exit(1); }
  console.log('ok');
  process.exit(0);
}

fs.writeFileSync(jsonPath, JSON.stringify(out));

/* The CSV beside it is the copy for reading by hand. One column per number rather than a
   nested object, because a CSV cell holding JSON is not a thing anybody can read. */
const csvPath = path.join(DATA_DIR, `${BASE}.csv`);
if (fs.existsSync(csvPath)) {
  const table = parseCSV(fs.readFileSync(csvPath, 'utf8'));
  const head = table[0];
  const iId = head.indexOf('player_id'), iSeason = head.indexOf('season');
  /* Run twice and the columns must not arrive twice. `head` is whatever is on disk, which
     after one run already ends in these names. */
  const added = new Set(ALL_KEYS.map(([k]) => k));
  const cols = head.filter((h) => !added.has(h)).concat(KEYS.map(([k]) => k));
  const csvRows = table.slice(1).map((line) => {
    const o = {};
    head.forEach((h, i) => { o[h] = line[i]; });
    const t = totals.get(`${line[iId]}|${Number(line[iSeason])}`);
    for (const [k] of KEYS) o[k] = t ? t[k] : '';
    return o;
  });
  fs.writeFileSync(csvPath, toCSV(csvRows, cols));
}

console.log(`${BASE}: ${(fs.statSync(jsonPath).size / 1048576).toFixed(2)} MB`);
