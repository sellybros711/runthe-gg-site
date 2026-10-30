"""Texture work for the people: skin maps from the MakeHuman skins, cloth maps for the team colours.

Everything is written to WORK as png; the glTF export turns them into webp.
"""
import os, glob
import numpy as np
from PIL import Image, ImageFilter


def _load(path, size=None, mode='RGB'):
    im = Image.open(path).convert(mode)
    if size and im.size != (size, size):
        im = im.resize((size, size), Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255.0


def _save(arr, path, mode='RGB'):
    Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), mode).save(path)
    return path


def _normal_from_height(h, strength):
    gy, gx = np.gradient(h)
    n = np.stack([-gx * strength, gy * strength, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def _noise(size, scale, seed):
    rng = np.random.default_rng(seed)
    small = rng.random((max(2, size // scale), max(2, size // scale))).astype(np.float32)
    return np.asarray(Image.fromarray((small * 255).astype(np.uint8)).resize((size, size), Image.BICUBIC)).astype(np.float32) / 255


def skin(skin_dir, work, size):
    """Colour: the MakeHuman photo skin, a touch warmer and less flat. Normal: the colour map's own
    fine detail (pores, creases, stubble) as height plus fine noise for pores."""
    src = glob.glob(f'{skin_dir}/*diffuse*.png')[0]
    name = os.path.basename(skin_dir)
    out = {}
    c = _load(src, size)
    lum = c @ np.array([0.3, 0.59, 0.11], np.float32)
    blur = np.asarray(Image.fromarray((lum * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(size / 256))).astype(np.float32) / 255
    detail = lum - blur
    h = detail * 1.0 + (_noise(size, 2, 1) - 0.5) * 0.015 + (_noise(size, 1, 2) - 0.5) * 0.01
    out['normal'] = _save(_normal_from_height(h, 12.0 * size / 1024), f'{work}/{name}_{size}_normal.png')
    # gentle saturation and a little more contrast in the mid tones: the MakeHuman skins are pale and flat
    mean = c.mean(-1, keepdims=True)
    c2 = mean + (c - mean) * 1.12
    out['color'] = _save(c2, f'{work}/{name}_{size}_color.png')
    return out


def cloth(proxy_dir, base, color, ph_dir, pattern, work, trim=None, size=1024, tile=8, color2=None):
    """Team colour cloth: the proxy's own AO (its folds) times a tinted Poly Haven weave; the proxy's
    normal map kept for the fold shapes, with the weave's normal blended in. color2, when given,
    colours the part the source paints as denim (the trousers of a shirt and jeans outfit)."""
    out = {}
    ao_p = f'{proxy_dir}/{base}_ao.png'
    nrm_p = f'{proxy_dir}/{base}_normal.png'
    ao = _load(ao_p, size, 'L') if os.path.exists(ao_p) else np.ones((size, size), np.float32)
    weave = _load(f'{ph_dir}/{pattern}_diff_1k.jpg', size // tile)
    weave = np.tile(weave, (tile, tile, 1))[:size, :size]
    wl = weave @ np.array([0.3, 0.59, 0.11], np.float32)
    wl = 0.85 + (wl - wl.mean()) * 0.6
    col = np.array(color[:3], np.float32)[None, None, :]
    if color2 is not None:
        src = _load(f'{proxy_dir}/{base}_diffuse.png', size)
        denim = np.clip(((src[..., 2] - src[..., 0]) - 0.04) / 0.05, 0, 1)
        denim = np.asarray(Image.fromarray((denim * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(2))).astype(np.float32) / 255
        col = col * (1 - denim[..., None]) + np.array(color2[:3], np.float32)[None, None, :] * denim[..., None]
    # the AO map carries the source's printed logo as a faint shape: soften it away
    ao = np.asarray(Image.fromarray((ao * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(9))).astype(np.float32) / 255
    rgb = col * wl[..., None] * (0.6 + 0.4 * ao[..., None])
    tag = f'{base}_{"%02x%02x%02x" % tuple(int(x * 255) for x in color[:3])}'
    out['color'] = _save(rgb, f'{work}/{tag}_color.png')
    n1 = _load(nrm_p, size) if os.path.exists(nrm_p) else np.full((size, size, 3), (0.5, 0.5, 1.0), np.float32)
    wn = _load(f'{ph_dir}/{pattern}_nor_gl_1k.jpg', size // tile)
    wn = np.tile(wn, (tile, tile, 1))[:size, :size]
    n = (n1 * 2 - 1) + (wn * 2 - 1) * np.array([0.35, 0.35, 0], np.float32)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    out['normal'] = _save(n * 0.5 + 0.5, f'{work}/{tag}_normal.png')
    return out


def paint_faces(color_png, ob, face_pred, rgb, size=None):
    """Paint the UV triangles of the faces of ob that face_pred(face_centre_world, face) accepts."""
    from PIL import ImageDraw
    im = Image.open(color_png).convert('RGB')
    W, H = im.size
    d = ImageDraw.Draw(im)
    me = ob.data
    uv = me.uv_layers.active.data
    col = tuple(int(x * 255) for x in rgb[:3])
    for p in me.polygons:
        if not face_pred(ob.matrix_world @ p.center, p):
            continue
        pts = [(uv[li].uv[0] * W, (1 - uv[li].uv[1]) * H) for li in p.loop_indices]
        d.polygon(pts, fill=col)
    im.save(color_png)
