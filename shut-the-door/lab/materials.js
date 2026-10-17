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
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_pars_fragment>', SKIN_CHUNK);
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
  return m;
}
