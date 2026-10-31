/* The ground: grass, every bit of dirt and every chalk line on the field, and home plate.
 *
 * One plane and one shader, so nothing is ever drawn over the paint. Two layout masks (canvases, in
 * Statcast feet) say where the dirt is: one round the plate (the 26 ft circle, damp and scuffs), one over
 * the infield (the skin, the base paths, the cutouts). The warning track is worked out in the shader from
 * the wall (inplay-plan.js wallDist, ballpark.js frontAt). Two tiling material sets (grass, clay) are
 * blended by them.
 *
 * THE CHALK is drawn in the shader as lines, not painted into a mask: each line is a segment, box or
 * circle in field feet, and a pixel takes the share of it that falls inside the pixel (its footprint read
 * off the screen derivatives). So a line 3 in wide stays one line, sharp near the lens and still there
 * 300 ft away, and never turns into a moire or a band edge on. Positions are the Official Baseball Rules'
 * (rule 2.01 to 2.03 and Appendix 1 and 2), on Statcast's catcher view (x to the catcher's right, the first
 * base side; y toward the mound):
 *   - the foul lines on the line from the back point of the plate through first and third to the foul
 *     poles (330 ft). Not drawn inside the batter's boxes: each leaves its box through the box's front
 *     line, 3.71 ft out (the old chalk ran from the box's outer corner, 1.5 ft off the true line);
 *   - the batter's boxes, 4 by 6 ft, 6 in off the plate, centred on its middle;
 *   - the catcher's box, 43 in wide, 8 ft back from the batter's boxes;
 *   - the three foot first base line (the runner's lane): 3 ft into foul ground from the halfway mark
 *     (45 ft) to the bag, with its cross line at 45 ft;
 *   - the coach's boxes, 20 ft along the line and 15 ft off it, 10 ft deep, open at the back, their far
 *     end level with the bag;
 *   - the next batter's boxes (on deck circles), 5 ft across, 37 ft from the plate toward each dugout.
 * The home plate circle is 26 ft across, the infield grass arc 95 ft from the rubber, the base cutouts
 * 13 ft round, the base paths 6 ft wide (the first base one a foot wider on the foul side, so the runner's
 * lane is on the dirt), the mound circle 18 ft across, centred 59 ft from the plate (18 in in front of the
 * rubber), the warning track 15 ft wide all round the field.
 */
import * as THREE from 'three';
import { P, FT } from './units.js?v=1';
import { assetUrl } from './load.js?v=8';
import { BASE, MOUND } from './inplay-plan.js?v=23';

const MASK_FT = 120;        // the mask covers 120 x 120 ft centred on the plate
const MASK_PX = 2048;
export const BACKSTOP_FT = 56;

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function drawMask() {
  const c = document.createElement('canvas');
  c.width = c.height = MASK_PX;
  const g = c.getContext('2d');
  const k = MASK_PX / MASK_FT;
  // canvas x = catcher's view x (ft), canvas y = toward the mound (ft); centre = plate point
  const X = (x) => (x + MASK_FT / 2) * k, Y = (y) => (MASK_FT / 2 - y) * k;
  const r = rng(7);
  // R: dirt. B: damp (darker). A second canvas: wear (scuffs, holes). (G was the chalk: the shader draws it now.)
  const layer = (draw) => { const l = document.createElement('canvas'); l.width = l.height = MASK_PX; draw(l.getContext('2d')); return l; };

  const dirt = layer((d) => {
    d.fillStyle = '#000'; d.fillRect(0, 0, MASK_PX, MASK_PX);
    d.fillStyle = '#fff';
    // the home plate circle, its edge a little ragged where the grass grows in
    d.beginPath();
    const cy = 0.7, R = 13;
    for (let i = 0; i <= 256; i++) {
      const a = (i / 256) * Math.PI * 2;
      const rr = R + 0.06 * Math.sin(a * 23) + 0.04 * Math.sin(a * 61 + 1) + (r() - 0.5) * 0.04;
      const px = X(Math.cos(a) * rr), py = Y(cy + Math.sin(a) * rr);
      i ? d.lineTo(px, py) : d.moveTo(px, py);
    }
    d.fill();
    // the warning track along the backstop
    d.fillRect(0, Y(-BACKSTOP_FT + 15), MASK_PX, MASK_PX);
    d.filter = 'blur(1px)';
  });

  const damp = layer((d) => {
    d.fillStyle = '#000'; d.fillRect(0, 0, MASK_PX, MASK_PX);
    const grd = d.createRadialGradient(X(0), Y(0.7), 0, X(0), Y(0.7), 11 * k);
    grd.addColorStop(0, 'rgba(255,255,255,0.75)'); grd.addColorStop(0.7, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    d.fillStyle = grd; d.fillRect(0, 0, MASK_PX, MASK_PX);
    for (let i = 0; i < 260; i++) {
      const a = r() * Math.PI * 2, rr = 2 + r() * 10;
      d.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.12})`;
      d.beginPath(); d.ellipse(X(Math.cos(a) * rr), Y(0.7 + Math.sin(a) * rr), (0.3 + r()) * k, (0.2 + r() * 0.6) * k, r() * 3, 0, 7); d.fill();
    }
  });

  const wear = layer((d) => {
    d.fillStyle = '#000'; d.fillRect(0, 0, MASK_PX, MASK_PX);
    // where the batters dig in: both boxes, back foot and front foot, and the catcher's heels
    const holes = [[3.0, -0.4, 1.0], [3.1, 1.6, 0.8], [-3.0, -0.4, 1.0], [-3.1, 1.6, 0.8], [-0.7, -3.4, 0.7], [0.7, -3.4, 0.7], [1.4, -6.2, 0.6], [0.4, -6.0, 0.6]];
    for (const [x, y, s] of holes) {
      for (let i = 0; i < 40; i++) {
        d.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.06})`;
        d.beginPath(); d.ellipse(X(x + (r() - 0.5) * s), Y(y + (r() - 0.5) * s * 1.4), (0.15 + r() * 0.35) * k, (0.1 + r() * 0.25) * k, r() * 3, 0, 7); d.fill();
      }
    }
    // footprints and spike marks all over the circle
    for (let i = 0; i < 900; i++) {
      const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 12.5;
      d.fillStyle = `rgba(255,255,255,${0.03 + r() * 0.08})`;
      d.beginPath(); d.ellipse(X(Math.cos(a) * rr), Y(0.7 + Math.sin(a) * rr), 0.18 * k, 0.4 * k, r() * 3, 0, 7); d.fill();
    }
  });

  // pack dirt and damp into R and B by tinting and adding (no per-pixel loop in script:
  // that took over a second on a slowed phone CPU); wear stays its own grey canvas
  const tint = (l, col) => {
    const t = document.createElement('canvas'); t.width = t.height = MASK_PX;
    const x = t.getContext('2d');
    x.drawImage(l, 0, 0); x.globalCompositeOperation = 'multiply'; x.fillStyle = col; x.fillRect(0, 0, MASK_PX, MASK_PX);
    return t;
  };
  g.fillStyle = '#000'; g.fillRect(0, 0, MASK_PX, MASK_PX);
  g.globalCompositeOperation = 'lighter';
  g.drawImage(tint(dirt, '#f00'), 0, 0); g.drawImage(tint(damp, '#00f'), 0, 0);
  g.globalCompositeOperation = 'source-over';
  return { rgb: c, wear };
}

/** The mound's circle: 18 ft across, its centre 59 ft from the back point of the plate, 18 in in front
    of the rubber's front edge (MOUND, 60.5 ft). Its top is a flat 5 ft table, 10 in up. */
export const MOUND_C = { x: MOUND.x, y: 59, r: 9, top: 2.6, h: 10 / 12 };
/** The infield mask's extent, field feet. */
export const INFIELD = { X0: -120, X1: 120, Y0: -10, Y1: 170 };

/* The infield's dirt (R), as a canvas over the infield in field feet (0.12 ft a pixel). */
function infieldMask() {
  const { X0, X1, Y0, Y1 } = INFIELD, PX = 2048;
  const k = PX / (X1 - X0), H = Math.round((Y1 - Y0) * k);
  const c = document.createElement('canvas'); c.width = PX; c.height = H;
  const g = c.getContext('2d');
  const X = (x) => (x - X0) * k, Y = (y) => (Y1 - y) * k;
  g.fillStyle = '#000'; g.fillRect(0, 0, PX, H);
  g.fillStyle = '#fff';
  // the skin: the arc 95 ft from the rubber, out to a few feet past the foul lines
  g.save();
  g.beginPath(); g.moveTo(X(0), Y(-4)); g.lineTo(X(-150), Y(146)); g.lineTo(X(150), Y(146)); g.closePath(); g.clip();
  g.beginPath(); g.arc(X(MOUND.x), Y(MOUND.y), 95 * k, 0, Math.PI * 2); g.fill();
  g.restore();
  // the infield grass: the diamond, 3 ft inside the base lines
  g.fillStyle = '#000';
  const r = 63.64 - 3 * Math.SQRT2;
  g.beginPath(); g.moveTo(X(0), Y(63.64 - r)); g.lineTo(X(r), Y(63.64)); g.lineTo(X(0), Y(63.64 + r)); g.lineTo(X(-r), Y(63.64)); g.closePath(); g.fill();
  g.fillStyle = '#fff';
  // the cutouts round the bases and the mound
  for (const b of [1, 2, 3]) { g.beginPath(); g.arc(X(BASE[b].x), Y(BASE[b].y), 13 * k, 0, Math.PI * 2); g.fill(); }
  g.beginPath(); g.arc(X(MOUND_C.x), Y(MOUND_C.y), MOUND_C.r * k, 0, Math.PI * 2); g.fill();
  // the base paths from the plate, 6 ft wide on the line; the first base one 4 ft into foul ground, so
  // the runner's lane (3 ft) lies on the dirt
  const path = (s, fair, foul) => {
    const u = { x: s * Math.SQRT1_2, y: Math.SQRT1_2 }, n = { x: s * Math.SQRT1_2, y: -Math.SQRT1_2 };
    const at = (t, o) => [X(t * u.x + o * n.x), Y(t * u.y + o * n.y)];
    g.beginPath(); g.moveTo(...at(0, -fair)); g.lineTo(...at(90, -fair)); g.lineTo(...at(90, foul)); g.lineTo(...at(0, foul)); g.closePath(); g.fill();
  };
  path(1, 3, 4); path(-1, 3, 3);
  // and leave the home plate circle to the plate's own mask
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.arc(X(0), Y(0.7), 13.4 * k, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'source-over';
  // soften the edge where the grass is cut
  const s = document.createElement('canvas'); s.width = PX; s.height = H;
  const sg = s.getContext('2d'); sg.filter = 'blur(2px)'; sg.drawImage(c, 0, 0);
  return s;
}

/* THE CHALK, in field feet: segments [x0, y0, x1, y1], boxes [cx, cy, hx, hy] (outlines) and circles
   [cx, cy, r] (outlines). Every line 3 in wide, centred on these. */
const CH = 3 / 12;
function chalkLayout() {
  // grouped by where they are, so a pixel tests only the lines that can be near it (the shader's chalkD)
  const near = [], foul = [], mid = [], box = [], ring = [];
  const half = 8.5 / 12, off = half + 6 / 12, mid = 8.5 / 12;   // the plate is 17 in deep: its middle 8.5 in up
  const front = mid + 3, back = mid - 3;                         // the boxes' front and back lines (y)
  // the batter's boxes
  for (const s of [-1, 1]) box.push([s * (off + 2), mid, 2, 3]);
  // the catcher's box: from the back of the batter's boxes, 8 ft back, 43 in wide
  const cx = 21.5 / 12;
  near.push([-cx, back, -cx, back - 8], [-cx, back - 8, cx, back - 8], [cx, back - 8, cx, back]);
  // the foul lines: on the line through the plate's back point, from the box's front line to the pole
  const pole = 330 * Math.SQRT1_2;
  for (const s of [-1, 1]) foul.push([s * front, front, s * pole, pole]);
  // along a line: t ft from the plate, o ft into foul ground
  const at = (s, t, o) => [s * (t + o) * Math.SQRT1_2, (t - o) * Math.SQRT1_2];
  // the runner's lane: 3 ft into foul ground, from the halfway mark to the bag
  mid.push([...at(1, 45, 3), ...at(1, 90, 3)], [...at(1, 45, 0), ...at(1, 45, 3)]);
  // the coach's boxes, open at the back
  for (const s of [-1, 1]) {
    mid.push([...at(s, 70, 15), ...at(s, 90, 15)], [...at(s, 70, 15), ...at(s, 70, 25)], [...at(s, 90, 15), ...at(s, 90, 25)]);
  }
  // the next batter's boxes: 37 ft from the plate, toward the dugouts (125 degrees round from centre field)
  for (const s of [-1, 1]) ring.push([s * 37 * Math.sin(125 * Math.PI / 180), 37 * Math.cos(125 * Math.PI / 180), 2.5]);
  return { near, foul, mid, box, ring };
}
const glf = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(+v.toFixed(4)));
const vec4s = (rows) => rows.map((r) => `vec4(${r.map(glf).join(', ')})`).join(', ');
const vec3s = (rows) => rows.map((r) => `vec3(${r.map(glf).join(', ')})`).join(', ');

export function buildField(scene, tex, renderer) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const load = (name, srgb) => {
    const t = tex.load(assetUrl(`tex/${name}.webp`));
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const layers = drawMask();
  const mask = new THREE.CanvasTexture(layers.rgb);
  mask.anisotropy = aniso; mask.flipY = false; mask.generateMipmaps = true;
  const wearT = new THREE.CanvasTexture(layers.wear);
  wearT.flipY = false;
  const inf = new THREE.CanvasTexture(infieldMask());
  inf.colorSpace = THREE.NoColorSpace; inf.flipY = false; inf.anisotropy = aniso;
  const L = chalkLayout();
  const U = {
    infMask: { value: inf }, infRect: { value: new THREE.Vector4(INFIELD.X0, INFIELD.X1, INFIELD.Y0, INFIELD.Y1) },
    grassC: { value: load('grass_color', true) }, grassN: { value: load('grass_normal') },
    dirtC: { value: load('dirt_color', true) }, dirtN: { value: load('dirt_normal') },
    fieldMask: { value: mask }, wearMask: { value: wearT }, maskFt: { value: MASK_FT },
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos;
        uniform sampler2D grassC, grassN, dirtC, dirtN, fieldMask, wearMask;
        uniform float maskFt;
        uniform sampler2D infMask;
        uniform vec4 infRect;
        vec4 fm; float dirtK; vec3 nW;
        // the chalk (chalkLayout): distance in feet from p to the nearest line's middle
        const vec4 CNEAR[${L.near.length}] = vec4[](${vec4s(L.near)});
        const vec4 CFOUL[${L.foul.length}] = vec4[](${vec4s(L.foul)});
        const vec4 CMID[${L.mid.length}] = vec4[](${vec4s(L.mid)});
        const vec4 CBOX[${L.box.length}] = vec4[](${vec4s(L.box)});
        const vec3 CRING[${L.ring.length}] = vec3[](${vec3s(L.ring)});
        float segD(vec2 p, vec4 s) { vec2 a = s.xy, ba = s.zw - s.xy; float h = clamp(dot(p - a, ba) / dot(ba, ba), 0.0, 1.0); return length(p - a - ba * h); }
        float boxD(vec2 p, vec4 b) { vec2 q = abs(p - b.xy) - b.zw; return abs(length(max(q, 0.0)) + min(max(q.x, q.y), 0.0)); }
        // (the plate's boxes within 16 ft of it, the lane, coach's boxes and on deck circles 30-105 ft out:
        // where a group is left out its nearest line is feet away, so the coverage there is nothing anyway)
        float chalkD(vec2 p, float r) {
          float d = 1e4;
          for (int i = 0; i < ${L.foul.length}; i++) d = min(d, segD(p, CFOUL[i]));
          if (r < 16.0) {
            for (int i = 0; i < ${L.near.length}; i++) d = min(d, segD(p, CNEAR[i]));
            for (int i = 0; i < ${L.box.length}; i++) d = min(d, boxD(p, CBOX[i]));
          } else if (r > 30.0 && r < 105.0) {
            for (int i = 0; i < ${L.mid.length}; i++) d = min(d, segD(p, CMID[i]));
            for (int i = 0; i < ${L.ring.length}; i++) d = min(d, abs(length(p - CRING[i].xy) - CRING[i].z));
          }
          return d;
        }
        // the front of the stands, feet from the plate at th degrees from centre field (ballpark.js
        // frontAt; the outfield wall is inplay-plan.js wallDist: 330 down the lines, 400 to centre)
        float frontAt(float th) {
          float a = abs(th);
          if (a <= 45.0) return 330.0 + 70.0 * (1.0 - pow(min(1.0, a / 45.0), 1.6));
          float d = min(330.0, 45.0 / max(1e-3, sin(radians(a - 45.0))));
          return mix(d, 56.0, smoothstep(100.0, 128.0, a));
        }
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `
        // world (m) to Statcast feet: x = -X, y = Z
        vec2 sft = vec2(-vWPos.x, vWPos.z) / ${FT.toFixed(4)};
        vec2 muv = vec2(sft.x / maskFt + 0.5, 0.5 - sft.y / maskFt);
        fm = texture2D(fieldMask, muv);
        if (muv.x < 0.0 || muv.x > 1.0 || muv.y < 0.0 || muv.y > 1.0) fm = vec4(sft.y < -40.0 ? 1.0 : 0.0, 0.0, 0.0, 1.0);
        bool inMask = muv.x >= 0.0 && muv.x <= 1.0 && muv.y >= 0.0 && muv.y <= 1.0;
        float wear = inMask ? texture2D(wearMask, muv).r : 0.0;
        // the infield's skin, paths and cutouts
        vec2 iuv = vec2((sft.x - infRect.x) / (infRect.y - infRect.x), (infRect.w - sft.y) / (infRect.w - infRect.z));
        float infK = (iuv.x >= 0.0 && iuv.x <= 1.0 && iuv.y >= 0.0 && iuv.y <= 1.0) ? smoothstep(0.35, 0.65, texture2D(infMask, iuv).r) : 0.0;
        // the warning track: 15 ft inside the front of the stands, all round the field (behind the plate
        // the plate's own mask draws it, as it always has)
        float rFt = length(sft), trackK = 0.0;
        if (rFt > 40.0) {   // (the track is never nearer the plate than 41 ft)
          float thDeg = degrees(atan(sft.x, sft.y)), fAt = frontAt(thDeg);
          trackK = abs(thDeg) < 128.0 ? smoothstep(-0.3, 0.3, rFt - (fAt - 15.0)) * (1.0 - smoothstep(2.0, 2.6, rFt - fAt)) : 0.0;
        }
        dirtK = max(smoothstep(0.35, 0.65, fm.r), max(infK, trackK));
        vec2 guv = vWPos.xz / 1.4, duv = vWPos.xz / 1.1;
        vec3 gcol = texture2D(grassC, guv).rgb;
        // the mower's stripes: a diamond pattern, 15 ft wide, and slow colour drift
        float s1 = sin((sft.x + sft.y) * 3.14159 / 15.0), s2 = sin((sft.x - sft.y) * 3.14159 / 15.0);
        float stripe = smoothstep(-0.2, 0.2, s1) * 0.5 + smoothstep(-0.2, 0.2, s2) * 0.5;
        gcol *= 0.8 + 0.34 * stripe;
        gcol *= 0.9 + 0.2 * vnoise(sft * 0.08);
        vec3 dcol = texture2D(dirtC, duv).rgb * (0.92 + 0.16 * vnoise(sft * 0.6));
        dcol *= mix(1.0, 0.68, fm.b);                 // damp around the plate
        dcol *= mix(1.0, 0.8, wear);                  // dug in, darker
        // the infield and the track a shade of their own (the colours their meshes had: d8c2a8, b59a80)
        dcol *= mix(mix(vec3(1.0), vec3(0.687, 0.539, 0.392), infK * (1.0 - smoothstep(0.35, 0.65, fm.r))), vec3(0.462, 0.323, 0.216), trackK);
        vec3 col = mix(gcol, dcol, dirtK);
        // the chalk: the share of a line in this pixel (the pixel's footprint across the line, px, from
        // the screen derivatives). A line thinner than half a pixel is drawn half a pixel wide and fainter
        // in step, so a far line stays a line, never a shimmer or a gap.
        float cd = chalkD(sft, rFt), px = max(fwidth(cd), 1e-4);
        float cw = ${(CH / 2).toFixed(4)}, we = max(cw, 0.25 * px);
        float cov = clamp((min(cd + px * 0.5, we) - max(cd - px * 0.5, -we)) / px, 0.0, 1.0) * pow(cw / we, 0.6);
        float chalkA = cov * (1.0 - wear * 0.85) * (0.75 + 0.25 * vnoise(sft * 9.0));
        col = mix(col, vec3(0.93, 0.92, 0.88), clamp(chalkA * 1.15, 0.0, 1.0));
        diffuseColor.rgb *= col;
        vec3 gn = texture2D(grassN, guv).xyz * 2.0 - 1.0;
        vec3 dn = texture2D(dirtN, duv).xyz * 2.0 - 1.0;
        vec3 tn = normalize(mix(gn * vec3(1.0, 1.0, 0.8), dn * vec3(1.6, 1.6, 1.0), dirtK));
        tn = normalize(mix(tn, vec3(0.0, 0.0, 1.0), chalkA * 0.7));
        // tangent space on the ground: x = world x, y = world -z, z = up
        nW = normalize(vec3(tn.x, tn.z, -tn.y));
      `)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = mix(0.82, 0.97, dirtK) - fm.b * dirtK * 0.12;`)
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);');
  };
  const geo = new THREE.PlaneGeometry(400, 400, 1, 1).rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(geo, mat);
  ground.receiveShadow = true;
  scene.add(ground);

  // home plate: whitened rubber with the black bevel, 17 inches across
  const s = new THREE.Shape();
  const pts = [[-8.5, 17], [8.5, 17], [8.5, 8.5], [0, 0], [-8.5, 8.5]].map(([x, y]) => P(x / 12, y / 12, 0));
  s.moveTo(pts[0].x, -pts[0].z); for (const p of pts.slice(1)) s.lineTo(p.x, -p.z);
  const plateGeo = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.012, bevelSegments: 2 });
  plateGeo.rotateX(-Math.PI / 2);
  const plate = new THREE.Mesh(plateGeo, [
    new THREE.MeshStandardMaterial({ color: 0xe9e6de, roughness: 0.75 }),
    new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.6 }),
  ]);
  plate.position.y = -0.004;
  plate.receiveShadow = true; plate.castShadow = false;
  scene.add(plate);
  return { ground, plate };
}
