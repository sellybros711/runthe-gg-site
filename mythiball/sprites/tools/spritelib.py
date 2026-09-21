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


def component_masks(mask):
    """Every 8 connected blob in `mask`, as its own boolean mask.

    ONE WALKER, because `components` used to do this walk itself and anything
    else needing the blobs would have walked a second time, which is how two
    answers to one question start disagreeing.
    """
    h, w = mask.shape
    seen = np.zeros((h, w), dtype=bool)
    out = []
    for sy in range(h):
        for sx in range(w):
            if not mask[sy, sx] or seen[sy, sx]:
                continue
            q = deque([(sy, sx)])
            seen[sy, sx] = True
            m = np.zeros((h, w), dtype=bool)
            while q:
                y, x = q.popleft()
                m[y, x] = True
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            q.append((ny, nx))
            out.append(m)
    return out


def components(mask):
    """Runs of True in `mask`, 8 connected, as (size, (x0,y0,x1,y1))."""
    out = []
    for m in component_masks(mask):
        ys, xs = np.where(m)
        out.append((int(m.sum()), (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))))
    return out


# HOW CLEAR OF THE FIGURE A TOP OR BOTTOM BLOB HAS TO BE TO BE SOMEBODY ELSE.
# Measured over every frame in the pack: of the 400 detached blobs sitting on
# the top or bottom edge, 10 are within a pixel of the figure, NONE are 2 or 3
# away, 10 are 4 to 6 away and 380 are 7 or more. So the threshold sits in a
# band that is genuinely empty rather than on the last value that passes, and
# the ten it keeps are the case it is written for: Paul Bunyan's boot in
# `run1` and `run2` is drawn clear of his leg and is 123 pixels of his own
# character.
BLEED_GAP = 3


def drop_edge_bleed(frame):
    """Remove detached blobs on an edge: the NEIGHBOURING frame's drawing.

    A strip is one image cut into 64px cells, and several characters are drawn
    a little wider than their cell, so a wing, a bat or a foot from the frame
    next door lands inside this one. On screen that is a blob floating beside
    the character with nothing holding it up.

    IT IS WHAT THE EDGE RULE WAS REALLY CATCHING. Refusing any frame with a
    pixel in column 0 or 63 threw away 124 frames, and 101 of them were the
    swing and pitch strips, whose middle frame is CONTACT and RELEASE: the two
    most important drawings in the game, rejected because a bat reaches the
    side of its own cell. Measured, 36 of those frames have nothing but bleed
    on the edge, and every one of the rest is a whole figure that simply fills
    its canvas.

    THE CHARACTER IS THE LARGEST BLOB, always, so it is never what goes. A
    ball drawn hard against the edge would be dropped with the bleed, which is
    a few pixels against a frame of art.

    IT ONLY EVER LOOKED AT THE SIDES, AND THE BLEED IS MOSTLY VERTICAL. The
    docstring above says "cut into 64px cells" and every strip really is one
    row of them, so a neighbour could only be left or right. That premise is
    false one step earlier: the strips were themselves cut out of a TALLER
    sheet, so a 64px cell catches the bottom of the figure above it or the top
    of the one below. Opened by hand, `hermes_pitch` frame 2 is Mrs Claus with
    her head clipped off at the top of the cell and the next Mrs Claus's white
    hair intruding along the bottom.

    Measured over the shipped table before this: of 558 detached blobs, **0**
    survived on a side edge and 355 sat on the top or the bottom, because the
    test was doing its job perfectly on the one axis it was given. What a
    player saw was a pair of somebody else's shoes floating over Alice's head
    and 278 pixels of another character lying at Hermes' feet. Nineteen of the
    sixty eight carried one in a pose the clubhouse shows. Nothing could
    report it: a stray blob is a valid drawing, every pose was present, and
    every guard here asks whether a frame is its own art rather than whether
    it is ONLY its own art.

    AND THE EDGE WAS THE WRONG HALF OF THE RULE, WHICH TOOK A SECOND PASS.
    Requiring the blob to TOUCH the top or the bottom catches the neighbour
    that reached all the way in and misses the one the sheet cut short: a bar
    of somebody's shoulder stopping two rows in, a hat, a shoe. 87 of those
    survived the edge rule, all of them in the debris field at the head or the
    foot of a cell, and the clubhouse still showed ten of them.

    SO THE CLEARANCE IS THE WHOLE TEST NOW, above or below, edge or not. The
    docstring's own warning about eating a ball off a bat is what the clearance
    answers and the edge never did: a ball, a falling leaf or a prop is drawn
    WITH the figure and overlaps its rows, so it has no clearance to be dropped
    for. All 87 were rendered and looked at one at a time before this changed,
    which is the only way this question has ever been settled here. Not one is
    art. The 203 blobs that overlap the figure are untouched and are where the
    leaves and the ball live.

    A TOP OR BOTTOM BLOB NEEDS A CLEARANCE AND A SIDE ONE DOES NOT. Sideways,
    the neighbour is past the cell wall and a character's own arm reaches the
    edge attached to the character, so touching the edge is the whole of it.
    Vertically the figure STANDS on the bottom edge, so a foot drawn clear of
    the leg is a detached blob on that edge and is not bleed. See BLEED_GAP.
    """
    op = frame[:, :, 3] > 0
    if not op.any():
        return frame
    blobs = component_masks(op)
    if len(blobs) < 2:
        return frame
    main = max(blobs, key=lambda m: m.sum())
    mys = np.where(main.any(axis=1))[0]
    mtop, mbot = int(mys.min()), int(mys.max())
    out = np.array(frame, copy=True)
    for m in blobs:
        if m is main:
            continue
        if m[:, 0].any() or m[:, -1].any():
            out[m] = 0
            continue
        ys = np.where(m.any(axis=1))[0]
        clear = max(int(ys.min()) - mbot, mtop - int(ys.max()))
        if clear >= BLEED_GAP:
            out[m] = 0
    return out


def edge_run(frame):
    """The longest unbroken run of drawing down either side edge.

    This is what tells a figure CUT OFF by the canvas from one that reaches
    it. Call it after drop_edge_bleed, or it measures the neighbour.
    """
    op = frame[:, :, 3] > 0
    best = 0
    for col in (op[:, 0], op[:, -1]):
        run = 0
        for v in col:
            run = run + 1 if v else 0
            best = max(best, run)
    return best


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
