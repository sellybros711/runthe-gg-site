// The Perfect Season — one-time leaderboard rating backfill (compute step).
//
// WHY THIS EXISTS
//   The roster-fit bonus changed (it is now an offensive-scheme fit scaled 1–3%,
//   folded into the structure multiplier). Rows submitted under the old formula still
//   carry the old `structure_mult` and `team_rating`, so the rating leaderboard mixes
//   two scoring systems. Every row stores its exact six `picks`, its `chemistry_pct`
//   and its `squad_fppg`, so we can replay the CURRENT rating formula on each one and
//   overwrite just those two numbers.
//
// WHAT IT CHANGES — AND WHAT IT DOES NOT
//   Recomputes ONLY structure_mult and team_rating, reusing each run's stored
//   squad_fppg and chemistry_pct so nothing but the fit bonus moves. Win/loss records,
//   the `score` column, perfect flags and the record-sorted board are left exactly as
//   they are. This is the "rating only" migration, not a re-simulation.
//
//     new_rating = squad_fppg * (1 + chemistry_pct/100) * rosterStructure(roster).multiplier
//
//   rosterStructure reads each player's current per-game stats, so if the player data
//   has been rebuilt since a run was recorded the recomputed multiplier reflects today's
//   numbers. squad_fppg is taken from the row (not re-summed), so the raw points stay
//   fixed; only the fit multiplier is re-derived. Intentional for the rating-only pass.
//
// HOW IT RUNS (no network, no npm packages)
//   This script only computes. It reads the rows it needs as TSV on stdin and writes
//   `UPDATE ps_runs …` statements to stdout; a human-readable summary goes to stderr.
//   The GitHub Action (.github/workflows/recalc-ps-ratings.yml) does the database I/O
//   with psql and the existing SUPABASE_DB_URL secret:
//
//     psql "$SUPABASE_DB_URL" -At -F '\t' -c \
//       "select id, array_to_string(picks,'|'), chemistry_pct, squad_fppg,
//               structure_mult, team_rating
//          from ps_runs where team_rating is not null" \
//     | node scripts/recalc_leaderboard_ratings.js > updates.sql
//     psql "$SUPABASE_DB_URL" -1 -f updates.sql          # apply, in one transaction
//
//   Locally you can pipe a TSV the same way. Nothing here writes to the database.

const path = require('path');

const E = require(path.join(__dirname, '..', 'football', 'engine.js'));
const players = require(path.join(__dirname, '..', 'football', 'data', 'player_seasons.json'));

// pickKey is `${player_id}:${season}`; BYKEY is keyed `${player_id}|${season}` — the same
// resolution the client uses, so a stored pick maps to the same player object.
const BYKEY = new Map(players.map((p) => [p.player_id + '|' + p.season, p]));
const fromPickKey = (k) => {
  const i = String(k).lastIndexOf(':');
  return BYKEY.get(String(k).slice(0, i) + '|' + String(k).slice(i + 1)) || null;
};

const round2 = (n) => Math.round(n * 100) / 100;   // team_rating   numeric(6,2)
const round3 = (n) => Math.round(n * 1000) / 1000;  // structure_mult numeric(4,3)

function readStdin() {
  return new Promise((resolve) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => { buf += d; });
    process.stdin.on('end', () => resolve(buf));
  });
}

(async () => {
  const text = await readStdin();
  const lines = text.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.length);

  let seen = 0, changed = 0, unchanged = 0, skipped = 0;
  const samples = [];
  const out = [];

  for (const line of lines) {
    seen++;
    // id \t picks(joined by |) \t chemistry_pct \t squad_fppg \t structure_mult \t team_rating
    const f = line.split('\t');
    const id = f[0];
    const picks = (f[1] || '').split('|').filter(Boolean);
    const chemPct = f[2] === '' || f[2] == null ? null : Number(f[2]);
    const fppg = f[3] === '' || f[3] == null ? null : Number(f[3]);
    const oldRating = f[5] === '' || f[5] == null ? null : round2(Number(f[5]));

    if (!id || picks.length !== E.SLOTS.length || chemPct == null || fppg == null) { skipped++; continue; }

    const roster = picks.map(fromPickKey);
    if (roster.some((p) => !p)) { skipped++; continue; }   // older player data than this file

    /* Rating uses the FULL-precision multiplier, exactly as the client's teamRating() does
       (fppg * chemistry * multiplier), so a recomputed row matches what a fresh run would
       store for the same six today. structure_mult is the same multiplier at the column's
       3-dp scale — the client stores it the same way, since numeric(4,3) rounds it. */
    const multFull = E.rosterStructure(roster).multiplier;
    const newMult = round3(multFull);
    const newRating = round2(fppg * (1 + chemPct / 100) * multFull);

    if (oldRating !== null && Math.abs(newRating - oldRating) < 0.005) { unchanged++; continue; }

    changed++;
    out.push('update ps_runs set team_rating=' + newRating.toFixed(2) +
      ', structure_mult=' + newMult.toFixed(3) + ' where id=' + id + ';');
    if (samples.length < 15) {
      samples.push('  #' + id + '  rating ' + (oldRating == null ? '--' : oldRating.toFixed(2)) +
        ' -> ' + newRating.toFixed(2) + '   mult ' +
        (f[4] === '' ? '--' : Number(f[4]).toFixed(3)) + ' -> ' + newMult.toFixed(3));
    }
  }

  process.stdout.write(out.join('\n') + (out.length ? '\n' : ''));

  const log = (s) => process.stderr.write(s + '\n');
  log('');
  log('sample of the changes:');
  log(samples.join('\n') || '  (none)');
  log('');
  log('rows seen: ' + seen + '   to update: ' + changed + '   unchanged: ' + unchanged +
    '   skipped (incomplete/unresolvable): ' + skipped);
})();
