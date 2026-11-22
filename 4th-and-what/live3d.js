/* 4th and What: the play, in a 3D stadium (the owner, 2026-11-19: "Build it").
 *
 *   FAW_LIVE3D.ok()                          can this browser draw it (WebGL)
 *   FAW_LIVE3D.show(canvas, result, ui)      the same call and the same ui as FAW_LIVE.show
 *
 * The engine has already decided everything; this only draws its frames, on
 * FAW_LIVE.run's clock (play.js), so the beat at the line, the slow motion,
 * the captions, the sounds, the measurement and the card are the pixel
 * stadium's to the frame. When this cannot run (no WebGL, three.js did not
 * load) the pixel stadium plays instead.
 *
 * STAGE 1 (the stadium): one field for every snap (both end zones, the
 * numbers, the hashes), stands of crowd on three sides under four light
 * towers, the line of scrimmage and the yellow line laid on the turf for the
 * snap, the broadcast camera behind the offense following the ball and
 * leaning in at the throw, the catch and the tackle, players built of a few
 * rounded shapes in their team's colours with numbers, a soft shadow under
 * each, a leg and arm swing from how fast each man moves, and the ball.
 * Shadows are painted, not cast, so a phone keeps its frame rate.
 *
 * three.js is the site's shared copy (assets/vendor/three-0.180.0), the one
 * Shut The Door and MythiBall load.
 *
 * Module script: window.FAW_LIVE3D.
 */
import * as THREE from '/assets/vendor/three-0.180.0/three.module.min.js';

const FIELD_W = 53.33;
const TEAM = {
  O: { jersey: '#b3122e', trim: '#f5b72a', pants: '#f2e6c8', helmet: '#b3122e', num: '#ffffff', mask: '#e9e2cf' },
  D: { jersey: '#f4f6fa', trim: '#0b2a55', pants: '#0b2a55', helmet: '#0b2a55', num: '#0b2a55', mask: '#9aa6b5' }
};
const NUM = { QB: 12, RB: 28, WR1: 11, WR2: 81, SLOT: 17, TE: 87, LT: 71, LG: 66, C: 55, RG: 64, RT: 77 };
const DNUM = { dl: [90, 94, 97, 99], lb: [50, 54, 56, 59], cb: [21, 24], s: [31, 33] };

/* field yards to the world: x across, z = minus the yards downfield, y up; 1 unit = 1 yard */
const wx = (x) => x - FIELD_W / 2, wz = (y) => -y;

let world = null;      /* the stadium, built once and shared by every canvas */
const views = new WeakMap();

let can = null;
function ok() {
  /* a very weak phone (2 cores or fewer, or 2 GB or less) keeps the pixel
     stadium, which it already plays smoothly */
  const weak = (navigator.hardwareConcurrency || 8) <= 2 || (navigator.deviceMemory || 8) <= 2;
  if (can === null) { try { const c = document.createElement('canvas'); can = !weak && !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { can = false; } }
  return can;
}
/* an older phone (few cores) draws at one pixel per pixel */
const LITE = (navigator.hardwareConcurrency || 8) <= 4;

/* ---------- the field, painted once ---------- */
function fieldTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 4096;
  const g = c.getContext('2d'), X0 = -10, XW = FIELD_W + 20, Y0 = -12, YL = 124;
  const tx = (x) => (x - X0) / XW * c.width, ty = (y) => c.height - (y - Y0) / YL * c.height;
  g.fillStyle = '#1d5f30'; g.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < 100; y += 5) { g.fillStyle = (y / 5) % 2 ? '#2b7c40' : '#318746'; g.fillRect(tx(0), ty(y + 5), tx(FIELD_W) - tx(0), ty(y) - ty(y + 5)); }
  /* the end zones, the game's colours and its name */
  [[-10, 0], [100, 110]].forEach(([a, b], k) => {
    g.fillStyle = '#0d2a4d'; g.fillRect(tx(0), ty(b), tx(FIELD_W) - tx(0), ty(a) - ty(b));
    g.save(); g.translate((tx(0) + tx(FIELD_W)) / 2, (ty(a) + ty(b)) / 2); if (k === 0) g.rotate(Math.PI);
    g.font = 'italic 900 150px "Barlow Condensed", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#f5b72a'; g.fillText('4TH', -230, 6); g.fillStyle = '#19c6a7'; g.fillText('&', -70, 6); g.fillStyle = '#ffffff'; g.fillText('WHAT', 150, 6);
    g.restore();
  });
  /* grain */
  for (let i = 0; i < 120000; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.06)'; g.fillRect(Math.random() * c.width, Math.random() * c.height, 2, 2); }
  /* lines */
  g.strokeStyle = '#ffffff'; g.lineWidth = 7; g.strokeRect(tx(0), ty(110), tx(FIELD_W) - tx(0), ty(-10) - ty(110));
  g.lineWidth = 5; g.globalAlpha = 0.92;
  for (let y = 0; y <= 100; y += 5) { g.beginPath(); g.moveTo(tx(0), ty(y)); g.lineTo(tx(FIELD_W), ty(y)); g.stroke(); }
  g.globalAlpha = 1; g.fillStyle = '#ffffff';
  for (let y = 1; y < 100; y++) { if (y % 5 === 0) continue; [0.4, 23.58, 29.15, FIELD_W - 0.9].forEach((x) => g.fillRect(tx(x), ty(y) - 2, 12, 4)); }
  /* the numbers, turned to the sidelines */
  g.font = '900 96px "Barlow Condensed", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(255,255,255,.9)';
  for (let y = 10; y < 100; y += 10) { const n = y <= 50 ? y : 100 - y; [[9, Math.PI / 2], [FIELD_W - 9, -Math.PI / 2]].forEach(([x, r]) => { g.save(); g.translate(tx(x), ty(y)); g.rotate(r); g.fillText(String(n), 0, 0); g.restore(); }); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return { tex: t, w: XW, l: YL, cx: X0 + XW / 2, cy: Y0 + YL / 2 };
}

function crowdTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#0b1626'; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 26000; i++) { const k = Math.random(); g.fillStyle = k < 0.28 ? '#b3122e' : k < 0.42 ? '#f5b72a' : k < 0.58 ? '#dfe6ef' : k < 0.72 ? '#5a6a82' : '#26364c'; g.fillRect(Math.random() * c.width, Math.random() * c.height, 3, 3); }
  for (let r = 0; r < 8; r++) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, r * 32 + 28, c.width, 4); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1);
  return t;
}
function blobTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 2, 32, 32, 32); r.addColorStop(0, 'rgba(0,0,0,.55)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 2, 64, 64, 64); r.addColorStop(0, 'rgba(255,250,228,1)'); r.addColorStop(0.18, 'rgba(255,240,200,.55)'); r.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function numberTexture(n, fg, bg) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 128, 128); g.fillStyle = fg; g.font = '900 86px "Barlow Condensed", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* ---------- the poses (stage 2) ----------
 * Where each joint wants to be, in radians, for each pose the engine sends
 * (engine.js poseOf: idle, run, carry, block, throw, catch, dive, down) and
 * the two before the snap (a two point stance, a three point stance).
 *   pitch  the whole man tipping forward from the hips (minus is forward)
 *   drop   the hips lowered, in yards
 *   lean   the torso leaning forward (minus), twist turning it (plus turns to his left)
 *   lh lk  left hip and knee (hip plus swings the thigh forward, knee minus bends it)
 *   ls lz le lez   left shoulder forward, shoulder out to the side, elbow, elbow in the arm's plane
 * The r names are the right side. s is the stride's swing (-1 to 1) and w how
 * hard he is running (0 to 1), both from his speed on screen. */
const J0 = { pitch: 0, drop: 0, lean: 0, twist: 0, lh: 0, lk: 0, rh: 0, rk: 0, ls: 0, lz: 0, le: 0, lez: 0, rs: 0, rz: 0, re: 0, rez: 0 };
const pose = (o) => Object.assign({}, J0, o);
function stride(s, c, w, o) {
  /* a running stride: the thighs swing against each other, the knee bends most
     as the leg comes through, the arms pump against the legs */
  const k = (q) => -0.25 - w * (0.55 + 0.55 * q);
  return pose(Object.assign({ lean: -0.08 - 0.28 * w, drop: -0.05 * w * Math.abs(c),
    lh: 0.15 * w + 0.85 * w * s, lk: k(-c), rh: 0.15 * w - 0.85 * w * s, rk: k(c),
    ls: -0.8 * w * s + 0.1, lz: -0.12, le: 0.5 + 0.9 * w, rs: 0.8 * w * s + 0.1, rz: 0.12, re: 0.5 + 0.9 * w }, o || {}));
}
const POSE = {
  idle: () => pose({ lean: -0.05, lh: 0.05, lk: -0.12, rh: 0.05, rk: -0.12, ls: 0.12, lz: -0.14, le: 0.35, rs: 0.12, rz: 0.14, re: 0.35 }),
  stance: () => pose({ drop: -0.2, lean: -0.75, lh: 0.9, lk: -1.1, rh: 0.5, rk: -0.8, ls: 0.95, lz: -0.06, le: 0.2, rs: 0.95, rz: 0.06, re: 0.2 }),
  qb: () => pose({ drop: -0.08, lean: -0.3, lh: 0.4, lk: -0.55, rh: 0.3, rk: -0.5, ls: 0.95, lz: 0.22, le: 0.75, rs: 0.95, rz: -0.22, re: 0.75 }),
  stance3: () => pose({ drop: -0.38, lean: -1.12, lh: 1.25, lk: -1.75, rh: 0.85, rk: -1.4, ls: 0.6, lz: -0.1, le: 0.9, rs: 1.35, rz: 0.05, re: 0.05 }),
  run: (s, c, w) => stride(s, c, w),
  carry: (s, c, w) => stride(s, c, w, { rs: 0.45, rz: 0.12, re: 2.0 }),
  block: (s, c, w, fr) => pose({ drop: -0.24, lean: -0.48, lh: fr ? 0.75 : 0.55, lk: fr ? -1.05 : -0.85, rh: fr ? 0.5 : 0.7, rk: fr ? -0.8 : -1.0,
    ls: 1.75, lz: 0.18, le: 0.3, rs: 1.75, rz: -0.18, re: 0.3 }),
  throw: (s, c, w, fr) => fr
    ? pose({ lean: -0.38, twist: 0.5, lh: 0.55, lk: -0.45, rh: -0.45, rk: -0.7, ls: 0.25, lz: -0.45, le: 1.1, rs: 1.7, rz: 0.35, re: 0.15 })
    : pose({ lean: -0.08, twist: -0.65, lh: 0.4, lk: -0.3, rh: -0.25, rk: -0.35, ls: 1.15, lz: 0.05, le: 0.2, rs: -0.15, rz: 1.45, re: 0, rez: 1.55 }),
  catch: (s, c, w) => stride(s, c, w * 0.6, { lean: 0.02, ls: 2.65, lz: -0.12, le: 0.2, rs: 2.65, rz: 0.12, re: 0.2 }),
  dive: () => pose({ pitch: -1.05, drop: -0.32, lean: -0.15, lh: -0.25, lk: -0.35, rh: 0.1, rk: -0.6, ls: 2.9, lz: -0.2, le: 0.1, rs: 2.9, rz: 0.2, re: 0.1 }),
  down: () => pose({ pitch: -1.5, drop: -0.66, lean: 0, lh: -0.05, lk: -0.25, rh: 0.15, rk: -0.5, ls: 2.7, lz: -0.55, le: 0.4, rs: 2.4, rz: 0.6, re: 0.6 })
};
function applyPose(m, t, k) {
  const j = m.j;
  for (const n in t) j[n] += (t[n] - j[n]) * k;
  m.root.rotation.x = j.pitch; m.root.position.y = 0.95 + j.drop;
  m.torso.rotation.set(j.lean, j.twist, 0, 'YXZ');
  m.L.hip.rotation.x = j.lh; m.L.knee.rotation.x = j.lk; m.R.hip.rotation.x = j.rh; m.R.knee.rotation.x = j.rk;
  m.LA.sh.rotation.set(j.ls, 0, j.lz, 'ZXY'); m.LA.el.rotation.set(j.le, 0, -j.lez);
  m.RA.sh.rotation.set(j.rs, 0, j.rz, 'ZXY'); m.RA.el.rotation.set(j.re, 0, j.rez);
}


/* ---------- the stadium ---------- */
function build() {
  if (world) return world;
  const S = new THREE.Scene();
  S.background = new THREE.Color('#050b16'); S.fog = new THREE.Fog('#050b16', 120, 230);
  const F = fieldTexture();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(F.w, F.l), new THREE.MeshLambertMaterial({ map: F.tex }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(wx(F.cx), 0, wz(F.cy)); S.add(ground);
  /* an apron of darker grass and a track around it */
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(130, 230), new THREE.MeshLambertMaterial({ color: '#163f22' }));
  apron.rotation.x = -Math.PI / 2; apron.position.set(0, -0.02, wz(50)); S.add(apron);
  /* the stands: crowd on both sides and behind each end zone, tilted back */
  const crowd = crowdTexture(), standMat = new THREE.MeshLambertMaterial({ map: crowd, emissive: new THREE.Color('#1a2438'), emissiveIntensity: 0.9 });
  const stand = (w, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 30), standMat); m.position.set(x, 13, z); m.rotation.set(0, ry, 0); m.rotateX(-0.55); S.add(m); };
  stand(220, -48, wz(50), Math.PI / 2); stand(220, 48, wz(50), -Math.PI / 2); stand(110, 0, wz(128), 0); stand(110, 0, wz(-28), Math.PI);
  /* the light towers */
  const glow = glowTexture();
  [[-50, 115], [50, 115], [-50, -15], [50, -15], [-50, 50], [50, 50]].forEach(([x, y]) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 40, 6), new THREE.MeshLambertMaterial({ color: '#1b2638' })); pole.position.set(x, 20, wz(y)); S.add(pole);
    const bank = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 0.6), new THREE.MeshBasicMaterial({ color: '#fff8e2' })); bank.position.set(x, 41, wz(y)); bank.lookAt(0, 0, wz(50)); S.add(bank);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, opacity: 0.85 })); sp.position.set(x, 41, wz(y)); sp.scale.set(34, 34, 1); S.add(sp);
  });
  /* the light: a night sky, the towers' warm key and a cool fill */
  S.add(new THREE.HemisphereLight('#9fb8ff', '#203820', 0.9));
  const key = new THREE.DirectionalLight('#fff3dc', 2.1); key.position.set(-40, 70, -30); S.add(key);
  const fill = new THREE.DirectionalLight('#bcd4ff', 0.7); fill.position.set(40, 50, 40); S.add(fill);
  /* the lines for the snap: blue at the line of scrimmage, yellow at the line to gain */
  const band = (col) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_W, 0.32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.92, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); m.rotation.x = -Math.PI / 2; m.position.set(0, 0.02, 0); S.add(m); return m; };
  const los = band('#3d9bff'), gain = band('#ffd628');
  /* the players, made once: eleven a side. Each is a small rig (stage 2): hips
     that tip the whole man, a torso that leans and turns, thighs and shins with
     knees, upper arms and forearms with elbows. The pose sets where each joint
     wants to be (POSE, below) and the joints ease toward it every frame. */
  const blob = blobTexture(), men = [];
  const geo = {
    thigh: new THREE.CapsuleGeometry(0.17, 0.28, 4, 8), shin: new THREE.CapsuleGeometry(0.14, 0.3, 4, 8), shoe: new THREE.BoxGeometry(0.24, 0.12, 0.38),
    torso: new THREE.CapsuleGeometry(0.36, 0.5, 6, 12), pads: new THREE.SphereGeometry(0.5, 16, 10),
    upper: new THREE.CapsuleGeometry(0.12, 0.2, 4, 8), fore: new THREE.CapsuleGeometry(0.1, 0.2, 4, 8), glove: new THREE.SphereGeometry(0.1, 8, 6),
    helmet: new THREE.SphereGeometry(0.3, 20, 14), stripe: new THREE.BoxGeometry(0.06, 0.05, 0.62), mask: new THREE.TorusGeometry(0.2, 0.025, 6, 16, Math.PI),
    num: new THREE.PlaneGeometry(0.55, 0.55), shadow: new THREE.PlaneGeometry(1.8, 1.8)
  };
  const mats = {};
  ['O', 'D'].forEach((k) => { const T = TEAM[k]; mats[k] = {
    jersey: new THREE.MeshLambertMaterial({ color: T.jersey }), pants: new THREE.MeshLambertMaterial({ color: T.pants }), shoe: new THREE.MeshLambertMaterial({ color: '#111' }),
    glove: new THREE.MeshLambertMaterial({ color: k === 'O' ? '#f5f1e6' : '#0b2a55' }),
    helmet: new THREE.MeshStandardMaterial({ color: T.helmet, roughness: 0.25, metalness: 0.35 }), trim: new THREE.MeshLambertMaterial({ color: T.trim }), mask: new THREE.MeshLambertMaterial({ color: T.mask }) }; });
  const shadowMat = new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false });
  const mesh = (g, m, x, y, z, parent) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); parent.add(o); return o; };
  const pivot = (x, y, z, parent) => { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; };
  for (let i = 0; i < 22; i++) {
    const side = i < 11 ? 'O' : 'D', M = mats[side], G = new THREE.Group();
    /* the hips: 0.95 up, so the feet touch the turf when he stands */
    const root = pivot(0, 0.95, 0, G), torso = pivot(0, 0, 0, root);
    const leg = (x) => {
      const hip = pivot(x, 0, 0, root); mesh(geo.thigh, M.pants, 0, -0.24, 0, hip);
      const knee = pivot(0, -0.48, 0, hip); mesh(geo.shin, M.pants, 0, -0.22, 0, knee); mesh(geo.shoe, M.shoe, 0, -0.43, -0.06, knee);
      return { hip, knee };
    };
    const arm = (x) => {
      const sh = pivot(x, 0.73, 0, torso); mesh(geo.upper, M.jersey, 0, -0.18, 0, sh);
      const el = pivot(0, -0.36, 0, sh); mesh(geo.fore, M.jersey, 0, -0.17, 0, el); mesh(geo.glove, M.glove, 0, -0.36, 0, el);
      const hand = pivot(0, -0.36, -0.05, el);
      return { sh, el, hand };
    };
    const L = leg(-0.2), R = leg(0.2), LA = arm(-0.55), RA = arm(0.55);
    mesh(geo.torso, M.jersey, 0, 0.43, 0, torso);
    mesh(geo.pads, M.jersey, 0, 0.77, 0, torso).scale.set(1.25, 0.45, 0.9);
    mesh(geo.helmet, M.helmet, 0, 1.17, 0, torso).scale.set(1, 1.05, 1.12);
    mesh(geo.stripe, M.trim, 0, 1.47, 0, torso);
    mesh(geo.mask, M.mask, 0, 1.07, -0.3, torso).rotation.x = Math.PI / 2;
    const num = mesh(geo.num, new THREE.MeshLambertMaterial({ color: '#fff' }), 0, 0.47, 0.37, torso);
    /* where a carried ball sits: tucked high under the right arm */
    const tuck = pivot(0.3, 0.5, -0.28, torso);
    const sh = new THREE.Mesh(geo.shadow, shadowMat); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03; G.add(sh);
    S.add(G);
    men.push({ G, root, torso, L, R, LA, RA, tuck, num, side, j: Object.assign({}, POSE.idle()), phase: Math.random() * 6, last: null, numFor: null });
  }
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10), new THREE.MeshStandardMaterial({ color: '#7a3b12', roughness: 0.55 })); ball.scale.set(1, 1, 1.75); S.add(ball);
  const ballShadow = new THREE.Mesh(geo.shadow, shadowMat); ballShadow.rotation.x = -Math.PI / 2; ballShadow.scale.set(0.35, 0.35, 1); ballShadow.position.y = 0.03; S.add(ballShadow);
  /* the payoff: confetti at the ball on a conversion (gold, teal, white) */
  const NC = 260, cpos = new Float32Array(NC * 3), ccol = new Float32Array(NC * 3), PAL = ['#f5b72a', '#19c6a7', '#ffffff', '#ffd628'].map((c) => new THREE.Color(c));
  for (let i = 0; i < NC; i++) { const c = PAL[i % PAL.length]; ccol[i * 3] = c.r; ccol[i * 3 + 1] = c.g; ccol[i * 3 + 2] = c.b; }
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.BufferAttribute(cpos, 3)); cg.setAttribute('color', new THREE.BufferAttribute(ccol, 3));
  const confetti = new THREE.Points(cg, new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, depthWrite: false }));
  confetti.visible = false; confetti.frustumCulled = false; S.add(confetti);
  world = { S, men, ball, ballShadow, los, gain, confetti, cvel: new Float32Array(NC * 3), numCache: {} };
  return world;
}

/* each man's number, the same every snap */
function numberOf(e, i, used) {
  if (e.side === 'O') return NUM[e.id] || 80 + i;
  const list = DNUM[e.role] || [40]; const k = (used[e.role] = (used[e.role] || 0) + 1) - 1; return list[k % list.length] + Math.floor(k / list.length);
}
function setNumber(m, n, side) {
  const key = side + n;
  if (m.numFor === key) return;
  const T = TEAM[side]; let t = world.numCache[key];
  if (!t) t = world.numCache[key] = numberTexture(n, T.num, T.jersey);
  m.num.material.map = t; m.num.material.needsUpdate = true; m.numFor = key;
}

/* ---------- one snap ---------- */
function show(canvas, res, ui) {
  const L = window.FAW_LIVE, W = build();
  let v = views.get(canvas);
  if (!v) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    const cam = new THREE.PerspectiveCamera(46, 0.5, 0.5, 400);
    v = { r, cam }; views.set(canvas, v);
  }
  const size = () => {
    const w = canvas.clientWidth || canvas.width || 260, h = canvas.clientHeight || canvas.height || 400;
    v.r.setPixelRatio(canvas.clientWidth && !LITE ? Math.min(2, window.devicePixelRatio || 1) : 1);
    v.r.setSize(w, h, false); v.cam.aspect = w / h; v.cam.updateProjectionMatrix();
  };
  size();
  const frames = res.frames, ids = res.ids, rate = L.rater(res), SET = L.SET;
  W.los.position.z = wz(res.Y0); W.gain.visible = res.marker < 100; W.gain.position.z = wz(res.marker);
  const used = {};
  ids.forEach((e, i) => { const m = W.men[i]; if (!m) return; m.e = e; m.G.visible = true; setNumber(m, numberOf(e, i, used), e.side === 'O' ? 'O' : 'D'); m.G.scale.setScalar(e.big ? 1.1 : 1); m.last = null; });
  for (let i = ids.length; i < W.men.length; i++) W.men[i].G.visible = false;
  /* the camera, eased toward where it wants to be */
  const C = { x: res.BX, y: res.Y0 + 1, d: 28, h: 19 };
  let lastT = null, lastDraw = null;

  function draw(tt) {
    const pre = tt < 0, F = L.frameOf(res, Math.max(0, tt)), now = performance.now(), dts = lastT == null ? 0 : Math.min(0.05, (now - lastT) / 1000); lastT = now;
    /* each man: where the engine has him, which way he faces, and his pose,
       eased toward from the last frame (quick, slower going to the ground) */
    const kdt = lastDraw == null ? 1 : Math.min(0.25, (now - lastDraw) / 1000);
    const holder = { j: -1, d: 1.6 };
    ids.forEach((e, j) => {
      const m = W.men[j]; if (!m) return;
      const pa = F.a.p[j], pb = F.b.p[j];
      let x = pa[0] + (pb[0] - pa[0]) * F.u, y = pa[1] + (pb[1] - pa[1]) * F.u, head = pa[4], pose = pa[2], fr = pa[3];
      if (pre) { x = frames[0].p[j][0]; y = frames[0].p[j][1]; head = e.side === 'O' ? 0 : 180; pose = e.role === 'ol' || e.role === 'dl' ? 'stance3' : e.id === 'QB' ? 'qb' : 'stance'; fr = 0; }
      m.G.position.set(wx(x), 0, wz(y)); m.G.rotation.y = -head * Math.PI / 180;
      const sp = m.last && dts ? Math.min(10, Math.hypot(x - m.last[0], y - m.last[1]) / dts) : 0; m.last = [x, y];
      m.speed = m.speed == null ? sp : m.speed + (sp - m.speed) * Math.min(1, dts * 8);
      m.phase += m.speed * dts * 1.6;
      const w = Math.min(1, m.speed / 7), s = Math.sin(m.phase), c = Math.cos(m.phase);
      const P = POSE[pose] || POSE.idle;
      const target = (pose === 'idle' && w > 0.15 ? POSE.run : P)(s, c, w, fr);
      applyPose(m, target, 1 - Math.exp(-kdt * (pose === 'down' || pose === 'dive' ? 7 : 13)));
      m.pose = pose;
      if (F.a.held && !pre && e.side === 'O') { const d = Math.hypot(x - (F.a.ball[0] + (F.b.ball[0] - F.a.ball[0]) * F.u), y - (F.a.ball[1] + (F.b.ball[1] - F.a.ball[1]) * F.u)); if (d < holder.d) { holder.d = d; holder.j = j; } }
    });
    /* the ball */
    const ba = F.a.ball, bb = F.b.ball;
    let bx = ba[0] + (bb[0] - ba[0]) * F.u, by = ba[1] + (bb[1] - ba[1]) * F.u, bz = ba[2] + (bb[2] - ba[2]) * F.u;
    if (pre) { bx = res.BX; by = res.Y0 - 0.25; bz = 0.15; } /* on the line, under the center */
    /* a held ball sits in his hands: tucked when he carries it, cocked in the
       throwing hand at the windup, in front of his chest otherwise; in the air it
       points along its flight and spirals */
    const hm = holder.j >= 0 ? W.men[holder.j] : null;
    if (hm) {
      hm.G.updateMatrixWorld(true);
      const at = hm.pose === 'throw' ? hm.RA.hand : hm.pose === 'carry' || hm.pose === 'down' ? hm.tuck : hm.RA.hand;
      at.getWorldPosition(W.ball.position);
      W.ball.quaternion.copy(hm.G.quaternion);
    } else {
      const was = W.ball.position.clone();
      W.ball.position.set(wx(bx), Math.max(0.12, bz), wz(by));
      if (!pre && W.ball.position.distanceToSquared(was) > 1e-4) { W.ball.lookAt(W.ball.position.clone().multiplyScalar(2).sub(was)); W.spin = (W.spin || 0) + 0.45; W.ball.rotateZ(W.spin); }
      else if (pre) W.ball.rotation.set(0, 0, 0);
    }
    W.ballShadow.position.set(wx(bx), 0.03, wz(by)); W.ballShadow.visible = bz > 0.3 && !F.a.held;
    /* the broadcast camera: behind the offense, on the ball, leaning in when the play slows */
    /* the snap's own wide look first (the whole formation), then on the ball,
       closer once it is out of the pocket and closer still in the slow moments */
    const slow = !pre && rate(Math.max(0, tt)) < 1, out = !pre && Math.abs(by - res.Y0) > 6;
    const k = pre || lastDraw == null ? 1 : 1 - Math.exp(-Math.min(0.4, (now - lastDraw) / 1000) * 3.2); lastDraw = now;
    const tx = pre ? res.BX : bx * 0.75 + res.BX * 0.25, ty = pre ? res.Y0 + 1 : Math.max(by, res.Y0) + 2;
    const wantD = slow ? 22 : out ? 25 : 28, wantH = slow ? 13 : out ? 16 : 19;
    C.x += (tx - C.x) * k; C.y += (ty - C.y) * k; C.d += (wantD - C.d) * k; C.h += (wantH - C.h) * k;
    v.cam.position.set(wx(C.x), C.h, wz(C.y - C.d)); v.cam.lookAt(wx(C.x), 0, wz(C.y + 9));
    if (ui.pressure) ui.pressure(pre || res.isRun ? 0 : F.a.pressure);
    v.r.render(W.S, v.cam);
  }
  const onResize = () => { size(); v.r.render(W.S, v.cam); };
  window.addEventListener('resize', onResize);
  W.confetti.visible = false; W.gain.material.color.set('#ffd628');
  /* the payoff, on the result: a conversion turns the line to gain green and
     throws confetti from the ball (the picture keeps moving under the stamp);
     a stop turns it red, the spot short of it plain to see */
  let party = 0;
  const celebrate = (r) => {
    if (!r) return;
    if (!r.win) { W.gain.material.color.set('#ff4a3d'); v.r.render(W.S, v.cam); return; }
    W.gain.material.color.set(r.outcome === 'touchdown' ? '#19c6a7' : '#3cff8f');
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { v.r.render(W.S, v.cam); return; }
    const td = r.outcome === 'touchdown', p = W.confetti.geometry.attributes.position, a = p.array, vel = W.cvel, b = W.ball.position;
    for (let i = 0; i < a.length / 3; i++) {
      a[i * 3] = b.x + (Math.random() - 0.5); a[i * 3 + 1] = 1 + Math.random(); a[i * 3 + 2] = b.z + (Math.random() - 0.5);
      const ang = Math.random() * Math.PI * 2, sp = 3 + Math.random() * (td ? 9 : 6);
      vel[i * 3] = Math.cos(ang) * sp; vel[i * 3 + 1] = 6 + Math.random() * (td ? 12 : 8); vel[i * 3 + 2] = Math.sin(ang) * sp;
    }
    p.needsUpdate = true; W.confetti.visible = true;
    let prev = performance.now(); const end = prev + 2200;
    const step = (now) => {
      const d = Math.min(0.05, (now - prev) / 1000); prev = now;
      for (let i = 0; i < a.length / 3; i++) {
        vel[i * 3 + 1] -= 14 * d; vel[i * 3] *= 0.985; vel[i * 3 + 2] *= 0.985; if (vel[i * 3 + 1] < -2.5) vel[i * 3 + 1] = -2.5;
        a[i * 3] += vel[i * 3] * d; a[i * 3 + 1] = Math.max(0.05, a[i * 3 + 1] + vel[i * 3 + 1] * d); a[i * 3 + 2] += vel[i * 3 + 2] * d;
      }
      p.needsUpdate = true; W.confetti.material.opacity = Math.min(1, (end - now) / 600);
      v.r.render(W.S, v.cam);
      if (now < end) party = requestAnimationFrame(step); else { W.confetti.visible = false; party = 0; }
    };
    party = requestAnimationFrame(step);
  };
  const ui2 = Object.assign({}, ui, { final: ui.final ? (r, skipped) => { celebrate(r); ui.final(r, skipped); } : undefined, done: (r) => { if (!ui.final) celebrate(r || res); ui.done(r); } });
  const h = L.run(res, ui2, draw);
  return { skip: h.skip, stop: () => { window.removeEventListener('resize', onResize); if (party) cancelAnimationFrame(party); W.confetti.visible = false; h.stop(); } };
}

/* build the stadium ahead of time, while Call it is up */
function prepare() { try { build(); } catch (e) {} }

/* for review (build/sheet3d.mjs): one man in every pose in a row, seen from
   three quarters, rendered once into the canvas. Not used by the game. */
function sheet(canvas, names) {
  const W = build(), r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
  const list = names || ['stance3', 'stance', 'qb', 'idle', 'run', 'carry', 'block', 'throw:0', 'throw:1', 'catch', 'dive', 'down'];
  W.men.forEach((m, i) => {
    const n = list[i]; m.G.visible = !!n; if (!n) return;
    const key = n.split(':')[0], fr = +(n.split(':')[1] || 0);
    setNumber(m, 10 + i, m.side);
    m.G.position.set((i - (list.length - 1) / 2) * 2.1, 0, wz(50)); m.G.rotation.y = 1.15;
    applyPose(m, POSE[key](0.9, 0.4, 1, fr), 1);
  });
  W.gain.visible = false; W.los.position.z = wz(48); W.confetti.visible = false; W.ball.position.set(0, -5, 0); W.ballShadow.visible = false;
  r.setSize(canvas.width, canvas.height, false);
  const cam = new THREE.PerspectiveCamera(24, canvas.width / canvas.height, 0.5, 400);
  cam.position.set(0, 2.4, wz(50) + 15.5); cam.lookAt(0, 1.0, wz(50));
  r.render(W.S, cam);
  return list;
}

window.FAW_LIVE3D = { ok, show, prepare, sheet };
