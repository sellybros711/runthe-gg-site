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

const DEFAULTS = {
  risk: 0.5,
  skill: 55,
  /* How much a comp win has to be worth before it is worth the target it
     paints. Below this the policy throws. */
  throwThreshold: 0.62,
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
    const c = moment.options[2];
    const chance = SC.riskyChance(s, me, them, c.fx);

    const onBlock = s.atRisk.indexOf(me) !== -1;
    let want = 0;
    for (const f of c.fx) {
      if (f === 'intent') want += onBlock ? 3 : 1.2;
      if (f === 'ally') want += E.allianceOf(s.alliances, me).length ? 0.6 : 2.2;
      if (f === 'info') want += 1.0;
      if (f === 'heat') want += onBlock ? 1.8 : 0.8;
      if (f === 'read') want += 0.5;
    }

    const suspicious = s.rel.suspicion[them][me] > 40;
    /* Calibrated so the knob actually spans behaviour. At 0.72 minus a 0.34
       swing the bar sat above a typical risky chance of about 0.41, and a
       policy set to risk 0.5 took ONE risky answer in fifty two scenes, which
       makes the knob decorative and the measurement worthless. */
    const bar = 0.60 - cfg.risk * 0.42 - Math.min(0.18, want * 0.05) + (suspicious ? 0.12 : 0);

    if (s.energy >= c.cost && chance >= bar && want > 0.4) return 'c';
    /* A is for when you cannot afford to lose anything with this person. */
    if (suspicious && roll() < 0.45) return 'a';
    return 'b';
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

  function decide(s, need) {
    const me = s.human;

    switch (need.kind) {
      case 'move_in':
        return { choice: cfg.risk > 0.6 ? 'funny' : (cfg.risk < 0.3 ? 'guarded' : 'open') };

      case 'comp':
        return compChoice(s, need);

      case 'actions': {
        const target = chooseTarget(s);
        if (target == null) return { done: true };
        const moment = R.sceneFor(s, target);
        const key = chooseOption(s, moment);
        /* playScene is called directly rather than through step(), exactly as
           the UI does it, then the phase is closed when the energy runs out. */
        R.playScene(s, moment, key);
        return s.energy >= SC.ENERGY.SCENE_COST ? null : { done: true };
      }

      case 'naming': {
        /* Name the two you least want in the house who are not shielding you. */
        const scored = need.pool.map((id) => ({
          id, v: (100 - s.rel.trust[me][id]) / 2
            + E.threatScore(s.rel, s.cast, me, id, s.panel, s.alliances)
            - (E.sharedAlliances(s.alliances, me, id).length ? 45 : 0),
        }));
        scored.sort((a, b) => b.v - a.v);
        return { noms: scored.slice(0, 2).map((x) => x.id) };
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
