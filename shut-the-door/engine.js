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
 */

'use strict';
(function() {

const NODE = typeof module !== 'undefined' && module.exports;
const K = NODE ? require('./contract.js') : window.STD_CONTRACT;
const R = NODE ? require('./rng.js') : window.STD_RNG;
const G = NODE ? require('./grade.js') : window.STD_GRADE;
/* lesson.js is optional at load: without it the result has lesson null */
const L = NODE ? require('./lesson.js') : (window.STD_LESSON || null);

const ENGINE_VERSION = 2;
/* 2: the hold table has a slot for a tied game (margin 0), so a pack solved
   for the old end rules is refused rather than misread. */
const PACK_VERSION = 2;
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
    log: [], grades: [], calls: [], before: [],
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
  o.before.push({ bi: st.bi, b: st.b, s: st.s, outs: st.outs, bases: st.bases, margin: st.margin });

  // 2. the four draws, always all four
  const d = R.pitchDraws(o.rng);
  const arsenal = sc.pitcher.arsenal.find(a => a.type === call.type);
  const t = K.targetOf(call.cell);
  const actual = { x: t.x + d.missX * arsenal.sigmaFt, zn: t.zn + d.missZ * arsenal.sigmaFt / pack.kernelZoneFt };
  const actualCell = K.cellAt(actual.x, actual.zn);

  // 3. the outcome key, from the same per mille row the grade priced, then
  //    that key's real pitch
  const bucket = G.bucketOf(st.b, st.s);
  const entry = model.entry(st.bi, call.type);
  const row = entry.p[actualCell][bucket];
  const u = d.library * 1000;
  let k = -1, acc = 0;
  for (let i = 0; i < row.length; i++) { if (!row[i]) continue; acc += row[i]; k = i; if (u < acc) break; }
  const ref = entry.x[actualCell][k];
  if (ref == null || ref < 0) throw new Error(`no real pitch for ${G.KEYS[k]} at cell ${actualCell}`);
  const pitch = pack.pitches[Math.floor(ref / 3)];
  const tier = ref % 3;
  const cls = G.CLASS[k];

  // 4. what it does to the state, the runner draw choosing among the rows
  const trans = model.transitions(st, cls);
  let pickIdx = trans.length - 1;
  if (trans.length > 1) {
    let a2 = 0;
    for (let i = 0; i < trans.length; i++) { a2 += trans[i][0]; if (d.runner < a2) { pickIdx = i; break; } }
  }
  const t2 = trans[pickIdx][1];

  const countBefore = { b: st.b, s: st.s };
  const basesBefore = st.bases;
  const runs = t2.runs || 0;
  const paOver = !t2.self && (!!t2.end || (t2.st.b === 0 && t2.st.s === 0));
  if (t2.st) o.st = t2.st;
  o.score.them += runs;

  if (t2.end) {
    o.status = 'over';
    if (t2.end === 'hold') o.outcome = o.score.us > o.score.them ? 'door_shut' : 'tie_held';
    else o.outcome = sc.situation.walkOffLive ? 'walk_off' : 'doors_open';   // 'lost': they went ahead
  }

  const res = pitch[2];
  const pr = {
    n: o.log.length + 1,
    call: { type: call.type, cell: call.cell },
    actual: { x: round3(actual.x), zn: round3(actual.zn) },
    actualCell,
    velo: pitch[1],
    batter: (res === 'ball' || res === 'called_strike' || res === 'hit_by_pitch') ? 'take' : 'swing',
    result: res,
    countBefore,
    count: paOver ? { b: 0, s: 0 } : { b: o.st.b, s: o.st.s },
    outs: t2.end === 'hold' ? 3 : (t2.st ? t2.st.outs : st.outs),
    bases: t2.st ? t2.st.bases : (t2.end ? endBases(basesBefore, t2.moves) : basesBefore),
    runnerMoves: (t2.moves || []).map(([from, to]) => ({ from, to })),
    runs,
    paOver,
    drawn: { id: pitch[0], tier: TIER_NAME[tier] },
  };
  if (cls.startsWith('ip:')) {
    const label = t2.label || 'out';
    pr.inPlay = { bb: pitch[3], ev: pitch[4], la: pitch[5], spray: pitch[6], result: label, text: inPlayText(label, pitch[3], pitch[6], runs) };
  }
  o.log.push(pr);
  o.grades.push(grade);
  o.calls.push({ type: call.type, cell: call.cell });
  return { pitchResult: pr, pitchGrade: grade, state: publicState(o) };
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
