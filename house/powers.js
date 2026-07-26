/* RunTheHouse, secret powers.
 *
 * Headless and dependency-free. Browser: window.RH_POWERS. Node: require.
 *
 * GDD §12. Six powers, replacing version 0.2's single vague "The Envelope".
 * Each one is a temporary, one-use override of a specific rule in run.js, and
 * every one of them has to answer the same four questions before it can exist:
 *
 *   WHO holds it, and does the house know that it exists at all
 *   WHEN it can be played, expressed as a phase the loop actually has
 *   WHAT rule it overrides, in one sentence
 *   WHY an AI would play it this week rather than next, legibly enough to put
 *     in a recap sentence
 *
 * That last one is the design pillar (GDD §1) applied to powers. An AI that
 * plays a Diamond Veto on a coin flip is a random event with a name. An AI that
 * plays it because their closest ally was named and they can put up the person
 * their alliance already wanted gone is a story the player can reconstruct
 * afterwards, which is the entire replay hook.
 *
 * ── SECRECY IS A GAME STATE, NOT A UI FLAG ─────────────────────────────────
 *
 * Three levels, and they behave differently:
 *
 *   public   everyone knows it exists and who holds it, from the moment it is
 *            awarded. Veto Player Selection, Back to Back.
 *   known    the house is told a power is loose but not who has it. This is the
 *            most interesting state in the file: it turns a week into a hunt,
 *            and it makes every unexpected vote count deniable. Week of Safety,
 *            Extra Vote.
 *   hidden   nobody knows anything until it fires. Diamond Veto.
 *
 * A `known` power changes AI behaviour even when it is never used, because
 * paranoia about an unseen vote is a real cost. See suspicionSweep().
 */

'use strict';

/* WRAPPED IN AN IIFE. See the note in rng.js: these load as plain script tags
   into one shared global scope. */
(function () {

const E = (typeof require !== 'undefined') ? require('./engine.js') : window.RH_ENGINE;

// ─── the pool ────────────────────────────────────────────────────────────────

const POWERS = {
  extra_vote: {
    id: 'extra_vote',
    name: 'Extra Vote',
    secrecy: 'known',
    playedAt: 'eviction',
    /* Worthless at Final 3, where there is no eviction vote left to double.
       Expires rather than lingering as a dead card in somebody's pocket. */
    minHouse: 5,
    blurb: 'Cast two votes at one eviction instead of one.',
    long: 'The count comes back one higher than the house expected. Everybody '
        + 'knows somebody has it. Nobody knows who.',
  },
  lose_vote: {
    id: 'lose_vote',
    name: 'Lose a Vote',
    secrecy: 'victim',        // the victim knows, the house does not
    playedAt: 'eviction',
    minHouse: 5,
    blurb: 'Silently stripped of your vote for one eviction.',
    long: 'You campaign all week like it matters. It does not, and you are the '
        + 'only one who knows.',
  },
  veto_pick: {
    id: 'veto_pick',
    name: 'Veto Player Selection',
    secrecy: 'public',
    playedAt: 'veto_draw',
    minHouse: 7,              // pointless once everybody plays the veto anyway
    blurb: 'Override the random draw and put one player in the Veto Comp.',
    long: 'You cannot hide who you chose. Every use of this makes one enemy on '
        + 'the record.',
  },
  diamond: {
    id: 'diamond',
    name: 'Diamond Veto',
    secrecy: 'hidden',
    playedAt: 'veto_ceremony',
    minHouse: 5,
    blurb: 'Remove a nominee and name the replacement yourself.',
    long: 'The Captain loses their renomination. When it fires, everybody knows '
        + 'exactly who did it and exactly who they were protecting.',
  },
  back_to_back: {
    id: 'back_to_back',
    name: 'Back to Back',
    secrecy: 'public',
    playedAt: 'captain_comp',
    minHouse: 6,
    blurb: 'Play in the Captain Comp you are barred from.',
    long: 'Everyone watches you walk into a competition you should not be in.',
  },
  safety: {
    id: 'safety',
    name: 'Week of Safety',
    secrecy: 'known',
    playedAt: 'naming',
    minHouse: 4,
    blurb: 'Cannot be named At Risk or evicted for one week.',
    long: 'The house knows it is out there. You decide whether being safe is '
        + 'worth more than being thought safe.',
  },
};

/*
 * Draw weights. `diamond` is deliberately the rarest: GDD §12 caps it at one
 * per game and it redirects a whole week from outside the Captaincy, which is
 * the strongest single effect in the file.
 *
 * `lose_vote` is NOT drawn here. It is never a standalone punishment, because a
 * power that only takes something away and gives the holder nothing is a bad
 * beat rather than a mechanic. It is attached as the PRICE of another power, in
 * award() below, which is the shape that makes it interesting: somebody in this
 * house accepted something, and somebody else is paying for it.
 */
const DRAW_WEIGHTS = {
  extra_vote: 22, veto_pick: 20, safety: 20, back_to_back: 16, diamond: 9,
};

const AWARD_WINDOW = [3, 10];
const POWER_COUNT_WEIGHTS = [18, 52, 30];   // 0, 1 or 2 powers per run
const LIFETIME_WEEKS = 3;                   // use it or lose it
const PRICE_CHANCE = 0.45;                  // odds a power costs somebody a vote

// ─── awarding ────────────────────────────────────────────────────────────────

function rollSchedule(rng) {
  const n = rng.weighted([0, 1, 2], POWER_COUNT_WEIGHTS);
  const kinds = Object.keys(DRAW_WEIGHTS);
  const out = [];
  const taken = {};
  for (let i = 0; i < n; i++) {
    const pool = kinds.filter((k) => !taken[k]);
    if (!pool.length) break;
    const kind = rng.weighted(pool, pool.map((k) => DRAW_WEIGHTS[k]));
    taken[kind] = true;
    let week, guard = 24;
    do { week = rng.int(AWARD_WINDOW[0], AWARD_WINDOW[1]); }
    while (out.some((o) => Math.abs(o.week - week) < 2) && guard-- > 0);
    out.push({ kind, week });
  }
  return out.sort((a, b) => a.week - b.week);
}

/**
 * Hand a power to somebody.
 *
 * Weighted AWAY from whoever currently holds the Captaincy and toward people
 * who have been sitting At Risk. A power that lands on the person already
 * running the week compounds an advantage; a power that lands on somebody who
 * has been on the block twice is a lever, and a lever is what makes a week
 * interesting. This is a deliberate thumb on the scale and it is the only one
 * in the file.
 */
function award(state, kind, rng) {
  const def = POWERS[kind];
  const active = state.cast.filter((p) => p.status === 'active');
  if (!def || active.length < def.minHouse) return null;

  const pool = active.filter((p) => p.id !== state.captain);
  if (!pool.length) return null;
  const weights = pool.map((p) => 1 + p.timesAtRisk * 0.8 + (p.weeksAsCaptain ? -0.4 : 0.3));
  const holder = rng.weighted(pool, weights);

  const power = {
    id: state.powers.length + 1,
    kind,
    holder: holder.id,
    secrecy: def.secrecy,
    awardedWeek: state.week,
    expiresWeek: state.week + LIFETIME_WEEKS,
    used: false, usedWeek: null, revealed: def.secrecy === 'public',
    victim: null,
  };

  /* The price. Somebody else quietly loses a vote for the week the power was
     handed out, which is what turns "I got something" into "somebody paid for
     this and does not know it yet". */
  if (rng.chance(PRICE_CHANCE) && active.length >= 6) {
    const victims = active.filter((p) => p.id !== holder.id && p.id !== state.captain);
    if (victims.length) power.victim = rng.pick(victims).id;
  }

  state.powers.push(power);
  return power;
}

// ─── queries the loop asks ───────────────────────────────────────────────────

const live = (state, kind) => state.powers.filter((p) =>
  p.kind === kind && !p.used && state.week <= p.expiresWeek);

function heldBy(state, id, kind) {
  return state.powers.filter((p) => p.holder === id && !p.used
    && (!kind || p.kind === kind) && state.week <= p.expiresWeek);
}

/** Does the house know SOMETHING is out there this week. Drives the hunt. */
function anyKnown(state) {
  return state.powers.some((p) => !p.used && state.week <= p.expiresWeek
    && (p.secrecy === 'known' || p.revealed));
}

function spend(state, power) {
  power.used = true;
  power.usedWeek = state.week;
  power.revealed = true;
}

/** Who is stripped of a vote this week. */
function voteStripped(state) {
  const out = {};
  for (const p of state.powers) {
    if (p.victim != null && p.awardedWeek === state.week) out[p.victim] = true;
  }
  return out;
}

/** Who is immune from nomination this week, because they burned Safety. */
function safeThisWeek(state) {
  const out = {};
  for (const p of state.powers) {
    if (p.kind === 'safety' && p.used && p.usedWeek === state.week) out[p.holder] = true;
  }
  return out;
}

// ─── AI policies ─────────────────────────────────────────────────────────────

/*
 * Every policy below returns a decision AND the reason for it, because the
 * recap has to be able to say "they played it because X". A policy that cannot
 * explain itself does not belong here.
 */

/**
 * Safety. Play it when you are actually named, which is the only unambiguous
 * moment. Before that, an AI holding it has to weigh sitting on it against the
 * chance the week never threatens them, and most people sit on it, which is
 * the correct and slightly frustrating truth about this power.
 */
function wantsSafety(state, id, rng) {
  if (state.atRisk.indexOf(id) !== -1) return { play: true, why: 'named At Risk' };
  const threat = E.threatScore(state.rel, state.cast, id, id, state.panel, state.alliances);
  const nervous = threat > 62 && state.cast[id].social.paranoia > 60;
  if (nervous && rng.chance(0.30)) return { play: true, why: 'read the week as coming for them' };
  return { play: false };
}

/**
 * Extra Vote. Worth burning only when the vote is close enough that one extra
 * changes it. The AI estimates the split from its own beliefs, so it can and
 * does misjudge, which is the whole point: a wasted Extra Vote is a real and
 * legible mistake.
 */
function wantsExtraVote(state, id, rng) {
  if (state.atRisk.length < 2) return { play: false };
  const voters = state.cast.filter((p) => p.status === 'active'
    && p.id !== state.captain && state.atRisk.indexOf(p.id) === -1);
  let a = 0, b = 0;
  for (const v of voters) {
    const s0 = E.evictScore(state, v.id, state.atRisk[0], rng);
    const s1 = E.evictScore(state, v.id, state.atRisk[1], rng);
    if (s0 > s1) a++; else b++;
  }
  const margin = Math.abs(a - b);
  /* One vote flips a tie or a one-vote gap and nothing else. */
  if (margin <= 1) return { play: true, why: 'read the room as one vote either way' };
  if (margin === 2 && rng.chance(0.35)) return { play: true, why: 'read it closer than it was' };
  return { play: false };
}

/**
 * Veto Player Selection. Public, so it costs an enemy every time. Worth it to
 * pull an ally off the block or to keep the biggest comp threat out of the
 * draw, and not worth it otherwise.
 */
function wantsVetoPick(state, id, rng, field) {
  const allies = E.allianceOf(state.alliances, id)
    .reduce((acc, al) => acc.concat(al.members), [])
    .filter((m) => m !== id);
  const atRiskAlly = state.atRisk.filter((t) => allies.indexOf(t) !== -1)[0];
  if (atRiskAlly != null && field.indexOf(atRiskAlly) === -1) {
    return { play: true, pick: atRiskAlly, why: 'put an ally in reach of saving themselves' };
  }
  if (state.atRisk.indexOf(id) !== -1) {
    const friend = allies.filter((m) => field.indexOf(m) === -1)
      .sort((x, y) => state.rel.trust[id][y] - state.rel.trust[id][x])[0];
    if (friend != null) return { play: true, pick: friend, why: 'wanted somebody in there who would use it on them' };
  }
  if (rng.chance(0.18)) {
    const pool = state.cast.filter((p) => p.status === 'active' && field.indexOf(p.id) === -1);
    if (pool.length) {
      const pick = pool.sort((x, y) => state.rel.trust[id][y.id] - state.rel.trust[id][x.id])[0];
      return { play: true, pick: pick.id, why: 'wanted a friendly face in the comp' };
    }
  }
  return { play: false };
}

/**
 * Diamond Veto. The big one. Play it when an ally is on the block AND there is
 * somebody the AI would rather see up there, because half its value is the
 * renomination and burning it to save someone with no replacement in mind
 * wastes the strongest card in the game.
 */
function wantsDiamond(state, id, rng) {
  const allies = E.allianceOf(state.alliances, id)
    .reduce((acc, al) => acc.concat(al.members), [])
    .filter((m) => m !== id);
  const selfUp = state.atRisk.indexOf(id) !== -1;
  const allyUp = state.atRisk.filter((t) => allies.indexOf(t) !== -1)[0];

  const save = selfUp ? id : (allyUp != null ? allyUp : null);
  if (save == null) return { play: false };

  const pool = state.cast.filter((p) => p.status === 'active'
    && p.id !== id && p.id !== save && p.id !== state.captain
    && state.atRisk.indexOf(p.id) === -1
    && allies.indexOf(p.id) === -1);
  if (!pool.length) return { play: false };

  const scored = pool.map((p) => ({ id: p.id, v: E.evictScore(state, id, p.id, rng) }));
  scored.sort((a, b) => b.v - a.v);
  return {
    play: true, save, replace: scored[0].id,
    why: selfUp ? 'was on the block and had somewhere to put the heat'
                : 'pulled an ally off and had a name ready',
  };
}

/** Back to Back is not a decision. If you hold it, you are playing. */
function wantsBackToBack(state, id) {
  if (state.lastCaptain !== id) return { play: false };
  return { play: true, why: 'was barred and walked in anyway' };
}

// ─── the cost of a known power ───────────────────────────────────────────────

/**
 * A `known` power that nobody can identify makes the whole house paranoid, and
 * that cost is real whether or not the power is ever played.
 *
 * Applied as a small, broad suspicion bump weighted by each reader's paranoia.
 * It is deliberately NOT aimed at the actual holder: the house has no idea who
 * has it, so the pressure lands on everybody, which is exactly what makes a
 * known power worth drawing.
 */
function suspicionSweep(state, rng) {
  if (!anyKnown(state)) return;
  const active = state.cast.filter((p) => p.status === 'active');
  for (const p of active) {
    const jumpy = p.social.paranoia / 100;
    for (const q of active) {
      if (p.id === q.id) continue;
      if (!rng.chance(0.22 * jumpy)) continue;
      state.rel.suspicion[p.id][q.id] = Math.min(100, state.rel.suspicion[p.id][q.id] + 4);
    }
  }
}

const api = {
  POWERS, DRAW_WEIGHTS, AWARD_WINDOW, LIFETIME_WEEKS, PRICE_CHANCE,
  rollSchedule, award, live, heldBy, anyKnown, spend, voteStripped, safeThisWeek,
  wantsSafety, wantsExtraVote, wantsVetoPick, wantsDiamond, wantsBackToBack,
  suspicionSweep,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.RH_POWERS = api;

})();
