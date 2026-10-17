/* Shut The Door: the model, hold%, and the grade.
 *
 * Headless and dependency-free. Browser: window.STD_GRADE (after contract.js
 * and rng.js). Node: require('./grade.js').
 *
 * WHAT THIS FILE OWNS
 *   kernelFor     the miss table: target cell to actual cell, from a pitch's sigmaFt
 *   Model         one pack, read once: outcome mixes per (batter, type, target, count
 *                 bucket), hold% and run expectancy for every state under best play,
 *                 and the value of any call in any state
 *   gradeCall     the PitchGrade of a call, before it resolves (CONTRACT.md section 7)
 *
 * THE PACK'S MODEL FIELDS (Agent A's format, inside the contract's Pack)
 *   kernelZoneFt  the zone height (ft) the vertical miss is scaled by, the same
 *                 number the engine uses when it draws the miss
 *   kernel        {type: number[625]}: row target * 25 + actual. Optional: built
 *                 here from sigmaFt and kernelZoneFt when absent
 *   pitches       [[id, velo, res, bb, ev, la, spray, hit], ...] distinct real pitches.
 *                 res is a PitchCallResult; hit is single|double|triple|home_run|out|error
 *                 for in_play, else null; bb ground|line|fly|popup or null
 *   library       per batter index: {type: [25 cells][4 buckets] of [[pitchIndex, tier], ...]}
 *                 buckets in BUCKETS order, tier 0 batter, 1 similar, 2 league
 *   advance       {cat: {outs * 8 + bases: [[p, basesAfter, runs, outsAdded, InPlayResult], ...]}}
 *                 cat is single|double|triple|home_run|error|out_ground|out_line|out_fly|out_popup.
 *                 A row that makes the third out carries runs 0
 *   hold          optional cache of the solved table ({key: [hold, type, cell]}); solved
 *                 here when absent, which takes well under a second for a 9-batter pack
 *
 * STATES
 *   (batter index, balls, strikes, outs, bases, margin), margin = us - them >= 1.
 *   Terminal: three outs with the lead (hold 1), margin <= 0 (hold 0: door's
 *   open or walk-off, both lose the hold). The batter index wraps.
 *
 * WHY THE RECURSION TERMINATES
 *   Within a plate appearance the count only moves forward, except a two-strike
 *   foul, which returns to the same state; that self-loop is solved in closed
 *   form per call (V = sum of the other outcomes / (1 - p foul)). Between plate
 *   appearances, a PA either makes an out, scores a run, or puts one more man on
 *   base with neither, so (outs, -margin, runners) only grows.
 */

'use strict';
(function() {

const K = (typeof module !== 'undefined' && module.exports) ? require('./contract.js') : window.STD_CONTRACT;
const R = (typeof module !== 'undefined' && module.exports) ? require('./rng.js') : window.STD_RNG;

const BUCKETS = Object.freeze(['even', 'ahead', 'behind', 'two_strikes']);
const BUCKET_INDEX = Object.freeze({ even: 0, ahead: 1, behind: 2, two_strikes: 3 });
const HIT_CATS = Object.freeze(['single', 'double', 'triple', 'home_run', 'error']);

/* ---- the miss table --------------------------------------------------- */

/* The column a point lands in changes at x = (k - 2.5) * COL_FT, k = 1..4, and
   the row at zn = 1, 2/3, 1/3, 0 (contract.js cellAt). */
function axisProbs(centre, sigma, edges) {
  const out = [];
  let prev = 0;
  for (let k = 0; k < edges.length; k++) {
    const c = R.normCdf((edges[k] - centre) / sigma);
    out.push(c - prev);
    prev = c;
  }
  out.push(1 - prev);
  return out;
}

const X_EDGES = [1, 2, 3, 4].map(k => (k - 2.5) * K.GRID.COL_FT);
const ZN_EDGES_DESC = [1, 2 / 3, 1 / 3, 0];   // row 0 is above zn 1

function kernelFor(sigmaFt, zoneFt) {
  const out = new Array(625).fill(0);
  const sz = sigmaFt / zoneFt;
  for (let t = 0; t < 25; t++) {
    const tp = K.targetOf(t);
    const px = axisProbs(tp.x, sigmaFt, X_EDGES);
    // rows run high to low, so walk the zn edges from the top
    const pzLowToHigh = axisProbs(tp.zn, sz, ZN_EDGES_DESC.slice().reverse());
    const pz = pzLowToHigh.slice().reverse();
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) out[t * 25 + K.cellOf(r, c)] = pz[r] * px[c];
  }
  return out;
}

/* ---- counts and bases -------------------------------------------------- */

function bucketOf(b, s) { return BUCKET_INDEX[K.countBucket(b, s)]; }

/* A walk or a hit batsman: the batter to first, forced runners up one. */
function forceWalk(bases) {
  if (!(bases & 1)) return { bases: bases | 1, runs: 0 };
  if (!(bases & 2)) return { bases: bases | 3, runs: 0 };
  if (!(bases & 4)) return { bases: 7, runs: 0 };
  return { bases: 7, runs: 1 };
}

/* The outcome key of a real pitch, for the mix. */
function keyOf(row) {
  const res = row[2];
  if (res === 'ball') return 'ball';
  if (res === 'hit_by_pitch') return 'hbp';
  if (res === 'foul') return 'foul';
  if (res === 'called_strike' || res === 'swinging_strike' || res === 'foul_tip') return 'strike';
  if (res === 'in_play') {
    const hit = row[7];
    if (HIT_CATS.includes(hit)) return 'ip:' + hit;
    return 'ip:out_' + (row[3] || 'ground');
  }
  throw new Error('unknown pitch result ' + res);
}

/* ---- the model over one pack ------------------------------------------ */

function Model(pack) {
  const sc = pack.scenario;
  this.pack = pack;
  this.N = sc.batters.length;
  this.lead0 = sc.situation.score.us - sc.situation.score.them;
  this.arsenal = sc.pitcher.arsenal;
  this.types = this.arsenal.map(a => a.type);
  this.zoneFt = pack.kernelZoneFt;
  this.kernel = {};
  for (const a of this.arsenal) {
    this.kernel[a.type] = (pack.kernel && pack.kernel[a.type]) || kernelFor(a.sigmaFt, this.zoneFt);
  }
  this.keys = pack.pitches.map(keyOf);
  this._actual = new Map();   // per (bi, type, actual cell, bucket): {key: p}
  this._mixed = new Map();    // per (bi, type, target cell, bucket): [[key, p], ...]
  this._V = new Map();
  this._R = new Map();
  this._best = new Map();
}

Model.prototype.list = function (bi, type, cell, bucket) {
  const lib = this.pack.library[bi % this.N];
  const byType = lib && lib[type];
  if (!byType) throw new Error(`no library for batter ${bi} type ${type}`);
  const l = byType[cell][bucket];
  if (!l || !l.length) throw new Error(`empty library cell: batter ${bi} ${type} cell ${cell} bucket ${BUCKETS[bucket]}`);
  return l;
};

Model.prototype.actualMix = function (bi, type, cell, bucket) {
  const k = `${bi % this.N}|${type}|${cell}|${bucket}`;
  let m = this._actual.get(k);
  if (m) return m;
  m = {};
  const l = this.list(bi, type, cell, bucket);
  for (const [pi] of l) { const key = this.keys[pi]; m[key] = (m[key] || 0) + 1 / l.length; }
  this._actual.set(k, m);
  return m;
};

/* P(outcome | target), through the miss table. */
Model.prototype.mixed = function (bi, type, target, bucket) {
  const k = `${bi % this.N}|${type}|${target}|${bucket}`;
  let m = this._mixed.get(k);
  if (m) return m;
  const acc = {};
  const ker = this.kernel[type];
  for (let a = 0; a < 25; a++) {
    const w = ker[target * 25 + a];
    if (w < 1e-9) continue;
    const am = this.actualMix(bi, type, a, bucket);
    for (const key in am) acc[key] = (acc[key] || 0) + w * am[key];
  }
  m = Object.entries(acc);
  this._mixed.set(k, m);
  return m;
};

function skey(bi, b, s, outs, bases, margin) { return `${bi}|${b}${s}|${outs}|${bases}|${margin}`; }

/* The next states of one outcome: [[p, kind, ...]] where kind is 'hold' (1),
   'lost' (0), or a state tuple. Shared by the solver and the engine. */
Model.prototype.transitions = function (st, key) {
  const { bi, b, s, outs, bases, margin } = st;
  const next = this.N ? (bi + 1) % this.N : 0;
  const pa = (o, nb, runs) => {
    const m = margin - runs;
    if (m <= 0) return { end: 'lost', runs };
    if (o >= 3) return { end: 'hold', runs: 0 };
    return { st: { bi: next, b: 0, s: 0, outs: o, bases: nb, margin: m }, runs };
  };
  if (key === 'ball') {
    if (b < 3) return [[1, { st: { ...st, b: b + 1 }, runs: 0 }]];
    const w = forceWalk(bases);
    return [[1, pa(outs, w.bases, w.runs)]];
  }
  if (key === 'hbp') { const w = forceWalk(bases); return [[1, pa(outs, w.bases, w.runs)]]; }
  if (key === 'strike') {
    if (s < 2) return [[1, { st: { ...st, s: s + 1 }, runs: 0 }]];
    return [[1, pa(outs + 1, bases, 0)]];
  }
  if (key === 'foul') {
    if (s < 2) return [[1, { st: { ...st, s: s + 1 }, runs: 0 }]];
    return [[1, { self: true, runs: 0 }]];
  }
  const cat = key.slice(3);
  const rows = this.pack.advance[cat] && this.pack.advance[cat][outs * 8 + bases];
  if (!rows || !rows.length) throw new Error(`no advancement for ${cat} at outs ${outs} bases ${bases}`);
  return rows.map(([p, nb, runs, oa, label]) => [p, { ...pa(outs + oa, nb, runs), label }]);
};

/* Hold (0..1) and expected runs of one call in one state, given the values
   of the states after it. */
Model.prototype.callValue = function (st, type, target) {
  const mix = this.mixed(st.bi, type, target, bucketOf(st.b, st.s));
  let v = 0, r = 0, pself = 0;
  for (const [key, p] of mix) {
    for (const [q, t] of this.transitions(st, key)) {
      const w = p * q;
      if (t.self) { pself += w; continue; }
      if (t.end === 'hold') { v += w; r += w * t.runs; continue; }
      if (t.end === 'lost') { r += w * t.runs; continue; }
      const sub = this.solve(t.st);
      v += w * sub.hold;
      r += w * (t.runs + sub.runs);
    }
  }
  if (pself > 0) { v /= (1 - pself); r /= (1 - pself); }
  return { hold: v, runs: r };
};

Model.prototype.solve = function (st) {
  const k = skey(st.bi % this.N, st.b, st.s, st.outs, st.bases, st.margin);
  const hit = this._V.get(k);
  if (hit) return hit;
  let best = null;
  for (const type of this.types) {
    for (let cell = 0; cell < 25; cell++) {
      const cv = this.callValue(st, type, cell);
      if (!best || cv.hold > best.hold + 1e-12) best = { hold: cv.hold, runs: cv.runs, type, cell };
    }
  }
  this._V.set(k, best);
  return best;
};

Model.prototype.startState = function () {
  const s = this.pack.scenario.situation;
  return { bi: 0, b: 0, s: 0, outs: s.outs, bases: s.bases, margin: this.lead0 };
};

/* Every reachable state, solved: the pack's hold table. */
Model.prototype.holdTable = function () {
  this.solve(this.startState());
  const out = {};
  for (const [k, v] of this._V) out[k] = [Math.round(v.hold * 1e5) / 1e3, v.type, v.cell];
  return out;
};

/* ---- the grade ---------------------------------------------------------- */

const PLACE = ['up and in', 'up', 'up and away', 'in', 'middle', 'away', 'down and in', 'down', 'down and away'];
/* Where a cell is, in words relative to the batter: inside and away, never
   left and right (CONTRACT.md section 2). A right-handed batter stands on the
   catcher's left, so for him col 0 is inside. */
function placeOf(cell, bats) {
  const r = K.rowOf(cell), c = K.colOf(cell);
  const v = r <= 1 ? 0 : r >= 3 ? 2 : 1;
  let h = c <= 1 ? 0 : c >= 3 ? 2 : 1;              // 0 = catcher's left
  if (bats === 'L') h = 2 - h;
  const zone = K.inZone(cell) ? '' : ' (off the plate)';
  return PLACE[v * 3 + h] + zone;
}

function pitchName(model, type) {
  const a = model.arsenal.find(x => x.type === type);
  return a ? a.name : type;
}

function fmt(x) { return (Math.round(x * 10) / 10).toFixed(1); }

/* The reason line. House voice: lowercase, short, every number from here. */
function reasonFor(model, st, call, best, value, lost) {
  const batter = model.pack.scenario.batters[st.bi % model.N];
  const bestTxt = `${pitchName(model, best.type)} ${placeOf(best.cell, batter.bats)}`;
  if (lost <= K.BANDS[0].maxLost) {
    const note = (batter.profile.notes || [])[0];
    return note ? `the right call. ${note}.` : `the right call. ${bestTxt} holds ${fmt(best.hold * 100)}%.`;
  }
  return `${bestTxt} holds ${fmt(best.hold * 100)}%. this one holds ${fmt(value * 100)}%.`;
}

/* The PitchGrade of a call in a state, before it resolves. */
function gradeCall(model, st, call) {
  const best = model.solve(st);
  const cv = model.callValue(st, call.type, call.cell);
  const lost = Math.max(0, (best.hold - cv.hold) * 100);
  return {
    band: K.bandOf(lost),
    value: Math.round(cv.hold * 1000) / 10,
    best: Math.round(best.hold * 1000) / 10,
    lost: Math.round(lost * 100) / 100,
    bestCall: { type: best.type, cell: best.cell },
    reason: reasonFor(model, st, call, best, cv.hold, lost),
    reDelta: Math.round((cv.runs - best.runs) * 1000) / 1000,
  };
}

const publicAPI = Object.freeze({
  BUCKETS, BUCKET_INDEX, kernelFor, forceWalk, keyOf, Model, gradeCall, placeOf, bucketOf,
});
if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
if (typeof window !== 'undefined') window.STD_GRADE = publicAPI;
})();
