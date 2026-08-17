/* Segue — put the archive's own counts back into the copy that states them.
 *
 *   node scripts/setlist/sync_counts.mjs            # after an ingest
 *   node scripts/setlist/sync_counts.mjs --check    # report, change nothing
 *
 * WHY THIS HAS TO EXIST FOR THE REFRESH TO BE AUTOMATABLE AT ALL.
 * check_data.mjs asserts that the home screen's "655 shows from the elgoose.net
 * archive" matches the number of shows actually in the CSV, and it is right to:
 * a home screen quoting a stale figure is the kind of wrong nobody notices for
 * months. But it also means EVERY successful data refresh fails the checks,
 * because one new show makes the sentence false. Without this the scheduled job
 * would go red every time it worked.
 *
 * So the counts are derived from the file and written back into the two places
 * that quote them, and check_data keeps guarding that they agree. The guard is
 * the point; this is what lets the guard survive contact with a cron job.
 *
 * Deliberately NOT clever: it rewrites the digits inside two known sentences and
 * fails loudly if it cannot find them, rather than trying to parse HTML or
 * Markdown. If somebody rewords the copy this stops working and says so, which
 * is better than silently editing the wrong number.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import loadBand, { parseCSV } from '../../setlist/dataLoader.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = p => readFileSync(resolve(repoRoot, p), 'utf8');
const CHECK = process.argv.includes('--check');

const csv = read('setlist/data/goose.csv');
const rows = parseCSV(csv);
const { shows } = loadBand(csv);
const songs = new Set(rows.map(r => r.song_id).filter(Boolean)).size;

const counts = { performances: rows.length, shows: shows.length, songs };
console.log(`goose.csv: ${counts.performances} performances · ${counts.shows} shows · ${counts.songs} songs`);

let changed = 0;
/* PENDING CONTENT PER FILE, NOT A LIST OF EDITS, and that distinction is a bug
   that reached main. DATA_CONTRACT is patched twice now: once for the
   performance counts and once for the show table's. When each patch computed
   its result from the copy ON DISK and the writes were replayed at the end,
   the second write silently threw away the first, so the contract shipped with
   a current show-table line and a stale performance line. Every patch now
   reads whatever the previous one produced. */
const pending = new Map();
const current = file => pending.has(file) ? pending.get(file) : read(file);

/* Each edit names the file, the pattern it expects to find EXACTLY ONCE, and
   what to put back. A pattern that matches zero times or more than once is a
   failure rather than a guess. */
const patch = (file, re, replace, what) => {
  const before = current(file);
  const hits = [...before.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))];
  if (hits.length !== 1) {
    console.error(`  FAIL  ${file}: expected one "${what}", found ${hits.length}`);
    process.exitCode = 1;
    return;
  }
  const after = before.replace(re, replace);
  if (after === before) { console.log(`  ok    ${file}: ${what} already current`); return; }
  pending.set(file, after);
  changed++;
  console.log(`  ${CHECK ? 'STALE' : 'wrote'} ${file}: ${what}`);
};

/* THE CACHE BUSTER, and the bug that made it necessary.
 *
 * The game fetches its data as `goose.csv?v=${DATA_VERSION}`, and that constant
 * was maintained by hand. It sat at 2 from 5 August while goose.csv changed on
 * the 14th, 16th and 17th, so four different files were served under one URL
 * and any cache kept the oldest. A player who marked a show from the 14th was
 * told they had never heard the songs played at it: their browser had an
 * archive from before that night existed.
 *
 * Hashing all three data files rather than just the archive, because the page
 * reads all three under the same version. Content-addressed, so it changes when
 * the data changes and not otherwise, and it is computed in the same step of
 * the refresh that already rewrites the counts. */
const DATA_FILES = [
  'setlist/data/goose.csv',
  'setlist/data/goose_shows.csv',
  'setlist/data/goose_latest.json',
];
const stamp = createHash('sha1');
for (const f of DATA_FILES) stamp.update(read(f));
const version = stamp.digest('hex').slice(0, 8);
console.log(`data stamp: ${version}`);
patch('setlist/index.html',
  /const DATA_VERSION = '[0-9a-f]{8}';/,
  `const DATA_VERSION = '${version}';`,
  'the cache buster');

// The home screen's band card.
patch('setlist/index.html',
  /(\d[\d,]*) shows from the elgoose\.net archive/,
  `${counts.shows} shows from the elgoose.net archive`,
  'archive size on the home screen');

// The contract's "as of the last run" line.
patch('setlist/data/DATA_CONTRACT.md',
  /\*\*(\d[\d,]*) performances · (\d[\d,]*) shows · (\d[\d,]*) songs\*\*/,
  `**${counts.performances} performances · ${counts.shows} shows · ${counts.songs} songs**`,
  'counts in DATA_CONTRACT');

/* The show table's own line. "still to play" moves every time the band plays,
   which is the whole point of the file, so it cannot be left to a human. */
const showRows = parseCSV(read('setlist/data/goose_shows.csv'));
const today = new Date().toISOString().slice(0, 10);
const st = {
  shows: showRows.length,
  withSet: showRows.filter(r => r.has_setlist === 'true').length,
  upcoming: showRows.filter(r => r.show_date >= today).length,
};
console.log(`goose_shows.csv: ${st.shows} shows · ${st.withSet} with a setlist · ${st.upcoming} still to play`);
patch('setlist/data/DATA_CONTRACT.md',
  /\*\*(\d[\d,]*) shows · (\d[\d,]*) with a setlist · (\d[\d,]*) still to\s*\nplay\*\*/,
  `**${st.shows} shows · ${st.withSet} with a setlist · ${st.upcoming} still to\nplay**`,
  'counts in the show table section');

if (!CHECK) for (const [file, after] of pending) writeFileSync(resolve(repoRoot, file), after);

if (CHECK && changed) {
  console.error(`\n${changed} file(s) quote stale counts. Run without --check to fix.`);
  process.exitCode = 1;
} else if (!changed) {
  console.log('\nnothing to update');
} else {
  console.log(`\nupdated ${changed} file(s)`);
}
