/* Rigid gear built in the browser: the bat, the batting helmet, caps, the catcher's helmet and
   mask, the umpire's mask, the mitt. Each is modelled facing +z (the way a body faces in its bind
   pose), sized in metres, and fitted to a head or hand box at load. */
import * as THREE from 'three';

const IN = 0.0254;

export function bat(woodMap) {
  // a 34 inch maple bat: knob, 0.95 in handle, taper, 2.6 in barrel, cupped end
  const prof = [[0, 0], [0.62, 0], [0.66, 0.15], [0.56, 0.32], [0.47, 0.42], [0.47, 9], [0.5, 13], [0.62, 17], [0.9, 21], [1.18, 24],
    [1.28, 27], [1.3, 31], [1.3, 33.4], [1.2, 33.85], [0.9, 34], [0, 34]].map(([r, y]) => new THREE.Vector2(r * IN, y * IN));
  const g = new THREE.LatheGeometry(prof, 24);
  const m = new THREE.MeshPhysicalMaterial({ color: 0xc89a62, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.25, map: woodMap ?? null });
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true;
  // a darker barrel end and a grip wrap, as colour on the geometry
  const col = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < g.attributes.position.count; i++) {
    const y = g.attributes.position.getY(i) / IN;
    const c = y < 0.5 ? 0.25 : y < 9 ? 0.28 : y > 28 ? 0.62 : 1.0;
    col[i * 3] = c; col[i * 3 + 1] = c * (y < 9 ? 0.95 : 1); col[i * 3 + 2] = c * (y < 9 ? 0.95 : 1);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  m.vertexColors = true;
  return mesh;
}

function shell(rx, ry, rz, thetaMax, mat, phi0 = 0, phiLen = Math.PI * 2, seg = 40) {
  const g = new THREE.SphereGeometry(1, seg, 20, phi0, phiLen, 0, thetaMax);
  g.scale(rx, ry, rz);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/** A shell over the skull whose lower edge follows edge(phi) (polar angle, radians, phi 0 = front).
    Vertices below the edge are pulled up onto it. */
function skullShell(rx, ry, rz, edge, mat, seg = 48) {
  const g = new THREE.SphereGeometry(1, seg, 28, 0, Math.PI * 2, 0, Math.PI * 0.86);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const phi = Math.atan2(x, z), th = Math.acos(THREE.MathUtils.clamp(y, -1, 1));
    const tmax = edge(phi);
    const t2 = Math.min(th, tmax);
    const r = Math.sin(t2);
    const h = Math.hypot(x, z) || 1e-6;
    p.setXYZ(i, (x / h) * r * rx, Math.cos(t2) * ry, (z / h) * r * rz);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/** Batting helmet: a hard glossy shell with vent holes over the crown, a short stiff bill, one ear
    flap on the side toward the pitcher (flapSide -1 = the wearer's right: a left handed batter's
    front ear), with its ear hole, and, when jaw is set, the jaw guard that some hitters wear on the
    flap. Matte black padding inside. Modelled for a 0.155 m wide head, facing +z. */
export function battingHelmet(color, flapSide, opts = {}) {
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.9 });
  const g = new THREE.Group();
  const D = Math.PI / 180;
  const RX = 0.106, RY = 0.112, RZ = 0.124;
  const flapAt = (phi) => (flapSide < 0 ? phi < 0 : phi > 0);
  // the lower edge: brow at the front, over the ears, low at the back of the skull; the flap side
  // comes down over the ear to the jaw hinge, the other side is cut out round the ear
  const edge = (phi) => {
    const a = Math.abs(phi);
    let t = 78 * D + (a / Math.PI) * 42 * D;                 // 78 deg at the brow, 120 at the back
    const ear = Math.exp(-Math.pow((a - 95 * D) / (30 * D), 2));
    if (flapAt(phi)) t += ear * 38 * D; else t -= ear * 6 * D;
    return t;
  };
  g.add(skullShell(RX, RY, RZ, edge, mat));
  g.add(skullShell(RX - 0.007, RY - 0.007, RZ - 0.007, (phi) => edge(phi) - 0.02, new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95, side: THREE.BackSide })));
  const onShell = (phi, th, k = 1.0) => new THREE.Vector3(Math.sin(phi) * Math.sin(th) * RX * k, Math.cos(th) * RY * k, Math.cos(phi) * Math.sin(th) * RZ * k);
  // vents: dark slots sunk into the crown (two over the brow, two behind, one each side at the back)
  // each a dark slot lying on the shell, long along the crown's front to back line
  for (const [phDeg, thDeg, len, wid] of [[-14, 24, 0.034, 0.008], [14, 24, 0.034, 0.008], [-22, 58, 0.03, 0.007], [22, 58, 0.03, 0.007], [-160, 52, 0.026, 0.007], [160, 52, 0.026, 0.007]]) {
    const ph = phDeg * D, th = thDeg * D;
    const at = onShell(ph, th, 1.002), ahead = onShell(ph, th - 0.05, 1.002);
    const n = at.clone().normalize(), along = ahead.sub(at).normalize();
    const side = new THREE.Vector3().crossVectors(n, along).normalize();
    const v = new THREE.Mesh(new THREE.CircleGeometry(1, 16), dark);
    v.matrix.makeBasis(side.multiplyScalar(wid / 2), along.multiplyScalar(len / 2), n).setPosition(at);
    v.matrixAutoUpdate = false;
    g.add(v);
  }
  // the ear hole in the flap, and the flap's rubber edge
  const earPhi = (flapSide < 0 ? -1 : 1) * 95 * D;
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.01, 16), dark);
  const hp = onShell(earPhi, 106 * D, 1.004);
  hole.position.copy(hp); hole.lookAt(hp.clone().add(new THREE.Vector3(Math.sin(earPhi), 0, Math.cos(earPhi)))); g.add(hole);
  // the bill: short, stiff, a little down
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const phi = (-52 + (104 * i) / 20) * D;
    const th = edge(phi);
    const r = Math.sin(th);
    const base = new THREE.Vector3(Math.sin(phi) * r * RX, Math.cos(th) * RY, Math.cos(phi) * r * RZ);
    const out = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi)).multiplyScalar(0.05 * Math.cos(phi * 0.9));
    pts.push([base, base.clone().add(out).add(new THREE.Vector3(0, -0.012 * Math.cos(phi), 0))]);
  }
  g.add(strip(pts, mat));
  if (opts.jaw) {
    // the jaw guard: a band from the flap's lower front edge forward along the jaw toward the chin
    const sx = flapSide < 0 ? -1 : 1, jp = [];
    for (let i = 0; i <= 14; i++) {
      const k = i / 14;
      const x = sx * (0.098 - 0.05 * k * k), y = -0.075 - 0.035 * k, z = 0.02 + 0.105 * k;
      jp.push([new THREE.Vector3(x, y + 0.022, z), new THREE.Vector3(x * 0.99, y - 0.012, z)]);
    }
    g.add(strip(jp, mat));
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** A band of quads between pairs of points (a bill, a guard), double sided. */
function strip(pts, mat) {
  const pos = [], idx = [];
  for (const [a, b] of pts) pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
  for (let i = 0; i < pts.length - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setIndex(idx); bg.computeVertexNormals();
  const m2 = mat.clone(); m2.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(bg, m2);
  mesh.castShadow = true;
  return mesh;
}

/** A ball cap: a six panel crown (higher at the front), a curved brim. Modelled for a 0.155 m wide
    head, facing +z. */
export function cap(color, opts = {}) {
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.85, sheen: 1, sheenRoughness: 0.7, sheenColor: new THREE.Color(color).multiplyScalar(0.5) });
  const g = new THREE.Group();
  const D = Math.PI / 180;
  const edge = (phi) => 92 * D + (Math.abs(phi) / Math.PI) * 14 * D;   // a level band round the head
  const crown = skullShell(0.09, 0.086, 0.105, edge, mat, 48);
  // the front panels stand up a little
  const p = crown.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) { const z = p.getZ(i), y = p.getY(i); if (z > 0 && y > 0) p.setY(i, y + z * 0.22 * (y / 0.086)); }
  crown.geometry.computeVertexNormals();
  g.add(crown);
  // seams: thin dark lines are too fine to model; a button on top
  const button = new THREE.Mesh(new THREE.SphereGeometry(0.007, 10, 6), mat);
  button.position.y = 0.087; g.add(button);
  // the brim: from the crown's front edge out 7 cm, curved down at its sides
  const pts = [];
  const yb = Math.cos(edge(0)) * 0.086;
  for (let i = 0; i <= 24; i++) {
    const phi = (-75 + (150 * i) / 24) * D;
    const th = edge(phi), r = Math.sin(th);
    const base = new THREE.Vector3(Math.sin(phi) * r * 0.09, yb, Math.cos(phi) * r * 0.105);
    const reach = 0.075 * Math.pow(Math.cos(phi * 1.05), 1.2);
    const out = new THREE.Vector3(Math.sin(phi) * 0.4, 0, Math.cos(phi)).normalize().multiplyScalar(reach);
    const droop = -0.03 * Math.pow(Math.abs(Math.sin(phi)), 1.3) - (opts.brimTilt ?? 0.15) * reach;
    pts.push([base, base.clone().add(out).add(new THREE.Vector3(0, droop, 0))]);
  }
  const pos = [], idx = [];
  for (const [aa, bb] of pts) pos.push(aa.x, aa.y, aa.z, bb.x, bb.y, bb.z);
  for (let i = 0; i < pts.length - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setIndex(idx); bg.computeVertexNormals();
  const brim = new THREE.Mesh(bg, new THREE.MeshPhysicalMaterial({ color, roughness: 0.8, side: THREE.DoubleSide, sheen: 1, sheenRoughness: 0.7, sheenColor: new THREE.Color(color).multiplyScalar(0.5) }));
  brim.castShadow = true; brim.receiveShadow = true;
  g.add(brim);
  // a thicker underside so the brim is not paper
  const under = brim.clone(); under.position.y = -0.004; under.material = new THREE.MeshStandardMaterial({ color: 0x1a2228, roughness: 0.9, side: THREE.DoubleSide });
  g.add(under);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** The cage of a mask: thin bars on a curved front, as geometry (it shows at any distance). */
function cage(mat, w = 0.085, h = 0.12, depth = 0.05, r = 0.0045) {
  const g = new THREE.Group();
  const curve = (y) => new THREE.CatmullRomCurve3([-1, -0.5, 0, 0.5, 1].map((s) => new THREE.Vector3(s * w, y, depth * (1 - s * s * 0.9))));
  for (const y of [-h * 0.55, -h * 0.32, -h * 0.1, h * 0.1, h * 0.3]) g.add(new THREE.Mesh(new THREE.TubeGeometry(curve(y), 12, r, 5), mat));
  for (const s of [-0.55, -0.18, 0.18, 0.55]) {
    const c = new THREE.LineCurve3(new THREE.Vector3(s * w, -h * 0.6, depth * (1 - s * s * 0.9) - 0.006), new THREE.Vector3(s * w * 1.05, h * 0.35, depth * (1 - s * s * 0.9)));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(c, 2, r, 5), mat));
  }
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

/** Catcher's hockey style helmet and mask, one piece: a shell from the brow over the back of the
    head to the nape, the cage over the face, a throat guard. Modelled for a 0.155 m wide head. */
export function catcherHelmet(color) {
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.15 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.45, metalness: 0.6 });
  const g = new THREE.Group();
  const D = Math.PI / 180;
  // open at the face: the edge rises to the brow at the front, wraps the cheeks, low at the nape
  const edge = (phi) => {
    const a = Math.abs(phi);
    if (a < 52 * D) return 52 * D;                         // the face opening
    return Math.min(132 * D, 52 * D + (a - 52 * D) * 1.3);
  };
  g.add(skullShell(0.115, 0.124, 0.126, edge, mat));
  g.add(skullShell(0.108, 0.117, 0.119, (p) => edge(p) - 0.02, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95, side: THREE.BackSide })));
  const m = cage(metal, 0.092, 0.16, 0.065, 0.0055);
  m.position.set(0, -0.04, 0.068);
  g.add(m);
  const chin = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 6, 20, Math.PI), mat);
  chin.rotation.set(Math.PI / 2 + 0.3, 0, Math.PI); chin.position.set(0, -0.14, 0.04); chin.scale.set(1, 1.2, 1);
  g.add(chin);
  const tg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.07, 10, 1, true, -Math.PI / 2, Math.PI), metal);
  tg.position.set(0, -0.19, 0.08); tg.rotation.x = -0.25; g.add(tg);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return g;
}

/** A catcher's shin guard: a hard front shell from instep to knee with a knee cup. Built along +y
    (ankle at 0, knee at len), its front toward +z. */
export function shinGuard(color, len) {
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.2, side: THREE.DoubleSide });
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.048, len * 0.9, 20, 6, true, -Math.PI * 0.6, Math.PI * 1.2), mat);
  shell.rotation.y = Math.PI / 2;   // the open side to the back
  shell.position.y = len * 0.5;
  g.add(shell);
  const knee = new THREE.Mesh(new THREE.SphereGeometry(0.075, 18, 12, 0, Math.PI, 0, Math.PI), mat);
  knee.position.set(0, len * 0.98, 0.012); knee.scale.set(1, 1.1, 0.8);
  g.add(knee);
  const saver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.11), new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.8 }));
  saver.position.set(0, len * 0.86, -0.1); g.add(saver);
  const instep = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 8, 0, Math.PI, 0, Math.PI * 0.5), mat);
  instep.rotation.x = Math.PI / 2; instep.position.set(0, 0.0, 0.03); instep.scale.set(1, 1.3, 0.6);
  g.add(instep);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/** A chest protector: a padded shield, curved around the chest, its top under the chin. Front +z. */
export function chestProtector(color, w = 0.38, h = 0.56) {
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, sheen: 0.4, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x333333) });
  const shape = new THREE.Shape();
  shape.moveTo(-w * 0.32, h * 0.5); shape.quadraticCurveTo(0, h * 0.42, w * 0.32, h * 0.5);
  shape.lineTo(w * 0.5, h * 0.3); shape.lineTo(w * 0.46, -h * 0.4);
  shape.quadraticCurveTo(0, -h * 0.56, -w * 0.46, -h * 0.4); shape.lineTo(-w * 0.5, h * 0.3); shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.018, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 3, curveSegments: 12 });
  // wrap it round the chest (z falls off with x) and quilt it in horizontal pads (a ripple in z)
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, p.getZ(i) - (x * x) * 2.6 + Math.abs(Math.sin((y / h) * Math.PI * 5)) * 0.008);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = true;
  const g = new THREE.Group(); g.add(m);
  // shoulder caps
  for (const sx of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mat);
    cap.scale.set(1, 0.55, 1.1); cap.position.set(sx * w * 0.5, h * 0.42, -0.05); cap.rotation.z = -sx * 0.5;
    cap.castShadow = true; g.add(cap);
  }
  return g;
}

/** The umpire's traditional mask: a black wire cage on a frame, tan leather pads round the face and
    a chin pad, the harness over the head. Worn under his cap. Facing +z. */
export function umpireMask() {
  const metal = new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.5, metalness: 0.5 });
  const pad = new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.8 });
  const strap = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  const g = new THREE.Group();
  const m = cage(metal, 0.08, 0.125, 0.05);
  m.position.set(0, -0.05, 0.085);
  g.add(m);
  // the frame: a loop round the cage's edge
  const frame = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 28), metal);
  frame.scale.set(0.082, 0.095, 0.08); frame.position.set(0, -0.05, 0.1); g.add(frame);
  // pads: a horseshoe of leather inside the frame, a chin pad below
  const p = new THREE.Mesh(new THREE.TorusGeometry(1, 0.17, 8, 24, Math.PI * 1.6), pad);
  p.rotation.z = -Math.PI * 0.3 - Math.PI / 2; p.scale.set(0.07, 0.085, 0.05); p.position.set(0, -0.045, 0.078); g.add(p);
  const chin = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), pad);
  chin.scale.set(0.045, 0.02, 0.025); chin.position.set(0, -0.135, 0.075); g.add(chin);
  // the harness: straps from the frame's sides back over the head
  for (const sx of [-1, 1]) {
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(sx * 0.082, -0.02, 0.07), new THREE.Vector3(sx * 0.1, 0.01, 0.0), new THREE.Vector3(sx * 0.085, 0.03, -0.08)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(c, 8, 0.008, 4), strap));
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** A catcher's mitt: a round pillow with a deep pocket and a rolled rim, wider at the top.
    Pocket faces +z, fingers toward +y. Leather maps from Poly Haven. */
export function mitt(leatherMap, leatherNormal) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.55, map: leatherMap ?? null, normalMap: leatherNormal ?? null, vertexColors: true });
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(1, 36, 24);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r2 = x * x + y * y;
    // wider at the top (the finger end), a flat back, a pocket pressed into the front
    x *= 1 + 0.18 * y;
    if (z > 0) z -= 0.75 * Math.max(0, 1 - r2 * 1.25) * z;
    if (z < 0) z *= 0.6;
    pos.setXYZ(i, x * 0.14, y * 0.15, z * 0.075);
    // the pocket darker, the rim lighter
    const c = z > 0 && r2 < 0.62 ? 0.58 : 1.0;
    col[i * 3] = c; col[i * 3 + 1] = c * 0.95; col[i * 3 + 2] = c * 0.9;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, mat));
  // lacing along the rim
  const lace = new THREE.Mesh(new THREE.TorusGeometry(0.128, 0.006, 6, 48), new THREE.MeshStandardMaterial({ color: 0x3a2412, roughness: 0.7 }));
  lace.scale.set(1.05, 1.08, 1); lace.position.z = 0.02; g.add(lace);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function baseball() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#f2efe6'; x.fillRect(0, 0, 512, 256);
  // the seam: the classic two lobe curve, with stitches
  x.strokeStyle = '#c4262e'; x.lineWidth = 3;
  const seam = (u) => { const t = u * Math.PI * 2; return [u * 512, 128 + 70 * Math.sin(2 * t) * Math.cos(t * 0.0) ]; };
  for (let i = 0; i < 108; i++) {
    const u = i / 108;
    const [px, py] = seam(u);
    const [qx, qy] = seam(u + 0.002);
    const ang = Math.atan2(qy - py, qx - px) + Math.PI / 2;
    x.beginPath(); x.moveTo(px - Math.cos(ang + 0.5) * 7, py - Math.sin(ang + 0.5) * 7); x.lineTo(px + Math.cos(ang - 0.5) * 7, py + Math.sin(ang - 0.5) * 7); x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.SphereGeometry(1.45 * IN, 24, 16), new THREE.MeshStandardMaterial({ map: t, roughness: 0.55 }));
  m.castShadow = true;
  return m;
}
