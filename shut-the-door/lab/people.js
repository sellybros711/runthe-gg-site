/* The batter, the catcher and the umpire: loaded, dressed, placed, and moved in time with the ball.
 *
 * Motion is the CMU capture fitted onto each body in the pipeline (pipeline/build_people.py). Here
 * it is placed and timed: the swing is slid in time so the bat arrives with the ball, the catcher's
 * glove arm reaches for the ball with two bone IK, and the umpire's crouch is the capture's stand
 * and squat blended, his strike call layered on top.
 */
import * as THREE from 'three';
import * as M from './materials.js?v=3';
import * as G from './gear3d.js?v=2';
import { wpos, wquat, boneBox, attach, twoBoneIK, bendWorld, rotateWorld } from './rig.js?v=1';
import { P, FT, smooth, clamp01 } from './units.js?v=1';
import { assetUrl } from './load.js?v=3';
import { planFeet, plantFeet, reach, clavicles, deltoids, chestTo, yawOf, footGeom } from './motion.js?v=4';

const UP = new THREE.Vector3(0, 1, 0);
const NAVY = 0x0d1a33, ROYAL = 0x174a8c;

const UNIFORM = new Set(['uniform', 'socks', 'gloves', 'undershirt', 'belt', 'number']);

/* Team kits. Our side (the catcher) wears the closer's club colours from the pack; the hitters wear
   a generic palette picked per pack (two colours that read as a club, no club's marks or names).
   Home whites, road greys: the home side is the pack's (usHome). */
const WHITE = '#f2f1ec', GREY = '#a3a6aa';
const PALETTES = [['#0c2340', '#bf0d3e'], ['#1d4d2b', '#d4a017'], ['#5c1a2b', '#9fa3a8'], ['#13274f', '#e35205'],
  ['#111111', '#c4ced4'], ['#4b2c6f', '#e8b923'], ['#8a1c1c', '#0c2340'], ['#00594f', '#e7e3d4']];
const hashStr = (str) => { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
export function kitFor(facts, side) {
  const ours = facts.pitcher.teamColors || ['#0c2340', '#ffffff'];
  const usHome = !!(facts.situation && facts.situation.usHome);
  let cols;
  if (side === 'us') cols = ours;
  else {
    const h = hashStr(facts.scenarioId || facts.pitcher.name);
    const dist = (a, b) => new THREE.Color(a).getHSL({}).h - new THREE.Color(b).getHSL({}).h;
    cols = PALETTES[h % PALETTES.length];
    for (let k = 1; k < PALETTES.length && Math.abs(dist(cols[0], ours[0])) < 0.06; k++) cols = PALETTES[(h + k) % PALETTES.length];
  }
  const home = side === 'us' ? usHome : !usHome;
  // the darker of the two club colours trims the uniform (a white secondary would vanish on whites)
  const lum = (c) => new THREE.Color(c).getHSL({}).l;
  const [dark, light] = lum(cols[0]) <= lum(cols[1]) ? [cols[0], cols[1]] : [cols[1], cols[0]];
  const C = (x) => new THREE.Color(x);
  return { base: C(home ? WHITE : GREY), trim: C(dark), stripe: C(dark), sock: C(dark), slot: C(WHITE), number: C(dark),
    undershirt: C(dark), belt: C('#111111'), glove: C(lum(light) > 0.85 ? '#f2f2f2' : light), gloveAccent: C(dark), home };
}

/** Put a kit on a person: the uniform's trim mask coloured, the number drawn on the back. */
export function dress(p, kit, numberText, weave) {
  p.kit = kit;
  for (const o of p.meshes) {
    const part = o.userData.part;
    if (!part) continue;
    const src = o.userData.src;
    if (part === 'uniform') o.material = M.uniform(src, { base: kit.base, trim: kit.trim, stripe: kit.stripe, slot: kit.base }, { weave });
    else if (part === 'number') { o.material = M.numberMaterial(numberText, kit.number, kit.base, src); o.visible = !!numberText; }
    else if (part === 'socks') o.material = M.uniform(src, { base: kit.sock, trim: kit.sock, stripe: kit.sock, slot: kit.slot }, { weave });
    else if (part === 'gloves') o.material = M.uniform(src, { base: kit.glove, trim: kit.glove, stripe: kit.glove, slot: kit.gloveAccent }, { roughness: 0.55 });
    else if (part === 'undershirt') o.material = M.plain('undershirt', kit.undershirt, { roughness: 0.7 });
    else if (part === 'belt') o.material = M.plain('belt', kit.belt, { roughness: 0.35, sheen: 0, clearcoat: 0.4 });
    o.material.name = part;
  }
}

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
      else if (n.includes('shoes')) o.material = new THREE.MeshStandardMaterial({ map: s.map, normalMap: s.normalMap, roughness: 0.45, color: 0x2a2a2a });
      else if (UNIFORM.has(n)) { o.material = M.plain(n, 0x808080); o.userData.src = s; o.userData.part = n; }
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

/** The model's own standing height: the top of the skin over the soles, in the bind pose. */
function modelHeight(p) {
  const skin = p.meshes.find((m) => m.material.name === 'skin');
  if (!skin) return 0;
  const saved = p.bones && Object.values(p.bones).map((b) => [b, b.position.clone(), b.quaternion.clone()]);
  for (const [b, pos, q] of p.bind) { b.position.copy(pos); b.quaternion.copy(q); }
  p.root.updateMatrixWorld(true);
  const v = new THREE.Vector3(); let top = -Infinity, bot = Infinity;
  const n = skin.geometry.attributes.position.count;
  for (let i = 0; i < n; i += 3) { skin.getVertexPosition(i, v).applyMatrix4(skin.matrixWorld); top = Math.max(top, v.y); bot = Math.min(bot, v.y); }
  for (const [b, pos, q] of saved) { b.position.copy(pos); b.quaternion.copy(q); }
  p.root.updateMatrixWorld(true);
  return (top - bot) / p.root.scale.y;
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
    a.x = pel.x + sign * c.width * p.root.scale.x; a.z = pel.z + 0.02;
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
  // the crouch's distances were set on the model at its own size: they scale with the body
  const sc = p.root.scale.y;
  w.y -= c.drop * sc * k; w.z -= c.back * sc * k;
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

/** The block: the crouch blended toward knees on the ground, up on his toes, chest over the ball.
    Both stances (p.feetN, p.feetB) are worked out once at setup. */
const BLOCK = { drop: 0.7, back: -0.1, heel: 1.0, lean: 0.55, kneeOut: 0.55 };   // same width and turn: his feet stay put
function blockCrouch(p, k) {
  const c0 = p.crouch, f0 = p.feet;
  p.crouch = Object.fromEntries(Object.keys(c0).map((n) => [n, c0[n] + ((BLOCK[n] ?? c0[n]) - c0[n]) * k]));
  p.feet = {};
  for (const s of ['l', 'r']) {
    const a = p.feetN[s], b = p.feetB[s];
    p.feet[s] = { pos: a.pos.clone().lerp(b.pos, k), q: a.q.clone().slerp(b.q, k), flat: a.flat.clone().slerp(b.flat, k), ball: a.ball.clone().lerp(b.ball, k) };
  }
  crouch(p, 1);
  p.crouch = c0; p.feet = f0;
}

/** Turn the head (and a little of the neck) toward a world point, never more than a neck can:
    each joint adds at most its share of 30 degrees on top of the capture. */
/** Keep a joint inside its range: its swing from the bind pose (about anything but its own length)
    is scaled back to max degrees. The same limits check-deform.mjs judges. */
function limitSwing(p, name, maxDeg) {
  const bone = p.bones[name];
  if (!p.bindQ) p.bindQ = new Map(p.bind.map(([b, , q]) => [b, q]));
  const q0 = p.bindQ.get(bone);
  const rel = q0.clone().invert().multiply(bone.quaternion);
  const child = bone.children.find((c) => c.isBone);
  const ax = child ? child.position.clone().normalize() : new THREE.Vector3(0, 1, 0);
  const pr = ax.clone().multiplyScalar(rel.x * ax.x + rel.y * ax.y + rel.z * ax.z);
  const tw = new THREE.Quaternion(pr.x, pr.y, pr.z, rel.w).normalize();
  const sw = rel.clone().multiply(tw.clone().invert());
  const ang = 2 * Math.acos(Math.min(1, Math.abs(sw.w)));
  const lim = THREE.MathUtils.degToRad(maxDeg);
  if (ang <= lim) return;
  const swc = new THREE.Quaternion().slerp(sw.w < 0 ? new THREE.Quaternion(-sw.x, -sw.y, -sw.z, -sw.w) : sw, lim / ang);
  bone.quaternion.copy(q0).multiply(swc).multiply(tw);
  bone.updateMatrixWorld(true);
}

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
  // however far the ball has gone (back over his head into the screen), the neck stays in range
  limitSwing(p, 'neck_01', 36);
  limitSwing(p, 'head', 27);
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
  constructor({ scene, facts, mode, pitch, play, m }) {
    Object.assign(this, { scene, facts, mode, pitch, play, m: m || { batter: mode, ball: 'glove', contactShift: 0 } });
    this.tex = new THREE.TextureLoader();
  }

  /** Dress and place the people from their parsed glTF (load.js fetched and parsed them). */
  setup(gltfs) {
    const [b, c, u] = ['batter', 'catcher', 'umpire'].map((n) => (gltfs[n] ? loadPerson(gltfs[n], this.scene) : null));
    this.batter = b; this.catcher = c; this.umpire = u;
    const lm = this.tex.load(assetUrl('tex/leather_color.webp')); lm.colorSpace = THREE.SRGBColorSpace;
    const ln = this.tex.load(assetUrl('tex/leather_normal.webp'));
    // the knit, tiled by the uniform shader
    const knit = this.tex.load(assetUrl('tex/knit_color.webp')); knit.wrapS = knit.wrapT = THREE.RepeatWrapping; knit.colorSpace = THREE.NoColorSpace;
    const U = this.facts.uniform || {};
    if (b) dress(b, kitFor(this.facts, 'them'), this.facts.batter.number ?? '24', knit);
    if (c) dress(c, kitFor(this.facts, 'us'), '8', knit);
    if (b) this.look(b, this.facts.batter);
    if (b) this.setupBatter(b);
    if (c) this.setupCatcher(c, lm, ln);
    if (u) this.setupUmpire(u);
  }

  /* ---------------------------------------------------------------- batter */
  /** His look from the pack's facts (a hash of his id: skin tone and facial hair, never a
      likeness): the darker skin map mixed in, the beard mask darkened. */
  look(p, f) {
    const skin = p.meshes.find((m) => m.material.name === 'skin');
    if (!skin || !skin.material.userData.u) return;
    const u = skin.material.userData.u;
    if (f.tone > 0.01) { const d = this.tex.load(assetUrl('tex/skin_dark.webp')); d.colorSpace = THREE.SRGBColorSpace; d.flipY = false; u.uDark.value = d; u.uTone.value = f.tone; }
    if (f.beard > 0) { const bm = this.tex.load(assetUrl('tex/beard_mask.webp')); bm.colorSpace = THREE.NoColorSpace; bm.flipY = false; u.uBeard.value = bm; u.uBeardAmt.value = f.beard; }
  }

  /** His real height (root scale against the model's own) and build (the heavy and lean shape
      keys, from his body mass index against the model's): MLB Stats API figures, pipeline/fetch_bio. */
  build(p, heightIn, weightLb, modelHeightM = modelHeight(p)) {
    if (!heightIn || !modelHeightM) return;
    const hm = heightIn * 0.0254;
    p.root.scale.setScalar(hm / modelHeightM);
    p.root.updateMatrixWorld(true);
    const bmi = weightLb ? 703 * weightLb / (heightIn * heightIn) : 26;
    const heavy = clamp01((bmi - 27) / 6), lean = clamp01((25.5 - bmi) / 3);
    for (const m of p.meshes) {
      const d = m.morphTargetDictionary;
      if (!d) continue;
      if (d.heavy !== undefined) m.morphTargetInfluences[d.heavy] = heavy;
      if (d.lean !== undefined) m.morphTargetInfluences[d.lean] = lean;
    }
    p.bmi = bmi;
  }

  setupBatter(b) {
    const U = this.facts.uniform || {};
    this.build(b, this.facts.batter.heightIn ?? 72, this.facts.batter.weightLb ?? 200);
    const lefty = this.facts.batter.bats === 'L';
    b.lefty = lefty;
    b.clip = 'swing';
    b.take = this.mode === 'take';
    b.motion = this.m.batter;              // swing, take, check or hbp
    const la = this.play && this.play.inPlay && this.play.inPlay.la;
    b.batTilt = la == null ? 0 : THREE.MathUtils.clamp((la - 12) / 30, -1, 1) * 9;
    // the helmet in his club's colour; the jaw guard where the batter's appearance says he wears one
    for (const m of b.meshes) if (m.material.name === 'hair') m.visible = false; // under the helmet
    fitOnHead(b, G.battingHelmet(b.kit ? b.kit.trim : NAVY, lefty ? -1 : 1, { jaw: !!this.facts.batter.jawGuard }), { drop: 0.105, fwd: 0.012, tilt: 0.06 });
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
    // a check swing lets the bat start (the hands come through, the barrel stays back), then holds
    const check = b.motion === 'check';
    const launch = b.tContact - (check ? 0.075 : 0.2);
    const k = smooth(clamp01((ct - launch - (check ? 0.12 : 0.25)) / (check ? 0.6 : 0.9)));
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
    // the bat's plane through contact follows the ball's launch: a little under it for a fly ball,
    // on top of it for a grounder (b.batTilt degrees at contact, easing in and out over 0.15 s)
    if (b.batTilt) {
      const w = Math.exp(-Math.pow((ct - b.tContact) / 0.09, 2));
      const ax = UP.clone().applyQuaternion(q), across = new THREE.Vector3().crossVectors(ax, UP);
      if (across.lengthSq() > 1e-6) q.premultiply(new THREE.Quaternion().setFromAxisAngle(across.normalize(), THREE.MathUtils.degToRad(b.batTilt) * w));
    }
    const axis = UP.clone().applyQuaternion(q);
    b.bat.quaternion.copy(q);
    b.bat.position.copy(gb).addScaledVector(axis, -0.055);
    b.bat.updateMatrixWorld(true);
  }

  /* ---------------------------------------------------------------- catcher */
  setupCatcher(c, lm, ln) {
    // a generic catcher and umpire: big league average builds (no one real), 6 ft 0 and 6 ft 1
    this.build(c, 72, 210);
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
    attach(c.bones.spine_03, cp, new THREE.Matrix4().setPosition(tc.x, tc.y - 0.17, torso.max.z + 0.088));   // out over the jersey
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
    // the block's stance, for a ball in the dirt
    c.feetN = c.feet;
    const c0 = c.crouch;
    c.crouch = { ...c0, ...BLOCK }; stance(c); c.feetB = c.feet;
    c.crouch = c0; c.feet = c.feetN;
  }

  aimX() { return this.pitch ? this.pitch.aim.x : 0; }

  /* ---------------------------------------------------------------- umpire */
  setupUmpire(u) {
    this.build(u, 73, 225);
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
      // met early to pull it (contactShift < 0), late to go the other way
      const ct = t - (pt.tPlate + (b.take ? 0 : this.m.contactShift)) + b.tContact;
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
        if (b.motion === 'hbp') this.flinch(b, t);
        reach(b, b.feetTake, ct);
        plantFeet(b, b.feetTake, ct);
        b.batTime = Math.min(ct, b.tContact - (b.motion === 'check' ? 0.075 : 0.2));
      }
      clavicles(b);
      deltoids(b);
      this.poseBat(b);
    }
    if (c) {
      pose(c, { idle: [1.5 + t, 1] });
      const cm = this.m.catcher;
      if (cm === 'block' && pt.bounce) {
        // a ball in the dirt: he drops to his knees, squares up and smothers it
        const k = smooth(clamp01((t - (pt.tRel + pt.bounce.tb) + 0.22) / 0.2));
        blockCrouch(c, k);
        this.catcherArms(c, t);
        if (k > 0) this.blockArms(c, k);
      } else {
        const contact = pt.after ? pt.tRel + pt.after.t0 : Infinity;
        const k = cm === 'rise' ? smooth(clamp01((t - contact - 0.2) / 0.5)) : 0;
        crouch(c, 1 - 0.5 * k);
        this.catcherArms(c, t);
      }
      lookAt(c, this.pitch.ball.visible ? this.pitch.ball.position.clone() : this.pitch.pointAt(Math.max(0, Math.min(t - pt.tRel, pt.tCatch - pt.tRel))), 0.4);
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
    // a ball met by the bat or the batter never reaches him: the reach stops at contact and eases off
    const missed = pt.after && t > pt.tRel + pt.after.t0 ? smooth(clamp01((t - pt.tRel - pt.after.t0) / 0.35)) : 0;
    const catchT = pt.after ? Math.min(pt.tCatch, pt.tRel + pt.after.t0 + 0.05) : pt.tCatch;
    const ball = pt.catchPoint.clone().lerp(pt.aimGlove, missed);   // where the ball meets the glove
    // the target he sets: the aimed point, carried back to his glove plane
    const aim = pt.aimGlove;
    const k0 = smooth(clamp01((t + 0.4) / 0.6));                  // sets up the target
    const k1 = smooth(clamp01((t - (catchT - 0.32)) / 0.3));     // reaches for the ball
    const give = pt.after ? 0 : smooth(clamp01((t - catchT) / 0.12)) * (1 - smooth(clamp01((t - catchT - 0.5) / 0.6)));
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

  /** In the block both hands go down between his knees, the mitt's pocket to the ball. */
  blockArms(c, k) {
    const B = c.bones, home = c.home.clone();
    const sc = c.root.scale.y;
    const glove = home.clone().addScaledVector(c.fwd, 0.42 * sc).add(new THREE.Vector3(0, 0.16 * sc, 0));
    const bare = glove.clone().addScaledVector(c.fwd, -0.06).addScaledVector(c.left, -0.05);
    for (const [s, tgt] of [['l', glove], ['r', bare]]) {
      const pole = wpos(B[`lowerarm_${s}`]).addScaledVector(c.left, (s === 'l' ? 1 : -1) * 0.5).add(new THREE.Vector3(0, -0.3, 0));
      twoBoneIK(B[`upperarm_${s}`], B[`lowerarm_${s}`], B[`hand_${s}`], wpos(B[`hand_${s}`]).lerp(tgt, k), pole, 1);
    }
  }

  /** The ball's path after the plate, once the batter stands where he stands: off the bat at the
      swing's contact, or off his body for a hit by pitch. */
  wireBall() {
    const pt = this.pitch, m = this.m, b = this.batter;
    if (!pt || !b) return;
    if (m.batter === 'swing' && ['play', 'back', 'pulled'].includes(m.ball)) {
      pt.setAfter(m.ball, pt.f.T + m.contactShift, { inPlay: this.play && this.play.inPlay, lefty: b.lefty });
    } else if (m.ball === 'hbp') {
      // where his hip is, in the catcher's view feet the flight uses
      pose(b, { [b.clip]: [Math.max(0, b.tContact - 0.2), 1] });
      const hip = wpos(b.bones.pelvis);
      const hipY = hip.z / FT;
      const tHit = Math.min(pt.f.T * 1.08, pt.timeAtY(hipY + 0.3));
      pt.setAfter('hbp', tHit, { lefty: b.lefty });
    }
  }

  umpireMove(u, t) {
    const pt = this.pitch, B = u.bones, sig = this.m.ump;
    // he comes up out of the crouch after the catch; on a strike he punches it out, on a foul both
    // arms go up, on a hit batsman he sends him to first
    const after = pt.after ? pt.tRel + pt.after.t0 : pt.tCatch;
    const up = sig === 'strike' ? smooth(clamp01((t - pt.tCatch - 0.18) / 0.45))
      : sig ? smooth(clamp01((t - after - 0.25) / 0.45))
        : smooth(clamp01((t - pt.tCatch - 0.5) / 0.6)) * 0.35;
    crouch(u, 1 - up * 0.85);
    const kneeL = wpos(B.calf_l), kneeR = wpos(B.calf_r);
    const handOn = (side, knee) => {
      const tgt = knee.clone().add(new THREE.Vector3(0, 0.1, 0)).addScaledVector(u.fwd, 0.04).addScaledVector(u.left, side * -0.03);
      const pole = wpos(B[`lowerarm_${side > 0 ? 'l' : 'r'}`]).addScaledVector(u.left, side * 0.6).addScaledVector(u.fwd, -0.2);
      return [tgt, pole];
    };
    const w = 1 - up;
    const [tl, pl] = handOn(1, kneeL), [tr, pr] = handOn(-1, kneeR);
    const shL = wpos(B.upperarm_l), shR = wpos(B.upperarm_r);
    const sc = u.root.scale.y;
    if (sig === 'strike') {
      // the strike call: right arm out to his side, elbow bent, a short punch
      twoBoneIK(B.upperarm_l, B.lowerarm_l, B.hand_l, tl, pl, w);
      const k = smooth(clamp01((t - pt.tCatch - 0.42) / 0.16)) * (1 - smooth(clamp01((t - pt.tCatch - 1.4) / 0.5)));
      const punch = shR.clone().addScaledVector(u.left, -0.42 * sc).addScaledVector(u.fwd, 0.18 * sc).add(new THREE.Vector3(0, (0.08 - 0.06 * k) * sc, 0));
      const pole = shR.clone().addScaledVector(u.left, -0.3).addScaledVector(u.fwd, -0.5).add(new THREE.Vector3(0, -0.4, 0));
      if (k > 0) twoBoneIK(B.upperarm_r, B.lowerarm_r, B.hand_r, tr.clone().lerp(punch, k), pole, 1);
      else twoBoneIK(B.upperarm_r, B.lowerarm_r, B.hand_r, tr, pr, w);
    } else if (sig === 'foul') {
      // foul ball: he stands, then both hands go up and out in a wide V, a little over his head.
      // The hands come off his knees as he rises; the arms lift from where they hang, out to the
      // side on an arc (a straight line passed through the shoulder and folded the elbow)
      const k = smooth(clamp01((t - after - 0.6) / 0.3)) * (1 - smooth(clamp01((t - after - 2.6) / 0.6)));   // held to the end of the play
      for (const [s, sh, tgt0, pole0] of [['l', shL, tl, pl], ['r', shR, tr, pr]]) {
        const side = s === 'l' ? 1 : -1;
        if (w > 0) twoBoneIK(B[`upperarm_${s}`], B[`lowerarm_${s}`], B[`hand_${s}`], tgt0, pole0, w);
        // standing, his arms hang loose at his sides (the capture's idle arms carry a bent elbow)
        const hang = sh.clone().add(new THREE.Vector3(0, -0.58 * sc, 0)).addScaledVector(u.left, side * 0.1 * sc).addScaledVector(u.fwd, 0.06 * sc);
        const hangPole = sh.clone().add(new THREE.Vector3(0, -0.3, 0)).addScaledVector(u.fwd, -0.5);
        if (up * (1 - k) > 0) twoBoneIK(B[`upperarm_${s}`], B[`lowerarm_${s}`], B[`hand_${s}`], hang, hangPole, up * (1 - k));
        if (k <= 0) continue;
        const from = wpos(B[`hand_${s}`]);
        const hi = sh.clone().addScaledVector(u.left, side * 0.32 * sc).add(new THREE.Vector3(0, 0.34 * sc, 0)).addScaledVector(u.fwd, 0.2 * sc);
        const mid = sh.clone().addScaledVector(u.left, side * 0.6 * sc).addScaledVector(u.fwd, 0.2 * sc);
        const arc = from.clone().multiplyScalar((1 - k) * (1 - k)).addScaledVector(mid, 2 * k * (1 - k)).addScaledVector(hi, k * k);
        const pole = sh.clone().addScaledVector(u.left, side * 0.6).add(new THREE.Vector3(0, -0.2, 0)).addScaledVector(u.fwd, -0.3);
        twoBoneIK(B[`upperarm_${s}`], B[`lowerarm_${s}`], B[`hand_${s}`], arc, pole, 1);
      }
    } else if (sig === 'hbp') {
      // take your base: his right arm points down the line to first (his right is first base's side)
      twoBoneIK(B.upperarm_l, B.lowerarm_l, B.hand_l, tl, pl, w);
      const k = smooth(clamp01((t - after - 0.35) / 0.3)) * (1 - smooth(clamp01((t - after - 1.8) / 0.5)));
      const point = shR.clone().addScaledVector(u.left, -0.62 * sc).addScaledVector(u.fwd, 0.25 * sc).add(new THREE.Vector3(0, 0.04 * sc, 0));
      const pole = shR.clone().add(new THREE.Vector3(0, -0.6, 0)).addScaledVector(u.fwd, -0.3);
      twoBoneIK(B.upperarm_r, B.lowerarm_r, B.hand_r, tr.clone().lerp(point, k), pr.clone().lerp(pole, k), Math.max(w, k));
    } else {
      twoBoneIK(B.upperarm_l, B.lowerarm_l, B.hand_l, tl, pl, w);
      twoBoneIK(B.upperarm_r, B.lowerarm_r, B.hand_r, tr, pr, w);
    }
    // his eyes on the ball, wherever it goes
    lookAt(u, this.pitch.ball.visible ? this.pitch.ball.position.clone() : this.pitch.pointAt(Math.max(0, Math.min(t - pt.tRel, pt.tCatch - pt.tRel))), 0.7);
  }

  /** Hit by the pitch: as the ball arrives he turns his back to it and tucks his head, then
      comes back out of it once it has hit him. */
  flinch(b, t) {
    const pt = this.pitch, ch = b.chain;
    if (!ch) return;
    const hit = pt.after ? pt.tRel + pt.after.t0 : pt.tPlate;
    const k = smooth(clamp01((t - (hit - 0.26)) / 0.22)) * (1 - 0.6 * smooth(clamp01((t - hit - 0.35) / 0.8)));
    if (k <= 0) return;
    // turn away: further closed than his coil, the hips taking 60% of it and the spine the rest
    // (the feet are planted after this, so they stay where they are)
    const ang = -ch.dirn * THREE.MathUtils.degToRad(55) * k;
    const chest = wquat(b.bones.spine_03);
    rotateWorld(b.bones.pelvis, new THREE.Quaternion().setFromAxisAngle(UP, ang * 0.6));
    chestTo(b, new THREE.Quaternion().setFromAxisAngle(UP, ang).multiply(chest), UP);
    const across = wpos(b.bones.upperarm_l).sub(wpos(b.bones.upperarm_r)).normalize();
    bendWorld(b.bones.neck_01, across, 0.3 * k * (b.lefty ? 1 : -1));
  }
}
