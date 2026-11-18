/* Shut The Door: a custom challenge (a Pro perk, the owner's call 2026-11-18).
 * window.STD_CHALLENGE, after contract.js. Node: require('./challenge.js').
 *
 * A Pro player picks a pitcher (any pack's closer), a lineup (any pack's hitters, its
 * batting order), who is up, who is on, the outs, the count, the lead and the inning. The
 * pair is a matchup pack (pipeline/build_matchups.py, then matchups.js): the outcome tables
 * from the pitch library and a hold table solved for every state a player can pick. The
 * engine plays it by the same rules as every daily. Only the start differs, and the start is
 * a state the table already holds, so the grade is the table's.
 *
 * THE SPEC (what the server keeps, supabase/183_shut_the_door_challenges.sql checks the same)
 *   { v: 1, pitcher, lineup,     pack ids (each listed in data/matchups.json)
 *     up,                        the lineup index at the plate, 0..8
 *     on: [r1, r2, r3],          the lineup index on first, second and third, or null
 *     outs, balls, strikes,      0..2, 0..3, 0..2
 *     lead, them,                1..3 runs ahead; them, the other side's runs, 0..20 (the scoreboard)
 *     inning, home }             8, 9 or 10; home true when the pitcher's club is at home
 *
 * A RUNNER is one of the four hitters before the man up, and nobody is on twice: a hitter
 * still on base cannot come up again, and the man up just came up.
 *
 * What it is not: never a daily, never Survivor, never the archive, never on a board. Its
 * results are its own (shutdoor_challenge_results), one counted try a player.
 */
(function () {
  'use strict';
  const NODE = typeof module !== 'undefined' && module.exports;

  const SPEC_V = 1;
  const LIMITS = Object.freeze({
    lineup: 9, outs: [0, 2], balls: [0, 3], strikes: [0, 2], lead: [1, 3], them: [0, 20], innings: [8, 9, 10],
    runnerBack: 4,
  });
  const ID_RE = /^std-[a-z0-9-]{3,60}$/;
  // the share code: six letters and digits, no 0, O, 1 or I (read aloud, typed from a screenshot)
  const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
  const ORD = ['first', 'second', 'third'];

  const int = (x) => (typeof x === 'number' && Number.isInteger(x) ? x : null);
  const within = (x, r) => x != null && x >= r[0] && x <= r[1];

  /* The spec, checked and in its one canonical shape, or { error } with the reason. */
  function normalize(spec) {
    if (!spec || typeof spec !== 'object') return { error: 'not a challenge' };
    const s = {
      v: SPEC_V,
      pitcher: spec.pitcher, lineup: spec.lineup,
      up: int(spec.up),
      on: Array.isArray(spec.on) && spec.on.length === 3 ? spec.on.map(x => (x == null ? null : int(x))) : null,
      outs: int(spec.outs), balls: int(spec.balls), strikes: int(spec.strikes),
      lead: int(spec.lead), them: spec.them == null ? 0 : int(spec.them),
      inning: int(spec.inning), home: spec.home === true,
    };
    if (spec.v != null && spec.v !== SPEC_V) return { error: 'a challenge from a newer game' };
    if (typeof s.pitcher !== 'string' || !ID_RE.test(s.pitcher)) return { error: 'pick a pitcher' };
    if (typeof s.lineup !== 'string' || !ID_RE.test(s.lineup)) return { error: 'pick a lineup' };
    if (!within(s.up, [0, LIMITS.lineup - 1])) return { error: 'pick who is up' };
    if (!s.on || s.on.some((x, i) => spec.on[i] != null && x == null)) return { error: 'pick the runners' };
    if (!within(s.outs, LIMITS.outs)) return { error: 'pick the outs' };
    if (!within(s.balls, LIMITS.balls) || !within(s.strikes, LIMITS.strikes)) return { error: 'pick the count' };
    if (!within(s.lead, LIMITS.lead)) return { error: 'the lead is 1 to 3 runs' };
    if (!within(s.them, LIMITS.them)) return { error: 'pick the score' };
    if (!LIMITS.innings.includes(s.inning)) return { error: 'the 8th, the 9th or the 10th' };
    const seen = new Set();
    for (const r of s.on) {
      if (r == null) continue;
      if (!within(r, [0, LIMITS.lineup - 1])) return { error: 'pick the runners' };
      if (r === s.up) return { error: 'the man up cannot be on base' };
      if (seen.has(r)) return { error: 'a runner on two bases' };
      const back = (s.up - r + LIMITS.lineup) % LIMITS.lineup;
      if (back < 1 || back > LIMITS.runnerBack) return { error: 'a runner is one of the four hitters before the man up' };
      seen.add(r);
    }
    return { spec: s };
  }

  function basesOf(s) { return s.on.reduce((m, r, i) => (r == null ? m : m | (1 << i)), 0); }
  function pairId(s) { return s.pitcher + '__' + s.lineup; }

  /* The situation the engine reads (grade.js startState, engine.js createOuting). The pitcher's
     club at home pitches the top of the inning; on the road the bottom, and from the 9th a run
     that puts them ahead ends the game (a walk-off). */
  function situationOf(s) {
    return {
      inning: s.inning, half: s.home ? 'top' : 'bottom', outs: s.outs, bases: basesOf(s),
      score: { us: s.them + s.lead, them: s.them }, usHome: s.home, walkOffLive: !s.home && s.inning >= 9,
      bi: s.up, balls: s.balls, strikes: s.strikes,
    };
  }

  /* The pack a challenge plays: the matchup with the spec's start, and its runners on base by
     name for the running game (rules 7). The matchup itself is left as it was. */
  function packFor(matchup, spec) {
    const n = normalize(spec);
    if (n.error) throw new Error(n.error);
    const s = n.spec;
    const m = matchup.scenario.matchup;
    if (!m || m.pitcher !== s.pitcher || m.lineup !== s.lineup) throw new Error('that is not this matchup');
    if ((matchup.scenario.tableLead | 0) < s.lead) throw new Error('the matchup has no table for that lead');
    const sc = Object.assign({}, matchup.scenario, { situation: situationOf(s), setup: setupOf(matchup, s), challenge: s });
    const out = Object.assign({}, matchup, { scenario: sc });
    if (matchup.steal) {
      const start = {};
      s.on.forEach((r, i) => { if (r != null) start[String(i + 1)] = String(matchup.scenario.batters[r].id); });
      out.steal = Object.assign({}, matchup.steal, { start });
    }
    return out;
  }

  function inningWords(n) { return n === 8 ? '8th' : n === 9 ? '9th' : '10th'; }
  function outWords(n) { return n === 0 ? 'Nobody out' : n === 1 ? 'One out' : 'Two out'; }

  /* The setup line, from the picks and the matchup's own names. Short sentences, a fact each. */
  function setupOf(matchup, s) {
    const sc = matchup.scenario, m = sc.matchup || {};
    const B = sc.batters;
    const last = (name) => String(name || '').split(' ').slice(-1)[0];
    const lines = [];
    lines.push(`${sc.pitcher.name} (${sc.pitcher.year}) against the ${m.lineupYear} ${m.lineupTeam}.`);
    lines.push(`Up ${s.lead} in the ${s.home ? 'top' : 'bottom'} of the ${inningWords(s.inning)}.`);
    const on = s.on.map((r, i) => (r == null ? null : `${last(B[r].name)} on ${ORD[i]}`)).filter(Boolean);
    lines.push(`${outWords(s.outs)}. ${on.length ? on.join(', ') + '.' : 'Nobody on.'}`);
    lines.push(`${B[s.up].name} up${s.balls || s.strikes ? `, ${s.balls}-${s.strikes}` : ''}.`);
    return lines.join(' ');
  }

  const api = Object.freeze({ SPEC_V, LIMITS, CODE_RE, normalize, basesOf, pairId, situationOf, packFor, setupOf });
  if (NODE) module.exports = api;
  if (typeof window !== 'undefined') window.STD_CHALLENGE = api;
})();
