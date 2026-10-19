# Shut The Door 3D lab: every asset, where it came from, its licence, what was changed

The scene's runtime (modules, `vendor/`, `assets/`) lives in `shut-the-door/3d/`, which the game
loads; the paths below are relative to it. This folder keeps the lab page and the pipeline.

Nothing here is loaded from a CDN. Everything is free and open (CC0 or MIT) except the motion,
which is Adobe Mixamo's: royalty free inside the game, never shipped as raw files (see Motion). No
asset carries a real person's likeness, a team name or a logo.

## Code

| file | source | licence | changed |
|---|---|---|---|
| `vendor/three-0.170.0/three.module.min.js` | npm `three@0.170.0` (registry.npmjs.org), `build/three.module.min.js` | MIT (`vendor/three-0.170.0/LICENSE`) | no |
| `vendor/three-0.170.0/addons/loaders/GLTFLoader.js` | `three@0.170.0`, `examples/jsm/loaders/` | MIT | no |
| `vendor/three-0.170.0/addons/loaders/RGBELoader.js` | `three@0.170.0`, `examples/jsm/loaders/` | MIT | no |
| `vendor/three-0.170.0/addons/libs/meshopt_decoder.module.js` | `three@0.170.0`, `examples/jsm/libs/` | MIT | no |
| `vendor/three-0.170.0/addons/utils/BufferGeometryUtils.js` | `three@0.170.0`, `examples/jsm/utils/` | MIT | no |
| `vendor/three-0.170.0/LICENSE` | `three@0.170.0` | MIT | no |

Build tools (not in the repo): Blender as the `bpy==4.2.0` wheel (GPL, used only to run our own
scripts), `gltfpack@0.25.0` from npm (MIT, meshoptimizer), Pillow, NumPy, SciPy.

## The light

| file | source | licence | changed |
|---|---|---|---|
| `assets/env_256.hdr` | Poly Haven "Stadium 01" by Sergej Majboroda, https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/stadium_01_1k.hdr | CC0 | area averaged down to 256 x 128 by `pipeline/prep_env.py` (it only lights the scene), and rotated at run time so its sun comes from the third base side |

## Loading posters

`assets/poster-phone.webp`, `assets/poster-desktop.webp` (the lab's) and `assets/hero.webp` (the game's
home screen) are stills of this scene, rendered from the files listed here by `pipeline/shoot.mjs`
(`poster` mode). They carry the same licences as the scene and nothing else.

## Field and stand textures (`assets/tex/`, made by `pipeline/prep_textures.py`)

All from Poly Haven, CC0, 1k JPG originals at `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/<name>/<file>`.
Every one is resized to 512 px and re-encoded as WebP.

| file | Poly Haven source | changed |
|---|---|---|
| `grass_color.webp` | `sparse_grass/sparse_grass_diff_1k.jpg` | re-tinted to a mown ballpark green |
| `grass_normal.webp` | `sparse_grass/sparse_grass_nor_gl_1k.jpg` | re-encoded |
| `dirt_color.webp` | `baseball_playground/baseball_playground_diff_1k.jpg` | tinted toward infield clay |
| `dirt_normal.webp` | `baseball_playground/baseball_playground_nor_gl_1k.jpg` | re-encoded |
| `pad_color.webp` | `poly_wool_herringbone/poly_wool_herringbone_diff_1k.jpg` | darkened to backstop padding |
| `pad_normal.webp` | `poly_wool_herringbone/poly_wool_herringbone_nor_gl_1k.jpg` | none beyond the above |
| `concrete_color.webp` | `concrete_wall_004/concrete_wall_004_diff_1k.jpg` | none beyond the above |
| `leather_color.webp` | `brown_leather/brown_leather_albedo_1k.jpg` | none beyond the above (the mitt) |
| `leather_normal.webp` | `brown_leather/brown_leather_nor_gl_1k.jpg` | none beyond the above |

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
| skins: `young_caucasian_male2`, `young_african_male`, `middleage_caucasian_male`  | https://raw.githubusercontent.com/vidya-hub/makehuman-core/main/data/skins/ | skin colour; `young_african_male` also as `assets/tex/skin_dark.webp` (512 px), which the scene mixes into the batter's skin for each hitter's tone |
| eyes `eyes/high-poly`, `eyes/low-poly`, `eyes/materials/brown_eye.png` | https://raw.githubusercontent.com/vidya-hub/makehuman-core/main/data/eyes/ | eyes |
| `eyebrows/eyebrow001`, `eyelashes/eyelashes02` | https://raw.githubusercontent.com/vidya-hub/makehuman-core/main/data/ | brows, lashes |
| `hair/short02`, `hair/short04` | https://raw.githubusercontent.com/vidya-hub/makehuman-core/main/data/hair/ | hair |
| `clothes/male_casualsuit06`, `shoes01` | https://raw.githubusercontent.com/vidya-hub/makehuman-core/main/data/clothes/ | the umpire's shirt and slacks (re-coloured); the cleats |

The skins, eyes, brows, lashes, hair and clothes come from `vidya-hub/makehuman-core`, a copy of
MakeHuman's system assets (the official asset repository is not reachable from here). Its files
carry MakeHuman's own CC0 header unchanged ("This asset was explicitly released as CC0 in september
2020"); the textures inside them are the same release.

The batter's and catcher's uniforms are not MakeHuman clothes: `pipeline/uniform.py` cuts them from
the CC0 base mesh itself (regions of the skin lifted off by a garment's ease, skinned with the
body's weights): jersey, undershirt, pants, belt with loops, stirrup socks, batting gloves, the
number patch. Their trim lives in a mask in the base mesh's UV layout, painted by the same script
(`uniform_mask_*`, inside the glb), and the scene colours it per club. `assets/tex/beard_mask.webp`
is painted the same way (the face's beard area). `assets/uniform.json` is the models' measured
heights. The batter also carries two shape keys, the base mesh on heavier and leaner macro targets.

What was changed: bodies shaped by blending the targets; the skeleton fitted from the joint cubes;
clothes fitted from the `.mhclo` data; the clothes' own colour maps replaced by a team colour times a
Poly Haven weave (`jogging_melange`, `cotton_jersey`, CC0, `.../Textures/jpg/1k/<name>/`) and the
clothes' own AO; navy piping painted on the batter's jersey; the skin maps given a little more
contrast and a normal map derived from their own detail; all images re-encoded as WebP; meshes
compressed with meshopt.

### Motion: Adobe Mixamo

Every clip the people play is a Mixamo animation (https://www.mixamo.com), downloaded by the owner
from his own Adobe account as FBX at 60 fps, without skin (only the motion: no Mixamo character is
used). Mixamo's terms let these animations be used royalty free inside a game, personal or
commercial. They do not let the raw files be redistributed on their own. So:

- the raw FBX files are never committed, here or anywhere public. They stay outside the repo, and
  `shut-the-door/.gitignore` refuses any `*.fbx` under this folder;
- only the retargeted, baked clips inside our own `batter.glb`, `catcher.glb` and `umpire.glb` ship:
  fitted to the MakeHuman rig (rest pose aligned, limbs only, the collar bones left to `people.js`),
  resampled to 30 fps and compressed with the meshes. They cannot be pulled back out as Mixamo files.

| clip | Mixamo animation (frames, at 60 fps) | used for | changed |
|---|---|---|---|
| `swing`, `swing2`, `swing3` (batter) | Baseball Hit (1-104), Baseball Hit-2 (1-100), Baseball Hit-3 (1-78) | three swings: each hitter gets one, drawn from a hash of his id (`looks.js`); the take, check swing and hit by pitch use the same capture up to the stride | the capture is a right handed hitter: mirrored left to right for a lefty, as is for a righty (`R`); cut at the finish, which the scene holds; fixed finger grip added |
| `miss`, `missR` (batter) | Baseball Strike (1-230) | a swing and miss, and his reaction | as above |
| `hbpFall`, `hbpFallR` (batter) | Shoulder Hit And Fall (1-187) | a pitch on the upper body knocks him down (four in five, picked from the drawn pitch's id) | as above (so the blow is always on the shoulder toward the pitcher, which is the one a pitch hits); turned away from the plate at run time |
| `idle` (catcher) | Baseball Catcher (430-550) | life in the set: breathing, weight shift | grip on the glove hand; the set's depth and lean, the reach, framing and block are our own posing over it |
| `rise` (catcher) | Baseball Catcher (60-150) | coming up out of the crouch after a ball in play or a hit batsman | trunk and legs only (the glove arm is our own) |
| `idle` (umpire) | Crouching Idle (1-151) | life in the slot stance | the stance's depth and lean are our own posing over it; the twist bones of the upper arms held at rest |
| `call` (umpire) | Baseball Umpire (1-158) | rising into the strike call | blended in from the stance |

The catcher's crouch, reach, framing and block, the umpire's slot stance and his foul and hit
batsman signals, the hit batter's flinch, the swing's kinetic chain, planted feet and collar bones
are procedural (`people.js`, `motion.js`) laid over those clips.

The pipeline still reads CMU motion capture BVH (`retarget.py`, spec `CMU`), which these files used
before Mixamo. No CMU clip ships any more.

## Data

| file | source | changed |
|---|---|---|
| `assets/packs/<pack>.json` | `data/packs/*.json` (this repo), via `pipeline/extract_lab.mjs` | each pack's arsenal (velo, pfx, shape), its hitters' sides and zones, home or away, and real outcomes from its own pitch list (with their exit velocity, launch angle and spray), copied; each hitter's look (tone, facial hair, jaw guard, a generic number) is drawn from a hash of his id, not from his real look; the release point is a labelled stand in |
| `assets/bio.json` | MLB Stats API, https://statsapi.mlb.com/api/v1/people/ (by MLBAM id, or found by name and matched by its own Retrosheet cross reference), via `pipeline/fetch_bio.mjs` on 2026-10-18 | each hitter's height, weight and batting side as listed there, copied |
| `assets/tex/knit_color.webp`, `knit_normal.webp` | Poly Haven `cotton_jersey` and `jogging_melange` (CC0, `.../Textures/jpg/1k/<name>/`), via `pipeline/prep_textures.py` | a 256 px corner of each, at 128 px; the knit's brightness only; the melange's relief lifted 3x |
