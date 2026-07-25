/* The Perfect Season — validation harness.
 *
 *   node football/simulator.js              full report
 *   node football/simulator.js --sweep      solve SCALE against the target
 *   node football/simulator.js --chem       chemistry reachability
 *   node football/simulator.js --schedule   schedule normalization check
 *
 *   PS_SCALE=2.4 PS_LIVES=0 PS_N=4000 node football/simulator.js   override dials
 *
 * Nothing reaches the frontend until this produces sane win rates (GDD §8).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const E = require('./engine.js');

const DATA = path.join(__dirname, 'data');
const load = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

const players = load('player_seasons.json');
const teamSeasons = load('team_seasons.json');
const leagueContext = load('league_context.json').league_avg_pts_allowed_by_season;
const ctx = {
  battery: load('battery.json'),
  coaches: load('coaches.json'),
  curated: load('curated.json'),
};

const data = E.prepareData(teamSeasons);
const SCALE = Number(process.env.PS_SCALE ?? E.CONSTANTS.SCALE);
const LIVES = Number(process.env.PS_LIVES ?? E.CONSTANTS.LIVES);
const constants = { ...E.CONSTANTS, SCALE, LIVES };

const FRANCHISES = [...new Set(teamSeasons.map((t) => t.franchise))].sort();
const byPos = {};
for (const p of players) (byPos[p.position] ??= []).push(p);
for (const list of Object.values(byPos)) list.sort((a, b) => a.price_musd - b.price_musd);

const fmtPct = (v) => `${(v * 100).toFixed(1)}%`;
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

// ─── roster archetypes ───────────────────────────────────────────────────────

/*
 * Archetypes are built to a budget, so every one of them is a legal roster under
 * the $100M cap. "Near-optimal" means near-optimal SUBJECT TO the cap, which the
 * GDD's §9 table left ambiguous — six 95th-percentile players would be ~$250M
 * and is not a reachable archetype at all.
 */
function buildToBudget(rng, targetSpendFraction) {
  const budget = constants.CAP_MUSD;
  const roster = [];
  const used = new Set();
  const slots = E.SLOTS;
  // Spread the target spend across slots, then take the best affordable player.
  let remaining = budget;
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const allowed = E.SLOT_ELIGIBILITY[slot];
    const slotsLeft = slots.length - i;
    const reserve = (slotsLeft - 1) * constants.MIN_RESERVE_PER_SLOT_MUSD;
    const spendCap = Math.min(
      remaining - reserve,
      (budget * targetSpendFraction) / slots.length * (1 + 0.9 * (rng() - 0.5) * 2),
    );
    const pool = players.filter((p) => allowed.includes(p.position)
      && p.price_musd <= Math.max(constants.MIN_RESERVE_PER_SLOT_MUSD, spendCap)
      && !used.has(`${p.player_id}|${p.season}`));
    if (!pool.length) {
      const fallback = players.filter((p) => allowed.includes(p.position)
        && p.price_musd <= remaining - reserve && !used.has(`${p.player_id}|${p.season}`));
      const c = fallback.sort((a, b) => b.ppr_ppg_mean - a.ppr_ppg_mean)[0];
      roster.push(c); used.add(`${c.player_id}|${c.season}`); remaining -= c.price_musd;
      continue;
    }
    // Best expected output at or under the slot's spend cap.
    const c = pool.sort((a, b) => b.ppr_ppg_mean - a.ppr_ppg_mean)[0];
    roster.push(c); used.add(`${c.player_id}|${c.season}`); remaining -= c.price_musd;
  }
  return roster;
}

/** Random legal picks — the floor archetype. */
function buildRandom(rng) {
  const roster = [];
  const used = new Set();
  let remaining = constants.CAP_MUSD;
  for (let i = 0; i < E.SLOTS.length; i++) {
    const allowed = E.SLOT_ELIGIBILITY[E.SLOTS[i]];
    const reserve = (E.SLOTS.length - i - 1) * constants.MIN_RESERVE_PER_SLOT_MUSD;
    const pool = players.filter((p) => allowed.includes(p.position)
      && p.price_musd <= remaining - reserve && !used.has(`${p.player_id}|${p.season}`));
    const c = pool[Math.floor(rng() * pool.length)];
    roster.push(c); used.add(`${c.player_id}|${c.season}`); remaining -= c.price_musd;
  }
  return roster;
}

/** A deliberate one-franchise stack, to test chemistry reachability. */
function buildStacked(rng) {
  const candidates = teamSeasons.filter((t) => t.eligible_qb > 0 && t.eligible_wr >= 2 && t.eligible_te > 0);
  for (let tries = 0; tries < 50; tries++) {
    const ts = candidates[Math.floor(rng() * candidates.length)];
    const from = players.filter((p) => p.team_season_id === ts.team_season_id);
    const roster = [];
    const used = new Set();
    let remaining = constants.CAP_MUSD;
    let ok = true;
    for (let i = 0; i < E.SLOTS.length; i++) {
      const allowed = E.SLOT_ELIGIBILITY[E.SLOTS[i]];
      const reserve = (E.SLOTS.length - i - 1) * constants.MIN_RESERVE_PER_SLOT_MUSD;
      const local = from.filter((p) => allowed.includes(p.position)
        && p.price_musd <= remaining - reserve && !used.has(`${p.player_id}|${p.season}`));
      const pool = local.length ? local : players.filter((p) => allowed.includes(p.position)
        && p.price_musd <= remaining - reserve && !used.has(`${p.player_id}|${p.season}`));
      if (!pool.length) { ok = false; break; }
      const c = pool.sort((a, b) => b.ppr_ppg_mean - a.ppr_ppg_mean)[0];
      roster.push(c); used.add(`${c.player_id}|${c.season}`); remaining -= c.price_musd;
    }
    if (ok) return roster;
  }
  return buildRandom(rng);
}

/*
 * Genuinely cap-optimal roster: maximize summed expected PPG subject to the
 * $100M cap and the slot shape. Solved with a DP over discretized budget rather
 * than a greedy pass, because greedy-by-points-per-dollar is measurably worse
 * and would understate the ceiling — which is the whole point of this archetype.
 *
 * "Near-optimal" in the GDD's §9 table has to mean near-optimal SUBJECT TO the
 * cap. Six 95th-percentile players would cost ~$250M and are not a reachable
 * roster, so treating that row as unconstrained would make it unsatisfiable by
 * construction.
 */
const BUCKET = 0.5;                                    // $0.5M granularity
const NBUCKETS = Math.round(constants.CAP_MUSD / BUCKET) + 1;

/** For a slot: best achievable ppg at each spend level, and who achieves it. */
function bestCurve(allowedPositions) {
  const pool = players.filter((p) => allowedPositions.includes(p.position));
  const best = new Array(NBUCKETS).fill(null);
  for (const p of pool) {
    const b = Math.ceil(p.price_musd / BUCKET);
    if (b >= NBUCKETS) continue;
    if (!best[b] || p.ppr_ppg_mean > best[b].ppr_ppg_mean) best[b] = p;
  }
  // Make it monotone: spending more can never buy less.
  for (let b = 1; b < NBUCKETS; b++) {
    if (!best[b] || (best[b - 1] && best[b - 1].ppr_ppg_mean > best[b].ppr_ppg_mean)) {
      best[b] = best[b - 1];
    }
  }
  return best;
}

const CURVES = E.SLOTS.map((s) => bestCurve(E.SLOT_ELIGIBILITY[s]));

/*
 * The archetype ladder is defined by HOW WELL THE PLAYER PLAYS, not by ad-hoc
 * per-slot spend caps. Each rung is the cap-optimal roster for a given budget,
 * so the ladder measures skill rather than the harness's own clumsiness:
 *
 *   random      — legal picks, no thought
 *   decent      — optimal play but only ~$75M of the cap used
 *   well-built  — cap-optimal expected points, chemistry ignored
 *   optimal+chem— cap-optimal, then chemistry bought where it is cheap
 *
 * An earlier version built "well-built" with a greedy per-slot spend cap and it
 * scored 70.6% against a reachable 84.7%. That gap was the builder being bad,
 * not the game being hard, and it would have mis-tuned SCALE by ~0.4.
 */
const OPTIMAL_CACHE = new Map();
function buildOptimal(budgetMusd = constants.CAP_MUSD) {
  const cacheKey = budgetMusd;
  if (OPTIMAL_CACHE.has(cacheKey)) return OPTIMAL_CACHE.get(cacheKey).slice();
  const NB = Math.round(budgetMusd / BUCKET) + 1;
  // dp[i][b] = best total ppg using slots i.. with b buckets of budget left
  let next = new Array(NB).fill(0);
  const choice = [];
  for (let i = E.SLOTS.length - 1; i >= 0; i--) {
    const cur = new Array(NB).fill(-Infinity);
    const pickAt = new Array(NB).fill(null);
    for (let b = 0; b < NB; b++) {
      for (let spend = 0; spend <= b; spend++) {
        const cand = CURVES[i][spend];
        if (!cand) continue;
        const val = cand.ppr_ppg_mean + next[b - spend];
        if (val > cur[b]) { cur[b] = val; pickAt[b] = { cand, spend }; }
      }
    }
    choice[i] = pickAt;
    next = cur;
  }
  const roster = [];
  const used = new Set();
  let b = NB - 1;
  for (let i = 0; i < E.SLOTS.length; i++) {
    let { cand, spend } = choice[i][b];
    // Duplicate guard: the DP ignores identity, and WR/WR/FLEX can collide.
    if (used.has(`${cand.player_id}|${cand.season}`)) {
      const alt = players
        .filter((p) => E.SLOT_ELIGIBILITY[E.SLOTS[i]].includes(p.position)
          && p.price_musd <= spend * BUCKET && !used.has(`${p.player_id}|${p.season}`))
        .sort((x, y) => y.ppr_ppg_mean - x.ppr_ppg_mean)[0];
      if (alt) cand = alt;
    }
    used.add(`${cand.player_id}|${cand.season}`);
    roster.push(cand);
    b -= spend;
  }
  OPTIMAL_CACHE.set(cacheKey, roster);
  return roster.slice();
}

/*
 * Optimal points, then chemistry bought as cheaply as possible: try swapping each
 * slot for a same-slot player from a teammate's team-season, keeping the swap
 * only if the chemistry gain outweighs the points lost. This is what a strong
 * player actually does, and it is the real ceiling the GDD's top row describes.
 */
let OPTIMAL_CHEM = null;
function buildOptimalWithChemistry(rng) {
  // Deterministic given the data, so solve once. Recomputing it per run made the
  // harness ~40x slower and made high-N perfect-season rates impractical to
  // measure — and those rates are the whole calibration target.
  if (OPTIMAL_CHEM) return OPTIMAL_CHEM.slice();
  let roster = buildOptimal();
  let bestScore = roster.reduce((s, p) => s + p.ppr_ppg_mean, 0)
    * E.resolveChemistry(roster, ctx).multiplier;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < roster.length; i++) {
      const spent = roster.reduce((s, p, j) => s + (j === i ? 0 : p.price_musd), 0);
      const room = constants.CAP_MUSD - spent;
      const allowed = E.SLOT_ELIGIBILITY[E.SLOTS[i]];
      const mates = new Set(roster.filter((_, j) => j !== i).map((p) => p.team_season_id));
      const cands = players.filter((p) => allowed.includes(p.position)
        && p.price_musd <= room
        && mates.has(p.team_season_id)
        && !roster.some((q, j) => j !== i && q.player_id === p.player_id && q.season === p.season));
      for (const c of cands) {
        const trial = roster.slice();
        trial[i] = c;
        const score = trial.reduce((s, p) => s + p.ppr_ppg_mean, 0)
          * E.resolveChemistry(trial, ctx).multiplier;
        if (score > bestScore) { bestScore = score; roster = trial; }
      }
    }
  }
  void rng;
  OPTIMAL_CHEM = roster;
  return roster.slice();
}

const ARCHETYPES = [
  { name: 'Random affordable',    build: buildRandom,               target: [0.62, 0.68] },
  { name: 'Decent ($75M used)',   build: () => buildOptimal(75),    target: [0.76, 0.80] },
  { name: 'Well-built (no chem)', build: () => buildOptimal(100),   target: [0.83, 0.86] },
  { name: 'Optimal + chemistry',  build: buildOptimalWithChemistry, target: [0.88, 0.90] },
  { name: 'One-franchise stack',  build: buildStacked,              target: null },
];

// ─── runs ────────────────────────────────────────────────────────────────────

function simulate(archetype, n, seed0) {
  let gamesPlayed = 0, gamesWon = 0, perfect = 0, benchmark = 0, complete = 0;
  const weeks = [];
  const chems = [];
  const spends = [];
  for (let i = 0; i < n; i++) {
    const rng = E.createSeededRNG(seed0 + i * 7919);
    const roster = archetype.build(rng);
    const chem = E.resolveChemistry(roster, ctx);
    const franchise = FRANCHISES[Math.floor(rng() * FRANCHISES.length)];
    const sched = E.generateSchedule(franchise, data, rng);
    const playoffs = E.generatePlayoffs(data, rng, constants.PLAYOFF_GAMES);
    const run = E.playRun(roster, chem.multiplier, sched.games, playoffs, leagueContext, rng, constants);
    gamesPlayed += run.results.length;
    gamesWon += run.wins;
    weeks.push(run.weekReached);
    chems.push(chem.multiplier);
    spends.push(roster.reduce((s, p) => s + p.price_musd, 0));
    if (run.perfect) perfect++;
    if (run.beatBenchmark) benchmark++;
    if (run.complete) complete++;
  }
  return {
    perGameWin: gamesWon / gamesPlayed,
    perfectRate: perfect / n,
    benchmarkRate: benchmark / n,
    completeRate: complete / n,
    medianWeek: median(weeks),
    meanChem: mean(chems),
    meanSpend: mean(spends),
  };
}

// ─── modes ───────────────────────────────────────────────────────────────────

function reportMain(n) {
  console.log(`SCALE=${SCALE}  LIVES=${constants.LIVES}  ` +
    `${constants.REGULAR_SEASON_GAMES}+${constants.PLAYOFF_GAMES} games  N=${n} runs/archetype\n`);
  console.log('archetype              spend   chem    win%   target      20-0    <=1 loss  medWk');
  let allPass = true;
  for (const a of ARCHETYPES) {
    const r = simulate(a, n, 1234);
    const pass = !a.target || (r.perGameWin >= a.target[0] - 0.02 && r.perGameWin <= a.target[1] + 0.02);
    if (!pass) allPass = false;
    console.log(
      `${a.name.padEnd(22)} $${r.meanSpend.toFixed(0).padStart(3)}M  ` +
      `${r.meanChem.toFixed(3)}  ${fmtPct(r.perGameWin).padStart(6)}  ` +
      (a.target ? `${a.target[0]}-${a.target[1]}  ${pass ? '✓' : '✗'}  ` : `   reference  `) +
      `${fmtPct(r.perfectRate).padStart(6)}  ${fmtPct(r.benchmarkRate).padStart(7)}   ${String(r.medianWeek).padStart(2)}`,
    );
  }
  console.log(`\nwin-rate targets: ${allPass ? 'all within tolerance' : 'MISS — sweep SCALE'}`);
  console.log('\nNote: median week is a direct consequence of the per-game rate, not an');
  console.log('independent dial. Under sudden death it is ln(0.5)/ln(p); LIVES=1 roughly');
  console.log('doubles it. The GDD asked for 3-6% perfect AND a week 7-9 median, which are');
  console.log('mutually exclusive at LIVES=0.');
}

function sweep(n) {
  console.log(`sweeping SCALE, N=${n} runs/archetype/value\n`);
  const head = ARCHETYPES.map((a) => a.name.split(',')[0].slice(0, 9).padStart(9)).join(' ');
  console.log(`SCALE   ${head}    20-0(well-built)`);
  const values = (process.env.PS_SWEEP ?? '1.5,1.6,1.7,1.8,1.9,2.0,2.2')
    .split(',').map(Number);
  for (const s of values) {
    const saved = constants.SCALE;
    constants.SCALE = s;
    const cells = ARCHETYPES.map((a) => fmtPct(simulate(a, n, 555).perGameWin).padStart(9)).join(' ');
    const wb = simulate(ARCHETYPES[2], n, 555);
    constants.SCALE = saved;
    console.log(`${s.toFixed(2)}   ${cells}    ${fmtPct(wb.perfectRate)}`);
  }
}

function chemReport() {
  console.log('chemistry reachability — how many same-team-season players to hit the cap\n');
  const cap = E.CHEMISTRY.MAX;
  console.log(`ceiling ${(cap * 100).toFixed(0)}%, smooth saturation: MAX*(1-exp(-raw/MAX))\n`);
  const V = E.CHEMISTRY.VALUES;
  const sat = (raw) => cap * (1 - Math.exp(-raw / cap));
  console.log('  players  pairs   raw    GDD rule    saturating   marginal gain');
  let prev = 0;
  for (let nP = 2; nP <= 6; nP++) {
    const pairs = (nP * (nP - 1)) / 2;
    const vals = [V.battery, ...Array(pairs - 1).fill(V.teammates)];
    const raw = vals.reduce((s, v) => s + v, 0);
    // What the GDD's own rule would have produced, for comparison.
    let gdd = 0;
    vals.sort((a, b) => b - a).forEach((v, i) => { gdd += i < 3 ? v : v * 0.5; });
    gdd = Math.min(cap, gdd);
    const now = sat(raw);
    console.log(`     ${nP}      ${String(pairs).padStart(2)}   ${(raw * 100).toFixed(1).padStart(5)}%  ` +
      `${(gdd * 100).toFixed(1).padStart(6)}%${gdd >= cap ? ' CAP' : '    '}   ` +
      `${(now * 100).toFixed(1).padStart(6)}%      ${nP === 2 ? '   —' : '+' + ((now - prev) * 100).toFixed(2) + '%'}`);
    prev = now;
  }
  console.log('\nThe GDD rule hits the ceiling at THREE players, so slots 4-6 carried no');
  console.log('chemistry incentive and its half-value rule never fired. Saturation keeps');
  console.log('every extra signing worth something, each less than the last.');
  console.log(`A lone 2% college link still scores ${(sat(0.02) * 100).toFixed(1)}% — small rosters are not punished.`);

  const rng = E.createSeededRNG(99);
  const stack = buildStacked(rng);
  const res = E.resolveChemistry(stack, ctx);
  console.log(`\nsample stacked roster (${stack[0].team_display}) -> x${res.multiplier.toFixed(3)}`);
  for (const l of res.links.slice(0, 6)) {
    console.log(`   ${l.value > 0 ? '+' : ''}${(l.value * 100).toFixed(0)}%  ${l.type.padEnd(12)} ${l.label}`);
  }
}

function scheduleReport(n) {
  console.log(`schedule normalization — ${n} schedules per franchise\n`);
  const rows = [];
  for (const f of FRANCHISES) {
    const totals = [], elites = [], attempts = [];
    let relaxed = 0;
    for (let i = 0; i < n; i++) {
      const rng = E.createSeededRNG(E.hashSeed(f) + i * 104729);
      const s = E.generateSchedule(f, data, rng);
      totals.push(s.total); elites.push(s.elite); attempts.push(s.attempts);
      if (s.relaxed) relaxed++;
    }
    rows.push({ f, mu: mean(totals), elite: mean(elites), att: mean(attempts), relaxed });
  }
  rows.sort((a, b) => a.mu - b.mu);
  console.log('franchise  mean opp strength   mean elite opps   mean attempts  relaxed');
  for (const r of rows.slice(0, 4).concat(rows.slice(-4))) {
    console.log(`  ${r.f.padEnd(5)}    ${r.mu.toFixed(2).padStart(6)}             ` +
      `${r.elite.toFixed(2)}              ${r.att.toFixed(1).padStart(5)}       ${r.relaxed}`);
  }
  const spread = rows.at(-1).mu - rows[0].mu;
  console.log(`\nspread between easiest and hardest franchise: ${spread.toFixed(2)} z-units` +
    ` over 17 games (${(spread / 17).toFixed(3)} per game)`);
  console.log(spread < 1.0
    ? 'Franchise choice is not a meaningful difficulty lever. ✓'
    : 'TOO WIDE — franchise choice would be a difficulty setting. ✗');
}

// ─── main ────────────────────────────────────────────────────────────────────

const arg = process.argv[2];
const N = Number(process.env.PS_N ?? 2000);
if (arg === '--sweep') sweep(Math.max(400, Math.floor(N / 2)));
else if (arg === '--chem') chemReport();
else if (arg === '--schedule') scheduleReport(200);
else reportMain(N);
