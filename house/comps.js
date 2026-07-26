/* RunTheHouse, competitions.
 *
 * Headless and dependency-free. Browser: window.RH_COMPS. Node: require.
 *
 * GDD §10. Two things had to be reconciled here. Version 0.1's §8 mapped each
 * comp to a single attribute and its §4 promised "a weighted blend, so no
 * single Player dominates every week". Those are different systems with
 * different balance consequences.
 *
 * The resolution: every comp IS a blend, and the attribute it is "mapped to" is
 * the primary term. 60 percent primary, 25 percent secondary, 15 percent luck.
 * Both sentences in the design doc are now true.
 *
 * `luck` is the one attribute the skill tree cannot buy (see tree.js
 * UNBUYABLE). That fifteen percent is what stops a maxed account from sweeping
 * fourteen straight weeks, and it is deliberately the LAST thing that should be
 * tuned, because raising it makes comps feel arbitrary and lowering it makes
 * them feel decided at character creation.
 *
 * ── the human curve ────────────────────────────────────────────────────────
 *
 * A minigame produces a raw 0..100. The player's comp score blends that with
 * their built attributes at HUMAN_SKILL_WEIGHT, so both the build and the hands
 * matter. GDD §10 calls this the hardest number in the build and says it is
 * solved by sweep, not by guessing. simulator.js --skill sweeps it.
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


const E = (typeof require !== 'undefined') ? require('./engine.js') : window.RH_ENGINE;

/* How much of a human's comp result is their hands versus their build. At 0 the
   minigames are decoration. At 1 the skill tree is decoration. */
const HUMAN_SKILL_WEIGHT = 0.55;

const BLEND = { PRIMARY: 0.60, SECONDARY: 0.25, LUCK: 0.15 };
const COMP_NOISE_SD = 9;

/*
 * `kind` is what the UI builds. `primary` and `secondary` are what the engine
 * reads. Adding a comp is adding a row here plus a module in the UI that
 * returns 0..100, and it never touches the engine. GDD §10 asks for exactly
 * that, because comps are the thing that has to stay fresh longest.
 */
const COMPS = [
  {
    id: 'reaction', kind: 'reaction', name: 'Hair Trigger',
    primary: 'precision', secondary: 'mental',
    blurb: 'The light goes green. Everything before that is a guess.',
  },
  {
    id: 'memory', kind: 'memory', name: 'The Long Hallway',
    primary: 'mental', secondary: 'precision',
    blurb: 'Walk it once. Walk it again from memory.',
  },
  {
    id: 'endurance', kind: 'hold', name: 'Dead Weight',
    primary: 'physical', secondary: 'mental',
    blurb: 'Hold on. The house will try to make you let go.',
  },
  {
    id: 'trivia', kind: 'trivia', name: 'House Rules',
    primary: 'mental', secondary: 'perception',
    blurb: 'Everything that happened here is on the test.',
  },
  {
    id: 'balance', kind: 'slider', name: 'Level Head',
    primary: 'precision', secondary: 'physical',
    blurb: 'Keep it centred. It does not want to stay centred.',
  },
  {
    id: 'chance', kind: 'random', name: 'Draw',
    primary: 'luck', secondary: 'luck',
    blurb: 'No skill in it. Somebody still walks away with the power.',
  },
];

const BY_ID = new Map(COMPS.map((c) => [c.id, c]));

/**
 * Which comp runs this week. Deterministic from the `comp` stream, and it does
 * not repeat back to back, because two memory comps in a row reads as a bug
 * even when it is fair.
 */
function pickComp(rng, lastId) {
  const pool = COMPS.filter((c) => c.id !== lastId);
  return rng.pick(pool);
}

function attrOf(p, name) {
  if (p.comp[name] != null) return p.comp[name];
  if (p.social[name] != null) return p.social[name];
  return 50;
}

/** The attribute-only score, which is what every AI runs on. */
function baseScore(p, comp, rng) {
  const primary = attrOf(p, comp.primary);
  const secondary = attrOf(p, comp.secondary);
  const luck = rng.range(0, 100);
  let v = BLEND.PRIMARY * primary + BLEND.SECONDARY * secondary + BLEND.LUCK * luck;
  v += rng.normal(0, COMP_NOISE_SD);
  if (p.onRations) v *= (1 - E.K.RATIONS_COMP_PENALTY);
  return v;
}

/**
 * The same, with a human's minigame result folded into the primary term.
 * `perf` is 0..100 from the minigame.
 */
function humanScore(p, comp, rng, perf) {
  const primary = attrOf(p, comp.primary);
  const effective = HUMAN_SKILL_WEIGHT * perf + (1 - HUMAN_SKILL_WEIGHT) * primary;
  const secondary = attrOf(p, comp.secondary);
  const luck = rng.range(0, 100);
  let v = BLEND.PRIMARY * effective + BLEND.SECONDARY * secondary + BLEND.LUCK * luck;
  v += rng.normal(0, COMP_NOISE_SD * 0.5);
  if (p.onRations) v *= (1 - E.K.RATIONS_COMP_PENALTY);
  return v;
}

/*
 * A thrown comp does not score zero, it scores like somebody who is visibly not
 * trying. Landing in the bottom band is the point: GDD §10 makes Rations the
 * price of throwing, and Rations are the bottom finishers.
 */
const THROW_BAND = [4, 26];

/**
 * Should this AI throw? GDD §10 wants AI throwing too, so it is not a
 * player-only verb, and so the house contains people who are hiding.
 *
 * Reasons to throw, all of them legible in a recap sentence: an ally already
 * holds the power so winning gains nothing and costs cover; you are reading as
 * a threat and another week of power makes it worse; your hidden goal is to
 * never sit At Risk and the Captaincy is a target on your back.
 */
function aiWantsToThrow(state, id, kind, rng) {
  const p = state.cast[id];
  if (p.hiddenGoal && p.hiddenGoal.id === 'win_comps') return false;
  if (kind === 'veto' && state.atRisk.indexOf(id) !== -1) return false;

  const selfThreat = E.threatScore(state.rel, state.cast, id, id, state.panel, state.alliances);
  const allies = E.allianceOf(state.alliances, id);
  const allyCount = allies.reduce((s, a) => s + a.members.length - 1, 0);

  let p_throw = 0.05;
  p_throw += E.clamp01(selfThreat / 100 - 0.5) * 0.45;
  p_throw += E.clamp01(allyCount / 5) * 0.20;
  p_throw += (p.hiddenGoal && p.hiddenGoal.id === 'never_at_risk') ? 0.18 : 0;
  p_throw -= (p.social.ambition / 100) * 0.22;

  /* Nobody throws when the throw is obvious. Three in a row already has the
     house looking at you (see engine threatScore), and the AI knows it. */
  if (p.throwStreak >= E.K.THROW_STREAK_SUSPICION - 1) p_throw *= 0.35;

  return rng.chance(E.clamp01(p_throw));
}

/**
 * Run a comp. Returns a ranking, the winner, and who lands on Rations.
 *
 * `playerPerf` is the human's minigame result, or null if the human is not in
 * this comp. `throws` is a set of ids who are throwing, human included.
 */
function runComp(state, comp, participants, rng, playerPerf, throws) {
  const thrown = throws || new Set();
  const rows = participants.map((id) => {
    const p = state.cast[id];
    let score;
    if (thrown.has(id)) {
      score = rng.range(THROW_BAND[0], THROW_BAND[1]);
    } else if (p.isHuman && playerPerf != null) {
      score = humanScore(p, comp, rng, playerPerf);
    } else {
      score = baseScore(p, comp, rng);
    }
    return { id, score, threw: thrown.has(id) };
  });

  rows.sort((a, b) => b.score - a.score);
  rows.forEach((r, i) => { r.place = i + 1; });

  return {
    comp: comp.id,
    name: comp.name,
    ranking: rows,
    winner: rows[0].id,
    thrown: Array.from(thrown),
  };
}

/** Bottom finishers go on Rations for the coming week. GDD §10. */
function rationsFrom(result, count) {
  const n = count == null ? E.K.RATIONS_COUNT : count;
  const rows = result.ranking.slice();
  return rows.slice(Math.max(0, rows.length - n)).map((r) => r.id);
}

/** Bookkeeping after any comp: throw streaks, win records. */
function recordComp(state, result, week) {
  for (const r of result.ranking) {
    const p = state.cast[r.id];
    if (r.threw) {
      p.compsThrown.push(week);
      p.throwStreak += 1;
    } else {
      p.throwStreak = 0;
    }
  }
  state.cast[result.winner].compWins.push(week);
}

const api = {
  COMPS, BY_ID, BLEND, HUMAN_SKILL_WEIGHT, COMP_NOISE_SD, THROW_BAND,
  pickComp, baseScore, humanScore, aiWantsToThrow, runComp, rationsFrom, recordComp, attrOf,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.RH_COMPS = api;

})();
