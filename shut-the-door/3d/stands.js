/* Behind home plate: the padded backstop wall, the net, and the seats rising behind it, with fans in them.
 *
 * Only a narrow wedge behind the plate is ever in the pitcher's view, so the stands are an arc of
 * about 50 degrees. The seats were empty until 2026-10-31 (an earlier reference showed empty seats
 * reading as real where a repeated crowd did not); the owner then asked for a crowd. So the crowd is
 * never one figure repeated: crowd.js gives every fan his own figure, shirt, skin and hair from a hash,
 * a seat in about seven is empty, and seen down the pitcher's long lens the fans are drawn a little
 * soft (the atlas a mip coarser), as a real long lens holds the hitter sharp and the stands behind not.
 */
import * as THREE from 'three';
import { FT } from './units.js?v=1';
import { BACKSTOP_FT } from './field.js?v=8';
import { assetUrl } from './load.js?v=8';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildCrowd } from './crowd.js?v=1';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function buildStands(scene, tex, renderer) {
  const R0 = BACKSTOP_FT * FT;
  const A = THREE.MathUtils.degToRad(34);          // half the arc
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const group = new THREE.Group();
  scene.add(group);

  // ---- the wall: dark padding, 5 ft, with seams and a light cap
  const padC = tex.load(assetUrl('tex/pad_color.webp')); padC.colorSpace = THREE.SRGBColorSpace;
  const padN = tex.load(assetUrl('tex/pad_normal.webp'));
  for (const t of [padC, padN]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 1.5); t.anisotropy = aniso; }
  const wallH = 5 * FT;
  const wallGeo = new THREE.CylinderGeometry(R0, R0, wallH, 96, 1, true, Math.PI - A * 1.6, A * 3.2);
  const seams = document.createElement('canvas'); seams.width = 1024; seams.height = 8;
  const sx = seams.getContext('2d'); sx.fillStyle = '#fff'; sx.fillRect(0, 0, 1024, 8);
  sx.fillStyle = '#7a7a7a'; for (let i = 0; i < 1024; i += 1024 / 64) sx.fillRect(i, 0, 2, 8);
  const seamT = new THREE.CanvasTexture(seams);
  const wall = new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({ map: padC, normalMap: padN, roughness: 0.55, side: THREE.BackSide, aoMap: null, lightMap: null, color: 0xffffff }));
  wall.material.onBeforeCompile = (sh) => {
    sh.uniforms.seams = { value: seamT };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D seams;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= texture2D(seams, vec2(vMapUv.x / 40.0, 0.5)).rgb;');
  };
  wall.position.y = wallH / 2;
  wall.receiveShadow = true;
  group.add(wall);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(R0 + 0.12, R0 + 0.12, 0.08, 96, 1, true, Math.PI - A * 1.6, A * 3.2),
    new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.7, side: THREE.DoubleSide }));
  cap.position.y = wallH + 0.04; group.add(cap);
  const capTop = new THREE.Mesh(new THREE.RingGeometry(R0, R0 + 0.3, 96, 1, Math.PI / 2 - A * 1.6, A * 3.2),
    new THREE.MeshStandardMaterial({ color: 0x8b9195, roughness: 0.8, side: THREE.DoubleSide }));
  capTop.rotation.x = -Math.PI / 2; capTop.position.y = wallH + 0.08; group.add(capTop);

  // ---- the net: barely there, as on television
  const netH = 32 * FT;
  const net = new THREE.Mesh(new THREE.CylinderGeometry(R0 + 0.2, R0 + 0.2, netH, 64, 1, true, Math.PI - A * 1.6, A * 3.2),
    new THREE.MeshBasicMaterial({ color: 0x101418, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, fog: true }));
  net.position.y = wallH + netH / 2; group.add(net);
  for (const a of [-0.45, 0, 0.45]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, netH, 6), new THREE.MeshStandardMaterial({ color: 0x2a2f33, roughness: 0.5 }));
    // (named: the broadcast's high home camera looks out over the net, and hides them, inplay.js)
    pole.name = 'netPole';
    pole.position.set(Math.sin(a) * (R0 + 0.3), wallH + netH / 2, -Math.cos(a) * (R0 + 0.3));
    group.add(pole);
  }

  // ---- the seating bowl: concrete treads and risers, 34 rows
  const ROWS = 34, rowD = 0.86, rowH = 0.43, base = wallH + 0.1;
  const conc = tex.load(assetUrl('tex/concrete_color.webp')); conc.colorSpace = THREE.SRGBColorSpace;
  conc.wrapS = conc.wrapT = THREE.RepeatWrapping; conc.repeat.set(30, 1);
  const bowlMat = new THREE.MeshStandardMaterial({ map: conc, color: 0x6e7176, roughness: 0.9, side: THREE.DoubleSide });
  const seg = 72, a0 = Math.PI - A * 1.25, aL = A * 2.5;
  // every row's riser, tread and seat backs merged into two meshes: three draw calls, not a hundred
  const concG = [];
  for (let r = 0; r < ROWS; r++) {
    const rad = R0 + 0.6 + r * rowD, y = base + r * rowH;
    concG.push(new THREE.CylinderGeometry(rad, rad, rowH, seg, 1, true, a0, aL).translate(0, y - rowH / 2, 0));
    concG.push(new THREE.RingGeometry(rad, rad + rowD, seg, 1, Math.PI / 2 - aL / 2, aL).rotateX(-Math.PI / 2).translate(0, y, 0));
  }
  group.add(new THREE.Mesh(mergeGeometries(concG.map((g) => g.toNonIndexed())), bowlMat));
  // the suite level above the bowl: a dark glass band and a fascia
  const topY = base + ROWS * rowH, topR = R0 + 0.6 + ROWS * rowD;
  const fascia = new THREE.Mesh(new THREE.CylinderGeometry(topR, topR, 1.6, seg, 1, true, a0, aL), new THREE.MeshStandardMaterial({ color: 0x1b2633, roughness: 0.4 }));
  fascia.position.y = topY + 0.8; group.add(fascia);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(topR + 2, topR + 2, 4, seg, 1, true, a0, aL), new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.08, metalness: 0.6 }));
  glass.position.y = topY + 3.6; group.add(glass);
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(topR + 3, topR + 26, 22, seg, 1, true, a0, aL), new THREE.MeshStandardMaterial({ color: 0x5b6470, roughness: 0.9 }));
  upper.position.y = topY + 5.6 + 11; group.add(upper);

  // ---- the seats: no crowd. A repeated crowd reads as fake far sooner than empty seats do, so the
  // rows are real seats (a pan and a back each), dark, one instanced mesh
  const seatGeo = mergeGeometries([
    new THREE.BoxGeometry(0.46, 0.05, 0.42).translate(0, 0.44, 0.02),
    new THREE.BoxGeometry(0.46, 0.44, 0.04).rotateX(-0.12).translate(0, 0.7, -0.2),
  ]);
  const chair = new THREE.MeshStandardMaterial({ color: 0x46505c, roughness: 0.4 });
  const r = rng(11);
  const seats = [];
  const seatW = 0.52;
  for (let row = 0; row < ROWS; row++) {
    const rad = R0 + 0.6 + row * rowD + 0.35, y = base + row * rowH;
    const n = Math.floor((aL * rad) / seatW);
    for (let i = 0; i < n; i++) {
      const a = -aL / 2 + (i + 0.5) * (aL / n);
      seats.push({ a, rad, y, shade: 0.85 + r() * 0.2 });
    }
  }
  const seatMesh = new THREE.InstancedMesh(seatGeo, chair, seats.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  seats.forEach((it, k) => {
    p.set(Math.sin(it.a) * it.rad, it.y, -Math.cos(it.a) * it.rad);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -it.a);
    seatMesh.setMatrixAt(k, m4.compose(p, q, one));
    seatMesh.setColorAt(k, new THREE.Color(it.shade, it.shade, it.shade));
  });
  seatMesh.receiveShadow = true;
  group.add(seatMesh);

  // ---- the fans: in about six seats in seven (their own stream, so the seats keep their shades)
  const rf = rng(41), fans = [];
  for (const it of seats) {
    if (rf() < 0.15) continue;
    const a = it.a + (rf() - 0.5) * 0.1 / it.rad, rr = it.rad + (rf() - 0.5) * 0.08;   // not quite in the middle of his seat
    fans.push({ x: Math.sin(a) * rr, y: it.y, z: -Math.cos(a) * rr, yaw: -a + (rf() - 0.5) * 0.3, s: 0.9 + rf() * 0.2 });
  }
  group.add(buildCrowd(fans, { sectors: 1, blur: 1.5, lift: 0.3 }));
  group.userData.tick = () => {};
  return group;
}
