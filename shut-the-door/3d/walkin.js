/* The next hitter walks up: between at bats the new hitter walks in from the on deck side, stops at
 * the plate and settles into his own stance (the owner, 2026-11-06: "when a new hitter comes up, he
 * should visibly step into the box before the at bat begins. Right now the next hitter just appears
 * in his stance, so it's hard to tell a new batter is up").
 *
 * Presentation only. Nothing here reads or decides an outcome: the walk is a pure function of the
 * hitter's set pose (people.js, his own stance, never changed here), the camera of the set and the
 * walk's own clock. No Math.random. stage.js plays it after a new hitter is set and before the first
 * pitch to him; a tap skips straight to the stance, and a pitch can only start from the stance.
 *
 *   the body     Mixamo's Jog Forward (the fielders' clip, assets/fielder.glb, already shipped and
 *                licensed: lab/LICENSES.md), laid on the hitter's own body at a walk: each joint taken
 *                part of the way from the cycle's mean pose (STRIDE), so the swing of the arms, the
 *                trunk's turn and the knee's bend come down to a walk's. Its cycle runs in step with
 *                his feet: each foot's touch down in the clip on each of his steps (clipAt)
 *   the feet     where they go is planned, not the clip's: a step every STEP of his height along the
 *                path, each foot on its own line beside it, and the LAST TWO STEPS ARE HIS STANCE: the
 *                back foot, then the front foot, on the spots and at the turn the set has them. A foot
 *                on the ground is held there by two bone IK (it never slides), and swings to its next
 *                spot in an arc in the last SWING of the time to its touch down
 *   the path     a straight line from the on deck side (the next batter's circle is 125 degrees round
 *                from centre field, field.js) to his stance, at a brisk walk, slowing over the last
 *                WALK.stopFt to a stop on the spot his stance stands on. It starts just out of the
 *                set's frame (startFt), so he walks into the picture, never appears in it
 *   the bat      carried in his bottom hand, the barrel up and tipped ahead; as he settles it turns
 *                back into his grip in that hand, and the top hand comes onto it
 *   the settle   from SETTLE.from before the stop to SETTLE.to after it every bone, his place, his
 *                facing and the bat go over to the set's own pose, his feet held on the stance's spots.
 *                At the end it IS the set's pose, value for value (restoreSet), so the pitch, its
 *                timing, the swing and the plate are exactly as without the walk.
 *
 *   const w = plan(p, clip, names, cam, opts)   p: the batter (people.js), clip: crew.clips.jog,
 *                                               names: the crew's bone names by index, cam: the set's
 *                                               camera (to start out of its frame)
 *   w.dur                                       seconds from the first frame to the stance
 *   lay(w, s)                                   pose him at s seconds into it; false once it is over
 *   restoreSet(w)                               the set's pose back, value for value
 */
import * as THREE from 'three';
import { wpos, twoBoneIK, rotateWorld } from './rig.js?v=1';
import { FT, smooth, clamp01 } from './units.js?v=1';

const UP = new THREE.Vector3(0, 1, 0);
const D2R = Math.PI / 180;
/* the walk: cruise ft/s (a brisk walk up to the plate), the slowing over the last stopFt to the stop
   (an even slowing: it takes 2 stopFt / cruise seconds), the shortest and longest path (ft) */
export const WALK = { cruise: 4.6, stopFt: 2.0, minFt: 6.5, maxFt: 10.5 };
/* the settle into his stance: from `from` s before the stop to `to` s after it */
export const SETTLE = { from: 0.45, to: 0.55 };
/* a step: its length (a share of his height: 0.37 is a brisk walk's), each foot's line off the path
   (a share of his height), the foot's touch down this share of a step ahead of his pelvis, the swing
   (the share of the time from the other foot's touch down to this one's it is in the air, at most
   SWING_MAX s), the lift of the swing (m, at his size) */
const STEP = { len: 0.37, side: 0.055, reach: 0.45, swing: 0.8, swingMax: 0.42, lift: 0.075 };
/* how much of the jog's swing each joint keeps (the rest is the cycle's mean pose): the legs give the
   knee's bend under the IK, the trunk a little turn, the arms a walk's swing, the arm with the bat less */
const STRIDE = { leg: 0.6, trunk: 0.35, head: 0.3, arm: 0.4, batArm: 0.22, fingers: 0 };
// the elbows of a jog are bent near square; a walk's hang lower: this much of the way to straight
const ELBOW_OPEN = 0.45;
// the next batter's circle, degrees round from centre field toward his own side (field.js)
const ON_DECK = 125;
// the bat carried in the bottom hand with the barrel up, tipped this far ahead of upright and a
// little out from his shoulder (so turning it into his grip is a short turn, never a flip over)
const CARRY_TIP = 28, CARRY_OUT = 0.15;

const LEGS = /^(thigh|calf|foot|ball)_/, TRUNK = /^(pelvis|spine_)/, HEAD = /^(neck|head)/, FINGERS = /^(index|middle|ring|pinky|thumb)_/;
const ARM = /^(clavicle|upperarm|lowerarm|hand|deltoid)/;

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _v = new THREE.Vector3();

/** The pose of the walk cycle at phase u (0..1), as local quaternions by track. */
function sampleCycle(tr, period, u, out) {
  const v = tr.interp.evaluate(u * period);
  return out.set(v[0], v[1], v[2], v[3]);
}

/** Every joint's share of the jog it keeps (STRIDE), for this hitter: the bottom hand carries the bat. */
function shareOf(name, bottom) {
  if (FINGERS.test(name)) return name.endsWith('_' + bottom) ? -1 : STRIDE.fingers;   // -1: the bat hand's grip stays the stance's
  if (LEGS.test(name)) return STRIDE.leg;
  if (TRUNK.test(name)) return STRIDE.trunk;
  if (HEAD.test(name)) return STRIDE.head;
  if (ARM.test(name)) return name.endsWith('_' + bottom) ? STRIDE.batArm : STRIDE.arm;
  return STRIDE.trunk;
}

/** Plan the walk for the hitter as he is set now (his stance, the bat in his hands). */
export function plan(p, clip, names, cam, opts = {}) {
  const B = p.bones, bottom = p.bottom || 'l';
  const period = clip.period;
  // the set: every bone, his place and facing, the bat, as the stance has them
  p.root.updateMatrixWorld(true);
  const footSet = (f) => ({ at: wpos(B['foot_' + f]), q: B['foot_' + f].getWorldQuaternion(new THREE.Quaternion()) });
  const set = {
    bones: p.bind.map(([b]) => [b, b.position.clone(), b.quaternion.clone()]),
    rootPos: p.root.position.clone(), rootQ: p.root.quaternion.clone(),
    pelvis: wpos(B.pelvis), ankle: Math.min(wpos(B.foot_l).y, wpos(B.foot_r).y),
    feet: { l: footSet('l'), r: footSet('r') },
    bat: p.bat ? [p.bat.position.clone(), p.bat.quaternion.clone()] : null,
  };
  const hand = B['hand_' + bottom];
  const batIn = p.bat ? new THREE.Matrix4().copy(hand.matrixWorld).invert().multiply(p.bat.matrixWorld) : null;
  // the tracks on his bones, and each one's mean over the cycle and its seam (the capture a period on
  // is not quite its start: the miss is taken in evenly over the cycle)
  const tracks = [];
  const N = 16;
  for (const tr of clip.tracks) {
    if (!tr.q) continue;
    const bone = B[names[tr.i]];
    if (!bone) continue;
    const share = shareOf(bone.name, bottom);
    if (share < 0) continue;
    const q0 = sampleCycle(tr, period, 0, new THREE.Quaternion()), q1 = sampleCycle(tr, period, 1, new THREE.Quaternion());
    const seam = q1.clone().invert().multiply(q0);
    // the mean of the cycle (each sample turned to the first's hemisphere, summed, normalised)
    const acc = new THREE.Vector4();
    for (let i = 0; i < N; i++) {
      const q = sampleCycle(tr, period, i / N, _q);
      const s = q.dot(q0) < 0 ? -1 : 1;
      acc.x += s * q.x; acc.y += s * q.y; acc.z += s * q.z; acc.w += s * q.w;
    }
    acc.normalize();
    const mean = new THREE.Quaternion(acc.x, acc.y, acc.z, acc.w);
    const bind = p.bind.find(([b]) => b === bone);
    tracks.push({ tr, bone, share, seam, mean, open: /^lowerarm_[lr]$/.test(bone.name) && bind ? bind[2].clone() : null });
  }
  const tracked = new Set(tracks.map((t) => t.bone));
  // the bones the clip has no track for (the collar bones and the like) stand as in the bind pose,
  // but the bat hand's fingers, which keep their grip
  const rest = p.bind.filter(([b]) => !tracked.has(b) && !(FINGERS.test(b.name) && b.name.endsWith('_' + bottom)) && b !== B.pelvis);
  const pelvisRest = (p.bind.find(([b]) => b === B.pelvis) || [null, B.pelvis.position.clone()])[1].clone();
  const w = { p, set, tracks, rest, pelvisRest, period, bottom, batIn, hand };

  // which way the walk faces on his body, the root unturned (the clip's own forward), and where in
  // its cycle each foot comes down
  poseCycle(w, 0.25);
  p.root.quaternion.identity(); p.root.updateMatrixWorld(true);
  const left = wpos(B.thigh_l).sub(wpos(B.thigh_r)).setY(0).normalize();
  const fwd0 = new THREE.Vector3().crossVectors(left, UP).normalize();
  w.yaw0 = Math.atan2(fwd0.x, fwd0.z);
  w.touch = touchOf(w);
  // the legs' reach (hip to ankle, straight), for the pelvis to stay under it
  w.leg = wpos(B.thigh_l).distanceTo(wpos(B.calf_l)) + wpos(B.calf_l).distanceTo(wpos(B.foot_l));
  // the stance's facing (the same measure on the set's pose)
  restoreSet(w);
  const sl = wpos(B.thigh_l).sub(wpos(B.thigh_r)).setY(0).normalize();
  const sf = new THREE.Vector3().crossVectors(sl, UP).normalize();
  w.yawSet = Math.atan2(sf.x, sf.z);

  // the path: from his side's on deck circle to the spot his stance stands on
  const side = set.pelvis.x >= 0 ? 1 : -1;
  const out = new THREE.Vector3(side * Math.sin(ON_DECK * D2R), 0, Math.cos(ON_DECK * D2R)).normalize();
  w.end = new THREE.Vector3(set.pelvis.x, 0, set.pelvis.z);
  w.out = out;
  w.dir = out.clone().negate();
  w.heading = Math.atan2(w.dir.x, w.dir.z);
  const L = (opts.lengthFt ?? startFt(w, cam)) * FT;
  w.len = L;
  const v = WALK.cruise * FT, stop = Math.min(WALK.stopFt * FT, L * 0.6);
  w.v = v; w.stopLen = stop;
  w.tCruise = (L - stop) / v;
  w.tStop = w.tCruise + 2 * stop / v;
  w.dur = w.tStop + SETTLE.to;
  w.steps = stepsOf(w);
  // the bat carried: the stance's grip turned in the bottom hand so the barrel stands up, tipped ahead
  w.carry = batIn ? carryOf(w) : null;
  restoreSet(w);
  return w;
}

/** The set's pose back, value for value (the bones, his place and facing, the bat). */
export function restoreSet(w) {
  for (const [b, pos, q] of w.set.bones) { b.position.copy(pos); b.quaternion.copy(q); }
  w.p.root.position.copy(w.set.rootPos); w.p.root.quaternion.copy(w.set.rootQ);
  w.p.root.updateMatrixWorld(true);
  if (w.set.bat && w.p.bat) { w.p.bat.position.copy(w.set.bat[0]); w.p.bat.quaternion.copy(w.set.bat[1]); w.p.bat.updateMatrixWorld(true); }
}

/** The walk's joints at phase u (local rotations only; his place is put by placeRoot). */
function poseCycle(w, u) {
  u = ((u % 1) + 1) % 1;
  for (const [b, , q] of w.rest) b.quaternion.copy(q);
  for (const t of w.tracks) {
    const q = sampleCycle(t.tr, w.period, u, _q);
    q.multiply(_q2.identity().slerp(t.seam, u));
    // a walk's share of the jog's swing about the cycle's mean
    const out = t.bone.quaternion.copy(t.mean).slerp(q, t.share);
    if (t.open) out.slerp(t.open, ELBOW_OPEN);
  }
  w.p.bones.pelvis.position.copy(w.pelvisRest);
}

/** Where in the clip's cycle (0..1) each foot comes down: the first sample it is the lower foot after
    the other was. */
function touchOf(w) {
  const B = w.p.bones, N = 48, lo = [];
  for (let i = 0; i < N; i++) {
    poseCycle(w, i / N);
    w.p.root.updateMatrixWorld(true);
    lo.push(wpos(B.foot_l).y < wpos(B.foot_r).y ? 'l' : 'r');
  }
  const t = { l: 0, r: 0.5 };
  for (let i = 0; i < N; i++) if (lo[i] !== lo[(i + N - 1) % N]) t[lo[i]] = i / N;
  return t;
}

/** The time (s) his pelvis has walked d (m) along the path (the inverse of walkedAt). */
function timeAt(w, d) {
  if (d <= 0) return d / w.v;
  if (d >= w.len) return w.tStop;
  let a = 0, b = w.tStop;
  for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (walkedAt(w, m) < d) a = m; else b = m; }
  return (a + b) / 2;
}

/** His steps, the last first: the front foot of his stance, his back foot, then back along the path,
    each foot on its own line, a step apart. Each: the foot, its spot (world, on the ground at the
    stance's ankle height), its turn (world, for the last two), and the time it comes down. */
function stepsOf(w) {
  const p = w.p, sc = p.root.scale.y, len = STEP.len * 1.86 * sc, side = STEP.side * 1.86 * sc;
  const front = p.lefty ? 'r' : 'l', back = front === 'l' ? 'r' : 'l';
  const left = new THREE.Vector3().crossVectors(UP, w.dir);
  const start = w.end.clone().addScaledVector(w.out, w.len);
  const along = (v) => v.clone().sub(start).setY(0).dot(w.dir);
  const F = w.set.feet, steps = [];
  // the stance's two (the back foot comes down first; the front foot last, at the stop)
  const tFront = w.tStop, aBack = along(F[back].at);
  const tBack = Math.min(timeAt(w, aBack - STEP.reach * len), tFront - 0.3);
  steps.push({ foot: front, at: F[front].at.clone(), q: F[front].q.clone(), t: tFront, set: true });
  steps.push({ foot: back, at: F[back].at.clone(), q: F[back].q.clone(), t: tBack, set: true });
  // and back along the path, a step apart, until well before the start
  for (let j = 1; aBack - j * len > -2 * len; j++) {
    const foot = j % 2 ? front : back, a = aBack - j * len;
    const at = start.clone().addScaledVector(w.dir, a).addScaledVector(left, (foot === 'l' ? 1 : -1) * side).setY(w.set.ankle);
    steps.push({ foot, at, q: null, t: timeAt(w, a - STEP.reach * len) });
  }
  steps.reverse();
  // the clip's phase at each touch down: its foot's own in the cycle, the next one up from the last
  for (let k = 0; k < steps.length; k++) {
    const tch = w.touch[steps[k].foot];
    steps[k].ph = k === 0 ? tch : steps[k - 1].ph + ((((tch - steps[k - 1].ph) % 1) + 1) % 1 || 1);
  }
  // (in time order now; each knows the one before it on the same foot, and the other foot's before it)
  for (let k = 0; k < steps.length; k++) {
    const s = steps[k];
    s.prevSame = null; s.prevOther = null;
    for (let j = k - 1; j >= 0; j--) { if (steps[j].foot === s.foot && !s.prevSame) s.prevSame = steps[j]; if (steps[j].foot !== s.foot && !s.prevOther) s.prevOther = steps[j]; }
  }
  return steps;
}

/** The phase of the clip at s: each step's touch down on its foot's touch down in the cycle (stepsOf
    numbers them about half a cycle apart), evenly between; held after the last step. */
function clipAt(w, s) {
  const S = w.steps, n = S.length;
  if (s <= S[0].t) return S[0].ph - (S[0].t - s) / Math.max(0.2, S[1].t - S[0].t) * (S[1].ph - S[0].ph);
  for (let k = 1; k < n; k++) if (s <= S[k].t) return S[k - 1].ph + (S[k].ph - S[k - 1].ph) * (s - S[k - 1].t) / Math.max(1e-6, S[k].t - S[k - 1].t);
  return S[n - 1].ph;
}

/** Where a foot is at s, and whether it is down: on the spot of its last step, or swinging from it to
    its next in an arc over the last part of the time to that touch down. */
function footAt(w, f, s) {
  const S = w.steps;
  let next = null, last = null;
  for (const st of S) { if (st.foot !== f) continue; if (st.t <= s) last = st; else { next = st; break; } }
  if (!next) return { at: last.at, q: last.q, down: true, step: last };
  const from = last || next.prevSame;
  if (!from) return { at: next.at, q: next.q, down: true, step: next };
  // (in the air for the last SWING of the time since the other foot came down, at most SWING_MAX s)
  const other = next.prevOther ? next.prevOther.t : from.t;
  const dur = Math.min(STEP.swingMax, STEP.swing * Math.max(0.15, next.t - Math.max(other, from.t)));
  const x = clamp01((s - (next.t - dur)) / dur);
  if (x <= 0) return { at: from.at, q: from.q, down: true, step: from };
  const e = smooth(x), at = from.at.clone().lerp(next.at, e);
  at.y += STEP.lift * w.p.root.scale.y * Math.sin(Math.PI * x);
  return { at, q: null, down: false, step: next, x };
}

/** The shortest walk that starts with him out of the set's frame (feet), between WALK.minFt and maxFt:
    his body (a box round his pelvis, his height) is off the canvas at the start. */
function startFt(w, cam) {
  if (!cam) return WALK.minFt;
  const h = 1.95 * w.p.root.scale.y / 0.97, r = 0.45;
  const off = (c) => {
    for (const dx of [-r, r]) for (const dz of [-r, r]) for (const y of [0, h * 0.5, h]) {
      _v.set(c.x + dx, y, c.z + dz).project(cam);
      if (_v.z < 1 && Math.abs(_v.x) <= 1.02 && Math.abs(_v.y) <= 1.02) return false;
    }
    return true;
  };
  for (let ft = WALK.minFt; ft <= WALK.maxFt; ft += 0.25) {
    const c = w.end.clone().addScaledVector(w.out, ft * FT);
    if (off(c)) return Math.min(WALK.maxFt, Math.max(WALK.minFt, ft + 0.5));
  }
  return WALK.maxFt;
}

/** The bat's place in the bottom hand while he walks: the stance's grip, turned about the grip so the
    barrel stands up, tipped ahead (measured on the walk's mean pose, facing his heading). */
function carryOf(w) {
  poseCycle(w, 0);
  placeRoot(w, w.heading, w.end);
  const H = w.hand.matrixWorld;
  const bat = new THREE.Matrix4().multiplyMatrices(H, w.batIn);
  const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  bat.decompose(pos, q, sc);
  const axis = UP.clone().applyQuaternion(q);
  const ahead = w.dir.clone();
  const outward = new THREE.Vector3().crossVectors(UP, ahead).multiplyScalar(w.bottom === 'l' ? 1 : -1);
  const want = UP.clone().multiplyScalar(Math.cos(CARRY_TIP * D2R)).addScaledVector(ahead, Math.sin(CARRY_TIP * D2R)).addScaledVector(outward, CARRY_OUT).normalize();
  const turn = new THREE.Quaternion().setFromUnitVectors(axis, want);
  const grip = wpos(w.hand);
  const batQ = turn.clone().multiply(q);
  const batP = pos.clone().sub(grip).applyQuaternion(turn).add(grip);
  const world = new THREE.Matrix4().compose(batP, batQ, sc);
  return new THREE.Matrix4().copy(H).invert().multiply(world);
}

/** His root turned to face `yaw` and placed so his pelvis is over `at` (world, ground), his lower
    ankle at the stance's height. */
function placeRoot(w, yaw, at) {
  const p = w.p, B = p.bones;
  p.root.quaternion.setFromAxisAngle(UP, yaw - w.yaw0);
  p.root.position.copy(w.set.rootPos);
  p.root.updateMatrixWorld(true);
  const pel = wpos(B.pelvis);
  p.root.position.x += at.x - pel.x; p.root.position.z += at.z - pel.z;
  p.root.updateMatrixWorld(true);
  const lo = Math.min(wpos(B.foot_l).y, wpos(B.foot_r).y);
  p.root.position.y += w.set.ankle - lo;
  p.root.updateMatrixWorld(true);
}

/** The distance walked at s seconds (metres): the cruise, then an even slowing to the stop. */
function walkedAt(w, s) {
  if (s <= w.tCruise) return w.v * s;
  const k = Math.min(s, w.tStop) - w.tCruise, T = w.tStop - w.tCruise;
  return w.v * w.tCruise + w.v * (k - k * k / (2 * T));
}

/** The settle's weight at s (0: walking, 1: his stance). */
export function settleAt(w, s) { return smooth(clamp01((s - (w.tStop - SETTLE.from)) / (SETTLE.from + SETTLE.to))); }

/** Each foot on its spot (two bone IK, the knee kept toward where it points), turned as the step has
    it (a step of the stance: the stance's own turn; else the clip's, about his heading). wgt: by foot. */
function feetTo(w, s, wgt) {
  const B = w.p.bones;
  for (const f of ['l', 'r']) {
    const k = wgt[f];
    if (!(k > 0)) continue;
    const A = footAt(w, f, s), foot = B['foot_' + f];
    const q = A.q ? A.q.clone() : foot.getWorldQuaternion(new THREE.Quaternion());
    const thigh = B['thigh_' + f], calf = B['calf_' + f];
    const knee = wpos(calf), mid = wpos(thigh).lerp(wpos(foot), 0.5);
    twoBoneIK(thigh, calf, foot, A.at, knee.clone().add(knee.clone().sub(mid).multiplyScalar(4)), k);
    const now = foot.getWorldQuaternion(new THREE.Quaternion());
    rotateWorld(foot, now.clone().slerp(q, k).multiply(now.invert()));
  }
}

/** Pose him s seconds into the walk. Returns false once the walk is over (he is in his stance, the
    set's own pose, put back value for value). */
export function lay(w, s) {
  const p = w.p, B = p.bones;
  if (s >= w.dur) { restoreSet(w); return false; }
  const k = settleAt(w, s);
  const d = walkedAt(w, s);
  // the body: the clip in step with his feet, his pelvis on the path
  poseCycle(w, clipAt(w, s));
  const at = w.end.clone().addScaledVector(w.out, w.len - d);
  // (he turns from his heading to his stance's facing as he settles)
  const turn = Math.atan2(Math.sin(w.yawSet - w.heading), Math.cos(w.yawSet - w.heading));
  placeRoot(w, w.heading + turn * smooth(clamp01(k * 1.4)), at);
  // his hips low enough for both legs to reach their spots (a straight leg at most LEG_MAX of its length)
  let drop = 0;
  for (const f of ['l', 'r']) {
    const A = footAt(w, f, s), hip = wpos(B['thigh_' + f]);
    const dxz = Math.hypot(A.at.x - hip.x, A.at.z - hip.z), reach = 0.985 * w.leg;
    const need = hip.y - A.at.y - Math.sqrt(Math.max(0, reach * reach - dxz * dxz));
    drop = Math.max(drop, need);
  }
  if (drop > 0) { p.root.position.y -= drop; p.root.updateMatrixWorld(true); }
  feetTo(w, s, { l: 1, r: 1 });
  if (k > 0) {
    // over to the set: every joint, his place and his facing, then the feet held on their spots again
    // (the last two steps are the stance's own spots: held there all through the settle)
    const wp = p.root.position.clone(), wq = p.root.quaternion.clone();
    for (const [b, pos, q] of w.set.bones) { b.quaternion.slerp(q, k); b.position.lerp(pos, k); }
    p.root.position.copy(wp).lerp(w.set.rootPos, k);
    p.root.quaternion.copy(wq).slerp(w.set.rootQ, k);
    p.root.updateMatrixWorld(true);
    const hold = (f) => { const A = footAt(w, f, s); return A.down && A.step.set ? 1 : 1 - k; };
    feetTo(w, s, { l: hold('l'), r: hold('r') });
  }
  if (p.bat && w.carry) {
    // the bat in his bottom hand: carried, then turned back into his grip
    const a = new THREE.Vector3(), qa = new THREE.Quaternion(), sa = new THREE.Vector3(), b = new THREE.Vector3(), qb = new THREE.Quaternion(), sb = new THREE.Vector3();
    w.carry.decompose(a, qa, sa); w.batIn.decompose(b, qb, sb);
    // (the bat turns ahead of the arms: tipped back while the hand is still low, so it never stands
    // upright beside his head as the hand comes up to his back shoulder)
    const kb = smooth(clamp01(k / 0.55));
    _m.compose(a.lerp(b, kb), qa.slerp(qb, kb), sa.lerp(sb, kb));
    _m.premultiply(w.hand.matrixWorld);
    _m.decompose(p.bat.position, p.bat.quaternion, sa);
    p.bat.updateMatrixWorld(true);
  }
  return true;
}
