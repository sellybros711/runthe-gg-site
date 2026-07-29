// The Perfect Season — one-time leaderboard rating backfill.
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
//   new_rating = squad_fppg * (1 + chemistry_pct/100) * rosterStructure(roster).multiplier
//
//   Note: rosterStructure reads each player's current per-game stats, so if the player
//   data has been rebuilt since a run was recorded the recomputed multiplier reflects
//   today's numbers. squad_fppg is taken from the row (not re-summed), so the raw points
//   stay fixed; only the fit multiplier is re-derived. This is intentional for option A.
//
// USAGE
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_KEY=<service-role key, NOT the anon key> \
//   node scripts/recalc_leaderboard_ratings.js            # dry run: reports, writes nothing
//   node scripts/recalc_leaderboard_ratings.js --apply    # actually writes the updates
//
//   The service-role key bypasses row-level security, which anon PATCHes cannot. Keep it
//   out of the browser and out of git; pass it through the environment only.
//
// No npm packages: Node 18+ has global fetch.

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const PAGE = 1000;

const URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!URL || !KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY in the environment.');
  process.exit(1);
}
const REST = URL + '/rest/v1/';
const HEADERS = { apikey: KEY, Authorization: 'Bearer ' + KEY };

// ─── the engine and the player data, exactly what the game recomputes against ──
const E = require(path.join(__dirname, '..', 'football', 'engine.js'));
const players = require(path.join(__dirname, '..', 'football', 'data', 'player_seasons.json'));

// pickKey is `${player_id}:${season}`; BYKEY is keyed `${player_id}|${season}` — the same
// two functions the client uses (index.html), reproduced so a pick resolves identically.
const BYKEY = new Map(players.map((p) => [p.player_id + '|' + p.season, p]));
const fromPickKey = (k) => {
  const i = String(k).lastIndexOf(':');
  return BYKEY.get(String(k).slice(0, i) + '|' + String(k).slice(i + 1)) || null;
};

const round2 = (n) => Math.round(n * 100) / 100;

async function getPage(offset) {
  const cols = 'id,picks,chemistry_pct,squad_fppg,structure_mult,team_rating';
  const q = REST + 'ps_runs?select=' + cols +
    '&team_rating=not.is.null&order=id.asc&limit=' + PAGE + '&offset=' + offset;
  const res = await fetch(q, { headers: HEADERS });
  if (!res.ok) throw new Error('read failed ' + res.status + ' ' + (await res.text()).slice(0, 200));
  return res.json();
}

async function patchRow(id, body) {
  const res = await fetch(REST + 'ps_runs?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, HEADERS),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('patch ' + id + ' failed ' + res.status + ' ' + (await res.text()).slice(0, 200));
}

(async () => {
  console.log((APPLY ? 'APPLY' : 'DRY RUN') + ' — recomputing rating on ps_runs against ' + URL);
  let offset = 0, seen = 0, changed = 0, unchanged = 0, skipped = 0, errors = 0;
  const samples = [];

  for (;;) {
    let rows;
    try { rows = await getPage(offset); }
    catch (e) { console.error(e.message); process.exit(1); }
    if (!rows.length) break;

    for (const r of rows) {
      seen++;
      const picks = r.picks || [];
      const fppg = r.squad_fppg == null ? null : Number(r.squad_fppg);
      const chemPct = r.chemistry_pct == null ? null : Number(r.chemistry_pct);
      if (!picks.length || fppg == null || chemPct == null) { skipped++; continue; }

      const roster = picks.map(fromPickKey);
      if (roster.length !== E.SLOTS.length || roster.some((p) => !p)) { skipped++; continue; }

      const newMult = E.rosterStructure(roster).multiplier;
      const newRating = round2(fppg * (1 + chemPct / 100) * newMult);
      const oldRating = r.team_rating == null ? null : round2(Number(r.team_rating));

      if (oldRating !== null && Math.abs(newRating - oldRating) < 0.005) { unchanged++; continue; }

      if (samples.length < 12) {
        samples.push('  #' + r.id + '  rating ' + (oldRating == null ? '--' : oldRating.toFixed(2)) +
          ' -> ' + newRating.toFixed(2) + '   mult ' +
          (r.structure_mult == null ? '--' : Number(r.structure_mult).toFixed(4)) +
          ' -> ' + newMult.toFixed(4));
      }

      if (APPLY) {
        try { await patchRow(r.id, { team_rating: newRating, structure_mult: newMult }); changed++; }
        catch (e) { errors++; console.error(e.message); }
      } else { changed++; }
    }

    offset += rows.length;
    if (rows.length < PAGE) break;
  }

  console.log('\nsample of the changes:');
  console.log(samples.join('\n') || '  (none)');
  console.log('\n' + (APPLY ? 'updated' : 'would update') + ': ' + changed +
    '   unchanged: ' + unchanged + '   skipped (unresolved/incomplete): ' + skipped +
    '   errors: ' + errors + '   seen: ' + seen);
  if (!APPLY && changed) console.log('\nRe-run with --apply to write these updates.');
})();
