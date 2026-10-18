/* The body moving as one body, on top of the capture: feet that stay where they land, and shoulder
 * girdles that follow the arms.
 *
 *   planFeet(p, poseAt, t0, t1)   once: where each foot is down (from the capture), and where it locks
 *   plantFeet(p, plan, t)         every frame: two bone IK puts each planted foot back on its spot
 *   reach(p, plan, t)             every frame, before plantFeet: pulls the pelvis back if a planted
 *                                 leg could not reach its spot (a leg never stretches)
 *   clavicles(p)                  every frame, last: the collar bones lift and reach with the arms
 *                                 (scapulohumeral rhythm), the hands kept exactly where they were
 *
 * Written after the owner's test (2026-10-18): "The shoulders and hip movements need to be
 * corrected." A capture's feet slide a few centimetres on the ground once it is fitted to another
 * body, and the CMU files carry no collar bone motion at all, so the shoulders stayed square while
 * the arms swung through them.
 */
import * as THREE from 'three';
import { wpos, wquat, twoBoneIK, rotateWorld, aimBone } from './rig.js?v=1';

const UP = new THREE.Vector3(0, 1, 0);
const SIDES = ['l', 'r'];
const DT = 1 / 60;
const BLEND = 0.08;   // seconds a foot takes to settle onto its spot, or come off it

/** Where the ball of each foot sits, relative to the ankle, in the foot's own frame. */
export function footGeom(p) {
  if (p.footGeom) return p.footGeom;
  p.footGeom = {};
  for (const s of SIDES) {
    const f = p.bones[`foot_${s}`], b = p.bones[`ball_${s}`];
    const off = wpos(b).sub(wpos(f)).applyQuaternion(wquat(f).invert());
    p.footGeom[s] = { off, leg: wpos(p.bones[`thigh_${s}`]).distanceTo(wpos(p.bones[`calf_${s}`])) + wpos(p.bones[`calf_${s}`]).distanceTo(wpos(f)) };
  }
  return p.footGeom;
}

/** Sample the motion (poseAt(t) poses the body) and decide, for each foot, when it is planted and
    where. With spans ({ l: [[from, to, how]], r: ... } in the motion's own time) the caller says
    when; without, a foot is planted while it is low and still. A planted foot's ball goes to the
    ground where it landed (a fitted capture's foot can land and then hover a few centimetres up,
    the actor's foot not being this body's). how is the foot's orientation while planted:
      'pivot'  the capture's (the foot turns on its ball, the heel lifting, as a back foot does)
      'flat'   it settles flat over 0.12 s, turned as it was in the stance, and stays so
      'land'   it keeps the orientation it landed with */
export function planFeet(p, poseAt, t0, t1, spans = null) {
  footGeom(p);
  const n = Math.max(2, Math.round((t1 - t0) / DT) + 1);
  const raw = { l: [], r: [] };
  for (let i = 0; i < n; i++) {
    poseAt(t0 + i * DT);
    for (const s of SIDES) raw[s].push({ ball: wpos(p.bones[`ball_${s}`]), ankle: wpos(p.bones[`foot_${s}`]), q: wquat(p.bones[`foot_${s}`]) });
  }
  const plan = { t0, n, feet: {} };
  // the ground: where the balls of his feet are in his stance (the first frame)
  const ground = Math.min(raw.l[0].ball.y, raw.r[0].ball.y);
  const idx = (t) => Math.max(0, Math.min(n - 1, Math.round((t - t0) / DT)));
  for (const s of SIDES) {
    const r = raw[s];
    let list;
    if (spans && spans[s]) list = spans[s].map(([a, b, how]) => [idx(a), idx(b), how]);
    else {
      const down = r.map((x, i) => {
        const j = Math.min(n - 1, i + 1), k = Math.max(0, i - 1);
        const v = Math.hypot(r[j].ball.x - r[k].ball.x, r[j].ball.z - r[k].ball.z) / ((j - k) * DT || DT);
        return x.ball.y < ground + 0.08 && v < 0.35;
      });
      list = [];
      for (let i = 0; i < n; i++) {
        if (!down[i]) continue;
        let j = i; while (j + 1 < n && down[j + 1]) j++;
        if (list.length && i - list[list.length - 1][1] <= 6) list[list.length - 1][1] = j; else list.push([i, j, 'pivot']);
        i = j;
      }
      list = list.filter(([a, b]) => (b - a) * DT >= 0.1);
    }
    const lock = new Array(n).fill(null);
    const flat = r[0].ankle.y - r[0].ball.y;
    for (const [a, b, how] of list) {
      const ball = r[a].ball.clone(); ball.y = ground;
      // flat: the stance's tilt (sole on the ground) with the yaw it landed with (a foot that
      // landed closed stays closed; turning it now would sweep the heel)
      const fwd = (x) => { const d = x.ball.clone().sub(x.ankle); return Math.atan2(d.x, d.z); };
      const flatQ = new THREE.Quaternion().setFromAxisAngle(UP, fwd(r[a]) - fwd(r[0])).multiply(r[0].q);
      for (let i = a; i <= b; i++) {
        let q;
        if (how === 'flat') q = r[a].q.clone().slerp(flatQ, smooth01((i - a) * DT / 0.12));
        else if (how === 'land') q = r[a].q.clone();
        else {
          // a pivot turns the foot only as far as its heel is off the ground: a heel still down
          // holds the foot's turn (it would otherwise sweep along the ground)
          const lift = smooth01((r[i].ankle.y - r[i].ball.y - flat - 0.005) / 0.04);
          q = r[a].q.clone().slerp(r[i].q, lift);
        }
        lock[i] = { ball, q };
      }
    }
    // weights: 1 inside a span, ramping over BLEND seconds outside it
    const w = new Float32Array(n), m = Math.round(BLEND / DT);
    for (let i = 0; i < n; i++) {
      if (lock[i]) { w[i] = 1; continue; }
      let best = 0;
      for (let d = 1; d <= m; d++) for (const j of [i - d, i + d]) if (j >= 0 && j < n && lock[j]) best = Math.max(best, 1 - d / (m + 1));
      w[i] = smooth01(best);
    }
    // a foot near a span takes that span's spot
    const near = (i) => { for (let d = 0; d <= m; d++) for (const j of [i - d, i + d]) if (j >= 0 && j < n && lock[j]) return lock[j]; return null; };
    plan.feet[s] = { w, lock: Array.from({ length: n }, (_, i) => lock[i] || (w[i] > 0 ? near(i) : null)) };
  }
  return plan;
}

const smooth01 = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };

function at(plan, t) {
  const f = (t - plan.t0) / DT;
  return Math.max(0, Math.min(plan.n - 1, Math.round(f)));
}

/** The ankle position that puts the ball of the foot on the spot with the foot turned to q. */
function ankleFor(p, s, ball, q) {
  return ball.clone().sub(p.footGeom[s].off.clone().applyQuaternion(q));
}

/** Bring the pelvis over the feet when a planted leg could not reach its spot: it moves straight
    toward that foot (so it also sinks, as a hitter's hips sink into a long stride) until the leg
    reaches with its knee still a little bent. With both feet planted wide, a few passes settle it
    where both legs reach. A leg is never stretched. */
export function reach(p, plan, t) {
  const i = at(plan, t), pel = p.bones.pelvis;
  for (let pass = 0; pass < 6; pass++) {
    let moved = false;
    for (const s of SIDES) {
      const F = plan.feet[s], L = F.lock[i];
      if (!L || F.w[i] <= 0) continue;
      const hip = wpos(p.bones[`thigh_${s}`]);
      const ankle = ankleFor(p, s, L.ball, L.q).lerp(wpos(p.bones[`foot_${s}`]), 1 - F.w[i]);
      const d = hip.distanceTo(ankle), max = p.footGeom[s].leg * 0.985;
      if (d <= max) continue;
      const w = wpos(pel).add(ankle.clone().sub(hip).multiplyScalar((d - max) / d));
      pel.position.copy(pel.parent.worldToLocal(w));
      pel.updateMatrixWorld(true);
      moved = true;
    }
    if (!moved) break;
  }
}

/** Put each planted foot on its spot: the ball where it landed, the foot turned as planned, the
    knee pointing where the capture points it. */
export function plantFeet(p, plan, t) {
  const i = at(plan, t);
  for (const s of SIDES) {
    const F = plan.feet[s], L = F.lock[i], w = F.w[i];
    if (!L || w <= 0) continue;
    const B = p.bones, foot = B[`foot_${s}`];
    const q0 = wquat(foot);
    const q = q0.clone().slerp(L.q, w);
    const tgt = ankleFor(p, s, L.ball, q).lerp(wpos(foot), 1 - w);
    const knee = wpos(B[`calf_${s}`]), hip = wpos(B[`thigh_${s}`]);
    // the pole: the capture's knee, pushed well out in front of the hip to ankle line
    const mid = hip.clone().lerp(wpos(foot), 0.5);
    const pole = knee.clone().add(knee.clone().sub(mid).multiplyScalar(4));
    twoBoneIK(B[`thigh_${s}`], B[`calf_${s}`], foot, tgt, pole, 1);
    rotateWorld(foot, q.clone().multiply(wquat(foot).invert()));
    shareShinTwist(p, s);
  }
}

/** A foot held still while the hips turn above it puts the whole turn between shin and foot, and
    linear blend skinning wrings the skin above the ankle. The shin bone takes half of it (the tibia
    does turn under a bent knee), and the foot is put back as it was. */
function shareShinTwist(p, s) {
  const B = p.bones, calf = B[`calf_${s}`], foot = B[`foot_${s}`];
  if (!p.shinBind) {
    p.shinBind = {};
    for (const [b, , q] of p.bind) if (b.name === `foot_l` || b.name === `foot_r`) p.shinBind[b.name] = q.clone();
  }
  const rel = p.shinBind[foot.name].clone().invert().multiply(foot.quaternion);   // the foot's turn from its bind, in the shin's frame
  const axis = foot.position.clone().normalize();                                // the shin's length, in its own frame
  const proj = axis.clone().multiplyScalar(rel.x * axis.x + rel.y * axis.y + rel.z * axis.z);
  const tw = new THREE.Quaternion(proj.x, proj.y, proj.z, rel.w).normalize();
  const half = new THREE.Quaternion().slerp(tw, 0.5);
  const fq = wquat(foot);
  calf.quaternion.multiply(half);
  calf.updateMatrixWorld(true);
  rotateWorld(foot, fq.multiply(wquat(foot).invert()));
}

/** The collar bones follow the arms. As an arm rises past 30 degrees its shoulder girdle lifts
    about a third as much again, and as it reaches across the chest the girdle slides forward (and
    back as it reaches behind): the deltoid then rides on a moving socket instead of being wrung
    over a fixed one. The bind pose is the zero. Each hand is put back exactly where it was (two
    bone IK, the elbow kept on its side), so a grip on a bat or a glove is not disturbed. */
const CLAV = { lift: 0.36, liftFrom: 30, liftMax: 28, reach: 0.3, reachMax: 18 };
export function clavicles(p, weight = 1) {
  if (weight <= 0) return;
  const B = p.bones;
  if (!p.clavBind) {
    // in the bind pose: each clavicle's direction and the arm's, in the chest's own frame
    const chest = B.spine_03;
    p.clavBind = {};
    const saved = Object.values(B).map((b) => [b, b.position.clone(), b.quaternion.clone()]);
    for (const [b, pos, q] of p.bind) { b.position.copy(pos); b.quaternion.copy(q); }
    p.root.updateMatrixWorld(true);
    const cq = wquat(chest).invert();
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(wquat(p.root)).applyQuaternion(cq);
    const up = UP.clone().applyQuaternion(cq);
    for (const s of SIDES) {
      const c0 = wpos(B[`clavicle_${s}`]), u0 = wpos(B[`upperarm_${s}`]), l0 = wpos(B[`lowerarm_${s}`]);
      p.clavBind[s] = { clav: u0.clone().sub(c0).normalize().applyQuaternion(cq), arm: l0.clone().sub(u0).normalize().applyQuaternion(cq) };
    }
    p.clavBind.fwd = fwd; p.clavBind.up = up;
    for (const [b, pos, q] of saved) { b.position.copy(pos); b.quaternion.copy(q); }
    p.root.updateMatrixWorld(true);
  }
  const cb = p.clavBind;
  const cq = wquat(B.spine_03);
  const fwd = cb.fwd.clone().applyQuaternion(cq), up = cb.up.clone().applyQuaternion(cq);
  const girdle = (armDir) => {
    // elevation: the arm's angle from hanging straight down; reach: how far forward it points
    const el = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(-armDir.dot(up), -1, 1)));
    const lift = Math.min(CLAV.liftMax, Math.max(0, el - CLAV.liftFrom) * CLAV.lift);
    const fw = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(armDir.dot(fwd), -1, 1)));
    const reachDeg = THREE.MathUtils.clamp(fw * CLAV.reach, -CLAV.reachMax, CLAV.reachMax);
    return [lift, reachDeg];
  };
  for (const s of SIDES) {
    const clav = B[`clavicle_${s}`], ua = B[`upperarm_${s}`], la = B[`lowerarm_${s}`], hand = B[`hand_${s}`];
    const handP = wpos(hand), handQ = wquat(hand), elbow = wpos(la), sh = wpos(ua);
    const armNow = elbow.clone().sub(sh).normalize();
    const armBind = cb[s].arm.clone().applyQuaternion(cq);
    const [l1, r1] = girdle(armNow), [l0, r0] = girdle(armBind);
    const dl = THREE.MathUtils.degToRad((l1 - l0) * weight), dr = THREE.MathUtils.degToRad((r1 - r0) * weight);
    if (Math.abs(dl) + Math.abs(dr) < 1e-4) continue;
    // turn the collar bone's lateral end up (about the forward axis) and forward (about up)
    const lat = wpos(ua).sub(wpos(clav)).normalize();
    aimBone(clav, ua, lat.clone().addScaledVector(up, Math.tan(dl)).addScaledVector(fwd, Math.tan(dr)).normalize());
    // the hand back where it was, the elbow on the same side of the arm
    const pole = elbow.clone().add(elbow.clone().sub(sh.clone().lerp(handP, 0.5)).multiplyScalar(3));
    twoBoneIK(ua, la, hand, handP, pole, 1);
    rotateWorld(hand, handQ.clone().multiply(wquat(hand).invert()));
  }
}

/** Yaw of a line from bone a to bone b, about up (radians, three's convention). */
export function yawOf(p, a, b) {
  const A = wpos(p.bones[a]), Bp = wpos(p.bones[b]);
  return Math.atan2(Bp.x - A.x, Bp.z - A.z);
}

/** Turn the three spine segments together so the chest ends at the world rotation q (each takes a
    third, as a spine shares a turn). With axis, only the turn about that world axis is taken, and
    each segment takes its third as a twist about its own length (a spine leaning over the plate
    turns about itself, not about the vertical, which would bend it sideways). */
export function chestTo(p, q, axis = null) {
  const B = p.bones;
  let R = q.clone().multiply(wquat(B.spine_03).invert());
  if (!axis) {
    const third = new THREE.Quaternion().slerp(R, 1 / 3);
    for (const n of ['spine_01', 'spine_02', 'spine_03']) rotateWorld(B[n], third);
    return;
  }
  const proj = axis.clone().multiplyScalar(R.x * axis.x + R.y * axis.y + R.z * axis.z);
  R = new THREE.Quaternion(proj.x, proj.y, proj.z, R.w).normalize();
  const ang = 2 * Math.atan2(Math.hypot(R.x, R.y, R.z) * Math.sign(R.x * axis.x + R.y * axis.y + R.z * axis.z), R.w);
  for (const [n, c] of [['spine_01', 'spine_02'], ['spine_02', 'spine_03'], ['spine_03', 'neck_01']]) {
    const along = wpos(B[c]).sub(wpos(B[n])).normalize();
    if (along.dot(axis) < 0) along.negate();
    rotateWorld(B[n], new THREE.Quaternion().setFromAxisAngle(along, ang / 3));
  }
}
