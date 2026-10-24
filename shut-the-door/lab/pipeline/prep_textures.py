"""The field and stand textures, from the CC0 Poly Haven maps, as small webp files.

  python3 -I shut-the-door/lab/pipeline/prep_textures.py ASSETS/polyhaven-textures/files shut-the-door/lab/assets/tex

What is changed (recorded in LICENSES.md): resized, re-encoded as webp, and the grass colour is
re-tinted toward a mown ballpark lawn (the source is a wilder lawn); the dirt is tinted toward
infield clay. Normal maps are kept as they are (OpenGL convention, as three.js expects).
"""
import os, sys
import numpy as np
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)


def load(name, size):
    im = Image.open(os.path.join(SRC, name)).convert('RGB').resize((size, size), Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255


def save(a, name, q=82):
    Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, name), 'WEBP', quality=q, method=6)
    print(name, os.path.getsize(os.path.join(OUT, name)))


def retint(a, target, keep=0.55):
    """Keep the source's luminance detail, move its mean colour to target (linear-ish blend)."""
    lum = a @ np.array([0.3, 0.59, 0.11], np.float32)
    detail = lum / max(1e-4, lum.mean())
    t = np.array(target, np.float32)[None, None, :]
    return t * (1 - keep + keep * detail[..., None]) * 1.0 + (a - a.mean((0, 1))) * 0.25


# mown grass: sparse_grass gives the blade detail; the colour goes to a ballpark green
g = load('sparse_grass_diff_1k.jpg', 512)
save(retint(g, (0.16, 0.30, 0.09), keep=0.7), 'grass_color.webp')
save(load('sparse_grass_nor_gl_1k.jpg', 512), 'grass_normal.webp', q=75)
# infield clay: the baseball_playground dirt, warmer and redder
d = load('baseball_playground_diff_1k.jpg', 512)
save(retint(d, (0.50, 0.33, 0.22), keep=0.9), 'dirt_color.webp')
save(load('baseball_playground_nor_gl_1k.jpg', 512), 'dirt_normal.webp', q=75)
# the backstop padding: a vinyl-ish weave, dark
w = load('poly_wool_herringbone_diff_1k.jpg', 512)
save(retint(w, (0.05, 0.09, 0.12), keep=0.4), 'pad_color.webp')
save(load('poly_wool_herringbone_nor_gl_1k.jpg', 512), 'pad_normal.webp', q=80)
# concrete for the stands
c = load('concrete_wall_004_diff_1k.jpg', 512)
save(c, 'concrete_color.webp')
# leather for the mitt
l = load('brown_leather_albedo_1k.jpg', 512)
save(l, 'leather_color.webp')
save(load('brown_leather_nor_gl_1k.jpg', 512), 'leather_normal.webp', q=80)

# the uniform's knit (cotton_jersey and jogging_melange's relief, CC0): a quarter of the 1k tile at half size (the knit stays
# visible; shrinking the whole tile to 128 px averaged it away), its brightness only for the colour
def crop(name, n=256, size=128):
    im = Image.open(os.path.join(SRC, name)).convert('RGB')
    return np.asarray(im.crop((0, 0, n, n)).resize((size, size), Image.LANCZOS)).astype(np.float32) / 255
k = crop('cotton_jersey_diff_1k.jpg').mean(-1)
k = 0.5 + (k - k.mean()) / (4 * k.std() + 1e-6)
save(np.repeat(k[..., None], 3, -1), 'knit_color.webp', q=80)
nm = crop('jogging_melange_nor_gl_1k.jpg')
nm[..., :2] = 0.5 + (nm[..., :2] - 0.5) * 3.0           # its relief is faint at this size: lift it
save(nm, 'knit_normal.webp', q=80)
