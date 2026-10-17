/* Shut The Door: the engine.
 *
 * Headless, pure and synchronous. Browser: window.STD_ENGINE (after
 * contract.js, rng.js and grade.js). Node: require('./engine.js').
 * api.js wraps it in the contract's four async calls (CONTRACT.md section 9).
 *
 * One outing: a pack, a seed, and the calls. The same three give the same
 * outing on any device: one mulberry32 stream, four draws per pitch in a fixed
 * order (miss x, miss z, the library draw, the runner draw), no Math.random,
 * no clock.
 *
 * A PITCH
 *   1. It is graded first (grade.js), on hold% against the best call. The
 *      outcome never touches the grade.
 *   2. The miss: the target cell's centre plus a normal miss of the pitch's
 *      sigmaFt in x, and sigmaFt / kernelZoneFt in normalised height. The cell
 *      it lands in is the actual cell. The grade's miss table is the same
 *      normal, so what is graded is what is played.
 *   3. A real pitch is drawn from the library list for (batter, type, actual
 *      cell, count bucket). Its result happens.
 *   4. In play: the advancement table for the drawn batted ball's category at
 *      the current outs and bases, chosen by the runner draw.
 *
 * END RULES (CONTRACT.md section 8): three outs with the lead is door_shut. A
 * run that ties ends it doors_open. A run that puts them ahead ends it walk_off
 * when walkOffLive, otherwise doors_open. One play that ties and goes ahead is
 * decided by the go-ahead rule.
 *
 * THE OUTING SCORE (higher is better)
 *   score = max(0, 700 - SCORE_PER_PT * total pts lost) + RESULT_BONUS[outcome]
 *   The first part is the hold% kept across the outing (20 points of score per
 *   point of hold% given away), the second the result. Tuned against the closer
 *   pool when the pool exists; reported to the lead before it changes.
 */

'use strict';
(function() {

const NODE = typeof module !== 'undefined' && module.exports;
const K = NODE ? require('./contract.js') : window.STD_CONTRACT;
const R = NODE ? require('./rng.js') : window.STD_RNG;
const G = NODE ? require('./grade.js') : window.STD_GRADE;

const ENGINE_VERSION = 1;
const PACK_VERSION = 1;
const SCORE_BASE = 700;
const SCORE_PER_PT = 20;
const RESULT_BONUS = Object.freeze({ door_shut: 300, doors_open: 100, walk_off: 0 });
const TIER_NAME = Object.freeze(['batter', 'similar', 'league']);

/* Edge cells: the zone's ring (every zone cell but the heart). Used for the
   pitched-like vector. */
const HEART = 12;

function seedFor(mode, day, seed) {
  return mode === 'daily' ? R.hashSeed(K.DAILY_SEED_PREFIX + day) : (seed >>> 0);
}

function publicState(o) {
  const st = o.st;
  return {
    outingId: o.outingId,
    scenarioId: o.pack.scenario.id,
    mode: o.mode,
    seed: o.seed,
    status: o.status,
    pitchNo: o.log.length,
    count: { b: st.b, s: st.s },
    outs: st.outs,
    bases: st.bases,
    score: { us: o.score.us, them: o.score.them },
    batterIndex: st.bi,
    strip: o.grades.map(g => g.band),
    shutItLive: o.status === 'live' && st.s === 2 && st.outs === 2,
    log: o.log.slice(),
    grades: o.grades.slice(),
    debug: { seed: o.seed, tiers: o.log.map(p => p.drawn.tier) },
  };
}

function createOuting(pack, opts) {
  if (!pack || pack.v !== PACK_VERSION) throw new Error('pack format ' + (pack && pack.v) + ', engine reads ' + PACK_VERSION);
  const sc = pack.scenario;
  const model = opts.model || new G.Model(pack);
  const seed = opts.seed >>> 0;
  const st = model.startState();
  const o = {
    pack, model, seed, mode: opts.mode || 'practice',
    outingId: opts.outingId || `${sc.id}:${seed}`,
    rng: R.mulberry32(seed),
    st, status: 'live', outcome: null,
    score: { us: sc.situation.score.us, them: sc.situation.score.them },
    log: [], grades: [], calls: [],
  };
  return o;
}

function validCall(o, call) {
  if (!call || typeof call.cell !== 'number' || call.cell < 0 || call.cell > 24 || (call.cell | 0) !== call.cell) {
    throw new Error('a call needs a cell 0..24');
  }
  if (!o.model.types.includes(call.type)) throw new Error(`${call.type} is not in the arsenal`);
}

function throwPitch(o, call) {
  if (o.status !== 'live') throw new Error('the outing is over');
  validCall(o, call);
  const pack = o.pack, model = o.model, sc = pack.scenario;
  const st = o.st;

  // 1. the grade, before anything is drawn
  const grade = G.gradeCall(model, st, call);

  // 2. the four draws, always all four
  const d = R.pitchDraws(o.rng);
  const arsenal = sc.pitcher.arsenal.find(a => a.type === call.type);
  const t = K.targetOf(call.cell);
  const actual = { x: t.x + d.missX * arsenal.sigmaFt, zn: t.zn + d.missZ * arsenal.sigmaFt / pack.kernelZoneFt };
  const actualCell = K.cellAt(actual.x, actual.zn);

  // 3. the real pitch
  const bucket = G.bucketOf(st.b, st.s);
  const list = model.list(st.bi, call.type, actualCell, bucket);
  const [pi, tier] = list[Math.min(list.length - 1, Math.floor(d.library * list.length))];
  const row = pack.pitches[pi];
  const key = G.keyOf(row);

  // 4. what it does to the state
  const trans = model.transitions(st, key);
  let pickIdx = 0;
  if (trans.length > 1) {
    let acc = 0;
    pickIdx = trans.length - 1;
    for (let i = 0; i < trans.length; i++) { acc += trans[i][0]; if (d.runner < acc) { pickIdx = i; break; } }
  }
  const t2 = trans[pickIdx][1];

  const countBefore = { b: st.b, s: st.s };
  const basesBefore = st.bases;
  const outsBefore = st.outs;
  let paOver = false;
  let runs = t2.runs || 0;
  if (t2.self) {
    // a two-strike foul: nothing moves
  } else if (t2.st) {
    paOver = t2.st.bi !== st.bi || t2.st.outs !== st.outs || t2.st.bases !== st.bases || t2.st.margin !== st.margin
      || (t2.st.b === 0 && t2.st.s === 0);
    o.st = t2.st;
  } else {
    paOver = true;
  }
  o.score.them += runs;

  let inPlay;
  if (row[2] === 'in_play') {
    const label = t2.label || 'out';
    inPlay = { bb: row[3], ev: row[4], la: row[5], spray: row[6], result: label, text: inPlayText(label, runs) };
  }

  const outsAfter = t2.end === 'hold' ? 3 : (t2.st ? t2.st.outs : outsBefore);
  const basesAfter = t2.st ? t2.st.bases : (t2.self ? basesBefore : basesBefore);
  if (t2.end) {
    o.status = 'over';
    if (t2.end === 'hold') o.outcome = 'door_shut';
    else {
      const ahead = o.score.them > o.score.us;
      o.outcome = ahead && sc.situation.walkOffLive ? 'walk_off' : 'doors_open';
    }
  }

  const pr = {
    n: o.log.length + 1,
    call: { type: call.type, cell: call.cell },
    actual: { x: round3(actual.x), zn: round3(actual.zn) },
    actualCell,
    velo: row[1],
    batter: ['ball', 'called_strike', 'hit_by_pitch'].includes(row[2]) ? 'take' : 'swing',
    result: row[2],
    countBefore,
    count: paOver || t2.end ? { b: 0, s: 0 } : { b: o.st.b, s: o.st.s },
    outs: outsAfter,
    bases: t2.end ? basesBefore : basesAfter,
    runnerMoves: runnerMoves(basesBefore, t2.end ? basesBefore : basesAfter, runs, key, t2),
    runs,
    paOver: paOver || !!t2.end,
    drawn: { id: row[0], tier: TIER_NAME[tier] },
  };
  if (inPlay) pr.inPlay = inPlay;
  o.log.push(pr);
  o.grades.push(grade);
  o.calls.push({ type: call.type, cell: call.cell });
  return { pitchResult: pr, pitchGrade: grade, state: publicState(o) };
}

function round3(x) { return Math.round(x * 1000) / 1000; }

const IN_PLAY_TEXT = {
  single: 'single', double: 'double', triple: 'triple', home_run: 'home run', out: 'out',
  double_play: 'double play', sac_fly: 'sac fly', error: 'reached on an error', fielders_choice: "fielder's choice",
};
function inPlayText(label, runs) {
  const base = IN_PLAY_TEXT[label] || label;
  return runs ? `${base}. ${runs} in.` : `${base}.`;
}

/* A best-effort picture of who moved, for the diamond: occupied bases before
   and after, the batter, and the runs. The engine's state is the bases mask;
   this list is for drawing only. */
function runnerMoves(before, after, runs, key, t2) {
  const moves = [];
  if (t2 && t2.self) return moves;
  if (key === 'ball' || key === 'strike' || key === 'foul') {
    if (before === after && !runs) return moves;
  }
  const occ = [1, 2, 3].filter(b => before & (1 << (b - 1)));
  const dest = [1, 2, 3].filter(b => after & (1 << (b - 1)));
  let scored = runs;
  // lead runners first: a runner scores while runs remain, else takes the highest free base
  const free = dest.slice().sort((a, b) => b - a);
  for (const b of occ.sort((a, c) => c - a)) {
    if (scored > 0) { moves.push({ from: b, to: 4 }); scored--; continue; }
    const to = free.find(f => f >= b);
    if (to) { moves.push({ from: b, to }); free.splice(free.indexOf(to), 1); }
  }
  if (free.length) moves.push({ from: 0, to: free[free.length - 1] });
  else if (scored > 0) moves.push({ from: 0, to: 4 });
  return moves;
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
  return { name: best.c.name, reason: best.c.reason || '' };
}

function vsReal(outcome, runs, reveal) {
  if (!reveal) return null;
  const a = K.OUTCOME_RANK[outcome], b = K.OUTCOME_RANK[reveal.outcome];
  if (a !== b) return a > b ? 'beat' : 'lost';
  if (runs !== reveal.runs) return runs < reveal.runs ? 'beat' : 'lost';
  return 'matched';
}

function finishOuting(o, extra) {
  if (o.status !== 'over') throw new Error('the outing is still live');
  const runs = o.score.them - o.pack.scenario.situation.score.them;
  const score = outingScore(o);
  const reveal = o.pack.reveal || (o.pack.scenario && o.pack.scenario.reveal) || null;
  return {
    outcome: o.outcome,
    pitches: o.log.length,
    strip: o.grades.map(g => g.band),
    score,
    percentile: percentileOf(score, o.pack.pool && o.pack.pool.scores),
    pitchedLike: pitchedLike(o),
    reveal,
    vsReal: vsReal(o.outcome, runs, reveal),
    runs,
    share: (extra && extra.share) || '',
  };
}

/* Replay a list of calls from the start: how a reload resumes and how
   check-replays recomputes a stored result. */
function replay(pack, seed, calls, opts) {
  const o = createOuting(pack, { seed, mode: (opts && opts.mode) || 'practice', model: opts && opts.model });
  for (const c of calls) { if (o.status !== 'live') break; throwPitch(o, c); }
  return o;
}

const publicAPI = Object.freeze({
  ENGINE_VERSION, PACK_VERSION, SCORE_BASE, SCORE_PER_PT, RESULT_BONUS,
  seedFor, createOuting, throwPitch, finishOuting, publicState, replay,
  outingScore, percentileOf, styleVector, vsReal,
});
if (NODE) module.exports = publicAPI;
if (typeof window !== 'undefined') window.STD_ENGINE = publicAPI;
})();
