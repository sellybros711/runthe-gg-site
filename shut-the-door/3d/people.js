/* The batter, the catcher and the umpire: loaded, dressed, placed, and moved in time with the ball.
 *
 * Motion is Mixamo's captures fitted onto each body in the pipeline (pipeline/build_people.py,
 * sources in lab/LICENSES.md). Here it is placed and timed: the swing is slid in time so the bat
 * arrives with the ball, the catcher's glove arm reaches for the ball with two bone IK, the crouches
 * are our own posing laid over each capture's idle, and the umpire's strike call is blended in.
 */
import * as THREE from 'three';
import * as M from './materials.js?v=6';
import { battingClub, clubNamed } from './clubs.js?v=2';
import { capFor } from './uniforms.js?v=1';
import * as G from './gear3d.js?v=3';
import * as HG from './headgear.js?v=2';
import { measureHead, wear, wornShade } from './headgear.js?v=2';
import { wpos, wquat, boneBox, attach, twoBoneIK, bendWorld, rotateWorld } from './rig.js?v=1';
import { P, FT, smooth, clamp01 } from './units.js?v=1';
import { assetUrl } from './load.js?v=7';
import { planFeet, plantFeet, reach, clavicles, deltoids, chestTo, yawOf, footGeom } from './motion.js?v=5';

const UP = new THREE.Vector3(0, 1, 0);
const NAVY = 0x0d1a33, ROYAL = 0x174a8c;
// the bat's sweet spot: 28 in up it from the knob (gear3d.js bat, 34 in long, the knob at its origin)
const SWEET = 28 * 0.0254;
// how far the swing may be slid to meet the ball (seconds of capture time, from its fastest barrel).
// The sweet spot reaches the ball 0.04 to 0.21 s late, but past about +0.07 s the capture's bat has
// slowed to a near stop (swing3R at +0.21 s: 11 mph, from 25 at its peak), so the bat stalls on the
// ball in motion. The cap keeps contact in the fast part of the swing; what is left of the miss is
// where the bat is in his hands, not when.
const MEET = [-0.05, 0.07];

const UNIFORM = new Set(['uniform', 'socks', 'gloves', 'undershirt', 'belt', 'number']);

/* Team kits. The closer's side (the catcher) wears the pack's club colours (pitcher.teamColors). The
   hitters wear their own club's real colours (clubs.js): the other club of the scenario's title, or of
   the series. Home whites, road greys: the home side is the pack's (usHome). The chest carries the
   club's nickname in words, and nothing else: no logos, no crests, no wordmark artwork. */
const WHITE = '#f2f1ec', GREY = '#a3a6aa';
const FALLBACK = ['#1b2a4a', '#c4ced4'];          // a scenario that names no second club (no words)
const hsl = (c) => new THREE.Color(c).getHSL({}, THREE.SRGBColorSpace);   // perceptual: the lightness is sRGB's
const lum = (c) => hsl(c).l;
/** Two colours look alike: both saturated and within 0.06 of the hue round the wheel, or both black or both white. */
function alike(a, b) {
  const A = hsl(a), B = hsl(b);
  if (A.s > 0.25 && B.s > 0.25) { const d = Math.abs(A.h - B.h); return Math.min(d, 1 - d) < 0.06; }
  return (A.l < 0.2 && B.l < 0.2) || (A.l > 0.8 && B.l > 0.8);
}
/** Contrast ratio (WCAG) of two colours: how well a trim shows on a base. */
function contrast(a, b) {
  const rel = (c) => { const k = new THREE.Color(c); return 0.2126 * k.r + 0.7152 * k.g + 0.0722 * k.b; };
  const x = rel(a), y = rel(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** A club's pair as [trim, other]: the darker colour trims the uniform (a white secondary would vanish on whites). */
const darkFirst = (c) => (lum(c[0]) <= lum(c[1]) ? [c[0], c[1]] : [c[1], c[0]]);
export function kitFor(facts, side) {
  const ours = facts.pitcher.teamColors || ['#0c2340', '#ffffff'];
  const usHome = !!(facts.situation && facts.situation.usHome);
  const club = side === 'us' ? clubNamed(facts.pitcher.team) : battingClub(facts);
  const cols = side === 'us' ? ours : (club ? [club.pri, club.sec] : FALLBACK);
  let [trim, other] = darkFirst(cols);
  const home = side === 'us' ? usHome : !usHome;
  // the two sides never look alike: where the hitters' trim would match the closer's, the club's other
  // colour trims them, if it shows on the base (the nameplate is large type, so 1.8 to 1 will do)
  const ourTrim = darkFirst(ours)[0];
  if (side !== 'us' && alike(trim, ourTrim) && !alike(other, ourTrim) && contrast(other, home ? WHITE : GREY) >= 1.8) [trim, other] = [other, trim];
  const C = (x) => new THREE.Color(x);
  const words = club && club.nick ? (club.as || club.nick).toUpperCase() : null;
  return { base: C(home ? WHITE : GREY), trim: C(trim), stripe: C(trim), sock: C(trim), slot: C(WHITE), number: C(trim), cap: C(capFor(facts.scenarioId, side) || trim),
    undershirt: C(trim), belt: C('#111111'), glove: C(lum(other) > 0.85 ? '#f2f2f2' : other), gloveAccent: C(trim), home, words };
}

// the nameplate on the jersey's front, as shares of the jersey's own box (x across, y up from the hem):
// its top about 9 cm under the neck's V (the V's point is at about 0.90 of the box's height)
const WORD_AT = { x: 0.5, y: 0.69, w: 0.36 };
/** The box [x, y, w, h] the club's words fill, in the jersey mesh's own units (bind pose, facing +z). */
function wordBox(geo) {
  if (!geo.boundingBox) geo.computeBoundingBox();
  const b = geo.boundingBox;
  const W = (b.max.x - b.min.x) * WORD_AT.w, H = W / M.WORD_ASPECT;
  const cx = b.min.x + (b.max.x - b.min.x) * WORD_AT.x, cy = b.min.y + (b.max.y - b.min.y) * WORD_AT.y;
  return [cx - W / 2, cy - H / 2, W, H];
}

/** Put a kit on a person: the uniform's trim mask coloured, the club's name on the jersey's front, the
    number drawn on the back. */
export function dress(p, kit, numberText, weave) {
  p.kit = kit;
  for (const o of p.meshes) {
    const part = o.userData.part;
    if (!part) continue;
    const src = o.userData.src;
    if (part === 'uniform') {
      // the pants are a 'uniform' too: only the jersey (its node is named so) carries the words
      const jersey = !!(o.parent && /jersey/i.test(o.parent.name));
      const words = jersey && kit.words ? { text: kit.words, color: kit.trim, box: wordBox(o.geometry) } : null;
      o.material = M.uniform(src, { base: kit.base, trim: kit.trim, stripe: kit.stripe, slot: kit.base }, { weave, words });
    }
    else if (part === 'number') { o.material = M.numberMaterial(numberText, kit.number, kit.base, src); o.visible = !!numberText; }
    else if (part === 'socks') o.material = M.uniform(src, { base: kit.sock, trim: kit.sock, stripe: kit.sock, slot: kit.slot }, { weave });
    else if (part === 'gloves') o.material = M.uniform(src, { base: kit.glove, trim: kit.glove, stripe: kit.glove, slot: kit.gloveAccent }, { roughness: 0.55 });
    else if (part === 'undershirt') o.material = M.plain('undershirt', kit.undershirt, { roughness: 0.7 });
    else if (part === 'belt') o.material = M.plain('belt', kit.belt, { roughness: 0.35, sheen: 0, clearcoat: 0.4 });
    o.material.name = part;
  }
}

export function loadPerson(g, scene) {
  // the same parsed glTF can be set up again (a new scenario): first put its skeleton back as it
  // came, without the gear the last setup hung on it
  const first = !g.scene.userData.asLoaded;
  if (first) {
    const asLoaded = [];
    g.scene.traverse((o) => { if (o.isBone) asLoaded.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone(), [...o.children]]); });
    g.scene.userData.asLoaded = asLoaded;
  } else {
    for (const [b, pos, q, sc, kids] of g.scene.userData.asLoaded) {
      b.position.copy(pos); b.quaternion.copy(q); b.scale.copy(sc);
      for (const c of [...b.children]) if (!kids.includes(c)) b.remove(c);
    }
  }
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

// the knocked down hitter spins away as he falls (radians, about the spot he stood on), so he lands
// clear of the plate and the catcher: a lefty ends about 1.3 m to his side and 0.8 m back, a righty
// 1.5 m to his side and 0.4 m back (the mirrored capture drifts back more, so a lefty turns further). Measured, not judged from the pitcher's view (a righty turned the other way,
// tuned there by eye, landed behind the plate; the browser check now holds the direction)
const FALL_TURN = { L: THREE.MathUtils.degToRad(-125), R: THREE.MathUtils.degToRad(-80) };

// the flesh round each bone the fall can land on (metres, on the model at its own size)
const FALL_FLESH = [['head', 0.1], ['spine_03', 0.12], ['spine_02', 0.12], ['pelvis', 0.11],
  ...['l', 'r'].flatMap((s) => [[`upperarm_${s}`, 0.06], [`lowerarm_${s}`, 0.05], [`hand_${s}`, 0.035], [`thigh_${s}`, 0.08]])];

// how much further each swing's shoulders stay closed into foot strike (degrees): Mixamo's third
// swing is a shorter, flatter one, and is given more
const COIL = { swing: 3, swing2: 3, swing3: 9, miss: 3 };

// the most the hips tip to the side (degrees; check-deform holds them under 12)
const PELVIS_TILT = 10.5;

// how far a take settles back toward his stance after the pitch goes by (the stride stays planted)
const TAKE_SETTLE = 0.4;

/** Keep an elbow from folding shut: its inside angle at least minDeg (the hand moves out along the
    line from the shoulder, the elbow keeps its side). */
function openElbow(p, s, minDeg) {
  const B = p.bones, ua = B[`upperarm_${s}`], la = B[`lowerarm_${s}`], hd = B[`hand_${s}`];
  const S = wpos(ua), E = wpos(la), H = wpos(hd);
  const a = S.distanceTo(E), b = E.distanceTo(H);
  const ang = S.clone().sub(E).angleTo(H.clone().sub(E));
  const min = THREE.MathUtils.degToRad(minDeg);
  if (ang >= min) return;
  const L = Math.sqrt(a * a + b * b - 2 * a * b * Math.cos(min));
  const dir = H.clone().sub(S); if (dir.lengthSq() < 1e-8) return;
  const q = wquat(hd);
  twoBoneIK(ua, la, hd, S.clone().addScaledVector(dir.normalize(), L), E.clone().add(E.clone().sub(S.clone().lerp(H, 0.5))), 1);
  rotateWorld(hd, q.multiply(wquat(hd).invert()));
}

/** Lay a clip over the pose by weight w (rotations slerped, the pelvis's place lerped), leaving out
    the bones in skip. */
const ARMS = new Set(['clavicle_l', 'upperarm_l', 'upperarm_twist_l', 'lowerarm_l', 'lowerarm_twist_l', 'hand_l',
  'clavicle_r', 'upperarm_r', 'upperarm_twist_r', 'lowerarm_r', 'lowerarm_twist_r', 'hand_r']);
function layer(p, clip, time, w, skip) {
  const tt = THREE.MathUtils.clamp(time, 0, p.clips[clip].duration - 1e-3);
  for (const s of p.samplers[clip]) {
    if (skip && skip.has(s.bone.name)) continue;
    const v = s.interp.evaluate(tt);
    if (s.q) { _qa.set(v[0], v[1], v[2], v[3]); s.bone.quaternion.slerp(_qa, w); }
    else { s.bone.position.x += (v[0] - s.bone.position.x) * w; s.bone.position.y += (v[1] - s.bone.position.y) * w; s.bone.position.z += (v[2] - s.bone.position.z) * w; }
  }
  p.root.updateMatrixWorld(true);
}

/** A looping clip's time (an idle plays round and round, back and forth so it never jumps). */
function loop(p, name, t) {
  const d = p.clips[name].duration - 1e-3, k = t / d;
  const f = k - Math.floor(k);
  return (Math.floor(k) % 2 ? 1 - f : f) * d;
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
  const clip = p.clips.idle ? 'idle' : Object.keys(p.clips)[0];
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
  const clip = p.clips.idle ? 'idle' : Object.keys(p.clips)[0];
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

/** The crouch was designed on a standing capture (CMU): drop the hips by c.drop, lean the trunk by
    c.lean. A Mixamo clip that already squats (the catcher's set, the crouching idle) gets what is
    left of each: the drop less the clip's own, the lean less the clip's own pitch of the chest, so
    the set ends where it was designed and the clip's life rides on it. */
function crouchFromClip(p) {
  const c = p.crouch, B = p.bones, clip = p.clips.idle ? 'idle' : Object.keys(p.clips)[0];
  for (const [b, pos, q] of p.bind) { b.position.copy(pos); b.quaternion.copy(q); }
  p.root.updateMatrixWorld(true);
  const y0 = wpos(B.pelvis).y, up0 = UP.clone().applyQuaternion(wquat(B.spine_03));
  pose(p, { [clip]: [0, 1] });
  const y1 = wpos(B.pelvis).y, up1 = UP.clone().applyQuaternion(wquat(B.spine_03));
  const left = p.left || new THREE.Vector3(1, 0, 0);
  const pitch = Math.atan2(new THREE.Vector3().crossVectors(up0, up1).dot(left), up0.dot(up1));
  p.crouchOff = { drop: (y0 - y1) / p.root.scale.y, lean: pitch };
  p.crouch = { ...c, drop: c.drop - p.crouchOff.drop, lean: c.lean - p.crouchOff.lean };
}

/** The block's crouch for this person (less what his clip already does). */
function blockOf(p) {
  const o = p.crouchOff || { drop: 0, lean: 0 };
  return { ...BLOCK, drop: BLOCK.drop - o.drop, lean: BLOCK.lean - o.lean };
}

/** Crouch by amount k (0 standing, 1 full): drop and push back the hips, plant the feet, lean.
    Under a clip that already squats (crouchOff), standing undoes the clip's own squat as well, by
    the share undo (0 when a clip of his rising is playing and stands him itself). */
function crouch(p, k, undo = 1) {
  const c = p.crouch, B = p.bones;
  const o = p.crouchOff || { drop: 0, lean: 0 };
  const pel = B.pelvis;
  const w = wpos(pel);
  // the crouch's distances were set on the model at its own size: they scale with the body
  const sc = p.root.scale.y;
  const drop = c.drop * k - o.drop * (1 - k) * undo;
  w.y -= drop * sc; w.z -= c.back * sc * k;
  pel.position.copy(pel.parent.worldToLocal(w));
  pel.updateMatrixWorld(true);
  // never higher than his legs reach to his planted feet (a clip that stands him up, the catcher's
  // rise, would lift the feet off the dirt)
  const fg = footGeom(p);
  for (let pass = 0; pass < 3; pass++) {
    let low = 0;
    for (const s of ['l', 'r']) {
      const f = p.feet[s], want = f.flat.clone().slerp(f.q, k);
      const ankle = f.ball.clone().sub(fg[s].off.clone().applyQuaternion(want));
      const hip = wpos(B[`thigh_${s}`]), d = hip.distanceTo(ankle), max = fg[s].leg * 0.985;
      if (d > max) { const dy = hip.y - ankle.y, flat2 = d * d - dy * dy; low = Math.max(low, dy - Math.sqrt(Math.max(0, max * max - flat2))); }
    }
    if (low <= 1e-4) break;
    const w2 = wpos(pel); w2.y -= low;
    pel.position.copy(pel.parent.worldToLocal(w2));
    pel.updateMatrixWorld(true);
  }
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
  const lean = c.lean * k - o.lean * (1 - k) * undo;
  for (const [b, part] of [['spine_01', 0.35], ['spine_02', 0.35], ['spine_03', 0.3]]) bendWorld(B[b], p.left, lean * part);
}

/** The block: the crouch blended toward knees on the ground, up on his toes, chest over the ball.
    Both stances (p.feetN, p.feetB) are worked out once at setup. */
const BLOCK = { drop: 0.7, back: -0.1, heel: 1.0, lean: 0.55, kneeOut: 0.55 };   // same width and turn: his feet stay put
function blockCrouch(p, k) {
  const c0 = p.crouch, f0 = p.feet;
  const BL = blockOf(p);
  p.crouch = Object.fromEntries(Object.keys(c0).map((n) => [n, c0[n] + ((BL[n] ?? c0[n]) - c0[n]) * k]));
  p.feet = {};
  for (const s of ['l', 'r']) {
    const a = p.feetN[s], b = p.feetB[s];
    p.feet[s] = { pos: a.pos.clone().lerp(b.pos, k), q: a.q.clone().slerp(b.q, k), flat: a.flat.clone().slerp(b.flat, k), ball: a.ball.clone().lerp(b.ball, k) };
  }
  crouch(p, 1);
  p.crouch = c0; p.feet = f0;
}

/** Keep a joint's twist (about its own length, from the bind pose) inside maxDeg; its swing stays. */
function limitTwist(p, name, maxDeg) {
  const bone = p.bones[name];
  if (!p.bindQ) p.bindQ = new Map(p.bind.map(([b, , q]) => [b, q]));
  const q0 = p.bindQ.get(bone);
  const rel = q0.clone().invert().multiply(bone.quaternion);
  const child = bone.children.find((c) => c.isBone);
  const ax = child ? child.position.clone().normalize() : new THREE.Vector3(0, 1, 0);
  const pr = ax.clone().multiplyScalar(rel.x * ax.x + rel.y * ax.y + rel.z * ax.z);
  let tw = new THREE.Quaternion(pr.x, pr.y, pr.z, rel.w).normalize();
  if (tw.w < 0) tw.set(-tw.x, -tw.y, -tw.z, -tw.w);
  const sw = rel.clone().multiply(tw.clone().invert());
  const ang = 2 * Math.acos(Math.min(1, tw.w));
  const lim = THREE.MathUtils.degToRad(maxDeg);
  if (ang <= lim) return;
  tw = new THREE.Quaternion().slerp(tw, lim / ang);
  bone.quaternion.copy(q0).multiply(sw).multiply(tw);
  bone.updateMatrixWorld(true);
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

function lookAt(p, pt, w, neck = 36, head = 27) {
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
  limitSwing(p, 'neck_01', neck);
  limitSwing(p, 'head', head);
}


export class People {
  constructor({ scene, facts, mode, pitch, play, m }) {
    Object.assign(this, { scene, facts, mode: mode || 'take', pitch, play, m: m || { batter: mode || 'take', ball: 'glove', contactShift: 0 } });
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
    this.knit = knit;
    if (c) dress(c, kitFor(this.facts, 'us'), '8', knit);
    if (c) this.setupCatcher(c, lm, ln);
    if (u) this.setupUmpire(u);
    if (b && this.facts.batter) this.setBatter(this.facts.batter);
    if (this.pitch) this.setPlay(this.pitch, this.play, this.m);
  }

  /** A new hitter in the box (every batter in the pack, in turn): his build, look, kit, helmet,
      bat and stance. The models are loaded once; this re-dresses and re-places the same body. */
  setBatter(f) {
    const b = this.batter;
    if (!b) return;
    this.facts.batter = f;
    if (b.helmet) {
      b.helmet.parent && b.helmet.parent.remove(b.helmet);
      b.helmet.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      b.helmet = null;
    }
    if (b.bat) { this.scene.remove(b.bat); b.bat = null; }
    for (const [bone, pos, q] of b.bind) { bone.position.copy(pos); bone.quaternion.copy(q); }
    b.root.position.set(0, 0, 0); b.root.rotation.set(0, 0, 0); b.root.scale.setScalar(1);
    b.root.updateMatrixWorld(true);
    b.chain = null; b.feetSwing = null; b.feetTake = null; b.footGeom = null; b.clavBind = null;
    dress(b, kitFor(this.facts, 'them'), f.number ?? '24', this.knit);
    this.look(b, f);
    this.setupBatter(b);
    if (this.umpire) this.placeUmpire(this.umpire);
    if (this.pitch) this.setPlay(this.pitch, this.play, this.m);
  }

  /** One pitch's story for everyone (play.js): what the batter does, where the ball goes after
      the plate, where the catcher sets up. */
  setPlay(pitch, play, m) {
    this.pitch = pitch; this.play = play; this.m = m || { batter: 'take', ball: 'glove', contactShift: 0 };
    this.mode = this.m.batter === 'swing' ? 'swing' : 'take';
    const b = this.batter, c = this.catcher;
    if (b && b.chain) {
      b.take = this.mode === 'take';
      b.motion = this.m.batter;              // swing, take, check or hbp
      // a swing and miss is its own capture (the whiff, then his reaction); the rest use his swing
      this.useClip(b, !b.take && this.m.miss && b.clips['miss' + b.side] ? 'miss' + b.side : b.mainClip);
      const la = play && play.inPlay && play.inPlay.la;
      b.batTilt = la == null ? 0 : THREE.MathUtils.clamp((la - 12) / 30, -1, 1) * 9;
      this.planBatterFeet(b);
      // a swing that meets the ball is slid in time so the bat gets there with it (meetTime)
      b.meet = !b.take && !this.m.miss && pitch ? this.meetTime(b) : 0;
    }
    if (c && c.crouch) {
      // he sets up where the pitch is aimed
      face(c, P(0.1 + 0.4 * this.aimX(), -2.85, 0));
      stance(c);
      c.feetN = c.feet;
      const c0 = c.crouch;
      c.crouch = { ...c0, ...blockOf(c) }; stance(c); c.feetB = c.feet;
      c.crouch = c0; c.feet = c.feetN;
    }
    this.wireBall();
  }

  /* ---------------------------------------------------------------- batter */
  /** His look from the pack's facts (a hash of his id: skin tone and facial hair, never a
      likeness): the darker skin map mixed in, the beard mask darkened. */
  look(p, f) {
    const skin = p.meshes.find((m) => m.material.name === 'skin');
    if (!skin || !skin.material.userData.u) return;
    const u = skin.material.userData.u;
    u.uTone.value = 0; u.uBeardAmt.value = 0;
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
    // his swing (one of the three captured, by his id: looks.js), for his side: the capture as it is
    // for a right handed hitter, mirrored for a left
    b.side = lefty ? '' : 'R';
    const sw = this.facts.batter.swing && b.clips[this.facts.batter.swing + b.side] ? this.facts.batter.swing : 'swing';
    b.mainClip = b.clips[sw + b.side] ? sw + b.side : 'swing';
    b.clip = b.mainClip;
    b.clipData = {};
    b.take = this.mode === 'take';
    b.motion = this.m.batter;
    b.batTilt = 0;
    // the helmet in his club's colour; the jaw guard where the batter's appearance says he wears one
    // built for his head (headgear.js): measured with his build and height, in the bind pose
    measureHead(b);
    b.helmet = wear(b, HG.battingHelmet(b.head, b.kit ? b.kit.cap : NAVY, lefty ? -1 : 1, { jaw: !!this.facts.batter.jawGuard }));
    wornShade(b, b.helmet, b.helmet.userData.edge, { brim: b.helmet.userData.brim });
    b.bat = G.bat();
    this.scene.add(b.bat);
    // grips: bottom hand near the knob. A left handed hitter's bottom hand is his right.
    b.bottom = lefty ? 'r' : 'l'; b.top = lefty ? 'l' : 'r';
    b.batRel = null;
    this.bakeBat(b);
    // place: stance at the start of the clip, his lead shoulder aimed at the pitcher. A real hitter's
    // shoulders line up with the mound, the front one nearer it, so the line from his back shoulder
    // to his lead shoulder goes toward +z
    pose(b, { [b.clip]: [0, 1] });
    const front = lefty ? 'r' : 'l';
    const shoulder = wpos(b.bones[`upperarm_${front}`]).sub(wpos(b.bones[`upperarm_${lefty ? 'l' : 'r'}`])).setY(0);
    const ang = Math.atan2(shoulder.x, shoulder.z); // rotate so the shoulder line -> +z (toward the mound)
    b.root.rotation.y = -ang;
    b.root.updateMatrixWorld(true);
    pose(b, { [b.clip]: [0, 1] });
    const f0 = wpos(b.bones[`foot_${front}`]), back0 = wpos(b.bones[`foot_${lefty ? 'l' : 'r'}`]);
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
      // (the Mixamo swings keep most of their own coil: COIL degrees more, where the CMU capture took 10)
      coil: (t) => THREE.MathUtils.degToRad(COIL[b.clip.replace(/R$/, '')] ?? 3) * ramp(t, tTop - 0.45, tStrike) * (1 - ramp(t, tStrike, tC - 0.03)),
    };
    // the feet: where they are down in this motion, for the swing (by capture time) and the take
    // (by the clock relative to the plate)
    // the back foot never leaves the ground: it pivots on its ball as the hips open. The front
    // foot lifts, lands on its ball and settles flat, and stays
    const back = b.lefty ? 'l' : 'r', tLift = hs[lift][0] + 1 / 30;   // (held a frame longer: it leaves the ground, it does not slide off it)
    // after contact the front foot spins open on its heel (35 degrees, the way the hips open)
    const open = { at: tC - 0.02, deg: 35, dir: Math.sign(dy) || 1 };
    b.feetSpec = (t0, t1, swing) => ({ [back]: [[t0, t1, 'pivot']], [front]: [[t0, tLift, 'land'], [tStrike, t1, 'flat', swing ? open : null]] });
    this.planBatterFeet(b);
  }

  /** Make a clip his motion for this play (his own swing, or the swing and miss): its bat track,
      contact, chain and feet are worked out the first time and kept. */
  useClip(b, name) {
    if (!b.clips[name] || (b.clip === name && b.chain)) return;
    const KEYS = ['batTrack', 'batDt', 'tContact', 'peakBatSpeed', 'chain', 'feetSpec', 'feetSwing'];
    if (b.chain) b.clipData[b.clip] = Object.fromEntries(KEYS.map((k) => [k, b[k]]));
    b.clip = name;
    if (b.clipData[name]) { Object.assign(b, b.clipData[name]); return; }
    b.chain = null; b.feetSwing = null; b.feetSpec = null;
    this.bakeBat(b);
    this.setupChain(b);
  }

  /** The feet for this pitch's motion: the swing's plan is his own (once per hitter); a take's
      runs on the pitch's clock, so it is planned per pitch. */
  planBatterFeet(b) {
    if (!b.feetSpec) return;
    const clip = b.clips[b.clip];
    if (!b.take) { if (!b.feetSwing) b.feetSwing = planFeet(b, (t) => this.swingBase(b, t), 0, clip.duration, b.feetSpec(0, clip.duration, true)); }
    else if (this.pitch) { const ct0 = Math.min(0, -this.pitch.tPlate + b.tContact - 0.1); b.feetTake = planFeet(b, (t) => this.takeBase(b, t), ct0, ct0 + 3.8, b.feetSpec(ct0, ct0 + 3.8, false)); }
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

  /** The swing at capture time t, all of it: the chain, the planted feet, the shoulders and the bat
      (update() poses a swing this way every frame). */
  swingPose(b, t) {
    b.batTime = t;
    this.swingBase(b, t);
    reach(b, b.feetSwing, t);
    plantFeet(b, b.feetSwing, t);
    this.finishBatter(b);
  }

  /** The last of every batter frame, a swing or a take. */
  finishBatter(b) {
    // the Mixamo swings turn the head hard on the neck to keep the eyes on the pitch: past about
    // 24 degrees of twist the skin under the jaw pinches
    limitTwist(b, 'head', 24);
    clavicles(b);
    deltoids(b);
    this.poseBat(b);
  }

  /* When his swing meets the ball. tContact is the capture's fastest barrel, and that comes before
     the bat is out where the ball is: timed on it, the sweet spot was 3 to 5 ft behind the ball's
     contact point when the ball left the bat, and got there 0.04 to 0.21 s of capture time later.
     So the swing is slid in time, nothing else: within MEET, the capture time is found at which his
     sweet spot is nearest the point where the ball is met (pitch.js flight, at the play's
     contactShift), and that moment is put on the contact. Every
     pose is his own, only when it comes changes. Returns the slide in seconds of capture time. */
  meetTime(b) {
    const pt = this.pitch, M = pt.pointAt(pt.f.T + this.m.contactShift), tC = b.tContact;
    const sweet = new THREE.Vector3();
    const miss = (u) => {
      this.swingPose(b, u);
      return sweet.set(0, SWEET, 0).applyMatrix4(b.bat.matrixWorld).distanceTo(M);
    };
    const lo = tC + MEET[0], hi = tC + MEET[1];
    let best = tC, bestD = Infinity;
    for (let u = lo; u <= hi + 1e-9; u += 1 / 120) { const d = miss(u); if (d < bestD) { bestD = d; best = u; } }
    const c = best;
    for (let u = c - 1 / 120; u <= c + 1 / 120 + 1e-9; u += 1 / 960) {
      const uu = THREE.MathUtils.clamp(u, lo, hi), d = miss(uu);
      if (d < bestD) { bestD = d; best = uu; }
    }
    b.meetMiss = bestD;
    return best - tC;
  }

  /** The take at clock time ct (relative to the swing's contact), before the feet are planted:
      the same capture through his load and stride, then he holds the hands back as the ball goes
      by and lets the bat settle toward his stance again. */
  takeBase(b, ct) {
    // a check swing lets the bat start (the hands come through, the barrel stays back), then holds
    const check = b.motion === 'check';
    const launch = b.tContact - (check ? 0.075 : 0.2);
    const k = smooth(clamp01((ct - launch - (check ? 0.12 : 0.25)) / (check ? 0.6 : 0.9)));
    pose(b, [[b.clip, Math.min(ct, launch), 1], [b.clip, 0.4 + Math.max(0, ct - launch) * 0.3, k * TAKE_SETTLE]]);
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
    // the hips tip to the side by at most PELVIS_TILT degrees (the Mixamo finishes drop the back hip
    // further); the spine takes the difference back, so the chest stays where the capture has it
    const tl = wpos(b.bones.thigh_l), tr = wpos(b.bones.thigh_r), across = tl.clone().sub(tr);
    const flat = Math.hypot(across.x, across.z), tilt = Math.atan2(across.y, flat), lim = THREE.MathUtils.degToRad(PELVIS_TILT);
    if (Math.abs(tilt) > lim && flat > 1e-4) {
      const fwd = new THREE.Vector3(across.z, 0, -across.x).normalize();
      const q = new THREE.Quaternion().setFromAxisAngle(fwd, tilt - Math.sign(tilt) * lim);
      const chest = wquat(b.bones.spine_01);
      rotateWorld(pel, q);
      rotateWorld(b.bones.spine_01, chest.multiply(wquat(b.bones.spine_01).invert()));
    }
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
    if (b.dropAt != null) { this.dropBat(b, b.dropAt); return; }
    b.batDrop = null;   // in his hands: the next drop starts from wherever they are then
    b.batDrop = null;
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

  /** Knocked down, he lets go of the bat: it falls from where it was to the dirt and lies there. */
  dropBat(b, dt) {
    if (!b.batDrop) b.batDrop = { pos: b.bat.position.clone(), q: b.bat.quaternion.clone() };
    const d = b.batDrop, g = 9.8;
    const ax = UP.clone().applyQuaternion(d.q);
    const flat = new THREE.Vector3(ax.x, 0, ax.z);
    if (flat.lengthSq() < 1e-6) flat.set(1, 0, 0);
    const lie = new THREE.Quaternion().setFromUnitVectors(UP, flat.normalize());
    const k = smooth(clamp01(dt / 0.55));
    b.bat.quaternion.copy(d.q).slerp(lie, k);
    const y = Math.max(0.035, d.pos.y - 0.5 * g * dt * dt);
    b.bat.position.set(d.pos.x + flat.x * 0.25 * k, y, d.pos.z + flat.z * 0.25 * k);
    b.bat.updateMatrixWorld(true);
  }

  /* ---------------------------------------------------------------- catcher */
  setupCatcher(c, lm, ln) {
    // a generic catcher and umpire: big league average builds (no one real), 6 ft 0 and 6 ft 1
    this.build(c, 72, 210);
    // catcher's gear: charcoal, as most big league gear is; the team colour stays off it (no marks)
    const team = new THREE.Color(0x1d1f22);
    measureHead(c);
    c.helmet = wear(c, HG.catcherHelmet(c.head, team));
    wornShade(c, c.helmet, c.helmet.userData.edge);
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
    crouchFromClip(c);
    stance(c);
    // the block's stance, for a ball in the dirt
    c.feetN = c.feet;
    const c0 = c.crouch;
    c.crouch = { ...c0, ...blockOf(c) }; stance(c); c.feetB = c.feet;
    c.crouch = c0; c.feet = c.feetN;
  }

  aimX() { return this.pitch ? this.pitch.aim.x : 0; }

  /* ---------------------------------------------------------------- umpire */
  setupUmpire(u) {
    this.build(u, 73, 225);
    // his cap sits on his hair, pressed flat under it (the hair shows below the band); the mask under it
    measureHead(u);
    u.cap = wear(u, HG.cap(u.head, 0x0a0a0c));
    u.mask = wear(u, HG.umpireMask(u.head, u.cap.userData.edge));
    wornShade(u, u.cap, u.cap.userData.edge, { brim: u.cap.userData.brim, hairFrom: 70 * Math.PI / 180 });
    // the slot: between the catcher and a left handed hitter, his chin over the catcher's shoulder
    // directly behind the catcher, his head over the catcher's inside shoulder
    u.crouch = { drop: 0.4, back: 0.16, width: 0.36, toeOut: 0.3, heel: 0.05, lean: 0.62, kneeOut: 0.6 };
    crouchFromClip(u);
    this.placeUmpire(u);
  }

  /** The umpire's slot follows the hitter's side; set again for each hitter. */
  placeUmpire(u) {
    const bats = this.facts.batter ? this.facts.batter.bats : 'L';
    face(u, P(bats === 'L' ? 0.55 : -0.55, -5.0, 0));
    stance(u);
  }

  bindPitch(pitch) { this.pitch = pitch; }

  update(t) {
    const pt = this.pitch;
    const b = this.batter, c = this.catcher, u = this.umpire;
    if (b) {
      // met early to pull it (contactShift < 0), late to go the other way; a swing is slid by its
      // meet (meetTime) so the bat is on the ball at the contact
      const ct = t - (pt.tPlate + (b.take ? 0 : this.m.contactShift)) + b.tContact + (b.take ? 0 : b.meet || 0);
      if (!b.take) {
        // a real hitter holds his finish: time slows to a near hold at the end of the swing (each
        // capture is cut at its finish); a swing and miss plays on through his reaction
        const dur = b.clips[b.clip].duration;
        const hold = b.clip.startsWith('miss') ? dur - 0.05 : Math.min(b.tContact + 0.42, dur - 0.05);
        const cw = ct < hold ? ct : hold + (1 - Math.exp(-(ct - hold) / 0.5)) * 0.18;
        this.swingPose(b, cw);
      } else {
        // a pitch on the shoulder puts him down (play.js motion, m.fall): the take until the ball
        // is on him, then Mixamo's shoulder hit and fall, its blow timed to the ball
        const fall = b.motion === 'hbp' && this.m.fall && b.clips['hbpFall' + b.side];
        const hitT = pt.after ? pt.tRel + pt.after.t0 : pt.tPlate;
        const wf = fall ? smooth(clamp01((t - (hitT - 0.08)) / 0.12)) : 0;
        if (wf < 1) {
          this.takeBase(b, ct);
          if (b.motion === 'hbp' && !fall) this.flinch(b, t);
          reach(b, b.feetTake, ct);
          plantFeet(b, b.feetTake, ct);
        }
        if (wf > 0) this.fallOn(b, t - hitT, wf);
        b.batTime = Math.min(ct, b.tContact - (b.motion === 'check' ? 0.075 : 0.2));
        b.dropAt = fall && t > hitT ? t - hitT : null;
        this.finishBatter(b);
      }
    }
    if (c) {
      pose(c, { idle: [loop(c, 'idle', 1.5 + t), 1] });
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
        // a ball in play: he comes up out of his crouch the way Mixamo's catcher does
        // (his trunk and legs: the glove arm stays his own, catcherArms reaches it)
        if (k > 0 && c.clips.rise) layer(c, 'rise', THREE.MathUtils.clamp(t - contact - 0.2, 0, c.clips.rise.duration), k, ARMS);
        crouch(c, 1 - (c.clips.rise ? 0.8 : 0.5) * k, c.clips.rise ? 0 : 1);
        this.catcherArms(c, t);
      }
      lookAt(c, this.pitch.ball.visible ? this.pitch.ball.position.clone() : this.pitch.pointAt(Math.max(0, Math.min(t - pt.tRel, pt.tCatch - pt.tRel))), 0.4);
      clavicles(c);
      deltoids(c);
    }
    if (u) {
      pose(u, { idle: [loop(u, 'idle', 2.0 + t), 1] });
      this.umpireMove(u, t);
      clavicles(u);
      deltoids(u);
      // no elbow folds shut (the capture's fist pump closes it further than a forearm allows)
      for (const s of ['l', 'r']) openElbow(u, s, 105);
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
    // a pitch into the batter he only starts after: it is gone before he gets there (and one high
    // and inside is past where his shoulder goes)
    const target = aim.clone().lerp(ball, k1 * (this.m.ball === 'hbp' ? 0.5 : 1));
    target.z -= give * 0.06;
    // framing: a pitch caught near the edge of the zone, he brings the mitt a few centimetres back
    // toward the zone as he holds it (never a pitch well off the plate, never one he did not catch)
    if (!pt.after) {
      const zb = this.facts.batter, edgeX = 0.83, f = pt.actual;
      const off = { x: Math.max(0, Math.abs(f.x) - edgeX + 0.3) * -Math.sign(f.x), z: f.z > zb.szTop - 0.3 ? -1 : f.z < zb.szBot + 0.3 ? 1 : 0 };
      const near = Math.abs(f.x) < edgeX + 0.35 && f.z > zb.szBot - 0.35 && f.z < zb.szTop + 0.35;
      const fr = near ? smooth(clamp01((t - catchT - 0.05) / 0.18)) : 0;
      if (fr > 0) {
        const dir = P(Math.sign(off.x) * Math.min(1, Math.abs(off.x) * 3), 0, off.z).normalize();
        target.addScaledVector(dir, 0.035 * fr);
      }
    }
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
    // a strike: Mixamo's umpire calls it, his whole body rising into the punch (the capture's
    // punch peaks a second in; it is timed to land half a second after the catch)
    const callClip = sig === 'strike' && u.clips.call;
    if (callClip) pose(u, [['idle', loop(u, 'idle', 2.0 + t), 1], ['call', THREE.MathUtils.clamp(0.55 + (t - pt.tCatch), 0, u.clips.call.duration), up]]);
    // the Mixamo captures roll his upper arms on their twist bones: the skin of a bent elbow pinches
    // on a rolled arm, so the twist goes back to the bind pose (his signals are our own posing)
    if (!u.bindQ) u.bindQ = new Map(u.bind.map(([bb, , q]) => [bb, q]));
    for (const s of ['l', 'r']) { const tb = B[`upperarm_twist_${s}`]; tb.quaternion.copy(u.bindQ.get(tb)); }
    u.root.updateMatrixWorld(true);
    crouch(u, 1 - up * 0.85, callClip ? 0 : 1);
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
    if (callClip) {
      // his hands come off his knees as he rises into the capture's call
      twoBoneIK(B.upperarm_l, B.lowerarm_l, B.hand_l, tl, pl, w);
      twoBoneIK(B.upperarm_r, B.lowerarm_r, B.hand_r, tr, pr, w);
    } else if (sig === 'strike') {
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
    // the crouching capture holds his chin up to see over the catcher: standing, he lets it go
    // (the look below then has its whole range, and the neck is never stretched past it)
    for (const n of ['neck_01', 'head']) B[n].quaternion.slerp(u.bindQ.get(B[n]), up);
    u.root.updateMatrixWorld(true);
    // his eyes on the ball, wherever it goes. The crouching capture already lifts his chin, so the
    // look gets less range on top of it (at the full range his neck skin stretched)
    lookAt(u, this.pitch.ball.visible ? this.pitch.ball.position.clone() : this.pitch.pointAt(Math.max(0, Math.min(t - pt.tRel, pt.tCatch - pt.tRel))), 0.7, 30, 22);
  }

  /** The fall (Mixamo's shoulder hit and fall, mirrored to the shoulder toward the pitcher), dt
      seconds after the ball reaches him, blended in by w over the pose he is in. The capture's blow
      lands 0.27 s in; he goes down backward, away from the plate, and stays down. */
  fallOn(b, dt, w) {
    const name = 'hbpFall' + b.side;
    const saved = w < 1 ? b.bind.map(([bone]) => [bone, bone.quaternion.clone(), bone.position.clone()]) : null;
    pose(b, { [name]: [THREE.MathUtils.clamp(0.27 + dt, 0, b.clips[name].duration), 1] });
    // the capture falls straight back; he spins away as he goes (FALL_TURN, over his first stumble)
    // and lands beside the box, in the pitcher's view, clear of the plate and the catcher
    const pel = b.bones.pelvis, o = wpos(b.root), rq = new THREE.Quaternion().setFromAxisAngle(UP, (b.lefty ? -FALL_TURN.L : FALL_TURN.R) * smooth(clamp01(dt / 0.7)));
    const pw = wpos(pel).sub(o).applyQuaternion(rq).add(o);
    rotateWorld(pel, rq);
    pel.position.copy(pel.parent.worldToLocal(pw));
    pel.updateMatrixWorld(true);
    if (saved) {
      for (const [bone, q, pos] of saved) {
        const fq = bone.quaternion.clone(), fp = bone.position.clone();
        bone.quaternion.copy(q).slerp(fq, w);
        bone.position.copy(pos).lerp(fp, w);
      }
      b.root.updateMatrixWorld(true);
    }
    // the capture was taken on its own floor, and turned and fitted to his body it can put an elbow
    // or a shoulder a few centimetres into the dirt as he lands: he is lifted out of it (each bone's
    // depth less the flesh round it, FALL_FLESH, at his size)
    const sc = b.root.scale.y;
    let low = 0;
    for (const [n, r] of FALL_FLESH) low = Math.min(low, wpos(b.bones[n]).y - r * sc);
    if (low < 0) {
      const p2 = wpos(pel); p2.y -= low;
      pel.position.copy(pel.parent.worldToLocal(p2));
      pel.updateMatrixWorld(true);
    }
  }

  /** Hit by the pitch: as the ball arrives he turns his back to it and tucks his head, then
      comes back out of it once it has hit him. */
  flinch(b, t) {
    const pt = this.pitch, ch = b.chain;
    if (!ch) return;
    const hit = pt.after ? pt.tRel + pt.after.t0 : pt.tPlate;
    const k = smooth(clamp01((t - (hit - 0.26)) / 0.22)) * (1 - 0.6 * smooth(clamp01((t - hit - 0.35) / 0.8)));
    if (k <= 0) return;
    // turn away: further closed than his coil, the hips taking two thirds of it and the spine the rest
    // (the feet are planted after this, so they stay where they are)
    const ang = -ch.dirn * THREE.MathUtils.degToRad(48) * k;
    const chest = wquat(b.bones.spine_03);
    rotateWorld(b.bones.pelvis, new THREE.Quaternion().setFromAxisAngle(UP, ang * 0.66));
    chestTo(b, new THREE.Quaternion().setFromAxisAngle(UP, ang).multiply(chest), UP);
    const across = wpos(b.bones.upperarm_l).sub(wpos(b.bones.upperarm_r)).normalize();
    bendWorld(b.bones.neck_01, across, 0.3 * k * (b.lefty ? 1 : -1));
  }
}
