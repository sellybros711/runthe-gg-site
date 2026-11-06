/* The rest of the ballpark, for the ball in play: the mound and the rubber, the bases, the outfield
 * wall, and empty stands round the field. The ground under it all (the infield dirt, the base paths,
 * the warning track and every chalk line) is field.js's one shader, so nothing here covers the paint (the owner's rule for the seats behind the plate holds here:
 * empty seats read as real, a repeated crowd does not).
 *
 * Sizes are the rule book's: 90 ft between the bases, the rubber 60 ft 6 in from the plate on a mound
 * 18 ft across and 10 in high centred 18 in in front of it (field.js MOUND_C), bases 15 in square. The
 * wall is a generic park (330 ft down the lines, 400 to centre, 8 ft high), not any real one: real
 * ballparks are a later item on the roadmap. Hidden in the pitcher's view (it is all behind him),
 * shown for the broadcast shots of a ball in play. About ten draw calls.
 *
 * The owner (2026-11-05): "the stadium looks a little unfinished in spots and the crowd looks paper thin
 * from certain angles. I want this to look like a real ballpark stadium." So the bowl closes the whole
 * ring behind the plate (the pitcher's wedge, stands.js, is hidden in the broadcast), every row is a real
 * step with a seat back standing on it, every stand that ends has an end wall, the bowl has tunnels
 * (vomitories) and aisles, the dugouts a bench and ends, and the net runs from the backstop along both
 * lines past the dugouts (foul.js netTop, which the ball's flight meets).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FT } from './units.js?v=1';
import { assetUrl } from './load.js?v=9';
import { BASE, MOUND, WALL_H, wallDist } from './inplay-plan.js?v=32';
import { MOUND_C } from './field.js?v=18';
import { foulFront, frontTop, netTop, NET_TO, NET_ARC } from './foul.js?v=2';
import { buildCrowd, crowdClub, crowdImpostor, LOD, FAN_VIS, CROWD_SUN } from './crowd.js?v=2';
import { clubNamed, battingClub } from './clubs.js?v=2';
export { MOUND_C };

const W = (x, y, h = 0) => new THREE.Vector3(-x * FT, h * FT, y * FT);   // field feet to world metres
const D2R = Math.PI / 180;

/** Where the front of the stands is, at angle th (degrees from centre field, + toward right field):
    the outfield wall in fair ground, then a low wall 45 ft off each foul line back to the backstop
    (foul.js foulFront, which a foul ball's flight bounces off). */
export function frontAt(th) {
  return Math.abs(th) <= 45 ? wallDist(th) : foulFront(th);
}

/* THE PARK'S PLAN (degrees th round from centre field, + toward right field; feet). A generic park, not
   any real one: the outfield bleachers with the batter's eye in the middle (18 degrees), the bullpen in a
   pocket behind the left centre wall, the scoreboard over the right centre bleachers, an upper deck from
   50 degrees round to the plate, dugouts in the foul wall between the plate and the bags, three light
   towers a side. */
export const PARK = {
  eye: 9, pen: [-34, -22], penDepth: 40, board: [14, 30], upper: 50, dugout: [76, 100],
  towers: [[-38, 72, 140], [38, 72, 140], [-84, 140, 175], [84, 140, 175], [-116, 140, 175], [116, 140, 175]],
};
// the structure's colours (sRGB hex)
const COL = { eye: 0x0b130f, dark: 0x15191d, roof: 0x8d949c, glass: 0x2b3b4e, steel: 0x9aa1a8, pole: 0xe8c21a };
const isFair = (th) => Math.abs(th) <= 45.5;
const h0At = (th) => (isFair(th) ? WALL_H : frontTop(th));
const inPen = (th) => th >= PARK.pen[0] && th <= PARK.pen[1];
const isDugout = (th) => Math.abs(th) >= PARK.dugout[0] && Math.abs(th) <= PARK.dugout[1];

/** The home club and the visitors from the facts (null, null when unknown). */
function homeAndAway(facts) {
  if (!facts) return { home: null, away: null };
  const ours = clubNamed(facts.pitcher && facts.pitcher.team), theirs = battingClub(facts);
  return facts.situation && facts.situation.usHome ? { home: ours, away: theirs } : { home: theirs, away: ours };
}

/* THE BOWL'S PROFILE (feet: back from the front of the stands, up from the top of its wall), shared by
   the seats and the fans. A row is a tread with a seat back standing on its back edge, SEAT_UP ft above
   the next row's floor (so it hides that row's legs, as seat backs do). rows: { b, f, depth, rise } a row.
   The lower bowl: 21 rows from the wall to the concourse walkway at CONC ft; set back at the bullpen. The
   upper deck: 20 rows from 76 ft back, 59 up. */
const SEAT_UP = 1.3, FIN = 0.3, CONC = 28, CONC_B = 58.2;
export function bowlRows(th) {
  const pen = inPen(th);
  const B0 = pen ? 43 : 1.5, H0 = pen ? 11.5 : 1.0, n = pen ? 6 : 21;
  return rowsOf(B0, H0, n, (CONC_B - B0) / n, (CONC - H0) / n);
}
export const upperRows = () => rowsOf(76, 59, 20, 2.7, 1.45);
function rowsOf(B0, H0, n, depth, rise) {
  return Array.from({ length: n }, (_, k) => ({ k, b: B0 + depth * k, f: H0 + rise * k, depth, rise }));
}
/** The profile's points ([b, up, v]) for rows: tread, the seat back's face, its top, down its back to the
    next row; v is the seat texture's row (k + a share of it). */
function rowPoints(rows) {
  const pts = [];
  for (const r of rows) {
    const top = r.f + r.rise + SEAT_UP, bk = r.b + r.depth - FIN;
    pts.push([r.b, r.f, r.k], [bk, r.f, r.k + 0.5], [bk, top, r.k + 0.85], [r.b + r.depth, top, r.k + 0.92]);
  }
  const L = rows[rows.length - 1];
  pts.push([L.b + L.depth, L.f + L.rise, L.k + 1]);
  return pts;
}
// the seat texture: SEATS seats a tile across (the last of them an aisle's steps), 32 rows a tile down
const SEAT_W = 1.8, SEATS = 16, AISLE = 15;
const seatU = (th, b) => ((frontAt(th) + b) * th * D2R) / SEAT_W;
const isAisle = (th, b) => { const u = seatU(th, b), i = Math.floor(u) % SEATS; return (i < 0 ? i + SEATS : i) === AISLE; };
/* THE TUNNELS (vomitories): a portal in the lower bowl over rows PORTAL[0] to PORTAL[1], 7 ft wide, every
   PORTAL_EVERY ft round the bowl (not in the batter's eye, the bullpen or at a pole). */
const PORTAL = [9, 12], PORTAL_W = 7, PORTAL_EVERY = 105;
const PORTALS = [];
for (const sd of [-1, 1]) {
  let walked = PORTAL_EVERY / 2;
  for (let a = PARK.eye; a <= 178; a += 0.25) {
    walked += (frontAt(a) + 30) * 0.25 * D2R;
    const th = sd * a;
    if (walked < PORTAL_EVERY || Math.abs(a) < PARK.eye + 4 || (th >= PARK.pen[0] - 4 && th <= PARK.pen[1] + 4) || Math.abs(a - 45.5) < 3) continue;
    PORTALS.push(th); walked = 0;
  }
}
const inPortal = (th, b, k) => k >= PORTAL[0] - 1 && k <= PORTAL[1] && PORTALS.some((p) => Math.abs(th - p) * D2R * (frontAt(th) + b) < PORTAL_W / 2 + 1.0);

/* Where the fans sit: every seat of the lower bowl and the upper deck (1.8 ft a seat, on the rows above),
   about four in five filled, emptier in patches (a value noise round the park), facing the plate. None in
   an aisle or a tunnel. */
function crowdSpots() {
  const r = rng(53), out = [];
  const noise = Array.from({ length: 64 }, () => r());
  const patch = (th, k) => { const x = (th + 180) / 9 + k * 0.07, i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f); return noise[i % 64] * (1 - s) + noise[(i + 1) % 64] * s; };
  const up = upperRows();
  // row k (0-20 the lower bowl, 21-40 the upper deck) at th: { b, f }, or null where it has no seats
  const rowOf = (th, k) => {
    if (k < 21) { if (Math.abs(th) <= PARK.eye) return null; const rows = bowlRows(th); return rows[k] || null; }
    if (Math.abs(th) < PARK.upper) return null;
    return up[k - 21];
  };
  for (let k = 0; k < 41; k++) {
    let th = -180 + r() * 0.5;
    while (th < 180) {
      const row = rowOf(th, k);
      const d = frontAt(th) + (row ? row.b : 60);
      if (row) {
        const b = row.b + row.depth * 0.42;
        if (!isAisle(th, b) && !(k < 21 && inPortal(th, b, row.k)) && r() < 0.9 - 0.4 * patch(th, k)) {
          const p = at0(th, b, h0At(th) + row.f);
          out.push({ x: p.x, y: p.y, z: p.z, yaw: Math.atan2(-p.x, -p.z) + (r() - 0.5) * 0.3, s: 0.9 + r() * 0.2 });
        }
      }
      th += (SEAT_W / d) / D2R;
    }
  }
  return out;
}
const at0 = (th, back, h) => { const d = frontAt(th) + back; return W(Math.sin(th * D2R) * d, Math.cos(th * D2R) * d, h); };
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/* The park's materials: few, shared. */
function parkMaterials(renderer, tex) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const canvasTex = (w, h, draw, srgb = true) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; return t; };
  // a row of seats (flipY off: v runs down the canvas, a row each 8 px, ballpark.js rowPoints): the tread
  // and the seat pans (0-4 px), the seat backs' face (4-6.8), their top and back (6.8-8); SEATS seats
  // across, the last an aisle's concrete steps (grey: the material's colour is the club's)
  const seatT = canvasTex(8 * SEATS, 256, (g) => {
    for (let r = 0; r < 32; r++) {
      const y = r * 8;
      g.fillStyle = '#3e4146'; g.fillRect(0, y, 8 * SEATS, 8);
      for (let i = 0; i < SEATS; i++) {
        const x = i * 8;
        if (i === AISLE) { g.fillStyle = '#8e9194'; g.fillRect(x, y, 8, 8); g.fillStyle = '#6c6f73'; g.fillRect(x, y + 4, 8, 1); continue; }
        g.fillStyle = '#9a9a9a'; g.fillRect(x + 1, y + 2, 6, 2);
        g.fillStyle = r % 2 ? '#c9c9c9' : '#d4d4d4'; g.fillRect(x + 0.75, y + 4, 6.5, 2.8);
        g.fillStyle = '#7a7a7a'; g.fillRect(x + 0.75, y + 6.8, 6.5, 0.6);
      }
    }
  });
  seatT.flipY = false;
  // the wall's padding: 5 ft panels with a seam
  const padT = canvasTex(64, 8, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 8); g.fillStyle = '#7f7f7f'; g.fillRect(0, 0, 2, 8); g.fillStyle = '#e6e6e6'; g.fillRect(2, 0, 3, 8); });
  // the light banks: rows of lamps in a dark frame
  const lampT = canvasTex(128, 80, (g, w, h) => {
    g.fillStyle = '#20252b'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 8; x++) {
      const gr = g.createRadialGradient(8 + x * 16, 8 + y * 16, 0, 8 + x * 16, 8 + y * 16, 7);
      gr.addColorStop(0, '#fffef2'); gr.addColorStop(0.6, '#f3eccf'); gr.addColorStop(1, '#5d5a4c');
      g.fillStyle = gr; g.beginPath(); g.arc(8 + x * 16, 8 + y * 16, 6.5, 0, 7); g.fill();
    }
  });
  lampT.wrapS = lampT.wrapT = THREE.ClampToEdgeWrapping;
  const netT = canvasTex(64, 64, (g) => { g.clearRect(0, 0, 64, 64); g.fillStyle = 'rgba(22,26,30,1)'; for (let i = 0; i < 64; i += 8) { g.fillRect(i, 0, 1, 64); g.fillRect(0, i, 64, 1); } });
  const boardT = canvasTex(1024, 320, () => {});
  boardT.wrapS = boardT.wrapT = THREE.ClampToEdgeWrapping;
  const side = THREE.DoubleSide;
  return {
    wall: new THREE.MeshStandardMaterial({ vertexColors: true, map: padT, roughness: 0.85, side }),
    seats: seatMaterial(seatT, (() => { const t = canvasTex(8 * SEATS, 256, () => {}); t.flipY = false; return t; })(), THREE.FrontSide),
    // the net: a fine dark mesh, 1.5 in squares (a texture tile a foot), seen through; far off its mips
    // average to a faint tint, so it never shimmers
    net: new THREE.MeshBasicMaterial({ map: netT, transparent: true, opacity: 0.5, depthWrite: false, side, fog: true }),
    lamps: new THREE.MeshBasicMaterial({ map: lampT, side, fog: true }),
    board: new THREE.MeshBasicMaterial({ map: boardT, side, fog: true, color: 0xb8b8b8 }),
  };
}

/* The seats: the seat rows (tinted the club's colour), and the far crowd painted over them where the fans
   themselves have dissolved (crowd.js LOD: the same size on screen, the same span). */
function seatMaterial(seatT, crowdT, side) {
  // (unlit, lit once a vertex from the sun and the sky, as the fans are, crowd.js: the rows are tens of
  // thousands of small steps over a third of the frame, and the full lit shader on each of their pixels
  // cost the software renderer more than the rest of the broadcast)
  const m = new THREE.MeshBasicMaterial({ map: seatT, side, fog: true });
  crowdT.premultiplyAlpha = true;   // (its gaps are clear: premultiplied, a far mip is a true mix of fans and seats)
  m.userData.crowd = crowdT;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.crowdTex = { value: crowdT };
    sh.uniforms.crowdLod = LOD.uniform;
    sh.uniforms.crowdSun = CROWD_SUN;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSeatW;\nvarying float vSeatLit;\nuniform vec3 crowdSun;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vSeatW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vec3 nS = normalize(mat3(modelMatrix) * normal);
        vSeatLit = 0.66 + 0.5 * max(dot(nS, crowdSun), 0.0) + 0.14 * nS.y;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D crowdTex;\nuniform float crowdLod;\nvarying vec3 vSeatW;\nvarying float vSeatLit;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        diffuseColor.rgb *= vSeatLit;
        float fanPx = ${FAN_VIS.toFixed(2)} * crowdLod / max(distance(cameraPosition, vSeatW), 1.0);
        vec4 ct = texture2D(crowdTex, vMapUv);
        float farK = 1.0 - smoothstep(${LOD.lo.toFixed(1)}, ${LOD.hi.toFixed(1)}, fanPx);
        diffuseColor.rgb = diffuseColor.rgb * (1.0 - farK * ct.a) + farK * ct.rgb * vSeatLit;`);
  };
  return m;
}

/** The scoreboard's face: the innings, the clubs' names (words only), and the count's lights. */
function drawBoard(t, away, home) {
  const c = t.image, g = c.getContext('2d'), w = c.width, h = c.height;
  g.fillStyle = '#0b0f14'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#3a4048'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
  const x0 = 300, cw = 52, amber = '#f2b33d', white = '#e8e6df';
  g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = amber;
  const heads = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'R', 'H', 'E'];
  heads.forEach((s, i) => g.fillText(s, x0 + i * cw + (i >= 9 ? 24 : 0), 52));
  const rows = [away ? away.nick.toUpperCase() : 'VISITORS', home ? home.nick.toUpperCase() : 'HOME'];
  rows.forEach((name, j) => {
    const y = 120 + j * 72;
    g.textAlign = 'left'; g.fillStyle = white; g.font = 'bold 38px sans-serif';
    g.fillText(name.slice(0, 11), 28, y);
    g.textAlign = 'center';
    for (let i = 0; i < heads.length; i++) { g.fillStyle = '#161b22'; g.fillRect(x0 + i * cw + (i >= 9 ? 24 : 0) - 21, y - 26, 42, 52); }
  });
  // the count: ball, strike, out
  g.font = 'bold 28px sans-serif'; g.textAlign = 'left';
  ['BALL', 'STRIKE', 'OUT'].forEach((s, i) => {
    const x = 60 + i * 300;
    g.fillStyle = white; g.fillText(s, x, 285);
    for (let k = 0; k < (i ? 2 : 3); k++) { g.fillStyle = '#2a2f36'; g.beginPath(); g.arc(x + 130 + k * 40, 285, 13, 0, 7); g.fill(); }
  });
  t.needsUpdate = true;
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

  // ---- the mound: 18 ft across, 10 in high, its top a 5 ft table, and the rubber on it
  const moundG = new THREE.CylinderGeometry(MOUND_C.top * FT, MOUND_C.r * FT, MOUND_C.h * FT, 48, 1);
  const mound = new THREE.Mesh(moundG, dirtMat(tex, renderer, 4));
  mound.position.copy(W(MOUND_C.x, MOUND_C.y, MOUND_C.h / 2));
  mound.receiveShadow = true;
  group.add(mound);

  // ---- white things: the bases and the rubber, merged
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
  const chalk = new THREE.Mesh(mergeGeometries(white.map((g) => g.toNonIndexed())), new THREE.MeshStandardMaterial({ color: 0xf1efe8, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  chalk.receiveShadow = true; chalk.renderOrder = 2;
  group.add(chalk);

  // ---- the park round the field (PARK has the plan): the wall, the bowl, the suites, the upper deck, the
  // batter's eye, the bullpen, the dugouts, the scoreboard, the light towers, the poles, the net and the crowd
  const club = { pri: new THREE.Color(), dark: new THREE.Color() };
  const mats = parkMaterials(renderer, tex);
  // th from a to b (degrees), every step and both ends
  const span = (a0, b0, step) => { const out = []; for (let th = a0; th < b0 - 1e-6; th += step) out.push(th); out.push(b0); return out; };
  const ring = span(-180, 180, 1);
  const at = (th, back, up) => { const d = frontAt(th) + back, u = { x: Math.sin(th * D2R), y: Math.cos(th * D2R) }; return W(u.x * d, u.y * d, h0At(th) + up); };
  // a strip round the ring: rows of (back, up) at each step, quads between neighbouring steps
  const strip = (ths, rowsAt, opts = {}) => {
    const pos = [], uv = [], idx = [], col = [];
    let prev = -1;
    ths.forEach((th) => {
      const rows = rowsAt(th);
      if (!rows) { prev = -1; return; }
      const base = pos.length / 3;
      rows.forEach(([b, up, c], k) => {
        pos.push(...at(th, b, up).toArray());
        uv.push(opts.uOf ? opts.uOf(th, b) : ((frontAt(th) + b) * th * D2R) / (opts.uw || 6), opts.vOf ? opts.vOf(b, up, k, c) : k);
        if (opts.colors) col.push(...(c || [1, 1, 1]));
      });
      if (prev >= 0) for (let k = 0; k < rows.length - 1; k++) idx.push(prev + k, base + k, prev + k + 1, prev + k + 1, base + k, base + k + 1);
      prev = base;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (opts.colors) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  };
  // AN END WALL: where a stand stops (a foul pole, the batter's eye, the bullpen, the end of the upper
  // deck), its profile at th closed down to downUp (ft up from the field), so no stand is a shell seen
  // edge on from the side
  const cap = (th, pts, downUp) => {
    const pos = [], h0 = h0At(th);
    for (let i = 0; i < pts.length - 1; i++) {
      const [b0, u0] = pts[i], [b1, u1] = pts[i + 1];
      const A = at(th, b0, u0), B = at(th, b1, u1), A0 = at(th, b0, downUp - h0), B0 = at(th, b1, downUp - h0);
      pos.push(...A.toArray(), ...B.toArray(), ...B0.toArray(), ...A.toArray(), ...B0.toArray(), ...A0.toArray());
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  };
  // a closed polygon in the plane at th (convex: a fan), for the dugouts' ends
  const face = (th, pts) => {
    const pos = [];
    for (let i = 1; i < pts.length - 1; i++) for (const q of [pts[0], pts[i], pts[i + 1]]) pos.push(...at(th, q[0], q[1]).toArray());
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  };
  const CONCRETE = 0x7b7f84;
  const by = { seats: [], dark: [], roof: [], glass: [], conc: [], steel: [], bench: [], tunnel: [], club: [], portal: [], trim: [] };

  // the wall: the padded outfield wall (8 ft, dark green, panel seams, a yellow line on top, a foot deep)
  // and the low wall along the foul ground (4 ft, to the padding's 5 round the backstop, foul.js frontTop).
  // At the dugouts its lower 3.4 ft is open (the dugout behind it); at the bullpen the padded wall stands
  // in front of a pocket of grass 40 ft deep. Behind the plate the backstop's own padding (stands.js).
  const GREEN = [0.07, 0.2, 0.13], LOW = [0.1, 0.14, 0.17], YELLOW = [0.85, 0.7, 0.1];
  const wallRows = (th) => {
    const fair = isFair(th), c = fair ? GREEN : LOW, z = -h0At(th);
    const lo = isDugout(th) ? z + 3.4 : z;
    return [[0, lo, c], [0, 0, c], [0, 0.35, fair ? YELLOW : c], [1, 0.35, fair ? YELLOW : c]];
  };
  const wallOpt = { colors: true, uw: 5, vOf: (b, up, k) => (k >= 2 ? 0.5 : k * 0.95) };
  const solid = [];
  for (const [a0, b0] of [[-NET_ARC, -45.5 - 1e-3], [-45.5, 45.5], [45.5 + 1e-3, NET_ARC]]) solid.push(strip(span(a0, b0, 1), wallRows, wallOpt).toNonIndexed());
  // (the step at each pole, from the outfield wall's top down to the low wall's)
  for (const sd of [-1, 1]) by.conc.push(cap(sd * 45.5, [[0, 0.35], [1, 0.35]], frontTop(46) + 0.35), cap(sd * 45.5, [[0, 0], [0, 0.35]], frontTop(46) + 0.35));

  // the dugouts: a floor, the back wall with the tunnel to the clubhouse in it, the roof, a bench along
  // the back, and an end wall at each end
  const DUG = (th) => { const z = -h0At(th); return [[0, z + 0.05], [9, z + 0.05], [9, z + 3.6], [0.4, z + 3.6]]; };
  for (const sd of [-1, 1]) {
    const lo = sd * PARK.dugout[0], hi = sd * PARK.dugout[1], ths = span(Math.min(lo, hi), Math.max(lo, hi), 1);
    by.dark.push(strip(ths, DUG));
    by.bench.push(strip(ths, (th) => { const z = -h0At(th); return [[6.6, z + 0.05], [6.6, z + 1.5], [8.6, z + 1.5], [8.6, z + 3.2]]; }));
    for (const e of [lo, hi]) by.conc.push(face(e, DUG(e)));
    const mid = sd * (PARK.dugout[0] + PARK.dugout[1]) / 2, w = (3 / (frontAt(mid) + 9)) / D2R;
    by.tunnel.push(strip(span(mid - w, mid + w, w), (th) => { const z = -h0At(th); return [[8.95, z + 0.05], [8.95, z + 3.0]]; }));
  }
  // the dugouts' roof lip in the club's colour
  for (const sd of [-1, 1]) {
    const lo = sd * PARK.dugout[0], hi = sd * PARK.dugout[1];
    by.club.push(strip(span(Math.min(lo, hi), Math.max(lo, hi), 1), (th) => [[-0.05, -h0At(th) + 3.4], [-0.05, 0]]));
  }

  // THE LOWER BOWL, row by row (bowlRows): a tread, a seat back, the next tread up, to the concourse
  // walkway at CONC ft and the suites' glass. Round the whole ring but the batter's eye; set back at the
  // bullpen. Cut where its profile changes (the poles, the bullpen, the eye), and each cut walled.
  const vSeat = (b, up, k, v) => v / 32;
  const bowlPts = (th) => [[0, 0, -0.1], ...rowPoints(bowlRows(th)), [64, CONC, 21.2]];
  const inner = (rows) => rows.map(([b, up, v]) => [b, up, v]);
  const segs = [[-180, -45.5 - 1e-3], [-45.5, PARK.pen[0]], [PARK.pen[0] + 1e-3, PARK.pen[1] - 1e-3], [PARK.pen[1], -PARK.eye], [PARK.eye, 45.5], [45.5 + 1e-3, 180]];
  for (const [a0, b0] of segs) {
    by.seats.push(strip(span(a0, b0, 2), (th) => inner(bowlPts(th)), { uOf: (th, b) => seatU(th, b) / SEATS, vOf: vSeat }));
    for (const e of [a0, b0]) if (Math.abs(e) < 179) by.conc.push(cap(e, bowlPts(e), 0));
  }
  // the bullpen's back wall: padded green like the outfield wall, up to its first row of seats
  const pen = span(PARK.pen[0], PARK.pen[1], 1);
  solid.push(strip(pen, () => [[PARK.penDepth, -WALL_H, GREEN], [PARK.penDepth, 11.5, GREEN]], { colors: true, uw: 5, vOf: (b, up, k) => k }).toNonIndexed());
  // the tunnels: a portal over rows PORTAL, its mouth dark, its sides and its top the bowl's grey concrete
  // (low: a parapet the row above sees over)
  for (const p of PORTALS) {
    const rows = bowlRows(p), r0 = rows[PORTAL[0]], r1 = rows[PORTAL[1] + 1];
    const bF = r0.b, bB = r1.b, f0 = r0.f, top = rows[PORTAL[1]].f + r0.rise + SEAT_UP + 0.2;
    const w = (PORTAL_W / 2) / (frontAt(p) + bF) / D2R;
    by.tunnel.push(strip([p - w, p + w], () => [[bF, f0], [bF, top]]));
    by.portal.push(strip([p - w, p + w], () => [[bF - 0.3, top - 0.8], [bF - 0.3, top], [bB, top]]));
    for (const e of [p - w, p + w]) by.portal.push(cap(e, [[bF - 0.3, top], [bB, top]], h0At(e) + f0));
  }

  // the batter's eye: dead centre, dark, the full height of the bleachers
  by.eye = [strip(span(-PARK.eye, PARK.eye, 1), () => [[0, 0], [30, 40]])];

  // the suite level over the lower bowl (glass), the upper deck's fascia (the club's colour), its rows
  // and the roof's edge. Down the lines and round behind the plate only: the outfield is bleachers. The
  // high home camera (inplay.js, 115 ft back of the plate, 72 up) is in front of the suites and under the
  // upper deck's front edge; the high first and third base cameras stand 61 ft back of the low wall, 58
  // ft up: the suites are 64 ft back, the upper deck 70, so neither is ever in front of their lens.
  const upSegs = [[-180, -PARK.upper], [PARK.upper, 180]];
  const GLASS_LO = [0.1, 0.13, 0.17], GLASS_HI = [0.32, 0.4, 0.48], glassRows = [];
  const upPts = () => [[70, 56, -0.2], ...rowPoints(upperRows()), [130, 108, 21]];
  const UP = upperRows(), upLast = UP[UP.length - 1];
  for (const [a0, b0] of upSegs) {
    const ths = span(a0, b0, 2), th1 = span(a0, b0, 1);
    // the suites: glass, dark below and lighter where it takes the sky, a mullion every 12 ft, a light
    // ledge under them and trim on the upper deck's fascia
    glassRows.push(strip(th1, () => [[64, CONC + 1.2, GLASS_LO], [64, 38, GLASS_LO], [64, 44, GLASS_HI]], { colors: true }));
    by.trim.push(strip(th1, () => [[63.6, CONC], [63.6, CONC + 1.2], [64.4, CONC + 1.2]]));
    by.trim.push(strip(th1, () => [[69.8, 48], [69.8, 48.6]]), strip(th1, () => [[69.8, 55.4], [69.8, 56]]));
    by.dark.push(strip(th1, () => [[64, 44], [70, 48]]));
    by.club.push(strip(th1, () => [[70, 48], [70, 56]]));
    {
      let walked = 0, last = null;
      for (let th = a0; th <= b0 + 1e-6; th += 0.2) {
        const q = at(th, 63.8, 0);
        if (last) walked += q.distanceTo(last);
        last = q;
        if (walked < 12 * FT) continue;
        walked = 0;
        const lo = at(th, 63.8, CONC + 1.2), hi = at(th, 63.8, 44), len = hi.y - lo.y;
        by.trim.push(new THREE.BoxGeometry(0.35 * FT, len, 0.35 * FT).rotateY(Math.atan2(-q.x, -q.z)).translate(q.x, lo.y + len / 2, q.z));
      }
    }
    by.seats.push(strip(ths, () => inner(upPts()).slice(0, -1), { uOf: (th, b) => seatU(th, b) / SEATS, vOf: vSeat }));
    by.conc.push(strip(th1, () => [[upLast.b + upLast.depth, upLast.f + upLast.rise], [130, 108]]));
    by.roof.push(strip(th1, () => [[124, 106], [150, 110]]));
    // the end of the upper deck, walled down to the concourse
    const e = Math.abs(a0) < 179 ? a0 : b0;
    by.conc.push(cap(e, [[64, CONC], [64, 44], [70, 48], [70, 56], ...upPts().slice(1), [150, 110]], h0At(e) + CONC));
  }
  // the back of the bleachers in the outfield
  for (const [a0, b0] of [[-PARK.upper, -PARK.eye], [PARK.eye, PARK.upper]]) {
    by.roof.push(strip(span(a0, b0, 1), () => [[64, CONC], [64, 36], [70, 36]]));
    for (const e of [a0, b0]) by.conc.push(cap(e, [[64, CONC], [64, 36], [70, 36]], h0At(e) + CONC));
  }

  // THE NET (foul.js netTop): from the backstop along both lines past the far end of each dugout, on
  // top of the low wall. A fine mesh (one see through material), thin poles 30 ft apart and at each end,
  // and a cable along its top, in the structure's mesh.
  const netG = [];
  for (const sd of [-1, 1]) {
    const lo = sd * NET_TO, hi = sd * NET_ARC, ths = span(Math.min(lo, hi), Math.max(lo, hi), 1);
    netG.push(strip(ths, (th) => [[0, 0.35], [0, netTop(th) - h0At(th)]], { uw: 1, vOf: (b, up) => up }).toNonIndexed());
    by.steel.push(strip(ths, (th) => [[0, netTop(th) - h0At(th) - 0.12], [0, netTop(th) - h0At(th) + 0.1]]));
    // the poles, by arc length along the front
    let walked = 0, last = null;
    for (let th = NET_TO; th <= NET_ARC + 1e-6; th += 0.25) {
      const q = at(sd * th, 0, 0);
      if (last) walked += q.distanceTo(last);
      last = q;
      if (th === NET_TO || walked >= 30 * FT || th + 0.25 > NET_ARC + 1e-6) {
        walked = 0;
        const top = netTop(th) + 0.3, foot = h0At(sd * th) + 0.35, len = (top - foot) * FT;
        by.steel.push(new THREE.CylinderGeometry(0.1 * FT, 0.14 * FT, len, 6).translate(q.x, foot * FT + len / 2, q.z));
      }
    }
  }
  const netMesh = new THREE.Mesh(mergeGeometries(netG), mats.net);
  netMesh.name = 'parkNet'; netMesh.renderOrder = 3;
  group.add(netMesh);

  // the bullpen: two mounds and two plates on the grass behind the left centre field wall
  const penBits = [], penDirt = [];
  for (const k of [0, 1]) {
    // two lanes along the pocket, 14 ft apart: the mound at the centre field end, the plate 60.5 ft along
    const depth = 13 + k * 14, thM = PARK.pen[1] - 1.5, dM = frontAt(thM) + depth;
    const thP = thM - (60.5 / dM) / D2R, dP = frontAt(thP) + depth;
    const m = { x: Math.sin(thM * D2R) * dM, y: Math.cos(thM * D2R) * dM }, pl = { x: Math.sin(thP * D2R) * dP, y: Math.cos(thP * D2R) * dP };
    penDirt.push(new THREE.CylinderGeometry(2.6 * FT, 9 * FT, (10 / 12) * FT, 24, 1).translate(...W(m.x, m.y, 5 / 12).toArray()));
    penBits.push(new THREE.BoxGeometry(2 * FT, 0.12 * FT, 0.5 * FT).translate(...W(m.x, m.y, 10 / 12 + 0.06).toArray()));
    penBits.push(new THREE.BoxGeometry(1.4 * FT, 0.05 * FT, 1.4 * FT).translate(...W(pl.x, pl.y, 0.03).toArray()));
  }
  // (into the mound's and the bags' meshes: no draw of their own)
  const mg = mound.geometry.clone().translate(mound.position.x, mound.position.y, mound.position.z);
  mound.geometry = mergeGeometries([mg, ...penDirt].map((g) => g.toNonIndexed())); mound.position.set(0, 0, 0);
  chalk.geometry = mergeGeometries([chalk.geometry, ...penBits.map((g) => g.toNonIndexed())]);

  // the scoreboard: over the right centre field bleachers (no logos; the clubs' names, the innings, the
  // count's lights; no numbers, as no number on it would be the game's)
  const board = ring.filter((th) => th >= PARK.board[0] - 0.01 && th <= PARK.board[1] + 0.01);
  const sbG = strip(board, () => [[74, 34], [74, 72]]);
  const uvs = sbG.getAttribute('uv');
  for (let i = 0; i < uvs.count; i++) { const k = Math.floor(i / 2), j = i % 2; uvs.setXY(i, k / (board.length - 1), j); }
  group.add(new THREE.Mesh(sbG, mats.board));
  by.dark.push(strip(board, () => [[76, 30], [76, 74], [74, 74]]));
  for (const e of [board[0], board[board.length - 1]]) by.dark.push(cap(e, [[74, 74], [76, 74], [76, 30]], h0At(e) + 30));
  group.add(new THREE.Mesh(mergeGeometries(by.seats.map((g) => g.toNonIndexed())), mats.seats));
  // THE STRUCTURE IS ONE MESH: the wall, the dugouts and the bullpen, the batter's eye, the concrete of
  // the end walls and the tunnels, the suites, the upper deck's fascia (the club's colour), the roofs, the
  // towers' steel, the net's poles and cable and the foul poles, each painted in vertex colours on the
  // wall's material (their uv on the padding's plain white). Every piece spans the ring, so a material of
  // its own was a draw from any camera.
  const paint = (g, hex) => {
    const n = g.index ? g.toNonIndexed() : g, c = new THREE.Color(hex), k = n.getAttribute('position').count;
    n.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(k * 3).map((_, i) => [c.r, c.g, c.b][i % 3]), 3));
    n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(k * 2).fill(0.5), 2));
    if (!n.getAttribute('normal')) n.computeVertexNormals();
    return n;
  };
  for (const g of by.dark) solid.push(paint(g, COL.dark));
  for (const g of by.roof) solid.push(paint(g, COL.roof));
  for (const g of by.glass) solid.push(paint(g, COL.glass));
  for (const g of glassRows) { const n = g.toNonIndexed(); n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.getAttribute('position').count * 2).fill(0.5), 2)); solid.push(n); }
  for (const g of by.conc) solid.push(paint(g, CONCRETE));
  for (const g of by.bench) solid.push(paint(g, 0x5a4634));
  for (const g of by.portal) solid.push(paint(g, 0x4c5157));
  for (const g of by.trim) solid.push(paint(g, 0xc9ccd0));
  for (const g of by.tunnel) solid.push(paint(g, 0x07090b));
  for (const g of by.steel) solid.push(paint(g, 0x23282d));
  for (const g of by.eye) solid.push(paint(g, COL.eye));

  // the light towers: three a side, behind the bleachers and the upper deck, banks facing the plate
  const poleG = [], bankG = [];
  for (const [th, back, top] of PARK.towers) {
    const base = at(th, back, -h0At(th)), head = at(th, back, top - h0At(th));
    const len = head.y - base.y;
    poleG.push(new THREE.CylinderGeometry(0.4, 0.7, len, 8).translate(base.x, base.y + len / 2, base.z));
    const bank = new THREE.PlaneGeometry(36 * FT, 22 * FT);
    bank.rotateX(0.25);   // tipped down at the field
    bank.rotateY(Math.atan2(-head.x, -head.z));
    bankG.push(bank.translate(head.x, head.y + 11 * FT, head.z));
    poleG.push(new THREE.BoxGeometry(38 * FT, 1.2 * FT, 1.2 * FT).rotateY(Math.atan2(-head.x, -head.z)).translate(head.x, head.y, head.z));
  }
  for (const g of poleG) solid.push(paint(g, COL.steel));
  group.add(new THREE.Mesh(mergeGeometries(bankG), mats.lamps));

  // the foul poles
  const poles = [];
  for (const sd of [-1, 1]) poles.push(new THREE.CylinderGeometry(0.2 * FT, 0.2 * FT, 70 * FT, 8).translate(...W(sd * 330 * Math.SQRT1_2, 330 * Math.SQRT1_2, 35).toArray()));
  for (const g of poles) solid.push(paint(g, COL.pole));
  // the club's pieces at the end of the merged mesh, so setClub repaints one run of vertices
  let clubFrom = 0;
  for (const g of solid) clubFrom += g.getAttribute('position').count;
  for (const g of by.club) solid.push(paint(g, COL.dark));
  const solidG = mergeGeometries(solid.map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k); return g; }));
  group.add(new THREE.Mesh(solidG, mats.wall));
  const paintClub = (c) => { const col = solidG.getAttribute('color'); for (let i = clubFrom; i < col.count; i++) col.setXYZ(i, c.r, c.g, c.b); col.needsUpdate = true; };

  // ---- the crowd, in the lower bowl and the upper deck
  group.add(buildCrowd(crowdSpots(), { sectors: 8, blur: 0, lift: 0.36, chest: true, lod: true, face: true }));

  // the home club's colours on the park (the upper deck's fascia, the dugouts' lip, the seats) and the
  // names on the scoreboard: the stage's facts (crowd.js crowdClub has the rule)
  group.userData.setClub = (facts) => {
    const { home, away } = homeAndAway(facts);
    club.pri.set(home ? home.pri : '#2b3a55');
    paintClub(club.pri);
    mats.seats.color.copy(club.pri).lerp(new THREE.Color(0x9aa0a8), 0.35);
    drawBoard(mats.board.map, away, home);
    crowdClub(facts);
    crowdImpostor(mats.seats.userData.crowd.image); mats.seats.userData.crowd.needsUpdate = true;
  };
  group.userData.setClub(null);
  return group;
}
