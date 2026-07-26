/* RunTheHouse, the week loop.
 *
 * Headless and dependency-free. Browser: window.RH_RUN. Node: require.
 *
 * GDD §3. One `step()` per phase, so the same state machine drives the UI, the
 * text playtest and the thousand-run harness. The human seat can be played by
 * an AI stand-in (`autoPlayer`), which is what lets simulator.js run a house
 * with nobody at the keyboard.
 *
 * Everything that varies late in the game keys off the number of ACTIVE players
 * rather than the week number, because Bounce Back adds a week and Double
 * Eviction removes one. Week 13 is Final 4 in a clean run and is not in a run
 * where both twists fired, and code that trusted the week number would be
 * quietly wrong in a third of all runs.
 */

'use strict';

const RNG = (typeof require !== 'undefined') ? require('./rng.js') : window.RH_RNG;
const T = (typeof require !== 'undefined') ? require('./tree.js') : window.RH_TREE;
const G = (typeof require !== 'undefined') ? require('./generate.js') : window.RH_GEN;
const E = (typeof require !== 'undefined') ? require('./engine.js') : window.RH_ENGINE;
const C = (typeof require !== 'undefined') ? require('./comps.js') : window.RH_COMPS;

const PHASES = {
  SETUP: 'setup',
  MOVE_IN: 'move_in',
  RESET: 'reset',
  CAPTAIN_COMP: 'captain_comp',
  SCHEME1: 'scheme1',
  NAMING: 'naming',
  VETO_COMP: 'veto_comp',
  SCHEME2: 'scheme2',
  VETO_CEREMONY: 'veto_ceremony',
  SCHEME3: 'scheme3',
  EVICTION: 'eviction',
  FALLOUT: 'fallout',
  FINAL3: 'final3',
  PANEL: 'panel',
  OVER: 'over',
};

/* GDD §12. Double Eviction every run, Bounce Back a third of the time, plus at
   most one flavour twist. Version 0.1's "one twist per run" is gone. */
const TWIST_WINDOWS = {
  double: [5, 9],
  bounce: [6, 10],
};
const BOUNCE_CHANCE = 0.33;
const FLAVOUR = ['silent', 'envelope'];   // split_house is unspecified, GDD §18
const FLAVOUR_CHANCE = 0.5;
const BOUNCE_POOL = 6;                    // last six evicted, GDD §12

// ─── setup ───────────────────────────────────────────────────────────────────

/**
 * @param opts.seed        string, shareable. Random if absent.
 * @param opts.account     the human's saved account, or null for a default one.
 * @param opts.autoPlayer  play the human seat with an AI. Used by the harness.
 */
function createRun(opts) {
  const o = opts || {};
  const seed = String(o.seed != null ? o.seed : RNG.randomSeed());
  const rng = RNG.createStreams(seed);

  const account = o.account || defaultAccount();
  const human = G.playerFromAccount(account, rng.gen);
  const cast = G.generateCast(rng.gen, human, { size: o.size || 16 });
  const baselines = G.generateBaselines(rng.gen, cast);
  const rel = E.createRelationships(rng.gen, cast, baselines);

  const state = {
    seed,
    levelBracket: Math.floor(T.levelForXp(account.xp || 0) / 10),
    rng,
    account,
    cast,
    rel,
    alliances: [],
    panel: [],
    week: 0,
    phase: PHASES.SETUP,
    captain: null,
    lastCaptain: null,
    atRisk: [],
    atRiskNamedBy: {},
    vetoHolder: null,
    vetoUsed: false,
    replacement: null,
    voteIntent: {},
    expectedSafe: {},
    rations: [],
    evictionOrder: [],
    lastCompId: null,
    autoPlayer: !!o.autoPlayer,
    actionsLeft: 0,
    schemeIndex: 0,
    twists: rollTwists(rng.gen),
    doubleSecondLeg: false,
    log: [],
    weeks: [],
    events: [],
    result: null,
  };

  state.human = human.id;
  return state;
}

function defaultAccount() {
  return { name: 'You', gender: 'x', hometown: 'Portland, ME', region: 'northeast', owned: ['floor.root'], xp: 0 };
}

function rollTwists(rng) {
  const out = {};
  out.double = rng.int(TWIST_WINDOWS.double[0], TWIST_WINDOWS.double[1]);
  if (rng.chance(BOUNCE_CHANCE)) {
    let w, guard = 20;
    do { w = rng.int(TWIST_WINDOWS.bounce[0], TWIST_WINDOWS.bounce[1]); }
    while (Math.abs(w - out.double) < 2 && guard-- > 0);
    out.bounce = w;
  }
  if (rng.chance(FLAVOUR_CHANCE)) {
    out.flavour = rng.pick(FLAVOUR);
    out.flavourWeek = rng.int(3, 11);
  }
  return out;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const activeIds = (s) => s.cast.filter((p) => p.status === 'active').map((p) => p.id);
const activeCount = (s) => activeIds(s).length;
const isHumanActive = (s) => s.cast[s.human].status === 'active' && !s.autoPlayer;
const name = (s, id) => s.cast[id].first;

/** Who may vote: everyone active except the Captain and the two At Risk. */
function eligibleVoters(s) {
  return activeIds(s).filter((id) => id !== s.captain && s.atRisk.indexOf(id) === -1);
}

/** Who may play for Captain: everyone active except the outgoing one. */
function captainCompField(s) {
  const ids = activeIds(s);
  /* The bar lifts at Final 4, where three eligible players is already thin and
     the GDD's Final 4 rules put all four in the veto anyway. */
  if (ids.length <= 4) return ids;
  return ids.filter((id) => id !== s.lastCaptain);
}

/**
 * Veto field. GDD §3: HC, both At Risk, plus three drawn. From Final 6 down the
 * draw is dropped and everybody plays, because "plus three drawn" is exactly
 * the whole house at Final 6 and oversubscribed at Final 5.
 */
function vetoField(s, rng) {
  const ids = activeIds(s);
  if (ids.length <= 6) return ids;
  const core = [s.captain].concat(s.atRisk);
  const pool = ids.filter((id) => core.indexOf(id) === -1);
  rng.shuffle(pool);
  return core.concat(pool.slice(0, 3));
}

/**
 * Provisional finishing place, for anything that wants to show a number mid-run.
 * The authoritative assignment is finalisePlaces() at the end.
 */
function nextPlace(s) {
  return s.cast.length - s.evictionOrder.length;
}

/**
 * Places, assigned once from the elimination ORDER rather than accumulated
 * during the run.
 *
 * Bounce Back is why. A returnee frees a place in the MIDDLE of the sequence,
 * not at the boundary, so no running counter can stay correct: measured at 85
 * broken runs in 300, all of them bounce runs. Santiago going out sixth, coming
 * back, and going out twelfth means everyone eliminated between those two dates
 * shifts down one, and the only thing that knows that is the order itself.
 *
 * A player eliminated twice appears once, at their LAST elimination, which is
 * also the rule the Panel membership uses.
 */
function finalisePlaces(s) {
  const n = s.cast.length;
  s.evictionOrder.forEach((id, i) => { s.cast[id].place = n - i; });
  const left = activeIds(s);
  if (left.length === 2 && s.result) {
    s.cast[s.result.winner].place = 1;
    s.cast[s.result.runnerUp].place = 2;
  }
}

function pushEvent(s, kind, data) {
  s.events.push(Object.assign({ week: s.week, phase: s.phase, kind }, data || {}));
}

// ─── what the UI has to ask for ──────────────────────────────────────────────

/**
 * Null when the phase resolves itself. Otherwise a descriptor telling the UI
 * exactly what input `step` is waiting on. The harness never sees a non-null
 * return because autoPlayer answers everything internally.
 */
function needsInput(s) {
  if (!isHumanActive(s)) return null;
  const me = s.human;
  switch (s.phase) {
    case PHASES.MOVE_IN:
      return { kind: 'move_in' };
    case PHASES.CAPTAIN_COMP:
      return captainCompField(s).indexOf(me) !== -1 ? { kind: 'comp', which: 'captain', comp: s.pendingComp } : null;
    case PHASES.SCHEME1: case PHASES.SCHEME2: case PHASES.SCHEME3:
      return { kind: 'actions', left: s.actionsLeft, phase: s.phase };
    case PHASES.NAMING:
      return s.captain === me ? { kind: 'naming', pool: activeIds(s).filter((i) => i !== me) } : null;
    case PHASES.VETO_COMP:
      return s.vetoFieldIds && s.vetoFieldIds.indexOf(me) !== -1
        ? { kind: 'comp', which: 'veto', comp: s.pendingComp } : null;
    case PHASES.VETO_CEREMONY:
      if (s.vetoHolder === me) return { kind: 'veto_use', atRisk: s.atRisk.slice() };
      if (s.captain === me && s.pendingReplacement) return { kind: 'replacement', pool: s.replacementPool.slice() };
      return null;
    case PHASES.EVICTION:
      return eligibleVoters(s).indexOf(me) !== -1 ? { kind: 'vote', atRisk: s.atRisk.slice() } : null;
    case PHASES.FINAL3:
      return s.final3Winner === me ? { kind: 'final3_pick', pool: activeIds(s).filter((i) => i !== me) } : null;
    case PHASES.PANEL:
      return activeIds(s).indexOf(me) !== -1 ? { kind: 'framing' } : null;
    default:
      return null;
  }
}

// ─── the machine ─────────────────────────────────────────────────────────────

/**
 * Advance exactly one phase. `input` answers whatever needsInput() asked for.
 * Returns the state so callers can chain.
 */
function step(s, input) {
  switch (s.phase) {
    case PHASES.SETUP:      return doSetup(s);
    case PHASES.MOVE_IN:    return doMoveIn(s, input);
    case PHASES.RESET:      return doReset(s);
    case PHASES.CAPTAIN_COMP: return doCaptainComp(s, input);
    case PHASES.SCHEME1:
    case PHASES.SCHEME2:
    case PHASES.SCHEME3:    return doScheme(s, input);
    case PHASES.NAMING:     return doNaming(s, input);
    case PHASES.VETO_COMP:  return doVetoComp(s, input);
    case PHASES.VETO_CEREMONY: return doVetoCeremony(s, input);
    case PHASES.EVICTION:   return doEviction(s, input);
    case PHASES.FALLOUT:    return doFallout(s);
    case PHASES.FINAL3:     return doFinal3(s, input);
    case PHASES.PANEL:      return doPanel(s, input);
    default:                return s;
  }
}

function doSetup(s) {
  s.phase = PHASES.MOVE_IN;
  return s;
}

/**
 * GDD §4. Move In Night exists so that a level 1 account is not socially poorer
 * than a level 60 one. The on-ramp to being liked is a conversation, not a
 * stat, and the choices here seed the player's starting trust across the house.
 */
function doMoveIn(s, input) {
  const rng = s.rng.ai;
  const me = s.human;
  const choice = (input && input.choice) || 'open';

  /* Three postures, three shapes of first impression. None is strictly best:
     `open` is broad and shallow, `guarded` is narrow and durable, `funny` is
     high variance and reads differently to different archetypes. */
  for (const p of s.cast) {
    if (p.id === me) continue;
    let d = 0;
    if (choice === 'open') d = rng.range(4, 12);
    else if (choice === 'guarded') d = rng.range(-2, 7) + (p.social.loyalty - 50) * 0.10;
    else if (choice === 'funny') d = rng.range(-8, 20) * (0.5 + p.social.charisma / 150);
    E.applyTrust(s.rel, p.id, me, d);
    E.applyTrust(s.rel, me, p.id, rng.range(2, 8));
    E.refreshBelief(s.rel, s.cast, me, p.id, 0, rng);
    E.refreshBelief(s.rel, s.cast, p.id, me, 0, rng);
  }
  pushEvent(s, 'move_in', { choice });
  s.phase = PHASES.RESET;
  return s;
}

function doReset(s) {
  const rng = s.rng.ai;
  s.week += 1;
  s.doubleSecondLeg = false;
  s.voteIntent = {};
  s.expectedSafe = {};
  s.atRiskNamedBy = {};
  s.vetoHolder = null;
  s.vetoUsed = false;
  s.replacement = null;
  s.pendingReplacement = false;

  /* Bounce Back, GDD §12. Pool is the last six evicted whether or not the Panel
     has started forming, which is the fix for version 0.1 calling the returnee
     "a Panel member" in a week where the Panel does not exist yet. */
  if (s.twists.bounce === s.week) {
    const pool = s.cast
      .filter((p) => p.status !== 'active')
      .sort((a, b) => b.evictedWeek - a.evictedWeek)
      .slice(0, BOUNCE_POOL);
    if (pool.length) {
      const comp = C.pickComp(s.rng.comp, s.lastCompId);
      const res = C.runComp(s, comp, pool.map((p) => p.id), s.rng.comp, null, new Set());
      const back = s.cast[res.winner];
      back.status = 'active';
      back.returned = true;
      back.evictedWeek = null;
      /* Clear the finishing place they were given on the way out. Leaving it
         set means the next person evicted is handed the same number and the run
         ends with two twelfth places and no fourteenth. */
      back.place = null;
      s.panel = s.panel.filter((id) => id !== back.id);
      s.evictionOrder = s.evictionOrder.filter((id) => id !== back.id);
      /* Coming back does not restore what the house felt about you when you
         left, and everyone who voted you out now has a live problem. */
      pushEvent(s, 'bounce_back', { who: back.id, comp: comp.id });
    }
  }

  E.decayWeek(s.rel, s.cast, s.week);
  E.socialTick(s, rng);
  E.allianceTick(s, rng);

  s.phase = activeCount(s) === 3 ? PHASES.FINAL3 : PHASES.CAPTAIN_COMP;
  return s;
}

function doCaptainComp(s, input) {
  const rng = s.rng.comp;
  const field = captainCompField(s);

  if (!s.pendingComp) s.pendingComp = C.pickComp(rng, s.lastCompId);
  const comp = s.pendingComp;

  const throws = new Set();
  for (const id of field) {
    const p = s.cast[id];
    if (p.isHuman && !s.autoPlayer) continue;
    if (C.aiWantsToThrow(s, id, 'captain', s.rng.ai)) throws.add(id);
  }
  let perf = null;
  if (field.indexOf(s.human) !== -1 && isHumanActive(s)) {
    if (input && input.throw) throws.add(s.human);
    else perf = (input && input.perf != null) ? input.perf : 50;
  }

  const res = C.runComp(s, comp, field, rng, perf, throws);
  C.recordComp(s, res, s.week);

  s.lastCaptain = s.captain;
  s.captain = res.winner;
  s.cast[s.captain].weeksAsCaptain += 1;
  s.lastCompId = comp.id;
  s.pendingComp = null;

  /* Rations, GDD §10: the bottom finishers. A thrown comp lands you here, which
     is what makes throwing cost something even when it works. */
  for (const p of s.cast) p.onRations = false;
  s.rations = C.rationsFrom(res, E.K.RATIONS_COUNT);
  for (const id of s.rations) s.cast[id].onRations = true;

  s.captainResult = res;
  pushEvent(s, 'captain', { winner: res.winner, comp: comp.id, thrown: res.thrown, rations: s.rations.slice() });

  s.schemeIndex = 0;
  s.actionsLeft = s.doubleSecondLeg ? 1 : E.K.PLAYER_ACTIONS[0];
  s.phase = s.doubleSecondLeg ? PHASES.NAMING : PHASES.SCHEME1;
  return s;
}

/**
 * Scheming. The AI spend their budget in the weekly social tick, so this phase
 * is the player's alone; stepping it with no actions left moves on.
 */
function doScheme(s, input) {
  if (isHumanActive(s) && input && input.action && s.actionsLeft > 0) {
    performAction(s, input.action);
    s.actionsLeft -= 1;
    if (s.actionsLeft > 0) return s;
  }
  if (isHumanActive(s) && s.actionsLeft > 0 && !(input && input.done)) return s;

  if (s.phase === PHASES.SCHEME1) { s.phase = PHASES.NAMING; return s; }
  if (s.phase === PHASES.SCHEME2) { s.phase = PHASES.VETO_CEREMONY; return s; }
  s.phase = PHASES.EVICTION;
  return s;
}

function doNaming(s, input) {
  const rng = s.rng.ai;
  const n = activeCount(s);

  let noms;
  if (s.captain === s.human && isHumanActive(s) && input && input.noms) {
    noms = input.noms.slice(0, 2);
  } else {
    noms = E.chooseNominations(s, s.captain, rng);
  }
  s.atRisk = noms;
  for (const id of noms) {
    s.cast[id].timesAtRisk += 1;
    s.atRiskNamedBy[id] = s.captain;
    s.cast[id].namedBy.push(s.captain);
    E.applyTrust(s.rel, id, s.captain, E.K.D_NAMED_AT_RISK);
  }

  /* Each alliance decides who it wants gone, which is what alliancePressure
     reads in the vote. */
  for (const a of s.alliances) {
    if (!a.alive) continue;
    let best = null, bestV = -Infinity;
    for (const t of s.atRisk) {
      if (a.members.indexOf(t) !== -1) continue;
      let v = 0;
      for (const m of a.members) v += E.evictScore(s, m, t, rng);
      if (v > bestV) { bestV = v; best = t; }
    }
    a.target = best;
  }

  pushEvent(s, 'naming', { captain: s.captain, atRisk: noms.slice() });

  s.vetoFieldIds = vetoField(s, rng);
  s.phase = PHASES.VETO_COMP;
  return s;
}

function doVetoComp(s, input) {
  const rng = s.rng.comp;
  const field = s.vetoFieldIds || vetoField(s, rng);
  if (!s.pendingComp) s.pendingComp = C.pickComp(rng, s.lastCompId);
  const comp = s.pendingComp;

  const throws = new Set();
  for (const id of field) {
    const p = s.cast[id];
    if (p.isHuman && !s.autoPlayer) continue;
    if (C.aiWantsToThrow(s, id, 'veto', s.rng.ai)) throws.add(id);
  }
  let perf = null;
  if (field.indexOf(s.human) !== -1 && isHumanActive(s)) {
    if (input && input.throw) throws.add(s.human);
    else perf = (input && input.perf != null) ? input.perf : 50;
  }

  const res = C.runComp(s, comp, field, rng, perf, throws);
  /* Veto wins count as comp wins for the threat model. Power is power, and the
     house does not distinguish. */
  C.recordComp(s, res, s.week);
  s.vetoHolder = res.winner;
  s.lastCompId = comp.id;
  s.pendingComp = null;
  s.vetoResult = res;

  pushEvent(s, 'veto_comp', { winner: res.winner, comp: comp.id, thrown: res.thrown });

  s.schemeIndex = 1;
  s.actionsLeft = s.doubleSecondLeg ? 0 : E.K.PLAYER_ACTIONS[1];
  s.phase = s.doubleSecondLeg ? PHASES.VETO_CEREMONY : PHASES.SCHEME2;
  return s;
}

/**
 * GDD §3. The veto holder cannot be named as the replacement, which is what
 * makes Final 4 resolvable at all.
 */
function doVetoCeremony(s, input) {
  const rng = s.rng.ai;
  const holder = s.vetoHolder;
  const n = activeCount(s);

  if (!s.pendingReplacement) {
    let saveId = null;
    if (holder === s.human && isHumanActive(s)) {
      saveId = (input && input.save != null) ? input.save : null;
    } else {
      saveId = aiVetoChoice(s, holder, rng);
    }

    if (saveId != null && s.atRisk.indexOf(saveId) !== -1) {
      s.vetoUsed = true;
      s.atRisk = s.atRisk.filter((id) => id !== saveId);
      s.saved = saveId;
      E.applyTrust(s.rel, saveId, holder, E.K.D_VETO_SAVE);

      /* The pool excludes the Captain, the veto holder, anyone still At Risk,
         AND the person just saved. Leaving the saved player in produced
         "veto used on Alina, replacement Alina", which is not a ceremony, it is
         a no-op with extra steps. */
      s.replacementPool = activeIds(s).filter((id) =>
        id !== s.captain && id !== holder && id !== saveId && s.atRisk.indexOf(id) === -1);

      if (s.replacementPool.length) {
        s.pendingReplacement = true;
        if (s.captain === s.human && isHumanActive(s)) return s;   // wait for input
        return doVetoCeremony(s, null);
      }
    }
    pushEvent(s, 'veto', { holder, used: s.vetoUsed, saved: s.saved || null });
    return afterCeremony(s);
  }

  let repl;
  if (s.captain === s.human && isHumanActive(s) && input && input.replacement != null) {
    repl = input.replacement;
  } else {
    const scored = s.replacementPool.map((id) => ({ id, v: E.nominationDesire(s, s.captain, id, rng) }));
    scored.sort((a, b) => b.v - a.v);
    repl = scored[0].id;
  }
  s.replacement = repl;
  s.atRisk.push(repl);
  s.cast[repl].timesAtRisk += 1;
  s.atRiskNamedBy[repl] = s.captain;
  s.cast[repl].namedBy.push(s.captain);
  E.applyTrust(s.rel, repl, s.captain, E.K.D_NAMED_AT_RISK);
  s.pendingReplacement = false;

  for (const a of s.alliances) {
    if (!a.alive) continue;
    if (a.target != null && s.atRisk.indexOf(a.target) === -1) a.target = null;
  }

  pushEvent(s, 'veto', { holder, used: s.vetoUsed, saved: s.saved || null, replacement: repl });
  return afterCeremony(s);
}

/**
 * Every eligible voter tells somebody how they are going to vote.
 *
 * This was the hole that made the entire Fallout phase inert. `voteIntent` was
 * only ever written by the player's Pitch action, so in a headless run nobody
 * had promised anything, no vote could contradict a promise, `assignBlame` had
 * nothing to work with, and the harness measured zero blindsides in six hundred
 * runs. The drama engine was wired up and switched off.
 *
 * What they SAY here and what they DO at the vote are computed separately, and
 * that gap is the whole mechanic. A voter sitting in two alliances that want
 * different people gone has their alliance pressure cancel out, so trust and
 * threat decide it instead, and one of the two rooms they promised gets lied
 * to. GDD §5.3 called overlapping membership the engine of drama. This is where
 * it actually turns.
 */
function declareIntents(s, rng) {
  for (const v of eligibleVoters(s)) {
    if (v === s.human && isHumanActive(s)) continue;
    const mine = E.allianceOf(s.alliances, v).filter((a) => a.target != null);
    if (mine.length) {
      /* You promise the room with the most hold over you. */
      mine.sort((a, b) => (b.strength * (b.priority[v] || 0.5)) - (a.strength * (a.priority[v] || 0.5)));
      s.voteIntent[v] = mine[0].target;
    } else if (rng.chance(0.45)) {
      /* No alliance, but somebody asked and they answered. An unaffiliated
         voter still gives their word about half the time. */
      const sc = s.atRisk.map((t) => ({ t, x: E.evictScore(s, v, t, rng) }));
      sc.sort((a, b) => b.x - a.x);
      s.voteIntent[v] = sc[0].t;
    }
  }
}

function afterCeremony(s) {
  s.schemeIndex = 2;
  s.actionsLeft = s.doubleSecondLeg ? 1 : E.K.PLAYER_ACTIONS[2];
  declareIntents(s, s.rng.ai);

  /* Everyone forms an expectation of safety. Being wrong about it is what
     "blindsided" means, and it is what feeds bitterness on the Panel. */
  for (const id of activeIds(s)) {
    if (s.atRisk.indexOf(id) === -1) continue;
    let friends = 0;
    for (const v of eligibleVoters(s)) if (s.rel.belief[id][v].v > 30) friends++;
    s.expectedSafe[id] = friends > eligibleVoters(s).length / 2;
  }

  s.phase = s.doubleSecondLeg ? PHASES.EVICTION : PHASES.SCHEME3;
  return s;
}

function aiVetoChoice(s, holder, rng) {
  /* Save yourself. Nobody in the history of this format has done otherwise for
     a good reason, and the AI should not be the first. */
  if (s.atRisk.indexOf(holder) !== -1) return holder;

  /* Final 4 exception. A veto holder who is not At Risk is already guaranteed
     Final 3, so using it only reshuffles who the Captain evicts and costs them
     cover for nothing. The noms stand. */
  if (activeCount(s) === 4) return null;

  let best = null, bestV = 0;
  for (const t of s.atRisk) {
    const bond = E.sharedAlliances(s.alliances, holder, t)
      .reduce((v, a) => v + a.strength * (a.priority[holder] || 0.5), 0);
    const v = s.rel.trust[holder][t] + bond * 0.6;
    if (v > bestV) { bestV = v; best = t; }
  }
  /* Using it costs you cover with the Captain, so it takes a real relationship
     rather than mild warmth. */
  return bestV > 70 ? best : null;
}

function doEviction(s, input) {
  const rng = s.rng.ai;
  const n = activeCount(s);
  let result;

  /* A ceremony can leave one person At Risk when there is nobody legal to put
     up beside them. No vote is needed and none is held. */
  if (s.atRisk.length === 1) {
    const t = s.atRisk[0];
    s.evictionResult = { votes: [], tally: { [t]: 0 }, evicted: t, tieBreak: null, unopposed: true };
    s.phase = PHASES.FALLOUT;
    return s;
  }

  if (n === 4) {
    /* GDD §3, Final 4: the Captain casts the sole vote, in all cases. The veto
       holder is safe and advances. */
    const target = (s.captain === s.human && isHumanActive(s) && input && input.vote != null)
      ? input.vote
      : (() => {
          const sc = s.atRisk.map((t) => ({ t, v: E.evictScore(s, s.captain, t, rng) }));
          sc.sort((a, b) => b.v - a.v);
          return sc[0].t;
        })();
    const tally = {}; s.atRisk.forEach((t) => { tally[t] = t === target ? 1 : 0; });
    result = { votes: [{ voter: s.captain, target, promisedTarget: s.voteIntent[s.captain] != null ? s.voteIntent[s.captain] : null }], tally, evicted: target, tieBreak: null, soleVote: s.captain };
  } else {
    const voters = eligibleVoters(s);
    if (isHumanActive(s) && voters.indexOf(s.human) !== -1) {
      const choice = (input && input.vote != null) ? input.vote : s.atRisk[0];
      s.forcedVote = { voter: s.human, target: choice };
    }
    const aiVoters = voters.filter((v) => !(s.forcedVote && v === s.forcedVote.voter));
    result = E.resolveEviction(s, s.atRisk, aiVoters, rng);
    if (s.forcedVote) {
      result.votes.push({ voter: s.forcedVote.voter, target: s.forcedVote.target, promisedTarget: null });
      result.tally[s.forcedVote.target] = (result.tally[s.forcedVote.target] || 0) + 1;
      let top = -1, tied = [];
      for (const t of s.atRisk) {
        if (result.tally[t] > top) { top = result.tally[t]; tied = [t]; }
        else if (result.tally[t] === top) tied.push(t);
      }
      if (tied.length > 1) {
        const sc = tied.map((t) => ({ t, v: E.evictScore(s, s.captain, t, rng) }));
        sc.sort((a, b) => b.v - a.v);
        result.evicted = sc[0].t; result.tieBreak = s.captain;
      } else result.evicted = tied[0];
      s.forcedVote = null;
    }
  }

  s.evictionResult = result;
  s.phase = PHASES.FALLOUT;
  return s;
}

function doFallout(s) {
  const rng = s.rng.ai;
  const result = s.evictionResult;
  const gone = result.evicted;

  /* Trust moves on what people BELIEVE happened. Votes are anonymous, so the
     only certain thing is the tally. */
  for (const v of result.votes) {
    if (v.target === gone) E.applyTrust(s.rel, gone, v.voter, E.K.D_VOTED_OUT * 0.35);
    else E.applyTrust(s.rel, gone, v.voter, E.K.D_VOTED_KEEP);
  }
  const blame = E.assignBlame(s, result, rng);

  /* Place is read BEFORE the status flips, or everyone finishes one spot
     better than they did: the Final 4 boot was coming out as third. */
  const p = s.cast[gone];
  s.evictionOrder = s.evictionOrder.filter((id) => id !== gone);
  s.evictionOrder.push(gone);
  p.place = nextPlace(s);
  p.status = 'evicted';
  p.evictedWeek = s.week;
  p.bitterness = E.computeBitterness(s, gone, result);

  s.panel.push(gone);
  while (s.panel.length > E.K.PANEL_SIZE) {
    const dropped = s.panel.shift();
    s.cast[dropped].status = 'evicted';
  }
  for (const id of s.panel) s.cast[id].status = 'panel';

  s.weeks.push({
    week: s.week,
    captain: s.captain,
    atRisk: s.atRisk.slice(),
    vetoHolder: s.vetoHolder,
    vetoUsed: s.vetoUsed,
    replacement: s.replacement,
    tally: result.tally,
    votes: result.votes,
    evicted: gone,
    tieBreak: result.tieBreak || null,
    soleVote: result.soleVote || null,
    blame,
    rations: s.rations.slice(),
    leg: s.doubleSecondLeg ? 2 : 1,
  });
  pushEvent(s, 'eviction', { evicted: gone, tally: result.tally, tieBreak: result.tieBreak || null });

  const n = activeCount(s);
  if (n === 2) { s.phase = PHASES.PANEL; return s; }
  /* Final 3 is its OWN week, GDD §3, which is why a clean run is fourteen weeks
     and not thirteen. Routing straight to FINAL3 here ran the finale inside the
     Final 4 week and lost a week off every run. */
  if (n === 3) { s.phase = PHASES.RESET; return s; }

  /* Double Eviction: the second leg runs immediately, compressed. */
  if (s.twists.double === s.week && !s.doubleSecondLeg && n > 4) {
    s.doubleSecondLeg = true;
    s.voteIntent = {};
    s.atRisk = [];
    s.vetoHolder = null; s.vetoUsed = false; s.replacement = null; s.saved = null;
    s.phase = PHASES.CAPTAIN_COMP;
    pushEvent(s, 'double_eviction', {});
    return s;
  }

  s.phase = PHASES.RESET;
  return s;
}

/** GDD §3. Three part comp, winner picks who sits beside them. No veto. */
function doFinal3(s, input) {
  const rng = s.rng.comp;
  const ids = activeIds(s);

  if (!s.final3Winner) {
    let points = {}; ids.forEach((i) => { points[i] = 0; });
    for (let leg = 0; leg < 3; leg++) {
      const comp = C.pickComp(rng, s.lastCompId);
      s.lastCompId = comp.id;
      const perf = (leg === 0 && input && input.perf != null) ? input.perf : null;
      const res = C.runComp(s, comp, ids, rng, isHumanActive(s) ? (input && input.perf != null ? input.perf : 50) : null, new Set());
      points[res.winner] += 1;
      s.final3Legs = s.final3Legs || [];
      s.final3Legs.push({ comp: comp.id, winner: res.winner, ranking: res.ranking });
    }
    let win = ids[0];
    for (const i of ids) if (points[i] > points[win]) win = i;
    s.final3Winner = win;
    s.cast[win].compWins.push(s.week);
    pushEvent(s, 'final3', { winner: win, legs: s.final3Legs });
    if (win === s.human && isHumanActive(s)) return s;
  }

  const winner = s.final3Winner;
  const others = activeIds(s).filter((i) => i !== winner);
  let keep;
  if (winner === s.human && isHumanActive(s) && input && input.keep != null) {
    keep = input.keep;
  } else {
    /*
     * Take the person you beat, not the person you like, but you are reading
     * the jury through your own perception and you can absolutely get it wrong.
     * The bond term is the other half: sometimes somebody takes their ally to
     * the end knowing it is the worse move, which is a thing people do.
     */
    const sc = others.map((o) => {
      const beatable = E.panelThreat(s, winner, o, rng);
      const bond = E.sharedAlliances(s.alliances, winner, o)
        .reduce((v, a) => v + a.strength * (a.priority[winner] || 0.5), 0);
      const loyalPull = (s.cast[winner].social.loyalty / 100) * bond * 0.22;
      return { o, v: beatable - loyalPull };
    });
    sc.sort((a, b) => a.v - b.v);
    keep = sc[0].o;
  }
  const cut = others.find((o) => o !== keep);

  const p = s.cast[cut];
  s.evictionOrder.push(cut);
  p.status = 'evicted';
  p.evictedWeek = s.week;
  p.place = nextPlace(s);
  p.bitterness = E.clamp(40 + (100 - p.social.loyalty) * 0.3, 0, 100);
  s.panel.push(cut);
  while (s.panel.length > E.K.PANEL_SIZE) s.panel.shift();
  for (const id of s.panel) s.cast[id].status = 'panel';

  s.weeks.push({ week: s.week, final3: true, winner, evicted: cut, kept: keep, legs: s.final3Legs });
  pushEvent(s, 'final3_cut', { winner, evicted: cut, kept: keep });

  s.phase = PHASES.PANEL;
  return s;
}

function doPanel(s, input) {
  const rng = s.rng.ai;
  const finalists = activeIds(s);
  const framings = {};
  for (const f of finalists) {
    if (f === s.human && isHumanActive(s) && input && input.framing) framings[f] = input.framing;
    else framings[f] = s.cast[f].social.ambition > 55 ? 'own' : 'humble';
  }

  const res = E.panelVote(s, finalists, rng, framings);
  const winner = res.winner;
  const runnerUp = finalists.find((f) => f !== winner);

  s.result = { winner, runnerUp };
  finalisePlaces(s);

  const me = s.cast[s.human];
  const place = me.place;
  s.result = {
    winner, runnerUp, tally: res.tally, detail: res.detail, framings,
    playerPlace: place,
    xp: T.xpForFinish(place),
  };
  pushEvent(s, 'panel', { winner, tally: res.tally });
  s.phase = PHASES.OVER;
  return s;
}

// ─── player actions ──────────────────────────────────────────────────────────

/**
 * GDD §9. The whole verb set. Every one of these costs an action except the
 * Confessional, which is free and grants a small accuracy bonus on your next
 * read, which is what gives the Silent Week twist something to take away.
 */
function performAction(s, action) {
  const rng = s.rng.ai;
  const me = s.human;
  const week = s.week;
  const out = { kind: action.kind, week };

  switch (action.kind) {
    case 'talk': {
      const j = action.target;
      E.converse(s, me, j, rng);
      out.target = j;
      out.read = E.read(s.rel, me, j);
      break;
    }
    case 'pitch': {
      const j = action.target, against = action.against;
      const persuasion = s.cast[me].social.charisma + s.rel.trust[j][me] * 0.5;
      const resist = s.cast[j].social.perception * 0.5 + Math.max(0, s.rel.trust[j][against]);
      const ok = rng.chance(E.clamp01(0.25 + (persuasion - resist) / 160));
      if (ok) {
        s.voteIntent[j] = against;
        E.applyTrust(s.rel, j, me, 3);
      } else {
        /* Pitching a target somebody likes tells them exactly where you stand. */
        E.applyTrust(s.rel, j, me, -6);
        s.rel.suspicion[j][me] = Math.min(100, s.rel.suspicion[j][me] + 10);
      }
      out.target = j; out.against = against; out.ok = ok;
      break;
    }
    case 'lie': {
      const j = action.target;
      const caught = E.rollDetection(s.rel, s.cast, me, j, rng);
      if (caught) {
        out.caught = true;
        /* A caught lie spreads. Whoever they talk to next hears about it. */
        for (const k of activeIds(s)) {
          if (k === me || k === j) continue;
          if (rng.chance(0.35 * (1 - s.cast[j].social.loyalty / 200))) {
            s.rel.suspicion[k][me] = Math.min(100, s.rel.suspicion[k][me] + 14);
            E.applyTrust(s.rel, k, me, -9);
          }
        }
      } else {
        out.caught = false;
        E.applyTrust(s.rel, j, me, rng.range(6, 14));
        if (action.against != null) E.applyTrust(s.rel, j, action.against, -rng.range(8, 18));
      }
      out.target = j;
      break;
    }
    case 'ally': {
      const j = action.target;
      const mutual = s.rel.trust[j][me] >= E.K.ALLY_FORM_TRUST - 6
        && s.rel.trust[me][j] >= E.K.ALLY_FORM_TRUST - 15;
      if (mutual && E.sharedAlliances(s.alliances, me, j).length === 0) {
        const a = E.makeAlliance([me, j], week);
        s.alliances.push(a);
        E.applyTrust(s.rel, me, j, E.K.D_ALLIANCE);
        E.applyTrust(s.rel, j, me, E.K.D_ALLIANCE);
        out.ok = true; out.alliance = a.id;
      } else {
        out.ok = false;
        E.applyTrust(s.rel, j, me, -4);
      }
      out.target = j;
      break;
    }
    case 'eavesdrop': {
      const pool = activeIds(s).filter((i) => i !== me);
      const a = rng.pick(pool);
      const b = rng.pick(pool.filter((i) => i !== a));
      out.pair = [a, b];
      out.value = E.band(s.rel.trust[a][b]).label;
      const known = s.alliances.filter((x) => x.alive && x.members.indexOf(a) !== -1 && x.members.indexOf(b) !== -1);
      if (known.length) { out.alliance = known[0].members.slice(); known[0].known[me] = week; }
      /* Getting caught is the cost, and perception is the defence. */
      if (rng.chance(E.clamp01(0.22 - s.cast[me].social.perception / 500))) {
        out.caught = true;
        E.applyTrust(s.rel, a, me, -12);
        s.rel.suspicion[a][me] = Math.min(100, s.rel.suspicion[a][me] + 20);
      }
      break;
    }
    case 'leak': {
      const about = action.about, to = action.target;
      E.applyTrust(s.rel, to, about, -rng.range(10, 22));
      E.applyTrust(s.rel, to, me, rng.range(2, 7));
      if (rng.chance(E.clamp01(0.30 - s.cast[me].social.deception / 400))) {
        out.traced = true;
        E.applyTrust(s.rel, about, me, E.K.D_LEAK_BURN);
        s.rel.suspicion[about][me] = Math.min(100, s.rel.suspicion[about][me] + 25);
      }
      out.target = to; out.about = about;
      break;
    }
    case 'confessional': {
      /* Free. Refreshes your read on one person more accurately than a
         conversation would, which is the mechanical weight Silent Week removes. */
      const j = action.target;
      E.refreshBelief(s.rel, s.cast, me, j, week, rng, { confessional: true });
      out.target = j; out.read = E.read(s.rel, me, j);
      break;
    }
    default: break;
  }

  s.log.push(out);
  return out;
}

// ─── driving a whole run ─────────────────────────────────────────────────────

/**
 * Play to completion with no human input. The `autoPlayer` seat makes its own
 * choices through the same AI code paths as everyone else, so the harness is
 * measuring the real engine and not a special case.
 */
function playOut(s, maxSteps) {
  let guard = maxSteps || 5000;
  while (s.phase !== PHASES.OVER && guard-- > 0) step(s, null);
  return s;
}

const api = {
  PHASES, TWIST_WINDOWS, BOUNCE_CHANCE, FLAVOUR, BOUNCE_POOL,
  createRun, defaultAccount, rollTwists,
  activeIds, activeCount, eligibleVoters, captainCompField, vetoField, name, nextPlace, finalisePlaces,
  needsInput, step, playOut, performAction, declareIntents,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.RH_RUN = api;
