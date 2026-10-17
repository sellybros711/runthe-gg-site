/* Behind home plate: the padded backstop wall, the net, the seats rising behind it, and the crowd.
 *
 * Only a narrow wedge behind the plate is ever in the pitcher's view, so the stands are an arc of
 * about 50 degrees. The crowd is one instanced quad per seat; the sprites are rendered people
 * (pipeline/build_crowd.py), pre-blurred because the eye is focused 60 ft nearer.
 */
import * as THREE from 'three';
import { FT } from './units.js';
import { BACKSTOP_FT } from './field.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function buildStands(scene, tex, renderer) {
  const R0 = BACKSTOP_FT * FT;
  const A = THREE.MathUtils.degToRad(34);          // half the arc
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const group = new THREE.Group();
  scene.add(group);

  // ---- the wall: dark padding, 5 ft, with seams and a light cap
  const padC = tex.load('./assets/tex/pad_color.webp'); padC.colorSpace = THREE.SRGBColorSpace;
  const padN = tex.load('./assets/tex/pad_normal.webp');
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
    pole.position.set(Math.sin(a) * (R0 + 0.3), wallH + netH / 2, -Math.cos(a) * (R0 + 0.3));
    group.add(pole);
  }

  // ---- the seating bowl: concrete treads and risers, 34 rows
  const ROWS = 34, rowD = 0.86, rowH = 0.43, base = wallH + 0.1;
  const conc = tex.load('./assets/tex/concrete_color.webp'); conc.colorSpace = THREE.SRGBColorSpace;
  conc.wrapS = conc.wrapT = THREE.RepeatWrapping; conc.repeat.set(30, 1);
  const bowlMat = new THREE.MeshStandardMaterial({ map: conc, color: 0x6e7176, roughness: 0.9, side: THREE.DoubleSide });
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x173462, roughness: 0.55, side: THREE.DoubleSide });
  const seg = 72, a0 = Math.PI - A * 1.25, aL = A * 2.5;
  // every row's riser, tread and seat backs merged into two meshes: three draw calls, not a hundred
  const concG = [], seatG = [];
  for (let r = 0; r < ROWS; r++) {
    const rad = R0 + 0.6 + r * rowD, y = base + r * rowH;
    concG.push(new THREE.CylinderGeometry(rad, rad, rowH, seg, 1, true, a0, aL).translate(0, y - rowH / 2, 0));
    concG.push(new THREE.RingGeometry(rad, rad + rowD, seg, 1, Math.PI / 2 - aL / 2, aL).rotateX(-Math.PI / 2).translate(0, y, 0));
    seatG.push(new THREE.CylinderGeometry(rad + 0.55, rad + 0.55, 0.42, seg, 1, true, a0, aL).translate(0, y + 0.24, 0));
  }
  group.add(new THREE.Mesh(mergeGeometries(concG.map((g) => g.toNonIndexed())), bowlMat));
  group.add(new THREE.Mesh(mergeGeometries(seatG), seatMat));
  // the suite level above the bowl: a dark glass band and a fascia
  const topY = base + ROWS * rowH, topR = R0 + 0.6 + ROWS * rowD;
  const fascia = new THREE.Mesh(new THREE.CylinderGeometry(topR, topR, 1.6, seg, 1, true, a0, aL), new THREE.MeshStandardMaterial({ color: 0x1b2633, roughness: 0.4 }));
  fascia.position.y = topY + 0.8; group.add(fascia);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(topR + 2, topR + 2, 4, seg, 1, true, a0, aL), new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.08, metalness: 0.6 }));
  glass.position.y = topY + 3.6; group.add(glass);
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(topR + 3, topR + 26, 22, seg, 1, true, a0, aL), new THREE.MeshStandardMaterial({ color: 0x5b6470, roughness: 0.9 }));
  upper.position.y = topY + 5.6 + 11; group.add(upper);

  // ---- the crowd
  const crowdTex = tex.load('./assets/crowd.webp', (t) => { t.needsUpdate = true; });
  crowdTex.colorSpace = THREE.SRGBColorSpace; crowdTex.anisotropy = aniso;
  const COLS = 8, CROWS = 5;
  const quad = new THREE.PlaneGeometry(0.62, 0.93);
  quad.translate(0, 0.93 / 2, 0);
  const uvOff = [];
  const mats = [];
  const r = rng(11);
  const seatW = 0.52;
  let count = 0;
  const instances = [];
  for (let row = 0; row < ROWS; row++) {
    const rad = R0 + 0.6 + row * rowD + 0.25, y = base + row * rowH;
    const n = Math.floor((aL * rad) / seatW);
    for (let i = 0; i < n; i++) {
      if (r() < 0.06) continue;      // a few empty seats
      const a = -aL / 2 + (i + 0.5 + (r() - 0.5) * 0.15) * (aL / n);
      // the upper rows sit in the shade of the deck above
      const shade = THREE.MathUtils.lerp(0.92, 0.5, THREE.MathUtils.smoothstep(row, 6, ROWS)) * (0.9 + r() * 0.15);
      instances.push({ a, rad, y: y + 0.02 + (r() - 0.5) * 0.04, v: Math.floor(r() * COLS * CROWS), s: 0.94 + r() * 0.12, phase: r() * 6.28, shade });
    }
  }
  count = instances.length;
  const mesh = new THREE.InstancedMesh(quad, new THREE.MeshStandardMaterial({ map: crowdTex, alphaTest: 0.5, roughness: 0.9, side: THREE.DoubleSide }), count);
  const cell = new Float32Array(count * 2);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  instances.forEach((it, k) => {
    p.set(Math.sin(it.a) * it.rad, it.y, -Math.cos(it.a) * it.rad);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -it.a);
    s.setScalar(it.s);
    mesh.setMatrixAt(k, m4.compose(p, q, s));
    mesh.setColorAt(k, new THREE.Color(it.shade, it.shade, it.shade));
    cell[k * 2] = it.v % COLS; cell[k * 2 + 1] = Math.floor(it.v / COLS);
  });
  quad.setAttribute('cell', new THREE.InstancedBufferAttribute(cell, 2));
  mesh.material.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 cell;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>\nvMapUv = (vec2(cell.x, ${CROWS - 1}.0 - cell.y) + uv) / vec2(${COLS}.0, ${CROWS}.0);`);
  };
  mesh.frustumCulled = false;
  group.add(mesh);
  return group;
}
