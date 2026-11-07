/* The next hitter walks up: between at bats the new hitter walks in from out of the frame, steps into
 * the box and settles into his own stance (the owner, 2026-11-06: "when a new hitter comes up, he should
 * visibly step into the box before the at bat begins"; on #953: the walk must be a real Mixamo walk, the
 * last part his Baseball Step In, and the bat carried like a real hitter carries it).
 *
 * Presentation only. Nothing here reads or decides an outcome: the walk is a pure function of the
 * hitter's set pose (people.js, his own stance, never changed here), the set's camera and the walk's own
 * clock. No Math.random. stage.js plays it after a new hitter is set and before the first pitch to him;
 * a tap skips straight to the stance, and a pitch can only start from the stance.
 *
 *   the clips    Mixamo's Walking and Baseball Step In (the owner's downloads, lab/LICENSES.md),
 *                retargeted onto the batter's own rig by lab/pipeline/build_people.py ('walkup', motion
 *                only: assets/walkup.glb), as captured for a right handed hitter (R) and mirrored for a
 *                left. Laid on his bones as they are: their own steps, nothing procedural under the body
 *   the walk     Walking, looped by the distance walked (its travel taken out, so each planted foot stays
 *                put), from out of the set's frame along a straight line onto Step In at IN.join, as he
 *                lifts his foot to step into the box (in step: the cycle's phase that best matches the
 *                clip's legs there), crossfaded over IN.cross; then Step In to IN.end (in his stance),
 *                its step at IN.speed and from IN.raise, as he brings the bat up, at IN.slow; and over the last IN.blend seconds every bone and his place go over to the
 *                set's own pose. Step In is turned and moved once so its stance stands on his set's feet.
 *                At the end it IS the set's pose, value for value (restoreSet), so the pitch, its timing,
 *                the swing and the plate are exactly as without the walk
 *   the feet     a planted foot stays where it came down (two bone IK where a step or a crossfade would
 *                slide it), and a foot the clip skims over the dirt lifts into a small step (footTable)
 *   the bat      held by its handle in his bottom hand all the way, the handle where his stance holds
 *                it in that hand. Carried in one hand it hangs barrel down and a little back, swinging
 *                with his forearm (carry); with both hands on it (the hands within GRIP.on of each
 *                other) it runs through both, at his stance's turn in the bottom hand (twoHands), which
 *                IS the stance's own angle when he is set. Between the two the turn is eased by a
 *                weight from his hands' gap, smoothed over GRIP.smooth seconds (planned with the walk:
 *                a pure function of its clock), so it never jumps, and the barrel goes round behind him
 *                (back and a little up, by his side), never round in front toward the plate
 *
 *   const C = clipsOf(gltf)                       the clips, sampled by bone name
 *   const w = planIn(p, C, cam)                   p: the batter, cam: the set's camera
 *   w.dur                                         seconds it lasts
 *   lay(w, s)                                     pose him at s seconds into it; false once it is over
 *   restoreSet(w)                                 the set's pose back, value for value
 *   setOf(p)                                      a person's pose now
 */
import * as THREE from 'three';
import { wpos, twoBoneIK, rotateWorld } from './rig.js?v=1';
import { smooth, clamp01 } from './units.js?v=1';

const UP = new THREE.Vector3(0, 1, 0);
const D2R = Math.PI / 180;
/* the walk in: Step In's clip time (s) he is joined onto it at (his foot lifting to step into the box),
   its time he is in his stance, how fast its step plays, its time he starts bringing the bat up and how
   fast that plays (a turn of the bat at the pace of a man settling in, not a flick), the crossfade from
   Walking, the blend into the set's own pose at the end; the farthest out he may start (m); the step's
   way, measured over this long */
export const IN = { join: 0.85, end: 2.85, speed: 1.35, raise: 1.95, slow: 0.9, cross: 0.6, blend: 1.0, far: 9, ahead: 0.5 };
/** Step In's clip time u seconds after the join. */
const stepT = (u) => { const u1 = (IN.raise - IN.join) / IN.speed; return u < u1 ? IN.join + u * IN.speed : IN.raise + (u - u1) * IN.slow; };
const stepDur = () => (IN.raise - IN.join) / IN.speed + (IN.end - IN.raise) / IN.slow;
/* Walking: its clock against real time (its own pace is 1.8 m/s; this is a walk up to the box) */
export const WALK = { rate: 0.8 };
/* the bat: the hands within `on` of each other hold it together, by `off` one hand alone; the weight
   between is smoothed over `smooth` seconds. Carried, it hangs `back` degrees back of straight down,
   moved by `swing` of the forearm's own swing, never less than `min` nor more than `max` back */
export const GRIP = { on: 0.16, off: 0.3, smooth: 1.0, back: 16, swing: 0.6, min: 4, max: 42 };
// the bat's handle (where the bottom hand holds it), along its own axis from its origin (m)
const HANDLE = 0.055;

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

/** The clips of assets/walkup.glb, each as tracks by bone name (quaternions, and the pelvis' place). */
export function clipsOf(gltf) {
  const out = {};
  for (const a of gltf.animations) {
    const tracks = [];
    for (const tr of a.tracks) {
      const [bone, prop] = tr.name.split('.');
      if (prop !== 'quaternion' && !(prop === 'position' && bone === 'pelvis')) continue;
      tracks.push({ bone, q: prop === 'quaternion', interp: tr.createInterpolant() });
    }
    const c = { name: a.name, dur: a.duration, tracks };
    const pt = tracks.find((t) => !t.q);
    if (pt) { c.p0 = new THREE.Vector3().fromArray(pt.interp.evaluate(0)); c.drift = new THREE.Vector3().fromArray(pt.interp.evaluate(a.duration)).sub(c.p0); }
    out[a.name] = c;
  }
  return out;
}

/** A person's pose now, value for value: every bone, his place and facing, the bat, his feet. */
export function setOf(p) {
  p.root.updateMatrixWorld(true);
  return {
    bones: p.bind.map(([b]) => [b, b.position.clone(), b.quaternion.clone()]),
    rootPos: p.root.position.clone(), rootQ: p.root.quaternion.clone(),
    bat: p.bat ? [p.bat.position.clone(), p.bat.quaternion.clone()] : null,
    feet: { l: wpos(p.bones.foot_l), r: wpos(p.bones.foot_r) },
    ankle: Math.min(wpos(p.bones.foot_l).y, wpos(p.bones.foot_r).y),
  };
}

function putSet(p, set) {
  for (const [b, pos, q] of set.bones) { b.position.copy(pos); b.quaternion.copy(q); }
  p.root.position.copy(set.rootPos); p.root.quaternion.copy(set.rootQ);
  p.root.updateMatrixWorld(true);
  if (set.bat && p.bat) { p.bat.position.copy(set.bat[0]); p.bat.quaternion.copy(set.bat[1]); p.bat.updateMatrixWorld(true); }
}
export function restoreSet(w) { putSet(w.p, w.set); }

/* ------------------------------------------------------------------ posing */

/** A clip at time t on his bones (bones without a track as in the bind pose). For Walking (cyc) the
    time is a phase u (cycles walked) and its travel is taken out (in place, the bob kept). */
function poseClip(p, c, t, cyc) {
  let tt = t, u = 0;
  if (cyc) { u = t; tt = (((t % 1) + 1) % 1) * c.dur; }
  tt = Math.max(0, Math.min(c.dur - 1e-4, tt));
  for (const [b, pos, q] of p.bind) { b.position.copy(pos); b.quaternion.copy(q); }
  for (const tr of c.tracks) {
    const bone = p.bones[tr.bone];
    if (!bone) continue;
    const v = tr.interp.evaluate(tt);
    if (tr.q) bone.quaternion.set(v[0], v[1], v[2], v[3]);
    else {
      bone.position.set(v[0], v[1], v[2]);
      if (cyc) bone.position.addScaledVector(c.drift, -(((u % 1) + 1) % 1));
    }
  }
}

/** His root turned by q and put at pos, then the matrices. */
function putRoot(p, pos, q) { p.root.position.copy(pos); p.root.quaternion.copy(q); p.root.updateMatrixWorld(true); }

/** Walking at phase u, facing yaw, his pelvis on the ground point at on average over the cycle (its
    own sway and surge within the cycle kept: the root goes at an even pace, so a planted foot stays
    planted), his feet on the ground. */
function poseWalk(w, u, yaw, at) {
  const p = w.p;
  poseClip(p, w.cyc, u, true);
  const q = _q.setFromAxisAngle(UP, yaw - w.cyYaw0);
  const off = _v.copy(w.cyPelvis).applyQuaternion(q);
  p.root.position.set(at.x - off.x, w.cyRootPos.y, at.z - off.z);
  p.root.quaternion.copy(q);
  p.root.updateMatrixWorld(true);
}

/** The bones, his place and facing, a share k of the way from the pose now to pose B (a snapshot). */
function mixTo(p, B, k) {
  if (!(k > 0)) return;
  const wp = p.root.position.clone(), wq = p.root.quaternion.clone();
  for (const [b, pos, q] of B.bones) { b.quaternion.slerp(q, k); b.position.lerp(pos, k); }
  p.root.position.copy(wp).lerp(B.rootPos, k);
  p.root.quaternion.copy(wq).slerp(B.rootQ, k);
  p.root.updateMatrixWorld(true);
}
const snap = (p) => ({ bones: p.bind.map(([b]) => [b, b.position.clone(), b.quaternion.clone()]), rootPos: p.root.position.clone(), rootQ: p.root.quaternion.clone() });

/** The turn and move that puts a clip's stance at time t on the stance `set` (the line from his back
    foot to his front foot, their midpoint, his lower ankle's height). Returns { pos, q } for his root. */
function align(p, c, t, set) {
  const front = p.lefty ? 'r' : 'l', back = front === 'l' ? 'r' : 'l';
  poseClip(p, c, t);
  putRoot(p, set.rootPos, set.rootQ);
  const cf = wpos(p.bones['foot_' + front]), cb = wpos(p.bones['foot_' + back]);
  const lo = Math.min(cf.y, cb.y);
  const sf = set.feet[front], sb = set.feet[back];
  const turn = new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(sf.x - sb.x, sf.z - sb.z) - Math.atan2(cf.x - cb.x, cf.z - cb.z));
  const mc = cf.clone().add(cb).multiplyScalar(0.5), ms = sf.clone().add(sb).multiplyScalar(0.5);
  const q = turn.clone().multiply(set.rootQ);
  const pos = set.rootPos.clone().sub(mc).applyQuaternion(turn).add(mc);
  pos.x += ms.x - mc.x; pos.z += ms.z - mc.z; pos.y += set.ankle - lo;
  return { pos, q };
}

/** Walking's own facing on his body (its travel, the root unturned), its stride on the ground (m a
    cycle, at his size), and the root's height that puts its lowest foot on the ground. */
function cycleOf(w) {
  const p = w.p, c = w.cyc;
  poseClip(p, c, 0, true);
  putRoot(p, w.set.rootPos, _q.identity());
  const R = p.bones.pelvis.parent.matrixWorld;
  const d = c.drift.clone().transformDirection(R).multiplyScalar(c.drift.length() * new THREE.Vector3().setFromMatrixScale(R).x);
  w.cyYaw0 = Math.atan2(d.x, d.z);
  w.stride = Math.hypot(d.x, d.z);
  // the lowest the feet go over the cycle, with the root at the set's height; and the pelvis' mean
  // place from the root over the cycle (the root unturned)
  let lo = Infinity;
  const mean = new THREE.Vector3();
  for (let i = 0; i < 24; i++) {
    poseClip(p, c, i / 24, true); putRoot(p, w.set.rootPos, _q.identity());
    lo = Math.min(lo, wpos(p.bones.foot_l).y, wpos(p.bones.foot_r).y);
    mean.add(wpos(p.bones.pelvis).sub(w.set.rootPos));
  }
  w.cyPelvis = mean.multiplyScalar(1 / 24).setY(0);
  w.cyRootPos = w.set.rootPos.clone();
  w.cyRootPos.y += w.set.ankle - lo;
  w.speed = WALK.rate * w.stride / c.dur;
}

/** The cycle's phase (0..1) whose legs best match the pose the person is in now. */
function phaseLike(w) {
  const p = w.p, legs = ['thigh_l', 'thigh_r', 'calf_l', 'calf_r'], now = legs.map((n) => p.bones[n].quaternion.clone());
  let best = 0, err = Infinity;
  for (let i = 0; i < 64; i++) {
    poseClip(p, w.cyc, i / 64, true);
    let e = 0; legs.forEach((n, k) => { e += p.bones[n].quaternion.angleTo(now[k]); });
    if (e < err) { err = e; best = i / 64; }
  }
  return best;
}

/** Where his pelvis is (ground point) and which way it goes, at clip time t of clip c under root r. */
function track(p, c, t, r) {
  poseClip(p, c, t); putRoot(p, r.pos, r.q);
  const a = wpos(p.bones.pelvis).setY(0);
  poseClip(p, c, t + 0.1); putRoot(p, r.pos, r.q);
  const b = wpos(p.bones.pelvis).setY(0);
  poseClip(p, c, Math.max(0, t - 0.1)); putRoot(p, r.pos, r.q);
  const a0 = wpos(p.bones.pelvis).setY(0);
  const dir = b.sub(a0); dir.y = 0;
  return { at: a, dir: dir.normalize() };
}

/* ------------------------------------------------------------------ the bat */

/** The bat's two holds, mixed by k (0: carried in one hand, 1: both hands, the stance's turn). The
    handle always where the stance holds it in the bottom hand. */
function layBat(w, k) {
  const p = w.p;
  if (!p.bat || !w.batIn) return;
  const hand = w.hand;
  const sc = new THREE.Vector3().setFromMatrixScale(p.bat.matrixWorld);
  // the handle, where the stance holds it in the bottom hand
  const G = w.handleIn.clone().applyMatrix4(hand.matrixWorld);
  // carried: barrel down, a little back of his facing, swinging with his forearm
  const left = wpos(p.bones.thigh_l).sub(wpos(p.bones.thigh_r)).setY(0).normalize();
  const fwd = new THREE.Vector3().crossVectors(left, UP).normalize();
  const fa = wpos(hand).sub(wpos(p.bones['lowerarm_' + hand.name.slice(-1)]));
  // the forearm ahead of straight down (radians, -90 to 90 degrees: a forearm raised never wraps round)
  const swing = Math.atan2(fa.dot(fwd), Math.abs(fa.y));
  const back = Math.max(GRIP.min, Math.min(GRIP.max, GRIP.back - GRIP.swing * swing / D2R)) * D2R;
  const dirA = UP.clone().multiplyScalar(-Math.cos(back)).addScaledVector(fwd, -Math.sin(back));
  // the lift, the way a hitter brings the bat up: from hanging (qA) the barrel goes back and up toward
  // his back shoulder, away from the plate and the pitcher (qM), and into the stance's own angle as the
  // set has it (qS), never round in front of him or low across his legs, whatever the clip's hands do
  // on the way. Each hold is built from its barrel's way and the stance's roll (the set bat's local x,
  // squared to the barrel), never as the shortest turn from another hold, which near a half turn has no
  // one way to go
  const qS = w.set.bat[1], xS = new THREE.Vector3(1, 0, 0).applyQuaternion(qS);
  const dirM = CATCHER.clone().addScaledVector(w.awayS, LIFT.away).addScaledVector(UP, LIFT.up).normalize();
  const qM = holdAlong(dirM, xS, left), qA = holdAlong(dirA, xS, left);
  const q = k < 0.5 ? qA.slerp(qM, k * 2) : qM.slerp(qS, (k - 0.5) * 2);
  w.batK = k;
  p.bat.quaternion.copy(q);
  p.bat.position.copy(G).addScaledVector(UP.clone().applyQuaternion(q), -HANDLE * sc.y);
  p.bat.updateMatrixWorld(true);
}
// the lift's way point: toward the catcher (his back shoulder's side), up by `up`, and away from the
// plate by `away` (a little: his hands are in front of him as they meet, and a barrel straight back from
// there would run through his hips)
const CATCHER = new THREE.Vector3(0, 0, -1);
const LIFT = { away: 0.15, up: 0.7 };

/** A bat's turn with its barrel (local +y) along dir and its local x as near the way x as can be
    (squared to dir; if x runs along dir, the way alt instead). */
function holdAlong(dir, x, alt) {
  const y = dir.clone().normalize();
  let xx = x.clone().addScaledVector(y, -x.dot(y));
  if (xx.lengthSq() < 1e-4) xx = alt.clone().addScaledVector(y, -alt.dot(y));
  xx.normalize();
  const z = new THREE.Vector3().crossVectors(xx, y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xx, y, z));
}

/** The weight of the two handed hold over the walk, every 1/30 s: from his hands' gap as posed by the
    walk, eased (the gap's own weight, averaged over GRIP.smooth seconds), so the bat turns over at the
    pace of a man bringing it up or letting it down. */
function holdTable(w, poseAt) {
  const n = Math.ceil(w.dur * 30) + 1, raw = [], pel = [];
  w.pel = pel;
  const p = w.p, top = p.bones['hand_' + (w.hand === p.bones.hand_l ? 'r' : 'l')];
  for (let i = 0; i < n; i++) {
    poseAt(Math.min(w.dur, i / 30));
    const gap = wpos(w.hand).distanceTo(wpos(top));
    pel.push(wpos(p.bones.pelvis).setY(0));
    raw.push(1 - smooth(clamp01((gap - GRIP.on) / (GRIP.off - GRIP.on))));
  }
  const half = Math.round(GRIP.smooth * 15), out = [];
  for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let j = i - half; j <= i + half; j++) { s += raw[Math.max(0, Math.min(n - 1, j))]; c++; } out.push(s / c); }
  w.hold = out;
}
function holdAt(w, s) {
  const H = w.hold, x = Math.max(0, Math.min(H.length - 1, s * 30)), i = Math.min(H.length - 2, Math.floor(x));
  return H.length < 2 ? H[0] : H[i] + (H[i + 1] - H[i]) * (x - i);
}

/* ------------------------------------------------------------------ planted feet */

/* A foot on the ground stays where it came down, and a foot that moves along the ground steps. Where a
   clip's own step or a crossfade between two clips would slide a planted foot, two bone IK holds it;
   where a clip skims a foot over the dirt (Walk In's last small steps at the box), it lifts it a
   little, so it is a step and not a slide. Planned at 60 a second with the walk (footTable), a pure
   function of its clock: a foot is down while its ankle is within FOOT.down of the ground and it
   moves under FOOT.slow m/s as posed, for at least FOOT.run frames; it is held on the spot where it
   came down, and let go over FOOT.out seconds once it lifts; a foot moving faster than FOOT.skim near
   the ground is lifted by up to FOOT.lift (smoothed over FOOT.ease frames either side). */
const FOOT = { down: 0.035, up: 0.045, slow: 0.9, run: 4, out: 0.2, skim: 0.4, lift: 0.08, ease: 4, hz: 60 };
function footTable(w, poseAt) {
  const p = w.p, n = Math.ceil(w.dur * FOOT.hz) + 1, ground = w.set.ankle, T = { l: [], r: [] };
  const raw = { l: [], r: [] };
  for (let i = 0; i < n; i++) {
    poseAt(Math.min(w.dur, i / FOOT.hz));
    for (const f of ['l', 'r']) raw[f].push(wpos(p.bones['foot_' + f]));
  }
  for (const f of ['l', 'r']) {
    const R = raw[f], v = R.map((x, i) => (i ? x.distanceTo(R[i - 1]) * FOOT.hz : 0)), h = R.map((x) => x.y - ground);
    // down: low and slow for FOOT.run frames running, and then down until it lifts (FOOT.up over the
    // ground), however the clip drags it meanwhile
    const low = R.map((_, i) => h[i] < FOOT.down && v[i] < FOOT.slow), down = low.slice();
    for (let i = 0; i < n;) {
      if (!low[i]) { i++; continue; }
      let j = i; while (j < n && low[j]) j++;
      if (j - i < FOOT.run) { for (let k = i; k < j; k++) down[k] = false; i = j; continue; }
      while (j < n && h[j] < FOOT.up) down[j++] = true;
      i = j;
    }
    // the lift of a skimming foot
    const lift0 = R.map((_, i) => (!down[i] && h[i] < 0.08 ? FOOT.lift * clamp01((v[i] - FOOT.skim) / 0.4) : 0));
    const lift = lift0.map((_, i) => { let s = 0, c = 0; for (let j = i - FOOT.ease; j <= i + FOOT.ease; j++) { s += lift0[Math.max(0, Math.min(n - 1, j))]; c++; } return s / c; });
    let lock = null, since = Infinity;
    for (let i = 0; i < n; i++) {
      const free = R[i].clone(); free.y += lift[i];
      if (down[i]) { if (!lock) lock = R[i].clone(); since = 0; T[f].push(lock); continue; }
      since += 1 / FOOT.hz;
      if (lock && since < FOOT.out) { T[f].push(lock.clone().lerp(free, smooth(since / FOOT.out))); continue; }
      lock = null;
      T[f].push(free);
    }
  }
  w.feet = T;
}
/** Each foot held where the table has it at s (weight k scales every hold: 0 lets them all go). */
function holdFeet(w, s, k = 1) {
  if (!w.feet || !(k > 0)) return;
  const p = w.p, i = Math.max(0, Math.min(w.feet.l.length - 1, Math.round(s * FOOT.hz)));
  for (const f of ['l', 'r']) {
    const e = w.feet[f][i];
    const foot = p.bones['foot_' + f], thigh = p.bones['thigh_' + f], calf = p.bones['calf_' + f];
    const q = foot.getWorldQuaternion(new THREE.Quaternion());
    const knee = wpos(calf), mid = wpos(thigh).lerp(wpos(foot), 0.5);
    twoBoneIK(thigh, calf, foot, e, knee.clone().add(knee.clone().sub(mid).multiplyScalar(4)), k);
    rotateWorld(foot, q.multiply(foot.getWorldQuaternion(new THREE.Quaternion()).invert()));
  }
}

/* ------------------------------------------------------------------ in view */

/** Whether any of him is on the canvas of camera cam: his joints, each widened by BODY_R to either
    side (his flesh, his arms round them), and the bat's end. */
const BODY_R = 0.3;
function inView(w, cam) {
  const p = w.p;
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
  const pts = ['pelvis', 'spine_03', 'head', 'foot_l', 'foot_r', 'hand_l', 'hand_r', 'lowerarm_l', 'lowerarm_r'].map((k) => wpos(p.bones[k]));
  if (p.bat) { layBat(w, 0); pts.push(new THREE.Vector3(0, 0.86, 0).applyMatrix4(p.bat.matrixWorld)); }
  for (const q of pts) for (const d of [-BODY_R, 0, BODY_R]) {
    _v2.copy(q).addScaledVector(right, d).project(cam);
    if (_v2.z < 1 && Math.abs(_v2.x) <= 1 && Math.abs(_v2.y) <= 1) return true;
  }
  return false;
}

/** The bat's hold in the bottom hand as the stance has it, and its handle there. */
function holdOf(w) {
  const p = w.p;
  if (!p.bat) return;
  w.batIn = new THREE.Matrix4().copy(w.hand.matrixWorld).invert().multiply(p.bat.matrixWorld);
  const sc = new THREE.Vector3().setFromMatrixScale(p.bat.matrixWorld);
  void sc;
  // his set's back (away from the plate): the stance's facing turned round
  const ls = wpos(p.bones.thigh_l).sub(wpos(p.bones.thigh_r)).setY(0).normalize();
  w.awayS = new THREE.Vector3().crossVectors(ls, UP).normalize().negate();
  w.handleIn = new THREE.Vector3(0, HANDLE, 0).applyMatrix4(p.bat.matrixWorld).applyMatrix4(new THREE.Matrix4().copy(w.hand.matrixWorld).invert());
}

/* ------------------------------------------------------------------ the walk in */

/** The walk in for the hitter as he is set now (his stance, the bat in his hands). */
export function planIn(p, C, cam) {
  const sfx = p.lefty ? '' : 'R';
  const set = setOf(p), hand = p.bones['hand_' + (p.bottom || 'l')];
  const w = { kind: 'in', p, clip: C['stepIn' + sfx], cyc: C['walk' + sfx], set, hand };
  holdOf(w);
  w.root = align(p, w.clip, IN.end, set);
  cycleOf(w);
  // the join: where he is on Step In at IN.join, which way his step goes (over the next IN.ahead
  // seconds: he stands still before it), and Walking's phase in step with it
  const J = track(p, w.clip, IN.join, w.root), J2 = track(p, w.clip, IN.join + IN.ahead, w.root);
  J.dir = J2.at.clone().sub(J.at).setY(0).normalize();
  poseClip(p, w.clip, IN.join);
  w.phaseJ = phaseLike(w);
  w.joinAt = J.at; w.dir = J.dir; w.yaw = Math.atan2(J.dir.x, J.dir.z);
  // how far out on the line he starts: the nearest he is out of the frame
  let D = IN.far;
  if (cam) for (let x = 0.5; x <= IN.far; x += 0.1) { poseWalk(w, w.phaseJ - x / w.stride, w.yaw, J.at.clone().addScaledVector(J.dir, -x)); if (!inView(w, cam)) { D = x; break; } }
  w.dist = Math.min(IN.far, D);
  w.tJoin = w.dist / w.speed;
  w.dur = w.tJoin + stepDur();
  holdTable(w, (s) => poseIn(w, s));
  footTable(w, (s) => poseInSet(w, s));
  putSet(p, set);
  return w;
}

/** The walk in's body at s with the final blend into the set (no bat, no feet held). */
function poseInSet(w, s) {
  poseIn(w, s);
  const k = smooth(clamp01((s - (w.dur - IN.blend)) / IN.blend));
  if (k > 0) mixTo(w.p, w.set, k);
  return k;
}

/** The walk in's body at s (no bat, no final blend). */
function poseIn(w, s) {
  const p = w.p, X = IN.cross, k = smooth(clamp01((s - (w.tJoin - X / 2)) / X));
  if (k < 1) {
    const x = w.dist - w.speed * s;                   // still to walk to the join (negative: past it)
    poseWalk(w, w.phaseJ - x / w.stride, w.yaw, w.joinAt.clone().addScaledVector(w.dir, -x));
    if (k <= 0) return;
  }
  const B = k < 1 ? snap(p) : null;
  poseClip(p, w.clip, stepT(s - w.tJoin));
  putRoot(p, w.root.pos, w.root.q);
  if (B) mixTo(p, B, 1 - k);
}

/* ------------------------------------------------------------------ play */

/** Pose him s seconds into the walk. Returns false once it is over, leaving him in the set's own pose,
    value for value. */
export function lay(w, s) {
  const p = w.p;
  if (w.kind === 'in') {
    if (s >= w.dur) { restoreSet(w); return false; }
    const k = poseInSet(w, s);
    // (the feet held and stepping into the stance's spots all through the settle, let go only in its
    // last moment, where the set has them on those spots)
    holdFeet(w, s, 1 - smooth(clamp01((s - (w.dur - 0.12)) / 0.12)));
    layBat(w, Math.max(holdAt(w, s), k));
    return true;
  }
  return false;
}

/** The bat's two handed weight at s (for the checks). */
export const holdWeight = (w, s) => holdAt(w, s);
