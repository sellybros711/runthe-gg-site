/*
 * ADD THE BIO FIELDS TO THE SHIPPED PLAYER DATA, AND CHANGE NOTHING ELSE.
 *
 *   node football/build/backfill-bio.mjs [--check]
 *
 * Two of them so far: `age`, how old he was that season, and `last_season`, the final year
 * he appeared in an NFL game at all. The second is what lets the winter say RETIRED and mean
 * it: a man who leaves your roster and never plays again really did stop, while one who is
 * simply absent for a year has a later season on record and is not retired.
 *
 * WHY THIS EXISTS RATHER THAN A REBUILD. 01-players.mjs and 01-defenders.mjs now emit an
 * `age` on every row, so the next full build carries it and this file becomes unnecessary.
 * But running that build TODAY does more than add a column: nflverse has moved since the
 * data shipped, and a rebuild here added two Bo Melton seasons and shifted the numbers on
 * 313 existing rows (mostly a percentile in the fourth decimal, some ppg). Every one of
 * those may well be an improvement, and refreshing the pool is still a decision with its
 * own testing, not something to smuggle in behind a label on a draft tile.
 *
 * So this joins the one new field on and rewrites the file. --check verifies that is all it
 * did: same rows, same order, same values, one key added.
 *
 * The age itself comes from lib.mjs's seasonAge, which is the same function the builds call,
 * so a backfilled row and a rebuilt one cannot disagree.
 */
import fs from 'fs';
import path from 'path';
import { DATA_DIR, nflverseCSV, parseCSVObjects, parseCSV, toCSV, seasonAge } from './lib.mjs';

const CHECK = process.argv.includes('--check');
const FILES = ['player_seasons', 'defender_seasons'];

const bio = new Map();
for (const r of parseCSVObjects(await nflverseCSV('players', 'players.csv'))) {
  if (!r.gsis_id) continue;
  bio.set(r.gsis_id, {
    birth: r.birth_date || null,
    last: r.last_season ? Number(r.last_season) : null,
  });
}
console.log(`bios: ${bio.size}`);

let bad = 0;
for (const base of FILES) {
  const jsonPath = path.join(DATA_DIR, `${base}.json`);
  const rows = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  let aged = 0, missing = 0;
  const out = rows.map((r) => {
    const b = bio.get(r.player_id) || {};
    const age = seasonAge(b.birth, r.season);
    if (age == null) missing++; else aged++;
    /* Appended rather than spliced in, so the key order of every existing field is
       untouched and a diff of the file reads as one addition per row. */
    return { ...r, age, last_season: b.last ?? null };
  });

  if (CHECK) {
    /* THE POINT OF THE CHECK: prove the file gained a field and lost nothing. Compared
       against what is on disk, which by then is the written file, so this is re-read
       rather than trusted. */
    const now = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    let same = now.length === rows.length;
    let withAge = 0;
    for (let i = 0; i < now.length && same; i++) {
      const a = now[i];
      if (typeof a.age !== 'undefined' && a.age !== null) withAge++;
      for (const k of Object.keys(a)) {
        if (k === 'age' || k === 'last_season') continue;
        if (JSON.stringify(a[k]) !== JSON.stringify(rows[i][k])) { same = false; break; }
      }
    }
    console.log(`${base}: ${now.length} rows, every other field unchanged: ${same ? 'yes' : 'NO'}`
      + `, with an age: ${withAge}`);
    if (!same || withAge === 0) bad++;
    continue;
  }

  fs.writeFileSync(jsonPath, JSON.stringify(out));
  /* The CSV beside it is the copy for reading by hand and is not shipped, but a column that
     exists in one and not the other is exactly the drift this repo keeps getting bitten by,
     so it gets the same join. */
  const csvPath = path.join(DATA_DIR, `${base}.csv`);
  if (fs.existsSync(csvPath)) {
    const table = parseCSV(fs.readFileSync(csvPath, 'utf8'));
    const head = table[0];
    const iId = head.indexOf('player_id'), iSeason = head.indexOf('season');
    const cols = head.concat('age', 'last_season');
    const csvRows = table.slice(1).map((line) => {
      const o = {};
      head.forEach((h, i) => { o[h] = line[i]; });
      const b = bio.get(line[iId]) || {};
      o.age = seasonAge(b.birth, Number(line[iSeason])) ?? '';
      o.last_season = b.last ?? '';
      return o;
    });
    fs.writeFileSync(csvPath, toCSV(csvRows, cols));
  }
  console.log(`${base}: ${aged} aged, ${missing} without a birth date`
    + `, ${(fs.statSync(jsonPath).size / 1048576).toFixed(2)} MB`);
}

if (CHECK && bad) { console.log('FAILED'); process.exit(1); }
if (CHECK) console.log('ok');
