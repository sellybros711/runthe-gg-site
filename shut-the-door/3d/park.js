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

/** The pitcher's eye in the set, a right hander on the rubber; framed toward the hitter's side of
    the plate (a left handed hitter stands on the catcher's right). The preset frame is 6.6 ft wide
    at the plate on a phone held upright, 15 ft on a wide screen. A page can fit the frame to the
    people instead (eye.fit = { x, z, fw }: the look point on the plate, in feet, and the width). */
export function pitcherEye(camera) {
  const eye0 = P(-0.45, 59.2, 6.05), eye1 = P(-0.75, 56.6, 5.55);
  const look = new THREE.Vector3();
  let side = 1, W = 1, H = 1;
  const eye = {
    widths: { tall: 6.6, wide: 15 },
    fit: null,
    setSide(bats) { side = bats === 'R' ? -1 : 1; eye.fit = null; },
    preset() {
      return W > H ? { x: 0.6 * side, z: 2.7, fw: eye.widths.wide } : { x: 0.85 * side, z: 3.4, fw: eye.widths.tall };
    },
    get frame() { return eye.fit || eye.preset(); },
    resize(w, h) {
      W = w; H = h;
      const f = eye.frame;
      look.copy(P(f.x, 0, f.z));
      camera.aspect = w / h;
      const d = eye0.distanceTo(look);
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan((f.fw * FT) / 2 / camera.aspect / d));
      camera.updateProjectionMatrix();
    },
    update(t) {
      // the delivery: the head drifts forward and down until release, then settles
      const k = smooth(THREE.MathUtils.clamp((t - 0.05) / 0.75, 0, 1));
      camera.position.lerpVectors(eye0, eye1, k * 0.35);
      camera.lookAt(look);
      camera.updateMatrixWorld();
    },
  };
  return eye;
}
