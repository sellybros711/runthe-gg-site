/* The ground around home plate: grass, the dirt circle, the chalk, the plate, the warning track.
 *
 * One plane and one shader. A layout mask (drawn here on a canvas, in Statcast feet) says where
 * the dirt, chalk, damp and scuffs are; two tiling material sets (grass, clay) are blended by it.
 * Sizes are the rule book's: the home plate circle is 26 ft across, the boxes 4 by 6 ft set 6 in off
 * the plate, the chalk 3 in wide, the catcher's box 43 in wide.
 */
import * as THREE from 'three';
import { P, FT } from './units.js?v=1';
import { assetUrl } from './load.js?v=5';

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
  // R: dirt. G: chalk. B: damp (darker). A second canvas: wear (scuffs, holes).
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

  const chalk = layer((d) => {
    d.fillStyle = '#000'; d.fillRect(0, 0, MASK_PX, MASK_PX);
    d.strokeStyle = '#fff'; d.lineWidth = (3 / 12) * k; d.lineJoin = 'miter';
    const box = (x0, x1, y0, y1) => { d.strokeRect(X(x0), Y(y1), (x1 - x0) * k, (y1 - y0) * k); };
    const half = 8.5 / 12, off = half + 6 / 12;
    box(off, off + 4, -2.3, 3.7);            // the left handed batter's box (catcher's right)
    box(-off - 4, -off, -2.3, 3.7);          // the right handed batter's box
    // the catcher's box: two lines back from the boxes, 43 in apart, closed at 8 ft
    const cx = 21.5 / 12;
    d.beginPath();
    d.moveTo(X(-cx), Y(-2.3)); d.lineTo(X(-cx), Y(-10.3)); d.lineTo(X(cx), Y(-10.3)); d.lineTo(X(cx), Y(-2.3));
    d.stroke();
    // the foul lines, from the boxes' outer front corners at 45 degrees
    d.beginPath();
    d.moveTo(X(off + 4), Y(3.7 + 0)); d.lineTo(X(off + 4 + 60), Y(3.7 + 60));
    d.moveTo(X(-off - 4), Y(3.7)); d.lineTo(X(-off - 4 - 60), Y(3.7 + 60));
    d.stroke();
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

  // pack dirt, chalk and damp into R, G and B by tinting and adding (no per-pixel loop in script:
  // that took over a second on a slowed phone CPU); wear stays its own grey canvas
  const tint = (l, col) => {
    const t = document.createElement('canvas'); t.width = t.height = MASK_PX;
    const x = t.getContext('2d');
    x.drawImage(l, 0, 0); x.globalCompositeOperation = 'multiply'; x.fillStyle = col; x.fillRect(0, 0, MASK_PX, MASK_PX);
    return t;
  };
  g.fillStyle = '#000'; g.fillRect(0, 0, MASK_PX, MASK_PX);
  g.globalCompositeOperation = 'lighter';
  g.drawImage(tint(dirt, '#f00'), 0, 0); g.drawImage(tint(chalk, '#0f0'), 0, 0); g.drawImage(tint(damp, '#00f'), 0, 0);
  g.globalCompositeOperation = 'source-over';
  return { rgb: c, wear };
}

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
  const U = {
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
        vec4 fm; float dirtK; vec3 nW;
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
        dirtK = smoothstep(0.35, 0.65, fm.r);
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
        vec3 col = mix(gcol, dcol, dirtK);
        float chalkA = fm.g * (1.0 - wear * 0.85) * (0.75 + 0.25 * vnoise(sft * 9.0));
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
