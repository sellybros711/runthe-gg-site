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
 * THE INTERNAL HALF IS PLAYED BY THE REAL ENGINE. This file used to inline its own
 * copy of the simulation, because it was written before cfb/engine.js existed. That
 * copy drifted three separate times: it kept five slots after the roster went to six,
 * it held SCALE at 2.0 after the season was re-tuned, and it never modelled the scheme
 * bonus or the schedule's strength advantage at all. Every drift silently biased step
 * 1, which biases every scoreline the game prints, and none of it failed loudly.
 *
 * So step 1 now drafts through run.js and plays through engine.js. The internal
 * quantiles are the engine's own output by construction, and this file cannot
 * disagree with the thing it is calibrating.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  SEASONS, DATA_DIR,
  mean, stdev, round,
} from './lib.mjs';

const require = createRequire(import.meta.url);
const E = require('../engine.js');
const R = require('../run.js');

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

/* THE INLINED SIMULATION AND ITS CONSTANTS ARE GONE. There used to be a seeded
   RNG, a gamma sampler and a copy of SCALE, DEFENCE_WEIGHT, CONSISTENCY,
   OPP_CONSISTENCY, OPP_SPREAD and the slot list sitting here, with a comment
   warning that they had to be kept in step with cfb/engine.js by hand.

   The warning was already there and did not save anybody: the copy drifted three
   times anyway, and the third drift was found only because a player noticed teams
   scoring one point. A duplicated constant with a note asking people to remember
   is not a safeguard, it is a bug with documentation. main() now drafts through
   run.js and plays through engine.js, so there is nothing left here to keep in
   step and no way for this file to describe a game the engine does not play. */

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

  // ─── internal margin distribution, PLAYED BY THE ENGINE ────────────────────
  /* Real drafts through the real wheel, real seasons through resolveGame. Every
     term the engine applies is therefore in here without this file naming any of
     them: the scheme bonus, the defence modifier, both damping constants, the
     opponent compression, the schedule's strength advantage and the playoff ladder.
     The old inlined model named four of those and got the rest wrong. */
  process.stderr.write('simulating internal margins through the engine...\n');
  const data = R.indexData(players, teamSeasons);
  const lc = leagueCtx.league_avg_pts_allowed_by_season ?? leagueCtx;

  /* WHOSE GAMES SHOULD LOOK LIKE REAL COLLEGE FOOTBALL? A quantile map is only
     exact for the population it was built from, so this is a choice and not a
     detail. The reference is a player who is TRYING: taking the best man on the
     board most of the time. Their season then reads like a real one, a careless
     roster scores below it because it is worse than a real team, and a superb
     roster scores above it because it is better than one. Calibrating on the
     average of all policies instead makes the ordinary case wrong in order to
     make nobody's case right.
     The weak policies are still in the mix, thinly, and only for COVERAGE: the
     percentile lookup clamps at the ends of the table, so an internal margin below
     anything in it maps to the smallest real margin there is. Without a tail of
     bad rosters every poor team would be handed the same scoreline. */
  /* Weights are overridable for a sweep (CAL_MIX=cheap,value,random,greedy,best),
     because which mix fits is an empirical question and the verification table at
     the end of this file is how it gets answered. */
  const MIX = (process.env.CAL_MIX || '1,1,2,12,0').split(',').map(Number);
  const POLICIES = [
    ['cheap',  MIX[0], (o) => o.reduce((b, p) => (p.price_musd < b.price_musd ? p : b))],
    ['value',  MIX[1], (o) => o.reduce((b, p) => (p.ppr_ppg_mean / Math.max(0.3, p.price_musd)
                    > b.ppr_ppg_mean / Math.max(0.3, b.price_musd) ? p : b))],
    ['random', MIX[2], (o, rnd) => o[Math.floor(rnd() * o.length)]],
    ['greedy', MIX[3], (o) => o.reduce((b, p) => (p.ppr_ppg_mean > b.ppr_ppg_mean ? p : b))],
    ['best',   MIX[4], (o) => o.reduce((b, p) => (p.ppr_ppg_mean > b.ppr_ppg_mean ? p : b))],
  ];
  const WEIGHTED = POLICIES.flatMap(([n, w, f]) => Array(w).fill([n, f]));

  function draftWith(pick, seed) {
    const run = R.createRun({ seed });
    const rnd = E.createSeededRNG(seed ^ 0x9e37);
    for (let i = 0; i < 12 && run.roster.length < E.SLOTS.length; i++) {
      let draw;
      try { draw = R.spin(run, data); } catch (e) { return null; }
      const list = data.playersByTeamSeason[draw.team_season_id] || [];
      const opts = draw.options
        .map((k) => { const [id, sn] = k.split('|');
          return list.find((p) => String(p.player_id) === id && String(p.season) === sn); })
        .filter(Boolean).filter((p) => R.slotForPlayer(run, p) !== null);
      /* The reserve floor is what the game enforces, so a policy that ignores it
         would strand itself and never reach a full roster. */
      const budget = R.remaining(run) - R.reserveFloor(run);
      const legal = opts.filter((p) => p.price_musd <= budget);
      const pool = legal.length ? legal : opts;
      if (!pool.length) return null;
      R.sign(run, pick(pool, rnd));
    }
    if (run.roster.length !== E.SLOTS.length) return null;
    R.startSeason(run, data, { league: leagueCtx });
    return run;
  }

  const internalMargins = [];
  const internalOffence = [];
  const DRAFTS = 500, SEASONS_EACH = 26;
  let drafted = 0;
  for (let d = 0; d < DRAFTS; d++) {
    const [name, pick] = WEIGHTED[d % WEIGHTED.length];
    void name;
    const seed = 4100000 + d * 7919;
    let run = draftWith(pick, seed);
    /* The solver's roster, for the 'best' slots, so the top of the internal range
       is the top the wheel can actually reach rather than a guess at it. */
    if (run && POLICIES[4][0] === WEIGHTED[d % WEIGHTED.length][0]) {
      try {
        const best = R.bestPossibleSquad(run, data, { league: leagueCtx });
        if (best && best.squad) { run.roster = best.squad; run.season.chemistry = best.chemistry; }
      } catch (e) { /* keep the drafted roster */ }
    }
    if (!run) continue;
    drafted++;
    const schedule = run.schedule.map((id) => data.byTeamSeasonId[id]);
    const playoffs = run.playoffs.map((id) => data.byTeamSeasonId[id]);
    for (let k = 0; k < SEASONS_EACH; k++) {
      const rng2 = E.createSeededRNG(E.hashSeed('cal|' + run.seed + '|' + k));
      const out = E.playRun(run.roster, run.season.chemistry, schedule, playoffs,
        lc, rng2, data.prepared);
      for (const r of out.results) {
        internalMargins.push(Math.abs(r.yourScore - r.oppScore));
        internalOffence.push(r.yourScore);
      }
    }
  }
  process.stderr.write(`  ${internalMargins.length} simulated games from ${drafted} drafts\n`);

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

  /* ─── DOES IT ACTUALLY FIT? ────────────────────────────────────────────────
     The table is written above and then immediately used, here, to translate a
     fresh set of engine games into scorelines that are compared band by band
     against the 16,820 real ones. Everything this stage can get wrong shows up in
     this table and nowhere else: a drifted constant, a reference population that
     does not match how people play, a percentile lookup clamping at its ends.

     It is printed rather than asserted because "close enough" is a judgement, and
     a build that refuses to write a file because a band is 2% out would be worse
     than one that tells you. test_scorelines.mjs is where the hard limits live:
     no impossible scores, ever, and the mean within a couple of points. */
  const verifyPolicy = POLICIES[3][2];   // greedy, the reference above
  const engPts = new Map(); let engPtsN = 0;
  const engMar = new Map(); let engMarN = 0;
  let impossible = 0, checked = 0;
  for (let d = 0; d < 60; d++) {
    const run = draftWith(verifyPolicy, 9100000 + d * 7919);
    if (!run) continue;
    const schedule = run.schedule.map((id) => data.byTeamSeasonId[id]);
    const playoffs = run.playoffs.map((id) => data.byTeamSeasonId[id]);
    for (let k = 0; k < 20; k++) {
      const rng3 = E.createSeededRNG(E.hashSeed('ver|' + run.seed + '|' + k));
      const res = E.playRun(run.roster, run.season.chemistry, schedule, playoffs,
        lc, rng3, data.prepared);
      for (const r of res.results) {
        const sh = E.toFootballScore(r.yourScore, r.oppScore, r.won,
          E.createSeededRNG(E.hashSeed('vs|' + run.seed + '|' + k + '|' + checked)), out);
        checked++;
        if (sh.you === 1 || sh.them === 1 || sh.you === 4 || sh.them === 4) impossible++;
        for (const v of [sh.you, sh.them]) { engPts.set(v, (engPts.get(v) || 0) + 1); engPtsN++; }
        const m2 = Math.abs(sh.you - sh.them);
        engMar.set(m2, (engMar.get(m2) || 0) + 1); engMarN++;
      }
    }
  }
  const realPtsM = new Map(); let realPtsN = 0;
  for (const v of teamPoints) { realPtsM.set(v, (realPtsM.get(v) || 0) + 1); realPtsN++; }
  const realMarM = new Map(); let realMarN = 0;
  for (const v of margins) { realMarM.set(v, (realMarM.get(v) || 0) + 1); realMarN++; }
  const band = (m, t, lo, hi) => { let n = 0;
    for (const [v, c] of m) if (v >= lo && v < hi) n += c; return (n * 100) / t; };
  const avg = (m, t) => { let n = 0; for (const [v, c] of m) n += v * c; return n / t; };
  const table = (title, em, en, rm, rn, bands) => {
    console.log('\n' + title + ', a trying player against real college football:');
    console.log('  band        engine     real     diff');
    for (const [lo, hi] of bands) {
      const e = band(em, en, lo, hi), r = band(rm, rn, lo, hi);
      console.log('  ' + (hi === 999 ? lo + '+' : lo + '-' + (hi - 1)).padEnd(10)
        + (e.toFixed(2) + '%').padStart(8) + (r.toFixed(2) + '%').padStart(9)
        + ((e - r >= 0 ? '+' : '') + (e - r).toFixed(2)).padStart(9));
    }
    console.log('  mean        ' + avg(em, en).toFixed(1).padStart(6)
      + avg(rm, rn).toFixed(1).padStart(9));
  };
  console.log(`\nverification: ${checked} games translated`);
  console.log(`  scorelines no real game can produce (a 1 or a 4): ${impossible}`);
  table('team score', engPts, engPtsN, realPtsM, realPtsN,
    [[0,7],[7,14],[14,21],[21,28],[28,35],[35,42],[42,49],[49,56],[56,999]]);
  table('margin', engMar, engMarN, realMarM, realMarN,
    [[0,4],[4,8],[8,15],[15,22],[22,29],[29,999]]);

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
