/* THE 3D SHOT CAM, THE SCENE (2026-11-22). Loaded by shotcam.js only once the
 * device has passed its gate, with three.js handed in (it is never part of
 * the module bundle: Shut The Door's vendored copy, by URL).
 *
 * WHAT IS IN IT
 *   the arena      dim stands with a crowd of points, a lit baseline board,
 *                  rigs overhead, one warm pool of light on the paint
 *   the floor      the owner's maple, the lane in the home navy, crisp lines,
 *                  glossy: the players, the ball and the hoop are drawn again
 *                  mirrored under it, and the boards are a little see-through
 *   the hoop       glass, rim, a net that stretches on a make and sways on a miss
 *   the players    figures3d.js (the one module a real model replaces)
 *   the telestrator  the coach's routes on the floor, lit as run, the passes
 *                  where the ball went, the screen bars, the open space ring
 *                  on the shooter (planRun in court2d.js, the board's own read)
 *   the read chip  HAND UP · 40%, the shot caption's word and its make chance
 *   confetti       on a made winner
 *
 * NOTHING IS DECIDED HERE. Every body stands where the sim's frame has him,
 * faces its way and strides its gait; the ball is the sim's own path and
 * height on the shot (its arc over the line from the hands to the rim, lifted
 * by the line itself), then plays out the way the board plays it out
 * (court2d.js ballAfter: in or off, the seed picks the side). Make or miss is
 * the result's.
 *
 * SPEED. One draw call per body part, no shadow maps (soft blob shadows
 * instead), one mirrored pass of the moving things only. Every texture is
 * built once a page, while the coach draws (warm), and every shader is
 * compiled then too, so the first cut does not hitch. */
import { COURT } from './court-geo.js?b=e8adaf5f5c';
import { courtLines } from './view.js?b=e8adaf5f5c';
import { IDS } from './playbook.js?b=e8adaf5f5c';
import { ballAfter } from './court2d.js?b=e8adaf5f5c';
import { figureKit, AWAY_NUMBERS, RELEASE } from './figures3d.js?b=e8adaf5f5c';

const RIM = COURT.RIM, RIM_H = 10, SHIFT = 0.3;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const TAU = Math.PI * 2;
const openCol = d => d >= 6 ? '61,220,132' : d >= 4 ? '255,210,63' : d >= 2 ? '255,140,60' : '255,84,72';
function rnd(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

/* The floor's patch, in feet: the half court and its apron. */
const FX0 = -7, FY0 = -8, FS = 64;
/* The boards run on past half court (FL long), so a wide stage never sees the floor end. */
const FL = 80;

/* Build in steps, so warm() can give the page back between them. */
export function createScene(THREE, canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false, stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
  renderer.autoClear = false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#06070a');
  scene.fog = new THREE.Fog('#06070a', 75, 160);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 400);
  camera.position.set(0, 10, 40); camera.lookAt(0, 6, RIM.y);
  // sim feet to three: X = x - 25 (the rim at 0), Z = y (from the baseline), Y up
  const W3 = (x, y, h = 0, v = new THREE.Vector3()) => v.set(x - RIM.x, h, y);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const world = new THREE.Group(), arena = new THREE.Group();
  scene.add(world, arena);
  const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.55 }, o));
  const parts = {};
  const steps = [];

  /* ---------- the floor ---------- */
  steps.push(() => {
    const PPF = 28, fc = mk(FS * PPF, FL * PPF), g = fc.getContext('2d');
    g.setTransform(PPF, 0, 0, PPF, -FX0 * PPF, -FY0 * PPF);
    g.fillStyle = '#17263a'; g.fillRect(FX0, FY0, FS, FL);
    // maple boards running to the basket, 3 inches wide, staggered joints
    const r = rnd(7), tone = [222, 180, 126];
    g.save(); g.beginPath(); g.rect(0, 0, COURT.W, FY0 + FL); g.clip();
    for (let x = 0; x < COURT.W; x += 0.25) {
      let y = -r() * 6;
      while (y < FY0 + FL) {
        const len = 2 + r() * 5, v = (r() - 0.5) * 22, warm = (r() - 0.5) * 10;
        g.fillStyle = 'rgb(' + [tone[0] + v + warm, tone[1] + v, tone[2] + v - warm].map(q => clamp(Math.round(q), 0, 255)) + ')';
        g.fillRect(x, y, 0.25, len);
        for (let k = 0; k < 2; k++) { g.fillStyle = 'rgba(' + (r() < 0.5 ? '90,55,25' : '255,240,210') + ',' + (0.05 + r() * 0.07) + ')'; g.fillRect(x + r() * 0.25, y, 0.03, len); }
        g.fillStyle = 'rgba(70,40,15,.3)'; g.fillRect(x, y + len - 0.03, 0.25, 0.03);
        y += len;
      }
      g.fillStyle = 'rgba(70,40,15,.18)'; g.fillRect(x, 0, 0.02, FL);
    }
    g.restore();
    // the lane in the home navy, and the centre circle
    g.fillStyle = 'rgba(31,78,121,.9)';
    g.fillRect(RIM.x - COURT.LANE / 2, 0, COURT.LANE, COURT.FT);
    g.beginPath(); g.arc(RIM.x, COURT.H, 6, 0, TAU); g.fill();
    g.strokeStyle = '#fbfbf7'; g.lineWidth = 2 / 12; g.lineJoin = 'round';
    // both halves' lines, the far one mirrored at half court (the board does the same)
    for (const m of [false, true]) for (const L of courtLines()) { g.beginPath(); L.forEach((q, i) => { const y = m ? COURT.H * 2 - q.y : q.y; if (i) g.lineTo(q.x, y); else g.moveTo(q.x, y); }); g.stroke(); }
    const tex = new THREE.CanvasTexture(fc); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = aniso;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(FS, FL), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.28, metalness: 0, transparent: true, opacity: 0.8 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(FX0 + FS / 2 - RIM.x, 0, FY0 + FL / 2);
    const under = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: '#0b0d12' }));
    under.rotation.x = -Math.PI / 2; under.position.y = -0.05;
    scene.add(floor, under);
    parts.floor = floor; parts.under = under;
  });

  /* ---------- the arena: stands, a crowd, the baseline board, the rigs, the light ---------- */
  steps.push(() => {
    const standMat = std('#15171d', { roughness: 0.95 });
    const box = new THREE.BoxGeometry(1, 1, 1);
    const rows = (x0, x1, z0, z1, axis) => {
      for (let i = 0; i < 8; i++) {
        const m = new THREE.Mesh(box, standMat);
        if (axis === 'z') { m.scale.set(3, 1.5, z1 - z0); m.position.set(x0 + Math.sign(x0) * i * 3, 0.75 + i * 1.5, (z0 + z1) / 2); }
        else { m.scale.set(x1 - x0, 1.5, 3); m.position.set((x0 + x1) / 2, 0.75 + i * 1.5, z0 - i * 3); }
        arena.add(m);
      }
    };
    rows(-37, 0, -14, 70, 'z'); rows(37, 0, -14, 70, 'z'); rows(-40, 40, -14, 0, 'x');
    const n = 3200, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), r = rnd(11);
    const pal = [[0.8, 0.2, 0.2], [0.15, 0.3, 0.6], [0.9, 0.8, 0.7], [0.3, 0.3, 0.35], [0.95, 0.85, 0.3]];
    for (let i = 0; i < n; i++) {
      const side = r() < 0.4 ? 0 : r() < 0.5 ? 1 : 2, row = Math.floor(r() * 8);
      let x, z;
      if (side === 2) { x = -40 + r() * 80; z = -14 - row * 3 - 1.5; } else { x = (side ? 1 : -1) * (37 + row * 3 + 1.5); z = -14 + r() * 84; }
      pos.set([x + (r() - 0.5) * 2, 2.2 + row * 1.5 + r() * 0.6, z + (r() - 0.5) * 2], i * 3);
      const c = pal[Math.floor(r() * pal.length)], k = 0.14 + r() * 0.22;
      col.set([c[0] * k, c[1] * k, c[2] * k], i * 3);
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const crowd = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.45, vertexColors: true, sizeAttenuation: true }));
    arena.add(crowd); parts.crowd = crowd;
    // the baseline board behind the hoop: our own words, nobody's marks
    const bc = mk(2048, 64), bg = bc.getContext('2d');
    const grd = bg.createLinearGradient(0, 0, 2048, 0); grd.addColorStop(0, '#0d2340'); grd.addColorStop(0.5, '#1f4e79'); grd.addColorStop(1, '#0d2340');
    bg.fillStyle = grd; bg.fillRect(0, 0, 2048, 64); bg.fillStyle = '#ffd23f'; bg.font = '900 40px Outfit, system-ui, sans-serif'; bg.textBaseline = 'middle';
    { let x = 30; for (let i = 0; i < 8; i++) { const t = i % 2 ? 'RUN THE GAMES' : 'DRAW IT UP'; bg.fillText(t, x, 34); x += bg.measureText(t).width + 90; } }
    const bt = new THREE.CanvasTexture(bc); bt.colorSpace = THREE.SRGBColorSpace;
    const dark = std('#0c0d10');
    const board = new THREE.Mesh(new THREE.BoxGeometry(70, 2.6, 0.4), [dark, dark, dark, dark, new THREE.MeshBasicMaterial({ map: bt }), dark]);
    board.position.set(0, 1.3, -9); arena.add(board);
    const lm = new THREE.MeshBasicMaterial({ color: '#fff6e0' }), lg = new THREE.BoxGeometry(5, 0.4, 1.2);
    for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) { const l = new THREE.Mesh(lg, lm); l.position.set(sx * 16, 62, -8 + i * 12); arena.add(l); }
    // the light: a warm pool on the paint from above, a cool fill, a kicker at the rim
    scene.add(new THREE.HemisphereLight('#9fb2d8', '#2a1c10', 0.6));
    const spot = new THREE.SpotLight('#fff3dc', 5.5, 0, 0.62, 0.65, 0);
    spot.position.set(0, 70, 22); spot.target.position.set(0, 0, 15); scene.add(spot, spot.target);
    const fill = new THREE.DirectionalLight('#c8d6ff', 0.6); fill.position.set(-30, 40, 60); scene.add(fill);
    const kick = new THREE.PointLight('#ffd9a0', 30, 60, 1.5); kick.position.set(0, 24, 4); scene.add(kick);
    parts.kick = kick;
  });

  /* ---------- the hoop and the net ---------- */
  steps.push(() => {
    const hoop = new THREE.Group(); world.add(hoop);
    const pad = std('#1f4e79', { roughness: 0.7 }), steel = std('#2b2e35', { metalness: 0.6, roughness: 0.4 }), white = std('#f4f4f2', { roughness: 0.4 });
    const add = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); hoop.add(o); return o; };
    add(new THREE.BoxGeometry(4, 3, 5), pad, 0, 1.5, -6.5);
    add(new THREE.BoxGeometry(1, 11, 1), pad, 0, 8, -6.5);
    add(new THREE.BoxGeometry(0.6, 0.6, 9.8), steel, 0, 12.3, -1.6);
    const glass = add(new THREE.BoxGeometry(6, 3.5, 0.1), new THREE.MeshStandardMaterial({ color: '#dfe9f2', roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false }), 0, 11.25, COURT.BOARD);
    glass.renderOrder = 1;
    const bar = (w, h, x, y) => add(new THREE.BoxGeometry(w, h, 0.14), white, x, y, COURT.BOARD + 0.02);
    bar(6, 0.16, 0, 9.58); bar(6, 0.16, 0, 12.92); bar(0.16, 3.5, -2.92, 11.25); bar(0.16, 3.5, 2.92, 11.25);
    bar(2, 0.1, 0, 10.15); bar(2, 0.1, 0, 11.6); bar(0.1, 1.5, -0.95, 10.9); bar(0.1, 1.5, 0.95, 10.9);
    add(new THREE.BoxGeometry(6.2, 0.35, 0.3), pad, 0, 9.4, COURT.BOARD + 0.05);
    const orange = std('#ff5a1a', { metalness: 0.5, roughness: 0.35 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.05, 8, 32), orange);
    rim.rotation.x = Math.PI / 2; rim.position.set(0, RIM_H, RIM.y); hoop.add(rim);
    add(new THREE.BoxGeometry(0.5, 0.2, RIM.y - COURT.BOARD - 0.6), orange, 0, RIM_H, (COURT.BOARD + RIM.y - 0.75) / 2 + 0.05);
    // the net: a tapered sleeve with a diamond mesh, alpha tested
    const nc = mk(256, 128), g = nc.getContext('2d');
    g.strokeStyle = '#fff'; g.lineWidth = 3;
    for (let i = -8; i < 24; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16 + 128, 128); g.moveTo(i * 16, 0); g.lineTo(i * 16 - 128, 128); g.stroke(); }
    g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 6);
    const ntex = new THREE.CanvasTexture(nc);
    const netGeo = new THREE.CylinderGeometry(0.74, 0.42, 1.55, 20, 5, true);
    const net = new THREE.Mesh(netGeo, new THREE.MeshStandardMaterial({ map: ntex, alphaMap: ntex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.8 }));
    net.position.set(0, RIM_H - 0.78, RIM.y); world.add(net);
    parts.hoop = hoop; parts.rim = rim; parts.net = net; parts.netBase = netGeo.attributes.position.array.slice();
  });

  /* ---------- the ball, blob shadows ---------- */
  steps.push(() => {
    const bc = mk(256, 128), g = bc.getContext('2d'), r = rnd(5);
    g.fillStyle = '#e8701f'; g.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 1600; i++) { g.fillStyle = 'rgba(' + (r() < 0.5 ? '0,0,0' : '255,200,150') + ',.08)'; g.fillRect(r() * 256, r() * 128, 2, 2); }
    g.strokeStyle = '#2a1206'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 64); g.lineTo(256, 64); for (const x of [0, 64, 128, 192]) { g.moveTo(x, 0); g.lineTo(x, 128); } g.stroke();
    const bt = new THREE.CanvasTexture(bc); bt.colorSpace = THREE.SRGBColorSpace;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.4, 20, 14), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.6 }));
    world.add(ball); parts.ball = ball;
    const sc = mk(64, 64), sg = sc.getContext('2d'), rg = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(0,0,0,.55)'); rg.addColorStop(0.6, 'rgba(0,0,0,.22)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    sg.fillStyle = rg; sg.fillRect(0, 0, 64, 64);
    const st = new THREE.CanvasTexture(sc);
    const sm = new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3 });
    const sgeo = new THREE.PlaneGeometry(1, 1); sgeo.rotateX(-Math.PI / 2);
    parts.blob = () => { const m = new THREE.Mesh(sgeo, sm); m.renderOrder = 3; m.position.y = 0.03; scene.add(m); return m; };
    parts.ballBlob = parts.blob();
  });

  /* ---------- the players ---------- */
  const kit = figureKit(THREE);
  const O = [], X = [], blobs = [];
  steps.push(() => {
    for (let i = 0; i < 5; i++) { const f = kit.build('home', i + 1, i); world.add(f); O.push(f); }
    for (let j = 0; j < 5; j++) { const f = kit.build('away', AWAY_NUMBERS[j], j + 5); world.add(f); X.push(f); }
    for (let k = 0; k < 10; k++) { const b = parts.blob(); b.scale.set(3.4, 1, 3.4); blobs.push(b); }
  });

  /* ---------- the telestrator, the chip, the confetti ---------- */
  const TP = 16, TN = FS * TP;
  const tc = mk(TN, TN);
  let ttex = null, tele = null;
  const HUD = { scene: new THREE.Scene(), cam: new THREE.OrthographicCamera(0, 1, 0, -1, -1, 1), chip: null, cv: null, tex: null, key: '' };
  const CN = 420;
  let conf = null, confSeed = null;
  steps.push(() => {
    ttex = new THREE.CanvasTexture(tc); ttex.colorSpace = THREE.SRGBColorSpace; ttex.anisotropy = aniso;
    tele = new THREE.Mesh(new THREE.PlaneGeometry(FS, FS), new THREE.MeshBasicMaterial({ map: ttex, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    tele.rotation.x = -Math.PI / 2; tele.position.set(FX0 + FS / 2 - RIM.x, 0.04, FY0 + FS / 2); tele.renderOrder = 2;
    scene.add(tele);
    // the shot's line in the air, from the hands to the ball: a glowing ribbon of points
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 3), 3)); lg.setDrawRange(0, 0);
    parts.trail = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: '#ffd65a', transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false }));
    parts.trail.renderOrder = 4; parts.trail.frustumCulled = false; scene.add(parts.trail);
    HUD.cv = mk(512, 96);
    HUD.tex = new THREE.CanvasTexture(HUD.cv); HUD.tex.colorSpace = THREE.SRGBColorSpace;
    HUD.chip = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: HUD.tex, transparent: true, depthTest: false, toneMapped: false }));
    HUD.chip.visible = false; HUD.scene.add(HUD.chip);
    conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.35, 0.22), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), CN);
    const r = rnd(5), cols = ['#ffd23f', '#1f4e79', '#ffffff', '#ffd23f'], C = new THREE.Color();
    for (let i = 0; i < CN; i++) conf.setColorAt(i, C.set(cols[Math.floor(r() * cols.length)]));
    conf.frustumCulled = false; conf.visible = false; scene.add(conf);
    confSeed = Array.from({ length: CN }, (_, i) => { const q = rnd(100 + i); return [q() * 40 - 20, q() * 30 + 2, q() * 26 + 22, q() * 6, q() * 6, 2 + q() * 3]; });
  });

  /* ---------- this run ---------- */
  let P = null;          // planRun's read of the run (court2d.js)
  let shot = null;       // { from, i, ball path frames }
  const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 45, shift: 0, set: false, mode: '' };

  /* The coach's marker on the floor, once a run: what the board shows at the
     release, in the same colours. */
  function telestrate() {
    const g = tc.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, TN, TN);
    if (!P) { if (ttex) ttex.needsUpdate = true; return; }
    g.setTransform(TP, 0, 0, TP, -FX0 * TP, -FY0 * TP);
    g.lineCap = 'round'; g.lineJoin = 'round';
    const fi = shot ? shot.fi : P.F.length - 1;
    const glow = (path, core, halo, w) => { g.strokeStyle = halo; g.lineWidth = w * 2.6; g.stroke(path); g.strokeStyle = core; g.lineWidth = w; g.stroke(path); };
    for (const r of P.routes) {
      const k = r.k[Math.min(fi, r.k.length - 1)];
      g.setLineDash([0.6, 0.5]); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 0.22; g.stroke(r.path); g.setLineDash([]);
      if (k <= 0) continue;
      glow(r.path, k < 1 ? 'rgba(130,232,255,.98)' : 'rgba(150,225,255,.8)', 'rgba(80,210,255,.18)', 0.3);
      const { x, y } = r.end, c = Math.cos(r.ang), s = Math.sin(r.ang);
      g.fillStyle = g.strokeStyle = 'rgba(150,225,255,.85)'; g.lineWidth = 0.3; g.beginPath();
      if (r.kind === 'screen') { g.moveTo(x + s * 1.1, y - c * 1.1); g.lineTo(x - s * 1.1, y + c * 1.1); g.stroke(); }
      else { g.moveTo(x + c * 0.25, y + s * 0.25); g.lineTo(x - c * 0.9 + s * 0.6, y - s * 0.9 - c * 0.6); g.lineTo(x - c * 0.9 - s * 0.6, y - s * 0.9 + c * 0.6); g.closePath(); g.fill(); }
    }
    for (const p of P.passes) {
      if (p.at == null || !p.a) continue;
      g.setLineDash([0.9, 0.6]);
      g.strokeStyle = p.lost ? 'rgba(255,84,72,.95)' : 'rgba(255,214,90,.95)'; g.lineWidth = 0.26;
      g.beginPath(); g.moveTo(p.a.x, p.a.y); g.lineTo(p.b.x, p.b.y); g.stroke(); g.setLineDash([]);
    }
    // the shooter's space at the release: a ring as wide as his space to the closest defender
    const S = P.shot;
    if (S && S.from) {
      const d = clamp(S.open, 1.6, 12), c = openCol(d);
      g.fillStyle = 'rgba(' + c + ',.16)'; g.beginPath(); g.arc(S.from.x, S.from.y, d, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(' + c + ',.95)'; g.lineWidth = 0.18; g.setLineDash([0.5, 0.35]); g.stroke(); g.setLineDash([]);
      // and the shot's line on the floor, from his feet to the rim
      g.beginPath(); g.moveTo(S.from.x, S.from.y); g.lineTo(RIM.x, RIM.y);
      g.strokeStyle = 'rgba(255,170,30,.25)'; g.lineWidth = 0.7; g.stroke();
      g.strokeStyle = 'rgba(255,214,90,.9)'; g.lineWidth = 0.22; g.stroke();
    }
    ttex.needsUpdate = true;
  }

  /* The chip, drawn once a text: rounded, bold, the space colour. */
  function chipTex(text, bg) {
    const key = text + bg;
    if (HUD.key === key) return;
    HUD.key = key;
    const g = HUD.cv.getContext('2d'), px = 44;
    g.clearRect(0, 0, 512, 96);
    g.font = '800 ' + px + 'px Outfit, system-ui, sans-serif';
    const w = Math.min(500, g.measureText(text).width + px * 1.3), h = px * 1.8;
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.roundRect(256 - w / 2 + 2, 48 - h / 2 + 4, w, h, h * 0.28); g.fill();
    g.fillStyle = bg; g.beginPath(); g.roundRect(256 - w / 2, 48 - h / 2, w, h, h * 0.28); g.fill();
    g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 50);
    HUD.tex.needsUpdate = true; HUD.w = w; HUD.h = h;
  }

  /* ---------- the ball ---------- */
  const B2 = { x: 0, y: 0, z: 0 }, BV = new THREE.Vector3();
  /* World height of the sim's ball on the shot: its arc (fr.b[2], which runs
     from the release height to nothing at the rim) rides on the line from
     the hands (1 ft over the release height) up to the rim. */
  const shotY = (z, k) => z + 1 + (RIM_H - 1) * k;
  /* Where the ball is: the sim's, then playing out (in, or off the rim). */
  function ballPos(fr, after, out) {
    if (!after) {
      if (fr.sk != null) return W3(fr.b[0], fr.b[1], shotY(fr.b[2] || 0, fr.sk), out);
      return W3(fr.b[0], fr.b[1], Math.max(0.4, (fr.b[2] || 0) + 0.4), out);
    }
    ballAfter(fr, after, B2);
    const t = after.t;
    let y;
    if (after.made) {
      // through the net, then off the floor
      if (t < 0.22) y = RIM_H - 0.3 - (t / 0.22) * 2.2;
      else { const u = t - 0.22, v0 = -10, y0 = RIM_H - 2.5, tf = (v0 + Math.sqrt(v0 * v0 + 64 * (y0 - 0.4))) / 32; y = u < tf ? y0 + v0 * u - 16 * u * u : 0.4 + B2.z * 0.7; }
    } else {
      // off the iron: a hop up off the rim, then down and bouncing
      const v0 = 9, tf = (v0 + Math.sqrt(v0 * v0 + 64 * (RIM_H + 0.4 - 0.4))) / 32;
      y = t < tf ? RIM_H + 0.4 + v0 * t - 16 * t * t : 0.4 + B2.z * 0.6;
      if (t < 0.12) { B2.x = RIM.x + (B2.x - RIM.x) * 0.3; B2.y = RIM.y + (B2.y - RIM.y) * 0.3; }
    }
    return W3(B2.x, B2.y, Math.max(0.4, y), out);
  }

  /* ---------- the camera ---------- */
  const RV = new THREE.Vector3(0, RIM_H, RIM.y), tmp = new THREE.Vector3(), V1 = new THREE.Vector3(), V2 = new THREE.Vector3();
  const fitCam = new THREE.PerspectiveCamera();
  /* Pull back along dir from look until every point is in the frame (NDC
     margins mx, the top and bottom ty, by), at this fov and aspect. */
  function fit(look, dir, fov, aspect, pts, mx, ty, by, lo, hi, shift) {
    fitCam.fov = fov; fitCam.aspect = aspect; fitCam.near = 0.5; fitCam.far = 400; lens(fitCam, shift); fitCam.updateProjectionMatrix();
    const ok = d => {
      fitCam.position.copy(look).addScaledVector(dir, d);
      fitCam.lookAt(look); fitCam.updateMatrixWorld();
      for (const p of pts) {
        tmp.copy(p).applyMatrix4(fitCam.matrixWorldInverse);
        if (tmp.z > -0.6) return false;
        tmp.applyMatrix4(fitCam.projectionMatrix);
        if (Math.abs(tmp.x) > mx || tmp.y > ty || tmp.y < -by) return false;
      }
      return true;
    };
    if (ok(lo)) return lo;
    let a = lo, b = hi;
    for (let n = 0; n < 14; n++) { const m = (a + b) / 2; if (ok(m)) b = m; else a = m; }
    return b;
  }

  /* A lens shift: the look point sits shift (NDC) under the middle of the
     frame, so what is above it (the rim) rides high, clear of the banner. */
  function lens(c, shift) {
    if (!shift) { c.clearViewOffset(); return; }
    c.setViewOffset(1000 * c.aspect, 1000, 0, shift * 500, 1000 * c.aspect, 1000);
  }

  /* What the camera wants this frame. */
  function want(fr, after, aspect, winner) {
    const portrait = aspect < 0.9;
    const S = shot.feet;                              // where he went up, in three
    const d = V1.set(S.x, 0, S.z - RIM.y); if (d.lengthSq() < 1) d.set(0, 0, 1); d.normalize();   // rim to shooter
    const side = V2.set(-d.z, 0, d.x); if (side.x * S.x > 0) side.negate();   // the shoulder toward the middle
    const t = after ? after.t : 0;
    const head = new THREE.Vector3(S.x, 6.6, S.z), feet = new THREE.Vector3(S.x, 0.2, S.z);
    if (after && winner && t > 1.3) {
      // THE CELEBRATION: back and up, the hoop, the shooter and the floor round him
      // the rim high in the frame, clear of the GAME WINNER banner across the middle
      const look = new THREE.Vector3(S.x * 0.45, 2, lerp(S.z, RIM.y, 0.4) + 3);
      const dir = d.clone().multiplyScalar(0.8).addScaledVector(side, 0.35).setY(0.55).normalize();
      const fov = portrait ? 56 : 44;
      const pts = [new THREE.Vector3(0, 13, COURT.BOARD), head, feet, new THREE.Vector3(S.x - 3, 0, S.z + 4), new THREE.Vector3(S.x + 3, 0, S.z + 4)];
      const dist = fit(look, dir, fov, aspect, pts, 0.86, 0.78, 0.86, 12, 140, 0.15);
      return { pos: look.clone().addScaledVector(dir, dist), look, fov, shift: 0.15, mode: 'wide', rate: 2.2 };
    }
    // over the shooter's shoulder at the release, then up the ball's path to the rim
    const k = after ? 1 : fr.sk || 0, e = smooth(k * 0.9 + (after ? t * 0.8 : 0));
    const bp = ballPos(fr, after, BV);
    /* aimed under the rim, so the hoop rides in the top third: the GAME
       WINNER banner (play.html .bigword, 40% down) never sits on the make */
    const look = head.clone().lerp(RV, lerp(0.55, 0.8, e)); look.y = lerp(5.6, 6.6, e);
    const dir = d.clone().addScaledVector(side, portrait ? 0.32 : 0.42).setY(lerp(0.06, 0.12, e)).normalize();
    const fov = portrait ? lerp(54, 46, e) : lerp(50, 42, e);
    const pts = [RV.clone().setX(-1), RV.clone().setX(1), new THREE.Vector3(0, RIM_H - 1.6, RIM.y), bp.clone().setY(bp.y + 0.5), bp.clone().setY(bp.y - 0.5)];
    if (shot.peak) pts.push(shot.peak);
    if (!after || t < 0.5) {
      // his shoulders and his hands, both sides, not just a line up his middle
      for (const sx of [-1.3, 1.3]) pts.push(head.clone().addScaledVector(side, sx), head.clone().addScaledVector(side, sx * 0.6).setY(9));
      if (e < 0.4) pts.push(feet);
    }
    const dist = fit(look, dir, fov, aspect, pts, 0.84, 0.8, 0.86, 6, 120, SHIFT);
    return { pos: look.clone().addScaledVector(dir, dist), look, fov, shift: SHIFT, mode: 'shot', rate: after ? 2.4 : 3.4 };
  }

  /* ---------- drawing ---------- */
  let size = '', W = 1, H = 1;
  function resize(w, h, dpr) {
    const key = w + 'x' + h + 'x' + dpr;
    if (key === size) return;
    size = key; W = w; H = h;
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
    HUD.cam.left = 0; HUD.cam.right = w; HUD.cam.top = 0; HUD.cam.bottom = -h; HUD.cam.updateProjectionMatrix();
  }

  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), ONE = new THREE.Vector3(1, 1, 1), PV = new THREE.Vector3();
  let wall = 0;
  const face = deg => Math.atan2(Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180));

  /* One frame of the span. fr and opts as the board gets them; dt wall seconds. */
  function draw(fr, opts, dt, snap) {
    wall += dt;
    const after = opts.after || null, winner = !!(P && P.winner);
    const made = after ? after.made : false;
    const cheering = after && made && winner && after.t > 0.35;
    for (let i = 0; i < 5; i++) {
      const f = O[i];
      W3(fr.o[2 * i], fr.o[2 * i + 1], 0, f.position);
      f.rotation.y = face(fr.f ? fr.f[i] : 270);
      const isShooter = shot && i === shot.i;
      let jump = null;
      if (isShooter) jump = RELEASE + (fr.sk != null ? fr.sk * shot.dur : shot.dur) + (after ? after.t : 0);
      kit.pose(f, { code: fr.k ? fr.k[i] : 0, gait: fr.g ? fr.g[i] : 0, jump, t: wall, i, cheer: cheering ? 1 : 0 });
      const b = blobs[i]; b.position.x = f.position.x; b.position.z = f.position.z;
    }
    for (let j = 0; j < 5; j++) {
      const f = X[j];
      W3(fr.x[2 * j], fr.x[2 * j + 1], 0, f.position);
      f.rotation.y = face(fr.f ? fr.f[5 + j] : 90);
      const code = fr.k ? fr.k[5 + j] : 0;
      kit.pose(f, { code, def: true, gait: fr.g ? fr.g[5 + j] : 0, close: code === 4 ? clamp((fr.sk != null ? fr.sk : 1) * 3 + 0.35, 0, 1) : null, t: wall, i: j + 5, cheer: cheering ? -1 : 0 });
      const b = blobs[5 + j]; b.position.x = f.position.x; b.position.z = f.position.z;
    }
    const bp = ballPos(fr, after, parts.ball.position);
    parts.ball.rotation.x += dt * 9; parts.ball.rotation.z += dt * 3;
    parts.ball.visible = !after || after.t < 6;
    parts.ballBlob.position.set(bp.x + bp.y * 0.05, 0.03, bp.z + bp.y * 0.08);
    const bs = 1.3 + bp.y * 0.06; parts.ballBlob.scale.set(bs, 1, bs);
    // the shot's line in the air: the ball's own path so far, from the hands
    if (shot && shot.path) {
      const arr = parts.trail.geometry.attributes.position.array;
      const k = after ? 1 : fr.sk || 0;
      let n = 0;
      for (const q of shot.path) { if (q.k > k + 1e-6 || n >= 63) break; arr[n * 3] = q.p.x; arr[n * 3 + 1] = q.p.y; arr[n * 3 + 2] = q.p.z; n++; }
      if (!after && n < 63) { arr[n * 3] = bp.x; arr[n * 3 + 1] = bp.y; arr[n * 3 + 2] = bp.z; n++; }
      parts.trail.geometry.setDrawRange(0, n); parts.trail.geometry.attributes.position.needsUpdate = true;
      parts.trail.material.opacity = after ? Math.max(0, 0.85 - after.t * 1.2) : 0.85;
    }
    // the rim: a rattle on a miss
    const shake = after && !made && after.t < 0.35 ? Math.sin(after.t * 70) * 0.06 * (1 - after.t / 0.35) : 0;
    parts.rim.position.x = shake; parts.rim.rotation.y = shake * 0.5;
    // the net: stretched down by a make, swinging off a miss
    {
      const p = parts.net.geometry.attributes.position, base = parts.netBase, t = after ? after.t : -1;
      const pull = made && t >= 0 && t < 1.4 ? Math.sin(clamp(t / 0.3, 0, 1) * Math.PI) * 0.5 * Math.exp(-t * 1.3) + Math.sin(t * 18) * 0.06 * Math.exp(-t * 3) : 0;
      const swing = !made && t >= 0 && t < 1.2 ? Math.sin(t * 14) * 0.12 * Math.exp(-t * 2.5) : 0;
      for (let i = 0; i < p.count; i++) {
        const y0 = base[i * 3 + 1], k = (0.775 - y0) / 1.55;
        p.array[i * 3 + 1] = y0 - pull * k * 1.3;
        p.array[i * 3] = base[i * 3] * (1 - pull * k * 0.35) + swing * k + shake * (1 - k);
        p.array[i * 3 + 2] = base[i * 3 + 2] * (1 - pull * k * 0.35);
      }
      p.needsUpdate = true;
    }
    // the light jumps on a make, the crowd with it
    parts.kick.intensity = made && after.t < 0.5 ? 30 + 120 * (1 - after.t / 0.5) : 30;
    { const fl = made ? Math.max(0, 1 - after.t / 2.5) : 0; parts.crowd.material.color.setScalar(1 + fl * 2.2 + (fl > 0 ? Math.abs(Math.sin(after.t * 23)) * fl : 0)); }
    // confetti on a made winner
    const conT = made && winner ? after.t - 0.25 : -1;
    conf.visible = conT > 0;
    if (conf.visible) {
      const sx = shot ? shot.feet.x * 0.5 : 0;
      for (let i = 0; i < CN; i++) {
        const s = confSeed[i], y = s[2] - conT * s[5] * 1.6;
        PV.set(sx + s[0] + Math.sin(conT * 1.5 + s[3]) * 1.5, Math.max(0.1, y), s[1] + Math.cos(conT + s[4]));
        E.set(conT * s[5] + s[3], conT * 2 + s[4], s[3]); Q.setFromEuler(E); M4.compose(PV, Q, ONE); conf.setMatrixAt(i, M4);
      }
      conf.instanceMatrix.needsUpdate = true;
    }
    // the camera eases after what it wants (a snap on the cut)
    const w = want(fr, after, camera.aspect, winner);
    if (!cam.set || snap) { cam.pos.copy(w.pos); cam.look.copy(w.look); cam.fov = w.fov; cam.shift = w.shift; cam.set = true; }
    else { const k = 1 - Math.exp(-Math.min(0.1, dt) * w.rate); cam.pos.lerp(w.pos, k); cam.look.lerp(w.look, k); cam.fov = lerp(cam.fov, w.fov, k); cam.shift = lerp(cam.shift, w.shift, k); }
    cam.mode = w.mode;
    camera.position.copy(cam.pos); camera.lookAt(cam.look); camera.fov = cam.fov; lens(camera, cam.shift); camera.updateProjectionMatrix();
    // the read chip, by the shooter, kept in the band between the banner and the caption
    if (P && P.shot && P.shot.read && shot) {
      const t = after ? after.t : 0, a = !after ? 1 : clamp(1 - (t - (winner && made ? 0.1 : 0.9)) / 0.25, 0, 1);
      chipTex(P.shot.read, 'rgb(' + openCol(clamp(P.shot.open, 1.6, 12)) + ')');
      const cw = Math.min(W * 0.6, W >= 700 ? 190 : 160), ch = cw * HUD.h / HUD.w;
      PV.set(shot.feet.x, 8.2, shot.feet.z).project(camera);
      let x = (PV.x + 1) / 2 * W, y = (1 - PV.y) / 2 * H;
      x = clamp(x, 8 + cw / 2, W - 8 - cw / 2); y = clamp(y, H * 0.56 + ch / 2, H * 0.76 - ch / 2);
      HUD.chip.visible = a > 0.01; HUD.chip.material.opacity = a;
      HUD.chip.scale.set(cw * 512 / HUD.w, ch * 96 / HUD.h, 1); HUD.chip.position.set(x, -y, 0);
      HUD.box = HUD.chip.visible ? { x: x - cw / 2, y: y - ch / 2, w: cw, h: ch } : null;
    } else { HUD.chip.visible = false; HUD.box = null; }
    render();
  }

  /* Two passes: the moving things mirrored under the floor, then the floor
     (glossy, a little see through) and everything over it, then the chip. */
  function render() {
    renderer.setClearColor('#06070a', 1); renderer.clear();
    const keep = [parts.floor.visible, tele.visible, conf.visible, parts.trail.visible];
    parts.floor.visible = false; parts.under.visible = false; tele.visible = false; conf.visible = false; parts.trail.visible = false; arena.visible = false;
    for (const b of blobs) b.visible = false; parts.ballBlob.visible = false;
    world.scale.y = -1;
    renderer.render(scene, camera);
    renderer.clearDepth();
    world.scale.y = 1; arena.visible = true; parts.under.visible = true;
    [parts.floor.visible, tele.visible, conf.visible, parts.trail.visible] = keep;
    for (const b of blobs) b.visible = true; parts.ballBlob.visible = true;
    renderer.render(scene, camera);
    if (HUD.chip.visible) { renderer.clearDepth(); renderer.render(HUD.scene, HUD.cam); }
  }

  /* A new run: planRun's read of it (court2d.js), or null. */
  function setRun(plan) {
    P = plan; shot = null; cam.set = false;
    if (P && P.shot && P.shot.from && P.F) {
      const F = P.F, f0 = F.findIndex(f => f.sk != null);
      if (f0 >= 0) {
        const fr = F[f0], i = P.shot.i;
        const sx = i >= 0 ? fr.o[2 * i] : P.shot.from.x, sy = i >= 0 ? fr.o[2 * i + 1] : P.shot.from.y;
        // the ball's path as the sim flew it, frame by frame, and its peak
        const path = []; let peak = null;
        for (let f = f0; f < F.length && F[f].sk != null; f++) {
          const p = W3(F[f].b[0], F[f].b[1], shotY(F[f].b[2] || 0, F[f].sk));
          path.push({ k: F[f].sk, p });
          if (!peak || p.y > peak.y) peak = p.clone();
        }
        // seconds of flight: the frames say it (sk runs 0 to 1 over the shot)
        const last = F.findLastIndex ? F.findLastIndex(f => f.sk != null) : f0;
        const kEnd = F[last].sk || 1, dur = kEnd > 0.05 ? (F[f0].t - F[last].t) / kEnd : 1;
        shot = { i, fi: f0, feet: W3(sx, sy), path, peak, dur: clamp(dur, 0.3, 2) };
      }
    }
    telestrate();
  }

  /* Build what is left, compile every shader, and draw once (that last part
     uploads the textures and compiles what compileAsync leaves). */
  async function warm(w, h, dpr, idle) {
    while (steps.length) { steps.shift()(); if (idle) await idle(); }
    resize(w, h, dpr);
    HUD.chip.visible = true; conf.visible = true; chipTex('OPEN LOOK · 50%', 'rgb(255,210,63)');
    // compileAsync only where the driver compiles in parallel (it warns otherwise)
    if (renderer.compileAsync && renderer.extensions.has('KHR_parallel_shader_compile')) { await renderer.compileAsync(scene, camera); await renderer.compileAsync(HUD.scene, HUD.cam); }
    else { renderer.compile(scene, camera); renderer.compile(HUD.scene, HUD.cam); }
    telestrate();
    render();
    HUD.chip.visible = false; conf.visible = false;
  }

  return {
    warm, setRun, draw, resize, render,
    get ready() { return steps.length === 0; },
    chipBox: () => HUD.box || null,
    camMode: () => cam.mode,
    stats: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles }),
    dispose() { renderer.dispose(); kit.dispose(); }
  };
}
