/* Proves board.js's scoreOf() computes exactly what the generated `score` column in
 * supabase/62_cfb_leaderboard.sql computes, for every result the game can produce.
 *
 *   node cfb/build/test/test_score_parity.mjs "postgresql://postgres@/tmp:5433/cfbtest"
 *
 * WHY THIS EXISTS. The results screen shows your place before the row comes back, by
 * recomputing the stored score locally and counting how many rows beat it. Two
 * definitions of the same number, in two languages, is the classic place for a
 * silent one-off, and this one had one: Math.round rounds a half toward positive
 * infinity, Postgres round() rounds a half away from zero, so every negative point
 * differential landing exactly on a half disagreed by one whole step of the column.
 * 6,800 of the 27,217 combinations below.
 *
 * THE RAW VALUE IS WHAT GETS TESTED, not the stored one. The browser hands scoreOf()
 * the differential it just computed; rounding is the step under test, so feeding it
 * the already-rounded number would test nothing. An earlier version of this did
 * exactly that and reported everything green.
 */
import { execFileSync } from 'child_process';

const CONN = process.argv[2] || 'cfbtest';
const psql = (sql) => execFileSync('psql', ['-d', CONN, '-tAq', '-c', sql],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/* Mirrors cfb_runs exactly: point_diff is numeric(4,1), so the COLUMN rounds on the
   way in, and the generated score is derived from the already-rounded value. */
psql(`
  drop table if exists score_parity;
  create table score_parity (
    wins smallint not null,
    raw_diff numeric(8,4) not null,
    point_diff numeric(4,1) not null,
    score integer generated always as (
      wins::int * 10000
      + least(9999, greatest(0, round((point_diff + 40) * 100)::int))
    ) stored
  );
  insert into score_parity (wins, raw_diff, point_diff)
  select w, (v/100.0)::numeric, (v/100.0)::numeric
  from generate_series(0,16) w, generate_series(-4000, 4000, 5) v;
`);
const rows = psql(`select wins||' '||raw_diff||' '||score from score_parity`)
  .trim().split('\n').filter(Boolean);

global.window = {};
await import('../../board.js');
const B = global.window.PS_CFB_BOARD;

let bad = 0;
const examples = [];
for (const line of rows) {
  const [w, d, sc] = line.trim().split(/\s+/);
  const mine = B.scoreOf(Number(w), Number(d));
  if (mine !== Number(sc)) {
    bad++;
    if (examples.length < 5) examples.push(`wins=${w} point_diff=${d} postgres=${sc} board.js=${mine}`);
  }
}

console.log(`checked ${rows.length} results: wins 0..16 by point differential -40.00..40.00 in 0.05 steps`);
if (bad) {
  console.log(`MISMATCHES: ${bad}`);
  examples.forEach((e) => console.log('  ' + e));
  process.exit(1);
}
console.log('scoreOf() and the generated column agree on every one');
psql('drop table if exists score_parity;');
