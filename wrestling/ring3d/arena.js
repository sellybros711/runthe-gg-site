/* Run The Ropes 3D: the building around the match.

   buildArena(theme, opts) builds the ring, ringside, the house and the light
   rig for one promotion and hands back an Arena object the stage drives every
   frame. The theme is one entry of the game's ARENA_DEF table, so the nine
   buildings read the same here as they do in the flat match screen: a bingo
   hall gets a pipe with two cans and a few sparse rows, the global tour gets a
   truss of moving heads, three decks and a screen over the entrance stage.

   The look is mythiball's proto3d: MeshToonMaterial on a three step gradient
   with NearestFilter, and inverted hull ink lines on the silhouettes that
   matter (the ring box, the posts, the pads, the ropes, the steps). Every
   canvas texture is NearestFilter, because the whole scene is drawn at about
   270 lines and blown up with image-rendering: pixelated, and a smooth texture
   at that size is mush.

   Draw calls are the budget that matters on a phone, so almost everything that
   never moves is built into two vertex coloured meshes (one lit, one unlit),
   and everything repeated (posts, pads, steps, fans, flashes, can lights,
   beams) is an InstancedMesh. The crowd animates entirely in its vertex shader
   off a time uniform, so a cheering stadium of three thousand fans costs one
   draw call and no per frame matrix writes. */
import * as THREE from '../../assets/vendor/three-0.180.0/three.module.min.js';
import { HALF, POST, APRON, FLOOR, ROPES, POST_TOP, BARRIER, CORNERS } from './dims.js?v=1';

/* ------------------------------------------------------------ small helpers */

/* the toon ramp: three flat bands, shadow, mid and lit, with no smoothing so
   a lit surface breaks into clean pixel steps instead of a gradient */
function makeGrad() {
  const d = new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}

/* pull every #rrggbb out of a CSS string (the wall gradients) */
function hexesOf(str) { return (String(str || '').match(/#[0-9a-fA-F]{6}/g) || []); }
/* the first rgba() in a CSS string, as a colour and an alpha */
function rgbaOf(str, fallback) {
  const m = String(str || '').match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (!m) return { c: new THREE.Color(fallback || '#ffffff'), a: 1 };
  const c = new THREE.Color().setRGB(+m[1] / 255, +m[2] / 255, +m[3] / 255, THREE.SRGBColorSpace);
  return { c, a: m[4] == null ? 1 : +m[4] };
}
function col(c) { return c instanceof THREE.Color ? c.clone() : new THREE.Color(c); }
function mul(c, k) { return col(c).multiplyScalar(k); }
function mix(a, b, t) { return col(a).lerp(col(b), t); }

/* a seeded generator, so a building is the same building every time it is
   built (the flat screen's venueRng makes the same promise) */
function rngOf(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
}

/* Magnified, every canvas texture is NearestFilter, which is the pixel look.
   The big printed surfaces (the canvas, the apron, the screen) also get
   mipmaps for when they are MINIFIED, as on a narrow phone where the 192
   texel mat lands on about a hundred pixels: nearest sampling there drops
   whole letters and crawls as the camera moves. Magnification never touches
   the mip chain, so the desktop shot stays hard edged. */
function canvasTex(cv, repeat, mip) {
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter; t.generateMipmaps = !!mip;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}

/* Text drawn by the browser is antialiased, and antialiased text sampled with
   NearestFilter is a smear. So the lettering is drawn at its final pixel size
   and every pixel is then forced fully on or fully off, which gives hard
   blocky letters at any size, for any promotion name, with no font of our own
   to maintain. An optional dark outline makes it read on a busy ground. */
function pixelText(text, h, maxW, color, ink) {
  const cv = document.createElement('canvas'), g = cv.getContext('2d');
  const font = (s) => `900 ${s}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
  g.font = font(h);
  let w = g.measureText(text).width, fs = h;
  if (w > maxW) { fs = Math.max(6, Math.floor(h * maxW / w)); g.font = font(fs); w = g.measureText(text).width; }
  const pad = ink ? 2 : 0;
  cv.width = Math.max(1, Math.ceil(w) + pad * 2); cv.height = Math.ceil(fs * 1.05) + pad * 2;
  g.font = font(fs); g.textBaseline = 'middle'; g.fillStyle = '#fff';
  g.fillText(text, pad, cv.height / 2 + 1);
  const id = g.getImageData(0, 0, cv.width, cv.height), d = id.data;
  const on = new Uint8Array(cv.width * cv.height);
  for (let i = 0; i < on.length; i++) on[i] = d[i * 4 + 3] > 110 ? 1 : 0;
  const fc = new THREE.Color(color), ic = new THREE.Color(ink || '#000');
  const set = (i, c) => { d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255; };
  /* THREE.Color holds linear values; getHex hands back the sRGB bytes a
     canvas wants */
  const toB = (c) => { const x = c.getHex(); return [(x >> 16) & 255, (x >> 8) & 255, x & 255]; };
  const FB = toB(fc), IB = toB(ic);
  for (let i = 0; i < on.length; i++) { d[i * 4 + 3] = 0; }
  if (ink) {
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
      if (on[y * cv.width + x]) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < cv.width && yy < cv.height && on[yy * cv.width + xx]) { near = true; break; }
      }
      if (near) set(y * cv.width + x, IB);
    }
  }
  for (let i = 0; i < on.length; i++) if (on[i]) set(i, FB);
  g.putImageData(id, 0, 0);
  return cv;
}

/* A vertical gradient quantised into flat bands, which is how pixel art does
   a gradient: four or five steps rather than a smooth ramp. */
function bandFill(g, x, y, w, h, c0, c1, steps) {
  const a = new THREE.Color(c0), b = new THREE.Color(c1);
  for (let i = 0; i < steps; i++) {
    const t = steps === 1 ? 0 : i / (steps - 1);
    g.fillStyle = '#' + a.clone().lerp(b, t).getHexString();
    const y0 = Math.round(y + h * i / steps), y1 = Math.round(y + h * (i + 1) / steps);
    g.fillRect(x, y0, w, y1 - y0);
  }
}

/* --------------------------------------------- a tiny static geometry merge

   BufferGeometryUtils is not vendored, and the static set is all boxes and
   quads anyway, so this writes them straight into one set of arrays with a
   colour per vertex. One builder becomes one mesh and one draw call. */
class Builder {
  constructor() { this.p = []; this.n = []; this.c = []; this.i = []; }
  get count() { return this.p.length / 3; }
  quad(a, b, c, d, color, color2) {
    /* a b c d counter clockwise as seen from the side the face is lit from;
       color2, when given, is the colour of the c and d edge (a gradient) */
    const o = this.count;
    const e1 = new THREE.Vector3().subVectors(b, a), e2 = new THREE.Vector3().subVectors(d, a);
    const nrm = new THREE.Vector3().crossVectors(e1, e2).normalize();
    const c1 = col(color), c2 = color2 ? col(color2) : c1;
    for (const [v, cc] of [[a, c1], [b, c1], [c, c2], [d, c2]]) {
      this.p.push(v.x, v.y, v.z); this.n.push(nrm.x, nrm.y, nrm.z); this.c.push(cc.r, cc.g, cc.b);
    }
    this.i.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  /* an axis aligned box (optionally turned about y) from its centre and size;
     skip is a string of faces to leave out: t b n s e w */
  box(cx, cy, cz, sx, sy, sz, color, rotY = 0, skip = '', topColor) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2, cs = Math.cos(rotY), sn = Math.sin(rotY);
    const P = (x, y, z) => new THREE.Vector3(cx + x * cs + z * sn, cy + y, cz - x * sn + z * cs);
    const v = [P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(-hx, hy, -hz), P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz)];
    if (!skip.includes('s')) this.quad(v[4], v[5], v[6], v[7], color);
    if (!skip.includes('n')) this.quad(v[1], v[0], v[3], v[2], color);
    if (!skip.includes('e')) this.quad(v[5], v[1], v[2], v[6], color);
    if (!skip.includes('w')) this.quad(v[0], v[4], v[7], v[3], color);
    if (!skip.includes('t')) this.quad(v[7], v[6], v[2], v[3], topColor || color);
    if (!skip.includes('b')) this.quad(v[0], v[1], v[5], v[4], color);
  }
  /* a thin box from point a to point b (cables, rails, truss chords) */
  beam(a, b, w, color) {
    const d = new THREE.Vector3().subVectors(b, a), L = d.length();
    const m = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    if (Math.abs(d.y) > Math.max(Math.abs(d.x), Math.abs(d.z))) this.box(m.x, m.y, m.z, w, L, w, color);
    else this.box(m.x, m.y, m.z, L, w, w, color, -Math.atan2(d.z, d.x));
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i.length > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere();
    return g;
  }
}

/* ------------------------------------------------------------- the ink line

   The mesh again, pushed out along its normals and drawn from the inside, the
   way rig.js draws a character's outline. It shares the scene fog so a far
   line fades with the body it belongs to. */
function inkMat(w, list) {
  const m = new THREE.MeshBasicMaterial({ color: 0x14121a, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>',
      'vec3 transformed = vec3(position) + normalize(normal) * ' + w.toFixed(4) + ';');
  };
  m.customProgramCacheKey = () => 'rrink' + w.toFixed(4);
  list.push(m);
  return m;
}

/* --------------------------------------------------------------- fan atlas

   Eight fans, each drawn calm (top row) and cheering (bottom row) in a 12 by
   16 cell. The cell is not painted in colour: it is painted in codes, and the
   crowd shader turns each code into a colour per fan, so one atlas gives
   thousands of different people.
     red    shirt (half red is the shirt in shadow)
     green  skin  (half green is skin in shadow)
     blue   hair or a cap
     white  a sign or a foam finger
     black  ink                                                            */
const CW = 12, CH = 16, NV = 8;
function fanAtlas() {
  const cv = document.createElement('canvas'); cv.width = CW * NV; cv.height = CH * 2;
  const g = cv.getContext('2d');
  const C = { s: '#ff0000', S: '#800000', k: '#00ff00', K: '#008000', h: '#0000ff', w: '#ffffff', i: '#000000' };
  for (let v = 0; v < NV; v++) for (let row = 0; row < 2; row++) {
    const ox = v * CW, oy = row * CH, cheer = row === 1;
    const px = (x, y, c) => { if (x < 0 || y < 0 || x >= CW || y >= CH) return; g.fillStyle = C[c]; g.fillRect(ox + x, oy + y, 1, 1); };
    const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(x, y, c); };
    const big = v === 4, kid = v === 5;
    const top = kid ? 6 : 3;                       /* the top of the head */
    const hx0 = big ? 3 : 4, hx1 = big ? 8 : 7;     /* head span */
    const sx0 = big ? 0 : 1, sx1 = big ? 11 : 10;   /* shoulder span */
    const sy = top + 7;                             /* the shoulder line */
    /* torso, with a shadowed right side and an ink outline round it */
    rect(sx0, sy, sx1, CH - 1, 's');
    rect(sx1 - 2, sy + 1, sx1, CH - 1, 'S');
    for (let x = sx0; x <= sx1; x++) px(x, sy - (x === sx0 || x === sx1 ? -1 : 0), 'i');
    rect(sx0, sy + 1, sx0, CH - 1, 'i'); rect(sx1, sy + 1, sx1, CH - 1, 'i');
    /* neck and head */
    rect(5, sy - 1, 6, sy - 1, 'K');
    rect(hx0, top + 1, hx1, sy - 2, 'k');
    rect(hx1, top + 2, hx1, sy - 2, 'K');
    rect(hx0 - 1, top + 2, hx0 - 1, sy - 3, 'i'); rect(hx1 + 1, top + 2, hx1 + 1, sy - 3, 'i');
    rect(hx0, sy - 1, hx0, sy - 1, 'i'); rect(hx1, sy - 1, hx1, sy - 1, 'i');
    /* hair, by type */
    if (v === 3) { rect(hx0, top, hx1, top, 'i'); }                                    /* bald */
    else if (v === 2) { rect(hx0 - 1, top, hx1 + 1, top + 1, 'h'); rect(hx1 + 1, top + 2, hx1 + 2, top + 2, 'h'); rect(hx0 - 1, top - 1, hx1 + 1, top - 1, 'i'); } /* a cap */
    else if (v === 1) { rect(hx0 - 1, top, hx1 + 1, top + 1, 'h'); rect(hx0 - 1, top + 2, hx0 - 1, sy, 'h'); rect(hx1 + 1, top + 2, hx1 + 1, sy, 'h'); rect(hx0, top - 1, hx1, top - 1, 'i'); } /* long */
    else { rect(hx0, top, hx1, top + 1, 'h'); rect(hx0, top - 1, hx1, top - 1, 'i'); }
    /* arms: down at the sides when calm, thrown up when cheering */
    if (cheer) {
      if (v === 6) {                                 /* a sign held overhead */
        rect(1, 0, 10, 3, 'w'); rect(0, 0, 0, 3, 'i'); rect(11, 0, 11, 3, 'i'); rect(1, 4, 10, 4, 'i');
        rect(2, 5, 2, sy, 'k'); rect(9, 5, 9, sy, 'k');
      } else if (v === 7) {                          /* a foam finger */
        rect(9, 0, 10, 3, 'w'); rect(8, 3, 11, 6, 'w'); rect(8, 2, 8, 2, 'i');
        rect(0, top, 1, sy, 'k'); rect(10, 7, 10, sy, 'k');
      } else {
        rect(0, top - 1, 1, sy, 'k'); rect(10, top - 1, 11, sy, 'k');
        rect(0, top - 2, 1, top - 2, 'i'); rect(10, top - 2, 11, top - 2, 'i');
      }
    } else if (v === 6) {                            /* a sign held at the chest */
      rect(2, sy + 1, 9, CH - 2, 'w'); rect(2, sy, 9, sy, 'i');
    } else if (v === 7) {
      rect(9, sy - 3, 10, sy, 'w'); rect(9, sy - 4, 10, sy - 4, 'i');
    }
  }
  return canvasTex(cv);
}

/* the camera flash: a four point star, white */
function flashSprite() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 7;
  const g = cv.getContext('2d'); g.fillStyle = '#fff';
  g.fillRect(3, 0, 1, 7); g.fillRect(0, 3, 7, 1); g.fillRect(2, 2, 3, 3);
  return canvasTex(cv);
}

/* ----------------------------------------------------------- crowd shader */
const FAN_VS = /* glsl */`
#include <common>
#include <fog_pars_vertex>
attribute float aFrame;
attribute float aSeed;
attribute float aShade;
uniform float uTime;
uniform float uHeat;
varying vec2 vUv;
varying vec3 vShirt;
varying float vSeed;
varying float vShade;
void main() {
  /* a spherical billboard: the fan's centre goes through the model and view
     matrices, and the quad is laid flat across the view from there */
  float sc = length(instanceMatrix[0].xyz);
  vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float ph = aSeed * 6.2831853;
  float sp = 5.0 + fract(aSeed * 7.13) * 4.0;
  float s = sin(uTime * sp + ph);
  /* how keen this fan is: the keen ones go up first as the heat rises */
  float keen = fract(aSeed * 13.71);
  float up = step(keen, 0.12 + uHeat * 0.88);
  float amp = (0.03 + uHeat * 0.38 * up) * sc;
  float bob = max(0.0, s) * amp + sin(uTime * 1.3 + ph) * 0.025 * sc;
  float cheer = up * step(keen, uHeat * 0.95) * step(0.1, s);
  vec4 mvPosition = vec4(c.xyz + vec3(position.x * sc, position.y * sc + bob, 0.0), 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vUv = vec2((aFrame + uv.x) / ${NV.toFixed(1)}, 1.0 - (cheer + 1.0 - uv.y) * 0.5);
  vShirt = instanceColor;
  vSeed = aSeed;
  vShade = aShade;
  #include <fog_vertex>
}`;
const FAN_FS = /* glsl */`
#include <common>
#include <fog_pars_fragment>
uniform sampler2D uMap;
uniform vec3 uSkin[4];
uniform vec3 uHair[4];
uniform vec3 uSign;
uniform float uBright;
varying vec2 vUv;
varying vec3 vShirt;
varying float vSeed;
varying float vShade;
void main() {
  vec4 t = texture2D(uMap, vUv);
  if (t.a < 0.5) discard;
  int k = int(fract(vSeed * 31.7) * 3.999);
  int j = int(fract(vSeed * 57.3) * 3.999);
  vec3 c;
  if (t.r > 0.9 && t.g > 0.9 && t.b > 0.9) c = uSign;
  else if (t.r > 0.2) c = vShirt * (t.r > 0.75 ? 1.0 : 0.62);
  else if (t.g > 0.2) c = uSkin[k] * (t.g > 0.75 ? 1.0 : 0.72);
  else if (t.b > 0.2) c = uHair[j];
  else c = vec3(0.03, 0.025, 0.04);
  gl_FragColor = vec4(c * uBright * vShade, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const FLASH_VS = /* glsl */`
#include <common>
#include <fog_pars_vertex>
attribute float aSeed;
uniform float uTime;
uniform float uRate;
uniform float uBurst;
varying vec2 vUv;
varying float vOn;
void main() {
  float per = 1.6 + fract(aSeed * 17.3) * 5.0;
  float p = fract(uTime / per + aSeed);
  float on = step(p, 0.05) * step(fract(aSeed * 91.3), uRate);
  /* a burst lights a share of the house at once, flickering per flash */
  on = max(on, step(fract(aSeed * 53.1), uBurst * 0.8) * step(0.35, fract(uTime * 9.0 + aSeed * 3.0)));
  vOn = on;
  vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float sz = 0.9 * on * (1.0 - p * 6.0 * step(p, 0.05) * 0.5);
  vec4 mvPosition = vec4(c.xyz + vec3(position.xy * sz, 0.0), 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vUv = uv;
  #include <fog_vertex>
}`;
const FLASH_FS = /* glsl */`
#include <common>
#include <fog_pars_fragment>
uniform sampler2D uMap;
varying vec2 vUv;
varying float vOn;
void main() {
  if (vOn < 0.5) discard;
  vec4 t = texture2D(uMap, vUv);
  if (t.a < 0.5) discard;
  gl_FragColor = vec4(vec3(1.0, 0.98, 0.9), 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/* ============================================================ buildArena */
export function buildArena(theme, opts = {}) {
  const T = theme;
  const name = String(opts.name || '').toUpperCase();
  const high = opts.quality !== 'low';
  const seats = Math.max(2, Math.min(6, T.seats | 0));
  const rnd = rngOf(name + '|' + T.mat[0] + '|' + T.seats);

  const group = new THREE.Group(); group.name = 'arena';
  const lights = [];
  const disposables = { geo: [], mat: [], tex: [] };
  const own = (x) => { if (x.isBufferGeometry) disposables.geo.push(x); else if (x.isTexture) disposables.tex.push(x); else if (x.isMaterial) disposables.mat.push(x); return x; };
  const GRAD = own(makeGrad());
  const toonC = new Map();
  const toon = (c, extra) => {
    const key = (typeof c === 'string' ? c : '#' + col(c).getHexString()) + (extra ? JSON.stringify(Object.keys(extra)) : '');
    if (!extra && toonC.has(key)) return toonC.get(key);
    const m = own(new THREE.MeshToonMaterial(Object.assign({ color: col(c), gradientMap: GRAD }, extra || {})));
    if (!extra) toonC.set(key, m);
    return m;
  };
  const inkList = [];

  /* the palette, read off the theme */
  const wallC = hexesOf(T.wall); while (wallC.length < 3) wallC.push(wallC[wallC.length - 1] || '#101014');
  const glow = rgbaOf(T.glow, T.pad).c;
  const trim = rgbaOf(T.trim, '#ffffff');
  const tones = T.tone.map((c) => new THREE.Color(c));
  const dim = T.dim;
  const steel = '#8e939c', steelD = '#4b4f57';
  const floorC = mix(wallC[2], '#1a1a1e', 0.5);
  const seatC = mix(mul(T.mat[1], 0.5), wallC[1], 0.45);

  /* ================================================================ RING */

  /* the canvas: the mat colour, a darker band where the canvas runs out past
     the ropes to the apron edge, faint seams, and the promotion's short name
     lettered in the middle a shade darker than the mat */
  const MATPX = 192;
  const matCv = document.createElement('canvas'); matCv.width = matCv.height = MATPX;
  {
    const g = matCv.getContext('2d');
    const m0 = new THREE.Color(T.mat[0]), m1 = new THREE.Color(T.mat[1]);
    g.fillStyle = '#' + m0.getHexString(); g.fillRect(0, 0, MATPX, MATPX);
    const px = MATPX / (APRON * 2);              /* texels per foot */
    const edge = Math.round((APRON - HALF) * px);
    g.fillStyle = '#' + m0.clone().lerp(m1, 0.55).getHexString();
    g.fillRect(0, 0, MATPX, edge); g.fillRect(0, MATPX - edge, MATPX, edge);
    g.fillRect(0, 0, edge, MATPX); g.fillRect(MATPX - edge, 0, edge, MATPX);
    /* the seams, and a scatter of scuffs so a big flat area is never dead */
    g.fillStyle = 'rgba(0,0,0,0.10)';
    for (const f of [0.34, 0.66]) { const p = Math.round(MATPX * f); g.fillRect(p, edge, 1, MATPX - edge * 2); }
    const r2 = rngOf('scuff' + name);
    for (let i = 0; i < 260; i++) { g.fillStyle = r2() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.05)'; g.fillRect(r2() * MATPX | 0, r2() * MATPX | 0, 1, 1); }
    /* the lettering */
    if (name) {
      const tx = pixelText(name, Math.round(MATPX * 0.17), MATPX * 0.62, '#' + m0.clone().lerp(m1, 0.9).getHexString());
      g.globalAlpha = 0.85; g.drawImage(tx, Math.round((MATPX - tx.width) / 2), Math.round((MATPX - tx.height) / 2)); g.globalAlpha = 1;
    }
    /* a border line at the very edge of the canvas, where it folds over */
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, MATPX, 1); g.fillRect(0, MATPX - 1, MATPX, 1); g.fillRect(0, 0, 1, MATPX); g.fillRect(MATPX - 1, 0, 1, MATPX);
  }
  const matTex = own(canvasTex(matCv, false, true));
  const matMesh = new THREE.Mesh(own(new THREE.PlaneGeometry(APRON * 2, APRON * 2)), toon('#ffffff', { map: matTex }));
  matMesh.rotation.x = -Math.PI / 2; matMesh.receiveShadow = true; matMesh.name = 'canvas';
  group.add(matMesh);

  /* the apron skirt: four faces of the ring box below the canvas, in the apron
     gradient (banded, pixel style) with a rope coloured trim along the top and
     the name lettered on every side, the way a real skirt is printed */
  const apCv = document.createElement('canvas'); apCv.width = 192; apCv.height = 34;
  {
    const g = apCv.getContext('2d');
    bandFill(g, 0, 0, apCv.width, apCv.height, T.apron[0], T.apron[1], 5);
    g.fillStyle = T.rope; g.fillRect(0, 1, apCv.width, 1);
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, 0, apCv.width, 1); g.fillRect(0, apCv.height - 2, apCv.width, 2);
    if (name) {
      const tx = pixelText(name, 18, apCv.width * 0.7, '#f4efe4', '#120c0a');
      g.drawImage(tx, Math.round((apCv.width - tx.width) / 2), Math.round((apCv.height - tx.height) / 2) + 1);
    }
  }
  const apTex = own(canvasTex(apCv, false, true));
  const skirtGeo = new THREE.BufferGeometry();
  {
    const P = [], N = [], U = [], I = [];
    const A = APRON, y0 = FLOOR, y1 = 0;
    const faces = [ /* corner a, corner b (counter clockwise from outside), normal */
      [[-A, A], [A, A], [0, 1]], [[A, A], [A, -A], [1, 0]], [[A, -A], [-A, -A], [0, -1]], [[-A, -A], [-A, A], [-1, 0]]];
    faces.forEach(([a, b, n], f) => {
      const o = P.length / 3;
      P.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1], a[0], y1, a[1]);
      for (let k = 0; k < 4; k++) N.push(n[0], 0, n[1]);
      U.push(0, 0, 1, 0, 1, 1, 0, 1);
      I.push(o, o + 1, o + 2, o, o + 2, o + 3); void f;
    });
    skirtGeo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    skirtGeo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    skirtGeo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    skirtGeo.setIndex(I);
  }
  const skirt = new THREE.Mesh(own(skirtGeo), toon('#ffffff', { map: apTex }));
  skirt.receiveShadow = true; skirt.name = 'apron'; group.add(skirt);
  /* the ring's silhouette in ink, so the box reads against the floor */
  const ringInk = new THREE.Mesh(own(new THREE.BoxGeometry(APRON * 2, -FLOOR, APRON * 2)), inkMat(0.07, inkList));
  ringInk.position.y = FLOOR / 2; group.add(ringInk);

  /* the posts: steel, from inside the ring up to the cap */
  const postH = POST_TOP + 0.6;
  const postGeo = own(new THREE.CylinderGeometry(0.2, 0.2, postH, 8));
  postGeo.translate(0, postH / 2 - 0.6, 0);
  const posts = new THREE.InstancedMesh(postGeo, toon(steel), 4);
  const postInk = new THREE.InstancedMesh(postGeo, inkMat(0.05, inkList), 4);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), V = new THREE.Vector3(), E = new THREE.Euler();
  CORNERS.forEach(([x, z], i) => { M.makeTranslation(x, 0, z); posts.setMatrixAt(i, M); postInk.setMatrixAt(i, M); });
  posts.castShadow = true; group.add(posts, postInk);

  /* the turnbuckle pads: one at each rope height on each corner, turned to
     face the middle of the ring, because the stacked pads are what make a
     corner read as a corner from any distance */
  const RL = HALF + 0.12;                         /* where the rope lines run */
  const padGeo = own(new THREE.BoxGeometry(0.8, 0.72, 0.42));
  const pads = new THREE.InstancedMesh(padGeo, toon(T.pad), 12);
  const padInk = new THREE.InstancedMesh(padGeo, inkMat(0.05, inkList), 12);
  {
    let i = 0;
    for (const [x, z] of CORNERS) for (const h of ROPES) {
      const k = (RL + 0.05) / POST;
      E.set(0, Math.atan2(-x, -z), 0); Q.setFromEuler(E); V.set(x * k, h, z * k); S.set(1, 1, 1);
      M.compose(V, Q, S); pads.setMatrixAt(i, M); padInk.setMatrixAt(i, M); i++;
    }
  }
  pads.castShadow = true; group.add(pads, padInk);

  /* ---- the ropes ----
     Twelve tubes in one geometry, rebuilt from their curves whenever they move.
     Each rope is a straight run between two corners with a little natural sag,
     plus a bow outward that a damped spring per side drives when somebody is
     thrown into it. 13 rings of 6 vertices a rope is under a thousand
     vertices, so rewriting them every frame costs nothing worth measuring. */
  const RSEG = 12, RRAD = 6, RR = 0.085, SAG = 0.13;
  const SIDES = {
    n: { a: [-RL, -RL], b: [RL, -RL], o: [0, -1] },
    e: { a: [RL, -RL], b: [RL, RL], o: [1, 0] },
    s: { a: [RL, RL], b: [-RL, RL], o: [0, 1] },
    w: { a: [-RL, RL], b: [-RL, -RL], o: [-1, 0] },
  };
  const SIDE_KEYS = ['n', 'e', 's', 'w'];
  const spring = {}; SIDE_KEYS.forEach((k, i) => { spring[k] = { x: 0, v: 0, ph: i * 1.7 }; });
  const TIER_K = [0.8, 1.0, 0.9];
  const ropeGeo = own(new THREE.BufferGeometry());
  const nRopeV = 12 * (RSEG + 1) * RRAD;
  const rp = new Float32Array(nRopeV * 3), rn = new Float32Array(nRopeV * 3);
  {
    const idx = [];
    for (let r = 0; r < 12; r++) {
      const base = r * (RSEG + 1) * RRAD;
      for (let s = 0; s < RSEG; s++) for (let k = 0; k < RRAD; k++) {
        const a = base + s * RRAD + k, b = base + s * RRAD + (k + 1) % RRAD, c = a + RRAD, d = b + RRAD;
        idx.push(a, c, b, b, c, d);
      }
    }
    ropeGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3).setUsage(THREE.DynamicDrawUsage));
    ropeGeo.setAttribute('normal', new THREE.BufferAttribute(rn, 3).setUsage(THREE.DynamicDrawUsage));
    ropeGeo.setIndex(idx);
    ropeGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, 0), 20);
  }
  function writeRopes(t) {
    let vi = 0;
    SIDE_KEYS.forEach((key) => {
      const sd = SIDES[key], sp = spring[key];
      const idle = 0.012 * Math.sin(t * 1.7 + sp.ph);
      ROPES.forEach((h, tier) => {
        const disp = (sp.x + idle) * TIER_K[tier];
        for (let s = 0; s <= RSEG; s++) {
          const u = s / RSEG, bow = Math.sin(Math.PI * u);
          const px = sd.a[0] + (sd.b[0] - sd.a[0]) * u + sd.o[0] * disp * bow;
          const pz = sd.a[1] + (sd.b[1] - sd.a[1]) * u + sd.o[1] * disp * bow;
          const py = h - SAG * 4 * u * (1 - u) - Math.abs(disp) * 0.12 * bow;
          for (let k = 0; k < RRAD; k++) {
            const ang = (k / RRAD) * Math.PI * 2 + Math.PI / RRAD;
            const cu = Math.cos(ang), su = Math.sin(ang);
            const nx = sd.o[0] * su, ny = cu, nz = sd.o[1] * su;
            rp[vi * 3] = px + nx * RR; rp[vi * 3 + 1] = py + ny * RR; rp[vi * 3 + 2] = pz + nz * RR;
            rn[vi * 3] = nx; rn[vi * 3 + 1] = ny; rn[vi * 3 + 2] = nz;
            vi++;
          }
        }
      });
    });
    ropeGeo.attributes.position.needsUpdate = true; ropeGeo.attributes.normal.needsUpdate = true;
  }
  writeRopes(0);
  /* the ropes get a touch of emissive so they stay legible as thin bright
     lines against a dark house even where the key light falls off */
  const ropeMat = toon(T.rope, { emissive: mul(T.rope, 0.18) });
  const ropes = new THREE.Mesh(ropeGeo, ropeMat); ropes.castShadow = true; ropes.frustumCulled = false; ropes.name = 'ropes';
  group.add(ropes);
  /* No ink hull on the ropes, on purpose: a rope is one or two pixels thick
     at this resolution, and a hull that thin breaks up into dark dashes along
     it. The emissive lift above is what keeps them reading instead. */

  /* ---- the steel steps, at two opposite corners (front left, back right) ---- */
  const stepB = new Builder();
  {
    /* local frame: +z runs away from the ring along the diagonal, the tallest
       tier is against the apron */
    const tiers = [[0, -0.2], [1.25, -1.45], [2.5, -2.7]];
    for (const [z0, top] of tiers) stepB.box(0, (FLOOR + top) / 2, z0 + 0.62, 2.4, top - FLOOR, 1.25, '#575c65', 0, '', '#7b828c');
  }
  const stepGeo = own(stepB.geometry());
  const steps = new THREE.InstancedMesh(stepGeo, toon('#ffffff', { vertexColors: true }), 2);
  const stepInk = new THREE.InstancedMesh(stepGeo, inkMat(0.05, inkList), 2);
  [[-1, 1], [1, -1]].forEach(([sx, sz], i) => {
    const d = APRON + 0.05;
    E.set(0, Math.atan2(sx, sz), 0); Q.setFromEuler(E); V.set(sx * d * 0.985, 0, sz * d * 0.985); S.set(1, 1, 1);
    M.compose(V, Q, S); steps.setMatrixAt(i, M); stepInk.setMatrixAt(i, M);
  });
  steps.castShadow = true; steps.receiveShadow = true; group.add(steps, stepInk);

  /* ============================================================ RINGSIDE */
  const lit = new Builder(), unlit = new Builder();
  const F = FLOOR;

  /* the arena floor, the padded mats round the ring and the concrete beyond */
  const matsC = mix(T.apron[1], '#2a2e38', 0.55);
  lit.box(0, F + 0.04, 0, (APRON + 4) * 2, 0.08, (APRON + 4) * 2, matsC, 0, 'b');
  /* mat seams: thin darker strips laid on top so the mats read as mats */
  for (const s of [-1, 1]) {
    lit.box(s * (APRON + 2), F + 0.085, 0, 0.12, 0.01, (APRON + 4) * 2, mul(matsC, 0.6), 0, 'b');
    lit.box(0, F + 0.085, s * (APRON + 2), (APRON + 4) * 2, 0.01, 0.12, mul(matsC, 0.6), 0, 'b');
  }

  /* ---- the guard rail ----
     Padded panels on a steel frame all round the ringside floor, with a gap at
     the far end where the entrance ramp comes through. The pad colour runs
     along the top as a trim, which ties the rail to the ring at a glance. */
  const B = BARRIER, railH = 3.4;
  const stage = seats >= 4;
  const aisle = stage ? 4 : 2.2;                    /* half width of the entrance gap */
  const panelC = mix(wallC[1], '#22252d', 0.5);
  const railRun = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 4));
    for (let i = 0; i < n; i++) {
      const ax = x0 + (x1 - x0) * i / n, az = z0 + (z1 - z0) * i / n, bx = x0 + (x1 - x0) * (i + 1) / n, bz = z0 + (z1 - z0) * (i + 1) / n;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2, rot = -Math.atan2(bz - az, bx - ax), seg = L / n;
      lit.box(mx, F + railH / 2, mz, seg - 0.12, railH - 0.3, 0.28, panelC, rot);
      lit.box(mx, F + railH - 0.08, mz, seg, 0.16, 0.38, T.pad, rot);
      lit.box(ax, F + railH / 2, az, 0.18, railH, 0.18, steelD);
    }
  };
  railRun(-B, B, B, B); railRun(B, B, B, -B); railRun(-B, -B, -B, B);
  railRun(-B, -B, -aisle, -B); railRun(aisle, -B, B, -B);
  lit.box(B, F + railH / 2, -B, 0.18, railH, 0.18, steelD);

  /* ---- the announce table and the timekeeper ----
     On the near side because that is where it lives on television, but off to
     the hard camera's left and kept low, so it frames the bottom of the shot
     without ever standing between the camera and the ring. */
  {
    const tz = (APRON + 4 + B) / 2 + 0.05, tx = -7.6, tw = 7.2, td = 1.5, th = 2.4;
    lit.box(tx, F + th / 2, tz, tw, th - 0.12, td, mix(T.apron[1], '#111', 0.3));
    lit.box(tx, F + th - 0.05, tz, tw + 0.3, 0.12, td + 0.25, '#2a2c33');
    /* the table's skirt faces the ring: the apron colour with a rope trim */
    lit.box(tx, F + th * 0.55, tz - td / 2 - 0.01, tw - 0.4, th * 0.6, 0.02, T.apron[0], 0, 'b');
    lit.box(tx, F + th * 0.86, tz - td / 2 - 0.02, tw - 0.4, 0.12, 0.02, T.rope, 0, 'b');
    for (const mx of [-2.4, 0, 2.4]) {
      lit.box(tx + mx, F + th + 0.38, tz + 0.2, 1.1, 0.7, 0.12, '#15161a');
      unlit.box(tx + mx, F + th + 0.4, tz + 0.13, 0.95, 0.52, 0.02, mix(glow, '#9fc4ff', 0.5), 0, 'b');
    }
    /* the timekeeper's bell table on the other side of the steps */
    lit.box(6.8, F + 1.1, tz, 2.6, 2.2, 1.3, '#2a2c33');
    lit.box(6.8, F + 2.3, tz, 0.5, 0.25, 0.5, '#d8b440');
  }

  /* ============================================================ THE HOUSE

     Tiered stands round all four sides, scaled by the promotion's money.
     Decks are rows of risers; each row is a box from the floor to its top, so
     the bowl is one solid stepped shape with no gaps to see through. The near
     side (behind the hard camera) only gets a few floor rows, low enough that
     their heads sit along the bottom of the shot like a real broadcast instead
     of a wall between the camera and the ring. */
  const ROW_D = 2.6;
  const decks = seats <= 2 ? [[4, 1.15]] : seats <= 3 ? [[7, 1.2]] : seats <= 5 ? [[8, 1.15], [7, 1.75]] : [[9, 1.1], [8, 1.7], [7, 2.15]];
  const deckList = high ? decks : decks.slice(0, 2);
  const nearRows = seats <= 2 ? 2 : 3;
  const nearClear = opts.nearClear == null ? 44 : opts.nearClear;
  const startD = B + 1.6;
  /* dens is the CSS seat pitch in pixels (lower is a fuller house), so the
     seat pitch in feet and the share of seats filled both follow it */
  const pitch = (1.45 + (T.dens - 6) * 0.05) * (high ? 1 : 1.35);
  const fill = Math.max(0.55, Math.min(1, 1.06 - (T.dens - 6) * 0.045));
  const rows = [];                               /* {d, y, deck, row} */
  {
    let d = startD, y = F;
    deckList.forEach(([n, rise], di) => {
      if (di > 0) { d += 3.2; y += 3.5; }        /* a concourse, then the deck front */
      for (let r = 0; r < n; r++) { y += rise; rows.push({ d, y, deck: di, row: r, rise }); d += ROW_D; }
    });
  }
  const outer = rows[rows.length - 1].d + ROW_D;
  const topY = rows[rows.length - 1].y;
  const deck0Back = rows.filter((r) => r.deck === 0).slice(-1)[0].d + ROW_D;

  /* the entrance stage sits in a gap at the far end of the lower deck */
  const stageFrontZ = -(deck0Back + 1.5);
  const tronHalf = 12.5;
  const farGap = (r) => (stage ? (r.deck === 0 ? aisle + 6.5 : tronHalf + 2) : (r.deck === 0 ? aisle : 0));

  const fans = [];
  const putFan = (x, y, z, r) => {
    if (rnd() > fill) return;
    const nr = rows.filter((q) => q.deck === r.deck).length;
    const shade = (1 - 0.32 * (r.row / Math.max(1, nr))) * (1 - 0.14 * r.deck);
    fans.push({ x, y, z, shade, deck: r.deck });
  };
  rows.forEach((r, ri) => {
    const isNearOk = r.deck === 0 && r.row < nearRows;
    const c = mix(seatC, '#000', (r.row % 2) * 0.12 + r.deck * 0.08);
    const top = mix(c, '#ffffff', 0.08);
    const h = r.y - F;
    /* east and west run the full length and own the corners */
    for (const sx of [-1, 1]) {
      lit.box(sx * (r.d + ROW_D / 2), F + h / 2, 0, ROW_D, h, (r.d + ROW_D) * 2, c, 0, 'b', top);
      for (let z = -(r.d + ROW_D * 0.5); z <= r.d + ROW_D * 0.5; z += pitch) {
        putFan(sx * (r.d + ROW_D * 0.55), r.y + 1.0, z + (rnd() - 0.5) * 0.25, r);
      }
    }
    /* the far side, with the entrance gap */
    const g = farGap(r);
    const runs = g > 0 ? [[-r.d, -g], [g, r.d]] : [[-r.d, r.d]];
    for (const [x0, x1] of runs) {
      if (x1 - x0 < 0.5) continue;
      lit.box((x0 + x1) / 2, F + h / 2, -(r.d + ROW_D / 2), x1 - x0, h, ROW_D, c, 0, 'b', top);
      for (let x = x0 + pitch / 2; x < x1; x += pitch) putFan(x + (rnd() - 0.5) * 0.25, r.y + 1.0, -(r.d + ROW_D * 0.55), r);
    }
    /* the near side: a few low floor rows, then nothing until the rows are
       far enough back to be behind the hard camera (opts.nearClear), so an
       orbit round the ring still finds a full bowl */
    if (isNearOk) {
      const nh = 0.3 + r.row * 0.55;
      lit.box(0, F + nh / 2, r.d + ROW_D / 2, r.d * 2, nh, ROW_D, c, 0, 'b', top);
      for (let x = -r.d + pitch / 2; x < r.d; x += pitch) putFan(x + (rnd() - 0.5) * 0.25, F + nh + 1.0, r.d + ROW_D * 0.55, r);
    } else if (r.d >= nearClear) {
      lit.box(0, F + h / 2, r.d + ROW_D / 2, r.d * 2, h, ROW_D, c, 0, 'b', top);
      for (let x = -r.d + pitch / 2; x < r.d; x += pitch) putFan(x + (rnd() - 0.5) * 0.25, r.y + 1.0, r.d + ROW_D * 0.55, r);
    }
    /* the front of each upper deck carries a ribbon board in the glow colour */
    if (r.deck > 0 && r.row === 0) {
      const fy = r.y - r.rise - 0.2, rb = mix(glow, '#ffffff', 0.15);
      for (const sx of [-1, 1]) {
        const x = sx * (r.d - 0.02);
        unlit.quad(new THREE.Vector3(x, fy - 1.1, -sx * r.d), new THREE.Vector3(x, fy - 1.1, sx * r.d), new THREE.Vector3(x, fy, sx * r.d), new THREE.Vector3(x, fy, -sx * r.d), rb);
      }
      for (const [x0, x1] of runs) if (x1 - x0 > 0.5) unlit.quad(new THREE.Vector3(x0, fy - 1.1, -r.d + 0.02), new THREE.Vector3(x1, fy - 1.1, -r.d + 0.02), new THREE.Vector3(x1, fy, -r.d + 0.02), new THREE.Vector3(x0, fy, -r.d + 0.02), rb);
    }
    void ri;
  });
  /* the floor under and beyond everything */
  const W = outer + 3, H = topY + 10 + seats * 2;
  lit.box(0, F - 0.05, 0, W * 2, 0.1, W * 2, floorC, 0, 'b');

  /* the walls and the ceiling: the theme's own room gradient, unlit, so the
     house falls away into the dark behind the stands. A trim band runs round
     at the height of the top row in the theme's trim colour. */
  {
    const top = mul(wallC[0], 0.9), midC = col(wallC[1]), bot = col(wallC[2]);
    const wall = (ax, az, bx, bz) => {
      const yM = F + (H - F) * 0.45;
      unlit.quad(new THREE.Vector3(ax, F, az), new THREE.Vector3(bx, F, bz), new THREE.Vector3(bx, yM, bz), new THREE.Vector3(ax, yM, az), bot, midC);
      unlit.quad(new THREE.Vector3(ax, yM, az), new THREE.Vector3(bx, yM, bz), new THREE.Vector3(bx, H, bz), new THREE.Vector3(ax, H, az), midC, top);
    };
    wall(-W, -W, W, -W); wall(W, -W, W, W); wall(W, W, -W, W); wall(-W, W, -W, -W);
    unlit.quad(new THREE.Vector3(-W, H, -W), new THREE.Vector3(W, H, -W), new THREE.Vector3(W, H, W), new THREE.Vector3(-W, H, W), mul(top, 0.6));
    /* the trim: broken segments, the way the CSS repeating gradient draws it */
    const tc = mix(midC, trim.c, Math.min(0.85, trim.a * 2.2)), ty = Math.min(H - 2, topY + 3.2);
    for (const [ax, az, bx, bz, nx, nz] of [[-W, -W, W, -W, 0, 1], [W, -W, W, W, -1, 0], [W, W, -W, W, 0, -1], [-W, W, -W, -W, 1, 0]]) {
      const L = Math.hypot(bx - ax, bz - az), n = Math.round(L / 5);
      for (let i = 0; i < n; i += 2) {
        const u0 = i / n, u1 = (i + 1) / n;
        const p0 = new THREE.Vector3(ax + (bx - ax) * u0 + nx * 0.05, ty, az + (bz - az) * u0 + nz * 0.05);
        const p1 = new THREE.Vector3(ax + (bx - ax) * u1 + nx * 0.05, ty, az + (bz - az) * u1 + nz * 0.05);
        unlit.quad(p0, p1, p1.clone().setY(ty + 0.9), p0.clone().setY(ty + 0.9), tc);
      }
    }
  }

  /* ---- the entrance: a stage, a ramp and a screen once there is money for
     one, a banner on two cables before that ---- */
  let screen = null, screenCv = null, screenTex = null, screenG = null, nameBmp = null;
  const entrance = { x: 0, y: F, z: -B };
  if (name) nameBmp = pixelText(name, 22, 84, '#ffffff', '#0a0a10');
  if (stage) {
    const sY = F + 3, sz0 = stageFrontZ, sd = 9;
    lit.box(0, (F + sY) / 2, sz0 - sd / 2, tronHalf * 2 + 6, sY - F, sd, '#1e2028', 0, 'b', '#2b2e38');
    /* the ramp from the gap in the rail to the stage front */
    const rz0 = -B + 0.2, rz1 = sz0, rY = F + 2.2;
    lit.box(0, (F + rY) / 2, (rz0 + rz1) / 2, aisle * 1.6, rY - F, rz0 - rz1, '#24262e', 0, 'b', '#30333d');
    for (const sx of [-1, 1]) unlit.box(sx * aisle * 0.8, rY + 0.03, (rz0 + rz1) / 2, 0.14, 0.06, rz0 - rz1, mix(T.pad, '#fff', 0.2), 0, 'b');
    /* the screen frame: a truss arch round the tron */
    const fy0 = sY + 0.4, fy1 = fy0 + 10.6, fz = sz0 - sd + 1.2;
    for (const sx of [-1, 1]) lit.box(sx * (tronHalf + 0.7), (fy0 + fy1) / 2 + 0.6, fz, 0.8, fy1 - fy0 + 1.4, 0.8, steelD);
    lit.box(0, fy1 + 0.9, fz, tronHalf * 2 + 2.2, 0.8, 0.8, steelD);
    entrance.y = sY; entrance.z = sz0 - 1.5;
    screenCv = document.createElement('canvas'); screenCv.width = 120; screenCv.height = 48;
    screenG = screenCv.getContext('2d');
    screenTex = own(canvasTex(screenCv, false, true));
    screen = new THREE.Mesh(own(new THREE.PlaneGeometry(tronHalf * 2, 10)), own(new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false })));
    screen.position.set(0, fy0 + 5.2, fz + 0.45); screen.name = 'tron';
    group.add(screen);
  } else if (name) {
    /* a banner hung above the far stands */
    const farRow = rows[rows.length - 1];
    const bz = -(outer - 0.6), by = Math.min(H - 6.5, farRow.y + 4.2), bw = seats <= 2 ? 13 : 16, bh = bw * 0.28;
    screenCv = document.createElement('canvas'); screenCv.width = 96; screenCv.height = 27;
    const g = screenCv.getContext('2d');
    bandFill(g, 0, 0, 96, 27, T.apron[0], T.apron[1], 4);
    g.fillStyle = T.rope; g.fillRect(0, 2, 96, 1); g.fillRect(0, 24, 96, 1);
    const tx = pixelText(name, 17, 80, '#f6f0e2', '#120c0a');
    g.drawImage(tx, Math.round((96 - tx.width) / 2), Math.round((27 - tx.height) / 2));
    screenTex = own(canvasTex(screenCv, false, true));
    screen = new THREE.Mesh(own(new THREE.PlaneGeometry(bw, bh)), toon('#ffffff', { map: screenTex, emissive: new THREE.Color('#ffffff'), emissiveMap: screenTex, emissiveIntensity: 0.25 }));
    screen.position.set(0, by, bz); screen.name = 'banner'; group.add(screen);
    for (const sx of [-1, 1]) lit.beam(new THREE.Vector3(sx * bw * 0.45, by + bh / 2, bz), new THREE.Vector3(sx * bw * 0.45, H, bz), 0.06, '#3a3a40');
    screenCv = null; /* a banner never redraws */
  }

  /* ---- the rig over the ring ----
     A square truss over the big shows, a single pipe over the cheap ones, with
     the cans hung off it. How many cans follows the building, as in the flat
     screen's venueHTML. */
  const pipe = seats <= 2;
  const rigY = pipe ? 15 : seats <= 3 ? 18 : 21, rigR = pipe ? 0 : 12.5;
  if (pipe) {
    lit.beam(new THREE.Vector3(-9, rigY, 0), new THREE.Vector3(9, rigY, 0), 0.25, '#2c2c30');
    for (const sx of [-1, 1]) lit.beam(new THREE.Vector3(sx * 8, rigY, 0), new THREE.Vector3(sx * 8, H, 0), 0.06, '#2c2c30');
  } else {
    for (const [ax, az, bx, bz] of [[-rigR, -rigR, rigR, -rigR], [rigR, -rigR, rigR, rigR], [rigR, rigR, -rigR, rigR], [-rigR, rigR, -rigR, -rigR]]) {
      lit.beam(new THREE.Vector3(ax, rigY + 0.45, az), new THREE.Vector3(bx, rigY + 0.45, bz), 0.22, '#3a3d45');
      lit.beam(new THREE.Vector3(ax, rigY - 0.45, az), new THREE.Vector3(bx, rigY - 0.45, bz), 0.22, '#3a3d45');
      const n = 8;
      for (let i = 0; i <= n; i++) { const u = i / n, x = ax + (bx - ax) * u, z = az + (bz - az) * u; lit.box(x, rigY, z, 0.12, 0.9, 0.12, '#3a3d45'); }
    }
    for (const [x, z] of [[-rigR, -rigR], [rigR, -rigR], [rigR, rigR], [-rigR, rigR]]) lit.beam(new THREE.Vector3(x, rigY + 0.5, z), new THREE.Vector3(x, H, z), 0.08, '#2c2c30');
  }
  const nCans = pipe ? 2 : seats <= 3 ? 4 : seats <= 4 ? 8 : 12;
  const canPos = [];
  if (pipe) canPos.push([-5, rigY - 0.6, 0], [5, rigY - 0.6, 0]);
  else {
    const per = nCans / 4;
    for (const [ax, az, bx, bz] of [[-rigR, -rigR, rigR, -rigR], [rigR, -rigR, rigR, rigR], [rigR, rigR, -rigR, rigR], [-rigR, rigR, -rigR, -rigR]])
      for (let i = 0; i < per; i++) { const u = (i + 0.5) / per; canPos.push([ax + (bx - ax) * u, rigY - 0.9, az + (bz - az) * u]); }
  }
  const warm = new THREE.Color('#fff1dc'), padC = new THREE.Color(T.pad);
  const canB = new Builder();
  canB.box(0, 0, 0, 0.75, 0.9, 0.75, '#18181c');
  canB.box(0, -0.46, 0, 0.6, 0.04, 0.6, '#fffaf0', 0, 't');
  const cans = new THREE.InstancedMesh(own(canB.geometry()), own(new THREE.MeshBasicMaterial({ vertexColors: true })), canPos.length);
  canPos.forEach(([x, y, z], i) => { M.makeTranslation(x, y, z); cans.setMatrixAt(i, M); });
  group.add(cans);

  /* ---- beams ----
     Additive cones, apex at a can. The fixed ones wash the ring (soft, so the
     shot is never a white sheet); the sweeping ones only appear during an
     entrance or a hot crowd and swing out over the stands, coloured. */
  let beams = null, beamDefs = [];
  if (high) {
    const bg = own(new THREE.CylinderGeometry(0.18, 1, 1, 10, 1, true));
    bg.translate(0, -0.5, 0);
    const pc = bg.attributes.position, cc = [];
    for (let i = 0; i < pc.count; i++) { const y = -pc.getY(i); const a = 0.45 * Math.pow(1 - y, 1.5) + 0.03; cc.push(1, 1, 1, a); }
    bg.setAttribute('color', new THREE.Float32BufferAttribute(cc, 4));
    const bm = own(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }));
    canPos.forEach((p, i) => {
      const k = i / canPos.length * Math.PI * 2;
      beamDefs.push({ from: new THREE.Vector3(...p), kind: 'wash', target: new THREE.Vector3(Math.cos(k) * 6.5, 0, Math.sin(k) * 6.5), color: (i % 2 && seats > 2) ? padC : warm, bright: 0.2 });
    });
    const nSweep = seats >= 6 ? 6 : seats >= 4 ? 4 : seats >= 3 ? 2 : 0;
    for (let i = 0; i < nSweep; i++) {
      const p = canPos[(i * 3) % canPos.length];
      beamDefs.push({ from: new THREE.Vector3(...p), kind: 'sweep', ph: rnd() * 6.28, sp: 0.5 + rnd() * 0.5, side: i % 4, color: i % 2 ? glow.clone().multiplyScalar(1.6) : padC, bright: 0 });
    }
    beams = new THREE.InstancedMesh(bg, bm, beamDefs.length);
    beams.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    beams.frustumCulled = false; beams.renderOrder = 5;
    beamDefs.forEach((b, i) => beams.setColorAt(i, b.color));
    group.add(beams);
  }
  const UP = new THREE.Vector3(0, -1, 0);
  function placeBeam(i, from, to, r) {
    const dir = new THREE.Vector3().subVectors(to, from), L = dir.length();
    Q.setFromUnitVectors(UP, dir.normalize()); S.set(r, L, r); M.compose(from, Q, S); beams.setMatrixAt(i, M);
  }

  /* ================================================================ CROWD */
  const fanCount = fans.length;
  const fanGeo = own(new THREE.PlaneGeometry(1.5, 2.0));
  const fanTex = own(fanAtlas());
  const fanU = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uHeat: { value: 0.2 }, uMap: { value: null }, uBright: { value: 0.16 + dim * 0.5 },
    uSkin: { value: ['#f1c9a5', '#d39a6a', '#a8693e', '#6b4126'].map((c) => new THREE.Color(c)) },
    uHair: { value: ['#1d1610', '#4a3020', '#8a6a3a', '#2a2a2e'].map((c) => new THREE.Color(c)) },
    uSign: { value: new THREE.Color('#eeeae0') },
  }]);
  fanU.uMap.value = fanTex;
  const fanMat = own(new THREE.ShaderMaterial({ uniforms: fanU, vertexShader: FAN_VS, fragmentShader: FAN_FS, fog: true }));
  const crowd = new THREE.InstancedMesh(fanGeo, fanMat, Math.max(1, fanCount));
  {
    const aFrame = new Float32Array(Math.max(1, fanCount)), aSeed = new Float32Array(Math.max(1, fanCount)), aShade = new Float32Array(Math.max(1, fanCount));
    const accent = ['#d23a3a', '#e8e4da', '#2e5aa8', '#e2b23a', '#3a8a4a', '#1c1c22'].map((c) => new THREE.Color(c));
    fans.forEach((f, i) => {
      const s = (0.92 + rnd() * 0.16) * (f.deck ? 1.05 : 1);
      M.makeScale(s, s, s); M.setPosition(f.x, f.y + (s - 1) * 1.0, f.z); crowd.setMatrixAt(i, M);
      /* shirts come mostly from the promotion's crowd tones, with a few in
         stronger colours so the house never reads as one flat swatch */
      const c = rnd() < 0.72 ? tones[(rnd() * tones.length) | 0].clone().multiplyScalar(0.8 + rnd() * 0.5) : accent[(rnd() * accent.length) | 0].clone();
      crowd.setColorAt(i, c);
      aFrame[i] = (rnd() * NV) | 0; aSeed[i] = rnd(); aShade[i] = f.shade;
    });
    if (!fanCount) { M.makeScale(0, 0, 0); crowd.setMatrixAt(0, M); crowd.setColorAt(0, new THREE.Color(0)); }
    fanGeo.setAttribute('aFrame', new THREE.InstancedBufferAttribute(aFrame, 1));
    fanGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 1));
    fanGeo.setAttribute('aShade', new THREE.InstancedBufferAttribute(aShade, 1));
  }
  crowd.frustumCulled = false; crowd.name = 'crowd';
  group.add(crowd);

  /* camera flashes: a share of the fans, a little above head height */
  const nFlash = Math.min(fans.length, high ? Math.round(16 + seats * seats * 6) : Math.round(10 + seats * 6));
  const flashGeo = own(new THREE.PlaneGeometry(1, 1));
  const flashU = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uRate: { value: 0.1 }, uBurst: { value: 0 }, uMap: { value: null } }]);
  flashU.uMap.value = own(flashSprite());
  const flashMat = own(new THREE.ShaderMaterial({ uniforms: flashU, vertexShader: FLASH_VS, fragmentShader: FLASH_FS, fog: true, depthWrite: false }));
  const flashes = new THREE.InstancedMesh(flashGeo, flashMat, Math.max(1, nFlash));
  {
    const aSeed = new Float32Array(Math.max(1, nFlash));
    for (let i = 0; i < nFlash; i++) {
      const f = fans[(rnd() * fans.length) | 0];
      M.makeTranslation(f.x, f.y + 0.9, f.z); flashes.setMatrixAt(i, M); aSeed[i] = rnd();
    }
    flashGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 1));
  }
  flashes.frustumCulled = false; flashes.renderOrder = 4; group.add(flashes);

  /* ============================================================ THE STATIC
     everything above that never moves, as two meshes */
  const litMesh = new THREE.Mesh(own(lit.geometry()), toon('#ffffff', { vertexColors: true }));
  litMesh.receiveShadow = true; litMesh.name = 'static';
  const unlitMesh = new THREE.Mesh(own(unlit.geometry()), own(new THREE.MeshBasicMaterial({ vertexColors: true })));
  unlitMesh.name = 'room';
  group.add(litMesh, unlitMesh);

  /* ================================================================ CAGE */
  const CAGE_R = POST + 0.55, CAGE_H = 16;
  const cage = new THREE.Group(); cage.name = 'cage'; cage.visible = false;
  {
    const cv = document.createElement('canvas'); cv.width = cv.height = 24;
    const g = cv.getContext('2d'); g.fillStyle = '#c4c8d0';
    /* a diamond chain link, two texels thick so a mip level still holds it,
       on a tile wide enough that the near wall never hides the match */
    for (let i = 0; i < 24; i++) { g.fillRect(i, i, 2, 1); g.fillRect(23 - i, i, 2, 1); }
    g.fillStyle = '#7d828c'; for (let i = 0; i < 24; i += 2) { g.fillRect(i, i + 1, 1, 1); g.fillRect(23 - i, i + 1, 1, 1); }
    const t = own(new THREE.CanvasTexture(cv));
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapNearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    const tile = 2.0, Lw = CAGE_R * 2;
    t.repeat.set(Lw / tile, CAGE_H / tile);
    const P = [], N = [], U = [], I = [];
    const R = CAGE_R;
    for (const [ax, az, bx, bz, nx, nz] of [[-R, R, R, R, 0, 1], [R, R, R, -R, 1, 0], [R, -R, -R, -R, 0, -1], [-R, -R, -R, R, -1, 0]]) {
      const o = P.length / 3;
      P.push(ax, 0, az, bx, 0, bz, bx, CAGE_H, bz, ax, CAGE_H, az);
      for (let k = 0; k < 4; k++) N.push(nx, 0, nz);
      U.push(0, 0, 1, 0, 1, 1, 0, 1);
      I.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    const wg = own(new THREE.BufferGeometry());
    wg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    wg.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    wg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    wg.setIndex(I);
    const wm = own(new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.4, side: THREE.DoubleSide, transparent: false }));
    const walls = new THREE.Mesh(wg, wm); walls.renderOrder = 2; cage.add(walls);
    const cb = new Builder();
    for (const [x, z] of [[-R, -R], [R, -R], [R, R], [-R, R]]) cb.box(x, CAGE_H / 2 + FLOOR / 2 + 0.2, z, 0.35, CAGE_H - FLOOR + 0.4, 0.35, '#9aa0aa');
    for (const y of [CAGE_H, CAGE_H * 0.5]) for (const [ax, az, bx, bz] of [[-R, -R, R, -R], [R, -R, R, R], [R, R, -R, R], [-R, R, -R, -R]]) cb.beam(new THREE.Vector3(ax, y, az), new THREE.Vector3(bx, y, bz), y === CAGE_H ? 0.3 : 0.16, '#9aa0aa');
    cage.add(new THREE.Mesh(own(cb.geometry()), toon('#ffffff', { vertexColors: true })));
  }
  group.add(cage);

  /* =============================================================== PRIZE */
  const PRIZE_Y = 14.5;
  const prize = new THREE.Group(); prize.name = 'prize'; prize.visible = false; prize.position.set(0, PRIZE_Y, 0);
  {
    const cableB = new Builder(); cableB.box(0, (H - PRIZE_Y) / 2 + 0.6, 0, 0.06, H - PRIZE_Y, 0.06, '#2a2a30');
    prize.add(new THREE.Mesh(own(cableB.geometry()), toon('#ffffff', { vertexColors: true })));
    const caseB = new Builder();
    caseB.box(0, 0, 0, 1.6, 1.1, 0.42, '#c6cad2', 0, '', '#dfe2e8');
    caseB.box(0, 0, 0, 1.64, 0.14, 0.46, '#d8a92c');
    caseB.box(0, 0.65, 0, 0.6, 0.12, 0.14, '#2a2a30');
    caseB.box(-0.42, 0.6, 0, 0.1, 0.22, 0.14, '#2a2a30'); caseB.box(0.42, 0.6, 0, 0.1, 0.22, 0.14, '#2a2a30');
    caseB.box(0, -0.62, 0, 0.12, 0.14, 0.14, '#2a2a30');
    const cg = own(caseB.geometry());
    const caseM = new THREE.Mesh(cg, toon('#ffffff', { vertexColors: true })); caseM.position.y = -0.78; caseM.name = 'case';
    caseM.add(new THREE.Mesh(cg, inkMat(0.04, inkList)));
    const beltB = new Builder();
    beltB.box(0, 0, -0.02, 3.4, 0.5, 0.08, '#1d1512');
    beltB.box(0, 0, 0.05, 1.2, 0.95, 0.1, '#e8b62e', 0, '', '#f6d466');
    beltB.box(0, 0, 0.11, 0.7, 0.55, 0.04, '#c0392b');
    for (const sx of [-1, 1]) beltB.box(sx * 1.05, 0, 0.04, 0.42, 0.38, 0.08, '#e8b62e');
    const bgeo = own(beltB.geometry());
    const beltM = new THREE.Mesh(bgeo, toon('#ffffff', { vertexColors: true })); beltM.position.y = -0.5; beltM.name = 'belt';
    beltM.add(new THREE.Mesh(bgeo, inkMat(0.04, inkList)));
    prize.add(caseM, beltM);
  }
  group.add(prize);

  /* ============================================================== LIGHTS

     The ring has to be the brightest thing in the building. The key is a
     spot straight down over the canvas with its cone just covering the apron,
     so the light ends where the ring ends and the floor and stands fall into
     the hemisphere fill only, darker in the cheap rooms (theme.dim). A rim
     from behind in the theme's glow colour picks the wrestlers out of the
     house, and a soft front fill keeps faces from going to black. Decay is
     zero on every light: the scene is in feet, not metres, and a physical
     falloff over 34 feet would need intensities nobody could read. */
  const hemi = new THREE.HemisphereLight(mix(glow, '#c8d0e0', 0.6), mix(wallC[2], '#000', 0.3), 0.55 + dim * 0.55);
  const key = new THREE.SpotLight('#fff6e8', 3.0, 0, Math.atan((APRON + 3) / 34), 0.45, 0);
  key.position.set(0, 34, 4);
  key.target.position.set(0, 0, 0.5);
  key.castShadow = high;
  if (high) {
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 22; key.shadow.camera.far = 44;
    key.shadow.bias = -0.0008; key.shadow.normalBias = 0.02;
  }
  const rim = new THREE.DirectionalLight(mix(glow, '#ffffff', 0.25), 0.9);
  rim.position.set(-6, 16, -24); rim.target.position.set(0, 0, 0);
  const fillL = new THREE.DirectionalLight('#dfe6ff', 0.45);
  fillL.position.set(4, 12, 30); fillL.target.position.set(0, 0, 0);
  group.add(hemi, key, key.target, rim, rim.target, fillL, fillL.target);
  lights.push(hemi, key, rim, fillL);

  /* ================================================================ STATE */
  const state = { heat: 0.2, beam: 0, tronT: 0, tronF: 0, cageOn: false, prize: null };
  const tmpA = new THREE.Color(), tmpB = new THREE.Vector3(), ENT = new THREE.Vector3();
  const tronCols = [T.pad, T.apron[0], '#' + glow.getHexString(), T.rope, T.apron[1]];

  function drawTron(t, entering) {
    if (!screenCv || !screenG) return;
    const g = screenG, w = screenCv.width, h = screenCv.height;
    g.fillStyle = '#05060a'; g.fillRect(0, 0, w, h);
    /* scrolling diagonal colour bars */
    const sp = entering ? 40 : 14, off = (t * sp) % 24;
    for (let i = -4; i < w / 6 + 6; i++) {
      g.fillStyle = tronCols[((i % tronCols.length) + tronCols.length) % tronCols.length];
      const x = i * 12 - off;
      g.beginPath(); g.moveTo(x, h); g.lineTo(x + 6, h); g.lineTo(x + 6 + h * 0.5, 0); g.lineTo(x + h * 0.5, 0); g.closePath(); g.fill();
    }
    /* scanlines, and a darker band behind the name */
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, h * 0.24, w, h * 0.52);
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < h; y += 2) g.fillRect(0, y, w, 1);
    if (nameBmp) {
      const pulse = entering && (Math.floor(t * 6) % 2) ? 1 : 0;
      g.drawImage(nameBmp, Math.round((w - nameBmp.width) / 2), Math.round((h - nameBmp.height) / 2) + pulse);
    }
    g.fillStyle = tronCols[0]; g.fillRect(0, 0, w, 1); g.fillRect(0, h - 1, w, 1);
    screenTex.needsUpdate = true;
  }
  drawTron(0, false);

  function update(dt, t, mood = {}) {
    dt = Math.min(0.1, Math.max(0, dt || 0));
    const heatT = Math.max(0, Math.min(1, mood.heat == null ? 0.2 : mood.heat));
    state.heat += (heatT - state.heat) * Math.min(1, dt * 2.5);
    const flash = Math.max(0, Math.min(1, mood.flash || 0));
    const entering = !!mood.entering;

    /* crowd and flashes run in their shaders */
    fanU.uTime.value = t; fanU.uHeat.value = state.heat;
    fanU.uBright.value = (0.16 + dim * 0.5) * (0.9 + 0.22 * state.heat + 0.3 * flash);
    flashU.uTime.value = t; flashU.uRate.value = 0.06 + state.heat * 0.5 + (entering ? 0.2 : 0); flashU.uBurst.value = flash;

    /* the ropes: a damped spring per side, stepped in small slices so a long
       frame cannot blow the spring up */
    let steps2 = Math.ceil(dt / 0.008);
    const w0 = 2 * Math.PI * 1.7, z = 0.3, h = dt / Math.max(1, steps2);
    while (steps2-- > 0) for (const k of SIDE_KEYS) {
      const s = spring[k];
      const a = -w0 * w0 * s.x - 2 * z * w0 * s.v;
      s.v += a * h; s.x += s.v * h;
    }
    writeRopes(t);

    /* beams: the washes breathe a little, the sweepers come in with the heat */
    if (beams) {
      state.beam += ((entering || state.heat > 0.6 ? 1 : 0) - state.beam) * Math.min(1, dt * 2);
      beamDefs.forEach((b, i) => {
        if (b.kind === 'wash') {
          const r = 2.4 + 0.25 * Math.sin(t * 0.7 + i);
          placeBeam(i, b.from, b.target, r);
          tmpA.copy(b.color).multiplyScalar(0.07 + 0.04 * state.heat + 0.12 * flash);
        } else {
          /* swing across the house on the beam's side */
          const sw = Math.sin(t * b.sp + b.ph), sw2 = Math.cos(t * b.sp * 0.7 + b.ph);
          const d = (startD + outer) * 0.5;
          const sideV = [[0, -1], [1, 0], [-1, 0], [0, -1]][b.side];
          tmpB.set(sideV[0] * d + sideV[1] * sw * d * 0.8, F + 2 + (sw2 + 1) * 5, sideV[1] * d + sideV[0] * sw * d * -0.8);
          if (entering && stage) tmpB.lerp(ENT.set(entrance.x + sw * 6, entrance.y, entrance.z + 10 + sw2 * 8), 0.6);
          placeBeam(i, b.from, tmpB, 2.2 * state.beam + 0.001);
          tmpA.copy(b.color).multiplyScalar(0.3 * state.beam);
        }
        beams.setColorAt(i, tmpA);
      });
      beams.instanceMatrix.needsUpdate = true; beams.instanceColor.needsUpdate = true;
    }

    /* the screen redraws a few times a second, faster during an entrance */
    if (screenCv && screenG) {
      state.tronT += dt;
      if (state.tronT > (entering ? 1 / 10 : 1 / 5)) { state.tronT = 0; drawTron(t, entering); }
    }

    if (prize.visible) {
      prize.rotation.y = Math.sin(t * 0.5) * 0.5;
      prize.rotation.z = Math.sin(t * 1.3) * 0.03;
    }
  }

  function ropeHit(side, strength = 1) {
    const s = spring[side]; if (!s) return;
    s.v += 11 * Math.max(0, Math.min(1.5, strength));
    /* the corners carry a little of it to the two neighbouring sides */
    const i = SIDE_KEYS.indexOf(side);
    for (const j of [(i + 1) % 4, (i + 3) % 4]) spring[SIDE_KEYS[j]].v += 1.6 * strength;
  }

  function setCage(on) { state.cageOn = !!on; cage.visible = state.cageOn; }

  function hangPrize(kind) {
    state.prize = kind || null;
    prize.visible = !!kind;
    const c = prize.getObjectByName('case'), b = prize.getObjectByName('belt');
    c.visible = kind === 'case'; b.visible = kind === 'belt';
  }

  function dispose() {
    group.removeFromParent();
    for (const g of disposables.geo) g.dispose();
    for (const m of disposables.mat) m.dispose();
    for (const m of inkList) m.dispose();
    for (const t of disposables.tex) t.dispose();
    for (const o of [posts, postInk, pads, padInk, steps, stepInk, crowd, flashes, cans]) o.dispose && o.dispose();
    if (beams) beams.dispose();
    key.shadow && key.shadow.map && key.shadow.map.dispose();
  }

  /* the room's darkest colour, for the stage's scene fog */
  const fogC = mix(wallC[2], '#000000', 0.2);
  return {
    group, lights, update, ropeHit, setCage, hangPrize, dispose,
    fog: { color: '#' + fogC.getHexString(), near: 46, far: 70 + outer * 1.6 },
    /* measurements other modules may want */
    info: {
      cageRadius: CAGE_R, cageHeight: CAGE_H, prizeY: PRIZE_Y, entrance, rigY,
      fans: fanCount, outer, ceiling: H, ropeLine: RL,
    },
  };
}
