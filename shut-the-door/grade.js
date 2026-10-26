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
 *                 and the miss that is played are one normal (at 1.0x: a call's
 *                 release q scales the played miss, never this table; engine.js)
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
 *                 (stateIndex below) the goal's chance (0..1, see THE GOAL), the
 *                 expected runs allowed until the outing ends, and the best call
 *                 (typeIndex * 25 + cell). margins is the starting lead; the
 *                 table has a slot for every margin from 0 (tied) to it. Solved
 *                 here when absent
 *
 * THE DRAW AND THE GRADE ARE ONE TABLE
 *   The grade mixes p over the miss table. The engine draws the outcome key from
 *   the same p (the library draw), then shows that key's real pitch. So the
 *   chance of anything happening is exactly the chance the grade priced in.
 *
 * STATES
 *   (batter index, balls, strikes, outs, bases, margin), margin = us - them >= 0.
 *   A run that ties does not end the outing (the owner's call, 2026-10-20): the
 *   inning goes on at margin 0. Terminal: three outs (the margin stands), and
 *   a run that puts them ahead (margin < 0: door's open or walk-off). The
 *   batter index wraps.
 *
 * THE GOAL, AND WHAT hold MEANS
 *   A state's value is the chance of its goal under best play from there on:
 *     margin >= 1   the hold: three outs with the lead. A tie is a blown save,
 *                   so a move into margin 0 is worth 0 here, exactly as it was
 *                   when a tie ended the outing. Grading before a tie is
 *                   unchanged.
 *     margin 0      after the tie: three outs before they go ahead.
 *   goalOf(st) is that least margin (1 or 0), and a move into a state below it
 *   is worth 0. A state's goal never changes while the margin stays at or
 *   above it, so the recursion stays one value function over one state space,
 *   and the grade, the bands (rel) and the lesson read it the same way in
 *   both. The field keeps its name, `hold`, in the table and in the API.
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

/* The miss table's row for one aim point (x ft, zn): the chance of each of
   the 25 cells. kernelFor is this at every cell's centre. */
function kernelRowAt(sigmaFt, zoneFt, x, zn) {
  const px = axisProbs(x, sigmaFt, X_EDGES);
  const pz = axisProbs(zn, sigmaFt / zoneFt, ZN_EDGES).reverse();
  const out = new Array(25).fill(0);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) out[K.cellOf(r, c)] = pz[r] * px[c];
  return out;
}

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

/* M is the starting lead: margins 0..M, so M + 1 slots per (batter, count, outs, bases). */
function stateIndex(N, M, bi, b, s, outs, bases, margin) {
  return ((((bi % N) * 12 + b * 3 + s) * 3 + outs) * 8 + bases) * (M + 1) + margin;
}

/* The least margin that meets a state's goal: 1 (hold the lead) or, once it is
   tied, 0 (keep them from going ahead). See THE GOAL above. */
function goalOf(st) { return st.margin >= 1 ? 1 : 0; }

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
  // rules 3: a run that crosses before a legal third out counts (THE THIRD
  // OUT below). A model for an outing played before (rules 1 and 2) scores
  // none on a third out, and solves its own table: the pack's is rules 3's.
  this.thirdOutRuns = !(opts && opts.thirdOutRuns === false);
  this.table = (!(opts && opts.fresh) && this.thirdOutRuns && pack.hold && pack.hold.h) ? pack.hold : null;
  this.center = pack.seq && typeof pack.seq.L === 'number' ? pack.seq.L : null;   // rules 2 (see DEFAULT_CENTER)
  this.zone0 = pack.seq && typeof pack.seq.Z === 'number' ? pack.seq.Z : null;
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
   Each: [p, {st | end: 'hold'|'lost' | self, runs, label, moves, margin}].
   third (default the model's): whether a run on a third out counts (rules 3).

   THE THIRD OUT (rules 3, 2026-10-24). A run that crosses before the third
   out counts unless that out is a force or the batter before he reaches
   first (Official Baseball Rules 5.08(a)): a two-out single, the runner from
   second scores, the batter is thrown out at second, is a run. The
   advancement table's half-ending rows are the real plays (pipeline
   third_outs.py) with the runs the official score counted, and
   check-rules.mjs holds every row to the rule. A run on the third out that
   puts them ahead is the go-ahead run; one that ties it ends the half tied,
   a held tie. Rules 1 and 2 scored none on a third out, and an outing played
   under them replays that way, exactly. */
Model.prototype.transitions = function (st, cls, third) {
  const { bi, b, s, outs, bases, margin } = st;
  const next = (bi + 1) % this.N;
  const counts = third == null ? this.thirdOutRuns : third;
  const pa = (o, nb, runs) => {
    if (o >= 3 && !counts) return { end: 'hold', runs: 0 };   // rules 1 and 2: a third out scores none
    const m = margin - runs;
    if (m < 0) return { end: 'lost', runs };        // they go ahead: the go-ahead rule decides
    // three outs. A run that crossed before a third out that was neither a
    // force nor the batter before first counts (Official Baseball Rules
    // 5.08(a)); the advancement table holds only such runs (check-rules.mjs).
    // The margin the half ends at decides door shut or held tie.
    if (o >= 3) return { end: 'hold', runs, margin: m };
    const r = { st: { bi: next, b: 0, s: 0, outs: o, bases: nb, margin: m }, runs };
    if (m === 0 && margin > 0) r.tie = true;        // this play tied it, and the inning goes on
    return r;
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

/* The goal's chance after one transition out of st (not a self-loop): 1 for
   three outs at or above st's goal (0 when a run on the third out tied it
   from a lead), 0 when they go ahead, 0 for a state below st's goal (a tie
   from a lead), else that state's own value. Shared by callValue and the
   lesson. */
Model.prototype.after = function (st, t) {
  if (t.end === 'hold') return t.margin == null || t.margin >= goalOf(st) ? 1 : 0;
  if (t.end === 'lost') return 0;
  return t.st.margin >= goalOf(st) ? this.solve(t.st).hold : 0;
};

/* The goal's chance (0..1) and the expected runs of one call in one state.
   The runs follow the outing on through a tie, to its real end. */
Model.prototype.callValue = function (st, type, target, ctx, at) {
  if (ctx) return this.callValueCtx(st, type, target, ctx, at);
  const mix = this.mixed(st.bi, type, target, bucketOf(st.b, st.s));
  let v = 0, r = 0, pself = 0;
  for (const [cls, p] of mix) {
    for (const [q, t] of this.transitions(st, cls)) {
      const w = p * q;
      if (t.self) { pself += w; continue; }
      v += w * this.after(st, t);
      if (t.end) r += w * t.runs;          // lost, or a run on the third out
      else if (t.st) r += w * (t.runs + this.solve(t.st).runs);
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

/* The mean hold% points lost over every legal call in a state: what a
   typical call costs here. Bands are measured against it (CONTRACT.md
   section 7), so a tight spot and a quiet one both grade in real colours. */
Model.prototype.meanLost = function (st, ctx) {
  if (ctx) { this.bestCtx(st, ctx); return ctx._meanLost; }
  const idx = stateIndex(this.N, this.M, st.bi, st.b, st.s, st.outs, st.bases, st.margin);
  if (!this._ML) this._ML = new Map();
  if (this._ML.has(idx)) return this._ML.get(idx);
  const best = this.solve(st).hold;
  let sum = 0, n = 0;
  for (const type of this.types) for (let cell = 0; cell < 25; cell++) { sum += (best - this.callValue(st, type, cell).hold) * 100; n++; }
  const m = sum / n;
  this._ML.set(idx, m);
  return m;
};

Model.prototype.startState = function () {
  const s = this.pack.scenario.situation;
  return { bi: 0, b: 0, s: 0, outs: s.outs, bases: s.bases, margin: this.lead0 };
};

/* Every state solved and packed dense: the pack's hold table. Rounded to six
   places, and the browser reads the rounded numbers, so every device grades
   from the same table. */
Model.prototype.holdTable = function () {
  const size = this.N * 12 * 3 * 8 * (this.M + 1);
  const h = new Array(size).fill(null), r = new Array(size).fill(null), b = new Array(size).fill(null);
  for (let bi = 0; bi < this.N; bi++) for (let bb = 0; bb < 4; bb++) for (let s = 0; s < 3; s++)
    for (let o = 0; o < 3; o++) for (let bs = 0; bs < 8; bs++) for (let m = 0; m <= this.M; m++) {
      const st = { bi, b: bb, s, outs: o, bases: bs, margin: m };
      const v = this.solve(st);
      const i = stateIndex(this.N, this.M, bi, bb, s, o, bs, m);
      h[i] = Math.round(v.hold * 1e6) / 1e6;
      r[i] = Math.round(v.runs * 1e4) / 1e4;
      b[i] = this.types.indexOf(v.type) * 25 + v.cell;
    }
  return { margins: this.M, h, r, b };
};

/* ---- rules 2: the hitter adjusts, the arm tires (the owner's call, 2026-10-22) ----
 *
 * A call is graded and resolved in the light of what came before it in the
 * outing. Rules 1 (every outing stored before rules 2 shipped: every call
 * without r) has none of this and plays exactly as it did.
 *
 * WHAT IS MEASURED AND WHAT IS A MODEL. pipeline/effects.py read every 2024
 * regular season pitch (705,748 after prep; the numbers in
 * pipeline/effects.json). Against what the same pitch family does in the same
 * cell, at the same exact count and platoon, a pitch the batter has already
 * seen in the plate appearance (the same type, even in the same spot) does
 * within about 5% of the rest, key by key; a reliever's location spread is
 * flat with his pitch count (within 1%) and about 1% wider with runners on.
 * Those are real numbers, and they are small because the data is chosen by
 * the pitchers: a pitcher repeats a pitch when it is working, and a tired one
 * is taken out. They cannot say what happens to a pitcher who repeats himself
 * or stays in. So:
 *   - real and used as they are: how often each kind of repeat happens
 *     (PA_SHARE, OUTING.mean), relievers' pitch counts (FATIGUE.mean), and the
 *     spread with runners on (PRESSURE)
 *   - a labelled model, its strength tuned so a strong player who reads the
 *     screen and mixes his pitches holds about what the closer pool holds
 *     (the README has the measurements): FAMILIAR and EFFECT (the hitter
 *     adjusts to a pitch he has seen), ZONE (he sits on strikes against a
 *     pitcher who keeps aiming in the zone, and lays off one who nibbles),
 *     and FATIGUE's rate (the arm past 12 pitches)
 * Every effect is centred on real pitching: on the closer pool's own
 * sequencing in that pack (pack.seq, pool.js seqCenter), so a pitcher who
 * mixes like the real closers meets the library's numbers on average, and a
 * predictable one pays.
 *
 * THE GRADE STAYS THE DECISION. Every call is still graded before it resolves,
 * now with what the hitter has seen and the arm as it is: the call's value is
 * this pitch's adjusted outcome mix through the miss table at the arm's
 * spread, followed by the hold table's values for whatever state comes next.
 * The best call is the best of every legal call priced the same way, and the
 * band is relative to their mean, as always. The table itself is solved
 * without history (it cannot hold every sequence), so the grade looks one
 * pitch ahead with the history and leans on the table after that. The
 * release (q) is still never read: it is execution.
 */
const RULES = 6;
/* Rules 3 (2026-10-24) is rules 2 with MLB's third out: a run that crosses
   before a third out that is neither a force nor the batter before first
   counts (Model.prototype.transitions, THE THIRD OUT). Everything below
   applies to rules 2 and 3 alike (rules >= 2). */
const THIRD_OUT_RULES = 3;
/* Rules 4 (2026-10-24) is rules 3 with the call by location (contract.js THE
   CALL: the umpire's chance where the ball crossed, the grade one pitch ahead
   splits each cell's takes the same way), ABS challenges (contract.js ABS;
   engine.js) and the bright band's release (contract.js PERFECT). */
const ABS_RULES = 4;
/* Rules 5 (2026-10-25) is rules 4 with the routine play (contract.js ROUTINE,
   the owner's call): an error on a routine grounder, fly or popup is
   extremely rare. Where a cell's real error is a routine ball, all but
   ROUTINE.KEEP of the error key's share goes to the cell's real out of the
   same kind (Model.routineOf): the engine reads it inside the error's slice of
   the library draw, the grade one pitch ahead moves the same share
   (keyMixCtx). The draws do not move, and no other key's draw changes. */
const ROUTINE_RULES = 5;
/* Rules 6 (2026-10-26) is rules 5 with the runners reading the ball (contract.js
   THE RUNNERS READ THE BALL, engine.js readTheBall): the advancement row is
   drawn from the table's rows weighted by how real runners went on a ball of
   that carry and side. The grade keeps the table's own mix: one real ball
   stands for each key in a cell, and its depth is that ball's, not the
   hitter's (the weights average back to the table over the real balls). */
const RUNNER_RULES = 6;
const KEY_ERROR = 9, KEY_OUT = Object.freeze({ ground: 10, fly: 12, popup: 13 });
/* The settings of rules 2, in one place.
   FAMILIAR   how familiar a pitch is (the level L), by the pitches of the same
              type the batter has seen this plate appearance (1, 2, 3 or more)
              and whether one crossed within one cell of where this one crosses
   PA_SHARE   how often each happens in real 2024 pitching (measured)
   OUTING     more level from the same type thrown to earlier batters in the
              outing: per pitch, up to cap. mean: 2024 relievers (measured)
   EFFECT     what a level above the centre does to the row, key by key: a
              swinging strike x (1 - whiff L), a ball x (1 + take L), a hit
              x (1 + hit L), a home run x (1 + hr L), each at least FLOOR.
              Below the centre (a fresh look) the same lines run the other way
   ZONE       where he has aimed: the share of the outing's aims in the zone,
              shrunk toward the centre by k pitches, minus the centre (the pool's
              aims, pack.seq.Z; z0 is the league's crossings, the fallback).
              Above it a zone pitch's hits x (1 + zoneHit dz) and called
              strikes x (1 - zoneTake dz), a chase pitch's balls
              x (1 - chaseTake dz) and whiffs x (1 + chaseWhiff dz)
   FATIGUE    his miss x (1 + rate x pitches past from), capped, divided by
              its mean over 2024 relievers' real pitch counts (measured)
   PRESSURE   his miss with the bases empty and with runners on (measured) */
const R2 = Object.freeze({
  FAMILIAR: Object.freeze({ seen0: 0, seen1_far: 0.5, seen1_near: 1, seen2_far: 1, seen2_near: 2, seen3_far: 1.5, seen3_near: 3 }),
  PA_SHARE: Object.freeze({ seen0: 0.5656, seen1_far: 0.1443, seen1_near: 0.1229, seen2_far: 0.0358, seen2_near: 0.0739, seen3_far: 0.011, seen3_near: 0.0464 }),
  OUTING: Object.freeze({ per: 0.05, cap: 0.5, mean: 0.1603 }),
  EFFECT: Object.freeze({ whiff: 0.3, take: 0.15, hit: 0.3, hr: 0.45, FLOOR: 0.2 }),
  ZONE: Object.freeze({ z0: 0.4551, k: 4, zoneHit: 2, zoneTake: 1.5, chaseTake: 1, chaseWhiff: 1 }),
  FATIGUE: Object.freeze({ from: 12, rate: 0.02, cap: 1.4, mean: 1.0724 }),
  PRESSURE: Object.freeze({ empty: 0.9974, on: 1.0058 }),
});
/* The familiarity real pitching shows on average, which rules 2 centres on.
   A pack carries its own (pack.seq.L: the mean the closer pool's real
   sequencing shows against that pitcher's arsenal, pool.js seqCenter), since a
   two-pitch closer repeats himself more than the league and his real
   numbers already live with it. Without one: the league's (2024 shares). */
const PA_MEAN = Object.keys(R2.FAMILIAR).reduce((a, k) => a + R2.FAMILIAR[k] * R2.PA_SHARE[k], 0)
  / Object.keys(R2.FAMILIAR).reduce((a, k) => a + R2.PA_SHARE[k], 0);

const DEFAULT_CENTER = PA_MEAN + R2.OUTING.mean;

function near1(a, b) { return Math.max(Math.abs(K.rowOf(a) - K.rowOf(b)), Math.abs(K.colOf(a) - K.colOf(b))) <= 1; }
const KI_ = Object.freeze(Object.fromEntries(KEYS.map((k, i) => [k, i])));

/* How familiar the batter is with this type crossing this cell, centred so
   real 2024 mixing is 0 on average. Negative is a fresh look. */
function familiarRaw(ctx, type, cell) {
  const same = ctx.pa.filter(p => p.type === type);
  const n = Math.min(3, same.length);
  const key = n === 0 ? 'seen0' : `seen${n}_${same.some(p => near1(p.cell, cell)) ? 'near' : 'far'}`;
  const seen = ctx.before[type] || 0;
  return R2.FAMILIAR[key] + Math.min(R2.OUTING.cap, seen * R2.OUTING.per);
}
function familiarOf(ctx, type, cell) { return familiarRaw(ctx, type, cell) - ctx.center; }

/* The multipliers on one row, in KEYS order. */
function adjustOf(ctx, type, cell) {
  const L = familiarOf(ctx, type, cell), E = R2.EFFECT, Z = R2.ZONE;
  const f = x => Math.max(E.FLOOR, x);
  /* where he has been: the share of the outing's pitches that crossed in the
     zone, shrunk toward the league's (z0) by k pitches. Above it the hitter
     sits on strikes: a zone pitch is hit more and taken less, a chase pitch
     is chased more. Below it (nibbling) the reverse. */
  const dz = (ctx.zone + Z.k * ctx.z0) / (ctx.seen + Z.k) - ctx.z0;
  const inz = K.inZone(cell);
  const m = KEYS.map(() => 1);
  m[KI_.swinging_strike] = f((1 - E.whiff * L) * (inz ? 1 : 1 + Z.chaseWhiff * dz));
  m[KI_.ball] = f((1 + E.take * L) * (inz ? 1 : 1 - Z.chaseTake * dz));
  m[KI_.called_strike] = f(inz ? 1 - Z.zoneTake * dz : 1);
  const hit = f((1 + E.hit * L) * (inz ? 1 + Z.zoneHit * dz : 1));
  m[KI_.single] = m[KI_.double] = m[KI_.triple] = hit;
  m[KI_.home_run] = f((1 + E.hr * L) * (inz ? 1 + Z.zoneHit * dz : 1));
  return m;
}

/* The spread multiplier of the arm on this pitch: his pitch count in the
   outing (this pitch's number) and runners on. */
function fatigueOf(pitchNo, bases) {
  const F = R2.FATIGUE;
  const f = Math.min(F.cap, 1 + F.rate * Math.max(0, pitchNo - F.from)) / F.mean;
  return Math.round(f * (bases ? R2.PRESSURE.on : R2.PRESSURE.empty) * 10000) / 10000;
}

/* ---- effort (the owner's calls, 2026-10-22 and 2026-10-23; CONTRACT.md 5c) ----
 *
 * The meter's first stop: how hard he throws it, e 0..1 on the call. What is
 * DATA and what is a GAME CHOICE is marked on every line below.
 *   1. THE PITCH. DATA: a pitch at effort e is one from further along his own
 *      velocity for that type. e walks five slices of it: his slowest 5%, the
 *      second fifth, the middle fifth, the fourth fifth, his fastest 5%. Its
 *      speed and break are the mean of his own pitches in that slice
 *      (contract.js stuffAt). What a pitch from each slice does is measured on
 *      every 2024 regular season pitch (pipeline/effort.py, effort.json): key by
 *      key, observed over what that family does in the same cell, exact count
 *      and platoon; every pitcher has the same share of his pitches in each
 *      slice, so who is pitching cancels. Each is shrunk toward 1 by its own
 *      standard error and set so the middle slice is exactly 1 (EFFORT.BINS).
 *      A measured association: the count and the spot are held, his intent is
 *      not. It says: a harder fastball misses more bats and gives up fewer
 *      home runs, a harder breaking ball whiffs about the same and is called a
 *      strike less, a harder changeup or splitter whiffs less.
 *      GAME CHOICE, NOT DATA: above the middle every measured ratio's distance
 *      from 1 is multiplied by EFFORT.GAME (the owner: max effort should be a
 *      real weapon). Below the middle by GAME_DOWN (1: the data as it is).
 *      The direction is always the data's; the size is the game's.
 *   2. THE MISS. DATA: his fastest slice misses wider than his middle one
 *      (EFFORT.SPREAD: fastballs 3%, breaking balls 11%, offspeed 6%).
 *      GAME CHOICE: scaled by SPREAD_GAME. Below the middle it is 1.
 *   3. THE WINDOW. GAME RULE (meter.js EFFORT_WINDOW): more effort makes the
 *      accuracy stop's window smaller, less makes it bigger.
 *   4. THE ARM. MODEL: a pitch counts loadOf(e) pitches on the arm for every
 *      pitch after it, and the extra over 1 builds a strain that easy pitches
 *      pay back; the arm's miss is x (1 + STRAIN x strain). Real relievers'
 *      velocity is flat across an outing (tired arms are taken out), so these
 *      are tuned with pipeline/strategies.cjs, not measured.
 * e 0.5 (or no e) changes none of them: the same row, miss, window and arm.
 * THE GRADE NEVER READS THIS PITCH'S e: like q it is how he throws it, and it
 * cannot be priced without assuming how well the player times (the window)
 * or a horizon past one pitch (the arm). The arm and strain of earlier efforts
 * are history the grade prices, as fatigue always was.
 */
const EFFORT = Object.freeze({
  /* DATA: observed / expected for each slice of his velocity, slowest first, per family */
  BINS: Object.freeze({
    hard: Object.freeze({
      ball: [1.011, 1.0, 1.0, 1.0, 1.0],
      called: [1.002, 1.001, 1.0, 0.999, 0.984],
      whiff: [0.78, 0.943, 1.0, 1.058, 1.131],
      foul: [0.943, 1.0, 1.0, 1.001, 1.045],
      hit: [1.077, 1.0, 1.0, 1.0, 0.917],
      hr: [1.343, 1.041, 1.0, 0.915, 0.749],
      out: [1.111, 1.036, 1.0, 0.963, 0.87],
    }),
    breaking: Object.freeze({
      ball: [1.041, 1.003, 1.0, 1.003, 1.024],
      called: [1.062, 1.029, 1.0, 0.967, 0.809],
      whiff: [0.834, 0.946, 1.0, 1.051, 0.992],
      foul: [0.901, 1.0, 1.0, 1.0, 1.057],
      hit: [1.0, 1.0, 1.0, 1.0, 0.965],
      hr: [1.008, 0.985, 1.0, 1.008, 0.791],
      out: [0.995, 1.014, 1.0, 0.985, 0.984],
    }),
    offspeed: Object.freeze({
      ball: [1.004, 1.001, 1.0, 1.004, 1.088],
      called: [1.035, 1.0, 1.0, 1.0, 0.923],
      whiff: [0.982, 1.036, 1.0, 0.982, 0.86],
      foul: [0.988, 0.997, 1.0, 0.997, 0.997],
      hit: [1.0, 1.0, 1.0, 1.0, 1.066],
      hr: [1.0, 1.0, 1.0, 1.0, 0.957],
      out: [1.003, 0.993, 1.0, 1.003, 0.972],
    }),
  }),
  /* DATA: his location spread at each slice, against his middle slice, above the middle only.
     Below it 1, a game choice: the data's slowest slice is wider, but that is a slipped pitch more
     than an eased one. Scaled by SPREAD_GAME */
  SPREAD: Object.freeze({ hard: [1.0, 1.0, 1.0, 1.002, 1.034], breaking: [1.0, 1.0, 1.0, 1.0, 1.108], offspeed: [1.0, 1.0, 1.0, 1.0, 1.064] }),
  /* the key groups the bins are measured in: ball, called strike, whiff, foul, hits but the home run, home run, outs in play */
  GROUP: Object.freeze({ ball: [0], called: [1], whiff: [2], foul: [3], hit: [5, 6, 7], hr: [8], out: [10, 11, 12, 13] }),
  /* MODEL, the arm: a pitch at e above 0.5 counts 1 + LOAD_UP x (2e - 1) pitches on the arm for
     every pitch after it, below 0.5 1 - LOAD_DOWN x (1 - 2e) */
  LOAD_UP: 1,
  LOAD_DOWN: 0.5,
  /* MODEL, the strain: the extra load of pitches above ordinary builds up, and pitches under
     it pay it back (never below 0). The arm's miss is x (1 + STRAIN x strain). Without e (or at e
     0.5 and under, from a fresh arm) the strain is 0 and the arm is rules 2's exactly */
  STRAIN: 0.05,
  /* GAME CHOICE, NOT DATA (the owner, 2026-10-23: effort should feel like a real weapon).
     Above the middle, every measured ratio's distance from 1 is multiplied by GAME before it is used:
     m = max(FLOOR, 1 + GAME x (measured - 1)). GAME 1 would be the data as measured. The
     direction of every effect is the data's; only its size is the game's. */
  GAME: 8,
  /* GAME CHOICE: the same below the middle (an easy pitch). 1 is the data as measured */
  GAME_DOWN: 1,
  /* GAME CHOICE, NOT DATA: the same for the measured spread (SPREAD), so a max effort pitch
     misses wider than the data alone says */
  SPREAD_GAME: 2,
  FLOOR: 0.2,
});

/* The 14 multipliers (KEYS order) of a pitch of this type at effort e. All 1 at e 0.5. */
function effortMult(type, e) {
  const m = KEYS.map(() => 1);
  const ee = K.effortE(e);
  if (ee == null || ee === K.EFFORT.MID) return m;
  const bins = EFFORT.BINS[K.FAMILY_OF[type]] || {};
  const pos = ee * 4, i = Math.min(3, Math.floor(pos)), f = pos - i;
  const gain = ee > K.EFFORT.MID ? EFFORT.GAME : EFFORT.GAME_DOWN;
  for (const g of Object.keys(EFFORT.GROUP)) {
    const b = bins[g];
    if (!b) continue;
    const v = b[i] * (1 - f) + b[i + 1] * f;
    const amp = Math.max(EFFORT.FLOOR, 1 + gain * (v - 1));   // game choice, not data (EFFORT.GAME, GAME_DOWN)
    for (const k of EFFORT.GROUP[g]) m[k] = amp;
  }
  return m;
}
/* His miss at effort e, as a multiple of his own: harder than ordinary misses
   wider (measured, scaled by GAME). 1 at e 0.5 and below, and without e.
   The engine multiplies the played miss by it; the grade never reads it. */
function effortSpread(type, e) {
  const ee = K.effortE(e);
  if (ee == null || ee <= K.EFFORT.MID) return 1;
  const sp = EFFORT.SPREAD[K.FAMILY_OF[type]];
  if (!sp) return 1;
  const pos = ee * 4, i = Math.min(3, Math.floor(pos)), f = pos - i;
  const v = sp[i] * (1 - f) + sp[i + 1] * f;
  return Math.round((1 + EFFORT.SPREAD_GAME * (v - 1)) * 10000) / 10000;   // game choice, not data (EFFORT.SPREAD_GAME)
}

/* A row (per mille, one actual cell) at effort e: key by key. Not renormalised:
   the engine draws against the row's own sum. */
function effortRow(row, type, e) {
  const ee = K.effortE(e);
  if (ee == null || ee === K.EFFORT.MID) return row;
  const m = effortMult(type, ee);
  return row.map((x, i) => x * m[i]);
}
/* What one pitch at effort e puts on the arm, in pitches. */
function loadOf(e) {
  const ee = K.effortE(e);
  if (ee == null) return 1;
  return ee >= K.EFFORT.MID ? 1 + EFFORT.LOAD_UP * (2 * ee - 1) : 1 - EFFORT.LOAD_DOWN * (1 - 2 * ee);
}

/* The history one call is priced against, from the outing's log: the pitches
   of this plate appearance (type, the cell each actually crossed), the
   pitches of each type thrown to earlier batters, and the arm. */
function contextOf(log, st, rules, center, zone0) {
  if (!rules || rules < 2) return null;
  let i = log.length;
  while (i > 0 && !log[i - 1].paOver) i--;
  const pa = log.slice(i).map(p => ({ type: p.call.type, cell: p.actualCell }));
  const before = {};
  for (let j = 0; j < i; j++) before[log[j].call.type] = (before[log[j].call.type] || 0) + 1;
  let streak = 0;
  const last = log.length ? log[log.length - 1].call.type : null;
  for (let j = log.length - 1; j >= 0 && log[j].call.type === last; j--) streak++;
  const pitchNo = log.length + 1;
  /* the arm's count: each earlier pitch at its effort's load (no e: 1, so a
     log without effort gives exactly pitchNo), then this pitch as 1 */
  let arm = 1, strain = 0;
  for (const p of log) { const l = loadOf(p.call.e); arm += l; strain = Math.max(0, strain + l - 1); }
  arm = Math.round(arm * 100) / 100;
  strain = Math.round(strain * 100) / 100;
  let zone = 0;
  for (const p of log) if (K.inZone(p.call.cell)) zone++;     // his plan: where he aimed, so a sharp release never reads as pounding the zone
  return { rules, bi: st.bi, pa, before, last, streak, zone, seen: log.length, pitchNo, arm, strain,
    fatigue: strain > 0 ? Math.round(fatigueOf(arm, st.bases) * (1 + EFFORT.STRAIN * strain) * 10000) / 10000 : fatigueOf(arm, st.bases),
    center: center == null ? DEFAULT_CENTER : center, z0: zone0 == null ? R2.ZONE.z0 : zone0 };
}

/* The miss table at a multiple of his sigmaFt. */
Model.prototype.kernelAt = function (type, f) {
  if (f === 1) return this.kernel[type];
  if (!this._kf) this._kf = new Map();
  const k = type + '|' + f;
  let ker = this._kf.get(k);
  if (!ker) {
    ker = kernelFor(this.arsenal.find(a => a.type === type).sigmaFt * f, this.zoneFt);
    this._kf.set(k, ker);
  }
  return ker;
};

/* The 25 rows (one per actual cell) of a type in a count bucket, adjusted for
   what the hitter has seen. Per mille, as floats, each summing to 1000. */
Model.prototype.rowsCtx = function (bi, type, bucket, ctx) {
  if (!ctx._rows) ctx._rows = new Map();
  const k = type + '|' + bucket;
  let rows = ctx._rows.get(k);
  if (rows) return rows;
  const e = this.entry(bi, type);
  rows = [];
  for (let a = 0; a < 25; a++) {
    const base = e.p[a][bucket], m = adjustOf(ctx, type, a);
    const r = base.map((x, i) => x * m[i]);
    const s = r.reduce((x, y) => x + y, 0);
    rows.push(s > 0 ? r.map(x => x * 1000 / s) : base.slice());
  }
  ctx._rows.set(k, rows);
  return rows;
};

/* rules 5 (contract.js ROUTINE): whether one cell's error is a routine play.
   The cell's error is one real play (entry.x). Returns the out key of its kind
   (a grounder out_ground, a fly out_fly, a popup out_popup) and the share of
   the error that still happens (KEEP), or null for a cell with no real error
   or a non-routine one. The engine draws the key from the row as it was and,
   on the error, reads where the library draw fell inside the error's slice:
   past KEEP it is the out (engine.js THE ROUTINE PLAY), so no other key's
   draw moves. The grade one pitch ahead moves the same share (keyMixCtx). */
Model.prototype.routineOf = function (entry, cell) {
  const ref = entry.x[cell][KEY_ERROR];
  if (ref == null || ref < 0) return null;
  const pt = this.pack.pitches[Math.floor(ref / 3)];
  const kind = K.routineOf(pt[3], pt[4], pt[5], pt[6]);
  return kind ? { out: KEY_OUT[pt[3]], keep: K.ROUTINE.KEEP[kind] } : null;
};

/* What each outcome key is worth from one state, whatever the call: the
   goal's chance and the runs after it, and the chance it is a two-strike
   foul (the self-loop). The same sums callValue does, grouped by key so a
   call under rules 2 is one pass over its mix. Cached per state. */
Model.prototype.keyValues = function (st) {
  const idx = stateIndex(this.N, this.M, st.bi, st.b, st.s, st.outs, st.bases, st.margin);
  if (!this._KV) this._KV = new Map();
  let kv = this._KV.get(idx);
  if (kv) return kv;
  const byCls = {};
  kv = { v: new Float64Array(KEYS.length), r: new Float64Array(KEYS.length), self: new Float64Array(KEYS.length) };
  for (let i = 0; i < KEYS.length; i++) {
    const cls = CLASS[i];
    if (!byCls[cls]) {
      let v = 0, r = 0, self = 0;
      for (const [q, t] of this.transitions(st, cls)) {
        if (t.self) { self += q; continue; }
        v += q * this.after(st, t);
        if (t.end) r += q * t.runs;          // lost, or a run on the third out
        else if (t.st) r += q * (t.runs + this.solve(t.st).runs);
      }
      byCls[cls] = [v, r, self];
    }
    [kv.v[i], kv.r[i], kv.self[i]] = byCls[cls];
  }
  this._KV.set(idx, kv);
  return kv;
};

/* The miss table's row for a call aimed at a free point inside its cell (the
   owner's call, 2026-10-23: the grade prices the exact spot), at a multiple
   of his sigmaFt. Cached per type, spread, cell and point. */
Model.prototype.kernelRowAim = function (type, f, cell, at) {
  if (!this._ka) this._ka = new Map();
  const k = type + '|' + f + '|' + cell + '|' + at[0] + '|' + at[1];
  let row = this._ka.get(k);
  if (!row) {
    const p = K.aimPoint(cell, at);
    row = kernelRowAt(this.arsenal.find(a => a.type === type).sigmaFt * f, this.zoneFt, p.x, p.zn);
    this._ka.set(k, row);
  }
  return row;
};

/* P(key | target) with the history and the arm: the adjusted rows through
   the miss table at the tired spread. With at (a free aim point, CONTRACT.md
   5d), the miss table centred on that exact spot; [0, 0] or none is the cell's
   centre, the same numbers as before. */
Model.prototype.keyMixCtx = function (st, type, target, ctx, at) {
  const a0 = K.aimAt(at);
  const off = a0 && (a0[0] !== 0 || a0[1] !== 0);
  const ker = off ? this.kernelRowAim(type, ctx.fatigue, target, a0) : this.kernelAt(type, ctx.fatigue);
  const base = off ? 0 : target * 25;
  const rows = this.rowsCtx(st.bi, type, bucketOf(st.b, st.s), ctx);
  const entry = this.entry(st.bi, type);
  // rules 4 (THE CALL): a take is called where it crossed, so each cell's takes split by the
  // umpire's chance over where in that cell this aim's miss puts the ball
  const cm = ctx.rules >= ABS_RULES ? this.callMass(type, ctx.fatigue, target, off ? a0 : null) : null;
  const out = new Float64Array(KEYS.length);
  for (let a = 0; a < 25; a++) {
    const w = ker[base + a];
    if (w < 1e-9) continue;
    const row = rows[a];
    let i0 = 0;
    if (cm) {
      const take = (row[0] + row[1]) / 1000, ps = Math.max(0, Math.min(1, cm[a] / w));
      out[0] += w * take * (1 - ps);
      out[1] += w * take * ps;
      i0 = 2;
    }
    for (let i = i0; i < KEYS.length; i++) if (row[i]) out[i] += w * row[i] / 1000;
    // rules 5 (contract.js ROUTINE): a routine error is all but KEEP the out of its kind
    const rt = ctx.rules >= ROUTINE_RULES && row[KEY_ERROR] ? this.routineOf(entry, a) : null;
    if (rt) { const m = w * row[KEY_ERROR] / 1000 * (1 - rt.keep); out[KEY_ERROR] -= m; out[rt.out] += m; }
  }
  return out;
};

/* ---- the call by location (rules 4, contract.js THE CALL) ----------------
 * For one aim and miss, per actual cell: the chance the pitch crosses in that
 * cell AND a take there is called a strike, the umpire's chance
 * (contract.js calledStrikeP) integrated over the cell under the same normal
 * the miss table uses. Each axis is cut into half-inch strips inside its
 * cells (and out to 8 inches past the zone, then one strip to infinity), the
 * normal's mass in each strip is exact, and the umpire's chance is read at the
 * strip's middle. Divided by the cell's own chance it is the strike share of
 * that cell's takes, which is what the engine plays (engine.js THE CALL). */
const CALL_STEP_IN = 0.5, CALL_OUT_IN = 8, CALL_FAR_IN = 12;
function axisStrips(edges, outFt, stepFt, farFt) {
  // edges: the 4 inner cell edges ascending; returns strips [lo, hi, mid, cellIndex 0..4]
  const out = [];
  const lo0 = edges[0] - outFt, hi4 = edges[3] + outFt;
  out.push([-Infinity, lo0, edges[0] - farFt, 0]);
  const cut = (a, b, idx) => { const n = Math.max(1, Math.round((b - a) / stepFt)); for (let k = 0; k < n; k++) out.push([a + (b - a) * k / n, a + (b - a) * (k + 1) / n, a + (b - a) * (k + 0.5) / n, idx]); };
  cut(lo0, edges[0], 0);
  for (let c = 1; c <= 3; c++) cut(edges[c - 1], edges[c], c);
  cut(edges[3], hi4, 4);
  out.push([hi4, Infinity, edges[3] + farFt, 4]);
  return out;
}
Model.prototype.callGrid = function () {
  if (this._cg) return this._cg;
  const zIn = this.zoneFt * 12;
  const xs = axisStrips(X_EDGES, CALL_OUT_IN / 12, CALL_STEP_IN / 12, CALL_FAR_IN / 12);
  // zn: row 0 is the top, so the strip's cell row is 4 - its index from the bottom
  const zs = axisStrips(ZN_EDGES, CALL_OUT_IN / zIn, CALL_STEP_IN / zIn, CALL_FAR_IN / zIn)
    .map(s => [s[0], s[1], s[2], 4 - s[3]]);
  const P = zs.map(z => xs.map(x => K.calledStrikeP(K.zoneDist(x[2], z[2], this.zoneFt))));
  this._cg = { xs, zs, P };
  return this._cg;
};
Model.prototype.callMass = function (type, f, target, at) {
  if (!this._cm) this._cm = new Map();
  const key = type + '|' + f + '|' + target + '|' + (at ? at[0] + '|' + at[1] : '');
  let m = this._cm.get(key);
  if (m) return m;
  const g = this.callGrid();
  const sig = this.arsenal.find(a => a.type === type).sigmaFt * f, sz = sig / this.zoneFt;
  const p = at ? K.aimPoint(target, at) : K.targetOf(target);
  const wOf = (strips, c, s) => strips.map(([lo, hi]) => R.normCdf((hi - c) / s) - R.normCdf((lo - c) / s));
  const wx = wOf(g.xs, p.x, sig), wz = wOf(g.zs, p.zn, sz);
  m = new Float64Array(25);
  for (let j = 0; j < g.zs.length; j++) {
    if (wz[j] < 1e-12) continue;
    const row = g.zs[j][3], Pj = g.P[j];
    for (let i = 0; i < g.xs.length; i++) {
      if (wx[i] < 1e-12) continue;
      m[row * 5 + g.xs[i][3]] += wz[j] * wx[i] * Pj[i];
    }
  }
  this._cm.set(key, m);
  return m;
};

/* A call's value under rules 2: its key mix, each key's value from here. */
Model.prototype.callValueCtx = function (st, type, target, ctx, at) {
  const mix = this.keyMixCtx(st, type, target, ctx, at);
  const kv = this.keyValues(st);
  let v = 0, r = 0, pself = 0;
  for (let i = 0; i < KEYS.length; i++) {
    const p = mix[i];
    if (!p) continue;
    pself += p * kv.self[i];
    v += p * kv.v[i];
    r += p * kv.r[i];
  }
  if (pself > 0) { v /= (1 - pself); r /= (1 - pself); }
  return { hold: v, runs: r };
};

/* The best call with the history, and the mean points lost over every call:
   one pitch ahead, then the table. Cached on the context. */
Model.prototype.bestCtx = function (st, ctx) {
  if (!ctx) return this.solve(st);
  if (ctx._best) return ctx._best;
  let best = null, sum = 0, n = 0;
  const vals = [];
  for (const type of this.types) for (let cell = 0; cell < 25; cell++) {
    const cv = this.callValue(st, type, cell, ctx);
    vals.push(cv.hold);
    if (!best || cv.hold > best.hold + 1e-12) best = { hold: cv.hold, runs: cv.runs, type, cell };
  }
  for (const v of vals) { sum += (best.hold - v) * 100; n++; }
  ctx._best = best;
  ctx._meanLost = sum / n;
  return best;
};

/* ---- the scouting view (rules 2: fuzzier scouting) ----------------------
 *
 * What the heat map and the scout card show, from the batter's profile. Real
 * scouting does not hand a pitcher the exact soft spot: Statcast's own zone
 * chart reads the zone in nine cells and everything outside it in four
 * quadrants, and a report talks in rough rates. So the view does the same:
 *   - the 16 chase cells show the mean of the profile over Statcast's four
 *     out-of-zone quadrants (up and in, up and away, down and in, down and
 *     away; a cell on a quadrant line shows the mean of its two)
 *   - every cell's value is rounded to a step: damage to .050 of xwOBA,
 *     swing rate to 10 points
 *   - chase, zone swing and whiff by pitch round to 5 points
 * The engine and the grade read the profile as it is; only the screen reads
 * the view. The coach, after the outing, may quote the exact numbers.
 */
const SCOUT_STEP = Object.freeze({ heat: 0.05, swing: 0.1, rate: 0.05 });
/* catcher's view quadrants: 0 up and to the catcher's left, 1 up right, 2 down left, 3 down right */
const QUAD_OF = (function () {
  const q = [];
  for (let c = 0; c < 25; c++) {
    if (K.inZone(c)) { q.push(null); continue; }
    const r = K.rowOf(c), k = K.colOf(c);
    const up = r < 2 ? [true] : r > 2 ? [false] : [true, false];
    const left = k < 2 ? [true] : k > 2 ? [false] : [true, false];
    const out = [];
    for (const u of up) for (const l of left) out.push((u ? 0 : 2) + (l ? 0 : 1));
    q.push(out);
  }
  return q;
})();
function stepOf(x, step) { return x == null ? x : Math.round(Math.round(x / step) * step * 1000) / 1000; }
function coarseCells(arr, step) {
  if (!Array.isArray(arr) || arr.length !== 25) return arr;
  const qs = [0, 0, 0, 0], qn = [0, 0, 0, 0];
  for (let c = 0; c < 25; c++) if (QUAD_OF[c] && arr[c] != null) for (const q of QUAD_OF[c]) { qs[q] += arr[c]; qn[q]++; }
  return arr.map((v, c) => {
    if (v == null) return v;
    if (!QUAD_OF[c]) return stepOf(v, step);
    const qv = QUAD_OF[c].filter(q => qn[q]).map(q => qs[q] / qn[q]);
    return stepOf(qv.reduce((a, b) => a + b, 0) / qv.length, step);
  });
}
function scoutView(profile) {
  if (!profile) return profile;
  const v = Object.assign({}, profile);
  v.heat = coarseCells(profile.heat, SCOUT_STEP.heat);
  v.swing = coarseCells(profile.swing, SCOUT_STEP.swing);
  if (profile.chase != null) v.chase = stepOf(profile.chase, SCOUT_STEP.rate);
  if (profile.zoneSwing != null) v.zoneSwing = stepOf(profile.zoneSwing, SCOUT_STEP.rate);
  if (profile.whiff) v.whiff = Object.fromEntries(Object.entries(profile.whiff).map(([t, x]) => [t, stepOf(x, SCOUT_STEP.rate)]));
  return v;
}

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
/* The goal's chance in words: 'holds 64.2%' with the lead, 'keeps it tied
   71.3%' after a tie (the value is a different goal there, THE GOAL above). */
function keeps(st, x) { return (st.margin >= 1 ? 'holds ' : 'keeps it tied ') + pct(x) + '%'; }
function fmt3(x) { return x.toFixed(3).replace(/^0/, ''); }

/* The reason line: one fact from the batter's profile or the state, with its
   number from the pack. House voice: lowercase, short. */
function reasonFor(model, st, call, best, value, lost, band, ctx) {
  const batter = model.pack.scenario.batters[st.bi % model.N];
  const pr = batter.profile || {};
  const bestTxt = `${pitchName(model, best.type)} ${placeOf(best.cell, batter.bats)}`;
  // a note is quoted only where it argues the point: good = it favours the pitcher
  const noteAbout = (type, cell, good) => (pr.notesFor || []).find(n => n.type === type && (n.cells || []).includes(cell) && !!n.good === good);
  if (band === 'green') {
    const n = noteAbout(call.type, call.cell, true);
    if (n) return n.text + '.';
    if (call.type === best.type && call.cell === best.cell) return `the best call here. it ${keeps(st, best.hold)}.`;
    return `as good as the best call. ${bestTxt} ${keeps(st, best.hold)}.`;
  }
  // not green: why this call cost, or why the best call was better
  // rules 2: he has already seen that pitch there this at bat
  const seen = ctx ? ctx.pa.filter(p => p.type === call.type && near1(p.cell, call.cell)).length : 0;
  if (seen && !(call.type === best.type && near1(call.cell, best.cell))) {
    return `he saw that ${pitchName(model, call.type)} there ${seen === 1 ? 'once' : seen + ' times'} this at bat. ${bestTxt} was the call.`;
  }
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
  return `${bestTxt} ${keeps(st, best.hold)}. this ${keeps(st, value)}.`;
}

/* The PitchGrade of a call in a state, before it resolves. After a tie,
   value, best, lost and rel are on the tie's goal (three outs before they go
   ahead), and tied says so. */
function gradeCall(model, st, call, ctx) {
  const best = model.bestCtx(st, ctx);
  // the exact spot (CONTRACT.md 5d): the call is priced where it was aimed; the best call and the
  // state's mean lost stay over every cell's centre, so an aim better than the best centre is lost 0
  const cv = model.callValue(st, call.type, call.cell, ctx, ctx ? call.at : null);
  const lost = Math.max(0, (best.hold - cv.hold) * 100);
  const lostR = Math.round(lost * 100) / 100;
  const rel = lost <= 1e-9 ? 0 : Math.round(lost / Math.max(1e-9, model.meanLost(st, ctx)) * 1000) / 1000;
  const band = K.bandOf(rel);
  return {
    band,
    rel,
    value: Math.round(cv.hold * 1000) / 10,
    best: Math.round(best.hold * 1000) / 10,
    lost: lostR,
    bestCall: { type: best.type, cell: best.cell },
    reason: reasonFor(model, st, call, best, cv.hold, lostR, band, ctx),
    reDelta: Math.round((cv.runs - best.runs) * 1000) / 1000,
    tied: st.margin === 0,
  };
}

const publicAPI = Object.freeze({
  BUCKETS, BUCKET_INDEX, KEYS, IN_PLAY, CLASS, kernelFor, kernelRowAt, forceWalk, stateIndex, goalOf, Model, gradeCall,
  placeOf, bucketOf, keeps, RULES, THIRD_OUT_RULES, ABS_RULES, ROUTINE_RULES, RUNNER_RULES, R2, adjustOf, familiarOf, familiarRaw, fatigueOf, contextOf,
  scoutView, SCOUT_STEP, EFFORT, effortMult, effortRow, effortSpread, loadOf,
});
if (NODE) module.exports = publicAPI;
if (typeof window !== 'undefined') window.STD_GRADE = publicAPI;
})();
