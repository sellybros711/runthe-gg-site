/* The batter, the catcher and the umpire: loaded, dressed, placed, and moved in time with the ball.
 *
 * Motion is the CMU capture fitted onto each body in the pipeline (pipeline/build_people.py). Here
 * it is placed and timed: the swing is slid in time so the bat arrives with the ball, the catcher's
 * glove arm reaches for the ball with two bone IK, and the umpire's crouch is the capture's stand
 * and squat blended, his strike call layered on top.
 */
import * as THREE from 'three';
import * as M from './materials.js?v=1';
import * as G from './gear3d.js?v=1';
import { wpos, wquat, boneBox, attach, twoBoneIK, bendWorld, rotateWorld } from './rig.js?v=1';
import { P, FT, smooth, clamp01 } from './units.js?v=1';
import { assetUrl } from './load.js?v=1';
import { planFeet, plantFeet, reach, clavicles, deltoids, chestTo, yawOf, footGeom } from './motion.js?v=4';

const UP = new THREE.Vector3(0, 1, 0);
const NAVY = 0x0d1a33, ROYAL = 0x174a8c;

export function loadPerson(g, scene) {
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

/** Lay one clip's rotations on a set of bones only, at another time (the rest stays as posed). */
const LOWER = new Set(['pelvis', 'thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r']);
function sampleRot(p, clip, time, set) {
  const a = p.actions[clip];
  const tt = THREE.MathUtils.clamp(time, 0, a.clip.duration - 1e-3);
  for (const s of p.samplers[clip]) {
    if (!s.q || !set.has(s.bone.name)) continue;
    const v = s.interp.evaluate(tt);
    s.bone.quaternion.set(v[0], v[1], v[2], v[3]);
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
    const flat = yaw.clone().multiply(q0);
    const q = pitch.multiply(yaw).multiply(q0);
    const pos = a.add(new THREE.Vector3(0, c.heel * 0.06, 0));
    // the ball of the foot is the spot that never moves; the heel lifts and settles around it
    const ball = pos.clone().add(footGeom(p)[s].off.clone().applyQuaternion(q));
    p.feet[s] = { pos, q, flat, ball };
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
    // planted on the ball of the foot whether he is crouched or rising: the heel comes down as he
    // stands, the foot never slides
    const f = p.feet[s];
    const want = f.flat.clone().slerp(f.q, k);
    const tgt = f.ball.clone().sub(p.footGeom[s].off.clone().applyQuaternion(want));
    const pole = wpos(B[`calf_${s}`]).add(new THREE.Vector3(sign * c.kneeOut, 0, 1.2));
    twoBoneIK(B[`thigh_${s}`], B[`calf_${s}`], B[`foot_${s}`], tgt, pole, 1);
    const q = wquat(B[`foot_${s}`]);
    rotateWorld(B[`foot_${s}`], want.multiply(q.invert()));
  }
  const lean = c.lean * k;
  for (const [b, part] of [['spine_01', 0.35], ['spine_02', 0.35], ['spine_03', 0.3]]) bendWorld(B[b], p.left, lean * part);
}

/** Turn the head (and a little of the neck) toward a world point, never more than a neck can:
    each joint adds at most its share of 30 degrees on top of the capture. */
function lookAt(p, pt, w) {
  const B = p.bones;
  for (const [b, part, max] of [['neck_01', 0.4, 12], ['head', 0.6, 15]]) {
    const bone = B[b];
    const from = wpos(bone);
    const fwdNow = p.headFwd.clone().applyQuaternion(wquat(B.head));
    const want = pt.clone().sub(from).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(fwdNow, want);
    q.slerp(new THREE.Quaternion(), 1 - w * part);
    const ang = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
    const lim = THREE.MathUtils.degToRad(max);
    if (ang > lim) q.slerp(new THREE.Quaternion(), 1 - lim / ang);
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
  constructor({ scene, facts, mode, pitch }) {
    Object.assign(this, { scene, facts, mode, pitch });
    this.tex = new THREE.TextureLoader();
  }

  /** Dress and place the people from their parsed glTF (load.js fetched and parsed them). */
  setup(gltfs) {
    const [b, c, u] = ['batter', 'catcher', 'umpire'].map((n) => (gltfs[n] ? loadPerson(gltfs[n], this.scene) : null));
    this.batter = b; this.catcher = c; this.umpire = u;
    const lm = this.tex.load(assetUrl('tex/leather_color.webp')); lm.colorSpace = THREE.SRGBColorSpace;
    const ln = this.tex.load(assetUrl('tex/leather_normal.webp'));
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
    this.setupChain(b);
  }

  /* The swing as a kinetic chain. The capture's hips and shoulders turn almost together (its hips
     peak 33 ms before the shoulders, 24 degrees apart at foot strike), and the actor's pelvis
     travels 66 cm with both feet sliding under it. A big league swing strides, lands, and fires
     the hips first: at foot strike the shoulders are still closed 30 to 50 degrees against hips
     that have begun to open, and the shoulders catch up only as the bat comes through.
       lead   the hips and legs run ahead of the trunk (sampled up to 20 ms later in the capture),
              from the leg lift to just after contact
       coil   the shoulders turn back against the hips through the stride and let go between foot
              strike and contact (the chest is put back exactly at contact, so the bat path is the
              capture's where it meets the ball)
       trim   the pelvis travels 60% of the actor's distance toward the mound
     The feet are then locked to the ground where they land (motion.js). */
  setupChain(b) {
    const clip = b.clips[b.clip], front = b.lefty ? 'r' : 'l';
    const hs = [];
    for (let t = 0; t <= b.tContact + 0.05; t += 1 / 30) { pose(b, { [b.clip]: [t, 1] }); hs.push([t, wpos(b.bones[`foot_${front}`]).y]); }
    let top = 0; for (let i = 0; i < hs.length; i++) if (hs[i][1] > hs[top][1]) top = i;
    const low = Math.min(...hs.slice(top).map((h) => h[1]));
    let k = top; while (k < hs.length - 1 && hs[k][1] > low + 0.01) k++;
    let lift = top; while (lift > 0 && hs[lift][1] > hs[0][1] + 0.01) lift--;
    pose(b, { [b.clip]: [0, 1] });
    const y0 = yawOf(b, 'thigh_r', 'thigh_l');
    const p0 = wpos(b.bones.pelvis);
    pose(b, { [b.clip]: [b.tContact + 0.3, 1] });
    let dy = yawOf(b, 'thigh_r', 'thigh_l') - y0; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
    const tTop = hs[top][0], tStrike = hs[k][0], tC = b.tContact;
    const ramp = (x, a, c) => smooth(clamp01((x - a) / Math.max(1e-3, c - a)));
    b.chain = {
      tTop, tStrike, dirn: Math.sign(dy) || 1, p0, trim: 0.6,
      lead: (t) => 0.02 * ramp(t, tTop - 0.25, tStrike - 0.05) * (1 - ramp(t, tC, tC + 0.35)),
      coil: (t) => THREE.MathUtils.degToRad(10) * ramp(t, tTop - 0.45, tStrike) * (1 - ramp(t, tStrike, tC - 0.03)),
    };
    // the feet: where they are down in this motion, for the swing (by capture time) and the take
    // (by the clock relative to the plate)
    // the back foot never leaves the ground: it pivots on its ball as the hips open. The front
    // foot lifts, lands on its ball and settles flat, and stays
    const back = b.lefty ? 'l' : 'r', tLift = hs[lift][0];
    // after contact the front foot spins open on its heel (35 degrees, the way the hips open)
    const open = { at: tC - 0.02, deg: 35, dir: Math.sign(dy) || 1 };
    const feet = (t0, t1, swing) => ({ [back]: [[t0, t1, 'pivot']], [front]: [[t0, tLift, 'land'], [tStrike, t1, 'flat', swing ? open : null]] });
    if (!b.take) b.feetSwing = planFeet(b, (t) => this.swingBase(b, t), 0, clip.duration, feet(0, clip.duration, true));
    else { const ct0 = -this.pitch.tPlate + b.tContact - 0.1; b.feetTake = planFeet(b, (t) => this.takeBase(b, t), ct0, ct0 + 3.8, feet(ct0, ct0 + 3.8, false)); }
  }

  /** The swing at capture time t, before the feet are planted. */
  swingBase(b, t) {
    pose(b, { [b.clip]: [t, 1] });
    const ch = b.chain;
    if (!ch) return;
    const chest = wquat(b.bones.spine_03);
    const lead = ch.lead(t);
    if (lead > 1e-4) sampleRot(b, b.clip, t + lead, LOWER);
    const coil = ch.coil(t);
    chestTo(b, new THREE.Quaternion().setFromAxisAngle(UP, -ch.dirn * coil).multiply(chest), UP);
    this.trimPelvis(b);
  }

  /** The take at clock time ct (relative to the swing's contact), before the feet are planted:
      the same capture through his load and stride, then he holds the hands back as the ball goes
      by and lets the bat settle toward his stance again. */
  takeBase(b, ct) {
    const launch = b.tContact - 0.2;
    const k = smooth(clamp01((ct - launch - 0.25) / 0.9));
    pose(b, [[b.clip, Math.min(ct, launch), 1], [b.clip, 0.4 + Math.max(0, ct - launch) * 0.3, k * 0.75]]);
    const ch = b.chain;
    if (!ch) return;
    const coil = ch.coil(Math.min(ct, launch)) * (1 - k);
    if (coil > 1e-4) chestTo(b, new THREE.Quaternion().setFromAxisAngle(UP, -ch.dirn * coil).multiply(wquat(b.bones.spine_03)), UP);
    this.trimPelvis(b);
  }

  trimPelvis(b) {
    const ch = b.chain, pel = b.bones.pelvis;
    const w = wpos(pel);
    w.x = ch.p0.x + (w.x - ch.p0.x) * ch.trim; w.z = ch.p0.z + (w.z - ch.p0.z) * ch.trim;
    pel.position.copy(pel.parent.worldToLocal(w));
    pel.updateMatrixWorld(true);
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
    // catcher's gear: charcoal, as most big league gear is; the team colour stays off it (no marks)
    const team = new THREE.Color(0x1d1f22);
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
    const cp = G.chestProtector(team, 0.33, 0.47);
    attach(c.bones.spine_03, cp, new THREE.Matrix4().setPosition(tc.x, tc.y - 0.17, torso.max.z + 0.07));
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
    c.mittBindQ = mitt.quaternion.clone();
    face(c, P(0.1 + 0.4 * this.aimX(), -2.85, 0));
    // a catcher's crouch: hips just above the heels, knees wide, on the balls of his feet
    c.crouch = { drop: 0.5, back: 0.02, width: 0.27, toeOut: 0.42, heel: 0.35, lean: 0.18, kneeOut: 0.9 };
    stance(c);
  }

  aimX() { return this.pitch ? this.pitch.aim.x : 0; }

  /* ---------------------------------------------------------------- umpire */
  setupUmpire(u) {
    fitOnHead(u, G.cap(0x0a0a0c), { drop: 0.07, fwd: 0.0, tilt: 0.05 });
    fitOnHead(u, G.umpireMask(), { drop: 0.12 });
    for (const m of u.meshes) if (m.material.name === 'hair') m.visible = false; // under the cap
    // the slot: between the catcher and a left handed hitter, his chin over the catcher's shoulder
    // directly behind the catcher, his head over the catcher's inside shoulder
    face(u, P(this.facts.batter.bats === 'L' ? 0.55 : -0.55, -5.0, 0));
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
        this.swingBase(b, cw);
        reach(b, b.feetSwing, cw);
        plantFeet(b, b.feetSwing, cw);
      } else {
        this.takeBase(b, ct);
        reach(b, b.feetTake, ct);
        plantFeet(b, b.feetTake, ct);
        b.batTime = Math.min(ct, b.tContact - 0.2);
      }
      clavicles(b);
      deltoids(b);
      this.poseBat(b);
    }
    if (c) {
      pose(c, { idle: [1.5 + t, 1] });
      crouch(c, 1);
      this.catcherArms(c, t);
      lookAt(c, this.pitch.pointAt(Math.max(0, Math.min(t - pt.tRel, pt.tCatch - pt.tRel))), 0.4);
      clavicles(c);
      deltoids(c);
    }
    if (u) {
      pose(u, { idle: [2.0 + t, 1] });
      this.umpireMove(u, t);
      clavicles(u);
      deltoids(u);
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
    // the elbow points down and a little out, as a catcher's does: never backward
    const pole = wpos(B.lowerarm_l).add(new THREE.Vector3(0.35, -1.0, -0.25));
    // glove face toward the ball: fingers up for high pitches, down when it is low
    const low = target.y < 0.45;
    const fwd = new THREE.Vector3(0, 0, 1), up = new THREE.Vector3(0.3, low ? -1 : 1, 0).normalize();
    const side = new THREE.Vector3().crossVectors(up, fwd).normalize();
    const want = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, up, fwd));
    // the pocket, not the wrist, goes to the ball: solve, measure the pocket, correct, solve again.
    // The wrist turns only part of the way toward the glove's facing (a wrist has a range); the
    // mitt, rigid on the hand, turns the rest, so the skin of the wrist is never wrung.
    let hand = target.clone().add(new THREE.Vector3(0, -0.04, -0.08));
    const arm0 = [B.upperarm_l, B.lowerarm_l, B.hand_l].map((b) => b.quaternion.clone());
    for (let it = 0; it < 5; it++) {
      [B.upperarm_l, B.lowerarm_l, B.hand_l].forEach((b, i) => b.quaternion.copy(arm0[i]));
      B.upperarm_l.updateMatrixWorld(true);
      twoBoneIK(B.upperarm_l, B.lowerarm_l, B.hand_l, hand, pole, k0);
      c.mitt.quaternion.copy(c.mittBindQ);
      c.mitt.updateMatrixWorld(true);
      const delta = want.clone().multiply(wquat(c.mitt).invert());
      delta.slerp(new THREE.Quaternion(), 1 - k0);
      rotateWorld(B.hand_l, delta.clone().slerp(new THREE.Quaternion(), 0.65));
      // the remainder on the mitt itself, in the hand's frame
      const hq = wquat(B.hand_l);
      const wantMitt = delta.multiply(wquat(c.mitt));
      c.mitt.quaternion.copy(hq.invert().multiply(wantMitt));
      c.mitt.updateMatrixWorld(true);
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
