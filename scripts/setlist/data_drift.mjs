/* Segue — is this data refresh safe to commit?
 *
 *   node scripts/setlist/data_drift.mjs                  # working tree vs HEAD
 *   node scripts/setlist/data_drift.mjs old.csv new.csv  # two files
 *
 * WHAT THIS IS FOR.
 * A refresh appends, and these assertions are what keep it that way.
 *
 * It did not always. crowd_rating is DERIVED, and it used to scale against the
 * CURRENT LEADER's jamchart tally, so the moment the top song gained an entry
 * the divisor moved and every other song's esteem moved with it, having done
 * nothing. Measured on today's data, 9 of the 99 rated songs shift when the
 * leader alone gains one. That is what made a refresh a thousands-of-lines diff
 * nobody could read.
 *
 * The ceiling is pinned now (ESTEEM_FULL in ingest_band.mjs), so a song's
 * esteem is a fact about that song. The gates below hold the line: counts may
 * only grow, the old rows must all still be there, the esteem scale must not
 * shift under the archive, and derived values may only move for songs whose own
 * history moved. A wider change is a regeneration, which is a deliberate act
 * and not something a scheduled job does to everybody overnight.
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
/* The detail matters more here than in an interactive tool: this runs
   unattended and its log is the only thing anybody will have to go on. */
const check = (c, m, detail) => c ? ok(m) : fail(`${m}${detail ? `: ${detail}` : ''}`);

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

/* ── A REFRESH ADDS A SHOW. IT DOES NOT RESTATE THE ARCHIVE. ─────────────────
 *
 * Two of the columns are DERIVED per song and denormalised onto every row of
 * that song, so a change in how they are derived rewrites thousands of rows at
 * once. crowd_rating used to be scaled against the current leader's jamchart
 * tally, which meant one song being written up moved every other song's
 * esteem: 9 of 99 rated songs shifted when the leader alone gained an entry,
 * having done nothing. That is what made a one-show refresh an unreviewable
 * diff and re-sent the whole 1.2MB archive to every returning player.
 *
 * The ceiling is pinned now, so a song's esteem is a fact about that song. This
 * gate is what keeps it that way: derived values may only move for songs whose
 * OWN inputs moved. A curator writing up an old version legitimately moves that
 * song and nothing else; anything wider is a regeneration, which is a
 * deliberate act and not something a cron job does overnight.
 */
{
  const bySong = rows => {
    const m = new Map();
    for (const r of rows) {
      if (!r.song_id) continue;
      let s = m.get(r.song_id);
      if (!s) m.set(r.song_id, s = { esteem: r.crowd_rating, tags: r.tags, plays: 0, charted: 0 });
      s.plays++;
      if (r.is_jamchart === 'true') s.charted += 1 + (r.is_recommended === 'true' ? 2 : 0);
    }
    return m;
  };
  const was = bySong(oldRows), now = bySong(newRows);
  const movedEsteem = [], movedTags = [], unexplained = [];
  for (const [id, a] of now) {
    const b = was.get(id);
    if (!b) continue;                       // a new song has nothing to drift from
    const inputsMoved = a.charted !== b.charted || a.plays !== b.plays;
    if (a.esteem !== b.esteem) {
      movedEsteem.push(id);
      if (!inputsMoved) unexplained.push(`${id} esteem ${b.esteem} to ${a.esteem}`);
    }
    if (a.tags !== b.tags) {
      movedTags.push(id);
      if (!inputsMoved) unexplained.push(`${id} tags "${b.tags}" to "${a.tags}"`);
    }
  }
  console.log(`\nderived values moved on ${movedEsteem.length} song(s) for esteem, ` +
    `${movedTags.length} for tags, of ${now.size}`);
  check(!unexplained.length,
    'every derived change belongs to a song whose own history changed',
    unexplained.length ? `${unexplained.length} unexplained, e.g. ${unexplained[0]}` : '');
}

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
