/* Stage 7 prerequisite, display-score calibration.
 *
 *   node football/build/04-display.mjs        (run 01 and 02 first)
 *
 * The sim resolves games in roster-fantasy-point space, where your score averages
 * ~73 and an opponent's ~43. Those are not football scores, and §7 wants the death
 * card to read "Lost 27-24 at Indianapolis".
 *
 * A single divisor cannot fix it. The win probability is carried by the gap
 * between those two means, so dividing both sides just renders every week as a
 * blowout. What is needed is a monotone map from the internal margin onto the
 * REAL distribution of NFL game margins:
 *
 *   1. internal margin -> its percentile, via an empirical CDF measured over a
 *      broad mix of rosters (so the map does not depend on how good you are);
 *   2. that percentile -> a real NFL absolute margin, from 1999-2025 games;
 *   3. draw a plausible real total for that margin, conditioned on it, since
 *      blowouts and shootouts have different totals;
 *   4. split total and margin into two scores, winner preserved exactly.
 *
 * Both tables are empirical, so displayed scores are drawn from the distribution
 * real football actually produces rather than from anything invented here.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  SEASONS, DATA_DIR, GAMES_URL, cachedCSV, parseCSVObjects,
  franchiseId, mean, stdev, round,
} from './lib.mjs';

const QUANTILES = 201;               // 0.5% resolution
const require_ = (f) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));

/** Quantile table: value at each of QUANTILES evenly spaced percentiles. */
function quantileTable(values) {
  const s = [...values].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < QUANTILES; i++) {
    const q = i / (QUANTILES - 1);
    out.push(round(s[Math.min(s.length - 1, Math.round(q * (s.length - 1)))], 3));
  }
  return out;
}

async function main() {
  const players = require_('player_seasons.json');
  const teamSeasons = require_('team_seasons.json');
  const leagueCtx = require_('league_context.json');
  const E = (await import('../engine.js')).default
    ?? (await import('node:module')).createRequire(import.meta.url)('../engine.js');

  // ─── real NFL game shapes ──────────────────────────────────────────────────
  const text = await cachedCSV(GAMES_URL, 'games.csv');
  const margins = [];
  const teamPoints = [];                    // every team's score in every game
  const pairCounts = new Map();             // 'hi:lo' -> how often that final score happened
  const totalsByMarginBucket = new Map();   // |margin| -> [totals]
  for (const g of parseCSVObjects(text)) {
    if (g.game_type !== 'REG') continue;
    const season = Number(g.season);
    if (!SEASONS.includes(season)) continue;
    if (g.away_score === '' || g.home_score === '') continue;
    franchiseId(g.away_team); franchiseId(g.home_team);   // validates codes
    const a = Number(g.away_score), h = Number(g.home_score);
    const m = Math.abs(h - a);
    margins.push(m);
    teamPoints.push(a, h);
    if (!totalsByMarginBucket.has(m)) totalsByMarginBucket.set(m, []);
    totalsByMarginBucket.get(m).push(a + h);
    /*
     * The actual final score, kept as a pair with its real frequency. The old map
     * (margin -> total -> split) could land on scorelines football has never produced:
     * a team score of 4 came up 0.43% of the time in the shipped build and has happened
     * exactly ZERO times in 7,276 real games. Sampling real pairs makes that impossible
     * by construction rather than by patching the arithmetic afterwards.
     *
     * Ties are dropped. The sim always has a winner, so a tied pair could never be used.
     */
    if (m >= 1) {
      const key = Math.max(a, h) + ':' + Math.min(a, h);
      pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
    }
  }

  // ─── internal margin distribution ──────────────────────────────────────────
  /*
   * Measured over a deliberately wide mix of roster strengths. Using one
   * archetype would bake that archetype's margins into the map, so a strong
   * roster would always display blowouts and a weak one always nailbiters.
   */
  const SLOTS = E.SLOTS;
  const rng = E.createSeededRNG(20260725);
  const byPos = {};
  for (const p of players) (byPos[p.position] ??= []).push(p);

  const buildAt = (target) => SLOTS.map((slot) => {
    const allowed = E.SLOT_ELIGIBILITY[slot];
    const pool = players.filter((p) => allowed.includes(p.position));
    let best = pool[0], bestD = Infinity;
    // pick near a price target, with jitter so the mix is not degenerate
    const t = Math.max(3, target * (0.6 + 0.8 * rng()));
    for (const p of pool) {
      const d = Math.abs(p.price_musd - t);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  });

  /*
   * Only rosters a player could actually field.
   *
   * The mix used to be drawn from price targets of 3 to 33 a slot, which spans FPPG 5 to
   * 123 and puts 31% of its rosters OVER the $140M cap. That skews both maps: a genuinely
   * stacked legal roster at 87 FPPG lands mid-distribution, so it was being reported at 24
   * points a game when a real top offence scores about 30. The percentile map only means
   * something if the distribution it is built from is the one the game produces.
   */
  const capped = (target) => {
    for (let tries = 0; tries < 40; tries++) {
      const r = buildAt(target);
      if (r.reduce((a, p) => a + p.price_musd, 0) <= E.CONSTANTS.CAP_MUSD) return r;
      target *= 0.88;                       // too expensive, aim cheaper and try again
    }
    return buildAt(2);
  };

  const internalMargins = [];
  /*
   * And the internal score ITSELF, which the old calibration never recorded. Without it
   * the reported total knew only the margin, so your points could not react to how good
   * your offence was: measured across the whole cap-legal band, from a 48-FPPG roster to
   * an 87-FPPG one, reported points moved only 18.3 to 25.2, and in one-score games only
   * 20.9 to 23.1. Real NFL offences span about 16 to 30 a game. This table is what lets
   * a stacked roster actually put up 31 and a thin one scrape 13.
   */
  const internalOffence = [];
  const lc = leagueCtx.league_avg_pts_allowed_by_season;
  for (let i = 0; i < 60000; i++) {
    const target = 2 + rng() * 24;               // spans scrub to as good as the cap allows
    const roster = capped(target);
    const chem = 1 + rng() * 0.15;
    const opp = teamSeasons[Math.floor(rng() * teamSeasons.length)];
    const r = E.resolveGame(roster, chem, opp, lc[opp.season] ?? 21.5, rng);
    internalMargins.push(Math.abs(r.yourScore - r.oppScore));
    internalOffence.push(r.yourScore);
  }

  // ─── conditional totals ────────────────────────────────────────────────────
  /*
   * Totals are conditioned on the margin because the two are related in real
   * football: a 3-point game and a 35-point game do not have the same total. The
   * table is coarse-bucketed so every bucket has enough real games behind it.
   */
  const MARGIN_BUCKETS = [0, 3, 7, 10, 14, 17, 21, 28, 100];
  const totalsByBucket = MARGIN_BUCKETS.slice(0, -1).map((lo, i) => {
    const hi = MARGIN_BUCKETS[i + 1];
    const totals = [];
    for (const [m, list] of totalsByMarginBucket) {
      if (m >= lo && m < hi) totals.push(...list);
    }
    return quantileTable(totals);
  });

  /*
   * The real corpus, most common first so a runtime scan finds the likely scorelines
   * early. 849 pairs, about 11KB, which buys the guarantee that every score the game
   * ever puts on screen is one the NFL has actually produced.
   */
  const realPairs = [...pairCounts.entries()]
    .map(([k, n]) => { const [hi, lo] = k.split(':').map(Number); return [hi, lo, n]; })
    .sort((a, b) => b[2] - a[2]);

  const out = {
    note: 'Maps internal fantasy-space results onto real NFL scorelines. See build/04-display.mjs.',
    real_games: margins.length,
    internal_samples: internalMargins.length,
    internal_margin_q: quantileTable(internalMargins),
    real_margin_q: quantileTable(margins),
    internal_offence_q: quantileTable(internalOffence),
    real_team_pts_q: quantileTable(teamPoints),
    real_pairs: realPairs,
    margin_buckets: MARGIN_BUCKETS,
    totals_by_bucket_q: totalsByBucket,
    real_margin_mean: round(mean(margins), 2),
    real_margin_sd: round(stdev(margins), 2),
  };
  fs.writeFileSync(path.join(DATA_DIR, 'display_calibration.json'), JSON.stringify(out));

  console.log(`display_calibration.json written (${(fs.statSync(path.join(DATA_DIR, 'display_calibration.json')).size / 1024).toFixed(0)} KB)`);
  console.log(`  real NFL games: ${margins.length}, mean |margin| ${out.real_margin_mean} (sd ${out.real_margin_sd})`);
  console.log(`  internal margin samples: ${internalMargins.length}, mean ${mean(internalMargins).toFixed(1)}`);
  console.log(`  internal offence: mean ${mean(internalOffence).toFixed(1)}, ` +
    `p10 ${out.internal_offence_q[20]}, p50 ${out.internal_offence_q[100]}, ` +
    `p90 ${out.internal_offence_q[180]}`);
  console.log('\nreal NFL |margin| percentiles:');
  for (const q of [0.1, 0.25, 0.5, 0.75, 0.9, 0.99]) {
    console.log(`  p${String(q * 100).padStart(4)}: ${out.real_margin_q[Math.round(q * (QUANTILES - 1))]}`);
  }
  console.log(`  real score pairs: ${realPairs.length} distinct, most common ` +
    `${realPairs[0][0]}-${realPairs[0][1]} at ${(100 * realPairs[0][2] / margins.length).toFixed(2)}%`);
  console.log(`  real team points per game: mean ${mean(teamPoints).toFixed(1)}, ` +
    `p10 ${out.real_team_pts_q[20]}, p50 ${out.real_team_pts_q[100]}, p90 ${out.real_team_pts_q[180]}`);
  console.log('\nreal totals by margin bucket (median):');
  MARGIN_BUCKETS.slice(0, -1).forEach((lo, i) => {
    console.log(`  margin ${String(lo).padStart(2)}-${String(MARGIN_BUCKETS[i + 1] - 1).padStart(3)}: ` +
      `median total ${totalsByBucket[i][Math.round(0.5 * (QUANTILES - 1))]}`);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
