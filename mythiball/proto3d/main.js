/* MythiBall 3D prototype: the page.

   Two modes. Play is a whole game: two nines, innings, runners on base,
   runs, and you on both sides of it, swinging when your team bats and
   pitching when it fields. Cast turns one of the 68 characters on a
   pedestal and plays every animation the game needs.

   THE PIXEL LOOK IS THE RENDER SIZE. The scene is drawn into a canvas a few
   hundred pixels tall and the browser blows it up with hard edges
   (image-rendering: pixelated). That is also why this is cheap: at the
   default level a phone fills about 100 thousand pixels a frame, a
   twentieth of its own screen. */
import * as THREE from './vendor/three-0.180.0/three.module.min.js';
import { buildCharacter, OPTS } from './rig.js?v=1';
import * as A from './anim.js?v=1';
import { buildPark, BASES, MOUND, FIELD } from './park.js?v=1';
import { NAMES, STATS } from './names.js?v=2';

/* cast.js declares a top level const, which is a global binding and not a
   property of window, so it is read by name */
// eslint-disable-next-line no-undef
const CAST = typeof RIG_CAST !== 'undefined' ? RIG_CAST : {};
const KEYS = Object.keys(CAST);
const $ = (id) => document.getElementById(id);
const rnd = Math.random;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const stat = (k, s) => (STATS[k] ? STATS[k][s] : 50);
const nm = (k) => NAMES[k] || k;

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
const hash = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

/* ------------------------------------------------------------ ui */
let mode = 'play';
const ui = { banner: $('banner'), stats: $('stats'), name: $('name') };
function banner(text, cls, ms = 1400) { ui.banner.textContent = text; ui.banner.className = 'show ' + (cls || ''); clearTimeout(banner.t); banner.t = setTimeout(() => (ui.banner.className = ''), ms); }

/* ============================================================ THE GAME */
const POSITIONS = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];
const SPOT = {
  P: MOUND.clone(), C: new THREE.Vector3(0, 0, 3.2), '1B': new THREE.Vector3(33, 0, -43), '2B': new THREE.Vector3(14, 0, -63), SS: new THREE.Vector3(-14, 0, -63),
  '3B': new THREE.Vector3(-34, 0, -42), LF: new THREE.Vector3(-62, 0, -104), CF: new THREE.Vector3(0, 0, -122), RF: new THREE.Vector3(62, 0, -104),
};
const BASE_LIST = [BASES.home, BASES.first, BASES.second, BASES.third, BASES.home];
const CLUBS = ['Mudville Mammoths', 'Hollow Hobgoblins', 'Olympus Owls', 'Neverland Nomads', 'Sherwood Stags', 'Tin Pan Tritons', 'Avalon Anvils', 'Gotham Griffins'];
const ZONE = { z: 0.7, x0: -0.85, x1: 0.85, y0: 1.55, y1: 3.45 };
const inZone = (x, y) => x >= ZONE.x0 - 0.12 && x <= ZONE.x1 + 0.12 && y >= ZONE.y0 - 0.12 && y <= ZONE.y1 + 0.12;
const PITCHES = { fb: { T: 1.05, name: 'Fastball' }, sl: { T: 1.18, name: 'Slider', run: 1.1 }, cu: { T: 1.32, name: 'Curveball', drop: 1.3 }, ch: { T: 1.42, name: 'Changeup' } };

/* A team is nine characters. The best arm pitches, the rest are put where
   their ratings fit, and the order is the usual one: on base, then power,
   pitcher last. */
function makeTeam(keys, name, color) {
  const left = keys.slice();
  const take = (score) => { left.sort((a, b) => score(b) - score(a)); return left.shift(); };
  const pos = {};
  pos.P = take((k) => stat(k, 'pit'));
  pos.C = take((k) => stat(k, 'def') - stat(k, 'spd') * 0.5);
  pos.SS = take((k) => stat(k, 'def') + stat(k, 'spd'));
  pos.CF = take((k) => stat(k, 'spd') * 1.3 + stat(k, 'def'));
  pos['2B'] = take((k) => stat(k, 'def') + stat(k, 'spd') * 0.6);
  pos['3B'] = take((k) => stat(k, 'def') + stat(k, 'pow') * 0.4);
  pos.LF = take((k) => stat(k, 'spd') + stat(k, 'pow') * 0.3);
  pos.RF = take((k) => stat(k, 'def') + stat(k, 'pow') * 0.3);
  pos['1B'] = left.shift();
  const bat = POSITIONS.filter((p) => p !== 'P').map((p) => pos[p]);
  const val = (k) => stat(k, 'con') + stat(k, 'pow');
  bat.sort((a, b) => val(b) - val(a));
  const lead = bat.slice(0, 8).sort((a, b) => (stat(b, 'spd') + stat(b, 'con')) - (stat(a, 'spd') + stat(a, 'con')))[0];
  const order = [lead, ...bat.filter((k) => k !== lead)]; order.push(pos.P);
  return { name, color, keys, pos, order, li: 0, runs: [], hits: 0 };
}
function randomNine(exclude = []) { const pool = KEYS.filter((k) => !exclude.includes(k)); const out = []; while (out.length < 9) out.push(pool.splice(rnd() * pool.length | 0, 1)[0]); return out; }

const G = {
  teams: null, you: 1, innings: 3, inning: 1, half: 0, outs: 0, b: 0, s: 0, bases: [null, null, null, null], over: false,
  state: 'menu', st: 0, clockT: 0, actors: [], fielders: {}, batter: null, runners: [], ball: null, pitch: null,
  aim: new THREE.Vector2(0, 2.5), target: new THREE.Vector2(0, 2.5), ptype: 'fb', swung: false, hitstop: 0, cheer: 0,
};
const batting = () => G.teams[G.half], fielding = () => G.teams[1 - G.half];
const youBat = () => G.half === G.you;

/* ------------------------------------------------------------ the zone */
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
function ringMarker(color) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.44, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false }));
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.44, 0.5, 24), new THREE.MeshBasicMaterial({ color: '#14121a', transparent: true, opacity: 0.6, depthWrite: false, depthTest: false }));
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.07, 10), new THREE.MeshBasicMaterial({ color, depthTest: false }));
  for (const m of [halo, ring, dot]) { m.renderOrder = 9; g.add(m); }
  g.position.z = ZONE.z + 0.02; zoneG.add(g); return g;
}
const aimRing = ringMarker('#7cf07a'), targetRing = ringMarker('#ff6a5a');

/* ------------------------------------------------------------ the ball */
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
G.ball = makeBall();
const flash = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.55, 20), new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, depthTest: false, depthWrite: false }));
flash.renderOrder = 10; scene.add(flash); flash.visible = false;

/* ------------------------------------------------------------ setting the field */
function clearActors() { for (const a of G.actors) a.dispose(); G.actors = []; G.fielders = {}; G.batter = null; G.runners = []; G.bases = [null, null, null, null]; }
function setField() {
  for (const p in G.fielders) { G.fielders[p].dispose(); } G.actors = G.actors.filter((a) => !Object.values(G.fielders).includes(a)); G.fielders = {};
  const T = fielding();
  for (const p of POSITIONS) {
    const a = new Actor(T.pos[p]); a.role = p; a.home = SPOT[p].clone(); a.pos.copy(a.home); G.fielders[p] = a; G.actors.push(a);
    a.spd = 10 + stat(a.key, 'spd') * 0.05; a.react = /F$/.test(p) ? 0.8 : 0.45; a.arm = 55 + stat(a.key, 'def') * 0.25;
  }
  const P = G.fielders.P; P.pos.y = 0.7;
  G.fielders.C.play(A.clip([Object.assign({ t: 0 }, A.CATCHER), Object.assign({ t: 1 }, A.CATCHER)], { loop: true })); G.fielders.C.yaw = Math.PI;
}
function newBatter() {
  if (G.batter) { G.batter.dispose(); G.actors = G.actors.filter((a) => a !== G.batter); }
  const T = batting(); const key = T.order[T.li % 9];
  const b = new Actor(key, { helmet: T.color }); G.batter = b; G.actors.push(b);
  b.c.lefty = hash(key) % 4 === 0; b.c.bat.visible = true;
  G.b = G.s = 0; resetPitch(); updateHud();
}

function resetPitch() {
  G.state = 'idle'; G.st = 0; G.swung = false; G.result = null; G.contact = null; G.cpuSwing = null; G.thrown = null; G.throwPrep = null; G.sim = null; G.dive = null;
  const b = G.batter; b.play(A.STANCE_IDLE); b.c.bat.visible = true; b.pos.set(b.c.lefty ? 2.9 : -2.9, 0, 0.2); b.yaw = b.c.lefty ? -Math.PI / 2 : Math.PI / 2; b.reach = null; b.override = null;
  const P = G.fielders.P; P.play(A.clip([Object.assign({ t: 0 }, A.pitchClip('fb').keys[0]), Object.assign({ t: 1 }, A.pitchClip('fb').keys[0])], { loop: true }));
  P.pos.set(MOUND.x, 0.7, MOUND.z); P.yaw = 0; P.task = null; P.reach = null; P.override = null;
  for (const r of POSITIONS) { if (r === 'P' || r === 'C') continue; const f = G.fielders[r]; f.pos.copy(f.home); f.yaw = yawTo(f.pos, BASES.home); f.play(A.READY_CLIP, rnd()); f.task = null; f.reach = null; f.override = null; }
  const C = G.fielders.C; C.pos.copy(SPOT.C); C.reach = null; C.task = null; C.override = null; C.yaw = Math.PI; C.play(A.clip([Object.assign({ t: 0 }, A.CATCHER), Object.assign({ t: 1 }, A.CATCHER)], { loop: true }));
  G.contactJudged = false; targetRing.visible = !youBat();
  for (const r of G.runners) placeOnBase(r);
  const ball = G.ball; ball.state = 'hidden'; ball.g.visible = ball.sh.visible = false; ball.trail.forEach((t) => (t.visible = false));
  zoneG.visible = true; G.ptype = G.ptype || 'fb';
  if (!youBat()) { G.state = 'aim'; G.target.set(0, 2.5); }
  updateHud();
}

/* a runner on a base takes his lead toward the next one, crouched, watching home */
function placeOnBase(r) {
  const B = BASE_LIST[r.at], N = BASE_LIST[r.at + 1]; const lead = N.clone().sub(B).setLength(4);
  r.actor.pos.copy(B).add(lead); r.actor.pos.y = 0; r.actor.yaw = yawTo(r.actor.pos, BASES.home);
  r.actor.play(A.clip([Object.assign({ t: 0 }, A.READY, { glove: false }), Object.assign({ t: 1 }, A.READY, { glove: false, p: [0, 0.8, 0] }), Object.assign({ t: 2 }, A.READY, { glove: false })], { loop: true }), rnd());
  r.actor.override = null; r.target = r.at; r.done = true; r.slide = false; r.hold = false; r.scored = false;
}

/* ------------------------------------------------------------ pitching */
function pitchPos(p, t) {
  const e = clamp(t / p.T, 0, 1.6), R = p.release, T = p.target;
  const v = new THREE.Vector3().lerpVectors(R, T, e);
  v.y += 4 * (0.5 + p.T * 0.6) * e * (1 - e) * 0.8;
  if (p.drop) v.y -= p.drop * (e * e - e);
  if (p.run) v.x += p.run * (e * e - e) * (G.batter.c.lefty ? -1 : 1);
  return v;
}
function startPitch(type, tx, ty) {
  const P = G.fielders.P, pit = stat(P.key, 'pit');
  /* an arm is only as accurate as its pitcher: the spot you chose is where he
     is aiming, not where it goes */
  const sc = 0.38 - pit * 0.0026;
  const x = clamp(tx + gauss() * sc, -2, 2), y = clamp(ty + gauss() * sc, 0.8, 4.6);
  const T = PITCHES[type].T * (1.12 - pit * 0.0025);
  G.pitch = Object.assign({ type }, PITCHES[type], { T, target: new THREE.Vector3(x, y, ZONE.z), released: false });
  G.state = 'windup'; G.st = 0; P.play(A.pitchClip(type));
}
function cpuPitch() {
  const types = ['fb', 'fb', 'sl', 'cu', 'ch']; const type = types[rnd() * types.length | 0];
  const behind = G.b >= 2 && G.b > G.s, ahead = G.s === 2 && G.b < 3;
  const zoneP = behind ? 0.8 : ahead ? 0.35 : 0.58;
  let tx, ty;
  if (rnd() < zoneP) { tx = (rnd() - 0.5) * 1.5; ty = 1.8 + rnd() * 1.4; }
  else { tx = (rnd() < 0.5 ? -1 : 1) * (1.05 + rnd() * 0.4); ty = rnd() < 0.5 ? 1.25 + rnd() * 0.3 : 3.6 + rnd() * 0.3; if (rnd() < 0.5) tx *= 0.4; }
  startPitch(type, tx, ty);
}
function throwPlayerPitch() { if (G.state !== 'aim' || youBat()) return; startPitch(G.ptype, G.target.x, G.target.y); targetRing.visible = false; }

/* the other dugout swings on what it sees, and how well depends on the man */
function cpuDecide() {
  const p = G.pitch, k = G.batter.key, con = stat(k, 'con');
  const iz = inZone(p.target.x, p.target.y);
  let ps = iz ? 0.72 : 0.26; if (G.s === 2) ps += 0.14; if (G.b === 3 && G.s < 2) ps -= 0.35;
  if (rnd() > ps) return;
  const mean = p.type === 'ch' ? -0.05 : p.type === 'cu' ? -0.025 : 0;
  const err = mean + gauss() * (0.1 - con * 0.0005);
  const ae = 0.48 - con * 0.0032;
  G.cpuSwing = { at: p.arrive - A.CONTACT_T + err, aim: new THREE.Vector2(p.target.x + gauss() * ae, p.target.y + gauss() * ae) };
}

/* ------------------------------------------------------------ batting */
function swing(bunt) {
  if (G.swung || !(G.state === 'windup' || G.state === 'flight') || !G.batter) return;
  G.swung = true; G.swingAt = G.clockT; G.bunt = !!bunt;
  const dy = clamp(G.aim.y - 2.85, -1.2, 1.2) * 0.55;
  G.batter.play(bunt ? A.BUNT : A.swingClip(dy));
}
function judgeContact() {
  const p = G.pitch, b = G.ball, k = G.batter.key;
  const contactAt = G.swingAt + (G.bunt ? 0.25 : A.CONTACT_T);
  const err = contactAt - p.arrive; const at = pitchPos(p, p.T);
  const miss = Math.hypot(G.aim.x - at.x, G.aim.y - at.y);
  const reach = (G.bunt ? 0.75 : 0.5) + stat(k, 'con') * 0.0022;
  const win = G.bunt ? 0.32 : 0.11 + stat(k, 'con') * 0.0004;
  if (Math.abs(err) >= win || miss >= reach) return false;
  const q = G.bunt ? 0.2 : clamp(1 - Math.abs(err) / win, 0, 1) * 0.6 + clamp(1 - miss / reach, 0, 1) * 0.4;
  const off = at.y - G.aim.y; /* aim under the ball and it goes up */
  const la = G.bunt ? -8 : clamp(14 + off * 46 + gauss() * 6, -14, 60);
  const ev = G.bunt ? 20 : 30 + (34 + stat(k, 'pow') * 0.26) * Math.pow(q, 0.85);
  let spray = G.bunt ? (rnd() - 0.5) * 30 : clamp(err * 360 + gauss() * 8, -62, 62);
  if (G.batter.c.lefty) spray = -spray;
  const sp = THREE.MathUtils.degToRad(spray), lr = THREE.MathUtils.degToRad(la);
  b.pos.copy(at); b.vel.set(Math.sin(sp) * Math.cos(lr), Math.sin(lr), -Math.cos(sp) * Math.cos(lr)).multiplyScalar(ev);
  b.state = 'hit'; b.bounced = false; G.state = 'inplay'; G.st = 0; G.hitstop = 0.1 + q * 0.1;
  flash.position.copy(at); flash.position.z += 0.1; flash.visible = true; flash.userData.t = 0; flash.userData.q = q; zoneG.visible = false;
  startPlay(la);
  return true;
}

/* ------------------------------------------------------------ the ball in play */
const GRAV = 32;
function simulate(p0, v0, maxT = 12) {
  const out = []; const p = p0.clone(), v = v0.clone(); let bounced = false, firstLand = null, hr = false, wall = false;
  for (let t = 0; t < maxT; t += 1 / 60) {
    out.push({ t, p: p.clone(), air: !bounced });
    v.y -= GRAV / 60; p.addScaledVector(v, 1 / 60);
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

function startPlay(la) {
  const b = G.ball; const sim = simulate(b.pos, b.vel); G.sim = sim; G.simT = 0;
  const last = sim.samples[sim.samples.length - 1].p, L = sim.firstLand ? sim.firstLand.p : last;
  G.foul = sim.hr ? Math.abs(Math.atan2(last.x, -last.z)) > Math.PI / 4 : (!!sim.firstLand && Math.abs(Math.atan2(L.x, -L.z)) > Math.PI / 4 + 0.01);
  /* who gets there first. A fielder's run is a straight line at his own speed
     after a beat to read the ball, which is the whole model, and it is enough
     to make the right man go. */
  let best = null;
  for (const r of POSITIONS) {
    if (r === 'C') continue; const f = G.fielders[r];
    for (const s of sim.samples) {
      if (s.p.y > 5.5) continue;
      const d = Math.hypot(s.p.x - f.pos.x, s.p.z - f.pos.z); if (f.react + Math.max(0, d - 2.4) / f.spd <= s.t) { if (!best || s.t < best.s.t) best = { f, s }; break; }
    }
  }
  for (const r of POSITIONS) { G.fielders[r].task = null; G.fielders[r].missed = false; }
  /* a dive: nobody gets to a fly ball standing up, but somebody is close */
  if (!sim.hr && sim.firstLand && best && best.s.t > sim.firstLand.t + 0.05) {
    const s = sim.samples.find((x) => x.t >= sim.firstLand.t - 0.03);
    for (const r of POSITIONS) { if (r === 'C') continue; const f = G.fielders[r]; const d = Math.hypot(s.p.x - f.pos.x, s.p.z - f.pos.z);
      const short = d - 2.4 - (s.t - f.react) * f.spd; if (short > 0 && short < 5) { G.dive = { f, s, make: rnd() < 0.3 + stat(f.key, 'def') * 0.004 }; f.task = { kind: 'dive', to: s.p.clone(), dive: G.dive }; break; } }
  }
  if (best && !(G.dive && G.dive.f === best.f)) best.f.task = { kind: 'field', to: best.s.p.clone() };
  /* the bags get covered */
  const cover = (r, base, off) => { const f = G.fielders[r]; if (!f.task) f.task = { kind: 'cover', to: BASE_LIST[base].clone().add(off) }; };
  cover('1B', 1, new THREE.Vector3(-1, 0, -1)); cover('SS', 2, new THREE.Vector3(-2, 0, 2)); cover('2B', 2, new THREE.Vector3(2, 0, 2)); cover('3B', 3, new THREE.Vector3(1, 0, 1));
  G.fielders.C.task = { kind: 'cover', to: BASES.home.clone().add(new THREE.Vector3(0, 0, 1.5)) };
  /* the batter becomes a runner, and the others go: on the ground at once,
     in the air they hold until it comes down */
  const bat = G.batter; bat.c.bat.visible = false; G.batter = null;
  const br = { key: bat.key, actor: bat, at: 0, target: 1, done: false, delay: 0.35, batter: true };
  G.runners.push(br);
  const air = la > 12 && !G.foul;
  for (const r of G.runners) { if (r === br) continue; r.base0 = r.at; r.hold = air && !forced(r.at); r.target = r.hold ? r.at : Math.max(r.target, r.at + 1); r.done = false; r.delay = 0.15; }
  G.result = null; G.holder = null; G.thrown = null; G.throwPrep = null;
}
/* forced: every base behind him is occupied, so he has to go */
function forced(at) { for (let i = 1; i < at; i++) if (!G.runners.some((r) => !r.batter && r.at === i)) return false; return true; }

const runSpeed = (r) => 15 + stat(r.key, 'spd') * 0.07;
function updateRunner(r, dt) {
  const a = r.actor;
  if (r.delay > 0) { r.delay -= dt; return; }
  if (r.done || r.scored) return;
  if (r.slide) { r.slideT += dt; a.pos.addScaledVector(r.slideDir, Math.max(0, 14 - r.slideT * 26) * dt); if (a.clip !== A.SLIDE) a.play(A.SLIDE); if (r.slideT > 0.75) { r.done = true; r.slide = false; r.at = r.slideTo; } return; }
  /* going back to the bag he left */
  if (r.target <= r.at) {
    const B = BASE_LIST[r.at].clone(); const to = B.sub(a.pos); to.y = 0; const d = to.length();
    if (d < 0.8) { r.done = !r.hold; if (r.done) { a.override = null; a.play(A.IDLE); } return; }
    const step = Math.min(d, runSpeed(r) * dt); a.pos.addScaledVector(to.normalize(), step); a.yaw = Math.atan2(to.x, to.z); a.phase += dt * runSpeed(r) / 1.15; a.override = () => A.runPose(a.phase, 1); return;
  }
  const N = BASE_LIST[r.at + 1]; const to = N.clone().sub(a.pos); to.y = 0; const d = to.length();
  if (d < 0.7) {
    r.at++;
    if (r.at >= 4) { r.scored = true; r.done = true; a.override = null; a.play(A.CHEER); a.yaw = Math.PI; return; }
    if (r.at >= r.target) { r.done = true; a.override = null; a.play(A.IDLE); a.yaw = yawTo(a.pos, BASES.home); return; }
  }
  /* a close play at the bag he stops on: he slides into it */
  if (r.at + 1 === r.target && r.target >= 2 && r.target <= 3 && d < 8 && d > 5 && G.thrown && G.thrown.base === r.target) { r.slide = true; r.slideT = 0; r.slideDir = to.clone().normalize(); r.slideTo = r.target; a.override = null; a.yaw = Math.atan2(to.x, to.z); return; }
  const step = Math.min(d, runSpeed(r) * dt); a.pos.addScaledVector(to.normalize(), step);
  a.yaw = Math.atan2(to.x, to.z); a.phase += dt * runSpeed(r) / 1.15; a.override = () => A.runPose(a.phase, 1);
}

function updateFielder(f, dt) {
  const T = f.task; if (!T) return;
  const to = T.to.clone().sub(f.pos); to.y = 0; const d = to.length();
  const near = T.kind === 'cover' ? 0.5 : T.kind === 'dive' ? 6.5 : 0.8;
  f.pos.y = 0.7 * clamp(1 - Math.hypot(f.pos.x - MOUND.x, f.pos.z - MOUND.z) / 9, 0, 1);
  if (d > near && !T.went) { const step = Math.min(d - near * 0.5, f.spd * dt); f.pos.addScaledVector(to.normalize(), step); f.yaw = Math.atan2(to.x, to.z); f.phase += dt * f.spd / 1.15; f.override = () => Object.assign(A.runPose(f.phase, 1), { glove: true }); }
  else if (T.kind === 'dive' && !T.went) { T.went = true; const side = Math.sign(new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), f.yaw).dot(to)) || 1; f.play(A.diveClip(side)); f.override = null; }
  else if (!T.went) { f.override = null; if (f.clip !== A.READY_CLIP) f.play(A.READY_CLIP); f.yaw = G.holder && G.holder !== f ? yawTo(f.pos, G.holder.pos) : yawTo(f.pos, G.ball.pos); }
  if (T.kind !== 'cover' && G.ball.state === 'hit') {
    const bd = Math.hypot(G.ball.pos.x - f.pos.x, G.ball.pos.z - f.pos.z, Math.max(0, G.ball.pos.y - f.pos.y - 4.5));
    f.reach = bd < 9 ? G.ball.pos.clone() : null;
    const grab = T.kind === 'dive' ? (T.dive.make ? 5.5 : 0) : 2.4;
    if (f.missed && G.clockT - f.missed > 0.7) f.missed = false;
    if (bd < grab && G.ball.pos.y < 6 && !f.missed) {
      /* a hard ball on the ground does not always stay in the glove: the
         faster it comes, the likelier it skips past him */
      const hv = G.ball.bounced ? Math.hypot(G.sim.samples[Math.min(G.sim.samples.length - 1, Math.floor(G.simT * 60) + 1)].p.x - G.ball.pos.x, G.sim.samples[Math.min(G.sim.samples.length - 1, Math.floor(G.simT * 60) + 1)].p.z - G.ball.pos.z) * 60 : 0;
      const p = clamp(0.62 + stat(f.key, 'def') * 0.004 - Math.max(0, hv - 22) * 0.012, 0.15, 0.98);
      if (hv > 22 && rnd() > p) { f.missed = G.clockT; f.task = { kind: 'cover', to: f.pos.clone() }; f.play(A.diveClip(rnd() < 0.5 ? 1 : -1)); f.override = null; }
      else fieldBall(f, T);
    }
  }
}

function fieldBall(f, T) {
  const ball = G.ball; if (G.result) return;
  if (ball.bounced && G.foul) return;
  ball.state = 'held'; G.holder = f; f.reach = null; f.task = null;
  const br = G.runners.find((r) => r.batter);
  if (!ball.bounced) {
    G.result = 'out'; G.outs++; if (G.foul) for (const r of G.runners) if (!r.batter) r.at = r.base0; banner(T.kind === 'dive' ? 'WHAT A GRAB!' : 'CAUGHT!', 'out');
    br.out = true; br.actor.override = null; br.actor.play(A.SLUMP); br.done = true;
    for (const r of G.runners) if (r !== br && !r.scored) { r.hold = false; r.target = Math.min(r.target, r.at); r.done = false; }
    finishPlay(1.8); return;
  }
  /* it is on the ground: everybody goes, how far is how long it took */
  for (const r of G.runners) r.hold = false;
  const deep = Math.hypot(f.pos.x, f.pos.z) > 85, hb = G.simT < 3.2 ? 1 : G.simT < 6 ? 2 : 3;
  br.target = Math.max(br.target, hb);
  /* the runners take what the ball gives them: one more on anything that
     reached the outfield */
  for (const r of G.runners) if (r !== br && !r.scored) { r.target = Math.min(4, Math.max(r.target, r.base0 + hb + (deep ? 1 : 0))); r.done = false; }
  /* throw at the batter, the one runner a defence always has a play on */
  G.throwPrep = { f, base: br.target, at: G.clockT + 0.45 };
}

function updateBall(dt) {
  const b = G.ball;
  if (G.state === 'flight' && b.state === 'pitch') {
    const p = G.pitch; const t = G.clockT - p.relT; b.pos.copy(pitchPos(p, t));
    if (t >= p.T + 0.2) b.state = 'hidden';
  } else if (b.state === 'hit' && G.sim) {
    G.simT += dt; const S = G.sim.samples; const i = Math.min(S.length - 1, Math.floor(G.simT * 60));
    b.pos.copy(S[i].p); b.bounced = !S[i].air;
    if (b.bounced) for (const r of G.runners) if (r.hold) { r.hold = false; r.target = Math.max(r.target, r.at + 1); r.done = false; }
    if (!G.result && G.foul && ((G.sim.firstLand && G.simT >= G.sim.firstLand.t) || i === S.length - 1)) {
      G.result = 'foul'; banner('FOUL BALL', 'foul'); if (G.s < 2) G.s++;
      for (const r of G.runners) if (!r.batter) { r.at = r.base0; r.target = r.at; r.hold = false; r.done = false; r.scored = false; }
      finishPlay(1.3, true); updateHud();
    } else if (!G.result && G.sim.hr && i === S.length - 1) {
      G.result = 'homer'; banner('HOME RUN!', 'hr', 2600); G.cheer = 3.5;
      for (const r of G.runners) { r.hold = false; r.target = 4; r.done = false; r.delay = 0; }
      finishPlay(1.2);
    }
  } else if (b.state === 'held') {
    const h = G.holder; if (h) b.pos.copy(h.c.glove.visible ? h.c.glove.getWorldPosition(new THREE.Vector3()) : h.c.worldOf('rH'));
  } else if (b.state === 'thrown') {
    const th = G.thrown; const u = clamp((G.clockT - th.t0) / th.T, 0, 1);
    b.pos.lerpVectors(th.from, th.to, u); b.pos.y += Math.sin(u * Math.PI) * th.arc;
    if (u >= 1) arriveThrow(th);
  }
  b.g.visible = b.state !== 'hidden'; b.sh.visible = b.g.visible && b.state !== 'held';
  b.g.position.copy(b.pos); b.g.rotation.x += dt * 30;
  b.sh.position.set(b.pos.x, 0.24, b.pos.z); const hgt = Math.max(0, b.pos.y);
  b.sh.scale.setScalar(1 + hgt * 0.02); b.sh.material.opacity = clamp(0.45 - hgt * 0.004, 0.15, 0.45);
  b.hist.unshift(b.pos.clone()); if (b.hist.length > 14) b.hist.pop();
  const showTrail = b.state === 'hit' || b.state === 'thrown' || b.state === 'pitch';
  b.trail.forEach((t, i) => { const p = b.hist[(i + 1) * 2]; t.visible = showTrail && !!p && b.g.visible; if (p) t.position.copy(p); });
}
function arriveThrow(th) {
  const b = G.ball; b.state = 'held'; G.holder = th.catcher; G.thrown = null;
  if (G.result) return;
  const br = G.runners.find((r) => r.batter);
  const made = br.at >= th.base || (br.slide && br.slideT > 0.12);
  if (made) { G.result = 'hit'; batting().hits++; banner(['', 'SINGLE!', 'DOUBLE!', 'TRIPLE!'][th.base] || 'SAFE!', 'safe'); }
  else { G.result = 'out'; G.outs++; br.out = true; br.done = true; br.actor.override = null; br.actor.play(A.SLUMP); banner('OUT!', 'out');
    /* the third out on the batter before first is a force: nobody scores */
    if (G.outs >= 3) { for (const r of G.runners) if (!r.batter) { r.target = r.at; } G.noRuns = true; } }
  finishPlay(1.6);
}

function finishPlay(after, foul) { G.state = 'after'; G.st = 0; G.after = after; G.foulPlay = !!foul; updateHud(); }

/* everything that happened, written down: who is on, who scored, who is out */
function settle() {
  const T = batting(); let runs = 0;
  for (const r of G.runners) { if (r.scored && !G.noRuns) runs++; }
  G.noRuns = false;
  const keep = [];
  for (const r of G.runners) {
    if (r.out || r.scored) { r.actor.dispose(); G.actors = G.actors.filter((a) => a !== r.actor); continue; }
    if (r.slide) r.at = r.slideTo;
    r.at = clamp(r.at, 1, 3); keep.push(r);
  }
  /* two on one bag cannot happen; the trailing man stops a base short */
  keep.sort((a, b) => b.at - a.at); for (let i = 1; i < keep.length; i++) if (keep[i].at >= keep[i - 1].at) keep[i].at = keep[i - 1].at - 1;
  G.runners = keep.filter((r) => { if (r.at < 1) { r.actor.dispose(); G.actors = G.actors.filter((a) => a !== r.actor); return false; } return true; });
  for (const r of G.runners) r.batter = false;
  addRuns(runs);
}
function addRuns(n) {
  if (!n) return; const T = batting(); T.runs[G.inning - 1] = (T.runs[G.inning - 1] || 0) + n;
  setTimeout(() => banner(n === 1 ? 'RUN SCORES!' : n + ' RUNS SCORE!', 'hr'), 250);
  updateHud();
}
const total = (T) => T.runs.reduce((a, b) => a + (b || 0), 0);

function walk() {
  const T = batting(); const bat = G.batter; G.batter = null; bat.c.bat.visible = false;
  /* forced along: each man moves only if the base behind him is taken */
  const occ = [true, ...[1, 2, 3].map((i) => G.runners.some((r) => r.at === i))];
  for (const r of G.runners) { let forcedR = true; for (let i = 1; i <= r.at; i++) if (!occ[i - 1]) forcedR = false; r.target = forcedR ? r.at + 1 : r.at; r.done = false; r.delay = 0; }
  const br = { key: bat.key, actor: bat, at: 0, target: 1, done: false, delay: 0.2, batter: true }; G.runners.push(br);
}

function endPA() {
  const T = batting(); T.li = (T.li + 1) % 9;
  if (checkWalkoff()) return;
  if (G.outs >= 3) return endHalf();
  newBatter();
}
function checkWalkoff() {
  if (G.half === 1 && G.inning >= G.innings && total(G.teams[1]) > total(G.teams[0])) { gameOver(); return true; }
  return false;
}
function endHalf() {
  for (const r of G.runners) { r.actor.dispose(); G.actors = G.actors.filter((a) => a !== r.actor); } G.runners = [];
  const T = batting(); if (T.runs[G.inning - 1] == null) T.runs[G.inning - 1] = 0;
  const [away, home] = G.teams;
  if (G.half === 0 && G.inning >= G.innings && total(home) > total(away)) return gameOver();
  if (G.half === 1 && G.inning >= G.innings && total(home) !== total(away)) return gameOver();
  if (G.half === 1 && G.inning >= G.innings + 3) return gameOver();
  if (G.half === 1) { G.inning++; G.half = 0; } else G.half = 1;
  G.outs = 0; G.b = G.s = 0;
  banner((G.half ? 'BOTTOM ' : 'TOP ') + G.inning + (youBat() ? ': YOU BAT' : ': YOU PITCH'), 'side', 2000);
  setField(); newBatter();
}

function gameOver() {
  G.over = true; G.state = 'over';
  const [away, home] = G.teams, you = G.teams[G.you], them = G.teams[1 - G.you];
  const won = total(you) > total(them), tie = total(you) === total(them);
  $('end-title').textContent = tie ? 'Tie game' : won ? 'You win!' : 'You lose';
  $('end-score').innerHTML = lineScore();
  document.body.classList.add('end');
  if (won) G.cheer = 5;
}
function lineScore() {
  const n = Math.max(G.innings, G.inning);
  const head = '<tr><th></th>' + Array.from({ length: n }, (_, i) => `<th>${i + 1}</th>`).join('') + '<th>R</th><th>H</th></tr>';
  const row = (T, i) => `<tr${i === G.you ? ' class="you"' : ''}><td>${T.name}</td>` + Array.from({ length: n }, (_, j) => `<td>${T.runs[j] == null ? '' : T.runs[j]}</td>`).join('') + `<td><b>${total(T)}</b></td><td>${T.hits}</td></tr>`;
  return `<table>${head}${row(G.teams[0], 0)}${row(G.teams[1], 1)}</table>`;
}

/* ------------------------------------------------------------ the clock */
function stepPlay(dt) {
  G.st += dt; G.clockT += dt;
  const P = G.fielders.P;
  if (G.state === 'idle' && youBat() && G.st > 1.2) cpuPitch();
  if (G.state === 'windup' && P.t >= A.RELEASE_T && !G.pitch.released) {
    const p = G.pitch; p.released = true; p.relT = G.clockT; p.arrive = p.relT + p.T;
    P.step(0); p.release = P.c.worldOf('rH'); G.state = 'flight'; G.st = 0;
    G.ball.state = 'pitch'; G.ball.hist.length = 0; if (G.batter && !G.swung) G.batter.play(A.STRIDE);
    if (!youBat()) cpuDecide();
    $('tell').textContent = '';
  }
  if (G.state === 'flight') {
    const p = G.pitch;
    if (G.cpuSwing && !G.swung && G.clockT >= G.cpuSwing.at) { G.aim.copy(G.cpuSwing.aim); swing(false); }
    if (G.swung && !G.contactJudged && G.clockT >= G.swingAt + (G.bunt ? 0.25 : A.CONTACT_T) - 1e-4) {
      G.contactJudged = true; if (judgeContact()) { G.contactJudged = false; return; }
    }
    if (G.clockT >= p.arrive + 0.25) {
      G.contactJudged = false;
      const iz = inZone(p.target.x, p.target.y);
      if (G.swung) { banner(G.bunt ? 'MISSED BUNT' : 'SWING AND A MISS', 'strike'); G.s++; }
      else if (iz) { banner('STRIKE', 'strike'); G.s++; }
      else { banner('BALL', 'ball'); G.b++; }
      $('tell').textContent = p.name + (p.type === 'cu' ? ' · higher arm' : p.type === 'sl' ? ' · lower arm' : '');
      if (G.s >= 3) { banner('STRUCK OUT', 'strike'); G.outs++; G.batter.play(A.SLUMP); G.paDone = true; finishPlay(2.0); }
      else if (G.b >= 4) { banner('WALK', 'ball'); walk(); G.paDone = true; finishPlay(1.8); }
      else finishPlay(0.8);
      updateHud();
    }
  }
  if (G.throwPrep && G.clockT >= G.throwPrep.at) {
    const { f, base } = G.throwPrep; G.throwPrep = null;
    if (G.holder === f) { f.yaw = yawTo(f.pos, BASE_LIST[base]); f.play(A.throwClip()); f.override = null; G.throwing = { f, base, at: G.clockT + A.THROW_RELEASE }; }
  }
  if (G.throwing && G.clockT >= G.throwing.at) {
    const th = G.throwing; G.throwing = null;
    const catcher = th.base === 1 ? G.fielders['1B'] : th.base === 2 ? G.fielders.SS : th.base === 3 ? G.fielders['3B'] : G.fielders.C;
    const from = th.f.c.worldOf('rH'), to = catcher.pos.clone().add(new THREE.Vector3(0, 3.2, 0)), d = from.distanceTo(to);
    G.ball.state = 'thrown'; G.thrown = { from, to, t0: G.clockT, T: Math.max(0.35, d / th.f.arm), arc: d * 0.04, catcher, base: th.base }; G.holder = null;
  }
  for (const r of G.runners) updateRunner(r, dt);
  for (const p of POSITIONS) updateFielder(G.fielders[p], dt);
  /* nobody planned for it: the nearest man goes and gets it */
  /* once it is on the ground the plan is over: the nearest man runs it down */
  if ((G.state === 'inplay' || G.state === 'after') && G.ball.state === 'hit' && G.ball.bounced && !G.holder && !G.result) {
    let near = null; for (const r of POSITIONS) { if (r === 'C') continue; const f = G.fielders[r]; const d = f.pos.distanceTo(G.ball.pos) + (f.missed ? 12 : 0); if (!near || d < near.d) near = { f, d }; }
    for (const r of POSITIONS) { const f = G.fielders[r]; if (f !== near.f && f.task && f.task.kind !== 'cover') f.task = { kind: 'cover', to: f.pos.clone() }; }
    if (!near.f.task || near.f.task.kind !== 'field') near.f.task = { kind: 'field', to: G.ball.pos.clone() };
    near.f.task.to.copy(G.ball.pos);
  }
  if (G.state === 'after' && G.st > G.after) {
    const running = G.runners.some((r) => !r.done && !r.out && !r.scored && !r.hold);
    if (running && G.st < G.after + 6) return;
    const inPlay = G.runners.some((r) => r.batter);
    if (G.foulPlay && !G.paDone) {
      const br = G.runners.find((r) => r.batter); G.runners = G.runners.filter((r) => !r.batter);
      if (br) { G.batter = br.actor; br.actor.override = null; br.actor.c.bat.visible = true; }
      for (const r of G.runners) { if (r.base0 != null) r.at = r.base0; r.scored = false; }
      G.foulPlay = false; resetPitch(); return; }
    if (inPlay || G.paDone) { G.paDone = false; settle(); updateHud(); endPA(); return; }
    resetPitch();
  }
}

/* ------------------------------------------------------------ hud */
function updateHud() {
  if (!G.teams) return;
  const [away, home] = G.teams;
  $('sb-away').innerHTML = `<i style="background:${away.color}"></i>${away.name}<b>${total(away)}</b>`;
  $('sb-home').innerHTML = `<i style="background:${home.color}"></i>${home.name}<b>${total(home)}</b>`;
  $('sb-inn').textContent = (G.half ? 'Bot ' : 'Top ') + G.inning;
  $('sb-count').innerHTML = `<b>B</b>${dots(G.b, 3)} <b>S</b>${dots(G.s, 2)} <b>O</b>${dots(G.outs, 2)}`;
  for (let i = 1; i <= 3; i++) $('base' + i).classList.toggle('on', G.runners.some((r) => !r.batter && r.at === i));
  document.body.classList.toggle('pitching', !youBat());
  if (G.batter) ui.name.textContent = (youBat() ? 'You bat: ' : 'They bat: ') + nm(G.batter.key) + '  ·  ' + (youBat() ? 'Pitching: ' : 'You pitch: ') + nm(G.fielders.P.key);
}
const dots = (n, m) => '●'.repeat(Math.min(n, m)).padEnd(m, '○');

/* ------------------------------------------------------------ cameras */
function fitFov(vfov, ref = 1.5) {
  const a = camera.aspect; if (a >= ref) return vfov;
  const h = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(vfov) / 2) * ref);
  return Math.min(80, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(h / 2) / a)));
}
const camPos = new THREE.Vector3(0, 7, 30), camLook = new THREE.Vector3(0, 2.6, -28);
function playCamera(dt) {
  const b = G.ball; let pos, look, fov;
  const live = G.state === 'inplay' || (G.state === 'after' && !G.foulPlay && (G.runners.some((r) => r.batter) || G.result === 'out'));
  if (live) {
    const tgt = b.state !== 'hidden' ? b.pos : MOUND;
    const L = new THREE.Vector3(tgt.x * 0.75, 0, Math.min(-10, tgt.z * 0.8));
    pos = new THREE.Vector3(L.x * 0.35, 34 + Math.max(0, -L.z) * 0.22, 40 + L.z * 0.25); look = L; fov = fitFov(48, 1.15);
  } else if ($('sel-cam').value === 'wide') { pos = new THREE.Vector3(0, 36, 48); look = new THREE.Vector3(0, 0, -52); fov = fitFov(50, 1.15); }
  else {
    /* upright, the plate camera keeps the batter and the zone and lets the
       foul ground go: it frames a narrower slice, centred between them */
    const narrow = camera.aspect < 1; const bx = G.batter && G.batter.c.lefty ? 1 : -1;
    pos = new THREE.Vector3(narrow ? bx : 0, 7.2, 30); look = new THREE.Vector3(narrow ? bx : 0, 2.6, -28); fov = narrow ? fitFov(19, 0.72) : 19;
  }
  const k = 1 - Math.exp(-dt * (live ? 3.2 : 6));
  camPos.lerp(pos, k); camLook.lerp(look, k); camera.fov += (fov - camera.fov) * k; camera.updateProjectionMatrix();
  camera.position.copy(camPos); camera.lookAt(camLook);
  if (G.fielders.C) G.fielders.C.root.visible = live || $('sel-cam').value === 'wide';
}

/* ------------------------------------------------------------ input */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), zonePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -ZONE.z);
function zoneFrom(e, out) {
  const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera); const hit = new THREE.Vector3(); if (ray.ray.intersectPlane(zonePlane, hit)) out.set(clamp(hit.x, -1.7, 1.7), clamp(hit.y, 0.9, 4.3));
}
canvas.addEventListener('pointermove', (e) => { if (mode === 'play' && e.pointerType === 'mouse' && G.teams) { if (youBat()) zoneFrom(e, G.aim); else if (G.state === 'aim') zoneFrom(e, G.target); } });
canvas.addEventListener('pointerdown', (e) => {
  if (mode === 'cast') { orbit.drag = { x: e.clientX, a: orbit.a }; return; }
  if (!G.teams || G.state === 'menu' || G.over) return;
  if (youBat()) { zoneFrom(e, G.aim); swing(false); }
  else if (G.state === 'aim') { zoneFrom(e, G.target); if (e.pointerType === 'mouse') throwPlayerPitch(); }
});
addEventListener('pointerup', () => { orbit.drag = null; });
addEventListener('pointermove', (e) => { if (orbit.drag) orbit.a = orbit.drag.a - (e.clientX - orbit.drag.x) * 0.01; });
const keys = {};
addEventListener('keydown', (e) => {
  keys[e.key] = true;
  if (mode === 'play' && G.teams && !G.over) {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (youBat()) swing(false); else throwPlayerPitch(); }
    if ((e.key === 'b' || e.key === 'B') && youBat()) swing(true);
    if (!youBat() && '1234'.includes(e.key)) setPitchType(['fb', 'sl', 'cu', 'ch'][+e.key - 1]);
  }
  if (mode === 'cast' && e.key === 'ArrowRight') castStep(1); if (mode === 'cast' && e.key === 'ArrowLeft') castStep(-1);
});
addEventListener('keyup', (e) => { keys[e.key] = false; });
function setPitchType(t) { G.ptype = t; document.querySelectorAll('#pitchbar [data-p]').forEach((b) => b.classList.toggle('on', b.dataset.p === t)); }
document.querySelectorAll('#pitchbar [data-p]').forEach((b) => (b.onclick = () => setPitchType(b.dataset.p)));
$('b-throw').onclick = () => throwPlayerPitch();
$('b-bunt').onclick = () => swing(true);
$('b-swing').onclick = () => swing(false);
$('b-opts').onclick = () => document.body.classList.toggle('opts');

/* ------------------------------------------------------------ menu */
const menu = { yours: randomNine(), them: null, innings: 3, home: true, club: CLUBS[rnd() * CLUBS.length | 0] };
function drawMenu() {
  const t = makeTeam(menu.yours, 'You', '#1f3f7a');
  $('m-team').innerHTML = t.order.map((k, i) => `<li><span>${POSITIONS.find((p) => t.pos[p] === k)}</span>${nm(k)}</li>`).join('');
  $('m-opp').textContent = menu.club;
  document.querySelectorAll('#m-inn button').forEach((b) => b.classList.toggle('on', +b.dataset.n === menu.innings));
  document.querySelectorAll('#m-side button').forEach((b) => b.classList.toggle('on', (b.dataset.s === 'home') === menu.home));
}
$('m-shuffle').onclick = () => { menu.yours = randomNine(); drawMenu(); };
document.querySelectorAll('#m-inn button').forEach((b) => (b.onclick = () => { menu.innings = +b.dataset.n; drawMenu(); }));
document.querySelectorAll('#m-side button').forEach((b) => (b.onclick = () => { menu.home = b.dataset.s === 'home'; drawMenu(); }));
$('m-play').onclick = () => startGame();
$('end-again').onclick = () => { document.body.classList.remove('end'); menu.club = CLUBS[rnd() * CLUBS.length | 0]; showMenu(); };
function showMenu() { G.state = 'menu'; document.body.classList.add('menu'); drawMenu(); }
function startGame() {
  document.body.classList.remove('menu', 'end');
  clearActors();
  const mine = makeTeam(menu.yours, 'You', '#1f3f7a'), theirs = makeTeam(randomNine(menu.yours), menu.club.split(' ').pop(), '#a8282a');
  G.teams = menu.home ? [theirs, mine] : [mine, theirs]; G.you = menu.home ? 1 : 0;
  Object.assign(G, { innings: menu.innings, inning: 1, half: 0, outs: 0, b: 0, s: 0, over: false, clockT: 0 });
  setField(); newBatter();
  banner('PLAY BALL!' + (youBat() ? '' : ' YOU PITCH'), 'side', 1800);
}

/* ============================================================ CAST */
const orbit = { a: 0.6, drag: null };
const cast = { i: Math.max(0, KEYS.indexOf('paulbunyan')), actor: null, anim: 'Swing' };
const HELMET = '#1f3f7a';
const pad = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.4, 0.6, 32), new THREE.MeshLambertMaterial({ color: '#c09060' })); pad.position.set(0, 0.3, -12); pad.receiveShadow = true; pad.visible = false; scene.add(pad);
function loopClip(c, dur) { const k = c.keys.map((x) => Object.assign({}, x)); k.push(Object.assign({}, k[0], { t: dur })); return A.clip(k, { loop: true }); }
const ANIMS = {
  Idle: () => A.IDLE, Stance: () => A.STANCE_IDLE,
  Swing: () => A.clip([...A.STRIDE.keys.map((k) => Object.assign({}, k)), ...A.swingClip(0).keys.map((k) => Object.assign({}, k, { t: k.t + 0.75 })), Object.assign({}, A.STANCE, { t: 2.6, bat: A.STANCE.bat })], { loop: true }),
  'Swing low': () => A.clip([...A.STRIDE.keys.map((k) => Object.assign({}, k)), ...A.swingClip(-0.55).keys.map((k) => Object.assign({}, k, { t: k.t + 0.75 })), Object.assign({}, A.STANCE, { t: 2.6, bat: A.STANCE.bat })], { loop: true }),
  Bunt: () => A.clip([...A.BUNT.keys, Object.assign({}, A.STANCE, { t: 1.8 })], { loop: true }),
  'Pitch: fastball': () => loopClip(A.pitchClip('fb'), 2.2), 'Pitch: curve': () => loopClip(A.pitchClip('cu'), 2.2), 'Pitch: slider': () => loopClip(A.pitchClip('sl'), 2.2),
  Run: 'run', Field: () => A.READY_CLIP, Dive: () => loopClip(A.diveClip(1), 2.0), Throw: () => loopClip(A.throwClip(), 1.6), Slide: () => loopClip(A.SLIDE, 1.6),
  Cheer: () => A.CHEER, Slump: () => loopClip(A.SLUMP, 3.0), Signature: () => A.SIGNATURE,
};
function castShow() {
  if (cast.actor) cast.actor.dispose();
  const key = KEYS[cast.i]; const a = new Actor(key); cast.actor = a;
  a.pos.set(0, 0.6, -12); setCastAnim(cast.anim);
  ui.name.textContent = (cast.i + 1) + ' / ' + KEYS.length + '  ·  ' + nm(key);
}
function setCastAnim(n) {
  cast.anim = n; const a = cast.actor; if (!a) return;
  const bats = /Swing|Bunt|Stance/.test(n); a.c.bat.visible = bats; a.c.setHelmet(bats, HELMET);
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
function hideBall() { const b = G.ball; b.g.visible = b.sh.visible = false; b.trail.forEach((t) => (t.visible = false)); }
function setMode(m) {
  mode = m; document.body.dataset.mode = m;
  for (const a of G.actors) a.root.visible = m === 'play';
  hideBall(); zoneG.visible = m === 'play'; pad.visible = m === 'cast';
  if (m === 'cast') castShow();
  else { if (cast.actor) { cast.actor.dispose(); cast.actor = null; } ui.name.textContent = ''; if (!G.teams) showMenu(); else updateHud(); }
  document.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
}
document.querySelectorAll('#modes button').forEach((b) => (b.onclick = () => setMode(b.dataset.m)));
document.querySelectorAll('#levels button').forEach((b, i) => (b.onclick = () => { level = i; resize(); document.querySelectorAll('#levels button').forEach((x, j) => x.classList.toggle('on', j === i)); }));
$('b-outline').onclick = () => { OPTS.outlines = !OPTS.outlines; scene.traverse((o) => { if (o.userData.outline) o.visible = OPTS.outlines; }); $('b-outline').classList.toggle('on', OPTS.outlines); };
$('b-shadow').onclick = () => { sun.castShadow = !sun.castShadow; $('b-shadow').classList.toggle('on', sun.castShadow); };
$('b-quit').onclick = () => { if (G.teams && !G.over && !confirm('Quit this game?')) return; clearActors(); G.teams = null; hideBall(); showMenu(); };

function steer(dt) {
  if (mode !== 'play' || !G.teams) return;
  const v = youBat() ? G.aim : G.target, live = youBat() ? (G.state === 'flight' || G.state === 'windup' || G.state === 'idle') : G.state === 'aim';
  if (!live) return;
  if (keys.ArrowLeft) v.x -= dt * 3; if (keys.ArrowRight) v.x += dt * 3; if (keys.ArrowUp) v.y += dt * 3; if (keys.ArrowDown) v.y -= dt * 3;
  v.set(clamp(v.x, -1.7, 1.7), clamp(v.y, 0.9, 4.3));
}
function tick(dt, real) {
  let wdt = dt;
  if (G.hitstop > 0) { G.hitstop -= dt; wdt = 0; }
  if (G.teams && !G.over) stepPlay(wdt);
  for (const a of G.actors) a.step(wdt);
  steer(dt);
  aimRing.position.set(G.aim.x, G.aim.y, ZONE.z + 0.02); aimRing.visible = !!G.teams && youBat() && !!G.batter && G.state !== 'inplay' && G.state !== 'after';
  targetRing.position.set(G.target.x, G.target.y, ZONE.z + 0.02); targetRing.visible = !!G.teams && !youBat() && G.state === 'aim';
  updateBall(wdt); playCamera(dt);
  if (flash.visible) { flash.userData.t += dt; const u = flash.userData.t / 0.25; flash.scale.setScalar(1 + u * (2 + flash.userData.q * 3)); flash.material.opacity = 1 - u; flash.lookAt(camera.position); if (u >= 1) flash.visible = false; }
  if (G.cheer > 0) { G.cheer -= dt; park.cheer(real, Math.min(1, G.cheer)); }
}

const perf = { frames: [], last: performance.now() };
let paused = false;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = now - perf.last; perf.last = now; const dt = Math.min(0.05, raw / 1000);
  perf.frames.push(raw); if (perf.frames.length > 120) perf.frames.shift();
  if (paused) return;
  if (mode === 'play') { if (PROTO.auto) autoplay(); tick(dt, now / 1000); }
  else { cast.actor && cast.actor.step(dt); castCamera(dt); }
  const cpu = performance.now() - now; perf.cpu = (perf.cpu || cpu) * 0.95 + cpu * 0.05;
  renderer.render(scene, camera);
  if ((perf.n = (perf.n || 0) + 1) % 15 === 0) {
    const f = perf.frames.slice().sort((a, b) => a - b); const avg = f.reduce((a, b) => a + b, 0) / f.length; const p95 = f[Math.floor(f.length * 0.95)] || 0;
    ui.stats.textContent = `${(1000 / avg).toFixed(0)} fps · p95 ${p95.toFixed(1)}ms · game ${perf.cpu.toFixed(1)}ms · ${renderer.info.render.calls} draws`;
  }
}

/* a bot that plays your half, for the soak test: it aims near the pitch,
   swings a little early or late, and pitches to random spots */
function autoplay() {
  if (!G.teams || G.over) return;
  if (youBat()) {
    const p = G.pitch;
    if (G.state === 'flight' && !G.swung && p && !p.botT) { p.botT = p.arrive - A.CONTACT_T + gauss() * 0.06; p.botSwing = inZone(p.target.x, p.target.y) ? rnd() < 0.85 : rnd() < 0.25; }
    if (G.state === 'flight' && !G.swung && p && p.botSwing && G.clockT >= p.botT) { G.aim.set(p.target.x + gauss() * 0.25, p.target.y + gauss() * 0.25); swing(rnd() < 0.05); }
  } else if (G.state === 'aim' && G.st > 0.4) { setPitchType(['fb', 'sl', 'cu', 'ch'][rnd() * 4 | 0]); G.target.set((rnd() - 0.5) * 2.2, 1.4 + rnd() * 2.4); throwPlayerPitch(); }
}

/* checker hooks: nothing on the page reads these */
const PROTO = window.PROTO = {
  THREE, scene, camera, renderer, G, cast, menu, auto: false, setMode, castStep, setCastAnim, swing, ANIMS, startGame, throwPlayerPitch, setPitchType, autoplay,
  castTo(k) { cast.i = Math.max(0, KEYS.indexOf(k)); castShow(); }, orbitSet(a) { orbit.a = a; orbit.drag = { x: 0, a }; },
  pause: (v) => (paused = v),
  tick(dt = 1 / 60) { if (PROTO.auto) autoplay(); tick(dt, 0); },
  stepFrames(n, dt = 1 / 60) { for (let i = 0; i < n; i++) { if (mode === 'play') { if (PROTO.auto) autoplay(); tick(dt, 0); } else { cast.actor.step(dt); castCamera(dt); } } renderer.render(scene, camera); },
};

resize(); setMode('play'); requestAnimationFrame(frame);
