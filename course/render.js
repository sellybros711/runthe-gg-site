/* Run The Course: the renderer. Three.js lives behind this one file.
 *
 * It only READS the sim's state. Nothing here decides anything, so the art
 * can be replaced (grey box now, models later) without touching the game.
 *
 *   const R = createRenderer(canvas, map, cfg)
 *   R.rebuild(S, ctx)        the static world (on a new shift, a pad built, a plot cleared)
 *   R.snapshot(S)            remember where things were, before the sim steps
 *   R.draw(S, ctx, alpha, t, goal)   one frame, blended alpha of the way to the new tick
 *   R.pick(sx, sy, out)      a screen point on the ground, in world units
 *   R.project(x, y, out)     a world point on the screen, in CSS pixels
 *   R.info()                 draw calls and triangles of the last frame
 *
 * THE BUDGET: under 150 draw calls and 100,000 triangles. The whole static
 * world is ONE mesh with vertex colours; everything that repeats (golfers,
 * balls, rings, shadows, tufts) is an instanced mesh. No allocation in draw().
 *
 * THE ART. The game starts on shapes made in code, so it is playable at once.
 * The model packs (course/models, Kenney's CC0 kits) load behind it, and when
 * they land the trees, cars, buildings, flags and people are swapped for real
 * models. If a pack fails to load, the shapes stay: the game never waits on art.
 *
 * World x is east and y is north; three's X is x and Z is minus y. */
import * as THREE from '/assets/vendor/three-0.180.0/three.module.min.js';
import { GLTFLoader } from '/assets/vendor/three-0.180.0/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from '/assets/vendor/three-0.180.0/addons/utils/BufferGeometryUtils.js';
import { clone as cloneRig } from '/assets/vendor/three-0.180.0/addons/utils/SkeletonUtils.js';

const C = {
  rough: 0x6fae4f, rough2: 0x77b656, rough3: 0x68a54a, semi: 0x7cb955, fairA: 0x92d162, fairB: 0x84c457, collar: 0x9ad968, tee: 0x5a9c40,
  greenGood: 0xb8ea74, greenBad: 0x93a05a, puttGreen: 0xaee66f, wild: 0x4c7838, wild2: 0x426c31, tuft: 0x3b6630, raw: 0x9a9a5c, raw2: 0xa8a468,
  road: 0x5f646b, kerb: 0xcfd3d6, gravel: 0xc9bd9c, gravel2: 0xb5a988, path: 0xe4d8ba, pathEdge: 0xbfb08c, sand: 0xf0e0aa, sandEdge: 0xd9c78c,
  white: 0xf7f5ee, cream: 0xfff1d0, roof: 0x3b4a5a, wood: 0x9a6b3f, deck: 0xb98a5a, barn: 0xb3442f, brick: 0xa5553f, trunk: 0x7a5a3a,
  leaf: 0x3f8f45, leaf2: 0x4fa352, pine: 0x2f7a4a, pine2: 0x3a8a55, hedge: 0x3b8040, hedge2: 0x479249, blossom: 0xffb3c8, blossom2: 0xff8fb0,
  soil: 0x6b4a32, shade: 0x5f9a44, water: 0x3f9fe0, water2: 0x6fbdf0, rock: 0x9aa3a8, glass: 0x9fd3ee, glow: 0xfff2b0, gold: 0xe9b93a,
  accent: 0xff7a1a, accentDark: 0xc85a0c, ok: 0x35c26b, warn: 0xf2c230, bad: 0xe5483b, rope: 0xcaa24a,
  skin: 0xf0c9a0, ball: 0xffffff, cart: 0xf4f1e6, mower: 0xd8402c, dark: 0x2c3540
};
const SHIRTS = [0x3d7fd9, 0xd94f4f, 0xe0a030, 0x8a5fd0, 0x2fa89a, 0xe07ab0].map(c => new THREE.Color(c));
const OFF = [[0, 0], [0.9, 0.3], [-0.8, 0.5], [0.2, -0.9]];

class Batch {
  constructor() { this.p = []; this.c = []; this.col = new THREE.Color(); }
  tri(ax, ay, az, bx, by, bz, cx, cy, cz, color) {
    this.p.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    const k = this.col.set(color);
    for (let i = 0; i < 3; i++) this.c.push(k.r, k.g, k.b);
  }
  quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, color) {
    this.tri(ax, ay, az, bx, by, bz, cx, cy, cz, color); this.tri(ax, ay, az, cx, cy, cz, dx, dy, dz, color);
  }
  /* flat rectangle on the ground, world coords */
  rect(x, y, w, d, h, color) {
    const x0 = x - w / 2, x1 = x + w / 2, z0 = -(y - d / 2), z1 = -(y + d / 2);
    this.quad(x0, h, z0, x1, h, z0, x1, h, z1, x0, h, z1, color);
  }
  box(x, y, w, d, y0, h, side, top) {
    const x0 = x - w / 2, x1 = x + w / 2, z0 = -(y - d / 2), z1 = -(y + d / 2), t = y0 + h;
    this.quad(x0, t, z0, x1, t, z0, x1, t, z1, x0, t, z1, top === undefined ? side : top);
    this.quad(x0, y0, z0, x1, y0, z0, x1, t, z0, x0, t, z0, side);
    this.quad(x0, y0, z1, x1, y0, z1, x1, t, z1, x0, t, z1, side);
    this.quad(x0, y0, z0, x0, y0, z1, x0, t, z1, x0, t, z0, side);
    this.quad(x1, y0, z0, x1, y0, z1, x1, t, z1, x1, t, z0, side);
  }
  disc(x, y, r, h, color, n = 18) {
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, b = (i + 1) / n * Math.PI * 2;
      this.tri(x, h, -y, x + Math.cos(a) * r, h, -y - Math.sin(a) * r, x + Math.cos(b) * r, h, -y - Math.sin(b) * r, color);
    }
  }
  cyl(x, y, r0, r1, y0, h, color, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, b = (i + 1) / n * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
      this.quad(x + ca * r0, y0, -y - sa * r0, x + cb * r0, y0, -y - sb * r0, x + cb * r1, y0 + h, -y - sb * r1, x + ca * r1, y0 + h, -y - sa * r1, color);
    }
    if (r1 > 0) this.disc(x, y, r1, y0 + h, color, n);
  }
  /* a pitched roof: the ridge runs east to west */
  gable(x, y, w, d, y0, h, color) {
    const x0 = x - w / 2, x1 = x + w / 2, z0 = -(y - d / 2), z1 = -(y + d / 2), zm = -y, t = y0 + h;
    this.quad(x0, y0, z0, x1, y0, z0, x1, t, zm, x0, t, zm, color); this.quad(x0, y0, z1, x1, y0, z1, x1, t, zm, x0, t, zm, color);
    this.tri(x0, y0, z0, x0, y0, z1, x0, t, zm, color); this.tri(x1, y0, z0, x1, y0, z1, x1, t, zm, color);
  }
  /* a striped strip of turf along a line, with round ends */
  strip(pts, half, h, colA, colB, lanes = 4) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
      for (let k = 0; k < lanes; k++) {
        const o0 = -half + 2 * half * k / lanes, o1 = -half + 2 * half * (k + 1) / lanes;
        this.quad(a.x + nx * o0, h, -(a.y + ny * o0), b.x + nx * o0, h, -(b.y + ny * o0), b.x + nx * o1, h, -(b.y + ny * o1), a.x + nx * o1, h, -(a.y + ny * o1), k % 2 ? colB : colA);
      }
    }
    for (const p of pts) this.disc(p.x, p.y, half, h - 0.004, colA, 16);
  }
  mesh(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeVertexNormals();
    return new THREE.Mesh(g, material);
  }
}

function instanced(geo, mat, n, scene) {
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.setColorAt(0, new THREE.Color(0xffffff));
  m.instanceColor.setUsage(THREE.DynamicDrawUsage);
  m.frustumCulled = false; m.count = 0;
  scene.add(m);
  return m;
}

export function createRenderer(canvas, map, cfg) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(C.rough);
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 400);
  const ELEV = 0.86, DIST = 120;                      // about 49 degrees above the ground, looking north
  const camOff = new THREE.Vector3(0, Math.sin(ELEV) * DIST, Math.cos(ELEV) * DIST);
  const target = new THREE.Vector3(map.start.x, 0, -map.start.y);
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.9); sun.position.set(-40, 80, 30);
  const amb = new THREE.HemisphereLight(0xdff3ff, 0x6f8f55, 1.25);
  scene.add(sun, amb);
  const DAWN = new THREE.Color(0xffd27a), NOON = new THREE.Color(0xfff6e6), DUSK = new THREE.Color(0xff9d5c);

  const worldMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  let world = null, labels = null, zoom = 14, viewW = 1, viewH = 1, dpr = 1;
  const k = cfg.shot.yardsPerUnit;

  /* ---- instanced things ---- */
  const flat = g => { g.rotateX(-Math.PI / 2); return g; };
  const lam = o => new THREE.MeshLambertMaterial(o);
  const greens = instanced(flat(new THREE.CircleGeometry(1, 28)), lam({}), 18, scene);
  const rings = instanced(flat(new THREE.RingGeometry(0.84, 1, 36)), new THREE.MeshBasicMaterial({}), 48, scene);
  const fills = instanced(flat(new THREE.CircleGeometry(1, 28)), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false }), 64, scene);
  const shadows = instanced(flat(new THREE.CircleGeometry(1, 16)), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false }), 120, scene);
  const bodies = instanced(new THREE.CapsuleGeometry(0.34, 0.5, 3, 8), lam({}), 96, scene);
  const heads = instanced(new THREE.SphereGeometry(0.4, 10, 8), lam({}), 96, scene);
  const balls = instanced(new THREE.SphereGeometry(0.14, 6, 5), new THREE.MeshBasicMaterial({}), 96, scene);
  const tufts = instanced(new THREE.ConeGeometry(0.7, 1.3, 5), lam({ color: C.tuft }), 160, scene);
  rings.renderOrder = 2; fills.renderOrder = 1; shadows.renderOrder = 3;

  function part(geo, color, x, y, z, parent) { const m = new THREE.Mesh(geo, lam({ color })); m.position.set(x, y, z); parent.add(m); return m; }
  const player = new THREE.Group();
  const pBody = part(new THREE.CapsuleGeometry(0.42, 0.6, 3, 10), C.accent, 0, 0.75, 0, player);
  part(new THREE.SphereGeometry(0.52, 12, 10), C.skin, 0, 1.75, 0, player);
  part(new THREE.CylinderGeometry(0.56, 0.56, 0.16, 12), C.white, 0, 2.08, 0, player);
  part(new THREE.BoxGeometry(0.5, 0.06, 0.4), C.white, 0, 2.02, 0.5, player);
  scene.add(player);
  const cart = new THREE.Group();
  part(new THREE.BoxGeometry(1.5, 0.5, 2.4), C.cart, 0, 0.6, 0, cart);
  part(new THREE.BoxGeometry(1.5, 0.1, 2.0), C.accent, 0, 2.0, -0.1, cart);
  part(new THREE.BoxGeometry(1.3, 0.5, 0.3), C.dark, 0, 1.0, -0.8, cart);
  for (const [x, z] of [[-0.75, 0.8], [0.75, 0.8], [-0.75, -0.8], [0.75, -0.8]]) { part(new THREE.BoxGeometry(0.08, 1.2, 0.08), C.dark, x * 0.9, 1.4, z, cart); part(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 10).rotateZ(Math.PI / 2), C.dark, x, 0.3, z, cart); }
  scene.add(cart);
  const mower = new THREE.Group();
  part(new THREE.BoxGeometry(1.3, 0.5, 1.9), C.mower, 0, 0.55, 0, mower);
  part(new THREE.BoxGeometry(1.9, 0.2, 0.9), C.dark, 0, 0.25, 0.9, mower);
  part(new THREE.BoxGeometry(0.7, 0.6, 0.2), C.dark, 0, 1.0, -0.6, mower);
  for (const [x, z] of [[-0.7, 0.5], [0.7, 0.5], [-0.7, -0.7], [0.7, -0.7]]) part(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 10).rotateZ(Math.PI / 2), C.dark, x, 0.3, z, mower);
  scene.add(mower);
  const scaffold = part(new THREE.BoxGeometry(6, 1, 5), C.wood, 0, 0, 0, scene); scaffold.visible = false;
  const routeLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xff00ff })); routeLines.visible = false; routeLines.frustumCulled = false; scene.add(routeLines);

  /* ---- labels: every sign and pad on one canvas, one mesh ---- */
  function buildLabels(S, ctx) {
    const CW = 256, CH = 64, cols = 4, cv = document.createElement('canvas'); cv.width = CW * cols; cv.height = CH * 10;
    const g = cv.getContext('2d'), pos = [], uv = [];
    let n = 0;
    function add(text, x, y, w, stand, dark) {
      const cx = (n % cols) * CW, cy = Math.floor(n / cols) * CH; n++;
      g.fillStyle = dark ? '#2c3540' : '#fffaf0'; g.beginPath(); g.roundRect(cx + 3, cy + 3, CW - 6, CH - 6, 14); g.fill();
      g.fillStyle = dark ? '#fffaf0' : '#2c3540'; g.textAlign = 'center'; g.textBaseline = 'middle';
      let size = 30; g.font = '800 ' + size + 'px system-ui, sans-serif';
      while (g.measureText(text).width > CW - 24 && size > 12) { size -= 2; g.font = '800 ' + size + 'px system-ui, sans-serif'; }
      g.fillText(text, cx + CW / 2, cy + CH / 2 + 1);
      const u0 = cx / cv.width, u1 = (cx + CW) / cv.width, v1 = 1 - cy / cv.height, v0 = 1 - (cy + CH) / cv.height, h = w / 4;
      const z = -y;
      if (stand) { const b = 1.6, t = b + h * 0.94, zb = z, zt = z - h * 0.34; pos.push(x - w / 2, b, zb, x + w / 2, b, zb, x + w / 2, t, zt, x - w / 2, b, zb, x + w / 2, t, zt, x - w / 2, t, zt); }
      else pos.push(x - w / 2, 0.07, z + h / 2, x + w / 2, 0.07, z + h / 2, x + w / 2, 0.07, z - h / 2, x - w / 2, 0.07, z + h / 2, x + w / 2, 0.07, z - h / 2, x - w / 2, 0.07, z - h / 2);
      uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    }
    const money = v => '$' + v.toLocaleString('en-US'), pads = cfg.economy.pads;
    add('Check in', map.counter.x, map.counter.y - 3.3, 5, false, true);
    add('Tee ' + ctx.route.first, map.teeRing.x - 4.6, map.teeRing.y, 4, false, true);
    /* every pad says what it is, its next level and its price (the sim words it) */
    for (const st of stationsOf(S, ctx, [], true)) if (st.pad && st.label) add(st.label, st.x, st.y - 3.6, 7.5, false, false);
    for (const h of map.holes) {
      if (S.open.includes(h.ord)) continue;
      const pad = pads['hole_' + h.ord], later = cfg.later.unlocks['hole_' + h.ord];
      const price = pad ? pad.cost : later ? later[0] : 0;
      add('Hole ' + h.ord + ' · ' + money(price), h.line[0].x + 2.5, h.line[0].y - 1.5, 6, true, false);
    }
    add('Back nine: coming with', map.backNine.sign.x - 5.5, map.backNine.sign.y + 2.2, 10, true, false);
    add('Semi-Private status', map.backNine.sign.x - 5.5, map.backNine.sign.y, 10, true, false);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
  }

  /* ---- the static world, as one mesh ---- */
  /* a steady pseudo-random number for decoration (never the sim's generator) */
  const hash = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  const FLOWERS = [0xff6b8a, 0xffd23f, 0xf7f5ee, 0xb86bff, 0xff9a3c];
  const TEES = [0xf7f5ee, 0x3d7fd9, 0xe5483b, 0xf2c230];
  const FLAGS = [0xff7a1a, 0xff7a1a, 0xe5483b, 0xf2c230];
  const CARS = [0xd94f4f, 0x3d7fd9, 0xf7f5ee, 0x2c3540, 0xe0a030, 0x2fa89a, 0x8a5fd0, 0xb9c2c9];
  function tree(B, x, y, i) {
    const k = 0.85 + hash(i) * 0.5;
    B.disc(x + 0.7, y - 0.5, 1.7 * k, 0.022, C.shade, 10);
    if (place(i % 3 === 0 ? PINES[i % PINES.length] : TREES[i % TREES.length], x, y, 3.0 * k, hash(i + 4) * 6.28)) return;
    if (i % 3 === 0) {            // a pine
      B.cyl(x, y, 0.22, 0.18, 0, 1.0 * k, C.trunk, 5);
      B.cyl(x, y, 1.5 * k, 0.7 * k, 0.8 * k, 1.3 * k, C.pine, 7); B.cyl(x, y, 1.1 * k, 0.4 * k, 1.9 * k, 1.2 * k, C.pine2, 7); B.cyl(x, y, 0.7 * k, 0, 2.9 * k, 1.2 * k, C.pine, 7);
    } else {                      // a round tree
      B.cyl(x, y, 0.28, 0.22, 0, 1.5 * k, C.trunk, 6);
      B.cyl(x, y, 1.2 * k, 1.9 * k, 1.2 * k, 0.9 * k, i % 2 ? C.leaf : C.leaf2, 8); B.cyl(x, y, 1.9 * k, 1.5 * k, 2.1 * k, 0.8 * k, i % 2 ? C.leaf2 : C.leaf, 8); B.cyl(x, y, 1.5 * k, 0.5 * k, 2.9 * k, 0.8 * k, i % 2 ? C.leaf : C.leaf2, 8);
    }
  }
  function flowers(B, x, y, r, seed) {
    B.disc(x, y, r, 0.05, C.soil, 12);
    const n = Math.round(r * (ART ? 4 : 7));
    for (let i = 0; i < n; i++) {
      const a = hash(seed + i) * 6.283, d = Math.sqrt(hash(seed + i + 50)) * r * 0.85;
      if (place(BLOOMS[(seed + i) % 3], x + Math.cos(a) * d, y + Math.sin(a) * d, 2.6, a, 0.1)) continue;
      B.cyl(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.2, 0.05, 0.05, 0.3, FLOWERS[(seed + i) % FLOWERS.length], 5);
    }
  }
  function hedge(B, x, y, w, d) {
    if (ART && ART.models.plant_bushLarge) { const n = Math.max(1, Math.round(Math.max(w, d) / 1.1)); for (let i = 0; i < n; i++) place(i % 2 ? 'plant_bushLarge' : 'plant_bushDetailed', w >= d ? x - w / 2 + (i + 0.5) * w / n : x, w >= d ? y : y - d / 2 + (i + 0.5) * d / n, 2.4, i * 1.3, 0.1); return; }
    B.box(x, y, w, d, 0, 0.8, C.hedge, C.hedge2);
  }
  function bench(B, x, y) { B.box(x, y, 1.6, 0.5, 0.35, 0.1, C.wood); B.box(x, y + 0.25, 1.6, 0.1, 0.45, 0.5, C.wood); B.box(x - 0.65, y, 0.1, 0.4, 0, 0.35, C.dark); B.box(x + 0.65, y, 0.1, 0.4, 0, 0.35, C.dark); }
  function lamp(B, x, y) { B.cyl(x, y, 0.09, 0.07, 0, 2.6, C.dark, 5); B.cyl(x, y, 0.28, 0.2, 2.6, 0.3, C.glow, 6); }
  function fence(B, x0, y0, x1, y1) {
    const l = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(l / 3));
    for (let i = 0; i <= n; i++) B.cyl(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, 0.11, 0.11, 0, 1.0, C.white, 4);
    const nx = -(y1 - y0) / l * 0.05, ny = (x1 - x0) / l * 0.05;
    for (const h of [0.45, 0.8]) B.quad(x0 - nx, h, -(y0 - ny), x1 - nx, h, -(y1 - ny), x1 + nx, h + 0.12, -(y1 + ny), x0 + nx, h + 0.12, -(y0 + ny), C.white);
  }
  function windows(B, x, y, w, zf, y0, n) { for (let i = 0; i < n; i++) B.quad(x - w / 2 + (i + 0.3) * w / n, y0, zf, x - w / 2 + (i + 0.7) * w / n, y0, zf, x - w / 2 + (i + 0.7) * w / n, y0 + 1, zf, x - w / 2 + (i + 0.3) * w / n, y0 + 1, zf, C.glass); }
  function house(B, x, y, w, d, h, wall, roof, rh, model, mw) { if (model && place(model, x, y, w / mw, 0)) return true; B.box(x, y, w, d, 0, h, wall, wall); B.gable(x, y, w + 0.8, d + 0.8, h, rh || 1.4, roof); return false; }
  function car(B, x, y, i) { B.disc(x + 0.3, y - 0.3, 1.5, 0.045, C.shade, 8); if (place(AUTOS[i % AUTOS.length], x, y, 1.15, i % 2 ? Math.PI : 0)) return; const c = CARS[i % CARS.length]; B.box(x, y, 1.5, 2.8, 0.25, 0.6, c); B.box(x, y - 0.15, 1.3, 1.5, 0.85, 0.5, C.glass, c); B.disc(x + 0.3, y - 0.3, 1.5, 0.045, C.shade, 8); }

  function rebuild(S, ctx) {
    lastS = S; lastCtx = ctx; buckets = {};
    if (artGroup) { scene.remove(artGroup); for (const m of artGroup.children) m.geometry.dispose(); artGroup = null; }
    for (let i = 0; i < PLAYER_SLOT; i++) if (chars[i]) { scene.remove(chars[i].root); chars[i].mixer.stopAllAction(); chars[i] = null; }
    if (world) { scene.remove(world); world.geometry.dispose(); }
    if (labels) { scene.remove(labels); labels.geometry.dispose(); labels.material.map.dispose(); labels.material.dispose(); }
    const B = new Batch(), b = map.bounds, d = map.draw, L = looksOf(S, cfg, {});
    const T = id => (L[id] === undefined ? 0 : L[id]);
    B.rect((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, b.x1 - b.x0 + 160, b.y1 - b.y0 + 160, 0, C.rough);
    /* the ground is not one flat colour: soft patches of lighter and darker grass */
    for (let i = 0; i < 150; i++) B.disc(b.x0 + hash(i) * (map.road.x - 6 - b.x0), b.y0 + hash(i + 500) * (b.y1 - b.y0), 2.5 + hash(i + 900) * 4.5, 0.008 + (i % 5) * 0.001, i % 2 ? C.rough2 : C.rough3, 9);
    /* the back nine tract, the road and its fence */
    const bn = map.backNine;
    B.rect((bn.x0 + bn.x1) / 2, (bn.y0 + bn.y1) / 2, bn.x1 - bn.x0, bn.y1 - bn.y0, 0.02, C.raw);
    for (let i = 0; i < 40; i++) B.disc(bn.x0 + hash(i + 77) * (bn.x1 - bn.x0), bn.y0 + hash(i + 177) * (bn.y1 - bn.y0), 2 + hash(i) * 4, 0.024, i % 2 ? C.raw2 : C.wild, 8);
    B.rect(map.road.x, (b.y0 + b.y1) / 2, map.road.w, b.y1 - b.y0 + 160, 0.03, C.road);
    for (let y = b.y0 - 40; y < b.y1 + 40; y += 5) B.rect(map.road.x, y, 0.25, 2.2, 0.034, C.white);
    fence(B, map.road.x - 4, b.y0, map.road.x - 4, b.y1); fence(B, bn.x0, bn.y0, bn.x0, bn.y1);

    /* the way in: a drive from the south west to the parking lot */
    const pk = map.parking, pt = T('parking');
    B.strip([map.entrance, { x: pk.x - pk.w / 2 - 3, y: pk.y - 2 }, { x: pk.x - pk.w / 2 + 1, y: pk.y }], 1.6, 0.03, pt ? C.road : C.gravel, pt ? C.road : C.gravel, 1);
    const pw = pk.w + pt * 2, pd = pk.d + pt;
    B.rect(pk.x, pk.y, pw + 0.6, pd + 0.6, 0.032, pt ? C.kerb : C.gravel2);
    B.rect(pk.x, pk.y, pw, pd, 0.036, pt ? C.road : C.gravel);
    const bays = Math.floor(pw / 2.2);
    if (pt) for (let i = 0; i <= bays; i++) for (const sy of [-1, 1]) B.rect(pk.x - pw / 2 + 0.6 + i * 2.2, pk.y + sy * (pd / 2 - 1.7), 0.14, 3, 0.04, C.white);
    const booked = S.groups.length;
    for (let i = 0; i < Math.min(booked + 2, bays * 2 - 1, 6); i++) car(B, pk.x - pw / 2 + 1.7 + (i >> 1) * 2.2, pk.y + (i % 2 ? 1 : -1) * (pd / 2 - 1.7), i + S.no);
    if (pt >= 2) { for (const sx of [-1, 1]) for (const sy of [-1, 1]) lamp(B, pk.x + sx * (pw / 2 + 0.6), pk.y + sy * (pd / 2 + 0.6)); }
    if (pt >= 1) { hedge(B, pk.x, pk.y - pd / 2 - 1, pw, 0.8); }
    if (pt >= 3) { flowers(B, pk.x - pw / 2 - 1.6, pk.y + pd / 2 + 1, 1.2, 7); flowers(B, pk.x + pw / 2 + 1.6, pk.y + pd / 2 + 1, 1.2, 9); B.gable(map.gate.x, map.gate.y + 0.2, 3.6, 0.8, 2.6, 0.9, C.roof); B.cyl(map.gate.x - 1.6, map.gate.y + 0.2, 0.15, 0.15, 0, 2.6, C.wood, 5); B.cyl(map.gate.x + 1.6, map.gate.y + 0.2, 0.15, 0.15, 0, 2.6, C.wood, 5); }

    /* paths, each with a darker edge under it */
    const path = [map.gate, map.shopExit, map.queue, map.waypoints.toTee[0], map.waypoints.toTee[1], map.holes[0].line[0]];
    const legs = [path];
    for (let i = 0; i < map.holes.length; i++) { const a = map.holes[i].line; legs.push([a[a.length - 1], map.holes[(i + 1) % map.holes.length].line[0]]); }
    legs.push([map.waypoints.toTee[0], map.pads.cart_barn, map.snackShack], [map.waypoints.toTee[1], { x: map.puttingGreen.x - 5, y: map.puttingGreen.y - 1 }], [map.shopExit, { x: map.mowerPark.x + 2, y: map.mowerPark.y - 1 }]);
    for (const l of legs) B.strip(l, 0.85, 0.036, C.pathEdge, C.pathEdge, 1);
    for (const l of legs) B.strip(l, 0.6, 0.044, C.path, C.path, 1);

    /* a pond, for the look of it */
    B.disc(22.5, 49.5, 6.2, 0.04, C.sand, 22); B.disc(22.5, 49.5, 5.5, 0.05, C.water, 22); B.disc(21.3, 50.3, 3.2, 0.055, C.water2, 16);
    for (let i = 0; i < 7; i++) { const rx = 22.5 + Math.cos(i * 0.9) * 6.4, ry = 49.5 + Math.sin(i * 0.9) * 6.4; if (!place(ROCKS[i % 3], rx, ry, 1.6, i)) B.cyl(rx, ry, 0.35 + hash(i) * 0.3, 0.2, 0, 0.35, C.rock, 6); }

    /* holes: turf for the open ones, overgrowth and rope for the rest */
    for (const h of map.holes) {
      const open = S.open.includes(h.ord), tee = h.line[0], gr = h.line[h.line.length - 1], ht = T('hole_' + h.ord);
      if (open) {
        B.strip(h.line, d.fairwayHalf + 0.9, 0.046, C.semi, C.semi, 1);
        B.strip(h.line, d.fairwayHalf, 0.052, C.fairA, C.fairB);
        B.disc(gr.x, gr.y, d.greenR + 0.7, 0.056, C.collar, 28);
        B.rect(tee.x, tee.y, d.teeR * 2.2, d.teeR * 2.2, 0.058, C.tee);
        for (const sx of [-1, 1]) B.cyl(tee.x + sx * 0.9, tee.y + 0.5, 0.16, 0.16, 0.058, 0.22, TEES[ht], 6);
        if (!place(['flag-red', 'flag-red', 'flag-blue', 'flag-green'][ht], gr.x, gr.y, 2.6, Math.PI)) {
          B.cyl(gr.x, gr.y, 0.05, 0.05, 0, 2.5, C.white, 5);
          B.tri(gr.x, 2.5, -gr.y, gr.x + 1.15, 2.18, -gr.y, gr.x, 1.86, -gr.y, FLAGS[ht]);
        }
        /* a hole sign at every tee; more as the hole levels */
        B.cyl(tee.x - 2, tee.y + 0.2, 0.08, 0.08, 0, 1.1, C.wood, 5); B.box(tee.x - 2, tee.y + 0.2, 0.9, 0.12, 1.0, 0.6, C.roof);
        const l0 = h.line[1], dx = l0.x - tee.x, dy = l0.y - tee.y, ll = Math.hypot(dx, dy), nx = -dy / ll, ny = dx / ll;
        if (ht >= 1) { bench(B, tee.x + 2.4, tee.y - 0.6); B.cyl(tee.x - 2.6, tee.y - 1, 0.14, 0.14, 0, 0.9, C.accentDark, 6); B.cyl(tee.x - 2.6, tee.y - 1, 0.22, 0.22, 0.9, 0.25, C.white, 6); }
        if (ht >= 1) { const m = h.line[h.line.length - 2], gx = gr.x - m.x, gy = gr.y - m.y, gl = Math.hypot(gx, gy), px = -gy / gl, py = gx / gl;
          for (const sgn of [-1, 1]) { const bx = gr.x + px * sgn * (d.greenR + 1.9) - gx / gl * 1.2, by = gr.y + py * sgn * (d.greenR + 1.9) - gy / gl * 1.2; B.disc(bx, by, 1.5, 0.06, C.sandEdge, 12); B.disc(bx, by, 1.2, 0.066, C.sand, 12); if (ht < 2) break; } }
        if (ht >= 2) { for (let i = 1; i < h.line.length; i++) { const a = h.line[i - 1], c = h.line[i], f = 0.55, sgn = i % 2 ? 1 : -1, sl = Math.hypot(c.x - a.x, c.y - a.y);
            const bx = a.x + (c.x - a.x) * f - (c.y - a.y) / sl * sgn * (d.fairwayHalf + 1.6), by = a.y + (c.y - a.y) * f + (c.x - a.x) / sl * sgn * (d.fairwayHalf + 1.6);
            B.disc(bx, by, 1.9, 0.06, C.sandEdge, 12); B.disc(bx, by, 1.55, 0.066, C.sand, 12); B.disc(bx + 1.2, by + 0.6, 1.1, 0.066, C.sand, 10); }
          flowers(B, tee.x - dx / ll * 3 - nx * 1.6, tee.y - dy / ll * 3 - ny * 1.6, 1.0, h.ord * 11); }
        if (ht >= 3) { flowers(B, tee.x - dx / ll * 3 + nx * 1.6, tee.y - dy / ll * 3 + ny * 1.6, 1.0, h.ord * 13); for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283; B.cyl(gr.x + Math.cos(a) * (d.greenR + 3.4), gr.y + Math.sin(a) * (d.greenR + 3.4), 0.3, 0.2, 0, 0.3, C.rock, 5); } }
      } else {
        B.strip(h.line, d.fairwayHalf + 0.8, 0.04, C.wild, C.wild2, 2);
        for (let i = 1; i < h.line.length; i++) {
          const a = h.line[i - 1], c = h.line[i], l = Math.hypot(c.x - a.x, c.y - a.y), nx = -(c.y - a.y) / l, ny = (c.x - a.x) / l, n = Math.round(l / 5);
          for (let j = 0; j <= n; j++) for (const sgn of [-1, 1]) B.cyl(a.x + (c.x - a.x) * j / n + nx * sgn * (d.fairwayHalf + 1.6), a.y + (c.y - a.y) * j / n + ny * sgn * (d.fairwayHalf + 1.6), 0.12, 0.12, 0, 1.0, C.rope, 5);
          for (const sgn of [-1, 1]) { const o = d.fairwayHalf + 1.6; B.quad(a.x + nx * sgn * o, 0.8, -(a.y + ny * sgn * o), c.x + nx * sgn * o, 0.8, -(c.y + ny * sgn * o), c.x + nx * sgn * o, 0.88, -(c.y + ny * sgn * o), a.x + nx * sgn * o, 0.88, -(a.y + ny * sgn * o), C.rope); }
        }
        B.cyl(tee.x + 2.5, tee.y - 1.5, 0.12, 0.12, 0, 1.7, C.wood, 5);
      }
    }

    /* the clubhouse grows with its level */
    const ch = map.clubhouse, ct = T('clubhouse'), zf = -(ch.y - ch.d / 2) + 0.02;
    B.disc(ch.x + 1.5, ch.y - 1, 8.2, 0.03, C.shade, 14);
    const CW = [1.30, 1.30, 1.76, 1.83];
    if (!place(CLUBHOUSE[ct], ch.x, ch.y + 0.3, ch.w / CW[ct], 0)) {
      house(B, ch.x, ch.y, ch.w, ch.d, ch.h, ct >= 3 ? C.cream : C.white, C.roof, 1.8);
      windows(B, ch.x - 3.4, 0, 4, zf, 1.6, 2);
      if (ct >= 1) { B.box(ch.x + ch.w / 2 + 1.2, ch.y, 2.4, ch.d - 1, 0, 0.3, C.wood, C.deck); for (const sy of [-1, 1]) B.cyl(ch.x + ch.w / 2 + 2.2, ch.y + sy * (ch.d / 2 - 0.9), 0.12, 0.12, 0.3, 2.4, C.white, 5); B.box(ch.x + ch.w / 2 + 1.2, ch.y, 2.8, ch.d - 0.4, 2.7, 0.18, C.roof); B.box(ch.x - 3, ch.y + 1.5, 0.9, 0.9, ch.h + 0.8, 1.9, C.brick); }
      if (ct >= 2) { house(B, ch.x - 1, ch.y + 0.4, ch.w - 5, ch.d - 3, ch.h + 2.6, C.white, C.roof, 1.4); B.cyl(ch.x + 4.6, ch.y - 2.6, 0.07, 0.07, ch.h, 4.2, C.white, 5); B.tri(ch.x + 4.6, ch.h + 4.2, -(ch.y - 2.6), ch.x + 6.2, ch.h + 3.8, -(ch.y - 2.6), ch.x + 4.6, ch.h + 3.3, -(ch.y - 2.6), C.accent); }
      if (ct >= 3) { B.box(ch.x, ch.y, ch.w + 0.2, ch.d + 0.2, ch.h - 0.5, 0.3, C.gold); B.cyl(ch.x - 1, ch.y - 1.2, 0.7, 0.7, ch.h + 2.6, 0.2, C.gold, 12); for (const sx of [-1, 1]) flowers(B, ch.x + sx * 5.2, ch.y - ch.d / 2 - 2.6, 0.9, 30 + sx); }
    }
    if (ART && ct >= 3) for (const sx of [-1, 1]) flowers(B, ch.x + sx * 5.2, ch.y - ch.d / 2 - 2.6, 0.9, 30 + sx);

    /* the pro shop: the counter on the clubhouse's south wall */
    const st = T('shop'), cx0 = map.counter.x, cy0 = ch.y - ch.d / 2 - 0.6;
    B.box(cx0, cy0, 4.2 + st * 0.5, 1.1, 0, 1.2, C.wood, C.sand);
    for (let i = 0; i < 6 + st; i++) B.box(cx0 - 2.2 - st * 0.25 + i * 0.8 + 0.4, cy0 - 0.45, 0.8, 1.9, 2.6, 0.2, i % 2 || st === 0 ? C.accent : C.white);
    if (st >= 1) { B.box(cx0, cy0 + 0.4, 3, 0.15, 3.0, 0.7, C.roof); B.box(cx0 - 3.1, cy0 - 0.2, 0.7, 0.7, 0, 1.0, C.dark, C.accentDark); }
    if (st >= 2) { for (let i = 0; i < 4; i++) B.cyl(cx0 + 3.0 + (i % 2) * 0.3, cy0 - 0.5 + (i >> 1) * 0.35, 0.05, 0.05, 0, 1.5, i % 2 ? C.rock : C.dark, 4); B.box(cx0 + 3.2, cy0 + 0.1, 1.0, 0.5, 0, 0.9, C.accentDark); }
    if (st >= 3) { B.box(cx0, cy0 + 0.42, 3.4, 0.2, 2.9, 0.9, C.gold); for (const sx of [-1, 1]) lamp(B, cx0 + sx * 3.9, cy0 - 1.2); }

    /* the starter's box by tee 1 */
    const sb = T('starter'), sx0 = map.teeRing.x - 3.6, sy0 = map.teeRing.y + 2.6;
    if (sb === 0) B.box(sx0, sy0, 0.9, 0.7, 0, 1.1, C.wood, C.sand);
    else { house(B, sx0, sy0, 1.8, 1.8, 2.0, C.white, sb >= 3 ? C.gold : C.accentDark, 0.9); windows(B, sx0, 0, 1.4, -(sy0 - 0.9) + 0.02, 0.9, 1); }
    if (sb >= 2) { B.cyl(sx0 + 1.8, sy0 - 0.6, 0.07, 0.07, 0, 2.2, C.dark, 5); B.cyl(sx0 + 1.8, sy0 - 0.6, 0.35, 0.35, 2.2, 0.12, C.white, 10); bench(B, sx0 - 2.2, sy0 - 0.4); }
    if (sb >= 3) flowers(B, sx0, sy0 - 1.7, 0.8, 21);

    /* the mower shed */
    const sh = map.shed, sd = T('shed');
    B.disc(sh.x + 1, sh.y - 0.8, 4, 0.03, C.shade, 10);
    if (!place('building-type-g', sh.x, sh.y, sh.w / 1.45, 0)) {
      house(B, sh.x, sh.y, sh.w, sh.d, sh.h, sd >= 2 ? C.barn : C.wood, C.roof, 1.2);
      B.quad(sh.x - 1.1, 0, -(sh.y - sh.d / 2) + 0.02, sh.x + 1.1, 0, -(sh.y - sh.d / 2) + 0.02, sh.x + 1.1, 2.2, -(sh.y - sh.d / 2) + 0.02, sh.x - 1.1, 2.2, -(sh.y - sh.d / 2) + 0.02, C.dark);
      if (sd >= 1) { B.cyl(sh.x - sh.w / 2 - 1.1, sh.y, 0.6, 0.6, 0, 1.3, C.bad, 8); B.box(sh.x + sh.w / 2 + 0.6, sh.y - 0.5, 0.5, 1.6, 0, 1.4, C.trunk); }
      if (sd >= 3) house(B, sh.x - sh.w / 2 - 2.2, sh.y + 4.2, 3.4, 3, 2.4, C.barn, C.roof, 1.0);
    } else if (sd >= 1) { B.cyl(sh.x - sh.w / 2 - 1.1, sh.y, 0.6, 0.6, 0, 1.3, C.bad, 8); if (sd >= 3) place('building-type-k', sh.x - sh.w / 2 - 2.6, sh.y + 4.4, 3.2, 0); }

    /* the cart barn, once built */
    if (L['cart_barn:st'] === 'done') {
      const p = map.pads.cart_barn, t = T('cart_barn'), w = 7 + t;
      B.disc(p.x + 2, p.y + 4.8, 5.5, 0.03, C.shade, 10);
      if (!house(B, p.x + 1, p.y + 5.5, w, 5, 3, C.white, C.accentDark, 1.3, 'building-e', 1.64))
        B.quad(p.x - 0.8, 0, -(p.y + 3) + 0.02, p.x + 2.8, 0, -(p.y + 3) + 0.02, p.x + 2.8, 2.3, -(p.y + 3) + 0.02, p.x - 0.8, 2.3, -(p.y + 3) + 0.02, C.dark);
      for (let i = 0; i <= t; i++) { const qx = p.x + 6.2 + i * 1.9, qy = p.y + 4.6; B.box(qx, qy, 1.3, 2.1, 0.3, 0.45, C.cart); B.box(qx, qy - 0.1, 1.3, 1.7, 1.75, 0.1, C.accent); for (const a of [-0.55, 0.55]) for (const c of [-0.7, 0.7]) B.cyl(qx + a, qy + c, 0.06, 0.06, 0.75, 1.0, C.dark, 4); }
    }

    /* the putting green */
    const pg = map.puttingGreen;
    if (L['putting_green:st'] === 'done') {
      const t = T('putting_green');
      B.disc(pg.x, pg.y, pg.r + 0.7, 0.05, C.collar, 26); B.disc(pg.x, pg.y, pg.r, 0.058, C.puttGreen, 26);
      for (let i = 0; i < 3 + t * 2; i++) { const a = i * 2.4, r = pg.r * (0.35 + hash(i + 3) * 0.45), hx = pg.x + Math.cos(a) * r, hy = pg.y + Math.sin(a) * r; B.disc(hx, hy, 0.18, 0.064, C.dark, 8); B.cyl(hx, hy, 0.035, 0.035, 0, 1.1, C.white, 4); B.tri(hx, 1.1, -hy, hx + 0.5, 0.95, -hy, hx, 0.8, -hy, FLAGS[i % 4]); }
      if (t >= 1) { bench(B, pg.x - pg.r - 1.6, pg.y); bench(B, pg.x + pg.r + 1.6, pg.y + 1); }
      if (t >= 2) for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283 + 0.4; hedge(B, pg.x + Math.cos(a) * (pg.r + 2.4), pg.y + Math.sin(a) * (pg.r + 2.4), 1.4, 0.7); }
      if (t >= 3) { flowers(B, pg.x - 3, pg.y + pg.r + 2.6, 1, 41); flowers(B, pg.x + 3, pg.y + pg.r + 2.6, 1, 43); }
    } else { B.disc(pg.x, pg.y, pg.r, 0.03, C.rough3, 20); B.cyl(pg.x, pg.y, 0.1, 0.1, 0, 1.2, C.wood, 5); }

    /* the snack shack, at the turn */
    const ss = map.snackShack;
    if (L['snack_shack:st'] === 'done') {
      const t = T('snack_shack');
      B.disc(ss.x + 1, ss.y - 0.8, 4.2, 0.03, C.shade, 10);
      if (!house(B, ss.x, ss.y, 5, 4, 2.6, C.cream, C.bad, 1.2, 'building-c', 0.88)) {
        for (let i = 0; i < 6; i++) B.box(ss.x - 2.5 + i * 0.84 + 0.42, ss.y - 2.6, 0.84, 1.4, 2.2, 0.15, i % 2 ? C.white : C.bad);
        B.box(ss.x, ss.y - 2.1, 3.4, 0.6, 0, 1.1, C.wood, C.sand);
      }
      for (let i = 0; i < 1 + t; i++) { const tx = ss.x - 3.5 + i * 2.6, ty = ss.y - 5.2; if (place(i % 2 ? 'detail-parasol-b' : 'detail-parasol-a', tx, ty, 5, 0)) continue; B.cyl(tx, ty, 0.7, 0.7, 0.75, 0.1, C.white, 10); B.cyl(tx, ty, 0.08, 0.08, 0, 2.3, C.dark, 5); B.cyl(tx, ty, 1.3, 0.1, 2.0, 0.6, i % 2 ? C.accent : C.water, 8); }
    } else { B.rect(ss.x, ss.y, 5, 4, 0.04, C.gravel); B.cyl(ss.x, ss.y, 0.1, 0.1, 0, 1.2, C.wood, 5); }

    /* the driving range */
    const rg = map.range;
    if (L['driving_range:st'] === 'done') {
      const t = T('driving_range'), mats = 5 + t * 2;
      B.rect(rg.x, rg.y, rg.w, rg.d, 0.04, C.fairB);
      for (let i = 0; i < 6; i++) B.rect(rg.x - rg.w / 2 + 3 + i * 5.2, rg.y, 2.6, rg.d, 0.045, i % 2 ? C.fairA : C.fairB);
      for (let i = 0; i < mats; i++) { const my = rg.y - rg.d / 2 + 1.5 + i * (rg.d - 3) / (mats - 1); B.rect(rg.x + rg.w / 2 - 1.5, my, 1.6, 1.1, 0.05, C.tee); B.cyl(rg.x + rg.w / 2 - 0.3, my, 0.25, 0.3, 0, 0.4, C.accentDark, 6); }
      for (let i = 1; i <= 3; i++) { const sx = rg.x + rg.w / 2 - 4 - i * 8; B.cyl(sx, rg.y + rg.d / 2 - 1, 0.08, 0.08, 0, 1.6, C.wood, 5); B.box(sx, rg.y + rg.d / 2 - 1, 1.6, 0.12, 1.2, 0.8, [C.bad, C.white, C.water][i - 1]); }
      for (let i = 0; i < 60; i++) B.disc(rg.x - rg.w / 2 + 2 + hash(i + 5) * (rg.w - 8), rg.y - rg.d / 2 + 1 + hash(i + 55) * (rg.d - 2), 0.13, 0.06, C.ball, 5);
      if (t >= 2) B.box(rg.x + rg.w / 2 - 1.2, rg.y, 3, rg.d - 1, 2.6, 0.2, C.roof);
      fence(B, rg.x - rg.w / 2, rg.y - rg.d / 2, rg.x - rg.w / 2, rg.y + rg.d / 2);
    } else { B.rect(rg.x, rg.y, rg.w, rg.d, 0.035, C.wild); for (let i = 0; i < 26; i++) B.disc(rg.x - rg.w / 2 + hash(i + 8) * rg.w, rg.y - rg.d / 2 + hash(i + 88) * rg.d, 1.2 + hash(i) * 1.6, 0.04, C.wild2, 7); }

    /* the gardens: beds, hedges and a fountain as they level */
    const gt = T('gardens'), gd = map.gardens;
    const SPOTS = [[7.5, -3], [-7.5, 5], [12.5, 11], [-9, -13.5], [6, 10], [13, -3], [-9, 12], [20, -9], [2, 23], [14, 18], [-16, -4], [30, 4], [-3, 14], [18, 12], [-20, 9], [8, 26],
      [36, 20], [44, 12], [54, 44], [62, 34], [6, 37], [14, 38], [-24, -14], [5, -28], [28, -8], [32, 16]];
    const beds = [3, 9, 17, 26][gt];
    for (let i = 0; i < beds; i++) flowers(B, SPOTS[i][0], SPOTS[i][1], 0.9 + hash(i + 60) * 0.5, i * 17);
    if (gt >= 1) { hedge(B, ch.x - 3.4, ch.y - ch.d / 2 - 0.5, 4.6, 0.7); hedge(B, ch.x, ch.y + ch.d / 2 + 0.6, ch.w - 1, 0.7); }
    if (gt >= 2) { B.cyl(gd.x, gd.y, 2.0, 2.0, 0, 0.4, C.rock, 14); B.disc(gd.x, gd.y, 1.7, 0.42, C.water, 14); B.cyl(gd.x, gd.y, 0.3, 0.2, 0.4, 1.2, C.rock, 8); B.cyl(gd.x, gd.y, 0.7, 0.5, 1.5, 0.15, C.water2, 10); bench(B, gd.x - 3.4, gd.y + 0.5); bench(B, gd.x + 3.4, gd.y + 0.5); }
    if (gt >= 3) place('windmill', gd.x + 7.5, gd.y + 2.5, 3.2, -0.5);
    if (gt >= 3) for (let i = 0; i < 10; i++) { const f = i / 9, x = map.entrance.x + 3 + (map.parking.x - map.parking.w / 2 - 6 - map.entrance.x) * f + 2.6, y = map.entrance.y + (map.parking.y - 2 - map.entrance.y) * f + 3.4; B.cyl(x, y, 0.16, 0.14, 0, 1.2, C.trunk, 5); B.cyl(x, y, 0.9, 1.1, 1.0, 0.7, C.blossom, 7); B.cyl(x, y, 1.1, 0.3, 1.7, 0.8, C.blossom2, 7); }

    B.cyl(map.backNine.sign.x - 5.5, map.backNine.sign.y, 0.15, 0.15, 0, 1.7, C.wood, 5);
    for (let i = 0; i < map.trees.length; i++) tree(B, map.trees[i][0], map.trees[i][1], i);
    /* a tree line round the edge of the property */
    for (let i = 0; i < 46; i++) { const f = i / 46; tree(B, b.x0 + 2 + f * (map.road.x - 8 - b.x0) + hash(i) * 2, b.y1 - 2 - hash(i + 9) * 3, i + 40); tree(B, b.x0 + 1 + hash(i + 3) * 3, b.y0 + 4 + f * (b.y1 - b.y0 - 6), i + 90); }

    world = B.mesh(worldMat); world.frustumCulled = false; scene.add(world);
    if (ART) {
      artGroup = new THREE.Group();
      for (const key in buckets) { const mesh = new THREE.Mesh(mergeGeometries(buckets[key], false), ART.mats[key]); mesh.frustumCulled = false; artGroup.add(mesh); for (const g of buckets[key]) g.dispose(); }
      scene.add(artGroup);
    }
    buckets = null;
    labels = buildLabels(S, ctx); labels.frustumCulled = false; labels.renderOrder = 4; scene.add(labels);
    /* overgrowth tufts on every locked plot; a cleared patch loses its tufts */
    let n = 0;
    for (const h of map.holes) {
      if (S.open.includes(h.ord)) continue;
      for (let i = 1; i < h.line.length; i++) {
        const a = h.line[i - 1], c = h.line[i], l = Math.hypot(c.x - a.x, c.y - a.y), cnt = Math.round(l / 3.2);
        for (let j = 0; j <= cnt && n < 160; j++) {
          const jx = ((n * 37) % 11 - 5) / 5 * d.fairwayHalf * 0.8, px = a.x + (c.x - a.x) * j / cnt, py = a.y + (c.y - a.y) * j / cnt + jx;
          tuftAt[n * 3] = px; tuftAt[n * 3 + 1] = py; tuftAt[n * 3 + 2] = h.ord; n++;
        }
      }
    }
    tuftN = n;
    /* the debug route graph */
    const lp = [];
    for (const ord of ctx.route.open) { const h = ctx.route.holes[ord]; for (let i = 1; i < h.line.length; i++) lp.push(h.line[i - 1].x, 0.3, -h.line[i - 1].y, h.line[i].x, 0.3, -h.line[i].y); }
    for (let i = 0; i < ctx.route.plan.length; i++) { const a = ctx.route.holes[ctx.route.plan[i]], c = ctx.route.holes[ctx.route.plan[(i + 1) % ctx.route.plan.length]]; lp.push(a.green.x, 0.3, -a.green.y, c.wait.x, 0.3, -c.wait.y); }
    lp.push(map.gate.x, 0.3, -map.gate.y, map.queue.x, 0.3, -map.queue.y, map.queue.x, 0.3, -map.queue.y, map.waypoints.toTee[0].x, 0.3, -map.waypoints.toTee[0].y,
      map.waypoints.toTee[0].x, 0.3, -map.waypoints.toTee[0].y, map.waypoints.toTee[1].x, 0.3, -map.waypoints.toTee[1].y);
    routeLines.geometry.dispose(); routeLines.geometry = new THREE.BufferGeometry(); routeLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  }
  const tuftAt = new Float32Array(160 * 3); let tuftN = 0;

  /* ---- where things were a tick ago, for blending ---- */
  const prev = new Float32Array(2 + 2 + 2 + 64 * 2); let prevN = 0;
  function snapshot(S) {
    prev[0] = S.player.x; prev[1] = S.player.y; prev[2] = S.cart.x; prev[3] = S.cart.y; prev[4] = S.mower.x; prev[5] = S.mower.y;
    prevN = Math.min(64, S.groups.length);
    for (let i = 0; i < prevN; i++) { prev[6 + i * 2] = S.groups[i].x; prev[7 + i * 2] = S.groups[i].y; }
  }

  const M = new THREE.Matrix4(), col = new THREE.Color(), cGood = new THREE.Color(C.greenGood), cBad = new THREE.Color(C.greenBad),
    cAccent = new THREE.Color(C.accent), cOk = new THREE.Color(C.ok), cWarn = new THREE.Color(C.warn), cBadc = new THREE.Color(C.bad),
    cSkin = new THREE.Color(C.skin), cWhite = new THREE.Color(0xffffff), cGrey = new THREE.Color(0xb9c2c9), V = new THREE.Vector3();
  const ST = [];

  /* ---- the art: Kenney's CC0 model packs, loaded behind the game ---- */
  let ART = null, lastS = null, lastCtx = null, artGroup = null, buckets = null;
  const TREES = ['tree_default', 'tree_oak', 'tree_detailed', 'tree_fat', 'tree_simple'], PINES = ['tree_pineRoundA', 'tree_pineRoundC', 'tree_pineTallA', 'tree_cone'];
  const BLOOMS = ['flower_redA', 'flower_yellowA', 'flower_purpleA'], ROCKS = ['rock_largeA', 'rock_largeB', 'rock_largeC'], AUTOS = ['sedan', 'suv', 'hatchback-sports', 'van', 'truck'];
  const GOLFERS = ['character-male-a', 'character-female-a', 'character-male-d', 'character-female-c'];
  const CLUBHOUSE = ['building-type-h', 'building-type-a', 'building-type-d', 'building-type-b'];
  const PM = new THREE.Matrix4(), PQ = new THREE.Quaternion(), PP = new THREE.Vector3(), PS = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  function toFloat(g) {
    for (const k of Object.keys(g.attributes)) {
      const a = g.attributes[k];
      if (a.array instanceof Float32Array && !a.isInterleavedBufferAttribute) continue;
      const out = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.getComponent(i, c);
      g.setAttribute(k, new THREE.BufferAttribute(out, a.itemSize));
    }
    return g;
  }
  /* A pack's static models, each flattened to plain geometry in one of a few buckets: one for
     flat colours (baked into the vertices), one for each colour texture. So a whole kit is one draw call. */
  function bakePack(gltf, art, regreen) {
    gltf.scene.updateMatrixWorld(true);
    for (const top of gltf.scene.children) {
      const parts = [], inv = new THREE.Matrix4().copy(top.matrixWorld).invert();
      top.traverse(o => {
        if (!o.isMesh || o.isSkinnedMesh) return;
        const g = toFloat(o.geometry.clone()), m = o.material;
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
        if (!g.attributes.normal) g.computeVertexNormals();
        let key = 'flat';
        if (m.map && g.attributes.uv) {
          key = 'tex:' + m.map.source.uuid;
          m.map.updateMatrix(); g.attributes.uv.applyMatrix3(m.map.matrix);
          if (!art.mats[key]) { const t = m.map.clone(); t.repeat.set(1, 1); t.offset.set(0, 0); t.rotation = 0; t.matrixAutoUpdate = true; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
            art.mats[key] = new THREE.MeshLambertMaterial({ map: t }); }
          for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
        } else {
          const n = g.attributes.position.count, col = new Float32Array(n * 3), c = (m.color || new THREE.Color(1, 1, 1)).clone();
          /* the nature kit's leaves are a cool teal; pull them to this course's greens, keeping light and dark */
          if (regreen && c.g > c.r && c.b > c.r) c.setRGB(c.g * 0.28, c.g * 0.60, c.g * 0.20);
          for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
          g.setAttribute('color', new THREE.BufferAttribute(col, 3));
          for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
        }
        parts.push({ key, geo: g.index ? g.toNonIndexed() : g });
      });
      if (parts.length) art.models[top.name] = parts;
    }
  }
  function loadArt() {
    const loader = new GLTFLoader(), art = { models: {}, mats: { flat: new THREE.MeshLambertMaterial({ vertexColors: true }) }, people: {}, clips: {} };
    const get = n => new Promise((ok, no) => loader.load('models/' + n + '.glb', ok, undefined, no));
    return Promise.all(['nature', 'golf', 'cars', 'town', 'people'].map(get)).then(([nature, golf, cars, town, people]) => {
      bakePack(nature, art, true);
      for (const g of [golf, cars, town]) bakePack(g, art, false);
      /* the people share one skeleton, so the first one's clips play on all of them. The loader made
         each bone name unique with a _N suffix; take it off so the clips find their bones. */
      for (const top of people.scene.children) {
        top.traverse(o => { o.name = o.name.replace(/_\d+$/, ''); if (o.isMesh) { const m = o.material; o.material = new THREE.MeshLambertMaterial({ map: m.map }); if (m.map) { m.map.magFilter = THREE.NearestFilter; m.map.minFilter = THREE.NearestFilter; m.map.generateMipmaps = false; m.map.needsUpdate = true; } o.frustumCulled = false; } });
        art.people[top.name] = top;
      }
      for (const c of people.animations) art.clips[c.name] = c;
      ART = art;
      if (lastS) rebuild(lastS, lastCtx);
      return true;
    }).catch(() => false);
  }
  /* put a model in the world: into its bucket, to be merged when the rebuild ends */
  function place(name, x, y, scale, rot, lift) {
    const parts = ART && ART.models[name];
    if (!parts) return false;
    PM.compose(PP.set(x, lift || 0, -y), PQ.setFromAxisAngle(UP, rot || 0), PS.set(scale, scale, scale));
    for (const part of parts) (buckets[part.key] || (buckets[part.key] = [])).push(part.geo.clone().applyMatrix4(PM));
    return true;
  }

  /* the people: a small pool of rigged characters, each with its own mixer */
  const chars = [], CHAR_MAX = 49, PLAYER_SLOT = 48;
  const ANIM = ['idle', 'walk', 'attack-melee-right', 'sit'];
  function charAt(slot, model) {
    let c = chars[slot];
    if (c && c.model === model) return c;
    if (c) { scene.remove(c.root); c.mixer.stopAllAction(); }
    const src = ART.people[model];
    if (!src) return null;
    const root = cloneRig(src), mixer = new THREE.AnimationMixer(root), actions = ANIM.map(n => (ART.clips[n] ? mixer.clipAction(ART.clips[n]) : null));
    root.scale.setScalar(3.8); root.visible = false; scene.add(root);
    c = chars[slot] = { root, mixer, actions, model, cur: -1, x: 0, y: 0, face: 0, seen: false };
    return c;
  }
  function pose(c, x, y, lift, anim, fx, fy, dt) {
    const dx = fx === fx ? fx - x : x - c.x, dy = fx === fx ? fy - y : y - c.y;
    if (dx * dx + dy * dy > 0.0004) { let want = Math.atan2(dx, -dy), d = want - c.face; while (d > Math.PI) d -= 6.283185; while (d < -Math.PI) d += 6.283185; c.face += d * (c.seen ? 0.3 : 1); }
    c.x = x; c.y = y;
    c.root.position.set(x, lift, -y); c.root.rotation.y = Math.PI - c.face; c.root.visible = true; c.seen = true;
    if (anim !== c.cur) {
      const next = c.actions[anim] || c.actions[0];
      if (c.cur >= 0 && c.actions[c.cur] && c.actions[c.cur] !== next) c.actions[c.cur].fadeOut(0.15);
      if (next) { next.reset().fadeIn(0.15).play(); }
      c.cur = anim;
    }
    c.mixer.update(dt);
  }
  let face = 0, lastTime = 0, frameDt = 0;
  let nRing = 0, nFill = 0, nShadow = 0, nBody = 0, nBall = 0;
  function put(mesh, i, x, y, h, sx, sy, sz, color) { M.makeScale(sx, sy, sz); M.setPosition(x, h, -y); mesh.setMatrixAt(i, M); if (color) mesh.setColorAt(i, color); }
  function ring(x, y, r, color, h) { if (nRing < 48) put(rings, nRing++, x, y, h || 0.09, r, 1, r, color); }
  function fill(x, y, r, color) { if (nFill < 64 && r > 0.01) put(fills, nFill++, x, y, 0.08, r, 1, r, color); }
  function shadow(x, y, r) { if (nShadow < 120) put(shadows, nShadow++, x, y, 0.05, r, 1, r, null); }
  function golfer(key, x, y, h, shirt, squash, anim, fx, fy) {
    if (ART && key < PLAYER_SLOT) {
      const c = charAt(key, GOLFERS[shirt % GOLFERS.length]);
      if (c) { pose(c, x, y, 0, anim, fx, fy, frameDt); shadow(x, y, 0.55); return; }
    }
    if (nBody >= 96) return;
    put(bodies, nBody, x, y, 0.62 * squash + h, 1, squash, 1, SHIRTS[shirt % 6]); put(heads, nBody, x, y, 1.3 * squash + h, 1, 1, 1, cSkin); nBody++;
    shadow(x, y, 0.5);
  }
  function ball(x, y, h) { if (nBall < 96) put(balls, nBall++, x, y, 0.14 + h, 1, 1, 1, cWhite); }
  const lerp = (a, b, t) => a + (b - a) * t;

  function draw(S, ctx, alpha, time, goal, opts) {
    const p = S.player, sh = cfg.shift;
    nRing = nFill = nShadow = nBody = nBall = 0;
    frameDt = Math.min(0.1, Math.max(0, time - lastTime)); lastTime = time;
    for (let i = 0; i < chars.length; i++) if (chars[i]) chars[i].root.visible = false;
    /* the player and the two machines */
    const px = lerp(prev[0], p.x, alpha), py = lerp(prev[1], p.y, alpha);
    const cx = lerp(prev[2], S.cart.x, alpha), cy = lerp(prev[3], S.cart.y, alpha), mx = lerp(prev[4], S.mower.x, alpha), my = lerp(prev[5], S.mower.y, alpha);
    const moving = p.vx * p.vx + p.vy * p.vy > 0.05;
    if (moving) face = Math.atan2(p.vx, -p.vy);                   // the picture's heading only; the sim never sees it
    const bob = moving && p.mode === 'walk' ? Math.abs(Math.sin(time * 11)) * 0.14 : 0;
    const hero = ART ? charAt(PLAYER_SLOT, 'character-worker') : null;
    if (hero) { player.visible = false; hero.face = face; pose(hero, px, py, p.mode === 'walk' ? 0 : 0.5, p.mode !== 'walk' ? 3 : moving ? 1 : 0, NaN, NaN, frameDt); hero.root.rotation.y = Math.PI - face; }
    else { player.visible = true; player.position.set(px, (p.mode === 'walk' ? 0 : 0.55) + bob, -py); player.rotation.y = Math.PI - face; pBody.scale.y = 1 - bob * 0.5; }
    cart.position.set(cx, 0, -cy); mower.position.set(mx, 0, -my);
    if (p.mode === 'cart') { cart.rotation.y = Math.PI - face; cart.rotation.z = Math.sin(time * 9) * 0.02 * (moving ? 1 : 0); }
    if (p.mode === 'mower') { mower.rotation.y = Math.PI - face; mower.position.y = moving ? Math.abs(Math.sin(time * 30)) * 0.04 : 0; }
    shadow(px, py, 0.6); shadow(cx, cy, 1.4); shadow(mx, my, 1.2);

    /* greens: colour is condition; a green being mown shows its ring fill */
    let ng = 0;
    for (const ord of S.open) {
      const gr = ctx.route.holes[ord].green, c = S.greens[ord] / 100;
      col.copy(cBad).lerp(cGood, c);
      put(greens, ng++, gr.x, gr.y, 0.06, map.draw.greenR, 1, map.draw.greenR, col);
      if (S.greens[ord] < 100 && (S.phase === 'dawn' || p.mode === 'mower')) { ring(gr.x, gr.y, map.draw.greenR + 0.35, cAccent); fill(gr.x, gr.y, (map.draw.greenR + 0.3) * Math.min(1, S.mow[ord] / S.fx.mow), cAccent); }
    }
    greens.count = ng;

    /* stand-to-work rings and pads */
    stationsOf(S, ctx, ST);
    for (let i = 0; i < ST.length; i++) {
      const s = ST[i], active = s.can;
      const pulse = active ? 1 + Math.sin(time * 5) * 0.05 : 1;
      ring(s.x, s.y, s.r * pulse, active ? cAccent : cGrey);
      if (s.pad) fill(s.x, s.y, s.r * 0.8, active ? cAccent : cGrey);
      if (S.work.id === s.id) fill(s.x, s.y, s.r * Math.min(1, S.work.t / s.secs), cAccent);
    }
    if (goal && goal.key !== 'park' && goal.key !== 'done') { const r = 1.1 + (time * 1.3 % 1) * 1.2; ring(goal.x, goal.y, r, cWhite, 0.13); }
    if (opts && opts.pin) { const r = 1.3 + (time * 1.6 % 1) * 1.6; ring(opts.pin.x, opts.pin.y, r, cWarn, 0.14); ring(opts.pin.x, opts.pin.y, 2.9, cWarn, 0.14); }

    /* the cart barn going up */
    const barn = S.pads.cart_barn;
    if (barn && barn.st === 'building') {
      const f = 1 - barn.t / cfg.economy.pads.cart_barn.buildS, bp = map.pads.cart_barn;
      scaffold.visible = true; scaffold.scale.y = 0.2 + f * 2.8; scaffold.position.set(bp.x + 1, scaffold.scale.y / 2, -(bp.y + 5.5));
    } else scaffold.visible = false;

    /* overgrowth */
    let nt = 0;
    for (let i = 0; i < tuftN; i++) {
      const x = tuftAt[i * 3], y = tuftAt[i * 3 + 1];
      let gone = false;
      if (S.plot && S.plot.ord === tuftAt[i * 3 + 2]) { if (S.plot.left === 0) gone = true; else for (const q of S.plot.pts) if (q.done && Math.abs(q.x - x) < 3.2 && Math.abs(q.y - y) < 3.6) { gone = true; break; } }
      if (!gone) { const sway = 1 + Math.sin(time * 1.7 + i) * 0.06; put(tufts, nt++, x, y, 0.6, 1, sway, 1, null); }
    }
    tufts.count = nt;

    /* golfers, their patience, their shots */
    for (let i = 0; i < S.groups.length && i < 64; i++) {
      const g = S.groups[i];
      if (g.st === 'sched' || g.st === 'gone') continue;
      const gx = i < prevN ? lerp(prev[6 + i * 2], g.x, alpha) : g.x, gy = i < prevN ? lerp(prev[7 + i * 2], g.y, alpha) : g.y;
      const walking = g.st === 'toQueue' || g.st === 'toTee' || g.st === 'toNext' || g.st === 'leave' || g.st === 'off';
      if (g.st === 'play' && g.shots) {
        const f = Math.min(1, (S.tick + alpha - g.t0) / (g.t1 - g.t0)), h = ctx.route.holes[g.ord], F = 0.76;
        for (let m = 0; m < g.size; m++) {
          const shots = g.shots[m], n = shots.length, shirt = g.look + m;
          if (f >= F || n === 0) {              // on the green: putting
            const a = m / g.size * 6.283 + 0.6, r = 1.2 + (m % 2) * 0.5;
            golfer(i * 4 + m, h.green.x + Math.cos(a) * r, h.green.y + Math.sin(a) * r, 0, shirt, 1, 0, h.green.x, h.green.y);
            const pf = (f - F) / (1 - F), turn = Math.floor(pf * g.size) === m ? (pf * g.size) % 1 : pf * g.size > m ? 1 : 0;
            ball(lerp(h.green.x + Math.cos(a) * (r - 0.5), h.green.x, turn), lerp(h.green.y + Math.sin(a) * (r - 0.5), h.green.y, turn), 0);
            continue;
          }
          const u = f / F * n, j = Math.min(n - 1, Math.floor(u)), t = u - j;
          const ax = j === 0 ? h.tee.x + OFF[m][0] * 0.5 : shots[j - 1].x / k, ay = j === 0 ? h.tee.y + OFF[m][1] * 0.5 : shots[j - 1].y / k;
          const bx = shots[j].x / k, by = shots[j].y / k;
          const swing = t < 0.12 ? 1 - Math.sin(t / 0.12 * Math.PI) * 0.18 : 1;
          if (t < 0.5) { const q = t / 0.5; golfer(i * 4 + m, ax, ay, 0, shirt, swing, t < 0.3 ? 2 : 0, bx, by); ball(lerp(ax, bx, q), lerp(ay, by, q), Math.sin(q * Math.PI) * Math.min(7, Math.hypot(bx - ax, by - ay) * 0.3)); }
          else { const q = (t - 0.5) / 0.5; golfer(i * 4 + m, lerp(ax, bx, q), lerp(ay, by, q), Math.abs(Math.sin(time * 10 + m)) * 0.1, shirt, 1, 1, bx, by); ball(bx, by, 0); }
        }
        continue;
      }
      const sp = ART ? 1.5 : 1;
      for (let m = 0; m < g.size; m++) golfer(i * 4 + m, gx + OFF[m][0] * sp, gy + OFF[m][1] * sp, walking ? Math.abs(Math.sin(time * 10 + m * 1.7)) * 0.12 : 0, g.look + m, 1, walking ? 1 : 0, NaN, NaN);
      /* the patience ring: it empties, and turns from green to red */
      let left = -1;
      if (g.st === 'queue') left = 1 - g.wc / S.fx.patCounter;
      else if (g.st === 'teeWait') left = g.hi === 0 ? 1 - g.wt / S.fx.patTee : 1 - g.wo / S.fx.patCourse;
      if (left >= 0) {
        col.copy(left > 0.5 ? cOk : left > 0.25 ? cWarn : cBadc);
        ring(gx, gy, 1.9, col, 0.11); fill(gx, gy, 1.85 * Math.max(0, left), col);
      }
    }
    for (const m of [rings, fills, shadows, bodies, heads, balls, greens, tufts]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    rings.count = nRing; fills.count = nFill; shadows.count = nShadow; bodies.count = nBody; heads.count = nBody; balls.count = nBall;

    /* light: dawn gold, noon white, dusk orange */
    const total = (sh.dawnS + sh.openS) * sh.tick, d = Math.min(1, S.tick / total);
    if (d < 0.25) sun.color.copy(DAWN).lerp(NOON, d / 0.25); else if (d < 0.7) sun.color.copy(NOON); else sun.color.copy(NOON).lerp(DUSK, (d - 0.7) / 0.3);
    sun.intensity = 1.5 + Math.sin(d * Math.PI) * 0.6;

    /* the camera: soft follow, a little wider when driving */
    const over = opts && opts.overview;
    const want = over ? 54 : p.mode === 'walk' ? 14 : 18;
    zoom += (want - zoom) * (over || zoom > 30 ? 0.14 : 0.05);
    const lead = opts && opts.snap ? 1 : 0.1;
    const tx = over ? 2 : clampv(px + p.vx * 0.5, map.bounds.x0 + 8, map.bounds.x1 - 8), ty = over ? 26 : clampv(py + p.vy * 0.5 + 3, map.bounds.y0 + 8, map.bounds.y1 - 8);
    target.x += (tx - target.x) * (over ? 0.14 : lead); target.z += (-ty - target.z) * (over ? 0.14 : lead);
    const asp = viewW / viewH, halfH = asp < 1 ? zoom * 0.88 / asp : zoom * 1.05, halfW = halfH * asp;
    cam.left = -halfW; cam.right = halfW; cam.top = halfH; cam.bottom = -halfH;
    cam.position.copy(target).add(camOff); cam.lookAt(target); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    routeLines.visible = !!(opts && opts.route);
    renderer.render(scene, cam);
  }
  const clampv = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* stations() lives in the sim; the renderer is handed it so this file imports nothing from the game */
  let stationsOf = () => [], looksOf = () => ({});
  function resize(w, h, ratio) { viewW = w; viewH = h; dpr = ratio; renderer.setPixelRatio(ratio); renderer.setSize(w, h, false); }
  const ray = new THREE.Vector3(), dir = new THREE.Vector3();
  function pick(sx, sy, out) {
    ray.set(sx / viewW * 2 - 1, -(sy / viewH) * 2 + 1, -1).unproject(cam);
    cam.getWorldDirection(dir);
    const t = -ray.y / dir.y;
    out.x = ray.x + dir.x * t; out.y = -(ray.z + dir.z * t);
    return out;
  }
  function project(x, y, out) { V.set(x, 1.5, -y).project(cam); out.x = (V.x + 1) / 2 * viewW; out.y = (1 - V.y) / 2 * viewH; return out; }
  const artReady = loadArt();
  return { rebuild, snapshot, draw, resize, pick, project, artReady,
    setHelpers(st, lk) { stationsOf = st; looksOf = lk; },
    info() { return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, dpr }; },
    lost(fn) { canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); fn(); }); } };
}
