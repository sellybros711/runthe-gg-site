#!/bin/bash
# Rebuild every binary asset of the lab from the downloads. Nothing here runs code from a download:
# the downloads are read as data by our own scripts.
#
#   ASSETS=/tmp/claude-0/std-3d-assets TOOLS=/tmp/claude-0/std-3d-tools bash shut-the-door/lab/pipeline/pack.sh
#
# ASSETS layout (sources and licences in ../LICENSES.md):
#   makehuman/                     MakeHuman CC0 files (fetch: see LICENSES.md for each URL)
#   cmu-bvh/                       the CMU BVH clips, one folder per subject
#   polyhaven-textures/files/      Poly Haven CC0 maps (1k jpg)
#   polyhaven-stadium_01-1k/       Poly Haven CC0 HDRI stadium_01_1k.hdr
# TOOLS holds a uv venv with bpy 4.2.0, numpy, pillow and scipy (venv/), and npm's gltfpack 0.25.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
LAB="$HERE/.."
OUT="$TOOLS/out"
mkdir -p "$OUT"
node "$HERE/extract_pitch.mjs"
python3 -I "$HERE/prep_textures.py" "$ASSETS/polyhaven-textures/files" "$LAB/assets/tex"
"$TOOLS/venv/bin/python" -I "$HERE/build_people.py" "$ASSETS" "$OUT" batter catcher umpire
for n in batter catcher umpire; do
  # meshopt compression, names kept (the scene finds bones and materials by name)
  (cd "$TOOLS" && npx gltfpack -i "$OUT/$n.glb" -o "$LAB/assets/$n.glb" -cc -kn -km)
done
# the environment light, cut down from the 1k HDRI
python3 -I "$HERE/prep_env.py" "$ASSETS/polyhaven-stadium_01-1k/stadium_01_1k.hdr" "$LAB/assets/env_256.hdr"
# the loading posters (a still of the scene itself), then the content hashes and the preload list
node "$HERE/shoot.mjs" "$OUT/poster" poster
node "$HERE/stamp.mjs"
