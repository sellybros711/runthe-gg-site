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
  // under headgear (headgear.js wornShade) only the hair below the rim shows, and only where the
  // rim texture's blue says hair may show (the back and sides, not a fringe under a brim)
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
        if (uGearOn > 0.5) {
          float gr = length(vGearP);
          float gth = acos(clamp(vGearP.y / max(gr, 1e-4), -1.0, 1.0)), gph = atan(vGearP.x, vGearP.z);
          vec4 rim = texture2D(uGearRim, vec2(gph / 6.2831853 + 0.5, 0.5));
          if ((gth - rim.r * 3.14159265) * gr < 0.004 || rim.b < 0.5) discard;
        }`);
  };
  m.customProgramCacheKey = () => 'hair';
  return m;
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
  };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vUvU;\nuniform mat3 uMaskT;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvUvU = (uMaskT * vec3(uv, 1.0)).xy;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vUvU;
        uniform sampler2D uMask, uNumber, uWeave;
        uniform vec3 uBase, uTrim, uStripe, uSlot, uNumberColor;
        uniform float uHasNumber, uHasWeave;`)
      .replace('#include <map_fragment>', `
        vec3 mk = texture2D(uMask, vUvU).rgb;
        vec3 col = uBase;
        col = mix(col, uStripe, mk.g);
        col = mix(col, uSlot, mk.b);
        col = mix(col, uTrim, mk.r);
        if (uHasNumber > 0.5) col = mix(col, uNumberColor, texture2D(uNumber, vUvU).a);
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
