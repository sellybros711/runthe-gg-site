/* Shut The Door: the model, hold%, and the grade.
 *
 * Headless and dependency-free. Browser: window.STD_GRADE (after contract.js
 * and rng.js). Node: require('./grade.js').
 *
 * WHAT THIS FILE OWNS
 *   kernelFor     the miss table: target cell to actual cell, from a pitch's sigmaFt
 *   Model         one pack, read once: outcome mixes per (batter, type, target, count
 *                 bucket), hold% and expected runs for every state under best play,
 *                 and the value of any call in any state
 *   gradeCall     the PitchGrade of a call, before it resolves (CONTRACT.md section 7)
 *
 * THE PACK'S MODEL FIELDS (Agent A's format, inside the contract's Pack)
 *   keys          the outcome keys, in order (KEYS below; the pack carries its own copy)
 *   kernelZoneFt  the zone height (ft) the vertical miss is scaled by. The engine
 *                 draws the miss with the same number, so the grade's miss table
 *                 and the miss that is played are one normal
 *   kernel        {type: number[625]}: row target * 25 + actual. For reference and
 *                 the pack check; the engine rebuilds it from sigmaFt
 *   pitches       [[id, velo, res, bb, ev, la, spray], ...] the real pitches the
 *                 library points at. id is game_pk:at_bat_number:pitch_number; res a
 *                 PitchCallResult; bb ground|line|fly|popup or null; spray in degrees,
 *                 0 centre field, negative the left field side
 *   library       per batter index: {type: {p, x}}
 *                   p[cell][bucket]  14 integers, per mille, summing to 1000: the
 *                                    chance of each outcome key when this pitch
 *                                    crosses in this cell in this count bucket
 *                   x[cell]          14 integers: the real pitch drawn for each key,
 *                                    as pitchIndex * 3 + tier (0 batter, 1 similar,
 *                                    2 league), or -1 where p is 0 in every bucket
 *   advance       {cat: {outs * 8 + bases: [[p, basesAfter, runs, outsAdded, label, moves], ...]}}
 *                 for the in-play keys. moves: [[from, to], ...] with 0 the batter,
 *                 1..3 bases, 4 scored, -1 put out. Every row keeps the runners:
 *                 runners after + runs + outs added = runners before + 1. A row
 *                 that makes the third out carries runs 0
 *   hold          the solved table, dense: {margins, h, r, b}: per state index
 *                 (stateIndex below) hold (0..1), expected runs allowed, and the
 *                 best call (typeIndex * 25 + cell). Solved here when absent
 *
 * THE DRAW AND THE GRADE ARE ONE TABLE
 *   The grade mixes p over the miss table. The engine draws the outcome key from
 *   the same p (the library draw), then shows that key's real pitch. So the
 *   chance of anything happening is exactly the chance the grade priced in.
 *
 * STATES
 *   (batter index, balls, strikes, outs, bases, margin), margin = us - them >= 1.
 *   Terminal: three outs with the lead (hold 1); margin <= 0 (hold 0: door's
 *   open or walk-off, both lose the hold). The batter index wraps.
 *
 * WHY THE RECURSION TERMINATES
 *   Within a plate appearance the count only moves forward, except a two-strike
 *   foul, which returns to the same state; that self-loop is solved in closed
 *   form per call (V = sum of the other outcomes / (1 - p foul)). Between plate
 *   appearances a PA makes an out, scores a run, or puts one more man on base
 *   with neither (the advance table's conservation rule), so the pair
 *   (outs + runs, runners) only climbs.
 */

'use strict';
(function() {

const NODE = typeof module !== 'undefined' && module.exports;
const K = NODE ? require('./contract.js') : window.STD_CONTRACT;
const R = NODE ? require('./rng.js') : window.STD_RNG;

const BUCKETS = Object.freeze(['even', 'ahead', 'behind', 'two_strikes']);
const BUCKET_INDEX = Object.freeze({ even: 0, ahead: 1, behind: 2, two_strikes: 3 });
const KEYS = Object.freeze(['ball', 'called_strike', 'swinging_strike', 'foul', 'hit_by_pitch',
  'single', 'double', 'triple', 'home_run', 'error', 'out_ground', 'out_line', 'out_fly', 'out_popup']);
const IN_PLAY = Object.freeze(KEYS.slice(5));
/* what a key does to the count: the transition class */
const CLASS = Object.freeze(KEYS.map(k => (k === 'ball' ? 'ball' : k === 'hit_by_pitch' ? 'hbp'
  : k === 'foul' ? 'foul' : (k === 'called_strike' || k === 'swinging_strike') ? 'strike' : 'ip:' + k)));

/* ---- the miss table --------------------------------------------------- */

/* The column a point lands in changes at x = (k - 2.5) * COL_FT, k = 1..4, and
   the row at zn = 0, 1/3, 2/3, 1 (contract.js cellAt). */
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
const ZN_EDGES = [0, 1 / 3, 2 / 3, 1];

function kernelFor(sigmaFt, zoneFt) {
  const out = new Array(625).fill(0);
  const sz = sigmaFt / zoneFt;
  for (let t = 0; t < 25; t++) {
    const tp = K.targetOf(t);
    const px = axisProbs(tp.x, sigmaFt, X_EDGES);
    const pz = axisProbs(tp.zn, sz, ZN_EDGES).reverse();   // row 0 is the top
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) out[t * 25 + K.cellOf(r, c)] = pz[r] * px[c];
  }
  return out;
}

/* ---- counts and bases -------------------------------------------------- */

function bucketOf(b, s) { return BUCKET_INDEX[K.countBucket(b, s)]; }

/* A walk or a hit batsman: the batter to first, forced runners up one. */
function forceWalk(bases) {
  if (!(bases & 1)) return { bases: bases | 1, runs: 0, moves: [[0, 1]] };
  if (!(bases & 2)) return { bases: bases | 3, runs: 0, moves: [[1, 2], [0, 1]] };
  if (!(bases & 4)) return { bases: 7, runs: 0, moves: [[2, 3], [1, 2], [0, 1]] };
  return { bases: 7, runs: 1, moves: [[3, 4], [2, 3], [1, 2], [0, 1]] };
}

/* ---- the state index (the dense hold table) ---------------------------- */

function stateIndex(N, M, bi, b, s, outs, bases, margin) {
  return ((((bi % N) * 12 + b * 3 + s) * 3 + outs) * 8 + bases) * M + (margin - 1);
}

/* ---- the model over one pack ------------------------------------------ */

function Model(pack, opts) {
  const sc = pack.scenario;
  this.pack = pack;
  this.N = sc.batters.length;
  this.lead0 = sc.situation.score.us - sc.situation.score.them;
  this.M = Math.max(1, this.lead0);
  this.arsenal = sc.pitcher.arsenal;
  this.types = this.arsenal.map(a => a.type);
  this.zoneFt = pack.kernelZoneFt;
  if (pack.keys && pack.keys.join() !== KEYS.join()) throw new Error('pack keys differ from the engine keys');
  this.kernel = {};
  for (const a of this.arsenal) this.kernel[a.type] = kernelFor(a.sigmaFt, this.zoneFt);
  this._mixed = new Map();
  this._V = new Map();
  this.table = (!(opts && opts.fresh) && pack.hold && pack.hold.h) ? pack.hold : null;
}

Model.prototype.entry = function (bi, type) {
  const lib = this.pack.library[bi % this.N];
  const e = lib && lib[type];
  if (!e) throw new Error(`no library for batter ${bi % this.N} type ${type}`);
  return e;
};

/* P(key | actual cell): the pack's per mille row, as fractions. */
Model.prototype.probs = function (bi, type, cell, bucket) {
  return this.entry(bi, type).p[cell][bucket];
};

/* P(transition class | target), through the miss table. Cached. */
Model.prototype.mixed = function (bi, type, target, bucket) {
  const k = `${bi % this.N}|${type}|${target}|${bucket}`;
  let m = this._mixed.get(k);
  if (m) return m;
  const acc = {};
  const ker = this.kernel[type];
  const e = this.entry(bi, type);
  for (let a = 0; a < 25; a++) {
    const w = ker[target * 25 + a];
    if (w < 1e-9) continue;
    const row = e.p[a][bucket];
    for (let i = 0; i < KEYS.length; i++) {
      if (!row[i]) continue;
      const c = CLASS[i];
      acc[c] = (acc[c] || 0) + w * row[i] / 1000;
    }
  }
  m = Object.entries(acc);
  this._mixed.set(k, m);
  return m;
};

/* The next states of one transition class. Shared by the solver and the engine.
   Each: [p, {st | end: 'hold'|'lost' | self, runs, label, moves}]. */
Model.prototype.transitions = function (st, cls) {
  const { bi, b, s, outs, bases, margin } = st;
  const next = (bi + 1) % this.N;
  const pa = (o, nb, runs) => {
    const m = margin - runs;
    if (m <= 0) return { end: 'lost', runs };
    if (o >= 3) return { end: 'hold', runs: 0 };
    return { st: { bi: next, b: 0, s: 0, outs: o, bases: nb, margin: m }, runs };
  };
  if (cls === 'ball') {
    if (b < 3) return [[1, { st: { ...st, b: b + 1 }, runs: 0 }]];
    const w = forceWalk(bases);
    return [[1, { ...pa(outs, w.bases, w.runs), moves: w.moves }]];
  }
  if (cls === 'hbp') { const w = forceWalk(bases); return [[1, { ...pa(outs, w.bases, w.runs), moves: w.moves }]]; }
  if (cls === 'strike') {
    if (s < 2) return [[1, { st: { ...st, s: s + 1 }, runs: 0 }]];
    return [[1, { ...pa(outs + 1, bases, 0), moves: [[0, -1]] }]];
  }
  if (cls === 'foul') {
    if (s < 2) return [[1, { st: { ...st, s: s + 1 }, runs: 0 }]];
    return [[1, { self: true, runs: 0 }]];
  }
  const cat = cls.slice(3);
  const rows = this.pack.advance[cat] && this.pack.advance[cat][outs * 8 + bases];
  if (!rows || !rows.length) throw new Error(`no advancement for ${cat} at outs ${outs} bases ${bases}`);
  return rows.map(([p, nb, runs, oa, label, moves]) => [p, { ...pa(outs + oa, nb, runs), label, moves }]);
};

/* Hold (0..1) and expected runs of one call in one state. */
Model.prototype.callValue = function (st, type, target) {
  const mix = this.mixed(st.bi, type, target, bucketOf(st.b, st.s));
  let v = 0, r = 0, pself = 0;
  for (const [cls, p] of mix) {
    for (const [q, t] of this.transitions(st, cls)) {
      const w = p * q;
      if (t.self) { pself += w; continue; }
      if (t.end === 'hold') { v += w; continue; }
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
  const idx = stateIndex(this.N, this.M, st.bi, st.b, st.s, st.outs, st.bases, st.margin);
  const hit = this._V.get(idx);
  if (hit) return hit;
  let best;
  if (this.table && this.table.h[idx] != null) {
    const bc = this.table.b[idx];
    best = { hold: this.table.h[idx], runs: this.table.r[idx], type: this.types[Math.floor(bc / 25)], cell: bc % 25 };
  } else {
    best = null;
    for (const type of this.types) {
      for (let cell = 0; cell < 25; cell++) {
        const cv = this.callValue(st, type, cell);
        if (!best || cv.hold > best.hold + 1e-12) best = { hold: cv.hold, runs: cv.runs, type, cell };
      }
    }
  }
  this._V.set(idx, best);
  return best;
};

Model.prototype.startState = function () {
  const s = this.pack.scenario.situation;
  return { bi: 0, b: 0, s: 0, outs: s.outs, bases: s.bases, margin: this.lead0 };
};

/* Every state solved and packed dense: the pack's hold table. Rounded to six
   places, and the browser reads the rounded numbers, so every device grades
   from the same table. */
Model.prototype.holdTable = function () {
  const size = this.N * 12 * 3 * 8 * this.M;
  const h = new Array(size).fill(null), r = new Array(size).fill(null), b = new Array(size).fill(null);
  for (let bi = 0; bi < this.N; bi++) for (let bb = 0; bb < 4; bb++) for (let s = 0; s < 3; s++)
    for (let o = 0; o < 3; o++) for (let bs = 0; bs < 8; bs++) for (let m = 1; m <= this.M; m++) {
      const st = { bi, b: bb, s, outs: o, bases: bs, margin: m };
      const v = this.solve(st);
      const i = stateIndex(this.N, this.M, bi, bb, s, o, bs, m);
      h[i] = Math.round(v.hold * 1e6) / 1e6;
      r[i] = Math.round(v.runs * 1e4) / 1e4;
      b[i] = this.types.indexOf(v.type) * 25 + v.cell;
    }
  return { margins: this.M, h, r, b };
};

/* ---- the grade ---------------------------------------------------------- */

/* Where a cell is, in words relative to the batter: inside and away, never
   left and right (CONTRACT.md section 2). A right-handed batter stands on the
   catcher's left, so for him col 0 is inside. */
function placeOf(cell, bats) {
  const r = K.rowOf(cell), c = K.colOf(cell);
  const v = r <= 1 ? 'up' : r >= 3 ? 'down' : '';
  const h = c === 2 ? '' : (c < 2) === (bats !== 'L') ? 'in' : 'away';
  const parts = [];
  if (v) parts.push(v);
  if (h) parts.push(h);
  let w = parts.length ? parts.join(' and ') : 'middle';
  if (!K.inZone(cell)) w += ', out of the zone';
  return w;
}

function pitchName(model, type) {
  const a = model.arsenal.find(x => x.type === type);
  return a ? a.name : type;
}
function pct(x) { return Math.round(x * 1000) / 10; }
function fmt3(x) { return x.toFixed(3).replace(/^0/, ''); }

/* The reason line: one fact from the batter's profile or the state, with its
   number from the pack. House voice: lowercase, short. */
function reasonFor(model, st, call, best, value, lost) {
  const batter = model.pack.scenario.batters[st.bi % model.N];
  const pr = batter.profile || {};
  const bestTxt = `${pitchName(model, best.type)} ${placeOf(best.cell, batter.bats)}`;
  // a note is quoted only where it argues the point: good = it favours the pitcher
  const noteAbout = (type, cell, good) => (pr.notesFor || []).find(n => n.type === type && (n.cells || []).includes(cell) && !!n.good === good);
  if (lost <= K.BANDS[0].maxLost) {
    const n = noteAbout(call.type, call.cell, true);
    if (n) return n.text + '.';
    if (call.type === best.type && call.cell === best.cell) return `the best call here. it holds ${pct(best.hold)}%.`;
    return `as good as the best call. ${bestTxt} holds ${pct(best.hold)}%.`;
  }
  // not green: why this call cost, or why the best call was better
  const bad = noteAbout(call.type, call.cell, false);
  if (bad) return `he hurts you there. ${bad.text}. ${bestTxt} was the call.`;
  const nb = noteAbout(best.type, best.cell, true);
  if (nb) return `${bestTxt} was the call. ${nb.text}.`;
  const heat = pr.heat && pr.heat[call.cell];
  if (K.inZone(call.cell) && heat != null && heat >= 0.4) {
    return `he does damage there. ${fmt3(heat)} xwoba on contact. ${bestTxt} was the call.`;
  }
  if (st.b === 3 && !K.inZone(call.cell)) return `three balls. he chases ${Math.round((pr.chase || 0) * 100)}%. ${bestTxt} was the call.`;
  if (st.s === 2 && pr.whiff && pr.whiff[best.type] != null && best.type !== call.type) {
    return `two strikes. he whiffs on ${Math.round(pr.whiff[best.type] * 100)}% of his swings at the ${pitchName(model, best.type)}.`;
  }
  return `${bestTxt} holds ${pct(best.hold)}%. this holds ${pct(value)}%.`;
}

/* The PitchGrade of a call in a state, before it resolves. */
function gradeCall(model, st, call) {
  const best = model.solve(st);
  const cv = model.callValue(st, call.type, call.cell);
  const lost = Math.max(0, (best.hold - cv.hold) * 100);
  const lostR = Math.round(lost * 100) / 100;
  return {
    band: K.bandOf(lostR),
    value: Math.round(cv.hold * 1000) / 10,
    best: Math.round(best.hold * 1000) / 10,
    lost: lostR,
    bestCall: { type: best.type, cell: best.cell },
    reason: reasonFor(model, st, call, best, cv.hold, lostR),
    reDelta: Math.round((cv.runs - best.runs) * 1000) / 1000,
  };
}

const publicAPI = Object.freeze({
  BUCKETS, BUCKET_INDEX, KEYS, IN_PLAY, CLASS, kernelFor, forceWalk, stateIndex, Model, gradeCall,
  placeOf, bucketOf,
});
if (NODE) module.exports = publicAPI;
if (typeof window !== 'undefined') window.STD_GRADE = publicAPI;
})();
