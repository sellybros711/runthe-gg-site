"""Sample the skin colour of each MLB headshot for pipeline/fetch_tones.mjs.

    python3 -I shut-the-door/pipeline/sample_tones.py DOWNLOAD_DIR GENERIC_IMAGE OUT_JSON

DOWNLOAD_DIR holds <mlbam>.jpg as fetch_tones.mjs saved them (untrusted downloads: read as pixels,
never run). GENERIC_IMAGE is MLB's generic silhouette, fetched the same way for an id with no photo.
Writes OUT_JSON: { "<mlbam>": { "silhouette": bool, "rgb": [r, g, b] sRGB 0..255 or null, "n": pixels } }.

The face: MLB's headshot is framed the same way for everybody (213 x 320, the cap at the top, the
face in the middle third). The box below covers cheeks, nose and the forehead under the brim; inside
it a pixel counts as skin when its chroma is skin-like (YCbCr, Cr over Cb, not the grey backdrop,
not the cap, not the jersey). Hair, beard, the brim's shadow and the eye sockets are the darkest
skin-chroma pixels, and specular shine the brightest, so the colour is the median of the pixels
between the 45th and the 88th percentile of luminance: the lit cheek and forehead.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

BOX = (0.24, 0.30, 0.76, 0.60)  # x0, y0, x1, y1 as a fraction of the photo
LO, HI = 45, 88                 # the luminance percentiles kept


def thumb(path):
    return np.asarray(Image.open(path).convert('L').resize((32, 48)), dtype=float)


def sample(path):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    a = np.asarray(im, dtype=float)[int(BOX[1] * h):int(BOX[3] * h), int(BOX[0] * w):int(BOX[2] * w)].reshape(-1, 3)
    r, g, b = a[:, 0], a[:, 1], a[:, 2]
    y = 0.299 * r + 0.587 * g + 0.114 * b
    cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
    cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
    skin = (cr > 136) & (cr < 180) & (cb > 80) & (cb < 128) & (cr - cb > 14) & (r > g) & (g >= b * 0.85) & (y > 20)
    s, ys = a[skin], y[skin]
    if len(s) < 200:
        return None, int(len(s))
    lo, hi = np.percentile(ys, LO), np.percentile(ys, HI)
    keep = s[(ys >= lo) & (ys <= hi)]
    return [round(float(v), 1) for v in np.median(keep, axis=0)], int(len(keep))


def main():
    dl, generic, out = sys.argv[1], sys.argv[2], sys.argv[3]
    gen = thumb(generic)
    res = {}
    for f in sorted(os.listdir(dl)):
        if not f.endswith('.jpg'):
            continue
        p = os.path.join(dl, f)
        mid = f[:-4]
        # the silhouette: the same bytes, or near enough (a re-encode) to MLB's generic image
        if abs(thumb(p) - gen).mean() < 6:
            res[mid] = {'silhouette': True, 'rgb': None, 'n': 0}
            continue
        rgb, n = sample(p)
        res[mid] = {'silhouette': False, 'rgb': rgb, 'n': n}
    with open(out, 'w') as fh:
        json.dump(res, fh, indent=1)


if __name__ == '__main__':
    main()
