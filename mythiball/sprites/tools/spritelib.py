"""The pixel routines the audit and the repair both need, written once.

Two tools asking the same question of the same frame have to get the same
answer, or the audit certifies something the repair then does differently.
That is the one bug this file exists to make impossible, so nothing here
belongs to either caller: no I/O, no reporting, no side effects.

THE TWO CONNECTIVITIES ARE OPPOSITE ON PURPOSE. The CHARACTER is walked at 8,
so a cape hanging off a shoulder by a single diagonal pixel is part of the
character rather than a detached island. The TRANSPARENT background is walked
at 4, so a diagonal chink in an outline does not let the flood leak into an
enclosed pocket and report it as open sky. One rule for both gives the classic
paradox where a diagonal line is connected and disconnected at once.
"""
from collections import Counter, deque

import numpy as np
from PIL import Image

FRAME = 64


def frames_of(path_or_img):
    """A strip split into its 64px frames, as RGBA arrays."""
    img = path_or_img
    if isinstance(path_or_img, str):
        img = Image.open(path_or_img)
    a = np.asarray(img.convert('RGBA'), dtype=np.uint8)
    return [a[:, i * FRAME:(i + 1) * FRAME, :] for i in range(a.shape[1] // FRAME)]


def components(mask):
    """Runs of True in `mask`, 8 connected, as (size, (x0,y0,x1,y1))."""
    h, w = mask.shape
    seen = np.zeros((h, w), dtype=bool)
    out = []
    for sy in range(h):
        for sx in range(w):
            if not mask[sy, sx] or seen[sy, sx]:
                continue
            q = deque([(sy, sx)])
            seen[sy, sx] = True
            size = 0
            y0 = y1 = sy
            x0 = x1 = sx
            while q:
                y, x = q.popleft()
                size += 1
                y0, y1 = min(y0, y), max(y1, y)
                x0, x1 = min(x0, x), max(x1, x)
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            q.append((ny, nx))
            out.append((size, (x0, y0, x1, y1)))
    return out


def _border_seeds(h, w):
    for x in range(w):
        yield 0, x
        yield h - 1, x
    for y in range(h):
        yield y, 0
        yield y, w - 1


def interior_holes(opaque):
    """Transparent pixels the border cannot reach, walked at 4."""
    h, w = opaque.shape
    clear = ~opaque
    seen = np.zeros((h, w), dtype=bool)
    q = deque()
    for y, x in _border_seeds(h, w):
        if clear[y, x] and not seen[y, x]:
            seen[y, x] = True
            q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and clear[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    return clear & ~seen


def border_background(frame, tol=0):
    """The baked background: a mask of what a border flood would remove.

    IT IS ANCHORED TO THE BORDER AND TO ONE SEED COLOUR, which is the whole
    difference between this and a colour key. The seed is the commonest colour
    ON THE BORDER, the flood starts only from border pixels wearing it, and it
    spreads only through neighbours within `tol` of that seed. So a pocket of
    the same colour INSIDE the character is never reached, because nothing
    connects it to the edge. Keying on the colour globally would delete it, and
    the pixel it would delete is usually an eye or a shadow under a chin.

    TOL DEFAULTS TO ZERO AND THAT IS A MEASUREMENT, NOT CAUTION FOR ITS OWN
    SAKE. These backgrounds are flat: a border flood removes exactly two
    distinct colours on every strip it recovers, and (15,9,14) is 100 or more
    of the 256 border pixels every time. So there is nothing for a tolerance to
    catch, and there is something for it to break. The characters are outlined
    in near black, within 12 of the background, so at tol=12 the flood walks
    along the OUTLINE and off into the dark interior: 18 px of pan_run, 38 of
    pirate_run, 130 at tol=20. Every one of those is a pixel of the drawing.
    Anchoring cannot save you there, because the outline really is connected to
    the border. Measured across the recovered strips, tol 0 and tol 12 both
    clear the canvas edges, so the tolerance buys nothing and costs art.

    Raise it only for a strip with a genuinely dithered background, and look at
    the preview before believing it.

    It returns a mask rather than a modified frame so a caller can count it,
    preview it, or refuse it. Nothing here edits anything.
    """
    h, w, _ = frame.shape
    rgb = frame[:, :, :3].astype(np.int16)
    border = [tuple(rgb[y, x]) for y, x in _border_seeds(h, w)]
    seed = np.array(Counter(border).most_common(1)[0][0], dtype=np.int16)
    near = np.abs(rgb - seed).max(axis=2) <= tol
    seen = np.zeros((h, w), dtype=bool)
    q = deque()
    for y, x in _border_seeds(h, w):
        if near[y, x] and not seen[y, x]:
            seen[y, x] = True
            q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and near[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    return seen


def opaque_after_background(frame, tol=0):
    """What would still be drawn once a baked background came off."""
    return (frame[:, :, 3] > 0) & ~border_background(frame, tol)
