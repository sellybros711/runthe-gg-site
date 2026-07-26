/* RunTheHouse, a scripted player.
 *
 * Headless and dependency-free. Browser: window.RH_POLICY. Node: require.
 *
 * WHY THIS EXISTS
 *
 * simulator.js used to run the human seat with `autoPlayer`, which drives that
 * chair through the ENGINE's own social tick: seven abstract conversations a
 * week, chosen by the same weights every AI uses. A real player does none of
 * that. They spend an energy pool on scenes and answer A, B or C.
 *
 * So every number the harness produced about the player, level parity most of
 * all, described an AI sitting in that chair rather than a person. The two
 * systems are sized to be comparable, but "sized to be comparable" is an
 * assertion, and the whole point of the harness is that assertions get measured.
 *
 * This file answers every `needsInput` the loop can raise, through the same
 * public surface the UI uses and with no privileged access to anything. It is
 * NOT an attempt at optimal play. It is a competent player: it maintains the
 * people it needs, spends its risky answers where they buy something, throws a
 * comp when winning would paint it, and does not read minds. If a policy that
 * cheats scores well, that tells you nothing.
 *
 * The two knobs are the point of the file:
 *
 *   risk   0 plays nothing but the safe column, 1 takes every risky answer it
 *          rates above a coin flip
 *   skill  stands in for hands on a minigame, 0 to 100, fed straight into the
 *          comp curve. This is what lets --skill sweep HUMAN_SKILL_WEIGHT,
 *          which GDD §10 calls the hardest number in the build and which was
 *          previously unmeasurable because nothing in the harness had hands.
 */

'use strict';

/* WRAPPED IN AN IIFE. See the note in rng.js. */
(function () {

const E = (typeof require !== 'undefined') ? require('./engine.js') : window.RH_ENGINE;
const SC = (typeof require !== 'undefined') ? require('./scenes.js') : window.RH_SCENES;
const P = (typeof require !== 'undefined') ? require('./powers.js') : window.RH_POWERS;
const R = (typeof require !== 'undefined') ? require('./run.js') : window.RH_RUN;
const SEC = (typeof require !== 'undefined') ? require('./secrets.js') : window.RH_SECRETS;

const DEFAULTS = {
  risk: 0.5,
  skill: 55,
  /* How much a comp win has to be worth before it is worth the target it
     paints. Below this the policy throws. */
  throwThreshold: 0.62,
  /*
   * GDD §20. Whether the stand-in TRADES what it knows or sits on it.
   *
   * This exists so the information layer can be measured at all. Secrets are a
   * player inventory, so the only seat that has them is the one policy.js
   * drives, and the only honest way to ask whether trading information is
   * worth doing is to run the same seeds with a player who does and a player
   * who does not. `trade` is that switch. Below the floor the secret is not
   * worth the trace risk.
   */
  trade: true,
  tradeFloor: 0.30,
  /*
   * GDD §21. Whether the stand-in seeds names, and the ground it needs before
   * it bothers. Same purpose as `trade`: seeding is a player verb, so the only
   * honest way to ask whether it is worth doing is identical seeds with a
   * player who does it and a player who does not.
   */
  seed: true,
  seedFloor: 0.45,
  /* GDD §22. What the stand-in says in the doorway, so the ritual can be
     ablated the same way as the other two player-only layers. */
  walkout: 'read',
};

function make(opts) {
  const cfg = Object.assign({}, DEFAULTS, opts || {});

  /* The policy gets its OWN random stream, seeded off the run, so its coin
     flips never advance the streams the simulation is using. A policy that
     perturbs the world it is measuring is not measuring anything. */
  let rng = null;
  const roll = () => (rng ? rng() : Math.random());

  function attach(s) {
    const RNG = (typeof require !== 'undefined') ? require('./rng.js') : window.RH_RNG;
    rng = RNG.createStreams('policy:' + s.seed + ':' + cfg.risk + ':' + cfg.skill).ai;
  }

  // ── scene target selection ────────────────────────────────────────────────

  /**
   * Who is worth two energy right now.
   *
   * Weighted by what the week actually needs: votes if you are on the block,
   * maintenance on the people who already like you, and contact with anybody
   * whose read of you has gone stale, because a stale read decays toward the
   * baseline whatever you did to earn it.
   *
   * Deliberately reads `belief`, not `trust`. The policy is only allowed to
   * know what the player would know.
   */
  function chooseTarget(s) {
    const me = s.human;
    const pool = R.activeIds(s).filter((id) => id !== me);
    if (!pool.length) return null;

    const onBlock = s.atRisk.indexOf(me) !== -1;
    const voters = R.eligibleVoters(s);

    const scored = pool.map((id) => {
      const b = s.rel.belief[me][id];
      let v = 1;
      /* Staleness. This is the single biggest term, because neglect is the
         pressure the whole relationship engine runs on. */
      v += (1 - b.conf) * 4.5;
      v += Math.max(0, s.week - b.week) * 0.8;
      /* Somebody who already loves you is not where the next point comes from. */
      if (b.v > 65) v *= 0.45;
      if (b.v < -35) v *= 0.7;          // and a lost cause is a lost cause
      /* Votes, when you need votes. */
      if (onBlock && voters.indexOf(id) !== -1) v += 5;
      if (s.captain === id) v += 2.2;   // the person holding the week
      if (E.sharedAlliances(s.alliances, me, id).length) v += 1.6;
      return { id, v };
    });
    scored.sort((a, b) => b.v - a.v);
    /* Pick from the top few rather than the argmax, so a hundred runs do not
       all play the same week. */
    const top = scored.slice(0, 3);
    return top[Math.floor(roll() * top.length)].id;
  }

  // ── A, B or C ─────────────────────────────────────────────────────────────

  /**
   * The risky column is the only one that can move the game, so the question is
   * never "is C good" but "is C good ENOUGH, here, at this price".
   *
   * Takes C when the odds clear a bar set by `risk` AND the effect is worth
   * something this week. Falls to B by default and A when the relationship is
   * in bad enough shape that a failed roll would finish it.
   */
  function chooseOption(s, moment) {
    const me = s.human, them = moment.target;
    const onBlock = s.atRisk.indexOf(me) !== -1;
    const suspicious = s.rel.suspicion[them][me] > 40;

    /* There are four answers now, in a shuffled order, and none of them is
       labelled. The stand-in cannot index position 2 for "the risky one" any
       more and has to read the option the way a player would: what does it try
       to do, and can I afford it if it misses. */
    function value(o) {
      let want = 0;
      for (const raw of o.fx) {
        const f = String(raw).split(':')[0];
        if (f === 'swing') want += onBlock ? 3.4 : 1.6;
        if (f === 'intent') want += onBlock ? 3 : 1.2;
        if (f === 'ally') want += E.allianceOf(s.alliances, me).length ? 0.6 : 2.2;
        if (f === 'info') want += 1.0;
        if (f === 'heat') want += onBlock ? 1.8 : 0.8;
        if (f === 'read') want += 0.5;
        if (f === 'suspicion') want -= suspicious ? 1.4 : 0.5;
      }
      return want;
    }

    let best = null, bestScore = -Infinity;
    for (const o of moment.options) {
      if (s.energy < o.cost) continue;
      const want = value(o);
      let score;
      if (o.kind === 'risky') {
        const chance = SC.riskyChance(s, me, them, o.fx);
        /* Calibrated so the knob actually spans behaviour. At 0.72 minus a 0.34
           swing the bar sat above a typical risky chance of about 0.41, and a
           policy set to risk 0.5 took ONE risky answer in fifty two scenes,
           which makes the knob decorative and the measurement worthless. */
        const bar = 0.60 - cfg.risk * 0.42 - Math.min(0.18, want * 0.05) + (suspicious ? 0.12 : 0);
        score = (chance >= bar && want > 0.4) ? want + chance : want * 0.2 - 1;
      } else {
        score = want * 0.6 + (o.kind === 'neutral' ? 0.8 : 0.2)
          + (suspicious && o.kind === 'safe' ? 0.9 : 0);
      }
      if (score > bestScore) { bestScore = score; best = o; }
    }
    return best ? best.key : moment.options[0].key;
  }

  // ── competitions ──────────────────────────────────────────────────────────

  /**
   * Throw or play. Same logic the AI uses in comps.js, expressed through what a
   * player can see: am I already safe, is somebody I trust likely to hold the
   * week anyway, and how much heat am I carrying.
   */
  function compChoice(s, need) {
    const me = s.human;
    if (s.atRisk.indexOf(me) !== -1) return { perf: perf() };   // never throw off the block
    if (need.which === 'veto' && s.atRisk.indexOf(me) !== -1) return { perf: perf() };

    const mine = E.threatScore(s.rel, s.cast, me, me, s.panel, s.alliances);
    const allies = E.allianceOf(s.alliances, me)
      .reduce((n, a) => n + a.members.length - 1, 0);
    const streak = s.cast[me].throwStreak;

    let pThrow = 0.06 + Math.max(0, mine / 100 - 0.5) * 0.5 + Math.min(0.2, allies * 0.06);
    if (streak >= 2) pThrow *= 0.25;      // the house is counting
    if (pThrow > cfg.throwThreshold) pThrow = cfg.throwThreshold;
    return roll() < pThrow ? { throw: true } : { perf: perf() };
  }

  /* Hands. Normal around the configured skill so a run is not a flat line. */
  function perf() {
    const v = cfg.skill + (roll() + roll() + roll() - 1.5) * 22;
    return Math.max(0, Math.min(100, v));
  }

  // ── everything else the loop can ask ──────────────────────────────────────

  /**
   * The best thing to hand over right now, or null if nothing clears the floor.
   *
   * Greedy on worth, which is the obvious play and therefore the right one for
   * a stand-in: the harness is asking whether trading information beats not
   * trading it, not whether a clever trading policy beats a naive one.
   */
  function bestTrade(s) {
    const me = s.human;
    const pool = R.activeIds(s).filter((i) => i !== me);
    if (!pool.length) return null;
    let best = null;
    for (const sec of SEC.held(s)) {
      const ear = SEC.bestEar(s, sec, pool);
      if (ear.id == null || ear.worth < cfg.tradeFloor) continue;
      if (!best || ear.worth > best.worth) best = { id: sec.id, to: ear.id, worth: ear.worth };
    }
    return best;
  }

  /**
   * The best name to leave with somebody, or null if no pair has enough ground.
   *
   * Points at whoever the stand-in itself most wants gone, through whichever
   * listener is already closest to believing it. Greedy and obvious, which is
   * right for a stand-in: the question is whether the verb is worth using, not
   * whether a clever seeding policy beats a naive one.
   */
  function bestSeed(s) {
    const me = s.human;
    const pool = R.activeIds(s).filter((i) => i !== me);
    if (pool.length < 2) return null;
    let want = null, wantV = -Infinity;
    for (const id of pool) {
      const v = E.threatSeen(s, me, id) - Math.max(0, s.rel.trust[me][id]);
      if (v > wantV) { wantV = v; want = id; }
    }
    if (want == null) return null;
    let best = null;
    for (const ear of pool) {
      if (ear === want) continue;
      const seen = E.threatSeen(s, ear, want), warmth = s.rel.trust[ear][want];
      const ground = E.clamp01((seen - 30) / 45) * 0.55 + E.clamp01((25 - warmth) / 75) * 0.45;
      if (ground < cfg.seedFloor) continue;
      if (!best || ground > best.ground) best = { ear, at: want, ground };
    }
    return best;
  }

  function decide(s, need) {
    const me = s.human;

    switch (need.kind) {
      case 'move_in': {
        /* Four options now, and no letter keys: the first is always the
           quietest answer and the last two are the ones that cost something,
           so risk maps onto the index. */
        const n = need.beat.options.length;
        const i = Math.min(n - 1, Math.floor(cfg.risk * n));
        return { opt: i };
      }

      case 'comp':
        return compChoice(s, need);

      case 'actions': {
        /* Spend information before energy. It is the cheaper verb and it goes
           stale, so holding it through a week is a real loss. */
        if (cfg.trade && s.energy >= SEC.K.TELL_COST) {
          const move = bestTrade(s);
          if (move) {
            R.performAction(s, { kind: 'tell', secret: move.id, target: move.to });
            s.energy -= SEC.K.TELL_COST;
            return s.energy >= SC.ENERGY.SCENE_COST ? null : { done: true };
          }
        }
        /* And go and find something when the hand is empty. A stand-in that
           never listens at a door has no information to trade, which would make
           the trade switch below measure nothing at all. */
        if (cfg.trade && !SEC.held(s).length && s.energy >= SC.ENERGY.EAVESDROP_COST + SC.ENERGY.SCENE_COST) {
          R.performAction(s, { kind: 'eavesdrop' });
          s.energy -= SC.ENERGY.EAVESDROP_COST;
          return s.energy >= SC.ENERGY.SCENE_COST ? null : { done: true };
        }
        /* Seed before spending on a scene. It is the same price and it is the
           only move here that cannot be traced back. */
        if (cfg.seed && s.energy >= SC.ENERGY.SEED_COST) {
          const plant = bestSeed(s);
          if (plant) {
            R.performAction(s, { kind: 'seed', target: plant.ear, against: plant.at });
            s.energy -= SC.ENERGY.SEED_COST;
            return s.energy >= SC.ENERGY.SCENE_COST ? null : { done: true };
          }
        }
        const target = chooseTarget(s);
        if (target == null) return { done: true };
        const moment = R.sceneFor(s, target);
        const key = chooseOption(s, moment);
        /* playScene is called directly rather than through step(), exactly as
           the UI does it, then the phase is closed when the energy runs out. */
        R.playScene(s, moment, key);
        return s.energy >= SC.ENERGY.SCENE_COST ? null : { done: true };
      }

      case 'captain_room': {
        /* Take your own people up. The stand-in plays the obvious version so
           the harness measures the ritual's cost, not a policy quirk. */
        const scored = need.pool.map((id) => ({
          id, v: s.rel.trust[me][id]
            + (E.sharedAlliances(s.alliances, me, id).length ? 40 : 0),
        }));
        scored.sort((a, b) => b.v - a.v);
        return { guests: scored.slice(0, need.take).map((x) => x.id) };
      }

      case 'walkout': {
        if (cfg.walkout !== 'read') return { walkout: cfg.walkout };
        /* Play it the way the card tells a player to: own it with somebody who
           came here to play, say goodbye to somebody who came here for the
           people. The flat 'own' setting is the control for exactly this. */
        return { walkout: need.wants === 'people' ? 'goodbye' : 'own' };
      }

      case 'naming': {
        /* Name the two you least want in the house who are not shielding you. */
        const scored = need.pool.map((id) => ({
          id, v: (100 - s.rel.trust[me][id]) / 2
            + E.threatScore(s.rel, s.cast, me, id, s.panel, s.alliances)
            - (E.sharedAlliances(s.alliances, me, id).length ? 45 : 0),
        }));
        scored.sort((a, b) => b.v - a.v);
        const noms = scored.slice(0, 2).map((x) => x.id);
        /* The stand-in plays it straight: names the two it wants gone and is
           after the first of them. It does not backdoor, which keeps the
           harness measuring the AI's use of the move rather than its own. */
        return { noms, target: noms[0] };
      }

      case 'veto_use': {
        if (need.atRisk.indexOf(me) !== -1) return { save: me };
        const ally = need.atRisk.filter((id) => E.sharedAlliances(s.alliances, me, id).length)[0];
        if (ally != null) return { save: ally };
        const liked = need.atRisk.filter((id) => s.rel.trust[me][id] > 55)[0];
        return { save: liked != null ? liked : null };
      }

      case 'replacement': {
        const scored = need.pool.map((id) => ({
          id, v: (100 - s.rel.trust[me][id]) / 2
            - (E.sharedAlliances(s.alliances, me, id).length ? 45 : 0),
        }));
        scored.sort((a, b) => b.v - a.v);
        return { replacement: scored[0].id };
      }

      case 'vote': {
        const scored = need.atRisk.map((id) => ({ id, v: E.evictScore(s, me, id, s.rng.ai) }));
        scored.sort((a, b) => b.v - a.v);
        return { vote: scored[0].id };
      }

      case 'final3_pick': {
        /* Take whoever you think the Panel likes less. Through your own read,
           which is the whole point of the fog on that decision. */
        const scored = need.pool.map((id) => ({ id, v: E.panelThreat(s, me, id, s.rng.ai) }));
        scored.sort((a, b) => a.v - b.v);
        return { keep: scored[0].id };
      }

      case 'framing':
        return { framing: cfg.risk > 0.45 ? 'own' : 'humble' };

      case 'power_safety':
        return { play: s.atRisk.indexOf(me) !== -1 || P.wantsSafety(s, me, s.rng.ai).play };

      case 'power_veto_pick': {
        const want = P.wantsVetoPick(s, me, s.rng.ai, s.vetoFieldIds || []);
        return { pick: want.play ? want.pick : null };
      }

      case 'power_diamond': {
        const want = P.wantsDiamond(s, me, s.rng.ai);
        return want.play
          ? { diamond: true, save: want.save, replace: want.replace }
          : { diamond: false };
      }

      case 'power_extra_vote':
        return { extraVote: P.wantsExtraVote(s, me, s.rng.ai).play };

      default:
        return null;
    }
  }

  return { cfg, attach, decide, chooseTarget, chooseOption, compChoice };
}

/**
 * Play a whole run with a scripted player in the human seat.
 *
 * `autoPlayer` stays FALSE, which is the entire point: needsInput fires exactly
 * as it does for a person, and every answer goes back through step().
 */
function playRun(runOpts, policyOpts) {
  const pol = make(policyOpts);
  const s = R.createRun(Object.assign({ autoPlayer: false }, runOpts));
  pol.attach(s);

  let guard = 9000;
  while (s.phase !== R.PHASES.OVER && guard-- > 0) {
    const need = R.needsInput(s);
    if (!need) { R.step(s, null); continue; }
    const input = pol.decide(s, need);
    if (input === null && need.kind === 'actions') continue;   // scene played in place
    R.step(s, input);
  }
  return s;
}

const api = { DEFAULTS, make, playRun };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.RH_POLICY = api;

})();
