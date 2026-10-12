/* Run The Floor: idles, what the player does while he is standing there.
 *
 * window.RTF_IDLES, and node can require it (hoops/check-idles.mjs). The plan
 * is hoops/design/ECONOMY.md section 6.
 *
 * AN IDLE IS KEYFRAMES ON THE RIG baller.js already poses: each key is the two
 * arms as angles (the same [upper, fore, fold, fold] shape SETS uses), the
 * knees (dip), the stance (sp) and a lifted foot. Between two keys this file
 * writes in-between frames by blending the angles, so the arm swings through
 * the middle rather than jumping. Every painted frame is a sphere trace in the
 * paint worker, so a loop is held to MAX_FRAMES.
 *
 * THE FRAMES TRAVEL AS DATA. The worker loads baller.js and nothing else
 * (ECONOMY.md section 13), so an idle cannot be a function the worker calls:
 * it is plain numbers handed over as paint's `fr` option, which a postMessage
 * carries as is.
 *
 * Two idles are the old figure, unchanged: Standing is live()'s breath and
 * Standing Dribble is its dribble (pose 'ball'). Both are free, and opts()
 * hands them over exactly as the page asked for them before idles existed.
 *
 * The names and the rarity of each idle are its catalogue row (catalog.js,
 * slot 'idle'); this file is only how it moves. check-idles holds the two to
 * each other. Nothing here belongs to a real person.
 */
(function(){
'use strict';

var API_VERSION = 1;
var MAX_FRAMES = 12, TWEEN_MS = 90, FLAIR_EVERY = 5;
var DOWN = [9, 4], UP = [156, 183], HIPS = [40, -45], CROSS = [18, -85, 1, 0.7], HEAD = [140, 230], KNEES = [10, -25, 1, 0.85];
var BALL = [12, 30, 1, 0.68];

/* k(right arm, left arm, more, ms): one key, held for ms */
function k(R, Lf, more, ms){ var o = { R: R, L: Lf, ms: ms || 300 }; for (var x in more || {}) o[x] = more[x]; return o; }

/* id: { keys, tw (in-betweens per gap), hold ('ball'), sig (the still), flair (keys played one loop in FLAIR_EVERY) } */
var DEFS = {
  /* ---- common ---- */
  id_shakeout: { keys: [k(DOWN, DOWN, {}, 260), k([22, 12], [18, 10], { dip: 0.6 }, 160), k([11, 5], [24, 14], { dip: 0.3 }, 160), k([24, 14], [11, 5], { dip: 0.6 }, 160)], tw: 1 },
  id_hips: { keys: [k(HIPS, HIPS, {}, 1400), k(HIPS, HIPS, { dip: 0.7, sp: 0.4 }, 900)], tw: 1 },
  id_clap: { keys: [k([30, 22, 1, 0.6], [30, 22, 1, 0.6], {}, 300), k([22, -40, 1, 0.55], [22, -40, 1, 0.55], { dip: 0.4 }, 140)], tw: 1, sig: 0 },
  id_toes: { keys: [k([14, 8], [14, 8], { lift: { '1': 1 } }, 220), k([12, 6], [12, 6], {}, 140), k([14, 8], [14, 8], { lift: { '-1': 1 } }, 220), k([12, 6], [12, 6], {}, 140)], tw: 0 },
  id_crossed: { keys: [k(CROSS, CROSS, {}, 1800), k(CROSS, CROSS, { dip: 0.5, sp: 0.3 }, 1000)], tw: 1 },
  id_looks: { keys: [k(HIPS, DOWN, {}, 1200), k(HIPS, HIPS, { sp: 0.4 }, 900), k(DOWN, HIPS, {}, 1200)], tw: 1 },

  /* ---- rare ---- */
  id_reach: { keys: [k(DOWN, DOWN, {}, 700), k(UP, UP, { lift: { '1': 1, '-1': 1 } }, 700)], tw: 2, sig: 1 },
  id_roll: { keys: [k([12, 6], [12, 6], {}, 500), k([34, 14], [12, 6], { dip: 0.3 }, 220), k([12, 6], [34, 14], { dip: 0.3 }, 220)], tw: 1 },
  id_sway: { keys: [k(HIPS, HIPS, { sp: -0.4 }, 500), k(HIPS, HIPS, { sp: 0.9, dip: 0.6 }, 500)], tw: 2 },
  id_ballhip: { keys: [k(BALL, HIPS, {}, 1300), k(BALL, HIPS, { dip: 0.6, sp: 0.3 }, 900)], tw: 1, hold: 'ball' },
  id_point: { keys: [k(DOWN, HIPS, {}, 900), k([100, 104], HIPS, {}, 900)], tw: 2, sig: 1 },
  id_wave: { keys: [k([140, 190], DOWN, {}, 200), k([140, 168], DOWN, {}, 200), k([140, 152], DOWN, {}, 200), k([140, 168], DOWN, {}, 200)], tw: 0 },
  id_squat: { keys: [k(HIPS, HIPS, {}, 900), k(KNEES, KNEES, { dip: 4 }, 900)], tw: 2, sig: 1 },
  id_box: { keys: [k([60, 150, 1, 0.7], [24, 150, 1, 0.6], { dip: 1 }, 180), k([24, 150, 1, 0.6], [60, 150, 1, 0.7], { dip: 1, sp: 0.3 }, 180)], tw: 1 },

  /* ---- epic ---- */
  id_flex: { keys: [k(DOWN, DOWN, {}, 600), k([85, 180], [85, 180], { dip: 0.6 }, 900)], tw: 2, sig: 1 },
  id_roof: { keys: [k([140, 170], [140, 170], { dip: 0.8 }, 220), k([160, 190], [160, 190], { lift: { '1': 1, '-1': 1 } }, 220)], tw: 1 },
  id_pump: { keys: [k(BALL, [12, 6], {}, 700), k([20, -110], [20, -112], { dip: 3 }, 260), k([150, 200], [150, 205], { lift: { '1': 1, '-1': 1 } }, 260)], tw: 1, hold: 'ball', sig: 0 },
  id_lunge: { keys: [k(HIPS, HIPS, { sp: 1.4, dip: 3, lift: { '1': 1 } }, 900), k(HIPS, HIPS, { sp: 1.4, dip: 3, lift: { '-1': 1 } }, 900)], tw: 2 },
  id_pound: { keys: [k(DOWN, DOWN, {}, 600), k([20, -110, 1, 0.6], DOWN, {}, 180), k([22, -90, 1, 0.6], DOWN, { dip: 0.4 }, 180), k([140, 176], DOWN, {}, 700)], tw: 1 },
  id_loud: { keys: [k([140, 170], [140, 170], {}, 240), k([156, 190], [128, 156], { dip: 0.5 }, 240), k([128, 156], [156, 190], { dip: 0.5 }, 240)], tw: 1 },
  id_ballup: { keys: [k(BALL, [12, 6], {}, 800), k([150, 186, 1, 0.8], [30, 20], {}, 900)], tw: 2, hold: 'ball', sig: 1 },
  id_pogo: { keys: [k([30, 40], [30, 40], { lift: { '1': 2, '-1': 2 } }, 160), k([24, 20], [24, 20], { dip: 1.4 }, 160)], tw: 1 },

  /* ---- legendary ---- */
  id_moment: { keys: [k(HIPS, HIPS, {}, 900), k(UP, DOWN, { lift: { '1': 1 } }, 500), k([140, 170], [140, 170], {}, 500)], tw: 1, sig: 2,
    flair: [k([85, 180], [85, 180], { dip: 0.8 }, 600), k([142, 168], DOWN, {}, 500)] },
  id_conduct: { keys: [k([120, 150], [60, 40], {}, 260), k([60, 40], [120, 150], { dip: 0.4 }, 260)], tw: 2 },
  id_jacks: { keys: [k(DOWN, DOWN, { sp: 0 }, 160), k(UP, UP, { sp: 2.4, lift: { '1': 1, '-1': 1 } }, 160)], tw: 2 },
  id_shimmy: { keys: [k([90, 120], [90, 120], { sp: 0.6, dip: 1 }, 150), k([75, 130], [100, 140], { sp: -0.2, dip: 1.4 }, 150), k([100, 140], [75, 130], { sp: 0.6, dip: 1 }, 150)], tw: 1 },
  id_windmill: { keys: [k(DOWN, HIPS, {}, 140), k([90, 140], HIPS, {}, 140), k([175, 185], HIPS, {}, 140), k([95, 150], HIPS, {}, 140)], tw: 1 },
  id_bow: { keys: [k(DOWN, DOWN, {}, 900), k([20, -100, 1, 0.6], [60, 40, 1, 0.8], { dip: 3 }, 1100)], tw: 2, sig: 1 },
  id_spin: { keys: [k([150, 182, 1, 0.65], [30, 20], {}, 380), k([152, 178, 1, 0.65], [34, 26], { dip: 0.3 }, 380)], tw: 1, hold: 'ball',
    flair: [k([150, 200], [150, 205], { lift: { '1': 2, '-1': 2 } }, 420), k(BALL, [12, 6], { dip: 1.2 }, 400)] },

  /* ---- exclusive: earned in a career, never sold or packed ---- */
  id_draftwave: { keys: [k([138, 176], [10, 5], {}, 260), k([138, 160], [10, 5], {}, 260)], tw: 1 },
  id_ringshow: { keys: [k(HIPS, HIPS, {}, 900), k([142, 160, 1, 0.7], HIPS, {}, 1200)], tw: 2, sig: 1, flair: [k([150, 176], [150, 176], {}, 700)] },
  id_salute: { keys: [k(DOWN, DOWN, {}, 900), k([150, 228, 1, 0.8], DOWN, {}, 1400)], tw: 2, sig: 1 },
  /* the Floor Pass season 1 capstone: crouch for the jump ball, rise, tap it back */
  id_tipoff: { keys: [k(KNEES, KNEES, { dip: 3 }, 500), k(UP, [30, 18], { lift: { '1': 1, '-1': 1 } }, 380), k([150, 200], [30, 18], { dip: 0.6 }, 300)], tw: 1, sig: 1 },
  id_nerves: { keys: [k([20, -60, 1, 0.6], [20, -60, 1, 0.6], {}, 400), k([24, -40, 1, 0.6], [16, -70, 1, 0.6], { lift: { '1': 1 } }, 260), k([16, -70, 1, 0.6], [24, -40, 1, 0.6], { lift: { '-1': 1 } }, 260)], tw: 0 },
};
/* the two that are the old figure: no keyframes, handed over as they were */
var BUILT_IN = { id_stand: {}, id_dribble: { pose: 'ball' } };
/* what a look wears when nothing is chosen */
var DEFAULT = { street: 'id_stand', court: 'id_dribble' };

function pad(a){ a = a || DOWN; return [a[0], a[1], a[2] == null ? 1 : a[2], a[3] == null ? 1 : a[3], a[4] || 0, a[5] || 0]; }
function lerp(a, b, t){ return a + (b - a) * t; }
function r2(x){ return Math.round(x * 100) / 100; }
/* a key to the frame shape baller.js reads (fr in paint) */
function frameOf(key){
  var lift = {};
  if (key.lift) for (var s in key.lift) lift[s] = key.lift[s];
  return { a: { '1': pad(key.R).map(r2), '-1': pad(key.L).map(r2) }, dip: r2(key.dip || 0), sp: r2(key.sp || 0), lift: lift };
}
/* AN ARM RAISED THROUGH THE SIDE BENDS AT THE ELBOW, the way a real one does.
   A straight blend of a hanging arm and a raised one holds the whole arm out
   level half way, which reaches past the edge of the grid on a big man (and
   reads as a puppet). So when the upper arm swings more than ARC degrees the
   forearm folds up by as much as BEND, most in the middle of the swing. */
var ARC = 40, BEND = 45, ELBOW = 55;
function blend(a, b, t){
  var out = { R: [], L: [], dip: lerp(a.dip || 0, b.dip || 0, t), sp: lerp(a.sp || 0, b.sp || 0, t), lift: {} };
  var pa = pad(a.R), pb = pad(b.R), qa = pad(a.L), qb = pad(b.L);
  for (var i = 0; i < 6; i++) { out.R.push(lerp(pa[i], pb[i], t)); out.L.push(lerp(qa[i], qb[i], t)); }
  var arc = function(x, y, o){ if (Math.abs(y[0] - x[0]) > ARC) o[1] += BEND * Math.sin(Math.PI * t); };
  arc(pa, pb, out.R); arc(qa, qb, out.L);
  /* and an arm passing through level never holds its forearm straight out
     with it: the elbow is at least ELBOW degrees bent there */
  var level = function(o){ if (o[0] > 45 && o[0] < 110 && o[1] < o[0] + ELBOW) o[1] = o[0] + ELBOW; };
  level(out.R); level(out.L);
  ['1', '-1'].forEach(function(s){ var v = lerp((a.lift || {})[s] || 0, (b.lift || {})[s] || 0, t); if (v) out.lift[s] = v; });
  return out;
}
/* A run of keys to frames and a play sequence, [frame index, ms] per step.
   closed: the last key blends back into the first, so the loop meets itself
   with no pop. at collects which frame each KEY landed on. */
function expand(keys, tw, closed, frames, at){
  var seq = [];
  for (var i = 0; i < keys.length; i++) {
    frames.push(frameOf(keys[i])); seq.push([frames.length - 1, keys[i].ms]);
    if (at) at.push(frames.length - 1);
    var nx = keys[i + 1] || (closed ? keys[0] : null);
    if (!nx) continue;
    for (var j = 1; j <= tw; j++) { frames.push(frameOf(blend(keys[i], nx, j / (tw + 1)))); seq.push([frames.length - 1, TWEEN_MS]); }
  }
  return seq;
}
var CACHE = {};
/* everything live() needs to play an idle: { id, f: frames, seq, fl, every, sig, hold, ms } */
function def(id){
  if (CACHE[id]) return CACHE[id];
  var d = DEFS[id]; if (!d) return null;
  var frames = [], at = [], tw = d.tw == null ? 1 : d.tw;
  var seq = expand(d.keys, tw, true, frames, at);
  /* a flourish leaves from the loop's first key and comes back to it, so its
     own first step (that key, again) is dropped and the frames it adds are
     painted once with the loop's */
  var fl = d.flair ? expand([d.keys[0]].concat(d.flair), tw, true, frames, null).slice(1) : null;
  var sig = at[d.sig == null ? 0 : d.sig];
  var ms = seq.reduce(function(t, x){ return t + x[1]; }, 0);
  return (CACHE[id] = { id: id, f: frames, seq: seq, fl: fl, every: FLAIR_EVERY, sig: sig == null ? 0 : sig, hold: d.hold || '', ms: ms });
}
/* Paint options for an idle, merged over the caller's own. Standing and the
   dribble hand back exactly what the page asked for before idles existed. */
function opts(id){
  if (BUILT_IN[id]) return Object.assign({}, BUILT_IN[id]);
  var d = def(id);
  return d ? { idle: d } : {};
}
function isIdle(id){ return !!(BUILT_IN[id] || DEFS[id]); }
var IDS = Object.keys(BUILT_IN).concat(Object.keys(DEFS));

var API = {
  API_VERSION: API_VERSION, MAX_FRAMES: MAX_FRAMES, TWEEN_MS: TWEEN_MS, FLAIR_EVERY: FLAIR_EVERY,
  IDS: IDS, DEFAULT: DEFAULT, BUILT_IN: BUILT_IN,
  def: def, opts: opts, isIdle: isIdle, frameOf: frameOf, _defs: DEFS,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.RTF_IDLES = API;
})();
