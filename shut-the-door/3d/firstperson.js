/* The pitcher in first person: you are him. His glove low in the glove side corner at the set (with
 * one breath and a small pump of the glove as each set comes up), and on the throw his throwing arm and the ball
 * through the frame, then the follow-through. His head's own motion is the camera's (park.js
 * pitcherEye); this is the body you see.
 *
 *   const fp = new FirstPerson(renderer, scene)   the scene's own renderer and park light: he is drawn
 *                                            in a second pass on the same canvas, after the scene,
 *                                            with its depth cleared (no second WebGL context)
 *   fp.setPitcher(facts, kit)               his hand, his arm slot, his skin tone, his club's sleeve
 *   fp.layout(w, h, safe, zone, panels)     the canvas in CSS px, the HUD's safe rect, the zone's grid
 *                                            box on screen, the HUD's panels on the canvas (without a
 *                                            safe rect): the glove keeps out of all of them
 *   fp.pose(t)                              play time t (0: the set; T_RELEASE: the ball leaves his hand)
 *   fp.render(camera)                       the scene's camera, for the sun's direction
 *   fp.lensFor(pitch, eye, camera)          the ball out of his hand (THE LENS, below)
 *
 * HIS ARM. A real throw: Mixamo's Baseball Pitching, the throwing side's shoulder, elbow, wrist and
 * hand only, baked into assets/fparm.glb (lab/pipeline/fparm.py) relative to his eyes. The ball leaves
 * his hand at T_RELEASE, when pitch.js starts the flight. The slot is his own: the pitch's arm angle,
 * else his (pitch.js armAngleFor, Savant's, degrees over the horizontal), else the angle of his
 * release point over his shoulder, else a three quarter 40 degrees. The capture is rolled about his
 * shoulder from its own slot to his, mirrored for a lefty, and turned about his eyes so the ball at
 * release is out along the slot from the zone (H, place). The way in and the way out are each turned on
 * the screen about that point (from nothing at release) by the least that keeps the arm off the zone
 * and the HUD (clearTurn): the real follow-through crosses his body, which would cross the zone. The
 * sleeve is his club's undershirt (people.js kitFor, the closer's side), the skin his tone (looks.js,
 * from his name: never his real look, as for the hitters).
 *
 * THE LENS. The scene's lens is long (the hitter large on a phone, a few degrees wide), so the real
 * release point, a couple of feet in front of his eyes and out to his arm side, is far off the
 * screen, and a ball drawn there would fill it. The arm is drawn with a natural lens (30 degrees each
 * way across the short side) in his own pass, and the ball leaves his hand where his hand is on that
 * screen, the size it is in his hand. On the long lens a ball that size on that spot is far out along
 * the line of sight through his hand, and the pitch's flight starts there (lensFor, THE START): one
 * constant acceleration (pitch.js flight) to the engine's crossing, in his own time, with his own
 * break, at its own size the whole way. It is the pitch a long lens shows from behind him, as the
 * centre field camera does. The only thing added to it is his head: the hand is drawn with his head,
 * so near the hand the ball carries his head's move since release, all of it at release and none at
 * the plate (lens.carry). Until 2026-10-30 the ball was eased from his hand onto the flight from his
 * real release, which came in from far off the screen: it overshot that path and turned back onto it,
 * the zig zag the owner saw (check-pitch-path.mjs holds it now).
 */
import * as THREE from 'three';
import { smooth, clamp01 } from './units.js?v=1';
import { spline, reducedMotion, SUN } from './park.js?v=6';
import { baseball } from './gear3d.js?v=4';
import { look } from './looks.js?v=3';
import { assetUrl } from './load.js?v=8';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { T_RELEASE } from './pitch.js?v=13';

const HALF = THREE.MathUtils.degToRad(30), TAN = Math.tan(HALF);   // the arm's lens, each way across the short side
const GLOVE_M = 0.31;            // the glove, heel to fingertips, metres
const GLOVE_TIP = 22, GLOVE_YAW = THREE.MathUtils.degToRad(-32), GLOVE_LEAN = THREE.MathUtils.degToRad(-14);   // its set
const BALL_M = 2.9 * 0.0254;
const FT_M = 0.3048;
const TRAIL_FROM = 0.45;        // the trail starts this share of the flight out of his hand
const START_MIN = 0.4;          // the flight starts no nearer the plate than this share of his release's distance     // a baseball's diameter, metres
export const IDLE_S = 4.2;       // his breath at the set, seconds
const SKIN_LIGHT = new THREE.Color('#d8a184'), SKIN_DARK = new THREE.Color('#5a3a2a');

/* The glove through the delivery, from the set: [t, toward the screen's middle (units), up (units),
   further away (m), the fingers tipped forward (degrees)]. A unit is half the screen's short side.
   It lifts a little with his leg, goes out toward the target, tucks to his chest as the arm comes
   through (off the bottom of the screen), and comes back up into his fielding stance. */
const GLOVE_KEYS = [
  [0.00, 0.00, 0.00, 0.00, 0],
  [0.28, 0.05, 0.12, 0.00, 5],
  [0.50, 0.10, 0.18, 0.05, 12],
  [0.68, -0.06, -0.40, 0.00, 20],
  [0.86, -0.30, -1.40, -0.04, 28],
  [1.06, -0.40, -1.90, -0.04, 30],
  [1.32, -0.10, -0.85, 0.00, 12],
  [1.58, 0.00, -0.28, 0.00, 4],
];
/* His throwing arm: a real pitch (Mixamo's Baseball Pitching, lab/pipeline/fparm.py), the throwing
   side's shoulder, elbow and wrist and the hand's turn, relative to his eyes in a frame facing the
   plate (x his arm side, y up, z back), baked into our own small glb (no mesh), with its content hash
   as every asset URL carries one (lab/pipeline/stamp.mjs computes the same). The scene's extras give
   the clip's release (seconds in) and slot (degrees). */
const THROW = new URL('./assets/fparm.glb?h=8dd8eef3e7', import.meta.url).href;
const ARM_ON = [-0.3, 0.45];     // when any of the arm can be on screen (r = t - T_RELEASE)
const LEAD = [1 / 30, 1 / 60];   // his wrist, and the ball in his hand, on the screen at least this long before release
const BALL_IN_HAND = new THREE.Vector3(0, 0.105, -0.03);   // handModel's ball from its origin
const PALM = new THREE.Vector3(0, 0.055, 0);               // handModel's origin from the wrist

/** The baked throw, parsed: per frame shoulder, elbow, wrist (xyz) and the hand (xyzw). */
function readThrow(g) {
  const clip = g.animations[0], ex = g.scene.userData || {};
  const tr = (n, p) => clip.tracks.find((k) => k.name === `${n}.${p}`).values;
  const S = tr('shoulder', 'position');
  return { fps: ex.fps, rel: ex.release * ex.fps, slot: THREE.MathUtils.degToRad(ex.slot), n: S.length / 3, S, E: tr('elbow', 'position'), W: tr('hand', 'position'), Q: tr('hand', 'quaternion') };
}

/** His arm slot, degrees over the horizontal. */
export function armSlot(p, rel) {
  if (p && Number.isFinite(p.armAngle)) return Math.max(-10, Math.min(95, p.armAngle));
  // his own release point (not the stand in): its angle over a shoulder about 4.9 ft up and 0.6 ft
  // out at release (a stride's height on the mound's slope)
  if (rel && !rel.assumed) return THREE.MathUtils.radToDeg(Math.atan2(rel.z - 4.9, Math.max(0.2, Math.abs(rel.x) - 0.6)));
  return 40;
}

/* THE GLOVE: a real pitcher's glove, about 11.75 inches, from his own eyes. One smooth leather
   surface built from its parts (a distance field: the palm and its pocket, four finger stalls, the
   thumb, a closed web, the heel roll, the wrist opening, the back strap and a blank patch on it),
   meshed once with surface nets, then its rawhide: the lace wrapped along the fingertips, over the web
   and down the thumb, round the heel, the web's basket weave, and stitched seams down the back. Two
   meshes, two draws, nothing downloaded but the leather maps the park already has. Its frame: a left
   hand, the fingers up (+y), the back of the hand toward his eyes at the set (+z), the pocket away
   (-z), the thumb to +x. Its colours are per vertex (linear, over the leather map's own mean colour),
   so a club's colourway is a repaint (paintGlove), never a rebuild. */
const GLOVE_UP = 0.035;
const TEX_MEAN = [0.082, 0.026, 0.0052];          // leather_color.webp's mean, linear
const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);
/** A round cone along a polyline of [x, y, z, r]: r wide, deep times r deep (z). Far from its box
    (by 2 cm), the distance to the box (less than the true one, the same sign: enough there). */
function cone(px, py, pz, P, deep) {
  const B = P.box || (P.box = [0, 1, 2].map((k) => [Math.min(...P.map((q) => q[k] - q[3] * (k === 2 ? deep : 1))), Math.max(...P.map((q) => q[k] + q[3] * (k === 2 ? deep : 1)))]));
  const bx = Math.max(B[0][0] - px, px - B[0][1], 0), by = Math.max(B[1][0] - py, py - B[1][1], 0), bz = Math.max(B[2][0] - pz, pz - B[2][1], 0);
  if (bx > 0.02 || by > 0.02 || bz > 0.02) return len3(bx, by, bz);
  let d = Infinity;
  const qz = pz / deep;
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i], b = P[i + 1], az = a[2] / deep, bz = b[2] / deep;
    const ex = b[0] - a[0], ey = b[1] - a[1], ez = bz - az;
    const t = Math.min(1, Math.max(0, ((px - a[0]) * ex + (py - a[1]) * ey + (qz - az) * ez) / (ex * ex + ey * ey + ez * ez)));
    const dx = px - a[0] - t * ex, dy = py - a[1] - t * ey, dz = qz - az - t * ez;
    d = Math.min(d, len3(dx, dy, dz) - (a[3] + t * (b[3] - a[3])));
  }
  return d;
}
function ellipsoid(px, py, pz, rx, ry, rz) {
  const k0 = len3(px / rx, py / ry, pz / rz), k1 = len3(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
  return k0 * (k0 - 1) / (k1 || 1e-9);
}
/** A closed polygon's signed distance in its plane (inside negative). */
function polygon(px, py, V) {
  let d = Infinity, s = 1;
  for (let i = 0, j = V.length - 1; i < V.length; j = i, i++) {
    const ex = V[j][0] - V[i][0], ey = V[j][1] - V[i][1], wx = px - V[i][0], wy = py - V[i][1];
    const t = Math.min(1, Math.max(0, (wx * ex + wy * ey) / (ex * ex + ey * ey)));
    d = Math.min(d, (wx - ex * t) ** 2 + (wy - ey * t) ** 2);
    const c1 = py >= V[i][1], c2 = py < V[j][1], c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}
// the finger stalls, pinky to index: [x, y, z, radius] from the base to the tip, curled toward the pocket
const STALLS = [
  [[-0.051, -0.035, 0, 0.0205], [-0.054, 0.04, -0.004, 0.0195], [-0.062, 0.104, -0.014, 0.017]],
  [[-0.017, -0.03, 0, 0.0205], [-0.019, 0.06, -0.004, 0.0195], [-0.023, 0.134, -0.017, 0.0175]],
  [[0.017, -0.03, 0, 0.0205], [0.017, 0.065, -0.004, 0.0195], [0.016, 0.151, -0.019, 0.0175]],
  [[0.051, -0.03, 0, 0.0205], [0.052, 0.055, -0.004, 0.0195], [0.056, 0.138, -0.017, 0.017]],
];
const THUMB = [[0.06, -0.1, -0.012, 0.022], [0.094, -0.02, -0.02, 0.019], [0.122, 0.058, -0.03, 0.016]];
const WEB = [[0.07, -0.01], [0.126, 0.062], [0.12, 0.1], [0.098, 0.13], [0.072, 0.144], [0.058, 0.05]];
const HEEL = [[-0.054, -0.122, -0.006, 0.026], [0.05, -0.126, -0.006, 0.026]];
/** The glove's parts at a point: palm, heel, the four stalls, thumb, web (each its own distance). */
function gloveParts(x, y, z, o) {
  const w = 0.078 * (1 + 0.12 * Math.max(-1, Math.min(1, (y + 0.06) / 0.08)));
  o[0] = ellipsoid(x, y + 0.06, z, w, 0.082, 0.029);
  o[1] = cone(x, y, z, HEEL, 1);
  for (let i = 0; i < 4; i++) o[2 + i] = cone(x, y, z, STALLS[i], 1.12);
  o[6] = cone(x, y, z, THUMB, 1.2);
  const dw = polygon(x, y, WEB) - 0.003, dz = Math.abs(z + 0.014) - 0.0042;
  o[7] = Math.min(Math.max(dw, dz), 0) + Math.sqrt(Math.max(dw, 0) ** 2 + Math.max(dz, 0) ** 2);
  return o;
}
/** The back strap at a point (0..1), and the patch on it (patchAt). */
const strapAt = (x, y, z) => (y < -0.108 || y > -0.069 || z < -0.004 ? 0 : sstep(-0.107, -0.103, y) * (1 - sstep(-0.074, -0.07, y)) * sstep(-0.004, 0.012, z));
const patchAt = (x, y, s) => (s ? s * (1 - sstep(0.8, 1, ((x + 0.016) / 0.024) ** 2 + ((y + 0.0885) / 0.0115) ** 2)) : 0);
const PARTS = new Float64Array(8);
function gloveD(x, y, z) {
  const o = gloveParts(x, y, z, PARTS);
  let f = smin(smin(o[2], o[3], 0.004), smin(o[4], o[5], 0.004), 0.004);
  let d = smin(o[0], o[1], 0.014);
  d = smin(d, f, 0.008);
  d = smin(d, o[6], 0.01);
  d = smin(d, o[7], 0.005);
  d = smax(d, -(len3(x - 0.02, y - 0.02, z + 0.087) - 0.07), 0.012);                // the pocket
  d = smax(d, -ellipsoid(x, y + 0.152, z - 0.036, 0.056, 0.036, 0.03), 0.008);       // the wrist opening
  const s = strapAt(x, y, z);
  return d - 0.003 * s - 0.0015 * patchAt(x, y, s);
}
function gradD(x, y, z, n) {
  const e = 0.0004, a = gloveD(x + e, y - e, z - e), b = gloveD(x - e, y - e, z + e), c = gloveD(x - e, y + e, z - e), d = gloveD(x + e, y + e, z + e);
  n[0] = a - b - c + d; n[1] = -a - b + c + d; n[2] = -a + b - c + d;
  const l = len3(n[0], n[1], n[2]) || 1;
  n[0] /= l; n[1] /= l; n[2] /= l;
  return n;
}
/** A point pulled onto the leather, then lifted off it by off (metres). */
function onLeather(p, off, iters = 4) {
  const n = [0, 0, 0];
  for (let k = 0; k < iters; k++) {
    const d = gloveD(p[0], p[1], p[2]);
    gradD(p[0], p[1], p[2], n);
    p[0] -= n[0] * d; p[1] -= n[1] * d; p[2] -= n[2] * d;
  }
  gradD(p[0], p[1], p[2], n);
  return new THREE.Vector3(p[0] + n[0] * off, p[1] + n[1] * off, p[2] + n[2] * off);
}
/** The leather: surface nets over the field (a 5.5 mm grid). */
function leatherMesh() {
  const h = 0.0055, lo = [-0.092, -0.168, -0.072], N = [44, 63, 24];
  const at = (i, j, k) => i + N[0] * (j + N[1] * k);
  // the field on a grid twice as coarse first: a fine point far from the surface takes the sign of
  // its nearest coarse point (only cells the surface crosses use the values)
  const M = N.map((n) => (n >> 1) + 1), cv = new Float32Array(M[0] * M[1] * M[2]);
  for (let k = 0; k < M[2]; k++) for (let j = 0; j < M[1]; j++) for (let i = 0; i < M[0]; i++) cv[i + M[0] * (j + M[1] * k)] = gloveD(lo[0] + 2 * i * h, lo[1] + 2 * j * h, lo[2] + 2 * k * h);
  const v = new Float32Array(N[0] * N[1] * N[2]), far = 4 * h;
  for (let k = 0; k < N[2]; k++) for (let j = 0; j < N[1]; j++) for (let i = 0; i < N[0]; i++) {
    const c = cv[((i + 1) >> 1) + M[0] * (((j + 1) >> 1) + M[1] * ((k + 1) >> 1))];
    v[at(i, j, k)] = Math.abs(c) > far ? c : gloveD(lo[0] + i * h, lo[1] + j * h, lo[2] + k * h);
  }
  const cell = new Int32Array(N[0] * N[1] * N[2]).fill(-1), pos = [];
  const C = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const g = new Float32Array(8);
  for (let k = 0; k < N[2] - 1; k++) for (let j = 0; j < N[1] - 1; j++) for (let i = 0; i < N[0] - 1; i++) {
    let m = 0;
    for (let c = 0; c < 8; c++) { g[c] = v[at(i + C[c][0], j + C[c][1], k + C[c][2])]; if (g[c] < 0) m |= 1 << c; }
    if (!m || m === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (let e = 0; e < 12; e++) {
      const a = E[e][0], b = E[e][1];
      if ((g[a] < 0) === (g[b] < 0)) continue;
      const t = g[a] / (g[a] - g[b]);
      sx += C[a][0] + t * (C[b][0] - C[a][0]); sy += C[a][1] + t * (C[b][1] - C[a][1]); sz += C[a][2] + t * (C[b][2] - C[a][2]); n++;
    }
    cell[at(i, j, k)] = pos.length / 3;
    pos.push(lo[0] + (i + sx / n) * h, lo[1] + (j + sy / n) * h, lo[2] + (k + sz / n) * h);
  }
  const idx = [];
  const quad = (a, b, c, d) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; idx.push(a, b, c, a, c, d); };
  for (let k = 1; k < N[2] - 1; k++) for (let j = 1; j < N[1] - 1; j++) for (let i = 1; i < N[0] - 1; i++) {
    const s0 = v[at(i, j, k)] < 0;
    if (s0 !== (v[at(i + 1, j, k)] < 0)) quad(cell[at(i, j - 1, k - 1)], cell[at(i, j, k - 1)], cell[at(i, j, k)], cell[at(i, j - 1, k)]);
    if (s0 !== (v[at(i, j + 1, k)] < 0)) quad(cell[at(i - 1, j, k - 1)], cell[at(i - 1, j, k)], cell[at(i, j, k)], cell[at(i, j, k - 1)]);
    if (s0 !== (v[at(i, j, k + 1)] < 0)) quad(cell[at(i - 1, j - 1, k)], cell[at(i, j - 1, k)], cell[at(i, j, k)], cell[at(i - 1, j, k)]);
  }
  const nv = pos.length / 3, nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const region = new Uint8Array(nv), ao = new Float32Array(nv), n = [0, 0, 0], o = new Float64Array(8);
  for (let q = 0; q < nv; q++) {
    gradD(pos[3 * q], pos[3 * q + 1], pos[3 * q + 2], n);
    const p = { x: pos[3 * q], y: pos[3 * q + 1], z: pos[3 * q + 2] };
    nor.set(n, 3 * q);
    uv[2 * q] = p.x * 6 + p.z * 3; uv[2 * q + 1] = p.y * 6;
    // the creases: where two parts meet (the seams between the stalls darkest), and the pocket's shade
    gloveParts(p.x, p.y, p.z, o);
    let a = 0, b = 1;
    if (o[b] < o[a]) { a = 1; b = 0; }
    for (let i = 2; i < 8; i++) { if (o[i] < o[a]) { b = a; a = i; } else if (o[i] < o[b]) b = i; }
    const crease = (a >= 2 && a <= 5 && b >= 2 && b <= 5 ? 0.5 : 0.3) * Math.exp(-(o[b] - o[a]) / 0.0035) * sstep(0.006, 0, o[a] + 0.004);
    const s = strapAt(p.x, p.y, p.z);
    region[q] = patchAt(p.x, p.y, s) > 0.5 ? 2 : s > 0.5 ? 1 : 0;
    ao[q] = (1 - crease) * (0.72 + 0.28 * sstep(-0.6, 0.4, n[2])) * (0.85 + 0.15 * sstep(-0.15, -0.1, p.y));
  }
  // each triangle wound outward (the field's gradient)
  for (let t = 0; t < idx.length; t += 3) {
    const a = 3 * idx[t], b = 3 * idx[t + 1], c = 3 * idx[t + 2];
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const dot = (uy * vz - uz * vy) * (nor[a] + nor[b] + nor[c]) + (uz * vx - ux * vz) * (nor[a + 1] + nor[b + 1] + nor[c + 1]) + (ux * vy - uy * vx) * (nor[a + 2] + nor[b + 2] + nor[c + 2]);
    if (dot < 0) { const k = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = k; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
  geo.setIndex(idx);
  geo.userData = { region, ao };
  return geo;
}
/** Lace wrapped round a core line inside the leather (a helix, pitch metres a turn, pulled onto the
    surface), as points on the leather. */
function wrapLace(core, wrap, pitch) {
  const c = new THREE.CatmullRomCurve3(core.map((p) => new THREE.Vector3(...p))), L = c.getLength();
  const n = Math.ceil(L / pitch * 8), out = [], Z = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i <= n; i++) {
    const u = i / n, p = c.getPointAt(u), T = c.getTangentAt(u);
    const Nn = Z.clone().addScaledVector(T, -T.dot(Z)).normalize(), B = new THREE.Vector3().crossVectors(T, Nn);
    const th = 2 * Math.PI * u * L / pitch;
    p.addScaledVector(Nn, wrap * Math.cos(th)).addScaledVector(B, wrap * Math.sin(th));
    out.push(onLeather(p.toArray(), 0.0018));
  }
  return out;
}
/** A line laid on the back of the leather (from z0 down onto it). */
function laidLace(pts, off, step = 0.004, z0 = 0.06) {
  const out = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [a, b] = [pts[i], pts[i + 1]], m = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = i ? 1 : 0; k <= m; k++) out.push(onLeather([a[0] + (b[0] - a[0]) * k / m, a[1] + (b[1] - a[1]) * k / m, z0], off));
  }
  return out;
}
/** The rawhide: laces (kind 0) and stitches (kind 1) in one mesh. */
function laceMesh() {
  const parts = [];
  const tube = (pts, r, radial, kind) => {
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.max(1, pts.length - 1), r, radial, false);
    g.userData.kind = kind; parts.push(g);
  };
  // along the fingertips: up the pinky's side and over each tip; then the web's top edge, tighter
  // (it is one thin piece); then over the thumb's tip and down its side
  tube(wrapLace([[-0.074, -0.03, -0.004], [-0.074, 0.04, -0.008], [-0.07, 0.094, -0.013], [-0.056, 0.11, -0.015], [-0.038, 0.11, -0.016], [-0.02, 0.13, -0.017],
    [-0.002, 0.128, -0.018], [0.016, 0.146, -0.019], [0.034, 0.13, -0.018], [0.056, 0.134, -0.017], [0.066, 0.13, -0.016]], 0.017, 0.0105), 0.0022, 4, 0);
  tube(wrapLace([[0.066, 0.14, -0.014], [0.098, 0.128, -0.014], [0.12, 0.099, -0.014], [0.125, 0.075, -0.014]], 0.0075, 0.009), 0.0022, 4, 0);
  tube(wrapLace([[0.124, 0.07, -0.028], [0.123, 0.05, -0.03], [0.114, 0.0, -0.022], [0.094, -0.07, -0.016]], 0.017, 0.0105), 0.0022, 4, 0);
  // round the heel
  tube(wrapLace([[0.058, -0.127, -0.006], [0.0, -0.126, -0.006], [-0.06, -0.122, -0.006]], 0.027, 0.012), 0.0022, 4, 0);
  // the web's basket: three across, two up, laid on its back
  for (const y of [0.06, 0.088, 0.114]) tube(laidLace([[0.07, y], [0.09, y + 0.004], [0.118 - Math.max(0, y - 0.1) * 1.2, y + 0.002]], 0.0022, 0.004, -0.004), 0.0026, 4, 0);
  for (const x of [0.084, 0.102]) tube(laidLace([[x - 0.004, 0.03], [x, 0.08], [x - 0.004, 0.138 - (x - 0.084) * 1.2]], 0.0016, 0.004, -0.004), 0.0026, 4, 0);
  // stitches: two rows down each seam between the stalls, round the patch, along the strap's edges
  const dashes = (pts) => {
    for (let i = 0; i + 1 < pts.length; i += 2) tube([pts[i], pts[i + 1]], 0.0009, 3, 1);
  };
  const row = (a, b, step = 0.0032) => dashes(laidLace([a, b], 0.0006, step));
  for (const [x, top] of [[-0.035, 0.08], [0, 0.115], [0.035, 0.11]]) for (const s of [-1, 1]) row([x + s * 0.0055, -0.02], [x + s * 0.0075, top]);
  for (const y of [-0.0705, -0.1065]) row([-0.064, y], [0.06, y]);
  const ring = [];
  for (let k = 0; k <= 36; k++) { const a = k / 36 * 2 * Math.PI; ring.push([-0.016 + 0.0205 * Math.cos(a), -0.0885 + 0.0085 * Math.sin(a)]); }
  dashes(laidLace(ring, 0.0024, 0.0032));
  // one mesh: position, normal, kind
  let nv = 0, ni = 0;
  for (const g of parts) { nv += g.attributes.position.count; ni += g.index.count; }
  const P = new Float32Array(nv * 3), Nn = new Float32Array(nv * 3), K = new Uint8Array(nv), I = new Uint32Array(ni);
  let o = 0, oi = 0;
  for (const g of parts) {
    P.set(g.attributes.position.array, o * 3); Nn.set(g.attributes.normal.array, o * 3); K.fill(g.userData.kind, o, o + g.attributes.position.count);
    for (let i = 0; i < g.index.count; i++) I[oi + i] = g.index.array[i] + o;
    o += g.attributes.position.count; oi += g.index.count;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
  geo.setIndex(new THREE.BufferAttribute(nv < 65536 ? Uint16Array.from(I) : I, 1));
  geo.userData = { kind: K };
  return geo;
}
/* Real colourways (sRGB): the shell, the strap, the patch, the lace, the stitching. */
const GLOVES = {
  tan: ['#a8784a', '#86592f', '#e9e0cf', '#2e1c12', '#3a2416'],
  black: ['#121010', '#1c1816', '#e4dccb', '#c08a52', '#b98a5a'],
  brown: ['#5e3720', '#47291a', '#e9e0cf', '#c99c62', '#c3955c'],
};
/** The club's glove: black for the navy and black clubs, a dark brown for the reds, else tan. */
export function gloveFor(kit) {
  if (!kit || !kit.trim) return 'tan';
  const c = { h: 0, s: 0, l: 0 };
  kit.trim.getHSL(c);
  if (c.l < 0.14 || (c.h > 0.52 && c.h < 0.78 && c.l < 0.4)) return 'black';
  if (c.s > 0.35 && (c.h < 0.06 || c.h > 0.9)) return 'brown';
  return 'tan';
}
function paintGlove(glove, name) {
  const col = GLOVES[name] || GLOVES.tan, lin = col.map((x) => new THREE.Color(x));
  const [leather, lace] = glove.children;
  const { region, ao } = leather.geometry.userData, C = leather.geometry.attributes.color;
  for (let q = 0; q < C.count; q++) {
    const c = lin[region[q]];
    C.setXYZ(q, c.r / TEX_MEAN[0] * ao[q], c.g / TEX_MEAN[1] * ao[q], c.b / TEX_MEAN[2] * ao[q]);
  }
  C.needsUpdate = true;
  const { kind } = lace.geometry.userData, L = lace.geometry.attributes.color;
  for (let q = 0; q < L.count; q++) { const c = lin[3 + kind[q]]; L.setXYZ(q, c.r, c.g, c.b); }
  L.needsUpdate = true;
  glove.userData.name = name;
}
/** The glove: { leather, lace } materials' maps, built once (a few milliseconds). */
function gloveModel(tex) {
  for (const t of [tex.map, tex.normal]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const g = new THREE.Group();
  // its origin a little under the middle of the palm (so the strap and the heel show over the screen's foot)
  g.add(new THREE.Mesh(leatherMesh().translate(0, GLOVE_UP, 0), new THREE.MeshPhysicalMaterial({ map: tex.map, normalMap: tex.normal, normalScale: new THREE.Vector2(0.6, 0.6), vertexColors: true, roughness: 0.6, clearcoat: 0.15, clearcoatRoughness: 0.4 })));
  g.add(new THREE.Mesh(laceMesh().translate(0, GLOVE_UP, 0), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62 })));
  paintGlove(g, 'tan');
  return g;
}

/** A right hand gripping a ball: the back of the hand toward +z (toward his eyes at release), the
    fingers up (+y), the ball in front of the fingertips (-z). Its origin is the middle of the palm. */
function handModel(skin, ball) {
  const g = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), skin);
  palm.scale.set(0.043, 0.05, 0.017); g.add(palm);
  const seg = new THREE.CapsuleGeometry(0.0095, 1, 3, 8);
  const finger = (x, y, len, curl, splay) => {
    const p = new THREE.Group(); p.position.set(x, y, 0); p.rotation.set(-curl, 0, splay);
    const f = new THREE.Mesh(seg, skin); f.scale.set(1, len, 1); f.position.y = len / 2; p.add(f); g.add(p);
  };
  // index and middle over the ball, ring and pinky tucked at its side, the thumb up under it
  // (seen from behind as the real hand turns through release, a thumb out to the side stood out)
  finger(-0.012, 0.045, 0.072, 0.75, 0.05);
  finger(0.012, 0.045, 0.076, 0.75, -0.05);
  finger(0.03, 0.04, 0.05, 1.6, -0.2);
  finger(0.044, 0.032, 0.04, 1.8, -0.35);
  finger(-0.028, 0.01, 0.055, 0.65, 0.25);
  ball.position.set(0, 0.105, -0.03);
  g.add(ball);
  return g;
}

/** A limb: a closed cylinder stretched between two points each frame, rounded by spheres at the
    joints. */
function limb(mat, r0, r1) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, 1, 18, 1, false), mat);
  m.userData.set = (a, b) => {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    m.position.addVectors(a, b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(UP, d.divideScalar(len || 1));
    m.scale.set(1, len, 1);
  };
  return m;
}
const UP = new THREE.Vector3(0, 1, 0);

export class FirstPerson {
  constructor(renderer, world) {
    this.renderer = renderer;
    this.ok = false;
    this.clock = 0;
    this.idleStart = -Infinity;
    this.t = 0;
    this.settle = Infinity;
    this.hidden = false;
    this.side = 1;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.02, 10);
    // the park's own light (its HDRI, already on the GPU), a little stronger on his near body
    this.scene.environment = world.environment;
    this.scene.environmentRotation.copy(world.environmentRotation);
    this.scene.environmentIntensity = 0.8;
    this.sun = new THREE.DirectionalLight(0xffdcb8, 3.0);
    this.scene.add(this.sun, new THREE.HemisphereLight(0xbcd2ff, 0x5a4a35, 0.35));
    // a soft fill from his own side (his body lit by the sky behind him, not left a silhouette)
    this.fill = new THREE.DirectionalLight(0xfff2e6, 1.1);
    this.fill.position.set(-0.4, 1, 0.6);
    this.scene.add(this.fill);
    const tl = new THREE.TextureLoader();
    const lm = tl.load(assetUrl('tex/leather_color.webp')); lm.colorSpace = THREE.SRGBColorSpace;
    const ln = tl.load(assetUrl('tex/leather_normal.webp'));
    const kn = tl.load(assetUrl('tex/knit_normal.webp')); kn.wrapS = kn.wrapT = THREE.RepeatWrapping; kn.repeat.set(3, 3);
    this.mats = {
      sleeve: new THREE.MeshStandardMaterial({ color: 0x1b2a44, roughness: 0.85, normalMap: kn, normalScale: new THREE.Vector2(0.35, 0.35) }),
      jersey: new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.85, normalMap: kn, normalScale: new THREE.Vector2(0.35, 0.35) }),
      skin: new THREE.MeshStandardMaterial({ color: SKIN_LIGHT.clone(), roughness: 0.55 }),
    };
    const M = this.mats;
    // the glove and the forearm under it, and at the set his throwing hand in it (only his forearm
    // shows, going into the pocket from his arm side)
    this.glove = gloveModel({ map: lm, normal: ln });
    this.gloveArm = limb(M.sleeve, 0.044, 0.04);
    this.setArm = limb(M.sleeve, 0.042, 0.034);
    this.scene.add(this.glove, this.gloveArm, this.setArm);
    // the throwing arm: shoulder, upper arm (the jersey's sleeve then the undershirt), elbow, forearm, hand
    this.ball = baseball();
    this.ball.castShadow = false;
    this.ball.scale.setScalar(BALL_M / (2.9 * 0.0254));
    this.hand = handModel(M.skin, this.ball);
    this.upper = limb(M.sleeve, 0.048, 0.042);
    this.cuff = limb(M.jersey, 0.062, 0.058);
    this.fore = limb(M.sleeve, 0.04, 0.029);
    this.elbow = new THREE.Mesh(new THREE.SphereGeometry(0.042, 16, 12), M.sleeve);
    this.wrist = new THREE.Mesh(new THREE.SphereGeometry(0.027, 12, 10), M.skin);
    this.arm = new THREE.Group();
    this.arm.add(this.hand, this.upper, this.cuff, this.fore, this.elbow, this.wrist);
    this.scene.add(this.arm);
    this.v = [];
    this.throw = null;
    this.fit = null;
    this.ok = true;
    // the throw is a few kilobytes, fetched beside the scene: until it is in, no arm and no lens
    // (the ball flies its own path from his release point)
    new GLTFLoader().loadAsync(THROW).then((g) => { this.throw = readThrow(g); this.place(); }).catch((e) => console.warn('first person arm off', e));
  }

  /** His hand, slot, tone and sleeve. kit: the closer's side (people.js kitFor 'us'). */
  setPitcher(facts, kit) {
    if (!this.ok) return;
    const p = facts.pitcher;
    this.side = p.throws === 'L' ? -1 : 1;
    this.slot = THREE.MathUtils.degToRad(armSlot(p, facts.release));
    const tone = look(p.name || 'pitcher').tone;
    this.mats.skin.color.copy(SKIN_LIGHT).lerp(SKIN_DARK, tone);
    if (kit) {
      this.mats.sleeve.color.copy(kit.undershirt);
      this.mats.jersey.color.copy(kit.base);
    }
    // a righty's glove is on his left hand (the model's); a lefty's is the mirror, as is his hand.
    // Its colourway is his club's (gloveFor)
    this.glove.scale.x = this.side;
    const gc = gloveFor(kit);
    if (gc !== this.glove.userData.name) paintGlove(this.glove, gc);
    this.hand.scale.x = this.side;
    this.place();
  }

  /** Where things go on this screen. safe: the HUD's insets (CSS px) or null; zone: the aim grid's
      box on the canvas (stage.gridRect). */
  layout(w, h, safe, zone, panels) {
    if (!this.ok || !w || !h) return;
    this.w = w; this.h = h; this.safe = safe || null; this.zone = zone || null; this.panels = panels || null;
    this.unit = Math.min(w, h) / 2;
    this.camera.aspect = w / h;
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan((h / 2) / this.unit * TAN));
    this.camera.updateProjectionMatrix();
    this.place();
  }

  /** CSS px and a depth (m) to a point in front of his eyes. */
  at(sx, sy, d, out = new THREE.Vector3()) {
    const k = d * TAN / this.unit;
    return out.set((sx - this.w / 2) * k, (this.h / 2 - sy) * k, -d);
  }

  /** The glove's place at the set and the arm's path, from the layout. */
  place() {
    if (!this.w) return;
    const { w, h, unit, side } = this;
    let bottom = h - (this.safe ? Math.max(0, this.safe.bottom || 0) : 0);
    // the glove: a third of a phone's width, a quarter of a wide screen's height, in his glove side
    // corner, two thirds of it over the bottom (or the HUD's dock)
    const s = Math.min(0.36 * w, 0.26 * h);
    let gx = side > 0 ? 0.42 * s : w - 0.42 * s;
    // no safe rect from the page: keep off the HUD's own panels (layout's panels). A dock along the
    // bottom, it stands on; a tall panel in the corner, it goes beside, toward the middle
    if (!this.safe && this.panels && this.panels.length) {
      const over = (x, floor) => this.panels.filter((p) => p.x1 > x - 0.5 * s && p.x0 < x + 0.5 * s && p.y1 > floor - 0.7 * s && p.y0 < floor);
      const hit = over(gx, h);
      if (hit.length) {
        const top = Math.min(...hit.map((p) => p.y0));
        if (h - top <= 0.3 * h) bottom = top;
        else {
          gx = side > 0 ? Math.max(...hit.map((p) => p.x1)) + 0.5 * s : Math.min(...hit.map((p) => p.x0)) - 0.5 * s;
          const again = over(gx, h);
          if (again.length) bottom = Math.min(...again.map((p) => p.y0));
        }
      }
    }
    let gy = bottom - 0.16 * s;
    // never over the zone's grid: lower it until it clears
    const z = this.zone;
    if (z && gx + 0.5 * s > z.x && gx - 0.5 * s < z.x + z.w) gy = Math.max(gy, z.y + z.h + 10 + 0.5 * s);
    this.gloveRoom = z && gx + 0.5 * s > z.x && gx - 0.5 * s < z.x + z.w ? Math.max(0, (gy - 0.5 * s) - (z.y + z.h + 10)) / unit : Infinity;
    this.gloveDepth = GLOVE_M * unit / (s * TAN);
    this.gloveAt = { x: gx, y: gy };
    // the release point on screen: out along his slot from the zone's middle, inside the screen
    const zc = z ? { x: z.x + z.w / 2, y: z.y + z.h / 2 } : { x: w / 2, y: h / 2 };
    this.dir = { x: side * Math.cos(this.slot ?? 0.7), y: -Math.sin(this.slot ?? 0.7) };
    const H = { x: zc.x + this.dir.x * 0.95 * unit, y: zc.y + this.dir.y * 0.95 * unit };
    H.x = Math.max(0.1 * w, Math.min(0.9 * w, H.x));
    H.y = Math.max(0.1 * h, Math.min(bottom - 0.12 * h, H.y));
    this.Hfloor = bottom - 0.12 * h;
    this.offZone(H);
    this.H = H;
    this.fitThrow();
  }

  /** Never in the zone: a release point over it (a low slot on a narrow screen, the zone nearly as
      wide as it) goes up over the zone's top. */
  offZone(H) {
    const z = this.zone, u = this.unit;
    if (z && H.x > z.x - 0.12 * u && H.x < z.x + z.w + 0.12 * u && H.y > z.y - 0.12 * u && H.y < z.y + z.h + 0.12 * u) H.y = z.y - 0.12 * u;
  }

  /** The baked throw fitted to him and to this screen: rolled about his shoulder (along the line to
      the plate) from the capture's slot to his, mirrored for a lefty, then turned about his eyes so
      the ball at release is at H (as if he looked a little toward his arm side: sizes and shapes as
      his eyes see them). */
  fitThrow() {
    const T = this.throw;
    if (!T || !this.H) { this.fit = null; return; }
    const roll = (this.slot ?? 0.7) - T.slot, i = Math.round(T.rel) * 3;
    const pivot = new THREE.Vector3(T.S[i], T.S[i + 1], T.S[i + 2]);
    this.fit = { roll: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll), pivot, aim: new THREE.Quaternion(), axis: null, pre: 0, post: 0 };
    for (let k = 0; k < 4; k++) {
      const F = this.fit;
      F.aim.identity(); F.axis = null; F.pre = F.post = 0;
      const f = this.frame(0);
      const want = this.at(this.H.x, this.H.y, 1).normalize();
      F.aim.setFromUnitVectors(f.ball.clone().normalize(), want);
      // then the way in and the way out, each turned on the screen about the release point (a turn
      // that grows from nothing at release, so the ball still leaves the hand at H): the least turn
      // that keeps the arm out of the zone and off the HUD's panels
      F.axis = want;
      F.pre = this.clearTurn(-1);
      F.post = this.clearTurn(1);
      // his hand holding the ball must be on the screen for the last frames before it lets go
      // (LEAD): at a release on the screen's edge, or under its top, the hand came in on the very
      // frame the ball left it and the ball seemed thrown by nobody. Bring the release point in by
      // what the hand overhangs, and fit again
      const sh = this.leadShift();
      if (!sh) break;
      this.H.x -= sh.x; this.H.y = Math.min(this.H.y - sh.y, this.Hfloor ?? Infinity);
      this.offZone(this.H);
    }
  }

  /** How far (CSS px) his wrist and the ball in his hand overhang the screen, less a margin, LEAD
      seconds before release: null when they are in. */
  leadShift() {
    const m = 0.06 * this.unit, top = (this.safe ? this.safe.top || 0 : 0) + m;
    const pts = [this.frame(-LEAD[0]).W, this.frame(-LEAD[1]).ball];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity;
    for (const p of pts) {
      if (p.z > -0.05) return null;
      const k = this.unit / (-p.z * TAN), x = this.w / 2 + p.x * k, y = this.h / 2 - p.y * k;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y);
    }
    const sx = Math.max(0, x1 - (this.w - m)) - Math.max(0, m - x0), sy = -Math.max(0, top - y0);
    return Math.abs(sx) < 1 && Math.abs(sy) < 1 ? null : { x: sx, y: sy };
  }

  /** What the arm would cover, phase -1 (before release) or 1 (after), turned by ang: the count of
      arm points that land on the zone or a HUD panel. */
  covers(phase, ang) {
    const F = this.fit, keep = F[phase < 0 ? 'pre' : 'post'];
    F[phase < 0 ? 'pre' : 'post'] = ang;
    const z = this.zone, m = 0.04 * this.unit, boxes = [];
    if (z) boxes.push([z.x - m, z.x + z.w + m, z.y - m, z.y + z.h + m]);
    if (this.safe) {
      if (this.safe.top) boxes.push([-1e9, 1e9, -1e9, this.safe.top]);
      if (this.safe.bottom) boxes.push([-1e9, 1e9, this.h - this.safe.bottom, 1e9]);
    } else for (const p of this.panels || []) boxes.push([p.x0, p.x1, p.y0, p.y1]);
    let n = 0;
    const f = { S: new THREE.Vector3(), E: new THREE.Vector3(), W: new THREE.Vector3(), q: new THREE.Quaternion(), ball: new THREE.Vector3() };
    const tip = new THREE.Vector3(), mid = new THREE.Vector3();
    for (let k = 1; k <= 12; k++) {
      const r = phase * k * (phase < 0 ? -ARM_ON[0] : ARM_ON[1]) / 12;
      this.frame(r, f);
      tip.set(0, 0.17, 0).applyQuaternion(f.q).add(f.W);
      for (const [p, rad] of [[f.E, 0.042], [mid.copy(f.E).lerp(f.W, 0.5), 0.035], [f.W, 0.03], [tip, 0.04], [mid.copy(f.S).lerp(f.E, 0.6), 0.048]]) {
        if (p.z > -0.05) continue;
        const k2 = this.unit / (-p.z * TAN), x = this.w / 2 + p.x * k2, y = this.h / 2 - p.y * k2, rr = rad * k2;
        if (x < -rr || x > this.w + rr || y < -rr || y > this.h + rr) continue;
        if (boxes.some((b) => x + rr > b[0] && x - rr < b[1] && y + rr > b[2] && y - rr < b[3])) n++;
      }
    }
    F[phase < 0 ? 'pre' : 'post'] = keep;
    return n;
  }

  /** The least turn (radians, either way, up to 90 degrees) that keeps one phase of the arm clear;
      none clears, the one that covers least. */
  clearTurn(phase) {
    let best = { n: Infinity, a: 0 };
    for (let d = 0; d <= 90; d += 3) {
      for (const sg of d ? [1, -1] : [1]) {
        const a = THREE.MathUtils.degToRad(d * sg), n = this.covers(phase, a);
        if (n < best.n) best = { n, a };
        if (!n) return a;
      }
    }
    return best.a;
  }

  /** The arm at r seconds from release, fitted (eye space of his own pass, metres): shoulder, elbow,
      wrist, the hand's turn and the ball in it. */
  frame(r, o = { S: new THREE.Vector3(), E: new THREE.Vector3(), W: new THREE.Vector3(), q: new THREE.Quaternion(), ball: new THREE.Vector3() }) {
    const T = this.throw, F = this.fit;
    const x = Math.max(0, Math.min(T.n - 1.001, T.rel + r * T.fps)), i = Math.floor(x), a = x - i;
    const v = (A, out) => out.set(A[3 * i] + (A[3 * i + 3] - A[3 * i]) * a, A[3 * i + 1] + (A[3 * i + 4] - A[3 * i + 1]) * a, A[3 * i + 2] + (A[3 * i + 5] - A[3 * i + 2]) * a);
    const q0 = new THREE.Quaternion().fromArray(T.Q, 4 * i), q1 = new THREE.Quaternion().fromArray(T.Q, 4 * i + 4);
    o.q.copy(q0).slerp(q1, a);
    const turn = F.axis ? new THREE.Quaternion().setFromAxisAngle(F.axis, r < 0 ? F.pre * smooth(clamp01(-r / 0.1)) : F.post * smooth(clamp01(r / 0.08))) : null;
    const m = (p) => {
      p.sub(F.pivot).applyQuaternion(F.roll).add(F.pivot);
      if (this.side < 0) p.x = -p.x;
      p.applyQuaternion(F.aim);
      return turn ? p.applyQuaternion(turn) : p;
    };
    m(v(T.S, o.S)); m(v(T.E, o.E)); m(v(T.W, o.W));
    o.q.premultiply(F.roll);
    if (this.side < 0) { o.q.y = -o.q.y; o.q.z = -o.q.z; }
    o.q.premultiply(F.aim);
    if (turn) o.q.premultiply(turn);
    o.ball.copy(PALM).add(BALL_IN_HAND).applyQuaternion(o.q).add(o.W);
    return o;
  }

  /** The ball's place in his hand on screen at play time t (CSS px), its size (px) and depth (m). */
  gripAt(t) {
    const b = this.frame(t - T_RELEASE).ball, depth = -b.z, k = this.unit / (depth * TAN);
    return { x: this.w / 2 + b.x * k, y: this.h / 2 - b.y * k, depth, px: BALL_M * k };
  }

  pose(t) {
    if (!this.ok || !this.w) return;
    this.t = t;
    const red = reducedMotion();
    const u = this.unit, side = this.side;
    // ---- the glove
    const g = spline(GLOVE_KEYS, Math.max(0, t), []);
    // back to the set by the end of the pitch (the eye's own window, park.js)
    if (t > 0) {
      const s0 = Math.max(1.6, this.settle - 0.8), s1 = Math.max(s0 + 0.3, this.settle - 0.1);
      if (t > s0) { const k = smooth(Math.min(1, (t - s0) / (s1 - s0))); for (let j = 0; j < 4; j++) g[j] *= 1 - k; }
    }
    // as each set comes up: one breath and a small pump of the glove, then still (an idle aim draws
    // nothing: the scene is not drawn again while the player thinks)
    const still = 1 - smooth(clamp01(t / 0.15)), c = this.clock - this.idleStart;
    if (!red && still > 0 && c >= 0 && c < IDLE_S) {
      const breath = 0.5 * (1 - Math.cos(2 * Math.PI * c / IDLE_S));
      const pump = Math.sin(Math.PI * clamp01((c - 0.55 * IDLE_S) / 0.6)) ** 2;
      g[1] += still * (0.022 * breath + 0.03 * pump);
      g[3] += still * 6 * pump;
    }
    g[1] = Math.min(g[1], this.gloveRoom);
    const gd = this.gloveDepth + g[2];
    const gp = this.at(this.gloveAt.x + side * g[0] * u, this.gloveAt.y - g[1] * u, gd);
    this.glove.position.copy(gp);
    // the back of the glove toward his eyes, the fingers up and tipped away, leaning in toward the
    // middle, the pocket turned toward his arm side (the thumb nearest him)
    this.glove.rotation.set(-THREE.MathUtils.degToRad(GLOVE_TIP + g[3]), side * GLOVE_YAW, side * GLOVE_LEAN, 'ZYX');
    this.glove.visible = !this.hidden;
    const gm = this.glove.matrix.compose(this.glove.position, this.glove.quaternion, this.glove.scale);
    // his forearm down out of the frame from the wrist opening, toward his body
    const wristG = new THREE.Vector3(0, GLOVE_UP - 0.13, 0.004).applyMatrix4(gm);
    const elbowG = wristG.clone().add(new THREE.Vector3(-side * 0.08, -0.3, 0.12));
    this.gloveArm.userData.set(elbowG, wristG);
    this.gloveArm.visible = !this.hidden;
    // his throwing hand in the pocket at the set; as his hands break it drops away down his arm side,
    // gone before the throw's own arm comes on
    const brk = smooth(clamp01((t - 0.1) / 0.3));
    const inG = new THREE.Vector3(0.035, GLOVE_UP - 0.05, -0.035).applyMatrix4(gm);
    const drop = new THREE.Vector3(side * 0.3, -0.2, 0.08).multiplyScalar(1 + 1.5 * brk);
    const handG = inG.clone().add(new THREE.Vector3(side * 0.1, -0.25, 0).multiplyScalar(brk));
    this.setArm.userData.set(handG.clone().add(drop), handG);
    this.setArm.visible = !this.hidden && t < 0.45;
    // ---- the throwing arm, around release only
    const r = t - T_RELEASE;
    const on = !this.hidden && !!this.fit && t > 0 && r > ARM_ON[0] && r < ARM_ON[1];
    this.arm.visible = on;
    if (!on) return;
    const f = this.f = this.frame(r, this.f || undefined);
    this.hand.quaternion.copy(f.q);
    this.hand.position.copy(PALM).applyQuaternion(f.q).add(f.W);
    // the ball is in his hand until it leaves it (then it is the scene's: pitch.js and the lens)
    this.ball.visible = r < 0;
    this.upper.userData.set(f.S, f.E);
    this.cuff.userData.set(f.S, f.S.clone().lerp(f.E, 0.35));
    this.fore.userData.set(f.E, f.W);
    this.elbow.position.copy(f.E);
    this.wrist.position.copy(f.W);
  }

  /** Draw him over the scene just drawn, on the same canvas (its depth cleared: his body is always in
      front). The scene's camera gives the sun's direction in his view. Nothing on screen, no draw. */
  render(camera) {
    if (!this.ok || !this.w || !(this.glove.visible || this.arm.visible)) return;
    if (camera && SUN.dir) {
      const inv = camera.quaternion.clone().invert();
      this.sun.position.copy(SUN.dir).applyQuaternion(inv).multiplyScalar(5);
    }
    const r = this.renderer, auto = r.autoClear;
    r.autoClear = false;
    r.clearDepth();
    r.render(this.scene, this.camera);
    r.autoClear = auto;
  }

  /** Is his breath at the set still going (the stage draws until it ends)? */
  breathing() { return this.clock - this.idleStart < IDLE_S; }

  /** THE LENS for one pitch (see the header): { join, hand, carry(tt, out), scale(tt, d) } for
      pitch.js, or null (the pitch then flies from his release). It sets where the flight starts
      (pitch.fly). eye: the stage's pitcherEye (his head at release); camera: the scene's. */
  lensFor(pitch, eye, camera) {
    if (!this.ok || !this.w || !this.H || !this.fit) { pitch.fly(pitch.rel); return null; }
    // the slot of this pitch: its own arm angle, else his, else its release point's (pitch.js
    // armAngleFor, releaseFor); the arm shows around release only, so a new slot never pops
    const slot = THREE.MathUtils.degToRad(armSlot({ armAngle: pitch.armAngle }, pitch.rel || null));
    if (Number.isFinite(slot) && slot !== this.slot) { this.slot = slot; this.place(); }
    if (!this.fit) { pitch.fly(pitch.rel); return null; }
    const W = this.w, Hh = this.h;
    const cam = camera.clone();
    eye.update(pitch.tRel, cam);
    cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    // THE START. His hand lets the ball go at g on this screen, the size of the ball in his hand
    // (g.px). On the scene's long lens that ball is far out along the line of sight through his
    // hand: dHand from his eyes, where a real ball is that size on this screen. The flight starts
    // there (no nearer the plate than START_MIN of his own release's distance), and the rest is the
    // pitch's own (pitch.js fly): to the engine's crossing in his time, at his break. A start at his
    // real release, a couple of feet in front of a long lens, jumps most of the way to where it is
    // headed in the first frame; from dHand it is the pitch a long lens shows from behind him, as the
    // centre field camera does, one smooth arc at its own size the whole way.
    const g = this.gripAt(pitch.tRel), rel = pitch.rel, yPlate = 17 / 12;
    const o = cam.position.clone(), eyeY = o.z / FT_M, cssH = cam.userData.cssH || Hh;
    const dir = new THREE.Vector3(g.x / W * 2 - 1, 1 - g.y / Hh * 2, 0.5).unproject(cam).sub(o).normalize();
    const sizeK = BALL_M / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) * cssH;   // px times metres
    const dHand = sizeK / Math.max(1, g.px) / FT_M;
    const yV = Math.max(yPlate + START_MIN * (rel.y - yPlate), Math.min(rel.y, eyeY - dHand));
    const k = (yV * FT_M - o.z) / dir.z;
    if (!(k > 0) || !Number.isFinite(k)) { pitch.fly(rel); return null; }
    const hit = o.clone().addScaledVector(dir, k);
    pitch.fly({ x: -hit.x / FT_M, y: yV, z: hit.y / FT_M, hand: true });
    // its size: its own, but where the start was held off dHand, the hand's ball easing onto its own
    // by join as if it were further away (its distance + c (1 - k(tt))), so it only ever shrinks
    const c = Math.max(0, sizeK / Math.max(1, g.px) - cam.position.distanceTo(pitch.pointAt(0)));
    const v = pitch.f.v0 * FT_M;
    const join = c > 0 ? Math.min(0.6 * pitch.f.T, Math.max(0.08, 2.2 * c / v)) : 0;
    // (his head's offsets at release, park.js pitcherEye: the carry reads the offsets alone, no camera
    // is posed for it, so a trail of 64 points costs next to nothing)
    const self = this, T = pitch.f.T, side = this.side, at0 = eye.offsets(pitch.tRel, []), at = [];
    return {
      join,
      // the trail and the sparkle start a beat out of his hand, about where they always did
      trail: Math.max(join, TRAIL_FROM * pitch.f.T),
      hand: { x: g.x, y: g.y },
      /** His head's own move since release, the share the ball carries tt seconds out of his hand
          (all of it at his hand, none at the plate), into out: the ball leaves a hand drawn with his
          head, so near his eyes it does not slide against the head's motion. */
      carry(tt, out) {
        const w = 1 - clamp01(tt / T);
        if (self.hidden || !(w > 0) || !(tt >= 0)) return out.set(0, 0, 0);
        // where his eye is (park.js pitcherEye update): P(-hand EYE.x + hand lat, EYE.y - fwd, EYE.z + up)
        eye.offsets(pitch.tRel + tt, at);
        return out.set(-side * (at[0] - at0[0]) * FT_M, (at[2] - at0[2]) * FT_M, -(at[1] - at0[1]) * FT_M).multiplyScalar(w);
      },
      /** The ball's size tt seconds out of his hand, d metres from the eye, as a scale on its own. */
      scale(tt, d) {
        if (self.hidden) return 1;
        return c > 0 ? d / (d + c * (1 - smooth(clamp01(tt / join)))) : 1;
      },
    };
  }
}
