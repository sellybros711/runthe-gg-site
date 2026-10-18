# Shut The Door 3D lab: every asset, where it came from, its licence, what was changed

Nothing here is loaded from a CDN. Everything is free and open: CC0, MIT, or CMU's own terms
("free for all uses"). No asset carries a real person's likeness, a team name or a logo.

## Code

| file | source | licence | changed |
|---|---|---|---|
| `vendor/three/three.module.min.js` | npm `three@0.170.0` (registry.npmjs.org), `build/three.module.min.js` | MIT (`vendor/three/LICENSE`) | no |
| `vendor/three/addons/loaders/GLTFLoader.js` | `three@0.170.0`, `examples/jsm/loaders/` | MIT | no |
| `vendor/three/addons/loaders/RGBELoader.js` | `three@0.170.0`, `examples/jsm/loaders/` | MIT | no |
| `vendor/three/addons/libs/meshopt_decoder.module.js` | `three@0.170.0`, `examples/jsm/libs/` | MIT | no |
| `vendor/three/addons/utils/BufferGeometryUtils.js` | `three@0.170.0`, `examples/jsm/utils/` | MIT | no |
| `vendor/three/LICENSE` | `three@0.170.0` | MIT | no |

Build tools (not in the repo): Blender as the `bpy==4.2.0` wheel (GPL, used only to run our own
scripts), `gltfpack@0.25.0` from npm (MIT, meshoptimizer), Pillow, NumPy, SciPy.

## The light

| file | source | licence | changed |
|---|---|---|---|
| `assets/stadium_01_1k.hdr` | Poly Haven "Stadium 01" by Sergej Majboroda, https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/stadium_01_1k.hdr | CC0 | no (rotated at run time so its sun comes from the third base side) |

## Field and stand textures (`assets/tex/`, made by `pipeline/prep_textures.py`)

All from Poly Haven, CC0, 1k JPG originals at `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/<name>/<file>`.
Every one is resized and re-encoded as WebP.

| file | Poly Haven source | changed |
|---|---|---|
| `grass_color.webp` | `sparse_grass/sparse_grass_diff_1k.jpg` | re-tinted to a mown ballpark green |
| `grass_normal.webp` | `sparse_grass/sparse_grass_nor_gl_1k.jpg` | re-encoded |
| `dirt_color.webp` | `baseball_playground/baseball_playground_diff_1k.jpg` | tinted toward infield clay |
| `dirt_normal.webp` | `baseball_playground/baseball_playground_nor_gl_1k.jpg` | re-encoded |
| `pad_color.webp` | `poly_wool_herringbone/poly_wool_herringbone_diff_1k.jpg` | darkened to backstop padding, 512 px |
| `pad_normal.webp` | `poly_wool_herringbone/poly_wool_herringbone_nor_gl_1k.jpg` | 512 px |
| `concrete_color.webp` | `concrete_wall_004/concrete_wall_004_diff_1k.jpg` | 512 px |
| `leather_color.webp` | `brown_leather/brown_leather_albedo_1k.jpg` | 512 px (the mitt) |
| `leather_normal.webp` | `brown_leather/brown_leather_nor_gl_1k.jpg` | 512 px |

The layout of the field (dirt circle, chalk, damp, scuffs), the bat, the helmets, caps, masks, the
mitt, shin guards, chest protector and the ball are modelled in code (`field.js`, `gear3d.js`).

## The people (`assets/batter.glb`, `catcher.glb`, `umpire.glb`, made by `pipeline/build_people.py`, packed by `pipeline/pack.sh`)

### Bodies, clothes and hair: MakeHuman, CC0

The MakeHuman team released all MakeHuman assets as CC0 in September 2020 (the base mesh, targets,
rigs, weights, skins, proxies, clothes, textures); each text asset says so in its header, and the
MPFB2 licence (https://raw.githubusercontent.com/makehumancommunity/mpfb2/master/LICENSE.md, section C)
states it for the rig and weight files.

| what | URL | used for |
|---|---|---|
| base mesh `3dobjs/base.obj` | https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/3dobjs/base.obj | every body |
| macro targets `targets/macrodetails/*-male-*.target`, `height/`, `proportions/` (24 + 36 + 18 files) | https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/macrodetails/ | body shape (age, muscle, weight, height, ancestry) |
| `rig.game_engine.json`, `weights.game_engine.json` | https://raw.githubusercontent.com/makehumancommunity/mpfb2/master/src/mpfb/data/rigs/standard/ | the 53 bone skeleton and skin weights |
| skins: `young_caucasian_male2`, `young_african_male`, `middleage_caucasian_male`  | https://raw.githubusercontent.com/vidya-hub/makehuman-core/main/data/skins/ | skin colour |
| eyes `eyes/high-poly`, `eyes/low-poly`, `eyes/materials/brown_eye.png` | https://raw.githubusercontent.com/vidya-hub/makehuman-core/main/data/eyes/ | eyes |
| `eyebrows/eyebrow001`, `eyelashes/eyelashes02` | https://raw.githubusercontent.com/vidya-hub/makehuman-core/main/data/ | brows, lashes |
| `hair/short02`, `hair/short04` | https://raw.githubusercontent.com/vidya-hub/makehuman-core/main/data/hair/ | hair |
| `clothes/male_casualsuit06`, `shoes01`, `shoes06` | https://raw.githubusercontent.com/vidya-hub/makehuman-core/main/data/clothes/ | uniforms (re-coloured), shoes |

The skins, eyes, brows, lashes, hair and clothes come from `vidya-hub/makehuman-core`, a copy of
MakeHuman's system assets (the official asset repository is not reachable from here). Its files
carry MakeHuman's own CC0 header unchanged ("This asset was explicitly released as CC0 in september
2020"); the textures inside them are the same release.

What was changed: bodies shaped by blending the targets; the skeleton fitted from the joint cubes;
clothes fitted from the `.mhclo` data; the clothes' own colour maps replaced by a team colour times a
Poly Haven weave (`jogging_melange`, `cotton_jersey`, CC0, `.../Textures/jpg/1k/<name>/`) and the
clothes' own AO; navy piping painted on the batter's jersey; the skin maps given a little more
contrast and a normal map derived from their own detail; all images re-encoded as WebP; meshes
compressed with meshopt.

### Motion: Carnegie Mellon University motion capture

"The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with
funding from NSF EIA-0196217." CMU's terms: free for all uses. Taken from the BVH conversion in the
Internet Archive item `cmu-ecstasy-motion-bvh-poser-friendly-2012`
(https://archive.org/details/cmu-ecstasy-motion-bvh-poser-friendly-2012, marked Public Domain Mark 1.0),
file `CMU_EcstasyMotion_BVH-Poser-friendly-2012.zip`, downloaded through https://archive.org/cors/.

| clip | CMU take | used for | changed |
|---|---|---|---|
| `swing` (batter) | 124_07, frames 22-140 | a batter's stance, load, stride and swing | fitted to the MakeHuman rig, mirrored left to right (the capture is a right handed hitter), fixed finger grip added; the take reuses the same capture up to the stride |
| `idle` (catcher) | 120_21, frames 90-280 | breathing and weight shift under the procedural crouch | fitted to the rig |
| `idle` (umpire) | 142_03, frames 90-280 | the same, for the umpire | fitted to the rig |

The catcher's crouch, the umpire's slot stance and strike call, and the catcher's reach for the
ball are procedural (two bone IK in `people.js`) laid over those idles.

## Data

| file | source | changed |
|---|---|---|
| `assets/pitch.json` | `data/packs/std-2025-ws7-yamamoto.json` (this repo), via `pipeline/extract_pitch.mjs` | the arsenal's velo and pfx, the batter's side and zone, copied; the aimed cell, the miss and the release point are labelled samples |
