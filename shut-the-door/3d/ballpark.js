/* The rest of the ballpark, for the ball in play: the infield dirt and grass, the base paths, the
 * mound and the rubber, the bases, the foul lines out to the poles, the warning track, the outfield
 * wall, and empty stands round the field (the owner's rule for the seats behind the plate holds here:
 * empty seats read as real, a repeated crowd does not).
 *
 * Sizes are the rule book's: 90 ft between the bases, the rubber 60 ft 6 in from the plate on a mound
 * 18 ft across and 10 in high, the infield dirt an arc 95 ft from the rubber, bases 15 in square. The
 * wall is a generic park (330 ft down the lines, 400 to centre, 8 ft high), not any real one: real
 * ballparks are a later item on the roadmap. Hidden in the pitcher's view (it is all behind him),
 * shown for the broadcast shots of a ball in play. About ten draw calls.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FT } from './units.js?v=1';
import { assetUrl } from './load.js?v=8';
import { BASE, MOUND, WALL_H, wallDist } from './inplay-plan.js?v=11';

const W = (x, y, h = 0) => new THREE.Vector3(-x * FT, h * FT, y * FT);   // field feet to world metres
const D2R = Math.PI / 180;

/** Where the front of the stands is, at angle th (degrees from centre field, + toward right field):
    the outfield wall in fair ground, then a low wall 45 ft off each foul line back to the backstop. */
export function frontAt(th) {
  const a = Math.abs(th);
  if (a <= 45) return wallDist(th);
  const line = 45 / Math.sin((a - 45) * D2R || 1e-3);
  const d = Math.min(330, line);
  const k = THREE.MathUtils.smoothstep(a, 100, 128);
  return d + (56 - d) * k;
}

function infieldMask() {
  // a canvas over the infield, in field feet: x -120..120, y -10..170 (0.12 ft a pixel)
  const X0 = -120, X1 = 120, Y0 = -10, Y1 = 170, PX = 2048;
  const k = PX / (X1 - X0), H = Math.round((Y1 - Y0) * k);
  const c = document.createElement('canvas'); c.width = PX; c.height = H;
  const g = c.getContext('2d');
  const X = (x) => (x - X0) * k, Y = (y) => (Y1 - y) * k;
  g.fillStyle = '#000'; g.fillRect(0, 0, PX, H);
  g.fillStyle = '#fff';
  // the dirt: the arc 95 ft from the rubber, out to a few feet past the foul lines
  g.save();
  g.beginPath(); g.moveTo(X(0), Y(-4)); g.lineTo(X(-150), Y(146)); g.lineTo(X(150), Y(146)); g.closePath(); g.clip();
  g.beginPath(); g.arc(X(MOUND.x), Y(MOUND.y), 95 * k, 0, Math.PI * 2); g.fill();
  g.restore();
  // the infield grass: the diamond, 3 ft inside the base lines
  g.fillStyle = '#000';
  const r = 63.64 - 3 * Math.SQRT2;
  g.beginPath(); g.moveTo(X(0), Y(63.64 - r)); g.lineTo(X(r), Y(63.64)); g.lineTo(X(0), Y(63.64 + r)); g.lineTo(X(-r), Y(63.64)); g.closePath(); g.fill();
  g.fillStyle = '#fff';
  // the cutouts round the bases and the mound, and the base paths (6 ft wide) from the plate
  for (const b of [1, 2, 3]) { g.beginPath(); g.arc(X(BASE[b].x), Y(BASE[b].y), 13 * k, 0, Math.PI * 2); g.fill(); }
  g.beginPath(); g.arc(X(MOUND.x), Y(MOUND.y), 9 * k, 0, Math.PI * 2); g.fill();
  g.lineWidth = 6 * k; g.strokeStyle = '#fff';
  g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(BASE[1].x), Y(BASE[1].y)); g.moveTo(X(0), Y(0)); g.lineTo(X(BASE[3].x), Y(BASE[3].y)); g.stroke();
  // and leave the home plate circle to the field's own drawing (field.js)
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.arc(X(0), Y(0.7), 13.4 * k, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'source-over';
  // soften the edge where the grass is cut
  const s = document.createElement('canvas'); s.width = PX; s.height = H;
  const sg = s.getContext('2d'); sg.filter = 'blur(2px)'; sg.drawImage(c, 0, 0);
  return { canvas: s, X0, X1, Y0, Y1 };
}

function dirtMat(tex, renderer, repeat, opts = {}) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const load = (n, srgb) => { const t = tex.load(assetUrl(`tex/${n}.webp`)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = aniso; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  return new THREE.MeshStandardMaterial({ map: load('dirt_color', true), normalMap: load('dirt_normal'), roughness: 0.95, color: 0xd8c2a8, ...opts });
}

export function buildBallpark(scene, renderer) {
  const tex = new THREE.TextureLoader();
  const group = new THREE.Group();
  group.name = 'ballpark';
  group.visible = false;
  scene.add(group);

  // ---- the infield dirt: one plane over the infield with the mask as its alpha
  const m = infieldMask();
  const alpha = new THREE.CanvasTexture(m.canvas); alpha.colorSpace = THREE.NoColorSpace; alpha.flipY = true;
  const wFt = m.X1 - m.X0, hFt = m.Y1 - m.Y0;
  const dirt = dirtMat(tex, renderer, wFt * FT / 1.1, { alphaMap: alpha, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  dirt.alphaMap.repeat && dirt.alphaMap.repeat.set(1, 1);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(wFt * FT, hFt * FT).rotateX(-Math.PI / 2), dirt);
  // the plane's +x is the field's -x (the mirror in P()): turn it about the vertical so it reads right
  plane.geometry.rotateY(Math.PI);
  plane.position.copy(W((m.X0 + m.X1) / 2, (m.Y0 + m.Y1) / 2, 0.01));
  plane.receiveShadow = true; plane.renderOrder = 1;
  group.add(plane);

  // ---- the mound: 18 ft across, 10 in high, its top a 5 ft table, and the rubber on it
  const moundG = new THREE.CylinderGeometry(2.6 * FT, 9 * FT, (10 / 12) * FT, 48, 1);
  const mound = new THREE.Mesh(moundG, dirtMat(tex, renderer, 4));
  mound.position.copy(W(MOUND.x, MOUND.y + 1.5, 5 / 12));
  mound.receiveShadow = true;
  group.add(mound);

  // ---- white things: the bases, the rubber and the chalk, merged
  const white = [];
  const bag = (b) => {
    const q = BASE[b], g = new THREE.BoxGeometry(1.25 * FT, 0.25 * FT, 1.25 * FT);
    // first and third sit inside fair ground with an edge on the line; second is centred on its corner
    const inward = b === 2 ? { x: 0, y: 0 } : { x: -Math.sign(q.x) * 0.625 * Math.SQRT1_2 * 2, y: 0 };
    g.rotateY(Math.PI / 4);
    g.translate(...W(q.x + inward.x, q.y + inward.y, 0.125).toArray());
    return g;
  };
  for (const b of [1, 2, 3]) white.push(bag(b));
  white.push(new THREE.BoxGeometry(2 * FT, 0.12 * FT, 0.5 * FT).translate(...W(MOUND.x, MOUND.y, 10 / 12 + 0.06).toArray()));
  // the foul lines, 4 in wide: from where the field's own chalk stops (60 ft out) to the poles. The
  // field draws them from the outer front corners of the batter's boxes; these carry them on.
  const lineFrom = (sx) => {
    const off = 8.5 / 12 + 6 / 12 + 4, x0 = sx * (off + 56), y0 = 3.7 + 56;
    const len = (330 - Math.hypot(x0, y0)) + 2;
    const dir = new THREE.Vector2(sx, 1).normalize();
    const g = new THREE.PlaneGeometry((4 / 12) * FT, len * FT).rotateX(-Math.PI / 2);
    g.rotateY(-Math.atan2(-dir.x, dir.y));
    const mid = { x: x0 + dir.x * len / 2, y: y0 + dir.y * len / 2 };
    g.translate(...W(mid.x, mid.y, 0.04).toArray());
    return g;
  };
  white.push(lineFrom(1), lineFrom(-1));
  const chalk = new THREE.Mesh(mergeGeometries(white.map((g) => g.toNonIndexed())), new THREE.MeshStandardMaterial({ color: 0xf1efe8, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  chalk.receiveShadow = true; chalk.renderOrder = 2;
  group.add(chalk);

  // ---- the warning track (15 ft of dirt inside the wall) and the wall itself
  const N = 96, A0 = -45.6, A1 = 45.6;
  const trackPos = [], trackIdx = [];
  for (let i = 0; i <= N; i++) {
    const th = A0 + (A1 - A0) * i / N, d = wallDist(Math.max(-45, Math.min(45, th)));
    const u = { x: Math.sin(th * D2R), y: Math.cos(th * D2R) };
    trackPos.push(...W(u.x * (d - 15), u.y * (d - 15), 0.02).toArray(), ...W(u.x * d, u.y * d, 0.02).toArray());
    if (i < N) { const a = i * 2; trackIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(trackPos, 3)); tg.setIndex(trackIdx);
  const tuv = []; for (let i = 0; i <= N; i++) tuv.push(i * 1.5, 0, i * 1.5, 1.4); tg.setAttribute('uv', new THREE.Float32BufferAttribute(tuv, 2));
  tg.computeVertexNormals();
  const track = new THREE.Mesh(tg, dirtMat(tex, renderer, 1, { color: 0xb59a80, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  track.material.map.repeat.set(1, 1); track.material.normalMap.repeat.set(1, 1);
  group.add(track);

  // the front of the stands all the way round: the padded outfield wall (8 ft, dark green, a yellow
  // line on top) and the low wall along the foul ground (4 ft)
  const ring = [];
  for (let th = -128; th <= 128.01; th += 1) ring.push(th);
  const wallPos = [], wallCol = [], wallIdx = [];
  ring.forEach((th, i) => {
    const d = frontAt(th), u = { x: Math.sin(th * D2R), y: Math.cos(th * D2R) };
    const fair = Math.abs(th) <= 45.5, h = fair ? WALL_H : 4;
    const c = fair ? [0.07, 0.2, 0.13] : [0.1, 0.14, 0.17];
    wallPos.push(...W(u.x * d, u.y * d, 0).toArray(), ...W(u.x * d, u.y * d, h).toArray(), ...W(u.x * d, u.y * d, h + 0.35).toArray());
    wallCol.push(...c, ...c, ...(fair ? [0.85, 0.7, 0.1] : c));
    if (i < ring.length - 1) { const a = i * 3; wallIdx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
  });
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3)); wg.setAttribute('color', new THREE.Float32BufferAttribute(wallCol, 3)); wg.setIndex(wallIdx); wg.computeVertexNormals();
  const wall = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
  group.add(wall);

  // ---- the stands: rows of empty seats rising behind the wall (a canvas of seat rows on a slope),
  // the batter's eye dark in centre field, an upper deck's fascia, and the two foul poles
  const seatsC = document.createElement('canvas'); seatsC.width = 64; seatsC.height = 256;
  const sx = seatsC.getContext('2d');
  for (let r = 0; r < 32; r++) {
    sx.fillStyle = '#5c6066'; sx.fillRect(0, r * 8, 64, 8);                // the concrete tread
    sx.fillStyle = r % 2 ? '#1d3550' : '#21395a'; sx.fillRect(0, r * 8 + 1, 64, 5);   // a row of seat backs
    sx.fillStyle = '#5c6066'; for (let x = 0; x < 64; x += 8) sx.fillRect(x, r * 8 + 1, 1, 5);
  }
  const seatT = new THREE.CanvasTexture(seatsC); seatT.colorSpace = THREE.SRGBColorSpace; seatT.wrapS = seatT.wrapT = THREE.RepeatWrapping;
  seatT.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const sPos = [], sUv = [], sIdx = [], ePos = [], eIdx = [];
  const ROWS = [[0, 0], [6, 3], [60, 30], [64, 30]];   // (back, up) feet: an aisle, the rake at 27 degrees, a walkway
  ring.forEach((th, i) => {
    const d = frontAt(th), u = { x: Math.sin(th * D2R), y: Math.cos(th * D2R) };
    const fair = Math.abs(th) <= 45.5, h0 = fair ? WALL_H : 4;
    for (const [b, up] of ROWS) {
      sPos.push(...W(u.x * (d + b), u.y * (d + b), h0 + up).toArray());
      sUv.push(d * th * D2R / 6, up / 3.2);
    }
    // the seats everywhere but the batter's eye (dead centre, 18 degrees, dark)
    if (i < ring.length - 1 && Math.max(Math.abs(th), Math.abs(ring[i + 1])) > 9) {
      const a = i * 4;
      for (let k = 0; k < 3; k++) sIdx.push(a + k, a + 4 + k, a + k + 1, a + k + 1, a + 4 + k, a + 5 + k);
    }
    if (Math.abs(th) <= 9) {
      const e0 = ePos.length / 3;
      ePos.push(...W(u.x * d, u.y * d, h0).toArray(), ...W(u.x * (d + 30), u.y * (d + 30), h0 + 38).toArray());
      if (e0 >= 2) eIdx.push(e0 - 2, e0, e0 - 1, e0 - 1, e0, e0 + 1);
    }
  });
  const sgm = new THREE.BufferGeometry();
  sgm.setAttribute('position', new THREE.Float32BufferAttribute(sPos, 3)); sgm.setAttribute('uv', new THREE.Float32BufferAttribute(sUv, 2)); sgm.setIndex(sIdx); sgm.computeVertexNormals();
  group.add(new THREE.Mesh(sgm, new THREE.MeshStandardMaterial({ map: seatT, roughness: 0.8, side: THREE.DoubleSide })));
  const egm = new THREE.BufferGeometry(); egm.setAttribute('position', new THREE.Float32BufferAttribute(ePos, 3)); egm.setIndex(eIdx); egm.computeVertexNormals();
  group.add(new THREE.Mesh(egm, new THREE.MeshStandardMaterial({ color: 0x0d1712, roughness: 0.95, side: THREE.DoubleSide })));
  // the upper deck's fascia and roof line, round the top of the stands
  const fPos = [], fIdx = [];
  ring.forEach((th, i) => {
    const d = frontAt(th) + 64, u = { x: Math.sin(th * D2R), y: Math.cos(th * D2R) };
    const h0 = (Math.abs(th) <= 45.5 ? WALL_H : 4) + 30;
    fPos.push(...W(u.x * d, u.y * d, h0).toArray(), ...W(u.x * d, u.y * d, h0 + 9).toArray(), ...W(u.x * (d + 40), u.y * (d + 40), h0 + 40).toArray());
    if (i < ring.length - 1) { const a = i * 3; fIdx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
  });
  const fgm = new THREE.BufferGeometry(); fgm.setAttribute('position', new THREE.Float32BufferAttribute(fPos, 3)); fgm.setIndex(fIdx); fgm.computeVertexNormals();
  group.add(new THREE.Mesh(fgm, new THREE.MeshStandardMaterial({ color: 0x3c4652, roughness: 0.9, side: THREE.DoubleSide })));
  // the foul poles
  const poles = [];
  for (const s of [-1, 1]) poles.push(new THREE.CylinderGeometry(0.2 * FT, 0.2 * FT, 70 * FT, 8).translate(...W(s * 330 * Math.SQRT1_2, 330 * Math.SQRT1_2, 35).toArray()));
  group.add(new THREE.Mesh(mergeGeometries(poles), new THREE.MeshStandardMaterial({ color: 0xe8c21a, roughness: 0.5 })));
  return group;
}
