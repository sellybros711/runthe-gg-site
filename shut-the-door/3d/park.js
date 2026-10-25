/* The ballpark: renderer settings, the light, the field and the stands, and the pitcher's eye.
 * Shared by the game (stage.js) and the lab (lab/scene.js).
 */
import * as THREE from 'three';
import { buildField } from './field.js?v=6';
import { buildStands } from './stands.js?v=6';
import { P, FT, smooth } from './units.js?v=1';

export function makeRenderer(canvas, maxDpr = 2) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}

/** Can this browser draw the scene at all (WebGL 2 or 1)? The game falls back to its old drawing
    without it. */
export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
}

/* The sun. In the HDRI it sits at u 0.352, 15 degrees up. Three looks the environment up at
   Ry(-rot) * dir, and its equirect u is atan2(z, x) / 2pi + 0.5, so a texel at azimuth a shows at
   world azimuth a - rot. SUN.az is where we want it: from the third base side, a little behind the
   plate (late afternoon light across a left handed batter's face). */
export const SUN = { u: 0.352, el: 15, az: THREE.MathUtils.degToRad(-22), lift: 22 };
SUN.envRot = (SUN.u - 0.5) * Math.PI * 2 - SUN.az;

function addSun(scene) {
  // the HDRI's sun is low (15 degrees); the key light is raised for a hard mid afternoon light
  const el = THREE.MathUtils.degToRad(SUN.el + SUN.lift);
  const d = new THREE.Vector3(Math.cos(SUN.az) * Math.cos(el), Math.sin(el), Math.sin(SUN.az) * Math.cos(el));
  SUN.dir = d;
  const sun = new THREE.DirectionalLight(0xffdcb8, 5.0);
  sun.position.copy(d).multiplyScalar(40);
  sun.target.position.set(0, 0, -0.6);
  sun.castShadow = true;
  const S = 4.2;
  Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 10, far: 80 });
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0xbcd2ff, 0x5a4a35, 0.25));
}

/** The park itself, which needs nothing from the network but its small textures. */
export function buildPark(scene, renderer) {
  scene.background = new THREE.Color(0x8fa6bf);
  scene.backgroundRotation.y = SUN.envRot;
  scene.fog = new THREE.Fog(0xb9c2c8, 90, 420);
  addSun(scene);
  const tex = new THREE.TextureLoader();
  buildField(scene, tex, renderer);
  return { stands: buildStands(scene, tex, renderer) };
}

/** The HDRI lights the scene; its sun turned to come from the third base side, a little behind the
    plate (late afternoon light across the batter's face). */
export function lightFrom(scene, renderer, env) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(env).texture;
  scene.environmentRotation.y = SUN.envRot;
  scene.environmentIntensity = 0.45;
  pmrem.dispose();
}

/* THE PITCHER'S EYE. Where his eyes are, from the rule book and a body: he stands on the rubber
   (60 ft 6 in from the plate's back tip) on a mound 10 in high, his eyes about 6 ft up, so 6 ft 10 in
   over the field, a few inches in front of the rubber, on his own side of it (a righty on the third
   base side). The lens is the fitted frame (a narrow one: the hitter large on a phone). */
export const EYE = { y: 60.1, z: 6 + 10 / 12, x: 0.4 };
/* THE DELIVERY in first person: where his head goes after the throw, as offsets from the set (feet:
   lat toward his glove side, fwd toward the plate, up), a roll of the head (degrees, toward his glove
   side) and where his eyes are on the plate (feet up from the look point). Keyed on the play's clock,
   whose release is always at 0.8 s (pitch.js T_RELEASE): he rocks back on the leg lift, strides
   toward the plate and drops, lets go, his body bends over into the follow-through, then he comes up
   into his fielding stance. fwd is a share of his stride to release (fwdAt, from his own release
   extension). Small on purpose: the lens is long, so a tenth of a degree moves the zone, and the
   hitter and the zone stay put. */
const DELIVERY = [
  // t     lat    fwd    up     roll  look
  [0.00,  0.00,  0.00,  0.00,  0.0,  0.00],
  [0.30,  0.00, -0.05,  0.05, -0.5,  0.05],
  [0.62,  0.15,  0.62, -0.55,  0.7, -0.02],
  [0.80,  0.25,  1.00, -0.92,  1.2,  0.00],
  [1.02,  0.32,  1.13, -1.32,  1.6, -0.28],
  [1.40,  0.22,  1.08, -1.02,  0.6, -0.10],
];
/* A cubic through keys [t, ...values] with velocity carried through each key (Catmull-Rom on uneven
   times), so the head never stops dead at release. Holds the last key after it. */
export function spline(keys, t, out = []) {
  const n = keys.length, w = keys[0].length - 1;
  if (t <= keys[0][0]) { for (let j = 0; j < w; j++) out[j] = keys[0][j + 1]; return out; }
  if (t >= keys[n - 1][0]) { for (let j = 0; j < w; j++) out[j] = keys[n - 1][j + 1]; return out; }
  let i = 0;
  while (keys[i + 1][0] < t) i++;
  const a = keys[i], b = keys[i + 1], h = b[0] - a[0], s = (t - a[0]) / h;
  const slope = (k, j) => {
    // zero velocity at the first and last key (the set, and the stance he holds)
    if (k === 0 || k === n - 1) return 0;
    const p = keys[k - 1], q = keys[k + 1];
    return (q[j] - p[j]) / (q[0] - p[0]);
  };
  const s2 = s * s, s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  for (let j = 1; j <= w; j++) out[j - 1] = h00 * a[j] + h10 * h * slope(i, j) + h01 * b[j] + h11 * h * slope(i + 1, j);
  return out;
}
/** How far his head travels toward the plate by release, feet: his eyes end about 1.9 ft behind the
    ball as it leaves his hand (his own release extension, or the stand in), within reason. */
export function fwdAt(rel) {
  const y = rel && Number.isFinite(rel.y) ? rel.y : 54;
  return Math.max(3.2, Math.min(5.6, EYE.y - (y + 1.9)));
}
/** Is the delivery's head motion off (the player asked for less motion)? */
export function reducedMotion() {
  try { return !!(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
}

/** The pitcher's eye: framed toward the hitter's side of the plate (a left handed hitter stands on
    the catcher's right). The preset frame is 6.6 ft wide at the plate on a phone held upright, 15 ft
    on a wide screen. A page can fit the frame to the people instead (eye.fit = { x, z, fw }: the look
    point on the plate, in feet, and the width). The set is t = 0; after the throw update(t) moves
    his head through the delivery (DELIVERY), and back to the set by eye.settle (the end of the
    pitch, when the next one is set up: so the next set never jumps). reduced: no head motion. */
export function pitcherEye(camera) {
  const look = new THREE.Vector3(), lookAt = new THREE.Vector3(), v = [];
  let side = 1, hand = 1, W = 1, H = 1, fwd = fwdAt(null);
  const at = () => P(hand * -EYE.x, EYE.y, EYE.z);
  const eye = {
    widths: { tall: 6.6, wide: 15 },
    fit: null,
    settle: Infinity,
    reduced: null,
    setSide(bats) { side = bats === 'R' ? -1 : 1; eye.fit = null; },
    /** His throwing hand: a righty stands on the third base side of the rubber, his glove side is
        the first base side (catcher's view x > 0). */
    setHand(throws) { hand = throws === 'L' ? -1 : 1; },
    /** His release (pitch.js releaseOf): how far his head goes toward the plate. */
    setRelease(rel) { fwd = fwdAt(rel); },
    preset() {
      return W > H ? { x: 0.6 * side, z: 2.7, fw: eye.widths.wide } : { x: 0.85 * side, z: 3.4, fw: eye.widths.tall };
    },
    get frame() { return eye.fit || eye.preset(); },
    /** The set's eye point (world). */
    get set() { return at(); },
    resize(w, h) {
      W = w; H = h;
      const f = eye.frame;
      look.copy(P(f.x, 0, f.z));
      camera.aspect = w / h;
      const d = at().distanceTo(look);
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan((f.fw * FT) / 2 / camera.aspect / d));
      camera.updateProjectionMatrix();
    },
    /** The head's offsets at play time t: [lat, fwd, up, roll, look], the set at t <= 0. */
    offsets(t, out = []) {
      const red = eye.reduced == null ? reducedMotion() : eye.reduced;
      if (red || !(t > 0)) { out[0] = out[1] = out[2] = out[3] = out[4] = 0; return out; }
      spline(DELIVERY, t, out);
      // the stride is his own (fwdAt): the keys hold shares of it
      out[1] *= fwd;
      // back to the set by the end of the pitch (he stands up off the follow-through)
      const s0 = Math.max(1.45, eye.settle - 0.8), s1 = Math.max(s0 + 0.3, eye.settle - 0.1);
      if (t > s0) { const k = smooth(Math.min(1, (t - s0) / (s1 - s0))); for (let j = 0; j < 5; j++) out[j] *= 1 - k; }
      return out;
    },
    /** Put a camera where his eye is at play time t (the main one by default). */
    update(t, cam = camera) {
      eye.offsets(t, v);
      const [lat, f, up, roll, lk] = v;
      // glove side is the first base side for a righty (catcher's view x > 0)
      cam.position.copy(P(-hand * EYE.x + hand * lat, EYE.y - f, EYE.z + up));
      lookAt.copy(look);
      lookAt.y += lk * FT;
      cam.lookAt(lookAt);
      // the roll, toward his glove side (the screen's left for a righty)
      if (roll) cam.rotateZ(hand * THREE.MathUtils.degToRad(roll));
      cam.updateMatrixWorld();
    },
  };
  return eye;
}
