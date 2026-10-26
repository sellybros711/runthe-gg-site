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
import { assetUrl } from './load.js?v=8';
import { planFeet, plantFeet, reach, clavicles, deltoids, chestTo, yawOf, footGeom } from './motion.js?v=5';

const UP = new THREE.Vector3(0, 1, 0);
const NAVY = 0x0d1a33, ROYAL = 0x174a8c;
// the bat's sweet spot: 28 in up it from the knob (gear3d.js bat, 34 in long, the knob at its origin)
const SWEET = 28 * 0.0254;
// When the bat meets the ball (meetTime), on both clocks. MEET: the capture frames searched, in
// seconds from tContact (the swing's anchor for the chain and the take). The capture's sweet spot
// crosses the ball's line 0.04 to 0.22 s after it, still in the fast part of the swing. MEET_DEPTH:
// where along its flight the ball may be met, in feet out in front of the plate's front edge (4 ft
// out front to 1 ft over the plate). Each capture crosses the ball's line near the front edge, so a
// ball met where play.js once put it (up to 5 ft out front for a pulled ball, behind the plate the
// other way) was 0.4 to 1.9 m from the sweet spot.
const MEET = [-0.05, 0.25], MEET_DEPTH = [4, -1];
// the whiff capture's fastest barrel (its anchor) can come after it has crossed the zone (the lefty's
// is 0.33 s later than the righty's), so its search runs wider
const MEET_MISS = [-0.45, 0.25];
const meetWindow = (b) => (b.clip.startsWith('miss') ? MEET_MISS : MEET);
// The swing aimed at the pitch (aimSwing): a layer on his own swing, whole at the frame that meets
// the ball, eased in from the top of his leg lift and out over AIM.out seconds into his finish. Its
// parts, each with its range here: drop (m) the pelvis lowered, so the planted feet bend his knees;
// side (degrees over three spine joints) the trunk tipped about his own shoulder line, the back
// shoulder down for a low pitch; lean (degrees) the trunk out over the plate, the arms keeping their
// line so the hands go with the shoulders; shift (m) the pelvis toward the plate; dip and yaw
// (degrees) the barrel laid down or lifted, and turned in or out, in his wrists about the bottom
// grip; hands (m) both hands carrying the bat, rigid in them. R_BALL is the ball's radius; MISS the
// bat's centre line from the ball's on a swing and a miss (over the top of a low or breaking pitch,
// under a high one); TIP how far a foul tip runs into the wood (a graze).
const AIM = { out: 0.4, drop: 0.2, side: [-8, 24], lean: [-8, 28], dip: [-55, 35], yaw: 30, hands: 0.25, shift: [-0.06, 0.2] };
const R_BALL = 0.0366, MISS = 0.34, TIP = 0.008;
// the most poses one pitch's aim may take (about half a millisecond each on a desktop, a few on a
// phone): it runs once, as the pitch is set up
const AIM_POSES = 200;
// the farthest (m) a solve may be from the ball and still start the next frame's
const WARM_ERR = 0.01;
// what a metre short of the ball counts against a frame, in units of aim (aimSwing's choice)
const MISS_COST = 1000;
// The swing's bat speed (whipSwing, swingClock). The captures' sweet spot moves about 20 mph where
// they meet the ball; a big league swing is near 72 (Statcast bat speed, measured 6 in from the end:
// our sweet spot), most of it gained in the last 0.15 s. So his capture is played on a warped clock,
// never with new keys: slower through the load and the stride, k times its own speed at the frame
// that meets the ball (k sets the sweet spot there to WHIP.mph, at most WHIP.k), then slower again as
// the finish decelerates. Capture time u (the contact frame) still plays at the moment the ball is
// met, so the pose there is the one the aim solved; nothing outside WHIP.pre before and WHIP.post
// after it changes. core: the half width (capture seconds) of the fast part each side of contact;
// pre and post: the windows that give that time back (the load and stride before, the finish after);
// back: how much of the time gained after contact the finish gives back (the rest is a quicker
// finish, as a real one is). Every part is smooth (no kink in the clock), and the clock never runs
// slower than WHIP.floor of the capture's own speed.
const WHIP = { mph: 72, blend: [0.16, 0.14], sigma: [0.09, 0.08], pre: 0.62, post: 0.5, back: 0.5, floor: 0.25, gmax: 12, d: 1 / 120, h: 1 / 960, reach: 0.4, near: 0.05, hips: { lead: 0.035, in: 0.06, out: 0.09 } };
// the bat's radius along it (gear3d.js bat), inches from the knob: [inches up, radius]
const BAT_R = [[0, 0.62], [9, 0.47], [13, 0.5], [17, 0.62], [21, 0.9], [24, 1.18], [27, 1.28], [31, 1.3], [33.4, 1.3], [34, 0.9]];
function batRadius(y) {
  const yi = y / 0.0254;
  for (let i = 1; i < BAT_R.length; i++) if (yi <= BAT_R[i][0]) { const [y0, r0] = BAT_R[i - 1], [y1, r1] = BAT_R[i]; return (r0 + (r1 - r0) * clamp01((yi - y0) / (y1 - y0))) * 0.0254; }
  return 0.9 * 0.0254;
}
// the bat in his hands (bakeBat): the top hand counts as off the bat once the grips are GRIP_OFF
// (m) apart, and the bat is then the bottom hand's alone, over GRIP_LET seconds; GRIP_HOLD is the
// gap between the grips (m) at which the line through them and his grip count the same;
// GRIP_SMOOTH the smoothing's width (samples at 60 Hz)
const GRIP_OFF = 0.2, GRIP_LET = 0.1, GRIP_HOLD = 0.05, GRIP_SMOOTH = 2;

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
// swing is a shorter, flatter one, and is given more. (The whiff's 4: on the warped clock its foot
// strike is sampled a little nearer the capture's own, which is 30 degrees of separation, the edge of
// check-deform's band; one more keeps it inside.)
const COIL = { swing: 3, swing2: 3, swing3: 9, miss: 4 };

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
      // a swing that meets the ball is timed so the bat gets there with it (meetTime); a take or a
      // swing and miss keeps the play's own timing
      // and then aimed at it (aimSwing): to meet it where the engine says it was met, or on a swing
      // and a miss, to go by it
      b.aim = null;
      if (!b.take && pitch) { this.meetTime(b); this.aimSwing(b); this.whipSwing(b); }
      else { b.meet = 0; b.meetBall = this.m.contactShift; b.tiltAt = b.tContact; b.whip = null; }
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
    b.meetPath = null; b.speedPath = null;
    this.setupChain(b);
    // his swing's path through the zone, while he walks up (not on the tap that throws the pitch)
    this.meetPath(b);
    this.speedPath(b);
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
    const KEYS = ['batTrack', 'batDt', 'tContact', 'peakBatSpeed', 'chain', 'feetSpec', 'feetSwing', 'meetPath', 'speedPath'];
    if (b.chain) b.clipData[b.clip] = Object.fromEntries(KEYS.map((k) => [k, b[k]]));
    b.clip = name;
    if (b.clipData[name]) { Object.assign(b, b.clipData[name]); return; }
    b.chain = null; b.feetSwing = null; b.feetSpec = null; b.meetPath = null; b.speedPath = null;
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

  /** The swing at capture time t, before the feet are planted. tl, when given, is the capture time
      his hips and legs are at (swingHips: ahead of the rest through the turn on a fast swing). */
  swingBase(b, t, tl) {
    pose(b, { [b.clip]: [t, 1] });
    const ch = b.chain;
    if (!ch) return;
    const chest = wquat(b.bones.spine_03);
    const lead = ch.lead(t), at = tl ?? t;
    if (lead > 1e-4 || at !== t) sampleRot(b, b.clip, at + lead, LOWER);
    const coil = ch.coil(t);
    chestTo(b, new THREE.Quaternion().setFromAxisAngle(UP, -ch.dirn * coil).multiply(chest), UP);
    this.trimPelvis(b);
  }

  /** The swing at capture time t, all of it: the chain, the planted feet, the shoulders and the bat
      (update() poses a swing this way every frame). */
  swingPose(b, t, tl) {
    b.batTime = t;
    this.swingBase(b, t, tl);
    this.aimBody(b, t);
    reach(b, b.feetSwing, t);
    plantFeet(b, b.feetSwing, t);
    this.finishBatter(b);
  }

  /** The last of every batter frame, a swing or a take. */
  finishBatter(b) {
    // the Mixamo swings turn the head hard on the neck to keep the eyes on the pitch: past about
    // 24 degrees of twist the skin under the jaw pinches
    limitTwist(b, 'head', 24);
    if (b.aim && !b.take) this.aimHands(b, b.batTime);
    clavicles(b);
    deltoids(b);
    this.poseBat(b);
  }

  /* When his swing meets the ball, from the barrel's real path. The capture's sweet spot sweeps
     through the zone and crosses the ball's line once, near the front of the plate. Within MEET
     (capture time) and MEET_DEPTH (the ball's flight), the pair is found at which his sweet spot is
     nearest the ball: that capture frame is put on the moment the ball gets there, and the ball
     leaves the bat from there (wireBall). Every pose is his own; only when it comes changes.
     Sets b.meet (the slide in capture time from tContact) and b.meetBall (the ball's moment, in
     seconds from the plate's front edge). */
  meetTime(b) {
    const pt = this.pitch, f = pt.f, tC = b.tContact, yF = f.at(f.T).y;
    // the ball's line through the depths it may be met at, as short straight pieces
    const s0 = pt.timeAtY(yF + MEET_DEPTH[0]) - f.T, s1 = pt.timeAtY(yF + MEET_DEPTH[1]) - f.T, N = 24;
    const path = [];
    for (let i = 0; i <= N; i++) { const s = s0 + (s1 - s0) * i / N; path.push([s, pt.pointAt(f.T + s)]); }
    // the bat through MEET (meetPath, once per hitter and swing), between its samples, with this
    // pitch's launch tilt put on as poseBat puts it (the tilt is centred on the contact, so it is
    // whole there)
    const B = this.meetPath(b), dt = B.dt, n = B.at.length;
    const tilt = THREE.MathUtils.degToRad(b.batTilt || 0);
    const sweet = new THREE.Vector3(), seg = new THREE.Vector3(), rel = new THREE.Vector3();
    const ax = new THREE.Vector3(), across = new THREE.Vector3(), q = new THREE.Quaternion(), tq = new THREE.Quaternion();
    const near = (u) => {
      const x = THREE.MathUtils.clamp((u - B.lo) / dt, 0, n - 1), i = Math.min(n - 2, Math.floor(x)), k = x - i;
      q.copy(B.at[i].q).slerp(B.at[i + 1].q, k);
      if (tilt) {
        ax.copy(UP).applyQuaternion(q); across.crossVectors(ax, UP);
        if (across.lengthSq() > 1e-6) q.premultiply(tq.setFromAxisAngle(across.normalize(), tilt));
      }
      // poseBat: the knob 5.5 cm below the bottom grip, along the bat
      ax.copy(UP).applyQuaternion(q);
      sweet.copy(B.at[i].gb).lerp(B.at[i + 1].gb, k).addScaledVector(ax, SWEET - 0.055);
      let d = Infinity, s = 0;
      for (let i = 0; i < N; i++) {
        const [sa, a] = path[i], [sb, c] = path[i + 1];
        seg.subVectors(c, a);
        const k = clamp01(rel.subVectors(sweet, a).dot(seg) / seg.lengthSq());
        const di = rel.copy(a).addScaledVector(seg, k).distanceTo(sweet);
        if (di < d) { d = di; s = sa + (sb - sa) * k; }
      }
      return { d, s };
    };
    const W = meetWindow(b), lo = tC + W[0], hi = tC + W[1];
    let best = { d: Infinity, s: 0, u: tC };
    for (let u = lo; u <= hi + 1e-9; u += 1 / 120) { const r = near(u); if (r.d < best.d) best = { ...r, u }; }
    const c = best.u;
    for (let u = c - 1 / 120; u <= c + 1 / 120 + 1e-9; u += 1 / 960) {
      const uu = THREE.MathUtils.clamp(u, lo, hi), r = near(uu);
      if (r.d < best.d) best = { ...r, u: uu };
    }
    b.meetMiss = best.d;
    b.meet = best.u - tC;
    b.meetBall = best.s;
    b.tiltAt = best.u;
    // the next best frames either side of it, for a pitch the aim cannot reach from this one
    // (aimSwing tries them in turn)
    b.meetAlt = [];
    for (const du of [-0.04, 0.04, -0.08, 0.08]) {
      const uu = best.u + du;
      if (uu < lo || uu > hi) continue;
      const r = near(uu);
      b.meetAlt.push({ meet: uu - tC, meetBall: r.s });
    }
  }

  /** The bat through MEET for his swing, without the launch tilt: the bottom grip and the bat's
      turn every 1/120 s of capture time. Posed once per hitter and swing (about 36 poses), so a
      pitch's meetTime is arithmetic. */
  meetPath(b) {
    if (b.meetPath) return b.meetPath;
    // his swing's planted feet (planBatterFeet plans them only once he swings; a take comes first)
    const dur = b.clips[b.clip].duration;
    if (!b.feetSwing) b.feetSwing = planFeet(b, (t) => this.swingBase(b, t), 0, dur, b.feetSpec(0, dur, true));
    const W = meetWindow(b), lo = b.tContact + W[0], hi = b.tContact + W[1], dt = 1 / 120, at = [];
    // (his own swing: without the aim, which may still hold the last pitch's, even the last hitter's)
    const tilt = b.batTilt, aim = b.aim;
    b.batTilt = 0; b.aim = null;
    for (let u = lo; u <= hi + dt / 2; u += dt) {
      this.swingPose(b, u);
      at.push({ gb: this.grips(b).gb, q: b.bat.quaternion.clone() });
    }
    b.batTilt = tilt; b.aim = aim;
    return (b.meetPath = { lo, dt, at });
  }

  /** How much of the aim is on at capture time u: none until the top of his leg lift, all of it at
      the frame that meets the ball, gone AIM.out seconds into his finish. */
  aimWeight(b, u) {
    const a = b.aim;
    if (!a || u == null) return 0;
    if (u <= a.u) return smooth(clamp01((u - a.u0) / Math.max(1e-3, a.u - a.u0)));
    return 1 - smooth(clamp01((u - a.u) / AIM.out));
  }

  /** The legs and the trunk: the pelvis lowered (the planted feet then bend the knees), the trunk
      tipped back over the catcher (the back shoulder drops) and out over the plate. */
  aimBody(b, u) {
    const w = this.aimWeight(b, u), a = b.aim;
    b.aimPre = null;
    if (w <= 0) return;
    // the hands and the bat as the capture has them: the trunk carries the hands, never turns the bat
    b.aimPre = { gb: this.grips(b).gb, hands: [b.bottom, b.top].map((s) => [s, wpos(b.bones[`hand_${s}`]), wquat(b.bones[`hand_${s}`])]) };
    const pel = b.bones.pelvis, p = wpos(pel);
    p.y -= a.drop * w;
    p.x += (b.lefty ? 1 : -1) * a.shift * w;
    pel.position.copy(pel.parent.worldToLocal(p));
    pel.updateMatrixWorld(true);
    const D = THREE.MathUtils.degToRad;
    // the back shoulder drops: the trunk tipped about the line square to his shoulders (he has
    // turned to the pitcher by contact, so it is his own line, never the world's)
    const back = wpos(b.bones[`upperarm_${b.lefty ? 'l' : 'r'}`]).sub(wpos(b.bones[`upperarm_${b.lefty ? 'r' : 'l'}`])).setY(0);
    const q = new THREE.Quaternion();
    if (back.lengthSq() > 1e-6) q.setFromAxisAngle(back.normalize().cross(UP).normalize(), -D(a.side) * w / 3);
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -(b.lefty ? 1 : -1) * D(a.lean) * w / 3));
    // the arms keep their line as the trunk tips under them, so the hands go where the shoulders go
    // (out over the plate, down to the ball) instead of swinging about the waist with the trunk
    const arms = ['l', 'r'].map((s) => [b.bones[`upperarm_${s}`], wquat(b.bones[`upperarm_${s}`])]);
    for (const n of ['spine_01', 'spine_02', 'spine_03']) rotateWorld(b.bones[n], q);
    for (const [bone, wq] of arms) rotateWorld(bone, wq.multiply(wquat(bone).invert()));
  }

  /** The bat and both hands together, as one rigid piece: turned about the bottom grip (the barrel
      laid down or lifted in his wrists, about the line across the bat) and carried by a.hands. Each
      arm reaches its hand's new place (two bone IK, the elbow kept on its side) and the hand is
      turned as the bat is, so the bat never leaves either hand. */
  aimHands(b, u) {
    const w = this.aimWeight(b, u), a = b.aim, pre = b.aimPre;
    if (w <= 0 || !pre) return;
    // the capture's bat, turned in the wrists (yaw, then dip about the line across it) about the
    // bottom grip where the trunk has carried it, then moved by the hands
    const gb = this.grips(b).gb;
    const ax = UP.clone().applyQuaternion(pre.hands[0][2].clone().multiply(this.batLocal(b, u))), across = new THREE.Vector3().crossVectors(ax, UP);
    const R = new THREE.Quaternion().setFromAxisAngle(UP, THREE.MathUtils.degToRad(a.yaw) * w);
    if (across.lengthSq() > 1e-6) R.multiply(new THREE.Quaternion().setFromAxisAngle(across.normalize(), THREE.MathUtils.degToRad(a.dip) * w));
    const at = gb.add(a.hands.clone().multiplyScalar(w));
    for (const [s, hp, hq] of pre.hands) {
      const B = b.bones, sh = wpos(B[`upperarm_${s}`]), el = wpos(B[`lowerarm_${s}`]), hd = wpos(B[`hand_${s}`]);
      const pole = el.clone().add(el.clone().sub(sh.clone().lerp(hd, 0.5)).multiplyScalar(3));
      twoBoneIK(B[`upperarm_${s}`], B[`lowerarm_${s}`], B[`hand_${s}`], at.clone().add(hp.clone().sub(pre.gb).applyQuaternion(R)), pole, 1);
      rotateWorld(B[`hand_${s}`], R.clone().multiply(hq).multiply(wquat(B[`hand_${s}`]).invert()));
    }
  }

  /** Aim the swing at this pitch. At the frame that meets the ball (meetTime) the bat is put where the
      engine's result says the ball meets it: the sweet spot for a ball in play, the nearest of the
      barrel for a foul, a graze for a foul tip, and for a swing and a miss MISS over the top or under
      it. The bat's point there sits on the side of the ball it is struck from (the ball's surface on
      the wood, the way it leaves). Solved on the posed body (aimAt), the legs, trunk and wrists cheap
      and the hands dear. A pitch it cannot reach from the first frame tries the frames beside it. */
  aimSwing(b) {
    b.aimPoses = 0;
    const first = { meet: b.meet, meetBall: b.meetBall };
    let best = null;
    for (const c of [first, ...(b.meetAlt || [])]) {
      b.meet = c.meet; b.meetBall = c.meetBall; b.tiltAt = b.tContact + c.meet;
      // (a frame beside one that reached the ball starts from its solution; one that did not, from
      // none: a solve stuck short of the ball sends the frames beside it short too)
      const r = this.aimAt(b, best && best.err < WARM_ERR ? best.solved : null);
      // the closest, and of two that both reach, the smaller aim (a centimetre short of the ball
      // outweighs any aim: one frame that misses must never win over one that reaches)
      const score = Math.max(0, r.err - 0.004) * MISS_COST + r.size;
      if (!best || score < best.score) best = { score, c, aim: b.aim, err: r.err, poses: b.aimPoses, solved: r.solved };
      if ((r.err < 0.006 && r.size < 4) || b.aimPoses > AIM_POSES * 0.6) break;
    }
    b.meet = best.c.meet; b.meetBall = best.c.meetBall; b.tiltAt = b.tContact + best.c.meet;
    b.aim = best.aim; b.aimErr = best.err;
  }

  /** The sweet spot's path along his swing (capture time, without the aim or the launch tilt): its
      length run so far every WHIP.d s, over every frame a pitch's warped clock can reach near
      contact. Posed once per hitter and swing, like meetPath. */
  speedPath(b) {
    if (b.speedPath) return b.speedPath;
    const W = meetWindow(b), dur = b.clips[b.clip].duration, d = WHIP.d;
    const lo = Math.max(0, b.tContact + W[0] - WHIP.reach), hi = Math.min(dur, b.tContact + W[1] + WHIP.reach);
    const tilt = b.batTilt, aim = b.aim;
    b.batTilt = 0; b.aim = null;
    const L = [0], s = new THREE.Vector3(), prev = new THREE.Vector3();
    for (let x = lo, i = 0; x <= hi + d / 2; x += d, i++) {
      this.swingPose(b, x);
      s.set(0, SWEET, 0).applyMatrix4(b.bat.matrixWorld);
      if (i) L.push(L[i - 1] + s.distanceTo(prev));
      prev.copy(s);
    }
    b.batTilt = tilt; b.aim = aim;
    return (b.speedPath = { lo, d, L });
  }

  /** The swing's warped clock for this pitch (swingClock). Near contact (WHIP.blend either side, on
      the clock) the capture is run along the bat's own path so the sweet spot moves at a real swing's
      speed: rising over the last 0.15 s to WHIP.mph at the frame that meets the ball, falling through
      the finish. Out from there his capture plays at its own pace, slowed through the load and stride
      (and the finish) by sin squared windows: the load's is as deep as it must be for the contact frame
      to play on time; the finish's gives back WHIP.back of what was gained after contact. Every pose is
      his own capture's; only when each plays changes. A swing whose load cannot give back the time
      over WHIP.floor of its own pace is run a little slower through the ball instead. */
  whipSwing(b) {
    const P = this.speedPath(b), u = b.tContact + b.meet, Vt = WHIP.mph / 2.23694, n = P.L.length - 1;
    const Lat = (x) => { const f = THREE.MathUtils.clamp((x - P.lo) / P.d, 0, n), i = Math.min(n - 1, Math.floor(f)); return P.L[i] + (P.L[i + 1] - P.L[i]) * (f - i); };
    // the capture's own speed there (its keys are 30 a second and the bat's speed is lumpy from one
    // to the next, so it is the local speed: the bat itself then runs smoothly, the body taking the
    // lumps, at most a frame of a phone's at full speed), times how much faster the bat runs aimed
    // than in his own swing (the aim turns the bat in his wrists, up to 55 degrees for a low pitch,
    // which changes how fast its sweet spot sweeps). That ratio is measured on his aimed swing posed
    // WHIP.near either side of the frame that meets the ball, between the same samples as the path,
    // and held at its ends beyond
    const e = P.d / 2, nn = Math.round(WHIP.near / P.d), ratio = [];
    let prev = null;
    for (let j = -nn; j <= nn; j++) {
      this.swingPose(b, u + j * P.d);
      const s = new THREE.Vector3(0, SWEET, 0).applyMatrix4(b.bat.matrixWorld);
      if (prev) {
        const own = (Lat(u + j * P.d) - Lat(u + (j - 1) * P.d)) / P.d;
        ratio.push(own > 0.3 ? THREE.MathUtils.clamp(s.distanceTo(prev) / P.d / own, 0.3, 3) : 1);
      }
      prev = s;
    }
    // (ratio[i] is for the sample from u + (i - nn) d to the next: centred at u + (i - nn + 0.5) d)
    const rhoAt = (x) => { const f = THREE.MathUtils.clamp((x - u) / P.d + nn - 0.5, 0, ratio.length - 1), i = Math.min(ratio.length - 2, Math.floor(f)); return ratio[i] + (ratio[i + 1] - ratio[i]) * (f - i); };
    const V = (x) => Math.max(0.3, (Lat(x + e) - Lat(x - e)) / (2 * e) * rhoAt(x));
    const rho = rhoAt(u);
    const h = WHIP.h, A = WHIP.pre, B = WHIP.post;
    const bump = (z) => { z = Math.min(1, Math.abs(z)); const q = 1 - z * z; return q * q * q; };
    const win = (x, x0, len) => { const s = Math.sin(Math.PI * clamp01((x - x0) / len)); return s * s; };
    // the clock's rate (capture seconds per second) at clock x, capture w, on the side dir of contact
    const rate = (x, w, m, sc, dir) => {
      const t = x - u, side = dir < 0 ? 0 : 1, be = bump(t / WHIP.blend[side]);
      const base = 1 - m * (dir < 0 ? win(x, u - A, A) : win(x, u, B));
      const S = sc * Vt * Math.exp(-((t / WHIP.sigma[side]) ** 2));
      return Math.min(WHIP.gmax, (1 - be) * base + (be > 0 ? be * S / V(w) : 0));
    };
    // from u out to len either side (midpoint steps): the capture time at each step
    const run = (dir, len, m, sc) => {
      const out = [u];
      let w = u;
      for (let i = 1, N = Math.round(len / h); i <= N; i++) {
        const x = u + dir * (i - 1) * h, g0 = rate(x, w, m, sc, dir);
        w += dir * h * rate(x + dir * h / 2, w + dir * g0 * h / 2, m, sc, dir);
        out.push(w);
      }
      return out;
    };
    const solve = (f, lo, hi) => { for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (f(mid) > 0) hi = mid; else lo = mid; } return (lo + hi) / 2; };
    // before contact: the load's window as deep as it must be (it may also hurry a slow load: m < 0)
    const mMax = 1 - WHIP.floor, endPre = (m, sc) => { const r = run(-1, A, m, sc); return r[r.length - 1] - (u - A); };
    let sc = 1, m;
    if (endPre(mMax, 1) < 0) sc = solve((s) => -endPre(mMax, s), 0.2, 1);   // (endPre falls as sc rises)
    m = solve((mm) => endPre(mm, sc), -1, mMax);
    const pre = run(-1, A, m, sc);
    // (the last few microseconds left over are spread along it, so u - A is exact)
    const err = pre[pre.length - 1] - (u - A);
    for (let i = 0; i < pre.length; i++) pre[i] -= err * i / (pre.length - 1);
    // after contact: the finish's window gives back WHIP.back of what was gained
    const endPost = (mm) => { const r = run(1, B, mm, sc); return r[r.length - 1] - (u + B); };
    const gained = endPost(0);
    const mb = gained > 0 ? solve((mm) => (1 - WHIP.back) * gained - endPost(mm), 0, mMax) : 0;
    const post = run(1, B, mb, sc);
    b.whip = { u, A, B, h, table: pre.reverse().concat(post.slice(1)), off: post[post.length - 1] - (u + B), mph: sc * WHIP.mph, m, mb, rho, k: rate(u, u, m, sc, 1) };
    // foot strike on the clock (where the warped capture reaches it), for the hips' lead
    const tS = b.chain && b.chain.tStrike;
    b.whip.xs = tS == null ? null : tS <= u - A ? tS : (() => { let lo = u - A, hi = u; for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (this.swingClock(b, mid) < tS) lo = mid; else hi = mid; } return (lo + hi) / 2; })();
  }

  /** The capture time of his hips and legs at clock time x, on a warped swing: ahead of the rest
      from foot strike (in over WHIP.hips.in), then back to the rest over the last WHIP.hips.out
      before contact, so they brake into the ball and the contact frame is his own. A real swing's
      pelvis peaks 30 to 50 ms before the trunk; the capture's own gap (33 ms of capture time) is cut
      by the clock's speed through the turn (k), so they lead by what it took away: WHIP.hips.lead
      times 1 - 1/k (a whiff's capture is already quick, and gets little). Not before foot strike:
      the planted feet are planned on the capture's own clock, and a leg landing ahead of its plan is
      pulled back to it, a kick the head shows. Undefined when they are with the rest. */
  swingHips(b, x) {
    const w = b.whip, H = WHIP.hips;
    if (!w || w.xs == null || x <= w.xs || x >= w.u) return undefined;
    // (smootherstep in and out: its acceleration is continuous too, so the spine carries no kick)
    const s5 = (q) => q * q * q * (q * (6 * q - 15) + 10);
    const d = H.lead * (1 - 1 / Math.max(1, w.k)) * s5(clamp01((x - w.xs) / H.in)) * (1 - s5(clamp01((x - (w.u - H.out)) / H.out)));
    return d > 1e-6 ? this.swingClock(b, x + d) : undefined;
  }

  /** Capture time for clock time x (both on update's ct): the identity before WHIP.pre ahead of the
      contact frame, the warped table through it, and a constant lead after WHIP.post. */
  swingClock(b, x) {
    const w = b.whip;
    if (!w) return x;
    if (x <= w.u - w.A) return x;
    if (x >= w.u + w.B) return x + w.off;
    const f = (x - (w.u - w.A)) / w.h, i = Math.min(w.table.length - 2, Math.floor(f));
    return w.table[i] + (w.table[i + 1] - w.table[i]) * (f - i);
  }

  /** The aim from one meet frame (b.meet, b.meetBall): sets b.aim, returns how near and how much. */
  aimAt(b, warm) {
    const pt = this.pitch, m = this.m, f = pt.f;
    const u = b.tContact + b.meet, sB = f.T + b.meetBall;
    const ball = pt.pointAt(sB), vel = pt.pointAt(sB + 0.002).sub(ball).normalize();
    const lefty = b.lefty, IN = 0.0254;
    const ip = this.play && this.play.inPlay;
    const kind = m.miss ? 'miss' : m.ball === 'tip' ? 'tip' : m.ball === 'play' ? 'play' : 'foul';
    // the way the ball leaves (catcher's view feet to the scene, as pitch.js setAfter launches it)
    let out = null;
    if (kind === 'play' || kind === 'foul') {
      const la = THREE.MathUtils.degToRad(kind === 'play' ? ip?.la ?? 10 : m.ball === 'back' ? 62 : ip?.la ?? 8);
      const sp = THREE.MathUtils.degToRad(kind === 'play' ? ip?.spray ?? 0 : m.ball === 'back' ? 180 + (lefty ? -12 : 12) : (lefty ? 1 : -1) * 54);
      out = P(Math.cos(la) * Math.sin(sp), Math.cos(la) * Math.cos(sp), Math.sin(la)).normalize();
    }
    // over the top of a low or breaking pitch, under a high one
    const zb = this.facts.batter, zn = (pt.actual.z - zb.szBot) / Math.max(0.1, zb.szTop - zb.szBot);
    const pfz = this.play && this.play.pfxZ != null ? this.play.pfxZ : 0;
    const over = zn < 0.55 || pfz < -0.25;
    b.aim = { u, u0: b.chain ? Math.min(b.chain.tTop, u - 0.2) : u - 0.4, drop: 0, side: 0, lean: 0, dip: 0, yaw: 0, shift: 0, hands: new THREE.Vector3() };
    const a = b.aim, perp = (v, axis) => v.clone().addScaledVector(axis, -v.dot(axis));
    // where on the bat it is met (inches from the knob): the sweet spot, sliding along the barrel
    // only as far as it must; a foul or a tip anywhere on the barrel
    const yLo = kind === 'play' || kind === 'miss' ? 22.5 : 18, yHi = kind === 'miss' ? 28 : 33;
    // the error at the meet frame: from the bat's point to where it must be (on the ball's side)
    // A solve pose is light: his swing at u is posed once and put back each time, then only what
    // moves the bat is redone (the aim, the legs' reach, the bat). The feet, collar bones and
    // deltoids leave the hands where they are, so the full pose is only checked at the end, and any
    // small difference it makes is solved away (bias).
    let base = null;
    const bias = new THREE.Vector3();
    const errAt = (yT, full = false) => {
      b.aimPoses++;
      if (full) this.swingPose(b, u);
      else {
        if (!base) { this.swingBase(b, u); base = b.bind.map(([bone]) => [bone, bone.position.clone(), bone.quaternion.clone()]); }
        else { for (const [bone, bp, bq] of base) { bone.position.copy(bp); bone.quaternion.copy(bq); } b.root.updateMatrixWorld(true); }
        b.batTime = u;
        this.aimBody(b, u);
        reach(b, b.feetSwing, u);
        this.aimHands(b, u);
        this.poseBat(b);
      }
      const axis = UP.clone().applyQuaternion(b.bat.quaternion), knob = b.bat.position;
      let n;
      if (out) n = perp(out, axis).normalize().add(perp(vel, axis).normalize().multiplyScalar(-0.6));
      else n = perp(UP, axis).normalize().multiplyScalar(kind === 'miss' && over ? -1 : 1).add(kind === 'tip' ? perp(vel, axis).normalize().multiplyScalar(-0.3) : new THREE.Vector3());
      n = perp(n, axis).normalize();
      const dist = kind === 'miss' ? MISS : batRadius(yT * IN) + R_BALL - (kind === 'tip' ? TIP : 0);
      const e = ball.clone().addScaledVector(n, -dist).sub(knob.clone().addScaledVector(axis, yT * IN));
      return { e: full ? e : e.add(bias), axis };
    };
    // The parameters, each in units of what reads as an ordinary amount of it (S), within its range
    // (LO, HI). Solved by damped least squares from none of it: the smallest aim, so measured, that
    // puts the bat on the ball. The legs, trunk and wrists come cheap, the hands dear (the arms are
    // near straight at contact, and pulling them is what made #639 look wrong).
    const S = [0.08, 12, 10, 25, 15, 0.05, 0.05, 0.05, 0.06, kind === 'play' ? 2.5 : 6];
    const LO = [0, AIM.side[0], AIM.lean[0], AIM.dip[0], -AIM.yaw, -AIM.hands, -AIM.hands, -AIM.hands, AIM.shift[0], yLo];
    const HI = [AIM.drop, AIM.side[1], AIM.lean[1], AIM.dip[1], AIM.yaw, AIM.hands, AIM.hands, AIM.hands, AIM.shift[1], yHi];
    // (the last is from the sweet spot)
    const y0 = SWEET / IN;
    LO[9] -= y0; HI[9] -= y0;
    // (a frame beside one already solved starts from that solution and its Jacobian)
    const p = warm ? warm.p.slice() : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const set = (v) => { a.drop = v[0]; a.side = v[1]; a.lean = v[2]; a.dip = v[3]; a.yaw = v[4]; a.hands.set(v[5], v[6], v[7]); a.shift = v[8]; };
    let mu = 1e-4, J = warm ? warm.J.map((c) => c.clone()) : null;
    const M = new THREE.Matrix3(), N = p.length;
    // the Jacobian by a step of a tenth of each (in the scaled units), the last column exact; then
    // kept up to date by Broyden's rule from each step taken, so a pitch costs some 20 poses
    const jacobian = () => {
      J = [];
      for (let i = 0; i < N - 1; i++) {
        const q = p.slice(); q[i] += 0.1 * S[i] * (p[i] + 0.1 * S[i] > HI[i] ? -1 : 1);
        set(q);
        J.push(errAt(y0 + p[9]).e.sub(cur.e).multiplyScalar(S[i] / (q[i] - p[i])));
      }
      J.push(cur.axis.clone().multiplyScalar(-S[9] * IN));
    };
    let cur, fresh = false;
    const solve = () => {
      set(p);
      cur = errAt(y0 + p[9]);
      for (let it = 0; it < 24 && cur.e.length() > 0.003 && mu < 1 && b.aimPoses < AIM_POSES - 10; it++) {
        if (!J) { jacobian(); fresh = true; }
        // q_new = -J^T (J J^T + mu I)^-1 (e - J q): the smallest aim (in the scaled units) that the
        // linear model says puts the bat on the ball, each kept within its range
        // (an active set: a parameter the solution pushes past its range is held at the limit and the
        // rest solved again, so the others take up what it cannot)
        const qv = p.map((v, i) => v / S[i]), fixed = new Array(N).fill(null);
        let want = null;
        for (let pass = 0; pass < 4; pass++) {
          const r = cur.e.clone();
          J.forEach((c, i) => r.addScaledVector(c, (fixed[i] != null ? fixed[i] / S[i] : 0) - qv[i]));
          const e = M.set(0, 0, 0, 0, 0, 0, 0, 0, 0).elements;
          J.forEach((c, j) => { if (fixed[j] != null) return; const v = [c.x, c.y, c.z]; for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) e[k * 3 + i] += v[i] * v[k]; });
          e[0] += mu; e[4] += mu; e[8] += mu;
          const y = r.applyMatrix3(M.invert());
          const raw = p.map((_, i) => (fixed[i] != null ? fixed[i] : -J[i].dot(y) * S[i]));
          let more = false;
          want = raw.map((v, i) => {
            const c = THREE.MathUtils.clamp(v, LO[i], HI[i]);
            if (fixed[i] == null && c !== v) { fixed[i] = c; more = true; }
            return c;
          });
          if (!more) break;
        }
        const hl = Math.hypot(want[5], want[6], want[7]);
        if (hl > AIM.hands) for (const i of [5, 6, 7]) want[i] *= AIM.hands / hl;
        set(want);
        const next = errAt(y0 + want[9]);
        if (next.e.length() < cur.e.length()) {
          // Broyden: J += (de - J dq) dq^T / |dq|^2, in the scaled units
          const dq = want.map((v, i) => (v - p[i]) / S[i]), dd = dq.reduce((t, v) => t + v * v, 0);
          if (dd > 1e-12) {
            const res = next.e.clone().sub(cur.e);
            J.forEach((c, i) => res.addScaledVector(c, -dq[i]));
            J.forEach((c, i) => { if (i < N - 1) c.addScaledVector(res, dq[i] / dd); });
          }
          p.splice(0, N, ...want);
          cur = next;
          mu = Math.max(1e-5, mu / 3);
          fresh = false;
        } else if (!fresh) J = null;            // (a stale model: measure it again)
        else mu *= 8;                            // (a fresh one: a shorter, more cautious step)
      }
    };
    solve();
    // the full pose; what it differs by from the light one is solved away (twice at most)
    for (let k = 0; k < 2; k++) {
      set(p);
      const fe = errAt(y0 + p[9], true).e;
      if (fe.length() < 0.004) break;
      bias.add(fe.sub(errAt(y0 + p[9]).e));
      mu = 1e-4;
      solve();
    }
    set(p);
    cur = errAt(y0 + p[9], true);
    a.yT = y0 + p[9];
    // how much aim it took, in the scaled units (one is an ordinary amount of each)
    return { err: cur.e.length(), size: Math.sqrt(p.reduce((t, v, i) => t + (v / S[i]) ** 2, 0)), solved: J && { p: p.slice(), J } };
  }

  /** The bat's turn in the bottom hand at capture time u (poseBat's track). */
  batLocal(b, u) {
    const ct = THREE.MathUtils.clamp(u ?? 0, 0, b.clips[b.clip].duration);
    const f = ct / b.batDt, i = Math.min(b.batTrack.length - 2, Math.floor(f));
    return b.batTrack[i].clone().slerp(b.batTrack[i + 1], Math.min(1, f - i));
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

  /** The bat in his hands, as a turn in the bottom hand's frame for every 1/60 s of the clip (the
      capture has no bat). It runs from the bottom grip through the top one. Where the hands come
      together that line says little (two grips a few cm apart turn it anywhere: the bat flipped
      upright after contact), so it is held toward his grip there; after the top hand lets go the bat
      stays as it was in the bottom hand. Lightly smoothed. Also finds tContact, the swing's anchor. */
  bakeBat(b) {
    const clip = b.clips[b.clip], dt = 1 / 60;
    // every sample: the line from the bottom grip to the top one, in the bottom hand's frame, and
    // when the top hand lets go (the grips more than GRIP_OFF apart: on the bat they stay 6 to 18 cm)
    const S = [];
    let tOff = Infinity;
    for (let t = 0; t <= clip.duration + 1e-6; t += dt) {
      pose(b, { [b.clip]: [t, 1] });
      const { gb, gt, handQ } = this.grips(b);
      if (tOff === Infinity && gb.distanceTo(gt) > GRIP_OFF) tOff = t;
      S.push({ t, d: gt.clone().sub(gb).applyQuaternion(handQ.clone().invert()) });
    }
    // his grip: the one line through the bottom fist that the top grip stays nearest while both
    // hands are on (the principal direction of the hand to hand line, weighted by its length
    // squared, so the long, sure lines count most)
    const both = S.filter((s) => s.t < tOff);
    const grip = new THREE.Vector3();
    for (const s of both) grip.add(s.d);
    for (let k = 0; k < 24; k++) {
      const n = new THREE.Vector3();
      for (const s of both) n.addScaledVector(s.d, s.d.dot(grip));
      grip.copy(n.lengthSq() > 1e-12 ? n.normalize() : UP);
    }
    // each sample: the hand to hand line, turned toward his grip as the hands close up (half way at
    // a GRIP_HOLD gap). As the top hand lets go the bat stays as it was in the bottom hand, taken
    // over in GRIP_LET seconds from just before the break
    const toward = (dir, to, w) => {
      const ax = new THREE.Vector3().crossVectors(dir, to);
      if (ax.lengthSq() > 1e-12) dir.applyAxisAngle(ax.normalize(), dir.angleTo(to) * w);
      return dir;
    };
    const held = S.map((s) => {
      const sep = s.d.length();
      const dir = sep > 1e-6 ? s.d.clone().divideScalar(sep) : grip.clone();
      return toward(dir, grip, 1 / (1 + Math.pow(sep / GRIP_HOLD, 4)));
    });
    const tLet = tOff - GRIP_LET / 2;
    const kept = held[Math.max(0, Math.min(held.length - 1, Math.round(tLet / dt)))];
    const raw = held.map((dir, i) => {
      const k = smooth(clamp01((S[i].t - tLet) / GRIP_LET));
      return new THREE.Quaternion().setFromUnitVectors(UP, k > 0 ? toward(dir.clone(), kept, k) : dir);
    });
    for (let i = 1; i < raw.length; i++) if (raw[i].dot(raw[i - 1]) < 0) raw[i].set(-raw[i].x, -raw[i].y, -raw[i].z, -raw[i].w);
    const W = 6;
    b.batTrack = raw.map((_, i) => {
      const acc = new THREE.Vector4(0, 0, 0, 0);
      for (let k = -W; k <= W; k++) {
        const q = raw[Math.min(raw.length - 1, Math.max(0, i + k))], w = Math.exp(-(k * k) / (2 * GRIP_SMOOTH * GRIP_SMOOTH));
        acc.x += q.x * w; acc.y += q.y * w; acc.z += q.z * w; acc.w += q.w * w;
      }
      return new THREE.Quaternion(acc.x, acc.y, acc.z, acc.w).normalize();
    });
    b.batDt = dt;
    // tContact, the swing's anchor: the take, the check swing, the chain and the finish are timed
    // from it. Not where the bat meets the ball (meetTime finds that from the barrel's path, 0.04 to
    // 0.25 s later). It is the fastest barrel at the capture's 30 Hz, skipping frames where the bat
    // turns over 0.45 rad: that skips some real fast frames too, but moving the anchor would retime
    // every take
    let best = 0, bestT = clip.duration * 0.6, prev = null, prevAx = null;
    for (let t = 0.9; t < clip.duration - 0.3; t += 1 / 30) {
      pose(b, { [b.clip]: [t, 1] });
      // (the bat at this frame: poseBat would take b.batTime, which still holds the last pitch's)
      b.batTime = t;
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
      const w = Math.exp(-Math.pow(((b.tiltClock ?? ct) - (b.tiltAt ?? b.tContact)) / 0.09, 2));
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
      // the take's clock (capture time): what he stands in while the pitch is aimed. A swing puts
      // its contact frame (tContact + meet) on the moment the ball is met (meetBall, from the
      // plate's front edge: meetTime), so it runs up to 0.3 s ahead of the take. It starts on the
      // take's clock and gains that lead through his stance and stride, all of it by the time his
      // front foot lands, so nothing jumps when the pitch starts and the bat path is the capture's
      let ct = t - pt.tPlate + b.tContact;
      if (!b.take) {
        const lead = (b.meet || 0) - (b.meetBall ?? this.m.contactShift);
        const tMeet = pt.tPlate + (b.meetBall ?? this.m.contactShift);
        const tE = Math.max(0.2, Math.min(pt.tPlate + b.chain.tStrike - b.tContact - lead, tMeet - 0.1));
        ct += lead * smooth(clamp01(t / tE));
      }
      if (!b.take) {
        // a real hitter holds his finish: time slows to a near hold at the end of the swing (each
        // capture is cut at its finish); a swing and miss plays on through his reaction
        const dur = b.clips[b.clip].duration;
        const hold = b.clip.startsWith('miss') ? dur - 0.05 : Math.min(b.tContact + 0.42, dur - 0.05);
        // his capture on the swing's warped clock (swingClock): slow load, fast through the ball
        const cs = this.swingClock(b, ct);
        // (it comes into the hold at the clock's own rate and slows from there to the capture's last
        // frame, with no kink: at full bat speed a kink there is the bat hitting a wall)
        const tau = Math.max(0.02, Math.min(0.18, dur - 1e-3 - hold));
        const cw = cs < hold ? cs : hold + tau * (1 - Math.exp(-(cs - hold) / tau));
        // (the bat's launch tilt eases in and out on the clock, not the capture: as it always has)
        b.tiltClock = ct;
        this.swingPose(b, cw, this.swingHips(b, ct));
        b.tiltClock = null;
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
      pt.setAfter(m.ball, pt.f.T + (b.meetBall ?? m.contactShift), { inPlay: this.play && this.play.inPlay, lefty: b.lefty });
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
