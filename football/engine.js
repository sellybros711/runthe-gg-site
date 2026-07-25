/* The Perfect Season, game engine.
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
   * Solved with `node football/simulator.js --sweep`, N=3000 runs/archetype.
   * Measured on the regular season only, so the numbers stay comparable to the
   * GDD's §9 table (playoff opponents are drawn from the top strength quartile
   * and would drag the average down for exactly the rosters that reach them).
   *
   *   archetype            win%    §9 target      record    title   20-0
   *   random affordable   59.2%   0.62-0.68 low  10.1-6.9    1.9%   0.1%
   *   decent, $75M used   77.2%   0.76-0.80 ok   13.1-3.9    8.8%   0.2%
   *   well-built          86.4%   0.83-0.86 ok   14.7-2.3   29.0%   2.9%
   *   optimal + chemistry 90.5%   0.88-0.90 ok   15.4-1.6   45.0%   7.7%
   *
   * The reachable spread is slightly wider than §9 assumed, so the bottom rung
   * lands ~3 points low while the top two sit at the upper edge of their bands.
   * No single value of SCALE fixes that; it would take narrowing the score
   * variance. 1.95 is chosen because it puts the perfect-season rate squarely in
   * the 3-6% §9 asked for, which is the target that actually matters.
   *
   * Re-solve this before trusting any change to pricing, the cap, or the
   * chemistry curve. All three move these numbers.
   */
  SCALE: 1.95,
  CAP_MUSD: 100,
  RESPIN_COST_MUSD: 15,
  MAX_RESPINS: 2,
  MIN_RESERVE_PER_SLOT_MUSD: 3,
  REGULAR_SEASON_GAMES: 17,

  /*
   * You always play all 17 regular-season games. An earlier build ended the run
   * on your second loss, which meant most players never saw a final record and
   * never reached the playoffs at all. Going undefeated is still the goal, but a
   * season you finish gives you a number to compare and a reason to keep going
   * after one bad week.
   *
   * Where you finish decides what happens next, on wins alone. No tiebreakers,
   * no standings to read:
   *
   *   15 wins or more   top seed, first round off, 3 games to the title
   *   12 to 14 wins     wild card, 4 games to the title
   *   11 wins or fewer  season over
   *
   * In the playoffs one loss ends it, the way real football works. So a perfect
   * run is 17-0 plus 3 wins, which is 20-0.
   *
   * The thresholds are set from the measured win distribution (`--record`), not
   * from NFL precedent. Every player in the pool is an all-time season, so win
   * totals run high: at the realistic 10-win cutoff even a random roster reached
   * the playoffs 59% of the time and a good one got the bye 94% of the time,
   * which made both tiers meaningless. At 12 and 15 the ladder actually
   * separates: a random roster makes the playoffs 32% of the time and a
   * cap-optimal one earns the bye 78% of the time. Both are still records a real
   * team would post.
   */
  BYE_SEED_WINS: 15,
  PLAYOFF_WINS: 12,
  PLAYOFF_ROUNDS_WITH_BYE: 3,
  PLAYOFF_ROUNDS_WILD_CARD: 4,
};

/** Round names, counting back from the final. */
const PLAYOFF_ROUND_NAMES = ['Wild Card', 'Divisional', 'Conference Championship', 'Super Bowl'];

/** Where a regular-season record leaves you. Wins only, deliberately. */
function seedFromRecord(wins) {
  if (wins >= CONSTANTS.BYE_SEED_WINS) {
    return { made: true, bye: true, rounds: CONSTANTS.PLAYOFF_ROUNDS_WITH_BYE, label: 'Top seed' };
  }
  if (wins >= CONSTANTS.PLAYOFF_WINS) {
    return { made: true, bye: false, rounds: CONSTANTS.PLAYOFF_ROUNDS_WILD_CARD, label: 'Wild card' };
  }
  return { made: false, bye: false, rounds: 0, label: 'Missed the playoffs' };
}

/** Names for a playoff run of `rounds` games, ending at the Super Bowl. */
function playoffRoundNames(rounds) {
  return PLAYOFF_ROUND_NAMES.slice(PLAYOFF_ROUND_NAMES.length - rounds);
}

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
   * chemistry incentive whatsoever, the opposite of the stated intent that
   * chemistry "should tempt you into a cheaper signing".
   *
   * Saturation fixes it without an arbitrary link-count cutoff: each additional
   * link always adds something, always less than the one before, and the total
   * approaches +15% without reaching it. Small rosters are barely affected (a
   * lone 2% college link still scores ~1.9%), while a full six-man stack lands
   * ~14.3%, worth chasing, never free.
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

/*
 * Team nicknames, so a chemistry line can say "Both played for the Lions" instead
 * of naming a three-letter code. A franchise link joins two different seasons, so
 * neither player's own era-correct team name is right for the pair; the nickname
 * is the part that never changed.
 */
const NICKNAMES = {
  ARI: 'Cardinals', ATL: 'Falcons', BAL: 'Ravens', BUF: 'Bills', CAR: 'Panthers',
  CHI: 'Bears', CIN: 'Bengals', CLE: 'Browns', DAL: 'Cowboys', DEN: 'Broncos',
  DET: 'Lions', GB: 'Packers', HOU: 'Texans', IND: 'Colts', JAX: 'Jaguars',
  KC: 'Chiefs', LAC: 'Chargers', LAR: 'Rams', LV: 'Raiders', MIA: 'Dolphins',
  MIN: 'Vikings', NE: 'Patriots', NO: 'Saints', NYG: 'Giants', NYJ: 'Jets',
  PHI: 'Eagles', PIT: 'Steelers', SEA: 'Seahawks', SF: '49ers', TB: 'Buccaneers',
  TEN: 'Titans', WAS: 'Commanders',
};
const nickname = (id) => NICKNAMES[id] || id;

/*
 * How strong a link feels, used to color and weight the lines drawn between
 * players. Four bands rather than a continuous scale, because the whole point is
 * that you can tell them apart at a glance.
 */
const LINK_TIERS = [
  { min: 0.08, key: 'big', label: 'Big' },
  { min: 0.04, key: 'good', label: 'Good' },
  { min: 0.001, key: 'small', label: 'Small' },
  { min: -Infinity, key: 'bad', label: 'Hurts' },
];
const linkTier = (value) => LINK_TIERS.find((t) => value >= t.min).key;

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

/** Gamma(shape), Marsaglia-Tsang. */
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
 * why the GDD chose it over a normal, scoring cannot go below zero.
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

  // Battery, precomputed, and directional (QB -> receiver).
  const bat = ctx.battery || {};
  for (const [qb, rec] of [[a, b], [b, a]]) {
    const list = bat[key(qb)];
    if (list) {
      const hit = list.find((l) => l.receiver === key(rec));
      if (hit) out.push({ type: 'battery', value: V.battery, label: hit.label, short: 'Threw to him' });
    }
  }

  /*
   * Labels are written to be read once and understood, so each one names the
   * thing the two players actually share. An earlier version said "Both wore SF
   * [team code] colors", which named a three letter code, used a British
   * spelling, and told you nothing about what the two players shared.
   * `short` is the two or three word version for tight spaces in the draft list.
   */
  if (a.team_season_id && a.team_season_id === b.team_season_id) {
    out.push({
      type: 'teammates', value: V.teammates,
      label: `Teammates on the ${a.season} ${nickname(a.franchise)}`,
      short: 'Teammates',
    });
  } else if (a.franchise && a.franchise === b.franchise) {
    out.push({
      type: 'franchise', value: V.franchise,
      label: `Both played for the ${nickname(a.franchise)}`,
      short: `Both ${nickname(a.franchise)}`,
    });
  }

  const fam = (ctx.curated?.family || []).find(
    (f) => (f.a === a.name && f.b === b.name) || (f.a === b.name && f.b === a.name),
  );
  if (fam) {
    out.push({
      type: 'family', value: V.family,
      label: fam.kind === 'brothers' ? 'Brothers' : fam.label,
      short: 'Family',
    });
  }

  if (a.college && b.college && a.college === b.college) {
    out.push({
      type: 'college', value: V.college,
      label: `Both went to ${a.college}`,
      short: a.college,
    });
  }
  if (a.draft_year && a.draft_year === b.draft_year) {
    out.push({
      type: 'draft_class', value: V.draft_class,
      label: `Both drafted in ${a.draft_year}`,
      short: `${a.draft_year} draft`,
    });
  }

  const coaches = ctx.coaches || {};
  const ca = coaches[a.team_season_id]?.hc;
  const cb = coaches[b.team_season_id]?.hc;
  if (ca && cb && ca === cb) {
    out.push({
      type: 'system', value: V.system,
      label: `Both coached by ${ca}`,
      short: ca.split(' ').slice(-1)[0] + ' coached both',
    });
  }

  // Rivalry, opposing sides of a documented, mutual franchise rivalry.
  const riv = (ctx.curated?.rivalry || []).find(
    (r) => (r.a === a.franchise && r.b === b.franchise) || (r.a === b.franchise && r.b === a.franchise),
  );
  if (riv) {
    out.push({
      type: 'rivalry', value: V.rivalry,
      label: `Old rivals: ${nickname(riv.a)} and ${nickname(riv.b)}`,
      short: 'Rivals',
    });
  }

  if (CHEMISTRY.TARGET_CONFLICT_ENABLED
      && a.position === 'WR' && b.position === 'WR'
      && a.position_percentile >= CHEMISTRY.TARGET_CONFLICT_PERCENTILE
      && b.position_percentile >= CHEMISTRY.TARGET_CONFLICT_PERCENTILE
      && Math.abs(a.season - b.season) <= CHEMISTRY.TARGET_CONFLICT_ERA_YEARS) {
    out.push({ type: 'target_conflict', value: V.target_conflict,
      label: 'Two number one receivers competing for the ball', short: 'Both want the ball' });
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
 * two divisions". There are no standings in this game, opponents are random
 * historical team-seasons and no league is simulated, so that rule has no
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
 * Put the 17 opponents into a week order that looks like a real season.
 *
 * The formula produces division rivals as adjacent pairs, which used to land them
 * in weeks 1 through 6: three teams, home and away, back to back, then nothing but
 * strangers for eleven weeks. Real schedules spread the six division games out and
 * usually save one or two for the end.
 *
 * Shuffle, then require the two meetings with any repeated opponent to sit at
 * least MIN_REMATCH_GAP weeks apart, and require at least one division game in the
 * closing stretch. Falls back to the least bad ordering if the constraints cannot
 * be met, so a schedule is always produced.
 */
const MIN_REMATCH_GAP = 4;

function orderSchedule(games, rng) {
  const n = games.length;
  const spacing = (arr) => {
    const seen = new Map();
    let worst = Infinity;
    arr.forEach((g, i) => {
      if (seen.has(g.team_season_id)) worst = Math.min(worst, i - seen.get(g.team_season_id));
      seen.set(g.team_season_id, i);
    });
    return worst;
  };
  // Repeated opponents are exactly the division rivals.
  const counts = {};
  for (const g of games) counts[g.team_season_id] = (counts[g.team_season_id] || 0) + 1;
  const isDivision = (g) => counts[g.team_season_id] > 1;

  let best = null;
  for (let attempt = 0; attempt < 200; attempt++) {
    const a = games.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    const gap = spacing(a);
    const lateDivision = a.slice(n - 4).some(isDivision);
    const earlyDivisionCount = a.slice(0, 4).filter(isDivision).length;
    const ok = gap >= MIN_REMATCH_GAP && lateDivision && earlyDivisionCount <= 2;
    if (ok) return a;
    const score = Math.min(gap, MIN_REMATCH_GAP) + (lateDivision ? 1 : 0) - earlyDivisionCount * 0.1;
    if (!best || score > best.score) best = { a, score };
  }
  return best.a;
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
    /*
     * One season per franchise, reused for both meetings. A division rival is on
     * the schedule twice (home and away) and you face the SAME team-season both
     * times, you get a home and away game against the 2007 Patriots, not the
     * 2007 and 2001 Patriots. Memoizing by franchise also makes any other
     * repeat consistent for free.
     *
     * Consequence for normalization: a rival's strength counts twice, which is
     * correct, a brutal division rival really is two hard games.
     */
    const drawn = new Map();
    const unordered = franchises.map((f) => {
      if (!drawn.has(f)) {
        const pool = byFranchise[f];
        drawn.set(f, pool[Math.floor(rng() * pool.length)]);
      }
      return drawn.get(f);
    });
    const games = orderSchedule(unordered, rng);
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
function generatePlayoffs(data, rng, count = CONSTANTS.PLAYOFF_ROUNDS_WILD_CARD) {
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

// ─── display scores ──────────────────────────────────────────────────────────

/** Fractional percentile of `v` within an ascending quantile table. */
function percentileIn(table, v) {
  let lo = 0, hi = table.length - 1;
  if (v <= table[0]) return 0;
  if (v >= table[hi]) return 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid] <= v) lo = mid; else hi = mid;
  }
  const span = table[hi] - table[lo];
  const frac = span > 0 ? (v - table[lo]) / span : 0;
  return (lo + frac) / (table.length - 1);
}

/** Value at fractional percentile `p` in an ascending quantile table. */
function valueAt(table, p) {
  const x = Math.min(1, Math.max(0, p)) * (table.length - 1);
  const i = Math.floor(x);
  const j = Math.min(table.length - 1, i + 1);
  return table[i] + (table[j] - table[i]) * (x - i);
}

/**
 * Turn an internal fantasy-space result into a football-looking scoreline.
 *
 * The sim decides the winner; this only decides how the game is *reported*. It
 * maps the internal margin onto the real distribution of NFL margins (1999-2025,
 * 6,967 games), draws a real total conditioned on that margin, and splits it.
 * The winner is always preserved exactly.
 *
 * Deliberately not a divisor: your internal mean (~73) sits far above an
 * opponent's (~43) because that gap is what carries win probability, so scaling
 * both sides down renders every week as a blowout.
 */
function toFootballScore(yourScore, oppScore, won, rng, cal) {
  const internalMargin = Math.abs(yourScore - oppScore);
  const pct = percentileIn(cal.internal_margin_q, internalMargin);
  let margin = Math.round(valueAt(cal.real_margin_q, pct));
  // The winner is already decided, so a reported tie would contradict the result.
  if (margin < 1) margin = 1;

  const buckets = cal.margin_buckets;
  let bi = 0;
  for (let i = 0; i < buckets.length - 1; i++) {
    if (margin >= buckets[i] && margin < buckets[i + 1]) { bi = i; break; }
    if (i === buckets.length - 2) bi = i;
  }
  let total = Math.round(valueAt(cal.totals_by_bucket_q[bi], rng()));

  // Total and margin must have the same parity to split into whole scores.
  if ((total - margin) % 2 !== 0) total += 1;
  let high = (total + margin) / 2;
  let low = high - margin;
  if (low < 0) { low = 0; high = margin; }
  // 1 is the one unreachable score in football.
  if (low === 1) low = 2;
  if (high === 1) high = 2;

  return won ? { you: high, them: low } : { you: low, them: high };
}

/**
 * Play a whole run: all 17 regular-season games, then the playoffs if the record
 * earned them. One playoff loss ends the run.
 */
function playRun(roster, chemistryMultiplier, schedule, playoffs, leagueContext, rng, constants = CONSTANTS) {
  const results = [];
  let wins = 0, losses = 0;

  const play = (opp, meta) => {
    const leagueAvg = leagueContext[opp.season] ?? 21.5;
    const r = resolveGame(roster, chemistryMultiplier, opp, leagueAvg, rng, constants);
    results.push({ opponent: opp.display, opponent_id: opp.team_season_id, ...meta, ...r });
    if (r.won) wins++; else losses++;
    return r.won;
  };

  for (let i = 0; i < schedule.length; i++) {
    play(schedule[i], { week: i + 1, playoff: false, round: null });
  }

  const regularWins = wins;
  const regularLosses = losses;
  const seed = seedFromRecord(regularWins);

  let titleWon = false;
  let exitRound = null;
  if (seed.made) {
    const names = playoffRoundNames(seed.rounds);
    for (let i = 0; i < seed.rounds; i++) {
      const opp = playoffs[i % playoffs.length];
      const won = play(opp, { week: schedule.length + i + 1, playoff: true, round: names[i] });
      if (!won) { exitRound = names[i]; break; }
      if (i === seed.rounds - 1) titleWon = true;
    }
  }

  return {
    results,
    wins,
    losses,
    regularWins,
    regularLosses,
    regularRecord: `${regularWins}-${regularLosses}`,
    record: `${wins}-${losses}`,
    seed,
    titleWon,
    exitRound,
    perfect: losses === 0 && titleWon,
    undefeatedRegular: regularLosses === 0,
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
  resolveGame, playRun, prepareData, toFootballScore,
  seedFromRecord, playoffRoundNames, PLAYOFF_ROUND_NAMES,
  NICKNAMES, nickname, LINK_TIERS, linkTier,
};

if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
if (typeof window !== 'undefined') window.PS_ENGINE = publicAPI;
