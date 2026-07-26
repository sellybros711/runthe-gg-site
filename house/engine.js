/* RunTheHouse, the relationship engine.
 *
 * Headless and dependency-free. Browser: window.RH_ENGINE. Node: require.
 * Nothing here touches the DOM, so simulator.js can run a thousand houses
 * before any UI exists. GDD §15 makes that a gate, not a preference.
 *
 * ── WHAT "BELIEF" MEANS HERE, because it is easy to get backwards ───────────
 *
 *   trust[i][j]   how much i likes j. i KNOWS this exactly. It is their own
 *                 feeling and nobody has to guess at their own feelings.
 *   belief[i][j]  i's estimate of trust[j][i], which is "how do THEY feel about
 *                 ME". This is the number nobody knows and the one the label
 *                 ladder renders. It goes stale, and it can be actively lied to.
 *
 * That asymmetry is the whole game. You always know who you like. You are
 * always guessing about who likes you.
 *
 * The AI run on the same structure. An AI misreads the house for the same
 * reason you do, because it has not spoken to someone in three weeks, and that
 * is what produces believable mistakes without a single line of special casing
 * (GDD §7.4).
 *
 * ── THE PILLAR, restated as a code rule ────────────────────────────────────
 *
 * Nothing in this file may hardcode an outcome the simulation is supposed to
 * produce. Percentages in the GDD are calibration targets for simulator.js, not
 * die rolls. If comp winners are not getting targeted, fix a weight; do not add
 * "if (compWins > 3) threat += 20".
 */

'use strict';

/* WRAPPED IN AN IIFE, and it is not optional.
 *
 * These are plain <script> tags, not modules, so every file shares one global
 * scope in the browser. Unwrapped, `const api` in seven files, `const E` in
 * comps.js and run.js, `const T` in generate.js and run.js and `const BY_ID` in
 * tree.js and comps.js all collide, and a colliding top-level const does not
 * warn: the whole file fails to parse and its global is simply never defined.
 * Measured symptom was six of seven modules missing and the page rendering
 * nothing. football/engine.js hit the same wall and name-spaced its way out;
 * a closure is the version that does not need policing as files grow.
 */
(function () {


// ─── tuning constants ────────────────────────────────────────────────────────

/*
 * Everything sweepable lives here. simulator.js reads these, perturbs them, and
 * reports the proxies from GDD §15. Do not scatter magic numbers into the
 * functions below; a number that cannot be swept cannot be tuned.
 */
const K = {
  /*
   * Trust deltas, before the soft clamp.
   *
   * MEASURED, and the reason these are half what version 0.1 of the design doc
   * proposed: with talk at 4 to 10 the house arrived at Final 5 with a MEDIAN
   * trust of 87.7 and twelve of twenty pairs sitting in "Ride or die". Everyone
   * loved everyone, the label ladder collapsed into its top band, and social
   * play stopped carrying any signal at all, which is why comp-heavy archetypes
   * were winning at four times the rate of Anchors and Recruiters. Saturation
   * at the top is exactly as fatal as saturation at the rails.
   *
   * Solved by sweep against the trust distribution at Final 5, jointly with
   * DECAY_PER_WEEK, because the two are one degree of freedom and tuning either
   * alone just moves the equilibrium off a cliff in one direction:
   *
   *   talk    decay   p50   p90   max   alliances by F5
   *   3-8     3.0       9    20    24     0     nobody trusts anybody
   *   5-12    3.0      12    35    41     0     still under the 55 threshold
   *   6-14    2.4      22    62    72     3
   *   8-16    2.2      30    71    77     4     <- here
   *   10-20   1.8      42    83    89    10     back toward saturation
   *
   * The target is a median in Warm, a top decile in Solid, and a handful of
   * pairs reaching Ride or die over fourteen weeks. Every band has to be in use
   * or the ladder is not carrying information.
   */
  D_TALK_MIN: 8, D_TALK_MAX: 16,
  D_ALLIANCE: 15,
  D_VETO_SAVE: 25,
  D_VOTED_KEEP: 12,
  D_VOTED_OUT: -30,
  D_NAMED_AT_RISK: -20,
  D_BROKEN_PROMISE: -35,
  D_CAUGHT_LIE: -25,
  D_LEAK_BURN: -18,

  /*
   * Soft clamp exponent. GDD §7.2. Raw deltas of 15 to 35 against a 200-wide
   * range pin the whole matrix to the rails inside four weeks and the label
   * ladder collapses to its end bands, which deletes the information the entire
   * UI is built on. Cost of a point rises as |trust| approaches 100.
   *
   * Solved DOWNWARD from 2.0 against the top-band target. At 2.0 the clamp only
   * starts resisting near the rails, which was far too late against a house
   * that holds a hundred conversations a week: Final 5 arrived with a median
   * trust of 87.7. At 1.35 the resistance starts biting from about 40 up, which
   * is where a relationship should start being hard to deepen.
   */
  CLAMP_EXP: 1.35,

  // decay, GDD §7.3: toward the pair baseline, keyed to weeks since contact
  DECAY_PER_WEEK: 2.2,
  DECAY_PARANOIA: 0.9,      // how much paranoia accelerates positive decay
  DECAY_GRUDGE: 0.55,       // paranoid players recover from negatives SLOWER
  DECAY_MAX_WEEKS: 5,       // neglect stops compounding past this

  // belief
  BELIEF_CONF_DECAY: 0.18,  // per week since last contact
  BELIEF_DISTORT_MAX: 45,   // how far a great liar can move your read of them
  BELIEF_CONF_FLOOR: 0.05,
  CONFESSIONAL_ACCURACY: 0.35,  // GDD §9: what logging a read is actually worth

  // detection, the ONE roll in the game
  DETECT_BASE: 0.45,
  DETECT_SPREAD: 0.0055,    // per point of (perception - deception)
  DETECT_TRUST_COVER: 0.0022, // per point of trust: people believe people they like
  DETECT_MIN: 0.05, DETECT_MAX: 0.92,

  // threat, GDD §8.1. All inputs normalised 0..100 before weighting.
  TH_COMP: 0.40, TH_SOCIAL: 0.30, TH_PANEL: 0.30,
  /*
   * How much of the social term is live before there is a Panel to be liked by.
   *
   * MEASURED, and this was the single worst calibration in the project. As a
   * flat term, being well liked made you MORE dangerous from week one, so a
   * player with a strong comp game and a strong floor game was read as the
   * biggest threat in the house and finished BELOW the same comp player with no
   * friends: 6.72 against 6.24 average placing. Social investment was worse than
   * useless and the whole Floor Game trunk was a trap.
   *
   * Having a lot of friends is jury equity, and jury equity is an ENDGAME
   * threat. Early it is protection, because the people who like you are the
   * people who have to vote. Ramping the term in as the Panel fills is what
   * makes both of those true at once.
   */
  TH_SOCIAL_EARLY: 0.30,
  /*
   * Comp record as a saturating curve on raw wins rather than a percentile.
   * A percentile over the active house is savagely spiky early: one win in week
   * two, when nobody else has any, reads as the hundredth percentile and the
   * biggest comp threat in a house of sixteen. Wins are an absolute fact about
   * how often you have held power, so treat them as one.
   *   1 win -> 33, 2 -> 55, 3 -> 70, 5 -> 87
   */
  COMP_CURVE: 2.5,
  TH_BIAS_SD: 26,           // scaled by (100 - perception) / 100
  SOCIAL_REACH_CUT: 40,     // trust above this counts as reach

  // eviction, GDD §8.2
  EV_TRUST: 0.46, EV_THREAT: 0.23, EV_PRESSURE: 0.21, EV_PANEL: 0.10,
  /* Scaled by volatility/100. Lowered from 14 after the recap made the cost
     visible: at 14 a quarter of all votes were emotional reversals, and a
     simulation that answers "no good reason at all" that often is not the one
     GDD §1 describes. Volatility should be a Wildcard, not the weather. */
  EV_VOL_SD: 10,

  // nomination
  NOM_TRUST: 0.45, NOM_THREAT: 0.24, NOM_PRESSURE: 0.13, NOM_GOAL: 0.18,
  NOM_ALLY_SHIELD: 34,      // how much an alliance protects you from your ally's nom
  /*
   * COVER. How much a social game stops the house ACTING on the threat it sees.
   *
   * This is the fix for the oldest miscalibration in the project, and it is
   * structural rather than a weight. Trust and threat were two additive terms on
   * one axis, so the only lever was their ratio, and the ratio traded one design
   * promise against another:
   *
   *   threat heavy   comp beasts get targeted, which the pillar demands, but
   *                  social play is worthless and comp wins are strictly bad.
   *                  Measured: 2+ early comp wins finished 6.66 against 5.31,
   *                  and were nominated 50 percent more often at identical
   *                  trust, 0.90 against 0.59.
   *   trust heavy    social play matters and comps pay off, but comp beasts
   *                  survive BETTER than the field and the pillar is dead.
   *
   * No point on that slider satisfies both, because the two effects were never
   * meant to be independent. What the genre actually does is this: the Captain
   * wants the big threat gone and CANNOT MOVE, because the threat has the room.
   * The same player with no friends goes home in week five.
   *
   * So cover multiplies the threat term down instead of adding points against
   * it. A dangerous player with a floor game is still read as dangerous, and
   * nobody can do anything about it.
   */
  COVER_SOCIAL: 0.35,       // from being widely liked
  COVER_ALLY: 0.20,         // from having people who are actually committed
  COVER_MAX: 0.65,          // nobody is ever completely untouchable
  NOM_VOL_SD: 12,
  NOM_THROW_SUSPICION: 0.55, // weight of throw-suspicion in nomination desire

  // alliances, GDD §7.5
  ALLY_FORM_TRUST: 50,
  ALLY_FORM_BELIEF: 45,
  ALLY_FORM_BASE: 0.17,     // per eligible pair per week, scaled by ambition
  ALLY_RECRUIT_BASE: 0.20,
  ALLY_STRENGTH_DECAY: 7,
  ALLY_STRENGTH_WIN: 9,
  ALLY_LEAK_BASE: 0.05,
  ALLY_LEAK_SIZE: 0.030,    // per member beyond two
  /*
   * Betrayal scales with the SQUARE of membership. An alliance at majority size
   * wins every vote by definition, so without steep scaling the house solves
   * itself by week six and every run converges. GDD §7.5.
   */
  ALLY_BETRAY_BASE: 0.012,
  ALLY_BETRAY_SIZE2: 0.0045,
  ALLY_MAX_PER_PLAYER: 2,

  // breadth exposure: being in everything makes you look like you are playing
  // everyone, which is exactly what gets you named.
  EXPOSURE_PER_ALLIANCE: 7,

  // social tick
  AI_ACTIONS: 7,
  PLAYER_ACTIONS: [4, 3, 2],
  TALK_CHARISMA: 0.020,
  NEGLECT_WEIGHT: 2.2,

  // rations, GDD §10
  RATIONS_COUNT: 4,
  RATIONS_COMP_PENALTY: 0.12,
  RATIONS_DECAY_MULT: 1.5,

  // throwing, GDD §10
  THROW_STREAK_SUSPICION: 3,
  THROW_SUSPICION_STEP: 22,

  // panel, GDD §11
  PANEL_SIZE: 7,
  PANEL_RESPECT: 0.38, PANEL_TRUST: 0.62,
  BITTER_BLINDSIDE: 26, BITTER_BROKEN_PROMISE: 30, BITTER_NAMED: 12, BITTER_VOTED: 16,
  BITTER_WITHHOLD: 0.42,    // scale on the bitter-jury probability
  /* Juror independence. Inline literals here were a violation of this file's
     own rule: a number that cannot be swept cannot be tuned, and these two
     turned out to dominate the Panel outcome entirely. */
  PANEL_NOISE_BASE: 5, PANEL_NOISE_VOL: 0.08,
  /* What it costs at the end to have put a juror on the block. This is the
     mechanism behind the oldest arc in the format: the person who won everything
     and used the power sits in front of seven people they personally put at
     risk. It is not a penalty on comp wins, it is a penalty on what winning
     let you do, which is the version the design pillar allows. */
  PANEL_NAMED_COST: 13,
  PANEL_SWING: 0.55,        // how far a juror's own build moves their weights
};

// ─── the label ladder ────────────────────────────────────────────────────────

/*
 * GDD §7.6. Contiguous, half-open on the upper bound, so a float never lands in
 * a gap. Version 0.1's table left 14 to 15, 39 to 40 and 69 to 70 undefined,
 * which is invisible with integer trust and a live bug the moment decay is
 * fractional, which it now is.
 */
const BANDS = [
  { min: -Infinity, max: -70, label: 'Done with you', tone: 'hostile' },
  { min: -70, max: -40, label: 'Cold', tone: 'hostile' },
  { min: -40, max: -15, label: 'Wary', tone: 'cool' },
  { min: -15, max: 15, label: 'Neutral', tone: 'flat' },
  { min: 15, max: 40, label: 'Warm', tone: 'warm' },
  { min: 40, max: 70, label: 'Solid', tone: 'warm' },
  { min: 70, max: Infinity, label: 'Ride or die', tone: 'bonded' },
];

function band(v) {
  for (const b of BANDS) if (v >= b.min && v < b.max) return b;
  return BANDS[BANDS.length - 1];
}

/* How stale a read is allowed to look before the UI says so out loud. */
function freshness(conf) {
  if (conf >= 0.75) return 'current';
  if (conf >= 0.45) return 'a few days old';
  if (conf >= 0.2) return 'going stale';
  return 'you have no idea any more';
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const clamp01 = (v) => clamp(v, 0, 1);
const norm100 = (v) => clamp(v, 0, 100);

// ─── relationships ───────────────────────────────────────────────────────────

function createRelationships(rng, cast, baselines) {
  const n = cast.length;
  const mk = (fill) => {
    const m = [];
    for (let i = 0; i < n; i++) m.push(new Array(n).fill(fill));
    return m;
  };

  const rel = {
    n,
    baseline: baselines,
    trust: mk(0),
    suspicion: mk(0),
    lastWeek: mk(0),
    threatBias: mk(0),
    belief: [],
  };

  for (let i = 0; i < n; i++) {
    rel.belief.push([]);
    for (let j = 0; j < n; j++) {
      /* Everyone starts at their baseline feeling, not at zero. */
      rel.trust[i][j] = i === j ? 100 : baselines[i][j];
      /*
       * And everyone starts with a LOW-CONFIDENCE read of how they are seen,
       * anchored on their own baseline rather than on the truth. You walk in
       * assuming people feel about you roughly how you feel about them, which
       * is both a reasonable prior and a very exploitable one.
       */
      rel.belief[i].push({
        v: i === j ? 100 : baselines[i][j] * 0.6,
        week: 0,
        conf: i === j ? 1 : 0.25,
      });
      /*
       * Persistent per-pair error in i's threat read of j, scaled by how badly
       * i reads people. PERSISTENT, not re-rolled every tick: a standing bias
       * reads as someone who is wrong about a person, fresh noise every week
       * reads as someone who is broken. GDD §8.1.
       */
      if (i !== j) {
        const blind = (100 - cast[i].social.perception) / 100;
        rel.threatBias[i][j] = rng.normal(0, K.TH_BIAS_SD * blind);
      }
    }
  }
  return rel;
}

/**
 * Apply a trust delta with the soft clamp. Returns the amount actually applied,
 * which the WeekLog records so the recap can show why a number barely moved.
 */
function applyTrust(rel, i, j, raw, week) {
  if (i === j) return 0;
  const cur = rel.trust[i][j];
  const room = 1 - Math.pow(Math.abs(cur) / 100, K.CLAMP_EXP);
  /* The clamp only resists motion AWAY from zero. Coming back from the rails is
     not supposed to be hard, otherwise nobody ever forgives anyone and the last
     six weeks of every run are frozen. */
  const outward = (raw > 0 && cur > 0) || (raw < 0 && cur < 0);
  const applied = raw * (outward ? Math.max(0.08, room) : 1);
  rel.trust[i][j] = clamp(cur + applied, -100, 100);
  if (week != null) rel.lastWeek[i][j] = Math.max(rel.lastWeek[i][j], 0);
  return applied;
}

/**
 * Weekly decay toward the pair BASELINE, not toward zero, keyed to weeks since
 * contact. GDD §7.3.
 *
 * Version 0.1 decayed toward zero "scaled by paranoia", which made the most
 * paranoid players in the house forgive the fastest. Here paranoia speeds the
 * fall from positive and slows the climb back from negative, so a paranoid
 * Player is both "what have you done for me lately" and a grudge holder, which
 * is what the attribute is supposed to mean.
 */
function decayWeek(rel, cast, week) {
  for (let i = 0; i < rel.n; i++) {
    const p = cast[i];
    if (p.status !== 'active') continue;
    const par = p.social.paranoia / 100;
    for (let j = 0; j < rel.n; j++) {
      if (i === j) continue;
      if (cast[j].status !== 'active') continue;

      /*
       * ALWAYS at least one unit of decay, plus more for neglect.
       *
       * The first version skipped decay entirely when a pair had spoken that
       * week, which meant any pair in regular contact accumulated trust with
       * nothing but the soft clamp resisting, and the house arrived at Final 5
       * with a median trust of 87.7. There was no equilibrium in the model at
       * all: relationships either saturated or, once the talk deltas were cut,
       * collapsed to nothing. A standing pull toward baseline is what gives
       * maintenance a level to hold ABOVE, which is the pressure GDD §7.3 is
       * actually describing.
       */
      const gap = clamp(1 + (week - rel.lastWeek[i][j]), 1, K.DECAY_MAX_WEEKS);

      const base = rel.baseline[i][j];
      const cur = rel.trust[i][j];
      const toward = base - cur;
      if (Math.abs(toward) < 0.01) continue;

      const above = cur > base;
      const speed = above
        ? (1 + par * K.DECAY_PARANOIA)      // falls faster if paranoid
        : (1 - par * K.DECAY_GRUDGE);       // climbs back slower if paranoid
      let step = K.DECAY_PER_WEEK * gap * Math.max(0.15, speed);
      if (p.onRations) step *= K.RATIONS_DECAY_MULT;

      rel.trust[i][j] = above
        ? Math.max(base, cur - step)
        : Math.min(base, cur + step);

      /* Confidence in "how do they feel about me" rots on the same clock. */
      const b = rel.belief[i][j];
      b.conf = Math.max(K.BELIEF_CONF_FLOOR, b.conf - K.BELIEF_CONF_DECAY * gap);
    }
  }
}

// ─── belief ──────────────────────────────────────────────────────────────────

/**
 * i has just spoken with j, so i updates their read on how j feels about them.
 *
 * The read is the truth PLUS whatever j can sell. A Player with high deception
 * who privately wants you gone projects warmth, and how much of it lands is a
 * contest between their deception and your perception. This is the thing that
 * makes a Mastermind possible: without it, a label is merely old, and merely
 * old is not the same as wrong.
 */
function refreshBelief(rel, cast, i, j, week, rng, opts) {
  const truth = rel.trust[j][i];
  const liar = cast[j], reader = cast[i];

  /* How badly j wants to cover. Strongly negative feelings are worth hiding;
     positive ones are not worth the effort. */
  const hide = clamp01((-truth + 15) / 115);
  const skill = clamp01((liar.social.deception - reader.social.perception + 100) / 200);
  let distort = hide * skill * K.BELIEF_DISTORT_MAX;

  /* Suspicion is the antidote. Once you have caught someone once, their
     charm stops working on you at anything like full strength. */
  distort *= clamp01(1 - rel.suspicion[i][j] / 130);

  const accuracyBonus = (opts && opts.confessional) ? K.CONFESSIONAL_ACCURACY : 0;
  distort *= (1 - accuracyBonus);

  const observed = clamp(truth + distort + (rng ? rng.normal(0, 3) : 0), -100, 100);
  rel.belief[i][j] = { v: observed, week, conf: 1 };
  rel.lastWeek[i][j] = week;
  return observed;
}

/** What i currently thinks j feels about them, plus how much they should trust that. */
function read(rel, i, j) {
  const b = rel.belief[i][j];
  return { value: b.v, conf: b.conf, band: band(b.v), freshness: freshness(b.conf), asOf: b.week };
}

// ─── the one detection roll ──────────────────────────────────────────────────

/**
 * GDD §9. Every lie in the game resolves here, and so does blame assignment.
 * Version 0.1 described this three incompatible ways in three sections.
 *
 * Returns the probability the reader CATCHES the liar.
 */
function detectChance(rel, cast, liarId, readerId) {
  const liar = cast[liarId], reader = cast[readerId];
  let p = K.DETECT_BASE
    + (reader.social.perception - liar.social.deception) * K.DETECT_SPREAD
    - Math.max(0, rel.trust[readerId][liarId]) * K.DETECT_TRUST_COVER
    + (rel.suspicion[readerId][liarId] / 100) * 0.25;
  return clamp(p, K.DETECT_MIN, K.DETECT_MAX);
}

function rollDetection(rel, cast, liarId, readerId, rng) {
  const p = detectChance(rel, cast, liarId, readerId);
  const caught = rng.chance(p);
  if (caught) {
    rel.suspicion[readerId][liarId] = Math.min(100, rel.suspicion[readerId][liarId] + 30);
    applyTrust(rel, readerId, liarId, K.D_CAUGHT_LIE);
  }
  return caught;
}

// ─── threat ──────────────────────────────────────────────────────────────────

/** Count of the active house whose true trust in j clears the reach cut. */
function socialReach(rel, cast, j) {
  let c = 0, elig = 0;
  for (let i = 0; i < rel.n; i++) {
    if (i === j || cast[i].status !== 'active') continue;
    elig++;
    if (rel.trust[i][j] > K.SOCIAL_REACH_CUT) c++;
  }
  return elig ? (c / elig) * 100 : 0;
}

function panelEquity(rel, cast, j, panel) {
  if (!panel || !panel.length) return null;
  let c = 0;
  for (const pid of panel) if (rel.trust[pid][j] > 20) c++;
  return (c / panel.length) * 100;
}

/**
 * Comp record as a percentile of a pool.
 *
 * There are two genuinely different questions here and they need two pools.
 *
 *   IN GAME, the house asks "how many comps has this person won compared to the
 *   people still standing", so the pool is the active house. That is what makes
 *   a comp beast a target while the beasts are still around to be compared to.
 *
 *   AT THE PANEL, the jury asks "how good was their game", which is a question
 *   about the whole run and the whole cast. Against the active pool this
 *   collapses: two finalists left means the percentile can only return 0 or 100,
 *   so respect swung to an extreme on comp record alone.
 *
 * Using one pool for both broke whichever end was not being looked at. Measured:
 * full-cast pool everywhere took comp beast survival from 22.6 percent against a
 * 32.1 percent field, which is the targeting the design pillar promises, to
 * 31.6 against 31.2, which is no targeting at all.
 */
function compPercentile(cast, j, pool) {
  const mine = cast[j].compWins.length;
  const curve = 100 * (1 - Math.exp(-mine / K.COMP_CURVE));

  /* At the Panel the question is "how good was their game", which is genuinely
     comparative, so the jury still ranks. Everywhere else the house is reacting
     to how much power somebody has actually held, which is absolute. */
  if (!pool) return curve;

  const field = pool;
  if (field.length < 2) return 50;
  let below = 0, tied = 0;
  for (const p of field) {
    if (p.id === j) continue;
    if (p.compWins.length < mine) below++;
    else if (p.compWins.length === mine) tied++;
  }
  return ((below + tied * 0.5) / (field.length - 1)) * 100;
}

/**
 * i's read on how dangerous j is. GDD §8.1.
 *
 * Every input is normalised to 0..100 BEFORE weighting, which version 0.1 did
 * not do: `compWins * 12` reached about 150 while `socialReach * 0.4` capped at
 * 6, so social reach was four percent of the signal in a game about social
 * play. `isolation` is gone entirely; it was the inverse of social reach and
 * was double counting the same fact with the opposite sign.
 *
 * Before the Panel exists the panel weight is redistributed across the other
 * two rather than sitting at zero, so threat scores do not lurch upward in
 * week eight for reasons nobody in the house could explain.
 */
function threatScore(rel, cast, i, j, panel, alliances, opts) {
  const comp = compPercentile(cast, j, (opts && opts.pool) || null);
  const social = socialReach(rel, cast, j);
  const pan = panelEquity(rel, cast, j, panel);

  /* How far into the run we are, read off how full the Panel is. */
  const late = clamp01((panel ? panel.length : 0) / K.PANEL_SIZE);
  const wSocial = K.TH_SOCIAL * (K.TH_SOCIAL_EARLY + (1 - K.TH_SOCIAL_EARLY) * late);

  let v;
  if (pan == null) {
    const tot = K.TH_COMP + wSocial;
    v = (K.TH_COMP / tot) * comp + (wSocial / tot) * social;
  } else {
    const tot = K.TH_COMP + wSocial + K.TH_PANEL;
    v = ((K.TH_COMP * comp) + (wSocial * social) + (K.TH_PANEL * pan)) / tot;
  }

  /* Breadth exposure, GDD §7.5. Sitting in three alliances does not make you
     safe, it makes you look like you are playing everybody. */
  if (alliances) {
    const count = alliances.filter((a) => a.alive && a.members.indexOf(j) !== -1).length;
    if (count > 1) v += (count - 1) * K.EXPOSURE_PER_ALLIANCE;
  }

  /* Throwing comps repeatedly reads as hiding something. GDD §10. */
  if (cast[j].throwStreak >= K.THROW_STREAK_SUSPICION) {
    v += (cast[j].throwStreak - K.THROW_STREAK_SUSPICION + 1) * K.THROW_SUSPICION_STEP * 0.35;
  }

  return norm100(v + (i === j ? 0 : rel.threatBias[i][j]));
}

/**
 * How much of the threat somebody radiates the house is unable to act on.
 *
 * Read from the DECIDER's point of view: `i` is the person weighing a move
 * against `j`, so alliances i shares with j count double, because you do not
 * move on your own people.
 */
function cover(rel, cast, i, j, alliances) {
  const reach = socialReach(rel, cast, j) / 100;
  let allied = 0;
  if (alliances) {
    for (const a of alliances) {
      if (!a.alive || a.members.indexOf(j) === -1) continue;
      const strength = a.strength / 100;
      allied += strength * (a.members.indexOf(i) !== -1 ? 0.5 : 0.22);
    }
  }
  return clamp01(reach * K.COVER_SOCIAL + Math.min(0.6, allied) * K.COVER_ALLY) * K.COVER_MAX;
}

// ─── alliances ───────────────────────────────────────────────────────────────

let ALLIANCE_ID = 1;

function majoritySize(activeCount) {
  return Math.max(2, Math.floor(activeCount / 2) + 1);
}

function allianceOf(alliances, id) {
  return alliances.filter((a) => a.alive && a.members.indexOf(id) !== -1);
}

function sharedAlliances(alliances, a, b) {
  return alliances.filter((x) => x.alive && x.members.indexOf(a) !== -1 && x.members.indexOf(b) !== -1);
}

function makeAlliance(members, week) {
  const priority = {};
  for (const m of members) priority[m] = 1;
  return {
    id: ALLIANCE_ID++, members: members.slice(), strength: 50,
    formedWeek: week, priority, alive: true, known: {}, target: null,
  };
}

/** Normalise each member's priority weights across the alliances they sit in. */
function renormalisePriorities(alliances, id) {
  const mine = allianceOf(alliances, id);
  let tot = 0;
  for (const a of mine) tot += a.priority[id] || 0;
  if (!tot) return;
  for (const a of mine) a.priority[id] = (a.priority[id] || 0) / tot;
}

/**
 * Weekly alliance pass: formation, recruitment, decay, leaks, betrayal.
 *
 * Formation needs mutual commitment: i's true trust in j AND i's BELIEF that j
 * trusts them back. Using belief on one side is what lets somebody be talked
 * into an alliance they should not want, which is most of what an Illusionist
 * is for.
 */
function allianceTick(state, rng) {
  const { rel, cast, alliances, week } = state;
  const active = cast.filter((p) => p.status === 'active');
  const maxSize = majoritySize(active.length);

  // decay and death
  for (const a of alliances) {
    if (!a.alive) continue;
    a.strength = Math.max(0, a.strength - K.ALLY_STRENGTH_DECAY);
    a.members = a.members.filter((m) => cast[m].status === 'active');
    if (a.members.length < 2 || a.strength <= 0) { a.alive = false; a.diedWeek = week; continue; }
    /* When the house shrinks past what the alliance was built for, it sheds
       its lowest-priority members rather than staying illegally large. */
    while (a.members.length > maxSize) {
      a.members.sort((x, y) => (a.priority[x] || 0) - (a.priority[y] || 0));
      a.members.shift();
    }
  }

  // formation, over pairs not already allied together
  for (let ai = 0; ai < active.length; ai++) {
    for (let bi = ai + 1; bi < active.length; bi++) {
      const i = active[ai].id, j = active[bi].id;
      if (sharedAlliances(alliances, i, j).length) continue;
      if (allianceOf(alliances, i).length >= K.ALLY_MAX_PER_PLAYER) continue;
      if (allianceOf(alliances, j).length >= K.ALLY_MAX_PER_PLAYER) continue;

      const iWants = rel.trust[i][j] >= K.ALLY_FORM_TRUST && rel.belief[i][j].v >= K.ALLY_FORM_BELIEF;
      const jWants = rel.trust[j][i] >= K.ALLY_FORM_TRUST && rel.belief[j][i].v >= K.ALLY_FORM_BELIEF;
      if (!iWants || !jWants) continue;

      const amb = (cast[i].social.ambition + cast[j].social.ambition) / 200;
      if (!rng.chance(K.ALLY_FORM_BASE * (0.5 + amb))) continue;

      const a = makeAlliance([i, j], week);
      alliances.push(a);
      applyTrust(rel, i, j, K.D_ALLIANCE);
      applyTrust(rel, j, i, K.D_ALLIANCE);
      renormalisePriorities(alliances, i);
      renormalisePriorities(alliances, j);
      state.log.push({ week, kind: 'alliance_formed', members: [i, j], id: a.id });
    }
  }

  // recruitment
  for (const a of alliances) {
    if (!a.alive || a.members.length >= maxSize) continue;
    const recruiter = a.members[rng.int(0, a.members.length - 1)];
    const cands = active
      .map((p) => p.id)
      .filter((id) => a.members.indexOf(id) === -1)
      .filter((id) => allianceOf(alliances, id).length < K.ALLY_MAX_PER_PLAYER)
      .filter((id) => rel.trust[recruiter][id] >= K.ALLY_FORM_TRUST - 8);
    if (!cands.length) continue;

    const pick = rng.weighted(cands, cands.map((id) => Math.max(1, rel.trust[recruiter][id])));
    const mutual = rel.trust[pick][recruiter] >= K.ALLY_FORM_TRUST - 12;
    if (!mutual) continue;
    if (!rng.chance(K.ALLY_RECRUIT_BASE * (a.strength / 100))) continue;

    a.members.push(pick);
    a.priority[pick] = 1;
    for (const m of a.members) if (m !== pick) {
      applyTrust(rel, m, pick, K.D_ALLIANCE * 0.5);
      applyTrust(rel, pick, m, K.D_ALLIANCE * 0.5);
    }
    renormalisePriorities(alliances, pick);
    state.log.push({ week, kind: 'alliance_grew', id: a.id, joined: pick });
  }

  // leaks
  for (const a of alliances) {
    if (!a.alive) continue;
    const loyalties = a.members.map((m) => cast[m].social.loyalty);
    const loudest = Math.min.apply(null, loyalties);
    const rate = K.ALLY_LEAK_BASE
      + Math.max(0, a.members.length - 2) * K.ALLY_LEAK_SIZE
      + (100 - loudest) / 100 * 0.10;
    if (!rng.chance(clamp01(rate))) continue;

    const outsiders = active.map((p) => p.id).filter((id) => a.members.indexOf(id) === -1);
    if (!outsiders.length) continue;
    const to = rng.pick(outsiders);
    a.known[to] = week;
    state.log.push({ week, kind: 'alliance_leaked', id: a.id, to });
  }

  // betrayal, scaling with the square of membership
  for (const a of alliances) {
    if (!a.alive || a.members.length < 3) continue;
    const size = a.members.length;
    for (const m of a.members.slice()) {
      const disloyal = (100 - cast[m].social.loyalty) / 100;
      const p = (K.ALLY_BETRAY_BASE + K.ALLY_BETRAY_SIZE2 * size * size) * (0.4 + disloyal);
      if (!rng.chance(clamp01(p))) continue;
      a.members = a.members.filter((x) => x !== m);
      a.strength = Math.max(0, a.strength - 18);
      for (const other of a.members) {
        applyTrust(rel, other, m, -22);
        rel.suspicion[other][m] = Math.min(100, rel.suspicion[other][m] + 25);
      }
      state.log.push({ week, kind: 'alliance_betrayed', id: a.id, who: m });
      if (a.members.length < 2) { a.alive = false; a.diedWeek = week; }
    }
  }
}

// ─── the AI social tick ──────────────────────────────────────────────────────

/**
 * GDD §7 opened with a hole: the trust events were all PLAYER verbs, so nothing
 * described the AI talking to each other. Without this function AI-to-AI trust
 * only ever moves by decay and vote fallout, mutual trust never reaches the
 * alliance threshold, no alliance ever forms, alliancePressure is always zero,
 * and "they build their own alliances behind your back" produces nothing at
 * all. This is that function.
 *
 * Each AI spends an interaction budget. Partners are chosen by a blend of who
 * they are already invested in, who is worth knowing, and who they have not
 * spoken to lately, so neglect is a pressure on them exactly as it is on the
 * player.
 */
function socialTick(state, rng) {
  const { rel, cast, alliances, week } = state;
  /*
   * The human is excluded because a real player spends their own energy through
   * scenes.js. But when `autoPlayer` is on there IS no real player, and leaving
   * them out meant the harness's stand-in sat in total silence for fourteen
   * weeks: no conversations, no alliances, nothing but decay.
   *
   * Every level-parity and house-scaling number this project produced was
   * measuring that. It is why sweeping BASE_ATTRS from 30 to 46 and the house
   * floor from 46 down to 34 moved the player's win rate not at all: attributes
   * cannot help somebody who never speaks to anybody.
   */
  const active = cast.filter((p) => p.status === 'active'
    && !(p.isHuman && !state.autoPlayer));

  for (const p of active) {
    const i = p.id;
    const others = cast.filter((q) => q.status === 'active' && q.id !== i);
    if (!others.length) continue;

    /* Scaled to the house. A fixed budget means five people at Final 5 talk to
       each other seven times a week each, which is thirty five conversations
       across twenty pairs, and everybody ends up bonded to everybody. The
       social layer has to get sparser as the house gets smaller, not denser. */
    let budget = Math.max(2, Math.min(K.AI_ACTIONS, Math.round(others.length * 0.55)));
    if (p.onRations) budget -= 1;

    for (let a = 0; a < budget; a++) {
      const weights = others.map((q) => {
        const j = q.id;
        const allied = sharedAlliances(alliances, i, j).length ? 1.8 : 1;
        const neglect = clamp(week - rel.lastWeek[i][j], 0, 4) * K.NEGLECT_WEIGHT;
        const worth = q.social.charisma / 50;
        const warmth = Math.max(0.2, (rel.trust[i][j] + 100) / 120);
        return allied * warmth * worth + neglect;
      });
      const target = rng.weighted(others, weights);
      converse(state, i, target.id, rng);
    }
  }
}

/** One conversation. Both sides move, and both sides update their read. */
function converse(state, i, j, rng) {
  const { rel, cast, week } = state;
  const a = cast[i], b = cast[j];

  /* Charisma is a multiplier in a narrow band, not a doubling. A 1.6x spread
     between the most and least charming person in the house compounds plenty
     over fourteen weeks of daily conversation. */
  const giveI = (K.D_TALK_MIN + rng.range(0, K.D_TALK_MAX - K.D_TALK_MIN))
    * (0.55 + a.social.charisma * K.TALK_CHARISMA);
  const giveJ = (K.D_TALK_MIN + rng.range(0, K.D_TALK_MAX - K.D_TALK_MIN))
    * (0.55 + b.social.charisma * K.TALK_CHARISMA);

  /* A conversation with someone you already distrust does less, and can do
     nothing. Charm does not reset a grudge. */
  applyTrust(rel, j, i, giveI * clamp01(1 - rel.suspicion[j][i] / 150));
  applyTrust(rel, i, j, giveJ * clamp01(1 - rel.suspicion[i][j] / 150));

  rel.lastWeek[i][j] = week;
  rel.lastWeek[j][i] = week;
  refreshBelief(rel, cast, i, j, week, rng);
  refreshBelief(rel, cast, j, i, week, rng);
}

// ─── nominations ─────────────────────────────────────────────────────────────

function goalWeight(p, key) {
  if (!p.hiddenGoal) return 0;
  return p.hiddenGoal.weights[key] || 0;
}

/**
 * How much the Captain wants this person At Risk. Same shape as evictScore, but
 * the Captain is acting rather than reacting, so their own goal weighs more and
 * their alliances shield harder.
 */
function nominationDesire(state, hcId, targetId, rng) {
  const { rel, cast, alliances, panel } = state;
  const hc = cast[hcId];

  const trustTerm = (100 - rel.trust[hcId][targetId]) / 2;
  const threatTerm = threatScore(rel, cast, hcId, targetId, panel, alliances)
    * (1 - cover(rel, cast, hcId, targetId, alliances));

  let pressure = 0;
  for (const al of allianceOf(alliances, hcId)) {
    if (al.target === targetId) pressure += 60 * (al.strength / 100) * (al.priority[hcId] || 0.5);
  }

  let goal = 50;
  goal += goalWeight(hc, 'threat') * 100 * (threatTerm / 100);
  if (hc.hiddenGoal && hc.hiddenGoal.id === 'hunt_operator') {
    goal += (cast[targetId].build.shares.long || 0) * 45;
  }

  let v = K.NOM_TRUST * trustTerm
    + K.NOM_THREAT * threatTerm
    + K.NOM_PRESSURE * norm100(pressure)
    + K.NOM_GOAL * norm100(goal);

  /* Your own alliance is the thing that stops a Captain naming you. This is the
     mechanism behind the thrown-comp calibration target in GDD §10: an ally
     with the power has a real reason not to touch you, and a non-ally does not.
     It is not a die roll and it is not scripted. */
  for (const al of sharedAlliances(alliances, hcId, targetId)) {
    v -= K.NOM_ALLY_SHIELD * (al.strength / 100) * (al.priority[hcId] || 0.5);
  }

  if (cast[targetId].throwStreak >= K.THROW_STREAK_SUSPICION) {
    v += K.NOM_THROW_SUSPICION * K.THROW_SUSPICION_STEP;
  }

  v += rng.normal(0, K.NOM_VOL_SD * (hc.social.volatility / 100));
  return v;
}

/** The two the Captain names. Never the Captain, never anyone already safe. */
function chooseNominations(state, hcId, rng, exclude) {
  const { cast } = state;
  const ex = exclude || [];
  const pool = cast.filter((p) => p.status === 'active' && p.id !== hcId && ex.indexOf(p.id) === -1);
  const scored = pool.map((p) => ({ id: p.id, v: nominationDesire(state, hcId, p.id, rng) }));
  scored.sort((a, b) => b.v - a.v);
  return scored.slice(0, 2).map((s) => s.id);
}

// ─── eviction ────────────────────────────────────────────────────────────────

/**
 * Would this person beat me in front of the Panel. A full win-probability
 * estimate is recursive and expensive, so this is the cheap proxy: how much
 * more the people who will be voting already like them than they like me.
 */
function panelThreat(state, voterId, targetId, rng) {
  const { rel, cast, panel } = state;
  const jury = (panel && panel.length) ? panel : cast.filter((p) => p.status !== 'active').map((p) => p.id);
  if (!jury.length) return 50;
  let them = 0, me = 0;
  for (const pid of jury) { them += rel.trust[pid][targetId]; me += rel.trust[pid][voterId]; }
  let v = 50 + ((them - me) / jury.length) * 0.5;

  /*
   * Nobody knows what the jury thinks. If `rng` is passed, the read is fogged
   * by how well the reader reads people, the same way every other estimate in
   * this engine is.
   *
   * This mattered more than any weight in the file. Without it the Final 3
   * winner picked their opponent using the jury's TRUE feelings, which made
   * winning the last comp worth 69.5 percent of the game outright, flattened
   * the correlation between standing at Final 5 and winning to nothing, and put
   * every Comp Game archetype at the top of the win table. An omniscient
   * endgame decision is worth more than any amount of social play, because it
   * cannot be wrong.
   */
  if (rng) {
    const blind = (100 - cast[voterId].social.perception) / 100;
    v += rng.normal(0, 22 * blind + 6);
  }
  return norm100(v);
}

function alliancePressure(state, voterId, targetId) {
  const { alliances } = state;
  let v = 0;
  for (const a of allianceOf(alliances, voterId)) {
    if (a.target == null) continue;
    const w = 100 * (a.strength / 100) * (a.priority[voterId] || 0.5);
    if (a.target === targetId) v += w;
    else v -= w * 0.55;   // being asked to save them is pressure the other way
  }
  return norm100(50 + v / 2);
}

/**
 * GDD §8.2. Each voter scores both At Risk and evicts the higher.
 *
 * Pass `parts` and it is filled with the component breakdown. That breakdown is
 * the whole replay hook: §1 promises that if somebody flips on you there is a
 * traceable chain behind it and that you can inspect it afterwards. A vote
 * record that stores only the target cannot answer why, so it stores the four
 * weighted terms and the noise, and recap.js turns the dominant one into a
 * sentence.
 */
function evictScore(state, voterId, targetId, rng, parts) {
  const { rel, cast, panel, alliances } = state;
  const voter = cast[voterId];

  const trustTerm = (100 - rel.trust[voterId][targetId]) / 2;
  const threatTerm = threatScore(rel, cast, voterId, targetId, panel, alliances)
    * (1 - cover(rel, cast, voterId, targetId, alliances));
  const pressure = alliancePressure(state, voterId, targetId);
  const jury = panelThreat(state, voterId, targetId);

  let v = K.EV_TRUST * trustTerm
    + K.EV_THREAT * threatTerm
    + K.EV_PRESSURE * pressure
    + K.EV_PANEL * jury;

  v += goalWeight(voter, 'threat') * threatTerm * 0.3;
  for (const a of sharedAlliances(alliances, voterId, targetId)) {
    v -= 30 * (a.strength / 100) * (a.priority[voterId] || 0.5) * (1 + goalWeight(voter, 'allyBond'));
  }

  const noise = rng.normal(0, K.EV_VOL_SD * (voter.social.volatility / 100));
  v += noise;

  if (parts) {
    parts.trust = K.EV_TRUST * trustTerm;
    parts.threat = K.EV_THREAT * threatTerm;
    parts.pressure = K.EV_PRESSURE * pressure;
    parts.panel = K.EV_PANEL * jury;
    parts.noise = noise;
    parts.allied = sharedAlliances(alliances, voterId, targetId).length > 0;
    parts.total = v;
  }
  return v;
}

/**
 * Run the vote. Votes are ANONYMOUS (GDD §8.2): the tally is read, never
 * attributed. The truth is recorded in the WeekLog for the post-game recap and
 * for blame assignment, and is never surfaced during a run.
 */
function resolveEviction(state, atRisk, voters, rng) {
  const { cast } = state;
  const votes = [];
  const tally = {};
  for (const t of atRisk) tally[t] = 0;

  for (const v of voters) {
    const scores = atRisk.map((t) => {
      const parts = {};
      return { t, s: evictScore(state, v, t, rng, parts), parts };
    });
    scores.sort((a, b) => b.s - a.s);
    const target = scores[0].t;
    const promised = (state.voteIntent && state.voteIntent[v] != null) ? state.voteIntent[v] : null;

    /*
     * `why` is the DIFFERENCE between the two nominees, not the absolute
     * breakdown for the one who went.
     *
     * A vote is a comparison, so the reason has to be what separated them. The
     * absolute version made every single line of the recap read "they never
     * warmed to them", because EV_TRUST is the heaviest weight and the trust
     * term is therefore almost always the largest number regardless of what
     * actually decided the vote. The delta says which consideration did the
     * separating, which is the question a player is asking.
     */
    const a = scores[0].parts, b = scores[1] ? scores[1].parts : null;
    let why = a;
    if (b) {
      const considered = (a.trust - b.trust) + (a.threat - b.threat)
        + (a.pressure - b.pressure) + (a.panel - b.panel);
      why = {
        trust: a.trust - b.trust,
        threat: a.threat - b.threat,
        pressure: a.pressure - b.pressure,
        panel: a.panel - b.panel,
        noise: a.noise - b.noise,
        /*
         * Did volatility actually DECIDE this, or was it merely present.
         *
         * The considered terms already point somewhere. If they pointed at the
         * same person, the emotion changed nothing and calling it the reason is
         * wrong. Attributing on "largest delta" instead made 46 percent of all
         * votes in the game come out as "no good reason at all", which reads as
         * a broken simulation rather than an occasional Wildcard, and directly
         * contradicts the pillar in GDD §1.
         */
        flipped: considered <= 0,
        allied: a.allied,
        margin: scores[0].s - scores[1].s,
      };
    }

    votes.push({ voter: v, target, promisedTarget: promised,
      margin: scores[0].s - (scores[1] ? scores[1].s : 0), why });
    tally[target]++;
  }

  let evicted = null, top = -1, tied = [];
  for (const t of atRisk) {
    if (tally[t] > top) { top = tally[t]; tied = [t]; }
    else if (tally[t] === top) tied.push(t);
  }
  let brokenBy = null;
  if (tied.length > 1) {
    /* GDD §3: the House Captain breaks all ties. Ties are guaranteed to happen,
       because the eligible-voter count flips parity every single week. */
    const scores = tied.map((t) => ({ t, s: evictScore(state, state.captain, t, rng) }));
    scores.sort((a, b) => b.s - a.s);
    evicted = scores[0].t;
    brokenBy = state.captain;
  } else {
    evicted = tied[0];
  }

  return { votes, tally, evicted, tieBreak: brokenBy };
}

// ─── blame ───────────────────────────────────────────────────────────────────

/**
 * GDD §8.3. Because votes are anonymous, discovery is INFERENCE.
 *
 * When the tally contradicts what someone was promised, the injured parties do
 * not learn who flipped. They decide who they THINK flipped, weighted by prior
 * suspicion, threat, alliance membership, and their own perception. Blame lands
 * on the wrong person often enough to matter, and that is the point: this is
 * the phase that generates most of the drama in a run.
 *
 * Version 0.1 gated two trust deltas on "(discovered)" with no mechanism at all
 * behind the word.
 */
function assignBlame(state, result, rng) {
  const { rel, cast, week } = state;
  const out = [];

  const liars = result.votes.filter((v) => v.promisedTarget != null && v.promisedTarget !== v.target);
  if (!liars.length) return out;

  /* Who was hurt: anyone who was promised votes and did not get them. Each of
     them picks a suspect from the pool of people who could plausibly have done
     it, which is everybody who voted. */
  const hurtSet = new Set();
  for (const v of liars) hurtSet.add(v.promisedTarget === result.evicted ? null : v.voter);
  for (const v of result.votes) if (v.promisedTarget != null) hurtSet.add(v.voter);

  const accusers = cast.filter((p) => p.status === 'active').map((p) => p.id);
  const suspects = result.votes.map((v) => v.voter);

  for (const acc of accusers) {
    if (!liars.length) break;
    /* Only people with a stake in the promise go looking for someone to blame. */
    const stake = liars.some((l) => rel.trust[acc][l.voter] > 20 || sharedAlliances(state.alliances, acc, l.voter).length);
    if (!stake) continue;

    const truth = liars[rng.int(0, liars.length - 1)].voter;
    const skill = clamp01(cast[acc].social.perception / 100);

    let picked;
    if (rng.chance(0.25 + skill * 0.5)) {
      picked = truth;                       // they got it right
    } else {
      const pool = suspects.filter((s) => s !== acc);
      if (!pool.length) continue;
      const w = pool.map((s) => 1
        + rel.suspicion[acc][s] / 25
        + Math.max(0, -rel.trust[acc][s]) / 30
        + (sharedAlliances(state.alliances, acc, s).length ? -0.4 : 0.6));
      picked = rng.weighted(pool, w);       // they got it wrong, but plausibly
    }

    if (picked === acc) continue;
    applyTrust(rel, acc, picked, K.D_BROKEN_PROMISE * (0.5 + skill * 0.5));
    rel.suspicion[acc][picked] = Math.min(100, rel.suspicion[acc][picked] + 28);
    out.push({ week, accuser: acc, blamed: picked, correct: picked === truth });
  }
  return out;
}

// ─── panel ───────────────────────────────────────────────────────────────────

/**
 * How bitter someone is on the way out, GDD §11. Built from what they BELIEVE
 * happened to them, which is why it uses suspicion and blame rather than the
 * true vote record. Being wrong about who got you is still bitter.
 */
function computeBitterness(state, id, result) {
  const { rel, cast } = state;
  let b = 0;
  const votes = result.votes.filter((v) => v.target === id);
  b += votes.length * K.BITTER_VOTED * 0.5;

  /* Blindside: they thought they were fine and they were not. */
  const expected = state.expectedSafe && state.expectedSafe[id];
  if (expected) b += K.BITTER_BLINDSIDE;

  for (const v of result.votes) {
    if (v.promisedTarget != null && v.promisedTarget !== v.target && v.target === id) {
      b += K.BITTER_BROKEN_PROMISE;
    }
  }
  if (state.atRiskNamedBy && state.atRiskNamedBy[id] != null) b += K.BITTER_NAMED;

  const loyalty = cast[id].social.loyalty / 100;
  return clamp(b * (0.6 + (1 - loyalty) * 0.8), 0, 100);
}

/**
 * Panel vote. `respect` is a threat read with bitterness inverted, blended with
 * how much they actually like you, plus the bitter-jury chance from GDD §11.
 */
function panelVote(state, finalists, rng, framings) {
  const { rel, cast, panel } = state;
  const tally = {}; const detail = [];
  for (const f of finalists) tally[f] = 0;

  for (const pid of panel) {
    const juror = cast[pid];
    /*
     * Each juror weighs respect against affection differently, and the mix
     * comes from their own build. A Comp Game or Long Game juror rewards the
     * game you played; a Floor Game juror rewards how you treated them. Without
     * this every juror ran the identical formula over near-identical inputs and
     * 48 percent of runs finished with a unanimous Panel, which is not a jury,
     * it is a rubber stamp.
     */
    const gameMinded = (juror.build.shares.long || 0) + (juror.build.shares.comp || 0) * 0.7;
    const wRespect = clamp(K.PANEL_RESPECT + (gameMinded - 0.5) * K.PANEL_SWING, 0.10, 0.85);
    const wTrust = 1 - wRespect;
    const scores = finalists.map((f) => {
      const respect = threatScore(rel, cast, pid, f, panel, state.alliances, { pool: cast });
      /*
       * Trust mapped 1:1 onto the 0..100 scale rather than halved into it.
       *
       * As (trust + 100) / 2 the whole realistic trust range of about -20 to
       * +60 compressed into a fifteen point spread, while respect used the full
       * hundred. The weights said the Panel cared about how you treated people;
       * the arithmetic said it did not, and moving PANEL_TRUST from 0.45 to
       * 0.62 changed the winner in 0.5 percent of runs. Weighting a term that
       * cannot vary is the same bug as the unnormalised threat inputs, one
       * layer further on.
       */
      const trust = clamp(50 + rel.trust[pid][f], 0, 100);
      let v = wRespect * respect + wTrust * trust;
      /* A juror is a person on the way out of a house they just lost. */
      v += rng.normal(0, K.PANEL_NOISE_BASE + juror.social.volatility * K.PANEL_NOISE_VOL);

      /* Framing lands differently by archetype. A Mastermind on the Panel wants
         to hear you own it. An Anchor wants to hear you did not enjoy it. */
      const fr = framings && framings[f];
      if (fr) {
        const wantsBold = (juror.build.shares.long || 0) + (juror.build.shares.comp || 0) * 0.5;
        v += (fr === 'own' ? 1 : -1) * (wantsBold - 0.5) * 26;
      }

      /* You named this juror At Risk. Every time. */
      let named = 0;
      for (const by of juror.namedBy) if (by === f) named++;
      v -= named * K.PANEL_NAMED_COST * (0.5 + juror.bitterness / 100);

      /* Bitter jury. Betrayal that landed on this juror can cost you their vote
         outright, whatever your game looked like. */
      const bitter = juror.bitterness / 100;
      const betrayed = rel.suspicion[pid][f] / 100;
      if (rng.chance(bitter * betrayed * K.BITTER_WITHHOLD)) v -= 55;

      return { f, v };
    });
    scores.sort((a, b) => b.v - a.v);
    tally[scores[0].f]++;
    detail.push({ juror: pid, voted: scores[0].f, margin: scores[0].v - scores[1].v });
  }

  let winner = finalists[0];
  for (const f of finalists) if (tally[f] > tally[winner]) winner = f;
  return { tally, detail, winner };
}

// ─── exports ─────────────────────────────────────────────────────────────────

const ENGINE_API_VERSION = 1;

const api = {
  API_VERSION: ENGINE_API_VERSION,
  K, BANDS, band, freshness, clamp, clamp01, norm100,
  createRelationships, applyTrust, decayWeek,
  refreshBelief, read,
  detectChance, rollDetection,
  socialReach, panelEquity, compPercentile, threatScore, cover,
  majoritySize, allianceOf, sharedAlliances, makeAlliance, renormalisePriorities, allianceTick,
  socialTick, converse,
  nominationDesire, chooseNominations,
  panelThreat, alliancePressure, evictScore, resolveEviction, assignBlame,
  computeBitterness, panelVote,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.RH_ENGINE = api;

})();
