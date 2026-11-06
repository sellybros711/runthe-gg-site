/* The change of hitter between at bats: the next hitter walks into the box and settles into his own
 * stance, and after a strikeout the last hitter walks out of it first (the owner, 2026-11-06: "when a
 * new hitter comes up, he should visibly step into the box before the at bat begins"; and on #953: the
 * walk must be a real Mixamo walk, and the struck out hitter walks out toward his dugout).
 *
 * Presentation only. Nothing here reads or decides an outcome: each walk is a pure function of the
 * hitter's set pose (people.js, his own stance, never changed here) and the walk's own clock. No
 * Math.random. stage.js plays it after a new hitter is set and before the first pitch to him; a tap
 * skips straight to the stance, and a pitch can only start from the stance.
 *
 *   the clips    Mixamo's Baseball Walk In and Baseball Walk Out (the owner's 2026-10-19 downloads,
 *                lab/LICENSES.md), retargeted onto the batter's own rig by lab/pipeline/build_people.py
 *                ('walkup', motion only: assets/walkup.glb), as captured for a right handed hitter
 *                (R) and mirrored for a left. Laid on his bones as they are, his travel included: the
 *                clip's own steps, nothing procedural under them
 *   walk in      the clip from where he is out of the set's frame (or its start) to where he is in his
 *                stance (IN.end), at IN.speed. The whole clip is turned and moved once, so its last
 *                stance stands on his set's feet (the line from his back foot to his front foot, and
 *                their midpoint); over the last IN.blend seconds every bone and his place go over to
 *                the set's own pose. At the end it IS the set's pose, value for value (restoreSet), so
 *                the pitch, its timing, the swing and the plate are exactly as without the walk
 *   walk out     the clip from his stance (its first frame) on, at OUT.speed, placed the same way on the
 *                stance he stood in for the at bat, then turned about his feet so he walks off toward the
 *                dugout on his side (OUT.dugout degrees round from centre field: the dugouts are in the
 *                wall between the plate and the bags, ballpark.js), clear of the next hitter coming up
 *                from the on deck circle behind him; over its first OUT.blend seconds his body goes from
 *                where the last pitch left him (the end of a swing and miss, a take) into the clip
 *   the bat      in his bottom hand all the way, where the stance holds it (the same place in that
 *                hand): it never leaves the hand, so it never jumps
 *
 *   const C = clipsOf(gltf)                       the four clips, sampled by bone name
 *   const w = planIn(p, C, cam)  /  planOut(p, C, set, from)
 *   w.dur                                         seconds it lasts
 *   lay(w, s)                                     pose him at s seconds into it; false once it is over
 *   restoreSet(w)                                 the set's pose back, value for value (walk in)
 *   setOf(p)                                      a person's pose now, for restoreSet and planOut
 */
import * as THREE from 'three';
import { wpos } from './rig.js?v=1';
import { smooth, clamp01 } from './units.js?v=1';

const UP = new THREE.Vector3(0, 1, 0);
/* the walk in: the clip's time (s) where he is in his stance, how fast it plays, the blend into the
   set's own pose before it; the latest clip time it may start at (it starts at the latest time he is
   still out of the set's frame, so as little of it as can be is spent out of sight) */
export const IN = { end: 4.6, speed: 1.25, blend: 0.45, startMax: 1.8 };
/* the walk out: how fast, the blend from where the pitch left him into the clip, and how long at most */
export const OUT = { speed: 1.25, blend: 0.4, max: 3.2, dugout: 88 };

const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

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
    out[a.name] = { name: a.name, dur: a.duration, tracks };
  }
  return out;
}

/** A person's pose now, value for value: every bone, his place, facing and scale, the bat, his feet. */
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

/** Back to a pose from setOf, exactly. */
function putSet(p, set) {
  for (const [b, pos, q] of set.bones) { b.position.copy(pos); b.quaternion.copy(q); }
  p.root.position.copy(set.rootPos); p.root.quaternion.copy(set.rootQ);
  p.root.updateMatrixWorld(true);
  if (set.bat && p.bat) { p.bat.position.copy(set.bat[0]); p.bat.quaternion.copy(set.bat[1]); p.bat.updateMatrixWorld(true); }
}
export function restoreSet(w) { putSet(w.p, w.set); }

/** The clip at time t on his bones (bones without a track as in the bind pose). */
function poseClip(w, t) {
  const p = w.p, c = w.clip, tt = Math.max(0, Math.min(c.dur - 1e-4, t));
  for (const [b, pos, q] of p.bind) { b.position.copy(pos); b.quaternion.copy(q); }
  for (const tr of c.tracks) {
    const bone = p.bones[tr.bone];
    if (!bone) continue;
    const v = tr.interp.evaluate(tt);
    if (tr.q) bone.quaternion.set(v[0], v[1], v[2], v[3]);
    else bone.position.set(v[0], v[1], v[2]);
  }
}

/** His root, turned and moved once for the whole clip (the alignment), then the matrices. */
function placeRoot(w) {
  w.p.root.position.copy(w.rootPos); w.p.root.quaternion.copy(w.rootQ);
  w.p.root.updateMatrixWorld(true);
}

/** The bat in his bottom hand, where the stance holds it in that hand; and while his top hand is on
    it too (the hands within GRIP.on of each other, the capture's two handed hold), turned about the
    bottom grip so it runs through the top hand as well (by GRIP.off apart, the one handed hold alone).
    In the stance the two are the same, so the hold never jumps. */
const GRIP = { on: 0.16, off: 0.3 };
function batInHand(w) {
  const p = w.p;
  if (!p.bat || !w.batIn) return;
  _m.multiplyMatrices(w.hand.matrixWorld, w.batIn);
  _m.decompose(p.bat.position, p.bat.quaternion, _v);
  const top = p.bones['hand_' + (w.hand === p.bones.hand_l ? 'r' : 'l')];
  const a = wpos(w.hand), b = wpos(top), d = b.clone().sub(a), gap = d.length();
  const k = 1 - smooth(clamp01((gap - GRIP.on) / (GRIP.off - GRIP.on)));
  if (k > 0 && gap > 1e-4) {
    // the bat's axis (its local +y, knob to barrel) onto the line from the bottom hand through the top,
    // pointing the way the one handed hold points it (a hand on the bat is above or below the other)
    const axis = UP.clone().applyQuaternion(p.bat.quaternion), want = d.normalize();
    if (want.dot(axis) < 0) want.negate();
    const turn = new THREE.Quaternion().setFromUnitVectors(axis, want);
    turn.slerp(_q.identity(), 1 - k);
    p.bat.position.sub(a).applyQuaternion(turn).add(a);
    p.bat.quaternion.premultiply(turn);
  }
  p.bat.updateMatrixWorld(true);
}

/** The turn and move that puts the clip's stance at clip time t on the stance `set` (the line from
    his back foot to his front foot, their midpoint, his lower ankle's height). */
function align(w, t, set) {
  const p = w.p, front = p.lefty ? 'r' : 'l', back = front === 'l' ? 'r' : 'l';
  poseClip(w, t);
  p.root.position.copy(set.rootPos); p.root.quaternion.copy(set.rootQ);
  p.root.updateMatrixWorld(true);
  const cf = wpos(p.bones['foot_' + front]), cb = wpos(p.bones['foot_' + back]);
  const lo = Math.min(cf.y, cb.y);
  const sf = set.feet[front], sb = set.feet[back];
  const ac = Math.atan2(cf.x - cb.x, cf.z - cb.z), as = Math.atan2(sf.x - sb.x, sf.z - sb.z);
  const turn = new THREE.Quaternion().setFromAxisAngle(UP, as - ac);
  const mc = cf.clone().add(cb).multiplyScalar(0.5), ms = sf.clone().add(sb).multiplyScalar(0.5);
  // the root turned about the clip's midpoint, then moved onto the set's
  w.rootQ = turn.clone().multiply(set.rootQ);
  w.rootPos = set.rootPos.clone().sub(mc).applyQuaternion(turn).add(mc);
  w.rootPos.x += ms.x - mc.x; w.rootPos.z += ms.z - mc.z; w.rootPos.y += set.ankle - lo;
}

/** Whether any of him is on the canvas of camera cam: his joints, each widened by BODY_R to either
    side (his flesh, his arms round them) and up, and the bat's end. */
const BODY_R = 0.3;
function inView(w, cam) {
  const p = w.p;
  batInHand(w);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
  const pts = ['pelvis', 'spine_03', 'head', 'foot_l', 'foot_r', 'hand_l', 'hand_r', 'lowerarm_l', 'lowerarm_r'].map((k) => wpos(p.bones[k]));
  if (p.bat) pts.push(new THREE.Vector3(0, 0.86, 0).applyMatrix4(p.bat.matrixWorld));
  for (const q of pts) for (const d of [-BODY_R, 0, BODY_R]) {
    _v2.copy(q).addScaledVector(right, d).project(cam);
    if (_v2.z < 1 && Math.abs(_v2.x) <= 1 && Math.abs(_v2.y) <= 1) return true;
  }
  return false;
}

/** The walk in for the hitter as he is set now (his stance, the bat in his hands). lead: seconds he
    walks out of sight before he comes into the frame (the last hitter's walk out, so the new one comes
    into view as the last one goes out of it). */
export function planIn(p, C, cam, lead = 0) {
  const clip = C['walkIn' + (p.lefty ? '' : 'R')];
  const set = setOf(p), hand = p.bones['hand_' + (p.bottom || 'l')];
  const w = { kind: 'in', p, clip, set, hand, batIn: p.bat ? new THREE.Matrix4().copy(hand.matrixWorld).invert().multiply(p.bat.matrixWorld) : null };
  align(w, IN.end, set);
  // the latest start at which he is still out of the set's frame (no later than IN.startMax); if even
  // its first frame is in the frame, from its first frame
  let t0 = 0;
  if (cam) {
    for (let t = IN.startMax; t >= 0; t -= 0.05) { poseClip(w, t); placeRoot(w); if (!inView(w, cam)) { t0 = t; break; } }
    t0 = Math.max(0, t0 - lead * IN.speed);
    poseClip(w, 0); placeRoot(w); w.seenAtStart = inView(w, cam);
  }
  w.t0 = t0;
  w.dur = (IN.end - t0) / IN.speed;
  putSet(p, set);
  return w;
}

/** The walk out for the hitter: he stood in `set` for the at bat and is posed now as the last pitch
    left him (`from`, setOf). cam: the set's camera (he is done once he is out of it). */
export function planOut(p, C, set, from, cam) {
  const clip = C['walkOut' + (p.lefty ? '' : 'R')];
  const hand = p.bones['hand_' + (p.bottom || 'l')];
  const w = { kind: 'out', p, clip, set, from, hand, cam };
  // the bat where the stance holds it in his bottom hand
  putSet(p, set);
  w.batIn = p.bat ? new THREE.Matrix4().copy(hand.matrixWorld).invert().multiply(p.bat.matrixWorld) : null;
  align(w, 0, set);
  // turned so his travel heads for the dugout on his side
  poseClip(w, 0); placeRoot(w);
  const a0 = wpos(p.bones.pelvis);
  poseClip(w, clip.dur); placeRoot(w);
  const a1 = wpos(p.bones.pelvis);
  const side = set.feet.l.x + set.feet.r.x >= 0 ? 1 : -1;
  const turn = side * OUT.dugout * Math.PI / 180 - Math.atan2(a1.x - a0.x, a1.z - a0.z);
  const tq = new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(Math.sin(turn), Math.cos(turn)));
  const piv = set.feet.l.clone().add(set.feet.r).multiplyScalar(0.5).setY(0);
  w.rootQ = tq.clone().multiply(w.rootQ);
  w.rootPos = w.rootPos.clone().sub(piv).applyQuaternion(tq).add(piv);
  // out of the frame, or the clip's end, or OUT.max, whichever comes first
  let dur = Math.min(OUT.max, clip.dur / OUT.speed);
  if (cam) for (let s = OUT.blend; s <= dur; s += 1 / 30) { poseClip(w, s * OUT.speed); placeRoot(w); if (!inView(w, cam)) { dur = s; w.leaves = true; break; } }
  w.dur = dur;
  putSet(p, from);
  return w;
}

/** Pose him s seconds into the walk. Returns false once it is over: a walk in leaves him in the set's
    own pose, value for value; a walk out where it ended (out of the frame). */
export function lay(w, s) {
  const p = w.p;
  if (w.kind === 'in') {
    if (s >= w.dur) { restoreSet(w); return false; }
    poseClip(w, w.t0 + s * IN.speed);
    placeRoot(w);
    const k = smooth(clamp01((s - (w.dur - IN.blend)) / IN.blend));
    if (k > 0) blendTo(p, w.set, k);
    batInHand(w);
    return true;
  }
  const t = Math.min(s, w.dur);
  poseClip(w, t * OUT.speed);
  placeRoot(w);
  const k = 1 - smooth(clamp01(t / OUT.blend));
  if (k > 0) blendTo(p, w.from, k);
  batInHand(w);
  return s < w.dur;
}

/** Every bone, his place and facing taken a share k of the way to the pose `set`. */
function blendTo(p, set, k) {
  const wp = p.root.position.clone(), wq = p.root.quaternion.clone();
  for (const [b, pos, q] of set.bones) { b.quaternion.slerp(q, k); b.position.lerp(pos, k); }
  p.root.position.copy(wp).lerp(set.rootPos, k);
  p.root.quaternion.copy(wq).slerp(set.rootQ, k);
  p.root.updateMatrixWorld(true);
  void _q;
}
