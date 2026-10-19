/* Rigid gear built in the browser: the bat, the catcher's shin guards and chest protector, the
   mitt, the ball. Each is modelled facing +z (the way a body faces in its bind pose), sized in
   metres. The headgear is built for each head in headgear.js. */
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
