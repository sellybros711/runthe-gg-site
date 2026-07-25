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
   * Solved against REAL PLAY POLICIES through the actual wheel
   * (`node football/simulator.js --policies`), not against synthetic rosters.
   *
   * That distinction is the whole reason this needed re-solving. The archetypes in
   * §9 build rosters out of the entire 9,411-player pool, which stopped describing
   * the game once a spin started offering a whole team to choose from. Measured
   * properly, somebody tapping the top row of a best-first sorted list was winning
   * 13 games having made no decisions at all.
   *
   * At 1.90, over 40 runs per policy:
   *
   *   policy                spend  FPPG  record  playoffs  title   20-0
   *   cheapest every time    $40M    21    2-15        0%     0%    0%
   *   best points per dollar $59M    44     9-8       15%     0%    0%
   *   random tap             $76M    49    10-7       28%     2%  0.1%
   *   taps the top row      $100M    57    12-5       50%     4%  0.2%
   *   perfect play (DP)      $99M    68    14-3       93%    18%  1.1%
   *
   * So careless play now finishes 12-5 with a coin-flip at the playoffs, while
   * perfect play wins 14 and takes the title about one run in five. Two wins and
   * forty points of playoff odds separate them, which is the room skill needs.
   *
   * This deliberately does NOT hit §9's 3-6% perfect-season target. The owner
   * played it and found it too easy, and 20-0 reads better as near-mythical with
   * the title as the reachable goal. Lowering SCALE to 1.70 would restore a 3.5%
   * perfect rate but also hand careless play a 66% playoff rate, which is the
   * problem this was fixing.
   *
   * Re-solve before trusting any change to pricing, the cap, chemistry, or the
   * structure model. All four move these numbers.
   */
  SCALE: 1.90,
  CAP_MUSD: 100,
  /*
   * Re-spins are two separate levers now, one per wheel, and they get dearer as
   * you lean on them: $5M, then $10M, then $15M, whichever wheel you spin.
   *
   * It used to be one flat $15M for the whole team-season, twice. At that price
   * the first re-spin already cost a tier of player, so nobody touched it and the
   * ladder never came into play. Starting at $5M makes the first one an easy call
   * and the third one something you have to want, and the ceiling is unchanged at
   * $30M if you take all three.
   */
  RESPIN_LADDER_MUSD: [5, 10, 15],
  MAX_RESPINS: 3,
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

/**
 * What the NEXT re-spin costs, given how many have already been used.
 *
 * Priced by how many you have taken, not by which wheel you spin, so the choice
 * of wheel stays about what you want to change rather than what is cheaper.
 */
function respinCost(used) {
  const L = CONSTANTS.RESPIN_LADDER_MUSD;
  return L[Math.min(used, L.length - 1)];
}

/** Everything `used` re-spins have taken out of the cap so far. */
function respinFees(used) {
  let total = 0;
  for (let i = 0; i < used; i++) total += respinCost(i);
  return total;
}

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

/*
 * ROSTER STRUCTURE
 *
 * Summing six fantasy totals is not a football team. It made elite receivers with
 * a broken quarterback score exactly as well as a balanced offense, so the shape
 * of a roster was invisible and the only thing that mattered was raw points. That
 * is why a thoughtless draft could still win 13 games.
 *
 * Three things now shape the squad score, each measured from the real numbers
 * rather than invented:
 *
 *   1. Quarterback support. Catching points depend on somebody throwing. The
 *      median starting quarterback in this pool throws for 11.9 points a game, so
 *      that is the reference; a weak arm discounts the whole receiving corps and a
 *      great one lifts it. This is the big one, and it means letting the
 *      quarterback slide until the money is gone has a real cost.
 *   2. Balance. Measured across 27 seasons, a real league earns 25% of its
 *      non-passing fantasy points on the ground. A roster far from that is
 *      one-dimensional and easier to defend.
 *   3. Concentration. Leaning on one man is fragile, because defenses key on him.
 *
 * All three multiply the squad score, never individual output, so they cannot
 * cascade through the sim.
 */
const STRUCTURE = {
  QB_BASELINE_PASS_PPG: 11.9,   // median starting QB, measured
  QB_SUPPORT_FLOOR: 0.72,
  QB_SUPPORT_CEIL: 1.15,
  IDEAL_RUSH_SHARE: 0.25,       // measured league average
  RUSH_SHARE_TOLERANCE: 0.12,
  BALANCE_WEIGHT: 0.9,
  IDEAL_TOP_SHARE: 0.28,
  CONCENTRATION_WEIGHT: 0.55,
  MIN: 0.65,
  MAX: 1.15,
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Read a roster's shape. Returns the multiplier plus the parts that produced it,
 * so the coach breakdown can explain itself instead of showing a bare number.
 */
function rosterStructure(roster) {
  const S = STRUCTURE;
  const sum = (f) => roster.reduce((t, p) => t + (f(p) || 0), 0);
  const total = sum((p) => p.ppr_ppg_mean);
  if (!total) {
    return { multiplier: 1, qbSupport: 1, balance: 1, concentration: 1, rushShare: 0, topShare: 0, qbPass: 0 };
  }

  const qb = roster.find((p) => p.position === 'QB');
  const qbPass = qb ? (qb.pass_ppg || 0) : 0;
  const qbSupport = clamp(
    0.55 + 0.45 * (qbPass / S.QB_BASELINE_PASS_PPG),
    S.QB_SUPPORT_FLOOR, S.QB_SUPPORT_CEIL,
  );

  const rush = sum((p) => p.rush_ppg);
  const rec = sum((p) => p.rec_ppg);
  const ground = rush + rec;
  const rushShare = ground > 0 ? rush / ground : 0;
  const balance = 1 - S.BALANCE_WEIGHT
    * Math.max(0, Math.abs(rushShare - S.IDEAL_RUSH_SHARE) - S.RUSH_SHARE_TOLERANCE);

  const topShare = Math.max(...roster.map((p) => p.ppr_ppg_mean)) / total;
  const concentration = 1 - S.CONCENTRATION_WEIGHT * Math.max(0, topShare - S.IDEAL_TOP_SHARE);

  // Quarterback support applies to catching points only, so it is folded in as a
  // change to the effective total rather than a flat multiplier.
  const effective = sum((p) => p.pass_ppg) + rush + rec * qbSupport;
  const multiplier = clamp((effective / total) * balance * concentration, S.MIN, S.MAX);

  return { multiplier, qbSupport, balance, concentration, rushShare, topShare, qbPass, total };
}

/**
 * A coach's read on the roster, in plain words.
 *
 * Every line is tied to a number the player can check on the same screen, so this
 * explains the structure multiplier rather than decorating it.
 */
function coachReport(roster, chemistryMultiplier, spend) {
  const st = rosterStructure(roster);
  const strengths = [];
  const weaknesses = [];
  const total = roster.reduce((t, p) => t + p.ppr_ppg_mean, 0);
  const star = roster.slice().sort((a, b) => b.ppr_ppg_mean - a.ppr_ppg_mean)[0];
  const qb = roster.find((p) => p.position === 'QB');
  const chem = (chemistryMultiplier - 1) * 100;
  const last = (n) => n.split(' ').slice(-1)[0];

  // Quarterback
  if (st.qbSupport >= 1.06) {
    strengths.push(`${qb ? last(qb.name) : 'Your quarterback'} throws well enough to lift everyone he targets.`);
  } else if (st.qbSupport <= 0.86) {
    weaknesses.push(`${qb ? last(qb.name) : 'Your quarterback'} cannot get the ball to these receivers. It holds the whole passing game back.`);
  } else if (st.qbSupport <= 0.95) {
    weaknesses.push('Your quarterback is ordinary, so your receivers will not see their best numbers.');
  }

  // Balance
  if (st.rushShare < 0.13) {
    weaknesses.push('There is no running game here. Teams can sit back and defend the pass all day.');
  } else if (st.rushShare > 0.45) {
    weaknesses.push('You run it too often to scare anybody deep.');
  } else {
    strengths.push('You can run it and throw it, so defenses have to respect both.');
  }

  // Concentration
  if (st.topShare >= 0.36) {
    weaknesses.push(`Everything runs through ${last(star.name)}. Take him away and this offense stops.`);
  } else if (st.topShare <= 0.26) {
    strengths.push('The scoring is spread around, so no single defender can take you apart.');
  }

  // Chemistry
  if (chem >= 8) strengths.push('These players know each other, and it shows.');
  else if (chem < 1) weaknesses.push('Six strangers. Nobody here has played a down together.');

  // Money
  const unspent = CONSTANTS.CAP_MUSD - spend;
  if (unspent >= 20) weaknesses.push(`You left $${unspent.toFixed(0)}M on the table. That was a better player you did not sign.`);
  else if (unspent <= 3) strengths.push('You used the whole budget.');

  // Boom or bust
  const swing = roster.reduce((t, p) => t + p.ppr_ppg_sd, 0) / Math.max(1, total);
  if (swing > 0.52) weaknesses.push('This group is streaky. Big weeks, and some very quiet ones.');
  else if (swing < 0.38) strengths.push('Steady week to week, which matters when one loss can end you.');

  let verdict;
  if (st.multiplier >= 1.03 && total >= 60) verdict = 'A real contender.';
  else if (st.multiplier >= 0.96 && total >= 50) verdict = 'Good enough to win a lot of games.';
  else if (total >= 40) verdict = 'Middle of the pack. It will need some luck.';
  else verdict = 'This is not a playoff team.';

  return { structure: st, strengths, weaknesses, verdict, totalFppg: total, swing };
}

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

  /*
   * Rivalry used to subtract 3% for players from opposing sides of a documented
   * rivalry. Cut: it punished you for something that is not a flaw in the roster,
   * two good players from rival teams are not worse at football together, and it
   * was the one link that made a signing feel arbitrarily bad. The curated list
   * stays in the data in case it is ever wanted for flavor text.
   */

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

  // Structure is read from the roster itself, so no caller can forget to apply it.
  const structure = rosterStructure(roster).multiplier;
  const defenseModifier = opponent.pts_allowed_mean / leagueAvgAllowed;
  const yourScore = raw * chemistryMultiplier * structure * defenseModifier;

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

/* Bumped alongside run.js. See the note there.
 * Name-spaced because engine.js and run.js are plain scripts sharing one global
 * scope in the browser: two top-level `const API_VERSION` declarations collide
 * and the second file fails to parse at all. Which is what happened, and the boot
 * check below reported it correctly. */
const ENGINE_API_VERSION = 8;

const publicAPI = {
  API_VERSION: ENGINE_API_VERSION,
  CONSTANTS, CHEMISTRY, SLOTS, SLOT_ELIGIBILITY,
  hashSeed, createSeededRNG, sampleGamma,
  pairLinks, resolveChemistry,
  buildDivisionMap, opponentFranchises, generateSchedule, generatePlayoffs,
  resolveGame, playRun, prepareData, toFootballScore,
  seedFromRecord, playoffRoundNames, PLAYOFF_ROUND_NAMES,
  respinCost, respinFees,
  NICKNAMES, nickname, LINK_TIERS, linkTier, rosterStructure, STRUCTURE, coachReport,
};

if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
if (typeof window !== 'undefined') window.PS_ENGINE = publicAPI;
