/* Everything the scene downloads, fetched at once.
 *
 *   preload() from load.js, imported with its version like every module here
 *   preload();            the menus call this as soon as they are up: the 3D warms in the background
 *   const a = await preload();   the scene awaits the same promise (one download, ever)
 *
 * Every asset URL carries its content hash (ASSETS below, written by pipeline/stamp.mjs), so a
 * file's URL changes exactly when its bytes do and the CDN may hold it for a year (_headers).
 * People are parsed as their bytes arrive, their meshopt geometry decoded in workers.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/* stamp:begin (pipeline/stamp.mjs rewrites this block; do not edit by hand) */
export const ASSETS = {
  'batter.glb': 'cc5e662fbe',
  'bio.json': '3ce6273c86',
  'catcher.glb': '3b5c36def3',
  'env_256.hdr': 'b069d60e9b',
  'packs/index.json': 'e160e4ec92',
  'packs/std-1988-ws1-eckersley.json': '161435d2db',
  'packs/std-2001-ws7-rivera.json': '0aa52dc016',
  'packs/std-2011-ws6-feliz.json': '35239cbbb6',
  'packs/std-2016-ws7-chapman.json': '6cb6095ae3',
  'packs/std-2019-nlwc-hader.json': 'e2051aea51',
  'packs/std-2022-ws6-pressly.json': '9ce5a61356',
  'packs/std-2024-ws5-buehler.json': '4924b06b86',
  'packs/std-2025-diaz-cin.json': 'acc2987e3a',
  'packs/std-2025-scott-kc.json': 'd1b00281a4',
  'packs/std-2025-ws7-yamamoto.json': '2bbab8e2e6',
  'poster-desktop.webp': '58c8b648fd',
  'poster-phone.webp': 'b638ef170e',
  'tex/beard_mask.webp': '17ec25655e',
  'tex/concrete_color.webp': '0a126bec84',
  'tex/dirt_color.webp': '4b00ba1875',
  'tex/dirt_normal.webp': '66f2d75074',
  'tex/grass_color.webp': '79cca19790',
  'tex/grass_normal.webp': '8095665bd2',
  'tex/knit_color.webp': 'd146c073fa',
  'tex/knit_normal.webp': '572c0efe5d',
  'tex/leather_color.webp': '88fb7b499a',
  'tex/leather_normal.webp': '187c773393',
  'tex/pad_color.webp': '3292b8fc9d',
  'tex/pad_normal.webp': '65ee1616a5',
  'tex/skin_dark.webp': 'd047351cdc',
  'umpire.glb': '1041f97c12',
  'uniform.json': 'e0760cc232'
};
/* stamp:end */

// assets beside this module, wherever the page that imports it lives (the game, the lab)
const BASE = new URL('./assets/', import.meta.url).href;
export const assetUrl = (f) => `${BASE}${f}${ASSETS[f] ? `?h=${ASSETS[f]}` : ''}`;
export const PEOPLE = ['batter', 'catcher', 'umpire'];
/** The pack the scene shows: ?pack= in the lab (assets/packs/index.json lists them). */
export const DEFAULT_PACK = 'std-2025-ws7-yamamoto';
export function packId() {
  const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const id = q.get('pack') || DEFAULT_PACK;
  return /^[a-z0-9-]+$/.test(id) ? id : DEFAULT_PACK;
}

let started = null;
try { MeshoptDecoder.useWorkers(2); } catch (e) { /* no workers: decode on the main thread */ }

export function preload(opts = {}) {
  if (started) return started;
  const bytes = (f) => fetch(assetUrl(f), { priority: 'high' }).then((r) => { if (!r.ok) throw new Error(f + ' ' + r.status); return r.arrayBuffer(); });
  const gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const json = (f) => fetch(assetUrl(f), { priority: 'high' }).then((r) => { if (!r.ok) throw new Error(f + ' ' + r.status); return r.json(); });
  // the lab reads a pack's facts file; the game builds its facts from the scenario it plays (and
  // takes the heights and weights from bio.json)
  const facts = opts.game
    ? Promise.all([json('uniform.json'), json('bio.json')]).then(([u, b]) => ({ uniform: u, bio: b.batters }))
    : Promise.all([json(`packs/${packId()}.json`), json('uniform.json')]).then(([f, u]) => Object.assign(f, { uniform: u }));
  const env = bytes('env_256.hdr').then((buf) => {
    const d = new RGBELoader().parse(buf);
    const t = new THREE.DataTexture(d.data, d.width, d.height, THREE.RGBAFormat, d.type);
    t.colorSpace = THREE.LinearSRGBColorSpace;
    t.minFilter = t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.flipY = true;
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.needsUpdate = true;
    return t;
  });
  const people = Promise.all(PEOPLE.map((n) => bytes(`${n}.glb`).then((b) => gltf.parseAsync(b, BASE))));
  started = Promise.all([facts, env, people]).then(([f, e, p]) => ({ facts: f, env: e, gltfs: Object.fromEntries(PEOPLE.map((n, i) => [n, p[i]])) }));
  return started;
}
