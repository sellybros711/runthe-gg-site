/* Shut The Door: the engine.
 *
 * Headless, pure and synchronous. Browser: window.STD_ENGINE (after
 * contract.js, rng.js and grade.js). Node: require('./engine.js').
 * api.js wraps it in the contract's four async calls (CONTRACT.md section 9).
 *
 * One outing: a pack, a seed, and the calls. The same three give the same
 * outing on any device: one mulberry32 stream, four draws per pitch in a fixed
 * order (miss x, miss z, the library draw, the runner draw), no Math.random,
 * no clock. A call is {type, cell} and, since the release meter (2026-10-22),
 * an optional q (contract.js RELEASE): q scales the miss and nothing else.
 * Since effort (2026-10-22), an optional e beside q (grade.js EFFORT): e
 * scales the drawn row key by key and loads the arm; never a draw.
 *
 * A PITCH
 *   1. It is graded first (grade.js), on hold% against the best call. The
 *      outcome never touches the grade.
 *   2. The miss: the target cell's centre plus a normal miss of the pitch's
 *      sigmaFt in x, and sigmaFt / kernelZoneFt in normalised height, both
 *      times the release's spread (contract.js spreadOf(q): 0.6x for a
 *      perfect release, 1.5x for a bad one, exactly 1.0x without q). The cell
 *      it lands in is the actual cell. The grade's miss table is the same
 *      normal at 1.0x: the grade prices the decision at his own command, and
 *      the release is execution, which the grade never sees. The two draws are
 *      the same draws whatever q is; only the spread they are scaled by moves.
 *   3. A real pitch is drawn from the library list for (batter, type, actual
 *      cell, count bucket). Its result happens.
 *   4. In play: the advancement table for the drawn batted ball's category at
 *      the current outs and bases, chosen by the runner draw.
 *
 * THE HALVES (rules 8, CONTRACT.md 5j, the owner's call 2026-10-30): the outing
 * is the closer's real outing to the end of the game. A pack's scenario.halves
 * lists every half he pitches; three outs in one that is not the last end the
 * half, not the outing: his team bats its real half (scenario.between, from the
 * play by play: its runs go on the score), and the next half starts with the
 * batter after the last one he faced. The arm, what the hitters have seen and
 * the challenges carry over. The result (door shut, held tie) is the score at
 * the end of the last half. The halfOver record on the pitch that ended a half
 * is what the UI's card between halves shows.
 *
 * END RULES (CONTRACT.md section 8): three outs with the lead is door_shut. A
 * run that ties does NOT end it (the owner's call, 2026-10-20): the inning goes
 * on, and three outs with the game still tied is tie_held. A run that puts them
 * ahead, before or after a tie, ends it walk_off when walkOffLive, otherwise
 * doors_open. One play that ties and goes ahead is decided by the go-ahead
 * rule. After a tie every call is graded on the tie's goal (grade.js THE GOAL).
 *
 * THE OUTING SCORE (higher is better)
 *   score = max(0, 700 - SCORE_PER_PT * total pts lost) + RESULT_BONUS[outcome]
 *   The first part is the hold% kept across the outing (20 points of score per
 *   point of hold% given away; after a tie, points of the tie's goal), the
 *   second the result. Tuned against the closer pool when the pool exists;
 *   reported to the lead before it changes.
 *   The release (q) has no term of its own. It reaches the score only the way
 *   it reaches the game: a tighter miss changes what happens, so the result
 *   part moves. The closer pool pitched at 1.0x, his real command, and the
 *   meter is tuned so an average timing is about 1.0x (CONTRACT.md section 5).
 */

'use strict';
(function() {

const NODE = typeof module !== 'undefined' && module.exports;
const K = NODE ? require('./contract.js') : window.STD_CONTRACT;
const R = NODE ? require('./rng.js') : window.STD_RNG;
const G = NODE ? require('./grade.js') : window.STD_GRADE;
/* lesson.js is optional at load: without it the result has lesson null */
const L = NODE ? require('./lesson.js') : (window.STD_LESSON || null);
/* meter.js holds the quick delivery's costs (QUICK); only a quick delivery reads it */
const MT = NODE ? require('./meter.js') : (window.STD_METER || null);

/* 3: a call may carry q, the release (contract.js RELEASE). Without q a call
   plays exactly as it did under 2.
   4: rules 2 (grade.js RULES): the hitter adjusts, the arm tires, a repeat
   loses some of the release, and the screen scouts coarser. A new outing
   plays rules 2 and its kept calls carry r: 2. A call without r is rules 1,
   so every outing stored before plays exactly as it did.
   5: effort (CONTRACT.md 5c): a rules 2 call may carry e beside q. It moves
   the pitch along his own real speed (grade.js EFFORT) and loads the arm. A
   call without e plays exactly as under 4. And the free aim point (CONTRACT.md
   5d): a rules 2 call may carry at, where inside its cell it was aimed. A call
   without at aims at the centre, as under 4.
   6: rules 3 (grade.js THE THIRD OUT): a run that crosses before a legal
   third out counts. A new outing's calls carry r: 3. A call with r: 2, or
   none, replays under its own rules, where a third out scores none.
   7: rules 4 (grade.js ABS_RULES): a take is called where it crossed
   (contract.js THE CALL), ABS challenges (contract.js ABS: the batter's from
   a stream of its own, the pitcher's side's with ch on the call it
   challenges), and a release in the bright band lands where it was aimed
   (contract.js PERFECT). A call with r 3 or before replays exactly as under 6.
   8: rules 5 (grade.js ROUTINE_RULES): an error on a routine play is
   extremely rare (contract.js ROUTINE). The same four draws read a row whose
   routine error share went to the out of its kind. A call with r 4 or before
   replays exactly as under 7.
   9: rules 6 (grade.js RUNNER_RULES): the runners read the ball (contract.js
   THE RUNNERS READ THE BALL). The same runner draw reads the advancement rows
   weighted by how real runners went on a ball of that carry and side. A call
   with r 5 or before replays exactly as under 8.
   10: rules 7 (grade.js STEAL_RULES): the running game. The lead runner may
   steal on a pitch (a stream of its own, so the four draws never move), the
   pitcher may throw over (pa: the throws after a pitch) and use a quick
   delivery (ss: 1). A call with r 6 or before replays exactly as under 9.
   11: rules 8 (grade.js FULL_RULES, THE HALVES): the closer's outing to the end of the game, half
   after half, his team's real half between. A call with r 7 or before replays exactly as under
   10, on the first half alone (Model.singleModel). */
const ENGINE_VERSION = 11;
/* 2: the hold table has a slot for a tied game (margin 0), so a pack solved
   for the old end rules is refused rather than misread.
   3: the hold table is solved with runs on a legal third out (rules 3), and
   the advancement table's half-ending rows are the real plays.
   4: scenario.halves (every half he pitches, each with its lineup), scenario.between (his team's
   real half between two) and scenario.line (the real line score when he came in); the hold table
   runs over every half (rules 8). A pack with one half has the table it had under 3. */
const PACK_VERSION = 4;
const SCORE_BASE = 700;
const SCORE_PER_PT = 20;
/* The result's part of the score: 100 points a rank (contract.js OUTCOME_RANK).
   tie_held is 200. It is a blown save, so it sits a full step under door_shut
   (300): holding the tie never pays like holding the lead. The game goes on
   level, not behind, so it sits a full step over doors_open (100). The even
   steps keep the old three where they were, so an outing with no tie scores
   exactly what it scored before the tie rule. */
const RESULT_BONUS = Object.freeze({ door_shut: 300, tie_held: 200, doors_open: 100, walk_off: 0 });
const TIER_NAME = Object.freeze(['batter', 'similar', 'league']);

/* Edge cells: the zone's ring (every zone cell but the heart). Used for the
   pitched-like vector. */
const HEART = 12;

function seedFor(mode, day, seed) {
  return mode === 'daily' ? R.hashSeed(K.DAILY_SEED_PREFIX + day) : (seed >>> 0);
}

/* The half being played: its place in the outing and the scenario's facts about it. */
function halfOf(o, h) {
  const sc = o.pack.scenario, hs = sc.halves;
  const x = hs && hs[h] ? hs[h] : sc.situation;
  return { index: h, of: o.model.H, inning: x.inning, half: x.half, walkOffLive: !!x.walkOffLive, last: h === o.model.H - 1 };
}
function curH(o) { return o.st.h || 0; }

function publicState(o) {
  const st = o.st;
  const hf = halfOf(o, curH(o));
  return {
    outingId: o.outingId,
    scenarioId: o.pack.scenario.id,
    mode: o.mode,
    rules: o.rules,
    seed: o.seed,
    status: o.status,
    pitchNo: o.log.length,
    count: { b: st.b, s: st.s },
    outs: st.outs,
    bases: st.bases,
    score: { us: o.score.us, them: o.score.them },
    batterIndex: o.model.who(st),
    strip: o.grades.map(g => g.band),
    shutItLive: o.status === 'live' && st.s === 2 && st.outs === 2 && hf.last,
    // rules 8: the half being pitched, and the halves done so far (each its halfOver record)
    half: hf,
    halves: o.halves.slice(),
    line: o.line ? lineOut(o.line) : null,
    log: o.log.slice(),
    grades: o.grades.slice(),
    debug: { seed: o.seed, tiers: o.log.map(p => p.drawn.tier) },
    // rules 4: the ABS challenges (contract.js ABS). null under rules 3 and before
    abs: o.abs ? {
      left: { pitcher: o.abs.pitcher, batter: o.abs.batter },
      challengeLive: challengeLive(o),
      events: o.log.filter(p => p.challenge).map(p => Object.assign({ n: p.n }, p.challenge)),
    } : null,
    // rules 7: the running game (contract.js THE RUNNING GAME). null under rules 6 and before
    run: o.run ? runState(o) : null,
  };
}

/* rules 4: the pitcher's side may challenge the last pitch right now: a ball
   the umpire called (not one a batter's challenge made), not yet challenged,
   with a challenge left. Also on a ball four that ended the outing, until it
   is finished (api.js). */
function challengeLive(o) {
  if (!o.abs || !o.log.length || o.finished) return false;
  const p = o.log[o.log.length - 1];
  return !!p.abs && p.abs.called === 'ball' && !p.challenge && o.abs.pitcher > 0;
}

function createOuting(pack, opts) {
  if (!pack || pack.v !== PACK_VERSION) throw new Error('pack format ' + (pack && pack.v) + ', engine reads ' + PACK_VERSION);
  const sc = pack.scenario;
  const rules = opts.rules == null ? G.RULES : opts.rules;
  if (![1, 2, 3, G.ABS_RULES, G.ROUTINE_RULES, G.RUNNER_RULES, G.STEAL_RULES, G.FULL_RULES].includes(rules)) throw new Error('rules ' + rules + ', engine plays 1 to ' + G.RULES);
  // rules 7 and before play the first half alone, as they were played (grade.js THE HALVES)
  let model = opts.model || new G.Model(pack);
  if (rules < G.FULL_RULES) model = model.singleModel();
  const seed = opts.seed >>> 0;
  const st = model.startState();
  const o = {
    pack, model, seed, rules, mode: opts.mode || 'practice',
    outingId: opts.outingId || `${sc.id}:${seed}`,
    rng: R.mulberry32(seed),
    st, status: 'live', outcome: null,
    score: { us: sc.situation.score.us, them: sc.situation.score.them },
    log: [], grades: [], calls: [], before: [], ctxs: [],
    // rules 8: the halves done (their halfOver records) and the line score, when the pack has halves
    halves: [], line: model.H > 1 && sc.line ? lineStart(sc) : null,
    // rules 4: challenges left per side, and the batter's gamble on a stream of its own, so the
    // outing's four draws a pitch never move (contract.js ABS)
    abs: rules >= G.ABS_RULES ? { pitcher: K.ABS.PER_SIDE, batter: K.ABS.PER_SIDE } : null,
    absRng: rules >= G.ABS_RULES ? R.mulberry32(R.hashSeed('abs|' + seed)) : null,
    // rules 7: the running game (contract.js STEAL): who is on, the pickoff throws at the lead
    // runner and the disengagements this plate appearance, and a stream of its own, drawn only
    // when a steal or a pickoff is on, so the outing's four draws a pitch never move
    run: rules >= G.STEAL_RULES && pack.steal ? {
      rng: R.mulberry32(R.hashSeed('steal|' + seed)),
      on: [null, pack.steal.start['1'] || null, pack.steal.start['2'] || null, pack.steal.start['3'] || null].map(x => (x == null ? null : String(x))),
      po: { 1: 0, 2: 0, 3: 0 }, dis: 0, events: [],
    } : null,
  };
  return o;
}

function validCall(o, call) {
  if (!call || typeof call.cell !== 'number' || call.cell < 0 || call.cell > 24 || (call.cell | 0) !== call.cell) {
    throw new Error('a call needs a cell 0..24');
  }
  if (!o.model.types.includes(call.type)) throw new Error(`${call.type} is not in the arsenal`);
  K.releaseQ(call.q);   // throws unless q is absent or a number 0..1
  if (K.aimAt(call.at) != null && o.rules < 2) throw new Error('an aim point is a rules 2 call');   // throws unless at is absent or [u, v]
  if (K.effortE(call.e) != null) {   // throws unless e is absent or a number 0..1
    if (o.rules < 2) throw new Error('effort is a rules 2 call');
    if (call.q == null) throw new Error('an effort needs a timed release (q)');
  }
  if (call.r != null && call.r !== o.rules) throw new Error(`a rules ${call.r} call in a rules ${o.rules} outing`);
  if (call.ch != null && (call.ch !== 1 || o.rules < G.ABS_RULES)) throw new Error('a challenge is ch: 1 on a rules 4 call');
  if (call.ss != null && (call.ss !== 1 || o.rules < G.STEAL_RULES)) throw new Error('a quick delivery is ss: 1 on a rules 7 call');
  if (call.ss === 1 && K.effortE(call.e) != null && K.effortE(call.e) > MT.QUICK.E_MAX) throw new Error('a quick delivery has no max power (meter.js QUICK.E_MAX)');
  if (call.pa != null && (!Number.isInteger(call.pa) || call.pa < 1 || call.pa > 9 || o.rules < G.STEAL_RULES)) throw new Error('pickoffs after a pitch are pa: 1..9 on a rules 7 call');
}

/* A call as the engine keeps it: {type, cell}, plus q (two places) when the
   release was timed. A call without q stays without it, so an old outing's
   stored calls come back exactly as they went in. */
function keptCall(call, rules) {
  const c = { type: call.type, cell: call.cell };
  const q = K.releaseQ(call.q);
  if (q != null) c.q = q;
  const e = K.effortE(call.e);
  if (e != null) c.e = e;
  const at = K.aimAt(call.at);
  if (at != null) c.at = at;
  if (rules >= 2) c.r = rules;
  if (call.ch === 1) c.ch = 1;
  if (call.ss === 1) c.ss = 1;
  if (call.pa != null) c.pa = call.pa;
  return c;
}

/* The rules an outing's calls were played under: r on the calls, else 1. */
function rulesOf(calls) {
  const c = (calls || []).find(x => x && x.r != null);
  return c ? c.r : 1;
}

/* The best call in the live state, the way the grade sees it (with the
   history under rules 2). What a scripted best play throws. */
function bestCall(o) {
  const b = o.model.bestCtx(o.st, G.contextOf(o.log, o.st, o.rules, o.model.center, o.model.zone0));
  return { type: b.type, cell: b.cell };
}

function throwPitch(o, call) {
  if (o.status !== 'live') throw new Error('the outing is over');
  validCall(o, call);
  const pack = o.pack, model = o.model, sc = pack.scenario;
  const st = o.st;

  // 1. the grade, before anything is drawn (rules 2: with what the hitter has seen, and the arm)
  const ctx = G.contextOf(o.log, st, o.rules, model.center, model.zone0);
  const grade = G.gradeCall(model, st, call, ctx);
  o.before.push(Object.assign(st.h != null ? { h: st.h } : {}, { bi: st.bi, b: st.b, s: st.s, outs: st.outs, bases: st.bases, margin: st.margin }));
  o.ctxs.push(ctx);

  // 2. the four draws, always all four
  const d = R.pitchDraws(o.rng);
  const arsenal = sc.pitcher.arsenal.find(a => a.type === call.type);
  const kept = keptCall(call, o.rules);
  // rules 2: a repeat keeps less of a good release, and the arm (fatigue, runners on) scales his miss
  const repeat = ctx && ctx.last === call.type ? ctx.streak : 0;
  const spread = K.spreadOf(kept.q, repeat);
  const arm = ctx ? ctx.fatigue : 1;
  const effSpread = kept.e != null ? G.effortSpread(call.type, kept.e) : 1;   // effort: a harder pitch misses wider
  // rules 7: a quick delivery (the slide step). Its costs are the meter's (meter.js QUICK): the
  // release was timed in a quicker ring and the power has no top; the pitch is as thrown
  const slide = o.run && kept.ss === 1 ? { velo: kept.e != null ? K.stuffAt(arsenal, kept.e).velo : null } : null;
  const sigma = arsenal.sigmaFt * spread * arm * effSpread;
  const t = K.aimPoint(call.cell, kept.at);   // the cell's centre, or the free aim point inside it
  // rules 4: a release in the bright band lands where it was aimed, whatever the repeat, effort or arm
  const perfect = o.rules >= G.ABS_RULES && kept.q != null && kept.q >= K.PERFECT.BEST_Q;
  const actual = perfect ? K.perfectLanding(t, d.missX, d.missZ, kept.q, pack.kernelZoneFt)
    : { x: t.x + d.missX * sigma, zn: t.zn + d.missZ * sigma / pack.kernelZoneFt };
  const actualCell = K.cellAt(actual.x, actual.zn);

  // 3. the outcome key, from the same per mille row the grade priced, then
  //    that key's real pitch
  const bucket = G.bucketOf(st.b, st.s);
  const who = model.who(st);
  const entry = model.entry(who, call.type);
  let row = ctx ? model.rowsCtx(who, call.type, bucket, ctx)[actualCell] : entry.p[actualCell][bucket];
  if (kept.e != null) row = G.effortRow(row, call.type, kept.e);   // effort: a pitch from further up (or down) his own speed
  const u = d.library * (ctx ? row.reduce((a, x) => a + x, 0) : 1000);
  let k = -1, acc = 0;
  for (let i = 0; i < row.length; i++) { if (!row[i]) continue; acc += row[i]; k = i; if (u < acc) break; }
  // rules 5 (THE ROUTINE PLAY, contract.js ROUTINE): an error on a routine ball. The same library
  // draw, read inside the error's slice: past KEEP it is the out of its kind. No other key moves
  if (o.rules >= G.ROUTINE_RULES && k === G.KEYS.indexOf('error')) {
    const rt = model.routineOf(entry, actualCell);
    if (rt && (u - (acc - row[k])) / row[k] >= rt.keep) k = rt.out;
  }
  // rules 4 (THE CALL): the take stays a take, and the umpire calls it where it crossed. The same
  // library draw, read inside the take's share of the row: no new draw
  const abs = o.rules >= G.ABS_RULES;
  const dIn = abs ? K.zoneDist(actual.x, actual.zn, pack.kernelZoneFt) : null;
  if (abs && k <= 1 && row[0] + row[1] > 0) k = u / (row[0] + row[1]) < K.calledStrikeP(dIn) ? 1 : 0;
  let ref = entry.x[actualCell][k];
  if (abs && (ref == null || ref < 0)) ref = nearestRef(entry, actualCell, k);
  if (ref == null || ref < 0) throw new Error(`no real pitch for ${G.KEYS[k]} at cell ${actualCell}`);
  const pitch = pack.pitches[Math.floor(ref / 3)];
  const tier = ref % 3;
  const cls = G.CLASS[k];
  const res0 = pitch[2];

  // rules 4: the batter's challenge, right away, on a called strike (contract.js ABS)
  let challenge = null;
  if (abs && res0 === 'called_strike' && o.abs.batter > 0) {
    const g = o.absRng();   // drawn only when he can challenge, in pitch order
    if (g < K.challengeP('batter', -dIn, st.s === 2)) {
      const over = dIn < 0;
      challenge = { by: 'batter', call: 'called_strike', abs: over ? 'ball' : 'strike', overturned: over };
      if (!over) o.abs.batter--;
    }
  }
  const playCls = challenge && challenge.overturned ? 'ball' : cls;

  // 4. what it does to the state, the runner draw choosing among the rows
  // rules 1 and 2 replay with a third out that scores none (grade.js THE THIRD OUT)
  let trans = model.transitions(st, playCls, o.rules >= G.THIRD_OUT_RULES);
  // rules 6 (THE RUNNERS READ THE BALL, contract.js runnerClass): the same runner draw, on the
  // table's rows weighted by how real runners went on a ball like this one
  if (o.rules >= G.RUNNER_RULES && playCls.startsWith('ip:')) trans = readTheBall(pack, st, playCls.slice(3), pitch, trans);
  let pickIdx = trans.length - 1;
  if (trans.length > 1) {
    let a2 = 0;
    for (let i = 0; i < trans.length; i++) { a2 += trans[i][0]; if (d.runner < a2) { pickIdx = i; break; } }
  }
  const t2 = trans[pickIdx][1];

  const countBefore = { b: st.b, s: st.s };
  // rules 7: does the lead runner go on this pitch? Decided before it, on the steal stream
  const steal = o.run ? stealGoes(o) : null;
  if (abs) o.undo = { st, them: o.score.them, on: o.run ? o.run.on.slice() : null };   // for the pitcher's side's challenge on this pitch
  if (o.line) o.lineBefore = JSON.stringify(o.line);
  const moved = applyTrans(o, st, t2, cls);
  if (o.run) moveRunners(o, st, moved);
  const runs = moved.runs, paOver = moved.paOver;

  const res = challenge && challenge.overturned ? 'ball' : res0;
  const pr = {
    n: o.log.length + 1,
    call: kept,
    spread: Math.round(spread * 1000) / 1000,
    actual: { x: round3(actual.x), zn: round3(actual.zn) },
    actualCell,
    velo: kept.e != null ? K.stuffAt(arsenal, kept.e).velo : pitch[1],
    batter: (res === 'ball' || res === 'called_strike' || res === 'hit_by_pitch') ? 'take' : 'swing',
    result: res,
    countBefore,
    count: moved.count,
    outs: moved.outs,
    bases: moved.bases,
    runnerMoves: moved.runnerMoves,
    runs,
    paOver,
    drawn: { id: pitch[0], tier: TIER_NAME[tier] },
  };
  if (moved.halfOver) pr.halfOver = moved.halfOver;   // rules 8: the half is over, his team batted
  if (abs && (res0 === 'ball' || res0 === 'called_strike')) {
    // the ABS zone's answer, for the challenge and the quick replay: d inches from the zone's edge
    pr.abs = { called: res0, strike: dIn >= 0, d: Math.round(dIn * 100) / 100 };
  }
  if (challenge) pr.challenge = challenge;
  if (perfect) pr.perfect = true;
  if (cls.startsWith('ip:')) {
    const label = t2.label || 'out';
    pr.inPlay = { bb: pitch[3], ev: pitch[4], la: pitch[5], spray: pitch[6], result: label, text: inPlayText(label, pitch[3], pitch[6], runs) };
    if (o.rules >= G.RUNNER_RULES && pack.runners) {
      // rules 6: how far the real ball carries (contract.js carryOf) and its class, for the scene
      const c = pitch[3] !== 'ground' ? K.carryOf(pitch[4], pitch[5], pack.runners.dist.coef) : null;
      if (c != null) pr.inPlay.carry = Math.round(c);
      pr.inPlay.cls = K.runnerClass(cls.slice(3), pitch[3], pitch[4], pitch[5], pitch[6], pack.runners);
    }
  }
  if (ctx) pr.arm = arm;     // rules 2: the arm's scale on his miss (fatigue and runners on)
  if (kept.e != null) {      // effort: what the pitch was, from his own real pitches (contract.js stuffAt)
    const s = K.stuffAt(arsenal, kept.e);
    pr.stuff = { velo: s.velo, pfxX: s.pfxX, pfxZ: s.pfxZ, src: s.src, spread: effSpread };
  }
  o.log.push(pr);
  o.grades.push(grade);
  o.calls.push(Object.assign({}, kept));
  delete o.calls[o.calls.length - 1].ch;   // ch goes back on when the challenge is made (below)
  delete o.calls[o.calls.length - 1].pa;   // pa goes back on with each pickoff throw (below)
  if (steal) {                              // rules 7: the steal, with the pitch
    pr.steal = resolveSteal(o, steal, playCls, kept.ss === 1, st);
    if (pr.steal.result === 'safe' || pr.steal.result === 'out') { pr.outs = o.st.outs; pr.bases = o.st.bases; }
    if (pr.steal.halfOver) { pr.halfOver = pr.steal.halfOver; delete pr.steal.halfOver; pr.outs = 3; }
  }
  if (slide) pr.quick = { deliveryS: K.STEAL.QUICK.DELIVERY_S };
  if (kept.ch === 1) {                      // a replay: this call's ball was challenged right away
    if (!challengeLive(o)) throw new Error('a challenge on a pitch with none to make');
    challengePitch(o);
  }
  for (let i = 0; i < (kept.pa || 0); i++) {   // a replay: the pickoff throws made after this pitch
    if (!pickoffLive(o)) throw new Error('a pickoff with none to make');
    pickoff(o);
  }
  return { pitchResult: pr, pitchGrade: grade, state: publicState(o) };
}

/* Rules 6: the advancement rows for this ball, reweighted (contract.js THE
   RUNNERS READ THE BALL). Each row's chance times the ratio of its runners'
   category (runnerCategory) for this key, lead runner, outs and the ball's
   class (runnerClass), measured on 2024 (pipeline/runners.py), then
   renormalised. Every row is still the table's own legal play, and the runner
   draw is the same draw. A ball with no class, or a class the data does not
   move, keeps the table's mix. */
function readTheBall(pack, st, cat, pitch, trans) {
  const RN = pack.runners;
  if (!RN || !st.bases || trans.length < 2) return trans;
  const cl = K.runnerClass(cat, pitch[3], pitch[4], pitch[5], pitch[6], RN);
  if (!cl) return trans;
  const lead = st.bases & 4 ? 3 : st.bases & 2 ? 2 : 1;
  const r = RN.ratio[`${cat}|${lead}|${st.outs < 2 ? 0 : 1}|${cl}`];
  if (!r) return trans;
  const w = trans.map(([p, t]) => p * r[K.RUNNER_CATS.indexOf(K.runnerCategory(st.bases, t.moves))]);
  const sum = w.reduce((a, x) => a + x, 0);
  if (!(sum > 0)) return trans;
  return trans.map(([, t], i) => [w[i] / sum, t]);
}

/* ---- rules 7: the running game (contract.js THE RUNNING GAME) ---------------- */

/* What the UI shows: who is on, whether a pickoff is live and at which base, the disengagements
   left this plate appearance (a throw past them is a balk unless it gets him), the steals and the
   pickoffs so far. */
function runState(o) {
  const opp = o.status === 'live' ? stealOpp(o) : null;
  const left = Math.max(0, K.STEAL.DISENGAGE - o.run.dis);
  return {
    on: o.run.on.map(id => (id ? { id, name: runnerOf(o, id).name, speed: runnerOf(o, id).speed } : null)),
    pickoff: { live: pickoffLive(o), base: opp ? opp.from : null, left, balkRisk: left === 0 },
    quick: { deliveryS: K.STEAL.QUICK.DELIVERY_S, eMax: MT && MT.QUICK ? MT.QUICK.E_MAX : null },
    steals: o.log.filter(p => p.steal).map(p => Object.assign({ n: p.n }, p.steal)),
    pickoffs: o.run.events.slice(),
  };
}

/* The steal on: the lead runner with the base ahead open. {from, to, rid} or null. */
function stealOpp(o) {
  const b = o.st.bases, on = o.run.on;
  if ((b & 2) && !(b & 4) && on[2]) return { from: 2, to: 3, rid: on[2] };
  if ((b & 1) && !(b & 2) && on[1]) return { from: 1, to: 2, rid: on[1] };
  return null;
}
/* Late and close, from the batting side's margin (pipeline/steals.py late). */
function lateKey(o) {
  const inn = halfOf(o, curH(o)).inning;
  if (inn < 8) return null;
  const m = o.score.them - o.score.us;
  return m <= -3 ? 'd3' : m === -2 ? 'd2' : m === -1 ? 'd1' : m === 0 ? 't0' : 'up';
}
/* The catcher on the field in the real game: the spot's, or in a later half (rules 8) the one
   there when that half began (pack.steal.halves, steals.py --halves). */
function catcherOf(o) {
  const S = o.pack.steal, h = curH(o);
  return (h > 0 && S.halves && S.halves[h - 1] && S.halves[h - 1].catcher) || S.catcher;
}
function runnerOf(o, rid) { return o.pack.steal.runners[rid] || { name: null, att: 1, z: 0, speed: null }; }
/* The chance he goes on this pitch: the 2022 or 2024 rate for the base, outs and count, late and
   close, times him, the pitcher and the era (pack.steal). */
function attemptP(o, opp) {
  const S = o.pack.steal, st = o.st, lk = lateKey(o);
  let p = S.attempt[`${opp.to}|${st.outs}|${st.b}|${st.s}`] || 0;
  if (lk) p *= S.attMult[`late|${opp.to}|${lk}`] || 1;
  p *= runnerOf(o, opp.rid).att * S.pitcher.att * S.eraAtt;
  return Math.min(K.STEAL.CAP, p);
}
/* Whether he is safe, as a z: the base's success, the era, him, the pitcher, the catcher, late and
   close, the pickoff throws at him this plate appearance, and a quick delivery's time. */
function stealZ(o, opp, quick) {
  const S = o.pack.steal, lk = lateKey(o);
  let z = S.baseZ[opp.to] + S.eraZ + runnerOf(o, opp.rid).z + S.pitcher.z + catcherOf(o).z;
  if (lk) z += S.sucZ[`late|${opp.to}|${lk}`] || 0;
  z += S.sucZ[`po|${opp.to}|${Math.min(2, o.run.po[opp.from])}`] || 0;
  if (quick) z -= K.STEAL.QUICK.DELIVERY_S * S.zPerSecond;
  return z;
}
/* Before the pitch: does the lead runner go? One draw on the steal stream, only with a steal on. */
function stealGoes(o) {
  const opp = stealOpp(o);
  if (!opp) return null;
  return o.run.rng() < attemptP(o, opp) ? opp : null;
}
/* Who is on, after a transition: each runner to where his move takes him, the batter to his. */
function moveRunners(o, st, moved) {
  if (!moved.paOver && !(moved.runnerMoves || []).length && !moved.halfOver) return;
  const on = o.run.on, next = [null, null, null, null];
  if (moved.halfOver) { o.run.on = [null, null, null, null]; o.run.po = { 1: 0, 2: 0, 3: 0 }; o.run.dis = 0; return; }
  const batter = String(o.pack.scenario.batters[o.model.who(st)].id);
  for (let b = 1; b <= 3; b++) {
    if (!on[b]) continue;
    const m = moved.runnerMoves.find(x => x.from === b);
    const to = m ? m.to : b;
    if (to >= 1 && to <= 3) next[to] = on[b];
  }
  const bm = moved.runnerMoves.find(x => x.from === 0);
  if (bm && bm.to >= 1 && bm.to <= 3) next[bm.to] = batter;
  o.run.on = next;
  if (moved.paOver) { o.run.po = { 1: 0, 2: 0, 3: 0 }; o.run.dis = 0; }
}
/* An out on the bases: the third ends the half, and in the last half the outing, held. In a
   half before the last (rules 8) the batter at the plate leads off the next half, his count
   wiped (Official Baseball Rules 5.06(c) and 5.08: his time at bat was not over). */
function outOnBases(o) {
  const outs = o.st.outs + 1;
  if (outs >= 3) {
    const h = curH(o);
    if (h < o.model.H - 1) {
      const m = o.st.margin;
      const next = { h: h + 1, bi: o.st.bi, b: 0, s: 0, outs: 0, bases: 0, margin: m + o.model.R[h] };
      o.st = Object.assign({}, o.st, { outs: 3 });
      o.pendingHalf = endHalf(o, h, next);
      o.run.on = [null, null, null, null]; o.run.po = { 1: 0, 2: 0, 3: 0 }; o.run.dis = 0;
      return 3;
    }
    o.status = 'over';
    o.outcome = o.score.us > o.score.them ? 'door_shut' : 'tie_held';
    o.st = Object.assign({}, o.st, { outs: 3 });
    return 3;
  }
  o.st = Object.assign({}, o.st, { outs });
  return outs;
}
/* After the pitch: the steal. A ball or a strike (not a foul, a ball in play or a hit batter) and
   the runner still there with the base open: one more draw decides it. */
function resolveSteal(o, opp, cls, quick, st0) {
  const r = runnerOf(o, opp.rid), S = o.pack.steal;
  const ev = { runner: opp.rid, name: r.name, speed: r.speed, from: opp.from, to: opp.to,
    catcher: { id: catcherOf(o).id, name: catcherOf(o).name, pop: catcherOf(o).pop },
    cover: opp.to === 3 ? 5 : (o.pack.scenario.batters[o.model.who(st0)].bats === 'L' ? 6 : 4) };
  if (cls !== 'ball' && cls !== 'strike') { ev.result = 'back'; return ev; }   // a foul, a ball in play or a hit batter: he goes back, or the play takes him
  const toBit = 1 << (opp.to - 1);
  if (o.status !== 'live' || o.run.on[opp.from] !== opp.rid || (o.st.bases & toBit)) { ev.result = 'moot'; return ev; }   // the inning ended, or the walk moved him
  const z = stealZ(o, opp, quick);
  const p = K.normCdf(z), u = o.run.rng();
  ev.p = Math.round(p * 1000) / 1000;
  ev.margin = Math.round(1000 * (z - K.normInv(u)) / S.zPerSecond) / 1000;   // seconds: safe by (plus) or out by (minus)
  applySteal(o, ev, u < p ? 'safe' : 'out');
  return ev;
}
function applySteal(o, ev, result) {
  ev.result = result;
  const fromBit = 1 << (ev.from - 1), toBit = 1 << (ev.to - 1);
  o.run.on[ev.from] = null;
  if (result === 'safe') {
    o.run.on[ev.to] = ev.runner;
    o.st = Object.assign({}, o.st, { bases: (o.st.bases & ~fromBit) | toBit });
  } else {
    o.st = Object.assign({}, o.st, { bases: o.st.bases & ~fromBit });
    outOnBases(o);
    if (o.pendingHalf) { ev.halfOver = o.pendingHalf; o.pendingHalf = null; }
  }
}
/* A pickoff is live: rules 7, a pitch thrown, the outing live, and a runner with a steal on. */
function pickoffLive(o) {
  return !!o.run && o.status === 'live' && !o.finished && o.log.length > 0 && !!stealOpp(o);
}
/* The pickoff throw to the lead runner's base (the player's call between pitches). One draw on the
   steal stream: out at the season's rate per throw at that base. Past STEAL.DISENGAGE a throw that
   does not get him is a balk, and every runner moves up. Kept on the last call as pa. */
function pickoff(o) {
  if (!pickoffLive(o)) throw new Error('no pickoff to make');
  const S = o.pack.steal, opp = stealOpp(o), pk = S.pickoff[opp.from] || { out: 0 };
  const r = runnerOf(o, opp.rid);
  o.run.dis++;
  const u = o.run.rng();
  const out = u < pk.out;
  const ev = { n: o.log.length, base: opp.from, runner: opp.rid, name: r.name, dis: o.run.dis, out, balk: false,
    margin: Math.round(1000 * (K.normInv(pk.out) - K.normInv(u)) / S.zPerSecond) / 1000 };
  if (out) {
    o.run.on[opp.from] = null;
    o.st = Object.assign({}, o.st, { bases: o.st.bases & ~(1 << (opp.from - 1)) });
    outOnBases(o);
    if (o.pendingHalf) { ev.halfOver = o.pendingHalf; o.pendingHalf = null; }
  } else if (o.run.dis > K.STEAL.DISENGAGE) {
    ev.balk = true;
    const on = o.run.on, next = [null, null, null, null];
    let runs = 0, bases = 0;
    for (let b = 3; b >= 1; b--) {
      if (!on[b]) continue;
      if (b === 3) runs++;
      else { next[b + 1] = on[b]; bases |= 1 << b; }
    }
    o.run.on = next;
    const margin = o.st.margin - runs;
    o.score.them += runs;
    if (o.line && runs) addLine(o, halfOf(o, curH(o)), runs, 0, 0);
    ev.runs = runs;
    o.st = Object.assign({}, o.st, { bases, margin });
    if (margin < 0) { o.status = 'over'; o.outcome = halfOf(o, curH(o)).walkOffLive ? 'walk_off' : 'doors_open'; }
  } else {
    o.run.po[opp.from]++;
  }
  o.run.events.push(ev);
  const last = o.calls[o.calls.length - 1];
  last.pa = (last.pa || 0) + 1;
  const pr = o.log[o.log.length - 1];
  (pr.pickoffs || (pr.pickoffs = [])).push(ev);
  return { pickoff: ev, state: publicState(o) };
}

/* What a transition does to the outing: the state, the runs, the end. One
   place, for the pitch and for a challenge that changes its call. */
function applyTrans(o, st, t2, cls) {
  const runs = t2.runs || 0;
  const paOver = !t2.self && (!!t2.end || (t2.st.b === 0 && t2.st.s === 0));
  const h = st.h || 0, hf = halfOf(o, h);
  o.score.them += runs;
  // rules 8: the line score, his half (the play's runs, a hit, an error behind him)
  if (o.line && !t2.self) {
    const lbl = t2.label || null;
    addLine(o, hf, runs, lbl === 'single' || lbl === 'double' || lbl === 'triple' || lbl === 'home_run' ? 1 : 0, lbl === 'error' ? 1 : 0);
  }
  let halfOver = null;
  if (t2.half) halfOver = endHalf(o, h, t2.st);   // three outs in a half before the last: his team bats
  else if (t2.st) o.st = t2.st;
  if (t2.end) {
    o.status = 'over';
    if (t2.end === 'hold') o.outcome = o.score.us > o.score.them ? 'door_shut' : 'tie_held';
    else o.outcome = hf.walkOffLive ? 'walk_off' : 'doors_open';   // 'lost': they went ahead
  }
  const over = t2.end === 'hold' || !!t2.half;
  return {
    runs, paOver, halfOver,
    count: paOver ? { b: 0, s: 0 } : { b: o.st.b, s: o.st.s },
    outs: over ? 3 : (t2.st ? t2.st.outs : st.outs),
    bases: t2.st && !t2.half ? t2.st.bases : (t2.end || t2.half ? endBases(st.bases, t2.moves) : st.bases),
    runnerMoves: (t2.moves || []).map(([from, to]) => ({ from, to })),
  };
}

/* ---- rules 8: the halves (THE HALVES above, CONTRACT.md 5j) ------------------ */

/* The line score as the game stands: the real innings before he came in (scenario.line), then
   his halves as the player pitched them and his team's real halves as they happened. */
function lineStart(sc) {
  const L = sc.line;
  return { teams: Object.assign({}, L.teams), innings: L.innings.map(x => x.slice()), H: L.H.slice(), E: L.E.slice() };
}
function lineOut(L) { return { teams: L.teams, innings: L.innings.map(x => x.slice()), R: [0, 1].map(i => L.innings.reduce((a, x) => a + (x[i] || 0), 0)), H: L.H.slice(), E: L.E.slice() }; }
/* Runs, hits and errors on one play of a half: the batting side gets the runs and the hit, the
   fielding side the error. */
function addLine(o, hf, runs, hit, err) {
  const L = o.line, bat = hf.half === 'top' ? 0 : 1;
  while (L.innings.length < hf.inning) L.innings.push([null, null]);
  const row = L.innings[hf.inning - 1];
  row[bat] = (row[bat] || 0) + runs;
  L.H[bat] += hit;
  L.E[1 - bat] += err;
}

/* The closer's half h is over: the record the card between halves shows, his team's real half
   (each plate appearance with the score and line score after it, the player's game), then the
   next half's start. Moves the outing to next (the next half's first state). */
function endHalf(o, h, next) {
  const sc = o.pack.scenario, hf = halfOf(o, h), bt = sc.between[h], nf = halfOf(o, h + 1);
  const done = { index: h, inning: hf.inning, half: hf.half, runs: o.score.them - (h === 0 ? sc.situation.score.them : o.halves[h - 1].next.score.them),
    score: { us: o.score.us, them: o.score.them } };
  if (o.line) addLine(o, hf, 0, 0, 0);   // the half is on the board, a zero if nothing scored
  const pas = bt.pas.map(pa => {
    o.score.us += pa.runs || 0;
    if (o.line) addLine(o, bt, pa.runs || 0, pa.hit ? 1 : 0, pa.err || 0);
    return Object.assign({}, pa, { score: { us: o.score.us, them: o.score.them }, line: o.line ? lineOut(o.line) : null });
  });
  if (o.line && !bt.pas.length) addLine(o, bt, 0, 0, 0);
  // his team's runs are the record's total: a run on no plate appearance (a balk, a steal of home) counts too
  const extra = bt.runs - bt.pas.reduce((a, x) => a + (x.runs || 0), 0);
  if (extra) { o.score.us += extra; if (o.line) addLine(o, bt, extra, 0, 0); }
  o.st = next;
  const lead = o.pack.scenario.batters[o.model.who(next)];
  const rec = {
    done,
    between: { inning: bt.inning, half: bt.half, team: bt.team, abbr: bt.abbr, runs: bt.runs, pas, source: bt.source || null },
    next: { index: h + 1, inning: nf.inning, half: nf.half, walkOffLive: nf.walkOffLive, last: nf.last, outs: 0, bases: 0,
      leadoff: { index: o.model.who(next), id: lead.id, name: lead.name }, score: { us: o.score.us, them: o.score.them },
      tied: o.score.us === o.score.them },
    line: o.line ? lineOut(o.line) : null,
  };
  o.halves.push(rec);
  return rec;
}

/* rules 4: the pitcher's side challenges the last pitch's called ball (the
   player's button; contract.js ABS). The ABS zone decides. Overturned, the
   pitch is a called strike: the count, the outs and the end as if it had been
   called one (a strike has one row, so no draw). Upheld, a challenge is gone.
   Marks the call ch: 1, so a replay makes the same challenge. Never graded:
   the call is not the player's decision. The next pitch is graded from the
   count it leaves. */
function challengePitch(o) {
  if (!challengeLive(o)) throw new Error('no challenge to make');
  const pr = o.log[o.log.length - 1];
  const over = pr.abs.strike;
  pr.challenge = { by: 'pitcher', call: 'ball', abs: over ? 'strike' : 'ball', overturned: over };
  o.calls[o.calls.length - 1].ch = 1;
  pr.call.ch = 1;
  if (!over) { o.abs.pitcher--; return { pitchResult: pr, state: publicState(o) }; }
  const st = o.undo.st;
  o.st = st; o.score.them = o.undo.them; o.status = 'live'; o.outcome = null;
  if (o.line && o.lineBefore) o.line = JSON.parse(o.lineBefore);
  const t2 = o.model.transitions(st, 'strike', o.rules >= G.THIRD_OUT_RULES)[0][1];
  if (o.run) { o.run.on = o.undo.on.slice(); }
  const moved = applyTrans(o, st, t2, 'strike');
  if (o.run) moveRunners(o, st, moved);
  pr.result = 'called_strike';
  Object.assign(pr, { count: moved.count, outs: moved.outs, bases: moved.bases, runnerMoves: moved.runnerMoves, runs: moved.runs, paOver: moved.paOver });
  if (moved.halfOver) pr.halfOver = moved.halfOver;
  // rules 7: a steal on this pitch stands as it was decided (no new draw), if the strike leaves it on
  if (pr.steal && (pr.steal.result === 'safe' || pr.steal.result === 'out')) {
    const toBit = 1 << (pr.steal.to - 1);
    if (o.status === 'live' && o.run.on[pr.steal.from] === pr.steal.runner && !(o.st.bases & toBit)) {
      applySteal(o, pr.steal, pr.steal.result);
      pr.outs = o.st.outs; pr.bases = o.st.bases;
    } else pr.steal.result = 'moot';
  }
  return { pitchResult: pr, state: publicState(o) };
}

/* rules 4: a key with no real pitch in the cell it crossed (the call moved
   to a strike far out, or a ball deep in): the nearest cell's, ring by ring,
   in cell order. Only the pitch shown; what happens is the key. */
function nearestRef(entry, cell, k) {
  const r0 = K.rowOf(cell), c0 = K.colOf(cell);
  for (let ring = 1; ring <= 4; ring++) {
    for (let c = 0; c < 25; c++) {
      if (Math.max(Math.abs(K.rowOf(c) - r0), Math.abs(K.colOf(c) - c0)) !== ring) continue;
      const ref = entry.x[c][k];
      if (ref != null && ref >= 0) return ref;
    }
  }
  return -1;
}

/* Where runners stand when the outing ends on the play (the diamond's last
   picture): the moves applied to the bases before it. */
function endBases(before, moves) {
  let b = before;
  for (const [from] of moves || []) if (from >= 1 && from <= 3) b &= ~(1 << (from - 1));
  for (const [, to] of moves || []) if (to >= 1 && to <= 3) b |= 1 << (to - 1);
  return b;
}

function round3(x) { return Math.round(x * 1000) / 1000; }

/* The field, from the spray angle (degrees, 0 centre, negative the left
   field side) and the batted ball. */
const INFIELD = ['third', 'short', 'second', 'first'];
function fieldOf(bb, spray) {
  if (spray == null) return '';
  if (bb === 'ground') return INFIELD[Math.max(0, Math.min(3, Math.floor((spray + 45) / 22.5)))];
  return spray < -15 ? 'left' : spray > 15 ? 'right' : 'center';
}
function inPlayText(label, bb, spray, runs) {
  const f = fieldOf(bb, spray);
  const to = f ? ' to ' + f : '';
  let base;
  switch (label) {
    case 'single': case 'double': case 'triple': base = label + to; break;
    case 'home_run': base = 'home run' + to; break;
    case 'error': base = 'error' + (f ? ' at ' + f : ''); break;
    case 'double_play': base = 'double play'; break;
    case 'sac_fly': base = 'sac fly' + to; break;
    case 'fielders_choice': base = "fielder's choice"; break;
    default:
      base = bb === 'ground' ? 'grounded out' + to : bb === 'line' ? 'lined out' + to
        : bb === 'popup' ? 'popped out' : 'flied out' + to;
  }
  return runs ? `${base}. ${runs} in.` : `${base}.`;
}

/* ---- the result -------------------------------------------------------- */

function totalLost(o) { return o.grades.reduce((a, g) => a + g.lost, 0); }

function outingScore(o) {
  return Math.max(0, Math.round(SCORE_BASE - SCORE_PER_PT * totalLost(o))) + RESULT_BONUS[o.outcome];
}

function percentileOf(score, scores) {
  if (!scores || !scores.length) return null;
  let below = 0, tie = 0;
  for (const s of scores) { if (s < score) below++; else if (s === score) tie++; }
  return Math.round(100 * (below + tie / 2) / scores.length);
}

/* The pitched-like vector: for each count bucket, the share of hard,
   breaking and offspeed calls; then the share of targets in the zone, on its
   edge (the ring around the heart) and out of it. The closer pool carries the
   same vector per closer (pack.pool.closers[i].vec). */
function styleVector(calls, counts) {
  const fam = ['hard', 'breaking', 'offspeed'];
  const v = new Array(15).fill(0);
  const per = [0, 0, 0, 0];
  calls.forEach((c, i) => {
    const bk = G.bucketOf(counts[i].b, counts[i].s);
    per[bk]++;
    v[bk * 3 + fam.indexOf(K.FAMILY_OF[c.type])]++;
  });
  for (let bk = 0; bk < 4; bk++) for (let f = 0; f < 3; f++) v[bk * 3 + f] = per[bk] ? v[bk * 3 + f] / per[bk] : 0;
  const n = calls.length || 1;
  v[12] = calls.filter(c => K.inZone(c.cell)).length / n;
  v[13] = calls.filter(c => K.inZone(c.cell) && c.cell !== HEART).length / n;
  v[14] = calls.filter(c => !K.inZone(c.cell)).length / n;
  return v;
}

function pitchedLike(o) {
  const closers = (o.pack.pool && o.pack.pool.closers) || [];
  if (!closers.length) return { name: '', reason: '' };
  const v = styleVector(o.calls, o.log.map(p => p.countBefore));
  let best = null;
  for (const c of closers) {
    let d = 0;
    for (let i = 0; i < v.length; i++) d += (v[i] - (c.vec[i] || 0)) ** 2;
    if (!best || d < best.d) best = { d, c };
  }
  return { name: best.c.name, reason: likeReason(v, best.c, closers, o) };
}

/* Why he is the match, in the player's own numbers beside his: the trait
   where the two agree and he stands furthest from the pool's average, so the
   line names what is his and yours, not just his. Every number interpolated
   from the outing and the pack. */
const FAM_WORD = ['fastballs', 'breaking balls', 'offspeed'];
const BUCKET_WORD = ['in even counts', 'when ahead', 'when behind', 'with two strikes'];   // grade.js BUCKET_INDEX order
function likeReason(v, closer, closers, o) {
  const counts = o.log.map(p => p.countBefore);
  const per = [0, 0, 0, 0];
  counts.forEach(c => per[G.bucketOf(c.b, c.s)]++);
  const mean = v.map((_, i) => closers.reduce((a, c) => a + (c.vec[i] || 0), 0) / closers.length);
  let pick = -1, score = -Infinity;
  for (let i = 0; i < v.length; i++) {
    if (i < 12 && !per[Math.floor(i / 3)]) continue;
    const his = closer.vec[i] || 0;
    if (v[i] < 0.2 || his < 0.2) continue;   // a trait you both actually show
    const s = (his - mean[i]) - 2 * Math.abs(v[i] - his);
    if (s > score) { score = s; pick = i; }
  }
  const pc = x => Math.round(x * 100);
  if (pick < 0) pick = v[12] >= v[14] ? 12 : 14;   // always true of somebody: in the zone or out of it
  const his = closer.vec[pick] || 0;
  if (pick >= 12) {
    const what = ['in the zone', 'on the edges of the zone', 'out of the zone'][pick - 12];
    return `${pc(v[pick])}% of your pitches ${what}. he throws ${pc(his)}% there.`;
  }
  const bk = Math.floor(pick / 3), fam = FAM_WORD[pick % 3];
  const when = BUCKET_WORD[bk];
  return `${fam} on ${pc(v[pick])}% of your pitches ${when}. he throws ${pc(his)}%.`;
}

function vsReal(outcome, runs, reveal, pitches) {
  if (!reveal) return null;
  const a = K.OUTCOME_RANK[outcome], b = K.OUTCOME_RANK[reveal.outcome];
  if (a !== b) return a > b ? 'beat' : 'lost';
  if (runs !== reveal.runs) return runs < reveal.runs ? 'beat' : 'lost';
  // the third tiebreak: same outcome, same runs, so fewer pitches is the better outing.
  // Only when his count is on record (reveal.pitches is a number).
  if (typeof pitches === 'number' && typeof reveal.pitches === 'number' && pitches !== reveal.pitches) {
    return pitches < reveal.pitches ? 'beat' : 'lost';
  }
  return 'matched';
}

function finishOuting(o, extra) {
  if (o.status !== 'over') throw new Error('the outing is still live');
  o.finished = true;   // rules 4: no challenge after the result
  const runs = o.score.them - o.pack.scenario.situation.score.them;
  const score = outingScore(o);
  // an outing played on the first half alone (rules 7 and before on a pack with halves) is set
  // beside what he did in that half (pack.reveal1, the reveal such outings were shown)
  const first = o.model.H === 1 && o.pack.scenario.halves && o.pack.scenario.halves.length > 1;
  const reveal = (first && o.pack.reveal1) || o.pack.reveal || (o.pack.scenario && o.pack.scenario.reveal) || null;
  return {
    outcome: o.outcome,
    pitches: o.log.length,
    strip: o.grades.map(g => g.band),
    score,
    percentile: percentileOf(score, o.pack.pool && o.pack.pool.scores),
    pitchedLike: pitchedLike(o),
    reveal,
    vsReal: vsReal(o.outcome, runs, reveal, o.log.length),
    runs,
    lesson: L ? L.lessonFor(o) : null,
    // the closer pool's outing scores in this spot, sorted, for the end screen's chart (B11)
    pool: { scores: (o.pack.pool && o.pack.pool.scores) || [] },
    share: (extra && extra.share) || '',
  };
}

/* Replay a list of calls from the start: how a reload resumes and how
   check-replays recomputes a stored result. */
function replay(pack, seed, calls, opts) {
  const rules = opts && opts.rules != null ? opts.rules : rulesOf(calls);
  const o = createOuting(pack, { seed, rules, mode: (opts && opts.mode) || 'practice', model: opts && opts.model });
  for (const c of calls) { if (o.status !== 'live') break; throwPitch(o, c); }
  return o;
}

const publicAPI = Object.freeze({
  ENGINE_VERSION, PACK_VERSION, SCORE_BASE, SCORE_PER_PT, RESULT_BONUS,
  seedFor, createOuting, throwPitch, challengePitch, challengeLive, pickoff, pickoffLive, finishOuting, publicState, replay, rulesOf, bestCall,
  outingScore, percentileOf, styleVector, vsReal,
});
if (NODE) module.exports = publicAPI;
if (typeof window !== 'undefined') window.STD_ENGINE = publicAPI;
})();
