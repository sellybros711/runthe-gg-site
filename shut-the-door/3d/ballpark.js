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
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FT } from './units.js?v=1';
import { assetUrl } from './load.js?v=8';
import { BASE, MOUND, WALL_H, wallDist } from './inplay-plan.js?v=23';
import { MOUND_C } from './field.js?v=8';
import { buildCrowd, crowdClub, crowdImpostor, LOD, FAN_VIS } from './crowd.js?v=1';
import { clubNamed, battingClub } from './clubs.js?v=2';
export { MOUND_C };

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
const h0At = (th) => (isFair(th) ? WALL_H : 4);
const inPen = (th) => th >= PARK.pen[0] && th <= PARK.pen[1];
const isDugout = (th) => Math.abs(th) >= PARK.dugout[0] && Math.abs(th) <= PARK.dugout[1];

/** The home club and the visitors from the facts (null, null when unknown). */
function homeAndAway(facts) {
  if (!facts) return { home: null, away: null };
  const ours = clubNamed(facts.pitcher && facts.pitcher.team), theirs = battingClub(facts);
  return facts.situation && facts.situation.usHome ? { home: ours, away: theirs } : { home: theirs, away: ours };
}

/* Where the fans sit: every seat of the lower bowl and the upper deck (1.8 ft a seat, rows 2.7 ft deep),
   about four in five filled, emptier in patches (a value noise round the park), facing the plate. */
function crowdSpots() {
  const r = rng(53), out = [];
  const noise = Array.from({ length: 64 }, () => r());
  const patch = (th, k) => { const x = (th + 128) / 9 + k * 0.07, i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f); return noise[i % 64] * (1 - s) + noise[(i + 1) % 64] * s; };
  // row k (0-21 the lower bowl, 22-43 the upper deck) at th: [back, up], or null where it has no seats
  const rowOf = (th, k) => {
    // (the lower bowl's rake starts at the wall: its first row 1.5 ft back, no empty seats below it)
    if (k < 22) { if (Math.abs(th) <= PARK.eye) return null; const b = 1.5 + 2.7 * k; if (inPen(th) && b < PARK.penDepth + 4) return null; return [b, inPen(th) ? 11.5 + (b - PARK.penDepth - 3) * (18.5 / 17) : b * 0.5]; }
    if (Math.abs(th) < PARK.upper) return null;
    const b = 71.5 + 2.7 * (k - 22); return [b, b < 76 ? 56 + (b - 70) * 0.5 : 59 + (b - 76) * (29 / 54)];
  };
  // step round each row a seat at a time
  for (let k = 0; k < 44; k++) {
    let th = -128 + r() * 0.5;
    while (th <= 128) {
      const row = rowOf(th, k);
      const d = frontAt(th) + (row ? row[0] : 60);
      if (row && r() < 0.88 - 0.4 * patch(th, k)) {
        const p = at0(th, row[0], h0At(th) + row[1]);
        out.push({ x: p.x, y: p.y, z: p.z, yaw: Math.atan2(-p.x, -p.z) + (r() - 0.5) * 0.3, s: 0.9 + r() * 0.2 });
      }
      th += (1.8 / d) / D2R;
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
  // a seat row: the tread, the seat backs (grey: the material's colour is the club's), the aisle gaps
  const seatT = canvasTex(64, 256, (g) => {
    for (let r = 0; r < 32; r++) {
      g.fillStyle = '#4a4d52'; g.fillRect(0, r * 8, 64, 8);
      g.fillStyle = r % 2 ? '#c9c9c9' : '#d6d6d6'; g.fillRect(0, r * 8 + 2, 64, 5);
      g.fillStyle = '#4a4d52'; for (let x = 0; x < 64; x += 8) g.fillRect(x, r * 8 + 2, 1, 5);
    }
  });
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
  const boardT = canvasTex(1024, 320, () => {});
  boardT.wrapS = boardT.wrapT = THREE.ClampToEdgeWrapping;
  const side = THREE.DoubleSide;
  return {
    wall: new THREE.MeshStandardMaterial({ vertexColors: true, map: padT, roughness: 0.85, side }),
    seats: seatMaterial(seatT, canvasTex(64, 256, () => {}), side),
    lamps: new THREE.MeshBasicMaterial({ map: lampT, side, fog: true }),
    board: new THREE.MeshBasicMaterial({ map: boardT, side, fog: true, color: 0xb8b8b8 }),
  };
}

/* The seats: the seat rows (tinted the club's colour), and the far crowd painted over them where the fans
   themselves have dissolved (crowd.js LOD: the same size on screen, the same span). */
function seatMaterial(seatT, crowdT, side) {
  const m = new THREE.MeshStandardMaterial({ map: seatT, roughness: 0.8, side });
  crowdT.premultiplyAlpha = true;   // (its gaps are clear: premultiplied, a far mip is a true mix of fans and seats)
  m.userData.crowd = crowdT;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.crowdTex = { value: crowdT };
    sh.uniforms.crowdLod = LOD.uniform;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSeatW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSeatW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D crowdTex;\nuniform float crowdLod;\nvarying vec3 vSeatW;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float fanPx = ${FAN_VIS.toFixed(2)} * crowdLod / max(distance(cameraPosition, vSeatW), 1.0);
        vec4 ct = texture2D(crowdTex, vMapUv);
        float farK = 1.0 - smoothstep(${LOD.lo.toFixed(1)}, ${LOD.hi.toFixed(1)}, fanPx);
        diffuseColor.rgb = diffuseColor.rgb * (1.0 - farK * ct.a) + farK * ct.rgb;`);
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
  // batter's eye, the bullpen, the dugouts, the scoreboard, the light towers, the poles and the crowd
  const club = { pri: new THREE.Color(), dark: new THREE.Color() };
  const mats = parkMaterials(renderer, tex);
  const ring = [];
  for (let th = -128; th <= 128.01; th += 1) ring.push(th);
  const at = (th, back, up) => { const d = frontAt(th) + back, u = { x: Math.sin(th * D2R), y: Math.cos(th * D2R) }; return W(u.x * d, u.y * d, h0At(th) + up); };
  // a strip round the ring: rows of (back, up) at each step, quads between neighbouring steps
  const strip = (ths, rowsAt, opts = {}) => {
    const pos = [], uv = [], idx = [], col = [];
    let n = 0, prev = -1;
    ths.forEach((th, i) => {
      const rows = rowsAt(th);
      if (!rows) { prev = -1; return; }
      const base = pos.length / 3;
      rows.forEach(([b, up, c], k) => {
        pos.push(...at(th, b, up).toArray());
        uv.push(((frontAt(th) + b) * th * D2R) / (opts.uw || 6), opts.vOf ? opts.vOf(b, up, k) : k);
        if (opts.colors) col.push(...(c || [1, 1, 1]));
      });
      if (prev >= 0) for (let k = 0; k < rows.length - 1; k++) idx.push(prev + k, base + k, prev + k + 1, prev + k + 1, base + k, base + k + 1);
      prev = base; n = rows.length;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (opts.colors) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  };

  // the wall: the padded outfield wall (8 ft, dark green, panel seams, a yellow line on top) and the low
  // wall along the foul ground (4 ft). At the dugouts its lower 3.4 ft is open (the dugout behind it);
  // at the bullpen the padded wall stands in front of a pocket of grass 40 ft deep.
  const GREEN = [0.07, 0.2, 0.13], LOW = [0.1, 0.14, 0.17], YELLOW = [0.85, 0.7, 0.1];
  const wallG = strip(ring, (th) => {
    const fair = isFair(th), h = fair ? WALL_H : 4, c = fair ? GREEN : LOW, z = -h0At(th);
    if (isDugout(th)) return [[0, z + 3.4, c], [0, z + h, c], [0, z + h + 0.35, c]];
    return [[0, z, c], [0, z + h, c], [0, z + h + 0.35, fair ? YELLOW : c]];
  }, { colors: true, uw: 5, vOf: (b, up, k) => (k === 2 ? 0.5 : k * 0.95) });
  // the dugouts' insides and the bullpen's back wall, dark
  const inside = [];
  for (const sd of [-1, 1]) {
    const ths = ring.filter((th) => Math.sign(th) === sd && Math.abs(th) >= PARK.dugout[0] - 0.01 && Math.abs(th) <= PARK.dugout[1] + 0.01);
    inside.push(strip(ths, (th) => [[0, -h0At(th) + 0.05], [9, -h0At(th) + 0.05], [9, -h0At(th) + 3.6], [0.4, -h0At(th) + 3.6]]));
  }
  // the bullpen's back wall: padded green like the outfield wall, up to the first row of seats
  const pen = ring.filter((th) => th >= PARK.pen[0] - 0.01 && th <= PARK.pen[1] + 0.01);
  const penWall = strip(pen, () => [[PARK.penDepth, -WALL_H, GREEN], [PARK.penDepth, 10, GREEN]], { colors: true, uw: 5, vOf: (b, up, k) => k });
  // THE STRUCTURE IS ONE MESH: the wall, the dugouts' and the bullpen's insides, the batter's eye, the
  // suites, the upper deck's fascia (the club's colour), the roofs, the towers' steel and the foul poles,
  // each painted in vertex colours on the wall's material (their uv on the padding's plain white). Every
  // piece spans the ring, so a material of its own was a draw from any camera.
  const solid = [wallG.toNonIndexed(), penWall.toNonIndexed()];
  const paint = (g, hex) => {
    const n = g.toNonIndexed(), c = new THREE.Color(hex), k = n.getAttribute('position').count;
    n.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(k * 3).map((_, i) => [c.r, c.g, c.b][i % 3]), 3));
    n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(k * 2).fill(0.5), 2));
    return n;
  };
  // (each material's pieces gathered and merged at the end: one draw a material)
  const by = { seats: [], dark: inside, roof: [], glass: [] };
  // the dugouts' roof lip in the club's colour, a rail along it
  const lip = [];
  for (const sd of [-1, 1]) {
    const ths = ring.filter((th) => Math.sign(th) === sd && Math.abs(th) >= PARK.dugout[0] - 0.01 && Math.abs(th) <= PARK.dugout[1] + 0.01);
    lip.push(strip(ths, (th) => [[-0.05, -h0At(th) + 3.4], [-0.05, 0.4]]));
  }

  // the lower bowl: the rake at 27 degrees from the wall to a walkway (feet back from the front, up from
  // its top). Rows 2.7 ft deep, 1.35 ft a step. Not in the batter's eye; set back at the bullpen.
  const bowlRows = (th) => (inPen(th) ? [[PARK.penDepth, 10], [PARK.penDepth + 3, 11.5], [60, 30], [64, 30]] : [[0, 0], [6, 3], [60, 30], [64, 30]]);
  const vSeat = (b, up) => up / 1.35 / 32;
  by.seats.push(strip(ring, (th) => (Math.abs(th) >= PARK.eye - 0.01 ? bowlRows(th) : null), { uw: 1.8 * 8, vOf: vSeat }));
  // the batter's eye: dead centre, dark, the full height of the bleachers
  const eyeG = strip(ring.filter((th) => Math.abs(th) <= PARK.eye + 0.01), () => [[0, 0], [30, 40]]);

  // the suite level over the lower bowl (glass), the upper deck's fascia (the club's colour), its seats
  // and the roof's edge. Down the lines and round behind the plate only: the outfield is bleachers.
  // (The high first and third base cameras stand 61 ft back of the low wall, 58 ft up: the suites are
  // 64 ft back, the upper deck 70, so neither is ever in front of their lens.)
  // (one ring with the outfield left out, never the two sides filtered into one list: that joins them)
  const upper = (rows) => (th) => (Math.abs(th) >= PARK.upper ? rows : null);
  by.glass.push(strip(ring, upper([[64, 30], [64, 44]])));
  by.dark.push(strip(ring, upper([[64, 44], [70, 48]])));
  lip.push(strip(ring, upper([[70, 48], [70, 56]])));
  // (the club's pieces last: setClub repaints them)
  by.seats.push(strip(ring, upper([[70, 56], [76, 59], [130, 88], [132, 96]]), { uw: 1.8 * 8, vOf: vSeat }));
  // the roof's edge over the upper deck, and the back of the bleachers in the outfield
  by.roof.push(strip(ring, upper([[124, 106], [150, 110]])));
  by.roof.push(strip(ring.filter((th) => Math.abs(th) < PARK.upper + 0.01), (th) => (Math.abs(th) <= PARK.eye ? null : [[64, 30], [64, 36], [70, 36]])));

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
  group.add(new THREE.Mesh(mergeGeometries(by.seats.map((g) => g.toNonIndexed())), mats.seats));
  for (const g of by.dark) solid.push(paint(g, COL.dark));
  for (const g of by.roof) solid.push(paint(g, COL.roof));
  for (const g of by.glass) solid.push(paint(g, COL.glass));
  solid.push(paint(eyeG, COL.eye));

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
  for (const g of lip) solid.push(paint(g, COL.dark));
  const solidG = mergeGeometries(solid);
  group.add(new THREE.Mesh(solidG, mats.wall));
  const paintClub = (c) => { const col = solidG.getAttribute('color'); for (let i = clubFrom; i < col.count; i++) col.setXYZ(i, c.r, c.g, c.b); col.needsUpdate = true; };

  // ---- the crowd, in the lower bowl and the upper deck
  group.add(buildCrowd(crowdSpots(), { sectors: 6, blur: 0, lift: 0.36, chest: true, lod: true }));

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
