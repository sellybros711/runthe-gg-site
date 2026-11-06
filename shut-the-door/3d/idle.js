/* Life at the set: the batter, the catcher and the umpire are never statues while the pitch is picked
 * and aimed (the owner, 2026-11-05: "When the batter is standing in the box pre pitch, everyone is
 * frozen. It needs to feel alive with slight movements when idle like people do").
 *
 * A small procedural layer laid OVER the set's own pose (stage.js preview), never instead of it:
 *   the batter    breathes, shifts his weight between his feet, rocks in time with his waggle, waggles
 *                 the bat in short bursts (a circle of the barrel in his wrists, both hands on it), and
 *                 his head settles
 *   the catcher   breathes, sways and settles in his crouch, and works the mitt (a flick of the wrist
 *                 now and then)
 *   the umpire    breathes and sways a little over his feet
 * Every planted foot stays exactly where the set put it (two bone IK, as motion.js plantFeet does), the
 * bat stays in both hands (it is carried with the bottom hand, the top hand follows it by IK).
 *
 * Nothing here decides anything. Each person has his own rates and phases, from a hash of his role,
 * the hitter and the pitch's number (seedFor), and his own band of rates (LIFE), so nobody moves in
 * step with anybody at any point of a long aim, and the same set moves the same way every time. No
 * Math.random.
 *
 * THE GUARANTEE. The layer is a delta on the pose under it, with an amplitude: at 0 it changes nothing
 * at all (rest() puts back the set's own pose, value for value). stage.js plays it only at the set and
 * draws it at a capped rate; when a pitch starts it is frozen where it was and eased to 0 over OUT
 * seconds of the delivery (well before the release), so from then on every bone, the bat and the
 * swing are exactly what they were without it.
 */
import * as THREE from 'three';
import { wpos, wquat, rotateWorld, twoBoneIK } from './rig.js?v=1';
import { smooth, clamp01 } from './units.js?v=1';

const UP = new THREE.Vector3(0, 1, 0);
const D = THREE.MathUtils.degToRad;
// seconds the layer takes to come in at a new set, and to go out once the pitch starts (at most half
// of the time to the release: stage.js)
export const IN = 1.6, OUT = 0.3;

/* How much of each (degrees, metres, Hz). Small on purpose: a man waiting, not a man moving.
 *
 * OUT OF STEP, at any moment of a long aim. Over a few seconds a slow sway (a period of 6 s and more)
 * is close to a straight line, and two straight lines move in step whatever their rates and phases, so
 * no role's motion is made mostly of slow terms. Each role's hips carry one slow weight shift, kept
 * small, and one quicker rhythm in a band of his own, about a cycle apart in 3 s from every other
 * role's: the umpire near 0.25 Hz (his breath and his sway), the catcher settling in his crouch near
 * 0.65 Hz, the batter rocking with his waggle near 0.95 Hz (the same rate and phase as the barrel).
 * The breath is not a pure sine, so it carries its double too: no role's band sits on another's
 * breath doubled (an umpire breathing at 0.3 Hz put a trace of 0.6 Hz in the catcher's band).
 * The seed moves each rate by 8% at most, so the bands never meet (lab check-idle.mjs holds every 3 s
 * window from 0 to 30 s under 0.9; 320 seeds measured at most 0.73).
 * sway is [[metres, Hz] slow, [metres, Hz] quick]. */
const LIFE = {
  batter: { breath: 0.55, rate: 0.27, sway: [[0.004, 0.1], [0.004, 0.95]], head: 1.2, headRate: 0.11, wag: [5.5, 3.5], wagRate: 0.95, burstRate: 0.12 },
  catcher: { breath: 0.3, rate: 0.22, sway: [[0.0025, 0.07], [0.0055, 0.65]], bob: 0.001, head: 0.8, headRate: 0.13, mitt: 7, mittRate: 0.21 },
  umpire: { breath: 0.6, rate: 0.25, sway: [[0.004, 0.1], [0.0025, 0.27]], bob: 0, head: 1.0, headRate: 0.09 },
};

/** A number in [0, 1) from a string (FNV-1a), and a stream of them. */
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}
function stream(key) { let i = 0; return () => hash(key + '#' + (i++)); }

/** Each person's own rates (0.92 to 1.08 of the table's: narrow, so a role keeps to its own band)
    and phases. */
export function seedFor(role, key) {
  const r = stream(role + ':' + key), out = { rate: [], phase: [] };
  for (let i = 0; i < 8; i++) { out.rate.push(0.92 + 0.16 * r()); out.phase.push(2 * Math.PI * r()); }
  return out;
}

const wave = (s, i, hz, c) => Math.sin(2 * Math.PI * hz * s.rate[i] * c + s.phase[i]);
// a breath: in slower than out, never a pure sine
const breathOf = (s, hz, c) => { const x = wave(s, 0, hz, c); return x > 0 ? x : 0.7 * x; };

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

/** The person's left (the line through his hips) and forward, flat on the ground. */
function axes(p) {
  const left = wpos(p.bones.thigh_l).sub(wpos(p.bones.thigh_r)).setY(0);
  if (left.lengthSq() < 1e-8) left.set(1, 0, 0);
  left.normalize();
  return { left, fwd: new THREE.Vector3().crossVectors(left, UP).normalize() };
}

/** Put a foot back on its spot (world position and turn) after the hips moved above it. */
function plant(p, s, at, q) {
  const B = p.bones, foot = B[`foot_${s}`];
  const knee = wpos(B[`calf_${s}`]), hip = wpos(B[`thigh_${s}`]);
  const mid = hip.clone().lerp(wpos(foot), 0.5);
  twoBoneIK(B[`thigh_${s}`], B[`calf_${s}`], foot, at, knee.clone().add(knee.clone().sub(mid).multiplyScalar(4)), 1);
  rotateWorld(foot, q.clone().multiply(wquat(foot).invert()));
}

/** The hips moved by d (world), the spine taking some of it back the other way, the feet kept. */
function sway(p, d, ax, lean) {
  const B = p.bones, feet = ['l', 'r'].map((s) => [s, wpos(B[`foot_${s}`]), wquat(B[`foot_${s}`])]);
  if (d.lengthSq() > 0) {
    const pel = B.pelvis, at = wpos(pel).add(d);
    pel.position.copy(pel.parent.worldToLocal(at));
    pel.updateMatrixWorld(true);
  }
  // the trunk leans back over the hips a little, so the head moves less than the hips (as a body
  // keeps its eyes level): a turn about the axis across the shift
  if (lean) {
    const ax2 = new THREE.Vector3().crossVectors(UP, d).normalize();
    if (ax2.lengthSq() > 0.5) rotateWorld(B.spine_01, _q.setFromAxisAngle(ax2, -lean));
  }
  for (const [s, at, q] of feet) plant(p, s, at, q);
  void ax;
}

/** A breath: the chest lifts and opens a little (the upper spine tips back about his left). */
function breathe(p, ax, deg) {
  if (!deg) return;
  const B = p.bones;
  rotateWorld(B.spine_02, _q.setFromAxisAngle(ax.left, -D(deg) * 0.4));
  rotateWorld(B.spine_03, _q.setFromAxisAngle(ax.left, -D(deg) * 0.6));
  // the head stays where it looked: the neck takes the breath back
  if (B.neck_01) rotateWorld(B.neck_01, _q.setFromAxisAngle(ax.left, D(deg) * 0.8));
}

/** The person's set pose, value for value: every bone, and the bat for the batter. */
export function snapshot(p) {
  const bones = p.bind.map(([b]) => [b, b.position.clone(), b.quaternion.clone()]);
  const bat = p.bat ? [p.bat.position.clone(), p.bat.quaternion.clone(), p.bat.visible] : null;
  return { p, bones, bat, ax: axes(p) };
}

/** Back to the snapshot's pose exactly. */
export function restore(snap) {
  for (const [b, pos, q] of snap.bones) { b.position.copy(pos); b.quaternion.copy(q); }
  if (snap.bat) { snap.p.bat.position.copy(snap.bat[0]); snap.p.bat.quaternion.copy(snap.bat[1]); snap.p.bat.updateMatrixWorld(true); }
  snap.p.root.updateMatrixWorld(true);
}

/** Lay the life on whatever pose the person is in now: role 'batter' | 'catcher' | 'umpire', seed
    from seedFor, c the idle clock (s), A the amplitude (0: nothing at all is touched). */
export function apply(p, role, seed, c, A) {
  if (!(A > 0) || !p) return;
  const L = LIFE[role], B = p.bones, ax = axes(p);
  const bat = role === 'batter' && p.bat && p.bat.visible && p.bat.parent ? p.bat : null;
  // the bat rides with his bottom hand: its place in that hand before anything moves
  let inHand = null;
  if (bat) { bat.updateMatrixWorld(true); inHand = _m.copy(B.hand_l.matrixWorld).invert().multiply(bat.matrixWorld).clone(); }
  // the hips: a batter shifts his weight along his stance (toward the catcher and back), the others
  // sway side to side; a catcher bobs a little in his crouch with his breath
  const br = breathOf(seed, L.rate, c);
  const along = role === 'batter' ? ax.fwd : ax.left;
  // (the batter's rock is in time with his waggle: the same rate and phase)
  const [slow, quick] = L.sway, top = slow[0] + quick[0];
  const sh = slow[0] * wave(seed, 1, slow[1], c) + quick[0] * wave(seed, role === 'batter' ? 6 : 2, quick[1], c);
  const d = along.clone().multiplyScalar(A * sh);
  if (L.bob) d.y += A * L.bob * br;
  sway(p, d, ax, A * D(role === 'batter' ? 1.2 : 0.8) * (sh / top));
  breathe(p, ax, A * L.breath * br);
  // the head settles: a slow, small turn and nod (on the neck, so a look at the ball is kept)
  if (B.head && L.head) {
    rotateWorld(B.head, _q.setFromAxisAngle(UP, A * D(L.head) * wave(seed, 3, L.headRate, c)));
    rotateWorld(B.head, _q.setFromAxisAngle(ax.left, A * D(L.head * 0.5) * wave(seed, 4, L.headRate * 1.7, c)));
  }
  if (role === 'catcher' && L.mitt) {
    // the mitt: a flick open and closed at the wrist now and then, quiet between
    const burst = Math.max(0, wave(seed, 5, L.mittRate, c)) ** 3;
    rotateWorld(B.hand_l, _q.setFromAxisAngle(ax.fwd, A * D(L.mitt) * burst * Math.sin(2 * Math.PI * 1.3 * c + seed.phase[6])));
  }
  if (bat) {
    // the waggle: the barrel circles in his wrists in short bursts, then rests
    const burst = smooth(clamp01(0.5 + 0.9 * wave(seed, 5, L.burstRate, c)));
    const w = 2 * Math.PI * L.wagRate * seed.rate[6] * c + seed.phase[6];
    const q = _q.setFromAxisAngle(ax.fwd, A * burst * D(L.wag[0]) * Math.sin(w))
      .multiply(_q2.setFromAxisAngle(UP, A * burst * D(L.wag[1]) * Math.cos(w)));
    if (Math.abs(q.w) < 1 - 1e-12) {
      // the bottom hand turns in place; the top hand goes with the bat (its place on the bat kept)
      const top = _m2.copy(B.hand_l.matrixWorld).invert().multiply(B.hand_r.matrixWorld).clone();
      rotateWorld(B.hand_l, q.clone());
      const want = new THREE.Matrix4().multiplyMatrices(B.hand_l.matrixWorld, top);
      const at = new THREE.Vector3(), wq = new THREE.Quaternion();
      want.decompose(at, wq, _s);
      const sh2 = wpos(B.upperarm_r), el = wpos(B.lowerarm_r);
      const mid = sh2.clone().lerp(wpos(B.hand_r), 0.5);
      twoBoneIK(B.upperarm_r, B.lowerarm_r, B.hand_r, at, el.clone().add(el.clone().sub(mid).multiplyScalar(4)), 1);
      rotateWorld(B.hand_r, wq.multiply(wquat(B.hand_r).invert()));
    }
  }
  p.root.updateMatrixWorld(true);
  if (bat) {
    // the bat where his bottom hand now holds it (the bat hangs in the scene, not on the bone)
    _m.multiplyMatrices(B.hand_l.matrixWorld, inHand);
    _m.decompose(_p, _q, _s);
    bat.position.copy(_p); bat.quaternion.copy(_q);
    bat.updateMatrixWorld(true);
  }
  void _v;
}

/** The amplitude at idle clock c after a set came up (eases in over IN). */
export const ampAt = (c) => smooth(clamp01(c / IN));
