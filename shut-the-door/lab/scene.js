/* Shut The Door 3D lab: one pitch from the pitcher's eye.
 *
 *   index.html                 a pack's pitcher and one of his hitters, one pitch (play.js)
 *   ?pack=std-2016-ws7-chapman  any pack (assets/packs/index.json)   &slot=0..8 the hitter
 *   &play=ground               the play: swinging_strike, foul, foul_back, foul_tip, ground, line,
 *                              fly, popup, called_strike, ball, check, hit_by_pitch, dirt (take=1 is
 *                              called_strike)   &type=FF &cell=12 &mx= &mz= to change the pitch
 *   &t=1.2                     freeze at a moment (seconds from the set), for screenshots
 *   &stats=1                   frame rate in the corner
 *   &ip=single                 a ball in play followed into the field (inplay.js): the engine's result
 *                              label (single, double, triple, home_run, out, double_play, sac_fly,
 *                              fielders_choice, error), with &bb= &ev= &la= &spray= the batted ball,
 *                              &mv=0:1,1:3 the runners' moves (from:to, 4 scored, -1 out), &on=5 the
 *                              bases before (a bitmask), &outs= the outs after. The play= kind follows bb.
 *
 * Coordinates: the world is in metres, y up. The plate is at the origin; Statcast's catcher view
 * (x to the catcher's right, y toward the mound, z up, feet) maps through P() below, so the mirror
 * for the pitcher's view falls out of the camera, never out of the data.
 */
import * as THREE from 'three';
import { preload } from '../3d/load.js?v=8';
import { makeRenderer, buildPark, lightFrom, pitcherEye, SUN } from '../3d/park.js?v=6';
import { People } from '../3d/people.js?v=40';
import { Pitch } from '../3d/pitch.js?v=11';
import { labPlay, motion, describe } from '../3d/play.js?v=11';
import { FT, P, smooth } from '../3d/units.js?v=1';
import { InPlay } from '../3d/inplay.js?v=28';

const Q = new URLSearchParams(location.search);
const MODE = Q.get('take') === '1' ? 'take' : 'swing';   // kept for the checks' URLs (take=1)
const FREEZE = Q.has('t') ? parseFloat(Q.get('t')) : null;

const canvas = document.getElementById('c');
const renderer = makeRenderer(canvas, Q.has('dpr') ? parseFloat(Q.get('dpr')) : 2);

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
  const { stands } = buildPark(scene, renderer);
  mark('park');
  const { facts, env, gltfs } = await assets;
  mark('assets');
  lightFrom(scene, renderer, env);
  // the hitter (?slot, default the pack's first left handed one, as the lab always showed) and the play
  const slot = Q.has('slot') ? +Q.get('slot') : Math.max(0, facts.batters.findIndex((b) => b.bats === 'L'));
  facts.batter = facts.batters[Math.min(facts.batters.length - 1, slot)];
  if (Q.has('ip') && !Q.has('play')) Q.set('play', Q.get('bb') || 'line');
  const play = labPlay(facts, facts.batter, Q);
  const pr = Q.has('ip') ? inPlayResult(play) : null;
  if (pr) play.inPlay = pr.inPlay;
  const m = motion(play, facts.batter);
  lab.playFacts = play; lab.motion = m;
  const pitch = new Pitch({ scene, facts, play, batter: facts.batter, m, overlays: Q.get('overlays') !== '0' });
  const people = new People({ scene, facts, mode: m.batter === 'swing' ? 'swing' : 'take', pitch, play, m });
  document.getElementById('note').textContent = '';
  lab.pbp = describe(play);
  people.setup(gltfs);
  people.wireBall();
  mark('people');
  lab.people = people; lab.pitch = pitch; lab.THREE = THREE; lab.camera = camera;
  // for pipeline/check-deform.mjs: pose everyone at a moment without drawing a frame
  lab.poseAt = (t) => { pitch.update(t, camera); people.update(t, 0); };
  lab.times = { release: pitch.tRel, flight: pitch.f.T, plate: pitch.tPlate, catch: pitch.tCatch };

  // the ball in play: the fielders, the runners and the broadcast, built once (inplay.js)
  const ipl = pr ? new InPlay({ scene, renderer, people, facts }) : null;
  const run = ipl ? ipl.begin(pr, pitch, {}) : null;
  if (ipl && (Q.has('cam') || Q.has('watch'))) ipl.ownCamera = false;      // the lab's own camera (cam=free) watches the play
  if (run) { lab.plan = run.plan; lab.realDur = run.realDur; lab.ipl = ipl; }
  const shot = setupCamera(facts);
  // the play by play line (the game shows its own under the scoreboard): once the pitch has its result
  const note = document.getElementById('note');
  const resultAt = pitch.after ? pitch.tRel + pitch.after.t0 : pitch.tCatch;
  if (run) lab.dur = resultAt + run.realDur + 0.8;
  const update = (t, dt) => {
    // after contact the clock runs through the broadcast cut (slow motion and jump cuts)
    const s = run && t > resultAt ? run.sceneAt(t - resultAt) : null;
    const ts = s == null ? t : resultAt + s;
    pitch.update(ts, camera);
    people.update(ts, dt);
    shot.update(ts);                    // after the people: the head camera follows a head
    if (s != null) ipl.update(s, camera);
    if (s != null && Q.has('watch')) watch(ipl, Q.get('watch'));
    stands.userData.tick(ts);
    const show = t > resultAt + 0.3 && !Q.has('nopbp');
    if (show !== lab.pbpShown) { note.textContent = show ? lab.pbp : ''; lab.pbpShown = show; }
  };
  // pose the first moment and compile every shader before the first frame, without blocking
  update(FREEZE ?? 0, 0);
  if (ipl) { await ipl.motion; ipl.warm(true); }
  await renderer.compileAsync(scene, camera);
  if (ipl) { ipl.warm(false); update(FREEZE ?? 0, 0); }
  mark('compiled');
  start(update, () => shot.resize());
}

/** A close look at one body of the ball in play (&watch=f6 a fielder by scoring number, r0 the
    first runner): the camera beside him, ?wd metres off, ?wa degrees round from his right side. */
function watch(ipl, id) {
  const f = id[0] === 'r' ? ipl.runnerFigs[+id.slice(1)] : ipl.fielders[+id.slice(1)];
  if (!f) return;
  const p = f.root.position, d = parseFloat(Q.get('wd') || '6'), a = THREE.MathUtils.degToRad(parseFloat(Q.get('wa') || '0'));
  const yaw = -(f.yaw || 0), side = new THREE.Vector3(Math.cos(yaw + a), 0, -Math.sin(yaw + a));
  camera.position.set(p.x + side.x * d, 1.3, p.z + side.z * d);
  camera.lookAt(p.x, 0.95, p.z);
  camera.fov = 30; camera.updateProjectionMatrix();
}

/** The engine's PitchResult for a ball in play, from the URL (see the header): the result label and
    the runners' moves are given, as a row of a pack's advancement table would give them. */
function inPlayResult(play) {
  const ip = play.inPlay || {};
  const num = (k, d) => (Q.has(k) ? +Q.get(k) : d);
  const moves = (Q.get('mv') || '0:-1').split(',').filter(Boolean).map((m) => { const [from, to] = m.split(':').map(Number); return { from, to }; });
  const before = num('on', 0);
  let bases = before;
  for (const m of moves) { if (m.from >= 1) bases &= ~(1 << (m.from - 1)); }
  for (const m of moves) { if (m.to >= 1 && m.to <= 3) bases |= 1 << (m.to - 1); }
  return {
    result: 'in_play', n: 0, drawn: { id: Q.get('id') || 'lab' },
    inPlay: { bb: Q.get('bb') || ip.bb || 'line', ev: num('ev', ip.ev), la: num('la', ip.la), spray: num('spray', ip.spray), result: Q.get('ip') },
    runnerMoves: moves, bases, outs: num('outs', 1),
  };
}

function setupCamera(facts) {
  const cam = Q.get('cam') || 'pitcher';
  const eye = pitcherEye(camera);
  eye.setSide(facts.batter && facts.batter.bats);
  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    eye.resize(innerWidth, innerHeight);
    camera.userData.cssH = innerHeight;
    if (cam === 'side') camera.fov = 22;
    if (cam === 'free') camera.fov = parseFloat(Q.get('fov') || 30);
    if (cam === 'head') camera.fov = parseFloat(Q.get('fov') || 16);
    camera.updateProjectionMatrix();
  }
  function update(t) {
    if (cam === 'side') { camera.position.copy(P(-14, 1.5, 4)); camera.lookAt(P(1.5, 0, 3)); return; }
    if (cam === 'head' && lab.people) {
      // a close up on one head (?who=batter|catcher|umpire), from the pitcher's eye (?view=pitcher)
      // or three quarters from the front on the pitcher's side (?view=34), ?dist metres off
      const p = lab.people[Q.get('who') || 'batter'];
      const h = new THREE.Vector3(); p.bones.head.getWorldPosition(h); h.y += 0.06;
      const dist = parseFloat(Q.get('dist') || '1.2');
      let dir;
      if ((Q.get('view') || 'pitcher') === 'pitcher') dir = P(-0.45, 59.2, 6.05).sub(h).normalize();
      else {
        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(p.root.quaternion); fwd.y = 0; fwd.normalize();
        const toMound = P(0, 60, 0).sub(h); toMound.y = 0; toMound.normalize();
        dir = fwd.clone().add(toMound).normalize();
        dir.y = 0.15; dir.normalize();
      }
      camera.position.copy(h).addScaledVector(dir, dist);
      camera.lookAt(h);
      return;
    }
    if (cam === 'free') {
      const v = (Q.get('pos') || '0,20,6').split(',').map(Number), l = (Q.get('at') || '0,0,3').split(',').map(Number);
      camera.position.copy(P(...v)); camera.lookAt(P(...l)); return;
    }
    eye.update(t);
  }
  resize();
  return { update, resize };
}

function start(update, resize) {
  addEventListener('resize', resize);
  resize();
  const clock = { last: performance.now(), t: FREEZE ?? 0, playing: FREEZE == null };
  lab.setTime = (t) => { clock.t = t; clock.playing = false; };
  // for pipeline/shoot.mjs: one frame at a moment, drawn now, the page's own loop held (a frame read
  // straight off the canvas costs a draw; a screenshot waits on the compositor)
  lab.renderAt = (t) => { lab.hold = true; clock.t = t; clock.playing = false; lab.t = t; update(t, 0); renderer.render(scene, camera); return canvas.toDataURL('image/png'); };
  lab.play = (t = 0) => { clock.t = t; clock.playing = true; };
  const hint = document.getElementById('hint');
  canvas.addEventListener('click', () => { if (clock.t > 2.6) { lab.play(0); hint.classList.add('off'); } });
  const stats = Q.has('stats') ? makeStats() : null;
  const LOOP = lab.dur || 3.6;
  function frame(now) {
    if (lab.hold) { requestAnimationFrame(frame); return; }
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
