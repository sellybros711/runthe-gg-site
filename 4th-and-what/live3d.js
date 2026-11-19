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
  if (can === null) { try { const c = document.createElement('canvas'); can = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { can = false; } }
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
  /* the players, made once: eleven a side */
  const blob = blobTexture(), men = [];
  const geo = {
    leg: new THREE.CapsuleGeometry(0.17, 0.55, 4, 8), shoe: new THREE.BoxGeometry(0.24, 0.12, 0.38), torso: new THREE.CapsuleGeometry(0.36, 0.5, 6, 12),
    pads: new THREE.SphereGeometry(0.5, 16, 10), arm: new THREE.CapsuleGeometry(0.11, 0.48, 4, 8), helmet: new THREE.SphereGeometry(0.3, 20, 14),
    stripe: new THREE.BoxGeometry(0.06, 0.05, 0.62), mask: new THREE.TorusGeometry(0.2, 0.025, 6, 16, Math.PI), num: new THREE.PlaneGeometry(0.55, 0.55),
    shadow: new THREE.PlaneGeometry(1.8, 1.8)
  };
  const mats = {};
  ['O', 'D'].forEach((k) => { const T = TEAM[k]; mats[k] = {
    jersey: new THREE.MeshLambertMaterial({ color: T.jersey }), pants: new THREE.MeshLambertMaterial({ color: T.pants }), shoe: new THREE.MeshLambertMaterial({ color: '#111' }),
    helmet: new THREE.MeshStandardMaterial({ color: T.helmet, roughness: 0.25, metalness: 0.35 }), trim: new THREE.MeshLambertMaterial({ color: T.trim }), mask: new THREE.MeshLambertMaterial({ color: T.mask }) }; });
  const shadowMat = new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false });
  for (let i = 0; i < 22; i++) {
    const side = i < 11 ? 'O' : 'D', M = mats[side], G = new THREE.Group(), body = new THREE.Group(); G.add(body);
    const part = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); body.add(o); return o; };
    /* legs and arms hang from a pivot so they can swing */
    const limb = (g, m, x, y, len) => { const p = new THREE.Group(); p.position.set(x, y, 0); const o = new THREE.Mesh(g, m); o.position.y = -len; p.add(o); body.add(p); return p; };
    const legL = limb(geo.leg, M.pants, -0.2, 0.95, 0.45), legR = limb(geo.leg, M.pants, 0.2, 0.95, 0.45);
    const shoeL = new THREE.Mesh(geo.shoe, M.shoe); shoeL.position.set(0, -0.89, -0.06); legL.add(shoeL);
    const shoeR = new THREE.Mesh(geo.shoe, M.shoe); shoeR.position.set(0, -0.89, -0.06); legR.add(shoeR);
    part(geo.torso, M.jersey, 0, 1.38, 0);
    const pads = part(geo.pads, M.jersey, 0, 1.72, 0); pads.scale.set(1.25, 0.45, 0.9);
    const armL = limb(geo.arm, M.jersey, -0.55, 1.68, 0.3), armR = limb(geo.arm, M.jersey, 0.55, 1.68, 0.3);
    const helm = part(geo.helmet, M.helmet, 0, 2.12, 0); helm.scale.set(1, 1.05, 1.12);
    part(geo.stripe, M.trim, 0, 2.42, 0);
    const mask = part(geo.mask, M.mask, 0, 2.02, -0.3); mask.rotation.x = Math.PI / 2;
    const num = new THREE.Mesh(geo.num, new THREE.MeshLambertMaterial({ color: '#fff' })); num.position.set(0, 1.42, 0.37); body.add(num);
    const sh = new THREE.Mesh(geo.shadow, shadowMat); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03; G.add(sh);
    S.add(G);
    men.push({ G, body, legL, legR, armL, armR, num, side, phase: Math.random() * 6, last: null, numFor: null });
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
    ids.forEach((e, j) => {
      const m = W.men[j]; if (!m) return;
      const pa = F.a.p[j], pb = F.b.p[j];
      let x = pa[0] + (pb[0] - pa[0]) * F.u, y = pa[1] + (pb[1] - pa[1]) * F.u, head = pa[4], pose = pa[2];
      if (pre) { x = frames[0].p[j][0]; y = frames[0].p[j][1]; head = e.side === 'O' ? 0 : 180; pose = e.role === 'ol' || e.role === 'dl' ? 'stance3' : 'stance'; }
      m.G.position.set(wx(x), 0, wz(y)); m.G.rotation.y = -head * Math.PI / 180;
      /* the swing comes from how fast he is moving */
      const sp = m.last && dts ? Math.min(10, Math.hypot(x - m.last[0], y - m.last[1]) / dts) : 0; m.last = [x, y];
      m.phase += sp * dts * 1.6;
      const sw = Math.min(1, sp / 6), s = Math.sin(m.phase);
      const down = pose === 'down' || pose === 'dive', crouch = /stance/.test(pose), block = pose === 'block';
      m.legL.rotation.x = s * 0.9 * sw; m.legR.rotation.x = -s * 0.9 * sw;
      m.armL.rotation.x = block ? -1.3 : pose === 'catch' ? -2.6 : -s * 0.8 * sw; m.armR.rotation.x = block ? -1.3 : pose === 'catch' || pose === 'throw' ? -2.6 : s * 0.8 * sw;
      m.body.rotation.x = down ? -1.45 : crouch ? -0.45 : block ? -0.35 : -0.12 * sw;
      m.body.position.y = down ? 0.35 : crouch ? -0.2 : 0;
    });
    /* the ball */
    const ba = F.a.ball, bb = F.b.ball;
    let bx = ba[0] + (bb[0] - ba[0]) * F.u, by = ba[1] + (bb[1] - ba[1]) * F.u, bz = ba[2] + (bb[2] - ba[2]) * F.u;
    if (pre) { bx = frames[0].ball[0]; by = frames[0].ball[1]; bz = 0.15; }
    W.ball.position.set(wx(bx), Math.max(0.12, bz), wz(by)); W.ball.rotation.y += F.a.held || pre ? 0 : 0.5;
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

window.FAW_LIVE3D = { ok, show, prepare };
