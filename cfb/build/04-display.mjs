/* Stage 4, display-score calibration.
 *
 *   node cfb/build/04-display.mjs        (run 01 and 02 first)
 *
 * Same approach as football/build/04-display.mjs: maps internal fantasy-point
 * margins onto real college football scorelines via paired quantile tables.
 *
 *   1. internal margin -> percentile (empirical CDF from simulated games)
 *   2. percentile -> real CFB margin (from 2005-2025 FBS games)
 *   3. draw a plausible total conditioned on the margin
 *   4. split into two scores, winner preserved
 *
 * The CFB engine is not yet built, so the simulation logic (seeded RNG, gamma
 * sampling, roster scoring) is inlined here.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  SEASONS, DATA_DIR,
  mean, stdev, round,
} from './lib.mjs';

const BUILD_DIR = path.dirname(new URL(import.meta.url).pathname);
const QUANTILES = 201;

const require_ = (f) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));

function quantileTable(values) {
  const s = [...values].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < QUANTILES; i++) {
    const q = i / (QUANTILES - 1);
    out.push(round(s[Math.min(s.length - 1, Math.round(q * (s.length - 1)))], 3));
  }
  return out;
}

// ─── inlined RNG + sampling (mirrors football/engine.js) ─────────────────────

function createSeededRNG(seed) {
  let s = seed >>> 0;
  return function () {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rng) {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

function gammaShape(k, rng) {
  if (k < 1) return gammaShape(1 + k, rng) * Math.pow(rng(), 1 / k);
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { x = normal(rng); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function sampleGamma(mu, sd, rng) {
  if (!(mu > 0)) return 0;
  if (!(sd > 0)) return mu;
  const shape = (mu / sd) ** 2;
  const scale = (sd * sd) / mu;
  return gammaShape(shape, rng) * scale;
}

// ─── CFB game constants ──────────────────────────────────────────────────────

/* These mirror cfb/engine.js. They are duplicated because this stage runs
   before the engine is loadable, so when a constant moves there it has to move
   here too or the scorelines drift away from the games that produce them.

   THAT IS EXACTLY WHAT HAPPENED, three times over, and it is worth naming
   because the warning above was already there and did not save anybody. The
   roster went to six slots with two flexes on 2026-08-03 and this still said
   five with a dedicated tight end. SCALE went to 2.3 with the season re-tune and
   this still said 2.0. And the engine has damped both sides of a scoreline since
   long before either, while the simulation below drew raw gamma and produced
   margins far wider than any game the engine can now play.

   A drifted table is invisible in a way a drifted constant is not: nothing
   throws, the scorelines just stop matching the games they are printed under.
   Re-run this stage after ANY move to the constants below. */
const CAP_MUSD = 11;
const SCALE = 2.3;
const DEFENCE_WEIGHT = 0.65;
/* The two that decide how wide the margin distribution is. Omitting them was the
   worst of the three drifts: undamped, a simulated margin is roughly twice the
   spread of a real one. */
const CONSISTENCY = 0.80;
const OPP_CONSISTENCY = 0.85;
const SLOTS = ['QB', 'RB', 'WR', 'WR', 'FLEX', 'FLEX'];
const SLOT_ELIGIBILITY = {
  QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], FLEX: ['RB', 'WR', 'TE'],
};

async function main() {
  const players = require_('cfb_player_seasons.json');
  const teamSeasons = require_('cfb_team_seasons.json');
  const leagueCtx = require_('cfb_league_context.json');

  // ─── real CFB game shapes ────────────────────────────────────────────────
  process.stderr.write('loading real CFB game margins...\n');
  const margins = [];
  const teamPoints = [];
  const pairCounts = new Map();
  const totalsByMarginBucket = new Map();

  for (const season of SEASONS) {
    const gamesFile = path.join(BUILD_DIR, '.cache', `games_${season}.json`);
    if (!fs.existsSync(gamesFile)) continue;
    const games = JSON.parse(fs.readFileSync(gamesFile, 'utf8'));
    for (const g of games) {
      if (g.homePoints == null || g.awayPoints == null) continue;
      const h = Number(g.homePoints), a = Number(g.awayPoints);
      if (isNaN(h) || isNaN(a)) continue;
      const m = Math.abs(h - a);
      margins.push(m);
      teamPoints.push(a, h);
      if (!totalsByMarginBucket.has(m)) totalsByMarginBucket.set(m, []);
      totalsByMarginBucket.get(m).push(a + h);
      if (m >= 1) {
        const key = Math.max(a, h) + ':' + Math.min(a, h);
        pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
      }
    }
  }
  process.stderr.write(`  ${margins.length} real games loaded\n`);

  // ─── internal margin distribution ──────────────────────────────────────────
  process.stderr.write('simulating internal margins...\n');
  const rng = createSeededRNG(20260730);

  const buildAt = (target) => SLOTS.map((slot) => {
    const allowed = SLOT_ELIGIBILITY[slot];
    const pool = players.filter((p) => allowed.includes(p.position));
    let best = pool[0], bestD = Infinity;
    const t = Math.max(0.3, target * (0.6 + 0.8 * rng()));
    for (const p of pool) {
      const d = Math.abs(p.price_musd - t);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  });

  const capped = (target) => {
    for (let tries = 0; tries < 40; tries++) {
      const r = buildAt(target);
      if (r.reduce((a, p) => a + p.price_musd, 0) <= CAP_MUSD) return r;
      target *= 0.88;
    }
    return buildAt(0.3);
  };

  const lc = leagueCtx.league_avg_pts_allowed_by_season;
  const internalMargins = [];
  const internalOffence = [];

  for (let i = 0; i < 60000; i++) {
    const target = 0.2 + rng() * 3.5;
    const roster = capped(target);
    const chem = 1 + rng() * 0.15;
    const opp = teamSeasons[Math.floor(rng() * teamSeasons.length)];

    let raw = 0;
    for (const p of roster) raw += sampleGamma(p.ppr_ppg_mean, p.ppr_ppg_sd, rng);
    /* Damped both sides, the way resolveGame does. Without this the table is
       built from games the engine cannot play. */
    const expected = roster.reduce((t, p) => t + p.ppr_ppg_mean, 0);
    raw = raw * (1 - CONSISTENCY) + expected * CONSISTENCY;
    const defMod = 1 + (opp.pts_allowed_mean / (lc[opp.season] ?? 25) - 1) * DEFENCE_WEIGHT;
    const yourScore = raw * chem * defMod;
    let oppRaw = sampleGamma(opp.pts_scored_mean, opp.pts_scored_sd, rng);
    oppRaw = oppRaw * (1 - OPP_CONSISTENCY) + opp.pts_scored_mean * OPP_CONSISTENCY;
    const oppScore = oppRaw * SCALE;

    internalMargins.push(Math.abs(yourScore - oppScore));
    internalOffence.push(yourScore);
  }
  process.stderr.write(`  ${internalMargins.length} simulated games\n`);

  // ─── conditional totals ────────────────────────────────────────────────────
  const MARGIN_BUCKETS = [0, 3, 7, 10, 14, 17, 21, 28, 35, 100];
  const totalsByBucket = MARGIN_BUCKETS.slice(0, -1).map((lo, i) => {
    const hi = MARGIN_BUCKETS[i + 1];
    const totals = [];
    for (const [m, list] of totalsByMarginBucket) {
      if (m >= lo && m < hi) totals.push(...list);
    }
    return quantileTable(totals);
  });

  const realPairs = [...pairCounts.entries()]
    .map(([k, n]) => { const [hi, lo] = k.split(':').map(Number); return [hi, lo, n]; })
    .sort((a, b) => b[2] - a[2]);

  const out = {
    note: 'Maps internal fantasy-space results onto real CFB scorelines. See build/04-display.mjs.',
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
  fs.writeFileSync(path.join(DATA_DIR, 'cfb_display_calibration.json'), JSON.stringify(out));

  const kb = (fs.statSync(path.join(DATA_DIR, 'cfb_display_calibration.json')).size / 1024).toFixed(0);
  console.log(`cfb_display_calibration.json written (${kb} KB)`);
  console.log(`  real CFB games: ${margins.length}, mean |margin| ${out.real_margin_mean} (sd ${out.real_margin_sd})`);
  console.log(`  internal margin samples: ${internalMargins.length}, mean ${mean(internalMargins).toFixed(1)}`);
  console.log(`  internal offence: mean ${mean(internalOffence).toFixed(1)}, ` +
    `p10 ${out.internal_offence_q[20]}, p50 ${out.internal_offence_q[100]}, ` +
    `p90 ${out.internal_offence_q[180]}`);
  console.log('\nreal CFB |margin| percentiles:');
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
