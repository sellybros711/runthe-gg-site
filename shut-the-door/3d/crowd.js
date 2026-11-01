/* The crowd: fans in the seats, one flat figure each, drawn by instancing (a few draw calls for the
 * whole park).
 *
 * Nothing is downloaded. At load a small atlas of 16 seated fans is drawn on a canvas (chest up, seen
 * from the front, as from the field): heads, hair, caps, hoods, arms down, crossed, a cup, a phone, a
 * hand up. Its channels are not colours but shading masks, R the shirt, G the skin, B the hair or cap
 * (A the figure), so every fan is coloured in the shader: his shirt from the crowd's palette (mostly the
 * home club's two colours, some of the visitors', the rest plain), his skin and hair from a range, all
 * from a hash of his instance, never Math.random. The same hash gives each his figure and a little life
 * (a slow breath and a sway, a lean every few seconds). Some seats are left empty.
 *
 * Phones: one quad a fan, an alpha tested cutout (alpha to coverage under the scene's antialiasing, the
 * edge kept sharp at every mip, so far fans stay fans and never fade out). The park's fans are cut into
 * sectors round the field, each its own instanced mesh, so a camera's frustum skips the ones behind it.
 * No shadows cast or taken. The clock is the frame's (onBeforeRender), so a still scene draws nothing new.
 *
 * No logos or club artwork: colours only ([[2026-10-19-shut-the-door-real-uniforms]]).
 */
import * as THREE from 'three';
import { clubNamed, battingClub } from './clubs.js?v=2';

const CW = 96, CH = 176, COLS = 4, ROWS = 4;   // the atlas: 4 x 4 fans, 96 x 176 px each
const WAIST = 128;                               // the shirt ends here; the lap and the shins below
export const FAN = { w: 0.6, h: 1.1 };          // a fan's quad, metres: a seated adult, floor to the top of his head

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/* The atlas, drawn once. Three grey layers (shirt, skin, hair) packed into R, G and B. */
let ATLAS = null;
function atlas() {
  if (ATLAS) return ATLAS;
  const W = CW * COLS, H = CH * ROWS;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const L = { shirt: mk(), skin: mk(), hair: mk() };
  const g = { shirt: L.shirt.getContext('2d'), skin: L.skin.getContext('2d'), hair: L.hair.getContext('2d') };
  const r = rng(29);
  const grey = (v) => `rgb(${Math.round(255 * v)},${Math.round(255 * v)},${Math.round(255 * v)})`;
  for (let i = 0; i < COLS * ROWS; i++) {
    const ox = (i % COLS) * CW, oy = Math.floor(i / COLS) * CH;
    const cx = ox + CW / 2 + (r() - 0.5) * 6;
    const headR = 11 + r() * 2.5, headY = oy + 30 + r() * 5;   // (the cell's top 6 px stay empty: no bleed between cells at a coarse mip)
    const sh = 22 + r() * 7;                         // half the shoulders
    const shY = headY + headR + 10;
    const arms = ['down', 'down', 'crossed', 'cup', 'phone', 'up', 'down', 'crossed'][i % 8];
    const hair = ['short', 'cap', 'long', 'short', 'cap', 'bald', 'hood', 'long', 'cap', 'short', 'long', 'cap', 'short', 'bun', 'cap', 'short'][i];
    for (const k of ['shirt', 'skin', 'hair']) { g[k].save(); }
    // ---- the shirt: shoulders and the chest, to the waist
    const s = g.shirt;
    s.fillStyle = (() => { const gr = s.createLinearGradient(cx - sh, 0, cx + sh, 0); gr.addColorStop(0, grey(0.5)); gr.addColorStop(0.45, grey(1)); gr.addColorStop(1, grey(0.45)); return gr; })();
    s.beginPath();
    // round shoulders falling from the neck, the chest narrowing a little to the waist
    s.moveTo(cx - 8, shY - 7);
    s.bezierCurveTo(cx - sh + 6, shY - 7, cx - sh - 1, shY - 2, cx - sh, shY + 14);
    s.quadraticCurveTo(cx - sh + 1, oy + WAIST - 30, cx - sh + 5, oy + WAIST + 2);
    s.lineTo(cx + sh - 5, oy + WAIST + 2);
    s.quadraticCurveTo(cx + sh - 1, oy + WAIST - 30, cx + sh, shY + 14);
    s.bezierCurveTo(cx + sh + 1, shY - 2, cx + sh - 6, shY - 7, cx + 8, shY - 7);
    s.closePath(); s.fill();
    // a fold or two and the collar
    s.strokeStyle = grey(0.6); s.lineWidth = 2;
    s.beginPath(); s.moveTo(cx - 9, shY - 5); s.quadraticCurveTo(cx, shY + 4, cx + 9, shY - 5); s.stroke();
    // ---- the arms (sleeves on the shirt layer, hands on the skin layer)
    const sleeve = (x0, y0, x1, y1, w) => { s.strokeStyle = grey(0.72); s.lineCap = 'round'; s.lineWidth = w; s.beginPath(); s.moveTo(x0, y0); s.lineTo(x1, y1); s.stroke(); };
    const hand = (x, y, rad = 5) => { const k = g.skin; k.fillStyle = grey(0.85); k.beginPath(); k.ellipse(x, y, rad, rad * 1.1, 0, 0, 7); k.fill(); };
    if (arms === 'crossed') {
      s.fillStyle = grey(0.7); s.beginPath(); s.ellipse(cx, shY + 46, sh - 2, 9, 0, 0, 7); s.fill();
      hand(cx - sh + 6, shY + 44, 4.5); hand(cx + sh - 6, shY + 46, 4.5);
    } else if (arms === 'cup') {
      sleeve(cx + sh - 4, shY + 12, cx + sh - 10, shY + 48, 13);
      hand(cx + sh - 12, shY + 50);
      g.hair.fillStyle = grey(0.95); g.hair.fillRect(cx + sh - 18, shY + 34, 11, 16);   // a cup (light, on the B layer)
    } else if (arms === 'phone') {
      sleeve(cx - sh + 4, shY + 12, cx - 6, shY + 44, 12); sleeve(cx + sh - 4, shY + 12, cx + 6, shY + 44, 12);
      hand(cx - 4, shY + 44); hand(cx + 4, shY + 44);
      g.hair.fillStyle = grey(0.12); g.hair.fillRect(cx - 5, shY + 30, 10, 15);
    } else if (arms === 'up') {
      // one hand up (cheering, or calling a vendor)
      const sx = cx + sh - 3;
      s.strokeStyle = grey(0.85); s.lineCap = 'round'; s.lineWidth = 11;
      s.beginPath(); s.moveTo(sx, shY + 6); s.lineTo(sx + 6, shY - 22); s.lineTo(sx + 4, headY - 14); s.stroke();
      hand(sx + 4, headY - 18, 5.5);
    } else {
      sleeve(cx - sh + 2, shY + 10, cx - sh + 1, shY + 50, 12); sleeve(cx + sh - 2, shY + 10, cx + sh - 1, shY + 50, 12);
    }
    // ---- the lap and the shins (seen from the front, the thighs come at us: a short band, then the
    // shins to the floor), on the B layer at 0.6: the shader gives it his trousers' colour. Seat backs
    // in front hide it in every row but the first.
    const p = g.hair;
    const pg = p.createLinearGradient(0, oy + WAIST - 4, 0, oy + CH);
    pg.addColorStop(0, grey(0.66)); pg.addColorStop(0.35, grey(0.6)); pg.addColorStop(1, grey(0.52));
    p.fillStyle = pg;
    p.beginPath();
    if (p.roundRect) p.roundRect(cx - sh + 3, oy + WAIST - 2, 2 * sh - 6, 22, 7); else p.rect(cx - sh + 3, oy + WAIST - 2, 2 * sh - 6, 22);
    p.fill();
    const knee = 9 + r() * 4;
    p.fillRect(cx - knee - 7, oy + WAIST + 16, 13, CH - WAIST - 16); p.fillRect(cx + knee - 6, oy + WAIST + 16, 13, CH - WAIST - 16);
    // ---- the neck and the head
    const k = g.skin;
    k.fillStyle = grey(0.65); k.fillRect(cx - 6, headY + headR - 4, 12, 14);
    const hg = k.createRadialGradient(cx - headR * 0.25, headY - headR * 0.3, 1, cx, headY, headR * 1.3);
    hg.addColorStop(0, grey(1)); hg.addColorStop(1, grey(0.55));
    k.fillStyle = hg; k.beginPath(); k.ellipse(cx, headY, headR * 0.86, headR * 1.08, 0, 0, 7); k.fill();
    // ears
    k.fillStyle = grey(0.7); k.beginPath(); k.ellipse(cx - headR * 0.86, headY + 1, 2.5, 4, 0, 0, 7); k.ellipse(cx + headR * 0.86, headY + 1, 2.5, 4, 0, 0, 7); k.fill();
    // ---- hair and caps (the B layer; a cap takes the shirt's palette in the shader through its darker shade)
    const h = g.hair;
    h.fillStyle = grey(0.85);
    if (hair === 'short') { h.beginPath(); h.ellipse(cx, headY - headR * 0.35, headR * 0.92, headR * 0.8, 0, Math.PI, 2 * Math.PI); h.fill(); }
    if (hair === 'long') { h.beginPath(); h.ellipse(cx, headY - headR * 0.3, headR * 1.0, headR * 0.85, 0, Math.PI, 2 * Math.PI); h.fill(); h.fillRect(cx - headR * 1.05, headY - 3, 6, headR + 16); h.fillRect(cx + headR * 1.05 - 6, headY - 3, 6, headR + 16); }
    if (hair === 'bun') { h.beginPath(); h.ellipse(cx, headY - headR * 0.35, headR * 0.92, headR * 0.8, 0, Math.PI, 2 * Math.PI); h.ellipse(cx, headY - headR * 1.15, 5, 5, 0, 0, 7); h.fill(); }
    if (hair === 'cap') {
      h.fillStyle = grey(0.35);   // a cap: drawn dark on B, coloured as a cap in the shader (B under 0.5)
      h.beginPath(); h.ellipse(cx, headY - headR * 0.3, headR * 0.98, headR * 0.92, 0, Math.PI, 2 * Math.PI); h.fill();
      h.fillRect(cx - headR * 0.98, headY - headR * 0.32, headR * 1.96, 4);
      h.beginPath(); h.ellipse(cx, headY - headR * 0.22, headR * 1.05, 3.5, 0, 0, Math.PI); h.fill();   // the brim, toward us
    }
    if (hair === 'hood') {
      // a hood up: the shirt's colour round the face
      s.fillStyle = grey(0.62); s.beginPath(); s.ellipse(cx, headY - 1, headR * 1.25, headR * 1.35, 0, 0, 7); s.fill();
      k.fillStyle = hg; k.beginPath(); k.ellipse(cx, headY + 2, headR * 0.7, headR * 0.85, 0, 0, 7); k.fill();
    }
    // the face: the darker eyes and brows read as a face at this size
    k.fillStyle = grey(0.4); k.fillRect(cx - headR * 0.45, headY - 1, 4, 2.5); k.fillRect(cx + headR * 0.45 - 4, headY - 1, 4, 2.5);
    k.fillStyle = grey(0.55); k.fillRect(cx - 3, headY + headR * 0.5, 6, 1.5);
    for (const q of ['shirt', 'skin', 'hair']) g[q].restore();
  }
  // pack: R shirt, G skin, B hair or cap (each where it is on top), A the figure
  const out = mk(), o = out.getContext('2d');
  const id = o.createImageData(W, H), d = id.data;
  const px = (c) => c.getContext('2d').getImageData(0, 0, W, H).data;
  const S = px(L.shirt), K = px(L.skin), Hh = px(L.hair);
  for (let j = 0; j < W * H * 4; j += 4) {
    const a3 = Hh[j + 3] / 255, a2 = K[j + 3] / 255, a1 = S[j + 3] / 255;
    // the top layer wins (hair over skin over shirt), its share to the channel
    const hB = a3, kG = a2 * (1 - a3), sR = a1 * (1 - a2) * (1 - a3);
    d[j] = S[j] * sR; d[j + 1] = K[j] * kG; d[j + 2] = Hh[j] * hB;
    d[j + 3] = 255 * Math.min(1, a1 + a2 * (1 - a1) + a3 * (1 - Math.min(1, a1 + a2)));
  }
  o.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.colorSpace = THREE.NoColorSpace; t.flipY = false;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  ATLAS = t;
  return t;
}

/* The shirts: 16 slots a fan's hash picks from. Mostly the home club (pri, sec), some visitors, plain. */
const PAL = Array.from({ length: 16 }, () => new THREE.Color(0x808080));
const NEUTRAL = ['#f2f2ee', '#1c1c1e', '#7d8288', '#2b3a55', '#a8332f', '#e9e4d6'];
function fillPalette(home, away) {
  const set = (i, hex) => PAL[i].set(hex).convertSRGBToLinear();
  const h1 = home ? home.pri : '#2b3a55', h2 = home ? home.sec : '#f2f2ee';
  for (let i = 0; i < 7; i++) set(i, h1);
  set(7, h2); set(8, h2); set(9, h2);
  set(10, away ? away.pri : '#7d8288'); set(11, away ? away.sec : '#1c1c1e');
  for (let i = 12; i < 16; i++) set(i, NEUTRAL[i - 12]);
}
fillPalette(null, null);
const U = { time: { value: 0 }, pal: { value: PAL } };

/** The home club's colours on the crowd (facts: the stage's or the lab's). The home club: the closer's
    when his side is at home (situation.usHome), else the hitters'. Unknown: a neutral crowd. */
export function crowdClub(facts) {
  if (!facts) return;
  const ours = clubNamed(facts.pitcher && facts.pitcher.team), theirs = battingClub(facts);
  const usHome = !!(facts.situation && facts.situation.usHome);
  fillPalette(usHome ? ours : theirs, usHome ? theirs : ours);
}

const _clock = { t0: null };
function material(blur, crop) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.crowdAtlas = { value: atlas() };
    sh.uniforms.crowdT = U.time;
    sh.uniforms.crowdPal = U.pal;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float crowdT;
        flat varying int vFan; varying vec2 vCell;
        uint fanHash(uint x) { x ^= x >> 16; x *= 0x7feb352dU; x ^= x >> 15; x *= 0x846ca68bU; x ^= x >> 16; return x; }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        uint hh = fanHash(uint(gl_InstanceID) * 2654435761U + 7U);
        vFan = int(hh & 0x7fffffffU);
        float ph = float(hh & 1023U) / 1023.0 * 6.2831;
        float sp = 0.7 + float((hh >> 10) & 255U) / 255.0 * 0.6;
        float up = clamp(position.y / ${(FAN.h * crop).toFixed(3)} + 0.5, 0.0, 1.0);   // 0 at the quad's foot, 1 at the head
        // a breath, a sway of the shoulders, and now and then a lean in (to see the play, to talk)
        float lean = smoothstep(0.82, 1.0, sin(crowdT * 0.21 * sp + ph * 3.0));
        transformed.y += 0.008 * sin(crowdT * 1.6 * sp + ph) * up;
        transformed.x += (0.018 * sin(crowdT * 0.55 * sp + ph * 1.7) + 0.05 * lean * (float((hh >> 18) & 1U) * 2.0 - 1.0)) * up * up;
        transformed.y -= 0.04 * lean * up;
        int cell = int((hh >> 20) & 15U);
        vCell = vec2(float(cell % ${COLS}), float(cell / ${COLS}));`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D crowdAtlas;
        uniform vec3 crowdPal[16];
        flat varying int vFan; varying vec2 vCell;
        vec3 skinTone(float k) { return mix(mix(vec3(0.62, 0.40, 0.29), vec3(0.32, 0.18, 0.11), smoothstep(0.35, 1.0, k)), vec3(0.80, 0.58, 0.45), 1.0 - smoothstep(0.0, 0.4, k)); }`)
      .replace('#include <map_fragment>', `
        vec2 auv = (vCell + clamp(vec2(vUv.x, (1.0 - vUv.y) * ${crop.toFixed(4)}), 0.015, 0.985)) / vec2(${COLS}.0, ${ROWS}.0);   // the atlas unflipped: v down the canvas
        vec4 tx = texture2D(crowdAtlas, auv, ${blur.toFixed(2)});
        // keep the cutout's edge one pixel wide at every mip (alpha to coverage), so far fans never fade
        float aa = (tx.a - 0.5) / max(fwidth(tx.a), 1e-4) + 0.5;
        uint u = uint(vFan);
        vec3 shirt = crowdPal[int(u & 15U)] * (0.8 + 0.4 * float((u >> 4) & 15U) / 15.0);
        vec3 skin = skinTone(float((u >> 8) & 255U) / 255.0);
        vec3 hair = mix(vec3(0.02, 0.015, 0.01), vec3(0.28, 0.17, 0.08), float((u >> 16) & 3U) / 3.0);
        // B: a cap (drawn at 0.35: a club colour), trousers (0.6: denim, khaki, black, grey) or hair (0.85)
        vec3 cap = crowdPal[int((u >> 24) & 15U)];
        int pk = int((u >> 28) & 3U);
        vec3 pants = pk == 0 ? vec3(0.05, 0.08, 0.16) : pk == 1 ? vec3(0.36, 0.30, 0.19) : pk == 2 ? vec3(0.03) : vec3(0.18, 0.19, 0.21);
        float bv = tx.b / max(tx.a, 1e-3);
        vec3 bcol = bv < 0.48 ? cap * 2.4 : bv < 0.74 ? pants * 1.6 : hair * 1.6;
        vec3 col = shirt * tx.r + skin * tx.g + bcol * tx.b;
        diffuseColor = vec4(col / max(tx.a, 1e-3), clamp(aa, 0.0, 1.0));`)
      .replace('#include <alphatest_fragment>', 'if (diffuseColor.a < 0.02) discard;');
  };
  m.defines = { USE_UV: '' };
  m.customProgramCacheKey = () => `crowd${blur}/${crop}`;
  return m;
}

/** An instanced crowd from seats: spots [{ x, y, z (world, the seat's floor point), yaw (radians, the
    way he faces), s (scale) }]. sectors: how many meshes round the field (by the spot's bearing from the
    plate), each culled on its own. blur: the atlas's mip bias (the long lens's soft background behind
    the plate). chest: the figures from the waist up (where no seat backs stand in front to hide the
    legs, a whole seated figure reads as standing). lift: metres from the floor to the quad's foot.
    Returns a group. */
export function buildCrowd(spots, { sectors = 1, blur = 0, lift = 0, chest = false } = {}) {
  const group = new THREE.Group();
  group.name = 'crowd';
  const crop = chest ? (WAIST + 2) / CH : 1, h = FAN.h * crop;
  const geo = new THREE.PlaneGeometry(FAN.w, h);
  const mat = material(blur, crop);
  const by = Array.from({ length: sectors }, () => []);
  for (const p of spots) {
    const b = Math.atan2(p.x, p.z);   // bearing round the plate
    const k = Math.min(sectors - 1, Math.max(0, Math.floor(((b + Math.PI) / (2 * Math.PI)) * sectors)));
    by[k].push(p);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), v = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  for (const list of by) {
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((p, i) => {
      const s = p.s || 1;
      v.set(p.x, p.y + lift * s + (h * s) / 2, p.z);
      q.setFromAxisAngle(Y, p.yaw);
      sc.set(s, s, s);
      mesh.setMatrixAt(i, m4.compose(v, q, sc));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = mesh.receiveShadow = false;
    mesh.onBeforeRender = () => {
      const now = performance.now() / 1000;
      if (_clock.t0 == null) _clock.t0 = now;
      U.time.value = now - _clock.t0;
    };
    group.add(mesh);
  }
  return group;
}
