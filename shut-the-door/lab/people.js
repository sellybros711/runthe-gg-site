/* The batter, the catcher and the umpire: loaded, dressed, placed, and moved in time with the ball.
 *
 * Motion is the CMU capture fitted onto each body in the pipeline (pipeline/build_people.py). Here
 * it is placed and timed: the swing is slid in time so the bat arrives with the ball, the catcher's
 * glove arm reaches for the ball with two bone IK, and the umpire's crouch is the capture's stand
 * and squat blended, his strike call layered on top.
 */
import * as THREE from 'three';
import * as M from './materials.js';
import * as G from './gear3d.js';
import { wpos, wquat, boneBox, attach, twoBoneIK, bendWorld, rotateWorld } from './rig.js';
import { P, FT, smooth, clamp01 } from './units.js';

const UP = new THREE.Vector3(0, 1, 0);
const NAVY = 0x0d1a33, ROYAL = 0x174a8c;

export async function loadPerson(loader, url, scene) {
  const g = await loader.loadAsync(url);
  const root = new THREE.Group();
  root.add(g.scene);
  scene.add(root);
  const bones = {}, meshes = [];
  g.scene.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      meshes.push(o);
      const s = o.material, n = (s.name || '').toLowerCase();
      if (n.startsWith('skin')) o.material = M.skin(s);
      else if (n.startsWith('eyes')) o.material = M.eyes(s);
      else if (n.includes('eyebrow') || n.includes('eyelash') || n.includes('hair') || n.includes('short0')) { o.material = M.hair(s); o.castShadow = n.includes('hair') || n.includes('short0'); }
      else if (n.includes('shoes')) o.material = new THREE.MeshStandardMaterial({ map: s.map, normalMap: s.normalMap, roughness: 0.45, color: 0x9a9a9a });
      else o.material = M.cloth(s);
    }
  });
  // clips are sampled directly (not through AnimationMixer, which skips writing a value that has
  // not changed since the last frame; the procedural layers below rewrite bones every frame)
  const clips = Object.fromEntries(g.animations.map((a) => [a.name, a]));
  const samplers = {};
  for (const [n, c] of Object.entries(clips)) {
    samplers[n] = c.tracks.map((tr) => {
      const [node, prop] = tr.name.split('.');
      return { bone: bones[node], prop, interp: tr.createInterpolant(), q: prop === 'quaternion' };
    }).filter((x) => x.bone && (x.prop === 'quaternion' || x.prop === 'position'));
  }
  const actions = Object.fromEntries(Object.entries(clips).map(([n, c]) => [n, { time: 0, clip: c }]));
  const mixer = null;
  root.updateMatrixWorld(true);
  const ankleY = Math.min(wpos(bones.foot_l).y, wpos(bones.foot_r).y);
  // the bind pose faces +z: remember which way is forward in the head's own frame
  const headFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(wquat(bones.head).invert());
  const bind = Object.values(bones).map((b) => [b, b.position.clone(), b.quaternion.clone()]);
  return { root, scene: g.scene, bones, meshes, mixer, clips, actions, samplers, ankleY, headFwd, bind };
}

/** Put the lower ankle at its bind pose height (the soles on the ground) for the current pose. */
function ground(p) {
  const y = Math.min(wpos(p.bones.foot_l).y, wpos(p.bones.foot_r).y);
  p.root.position.y += p.ankleY - y;
  p.root.updateMatrixWorld(true);
}

/** Pose a person at clip time(s): weights { clipName: [time, weight] }. */
const _qa = new THREE.Quaternion();
export function pose(p, spec) {
  // start every frame from the bind pose, then lay the clips on (weights blend in order)
  for (const [b, pos, q] of p.bind) { b.position.copy(pos); b.quaternion.copy(q); }
  let first = true;
  const list = Array.isArray(spec) ? spec : Object.entries(spec).map(([n, [t, w]]) => [n, t, w]);
  for (const [n, time, w] of list) {
    const a = p.actions[n];
    if (!a || w <= 0) continue;
    a.time = THREE.MathUtils.clamp(time, 0, a.clip.duration - 1e-3);
    for (const s of p.samplers[n]) {
      const v = s.interp.evaluate(a.time);
      if (s.q) {
        _qa.set(v[0], v[1], v[2], v[3]);
        if (first) s.bone.quaternion.slerp(_qa, w); else s.bone.quaternion.slerp(_qa, w);
      } else {
        s.bone.position.x += (v[0] - s.bone.position.x) * w;
        s.bone.position.y += (v[1] - s.bone.position.y) * w;
        s.bone.position.z += (v[2] - s.bone.position.z) * w;
      }
    }
    first = false;
  }
  p.root.updateMatrixWorld(true);
}

/** Turn a person to face the mound (+z) and put his pelvis over the given ground point. */
export function face(p, at) {
  const clip = Object.keys(p.clips)[0];
  pose(p, { [clip]: [0, 1] });
  const l = wpos(p.bones.thigh_l), r = wpos(p.bones.thigh_r);
  const left = l.clone().sub(r).setY(0).normalize();
  const fwd = new THREE.Vector3().crossVectors(left, UP).normalize();
  p.root.rotation.y += -Math.atan2(fwd.x, fwd.z);
  p.root.updateMatrixWorld(true);
  pose(p, { [clip]: [0, 1] });
  const pel = wpos(p.bones.pelvis);
  p.root.position.x += at.x - pel.x; p.root.position.z += at.z - pel.z;
  p.root.updateMatrixWorld(true);
  ground(p);
  p.fwd = new THREE.Vector3(0, 0, 1); p.left = new THREE.Vector3(1, 0, 0);
  p.home = at.clone();
}

/** Where his feet go in the crouch: planted wide, toes out (worked out once). */
function stance(p) {
  const c = p.crouch;
  const clip = Object.keys(p.clips)[0];
  pose(p, { [clip]: [0, 1] });
  const pel = wpos(p.bones.pelvis);
  p.feet = {};
  for (const [s, sign] of [['l', 1], ['r', -1]]) {
    const a = wpos(p.bones[`foot_${s}`]);
    a.x = pel.x + sign * c.width; a.z = pel.z + 0.02;
    const q0 = wquat(p.bones[`foot_${s}`]);
    // toes out (about up), heel up (about the foot's own side axis)
    const yaw = new THREE.Quaternion().setFromAxisAngle(UP, sign * c.toeOut);
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(yaw);
    const pitch = new THREE.Quaternion().setFromAxisAngle(side, -c.heel);
    p.feet[s] = { pos: a.add(new THREE.Vector3(0, c.heel * 0.06, 0)), q: pitch.multiply(yaw).multiply(q0) };
  }
}

/** Crouch by amount k (0 standing, 1 full): drop and push back the hips, plant the feet, lean. */
function crouch(p, k) {
  const c = p.crouch, B = p.bones;
  const pel = B.pelvis;
  const w = wpos(pel);
  w.y -= c.drop * k; w.z -= c.back * k;
  pel.position.copy(pel.parent.worldToLocal(w));
  pel.updateMatrixWorld(true);
  for (const [s, sign] of [['l', 1], ['r', -1]]) {
    const f = p.feet[s];
    const cur = wpos(B[`foot_${s}`]);
    const tgt = cur.clone().lerp(f.pos, k);
    const pole = wpos(B[`calf_${s}`]).add(new THREE.Vector3(sign * c.kneeOut, 0, 1.2));
    twoBoneIK(B[`thigh_${s}`], B[`calf_${s}`], B[`foot_${s}`], tgt, pole, 1);
    const q = wquat(B[`foot_${s}`]);
    const want = q.clone().slerp(f.q, k);
    rotateWorld(B[`foot_${s}`], want.multiply(q.invert()));
  }
  const lean = c.lean * k;
  for (const [b, part] of [['spine_01', 0.35], ['spine_02', 0.35], ['spine_03', 0.3]]) bendWorld(B[b], p.left, lean * part);
}

/** Turn the head (and a little of the neck) toward a world point. */
function lookAt(p, pt, w) {
  const B = p.bones;
  for (const [b, part] of [['neck_01', 0.35], ['head', 0.65]]) {
    const bone = B[b];
    const from = wpos(bone);
    const fwdNow = p.headFwd.clone().applyQuaternion(wquat(B.head));
    const want = pt.clone().sub(from).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(fwdNow, want);
    q.slerp(new THREE.Quaternion(), 1 - w * part);
    rotateWorld(bone, q);
  }
}

function headFrame(p) {
  // the skull's box in the bind pose: centre, size
  const box = boneBox(p.meshes.filter((m) => m.material.name === 'skin'), 'head', 0.6);
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  return { c, s, top: box.max.y };
}

export function fitOnHead(p, obj, opts = {}) {
  const { c, s, top } = headFrame(p);
  // gear is modelled for a head 0.155 m wide; scale to this head, and sit the crown on the top
  // gear is modelled for an average head; the skin box (it includes the ears) only places it
  const k = opts.scale ?? 1;
  obj.scale.setScalar(k);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(c.x, top - (opts.drop ?? 0.112) * k, c.z + (opts.fwd ?? 0.0) * k),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(opts.tilt ?? 0, 0, 0)), new THREE.Vector3(k, k, k));
  attach(p.bones.head, obj, m);
  obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return obj;
}

export class People {
  constructor({ scene, loader, facts, mode, pitch }) {
    Object.assign(this, { scene, loader, facts, mode, pitch });
    this.tex = new THREE.TextureLoader();
  }

  async load() {
    const [b, c, u] = await Promise.all(['batter', 'catcher', 'umpire'].map((n) => loadPerson(this.loader, `./assets/${n}.glb`, this.scene).catch((e) => { console.warn(n, e); return null; })));
    this.batter = b; this.catcher = c; this.umpire = u;
    const lm = this.tex.load('./assets/tex/leather_color.webp'); lm.colorSpace = THREE.SRGBColorSpace;
    const ln = this.tex.load('./assets/tex/leather_normal.webp');
    if (b) this.setupBatter(b);
    if (c) this.setupCatcher(c, lm, ln);
    if (u) this.setupUmpire(u);
  }

  /* ---------------------------------------------------------------- batter */
  setupBatter(b) {
    const lefty = this.facts.batter.bats === 'L';
    b.lefty = lefty;
    b.clip = 'swing';
    b.take = this.mode === 'take';
    fitOnHead(b, G.battingHelmet(NAVY, lefty ? -1 : 1), { drop: 0.105, fwd: 0.012, tilt: 0.06 });
    b.bat = G.bat();
    this.scene.add(b.bat);
    // grips: bottom hand near the knob. A left handed hitter's bottom hand is his right.
    b.bottom = lefty ? 'r' : 'l'; b.top = lefty ? 'l' : 'r';
    b.batRel = null;
    this.bakeBat(b);
    // place: stance at the start of the clip, the stride pointed at the pitcher
    pose(b, { [b.clip]: [0, 1] });
    const front = lefty ? 'r' : 'l';
    const f0 = wpos(b.bones[`foot_${front}`]), back0 = wpos(b.bones[`foot_${lefty ? 'l' : 'r'}`]);
    pose(b, { [b.clip]: [Math.max(0, b.tContact - 0.05), 1] });
    const f1 = wpos(b.bones[`foot_${front}`]);
    const stride = f1.clone().sub(f0); stride.y = 0;
    let dir = stride.lengthSq() > 0.01 ? stride.normalize() : f0.clone().sub(back0).setY(0).normalize();
    const ang = Math.atan2(dir.x, dir.z); // rotate so dir -> +z (toward the mound)
    b.root.rotation.y = -ang;
    b.root.updateMatrixWorld(true);
    pose(b, { [b.clip]: [0, 1] });
    const mid = wpos(b.bones[`foot_${front}`]).add(wpos(b.bones[`foot_${lefty ? 'l' : 'r'}`])).multiplyScalar(0.5);
    // the feet straddle a point 2.9 ft off the plate's centre on his side, level with the plate
    const want = P(lefty ? 2.95 : -2.95, 0.55, 0);
    b.root.position.x += want.x - mid.x; b.root.position.z += want.z - mid.z;
    b.root.updateMatrixWorld(true);
    ground(b);
  }

  /** The bat in the bottom hand's frame, sampled through the clip and smoothed (the capture has
      no bat; two wrist joints a hand apart give a noisy axis, so it is averaged over 0.2 s). Contact
      is where the smoothed barrel moves fastest. */
  bakeBat(b) {
    const clip = b.clips[b.clip], dt = 1 / 60;
    const raw = [];
    let last = null;
    for (let t = 0; t <= clip.duration + 1e-6; t += dt) {
      pose(b, { [b.clip]: [t, 1] });
      const { gb, gt, handQ } = this.grips(b);
      const sep = gb.distanceTo(gt);
      let local = last;
      if (sep < 0.3 || !last) {
        const axis = gt.clone().sub(gb).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(UP, axis);
        local = handQ.clone().invert().multiply(q);
      }
      if (last && local.dot(last) < 0) local.set(-local.x, -local.y, -local.z, -local.w);
      raw.push(local); last = local;
    }
    const W = 6;
    b.batTrack = raw.map((_, i) => {
      const acc = new THREE.Vector4();
      for (let k = -W; k <= W; k++) {
        const q = raw[Math.min(raw.length - 1, Math.max(0, i + k))], w = Math.exp(-(k * k) / (2 * 9));
        acc.x += q.x * w; acc.y += q.y * w; acc.z += q.z * w; acc.w += q.w * w;
      }
      return new THREE.Quaternion(acc.x, acc.y, acc.z, acc.w).normalize();
    });
    b.batDt = dt;
    // contact: the fastest barrel, sampled at the capture's own 30 Hz, skipping the frames where the
    // top hand lets go and the bat flips (an artifact, not a swing)
    let best = 0, bestT = clip.duration * 0.6, prev = null, prevAx = null;
    for (let t = 0.9; t < clip.duration - 0.3; t += 1 / 30) {
      pose(b, { [b.clip]: [t, 1] });
      this.poseBat(b);
      const tip = new THREE.Vector3(0, 0.75, 0).applyMatrix4(b.bat.matrixWorld);
      const ax = tip.clone().sub(b.bat.position).normalize();
      if (prev && ax.angleTo(prevAx) < 0.45) { const v = tip.distanceTo(prev) * 30; if (v > best) { best = v; bestT = t - 1 / 60; } }
      prev = tip; prevAx = ax;
    }
    b.tContact = bestT;
    b.peakBatSpeed = best;
  }

  grips(b) {
    const grip = (s) => {
      const h = wpos(b.bones[`hand_${s}`]), m = wpos(b.bones[`middle_01_${s}`]), tip = wpos(b.bones[`middle_03_${s}`]);
      const along = m.clone().sub(h).normalize();
      const palm = tip.clone().sub(m); palm.addScaledVector(along, -palm.dot(along)).normalize();
      return h.lerp(m, 0.75).addScaledVector(palm, 0.03);
    };
    return { gb: grip(b.bottom), gt: grip(b.top), handQ: wquat(b.bones[`hand_${b.bottom}`]) };
  }

  poseBat(b) {
    const { gb, handQ } = this.grips(b);
    const ct = THREE.MathUtils.clamp(b.batTime ?? b.actions[b.clip].time, 0, b.clips[b.clip].duration);
    const f = ct / b.batDt, i = Math.min(b.batTrack.length - 2, Math.floor(f));
    const local = b.batTrack[i].clone().slerp(b.batTrack[i + 1], Math.min(1, f - i));
    const q = handQ.multiply(local);
    const axis = UP.clone().applyQuaternion(q);
    b.bat.quaternion.copy(q);
    b.bat.position.copy(gb).addScaledVector(axis, -0.055);
    b.bat.updateMatrixWorld(true);
  }

  /* ---------------------------------------------------------------- catcher */
  setupCatcher(c, lm, ln) {
    const team = new THREE.Color(this.facts.pitcher.teamColors[0]);
    fitOnHead(c, G.catcherHelmet(team), { drop: 0.118, fwd: 0.0 });
    // shin guards along each calf, front toward his front (+z in the bind pose)
    for (const s of ['l', 'r']) {
      const knee = wpos(c.bones[`calf_${s}`]), ankle = wpos(c.bones[`foot_${s}`]);
      const len = knee.distanceTo(ankle);
      const gd = G.shinGuard(team, len);
      const up = knee.clone().sub(ankle).normalize();
      const fwd = new THREE.Vector3(0, 0, 1); fwd.addScaledVector(up, -fwd.dot(up)).normalize();
      const side = new THREE.Vector3().crossVectors(up, fwd);
      const m = new THREE.Matrix4().makeBasis(side, up, fwd).setPosition(ankle.clone().addScaledVector(fwd, 0.035));
      attach(c.bones[`calf_${s}`], gd, m);
    }
    // the chest protector on the upper spine, in front of the chest
    const torso = boneBox(c.meshes.filter((m) => m.material.name === 'skin'), 'spine_03', 0.5);
    const tc = torso.getCenter(new THREE.Vector3());
    const cp = G.chestProtector(team, 0.36, 0.5);
    attach(c.bones.spine_03, cp, new THREE.Matrix4().setPosition(tc.x, tc.y - 0.17, torso.max.z + 0.06));
    for (const m of c.meshes) if (m.material.name === 'hair') m.visible = false; // under the helmet
    // the mitt on his left hand, pocket toward the palm
    const hb = boneBox(c.meshes.filter((m) => m.material.name === 'skin'), 'hand_l', 0.5);
    const hc = hb.getCenter(new THREE.Vector3());
    const mitt = G.mitt(lm, ln);
    const hand = c.bones.hand_l, mid = c.bones.middle_01_l;
    const along = wpos(mid).sub(wpos(hand)).normalize();
    const palm = new THREE.Vector3(-1, 0, 0); // in the A pose bind, the left palm faces the body (-x)
    const side = new THREE.Vector3().crossVectors(along, palm).normalize();
    const basis = new THREE.Matrix4().makeBasis(side, along, palm);
    const m = new THREE.Matrix4().copy(basis).setPosition(hc.clone().addScaledVector(along, 0.05).addScaledVector(palm, 0.035));
    attach(hand, mitt, m);
    c.mitt = mitt;
    face(c, P(0.15 + 0.4 * this.aimX(), -2.55, 0));
    // a catcher's crouch: hips just above the heels, knees wide, on the balls of his feet
    c.crouch = { drop: 0.5, back: 0.02, width: 0.27, toeOut: 0.42, heel: 0.35, lean: 0.36, kneeOut: 0.9 };
    stance(c);
  }

  aimX() { return this.pitch ? this.pitch.aim.x : 0; }

  /* ---------------------------------------------------------------- umpire */
  setupUmpire(u) {
    fitOnHead(u, G.cap(0x0a0a0c), { drop: 0.07, fwd: 0.0, tilt: 0.05 });
    fitOnHead(u, G.umpireMask(), { drop: 0.12 });
    for (const m of u.meshes) if (m.material.name === 'hair') m.visible = false; // under the cap
    // the slot: between the catcher and a left handed hitter, his chin over the catcher's shoulder
    face(u, P(this.facts.batter.bats === 'L' ? 1.0 : -1.0, -5.3, 0));
    u.crouch = { drop: 0.4, back: 0.16, width: 0.36, toeOut: 0.3, heel: 0.05, lean: 0.62, kneeOut: 0.6 };
    stance(u);
  }

  bindPitch(pitch) { this.pitch = pitch; }

  update(t) {
    const pt = this.pitch;
    const b = this.batter, c = this.catcher, u = this.umpire;
    if (b) {
      const ct = t - pt.tPlate + b.tContact;
      if (!b.take) {
        // after the follow through the capture's batter walks off and drops the bat; a real hitter
        // holds his finish, so time slows to a near hold half a second after contact
        const hold = b.tContact + 0.42;
        const cw = ct < hold ? ct : hold + (1 - Math.exp(-(ct - hold) / 0.5)) * 0.18;
        b.batTime = cw;
        pose(b, { [b.clip]: [cw, 1] });
      } else {
        // the take: the same capture through his load and stride, then he holds the hands back as
        // the ball goes by and lets the bat settle toward his stance again
        const launch = b.tContact - 0.2;
        const k = smooth(clamp01((ct - launch - 0.25) / 0.9));
        pose(b, [[b.clip, Math.min(ct, launch), 1], [b.clip, 0.4 + Math.max(0, ct - launch) * 0.3, k * 0.75]]);
      }
      if (b.take) b.batTime = Math.min(ct, b.tContact - 0.2);
      this.poseBat(b);
    }
    if (c) {
      pose(c, { idle: [1.5 + t, 1] });
      crouch(c, 1);
      this.catcherArms(c, t);
      lookAt(c, this.pitch.pointAt(Math.max(0, Math.min(t - pt.tRel, pt.tCatch - pt.tRel))), 0.4);
    }
    if (u) {
      pose(u, { idle: [2.0 + t, 1] });
      this.umpireMove(u, t);
    }
  }

  catcherArms(c, t) {
    const B = c.bones;
    // the bare hand, a loose fist, resting on the outside of his right knee
    const f = c.fwd, l = c.left;
    const knee = wpos(B.calf_r);
    const tuck = knee.clone().addScaledVector(l, -0.09).addScaledVector(f, -0.05).add(new THREE.Vector3(0, 0.07, 0));
    const pole = wpos(B.lowerarm_r).addScaledVector(l, -0.6).addScaledVector(f, -0.4);
    twoBoneIK(B.upperarm_r, B.lowerarm_r, B.hand_r, tuck, pole, 1);
    this.catcherReach(c, t);
  }

  catcherReach(c, t) {
    const pt = this.pitch;
    const catchT = pt.tCatch;
    const ball = pt.catchPoint;            // where the ball meets the glove
    // the target he sets: the aimed point, carried back to his glove plane
    const aim = pt.aimGlove;
    const k0 = smooth(clamp01((t + 0.4) / 0.6));                  // sets up the target
    const k1 = smooth(clamp01((t - (catchT - 0.32)) / 0.3));     // reaches for the ball
    const give = smooth(clamp01((t - catchT) / 0.12)) * (1 - smooth(clamp01((t - catchT - 0.5) / 0.6)));
    const target = aim.clone().lerp(ball, k1);
    target.z -= give * 0.06;
    const B = c.bones;
    const pole = wpos(B.lowerarm_l).add(new THREE.Vector3(1.0, -0.6, -0.4));
    // glove face toward the ball: fingers up for high pitches, down when it is low
    const low = target.y < 0.45;
    const fwd = new THREE.Vector3(0, 0, 1), up = new THREE.Vector3(0.3, low ? -1 : 1, 0).normalize();
    const side = new THREE.Vector3().crossVectors(up, fwd).normalize();
    const want = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, up, fwd));
    // the pocket, not the wrist, goes to the ball: solve, measure the pocket, correct, solve again
    let hand = target.clone().add(new THREE.Vector3(0, -0.04, -0.08));
    const arm0 = [B.upperarm_l, B.lowerarm_l, B.hand_l].map((b) => b.quaternion.clone());
    for (let it = 0; it < 5; it++) {
      [B.upperarm_l, B.lowerarm_l, B.hand_l].forEach((b, i) => b.quaternion.copy(arm0[i]));
      B.upperarm_l.updateMatrixWorld(true);
      twoBoneIK(B.upperarm_l, B.lowerarm_l, B.hand_l, hand, pole, k0);
      const mittQ = wquat(c.mitt);
      const delta = want.clone().multiply(mittQ.invert());
      delta.slerp(new THREE.Quaternion(), 1 - k0);
      rotateWorld(B.hand_l, delta);
      const pocket = new THREE.Vector3(0, 0, 0.02).applyMatrix4(c.mitt.matrixWorld);
      c.mittErr = target.distanceTo(pocket);
      hand.add(target.clone().sub(pocket));
    }
  }

  umpireMove(u, t) {
    const pt = this.pitch, B = u.bones;
    const call = this.mode === 'take' && this.facts.pitches.take.call === 'strike';
    // he comes up out of the crouch after the catch; on a called strike he punches it out
    const up = call ? smooth(clamp01((t - pt.tCatch - 0.18) / 0.45)) : smooth(clamp01((t - pt.tCatch - 0.5) / 0.6)) * 0.35;
    crouch(u, 1 - up * 0.85);
    // hands on his knees in the crouch
    const kneeL = wpos(B.calf_l), kneeR = wpos(B.calf_r);
    const handOn = (side, knee) => {
      const tgt = knee.clone().add(new THREE.Vector3(0, 0.1, 0)).addScaledVector(u.fwd, 0.04).addScaledVector(u.left, side * -0.03);
      const pole = wpos(B[`lowerarm_${side > 0 ? 'l' : 'r'}`]).addScaledVector(u.left, side * 0.6).addScaledVector(u.fwd, -0.2);
      return [tgt, pole];
    };
    const w = 1 - up;
    const [tl, pl] = handOn(1, kneeL), [tr, pr] = handOn(-1, kneeR);
    twoBoneIK(B.upperarm_l, B.lowerarm_l, B.hand_l, tl, pl, w);
    if (call) {
      // the strike call: right arm out to his side, elbow bent, a short punch
      const k = smooth(clamp01((t - pt.tCatch - 0.42) / 0.16)) * (1 - smooth(clamp01((t - pt.tCatch - 1.4) / 0.5)));
      const sh = wpos(B.upperarm_r);
      const punch = sh.clone().addScaledVector(u.left, -0.42).addScaledVector(u.fwd, 0.18).add(new THREE.Vector3(0, 0.08 - 0.06 * k, 0));
      const pole = sh.clone().addScaledVector(u.left, -0.3).addScaledVector(u.fwd, -0.5).add(new THREE.Vector3(0, -0.4, 0));
      if (k > 0) twoBoneIK(B.upperarm_r, B.lowerarm_r, B.hand_r, tr.clone().lerp(punch, k), pole, 1);
      else twoBoneIK(B.upperarm_r, B.lowerarm_r, B.hand_r, tr, pr, w);
    } else {
      twoBoneIK(B.upperarm_r, B.lowerarm_r, B.hand_r, tr, pr, w);
    }
    lookAt(u, this.pitch.pointAt(Math.max(0, Math.min(t - pt.tRel, pt.tCatch - pt.tRel))), 0.7);
  }
}
