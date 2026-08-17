/* Segue — is this data refresh safe to commit?
 *
 *   node scripts/setlist/data_drift.mjs                  # working tree vs HEAD
 *   node scripts/setlist/data_drift.mjs old.csv new.csv  # two files
 *
 * WHAT THIS IS FOR, and why "read the diff" is not the answer.
 * A refresh is not an append. crowd_rating is DERIVED: the most-jamcharted song
 * sets a ceiling of 75 and everything else scales by square root beneath it, so
 * one new show restates nearly every song's esteem. Role tags are inferred from
 * each song's whole history, so new plays move those thresholds too. Measured on
 * a real one-show refresh:
 *
 *     crowd_rating changed on 3,877 of 7,504 rows
 *     tags on 559 · is_jamchart on 128 · jamchart_note on 115
 *     esteem moved by a median of 1 point, p95 of 3, max of 44
 *
 * So a weekly refresh is a four-thousand-line diff by construction, and nobody
 * is going to read it. The control cannot be review; it has to be assertions.
 *
 * The max of 44 is fine and expected: that is a song being written up for the
 * first time and joining the scale. What would NOT be fine is the whole scale
 * moving at once, which is what a jamchart outage or a changed field name looks
 * like, and that shows up in the MEDIAN rather than the max. Hence the gate
 * below is on the median, plus the two counts that must never go backwards.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCSV } from '../../setlist/dataLoader.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CSV = 'setlist/data/goose.csv';

/* A refresh that removes shows is a broken fetch, not a smaller band: elgoose
   does not delete history. Zero tolerance on both counts. */
const MEDIAN_ESTEEM_LIMIT = 5;

const [argOld, argNew] = process.argv.slice(2);
const newText = readFileSync(resolve(repoRoot, argNew || CSV), 'utf8');
const oldText = argOld
  ? readFileSync(resolve(repoRoot, argOld), 'utf8')
  /* HEAD's copy, read through git rather than the filesystem, because the
     working tree's copy IS the new one. */
  : execFileSync('git', ['show', `HEAD:${CSV}`], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64e6 });

const oldRows = parseCSV(oldText);
const newRows = parseCSV(newText);
const showsOf = rows => new Set(rows.map(r => r.show_id)).size;

let failures = 0;
const ok = m => console.log(`  ok    ${m}`);
const fail = m => { failures++; console.error(`  FAIL  ${m}`); };
const check = (c, m) => c ? ok(m) : fail(m);

const oldShows = showsOf(oldRows), newShows = showsOf(newRows);
console.log(`was ${oldRows.length} performances / ${oldShows} shows`);
console.log(`now ${newRows.length} performances / ${newShows} shows\n`);

check(newRows.length >= oldRows.length,
  `performances did not go backwards (${oldRows.length} to ${newRows.length})`);
check(newShows >= oldShows, `shows did not go backwards (${oldShows} to ${newShows})`);

/* An upper bound too. Goose plays on the order of 100 shows a year, so a
   refresh that adds hundreds means the previous file was truncated or this one
   picked up another band -- the two failure modes DATA_CONTRACT names. */
check(newShows - oldShows <= 60, `the growth is plausible (+${newShows - oldShows} shows)`);

// Row identity: one performance is a show, a position and a song.
const key = r => `${r.show_id}|${r.position}|${r.song_id}`;
const before = new Map(oldRows.map(r => [key(r), r]));
const moves = [];
let paired = 0;
for (const r of newRows) {
  const o = before.get(key(r));
  if (!o) continue;
  paired++;
  const a = Number(o.crowd_rating), b = Number(r.crowd_rating);
  if (Number.isFinite(a) && Number.isFinite(b) && a !== b) moves.push(Math.abs(b - a));
}
check(paired > oldRows.length * 0.95,
  `the old rows are still there (${paired} of ${oldRows.length} matched)`);

moves.sort((x, y) => x - y);
const med = moves.length ? moves[Math.floor(moves.length / 2)] : 0;
console.log(`\nesteem moved on ${moves.length} of ${paired} paired rows` +
  (moves.length ? `: median ${med}, p95 ${moves[Math.floor(moves.length * 0.95)]}, max ${moves[moves.length - 1]}` : ''));
check(med <= MEDIAN_ESTEEM_LIMIT,
  `the esteem scale held steady (median move ${med}, limit ${MEDIAN_ESTEEM_LIMIT})`);

/* The one that catches a jamchart outage outright: the column going blank is
   how every song ends up scoring identically. */
const rated = newRows.filter(r => r.crowd_rating).length;
const wasRated = oldRows.filter(r => r.crowd_rating).length;
check(rated >= wasRated * 0.9,
  `esteem is still populated (${rated} rows, was ${wasRated})`);

/* ── the show table ──────────────────────────────────────────────────────────
 *
 * THE ROW COUNT IS THE ONLY HONEST ALARM HERE, and it is worth being clear why
 * the obvious one is wrong. "There are no upcoming shows" cannot be a failure:
 * a band between tours really does have none, and gating on it would block
 * every setlist refresh until they announced something. What a broken response
 * actually looks like is the table collapsing, so that is what this watches.
 *
 * It only runs when both sides have the file, so the commit that introduces it
 * is not failed by its own absence from HEAD.
 */
const SHOWS = 'setlist/data/goose_shows.csv';
const readShows = src => { try { return parseCSV(src()); } catch { return null; } };
const newShows2 = readShows(() => readFileSync(resolve(repoRoot, SHOWS), 'utf8'));
const oldShows2 = argOld ? null : readShows(() =>
  /* stderr piped, not inherited: the first run after this file is added has no
     HEAD copy, and git's "exists on disk, but not in HEAD" would otherwise be
     printed as if something had gone wrong. It has not; that is the new-file
     case the branch below handles. */
  execFileSync('git', ['show', `HEAD:${SHOWS}`],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 8e6, stdio: ['ignore', 'pipe', 'pipe'] }));

if (newShows2) {
  const today = new Date().toISOString().slice(0, 10);
  const up = newShows2.filter(r => r.show_date >= today).length;
  console.log(`\nshow table: ${newShows2.length} shows, ${up} still to play` +
    (oldShows2 ? ` (was ${oldShows2.length})` : ' (new file)'));
  check(newShows2.some(r => r.tour), 'the show table still carries tour names');
  check(newShows2.every(r => /^\d{4}-\d{2}-\d{2}$/.test(r.show_date || '')),
    'every show_date in the table is YYYY-MM-DD');
  if (oldShows2) {
    check(newShows2.length >= oldShows2.length,
      `the show table did not shrink (${oldShows2.length} to ${newShows2.length})`);
    check(newShows2.length - oldShows2.length <= 60,
      `and its growth is plausible (+${newShows2.length - oldShows2.length})`);
  }
}

console.log();
console.log(failures ? `${failures} check(s) failed — do NOT commit this refresh`
                     : 'drift is within bounds');
process.exit(failures ? 1 : 0);
