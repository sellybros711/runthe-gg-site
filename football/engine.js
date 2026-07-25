/* The Perfect Season — game engine.
 *
 * Headless and dependency-free. Browser: window.PS_ENGINE. Node:
 * require('./engine.js'). Validated by simulator.js; nothing here touches the
 * DOM, so the harness can run millions of games before any UI exists.
 *
 * The seeded RNG is intentionally a COPY of the mulberry32 used by
 * /gameLogic.js rather than an import. gameLogic.js is loaded live by
 * RunThePitch (/soccer/) and is not a shared library; generalizing it for a
 * second game would ship into a running one. A few duplicated lines are the
 * correct trade.
 */

'use strict';

// ─── tuning constants ────────────────────────────────────────────────────────

/*
 * SCALE converts an opponent's real points into roster-fantasy-point space and
 * is the primary difficulty dial. Solve it with simulator.js; do not guess.
 *
 * The GDD called SCALE and league_avg_pts_allowed "the two dials". They are not
 * independent: in the per-game formula one multiplies your score and the other
 * divides the opponent's, so they are a single degree of freedom. League average
 * points allowed is therefore treated as a measured per-season constant (see
 * data/league_context.json) rather than a knob.
 */
const CONSTANTS = {
  /*
   * Solved with `node football/simulator.js --sweep`, N=4000 runs/archetype.
   * At 1.95 all four of the GDD's §9 win-rate rows land in band:
   *
   *   random affordable   61.8%   (target 0.62-0.68)
   *   decent, $75M used   76.5%   (target 0.76-0.80)
   *   well-built          85.4%   (target 0.83-0.86)   2.9% perfect
   *   optimal + chemistry 89.5%   (target 0.88-0.90)   8.7% perfect
   *
   * Re-solve this before trusting any change to pricing, the cap, or the
   * chemistry curve — all three move these numbers.
   */
  SCALE: 1.95,
  CAP_MUSD: 100,
  RESPIN_COST_MUSD: 15,
  MAX_RESPINS: 2,
  MIN_RESERVE_PER_SLOT_MUSD: 3,
  REGULAR_SEASON_GAMES: 17,
  PLAYOFF_GAMES: 3,
  /*
   * Losses allowed before the run ends. 1, not 0.
   *
   * Under sudden death, median games survived is ln(0.5)/ln(p), so the GDD's two
   * stated goals were mutually exclusive: a 3-6% perfect-season rate implies
   * p~0.85, which is a median exit in week 4.3 — not the week 7-9 it wanted.
   * Reaching week 7-9 requires p~0.91, which yields a 14-21% perfect rate.
   *
   * One life leaves the 20-0 rate untouched — a perfect run never spends it —
   * while lengthening the session. Measured at SCALE 1.95, N=4000:
   *
   *                        LIVES=0            LIVES=1
   *   well-built      2.9% perfect, med wk 5   2.9% perfect, med wk 13
   *   optimal + chem  8.7% perfect, med wk 7   8.7% perfect, med wk 18
   *
   * Identical perfect-season rates, very different session lengths. It also
   * matches the benchmark honestly: the GDD claims "the only way to beat 18-1 is
   * to lose zero games", but 19-1 is already a better record than 18-1. So a run
   * has two tiers — 19-1 clears the Patriots, 20-0 is perfect.
   *
   * Set to 0 for pure sudden death; nothing else needs to change. That is the
   * tenser game and closer to the GDD's own §9 median-exit intent (week 7-9);
   * LIVES=1 trades that for sessions people finish.
   */
  LIVES: 1,
};

const CHEMISTRY = {
  VALUES: {
    battery: 0.10,
    teammates: 0.05,
    franchise: 0.03,
    family: 0.03,
    college: 0.02,
    draft_class: 0.02,
    system: 0.02,
    rivalry: -0.03,
    target_conflict: -0.04,
  },
  /*
   * Positive links saturate smoothly toward MAX instead of being summed and
   * clamped:
   *
   *      effective = MAX * (1 - exp(-raw / MAX))
   *
   * The GDD used "links 1-3 at full value, 4+ at half, then clamp to +15%", and
   * credited the half-value rule with preventing franchise-stacking. It cannot:
   * one battery link is 10% and two teammate links are 10% more, so THREE
   * players from a single team-season already exceed the ceiling and the clamp
   * binds before the half-value rule ever applies. Slots 4-6 then carry no
   * chemistry incentive whatsoever — the opposite of the stated intent that
   * chemistry "should tempt you into a cheaper signing".
   *
   * Saturation fixes it without an arbitrary link-count cutoff: each additional
   * link always adds something, always less than the one before, and the total
   * approaches +15% without reaching it. Small rosters are barely affected (a
   * lone 2% college link still scores ~1.9%), while a full six-man stack lands
   * ~14.3% — worth chasing, never free.
   */
  MIN: -0.10,
  MAX: 0.15,
  /* "Same era" was undefined in the GDD; fixed as within this many seasons. */
  TARGET_CONFLICT_ERA_YEARS: 3,
  TARGET_CONFLICT_PERCENTILE: 0.95,
  /*
   * The GDD calls target conflict "the least defensible rule in §6" and flags it
   * for possible removal. It is also conceptually odd here: two WRs from
   * different team-seasons never actually competed for targets. Off by default;
   * flip to true to evaluate it.
   */
  TARGET_CONFLICT_ENABLED: false,
};

const SLOTS = ['QB', 'RB', 'WR', 'WR', 'TE', 'FLEX'];
const SLOT_ELIGIBILITY = {
  QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], FLEX: ['RB', 'WR', 'TE'],
};

// ─── randomness ──────────────────────────────────────────────────────────────

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  return Math.abs(h);
}

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

/** Standard normal via Box-Muller. */
function normal(rng) {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** Gamma(shape) — Marsaglia-Tsang. */
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

/**
 * Gamma sample matched to (mean, sd). Right-skewed and non-negative, which is
 * why the GDD chose it over a normal — scoring cannot go below zero.
 *
 * The GDD also said "floored at 0", which is redundant for a Gamma and hints a
 * normal was once intended. Degenerate inputs are handled explicitly here
 * instead: sd <= 0 returns the mean, and mean <= 0 returns 0, because the
 * shape/scale fit divides by the mean.
 */
function sampleGamma(mean, sd, rng) {
  if (!(mean > 0)) return 0;
  if (!(sd > 0)) return mean;
  const shape = (mean / sd) ** 2;
  const scale = (sd * sd) / mean;
  return gammaShape(shape, rng) * scale;
}

// ─── chemistry ───────────────────────────────────────────────────────────────

const key = (p) => `${p.player_id}|${p.season}`;

/**
 * Every link that exists for one pair, strongest first. Only the strongest is
 * ever used (the GDD's "no stacking within a pair").
 */
function pairLinks(a, b, ctx) {
  const out = [];
  const V = CHEMISTRY.VALUES;

  // Battery — precomputed, and directional (QB -> receiver).
  const bat = ctx.battery || {};
  for (const [qb, rec] of [[a, b], [b, a]]) {
    const list = bat[key(qb)];
    if (list) {
      const hit = list.find((l) => l.receiver === key(rec));
      if (hit) out.push({ type: 'battery', value: V.battery, label: hit.label });
    }
  }

  if (a.team_season_id && a.team_season_id === b.team_season_id) {
    out.push({
      type: 'teammates', value: V.teammates,
      label: `${a.team_display} teammates`,
    });
  } else if (a.franchise && a.franchise === b.franchise) {
    out.push({
      type: 'franchise', value: V.franchise,
      label: `Both wore ${a.franchise} colours`,
    });
  }

  const fam = (ctx.curated?.family || []).find(
    (f) => (f.a === a.name && f.b === b.name) || (f.a === b.name && f.b === a.name),
  );
  if (fam) out.push({ type: 'family', value: V.family, label: fam.label });

  if (a.college && b.college && a.college === b.college) {
    out.push({ type: 'college', value: V.college, label: `${a.college} alumni` });
  }
  if (a.draft_year && a.draft_year === b.draft_year) {
    out.push({ type: 'draft_class', value: V.draft_class, label: `${a.draft_year} draft class` });
  }

  const coaches = ctx.coaches || {};
  const ca = coaches[a.team_season_id]?.hc;
  const cb = coaches[b.team_season_id]?.hc;
  if (ca && cb && ca === cb) {
    out.push({ type: 'system', value: V.system, label: `Both played for ${ca}` });
  }

  // Rivalry — opposing sides of a documented, mutual franchise rivalry.
  const riv = (ctx.curated?.rivalry || []).find(
    (r) => (r.a === a.franchise && r.b === b.franchise) || (r.a === b.franchise && r.b === a.franchise),
  );
  if (riv) out.push({ type: 'rivalry', value: V.rivalry, label: `${riv.label} rivalry` });

  if (CHEMISTRY.TARGET_CONFLICT_ENABLED
      && a.position === 'WR' && b.position === 'WR'
      && a.position_percentile >= CHEMISTRY.TARGET_CONFLICT_PERCENTILE
      && b.position_percentile >= CHEMISTRY.TARGET_CONFLICT_PERCENTILE
      && Math.abs(a.season - b.season) <= CHEMISTRY.TARGET_CONFLICT_ERA_YEARS) {
    out.push({ type: 'target_conflict', value: V.target_conflict, label: 'Two alpha receivers' });
  }

  out.sort((x, y) => y.value - x.value);
  return out;
}

/**
 * Resolve a 6-man roster into a multiplier.
 *
 * Multiplies the squad score, never individual output, so it cannot cascade
 * through the sim.
 */
function resolveChemistry(roster, ctx) {
  const links = [];
  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      const best = pairLinks(roster[i], roster[j], ctx)[0];
      if (best) links.push({ ...best, a: roster[i].name, b: roster[j].name });
    }
  }
  const positives = links.filter((l) => l.value > 0).sort((a, b) => b.value - a.value);
  const negatives = links.filter((l) => l.value < 0);

  const raw = positives.reduce((s, l) => s + l.value, 0);
  const saturated = CHEMISTRY.MAX * (1 - Math.exp(-raw / CHEMISTRY.MAX));
  // Penalties never diminish and are applied after saturation, so a negative
  // always costs its full face value.
  const penalties = negatives.reduce((s, l) => s + l.value, 0);
  const net = Math.max(CHEMISTRY.MIN, Math.min(CHEMISTRY.MAX, saturated + penalties));

  return {
    multiplier: 1 + net,
    raw,
    saturated,
    net,
    links: positives.concat(negatives),
  };
}

// ─── schedule ────────────────────────────────────────────────────────────────

const CONFERENCES = ['AFC', 'NFC'];
const DIVISION_NAMES = ['East', 'North', 'South', 'West'];

function buildDivisionMap(teamSeasons) {
  const map = {};
  for (const t of teamSeasons) (map[t.division] ??= new Set()).add(t.franchise);
  const out = {};
  for (const [d, s] of Object.entries(map)) out[d] = [...s].sort();
  return out;
}

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

/**
 * Opponent franchises for one 17-game season, per the real NFL formula.
 *
 * The GDD's formula includes "2 same-place finishers in your conference's other
 * two divisions". There are no standings in this game — opponents are random
 * historical team-seasons and no league is simulated — so that rule has no
 * referent. Replaced with a random team from each of those two divisions, which
 * preserves the shape (one game against each) without inventing a table.
 */
function opponentFranchises(franchise, divisions, rng) {
  const myDiv = Object.keys(divisions).find((d) => divisions[d].includes(franchise));
  const [myConf] = myDiv.split(' ');
  const otherConf = CONFERENCES.find((c) => c !== myConf);

  const out = [];
  for (const rival of divisions[myDiv].filter((f) => f !== franchise)) out.push(rival, rival);

  const intraDivs = DIVISION_NAMES.map((d) => `${myConf} ${d}`).filter((d) => d !== myDiv);
  const intra = pick(intraDivs, rng);
  out.push(...divisions[intra]);

  const interDivs = DIVISION_NAMES.map((d) => `${otherConf} ${d}`);
  const inter = pick(interDivs, rng);
  out.push(...divisions[inter]);

  for (const d of intraDivs.filter((d) => d !== intra)) out.push(pick(divisions[d], rng));

  const seventeenth = pick(interDivs.filter((d) => d !== inter), rng);
  out.push(pick(divisions[seventeenth], rng));

  return out;
}

/**
 * Attach a random season to each opponent franchise, then normalize.
 *
 * Franchise choice must never be a difficulty lever, so a schedule is rejected
 * unless its total opponent strength sits within TOLERANCE of the league-wide
 * mean and it contains no more than MAX_ELITE very strong opponents.
 *
 * Houston has 24 drawable seasons rather than 27; that is handled implicitly by
 * drawing from whatever seasons exist for the franchise.
 */
function generateSchedule(franchise, data, rng, opts = {}) {
  const tolerance = opts.tolerance ?? 0.05;
  const maxElite = opts.maxElite ?? 4;
  const maxAttempts = opts.maxAttempts ?? 400;

  const { divisions, byFranchise, eliteThreshold, meanScheduleStrength } = data;

  let best = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const franchises = opponentFranchises(franchise, divisions, rng);
    const games = franchises.map((f) => {
      const pool = byFranchise[f];
      return pool[Math.floor(rng() * pool.length)];
    });
    const total = games.reduce((s, g) => s + g.strength_z, 0);
    const elite = games.filter((g) => g.strength_z >= eliteThreshold).length;
    const drift = Math.abs(total - meanScheduleStrength);
    const ok = drift <= Math.abs(meanScheduleStrength * tolerance) + tolerance * 17 && elite <= maxElite;
    if (ok) return { games, total, elite, attempts: attempt + 1 };
    if (!best || drift < best.drift) best = { games, total, elite, drift, attempts: attempt + 1 };
  }
  // Deterministic fallback: never fail to produce a season.
  return { games: best.games, total: best.total, elite: best.elite, attempts: maxAttempts, relaxed: true };
}

/** Playoff opponents, weighted toward the strongest quartile. */
function generatePlayoffs(data, rng, count = CONSTANTS.PLAYOFF_GAMES) {
  const pool = data.topQuartile;
  const out = [];
  const used = new Set();
  while (out.length < count) {
    const g = pool[Math.floor(rng() * pool.length)];
    if (used.has(g.team_season_id)) continue;
    used.add(g.team_season_id);
    out.push(g);
  }
  return out;
}

// ─── per-game resolution ─────────────────────────────────────────────────────

/**
 * One game. Returns both scores and the winner.
 *
 * The GDD's defense modifier was league_avg / opponent_allowed, which is
 * inverted: against the 2000 Ravens (10.3 allowed, league ~21) that multiplies
 * your score by ~2.0, so the best defense in modern history would be the easiest
 * matchup. It is opponent_allowed / league_avg here, so a stingy defense
 * suppresses you and a leaky one inflates you.
 *
 * league_avg_pts_allowed is per season, not one global number, because league
 * scoring drifts (20.8 in 1999 to 23.0 in 2025) and a single constant would
 * systematically mis-rate one era against the other.
 */
function resolveGame(roster, chemistryMultiplier, opponent, leagueAvgAllowed, rng, constants = CONSTANTS) {
  let raw = 0;
  for (const p of roster) raw += sampleGamma(p.ppr_ppg_mean, p.ppr_ppg_sd, rng);

  const defenseModifier = opponent.pts_allowed_mean / leagueAvgAllowed;
  const yourScore = raw * chemistryMultiplier * defenseModifier;

  const oppScore = sampleGamma(opponent.pts_scored_mean, opponent.pts_scored_sd, rng) * constants.SCALE;

  let won;
  if (yourScore > oppScore) won = true;
  else if (yourScore < oppScore) won = false;
  else won = rng() < 0.5;   // overtime coin flip

  return { won, yourScore, oppScore, defenseModifier };
}

/**
 * Play a full run: 17 regular-season games then 3 playoff games, stopping when
 * losses exceed CONSTANTS.LIVES.
 */
function playRun(roster, chemistryMultiplier, schedule, playoffs, leagueContext, rng, constants = CONSTANTS) {
  const games = schedule.concat(playoffs);
  const results = [];
  let wins = 0, losses = 0;
  for (let i = 0; i < games.length; i++) {
    const opp = games[i];
    const leagueAvg = leagueContext[opp.season] ?? 21.5;
    const r = resolveGame(roster, chemistryMultiplier, opp, leagueAvg, rng, constants);
    results.push({
      week: i + 1,
      opponent: opp.display,
      opponent_id: opp.team_season_id,
      playoff: i >= schedule.length,
      ...r,
    });
    if (r.won) wins++; else losses++;
    if (losses > constants.LIVES) break;
  }
  const complete = results.length === games.length;
  return {
    results,
    wins,
    losses,
    weekReached: results.length,
    complete,
    perfect: complete && losses === 0,
    beatBenchmark: complete && losses <= 1,   // 19-1 or better clears 18-1
  };
}

// ─── data prep ───────────────────────────────────────────────────────────────

/** Precompute the derived structures the schedule generator needs. */
function prepareData(teamSeasons) {
  const divisions = buildDivisionMap(teamSeasons);
  const byFranchise = {};
  for (const t of teamSeasons) (byFranchise[t.franchise] ??= []).push(t);

  const zs = teamSeasons.map((t) => t.strength_z).sort((a, b) => a - b);
  const q = (p) => zs[Math.min(zs.length - 1, Math.max(0, Math.round(p * (zs.length - 1))))];
  const eliteThreshold = q(0.90);
  const topQuartile = teamSeasons.filter((t) => t.strength_z >= q(0.75));

  // A schedule of 17 average opponents sums to ~17 * mean(z) ~ 0.
  const meanZ = zs.reduce((a, b) => a + b, 0) / zs.length;
  return {
    divisions, byFranchise, eliteThreshold, topQuartile,
    meanScheduleStrength: meanZ * 17,
  };
}

const publicAPI = {
  CONSTANTS, CHEMISTRY, SLOTS, SLOT_ELIGIBILITY,
  hashSeed, createSeededRNG, sampleGamma,
  pairLinks, resolveChemistry,
  buildDivisionMap, opponentFranchises, generateSchedule, generatePlayoffs,
  resolveGame, playRun, prepareData,
};

if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
if (typeof window !== 'undefined') window.PS_ENGINE = publicAPI;
