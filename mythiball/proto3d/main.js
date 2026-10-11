/* MythiBall 3D prototype: the page.

   Two modes. Play is one at bat after another from behind the catcher, with
   the ball put in play, fielded and thrown for real. Cast turns one of the 68
   characters on a pedestal and plays every animation the game needs.

   THE PIXEL LOOK IS THE RENDER SIZE. The scene is drawn into a canvas a few
   hundred pixels tall and the browser blows it up with hard edges
   (image-rendering: pixelated). That is also why this is cheap: at the
   default 240 lines a phone fills about 100 thousand pixels a frame, a
   twentieth of its own screen. */
import * as THREE from './vendor/three-0.180.0/three.module.min.js';
import { buildCharacter, OPTS } from './rig.js?v=1';
import * as A from './anim.js?v=1';
import { buildPark, BASES, MOUND, FIELD } from './park.js?v=1';
import { NAMES } from './names.js?v=1';

/* cast.js declares a top level const, which is a global binding and not a
   property of window, so it is read by name */
// eslint-disable-next-line no-undef
const CAST = typeof RIG_CAST !== 'undefined' ? RIG_CAST : {};
const KEYS = Object.keys(CAST);
const $ = (id) => document.getElementById(id);
const rnd = Math.random;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ------------------------------------------------------------ renderer */
const canvas = $('view');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }); }
catch (e) { document.body.classList.add('nogl'); throw e; }
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 1.5, 1600);
scene.add(new THREE.HemisphereLight('#dfefff', '#5a7a3a', 1.35));
const sun = new THREE.DirectionalLight('#fff4e0', 2.4);
sun.position.set(-60, 120, 70); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -170, right: 170, top: 170, bottom: -170, near: 10, far: 400 });
sun.shadow.bias = -0.0006; sun.target.position.set(0, 0, -60); scene.add(sun, sun.target);
const park = buildPark(scene);

const LEVELS = [{ n: 'Chunky', h: 180 }, { n: 'Pixel', h: 240 }, { n: 'Crisp', h: 360 }, { n: 'HD', h: 0 }];
let level = 1;
function resize() {
  const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
  const L = LEVELS[level];
  /* a level is a pixel BUDGET (its height on a 3:2 screen), so an upright
     phone gets as many pixels as a landscape one instead of a sliver */
  const dpr = devicePixelRatio || 1;
  let ih = L.h ? Math.round(Math.sqrt(L.h * L.h * 1.5 * h / w)) : Math.round(h * Math.min(dpr, 2));
  ih = Math.min(ih, Math.round(h * dpr));
  const iw = Math.max(1, Math.round(w * ih / h));
  renderer.setSize(iw, ih, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  canvas.style.imageRendering = L.h ? 'pixelated' : 'auto';
  $('res').textContent = iw + 'x' + ih;
}
addEventListener('resize', resize);

/* ------------------------------------------------------------ actors */
const TEAM_HOME = '#1f3f7a', TEAM_AWAY = '#a8282a';
class Actor {
  constructor(key, opts = {}) {
    this.c = buildCharacter(key, CAST[key]); this.key = key; this.root = this.c.root; scene.add(this.root);
    this.clip = A.IDLE; this.t = 0; this.pose = null; this.override = null; this.yaw = 0; this.speed = 0; this.phase = 0;
    this.c.setHelmet(!!opts.helmet, opts.helmet);
  }
  play(clip, t0 = 0) { this.clip = clip; this.t = t0; this.override = null; }
  step(dt) {
    this.t += dt;
    let P = this.override ? this.override(this) : A.sample(this.clip, this.t);
    if (this.c.lefty) P = A.mirror(P);
    if (this.reach) P = Object.assign({}, P, { reach: this.reach });
    this.pose = P; this.root.rotation.y = this.yaw; this.c.apply(P);
  }
  get pos() { return this.root.position; }
  dispose() { scene.remove(this.root); }
}
const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

/* ------------------------------------------------------------ ui state */
let mode = 'play';
const ui = { banner: $('banner'), count: $('count'), stats: $('stats'), name: $('name') };
function banner(text, cls) { ui.banner.textContent = text; ui.banner.className = 'show ' + (cls || ''); clearTimeout(banner.t); banner.t = setTimeout(() => (ui.banner.className = ''), 1300); }

/* ============================================================ PLAY */
const play = {
  actors: [], fielders: {}, lineup: [], li: 0, batter: null, pitcher: null, runner: null, catcher: null,
  ball: null, state: 'idle', st: 0, count: { b: 0, s: 0, o: 0 }, aim: new THREE.Vector2(0, 2.5), swung: false, hitstop: 0, cam: 'plate', camT: new THREE.Vector3(),
};
const ZONE = { z: 0.7, x0: -0.85, x1: 0.85, y0: 1.55, y1: 3.45 };
const POS = {
  P: MOUND.clone(), C: new THREE.Vector3(0, 0, 3.2), '1B': new THREE.Vector3(34, 0, -44), '2B': new THREE.Vector3(14, 0, -63), SS: new THREE.Vector3(-14, 0, -63),
  '3B': new THREE.Vector3(-35, 0, -42), LF: new THREE.Vector3(-62, 0, -104), CF: new THREE.Vector3(0, 0, -122), RF: new THREE.Vector3(62, 0, -104),
};

/* the zone: a frame with gold corners, and the bat's aim ring */
const zoneG = new THREE.Group(); scene.add(zoneG);
{
  const W = ZONE.x1 - ZONE.x0, H = ZONE.y1 - ZONE.y0, cx = (ZONE.x0 + ZONE.x1) / 2, cy = (ZONE.y0 + ZONE.y1) / 2, t = 0.06;
  const white = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false });
  const gold = new THREE.MeshBasicMaterial({ color: '#f4c25a', depthWrite: false });
  const bar = (w, h, x, y, m) => { const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); b.position.set(x, y, ZONE.z); b.renderOrder = 5; zoneG.add(b); };
  bar(W, t, cx, ZONE.y0, white); bar(W, t, cx, ZONE.y1, white); bar(t, H, ZONE.x0, cy, white); bar(t, H, ZONE.x1, cy, white);
  for (const x of [ZONE.x0, ZONE.x1]) for (const y of [ZONE.y0, ZONE.y1]) { bar(0.32, t * 2, x + (x < 0 ? 0.13 : -0.13), y, gold); bar(t * 2, 0.32, x, y + (y < 2 ? 0.13 : -0.13), gold); }
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.07, depthWrite: false })); fill.position.set(cx, cy, ZONE.z); zoneG.add(fill);
}
const aimRing = new THREE.Group(); zoneG.add(aimRing);
{
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.44, 24), new THREE.MeshBasicMaterial({ color: '#7cf07a', transparent: true, opacity: 0.95, depthWrite: false, depthTest: false }));
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.44, 0.5, 24), new THREE.MeshBasicMaterial({ color: '#14121a', transparent: true, opacity: 0.6, depthWrite: false, depthTest: false }));
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.07, 10), new THREE.MeshBasicMaterial({ color: '#7cf07a', depthTest: false }));
  for (const m of [halo, ring, dot]) { m.renderOrder = 9; aimRing.add(m); }
  aimRing.position.z = ZONE.z + 0.02;
}

/* the ball, its shadow and its trail */
function makeBall() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 9), new THREE.MeshToonMaterial({ color: '#fbfaf4' })); m.castShadow = true; g.add(m);
  const seam = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 4, 12), new THREE.MeshBasicMaterial({ color: '#d0303a' })); seam.rotation.y = 0.6; g.add(seam);
  const ol = new THREE.Mesh(new THREE.SphereGeometry(0.33, 10, 8), new THREE.MeshBasicMaterial({ color: '#14121a', side: THREE.BackSide })); g.add(ol);
  scene.add(g);
  /* a blob straight under the ball, whatever the sun says: judging a fly ball
     is reading where its shadow is going */
  const sh = new THREE.Mesh(new THREE.CircleGeometry(0.6, 14), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.35, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.renderOrder = 2; scene.add(sh);
  const trail = []; for (let i = 0; i < 6; i++) { const t = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35 - i * 0.05, depthWrite: false })); scene.add(t); trail.push(t); }
  return { g, m, sh, trail, hist: [], pos: new THREE.Vector3(), vel: new THREE.Vector3(), state: 'hidden' };
}

function pickTeam() {
  const pool = KEYS.slice(); const take = () => pool.splice(rnd() * pool.length | 0, 1)[0];
  const want = $('sel-batter').value, wantP = $('sel-pitcher').value;
  const lineup = [want || take()]; if (want) pool.splice(pool.indexOf(want), 1);
  while (lineup.length < 9) lineup.push(take());
  const pk = wantP || take(); if (wantP && pool.includes(wantP)) pool.splice(pool.indexOf(wantP), 1);
  const field = {}; for (const r of ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF']) field[r] = take();
  return { lineup, pk, field };
}

function setupPlay() {
  for (const a of play.actors) a.dispose(); play.actors = []; play.fielders = {};
  const t = pickTeam(); play.lineup = t.lineup; play.li = 0;
  play.pitcher = new Actor(t.pk); play.actors.push(play.pitcher);
  play.pitcher.root.position.set(MOUND.x, 0.7, MOUND.z); play.pitcher.yaw = 0;
  for (const r in t.field) { const a = new Actor(t.field[r]); a.role = r; a.home = POS[r].clone(); a.pos.copy(a.home); a.yaw = yawTo(a.pos, BASES.home) ; play.fielders[r] = a; play.actors.push(a); }
  play.catcher = play.fielders.C; play.catcher.play(A.clip([Object.assign({ t: 0 }, A.CATCHER), Object.assign({ t: 1 }, A.CATCHER)], { loop: true })); play.catcher.yaw = Math.PI;
  if (!play.ball) play.ball = makeBall();
  play.count = { b: 0, s: 0, o: 0 }; nextBatter(true);
}

function nextBatter(first) {
  if (play.batter) { play.batter.dispose(); play.actors = play.actors.filter((a) => a !== play.batter); }
  if (!first) play.li = (play.li + 1) % play.lineup.length;
  const key = play.lineup[play.li];
  const b = new Actor(key, { helmet: TEAM_HOME }); play.batter = b; play.actors.push(b);
  const lefty = $('sel-hand').value === 'L' || ($('sel-hand').value === 'auto' && (hash(key) % 4 === 0));
  b.c.lefty = lefty; b.c.bat.visible = true;
  b.pos.set(lefty ? 2.9 : -2.9, 0, 0.2); b.yaw = lefty ? -Math.PI / 2 : Math.PI / 2;
  play.count.b = play.count.s = 0;
  ui.name.textContent = 'At bat: ' + (NAMES[key] || key) + (lefty ? ' (L)' : ' (R)') + '  ·  Pitching: ' + (NAMES[play.pitcher.key] || play.pitcher.key);
  resetPitch();
}
const hash = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

function resetPitch() {
  play.state = 'idle'; play.st = 0; play.swung = false; play.cam = 'plate'; play.result = null; play.hitT = null;
  const b = play.batter; b.play(A.STANCE_IDLE); b.c.bat.visible = true; b.pos.set(b.c.lefty ? 2.9 : -2.9, 0, 0.2); b.yaw = b.c.lefty ? -Math.PI / 2 : Math.PI / 2; b.reach = null; b.override = null;
  play.pitcher.play(A.clip([Object.assign({ t: 0 }, A.pitchClip('fb').keys[0]), Object.assign({ t: 1 }, A.pitchClip('fb').keys[0])], { loop: true }));
  play.pitcher.pos.set(MOUND.x, 0.7, MOUND.z); play.pitcher.yaw = 0;
  for (const r in play.fielders) { const f = play.fielders[r]; if (r === 'C') continue; f.pos.copy(f.home); f.yaw = yawTo(f.pos, BASES.home); f.play(A.READY_CLIP, rnd()); f.task = null; f.reach = null; f.override = null; f.c.glove.visible = true; }
  play.catcher.pos.copy(POS.C); play.catcher.reach = null;
  if (play.runner) { play.runner.dispose(); play.actors = play.actors.filter((a) => a !== play.runner); play.runner = null; }
  const ball = play.ball; ball.state = 'hidden'; ball.g.visible = ball.sh.visible = false; ball.trail.forEach((t) => (t.visible = false));
  zoneG.visible = true; refreshCount();
}
function refreshCount() { const c = play.count; ui.count.innerHTML = `<b>B</b> ${'●'.repeat(c.b)}${'○'.repeat(3 - c.b)} <b>S</b> ${'●'.repeat(c.s)}${'○'.repeat(2 - c.s)} <b>O</b> ${'●'.repeat(c.o)}${'○'.repeat(2 - c.o)}`; }

const PITCHES = { fb: { T: 1.05, name: 'Fastball' }, ch: { T: 1.4, name: 'Changeup' }, cu: { T: 1.32, name: 'Curveball', drop: 1.3 }, sl: { T: 1.18, name: 'Slider', run: 1.1 } };
function startPitch() {
  const types = Object.keys(PITCHES); const type = types[rnd() * types.length | 0];
  const inZone = rnd() < 0.6;
  const tx = inZone ? (rnd() - 0.5) * 1.5 : (rnd() < 0.5 ? -1 : 1) * (1.0 + rnd() * 0.5);
  const ty = inZone ? 1.75 + rnd() * 1.5 : (rnd() < 0.5 ? 1.2 + rnd() * 0.3 : 3.6 + rnd() * 0.4);
  play.pitch = { type, ...PITCHES[type], target: new THREE.Vector3(tx, ty, ZONE.z), released: false };
  play.state = 'windup'; play.st = 0; play.pitcher.play(A.pitchClip(type));
}
function pitchPos(p, t) {
  const e = clamp(t / p.T, 0, 1.6), R = p.release, T = p.target;
  const v = new THREE.Vector3().lerpVectors(R, T, e);
  v.y += 4 * (0.5 + p.T * 0.6) * e * (1 - e) * 0.8;
  if (p.drop) v.y -= p.drop * (e * e - e);
  if (p.run) v.x += p.run * (e * e - e) * (play.batter.c.lefty ? -1 : 1);
  return v;
}

function swing(bunt) {
  if (play.swung || !(play.state === 'windup' || play.state === 'flight')) return;
  play.swung = true; play.swingAt = play.clockT; play.bunt = !!bunt;
  const dy = clamp(play.aim.y - 2.85, -1.2, 1.2) * 0.55;
  play.batter.play(bunt ? A.BUNT : A.swingClip(dy));
}

function judgeContact() {
  const p = play.pitch, b = play.ball, arr = p.arrive;
  const contactAt = play.swingAt + (play.bunt ? 0.25 : A.CONTACT_T);
  const err = contactAt - arr; const at = pitchPos(p, p.T);
  const miss = Math.hypot(play.aim.x - at.x, play.aim.y - at.y);
  const reach = play.bunt ? 0.75 : 0.62;
  if ((play.bunt ? Math.abs(err) < 0.32 : Math.abs(err) < 0.13) && miss < reach) {
    const q = (play.bunt ? 0.2 : clamp(1 - Math.abs(err) / 0.13, 0, 1) * 0.6 + clamp(1 - miss / reach, 0, 1) * 0.4);
    const off = at.y - play.aim.y; /* aim under the ball: it goes up */
    let la = play.bunt ? -8 : clamp(16 + off * 46 + (rnd() - 0.5) * 10, -14, 58);
    let ev = play.bunt ? 22 : 34 + 54 * Math.pow(q, 0.8);
    let spray = play.bunt ? (rnd() - 0.5) * 30 : clamp(err * 380 + (rnd() - 0.5) * 12, -62, 62);
    if (play.batter.c.lefty) spray = -spray;
    const sp = THREE.MathUtils.degToRad(spray), lr = THREE.MathUtils.degToRad(la);
    b.pos.copy(at); b.vel.set(Math.sin(sp) * Math.cos(lr), Math.sin(lr), -Math.cos(sp) * Math.cos(lr)).multiplyScalar(ev);
    b.state = 'hit'; b.bounced = false; b.landed = null; play.state = 'inplay'; play.st = 0; play.hitstop = 0.12 + q * 0.08;
    play.hitQ = q; flashContact(at, q); zoneG.visible = false;
    planFielding();
    return true;
  }
  return false;
}

const flash = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.55, 20), new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, depthTest: false, depthWrite: false }));
flash.renderOrder = 10; scene.add(flash); flash.visible = false;
function flashContact(at, q) { flash.position.copy(at); flash.position.z += 0.1; flash.visible = true; flash.userData.t = 0; flash.userData.q = q; }

/* ------------------------------------------------------------ fielding */
const G = 32;
function simulate(p0, v0, maxT = 12) {
  const out = []; const p = p0.clone(), v = v0.clone(); let bounced = false, firstLand = null, hr = false, wall = false;
  for (let t = 0; t < maxT; t += 1 / 60) {
    out.push({ t, p: p.clone(), air: !bounced });
    v.y -= G / 60; p.addScaledVector(v, 1 / 60);
    const r = Math.hypot(p.x, p.z);
    if (r > FIELD.fence - 0.5 && Math.abs(Math.atan2(p.x, -p.z)) < Math.PI / 4 + 0.03) {
      if (p.y > 8) { hr = true; out.push({ t, p: p.clone(), air: true }); break; }
      if (!wall) { wall = true; const n = new THREE.Vector3(p.x, 0, p.z).normalize(); const vn = v.dot(n); if (vn > 0) v.addScaledVector(n, -1.6 * vn); p.addScaledVector(n, -0.6); }
    }
    if (p.y <= 0.42) { p.y = 0.42; if (!firstLand) firstLand = { t, p: p.clone() }; if (v.y < -4) { v.y = -v.y * 0.42; v.x *= 0.72; v.z *= 0.72; bounced = true; } else { v.y = 0; bounced = true; const s = Math.hypot(v.x, v.z); const ns = Math.max(0, s - 22 / 60); if (s > 0) { v.x *= ns / s; v.z *= ns / s; } if (ns === 0) { out.push({ t, p: p.clone(), air: false }); break; } } }
    if (r > 420) break;
  }
  return { samples: out, firstLand, hr, wall };
}

function planFielding() {
  const b = play.ball; const sim = simulate(b.pos, b.vel); play.sim = sim; play.simT = 0;
  const L = sim.firstLand ? sim.firstLand.p : sim.samples[sim.samples.length - 1].p;
  const ang = Math.atan2(L.x, -L.z);
  play.foul = !sim.hr && Math.abs(ang) > Math.PI / 4 + 0.01 && sim.firstLand;
  if (sim.hr) { play.foul = Math.abs(Math.atan2(sim.samples[sim.samples.length - 1].p.x, -sim.samples[sim.samples.length - 1].p.z)) > Math.PI / 4; }
  /* who gets there first. A fielder's run is a straight line at his speed
     after a beat to read the ball, which is the whole model, and it is
     enough to make the right man go. */
  let best = null;
  for (const r in play.fielders) {
    if (r === 'C') continue; const f = play.fielders[r]; const spd = 21;
    for (const s of sim.samples) {
      if (s.p.y > 7.5) continue;
      const d = Math.hypot(s.p.x - f.home.x, s.p.z - f.home.z); const need = 0.35 + d / spd;
      if (need <= s.t) { if (!best || s.t < best.s.t) best = { f, s, d }; break; }
    }
  }
  /* a dive: nobody gets to a fly ball standing up, but somebody is close */
  if (!sim.hr && sim.firstLand && best && best.s.t > sim.firstLand.t && !best.s.air) {
    for (const r in play.fielders) { if (r === 'C') continue; const f = play.fielders[r];
      const s = sim.samples.find((x) => x.t >= sim.firstLand.t - 0.02); const d = Math.hypot(s.p.x - f.home.x, s.p.z - f.home.z);
      const short = d - (s.t - 0.35) * 21; if (short > 0 && short < 7) { play.dive = { f, s, make: rnd() < 0.55 }; break; } }
  }
  play.chaser = best; play.plan = best;
  for (const r in play.fielders) { const f = play.fielders[r]; if (r === 'C') continue; f.task = null; }
  if (play.dive) { const f = play.dive.f; f.task = { kind: 'dive', to: play.dive.s.p.clone(), at: play.dive.s.t, dive: play.dive }; if (best && best.f === f) play.chaser = null; }
  if (play.chaser && !(play.dive && play.dive.f === play.chaser.f)) { const f = play.chaser.f; f.task = { kind: 'field', to: best.s.p.clone(), at: best.s.t, air: best.s.air }; }
  /* the first baseman covers the bag, the rest drift toward the ball */
  const fb = play.fielders['1B']; if (!fb.task) fb.task = { kind: 'cover', to: BASES.first.clone().add(new THREE.Vector3(-1, 0, -1)) };
  const ss = play.fielders.SS; if (!ss.task) ss.task = { kind: 'cover', to: BASES.second.clone().add(new THREE.Vector3(-2, 0, 2)) };
  /* the batter becomes a runner */
  const bat = play.batter; bat.c.bat.visible = false;
  play.runner = bat; play.batter = null;
  bat.runPath = [BASES.home.clone().add(new THREE.Vector3(bat.c.lefty ? 1.5 : -1.5, 0, 0.5)), BASES.first.clone()]; bat.runI = 0; bat.runDelay = 0.38; bat.target = 1;
  play.result = null; play.ballHolder = null; play.throwing = null; play.throwPrep = null;
}

function baseFor(t) { return t < 4.0 ? 1 : t < 7.2 ? 2 : 3; }
const BASE_LIST = [BASES.home, BASES.first, BASES.second, BASES.third, BASES.home];

function updateRunner(r, dt) {
  if (r.runDelay > 0) { r.runDelay -= dt; r.play(A.IDLE); return; }
  if (r.done) return;
  const tgt = BASE_LIST[r.runI + 1]; const to = tgt.clone().sub(r.pos); to.y = 0; const d = to.length();
  const spd = r.slide ? 0 : 19.5;
  if (r.slide) { r.slideT += dt; const v = Math.max(0, 14 - r.slideT * 26); r.pos.addScaledVector(r.slideDir, v * dt); r.override = null; if (r.clip !== A.SLIDE) r.play(A.SLIDE); if (r.slideT > 0.8) r.done = true; return; }
  if (d < 0.6) {
    r.runI++; if (r.runI >= r.target) { r.done = true; r.play(play.result === 'homer' ? A.CHEER : A.IDLE); r.yaw = yawTo(r.pos, BASES.home); return; }
  }
  /* close play at the bag he is going to stop on: he slides */
  if (r.runI + 1 === r.target && r.target >= 2 && d < 9 && play.throwing && !r.slide) { r.slide = true; r.slideT = 0; r.slideDir = to.clone().normalize(); r.yaw = Math.atan2(to.x, to.z); return; }
  const step = Math.min(d, spd * dt); r.pos.addScaledVector(to.normalize(), step);
  r.yaw = Math.atan2(to.x, to.z); r.phase += dt * spd / 1.15;
  r.override = () => A.runPose(r.phase, 1);
}

function updateFielder(f, dt) {
  const T = f.task; if (!T) return;
  if (T.kind === 'cover' || T.kind === 'field' || T.kind === 'dive') {
    const to = T.to.clone().sub(f.pos); to.y = 0; const d = to.length();
    const near = T.kind === 'cover' ? 0.5 : T.kind === 'dive' ? 6.5 : 0.8;
    if (d > near) { const spd = 21; const step = Math.min(d - near * 0.5, spd * dt); f.pos.addScaledVector(to.normalize(), step); f.yaw = Math.atan2(to.x, to.z); f.phase += dt * spd / 1.15; f.override = () => Object.assign(A.runPose(f.phase, 1), { glove: true }); }
    else if (T.kind === 'cover') { f.override = null; if (f.clip !== A.READY_CLIP) f.play(A.READY_CLIP); f.yaw = play.ballHolder ? yawTo(f.pos, play.ballHolder.pos) : yawTo(f.pos, play.ball.pos); }
    else if (T.kind === 'dive' && !T.went) { T.went = true; const side = Math.sign(new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), f.yaw).dot(to)) || 1; f.play(A.diveClip(side)); f.override = null; }
    else if (T.kind === 'field') { f.override = null; if (f.clip !== A.READY_CLIP) f.play(A.READY_CLIP); f.yaw = yawTo(f.pos, play.ball.pos); }
    if (T.kind !== 'cover' && play.ball.state === 'hit') {
      const bd = play.ball.pos.distanceTo(f.pos.clone().add(new THREE.Vector3(0, 2.5, 0)));
      f.reach = bd < 9 ? play.ball.pos.clone() : null;
      const grab = T.kind === 'dive' ? (T.dive.make ? 5.5 : 0) : 3.4;
      if (bd < grab && play.ball.pos.y < 7.5) catchBall(f, T);
    }
  }
}

function catchBall(f, T) {
  const ball = play.ball; ball.state = 'held'; play.ballHolder = f; f.reach = null;
  const inAir = !ball.bounced;
  if (inAir && !play.foul) { play.result = 'out'; banner(T.kind === 'dive' ? 'WHAT A GRAB!' : 'CAUGHT!', 'out'); play.count.o++; endPlay(1.8); return; }
  const r = play.runner; const tgt = baseFor(play.st); r.target = Math.max(r.target, tgt);
  if (r.target > 1) r.runPath = null;
  /* throw to the base he is going to */
  f.task = null; const base = BASE_LIST[r.target];
  /* on the game clock, never setTimeout: a hit stop or a background tab must
     not let the throw happen in a different moment from the catch */
  play.throwPrep = { f, base, at: play.clockT + 0.12 };
}

function updateBall(dt) {
  const b = play.ball;
  if (play.state === 'flight') {
    const p = play.pitch; const t = play.clockT - p.relT; b.pos.copy(pitchPos(p, t));
    if (t >= p.T + 0.22) { b.state = 'hidden'; }
  } else if (b.state === 'hit' && play.sim) {
    play.simT += dt; const S = play.sim.samples; let i = Math.min(S.length - 1, Math.floor(play.simT * 60));
    b.pos.copy(S[i].p); b.bounced = !S[i].air;
    if (i === S.length - 1 && !play.result) {
      if (play.sim.hr && !play.foul) { play.result = 'homer'; banner('HOME RUN!', 'hr'); const r = play.runner; r.target = 4; r.runDelay = 0; play.cheer = 3; endPlay(7.5); }
      else if (play.foul) { play.result = 'foul'; banner('FOUL', 'foul'); if (play.count.s < 2) play.count.s++; endPlay(1.2); }
    }
    if (play.foul && play.sim.firstLand && play.simT >= play.sim.firstLand.t && !play.result) { play.result = 'foul'; banner('FOUL', 'foul'); if (play.count.s < 2) play.count.s++; endPlay(1.2); }
  } else if (b.state === 'held') {
    const h = play.ballHolder; if (h) b.pos.copy(h.c.glove.visible ? h.c.glove.getWorldPosition(new THREE.Vector3()) : h.c.worldOf('rH'));
  } else if (b.state === 'thrown') {
    const th = b.throwInfo; const u = clamp((play.clockT - th.t0) / th.T, 0, 1);
    b.pos.lerpVectors(th.from, th.to, u); b.pos.y += Math.sin(u * Math.PI) * th.arc;
    if (u >= 1) {
      b.state = 'held'; play.ballHolder = th.catcher;
      const r = play.runner; const safe = r.runI + 1 > th.targetBase || (r.done && !r.slide) || (r.slide && r.slideT > 0.1 && r.pos.distanceTo(BASE_LIST[th.targetBase]) < 2.6);
      if (!play.result) {
        if (safe || r.runI >= th.targetBase) { play.result = 'safe'; banner(['', 'SINGLE', 'DOUBLE', 'TRIPLE'][th.targetBase] || 'SAFE', 'safe'); }
        else { play.result = 'out'; banner('OUT!', 'out'); play.count.o++; r.done = true; r.override = null; r.play(A.SLUMP); }
        endPlay(1.8);
      }
    }
  }
  b.g.visible = b.state !== 'hidden'; b.sh.visible = b.g.visible && b.state !== 'held';
  b.g.position.copy(b.pos); b.g.rotation.x += dt * 30;
  b.sh.position.set(b.pos.x, 0.24, b.pos.z); const hgt = Math.max(0, b.pos.y);
  b.sh.scale.setScalar(1 + hgt * 0.02); b.sh.material.opacity = clamp(0.45 - hgt * 0.004, 0.15, 0.45);
  b.hist.unshift(b.pos.clone()); if (b.hist.length > 14) b.hist.pop();
  const showTrail = b.state === 'hit' || b.state === 'thrown' || play.state === 'flight';
  b.trail.forEach((t, i) => { const p = b.hist[(i + 1) * 2]; t.visible = showTrail && !!p && b.g.visible; if (p) t.position.copy(p); });
}

function endPlay(after) {
  play.state = 'after'; play.st = 0; play.after = after;
}

function stepPlay(dt) {
  play.st += dt; play.clockT = (play.clockT || 0) + dt;
  const P = play.pitcher, Bt = play.batter;
  if (play.state === 'idle' && play.st > 1.3) startPitch();
  if (play.state === 'windup') {
    if (play.pitcher.t >= A.RELEASE_T && !play.pitch.released) {
      const p = play.pitch; p.released = true; p.relT = play.clockT; p.arrive = p.relT + p.T;
      P.step(0); p.release = P.c.worldOf('rH'); play.state = 'flight'; play.st = 0;
      play.ball.state = 'pitch'; if (Bt && !play.swung) Bt.play(A.STRIDE);
      $('tell').textContent = ''; play.ball.hist.length = 0;
    }
  }
  if (play.state === 'flight') {
    const p = play.pitch;
    if (play.swung && !play.contactJudged && play.clockT >= play.swingAt + (play.bunt ? 0.25 : A.CONTACT_T) - 0.0001) {
      play.contactJudged = true; if (judgeContact()) { play.contactJudged = false; return; }
    }
    if (play.clockT >= p.arrive + 0.25) {
      play.contactJudged = false;
      const t = p.target, inZ = t.x >= ZONE.x0 - 0.15 && t.x <= ZONE.x1 + 0.15 && t.y >= ZONE.y0 - 0.15 && t.y <= ZONE.y1 + 0.15;
      if (play.swung) { banner(play.bunt ? 'MISSED BUNT' : 'SWING AND A MISS', 'strike'); play.count.s++; }
      else if (inZ) { banner('STRIKE', 'strike'); play.count.s++; }
      else { banner('BALL', 'ball'); play.count.b++; }
      $('tell').textContent = p.name + (p.type === 'cu' ? ' (higher arm slot)' : p.type === 'sl' ? ' (lower arm slot)' : '');
      if (play.count.s >= 3) { banner('STRUCK OUT', 'strike'); play.count.o++; Bt.play(A.SLUMP); endPlay(2.2); play.nextBatter = true; }
      else if (play.count.b >= 4) { banner('WALK', 'ball'); endPlay(1.6); play.nextBatter = true; }
      else { endPlay(0.9); }
      refreshCount();
    }
  }
  if (play.throwPrep && play.clockT >= play.throwPrep.at) {
    const { f, base } = play.throwPrep; play.throwPrep = null;
    if (play.ballHolder === f) { f.yaw = yawTo(f.pos, base); f.play(A.throwClip()); f.override = null; play.throwing = { f, base, at: play.clockT + A.THROW_RELEASE, target: play.runner.target }; }
  }
  if (play.throwing && play.clockT >= play.throwing.at) {
    const th = play.throwing; play.throwing = null; const b = play.ball;
    const catcher = th.target === 1 ? play.fielders['1B'] : th.target === 2 ? play.fielders.SS : th.target === 3 ? play.fielders['3B'] : play.catcher;
    if (th.target === 3 && !catcher.task) catcher.task = { kind: 'cover', to: BASES.third.clone().add(new THREE.Vector3(1, 0, 1)) };
    const from = th.f.c.worldOf('rH'), to = catcher.pos.clone().add(new THREE.Vector3(0, 3.2, 0));
    const T = Math.max(0.45, from.distanceTo(to) / 85);
    b.state = 'thrown'; b.throwInfo = { from, to, t0: play.clockT, T, arc: from.distanceTo(to) * 0.05, catcher, targetBase: th.target }; play.ballHolder = null;
    play.throwing = { pending: true };
  }
  if (play.runner) updateRunner(play.runner, dt);
  for (const r in play.fielders) updateFielder(play.fielders[r], dt);
  if (play.state === 'inplay' && play.ball.state === 'hit' && play.sim && play.simT > play.sim.samples[play.sim.samples.length - 1].t + 0.5 && !play.ballHolder && !play.result) {
    /* nobody planned for it: the nearest man goes and gets it */
    let near = null; for (const r in play.fielders) { if (r === 'C') continue; const f = play.fielders[r]; const d = f.pos.distanceTo(play.ball.pos); if (!near || d < near.d) near = { f, d }; }
    near.f.task = { kind: 'field', to: play.ball.pos.clone(), at: 0, air: false };
  }
  if (play.state === 'after' && play.st > play.after) {
    if (play.count.o >= 3) { play.count.o = 0; banner('SIDE RETIRED', 'out'); }
    if (play.nextBatter || play.result) { play.nextBatter = false; nextBatter(false); } else resetPitch();
  }
}

/* ------------------------------------------------------------ cameras */
function fitFov(vfov, ref = 1.5) {
  const a = camera.aspect; if (a >= ref) return vfov;
  const h = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(vfov) / 2) * ref);
  return Math.min(80, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(h / 2) / a)));
}
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function playCamera(dt) {
  const b = play.ball; let pos, look, fov;
  if (play.state === 'inplay' || (play.state === 'after' && (play.result && play.result !== 'foul'))) {
    const tgt = b.state !== 'hidden' ? b.pos : MOUND;
    const L = new THREE.Vector3(tgt.x * 0.75, 0, Math.min(-10, tgt.z * 0.8));
    pos = new THREE.Vector3(L.x * 0.35, 34 + Math.max(0, -L.z) * 0.22, 40 + L.z * 0.25); look = L; fov = 48;
  } else if ($('sel-cam').value === 'wide') { pos = new THREE.Vector3(0, 36, 48); look = new THREE.Vector3(0, 0, -52); fov = 50; }
  else {
    /* upright, the plate camera keeps the batter and the zone and lets the
       foul ground go: it frames a narrower slice, centred between them */
    const narrow = camera.aspect < 1; const bx = play.batter && play.batter.c.lefty ? 1 : -1;
    pos = new THREE.Vector3(narrow ? bx * 1.0 : 0, 7.2, 30); look = new THREE.Vector3(narrow ? bx * 1.0 : 0, 2.6, -28); fov = narrow ? fitFov(19, 0.72) : 19;
  }
  const k = 1 - Math.exp(-dt * (play.state === 'inplay' ? 3.2 : 6));
  /* a phone held upright is narrow, so the authored framing is kept across
     the WIDTH: the vertical fov opens up until the same width fits */
  if (play.state === 'inplay' || play.state === 'after' || $('sel-cam').value === 'wide') fov = fitFov(fov, 1.15);
  camPos.lerp(pos, k); camLook.lerp(look, k); camera.fov += (fov - camera.fov) * k; camera.updateProjectionMatrix();
  camera.position.copy(camPos); camera.lookAt(camLook);
  play.catcher.root.visible = !(play.state !== 'inplay' && $('sel-cam').value === 'plate' && play.state !== 'after');
}

/* ------------------------------------------------------------ input */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), zonePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -ZONE.z);
function aimFrom(e) {
  const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera); const hit = new THREE.Vector3(); if (ray.ray.intersectPlane(zonePlane, hit)) { play.aim.set(clamp(hit.x, -1.7, 1.7), clamp(hit.y, 0.9, 4.3)); }
}
canvas.addEventListener('pointermove', (e) => { if (mode === 'play' && e.pointerType === 'mouse') aimFrom(e); });
canvas.addEventListener('pointerdown', (e) => {
  if (mode === 'cast') { orbit.drag = { x: e.clientX, a: orbit.a }; return; }
  aimFrom(e); swing(false);
});
addEventListener('pointerup', () => { orbit.drag = null; });
addEventListener('pointermove', (e) => { if (orbit.drag) orbit.a = orbit.drag.a - (e.clientX - orbit.drag.x) * 0.01; });
const keys = {};
addEventListener('keydown', (e) => {
  keys[e.key] = true;
  if (mode === 'play' && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); swing(false); }
  if (mode === 'play' && (e.key === 'b' || e.key === 'B')) swing(true);
  if (mode === 'cast' && e.key === 'ArrowRight') castStep(1); if (mode === 'cast' && e.key === 'ArrowLeft') castStep(-1);
});
addEventListener('keyup', (e) => { keys[e.key] = false; });
$('b-bunt').onclick = () => swing(true);
$('b-opts').onclick = () => document.body.classList.toggle('opts');

/* ============================================================ CAST */
const orbit = { a: 0.6, drag: null };
const cast = { i: Math.max(0, KEYS.indexOf('paulbunyan')), actor: null, anim: 'Swing' };
const pad = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.4, 0.6, 32), new THREE.MeshLambertMaterial({ color: '#c09060' })); pad.position.set(0, 0.3, -12); pad.receiveShadow = true; pad.visible = false; scene.add(pad);
const ANIMS = {
  Idle: () => A.IDLE, Stance: () => A.STANCE_IDLE,
  Swing: () => A.clip([...A.STRIDE.keys.map((k) => Object.assign({}, k)), ...A.swingClip(0).keys.map((k) => Object.assign({}, k, { t: k.t + 0.75 })), Object.assign({}, A.STANCE, { t: 2.6, bat: A.STANCE.bat })], { loop: true }),
  'Swing low': () => A.clip([...A.STRIDE.keys.map((k) => Object.assign({}, k)), ...A.swingClip(-0.55).keys.map((k) => Object.assign({}, k, { t: k.t + 0.75 })), Object.assign({}, A.STANCE, { t: 2.6, bat: A.STANCE.bat })], { loop: true }),
  Bunt: () => A.clip([...A.BUNT.keys, Object.assign({}, A.STANCE, { t: 1.8 })], { loop: true }),
  'Pitch: fastball': () => loopClip(A.pitchClip('fb'), 2.2), 'Pitch: curve': () => loopClip(A.pitchClip('cu'), 2.2), 'Pitch: slider': () => loopClip(A.pitchClip('sl'), 2.2),
  Run: 'run', Field: () => A.READY_CLIP, Dive: () => loopClip(A.diveClip(1), 2.0), Throw: () => loopClip(A.throwClip(), 1.6), Slide: () => loopClip(A.SLIDE, 1.6),
  Cheer: () => A.CHEER, Slump: () => loopClip(A.SLUMP, 3.0), Signature: () => A.SIGNATURE,
};
function loopClip(c, dur) { const k = c.keys.map((x) => Object.assign({}, x)); k.push(Object.assign({}, k[0], { t: dur })); return A.clip(k, { loop: true }); }
function castShow() {
  if (cast.actor) cast.actor.dispose();
  const key = KEYS[cast.i]; const a = new Actor(key, { helmet: /Swing|Bunt|Stance/.test(cast.anim) ? TEAM_HOME : null }); cast.actor = a;
  a.pos.set(0, 0.6, -12); setCastAnim(cast.anim);
  ui.name.textContent = (cast.i + 1) + ' / ' + KEYS.length + '  ·  ' + (NAMES[key] || key);
}
function setCastAnim(n) {
  cast.anim = n; const a = cast.actor; if (!a) return;
  a.c.bat.visible = /Swing|Bunt|Stance/.test(n); a.c.setHelmet(/Swing|Bunt|Stance/.test(n), TEAM_HOME);
  const v = ANIMS[n]; a.override = null;
  if (v === 'run') { a.play(A.IDLE); a.override = (s) => A.runPose(s.t * 10, 1); }
  else a.play(v());
  document.querySelectorAll('#anims button').forEach((b) => b.classList.toggle('on', b.textContent === n));
}
function castStep(d) { cast.i = (cast.i + d + KEYS.length) % KEYS.length; castShow(); }
function castCamera(dt) {
  if (!orbit.drag) orbit.a += dt * 0.25;
  const c = new THREE.Vector3(0, 3.2, -12);
  camera.fov = fitFov(30); camera.updateProjectionMatrix();
  camera.position.set(c.x + Math.sin(orbit.a) * 16, 6, c.z + Math.cos(orbit.a) * 16); camera.lookAt(c);
}
{
  const box = $('anims'); for (const n of Object.keys(ANIMS)) { const b = document.createElement('button'); b.textContent = n; b.onclick = () => setCastAnim(n); box.appendChild(b); }
  $('b-prev').onclick = () => castStep(-1); $('b-next').onclick = () => castStep(1);
}

/* ============================================================ modes, loop */
function setMode(m) {
  mode = m; document.body.dataset.mode = m;
  for (const a of play.actors) a.root.visible = m === 'play';
  if (play.ball) { play.ball.g.visible = false; play.ball.sh.visible = false; play.ball.trail.forEach((t) => (t.visible = false)); }
  zoneG.visible = m === 'play'; pad.visible = m === 'cast';
  if (m === 'cast') { castShow(); } else { if (cast.actor) { cast.actor.dispose(); cast.actor = null; } if (!play.actors.length) setupPlay(); else { play.actors.forEach((a) => (a.root.visible = true)); resetPitch(); } ui.name.textContent = ''; nextBatterLabel(); }
  document.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
}
function nextBatterLabel() { if (play.batter) ui.name.textContent = 'At bat: ' + (NAMES[play.batter.key] || play.batter.key) + '  ·  Pitching: ' + (NAMES[play.pitcher.key] || play.pitcher.key); }
document.querySelectorAll('#modes button').forEach((b) => (b.onclick = () => setMode(b.dataset.m)));
document.querySelectorAll('#levels button').forEach((b, i) => (b.onclick = () => { level = i; resize(); document.querySelectorAll('#levels button').forEach((x, j) => x.classList.toggle('on', j === i)); }));
$('b-outline').onclick = () => { OPTS.outlines = !OPTS.outlines; scene.traverse((o) => { if (o.userData.outline) o.visible = OPTS.outlines; }); $('b-outline').classList.toggle('on', OPTS.outlines); };
$('b-shadow').onclick = () => { sun.castShadow = !sun.castShadow; $('b-shadow').classList.toggle('on', sun.castShadow); };
$('b-newteam').onclick = () => { setupPlay(); };
for (const id of ['sel-batter', 'sel-pitcher']) { const s = $(id); for (const k of KEYS.slice().sort((a, b) => (NAMES[a] || a).localeCompare(NAMES[b] || b))) { const o = document.createElement('option'); o.value = k; o.textContent = NAMES[k] || k; s.appendChild(o); } }
$('sel-batter').value = 'paulbunyan';
$('sel-batter').onchange = $('sel-pitcher').onchange = $('sel-hand').onchange = () => setupPlay();

/* frame timing: the number that matters is the slow tail, not the average */
const perf = { frames: [], last: performance.now() };
let paused = false;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = now - perf.last; perf.last = now; const dt = Math.min(0.05, raw / 1000);
  perf.frames.push(raw); if (perf.frames.length > 120) perf.frames.shift();
  if (paused) return;
  let wdt = dt;
  if (mode === 'play') {
    if (play.hitstop > 0) { play.hitstop -= dt; wdt = 0; }
    stepPlay(wdt);
    for (const a of play.actors) a.step(wdt);
    if (play.state === 'flight' || play.state === 'windup') {
      if (keys.ArrowLeft) play.aim.x -= dt * 3; if (keys.ArrowRight) play.aim.x += dt * 3; if (keys.ArrowUp) play.aim.y += dt * 3; if (keys.ArrowDown) play.aim.y -= dt * 3;
      play.aim.set(clamp(play.aim.x, -1.7, 1.7), clamp(play.aim.y, 0.9, 4.3));
    }
    aimRing.position.x = play.aim.x; aimRing.position.y = play.aim.y; aimRing.visible = !!play.batter && play.state !== 'inplay';
    updateBall(wdt); playCamera(dt);
    if (play.cheer > 0) { play.cheer -= dt; park.cheer(now / 1000, Math.min(1, play.cheer)); }
  } else { cast.actor && cast.actor.step(dt); castCamera(dt); }
  if (flash.visible) { flash.userData.t += dt; const u = flash.userData.t / 0.25; flash.scale.setScalar(1 + u * (2 + flash.userData.q * 3)); flash.material.opacity = 1 - u; flash.lookAt(camera.position); if (u >= 1) flash.visible = false; }
  const cpu = performance.now() - now; perf.cpu = (perf.cpu || cpu) * 0.95 + cpu * 0.05;
  renderer.render(scene, camera);
  if ((perf.n = (perf.n || 0) + 1) % 15 === 0) {
    const f = perf.frames.slice().sort((a, b) => a - b); const avg = f.reduce((a, b) => a + b, 0) / f.length; const p95 = f[Math.floor(f.length * 0.95)] || 0;
    ui.stats.textContent = `${(1000 / avg).toFixed(0)} fps · avg ${avg.toFixed(1)}ms · p95 ${p95.toFixed(1)}ms · game ${perf.cpu.toFixed(1)}ms · ${renderer.info.render.calls} draws · ${(renderer.info.render.triangles / 1000).toFixed(0)}k tris`;
  }
}

/* checker hooks: nothing on the page reads these */
window.PROTO = { castTo(k) { cast.i = Math.max(0, KEYS.indexOf(k)); castShow(); }, orbitSet(a) { orbit.a = a; orbit.drag = { x: 0, a }; }, THREE, scene, camera, renderer, play, cast, setMode, castStep, setCastAnim, swing, ANIMS, pause: (v) => (paused = v), tick(dt = 1 / 60) { stepPlay(dt); for (const a of play.actors) a.step(dt); updateBall(dt); }, stepFrames(n, dt = 1 / 60) { for (let i = 0; i < n; i++) { if (mode === 'play') { stepPlay(dt); for (const a of play.actors) a.step(dt); updateBall(dt); playCamera(dt); } else { cast.actor.step(dt); castCamera(dt); } } renderer.render(scene, camera); } };

resize(); setMode('play'); requestAnimationFrame(frame);
