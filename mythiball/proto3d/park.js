/* MythiBall 3D prototype: the ballpark.

   A backyard-sized park on purpose. Real bases are 90 feet apart and at this
   render size a fielder in center would be three pixels tall; MythiBall's
   own world is compressed the same way, and so is every arcade baseball
   game. Bases are 50 feet, the mound 36, the fence about 140.

   Everything is built once. The crowd is one instanced mesh (one draw call
   for about a thousand fans) and the lines and dirt are flat meshes laid a
   hair above the grass, so nothing here costs per frame. */
import * as THREE from './vendor/three-0.180.0/three.module.min.js';
import { toon } from './rig.js?v=1';

export const FIELD = { base: 50, mound: 36, fence: 142 };
const BD = FIELD.base / Math.SQRT2;
export const BASES = { home: new THREE.Vector3(0, 0, 0), first: new THREE.Vector3(BD, 0, -BD), second: new THREE.Vector3(0, 0, -2 * BD), third: new THREE.Vector3(-BD, 0, -BD) };
export const MOUND = new THREE.Vector3(0, 0, -FIELD.mound);

function flat(geo, color, y, opts = {}) {
  const m = new THREE.Mesh(geo, opts.basic ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color }));
  m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true; return m;
}
function noiseTex(c1, c2, size = 64, stripe = 0) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size; const g = cv.getContext('2d');
  g.fillStyle = c1; g.fillRect(0, 0, size, size);
  if (stripe) { g.fillStyle = c2; for (let y = 0; y < size; y += stripe * 2) g.fillRect(0, y, size, stripe); }
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < size * size * 0.18; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)'; g.fillRect(rnd() * size | 0, rnd() * size | 0, 1, 1); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* Everything above is a few dozen small meshes that never move. Merged in
   world space, one mesh per material, they cost a draw call each instead of
   one per piece. The crowd and the stand steps are already instanced. */
function mergeStatic(g) {
  g.updateMatrixWorld(true);
  const groups = new Map(), drop = [];
  g.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    const key = o.material.uuid + (o.castShadow ? 's' : '') + (o.receiveShadow ? 'r' : '');
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(o);
  });
  const v = new THREE.Vector3(), n = new THREE.Vector3(), N = new THREE.Matrix3();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const pos = [], nor = [], uv = [], col = [], idx = []; let vo = 0;
    const hasCol = list.every((m) => m.geometry.attributes.color);
    for (const m of list) {
      const geo = m.geometry, P = geo.attributes.position, Nn = geo.attributes.normal, U = geo.attributes.uv, C = geo.attributes.color;
      N.getNormalMatrix(m.matrixWorld);
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld); pos.push(v.x, v.y, v.z);
        if (Nn) { n.fromBufferAttribute(Nn, i).applyMatrix3(N).normalize(); nor.push(n.x, n.y, n.z); } else nor.push(0, 1, 0);
        if (U) uv.push(U.getX(i), U.getY(i)); else uv.push(0, 0);
        if (hasCol) col.push(C.getX(i), C.getY(i), C.getZ(i));
      }
      if (geo.index) for (let i = 0; i < geo.index.count; i++) idx.push(geo.index.getX(i) + vo);
      else for (let i = 0; i < P.count; i++) idx.push(i + vo);
      vo += P.count; drop.push(m);
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (hasCol) out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    out.setIndex(idx);
    const mm = new THREE.Mesh(out, list[0].material); mm.castShadow = list[0].castShadow; mm.receiveShadow = list[0].receiveShadow; g.add(mm);
  }
  for (const m of drop) m.parent.remove(m);
  /* a group the merge emptied is a node with nothing in it */
  for (const c of [...g.children]) if (c.isGroup && !c.children.length) g.remove(c);
}

export function buildPark(scene) {
  const g = new THREE.Group(); scene.add(g);
  /* sky: a gradient dome, and fog the colour of its horizon so the far stands
     sit in air instead of ending at a hard line */
  const skyGeo = new THREE.SphereGeometry(900, 24, 12);
  const top = new THREE.Color('#2f6fd0'), hor = new THREE.Color('#bfe0f6'), cols = [];
  const pos = skyGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const y = Math.max(0, pos.getY(i) / 900); const c = hor.clone().lerp(top, Math.pow(y, 0.55)); cols.push(c.r, c.g, c.b); }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })));
  scene.fog = new THREE.Fog('#bfe0f6', 260, 900);

  /* grass, mown in stripes the way every park on television is */
  const grassT = noiseTex('#4f9a3c', '#5aa846', 64, 8); grassT.repeat.set(40, 40);
  const grass = flat(new THREE.PlaneGeometry(900, 900), '#ffffff', 0); grass.material.map = grassT; g.add(grass);
  const dirtT = noiseTex('#b9824d', '#b9824d', 64); dirtT.repeat.set(10, 10);
  const dirtMat = new THREE.MeshLambertMaterial({ color: '#ffffff', map: dirtT });
  const addDirt = (geo, y, rot) => { const m = new THREE.Mesh(geo, dirtMat); m.rotation.x = -Math.PI / 2; if (rot) m.rotation.z = rot; m.position.y = y; m.receiveShadow = true; g.add(m); return m; };
  /* the infield skin: a fan from home out past the bases, with the grass
     infield laid back over it */
  addDirt(new THREE.CircleGeometry(BD * 2 * 0.98 + 20, 48, Math.PI / 4, Math.PI / 2), 0.05, 0).position.set(0, 0.05, 0);
  const infield = flat(new THREE.PlaneGeometry(FIELD.base - 8, FIELD.base - 8), '#ffffff', 0.11); infield.material.map = grassT; infield.rotation.z = Math.PI / 4; infield.position.set(0, 0.11, -BD); g.add(infield);
  /* home circle, mound, base cut-outs */
  addDirt(new THREE.CircleGeometry(13, 32), 0.14).position.set(0, 0.14, 0);
  const mound = new THREE.Mesh(new THREE.CylinderGeometry(7, 9, 1.2, 28), dirtMat); mound.position.set(MOUND.x, 0.1, MOUND.z); mound.receiveShadow = true; g.add(mound);
  const rubber = new THREE.Mesh(new THREE.BoxGeometry(2, 0.15, 0.5), new THREE.MeshLambertMaterial({ color: '#f4f2ea' })); rubber.position.set(MOUND.x, 0.75, MOUND.z); g.add(rubber);
  for (const k of ['first', 'second', 'third']) { const b = BASES[k]; addDirt(new THREE.CircleGeometry(7, 24), 0.14).position.set(b.x, 0.14, b.z);
    const bag = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 1.6), toon('#fbfaf4')); bag.position.set(b.x, 0.3, b.z); bag.rotation.y = Math.PI / 4; bag.castShadow = true; g.add(bag); }
  /* base paths */
  for (const [a, b] of [['home', 'first'], ['first', 'second'], ['second', 'third'], ['third', 'home']]) {
    const A = BASES[a], B = BASES[b], L = A.distanceTo(B); const m = addDirt(new THREE.PlaneGeometry(5, L), 0.08);
    m.position.set((A.x + B.x) / 2, 0.08, (A.z + B.z) / 2); m.rotation.z = Math.atan2(B.x - A.x, -(B.z - A.z)); }
  /* chalk */
  const chalk = new THREE.MeshBasicMaterial({ color: '#f6f4ec' });
  const line = (A, B, w = 0.35) => { const L = A.distanceTo(B); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, L), chalk); m.rotation.x = -Math.PI / 2; m.rotation.z = Math.atan2(B.x - A.x, -(B.z - A.z)); m.position.set((A.x + B.x) / 2, 0.19, (A.z + B.z) / 2); g.add(m); };
  const far = FIELD.fence / Math.SQRT2;
  line(new THREE.Vector3(1.2, 0, -1.2), new THREE.Vector3(far, 0, -far)); line(new THREE.Vector3(-1.2, 0, -1.2), new THREE.Vector3(-far, 0, -far));
  for (const sd of [-1, 1]) { const x0 = sd * 1.5, x1 = sd * 5.2; const z0 = -3, z1 = 3;
    line(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, 0, z0), 0.25); line(new THREE.Vector3(x0, 0, z1), new THREE.Vector3(x1, 0, z1), 0.25);
    line(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x0, 0, z1), 0.25); line(new THREE.Vector3(x1, 0, z0), new THREE.Vector3(x1, 0, z1), 0.25); }
  const plate = new THREE.Shape([new THREE.Vector2(-0.71, 0), new THREE.Vector2(0.71, 0), new THREE.Vector2(0.71, 0.71), new THREE.Vector2(0, 1.42), new THREE.Vector2(-0.71, 0.71)]);
  const pm = new THREE.Mesh(new THREE.ShapeGeometry(plate), chalk); pm.rotation.x = Math.PI / 2; pm.position.set(0, 0.2, 0.7); g.add(pm);

  /* warning track and the wall, padded and in the club's colour */
  const arc0 = Math.PI / 4, arc1 = Math.PI * 3 / 4;
  const track = new THREE.Mesh(new THREE.RingGeometry(FIELD.fence - 9, FIELD.fence, 64, 1, arc0 - 0.06, arc1 - arc0 + 0.12), dirtMat); track.rotation.x = -Math.PI / 2; track.position.y = 0.03; track.receiveShadow = true; g.add(track);
  const wallH = 8;
  /* CylinderGeometry puts theta at (sin t, cos t); the field's angle a is at
     (cos a, -sin a), which is t = a + pi/2 */
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(FIELD.fence, FIELD.fence, wallH, 72, 1, true, arc0 + Math.PI / 2, arc1 - arc0), new THREE.MeshLambertMaterial({ color: '#1e5a3a', side: THREE.DoubleSide }));
  wall.position.y = wallH / 2; wall.receiveShadow = true; g.add(wall);
  const cap = new THREE.Mesh(new THREE.TorusGeometry(FIELD.fence, 0.5, 4, 72, arc1 - arc0), new THREE.MeshLambertMaterial({ color: '#f2c030' }));
  cap.rotation.x = -Math.PI / 2; cap.rotation.z = arc0; cap.position.y = wallH; g.add(cap);
  const yel = new THREE.Mesh(new THREE.TorusGeometry(FIELD.fence - 0.05, 0.12, 3, 72, arc1 - arc0), new THREE.MeshBasicMaterial({ color: '#f2c030' }));
  yel.rotation.x = -Math.PI / 2; yel.rotation.z = arc0; yel.position.y = wallH - 0.6; g.add(yel);
  /* the batter's eye: dead centre, dark, because the pitch comes out of it */
  const eye = new THREE.Mesh(new THREE.BoxGeometry(46, 26, 3), new THREE.MeshLambertMaterial({ color: '#15301f' })); eye.position.set(0, 13, -FIELD.fence - 4); g.add(eye);

  /* stands: tiers stepping up behind the wall and down both foul lines */
  const standMat = new THREE.MeshLambertMaterial({ color: '#6a7488' });
  const seats = [];
  const tiers = 10;
  for (let t = 0; t < tiers; t++) {
    const r = FIELD.fence + 6 + t * 4.2, h = 3 + t * 2.6;
    for (let a = arc0 - 0.12; a <= arc1 + 0.12; a += 0.011) {
      const ang = a; const x = Math.cos(ang) * (r + 2), z = -Math.sin(ang) * (r + 2);
      if (Math.abs(x) < 26 && t < 7) continue; /* the batter's eye is not a seat */
      seats.push([x, h + 0.9, z, ang]);
    }
  }
  /* the stand bodies as stepped boxes along the arc (cheap and pixel friendly) */
  const stepGeo = new THREE.BoxGeometry(1, 1, 1); const steps = new THREE.InstancedMesh(stepGeo, standMat, 400); let si = 0;
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Sv = new THREE.Vector3(), Pv = new THREE.Vector3(), E = new THREE.Euler();
  for (let t = 0; t < tiers; t++) for (let a = arc0 - 0.12; a <= arc1 + 0.13; a += 0.05) {
    const r = FIELD.fence + 6 + t * 4.2, h = 3 + t * 2.6; const x = Math.cos(a) * (r + 2), z = -Math.sin(a) * (r + 2);
    if (Math.abs(x) < 24 && t < 7) continue; if (si >= 400) break;
    E.set(0, a - Math.PI / 2, 0); Q.setFromEuler(E); Sv.set(r * 0.05 + 0.6, h, 4.4); Pv.set(x, h / 2, z); M.compose(Pv, Q, Sv); steps.setMatrixAt(si++, M);
  }
  steps.count = si; steps.receiveShadow = true; g.add(steps);
  /* the crowd */
  const fanGeo = new THREE.BoxGeometry(1.1, 1.8, 0.9);
  const fans = new THREE.InstancedMesh(fanGeo, new THREE.MeshLambertMaterial({ color: '#ffffff' }), seats.length);
  const pal = ['#d0303a', '#f2f0ea', '#1f3f7a', '#f2c030', '#3a8a4a', '#e88a3a', '#8a4ab8', '#2a2a30', '#f6a0b0', '#4ab0d8'];
  let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const fanBase = [];
  seats.forEach(([x, y, z, a], i) => { E.set(0, a - Math.PI / 2, 0); Q.setFromEuler(E); Sv.set(1, 0.85 + rnd() * 0.35, 1); Pv.set(x + (rnd() - 0.5) * 0.4, y, z); M.compose(Pv, Q, Sv); fans.setMatrixAt(i, M); fans.setColorAt(i, new THREE.Color(pal[rnd() * pal.length | 0])); fanBase.push([Pv.clone(), Q.clone(), Sv.clone(), rnd() * 6.28]); });
  g.add(fans);
  /* light towers */
  for (const a of [arc0 - 0.05, Math.PI / 2 - 0.42, Math.PI / 2 + 0.42, arc1 + 0.05]) {
    const r = FIELD.fence + 50, x = Math.cos(a) * r, z = -Math.sin(a) * r;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 70, 6), new THREE.MeshLambertMaterial({ color: '#8a92a0' })); pole.position.set(x, 35, z); g.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(14, 7, 2), new THREE.MeshLambertMaterial({ color: '#3a4250' })); head.position.set(x, 72, z); head.lookAt(0, 72, 0); g.add(head);
    const lamps = new THREE.Mesh(new THREE.BoxGeometry(12, 5, 0.4), new THREE.MeshBasicMaterial({ color: '#fff6d8' })); lamps.position.copy(head.position).multiplyScalar(0.985); lamps.lookAt(0, 72, 0); g.add(lamps);
  }
  /* clouds */
  const cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#cfd8e8', emissiveIntensity: 0.6 });
  for (let i = 0; i < 9; i++) { const c = new THREE.Group(); const a = 0.4 + i * 0.27, r = 520 + rnd() * 150;
    for (let j = 0; j < 4; j++) { const b = new THREE.Mesh(new THREE.SphereGeometry(18 + rnd() * 14, 8, 6), cloudMat); b.position.set(j * 22 - 33, rnd() * 8, rnd() * 10); b.scale.y = 0.55; c.add(b); }
    c.position.set(Math.cos(a) * r, 150 + rnd() * 90, -Math.sin(a) * r); c.lookAt(0, c.position.y, 0); g.add(c); }
  mergeStatic(g);
  return {
    group: g,
    cheer(t, amount) {
      if (!amount) return;
      fanBase.forEach(([p, q, sc, ph], i) => { Pv.copy(p); Pv.y += Math.max(0, Math.sin(t * 9 + ph)) * 1.4 * amount; M.compose(Pv, q, sc); fans.setMatrixAt(i, M); });
      fans.instanceMatrix.needsUpdate = true;
    },
  };
}
