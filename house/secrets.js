/* RunTheHouse, the information layer.
 *
 * Browser: window.RH_SECRETS. Node: require.
 *
 * GDD §20.
 *
 * THE PROBLEM THIS SOLVES. Before this file the game had exactly one verb for
 * information, `eavesdrop`, and it spent itself the instant it was used: you
 * listened at a door, your belief matrix updated, and the thing you learned was
 * gone. You could not hold it, choose a moment for it, or give it to anybody.
 * There was a `leak` action in run.js that was never wired to a button, and it
 * did not know WHAT was being leaked, only who it was about.
 *
 * That is the wrong shape for this format. Knowing a thing is not the power.
 * Knowing who it is worth something to, and picking the week to hand it over,
 * is the power, and it is the whole of how the quietest winners in the genre
 * actually won.
 *
 * So a secret is an object with a subject, a payload, an age, and a record of
 * who you have already told. It decays. It can be worthless to one person and
 * decisive to another. And handing it over can be traced back to you, which is
 * the entire risk: the only person who could have known that is you.
 *
 * SCOPE, STATED HONESTLY. This is a PLAYER inventory. The AI house already
 * moves information through socialTick, alliance leaks and the belief layer,
 * and giving sixteen AI a second parallel information economy is a much larger
 * change that would need its own calibration pass. The harness measures this
 * through policy.js driving the player's seat, which is the only seat that has
 * it. GDD §20 says so out loud rather than implying parity that is not there.
 */

'use strict';

/* WRAPPED IN AN IIFE, and it is not optional. See strings.js for the full
   account: plain script tags share one global scope and a colliding top level
   const kills the whole file silently. */
(function () {

const E = (typeof require !== 'undefined') ? require('./engine.js') : window.RH_ENGINE;

/*
 * Tuning. Sweepable, so it lives in one reachable object exactly like engine.K.
 * A number the harness cannot reach is a number that cannot be tuned.
 */
const K = {
  /* A read of how somebody felt a month ago is not information, it is history.
     Freshness ramps a secret's worth to zero over this many weeks. */
  STALE_WEEKS: 4,
  MAX_HELD: 14,             // the inventory is a hand, not a warehouse
  TELL_COST: 1,             // cheaper than a scene, because it IS the cheap move

  /* What a secret is worth to the person you are handing it to, before
     freshness. The spread is the mechanic: the same fact is decisive to one
     person and gossip to another, and finding the right ear is the play. */
  W_ABOUT_THEM: 1.00,       // it is about them. Nothing beats this
  W_ABOUT_ALLY: 0.55,       // it is about somebody they are in a room with
  W_ABOUT_THREAT: 0.45,     // it is about somebody they already fear
  W_BASE: 0.14,             // and otherwise it is something to say

  /* Split deliberately. See the payout block in tell() for why most of the
     value goes into debt and only a little into liking. */
  TRUST_PER_WORTH: 7,       // liking bought by a maximally useful secret
  TRUST_FLOOR: 2,           // even useless gossip is a conversation
  OWED_PER_WORTH: 26,       // and what they actually owe you for it

  /*
   * Traceability, and this is the cost that makes the whole thing a decision.
   *
   * If four people were in the room when it was said, telling somebody is safe.
   * If it was two people and a closed door, the subject works out who talked
   * roughly immediately. TRACE_NARROW is that: the fewer people who could have
   * known, the louder your fingerprints.
   */
  TRACE_BASE: 0.24,
  TRACE_NARROW: 0.30,
  TRACE_DECEPTION: 0.34,    // scaled by your deception, which is what it is for
  TRACE_LOYALTY: 0.22,      // a loyal listener protects their source
  D_TRACED: -26,            // what the subject thinks of you afterwards
  SUSPICION_TRACED: 26,

  /* Payload sizes, applied to the listener when a secret lands. */
  P_READ_SNAP: 0.80,        // how far their belief snaps toward the truth
  P_READ_TRUST: -17,        // and what hearing it does to how they feel
  P_READ_SUSPICION: 20,
  P_THIRD_PARTY: -6,        // hearing what somebody said about somebody else
  P_ROOM_BIAS: 9,           // finding out a group exists
  P_NAME_BIAS: 13,          // and finding out it has a name
  P_PAIR_BIAS: 10,
  P_INTENT_BIAS: 16,        // being told the Captain is coming for you
};

/*
 * Five kinds, and every one of them has a real source in run.js. A sixth,
 * "X lied to Y", was designed and cut before it shipped because there was no
 * honest way for the player to come by it: the detection roll fires when the
 * PLAYER lies, not when they catch somebody else at it. A kind with no source
 * is a dead branch in every switch below it.
 */
const KINDS = ['read', 'room', 'name', 'pair', 'intent'];

let SECRET_ID = 1;

/** Reset between runs so saved games and the harness agree on ids. */
function resetIds() { SECRET_ID = 1; }

/*
 * `about` is always the list of people the secret concerns, most important
 * first, because every worth and payload rule below reads about[0] as the
 * subject and about[1] as the object. Keeping that positional saves every
 * caller from inventing its own field names.
 */
function make(kind, about, week, extra) {
  return Object.assign({
    id: SECRET_ID++, kind, about: about.slice(), week,
    told: {}, burned: false,
  }, extra || {});
}

/** Newest first, and anything past its shelf life is dropped on the way out. */
function held(state) {
  const list = (state.secrets || []).filter((x) => !x.burned && !stale(state, x));
  return list.sort((a, b) => b.week - a.week);
}

function stale(state, sec) {
  return (state.week - sec.week) >= K.STALE_WEEKS;
}

function freshness(state, sec) {
  const age = state.week - sec.week;
  return Math.max(0, 1 - age / K.STALE_WEEKS);
}

/** Add, dedupe against what is already held, and keep the hand a hand. */
function learn(state, sec) {
  if (!state.secrets) state.secrets = [];
  const same = state.secrets.filter((x) => !x.burned && x.kind === sec.kind
    && x.about.join(',') === sec.about.join(','));
  /* Re-learning something you already know refreshes it rather than stacking a
     second copy, which is both true and stops the list filling with duplicates
     of the one alliance that keeps leaking. */
  if (same.length) { same[0].week = sec.week; same[0].value = sec.value; return same[0]; }
  state.secrets.push(sec);
  const live = state.secrets.filter((x) => !x.burned);
  if (live.length > K.MAX_HELD) {
    live.sort((a, b) => a.week - b.week);
    live[0].burned = true;      // you forget the oldest thing you were told
  }
  return sec;
}

/*
 * Does this person already know it? A secret they can see for themselves, or
 * that you have already handed them, is worth nothing and the UI has to be able
 * to say so rather than letting somebody spend a turn on it.
 */
function alreadyKnows(state, sec, listener) {
  if (sec.told[listener] != null) return true;
  if (sec.about.indexOf(listener) !== -1 && sec.kind !== 'read' && sec.kind !== 'intent') return true;
  if (sec.kind === 'room' || sec.kind === 'name') {
    const a = allianceFor(state, sec);
    if (!a) return true;                       // it died, there is nothing to tell
    if (a.members.indexOf(listener) !== -1) return true;
    if (a.known && a.known[listener] != null) return true;
  }
  if (sec.kind === 'pair') {
    const sm = pairFor(state, sec);
    if (!sm || !sm.alive) return true;
    if (sm.a === listener || sm.b === listener) return true;
    if (sm.known && sm.known[listener] != null) return true;
  }
  if (sec.kind === 'read' && sec.about[0] === listener) return true;  // they said it
  return false;
}

function allianceFor(state, sec) {
  return (state.alliances || []).filter((a) => a.alive && a.id === sec.ref)[0] || null;
}

function pairFor(state, sec) {
  return (state.showmances || []).filter((x) => x.a === sec.about[0] && x.b === sec.about[1])[0] || null;
}

/**
 * What this is worth to that person, 0 to 1.
 *
 * The whole design lives here. A secret has no intrinsic value; it has a value
 * to a listener, and the gap between the best ear and the worst is what makes
 * choosing an ear a decision rather than a formality.
 */
function worth(state, sec, listener) {
  if (alreadyKnows(state, sec, listener)) return 0;
  const fresh = freshness(state, sec);
  if (fresh <= 0) return 0;

  let w = K.W_BASE;
  const subject = sec.about[0], object = sec.about.length > 1 ? sec.about[1] : null;

  if (sec.kind === 'read') {
    /* Telling somebody what was said about THEM is the most valuable thing in
       this house, and it is worth more the worse it was. */
    if (object === listener) w = K.W_ABOUT_THEM * (0.55 + 0.45 * negativity(sec));
    else w = related(state, listener, [subject, object]);
  } else if (sec.kind === 'intent') {
    if (subject === listener) w = K.W_ABOUT_THEM;
    else w = related(state, listener, [subject]);
  } else if (sec.kind === 'room' || sec.kind === 'name') {
    const a = allianceFor(state, sec);
    const size = a ? a.members.length : 2;
    w = Math.min(1, (sec.kind === 'name' ? 0.55 : 0.42) + 0.10 * Math.max(0, size - 2));
    w = Math.max(w, related(state, listener, a ? a.members : sec.about));
  } else if (sec.kind === 'pair') {
    w = Math.max(0.45, related(state, listener, sec.about));
  }
  return Math.max(0, Math.min(1, w * fresh));
}

/** How negative the read was, 0 to 1. Bad news travels further. */
function negativity(sec) {
  const v = typeof sec.value === 'number' ? sec.value : 0;
  return E.clamp01((-v + 20) / 120);
}

/** Does the listener care about these people, either warmly or fearfully. */
function related(state, listener, ids) {
  let best = K.W_BASE;
  for (const id of ids) {
    if (id == null || id === listener) continue;
    if (E.sharedAlliances(state.alliances, listener, id).filter((a) => a.alive).length) {
      best = Math.max(best, K.W_ABOUT_ALLY);
    }
    const th = E.threatSeen(state, listener, id);
    if (th > 60) best = Math.max(best, K.W_ABOUT_THREAT * E.clamp01((th - 55) / 40));
  }
  return best;
}

/** The best ear in the house for this, so the UI can point at it. */
function bestEar(state, sec, pool) {
  let bestId = null, bestV = 0;
  for (const id of pool) {
    const v = worth(state, sec, id);
    if (v > bestV) { bestV = v; bestId = id; }
  }
  return { id: bestId, worth: bestV };
}

/**
 * How likely the subject is to work out that it came from you.
 *
 * `witnesses` is how many people could plausibly have known. A door you were
 * the only one behind is a signature.
 */
function traceChance(state, sec, teller, listener) {
  const cast = state.cast;
  const narrow = 1 / Math.max(1, sec.witnesses || 2);
  let p = K.TRACE_BASE
    + K.TRACE_NARROW * narrow
    - K.TRACE_DECEPTION * (cast[teller].social.deception / 100)
    - K.TRACE_LOYALTY * (cast[listener].social.loyalty / 100);
  return E.clamp(p, 0.02, 0.75);
}

/**
 * Hand it over. Returns what happened, for the feed to narrate.
 *
 * Every payload below routes into machinery that already exists: belief,
 * suspicion, threatBias, alliance.known, showmance.known. Nothing here is a
 * private side channel, which is why telling somebody something true actually
 * changes how they play rather than just paying out a trust delta.
 */
function tell(state, sec, teller, listener, rng) {
  const out = { kind: 'tell', secret: sec.kind, to: listener, about: sec.about.slice(), worth: 0 };
  /* Counted on the state so the harness can see the cost side without having
     to reconstruct it from the feed. */
  if (!state.tellStats) state.tellStats = { told: 0, traced: 0, worth: 0 };
  state.tellStats.told += 1;
  const w = worth(state, sec, listener);
  out.worth = w;
  sec.told[listener] = state.week;

  const rel = state.rel;
  const subject = sec.about[0], object = sec.about.length > 1 ? sec.about[1] : null;

  if (sec.kind === 'read' && object === listener) {
    /* The payload that matters: their read of that person snaps toward what
       was actually said, and they take it personally. */
    const truth = rel.trust[subject][listener];
    const b = rel.belief[listener][subject];
    b.v = E.clamp(b.v + (truth - b.v) * K.P_READ_SNAP, -100, 100);
    b.week = state.week; b.conf = 1;
    rel.lastWeek[listener][subject] = state.week;
    E.applyTrust(rel, listener, subject, K.P_READ_TRUST * (0.4 + 0.6 * negativity(sec)));
    rel.suspicion[listener][subject] = Math.min(100,
      rel.suspicion[listener][subject] + K.P_READ_SUSPICION * negativity(sec));
    out.landed = 'read_self';
  } else if (sec.kind === 'read') {
    E.applyTrust(rel, listener, subject, K.P_THIRD_PARTY * negativity(sec));
    out.landed = 'read_third';
  } else if (sec.kind === 'room' || sec.kind === 'name') {
    const a = allianceFor(state, sec);
    if (a) {
      a.known[listener] = state.week;
      const step = sec.kind === 'name' ? K.P_NAME_BIAS : K.P_ROOM_BIAS;
      for (const m of a.members) {
        if (m === listener) continue;
        rel.threatBias[listener][m] = E.clamp(rel.threatBias[listener][m] + step, -40, 40);
      }
      out.landed = sec.kind === 'name' ? 'name' : 'room';
      out.members = a.members.slice();
      out.name = a.name || null;
    }
  } else if (sec.kind === 'pair') {
    const sm = pairFor(state, sec);
    if (sm && sm.alive) {
      sm.known[listener] = state.week;
      for (const m of [sm.a, sm.b]) {
        if (m === listener) continue;
        rel.threatBias[listener][m] = E.clamp(rel.threatBias[listener][m] + K.P_PAIR_BIAS, -40, 40);
      }
      out.landed = 'pair';
    }
  } else if (sec.kind === 'intent') {
    if (subject === listener && sec.value != null) {
      rel.threatBias[listener][sec.value] = E.clamp(
        rel.threatBias[listener][sec.value] + K.P_INTENT_BIAS, -40, 40);
      E.applyTrust(rel, listener, sec.value, -10);
    }
    out.landed = 'intent';
  }

  /*
   * WHAT IT BUYS YOU, and most of it is not affection.
   *
   * MEASURED. Paying this entirely in trust produced no effect on where the
   * player finished at 800 paired seeds, because trust feeds socialReach feeds
   * threatScore: being better liked makes you a bigger target at almost the
   * same rate it makes you safer. See the owed matrix in engine.js for the
   * numbers. Being useful is the quantity that actually protects somebody in
   * this format, so that is what a good secret pays into. The small trust
   * component is there because it is still a conversation.
   */
  const gain = K.TRUST_FLOOR + K.TRUST_PER_WORTH * w;
  E.applyTrust(rel, listener, teller, gain);
  out.gain = gain;
  if (rel.owed) {
    rel.owed[listener][teller] = Math.min(E.K.OWED_MAX,
      rel.owed[listener][teller] + K.OWED_PER_WORTH * w);
  }
  state.tellStats.worth += w;

  /*
   * And what it can cost you. The person who comes looking is whoever had a
   * reason to keep it quiet, which is NOT always about[0]: for an intent
   * secret about[0] is the target, who is usually the person you just told, and
   * the one who minds is the Captain whose plan you just handed over.
   */
  const mark = sec.kind === 'intent' ? sec.value : (sec.kind === 'read' ? subject : sec.about[0]);
  if (mark != null && mark !== listener && mark !== teller
    && state.cast[mark].status === 'active' && rng.chance(traceChance(state, sec, teller, listener))) {
    out.traced = mark;
    state.tellStats.traced += 1;
    E.applyTrust(rel, mark, teller, K.D_TRACED);
    rel.suspicion[mark][teller] = Math.min(100, rel.suspicion[mark][teller] + K.SUSPICION_TRACED);
  }
  return out;
}

const api = { K, KINDS, make, learn, held, worth, bestEar, alreadyKnows, tell,
  freshness, stale, traceChance, allianceFor, pairFor, resetIds };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.RH_SECRETS = api;

})();
