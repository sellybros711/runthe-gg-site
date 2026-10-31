/* Materials for the people: skin with a wrapped (subsurface-like) falloff, cloth with sheen,
   wet eyes. The glTF carries the maps; these replace the plain materials it loads with. */
import * as THREE from 'three';

const SKIN_CHUNK = THREE.ShaderChunk.lights_physical_pars_fragment.replace(
  'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
  `#ifdef SKIN_WRAP
    float dNLw = dot( geometryNormal, directLight.direction );
    vec3 wrapW = vec3( 0.48, 0.24, 0.16 );
    vec3 wrapped = saturate( ( vec3( dNLw ) + wrapW ) / ( 1.0 + wrapW ) );
    reflectedLight.directDiffuse += wrapped * directLight.color * BRDF_Lambert( material.diffuseColor );
  #else
    reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
  #endif`);

export function skin(src, opts = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    map: src.map, normalMap: src.normalMap, normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: opts.roughness ?? 0.48, metalness: 0,
    sheen: 0.35, sheenRoughness: 0.55, sheenColor: new THREE.Color(0.95, 0.62, 0.52),
    specularIntensity: 0.55, color: opts.tint ?? 0xffffff,
  });
  m.name = 'skin';
  m.defines = { SKIN_WRAP: '' };
  // a look per player: tone mixes the model's skin map toward a darker one; facial hair darkens the
  // beard area (a mask in the same UV layout) with a stubble grain. Both read through the map's own
  // UV transform (vMapUv). Off until look() sets them.
  // and the headgear's contact shading (headgear.js wornShade): the skin darkens just under the rim
  // where the shell rests on it, and under a brim; the rim comes as a texture over phi, read in the
  // gear's own frame (uGearM, set each frame)
  const u = { uDark: { value: null }, uTone: { value: 0 }, uBeard: { value: null }, uBeardAmt: { value: 0 }, uHairCol: { value: new THREE.Color(0x1a120c) },
    uGearOn: { value: 0 }, uGearM: { value: new THREE.Matrix4() }, uGearRim: { value: null } };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
        uniform mat4 uGearM; varying vec3 vGearP;`)
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
        vGearP = (uGearM * modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_pars_fragment>', SKIN_CHUNK)
      .replace('#include <common>', `#include <common>
        uniform sampler2D uDark, uBeard, uGearRim; uniform float uTone, uBeardAmt, uGearOn; uniform vec3 uHairCol; varying vec3 vGearP;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        #ifdef USE_MAP
          if (uTone > 0.001) diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(uDark, vMapUv).rgb * diffuse, uTone);
          if (uBeardAmt > 0.001) {
            float grain = fract(sin(dot(floor(vMapUv * 900.0), vec2(12.9898, 78.233))) * 43758.5453);
            float b = texture2D(uBeard, vMapUv).r * uBeardAmt * (0.55 + 0.45 * grain);
            diffuseColor.rgb = mix(diffuseColor.rgb, uHairCol, clamp(b, 0.0, 0.85));
          }
        #endif
        if (uGearOn > 0.5) {
          float gr = length(vGearP);
          float gth = acos(clamp(vGearP.y / max(gr, 1e-4), -1.0, 1.0)), gph = atan(vGearP.x, vGearP.z);
          vec4 rim = texture2D(uGearRim, vec2(gph / 6.2831853 + 0.5, 0.5));
          float below = (gth - rim.r * 3.14159265) * gr;          // metres down the head from the rim
          float near = gr < 0.2 ? 1.0 : 0.0;
          // the hair under it: a short cropped fade below the rim at the back and sides (rim.b), the
          // hair colour with a grain, gone 3 cm down. The hair cards' own ragged edge showed there
          float hg = fract(sin(dot(floor(vGearP * 1400.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          float fade = rim.b * (below > 0.0 ? 1.0 - smoothstep(0.005, 0.03, below) : 0.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, uHairCol * (0.85 + 0.3 * hg), clamp(fade * (0.6 + 0.4 * hg), 0.0, 0.92) * near);
          float ao = below < 0.0 ? 0.45 : 1.0 - 0.5 * exp(-below / 0.01);
          ao *= 1.0 - 0.3 * rim.g * exp(-max(below, 0.0) / 0.035);   // the brim's shade on the brow and eyes
          diffuseColor.rgb *= mix(1.0, ao, near);
        }`);
  };
  m.customProgramCacheKey = () => 'skin';
  return m;
}

export function cloth(src, opts = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    map: src.map, normalMap: src.normalMap, normalScale: new THREE.Vector2(1, 1),
    roughness: opts.roughness ?? 0.88, metalness: 0,
    sheen: opts.sheen ?? 1.0, sheenRoughness: 0.8, sheenColor: new THREE.Color(opts.sheenColor ?? 0x2a2a2a),
    color: opts.color ?? (src.color ? src.color.clone() : 0xffffff), side: THREE.DoubleSide,
  });
  m.name = src.name;
  return m;
}

export function eyes(src) {
  // the MakeHuman eye carries a cornea layer that is clear in the texture's alpha: keep it see
  // through, with a hard clearcoat for the catch light that makes an eye read as wet
  return new THREE.MeshPhysicalMaterial({ map: src.map, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03,
    transparent: true, alphaTest: 0.02, depthWrite: true, name: 'eyes' });
}

export function hair(src, color) {
  const m = new THREE.MeshStandardMaterial({
    map: src.map, alphaTest: 0.4, transparent: false, roughness: 0.6, color: color ?? 0xffffff,
    side: THREE.DoubleSide, alphaToCoverage: true,
  });
  m.name = src.name;
  // under headgear (headgear.js wornShade turns uGearOn on) the cards are not drawn: the skin draws
  // his hair below the rim instead, where the rim texture's blue says it may show
  const u = { uGearOn: { value: 0 }, uGearM: { value: new THREE.Matrix4() }, uGearRim: { value: null } };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
        uniform mat4 uGearM; varying vec3 vGearP;`)
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
        vGearP = (uGearM * modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        uniform sampler2D uGearRim; uniform float uGearOn; varying vec3 vGearP;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        // under headgear none of the cards: the skin draws his hair as a short cropped fade below the
        // rim (materials skin). The cards' alpha cut a ragged edge across the nape
        if (uGearOn > 0.5) discard;`);
  };
  m.customProgramCacheKey = () => 'hair';
  return m;
}

/* The club's name on the chest: the nickname in Barlow Condensed Black Italic (SIL OFL, fonts/),
   drawn on a canvas 4 to 1 and laid on the jersey as a decal (people.js sets the box, uniform() reads
   it in the bind pose, facing forward only). The font is fetched once: a canvas drawn before it lands
   is drawn again when it does. Without the font the words still draw, in the system's fallback. */
export const WORD_ASPECT = 4;
const WORD_W = 1024, WORD_H = WORD_W / WORD_ASPECT;
const KIT_FONT = 'ShutKitWords';
const words = new Map();
let fontLoaded = false;
function drawWords(e) {
  const cv = e.canvas, g = cv.getContext('2d');
  const fam = (fontLoaded ? `"${KIT_FONT}", ` : '') + '"Arial Narrow", Arial, sans-serif';
  g.clearRect(0, 0, WORD_W, WORD_H);
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  // the largest size that fits the width (a margin each side) and the cap height (most of the height)
  const pad = WORD_W * 0.03;
  g.font = `900 italic 200px ${fam}`;
  const m0 = g.measureText(e.text);
  const cap0 = m0.actualBoundingBoxAscent || 140;
  const size = 200 * Math.min((WORD_W - 2 * pad) / m0.width, (WORD_H * 0.8) / cap0);
  g.font = `900 italic ${size.toFixed(2)}px ${fam}`;
  if ('letterSpacing' in g) g.letterSpacing = `${(size * 0.03).toFixed(2)}px`;
  const m = g.measureText(e.text);
  const cap = m.actualBoundingBoxAscent || size * 0.7;
  g.fillStyle = '#ffffff';
  g.fillText(e.text, WORD_W / 2, WORD_H / 2 + cap / 2);
  e.tex.needsUpdate = true;
}
/** The words' texture for a text (drawn once per text, cached). */
export function wordsTexture(text) {
  if (words.has(text)) return words.get(text).tex;
  const canvas = document.createElement('canvas');
  canvas.width = WORD_W; canvas.height = WORD_H;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 8; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const e = { text, canvas, tex };
  words.set(text, e);
  drawWords(e);
  return tex;
}
if (typeof FontFace !== 'undefined' && typeof document !== 'undefined' && document.fonts) {
  const url = new URL('../fonts/barlowcondensed-900italic.woff2', import.meta.url).href;
  new FontFace(KIT_FONT, `url(${url}) format('woff2')`, { weight: '900', style: 'italic' }).load()
    .then((f) => { document.fonts.add(f); fontLoaded = true; for (const e of words.values()) drawWords(e); })
    .catch(() => { /* no font: the fallback stays */ });
}

/* The uniform: the glTF's map is a trim mask in the body's UV layout (pipeline/uniform.py), not a
   colour. R is the jersey's piping, G the pants' side stripe, B the sock's white slot or the glove's
   back. The colours are the club's, set per team at run time (colors below, all THREE.Color), and a
   generic number is drawn into its own small canvas in the same UV layout (numberTexture). A fine
   fabric weave (tiled, its own texture) breaks up the flat colour. */
export function uniform(src, colors, opts = {}) {
  const mask = src.map;
  if (mask) { mask.colorSpace = THREE.NoColorSpace; mask.needsUpdate = true; }
  const m = new THREE.MeshPhysicalMaterial({
    roughness: opts.roughness ?? 0.82, metalness: 0, side: THREE.DoubleSide,
    sheen: 0.8, sheenRoughness: 0.75, sheenColor: new THREE.Color(0x303030),
    normalMap: opts.weaveNormal ?? null, normalScale: new THREE.Vector2(0.35, 0.35),
  });
  m.name = src.name;
  // gltfpack stores UVs quantized with a texture transform on the map: the mask is read through it
  if (mask) mask.updateMatrix();
  const u = {
    uMaskT: { value: mask ? mask.matrix.clone() : new THREE.Matrix3() },
    uMask: { value: mask }, uBase: { value: colors.base }, uTrim: { value: colors.trim ?? colors.base },
    uStripe: { value: colors.stripe ?? colors.base }, uSlot: { value: colors.slot ?? colors.base },
    uNumber: { value: opts.number ?? null }, uNumberColor: { value: colors.number ?? colors.trim ?? colors.base },
    uHasNumber: { value: opts.number ? 1 : 0 }, uWeave: { value: opts.weave ?? null }, uHasWeave: { value: opts.weave ? 1 : 0 },
    // the club's name on the chest: a decal in the bind pose, box = [x, y, w, h] in the mesh's own units
    uWords: { value: opts.words ? wordsTexture(opts.words.text) : null }, uHasWords: { value: opts.words ? 1 : 0 },
    uWordBox: { value: opts.words ? new THREE.Vector4(...opts.words.box) : new THREE.Vector4() },
    uWordCol: { value: opts.words ? new THREE.Color(opts.words.color) : new THREE.Color(0) },
  };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vUvU;\nuniform mat3 uMaskT;\nvarying vec3 vWordP, vWordN;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvUvU = (uMaskT * vec3(uv, 1.0)).xy;\nvWordP = position; vWordN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vUvU;
        varying vec3 vWordP, vWordN;
        uniform sampler2D uMask, uNumber, uWeave, uWords;
        uniform vec3 uBase, uTrim, uStripe, uSlot, uNumberColor, uWordCol;
        uniform vec4 uWordBox;
        uniform float uHasNumber, uHasWeave, uHasWords;`)
      .replace('#include <map_fragment>', `
        vec3 mk = texture2D(uMask, vUvU).rgb;
        vec3 col = uBase;
        col = mix(col, uStripe, mk.g);
        col = mix(col, uSlot, mk.b);
        col = mix(col, uTrim, mk.r);
        if (uHasNumber > 0.5) col = mix(col, uNumberColor, texture2D(uNumber, vUvU).a);
        if (uHasWords > 0.5) {
          vec2 wt = (vWordP.xy - uWordBox.xy) / uWordBox.zw;
          vec2 inside = step(vec2(0.0), wt) * step(wt, vec2(1.0));
          float facing = smoothstep(0.2, 0.6, normalize(vWordN).z);   // the front, turned up to about 70 degrees
          col = mix(col, uWordCol, texture2D(uWords, wt).a * inside.x * inside.y * facing);
        }
        if (uHasWeave > 0.5) col *= 0.88 + 0.24 * texture2D(uWeave, vUvU * 48.0).r;
        diffuseColor.rgb *= col;`);
  };
  m.customProgramCacheKey = () => 'uniform';
  return m;
}

/** A plain coloured cloth (the undershirt, the belt). */
export function plain(name, color, opts = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: opts.roughness ?? 0.8, metalness: 0, side: THREE.DoubleSide,
    sheen: opts.sheen ?? 0.6, sheenRoughness: 0.7, sheenColor: new THREE.Color(0x202020), clearcoat: opts.clearcoat ?? 0, clearcoatRoughness: 0.4 });
  m.name = name;
  return m;
}

/** The number on the back: a generic one (never a player's real number), drawn on the jersey's
    number patch (its UVs are flat, 0.3 m square, seen from behind). Club colour, outlined in the
    jersey's base colour the way a sewn number is. */
export function numberMaterial(text, color, outline, src) {
  const S = 256, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const px = S / 0.3;                                   // pixels per metre on the jersey
  g.font = `900 ${Math.round(0.2 * px)}px Arial Black, Arial, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = 0.012 * px;
  g.strokeStyle = '#' + outline.getHexString(); g.strokeText(text, S / 2, S / 2);
  g.fillStyle = '#' + color.getHexString(); g.fillText(text, S / 2, S / 2);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = 4;
  if (src && src.map) { t.offset.copy(src.map.offset); t.repeat.copy(src.map.repeat); t.rotation = src.map.rotation; t.center.copy(src.map.center); }
  const m = new THREE.MeshPhysicalMaterial({ map: t, alphaTest: 0.5, transparent: false, roughness: 0.7, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.name = 'number';
  return m;
}
