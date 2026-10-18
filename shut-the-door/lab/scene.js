/* Shut The Door 3D lab: one pitch from the pitcher's eye.
 *
 *   index.html            the swing: Yamamoto's splitter, Varsho's side chases it
 *   index.html?take=1     the take: the curveball, called strike
 *   &t=1.2                freeze at a moment (seconds from the set), for screenshots
 *   &stats=1              frame rate in the corner
 *
 * Coordinates: the world is in metres, y up. The plate is at the origin; Statcast's catcher view
 * (x to the catcher's right, y toward the mound, z up, feet) maps through P() below, so the mirror
 * for the pitcher's view falls out of the camera, never out of the data.
 */
import * as THREE from 'three';
import { preload } from './load.js?v=2';
import { buildField } from './field.js?v=2';
import { buildStands } from './stands.js?v=2';
import { People } from './people.js?v=7';
import { Pitch } from './pitch.js?v=2';
import { FT, P, smooth } from './units.js?v=1';

const Q = new URLSearchParams(location.search);
const MODE = Q.get('take') === '1' ? 'take' : 'swing';
const FREEZE = Q.has('t') ? parseFloat(Q.get('t')) : null;

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const DPR = Math.min(window.devicePixelRatio || 1, Q.has('dpr') ? parseFloat(Q.get('dpr')) : 2);
renderer.setPixelRatio(DPR);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(10, 1, 0.05, 900);
const T0 = performance.now();
// index.html may already have recorded the poster's paint here
const lab = (window.__lab = Object.assign(window.__lab || {}, { mode: MODE, ready: false, frames: 0, t: 0, firstFrameMs: null }));
// start every download now, before anything else runs
const assets = preload();

async function main() {
  const mark = (n) => { (lab.marks ??= {})[n] = Math.round(performance.now()); };
  mark('start');
  // the park first: it needs nothing from the network but its small textures
  scene.background = new THREE.Color(0x8fa6bf);
  scene.backgroundRotation.y = SUN.envRot;
  scene.fog = new THREE.Fog(0xb9c2c8, 90, 420);
  addSun();
  const tex = new THREE.TextureLoader();
  buildField(scene, tex, renderer);
  const stands = buildStands(scene, tex, renderer);
  mark('park');
  const { facts, env, gltfs } = await assets;
  mark('assets');
  // the HDRI lights the scene; its sun is turned to come from the third base side, a little behind
  // the plate (late afternoon light across the batter's face)
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(env).texture;
  scene.environmentRotation.y = SUN.envRot;
  scene.environmentIntensity = 0.45;
  const pitch = new Pitch({ scene, facts, mode: MODE });
  const people = new People({ scene, facts, mode: MODE, pitch });
  people.setup(gltfs);
  mark('people');
  lab.people = people; lab.pitch = pitch; lab.THREE = THREE;
  // for pipeline/check-deform.mjs: pose everyone at a moment without drawing a frame
  lab.poseAt = (t) => { pitch.update(t, camera); people.update(t, 0); };
  lab.times = { release: pitch.tRel, flight: pitch.f.T, plate: pitch.tPlate, catch: pitch.tCatch };

  const shot = setupCamera(facts);
  const update = (t, dt) => {
    shot.update(t);
    pitch.update(t, camera);
    people.update(t, dt);
    stands.userData.tick(t);
  };
  // pose the first moment and compile every shader before the first frame, without blocking
  update(FREEZE ?? 0, 0);
  await renderer.compileAsync(scene, camera);
  mark('compiled');
  start(update, () => shot.resize());
}

/* The sun. In the HDRI it sits at u 0.352, 15 degrees up. Three looks the environment up at
   Ry(-rot) * dir, and its equirect u is atan2(z, x) / 2pi + 0.5, so a texel at azimuth a shows at
   world azimuth a - rot. SUN.az is where we want it: from the third base side, a little behind the
   plate (late afternoon light across a left handed batter's face). */
const SUN = { u: 0.352, el: 15, az: THREE.MathUtils.degToRad(-22), lift: 22 };
SUN.envRot = (SUN.u - 0.5) * Math.PI * 2 - SUN.az;
function addSun() {
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
  const sky = new THREE.HemisphereLight(0xbcd2ff, 0x5a4a35, 0.25);
  scene.add(sky);
}

function setupCamera(facts) {
  const cam = Q.get('cam') || 'pitcher';
  // the pitcher's eye in the set: a right hander on the rubber, a stride's lean forward at release
  const eye0 = P(-0.45, 59.2, 6.05), eye1 = P(-0.75, 56.6, 5.55);
  const lookP = P(0.85, 0, 3.4), lookL = P(0.6, 0, 2.7);
  const look = new THREE.Vector3();
  function frameWidthFt() { return innerWidth > innerHeight ? 15 : 6.6; }
  function resize() {
    look.copy(innerWidth > innerHeight ? lookL : lookP);
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    const d = eye0.distanceTo(look);
    const halfW = (frameWidthFt() * FT) / 2;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(halfW / camera.aspect / d));
    if (cam === 'side') camera.fov = 22;
    if (cam === 'free') camera.fov = parseFloat(Q.get('fov') || 30);
    camera.updateProjectionMatrix();
  }
  function update(t) {
    if (cam === 'side') { camera.position.copy(P(-14, 1.5, 4)); camera.lookAt(P(1.5, 0, 3)); return; }
    if (cam === 'free') {
      const v = (Q.get('pos') || '0,20,6').split(',').map(Number), l = (Q.get('at') || '0,0,3').split(',').map(Number);
      camera.position.copy(P(...v)); camera.lookAt(P(...l)); return;
    }
    // the delivery: the head drifts forward and down until release, then settles
    const k = smooth(THREE.MathUtils.clamp((t - 0.05) / 0.75, 0, 1));
    camera.position.lerpVectors(eye0, eye1, k * 0.35);
    camera.lookAt(look);
  }
  resize();
  return { update, resize };
}

function start(update, resize) {
  addEventListener('resize', resize);
  resize();
  const clock = { last: performance.now(), t: FREEZE ?? 0, playing: FREEZE == null };
  lab.setTime = (t) => { clock.t = t; clock.playing = false; };
  lab.play = (t = 0) => { clock.t = t; clock.playing = true; };
  const hint = document.getElementById('hint');
  canvas.addEventListener('click', () => { if (clock.t > 2.6) { lab.play(0); hint.classList.add('off'); } });
  const stats = Q.has('stats') ? makeStats() : null;
  const LOOP = 3.6;
  function frame(now) {
    const dt = Math.min(0.05, (now - clock.last) / 1000);
    clock.last = now;
    if (clock.playing) {
      clock.t += dt;
      if (clock.t > LOOP && !Q.has('once')) clock.t = Q.has('loop') ? 0 : LOOP;
      if (clock.t >= LOOP - 0.01 && !Q.has('loop')) hint.classList.remove('off');
    }
    lab.t = clock.t;
    const a = performance.now();
    update(clock.t, clock.playing ? dt : 0);
    const b = performance.now();
    renderer.render(scene, camera);
    const c = performance.now();
    lab.frames++;
    // per frame costs: the scene update (animation, IK, bat; pure JS) and the render submission
    lab.updMs = (lab.updMs ?? (b - a)) * 0.9 + (b - a) * 0.1;
    lab.rndMs = (lab.rndMs ?? (c - b)) * 0.9 + (c - b) * 0.1;
    lab.calls = renderer.info.render.calls; lab.tris = renderer.info.render.triangles;
    // a phone that cannot hold 30 fps at its full pixel ratio drops to a lower one (never below 1)
    if (!Q.has('dpr') && clock.playing) {
      const ft = (lab.ft = (lab.ft ?? 16) * 0.95 + dt * 1000 * 0.05);
      lab.since = (lab.since ?? 0) + 1;
      if (lab.since > 90 && ft > 36 && renderer.getPixelRatio() > 1) {
        renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() - 0.25)); resize(); lab.ft = 16; lab.since = 0;
      }
    }
    if (lab.firstFrameMs == null) {
      lab.firstFrameMs = performance.now() - T0;
      lab.readyMs = performance.now();
      if (lab.firstPaintMs == null) lab.firstPaintMs = lab.readyMs;
      // the live scene takes over from the poster
      document.getElementById('load').classList.add('off');
      canvas.classList.add('on');
      lab.ready = true;
    }
    if (stats) stats(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function makeStats() {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:6px;top:6px;font:12px monospace;color:#fff;background:rgba(0,0,0,.5);padding:2px 5px;z-index:9';
  document.body.appendChild(el);
  let n = 0, t0 = performance.now();
  return (now) => { n++; if (now - t0 > 1000) { el.textContent = `${Math.round(n * 1000 / (now - t0))} fps`; n = 0; t0 = now; } };
}

main().catch((e) => { console.error(e); document.getElementById('note').textContent = 'Could not load the scene.'; });
