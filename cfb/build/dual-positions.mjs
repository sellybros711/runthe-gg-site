/* Second positions, for the players who genuinely played two.
 *
 *   node cfb/build/dual-positions.mjs           write alt_position into the data
 *   node cfb/build/dual-positions.mjs --list    print what it would do, change nothing
 *
 * WHY THIS IS DERIVED AND NOT FETCHED. CFBD carries exactly ONE position per
 * player, and it is the position that player is best known for, applied to every
 * season of their career. Checked across 59,377 player-seasons that appear in
 * both the season-stats feed and the team rosters, the two sources never once
 * disagree, so there is no upstream field naming a second position and nothing
 * to import. What the data does carry is what a man actually DID: his passing,
 * rushing and receiving, separated, season by season. A receiver who carried the
 * ball fifteen times a game was playing running back whatever the roster called
 * him, and that is the signal this reads.
 *
 * It is deliberately conservative, because the cost of a false positive is
 * telling somebody a real player played a position he never played. Every rule
 * below needs a real workload, not one trick play, and a season long enough to
 * mean it.
 *
 * Idempotent: run it twice and the second run reports nothing to do.
 */
import fs from 'node:fs';

const PATH = 'cfb/data/cfb_player_seasons.json';

/** Fantasy points a season produced, across the three phases. */
const total = (p) => (p.pass_ppg || 0) + (p.rush_ppg || 0) + (p.rec_ppg || 0);

/**
 * The second position a player-season earns, or null.
 * Exported so 01-players.mjs applies the identical rule on a full rebuild.
 */
export function secondPosition(p) {
  const pass = p.pass_ppg || 0, rush = p.rush_ppg || 0, rec = p.rec_ppg || 0;
  const T = Math.max(0.1, total(p));
  /* A short season can put a fluke line on somebody who barely played. */
  if ((p.games_played || 0) < 4) return null;

  /* Threw it for real. A trick-play pass is worth a point or two; this is a
     man who was taking snaps. */
  if (p.position !== 'QB' && pass >= 3) return 'QB';

  /* Listed at quarterback but catching passes instead: the Tannehill and
     Braxton Miller case, where the roster carries the position he is famous for
     rather than the one he lined up at that year. */
  if (p.position === 'QB' && rec >= 3 && rec > pass) return 'WR';

  /* A receiver carrying a back's workload. The share matters as much as the
     total: it has to be a real part of what he did, not a jet sweep. */
  if ((p.position === 'WR' || p.position === 'TE') && rush >= 3 && rush / T >= 0.40) return 'RB';

  /* A back who was really a slot receiver. Backs catch passes as a matter of
     course, so this needs receiving to be most of the job, not some of it. */
  if (p.position === 'RB' && rec >= 6 && rec >= 2 * Math.max(0.1, rush)) return 'WR';

  return null;
}

/* ── CLI ─────────────────────────────────────────────────────────────────────
   Guarded, because 01-players.mjs imports secondPosition from here. Without
   this, importing the rule would also rewrite the data file as a side effect of
   the import. */
const runDirectly = process.argv[1] && process.argv[1].endsWith('dual-positions.mjs');
if (!runDirectly) { /* imported for the rule only */ } else main();

function main() {
const listOnly = process.argv.includes('--list');
const rows = JSON.parse(fs.readFileSync(PATH, 'utf8'));

let added = 0, cleared = 0;
const hits = [];
for (const p of rows) {
  const want = secondPosition(p);
  if (want) {
    if (p.alt_position !== want) added++;
    p.alt_position = want;
    hits.push(p);
  } else if (p.alt_position) {
    delete p.alt_position;
    cleared++;
  }
}

const by = {};
for (const p of hits) {
  const k = `${p.position} + ${p.alt_position}`;
  by[k] = (by[k] || 0) + 1;
}
console.log(`${hits.length} of ${rows.length} player-seasons carry a second position`);
for (const [k, n] of Object.entries(by).sort((a, b) => b[1] - a[1])) {
  console.log('  ' + k.padEnd(12) + n);
}
console.log('\nthe fifteen most expensive:');
for (const p of hits.slice().sort((a, b) => b.price_musd - a.price_musd).slice(0, 15)) {
  console.log(`  $${p.price_musd.toFixed(1)}M  ${p.position}/${p.alt_position}  ` +
    `${p.name} ${p.season} ${p.school}`);
}

if (listOnly) { console.log('\n--list, nothing written'); return; }
if (!added && !cleared) { console.log('\nnothing to do: already applied'); return; }
fs.writeFileSync(PATH, JSON.stringify(rows));
console.log(`\nwrote ${PATH}: ${added} set, ${cleared} cleared`);
}
