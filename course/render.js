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
 * World x is east and y is north; three's X is x and Z is minus y. */
import * as THREE from '/assets/vendor/three-0.180.0/three.module.min.js';

const C = {
  rough: 0x6fae4f, fairA: 0x8ccb5e, fairB: 0x7fbf54, tee: 0x5a9c40, greenGood: 0xb2e56f, greenBad: 0x93a05a,
  wild: 0x4c7838, tuft: 0x3b6630, raw: 0x9a9a5c, road: 0x6b6f76, path: 0xdccfb2, sand: 0xe8d7a0,
  white: 0xf7f5ee, roof: 0x3b4a5a, wood: 0x9a6b3f, trunk: 0x7a5a3a, leaf: 0x3f8f45, leaf2: 0x4fa352,
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
  renderer.setClearColor(0x8fcf6a);
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
    for (const st of stationsOf(S, ctx, [], true)) if (st.pad && st.label) add(st.label, st.x, st.y - 3.6, 7.5, false, st.st === 'max');
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
  function rebuild(S, ctx) {
    if (world) { scene.remove(world); world.geometry.dispose(); }
    if (labels) { scene.remove(labels); labels.geometry.dispose(); labels.material.map.dispose(); labels.material.dispose(); }
    const B = new Batch(), b = map.bounds, d = map.draw;
    B.rect((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, b.x1 - b.x0 + 120, b.y1 - b.y0 + 120, 0, C.rough);
    /* the back nine tract and the road */
    const bn = map.backNine;
    B.rect((bn.x0 + bn.x1) / 2, (bn.y0 + bn.y1) / 2, bn.x1 - bn.x0, bn.y1 - bn.y0, 0.01, C.raw);
    B.rect(map.road.x, (b.y0 + b.y1) / 2, map.road.w, b.y1 - b.y0 + 120, 0.02, C.road);
    for (let y = b.y0; y <= b.y1; y += 6) { B.cyl(map.road.x - 4, y, 0.16, 0.16, 0, 1.3, C.wood, 5); B.cyl(bn.x0, y, 0.16, 0.16, 0, 1.3, C.wood, 5); }
    B.rect(map.range.x, map.range.y, map.range.w, map.range.d, 0.012, C.wild);
    /* cart paths: shop to tee 1, and green to next tee all the way round */
    const path = [map.gate, map.shopExit, map.queue, map.waypoints.toTee[0], map.waypoints.toTee[1], map.holes[0].line[0]];
    B.strip(path, 0.6, 0.03, C.path, C.path, 1);
    for (let i = 0; i < map.holes.length; i++) {
      const a = map.holes[i].line, nx = map.holes[(i + 1) % map.holes.length].line[0];
      B.strip([a[a.length - 1], nx], 0.5, 0.03, C.path, C.path, 1);
    }
    /* holes: turf for the open ones, overgrowth and rope for the rest */
    for (const h of map.holes) {
      const open = S.open.includes(h.ord), tee = h.line[0], gr = h.line[h.line.length - 1];
      if (open) {
        B.strip(h.line, d.fairwayHalf, 0.04, C.fairA, C.fairB);
        B.rect(tee.x, tee.y, d.teeR * 2, d.teeR * 2, 0.06, C.tee);
        B.cyl(gr.x, gr.y, 0.05, 0.05, 0, 2.4, C.white, 5);
        B.tri(gr.x, 2.4, -gr.y, gr.x + 1.1, 2.1, -gr.y, gr.x, 1.8, -gr.y, C.accent);
      } else {
        B.strip(h.line, d.fairwayHalf + 0.8, 0.035, C.wild, C.wild, 1);
        for (let i = 1; i < h.line.length; i++) {
          const a = h.line[i - 1], c = h.line[i], l = Math.hypot(c.x - a.x, c.y - a.y), nx = -(c.y - a.y) / l, ny = (c.x - a.x) / l, n = Math.round(l / 5);
          for (let j = 0; j <= n; j++) for (const s of [-1, 1]) {
            const px = a.x + (c.x - a.x) * j / n + nx * s * (d.fairwayHalf + 1.6), py = a.y + (c.y - a.y) * j / n + ny * s * (d.fairwayHalf + 1.6);
            B.cyl(px, py, 0.12, 0.12, 0, 1.0, C.rope, 5);
          }
        }
        B.cyl(tee.x + 2.5, tee.y - 1.5, 0.12, 0.12, 0, 1.7, C.wood, 5);
      }
    }
    /* buildings */
    const ch = map.clubhouse, sh = map.shed;
    B.box(ch.x, ch.y, ch.w, ch.d, 0, ch.h, C.white, C.roof);
    B.box(ch.x, ch.y, ch.w + 1, ch.d + 1, ch.h, 0.4, C.roof);
    B.box(map.counter.x, ch.y - ch.d / 2 - 0.6, 4.2, 1.1, 0, 1.2, C.wood, C.sand);
    B.box(map.counter.x, ch.y - ch.d / 2 - 0.9, 4.8, 1.9, 2.6, 0.2, C.accent);
    B.box(sh.x, sh.y, sh.w, sh.d, 0, sh.h, C.wood, C.roof);
    if (S.pads.cart_barn && S.pads.cart_barn.st === 'done') { const p = map.pads.cart_barn; B.box(p.x + 1, p.y + 5.5, 7, 5, 0, 3, C.white, C.accentDark); B.box(p.x + 1, p.y + 3.2, 3, 0.4, 0, 2.2, C.dark); }
    B.cyl(map.backNine.sign.x - 5.5, map.backNine.sign.y, 0.15, 0.15, 0, 1.7, C.wood, 5);
    B.rect(map.snackShack.x, map.snackShack.y, 5, 4, 0.03, C.path);
    for (let i = 0; i < map.trees.length; i++) {
      const [x, y] = map.trees[i], s = 0.9 + (i % 4) * 0.12;
      B.cyl(x, y, 0.3, 0.25, 0, 1.4 * s, C.trunk, 6); B.cyl(x, y, 1.9 * s, 0.9 * s, 1.2 * s, 1.6 * s, i % 2 ? C.leaf : C.leaf2, 7); B.cyl(x, y, 1.2 * s, 0, 2.7 * s, 1.5 * s, i % 2 ? C.leaf2 : C.leaf, 7);
    }
    world = B.mesh(worldMat); world.frustumCulled = false; scene.add(world);
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
  let face = 0;
  let nRing = 0, nFill = 0, nShadow = 0, nBody = 0, nBall = 0;
  function put(mesh, i, x, y, h, sx, sy, sz, color) { M.makeScale(sx, sy, sz); M.setPosition(x, h, -y); mesh.setMatrixAt(i, M); if (color) mesh.setColorAt(i, color); }
  function ring(x, y, r, color, h) { if (nRing < 48) put(rings, nRing++, x, y, h || 0.09, r, 1, r, color); }
  function fill(x, y, r, color) { if (nFill < 64 && r > 0.01) put(fills, nFill++, x, y, 0.08, r, 1, r, color); }
  function shadow(x, y, r) { if (nShadow < 120) put(shadows, nShadow++, x, y, 0.05, r, 1, r, null); }
  function golfer(x, y, h, shirt, squash) {
    if (nBody >= 96) return;
    put(bodies, nBody, x, y, 0.62 * squash + h, 1, squash, 1, shirt); put(heads, nBody, x, y, 1.3 * squash + h, 1, 1, 1, cSkin); nBody++;
    shadow(x, y, 0.5);
  }
  function ball(x, y, h) { if (nBall < 96) put(balls, nBall++, x, y, 0.14 + h, 1, 1, 1, cWhite); }
  const lerp = (a, b, t) => a + (b - a) * t;

  function draw(S, ctx, alpha, time, goal, opts) {
    const p = S.player, sh = cfg.shift;
    nRing = nFill = nShadow = nBody = nBall = 0;
    /* the player and the two machines */
    const px = lerp(prev[0], p.x, alpha), py = lerp(prev[1], p.y, alpha);
    const cx = lerp(prev[2], S.cart.x, alpha), cy = lerp(prev[3], S.cart.y, alpha), mx = lerp(prev[4], S.mower.x, alpha), my = lerp(prev[5], S.mower.y, alpha);
    const moving = p.vx * p.vx + p.vy * p.vy > 0.05;
    if (moving) face = Math.atan2(p.vx, -p.vy);                   // the picture's heading only; the sim never sees it
    const bob = moving && p.mode === 'walk' ? Math.abs(Math.sin(time * 11)) * 0.14 : 0;
    player.position.set(px, (p.mode === 'walk' ? 0 : 0.55) + bob, -py); player.rotation.y = Math.PI - face;
    pBody.scale.y = 1 - bob * 0.5;
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
      if (s.pad && s.st !== 'max') fill(s.x, s.y, s.r * 0.8, active ? cAccent : cGrey);
      if (S.work.id === s.id) fill(s.x, s.y, s.r * Math.min(1, S.work.t / s.secs), cAccent);
    }
    if (goal && goal.key !== 'park' && goal.key !== 'done') { const r = 1.1 + (time * 1.3 % 1) * 1.2; ring(goal.x, goal.y, r, cWhite, 0.13); }

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
          const shots = g.shots[m], n = shots.length, shirt = SHIRTS[(g.look + m) % 6];
          if (f >= F || n === 0) {              // on the green: putting
            const a = m / g.size * 6.283 + 0.6, r = 1.2 + (m % 2) * 0.5;
            golfer(h.green.x + Math.cos(a) * r, h.green.y + Math.sin(a) * r, 0, shirt, 1);
            const pf = (f - F) / (1 - F), turn = Math.floor(pf * g.size) === m ? (pf * g.size) % 1 : pf * g.size > m ? 1 : 0;
            ball(lerp(h.green.x + Math.cos(a) * (r - 0.5), h.green.x, turn), lerp(h.green.y + Math.sin(a) * (r - 0.5), h.green.y, turn), 0);
            continue;
          }
          const u = f / F * n, j = Math.min(n - 1, Math.floor(u)), t = u - j;
          const ax = j === 0 ? h.tee.x + OFF[m][0] * 0.5 : shots[j - 1].x / k, ay = j === 0 ? h.tee.y + OFF[m][1] * 0.5 : shots[j - 1].y / k;
          const bx = shots[j].x / k, by = shots[j].y / k;
          const swing = t < 0.12 ? 1 - Math.sin(t / 0.12 * Math.PI) * 0.18 : 1;
          if (t < 0.5) { const q = t / 0.5; golfer(ax, ay, 0, shirt, swing); ball(lerp(ax, bx, q), lerp(ay, by, q), Math.sin(q * Math.PI) * Math.min(7, Math.hypot(bx - ax, by - ay) * 0.3)); }
          else { const q = (t - 0.5) / 0.5; golfer(lerp(ax, bx, q), lerp(ay, by, q), Math.abs(Math.sin(time * 10 + m)) * 0.1, shirt, 1); ball(bx, by, 0); }
        }
        continue;
      }
      for (let m = 0; m < g.size; m++) golfer(gx + OFF[m][0], gy + OFF[m][1], walking ? Math.abs(Math.sin(time * 10 + m * 1.7)) * 0.12 : 0, SHIRTS[(g.look + m) % 6], 1);
      /* the patience ring: it empties, and turns from green to red */
      let left = -1;
      if (g.st === 'queue') left = 1 - g.wc / S.fx.patCounter;
      else if (g.st === 'teeWait') left = g.hi === 0 ? 1 - g.wt / S.fx.patTee : 1 - g.wo / cfg.golfers.patience.course;
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
    const want = p.mode === 'walk' ? 14 : 18;
    zoom += (want - zoom) * 0.05;
    const lead = opts && opts.snap ? 1 : 0.1;
    target.x += (clampv(px + p.vx * 0.5, map.bounds.x0 + 8, map.bounds.x1 - 8) - target.x) * lead;
    target.z += (-clampv(py + p.vy * 0.5 + 3, map.bounds.y0 + 8, map.bounds.y1 - 8) - target.z) * lead;
    const asp = viewW / viewH, halfH = asp < 1 ? zoom * 0.88 / asp : zoom * 1.05, halfW = halfH * asp;
    cam.left = -halfW; cam.right = halfW; cam.top = halfH; cam.bottom = -halfH;
    cam.position.copy(target).add(camOff); cam.lookAt(target); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    routeLines.visible = !!(opts && opts.route);
    renderer.render(scene, cam);
  }
  const clampv = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* stations() lives in the sim; the renderer is handed it so this file imports nothing from the game */
  let stationsOf = () => [];
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
  return { rebuild, snapshot, draw, resize, pick, project,
    setStations(fn) { stationsOf = fn; },
    info() { return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, dpr }; },
    lost(fn) { canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); fn(); }); } };
}
