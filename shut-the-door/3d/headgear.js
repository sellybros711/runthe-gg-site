/* Headgear that is worn, not placed: the batting helmet, the catcher's helmet and mask, the
 * umpire's cap and mask, each built for the head it goes on.
 *
 * The head is measured first (scalp): every skin vertex the head bone carries, with this player's
 * build morphs and height scale applied, in the head's own frame (origin at the skull's centre,
 * axes of the body: +z forward, +y up). Its outer surface is kept as a radius for each direction
 * (a map over the polar angle theta from the crown and the azimuth phi from the nose). A shell is
 * then laid on that surface: its padding PAD off the scalp, the hard shell a smooth surface over it,
 * its lower edge along a rim that is set from this head's own landmarks (the brows, the back of the
 * skull). So a short, light hitter and a tall, heavy one each get a helmet that sits on his head.
 *
 * Everything here is attached to the head bone, so it turns with the head through the swing, the
 * follow through and the flinch, with nothing between to lag or slide. Each piece keeps, in
 * userData.fit, the points of it that rest on the head (the padding, the pads, the band), which
 * check-fit.mjs measures against the skin in every frame. The skin shader is given the rim
 * (wornShade) to darken the skin where the shell meets it and under the brim.
 */
import * as THREE from 'three';

const NP = 96, NT = 72;                 // the map: phi bins over a turn, theta bins over a half turn
const TAU = Math.PI * 2, D = Math.PI / 180;
export const PAD = 0.003;               // the padding's gap to the scalp, metres

const _v = new THREE.Vector3(), _m = new THREE.Matrix4();

/** Index of a bone in a skinned mesh's skeleton. */
function boneIndex(mesh, name) { return mesh.skeleton.bones.findIndex((b) => b.name === name); }

function weightOf(mesh, i, bi) {
  const si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
  let w = 0;
  for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === bi) w += sw.getComponent(i, k);
  return w;
}

/** A skinned vertex's world position now (the morphs and the current pose applied). */
function worldVertex(mesh, i, out) {
  mesh.getVertexPosition(i, out);
  return out.applyMatrix4(mesh.matrixWorld);
}

/** The head's frame and the scalp's vertices: call in the bind pose, after the build is applied.
    opts.hair: the hair is kept, and the gear rests on it (a cap on the umpire's hair). */
export function measureHead(p, opts = {}) {
  p.root.updateMatrixWorld(true);
  const skin = p.meshes.find((m) => m.material.name === 'skin' && m.isSkinnedMesh);
  const bi = boneIndex(skin, 'head');
  const idx = [], wts = [], low = [];
  const box = new THREE.Box3();
  const n = skin.geometry.attributes.position.count;
  for (let i = 0; i < n; i++) {
    const w = weightOf(skin, i, bi);
    if (w >= 0.05) low.push(i);
    if (w < 0.35) continue;
    idx.push(i); wts.push(w);
    box.expandByPoint(worldVertex(skin, i, _v));
  }
  // the frame: the body's axes (the root's rotation), at the skull's centre: the middle of the box
  // across and front to back, and the height of the ears (a little below the box's middle)
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  c.y = box.max.y - size.x * 0.62;
  const rot = new THREE.Quaternion();
  p.root.matrixWorld.decompose(new THREE.Vector3(), rot, new THREE.Vector3());
  const F = new THREE.Matrix4().compose(c, rot, new THREE.Vector3(1, 1, 1));
  const Finv = F.clone().invert();
  const pts = idx.map((i) => worldVertex(skin, i, new THREE.Vector3()).applyMatrix4(Finv));
  // each one's outward normal in the frame (the bind pose's; the skull turns with the frame)
  const nm = new THREE.Matrix3().getNormalMatrix(new THREE.Matrix4().multiplyMatrices(Finv, skin.matrixWorld));
  const nrm = idx.map((i) => new THREE.Vector3().fromBufferAttribute(skin.geometry.attributes.normal, i).applyMatrix3(nm).normalize());
  // the brows: the top of the eyebrow meshes, in the frame
  let brow = null;
  for (const m of p.meshes) {
    if (!/eyebrow/i.test(m.material.name || '') || !m.isSkinnedMesh) continue;
    const pc = m.geometry.attributes.position.count;
    for (let i = 0; i < pc; i++) {
      const q = worldVertex(m, i, new THREE.Vector3()).applyMatrix4(Finv);
      if (!brow || q.y > brow.y) brow = q;
    }
  }
  const hairPts = [];
  if (opts.hair) for (const m of p.meshes) {
    if (m.material.name !== 'hair' || !m.isSkinnedMesh) continue;
    const pc = m.geometry.attributes.position.count;
    for (let i = 0; i < pc; i++) hairPts.push(worldVertex(m, i, new THREE.Vector3()).applyMatrix4(Finv));
  }
  // and every skin vertex the head bone carries at all (the jaw and the cheeks are shared with the
  // neck): what a piece held off the face (the jaw guard) must clear
  const lowPts = low.map((i) => worldVertex(skin, i, new THREE.Vector3()).applyMatrix4(Finv));
  const head = { skin, idx, wts, nrm, F, Finv, pts, brow, hair: !!opts.hair, map: scalpMap(pts.concat(hairPts), wts), lowPts };
  p.head = head;
  return head;
}

/** theta (from +y) and phi (from +z, toward +x) of a frame point. */
export function polar(q) {
  const r = q.length();
  return { r, th: Math.acos(THREE.MathUtils.clamp(q.y / (r || 1), -1, 1)), ph: Math.atan2(q.x, q.z) };
}
export function dirOf(ph, th) { return new THREE.Vector3(Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph)); }

const binP = (ph) => ((Math.floor(((ph + Math.PI) / TAU) * NP) % NP) + NP) % NP;
const binT = (th) => Math.min(NT - 1, Math.max(0, Math.floor((th / Math.PI) * NT)));

/** The outermost skin in every direction: a radius per bin, the gaps filled from their neighbours. */
export function scalpMap(pts, wts) {
  const R = new Float32Array(NP * NT), has = new Uint8Array(NP * NT), skull = new Uint8Array(NP * NT);
  pts.forEach((q, i) => {
    const { r, th, ph } = polar(q);
    const k = binT(th) * NP + binP(ph);
    if (r > R[k]) { R[k] = r; skull[k] = wts && wts[i] >= 0.9 ? 1 : 0; }
    has[k] = 1;
  });
  // fill the empty bins: a few passes of the mean of filled neighbours (phi wraps)
  const filled = has.slice();
  for (let pass = 0; pass < 40; pass++) {
    let changed = 0;
    const R2 = R.slice(), f2 = filled.slice();
    for (let t = 0; t < NT; t++) for (let pI = 0; pI < NP; pI++) {
      const k = t * NP + pI;
      if (filled[k]) continue;
      let s = 0, c = 0;
      for (const [dt, dp] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const tt = t + dt; if (tt < 0 || tt >= NT) continue;
        const kk = tt * NP + ((pI + dp + NP) % NP);
        if (filled[kk]) { s += R[kk]; c++; }
      }
      if (c) { R2[k] = s / c; f2[k] = 1; changed++; }
    }
    R.set(R2); filled.set(f2);
    if (!changed) break;
  }
  return { R, has, filled, skull };
}

/** The scalp's radius toward (phi, theta), bilinear between bin centres. */
export function radiusAt(map, ph, th) {
  const fp = ((ph + Math.PI) / TAU) * NP - 0.5, ft = (th / Math.PI) * NT - 0.5;
  const p0 = Math.floor(fp), t0 = Math.max(0, Math.min(NT - 2, Math.floor(ft)));
  const ap = fp - p0, at = THREE.MathUtils.clamp(ft - t0, 0, 1);
  const g = (t, pI) => map.R[t * NP + ((pI % NP) + NP) % NP];
  return (g(t0, p0) * (1 - ap) + g(t0, p0 + 1) * ap) * (1 - at) + (g(t0 + 1, p0) * (1 - ap) + g(t0 + 1, p0 + 1) * ap) * at;
}

/** A smoothed copy of the map (a hard shell does not follow every bump), never inside the scalp. */
function smoothMap(map, passes) {
  let R = map.R.slice();
  for (let i = 0; i < passes; i++) {
    const R2 = R.slice();
    for (let t = 1; t < NT - 1; t++) for (let pI = 0; pI < NP; pI++) {
      const k = t * NP + pI;
      R2[k] = (R[k] * 2 + R[k - NP] + R[k + NP] + R[t * NP + (pI + 1) % NP] + R[t * NP + (pI - 1 + NP) % NP]) / 6;
    }
    R = R2;
  }
  return { R, has: map.has, filled: map.filled };
}

/**
 * A shell laid on the head: the padding PAD off the scalp, the hard outside thick further out and
 * smooth, down to edge(phi) (theta of the rim at each azimuth), with a rolled rim joining the two.
 * Returns { group, inner(ph, th), outer(ph, th), fit } in the head's frame.
 */
export function wornShell(head, edge, opts) {
  const thick = opts.thick ?? 0.014, pad = opts.pad ?? PAD;
  const smooth = smoothMap(head.map, opts.smooth ?? 6);
  // near the crown every azimuth meets at one point: blend toward the crown's mean radius there, so
  // the shell closes smoothly instead of in a fan of slightly different radii
  const crown = (m) => { let s = 0; for (let i = 0; i < 24; i++) s += radiusAt(m, -Math.PI + (TAU * i) / 24, 0.05); return s / 24; };
  const c0 = crown(head.map), c1 = crown(smooth);
  const rad = (m, c, ph, th) => { const k = Math.min(1, th / (12 * D)); return c + (radiusAt(m, ph, th) - c) * k * k * (3 - 2 * k); };
  const inner = (ph, th) => dirOf(ph, th).multiplyScalar(rad(head.map, c0, ph, th) + pad);
  const outer = (ph, th) => dirOf(ph, th).multiplyScalar(Math.max(rad(smooth, c1, ph, th) + pad + thick, rad(head.map, c0, ph, th) + pad + thick * 0.6));
  const SP = opts.segPhi ?? 72, ST = opts.segTheta ?? 30;
  const surf = (fn, shrink) => {
    const pos = [], idx = [];
    for (let j = 0; j <= ST; j++) for (let i = 0; i <= SP; i++) {
      const ph = -Math.PI + (TAU * i) / SP, th = Math.max(1e-3, (edge(ph) - shrink) * j / ST);
      const q = fn(ph, th); pos.push(q.x, q.y, q.z);
    }
    for (let j = 0; j < ST; j++) for (let i = 0; i < SP; i++) {
      const a = j * (SP + 1) + i, b = a + 1, c = a + SP + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  };
  const group = new THREE.Group();
  opts.mat.side = THREE.DoubleSide; opts.padMat.side = THREE.DoubleSide;
  const shellMesh = new THREE.Mesh(surf(outer, 0), opts.mat);
  const padMesh = new THREE.Mesh(surf(inner, 0), opts.padMat);
  // the rim: a rolled band from the padding's edge round to the shell's edge
  const pos = [], idx = [];
  const ROLL = 5;
  for (let i = 0; i <= SP; i++) {
    const ph = -Math.PI + (TAU * i) / SP, th = edge(ph);
    const a = inner(ph, th), b = outer(ph, th);
    const down = dirOf(ph, th + 0.02).sub(dirOf(ph, th)).normalize();
    for (let k = 0; k <= ROLL; k++) {
      const s = k / ROLL, q = a.clone().lerp(b, s).addScaledVector(down, Math.sin(s * Math.PI) * (opts.roll ?? 0.004));
      pos.push(q.x, q.y, q.z);
    }
  }
  for (let i = 0; i < SP; i++) for (let k = 0; k < ROLL; k++) {
    const a = i * (ROLL + 1) + k, b = a + 1, c = a + ROLL + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setIndex(idx); rg.computeVertexNormals();
  const rimMat = opts.mat.clone(); rimMat.side = THREE.DoubleSide;
  const rim = new THREE.Mesh(rg, rimMat);
  for (const m of [shellMesh, padMesh, rim]) { m.castShadow = true; m.receiveShadow = true; group.add(m); }
  // what rests on the head: the padding's vertices (not the pole, not the very edge)
  const fit = [];
  for (let j = 2; j < ST; j += 2) for (let i = 0; i < SP; i += 2) {
    const ph = -Math.PI + (TAU * i) / SP, th = edge(ph) * j / ST;
    fit.push(inner(ph, th));
  }
  return { group, inner, outer, fit, edge };
}

/** The rim as a texture the skin shader reads (theta of the edge over pi, one texel per phi). */
export function rimTexture(edge, opts = {}) {
  const N = 256, data = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) {
    const ph = -Math.PI + (TAU * (i + 0.5)) / N;
    data[i * 4] = Math.round(THREE.MathUtils.clamp(edge(ph) / Math.PI, 0, 1) * 255);
    data[i * 4 + 1] = Math.round(THREE.MathUtils.clamp((opts.brim ? opts.brim(ph) : 0), 0, 1) * 255);
    // where hair may show below the rim: the back and the sides behind the ears (opts.hairFrom, the
    // azimuth from the front it starts at), never a fringe
    data[i * 4 + 2] = Math.abs(ph) > (opts.hairFrom ?? 100 * D) ? 255 : 0;
    data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat);
  t.userData.rim = true;
  t.wrapS = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Hang a piece built in the head's frame on the head bone (it keeps that place for good). */
export function wear(p, obj) {
  const head = p.head;
  p.root.updateMatrixWorld(true);
  const bone = p.bones.head;
  bone.updateMatrixWorld(true);
  obj.matrix.copy(bone.matrixWorld.clone().invert().multiply(head.F));
  obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
  bone.add(obj);
  obj.updateMatrixWorld(true);
  obj.userData.worn = true;
  obj.userData.bindLocal = obj.matrix.clone();
  return obj;
}

/** The skin's contact shading for the headgear: the shader darkens the skin just under the rim
    (where the shell rests) and, under a brim, the brow and eyes. The matrix into the gear's frame is
    set each frame, before the skin is drawn. */
export function wornShade(p, gear, edge, opts = {}) {
  const tex = rimTexture(edge, opts);
  const inv = new THREE.Matrix4();
  // the skin (contact shading) and the hair (only below the rim, at the back and sides)
  for (const m of [p.head.skin, ...p.meshes.filter((x) => x.material.name === 'hair')]) {
    const u = m.material.userData.u;
    if (!u || !u.uGearM) continue;
    // (the last helmet's rim goes: each hitter's helmet makes its own)
    const was = u.uGearRim.value;
    if (was && was !== tex && was.userData && was.userData.rim) was.dispose();
    u.uGearRim.value = tex;
    u.uGearOn.value = 1;
    m.visible = true;
    m.onBeforeRender = () => { gear.updateWorldMatrix(true, false); u.uGearM.value.copy(inv.copy(gear.matrixWorld).invert()); };
  }
}

/** The nearest skin vertex of the head to a point (frame coordinates). */
export function snapToSkin(head, q) {
  let best = null, bd = Infinity;
  for (const v of head.pts) { const d = v.distanceToSquared(q); if (d < bd) { bd = d; best = v; } }
  return best.clone();
}

/** The face: its radius toward (phi, theta) smoothed over the nose and lips, for a cage. */
export function faceHull(head) {
  const h = smoothMap(head.map, 3);
  for (let k = 0; k < h.R.length; k++) h.R[k] = Math.max(h.R[k], head.map.R[k]);
  return h;
}

/** Points of a polar path laid on the skin at a lift (straps, bands), in the head's frame. */
export function onSkin(head, path, lift) {
  return path.map(([ph, th]) => dirOf(ph, th).multiplyScalar(radiusAt(head.map, ph, th) + lift));
}

/** theta of a frame point (for landmarks). */
export const thetaOf = (q) => polar(q).th;
export { D, TAU };

/* ---------------------------------------------------------------- the head's landmarks */

/** The head's landmarks, from its own skin: the top of the brows, and each ear (the skin that
    stands out furthest to the side): its azimuth, top, bottom and middle heights, in the frame. */
export function landmarks(head) {
  if (head.L) return head.L;
  let mx = 0;
  for (const q of head.pts) mx = Math.max(mx, Math.abs(q.x));
  const ear = head.pts.filter((q) => Math.abs(q.x) > mx - 0.015);
  const ys = ear.map((q) => q.y);
  const mid = ear.reduce((a, q) => a.add(new THREE.Vector3(Math.abs(q.x), q.y, q.z)), new THREE.Vector3()).multiplyScalar(1 / ear.length);
  const L = {
    yBrow: head.brow ? head.brow.y : 0.01,
    earPh: Math.atan2(mid.x, mid.z), earY: mid.y, earTop: Math.max(...ys), earBot: Math.min(...ys),
  };
  head.L = L;
  return L;
}

/** The theta at which the scalp, toward phi, is at height y in the frame. */
export function thetaAtY(head, ph, y, lift = PAD) {
  let lo = 0.02, hi = Math.PI - 0.05;
  for (let i = 0; i < 26; i++) {
    const th = (lo + hi) / 2;
    if (Math.cos(th) * (radiusAt(head.map, ph, th) + lift) > y) lo = th; else hi = th;
  }
  return (lo + hi) / 2;
}

/** A rim given as a height for each azimuth, turned into theta (a table over phi, wrapped). */
export function rimAtHeights(head, yOf) {
  const N = 180, tab = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) { const ph = -Math.PI + (TAU * i) / N; tab[i] = thetaAtY(head, ph, yOf(ph)); }
  return (ph) => {
    const f = ((ph + Math.PI) / TAU) * N, i = Math.max(0, Math.min(N - 1, Math.floor(f))), a = f - i;
    return tab[i] * (1 - a) + tab[i + 1] * a;
  };
}

const gauss = (x, w) => Math.exp(-(x * x) / (w * w));

/** A molded piece with a thickness: S(u, v) its outer surface over u, v in [0, 1], inward(u, v, q)
    the offset from the outer surface to the inner (its length the thickness). Returns three
    geometries: the outer face, the inner face (wound the other way) and the walls round its edge. */
function thickSheet(S, inward, NU, NV) {
  const O = [], I = [];
  for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
    const u = i / NU, v = j / NV, q = S(u, v);
    O.push(q); I.push(q.clone().add(inward(u, v, q)));
  }
  const grid = (P, flip) => {
    const pos = [], idx = [];
    for (const q of P) pos.push(q.x, q.y, q.z);
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1;
      if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  };
  // the rim round the edge: the boundary in order, outer to inner
  const ring = [];
  for (let i = 0; i <= NU; i++) ring.push(i);
  for (let j = 1; j <= NV; j++) ring.push(j * (NU + 1) + NU);
  for (let i = NU - 1; i >= 0; i--) ring.push(NV * (NU + 1) + i);
  for (let j = NV - 1; j >= 1; j--) ring.push(j * (NU + 1));
  const pos = [], idx = [];
  ring.forEach((k) => { pos.push(O[k].x, O[k].y, O[k].z, I[k].x, I[k].y, I[k].z); });
  const m = ring.length;
  for (let r = 0; r < m; r++) { const a = r * 2, b = ((r + 1) % m) * 2; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const walls = new THREE.BufferGeometry();
  walls.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); walls.setIndex(idx); walls.computeVertexNormals();
  return { outer: grid(O, false), inner: grid(I, true), walls };
}

/* ---------------------------------------------------------------- the batting helmet */

/** A batting helmet worn on this head: the front rim just above the brows, the back down over the
    occipital bulge, one ear flap tight over the ear toward the pitcher (flapSide -1 = the wearer's
    right: a left handed hitter's front ear) with its ear hole, the other side cut round the ear,
    vents over the crown, a short stiff bill, and when jaw is set the jaw guard on the flap. */
export function battingHelmet(head, color, flapSide, opts = {}) {
  const L = landmarks(head);
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
  const padMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.9 });
  // the rim's height round the head: 9 mm over the brows at the front, down to just under the ear's
  // middle at the back (over the occipital bulge); the flap side down over the ear to the jaw
  // hinge, the other side up round the top of the ear
  const yF = L.yBrow + 0.009, yB = L.earY - 0.012;
  const flapAt = (ph) => (flapSide < 0 ? ph < 0 : ph > 0);
  const edge = rimAtHeights(head, (ph) => {
    const a = Math.abs(ph);
    let y = yF + (yB - yF) * Math.pow(a / Math.PI, 0.9);
    if (flapAt(ph)) y = y + (Math.min(y, L.earBot - 0.01) - y) * gauss(a - L.earPh, 26 * D);
    else y = y + (Math.max(y, L.earTop + 0.002) - y) * gauss(a - L.earPh - 4 * D, 17 * D);
    return y;
  });
  const front = edge(0);
  const sh = wornShell(head, edge, { mat, padMat, thick: 0.015, smooth: 120 });
  const g = sh.group;
  const onOuter = (ph, th, lift = 0.0006) => { const q = sh.outer(ph, th); return q.addScaledVector(q.clone().normalize(), lift); };
  // vents: dark slots lying on the crown (two over the brow, two behind, one each side at the back)
  for (const [phDeg, thK, len, wid] of [[-14, 0.32, 0.034, 0.008], [14, 0.32, 0.034, 0.008], [-24, 0.72, 0.03, 0.007], [24, 0.72, 0.03, 0.007], [-160, 0.62, 0.026, 0.007], [160, 0.62, 0.026, 0.007]]) {
    const ph = phDeg * D, th = front * thK;
    const at = onOuter(ph, th), ahead = onOuter(ph, th - 0.05);
    const n = at.clone().normalize(), along = ahead.sub(at).normalize();
    const side = new THREE.Vector3().crossVectors(n, along).normalize();
    const v = new THREE.Mesh(new THREE.CircleGeometry(1, 16), dark);
    v.matrix.makeBasis(side.multiplyScalar(wid / 2), along.multiplyScalar(len / 2), n).setPosition(at);
    v.matrixAutoUpdate = false;
    g.add(v);
  }
  // the ear hole in the flap
  const ePh = (flapSide < 0 ? -1 : 1) * L.earPh;
  const hp = onOuter(ePh, thetaAtY(head, ePh, L.earY), 0.0008);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.0095, 16), dark);
  hole.position.copy(hp); hole.lookAt(hp.clone().add(hp.clone().normalize())); g.add(hole);
  // the bill: a stiff molded visor from the shell's front edge, a little down, the sides curving
  // down with the shell, 6 mm thick, dark underneath (it was a thin plate with a ragged edge)
  {
    const PH = 52 * D, T = 0.006, droop = 17 * D;
    const S = (u, v) => {
      const ph = -PH + 2 * PH * u, c = Math.cos(ph / PH * Math.PI / 2);
      const base = sh.outer(ph, edge(ph) - 0.02).multiplyScalar(0.99);
      const len = 0.004 + 0.04 * Math.pow(c, 0.9);
      const out = new THREE.Vector3(Math.sin(ph) * Math.cos(droop), -Math.sin(droop) - 0.35 * (1 - c), Math.cos(ph) * Math.cos(droop)).normalize();
      return base.addScaledVector(out, len * v).add(new THREE.Vector3(0, -0.008 * v * v, 0));
    };
    const B = thickSheet(S, () => new THREE.Vector3(0, -T, 0), 40, 6);
    const top = new THREE.Mesh(B.outer, mat), under = new THREE.Mesh(B.inner, dark), lip = new THREE.Mesh(B.walls, mat);
    for (const m of [top, under, lip]) { m.name = 'bill'; m.castShadow = true; g.add(m); }
  }
  if (opts.jaw) {
    // the jaw guard: a molded C-flap from the ear flap's lower front edge forward along the jaw to
    // near the corner of the mouth, 7 mm thick, 12 mm off the face. The face under it is measured in
    // level slices from every skin vertex the head bone carries at all (lowPts: the jaw and cheeks
    // are shared with the neck; a guard laid on the skull's map alone went into them, the skin
    // through it in patches): at each height and azimuth the skin furthest from the head's axis
    const P = head.lowPts || head.pts;
    const sx = flapSide < 0 ? -1 : 1, T = 0.007, CLR = 0.012, NU = 24, NV = 8;
    const ph0 = sx * (L.earPh - 22 * D), ph1 = sx * 30 * D;
    const yTop0 = L.earBot + 0.012, yTop1 = L.earBot - 0.01, yBot0 = L.earBot - 0.04, yBot1 = L.earBot - 0.052;
    const across = (ph, y) => {
      let r = 0;
      for (const q of P) {
        if (Math.abs(q.y - y) > 0.008) continue;
        let a = Math.atan2(q.x, q.z) - ph; a = Math.atan2(Math.sin(a), Math.cos(a));
        if (Math.abs(a) < 6 * D) r = Math.max(r, Math.hypot(q.x, q.z) * Math.cos(a));
      }
      return r;
    };
    const PHI = [], Y = [], R = [];
    for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
      const u = i / NU, v = j / NV, ph = THREE.MathUtils.lerp(ph0, ph1, u);
      // the front end rounded: the band closes toward its middle over the last fifth
      const e = u > 0.8 ? Math.sqrt(Math.max(0, 1 - ((u - 0.8) / 0.2) ** 2)) : 1;
      const yt = THREE.MathUtils.lerp(yTop0, yTop1, u), yb = THREE.MathUtils.lerp(yBot0, yBot1, u), ym = (yt + yb) / 2;
      const y = ym + (yt - ym) * Math.max(0.08, e) * (1 - 2 * v);
      PHI.push(ph); Y.push(y); R.push(across(ph, y));
    }
    // a slice with no skin in it takes its neighbours'
    for (let k = 0; k < R.length; k++) if (!R[k]) R[k] = Math.max(...R);
    // smoothed over the guard's own grid (a molding, not a cast of the jaw), never nearer the skin
    // than CLR less 3 mm
    let Rs = R.slice();
    for (let pass = 0; pass < 10; pass++) {
      const N = Rs.slice();
      for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
        let sum = 0, c = 0;
        for (const [di, dj, w] of [[0, 0, 2], [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1]]) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || ii > NU || jj < 0 || jj > NV) continue;
          sum += Rs[jj * (NU + 1) + ii] * w; c += w;
        }
        N[j * (NU + 1) + i] = sum / c;
      }
      Rs = N;
    }
    const S = (u, v) => {
      const k = Math.round(v * NV) * (NU + 1) + Math.round(u * NU), ph = PHI[k];
      const r = Math.max(Rs[k] + CLR, R[k] + CLR - 0.003) + T;
      return new THREE.Vector3(Math.sin(ph) * r, Y[k], Math.cos(ph) * r);
    };
    const J = thickSheet(S, (u, v, q) => new THREE.Vector3(-q.x, 0, -q.z).normalize().multiplyScalar(T), NU, NV);
    const jm = mat.clone();
    for (const m of [new THREE.Mesh(J.outer, jm), new THREE.Mesh(J.inner, padMat), new THREE.Mesh(J.walls, jm)]) { m.name = 'jaw guard'; m.castShadow = true; g.add(m); }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.fit = sh.fit;
  g.userData.edge = edge;
  g.userData.brim = (ph) => Math.max(0, Math.cos(ph)) ** 2;
  return g;
}

/* ---------------------------------------------------------------- the catcher's helmet and mask */

/** A cage of bars over the face, the frame round it resting on the face (padded), at a clearance
    that is wide over the nose and tight at the frame. Returns { group, fit }. */
function faceCage(head, L, metal, padMat, opts) {
  const hull = faceHull(head);
  const top = opts.top, bottom = thetaAtY(head, 0, opts.chin), half = opts.half ?? 62 * D;
  const clr = (ph, th) => {
    const u = Math.abs(ph) / half, v = Math.abs((th - (top + bottom) / 2) / ((bottom - top) / 2));
    const e = Math.max(u, v);                            // 0 in the middle, 1 at the frame
    return (opts.frameClr ?? 0.005) + ((opts.noseClr ?? 0.03) - (opts.frameClr ?? 0.005)) * (1 - e * e);
  };
  const at = (ph, th, extra = 0) => dirOf(ph, th).multiplyScalar(radiusAt(hull, ph, th) + clr(ph, th) + extra);
  const g = new THREE.Group();
  const tube = (pts, r, mat) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.max(8, pts.length * 3), r, 6), mat);
  const R = opts.bar ?? 0.0045;
  // horizontal bars, then the uprights
  for (let k = 1; k < 5; k++) {
    const th = top + (bottom - top) * k / 5, n = 14, pts = [];
    for (let i = 0; i <= n; i++) pts.push(at(-half + 2 * half * i / n, th, 0.004));
    g.add(tube(pts, R, metal));
  }
  for (const s of [-0.5, -0.17, 0.17, 0.5]) {
    const pts = []; for (let i = 0; i <= 8; i++) pts.push(at(s * half, top + (bottom - top) * (0.12 + 0.88 * i / 8), 0.004));
    g.add(tube(pts, R, metal));
  }
  // the frame round the cage, and the pads under it, on the face
  const ring = [];
  const N = 40;
  for (let i = 0; i < N; i++) {
    const s = i / N;
    let ph, th;
    if (s < 0.25) { ph = -half + 2 * half * (s / 0.25); th = top; }
    else if (s < 0.5) { ph = half; th = top + (bottom - top) * ((s - 0.25) / 0.25); }
    else if (s < 0.75) { ph = half - 2 * half * ((s - 0.5) / 0.25); th = bottom; }
    else { ph = -half; th = bottom - (bottom - top) * ((s - 0.75) / 0.25); }
    ring.push([ph, th]);
  }
  // where the frame meets the face: the skin itself under each point of the ring (the nearest skin
  // vertex to the radial point), so the pads rest on the face even where it falls away (the jaw)
  const contact = ring.map(([ph, th]) => snapToSkin(head, dirOf(ph, th).multiplyScalar(radiusAt(head.map, ph, th))));
  const out = (q, d) => q.clone().addScaledVector(q.clone().normalize(), d);
  const framePts = ring.map(([ph, th], i) => {
    const a = at(ph, th, 0.009), b = out(contact[i], PAD + 0.012);
    return a.length() < b.length() ? b : a;
  });
  const fr = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(framePts, true), 80, opts.frameR ?? 0.006, 8, true), metal);
  g.add(fr);
  const padPts = contact.map((q) => out(q, PAD + 0.006));
  const pads = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(padPts, true), 80, 0.006, 8, true), padMat);
  g.add(pads);
  // the pads rest on the face: their inner side
  const fit = contact.map((q) => out(q, PAD));
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, fit, top, bottom, half, at };
}

/** The catcher's hockey style helmet and mask: a shell from the brow over the back of the head to
    the nape and down over the ears, open at the face, the cage over the face with its padded
    frame on the face, a throat guard hanging from the chin bar. */
export function catcherHelmet(head, color) {
  const L = landmarks(head);
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.15 });
  const padMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.45, metalness: 0.6 });
  // open at the face (to 6 mm over the brows), down past the ears to the jaw at the sides
  const sstep = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  // (at the back it comes up to the ear's middle, clear of the nape as the head tips back)
  const yF = L.yBrow + 0.006, yLow = L.earBot - 0.022, yBack = L.earY - 0.006;
  const edge = rimAtHeights(head, (ph) => {
    const a = Math.abs(ph);
    return yF + (yLow - yF) * sstep(54 * D, 88 * D, a) + (yBack - yLow) * sstep(96 * D, 132 * D, a);
  });
  const sh = wornShell(head, edge, { mat, padMat, thick: 0.016, smooth: 120 });
  const g = sh.group;
  const cage = faceCage(head, L, metal, padMat, { top: edge(0), chin: L.earBot - 0.055, half: 58 * D, noseClr: 0.032, frameClr: 0.004, bar: 0.0052 });
  g.add(cage.group);
  // the throat guard: hangs from the cage's bottom bar
  const tgAt = cage.at(0, cage.bottom, 0.012);
  const tg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.07, 10, 1, true, -Math.PI / 2, Math.PI), metal);
  tg.position.copy(tgAt).add(new THREE.Vector3(0, -0.035, 0.004)); tg.rotation.x = -0.2; tg.castShadow = true;
  g.add(tg);
  g.userData.fit = sh.fit.concat(cage.fit);
  g.userData.edge = edge;
  return g;
}

/* ---------------------------------------------------------------- the umpire's cap and mask */

/** A ball cap worn on this head: the band level round the head at the hair line, above the ears,
    the crown on the head (higher at the front panels), a curved brim. */
export function cap(head, color, opts = {}) {
  const L = landmarks(head);
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.85, sheen: 1, sheenRoughness: 0.7, sheenColor: new THREE.Color(color).multiplyScalar(0.5) });
  const padMat = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.95 });
  // the band: at the hair line 3 cm over the brows at the front, level round the head over the ears,
  // a little lower at the back
  const yF = L.yBrow + 0.03, yB = L.earTop - 0.012;
  const edge = rimAtHeights(head, (ph) => {
    const a = Math.abs(ph);
    const y = yF + (yB - yF) * (a / Math.PI);
    return y + (Math.max(y, L.earTop + 0.004) - y) * gauss(a - L.earPh, 30 * D);
  });
  const front = edge(0);
  const sh = wornShell(head, edge, { mat, padMat, thick: 0.006, pad: 0.004, smooth: 60, roll: 0.002 });   // over the hair, pressed flat
  const g = sh.group;
  // the front panels stand up: lift the crown's outside over the forehead
  const outerMesh = g.children[0], p = outerMesh.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i);
    const { th, ph } = polar(_v);
    const k = Math.max(0, Math.cos(ph)) * Math.sin(Math.min(th, front) / front * Math.PI) * 0.014;
    _v.addScaledVector(_v.clone().normalize(), k);
    p.setXYZ(i, _v.x, _v.y, _v.z);
  }
  outerMesh.geometry.computeVertexNormals();
  const button = new THREE.Mesh(new THREE.SphereGeometry(0.007, 10, 6), mat);
  button.position.copy(sh.outer(0, 0.001)).add(new THREE.Vector3(0, 0.003, 0)); g.add(button);
  // the brim, from the band at the front, out 7 cm, its sides curving down
  const pts = [], under = [];
  for (let i = 0; i <= 24; i++) {
    const ph = (-72 + (144 * i) / 24) * D, th = edge(ph);
    const base = sh.outer(ph, th);
    const reach = 0.072 * Math.pow(Math.cos(ph * 1.05), 1.2);
    const out = new THREE.Vector3(Math.sin(ph) * 0.4, 0, Math.cos(ph)).normalize().multiplyScalar(reach);
    const droop = -0.028 * Math.pow(Math.abs(Math.sin(ph)), 1.3) - (opts.brimTilt ?? 0.18) * reach;
    const tip = base.clone().add(out).add(new THREE.Vector3(0, droop, 0));
    pts.push([base, tip]);
    under.push([base.clone().add(new THREE.Vector3(0, -0.003, 0)), tip.clone().add(new THREE.Vector3(0, -0.003, 0))]);
  }
  g.add(strip(pts, mat), strip(under, new THREE.MeshStandardMaterial({ color: 0x1a2228, roughness: 0.9 })));
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.fit = sh.fit;
  g.userData.edge = edge;
  g.userData.brim = (ph) => Math.max(0, Math.cos(ph)) ** 1.5;
  return g;
}

/** The umpire's traditional mask, worn under his cap: a black wire cage, its frame padded in tan
    leather on the face, a chin pad, and the harness straps from the frame's sides back round the
    head under the cap, lying on the head. */
export function umpireMask(head, capEdge) {
  const L = landmarks(head);
  const metal = new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.5, metalness: 0.5 });
  const pad = new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.8 });
  const strap = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  const cage = faceCage(head, L, metal, pad, { top: thetaAtY(head, 0, L.yBrow + 0.012), chin: L.earBot - 0.058, half: 56 * D, noseClr: 0.034, frameClr: 0.005, bar: 0.004, frameR: 0.0055 });
  const g = cage.group;
  // the harness: a strap each side from the frame back round the head, below the cap's band
  const fit = cage.fit.slice();
  for (const sx of [-1, 1]) {
    const path = [];
    for (let i = 0; i <= 16; i++) {
      const ph = sx * (56 + (124 * i) / 16) * D;   // from the frame's side round to the back
      const th = (capEdge ? capEdge(ph) : thetaAtY(head, ph, L.earTop)) + 4 * D + (i === 0 ? 6 * D : 0);
      path.push([ph, th]);
    }
    const pts = onSkin(head, path, PAD + 0.002);
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.0022, 4), strap);
    m.scale.set(1, 1, 1); g.add(m);
    for (const q of onSkin(head, path, PAD)) fit.push(q);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.fit = fit;
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

/** How a worn piece sits on its head now (for check-fit.mjs): the skin the head bone carries, as
    posed this frame, measured from the piece's own frame; every point of the piece that rests on
    the head is compared with the skin under it. gap > 0: off the skin; gap < 0: into it. rigid:
    the piece is still on the head bone, at the very place it was hung. */
export function fitNow(p, gear) {
  const head = p.head, inv = new THREE.Matrix4();
  gear.updateWorldMatrix(true, false);
  inv.copy(gear.matrixWorld).invert();
  const pts = head.idx.map((i) => worldVertex(head.skin, i, new THREE.Vector3()).applyMatrix4(inv));
  // the head's skin in 1 cm cells, for the nearest skin to a point
  const C = 0.01, key = (x, y, z) => `${x},${y},${z}`;
  const grid = (keep) => {
    const cells = new Map();
    pts.forEach((q, k) => {
      if (!keep(k)) return;
      const kk = key(Math.floor(q.x / C), Math.floor(q.y / C), Math.floor(q.z / C));
      (cells.get(kk) || cells.set(kk, []).get(kk)).push(k);
    });
    return (q) => {
      const cx = Math.floor(q.x / C), cy = Math.floor(q.y / C), cz = Math.floor(q.z / C);
      let best = -1, bd = Infinity;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
        const l = cells.get(key(cx + a, cy + b, cz + c));
        if (l) for (const k of l) { const d = pts[k].distanceToSquared(q); if (d < bd) { bd = d; best = k; } }
      }
      return best;
    };
  };
  const nearSkull = grid((k) => head.wts[k] >= 0.9), nearAny = grid(() => true);
  let maxGap = -Infinity, minGap = Infinity, n = 0, worstAt = null, deepAt = null;
  const at = (q) => { const { th, ph } = polar(q); return [Math.round(ph / D), Math.round(th / D)]; };
  for (const q of gear.userData.fit) {
    const { th, ph } = polar(q);
    // into the head: the side of the nearest skin (any the head bone carries) the point is on
    const ka = nearAny(q);
    if (ka >= 0) {
      const d = _v.copy(q).sub(pts[ka]).dot(head.nrm[ka]);
      if (d < minGap) { minGap = d; deepAt = at(q); }
    }
    // resting on the head: the nearest skin of the skull itself, where it was the outermost skin
    // when the piece was fitted
    if (!head.map.skull[binT(th) * NP + binP(ph)]) continue;
    const ks = nearSkull(q);
    if (ks < 0) continue;
    // the distance off the skin's surface there (the nearest vertex's tangent plane: the mesh's
    // vertices are a few millimetres apart, its surface is between them)
    const g = _v.copy(q).sub(pts[ks]).dot(head.nrm[ks]);
    n++;
    if (g > maxGap) { maxGap = g; worstAt = at(q); }
  }
  const a = gear.matrix.elements, b = gear.userData.bindLocal.elements;
  let drift = 0;
  for (let k = 0; k < 16; k++) drift = Math.max(drift, Math.abs(a[k] - b[k]));
  return { maxGap, minGap, n, worstAt, deepAt, rigid: gear.parent === p.bones.head && drift < 1e-9, drift };
}
