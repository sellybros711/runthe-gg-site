/* The Perfect Season, validation harness.
 *
 *   node football/simulator.js              full report
 *   node football/simulator.js --sweep      solve SCALE against the target
 *   node football/simulator.js --chem       chemistry reachability
 *   node football/simulator.js --schedule   schedule normalization check
 *   node football/simulator.js --draft      draft-loop invariants (cap, dead ends)
 *   node football/simulator.js --policies   REAL play policies through the wheel
 *
 *   PS_SCALE=2.1 PS_N=4000 node football/simulator.js     override the dial
 *
 * Nothing reaches the frontend until this produces sane win rates (GDD §8).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const E = require('./engine.js');
const R = require('./run.js');

const DATA = path.join(__dirname, 'data');
const load = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

const players = load('player_seasons.json');
const teamSeasons = load('team_seasons.json');
const leagueContext = load('league_context.json').league_avg_pts_allowed_by_season;
const ctx = {
  battery: load('battery.json'),
  coaches: load('coaches.json'),
  curated: load('curated.json'),
  /* coachTable derives every coach's tilt from what his own teams scored and allowed. */
  teamSeasons: load('team_seasons.json'),
  /* Full Team's coach chemistry reads this. Built by football/build/coach-links.mjs and
     tiny, but loaded defensively: the harness has to keep running on a checkout where the
     file has not been generated yet, and an absent college link is a link the game does not
     claim rather than one it gets wrong. */
  coachColleges: (() => {
    try { return load('coach_colleges.json'); } catch (_) { return {}; }
  })(),
};

const data = E.prepareData(teamSeasons);
const SCALE = Number(process.env.PS_SCALE ?? E.CONSTANTS.SCALE);
const constants = { ...E.CONSTANTS, SCALE };

const byPos = {};
for (const p of players) (byPos[p.position] ??= []).push(p);
for (const list of Object.values(byPos)) list.sort((a, b) => a.price_musd - b.price_musd);

const fmtPct = (v) => `${(v * 100).toFixed(1)}%`;
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

// ─── roster archetypes ───────────────────────────────────────────────────────

/*
 * Archetypes are built to a budget, so every one of them is a legal roster under
 * the cap. "Near-optimal" means near-optimal SUBJECT TO the cap, which the
 * GDD's §9 table left ambiguous, six 95th-percentile players would be ~$250M
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
    const pool = players.filter((p) => E.fillsSlot(slot, p)
      && p.price_musd <= Math.max(constants.MIN_RESERVE_PER_SLOT_MUSD, spendCap)
      && !used.has(`${p.player_id}|${p.season}`));
    if (!pool.length) {
      const fallback = players.filter((p) => E.fillsSlot(slot, p)
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

/** Random legal picks, the floor archetype. */
function buildRandom(rng) {
  const roster = [];
  const used = new Set();
  let remaining = constants.CAP_MUSD;
  for (let i = 0; i < E.SLOTS.length; i++) {
    const reserve = (E.SLOTS.length - i - 1) * constants.MIN_RESERVE_PER_SLOT_MUSD;
    const pool = players.filter((p) => E.fillsSlot(E.SLOTS[i], p)
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
      const reserve = (E.SLOTS.length - i - 1) * constants.MIN_RESERVE_PER_SLOT_MUSD;
      const local = from.filter((p) => E.fillsSlot(E.SLOTS[i], p)
        && p.price_musd <= remaining - reserve && !used.has(`${p.player_id}|${p.season}`));
      const pool = local.length ? local : players.filter((p) => E.fillsSlot(E.SLOTS[i], p)
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
 * cap and the slot shape. Solved with a DP over discretized budget rather
 * than a greedy pass, because greedy-by-points-per-dollar is measurably worse
 * and would understate the ceiling, which is the whole point of this archetype.
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
 *   random     , legal picks, no thought
 *   decent     , optimal play but only ~$75M of the cap used
 *   well-built , cap-optimal expected points, chemistry ignored
 *   optimal+chemcap-optimal, then chemistry bought where it is cheap
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
        .filter((p) => E.fillsSlot(E.SLOTS[i], p)
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
  // measure, and those rates are the whole calibration target.
  if (OPTIMAL_CHEM) return OPTIMAL_CHEM.slice();
  let roster = buildOptimal();
  let bestScore = roster.reduce((s, p) => s + p.ppr_ppg_mean, 0)
    * E.resolveChemistry(roster, ctx).multiplier;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < roster.length; i++) {
      const spent = roster.reduce((s, p, j) => s + (j === i ? 0 : p.price_musd), 0);
      const room = constants.CAP_MUSD - spent;
      const mates = new Set(roster.filter((_, j) => j !== i).map((p) => p.team_season_id));
      const cands = players.filter((p) => E.fillsSlot(E.SLOTS[i], p)
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

/*
 * THE ARCHETYPE LADDER, AND WHICH RUNG IS ACTUALLY A CHECK.
 *
 * `anchor` marks the one band SCALE is solved against: a cap-optimal roster with chemistry
 * should win 88 to 90% of its regular-season games. That is the number --sweep tunes, and
 * missing it is a genuine reason to re-sweep.
 *
 * The other bands are DESCRIPTIVE. They record what each way of building a team currently
 * does, so a change that reorders the ladder or collapses a rung shows up. They are not
 * solved constraints, and treating them as if they were is how this report spent a long time
 * telling everyone to sweep SCALE when SCALE was fine: the first three carried bands from an
 * older model (0.62-0.68 for a RANDOM roster, when a random roster wins 29% of its games)
 * and printed MISS every single run. A permanent MISS teaches people to ignore the line.
 *
 * Re-measure and update deliberately when a change is intended. Do not widen a band to make
 * a red line go green without knowing why it moved.
 */
const ARCHETYPES = [
  { name: 'Random affordable',    build: buildRandom,               target: [0.25, 0.33] },
  { name: 'Decent ($75M used)',   build: () => buildOptimal(75),    target: [0.42, 0.51] },
  { name: 'Well-built (no chem)', build: () => buildOptimal(100),   target: [0.55, 0.63] },
  { name: 'Optimal + chemistry',  build: buildOptimalWithChemistry, target: [0.88, 0.90],
    anchor: true },
  { name: 'One-franchise stack',  build: buildStacked,              target: null },
];

// ─── runs ────────────────────────────────────────────────────────────────────

function simulate(archetype, n, seed0) {
  let regGames = 0, regWon = 0, poGames = 0, poWon = 0;
  let perfect = 0, title = 0, madePlayoffs = 0, gotBye = 0, undefeatedReg = 0;
  const regWins = [], chems = [], spends = [];
  const winHist = new Array(18).fill(0);
  for (let i = 0; i < n; i++) {
    const rng = E.createSeededRNG(seed0 + i * 7919);
    const roster = archetype.build(rng);
    const chem = E.resolveChemistry(roster, ctx);
    const sched = E.generateSchedule(data, rng);
    const playoffs = E.generatePlayoffs(data, rng);
    const run = E.playRun(roster, chem.multiplier, sched.games, playoffs, leagueContext, rng, constants);
    for (const g of run.results) {
      if (g.playoff) { poGames++; if (g.won) poWon++; }
      else { regGames++; if (g.won) regWon++; }
    }
    regWins.push(run.regularWins);
    winHist[run.regularWins]++;
    chems.push(chem.multiplier);
    spends.push(roster.reduce((s, p) => s + p.price_musd, 0));
    if (run.perfect) perfect++;
    if (run.titleWon) title++;
    if (run.seed.made) madePlayoffs++;
    if (run.seed.bye) gotBye++;
    if (run.undefeatedRegular) undefeatedReg++;
  }
  return {
    perGameWin: regWon / regGames,
    playoffGameWin: poGames ? poWon / poGames : 0,
    winHist,
    perfectRate: perfect / n,
    titleRate: title / n,
    playoffRate: madePlayoffs / n,
    byeRate: gotBye / n,
    undefeatedRegRate: undefeatedReg / n,
    meanRegWins: mean(regWins),
    medianRegWins: median(regWins),
    meanChem: mean(chems),
    meanSpend: mean(spends),
  };
}

// ─── modes ───────────────────────────────────────────────────────────────────

function reportMain(n) {
  console.log(`SCALE=${SCALE}  ${constants.REGULAR_SEASON_GAMES} games + playoffs  ` +
    `N=${n} runs/archetype\n`);
  console.log('archetype              spend   chem    win%   target     record  playoffs  bye   title   20-0');
  let allPass = true, anchorPass = true;
  for (const a of ARCHETYPES) {
    const r = simulate(a, n, 1234);
    const pass = !a.target || (r.perGameWin >= a.target[0] - 0.02 && r.perGameWin <= a.target[1] + 0.02);
    if (!pass) { allPass = false; if (a.anchor) anchorPass = false; }
    console.log(
      `${a.name.padEnd(22)} $${r.meanSpend.toFixed(0).padStart(3)}M  ` +
      `${r.meanChem.toFixed(3)}  ${fmtPct(r.perGameWin).padStart(6)}  ` +
      (a.target ? `${a.target[0]}-${a.target[1]} ${pass ? 'ok' : 'MISS'}  ` : `  reference  `) +
      `${(r.meanRegWins.toFixed(1) + '-' + (17 - r.meanRegWins).toFixed(1)).padStart(9)}  ` +
      `${fmtPct(r.playoffRate).padStart(6)}  ${fmtPct(r.byeRate).padStart(5)} ` +
      `${fmtPct(r.titleRate).padStart(6)}  ${fmtPct(r.perfectRate).padStart(6)}`,
    );
  }
  console.log('\nwin-rate targets: ' + (allPass ? 'all within tolerance'
    : anchorPass ? 'the SCALE anchor holds; a descriptive band moved, re-measure it'
      : 'THE SCALE ANCHOR MISSED, sweep SCALE'));
  console.log('\nEvery run now plays all 17 games, so a record always exists. Playoffs need');
  console.log(`${E.CONSTANTS.PLAYOFF_WINS} wins, the first-round bye needs ${E.CONSTANTS.BYE_SEED_WINS}. One playoff loss ends the run,`);
  console.log('so 20-0 means 17-0 plus three wins from the top seed.');
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
  console.log('chemistry reachability, how many same-team-season players to hit the cap\n');
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
      `${(now * 100).toFixed(1).padStart(6)}%      ${nP === 2 ? '' : '+' + ((now - prev) * 100).toFixed(2) + '%'}`);
    prev = now;
  }
  console.log('\nThe GDD rule hits the ceiling at THREE players, so slots 4-6 carried no');
  console.log('chemistry incentive and its half-value rule never fired. Saturation keeps');
  console.log('every extra signing worth something, each less than the last.');
  console.log(`A lone 2% college link still scores ${(sat(0.02) * 100).toFixed(1)}%, small rosters are not punished.`);

  const rng = E.createSeededRNG(99);
  const stack = buildStacked(rng);
  const res = E.resolveChemistry(stack, ctx);
  const stackTs = teamSeasons.find((t) => t.team_season_id === stack[0].team_season_id);
  console.log(`\nsample stacked roster (${stackTs ? stackTs.display : stack[0].team_season_id}) -> x${res.multiplier.toFixed(3)}`);
  for (const l of res.links.slice(0, 6)) {
    console.log(`   ${l.value > 0 ? '+' : ''}${(l.value * 100).toFixed(0)}%  ${l.type.padEnd(12)} ${l.label}`);
  }
}

function scheduleReport(n) {
  /* This used to report per franchise, because a schedule was built from your division. There
     are no divisions any more: every schedule is 17 unique historic team-seasons drawn from the
     whole pool. What still matters, and is the only reason the normalizer exists, is that the
     draws land near the league mean so one player is not handed four all-time greats while
     another gets a soft seventeen. */
  console.log(`schedule normalization, ${n} schedules\n`);
  const totals = [], elites = [], attempts = [];
  let relaxed = 0, repeats = 0;
  for (let i = 0; i < n; i++) {
    const rng = E.createSeededRNG(20260101 + i * 104729);
    const sc = E.generateSchedule(data, rng);
    totals.push(sc.total); elites.push(sc.elite); attempts.push(sc.attempts);
    if (sc.relaxed) relaxed++;
    if (new Set(sc.games.map((g) => g.franchise)).size !== sc.games.length) repeats++;
  }
  const mu = mean(totals);
  const sd = Math.sqrt(mean(totals.map((t) => (t - mu) ** 2)));
  console.log(`  mean opponent strength   ${mu.toFixed(2)}  (league mean ${data.meanScheduleStrength.toFixed(2)})`);
  console.log(`  spread, sd               ${sd.toFixed(2)}`);
  console.log(`  mean elite opponents     ${mean(elites).toFixed(2)}  of a cap of 4`);
  console.log(`  mean attempts to accept  ${mean(attempts).toFixed(1)}`);
  console.log(`  fell back to best effort ${relaxed} of ${n}`);
  console.log(`  schedules with a franchise twice  ${repeats} ${repeats === 0 ? 'ok' : 'FAIL'}`);
}

/*
 * Draft-loop invariants. The re-spin fee comes out of the cap, so the failure
 * mode to rule out is a run that cannot legally finish: fees plus signings
 * leaving less than $3M per unfilled slot. Plays full drafts with an aggressive
 * re-spin policy (always re-spin when allowed) and asserts on every run.
 */
function draftReport(n) {
  const data = R.indexData(players, teamSeasons);
  let respinsTotal = 0, freeRerolls = 0, capViolations = 0, deadEnds = 0, perfectDrafts = 0, repeatedTs = 0;
  let doubledUp = 0, boardsOfferingADuplicate = 0, spinsSeen = 0;
  let respinFeesCharged = 0, sameResult = 0, wrongWheel = 0;
  const spends = [];
  const blockedReasons = {};
  for (let i = 0; i < n; i++) {
    const run = R.createRun({ seed: 4242 + i * 7919 });
    try {
      while (run.phase === R.PHASES.DRAFT) {
        R.spin(run, data);
        // Alternate the two wheels so both re-spin paths get exercised, and check
        // the wheel actually changed what it was supposed to change.
        const kind = (run.roster.length + i) % 2 ? 'year' : 'team';
        const chk = R.canRespin(run, kind, data);
        if (chk.ok && run.respinsUsed < E.CONSTANTS.MAX_RESPINS) {
          const was = run.currentDraw;
          const now = R.respin(run, data, kind);
          respinsTotal++;
          respinFeesCharged += chk.cost;
          if (now.team_season_id === was.team_season_id) sameResult++;
          if (kind === 'team' && now.season !== was.season) wrongWheel++;
          if (kind === 'year' && now.season === was.season) wrongWheel++;
        } else if (!chk.ok) {
          blockedReasons[chk.reason] = (blockedReasons[chk.reason] || 0) + 1;
        }
        const opts = run.currentDraw.options;
        // The board keeps everyone the team had, including who you cannot sign.
        // How often it has to say "already on your roster" is worth watching:
        // that is how often the old build would have let you double up.
        spinsSeen++;
        if (run.currentDraw.board.some((r) => r.block === R.BLOCK.DRAFTED)) boardsOfferingADuplicate++;
        const chosen = players.find((p) => opts.includes(`${p.player_id}|${p.season}`));
        R.sign(run, chosen);
      }
      freeRerolls += run.freeRerolls;
      const spent = run.roster.reduce((s, p) => s + p.price_musd, 0)
        + E.respinFees(run.respinsUsed);
      spends.push(spent);
      if (spent > E.CONSTANTS.CAP_MUSD + 1e-6) capViolations++;
      if (run.roster.length !== E.SLOTS.length) deadEnds++;
      // slot shape must be respected
      // Spots are chosen by the player now, so check each signing against the
      // slot it actually took (run.slotIndex), not its position in the roster.
      const shapeOk = run.roster.every((p, idx) =>
        E.fillsSlot(E.SLOTS[run.slotIndex[idx]], p))
        && new Set(run.slotIndex).size === run.slotIndex.length;
      // A team-season may now appear twice in a run (that is what makes the
      // Teammates and Battery links reachable at all), but never more than twice.
      const counts = {};
      for (const id of run.usedTeamSeasons) counts[id] = (counts[id] || 0) + 1;
      const withinLimit = Object.values(counts).every((c) => c <= 2);
      if (Object.values(counts).some((c) => c === 2)) repeatedTs++;
      // One man, one spot. A team-season can repeat, so his teammates can come
      // back around, but he cannot.
      const ids = run.roster.map((p) => p.player_id);
      if (new Set(ids).size !== ids.length) doubledUp++;
      if (shapeOk && withinLimit) perfectDrafts++;
    } catch (err) {
      deadEnds++;
      blockedReasons['threw: ' + err.message] = (blockedReasons['threw: ' + err.message] || 0) + 1;
    }
  }
  console.log(`draft invariants over ${n} runs (always re-spin when legal)\n`);
  console.log(`  cap                    $${E.CONSTANTS.CAP_MUSD}M, re-spins $${E.CONSTANTS.RESPIN_LADDER_MUSD.join('M then $')}M from the cap, max ${E.CONSTANTS.MAX_RESPINS}`);
  console.log(`  re-spins taken         ${respinsTotal} (${(respinsTotal / n).toFixed(2)}/run)`);
  console.log(`  free auto-rerolls      ${freeRerolls} (unaffordable draws, pool not consumed)`);
  console.log(`  mean total committed   $${mean(spends).toFixed(1)}M`);
  console.log(`  over-cap runs          ${capViolations}  ${capViolations === 0 ? 'ok' : 'FAIL'}`);
  console.log(`  dead-ended runs        ${deadEnds}  ${deadEnds === 0 ? 'ok' : 'FAIL'}`);
  console.log(`  valid slot shape       ${perfectDrafts}/${n}  ${perfectDrafts === n ? 'ok' : 'FAIL'}`);
  console.log(`  runs reusing a team    ${repeatedTs} (${(100 * repeatedTs / n).toFixed(0)}%, allowed up to twice)`);
  console.log(`  same person twice      ${doubledUp}  ${doubledUp === 0 ? 'ok' : 'FAIL'}`);
  console.log(`  re-spin fees charged   $${respinFeesCharged}M total, `
    + `$${(respinFeesCharged / Math.max(1, respinsTotal)).toFixed(1)}M each on average`);
  console.log(`  re-spin landed on the same team-season   ${sameResult}  ${sameResult === 0 ? 'ok' : 'FAIL'}`);
  console.log(`  re-spin moved the wrong wheel            ${wrongWheel}  ${wrongWheel === 0 ? 'ok' : 'FAIL'}`);
  console.log(`  boards that had to gray out a man you own   `
    + `${boardsOfferingADuplicate} of ${spinsSeen} spins (${(100 * boardsOfferingADuplicate / spinsSeen).toFixed(0)}%)`);
  if (Object.keys(blockedReasons).length) {
    console.log('\n  re-spins refused (the block that prevents dead ends):');
    for (const [r, c] of Object.entries(blockedReasons)) console.log(`    ${c.toString().padStart(5)}  ${r}`);
  }

  /* The same-season division-rival check is gone with the divisions. Its replacement is the
     opposite invariant: a schedule must NOT contain the same franchise twice, because a
     2007 Patriots plus a 2001 Patriots reads as a bug rather than as a season. */
  {
    let dupes = 0;
    for (let i = 0; i < 300; i++) {
      const sc = E.generateSchedule(data.prepared, E.createSeededRNG(900 + i));
      if (new Set(sc.games.map((g) => g.franchise)).size !== sc.games.length) dupes++;
    }
    console.log(`\n  schedules of 300 with a repeated franchise: ${dupes} ` +
      `${dupes === 0 ? 'ok' : 'FAIL'}`);
  }

  /* ONE FRANCHISE MODE: the lock has to hold for the whole draft, not just the first
     spin, and it has to hold through a re-spin. Every club, so an expansion team with
     twenty-four seasons in the pool is covered as well as one with twenty-seven. */
  {
    const clubs = [...new Set(data.teamSeasons.map((t) => t.franchise))].sort();
    const byKey = new Map(data.players.map((p) => [`${p.player_id}|${p.season}`, p]));
    let broke = 0, stuck = 0;
    for (const f of clubs) {
      const run = R.createRun({ franchise: f, seed: E.hashSeed('club|' + f) });
      try {
        for (let i = 0; i < 6; i++) {
          let d = R.spin(run, data);
          if (d.franchise !== f) broke++;
          // A year re-spin on the third pick, which is the one that has to keep the club.
          if (i === 2 && R.canRespin(run, 'year', data).ok) {
            d = R.respin(run, data, 'year');
            if (d.franchise !== f) broke++;
          }
          // Take the cheapest signable man, which is the policy least likely to strand.
          const opts = d.options.map((k) => byKey.get(k))
            .filter((p) => R.slotForPlayer(run, p) !== null)
            .sort((x, y) => x.price_musd - y.price_musd);
          if (!opts.length) { stuck++; break; }
          R.sign(run, opts[0]);
        }
      } catch (e) { stuck++; }
    }
    console.log(`\n  club lock held on all ${clubs.length} clubs: ${broke === 0 ? 'ok' : 'FAIL ' + broke}` +
      `   drafts that dead-ended: ${stuck === 0 ? 'ok' : 'FAIL ' + stuck}`);
  }

  // Resume-safety: rebuilding from (seed, rngCalls) must continue the stream
  const r1 = R.createRun({ seed: 99 });
  R.spin(r1, data);
  const snapshot = JSON.parse(JSON.stringify(r1));
  const first = R.spin(r1, data).team_season_id;
  const again = R.spin(snapshot, data).team_season_id;
  console.log(`  run survives serialize/reload mid-draft: ${first === again ? 'ok' : 'FAIL'}`);
}

/*
 * ─── FULL TEAM: WHAT DOES TWELVE MEN AND ONE CAP ACTUALLY DO ──────────────────
 *
 * THE ONLY QUESTION WORTH ASKING BEFORE ANY UI EXISTS. Full Team removes the crutch
 * each of the other two modes leans on (see resolveGameFull's own comment), so the
 * default expectation is that a twelve-man roster at any sensible cap is far too
 * strong. This measures how strong, across a range of shared caps, so the cap can be
 * READ OFF rather than guessed.
 *
 *   node football/simulator.js --fullteam
 *   node football/simulator.js --dynasty   the Three Year Deal's economics
 *   PS_N=400 node football/simulator.js --fullteam      fewer seasons, faster
 *
 * The target is the one the other modes are held to: careless play misses the
 * playoffs, careful play does not walk to a title. Offense at $140M sits near a 55%
 * per-game win rate for a mid roster, which is the number to compare against.
 */
/* A DEFENDER'S RATING IS IDP POINTS AND THE ENGINE SAMPLES ppr_ppg_*. The live page
   normalises these two names onto each other when it loads the pool, and that loop is the
   only copy of it, so a second reader of this file gets rows the engine cannot sample.
   That is exactly what happened here: the first --fullteam run sampled undefined for all
   six defenders, every full team played with no defense at all, and the table it printed
   looked plausible enough to reason about. Nothing threw.

   So it is done here too, and then ASSERTED, because the failure is silent by nature: a
   missing mean does not crash, it quietly removes half the roster from the game. */
const defenders = load('defender_seasons.json');
for (const p of defenders) { p.ppr_ppg_mean = p.idp_ppg_mean; p.ppr_ppg_sd = p.idp_ppg_sd; }

/* Full Team uses the same price list as every other mode. A mode-specific curve was tried
   here and measured and it made the middle of the field worse, not better; the note over
   FULL_CAP_MUSD in engine.js records what it did and why. */
const fullPlayers = players;
const fullDefenders = defenders;
/* ABSENT, NOT ZERO. The first version of this guard asserted a mean above zero and fired
   on Allen Rossum's 2008, which is a real man who really scored nothing: three of the
   16,973 rows are honest zeroes, they cost the floor price, and the engine samples them
   fine. What must never happen is a mean that is not a number at all, which is what the
   missing normalisation produced and what no arithmetic downstream complains about. */
for (const p of defenders) {
  if (!Number.isFinite(p.ppr_ppg_mean) || !Number.isFinite(p.ppr_ppg_sd)) {
    throw new Error(`defender ${p.player_id}|${p.season} has no sampleable mean: `
      + `ppr_ppg_mean=${p.ppr_ppg_mean} ppr_ppg_sd=${p.ppr_ppg_sd}`);
  }
}

/* FILLING ORDER IS JUST SLOT ORDER NOW. It was an explicit interleave here, because
   FULL_SLOTS used to be offense then defense and filling it in that order spent the shared
   budget on the offense and handed the defense the change. The engine's slot list is
   interleaved itself now, for the same reason and for the draft's, so this is 0..11.

   posOk asks FULL_SLOT_POS rather than E.fillsSlot, because fillsSlot resolves FLEX from
   the shared table where it means all six skill and defensive positions. That is right in
   the two single-pool modes and wrong here: it would let the offensive FLEX be filled by a
   linebacker. */
const FULL_FILL_ORDER = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const posOk = (i, p) => E.FULL_SLOT_POS[i].indexOf(p.position) >= 0;

/* One shared budget across all twelve, which IS the mode: two budgets would delete the
   only question it asks. */
function buildFullToBudget(rng, budget, targetSpendFraction) {
  const slots = E.FULL_SLOTS;
  const roster = new Array(slots.length).fill(null);
  const used = new Set();
  let remaining = budget * targetSpendFraction;
  for (let n = 0; n < FULL_FILL_ORDER.length; n++) {
    const i = FULL_FILL_ORDER[n];
    const left = slots.length - n;
    const isDef = DEF_IDX.indexOf(i) >= 0;
    const pool = (isDef ? fullDefenders : fullPlayers);
    const legal = pool.filter((p) => posOk(i, p)
      && !used.has(`${p.player_id}|${p.season}`));
    const share = Math.min(remaining / left * 1.5, remaining - (left - 1) * 1.0);
    let cand = legal.filter((p) => p.price_musd <= share)
      .sort((a, b) => b.ppr_ppg_mean - a.ppr_ppg_mean)[0];
    /* Nothing affordable is a real outcome at a tight cap, not a harness bug. Take the
       cheapest legal man rather than abandoning the roster, so the sweep reports a weak
       team at $120M instead of reporting nothing at all. */
    if (!cand) cand = legal.sort((a, b) => a.price_musd - b.price_musd)[0];
    roster[i] = cand; used.add(`${cand.player_id}|${cand.season}`);
    remaining -= cand.price_musd;
  }
  return roster;
}

function buildFullRandom(rng, budget) {
  const slots = E.FULL_SLOTS;
  const roster = new Array(slots.length).fill(null);
  const used = new Set();
  let remaining = budget;
  for (let n = 0; n < FULL_FILL_ORDER.length; n++) {
    const i = FULL_FILL_ORDER[n];
    const isDef = DEF_IDX.indexOf(i) >= 0;
    const reserve = (slots.length - n - 1) * 1.0;
    const legal = (isDef ? fullDefenders : fullPlayers).filter((p) => posOk(i, p)
      && !used.has(`${p.player_id}|${p.season}`));
    const pool = legal.filter((p) => p.price_musd <= remaining - reserve);
    const c = pool.length ? pool[Math.floor(rng() * pool.length)]
      : legal.sort((a, b) => a.price_musd - b.price_musd)[0];
    roster[i] = c; used.add(`${c.player_id}|${c.season}`); remaining -= c.price_musd;
  }
  return roster;
}

/*
 * CAP-OPTIMAL FOR TWELVE, solved rather than greedily approximated, and the reason is
 * written at the top of buildOptimal: a greedy builder measured this game at 70.6% when
 * 84.7% was reachable, "that gap was the builder being bad, not the game being hard, and
 * it would have mis-tuned SCALE by ~0.4".
 *
 * It happened again here, in the shape that warning predicts. The greedy alternating
 * builder came back NON-MONOTONE across the fine sweep: careful play won 63.7% at $165M
 * and 60.1% at $175M. Ten million dollars cannot make a roster worse, so the second number
 * was the builder starving its late slots after an expensive early pick, and the band it
 * was being asked to resolve was narrower than its own noise.
 *
 * SUMMED OUTPUT IS THE WRONG TARGET HERE, which is the second thing this builder got
 * wrong and a more interesting one than the first. A DP maximising the sum of all twelve
 * came back WORSE than the greedy builder it replaced: 52.5% against 58.8% at $170M, with
 * 107 points scored a game and 107 allowed.
 *
 * It was not solving badly. It was solving the wrong problem. An offensive point and a
 * defensive point are not interchangeable currency: an offensive man's output goes into
 * your score directly, and a defensive man's goes through defenseSuppression, which is
 * steep. A defensive total of 40 lets 83% of the opponent's scoring through and 60 lets
 * 40% through. So summed output prices a defender by his own number when what he is worth
 * is the slope he sits on, the DP spent everything on the offensive slots because their
 * points-per-dollar curve is the steeper of the two in raw units, and it bought an elite
 * offense standing behind a floor-price secondary.
 *
 * THE TARGET IS EXPECTED MARGIN, and that makes optimal play a BUDGET SPLIT rather than a
 * knapsack. For a fixed split the two sides are independent knapsacks, so this solves each
 * side at every split and picks the split with the best margin against a league-average
 * opponent. What comes back is not just a roster, it is the answer to the mode's own
 * central question: how much of one cap goes to each side of the ball.
 */
const FULL_BUCKET = 0.5;

function fullCurve(allowedPositions, nb) {
  const pool = (allowedPositions.some(p => E.DEFENSE_POSITIONS.indexOf(p) >= 0)
    ? fullDefenders : fullPlayers).filter((p) => allowedPositions.includes(p.position));
  const best = new Array(nb).fill(null);
  for (const p of pool) {
    const b = Math.ceil(p.price_musd / FULL_BUCKET);
    if (b >= nb) continue;
    if (!best[b] || p.ppr_ppg_mean > best[b].ppr_ppg_mean) best[b] = p;
  }
  /* Monotone: spending more can never buy less. */
  for (let b = 1; b < nb; b++) {
    if (!best[b] || (best[b - 1] && best[b - 1].ppr_ppg_mean > best[b].ppr_ppg_mean)) {
      best[b] = best[b - 1];
    }
  }
  return best;
}

/* One side of the ball, cap-optimal for summed output at a given budget. Within ONE side
   that objective is right: those six men all reach the score through the same term. */
const SIDE_CACHE = new Map();
function buildSide(indices, budget) {
  const key = indices.join(',') + '|' + budget;
  if (SIDE_CACHE.has(key)) return SIDE_CACHE.get(key).slice();
  const nb = Math.max(1, Math.round(budget / FULL_BUCKET) + 1);
  const curves = indices.map((i) => fullCurve(E.FULL_SLOT_POS[i], nb));

  let next = new Array(nb).fill(0);
  const choice = [];
  for (let k = indices.length - 1; k >= 0; k--) {
    const cur = new Array(nb).fill(-Infinity);
    const pickAt = new Array(nb).fill(null);
    for (let b = 0; b < nb; b++) {
      for (let spend = 0; spend <= b; spend++) {
        const cand = curves[k][spend];
        if (!cand) continue;
        const val = cand.ppr_ppg_mean + next[b - spend];
        if (val > cur[b]) { cur[b] = val; pickAt[b] = { cand, spend }; }
      }
    }
    choice[k] = pickAt;
    next = cur;
  }

  const roster = [];
  const used = new Set();
  let b = nb - 1;
  for (let k = 0; k < indices.length; k++) {
    if (!choice[k][b]) return null;
    let { cand, spend } = choice[k][b];
    /* The DP ignores identity, and WR/WR, DL/DL or a FLEX can land on the same man twice.
       Same guard buildOptimal uses, over this slot's own pool. */
    if (used.has(`${cand.player_id}|${cand.season}`)) {
      const pos = E.FULL_SLOT_POS[indices[k]];
      const from = pos.some(p => E.DEFENSE_POSITIONS.indexOf(p) >= 0) ? fullDefenders : fullPlayers;
      const alt = from
        .filter((p) => pos.includes(p.position) && p.price_musd <= spend * FULL_BUCKET
          && !used.has(`${p.player_id}|${p.season}`))
        .sort((x, y) => y.ppr_ppg_mean - x.ppr_ppg_mean)[0];
      if (alt) cand = alt;
    }
    used.add(`${cand.player_id}|${cand.season}`);
    roster.push(cand);
    b -= spend;
  }
  SIDE_CACHE.set(key, roster);
  return roster.slice();
}

/* READ OFF FULL_SLOT_POS, not written down. The slot order is interleaved now, so the
   offensive slots are no longer 0 to 5, and a hardcoded pair of ranges here would have
   quietly solved a six-man offense out of four offensive slots and two defensive ones. */
const OFF_IDX = [], DEF_IDX = [];
E.FULL_SLOT_POS.forEach((pos, i) => {
  (pos.some(p => E.DEFENSE_POSITIONS.indexOf(p) >= 0) ? DEF_IDX : OFF_IDX).push(i);
});

const FULL_OPTIMAL_CACHE = new Map();
function buildFullOptimal(budget, wantSplit) {
  if (FULL_OPTIMAL_CACHE.has(budget)) {
    const hit = FULL_OPTIMAL_CACHE.get(budget);
    return wantSplit ? hit : { roster: hit.roster.slice(), coach: hit.coach };
  }
  let best = null;
  /* THE COACH IS BOUGHT BEFORE THE ROSTER, not out of what the roster happened to leave.
     Solving the twelve first always spends the whole cap, so there was never a dollar left
     and the ceiling always came back with no coach: a team no player can field, because the
     game reserves for the hire. The outer loop is therefore over what to SPEND on a coach,
     and the roster is solved with what remains, which is the trade the mode is built on.

     A handful of spend levels rather than all 115 names: the price ladder is steep and
     lumpy, so the best coach at or under $20M is the same man for most of the range, and
     each extra level costs a full pair of knapsacks. */
  const coaches = E.coachTable(ctx) || [];
  const coachBudgets = [0, 3, 8, 14, 21, 28];
  for (const cb of coachBudgets) {
   const coach = cb === 0 ? null
     : coaches.filter((c) => c.price_musd <= cb)
       .sort((a, b) => (b.off + b.def) - (a.off + a.def))[0] || null;
   const spendOnCoach = coach ? coach.price_musd : 0;
   const budgetLeft = budget - spendOnCoach;
   for (let off = 12; off <= budgetLeft - 12; off += 2.5) {
    const o = buildSide(OFF_IDX, off);
    const d = buildSide(DEF_IDX, budgetLeft - off);
    if (!o || !d) continue;
    /* SCORED WITH THE ENGINE'S OWN fullStrength, not with a copy of it written out here.
       The copy left the talent dial off, and a defensive total scaled by 0.78 sits at a
       very different place on defenseSuppression's curve than the same total unscaled, so
       the split this loop called optimal was optimal for a game nobody plays. Calling the
       real function also means the solver and the rating can never drift apart, because
       there is only one of them.
       Chemistry is 1 here for the same reason buildOptimal ignores it: this row is the
       points ceiling, and chemistry is a separate axis measured by its own archetype. */
    const roster = o.concat(d);
    const margin = E.fullStrength(roster, 1, coach, constants);
    if (!best || margin > best.margin) {
      best = { margin, off, def: budgetLeft - off, roster, coach };
    }
   }
  }
  FULL_OPTIMAL_CACHE.set(budget, best);
  return wantSplit ? best : { roster: best.roster.slice(), coach: best.coach };
}

function simulateFull(build, n, seed0) {
  let regGames = 0, regWon = 0, perfect = 0, title = 0, madePlayoffs = 0;
  const regWins = [], spends = [], ptsFor = [], ptsAgainst = [], ratings = [];
  for (let i = 0; i < n; i++) {
    const rng = E.createSeededRNG(seed0 + i * 7919);
    const built = build(rng);
    /* The greedy builders hand back a bare array; the solver hands back a roster AND the
       coach it hired out of the same budget. */
    const roster = Array.isArray(built) ? built : built.roster;
    const coach = Array.isArray(built) ? null : built.coach;
    const plan = E.planFromCoach(coach);
    /* twoSided, because the page passes it for every full run and a harness measuring a
       different chemistry rule is measuring a different game. Over half the links on a
       twelve man roster used to span the two units.
       THE COACH GOES IN TOO, and he is the reason the whole object is handed on rather than
       chem.multiplier: he brings links of his own to whichever unit his old players are on,
       so the two sides come back with two different figures and flattening them here would
       measure a balance the live game never plays at. */
    const chem = E.resolveChemistry(roster, ctx, { twoSided: true, coach });
    const sched = E.generateSchedule(data, rng);
    const playoffs = E.generatePlayoffs(data, rng);
    const run = E.playRun(roster, chem, sched.games, playoffs, leagueContext,
      rng, constants, { full: true, coach, plan });
    for (const g of run.results) {
      if (!g.playoff) {
        regGames++; if (g.won) regWon++;
        ptsFor.push(g.yourScore); ptsAgainst.push(g.oppScore);
      }
    }
    regWins.push(run.regularWins);
    spends.push(roster.reduce((s, p) => s + p.price_musd, 0));
    ratings.push(E.overallOf(roster, chem, 'full', coach));
    if (run.perfect) perfect++;
    if (run.titleWon) title++;
    if (run.seed.made) madePlayoffs++;
  }
  return {
    perGameWin: regWon / regGames,
    meanRegWins: mean(regWins), medianRegWins: median(regWins),
    perfectRate: perfect / n, titleRate: title / n, playoffRate: madePlayoffs / n,
    meanSpend: mean(spends), meanFor: mean(ptsFor), meanAgainst: mean(ptsAgainst),
    meanRating: mean(ratings),
  };
}

/* THE SAME NUMBERS FROM THE MODE THIS ONE HAS TO SIT BESIDE. Printed rather than
   remembered, because "is 71 points a game too many" has no answer until you know that
   offense mode scores 68: the engine works in fantasy space, not in points, and a score
   here is not a scoreline until display_calibration.json converts it. The first version of
   this report carried a note reading "if PF is near 40 the mode is broken", which was my
   own guess about a scale I had not measured, and it would have condemned a mode that was
   behaving exactly like the one already shipped. */
function offenseReference(n) {
  const out = {};
  /* 'optimal' is the SOLVED roster on both sides of this comparison, because comparing a
     solved twelve against a greedy six would flatter Full Team by exactly the amount the
     greedy builder is bad, which is the mistake this whole detour exists to avoid. */
  for (const [name, frac] of [['careless', null], ['mid', 0.90], ['optimal', 'dp']]) {
    let regGames = 0, regWon = 0, madePlayoffs = 0, title = 0;
    const wins = [], pf = [], pa = [];
    for (let i = 0; i < n; i++) {
      const rng = E.createSeededRNG(424242 + i * 7919);
      const roster = frac === null ? buildRandom(rng)
        : frac === 'dp' ? buildOptimal()
          : buildToBudget(rng, frac);
      const chem = E.resolveChemistry(roster, ctx);
      const sched = E.generateSchedule(data, rng);
      const playoffs = E.generatePlayoffs(data, rng);
      const run = E.playRun(roster, chem.multiplier, sched.games, playoffs, leagueContext,
        rng, constants);
      for (const g of run.results) {
        if (g.playoff) continue;
        regGames++; if (g.won) regWon++;
        pf.push(g.yourScore); pa.push(g.oppScore);
      }
      wins.push(run.regularWins);
      if (run.seed.made) madePlayoffs++;
      if (run.titleWon) title++;
    }
    out[name] = { perGameWin: regWon / regGames, medianRegWins: median(wins),
      playoffRate: madePlayoffs / n, titleRate: title / n,
      meanFor: mean(pf), meanAgainst: mean(pa) };
  }
  return out;
}

/*
 * THERE IS NO --fullscale ANY MORE, and its absence is the point.
 *
 * It solved four constants that anchored the Full Team ratings, and those constants are
 * gone: the two units are now scored by the two live modes' own functions, so their scales
 * come from calibrations that already exist and are already checked. Nothing to solve means
 * nothing to re-solve after a data refresh and nothing to paste wrongly. See
 * fullSideRatings in the engine.
 *
 * What replaced the check is the rating column in --fullteam below, which prints what each
 * play style actually rates: careless around 23, careful around 65, solved around 90. If
 * those move a long way after a data change, the scales moved with them.
 */


function fullTeamReport(n) {
  console.log(`FULL TEAM  ${E.FULL_SLOTS.length} slots  ${E.FULL_SLOTS.join(' ')}`);
  console.log(`N=${n} seasons per cell.\n`);

  console.log(`OFFENSE MODE AT $${constants.CAP_MUSD}M, 6 slots, the shipped calibration:`);
  console.log('  play        win%   med rec    PO%   title%     PF     PA');
  const ref = offenseReference(n);
  for (const name of ['careless', 'mid', 'optimal']) {
    const r = ref[name];
    console.log(`  ${name.padEnd(9)}` + fmtPct(r.perGameWin).padStart(7)
      + `${r.medianRegWins}-${17 - r.medianRegWins}`.padStart(9)
      + fmtPct(r.playoffRate).padStart(8) + fmtPct(r.titleRate).padStart(8)
      + r.meanFor.toFixed(1).padStart(7) + r.meanAgainst.toFixed(1).padStart(7));
  }
  console.log('');

  /* Overridable so the band around the answer can be resolved finely without editing the
     file: PS_CAPS=155,165,175,185 node football/simulator.js --fullteam */
  const caps = (process.env.PS_CAPS || String(E.FULL_CAP_MUSD))
    .split(',').map(Number).filter(v => v > 0);
  /* THE SECOND DIAL. The cap decides what a roster LOOKS like and talent decides what it is
     worth on the field, so they are fitted in that order: pick the cap for the roster, then
     solve talent for the win rate. PS_TALENT=0.6,0.7,0.8 sweeps it. */
  const talents = (process.env.PS_TALENT || String(E.FULL_TALENT))
    .split(',').map(Number).filter(v => v > 0);
  const rows = [
    { name: 'careless', build: (b) => (rng) => buildFullRandom(rng, b) },
    { name: 'mid',      build: (b) => (rng) => buildFullToBudget(rng, b, 0.90) },
    /* SOLVED, not greedy. This row is the ceiling and it is the row the cap is read off,
       so it is the one that must not wobble: see buildFullOptimal's comment. */
    { name: 'optimal',  build: (b) => () => buildFullOptimal(b) },   // roster AND coach
  ];

  console.log('  cap   tal    play        win%   med rec    PO%   title%   20-0     PF     PA   rating   spend');
  for (const cap of caps) {
   for (const tal of talents) {
    constants.FULL_TALENT = tal;
    for (const row of rows) {
      const r = simulateFull(row.build(cap), n, 424242);
      const rec = `${r.medianRegWins}-${17 - r.medianRegWins}`;
      console.log(
        `  $${String(cap).padEnd(4)} ${String(tal).padEnd(5)} ${row.name.padEnd(9)}`
        + fmtPct(r.perGameWin).padStart(7)
        + rec.padStart(9)
        + fmtPct(r.playoffRate).padStart(8)
        + fmtPct(r.titleRate).padStart(8)
        + fmtPct(r.perfectRate).padStart(8)
        + r.meanFor.toFixed(1).padStart(7)
        + r.meanAgainst.toFixed(1).padStart(7)
        + r.meanRating.toFixed(1).padStart(9)
        + ('$' + r.meanSpend.toFixed(0)).padStart(8)
        + (row.name === 'optimal'
          ? `   split ${'$' + buildFullOptimal(cap, true).off.toFixed(1)} off / ${'$' + buildFullOptimal(cap, true).def.toFixed(1)} def`
            + `   coach ${(buildFullOptimal(cap, true).coach || {}).name || 'none'}`
          : ''));
    }
    console.log('');
   }
  }
  console.log('WHAT TO LOOK FOR. The cap to ship is the one whose three rows sit closest to the');
  console.log('three reference rows above: careless play out of the playoffs, careful play winning');
  console.log('but not walking to a title. PF and PA are in the engine\'s fantasy space and are');
  console.log('not scorelines, so compare them to the reference rather than to a real NFL game.');
}

/*
 * Regular-season win distribution per archetype, and what each candidate
 * threshold pair would mean. Thresholds are a game-feel decision, so pick them
 * from the actual distribution rather than from NFL precedent alone: the draft
 * pool is all-time players, so win totals run higher than a real league's.
 */
function recordReport(n) {
  console.log(`regular-season win distribution, N=${n} runs/archetype\n`);
  const rows = ARCHETYPES.map((a) => ({ a, r: simulate(a, n, 31337) }));
  const label = (i) => String(i).padStart(2);
  console.log('wins      ' + Array.from({length: 10}, (_, i) => label(i + 8)).join('  '));
  for (const { a, r } of rows) {
    const cells = Array.from({length: 10}, (_, i) => {
      const pc = 100 * r.winHist[i + 8] / n;
      return (pc >= 0.5 ? pc.toFixed(0) : ' .').padStart(2);
    });
    console.log(a.name.slice(0, 9).padEnd(10) + cells.join('  ') + '   (mean ' + r.meanRegWins.toFixed(1) + ')');
  }
  console.log('\nshare of runs reaching each threshold:');
  console.log('threshold   ' + rows.map(({ a }) => a.name.slice(0, 9).padStart(10)).join(''));
  for (const t of [10, 11, 12, 13, 14, 15]) {
    const cells = rows.map(({ r }) => {
      const share = r.winHist.reduce((s, c, w) => s + (w >= t ? c : 0), 0) / n;
      return fmtPct(share).padStart(10);
    });
    console.log((t + '+ wins').padEnd(12) + cells.join(''));
  }
  console.log(`\ncurrently: playoffs at ${E.CONSTANTS.PLAYOFF_WINS}+, bye at ${E.CONSTANTS.BYE_SEED_WINS}+`);
  console.log('playoff-game win rate (top-quartile opponents):');
  for (const { a, r } of rows) console.log('  ' + a.name.padEnd(22) + fmtPct(r.playoffGameWin));
}


/*
 * Real play policies, driven through the actual wheel.
 *
 * This is the mode that matters for balance, and the archetype table above is not.
 * Archetypes build rosters out of the whole player pool, which stopped describing
 * the game the moment a spin began offering a whole team to choose from. Measured
 * that way the game looked correctly tuned while somebody tapping the top row of a
 * best-first list was quietly winning 13 games having decided nothing.
 *
 * Anything that changes pricing, the cap, chemistry or the structure model should
 * be re-checked here, not just against the archetypes.
 */
function policyReport(n) {
  const R = require('./run.js');
  const rosters = require('./data/team_season_rosters.json');
  void rosters;
  const rdata = R.indexData(players, teamSeasons);
  const byk = new Map(players.map((p) => [p.player_id + '|' + p.season, p]));
  const POLICIES = {
    'cheapest every time': (o) => o[o.length - 1],
    'best points per dollar': (o) => o.slice().sort((a, b) =>
      (b.ppr_ppg_mean / Math.max(3, b.price_musd)) - (a.ppr_ppg_mean / Math.max(3, a.price_musd)))[0],
    'random tap': (o, rng) => o[Math.floor(rng() * o.length)],
    'taps the top row': (o) => o[0],
    'perfect play (DP)': (o) => o[0],
  };

  const run1 = (policy, seed) => {
    const run = R.createRun({ seed });
    const rng = E.createSeededRNG(seed ^ 0x5f5f);
    while (run.phase === R.PHASES.DRAFT) {
      const d = R.spin(run, rdata);
      const opts = d.options.map((k) => byk.get(k));
      const budget = R.remaining(run) - R.reserveFloor(run);
      const legal = opts.filter((p) => p.price_musd <= budget);
      R.sign(run, POLICIES[policy](legal, rng) || legal[0]);
    }
    R.startSeason(run, rdata, ctx);
    let roster = run.roster, chem = run.season.chemistry;
    if (policy === 'perfect play (DP)') {
      const best = R.bestPossibleSquad(run, rdata, ctx);
      if (best) { roster = best.squad; chem = best.chemistry; }
    }
    const proj = R.projectSeason(roster, chem, run, rdata, leagueContext, 120);
    return {
      proj, chem,
      spend: roster.reduce((s, p) => s + p.price_musd, 0),
      fppg: roster.reduce((s, p) => s + p.ppr_ppg_mean, 0),
      structure: E.rosterStructure(roster).multiplier,
    };
  };

  /*
   * WHAT EACH POLICY SHOULD DO, CHECKED RATHER THAN DESCRIBED.
   *
   * This report used to end in two sentences: careless play should finish around 12-5, and
   * perfect play should win 14 and take the title about one run in five. The first was
   * roughly true. The second had been wrong for a long time, because it was written against
   * a playoff ladder that has been retuned repeatedly since, and perfect play through the
   * wheel takes the title about one run in a hundred. A stale sentence in a harness is worse
   * than no sentence at all: it reads like a check that passed.
   *
   * So the expectations are data, and a row outside its band prints MISS. Bands are wide on
   * purpose. The point is to catch a change that breaks the LADDER (careless play sneaking
   * into the playoffs, perfect play falling to a coin flip), not to pin a number that moves
   * whenever the sim is tuned. Re-measure and widen deliberately if a change is intended;
   * a band nobody re-reads is how the old sentence got stale.
   */
  const TARGETS = {
    'cheapest every time':    { wins: [0, 3],   playoffs: [0, 0.03] },
    'best points per dollar': { wins: [2, 6],   playoffs: [0, 0.05] },
    'random tap':             { wins: [4, 8],   playoffs: [0, 0.10] },
    'taps the top row':       { wins: [9, 13],  playoffs: [0.20, 0.50] },
    'perfect play (DP)':      { wins: [12, 16], playoffs: [0.55, 0.90] },
  };

  console.log(`real play policies through the wheel, ${n} runs each\n`);
  console.log('policy                   spend  FPPG  chem  struct  record  playoffs  title   20-0  vs target');
  let misses = 0;
  for (const name of Object.keys(POLICIES)) {
    const rs = [];
    for (let i = 0; i < n; i++) rs.push(run1(name, 20000 + i * 7919));
    const m = (f) => mean(rs.map(f));
    const w = rs.map((r) => r.proj.typicalWins).sort((a, b) => a - b);
    const medWins = w[Math.floor(n / 2)];
    const po = m((r) => r.proj.playoffRate);
    const t = TARGETS[name];
    const inBand = (v, b) => !b || (v >= b[0] && v <= b[1]);
    const ok = inBand(medWins, t && t.wins) && inBand(po, t && t.playoffs);
    if (!ok) misses++;
    console.log(name.padEnd(24)
      + ('$' + m((r) => r.spend).toFixed(0) + 'M').padStart(6)
      + m((r) => r.fppg).toFixed(0).padStart(6)
      + (((m((r) => r.chem) - 1) * 100).toFixed(1) + '%').padStart(6)
      + m((r) => r.structure).toFixed(3).padStart(8)
      + (medWins + '-' + (17 - medWins)).padStart(8)
      + (fmtPct(po)).padStart(10)
      + (fmtPct(m((r) => r.proj.titleRate))).padStart(7)
      + (fmtPct(m((r) => r.proj.perfectRate))).padStart(7)
      + (t ? (ok ? '  ok' : '  MISS') : '  reference').padStart(11));
  }
  console.log(`\nladder: ${misses ? misses + ' policy band(s) MISSED' : 'every policy inside its band'}.`);
  console.log('Bands check the SHAPE of the ladder, not exact rates: careless play must not');
  console.log('reach the playoffs and perfect play must not be reduced to a coin flip.');
  console.log('Title and 20-0 are printed, not asserted, because both are rare enough at this');
  console.log(`N (${n}) that a band would fire on sampling noise.`);
}

/*
 * ─── THE THREE YEAR DEAL, AND WHETHER ITS ECONOMICS WORK AT ALL ─────────────────────
 *
 *   node football/simulator.js --dynasty
 *
 * A DYNASTY IS A FULL TEAM CARRIED THROUGH THREE REAL NFL SEASONS. Twelve men, six a side,
 * one shared cap, one coach, and every winter the men you keep age into their own next year
 * at whatever those years actually were.
 *
 * THE RULES, and the third one is the whole design:
 *
 *   1. Every man re-prices each winter to what his new season is worth. No locked deals.
 *   2. You open money by RELEASING men. A release is the only way to make room.
 *   3. THE CAP IS A SIGNING GATE, NOT A CEILING. Go over it by keeping men who got more
 *      expensive and nothing happens; you simply cannot sign anybody until you are back
 *      under. So a roster that appreciates traps you with itself.
 *
 * WHY THE THIRD RULE IS THE FIX. A hard ceiling forces the cut for you and there is no
 * decision in being told what to do. A gate leaves the roster legal and makes the cost of
 * keeping it the thing you actually lose: the wheel. Standing pat is always allowed and is
 * sometimes right, which is what makes releasing a choice rather than an obligation.
 *
 * WHAT THIS RUN ANSWERS is exactly one question: IS RELEASING EVER RIGHT? If a keep
 * everybody strategy matches a release aggressively one, the winter has no decision in it
 * and the mode should not be built. Everything else here is instrumentation for that.
 */

/*
 * ─── WHAT AN EARLIER SHAPE OF THIS MODE MEASURED, AND WHY IT WAS ABANDONED ──────────
 *
 * The first design was six men (a Classic roster), locked multi-year contracts at a term
 * discount, dead money on a man who left mid-deal, and a cap that grew 5% a year. Measured
 * over 200 dynasties a strategy, off the wheel:
 *
 *   year   wins   payroll   cap    holes a winter   cap room going unspent
 *     1    10.4    $123M   $140M        0.0                 $17M
 *     2    10.0    $119M   $147M        1.1                 $28M
 *     3    10.2    $116M   $154M        1.1                 $38M
 *
 * One man left a winter. That was the entire offseason: spin once, done. Wins were flat and
 * all four contract strategies landed within noise, so the term decision was worth nothing.
 * Meanwhile $38M piled up by year three with no hole to spend it on.
 *
 * THE ROOT CAUSE IS A PROPERTY OF THIS GAME AND NOT OF ANY ONE MODE. Price in this pool is
 * a monotone function of value, which buildFullOptimal's comment records from the other
 * side ("the board holds no bargains"), so a man who declines gets CHEAPER by about what he
 * lost and payroll FALLS as a roster ages. The classic franchise tension, your star is now
 * overpaid, cannot arise here on its own.
 *
 * Two repairs were tried and neither works, recorded so they are not tried again. A GROWING
 * cap makes it strictly worse: the roster gets cheaper as it ages and the budget rises, so
 * both forces point at no pressure. A SHRINKING cap, at 0.88 a year, does create pressure,
 * room falling $17M then $9M then $2M and wins decaying 10.5, 9.6, 8.7, but it produces a
 * decline with nothing to do about it, because the winter still holds one hole. Pressure is
 * not a decision.
 *
 * AND ONE ERROR OF THIS HARNESS'S OWN, kept because it is instructive. dynastyFill first
 * took the best affordable man in the WHOLE league year, reasoning that if the economics
 * fail with a free choice they will fail off a wheel. Backwards: free choice makes CHURNING
 * optimal, so year three came out STRONGER than year one, 13.6 wins against 12.9, and the
 * harness had deleted the mode's premise before measuring anything. It spins a club now.
 */

/*
 * ─── THE ONE RULE THAT MAKES THE WINTER A DECISION ──────────────────────────────────
 *
 * A SALARY NEVER GOES DOWN WHILE A MAN IS ON YOUR ROSTER. He gets a raise the year he
 * improves and keeps what he had the year he declines. Release him and the number is gone
 * with him; sign somebody new and you pay whatever that man is worth today.
 *
 * WITHOUT IT NOTHING IN THIS MODE WORKS, and it took two full designs to see why. Price in
 * this pool tracks value, so a man who declines re-prices DOWN and an ageing roster gets
 * cheaper every winter. Measured at twelve men and $280M with salaries free to fall,
 * payroll ran $279M, $266M, $261M and the cap was never within $14M of binding: the gate
 * never closed, releasing was never forced or rewarded, and standing pat was the best
 * strategy in the game at 29.7 three-year wins against 29.6, 29.5 and 29.3 for the three
 * that manage the roster. A winter where doing nothing is optimal has no decision in it.
 *
 * The ratchet is what a contract actually is. Nobody renegotiates a veteran downward
 * because he slipped; he is on the deal he signed and the team eats it. It is the honest
 * source of the one tension a franchise mode needs and this game could not otherwise
 * produce, and it costs one number per man on the roster.
 *
 * PS_DYN_RATCHET=0 turns it off, which reproduces the table above.
 */
const DYN_RATCHET = process.env.PS_DYN_RATCHET !== '0';

/*
 * AND THE COUNTERWEIGHT, which only earns its place once the ratchet is in.
 *
 * A growing cap was tried in the first design and made things strictly worse, because
 * payroll FELL as the roster aged and a rising budget pointed the same way. With salaries
 * ratcheting the sign flips: payroll now climbs into the ceiling, so cap growth is the one
 * thing standing between the mode and a three-year slide nobody can arrest. It is the brake,
 * not the accelerator. PS_DYN_GROWTH sweeps it.
 */
const DYN_GROWTH = Number(process.env.PS_DYN_GROWTH ?? E.DYNASTY_CAP_GROWTH);

/* Everything in both pools, keyed the way dynastyAge wants it. */
const DYN_BYKEY = new Map();
for (const p of fullPlayers.concat(fullDefenders)) DYN_BYKEY.set(`${p.player_id}|${p.season}`, p);
const DYN_LAST_SEASON = Math.max(...fullPlayers.map((p) => p.season));
const DYN_FIRST_SEASON = Math.min(...fullPlayers.map((p) => p.season));

/* Clubs by league year, per side of the ball, because the wheel in this mode spins clubs
   alone and Full Team's slots alternate between the two pools. */
const DYN_CLUBS = { off: {}, def: {} };
for (const [side, pool] of [['off', fullPlayers], ['def', fullDefenders]]) {
  for (const p of pool) {
    const y = (DYN_CLUBS[side][p.season] ??= {});
    (y[p.team_season_id] ??= []).push(p);
  }
  for (const y in DYN_CLUBS[side]) DYN_CLUBS[side][y] = Object.values(DYN_CLUBS[side][y]);
}
const DYN_SIDE_OF = E.FULL_SLOT_POS.map((pos) =>
  (pos.some((x) => E.DEFENSE_POSITIONS.indexOf(x) >= 0) ? 'def' : 'off'));

/*
 * FILL WHAT IS OPEN, OFF THE WHEEL, one spin a hole, and STOP AT THE GATE.
 *
 * The gate is the rule the whole mode turns on: over the cap, you sign nobody. A roster
 * that appreciated past $280M plays the season with holes in it, which is a real and
 * survivable outcome rather than an error, because eleven good men beat twelve poor ones
 * often enough to be worth trying.
 */
function dynastyFill(roster, salary, payrollNow, cap, year, rng, used) {
  const out = roster.slice(), sal = salary.slice();
  let spend = payrollNow;
  for (let i = 0; i < E.FULL_SLOTS.length; i++) {
    if (out[i]) continue;
    if (spend >= cap) continue;                       // the gate
    const clubs = DYN_CLUBS[DYN_SIDE_OF[i]][year] || [];
    if (!clubs.length) continue;
    const club = clubs[Math.floor(rng() * clubs.length)];
    const room = cap - spend;
    const legal = club.filter((p) => E.FULL_SLOT_POS[i].indexOf(p.position) >= 0
      && !used.has(p.player_id));
    /* Best man on that club this hole can afford. Nothing affordable is a wasted spin,
       which is what the live wheel does when the reel lands badly and the money is short. */
    const cand = legal.filter((p) => p.price_musd <= room)
      .sort((a, b) => b.ppr_ppg_mean - a.ppr_ppg_mean)[0];
    if (!cand) continue;
    out[i] = cand; sal[i] = cand.price_musd; used.add(cand.player_id); spend += cand.price_musd;
  }
  return { roster: out, salary: sal, spend };
}

/*
 * THE FOUR WAYS TO PLAY A WINTER, and the spread between them is the answer.
 *
 *   stand pat   release nobody. Fill only the holes the calendar made.
 *   cut worst   release the single worst man by output per dollar.
 *   cut three   release three, which is a quarter of the roster every winter.
 *   value       release anybody returning less per dollar than the roster's own median,
 *               which is the play somebody thinking about it would make.
 *
 * A release is scored on POINTS PER DOLLAR rather than on points, because the money it
 * frees is the only reason to do it: cutting a $40M star who returns well is how you end up
 * unable to replace him.
 */
const DYN_CUTS = {
  'stand pat': () => [],
  'cut worst': (rows) => rankByValue(rows).slice(0, 1),
  'cut three': (rows) => rankByValue(rows).slice(0, 3),
  'value':     (rows) => {
    const r = rankByValue(rows);
    const v = r.map(worth).sort((a, b) => a - b);
    const med = v[Math.floor(v.length / 2)];
    return r.filter((x) => worth(x) < med * 0.75);
  },
};
/* Output per DOLLAR OF SALARY, not per list price, which is the whole point once salaries
   ratchet: a man is dead weight because of what you are paying him, and what he would cost
   somebody else today is not your problem. */
const worth = (x) => x.p.ppr_ppg_mean / Math.max(3, x.sal);
const rankByValue = (rows) => rows.slice().sort((a, b) => worth(a) - worth(b));

/*
 * ─── HOW LONG DO YOU LAST ───────────────────────────────────────────────────────────
 *
 * The mode is not three seasons. It is as many as you can keep the job for: every autumn
 * the owner wants something, and the winter you do not deliver it is the winter you are
 * fired. The score is the number of seasons you survived, which is one integer, ranks
 * itself, and lets somebody stop after any season with their run already banked.
 *
 * WHICH MAKES THE THRESHOLD THE ENTIRE MODE, so it is measured rather than picked. Five
 * candidate rules, each played against every winter strategy until the bot is fired:
 *
 *   win 9        a winning record, every year, forever
 *   win 10       one better, which in this game is a real step
 *   playoffs     12 wins, every year, no excuses
 *   ramp         8 the first year, then 9, 10, 11, 12, and 12 from then on
 *   two strikes  miss the playoffs in two consecutive seasons and you are gone
 *
 * WHAT A GOOD ANSWER LOOKS LIKE. The bot here is crude, so it should sit at the LOW end of
 * what the rule allows: a median around two or three seasons for the best bot leaves the
 * room a human needs to be visibly better, and a long thin tail is what makes a
 * leaderboard worth climbing. A rule the bot cannot beat once is unplayable; a rule the bot
 * rides to the safety stop has no difficulty in it at all.
 */
/* THE RULE THAT SHIPPED reads from the engine rather than being restated here, because the
   page will apply the same one and two implementations of a firing rule is how a player
   gets fired on one screen and not on another. The rest are the candidates it beat, kept so
   the comparison in dynastyWinBar's note can be reproduced. */
const DYN_GOALS = {
  'SHIPPED (2x ramp)': (h) => E.dynastySurvives(h),
  'win 9':       (h) => h[h.length - 1].wins >= 9,
  'win 10':      (h) => h[h.length - 1].wins >= 10,
  'playoffs':    (h) => h[h.length - 1].made,
  'ramp':        (h) => h[h.length - 1].wins >= Math.min(12, 7 + h.length),
  /* The forgiving one, and the most like real football: one bad year is a bad year, two in
     a row is a pattern. Nobody is fired after a single season. */
  'two strikes': (h) => h.length < 2 || h[h.length - 1].made || h[h.length - 2].made,
  /* The same patience, against the bar that produced the widest skill spread. */
  '2x losing':   (h) => h.length < 2 || h[h.length - 1].wins >= 9 || h[h.length - 2].wins >= 9,
  /* Two misses EVER rather than two in a row: the owner remembers. */
  'two total':   (h) => h.filter((x) => x.wins < 9).length < 2,
};

/* A safety stop, not a length. A dynasty ends when the owner ends it. */
const DYN_MAX_SEASONS = E.DYNASTY_MAX_SEASONS;

/*
 * Play one dynasty until the owner has seen enough. Returns the seasons survived and the
 * year-by-year history.
 *
 * A MAN YOU RELEASE DOES NOT COME BACK, which is a rule rather than a convenience. Salaries
 * ratchet, so without it the winter has a free exploit in it: cut your declining $40M star
 * and re-sign the same man off the wheel at the $32M he is now worth, which is a pay cut
 * the ratchet exists to forbid. `used` is keyed on the player and not the player-season, so
 * once he has been on your roster he is gone from your pool for good.
 */
function playDynasty(rng, cutter, goal, coaches) {
  const CAP0 = E.FULL_CAP_MUSD;
  let roster = new Array(E.FULL_SLOTS.length).fill(null);
  let salary = new Array(E.FULL_SLOTS.length).fill(0);
  let coach = null, tenure = {}, cap = CAP0;
  const used = new Set();
  const history = [];

  for (let y = 0; y < DYN_MAX_SEASONS; y++) {
    const year = DYN_START(rng, y, history);
    let gone = 0, cut = 0;

    if (y > 0) {
      cap = Math.round(cap * DYN_GROWTH);
      const aged = roster.map((m) => (m ? E.dynastyAge(m, DYN_BYKEY, year) : null));
      const nextSal = aged.map((m, i) => (m
        ? (DYN_RATCHET ? E.dynastySalary(salary[i], m.price_musd) : m.price_musd)
        : 0));
      for (let i = 0; i < roster.length; i++) if (roster[i] && !aged[i]) gone++;
      const rows = [];
      for (let i = 0; i < aged.length; i++) if (aged[i]) rows.push({ i, p: aged[i], sal: nextSal[i] });
      for (const x of cutter(rows)) { aged[x.i] = null; nextSal[x.i] = 0; cut++; }
      roster = aged; salary = nextSal;
      for (const p of roster) if (p) tenure[p.player_id] = (tenure[p.player_id] || 0) + 1;
    }

    let payroll = salary.reduce((t, v) => t + v, 0) + (coach ? coach.price_musd : 0);
    const filled = dynastyFill(roster, salary, payroll, cap, year, rng, used);
    roster = filled.roster; salary = filled.salary; payroll = filled.spend;
    for (const p of roster) if (p) tenure[p.player_id] = tenure[p.player_id] || 1;
    if (!coach) {
      const afford = coaches.filter((c) => c.price_musd <= cap - payroll);
      coach = afford.sort((a, b) => (b.off + b.def) - (a.off + a.def))[0] || null;
      if (coach) payroll += coach.price_musd;
    }

    const squad = roster.filter(Boolean);
    const { off, def } = E.splitSides(squad);
    /* A side wiped out is a roster that cannot take the field, which in a survival mode is
       simply the end of the run rather than an error to swallow. */
    if (!off.length || !def.length) break;

    const chem = E.resolveChemistry(squad, ctx, { twoSided: true, coach });
    const cont = E.dynastyContinuity(squad, tenure);
    const bump = cont ? cont.value : 0;
    const chemNow = bump ? {
      multiplier: chem.multiplier + bump,
      offMultiplier: (chem.offMultiplier ?? chem.multiplier) + bump,
      defMultiplier: (chem.defMultiplier ?? chem.multiplier) + bump,
    } : chem;
    const run = E.playRun(squad, chemNow, E.generateSchedule(data, rng).games,
      E.generatePlayoffs(data, rng), leagueContext, rng, constants,
      { full: true, coach, plan: E.planFromCoach(coach) });

    history.push({ year, wins: run.regularWins, made: run.seed.made, title: run.titleWon,
      rating: E.overallOf(squad, chemNow, 'full', coach), payroll, cap, gone, cut,
      men: squad.length });
    if (!goal(history)) break;
  }
  return history;
}

/* Where a dynasty starts, and it has to leave room to run: a run beginning in 2023 has two
   seasons of data left in the pool whatever the owner wants. Ten years of runway. */
const DYN_START = (rng, y, history) => (history.length
  ? history[0].year + y
  : DYN_FIRST_SEASON + Math.floor(rng() * Math.max(1, (DYN_LAST_SEASON - 10) - DYN_FIRST_SEASON + 1)));

function dynastyReport(n) {
  const coaches = E.coachTable(ctx) || [];
  console.log('THE GAUNTLET: how many seasons does the owner give you?');
  console.log(`N=${n} dynasties per cell, twelve men and a coach at $${E.FULL_CAP_MUSD}M, `
    + `starting years ${DYN_FIRST_SEASON} to ${DYN_LAST_SEASON - 10}.\n`);

  const q = (a, p) => a.slice().sort((x, y) => x - y)[Math.floor(p * (a.length - 1))];
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

  for (const [gname, goal] of Object.entries(DYN_GOALS)) {
    console.log('  ' + gname.toUpperCase());
    console.log('    winter        median   mean    p75    p90    best   fired in yr 1   hit the stop');
    for (const [cname, cutter] of Object.entries(DYN_CUTS)) {
      const lens = [];
      for (let d = 0; d < n; d++) {
        const rng = E.createSeededRNG(551100 + d * 7919);
        lens.push(playDynasty(rng, cutter, goal, coaches).length);
      }
      console.log('    ' + cname.padEnd(12)
        + String(q(lens, 0.5)).padStart(7)
        + mean(lens).toFixed(1).padStart(7)
        + String(q(lens, 0.75)).padStart(7)
        + String(q(lens, 0.9)).padStart(7)
        + String(Math.max(...lens)).padStart(7)
        + fmtPct(lens.filter((x) => x <= 1).length / lens.length).padStart(16)
        + fmtPct(lens.filter((x) => x >= DYN_MAX_SEASONS).length / lens.length).padStart(15));
    }
    console.log('');
  }
  console.log('WHAT TO LOOK FOR. The bot is crude, so the rule to ship is the one where its');
  console.log('best strategy sits around two or three seasons with a tail that reaches into');
  console.log('double figures: that leaves the room a human needs to be visibly better. A rule');
  console.log('that fires the bot in year one most of the time is unplayable, and one it rides');
  console.log('to the safety stop has no difficulty in it. The spread between "stand pat" and');
  console.log('the rest is, as ever, what managing the roster is worth.');
}

// ─── main ────────────────────────────────────────────────────────────────────

const arg = process.argv[2];
const N = Number(process.env.PS_N ?? 2000);
if (arg === '--sweep') sweep(Math.max(400, Math.floor(N / 2)));
else if (arg === '--chem') chemReport();
else if (arg === '--schedule') scheduleReport(200);
else if (arg === '--draft') draftReport(Number(process.env.PS_N ?? 3000));
else if (arg === '--fullteam') fullTeamReport(Number(process.env.PS_N ?? 400));
else if (arg === '--record') recordReport(Number(process.env.PS_N ?? 2000));
else if (arg === '--policies') policyReport(Number(process.env.PS_N ?? 40));
else if (arg === '--dynasty') dynastyReport(Number(process.env.PS_N ?? 300));
else reportMain(N);
