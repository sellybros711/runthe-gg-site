/* The crowd: fans in the seats, one flat figure each, a few draw calls for the whole park.
 *
 * Nothing is downloaded. At load a small atlas of 16 seated fans is drawn on a canvas (chest up, seen
 * from the front, as from the field): heads, hair, caps, hoods, arms down, crossed, a cup, a phone, a
 * hand up. Its channels are not colours but shading masks, R the shirt, G the skin, B the hair or cap
 * (A the figure), so every fan is coloured in the shader: his shirt from the crowd's palette (mostly the
 * home club's two colours, some of the visitors', the rest plain), his skin and hair from a range, all
 * from a hash of his number, never Math.random. The same hash gives each his figure and a little life
 * (a slow breath and a sway, a lean every few seconds). Some seats are left empty.
 *
 * Phones: one quad a fan (one plain mesh a sector, buildCrowd says why), an alpha tested cutout (alpha to coverage under the scene's antialiasing, the
 * edge kept sharp at every mip, so far fans stay fans and never fade out). The park's fans are cut into
 * sectors round the field, each its own mesh, so a camera's frustum skips the ones behind it.
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
    if (hair === 'long') {
      // one fall of hair round the head to the shoulders, the face cut out of it (the B layer is drawn
      // over the skin, so the face must be a hole in the hair, not under it)
      h.beginPath(); h.ellipse(cx, headY + headR * 0.25, headR * 1.12, headR * 1.45, 0, 0, 7); h.fill();
      h.globalCompositeOperation = 'destination-out';
      h.beginPath(); h.ellipse(cx, headY + headR * 0.22, headR * 0.74, headR * 0.86, 0, 0, 7); h.fill();
      h.fillRect(cx - headR * 0.3, headY + headR * 0.8, headR * 0.6, headR * 0.9);   // the neck
      h.globalCompositeOperation = 'source-over';
    }
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
const HEX = Array.from({ length: 16 }, () => '#808080');   // the same, as sRGB for canvases
const NEUTRAL = ['#f2f2ee', '#1c1c1e', '#7d8288', '#2b3a55', '#a8332f', '#e9e4d6'];
function fillPalette(home, away) {
  const set = (i, hex) => { HEX[i] = hex; PAL[i].set(hex).convertSRGBToLinear(); };
  const h1 = home ? home.pri : '#2b3a55', h2 = home ? home.sec : '#f2f2ee';
  for (let i = 0; i < 7; i++) set(i, h1);
  set(7, h2); set(8, h2); set(9, h2);
  set(10, away ? away.pri : '#7d8288'); set(11, away ? away.sec : '#1c1c1e');
  for (let i = 12; i < 16; i++) set(i, NEUTRAL[i - 12]);
}
fillPalette(null, null);
// the light on the fans: the sun's direction (park.js sets it) and how much of it, and the sky's share.
// The fans are lit per fan in the vertex shader, never per pixel: a crowd is thousands of small cutouts,
// and the full lit shader on every one of their pixels cost the broadcast half its frame time again
const U = { time: { value: 0 }, pal: { value: PAL }, sun: { value: new THREE.Vector3(0.75, 0.6, -0.3).normalize() }, lod: { value: 1000 } };
/* THE CROWD'S LOD. A fan under LOD.hi device pixels tall (his chest up, FAN_VIS metres) starts to dissolve,
   and under LOD.lo he is gone (his quad collapsed to a point: no pixels, no cost); the seats under him
   (ballpark.js) fade in a painted crowd over the same span (crowdImpostor), so far stands stay full.
   Thousands of quads two or three pixels tall cost a phone's GPU, and SwiftShader, more than the rest of
   the broadcast frame together. lod: device pixels a metre at a metre (crowd.js sets it each frame). */
export const LOD = { lo: 4, hi: 7, uniform: U.lod };
export const FAN_VIS = 0.81;
/** Where the sun is (world, toward it): park.js, from its key light. */
export function crowdLight(dir) { U.sun.value.copy(dir).normalize(); }

/** The home club's colours on the crowd (facts: the stage's or the lab's). The home club: the closer's
    when his side is at home (situation.usHome), else the hitters'. Unknown: a neutral crowd. */
export function crowdClub(facts) {
  if (!facts) return;
  const ours = clubNamed(facts.pitcher && facts.pitcher.team), theirs = battingClub(facts);
  const usHome = !!(facts.situation && facts.situation.usHome);
  fillPalette(usHome ? ours : theirs, usHome ? theirs : ours);
}

/** The far crowd painted on a seat texture's layout (64 x 256: 8 seats a row, 32 rows, 8 px a seat): a
    shirt and a head in about seven seats in ten, from the crowd's own palette. Redrawn when the club
    changes (ballpark.js setClub). */
export function crowdImpostor(canvas) {
  const g = canvas.getContext('2d'), r = rng(71);
  g.clearRect(0, 0, canvas.width, canvas.height);
  const skins = ['#c79a7d', '#a8765b', '#7a5038', '#4f3122', '#e0b99c'];
  for (let row = 0; row < 32; row++) for (let seat = 0; seat < 8; seat++) {
    if (r() > 0.72) continue;
    const x = seat * 8, y = row * 8;
    g.fillStyle = HEX[Math.floor(r() * 16)]; g.fillRect(x + 1, y + 3, 6, 5);
    g.fillStyle = skins[Math.floor(r() * skins.length)]; g.fillRect(x + 3, y + 1, 2, 2);
  }
}

const _clock = { t0: null, fn: null }, _size = new THREE.Vector2();
/** The crowd's clock, seconds (the lab's stepped clock for its videos; the game keeps the frame's own). */
export function crowdClock(fn) { _clock.fn = fn; }
function material(blur, crop, lod) {
  const m = new THREE.MeshBasicMaterial({ alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.crowdAtlas = { value: atlas() };
    sh.uniforms.crowdT = U.time;
    sh.uniforms.crowdPal = U.pal;
    sh.uniforms.crowdSun = U.sun;
    sh.uniforms.crowdLod = U.lod;
    // Everything a fan is (his figure, his colours, his light) is worked out once a vertex, from his hash,
    // never once a pixel: the pixel reads the atlas and mixes five colours handed to it
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float crowdT;
        uniform vec3 crowdSun;
        uniform vec3 crowdPal[16];
        uniform float crowdLod;
        attribute vec3 fanCenter; attribute float fanYaw; attribute float fanId;
        flat varying vec3 vShirt, vSkin, vHair, vCap, vPants; flat varying float vAdd, vFade; varying vec2 vCell;
        uint fanHash(uint x) { x ^= x >> 16; x *= 0x7feb352dU; x ^= x >> 15; x *= 0x846ca68bU; x ^= x >> 16; return x; }
        vec3 skinTone(float k) { return mix(mix(vec3(0.62, 0.40, 0.29), vec3(0.32, 0.18, 0.11), smoothstep(0.35, 1.0, k)), vec3(0.80, 0.58, 0.45), 1.0 - smoothstep(0.0, 0.4, k)); }
        // a little of the haze and the sheen the lit shader gave cloth (it read less saturated)
        vec3 haze(vec3 c) { return mix(c, vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), 0.18); }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        uint hh = fanHash(uint(fanId + 0.5) * 2654435761U + 7U);
        vec3 side = vec3(cos(fanYaw), 0.0, -sin(fanYaw)), nW = vec3(sin(fanYaw), 0.0, cos(fanYaw));
        uint u = hh & 0x7fffffffU;
        float ph = float(hh & 1023U) / 1023.0 * 6.2831;
        float sp = 0.7 + float((hh >> 10) & 255U) / 255.0 * 0.6;
        float up = uv.y;   // 0 at the quad's foot, 1 at the head
        // a breath, a sway of the shoulders, and now and then a lean in (to see the play, to talk)
        float lean = smoothstep(0.82, 1.0, sin(crowdT * 0.21 * sp + ph * 3.0));
        transformed.y += 0.008 * sin(crowdT * 1.6 * sp + ph) * up;
        transformed += side * (0.018 * sin(crowdT * 0.55 * sp + ph * 1.7) + 0.05 * lean * (float((hh >> 18) & 1U) * 2.0 - 1.0)) * up * up;
        transformed.y -= 0.04 * lean * up;
        int cell = int((hh >> 20) & 15U);
        vCell = vec2(float(cell % ${COLS}), float(cell / ${COLS}));
        // his light: the sky, and the sun on the way he faces (a shade either way: he is not flat)
        float lit = 0.66 + 0.55 * max(dot(nW, crowdSun), 0.0) + 0.1 * (1.0 - abs(dot(nW, crowdSun)));
        // his colours: the shirt from the crowd's palette, skin, hair; the B layer is a cap (a club colour),
        // trousers (denim, khaki, black, grey) or hair, told apart in the atlas by its shade
        vShirt = haze(crowdPal[int(u & 15U)] * (0.8 + 0.4 * float((u >> 4) & 15U) / 15.0)) * lit;
        vSkin = haze(skinTone(float((u >> 8) & 255U) / 255.0)) * lit;
        vHair = haze(mix(vec3(0.02, 0.015, 0.01), vec3(0.28, 0.17, 0.08), float((u >> 16) & 3U) / 3.0)) * 1.6 * lit;
        vCap = haze(crowdPal[int((u >> 24) & 15U)]) * 2.4 * lit;
        int pk = int((u >> 28) & 3U);
        vPants = haze(pk == 0 ? vec3(0.05, 0.08, 0.16) : pk == 1 ? vec3(0.36, 0.30, 0.19) : pk == 2 ? vec3(0.03) : vec3(0.18, 0.19, 0.21)) * 1.6 * lit;
        vAdd = 0.012 * lit;
        ${lod ? `// the LOD: his size on screen; gone (a point, nothing drawn) under ${LOD.lo} px, dissolving to ${LOD.hi}
        vec3 cW = (modelMatrix * vec4(fanCenter, 1.0)).xyz;
        vFade = smoothstep(${LOD.lo.toFixed(1)}, ${LOD.hi.toFixed(1)}, ${FAN_VIS.toFixed(2)} * crowdLod / max(distance(cameraPosition, cW), 1.0));
        if (vFade <= 0.0) transformed = fanCenter;` : 'vFade = 1.0;'}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D crowdAtlas;
        flat varying vec3 vShirt, vSkin, vHair, vCap, vPants; flat varying float vAdd, vFade; varying vec2 vCell;`)
      .replace('#include <map_fragment>', `
        vec2 auv = (vCell + clamp(vec2(vUv.x, (1.0 - vUv.y) * ${crop.toFixed(4)}), 0.015, 0.985)) / vec2(${COLS}.0, ${ROWS}.0);   // the atlas unflipped: v down the canvas
        vec4 tx = texture2D(crowdAtlas, auv, ${blur.toFixed(2)});
        // keep the cutout's edge one pixel wide at every mip (alpha to coverage), so far fans never fade
        // (the LOD's dissolve: the cutout's threshold rises as he fades, so he thins away, never a ghost)
        float aa = (tx.a - mix(1.02, 0.5, vFade)) / max(fwidth(tx.a), 1e-4) + 0.5;
        float ia = 1.0 / max(tx.a, 1e-3), bv = tx.b * ia;
        vec3 bcol = bv < 0.48 ? vCap : bv < 0.74 ? vPants : vHair;
        diffuseColor = vec4((vShirt * tx.r + vSkin * tx.g + bcol * tx.b) * ia + vAdd, clamp(aa, 0.0, 1.0));`)
      .replace('#include <alphatest_fragment>', 'if (diffuseColor.a < 0.02) discard;');
  };
  m.defines = { USE_UV: '' };
  m.customProgramCacheKey = () => `crowd${blur}/${crop}/${lod}`;
  return m;
}

/** A crowd from seats: spots [{ x, y, z (world, the seat's floor point), yaw (radians, the
    way he faces), s (scale) }]. sectors: how many meshes round the field (by the spot's bearing from the
    plate), each culled on its own. blur: the atlas's mip bias (the long lens's soft background behind
    the plate). lod: far fans dissolve into the seats' painted crowd (LOD). chest: the figures from the waist up (where no seat backs stand in front to hide the
    legs, a whole seated figure reads as standing). lift: metres from the floor to the quad's foot.
    Returns a group. */
export function buildCrowd(spots, { sectors = 1, blur = 0, lift = 0, chest = false, lod = false } = {}) {
  const group = new THREE.Group();
  group.name = 'crowd';
  const crop = chest ? (WAIST + 2) / CH : 1, h = FAN.h * crop;
  const mat = material(blur, crop, lod);
  const by = Array.from({ length: sectors }, () => []);
  spots.forEach((p, id) => {
    const b = Math.atan2(p.x, p.z);   // bearing round the plate
    const k = Math.min(sectors - 1, Math.max(0, Math.floor(((b + Math.PI) / (2 * Math.PI)) * sectors)));
    by[k].push({ ...p, id });
  });
  // ONE PLAIN MESH A SECTOR, not instancing: four fixed corners a fan, with his centre, the way he faces
  // and his number as attributes (the shader's hash, his motion and his LOD read them). Instanced, every
  // fan cost the software renderer about 10 microseconds before a pixel (it loops over instances); a mesh
  // of the same quads costs it nearly nothing, and a phone's GPU the same either way.
  for (const list of by) {
    if (!list.length) continue;
    const n = list.length, pos = new Float32Array(n * 12), uv = new Float32Array(n * 8), cen = new Float32Array(n * 12);
    const yaw = new Float32Array(n * 4), fid = new Float32Array(n * 4), idx = new Uint32Array(n * 6);
    list.forEach((p, i) => {
      const s = p.s || 1, cx = p.x, cy = p.y + lift * s + (h * s) / 2, cz = p.z;
      const ax = Math.cos(p.yaw), az = -Math.sin(p.yaw), hw = (FAN.w * s) / 2, hh = (h * s) / 2;
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      corners.forEach(([u, v], c) => {
        const o = i * 4 + c;
        pos.set([cx + ax * hw * u, cy + hh * v, cz + az * hw * u], o * 3);
        uv.set([(u + 1) / 2, (v + 1) / 2], o * 2);
        cen.set([cx, cy, cz], o * 3);
        yaw[o] = p.yaw; fid[o] = p.id;
      });
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('fanCenter', new THREE.BufferAttribute(cen, 3));
    g.setAttribute('fanYaw', new THREE.BufferAttribute(yaw, 1));
    g.setAttribute('fanId', new THREE.BufferAttribute(fid, 1));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = mesh.receiveShadow = false;
    mesh.onBeforeRender = (renderer, scene, camera) => {
      U.lod.value = renderer.getDrawingBufferSize(_size).y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      if (_clock.fn) { U.time.value = _clock.fn(); return; }
      const now = performance.now() / 1000;
      if (_clock.t0 == null) _clock.t0 = now;
      U.time.value = now - _clock.t0;
    };
    group.add(mesh);
  }
  return group;
}
