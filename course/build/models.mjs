#!/usr/bin/env node
/* Run The Course: build the 3D model packs from Kenney's free kits.
 *
 *   node course/build/models.mjs <folder holding the unzipped kits>
 *
 * WHERE THE ART COMES FROM. Every model is from a Kenney asset kit
 * (www.kenney.nl), licence Creative Commons Zero (CC0): free for personal,
 * educational and commercial use, no credit required. course/models/LICENSE.txt
 * lists the kits. They were downloaded from opengameart.org, Kenney's own
 * uploads there:
 *   Minigolf Kit 3.1, Nature Kit 2.1, Car Kit 3.1, City Kit Suburban 2.0,
 *   City Kit Commercial 2.1, Mini Characters 2.0
 *
 * WHAT THIS DOES. It picks the models the game uses, packs each kit's picks
 * into ONE file (so a kit's colour texture is stored once and the page makes
 * five requests, not sixty), drops what is unused, and quantizes the meshes.
 * The characters keep only the animations the game plays, and only the first
 * character carries them: they all share one skeleton, so the page plays the
 * same clips on every one.
 *
 * It needs the glTF tools, which are not a dependency of the site:
 *   npm install --no-save @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions
 * The packs it writes (course/models/*.glb) are committed, so nobody needs
 * to run this to play or to deploy. Run it again only to change the picks. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, unpartition, dedup, prune, quantize, resample } from '@gltf-transform/functions';

const KITS = process.argv[2];
if (!KITS) { console.error('usage: node course/build/models.mjs <folder holding the unzipped kits>'); process.exit(2); }
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../models');
const find = (kit, sub) => { const d = fs.readdirSync(KITS).find(n => n.toLowerCase().includes(kit)); if (!d) throw new Error('kit not found: ' + kit); return path.join(KITS, d, 'Models', sub); };

export const PACKS = {
  nature: [[find('nature', 'GLTF format'), ['tree_default', 'tree_oak', 'tree_detailed', 'tree_fat', 'tree_simple', 'tree_pineRoundA', 'tree_pineRoundC', 'tree_pineTallA', 'tree_cone',
    'plant_bush', 'plant_bushLarge', 'plant_bushDetailed', 'flower_redA', 'flower_yellowA', 'flower_purpleA', 'rock_largeA', 'rock_largeB', 'rock_largeC', 'grass_large', 'stump_round', 'fence_simple']]],
  golf: [[find('minigolf', 'GLB format'), ['flag-red', 'flag-blue', 'flag-green', 'ball-red', 'club-red', 'windmill']]],
  cars: [[find('car-kit', 'GLB format'), ['sedan', 'suv', 'hatchback-sports', 'van', 'truck']]],
  town: [[find('suburban', 'GLB format'), ['building-type-a', 'building-type-b', 'building-type-d', 'building-type-g', 'building-type-h', 'building-type-k']],
    [find('commercial', 'GLB format'), ['building-c', 'building-e', 'detail-parasol-a', 'detail-parasol-b']]],
  people: [[find('mini-characters', 'GLB format'), ['character-male-a', 'character-male-d', 'character-female-a', 'character-female-c', 'character-worker']]]
};
const KEEP_ANIMS = ['idle', 'walk', 'sit', 'attack-melee-right'];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
let total = 0;
for (const [pack, sources] of Object.entries(PACKS)) {
  let main = null, first = true;
  for (const [dir, names] of sources) for (const name of names) {
    const doc = await io.read(path.join(dir, name + '.glb'));
    const root = doc.getRoot();
    /* the model's name on its scene's top node, so the page can ask for it by name */
    const scene = root.listScenes()[0], top = doc.createNode(name);
    for (const c of scene.listChildren()) { scene.removeChild(c); top.addChild(c); }
    scene.addChild(top);
    for (const a of root.listAnimations()) { if (pack !== 'people' || !first || !KEEP_ANIMS.includes(a.getName())) a.dispose(); }
    first = false;
    if (!main) main = doc; else { mergeDocuments(main, doc); const scenes = main.getRoot().listScenes(), s0 = scenes[0]; for (const s of scenes.slice(1)) { for (const c of s.listChildren()) { s.removeChild(c); s0.addChild(c); } s.dispose(); } }
  }
  await main.transform(unpartition(), resample(), dedup(), prune(), quantize());
  const bytes = await io.writeBinary(main);
  fs.writeFileSync(path.join(OUT, pack + '.glb'), bytes);
  total += bytes.length;
  console.log(pack.padEnd(8), (bytes.length / 1024).toFixed(0).padStart(5) + ' KB', main.getRoot().listScenes()[0].listChildren().map(n => n.getName()).length + ' models,', main.getRoot().listTextures().length + ' textures,', main.getRoot().listAnimations().length + ' animations');
}
console.log('total', (total / 1024).toFixed(0) + ' KB');
