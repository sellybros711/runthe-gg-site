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

/** Random legal picks, the floor archetype. */
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
  // measure, and those rates are the whole calibration target.
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
  let allPass = true;
  for (const a of ARCHETYPES) {
    const r = simulate(a, n, 1234);
    const pass = !a.target || (r.perGameWin >= a.target[0] - 0.02 && r.perGameWin <= a.target[1] + 0.02);
    if (!pass) allPass = false;
    console.log(
      `${a.name.padEnd(22)} $${r.meanSpend.toFixed(0).padStart(3)}M  ` +
      `${r.meanChem.toFixed(3)}  ${fmtPct(r.perGameWin).padStart(6)}  ` +
      (a.target ? `${a.target[0]}-${a.target[1]} ${pass ? 'ok' : 'MISS'}  ` : `  reference  `) +
      `${(r.meanRegWins.toFixed(1) + '-' + (17 - r.meanRegWins).toFixed(1)).padStart(9)}  ` +
      `${fmtPct(r.playoffRate).padStart(6)}  ${fmtPct(r.byeRate).padStart(5)} ` +
      `${fmtPct(r.titleRate).padStart(6)}  ${fmtPct(r.perfectRate).padStart(6)}`,
    );
  }
  console.log(`\nwin-rate targets: ${allPass ? 'all within tolerance' : 'MISS, sweep SCALE'}`);
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
        E.SLOT_ELIGIBILITY[E.SLOTS[run.slotIndex[idx]]].includes(p.position))
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

  /* ALL-TIME TEAM MODE: the lock has to hold for the whole draft, not just the first
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

  console.log(`real play policies through the wheel, ${n} runs each\n`);
  console.log('policy                   spend  FPPG  chem  struct  record  playoffs  title   20-0');
  for (const name of Object.keys(POLICIES)) {
    const rs = [];
    for (let i = 0; i < n; i++) rs.push(run1(name, 20000 + i * 7919));
    const m = (f) => mean(rs.map(f));
    const w = rs.map((r) => r.proj.typicalWins).sort((a, b) => a - b);
    console.log(name.padEnd(24)
      + ('$' + m((r) => r.spend).toFixed(0) + 'M').padStart(6)
      + m((r) => r.fppg).toFixed(0).padStart(6)
      + (((m((r) => r.chem) - 1) * 100).toFixed(1) + '%').padStart(6)
      + m((r) => r.structure).toFixed(3).padStart(8)
      + (w[Math.floor(n / 2)] + '-' + (17 - w[Math.floor(n / 2)])).padStart(8)
      + (fmtPct(m((r) => r.proj.playoffRate))).padStart(10)
      + (fmtPct(m((r) => r.proj.titleRate))).padStart(7)
      + (fmtPct(m((r) => r.proj.perfectRate))).padStart(7));
  }
  console.log('\nCareless play should finish around 12-5 with a coin flip at the playoffs.');
  console.log('Perfect play should win 14 and take the title about one run in five.');
}

// ─── main ────────────────────────────────────────────────────────────────────

const arg = process.argv[2];
const N = Number(process.env.PS_N ?? 2000);
if (arg === '--sweep') sweep(Math.max(400, Math.floor(N / 2)));
else if (arg === '--chem') chemReport();
else if (arg === '--schedule') scheduleReport(200);
else if (arg === '--draft') draftReport(Number(process.env.PS_N ?? 3000));
else if (arg === '--record') recordReport(Number(process.env.PS_N ?? 2000));
else if (arg === '--policies') policyReport(Number(process.env.PS_N ?? 40));
else reportMain(N);
