#!/usr/bin/env python3
"""Sprite engine v2 for Run The All-Stars.

Generates every character sprite for allstars/index.html.

    python3 allstars/gen_sprites_v2.py > allstars/sprites.js

WHY THIS EXISTS. The first sprites were hand placed color keys on a 20x24
grid. Two things made them read flat no matter how much detail went in:

1. Every form was outlined in the same near black. Real chibi sprites edge
   each form with a darker shade of that form's OWN color and reserve true
   dark for the outer silhouette. That one change is most of the difference
   between a sticker and a figure.

2. Shading was a linear gradient across the shape, which is a diagonal
   wash rather than light. Here the head is a sphere and the limbs are
   cylinders: a surface normal is computed per pixel and lit with a
   Lambert term against a fixed upper left source, which gives a real
   terminator, a rim that closes the form, and a specular hotspot.

A character is described by a SPEC (archetype, colors, features) rather
than by hand placed pixels, so proportions and lighting stay consistent
across fifty four of them and a run cycle is a pose argument rather than
a redraw.
"""
import math
import sys

W, H = 32, 40
# ------------------------------------------------------------ proportions
# Every coordinate in this file is LOGICAL, on a 32 by 40 grid, and every
# head coordinate means exactly what it says: rows above NECK are drawn one
# to one. Below it the body is stretched on the way to the pixels.
#
# It has to be done here rather than by moving numbers, because the figures
# were a head and a half tall. The skull runs rows 3 to 23 and everything
# else, torso and legs together, ran 23 to 38: fifteen rows of body under
# twenty rows of head, which is a bobblehead rather than the Backyard
# proportion of roughly two and a quarter heads. Shrinking the skull was the
# other way to get there and it is the wrong one, because the faces are
# where all the work is and they are already tight at twenty rows.
#
# So the sprite grows downward instead. Everything the archetypes and the
# signatures say about the body still reads on the 40 row grid; the stretch
# happens in the primitives, once, so a leg drawn from 31 to 38 comes out
# twelve pixels long instead of eight and no signature had to move.
NECK = 22.0
OUT_H = 50
BODY_STRETCH = (OUT_H - NECK) / (H - NECK)


def ymap(y):
    """Logical row to physical row."""
    return y if y <= NECK else NECK + (y - NECK) * BODY_STRETCH


def yinv(py):
    """Physical row back to logical, for shading a shape at the right point
    along its own form rather than at the row it happens to land on."""
    return py if py <= NECK else NECK + (py - NECK) / BODY_STRETCH


WHITEISH = (252, 232, 200)
LIGHT = (-0.55, -0.62, 0.56)   # upper left, slightly toward the viewer
SIL = (14, 11, 20)             # shared outer silhouette line

CX = 16.0

# The skull is very slightly TALLER than it is wide. It has to be: a chibi
# head is most of the silhouette, so a head one pixel wider than it is tall
# reads as squashed at every size, and no amount of shading fixes it. Hair
# and hats are then built INSIDE this box (see hair(), headwear()) so that
# what the eye follows is always the skull's curve, never a wider lid
# sitting on top of it.
HEAD_CY, HEAD_RX, HEAD_RY = 13.0, 9.4, 10.2
HEAD_BROW = HEAD_CY - 1.5     # hair stops here; below it is face
TORSO_HW = 6.5                # torso half width, vs a 9.4 head half width


# ---------------------------------------------------------------- color
def hex2rgb(h):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def rgb2hex(c):
    return '#%02x%02x%02x' % tuple(max(0, min(255, int(round(v)))) for v in c)


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def shade(c, amt):
    """Darken toward a cool shadow, lighten toward a warm highlight, never
    toward flat grey."""
    if isinstance(c, str):
        c = hex2rgb(c)
    if amt < 0:
        return mix(c, (18, 14, 30), -amt)
    return mix(c, (255, 248, 225), amt)


def luma(c):
    return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255.0


class Ramp:
    """One material: a base color, its tone ramp, and its own outline.

    THE SHADOW END IS NOT A FIXED OFFSET. A near black material darkened
    by a fixed amount lands on the silhouette color, so the form loses its
    own edge into its own interior and reads as a hole rather than a
    shape: that is what Hyde's hair was. The shadow tones are therefore
    floored away from SIL in proportion to how dark the base already is.
    The highlight end is left alone (see _floor).
    """
    def __init__(self, base):
        self.base = hex2rgb(base) if isinstance(base, str) else base
        y = luma(self.base)
        # Only genuinely near black materials need help, and they need it
        # from BELOW: lengthening their highlight instead just puts a white
        # blob on a black shape, which is not a form either.
        t = max(0.0, min(1.0, (0.16 - y) / 0.16))
        # A near black material's LIT tone is the other half of the
        # problem yesterday's shadow floor solved. At a flat 0.26 offset,
        # black hair lands on mid grey over the whole upper half of a
        # sphere, so Dracula and Frankenstein both wore grey caps. The
        # lit band shrinks toward the base as the base gets darker; the
        # small specular glint (spec, l > 0.93) still carries the sheen.
        self.spec = shade(self.base, 0.55 - 0.18 * t)
        self.lit = shade(self.base, 0.26 * (1 - 0.85 * t))
        self.mid = self.base
        self.dark = self._floor(shade(self.base, -0.26), t)
        self.core = self._floor(shade(self.base, -0.44), t)
        self.line = self._floor(shade(self.base, -0.58), t, extra=0.6)

    @staticmethod
    def _floor(c, t, extra=1.0):
        """Keep a shadow tone clear of the silhouette color. Without this a
        near black material's shadow IS the outline, the shape loses its
        edge into its own interior, and what is left reads as a hole.

        Only the SHADOW end moves. Lengthening the highlight instead is
        the obvious fix and the wrong one: it turns a black cat grey while
        the shadows stay welded to the outline, which is both problems at
        once."""
        if t <= 0:
            return c
        return mix(c, shade(SIL, 0.30), 0.35 * t * extra)

    def at(self, l, spec=False):
        if spec and l > 0.93:
            return self.spec
        if l > 0.72:
            return self.lit
        if l > 0.40:
            return self.mid
        if l > 0.16:
            return self.dark
        return self.core


# --------------------------------------------------------------- canvas
class Canvas:
    def __init__(self):
        self.px = [[None] * W for _ in range(OUT_H)]
        self.owner = [[None] * W for _ in range(OUT_H)]

    def set(self, x, y, rgb, ramp=None):
        """x, y are PHYSICAL here. Only the primitives call this, and each
        of them has already put its logical rows through ymap."""
        x, y = int(x), int(y)
        if 0 <= x < W and 0 <= y < OUT_H:
            self.px[y][x] = rgb
            self.owner[y][x] = ramp

    def get(self, x, y):
        if 0 <= x < W and 0 <= y < OUT_H:
            return self.px[y][x]
        return None

    def sphere(self, cx, cy, rx, ry, ramp, spec=True, ymax=None):
        """ymax cuts the sphere off below that row, so a hair or hat shape
        can be a CAP that follows the skull's own curve rather than a
        separate wider ellipse pasted over it."""
        for py in range(OUT_H):
            ly = yinv(py + 0.5)
            if ymax is not None and ly > ymax + 0.5:
                break
            for x in range(W):
                nx = (x + 0.5 - cx) / rx
                # the normal comes from the LOGICAL position on the form, so
                # a stretched sphere is lit like a stretched sphere and not
                # like a circle whose bands got pulled apart
                ny = (ly - cy) / ry
                d2 = nx * nx + ny * ny
                if d2 > 1.0:
                    continue
                nz = math.sqrt(max(0.0, 1.0 - d2))
                n = (nx, ny, nz)
                ln = math.sqrt(sum(v * v for v in n)) or 1.0
                n = tuple(v / ln for v in n)
                l = (sum(n[i] * LIGHT[i] for i in range(3)) + 1) / 2
                if d2 > 0.90:
                    l *= 0.55
                self.set(x, py, ramp.at(l, spec), ramp)

    def ball(self, cx, cy, rx, ry, ramp, spec=True):
        """A sphere that comes out ROUND on the finished sprite.

        Below the neck a plain sphere() is stretched along with everything
        else, which is what a torso wants and is wrong for anything whose
        shape IS its roundness: a fist, a belly, a bear, a tuft of fur.
        ry here is the radius you want in PIXELS, and the centre lands at
        ymap(cy) either way."""
        self.sphere(cx, cy, rx, ry / BODY_STRETCH if cy > NECK else ry,
                    ramp, spec=spec)

    def cyl(self, x0, y0, x1, y1, ramp, round_top=0, round_bot=0, spec=False):
        """Vertical cylinder; shading varies across x like a limb."""
        x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
        for py in range(int(round(ymap(y0))), int(round(ymap(y1 + 1)))):
            ly = yinv(py + 0.5) - 0.5
            for x in range(x0, x1 + 1):
                u = 0.0 if x1 == x0 else (x + 0.5 - x0) / (x1 + 1 - x0) * 2 - 1
                if round_top:
                    ty = (ly - y0) / max(1, round_top)
                    if ty < 1 and abs(u) > math.sqrt(max(0.0, 1 - (1 - ty) ** 2)):
                        continue
                if round_bot:
                    by = (y1 - ly) / max(1, round_bot)
                    if by < 1 and abs(u) > math.sqrt(max(0.0, 1 - (1 - by) ** 2)):
                        continue
                nz = math.sqrt(max(0.0, 1 - u * u))
                n = (u, -0.15, nz)
                ln = math.sqrt(sum(v * v for v in n)) or 1.0
                n = tuple(v / ln for v in n)
                l = (sum(n[i] * LIGHT[i] for i in range(3)) + 1) / 2
                if abs(u) > 0.88:
                    l *= 0.6
                self.set(x, py, ramp.at(l, spec), ramp)

    def taper(self, y0, y1, w0, w1, ramp, cx=CX, folds=0):
        """A robe or gown: a cylinder whose width grows down the shape, so
        it reads as cloth hanging rather than a box. Optional vertical
        fold lines that darken with the same light model."""
        for py in range(int(round(ymap(y0))), int(round(ymap(int(y1) + 1)))):
            y = yinv(py + 0.5) - 0.5
            t = (y - y0) / max(1, (y1 - y0))
            half = (w0 + (w1 - w0) * t) / 2
            for x in range(int(cx - half), int(cx + half) + 1):
                u = (x + 0.5 - cx) / max(0.5, half)
                if abs(u) > 1:
                    continue
                nz = math.sqrt(max(0.0, 1 - u * u))
                n = (u, -0.1, nz)
                ln = math.sqrt(sum(v * v for v in n)) or 1.0
                n = tuple(v / ln for v in n)
                l = (sum(n[i] * LIGHT[i] for i in range(3)) + 1) / 2
                if abs(u) > 0.9:
                    l *= 0.62
                self.set(x, py, ramp.at(l), ramp)
            if folds:
                for k in range(folds):
                    fu = -0.55 + 1.1 * (k / max(1, folds - 1))
                    fx = int(cx + fu * half)
                    if abs(fu) < 0.92:
                        self.set(fx, py, ramp.at(0.22), ramp)

    def rect(self, x0, y0, x1, y1, ramp, l=0.55):
        for py in range(int(round(ymap(int(y0)))), int(round(ymap(int(y1) + 1)))):
            for x in range(int(x0), int(x1) + 1):
                u = (x - x0) / max(1, (x1 - x0))
                self.set(x, py, ramp.at(l + 0.26 * (0.5 - u)), ramp)

    def tri(self, pts, ramp, l=0.55):
        pts = [(p[0], ymap(p[1])) for p in pts]
        ys = [p[1] for p in pts]
        for y in range(int(min(ys)), int(max(ys)) + 1):
            xs = []
            n = len(pts)
            for i in range(n):
                ax, ay = pts[i]
                bx, by = pts[(i + 1) % n]
                if (ay <= y < by) or (by <= y < ay):
                    xs.append(ax + (bx - ax) * (y - ay) / (by - ay))
            xs.sort()
            for i in range(0, len(xs) - 1, 2):
                lo, hi = int(round(xs[i])), int(round(xs[i + 1]))
                span = max(1.0, hi - lo)
                for x in range(lo, hi + 1):
                    u = (x - lo) / span
                    self.set(x, y, ramp.at(l + 0.28 * (0.5 - u)), ramp)

    def dot(self, x, y, rgb):
        """One logical pixel, which below the neck is one and a bit physical
        ones. It has to fill its whole span or every hand drawn line in the
        body region comes out dashed."""
        y = int(y)
        p0 = int(math.floor(ymap(y)))
        p1 = max(p0, int(math.ceil(ymap(y + 1))) - 1)
        for py in range(p0, p1 + 1):
            self.set(x, py, rgb, None)

    def outline(self):
        """Outer silhouette in shared dark; interior material seams in the
        darker material's own line color."""
        adds = []
        for y in range(OUT_H):
            for x in range(W):
                if self.px[y][x] is not None:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    if self.get(x + dx, y + dy) is not None:
                        o = self.owner[y + dy][x + dx] if 0 <= y + dy < OUT_H and 0 <= x + dx < W else None
                        adds.append((x, y, o))
                        break
        for (x, y, o) in adds:
            self.set(x, y, SIL, o)
        edits = []
        for y in range(OUT_H):
            for x in range(W):
                o = self.owner[y][x]
                if o is None or self.px[y][x] is None:
                    continue
                for dx, dy in ((1, 0), (0, 1)):
                    nx, ny = x + dx, y + dy
                    if not (0 <= nx < W and 0 <= ny < OUT_H):
                        continue
                    o2 = self.owner[ny][nx]
                    if o2 is None or o2 is o:
                        continue
                    # Materials of similar brightness get NO drawn seam.
                    # Blond hair over a fair forehead was being edged in
                    # dark skin tone, which drew a bar clear across the
                    # face at brow height: safety glasses on every kid
                    # on the roster. Where the two materials really
                    # contrast (a jacket against skin), the seam stays.
                    if abs(luma(o.mid) - luma(o2.mid)) < 0.17:
                        continue
                    edits.append((nx, ny, o2.line))
        for (x, y, rgb) in edits:
            self.set(x, y, rgb, self.owner[y][x])

    def emit(self):
        counts = {}
        for row in self.px:
            for c in row:
                if c is None:
                    continue
                counts[rgb2hex(c)] = counts.get(rgb2hex(c), 0) + 1
        ordered = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
        alpha = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
        remap = {}
        if len(ordered) > len(alpha):
            keep = [c for c, _ in ordered[:len(alpha)]]
            krgb = [hex2rgb(c) for c in keep]
            for c, _ in ordered[len(alpha):]:
                r = hex2rgb(c)
                i = min(range(len(keep)),
                        key=lambda j: sum((r[k] - krgb[j][k]) ** 2 for k in range(3)))
                remap[c] = keep[i]
            ordered = ordered[:len(alpha)]
        pal, rev = {}, {}
        for i, (c, _) in enumerate(ordered):
            pal[alpha[i]] = c
            rev[c] = alpha[i]
        rows = []
        for y in range(OUT_H):
            r = ''
            for x in range(W):
                c = self.px[y][x]
                if c is None:
                    r += '.'
                else:
                    hx = rgb2hex(c)
                    r += rev[remap.get(hx, hx)]
            rows.append(r)
        return pal, rows


# ------------------------------------------------------------- features
def face(cv, skin, spec, cy=HEAD_CY):
    """Eyes, brow, nose and mouth, each its own parameter.

    They used to be one block. The 'normal' eye drew a fixed googly pair
    centred on CX that ignored eyespread entirely, so THIRTY ONE of the
    fifty four characters had not similar eyes but the same eyes, pixel
    for pixel, and the only mouths were a line and a slightly wider line.
    Half the roster was one face in different clothes, which is what it
    looked like.

    So the face is four independent parts now. A brow is two pixels a side
    and it is the single most identifying thing on a face at this size: it
    is the difference between Tom Sawyer and Huck Finn when they are both
    a boy in a straw hat. A nose is the second. Between brow, eye shape,
    spread, nose and mouth there are enough combinations that no two
    characters need share one.

    Row budget, all relative to the eye row y:
        y-1   brow, and the eye loses its top row to make space
        y..y+1  the eye whites (y-1..y+1 when there is no brow)
        y+2..y+4  the nose
        y+6   the mouth
    """
    style = spec.get('eyes', 'normal')
    ec = spec.get('eyecolor')
    y = int(cy)
    sp = spec.get('eyespread', 4)
    if style == 'hidden':
        return
    if style == 'carved':
        # A pumpkin is a pumpkin because of what is cut OUT of it. Two dots
        # and a line on an orange sphere is just an orange sphere.
        glow = hex2rgb(ec or '#3a1a08')
        deep = shade(glow, -0.45)
        # Triangle eyes, point down, drawn row by row so both sides mirror.
        for i, wid in enumerate((3, 2, 1)):
            for side in (-1, 1):
                base = CX + side * 5
                for k in range(wid):
                    cv.dot(base - side * k, y - 2 + i, glow if i else deep)
        # A nose notch, then a grin with two teeth left standing in it.
        cv.dot(CX, y + 2, glow)
        cv.dot(CX - 1, y + 3, glow)
        cv.dot(CX, y + 3, glow)
        cv.dot(CX + 1, y + 3, glow)
        for dx in range(-5, 6):
            drop = 1 if abs(dx) >= 4 else 0
            if dx in (-2, 2):               # teeth
                continue
            cv.dot(CX + dx, y + 6 - drop, glow)
            cv.dot(CX + dx, y + 7 - drop, deep)
        return
    if style == 'goggles':
        # Dark round lenses on a strap. A fully hidden face on a bandaged
        # head leaves nothing for the eye to land on, and the head reads
        # as a bucket rather than as a head.
        lens = hex2rgb(ec or '#1a1a24')
        for side in (-1, 1):
            cv.sphere(CX + side * 4, y, 3.0, 2.6, Ramp(rgb2hex(lens)), spec=True)
        cv.rect(CX - 8, y - 1, CX + 8, y, Ramp(rgb2hex(shade(lens, 0.12))), l=0.35)
        for side in (-1, 1):
            cv.sphere(CX + side * 4, y, 2.2, 1.9, Ramp(rgb2hex(lens)), spec=True)
        return

    WHITE = (250, 250, 252)
    pc = hex2rgb(ec or '#241e2e')
    brow = spec.get('brow')
    # A brow is the character's hair, but it has to READ against the face
    # under it, and on the blond boys hair colour and skin colour are four
    # points of luma apart: drawn honestly the brows were invisible and
    # Tom and Huck went back to being the same face. Darken until it
    # separates, however light the hair is.
    bc = hex2rgb(spec.get('browcolor') or spec.get('hair') or
                 rgb2hex(shade(skin.base, -0.52)))
    for _ in range(6):
        if luma(skin.base) - luma(bc) >= 0.26:
            break
        bc = shade(bc, -0.22)

    if style == 'one':
        # ONE eye, and a BIG one: it has to carry the whole face alone.
        for dx in range(-3, 4):
            for dy in (-2, -1, 0, 1, 2):
                if abs(dx) == 3 and abs(dy) == 2:
                    continue
                cv.dot(CX + dx, y + dy, WHITE)
        p1 = hex2rgb(ec or '#3a2412')
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                cv.dot(CX + dx, y + dy, p1)
        cv.dot(CX - 1, y - 1, shade(p1, 0.55))
    elif style == 'glow':
        for side in (-1, 1):
            x = int(CX + side * sp)
            g = hex2rgb(ec or '#f4c25a')
            for dx in (-1, 0):
                cv.dot(x + dx, y, g)
                cv.dot(x + dx, y + 1, shade(g, -0.30))
            cv.dot(x - 1, y, shade(g, 0.50))
    elif style == 'angry':
        for side in (-1, 1):
            x = int(CX + side * sp)
            b = shade(skin.base, -0.50)
            cv.dot(x - 1, y - 1, b); cv.dot(x, y - 1, b)
            for dy in (0, 1):
                cv.dot(x - 1, y + dy, WHITE)
                cv.dot(x, y + dy, pc)
    elif style == 'bead':
        # No white at all: two beads of ink. Herge draws Tintin this way
        # and so does every bear on the roster, and on a face otherwise
        # made of big whites it is the most distinct eye there is.
        for side in (-1, 1):
            x = int(CX + side * sp)
            for dy in (0, 1):
                cv.dot(x, y + dy, pc)
                cv.dot(x + (1 if side < 0 else -1), y + dy, pc)
    elif style == 'squint':
        # Shut, or near enough. A laugh or a scowl depending on the brow.
        for side in (-1, 1):
            x = int(CX + side * sp)
            for dx in (-1, 0, 1):
                cv.dot(x + dx, y + 1, shade(skin.base, -0.55))
            cv.dot(x + side * 2, y, shade(skin.base, -0.55))
    else:
        # The white eye family. All of them respect eyespread, which is
        # the parameter the old googly pair quietly ignored.
        top = y if brow else y - 1
        for side in (-1, 1):
            x = int(CX + side * sp)
            if style == 'wide':
                cols, rows_, pw = (-2, -1, 0, 1), (top, y + 1), 2
            elif style == 'oval':
                cols, rows_, pw = (-1, 0), (top, y, y + 1), 1
            else:                                   # round, cartoon, lash
                cols, rows_, pw = (-1, 0, 1), (top, y, y + 1), 1
            for dx in cols:
                for yy in set(rows_):
                    if yy <= y + 1:
                        cv.dot(x + dx, yy, WHITE)
            # The pupil sits in the SAME place in both eyes. Mirrored
            # inward it made the whole roster cross eyed.
            for dx in range(pw):
                cv.dot(x + dx, y, pc)
                cv.dot(x + dx, y + 1, pc)
            if style == 'sleepy':
                for dx in cols:                     # a heavy lid over the top
                    cv.dot(x + dx, top, shade(skin.base, -0.42))
            if style == 'lash':
                cv.dot(x + side * 2, top - 1, pc)
                cv.dot(x + side * 3, top, pc)

    # ------------------------------------------------------------- brow
    if brow:
        by = y - 1
        for side in (-1, 1):
            x = int(CX + side * sp)
            inner, outer = x - side, x + side
            if brow == 'angry':                     # inner ends drive DOWN
                cv.dot(inner, by + 1, bc)
                cv.dot(x, by, bc)
                cv.dot(outer, by - 1, bc)
            elif brow == 'worried':                 # inner ends lift
                cv.dot(inner, by - 1, bc)
                cv.dot(x, by, bc)
                cv.dot(outer, by + 1, bc)
            elif brow == 'high':                    # raised, and clear of it
                for dx in (-1, 0, 1):
                    cv.dot(x + dx, by - 1, bc)
            elif brow == 'bushy':
                for dx in (-1, 0, 1, 2 * side):
                    cv.dot(x + dx, by, bc)
                    cv.dot(x + dx, by - 1, bc)
            else:                                   # flat
                for dx in (-1, 0, 1):
                    cv.dot(x + dx, by, bc)

    # ------------------------------------------------------------- nose
    nose = spec.get('nose')
    if nose:
        nd = shade(skin.base, -0.34)
        nl = skin.lit
        ny = y + 3
        if nose == 'dot':
            cv.dot(CX, ny, nd)
        elif nose == 'button':
            cv.dot(CX, ny, nd)
            cv.dot(CX - 1, ny, nd)
            cv.dot(CX - 1, ny - 1, nl)
        elif nose == 'bulb':
            for dx in (-1, 0, 1):
                cv.dot(CX + dx, ny, nl)
            cv.dot(CX, ny - 1, nl)
            for dx in (-1, 0, 1):
                cv.dot(CX + dx, ny + 1, nd)
        elif nose == 'long':
            for dy in (-1, 0, 1):
                cv.dot(CX, ny + dy, nl)
            cv.dot(CX - 1, ny + 1, nd)
            cv.dot(CX, ny + 2, nd)
        elif nose == 'beak':
            for i, wid in enumerate((2, 1, 0)):
                for dx in range(-wid, wid + 1):
                    cv.dot(CX + dx, ny - 1 + i, nd if i else nl)

    if spec.get('freckles'):
        f = shade(skin.base, -0.26)
        for dx in (-6, -4, 4, 6):
            cv.dot(CX + dx, y + 3, f)
        cv.dot(CX - 5, y + 4, f)
        cv.dot(CX + 5, y + 4, f)
    if spec.get('blush'):
        for dx in (-6, 6):
            cv.dot(CX + dx, y + 3, (236, 156, 156))
            cv.dot(CX + dx + (1 if dx < 0 else -1), y + 3, (236, 156, 156))

    # ------------------------------------------------------------ mouth
    m = spec.get('mouth', 'line')
    my = int(cy + 6)
    mc = shade(skin.base, -0.42)
    if m == 'none':
        return
    # Every mouth is a SMILE unless the character says otherwise: the
    # corners turn UP. A flat dark bar in the lower face reads as a
    # grimace, and a red block reads as a wound.
    if m == 'fang':
        for x in range(int(CX) - 2, int(CX) + 3):
            cv.dot(x, my, mc)
        cv.dot(int(CX) - 3, my - 1, mc)
        cv.dot(int(CX) + 3, my - 1, mc)
        cv.dot(int(CX) - 2, my + 1, WHITE)
        cv.dot(int(CX) + 2, my + 1, WHITE)
    elif m == 'grin':
        for x in range(int(CX) - 3, int(CX) + 4):
            cv.dot(x, my, mc)
        cv.dot(int(CX) - 4, my - 1, mc)
        cv.dot(int(CX) + 4, my - 1, mc)
    elif m == 'smirk':
        # ONE corner up. Asymmetry is the cheapest character on a face:
        # nothing else in three pixels says pleased with itself.
        for x in range(int(CX) - 2, int(CX) + 3):
            cv.dot(x, my, mc)
        cv.dot(int(CX) + 3, my - 1, mc)
        cv.dot(int(CX) + 4, my - 2, mc)
    elif m == 'frown':
        for x in range(int(CX) - 2, int(CX) + 3):
            cv.dot(x, my, mc)
        cv.dot(int(CX) - 3, my + 1, mc)
        cv.dot(int(CX) + 3, my + 1, mc)
    elif m == 'oh':
        for dx in (-1, 0, 1):
            cv.dot(CX + dx, my, mc)
            cv.dot(CX + dx, my + 1, mc)
        cv.dot(CX, my, (120, 60, 58))
        cv.dot(CX, my + 1, (120, 60, 58))
    elif m == 'buck':
        for x in range(int(CX) - 2, int(CX) + 3):
            cv.dot(x, my, mc)
        cv.dot(int(CX) - 1, my + 1, (246, 244, 238))
        cv.dot(int(CX), my + 1, (246, 244, 238))
        cv.dot(int(CX) - 1, my + 2, (246, 244, 238))
        cv.dot(int(CX), my + 2, (246, 244, 238))
    elif m == 'open':
        # happy open mouth: teeth over tongue, edged, corners up
        for x in range(int(CX) - 1, int(CX) + 2):
            cv.dot(x, my, (240, 238, 240))
            cv.dot(x, my + 1, (150, 52, 54))
        cv.dot(int(CX) - 2, my, mc)
        cv.dot(int(CX) + 2, my, mc)
        cv.dot(int(CX) - 3, my - 1, mc)
        cv.dot(int(CX) + 3, my - 1, mc)
    else:
        for x in range(int(CX) - 2, int(CX) + 3):
            cv.dot(x, my, mc)
        cv.dot(int(CX) - 3, my - 1, mc)
        cv.dot(int(CX) + 3, my - 1, mc)


def head_edge(y, floor=0.72):
    """Half width of the skull at row y. Below the jaw it stops narrowing
    and holds at `floor` of the full width, because a fall of hair (or a
    bandage) that keeps following the ellipse curls back under the chin
    and closes into a ring around the face."""
    ny = (y + 0.5 - HEAD_CY) / HEAD_RY
    t = math.sqrt(max(0.0, 1.0 - min(1.0, ny * ny)))
    return HEAD_RX * max(floor, t)


def sidelock(cv, r, side, y0, y1, w=2.0):
    """A fall of hair down the side of the head, following the skull's own
    curve rather than hanging beside it as a straight bar."""
    for y in range(int(y0), int(y1) + 1):
        outer = CX + side * head_edge(y)
        inner = outer - side * w
        lo, hi = sorted((inner, outer))
        cv.rect(lo, y, hi, y, r, l=0.52 if side < 0 else 0.40)


def hair(cv, spec):
    h = spec.get('hair')
    if not h:
        return
    r = Ramp(h)
    kind = spec.get('hairstyle', 'short')
    # Every cap is drawn INSIDE the skull box and cut off at the brow, so
    # the outline the eye follows is the head's, not the hair's.
    # MATTE. Hair has no specular hotspot: a glint sized for wet skin
    # put a grey cap on every dark haired character on the roster.
    cap = lambda rx, ry, dy=0.0: cv.sphere(CX, HEAD_CY + dy, HEAD_RX * rx,
                                           HEAD_RY * ry, r, spec=False,
                                           ymax=HEAD_BROW)
    if kind == 'short':
        cap(0.99, 0.99, -0.6)
    elif kind == 'long':
        cap(1.0, 1.0, -0.3)
        sidelock(cv, r, -1, HEAD_CY - 4, HEAD_CY + 9, 2.4)
        sidelock(cv, r, 1, HEAD_CY - 4, HEAD_CY + 9, 2.4)
    elif kind == 'wild':
        cap(1.0, 1.0, -0.4)
        # Pointed locks with real gaps between them. Evenly spaced bars of
        # equal height read as the teeth of a comb; bars packed edge to
        # edge read as one slab with notches cut in it. Neither reads as
        # hair, so: four locks, uneven heights, daylight in between.
        for dx, up, lean in ((-7.5, 3, -2), (-4.5, 6, -2), (-1.5, 8, 0),
                            (1.5, 5, 1), (4.5, 7, 2), (7.5, 4, 3)):
            top = HEAD_CY - HEAD_RY * math.sqrt(max(0.0, 1 - (dx / HEAD_RX) ** 2))
            cv.tri([(CX + dx + lean, top - up),
                    (CX + dx - 2.0, top + 2),
                    (CX + dx + 2.0, top + 2)], r, l=0.5)
    elif kind == 'mop':
        # A shaggy fringe: the cap comes down past the brow in uneven
        # points. Spikes would read as a crown on a blond character, which
        # is what Jack looked like when he shared Hyde's wild hair.
        cap(1.0, 1.0, -0.2)
        for dx, drop in ((-6, 1), (-4, 2), (-2, 1), (0, 2), (2, 1), (4, 2), (6, 1)):
            for k in range(drop):
                cv.dot(CX + dx, HEAD_BROW + 1 + k, r.dark if k else r.mid)
                cv.dot(CX + dx + 1, HEAD_BROW + 1 + k, r.dark if k else r.mid)
    elif kind == 'quiff':
        cap(0.99, 0.97, -0.8)
        cv.tri([(CX - 3, 4), (CX + 4, 0), (CX + 5, 5)], r, l=0.7)
    elif kind == 'braids':
        cap(1.0, 0.99, -0.5)
        sidelock(cv, r, -1, HEAD_CY - 2, HEAD_CY + 8, 2.0)
        sidelock(cv, r, 1, HEAD_CY - 2, HEAD_CY + 8, 2.0)
    elif kind == 'bald':
        pass


def beard(cv, spec):
    b = spec.get('beard')
    if not b:
        return
    r = Ramp(b)
    size = spec.get('beardsize', 'full')
    # A beard has to start BELOW the eyes. The old spheres were centered
    # high enough that their top edge crossed row HEAD_CY, which is where
    # face() puts the eyes: every bearded character came out as a blank
    # oval with no face in it at all, and Father Time had no face to find.
    if size == 'full':
        cv.sphere(CX, HEAD_CY + 9.0, HEAD_RX * 0.94, HEAD_RY * 0.58, r, spec=False)
    elif size == 'long':
        # Starts BELOW the mouth and falls: centered higher it swallowed
        # the whole face and Father Time had nothing above his beard.
        cv.sphere(CX, HEAD_CY + 9.4, HEAD_RX * 0.90, HEAD_RY * 0.52, r, spec=False)
        cv.taper(HEAD_CY + 11, HEAD_CY + 16, 12, 7, r)
    elif size == 'moustache':
        # One row plus drooping tips. Two rows of dark ten wide reads as
        # a gaping mouth, which made the Ringmaster look mid holler.
        cv.rect(CX - 4, HEAD_CY + 4, CX + 4, HEAD_CY + 4, r, l=0.6)
        cv.dot(CX - 5, HEAD_CY + 5, r.mid)
        cv.dot(CX + 5, HEAD_CY + 5, r.mid)
        cv.dot(CX - 1, HEAD_CY + 5, r.mid)
        cv.dot(CX, HEAD_CY + 5, r.mid)
        cv.dot(CX + 1, HEAD_CY + 5, r.mid)


def headwear(cv, spec):
    hw = spec.get('hat')
    if not hw:
        return
    c = Ramp(spec.get('hatcolor', '#c93030'))
    trim = Ramp(spec.get('hattrim', '#f5efe8'))
    # A hat is a CROWN plus a BRIM, and the crown is cut to the skull the
    # same way hair is. Brims stay inside +/-11 of a 32 wide sprite: past
    # that the hat becomes the character and the head underneath is gone.
    crown = lambda rx, ry, dy: cv.sphere(CX, HEAD_CY + dy, HEAD_RX * rx,
                                         HEAD_RY * ry, c, spec=False,
                                         ymax=HEAD_CY - 2)
    if hw == 'cap':
        crown(0.99, 0.99, -0.8)
        cv.rect(CX - 10, HEAD_CY - 3, CX + 3, HEAD_CY - 2, c, l=0.40)
    elif hw == 'sailor':
        # A Dixie cup rides HIGH on the skull, and that is the point of
        # having it: a cap cut at the brow leaves four rows of face, and
        # a face with a jaw in it needs nine. Crown to row 8, fold at
        # 8 and 9, so the cap seam lands at row 10 instead of 12.
        cv.sphere(CX, HEAD_CY - 2.0, HEAD_RX * 0.98, HEAD_RY * 0.92, c,
                  spec=False, ymax=8)
        cv.rect(CX - 9, 8, CX + 9, 9, Ramp(shade(c.base, -0.10)), l=0.50)
    elif hw == 'deerstalker':
        # The bill goes front AND back, which from the front reads as one
        # wide flat brim, and the crown is two lobes with a seam between.
        # A dome plus a narrow brim is a fedora, which is Watson's hat.
        crown(0.97, 0.88, -2.4)
        cv.rect(CX - 11, HEAD_CY - 2, CX + 11, HEAD_CY - 1, c, l=0.36)
        seam = shade(c.base, -0.30)
        for y in range(3, int(HEAD_CY) - 2):
            cv.dot(CX, y, seam)
        # tweed check, which is what stops the crown reading as a helmet
        for gy in range(4, int(HEAD_CY) - 2, 3):
            for gx in range(-7, 8, 3):
                cv.dot(CX + gx, gy, seam)
    elif hw == 'brim':                      # fedora / detective
        crown(0.92, 0.92, -1.6)
        cv.rect(CX - 11, HEAD_CY - 4, CX + 11, HEAD_CY - 3, c, l=0.42)
        cv.rect(CX - 7, HEAD_CY - 6, CX + 7, HEAD_CY - 6, trim, l=0.55)
    elif hw == 'top':
        cv.rect(CX - 6, 0, CX + 6, HEAD_CY - 6, c, l=0.5)
        cv.rect(CX - 6, HEAD_CY - 9, CX + 6, HEAD_CY - 8, trim, l=0.6)
        cv.rect(CX - 10, HEAD_CY - 5, CX + 10, HEAD_CY - 4, c, l=0.42)
    elif hw == 'point':                     # witch / wizard
        cv.tri([(CX, 0), (CX - 7, HEAD_CY - 5), (CX + 7, HEAD_CY - 5)], c, l=0.52)
        cv.rect(CX - 11, HEAD_CY - 5, CX + 11, HEAD_CY - 4, c, l=0.40)
        cv.rect(CX - 5, HEAD_CY - 7, CX + 5, HEAD_CY - 6, trim, l=0.62)
    elif hw == 'floppy':                    # a battered scarecrow hat
        # Pointed, but the point has GIVEN UP and flopped over, and the
        # brim waves. A clean cone is a wizard's hat, not a farm one.
        cv.tri([(CX + 1, 1), (CX - 7, HEAD_CY - 5), (CX + 7, HEAD_CY - 5)], c, l=0.52)
        cv.sphere(CX + 4, 1.5, 3.0, 2.0, c, spec=False)
        # A CONTINUOUS brim that waves. Alternating two pixel chunks
        # broke it into scattered bits of straw with gaps between them.
        for dx in range(-11, 12):
            dy = HEAD_CY - 4 + (0 if (dx + 12) % 6 < 3 else 1)
            cv.rect(CX + dx, dy, CX + dx, dy + 1, c, l=0.42)
        cv.rect(CX - 6, HEAD_CY - 7, CX + 6, HEAD_CY - 6, trim, l=0.6)
    elif hw == 'straw':
        crown(0.86, 0.80, -2.2)
        cv.rect(CX - 11, HEAD_CY - 4, CX + 11, HEAD_CY - 3, c, l=0.46)
    elif hw == 'santa':
        cv.tri([(CX + 6, 1), (CX - 8, HEAD_CY - 4), (CX + 8, HEAD_CY - 4)], c, l=0.55)
        cv.rect(CX - 10, HEAD_CY - 4, CX + 10, HEAD_CY - 2, trim, l=0.66)
        cv.sphere(CX + 7, 2.0, 2.8, 2.6, trim)
    elif hw == 'crown':
        for dx in (-7, -3.5, 0, 3.5, 7):
            cv.tri([(CX + dx, HEAD_CY - 12), (CX + dx - 2, HEAD_CY - 6),
                    (CX + dx + 2, HEAD_CY - 6)], c, l=0.62)
        cv.rect(CX - 8, HEAD_CY - 7, CX + 8, HEAD_CY - 5, c, l=0.5)
    elif hw == 'tricorn':
        crown(0.88, 0.84, -2.0)
        cv.tri([(CX - 11, HEAD_CY - 3), (CX, HEAD_CY - 8), (CX + 11, HEAD_CY - 3)], c, l=0.46)
        cv.rect(CX - 11, HEAD_CY - 4, CX + 11, HEAD_CY - 3, c, l=0.4)
    elif hw == 'helm':                      # flat top, Frankenstein
        cv.rect(CX - 8, HEAD_CY - 10, CX + 8, HEAD_CY - 5, c, l=0.42)


def extras(cv, spec, pose):
    """Per character flourishes that sit on top of everything."""
    for e in spec.get('extra', []):
        kind = e[0]
        if kind == 'pipe':
            for x in range(int(CX) + 4, int(CX) + 8):
                cv.dot(x, HEAD_CY + 7, (46, 34, 26))
            cv.dot(int(CX) + 8, HEAD_CY + 6, (196, 112, 40))
        elif kind == 'horns':
            c = hex2rgb(e[1])
            for sx in (-7, 7):
                for i in range(4):
                    cv.dot(CX + sx + (1 if sx > 0 else -1) * (i // 2), 4 - i, shade(c, 0.1 * i))
        elif kind == 'ears':                # cat / animal ears, POINTED
            r = Ramp(e[1])
            # Upright triangles. The old pair splayed outward and down,
            # which is a bat, not a cat.
            cv.tri([(CX - 7, 0), (CX - 10, 8), (CX - 3, 7)], r, l=0.6)
            cv.tri([(CX + 7, 0), (CX + 10, 8), (CX + 3, 7)], r, l=0.5)
        elif kind == 'roundears':           # bear ears: semicircles
            r = Ramp(e[1])
            for side in (-1, 1):
                cv.sphere(CX + side * 7.5, 5.0, 3.4, 3.4, r, spec=False)
        elif kind == 'wings':
            # A pair of shaped wings, big lobe over small, with veins.
            # Two plain ovals read as balloons tied to her shoulders.
            r = Ramp(e[1])
            vein = Ramp(shade(r.base, -0.22))
            for side in (-1, 1):
                bx = CX + side * 10
                cv.sphere(bx + side * 1.5, 21.5, 4.6, 5.6, r, spec=False)
                cv.sphere(bx + side * 0.5, 28.5, 3.4, 4.0, r, spec=False)
                for i in range(4):
                    cv.dot(bx + side * (1 + i * 1.1), 20 + i * 1.3, vein.mid)
                    cv.dot(bx + side * (0.5 + i * 0.9), 27 + i * 0.9, vein.mid)
        elif kind == 'cape':
            r = Ramp(e[1])
            cv.taper(22, 36, 22, 26, r, folds=3)
        elif kind == 'monocle':
            cv.dot(CX + 5, HEAD_CY - 1, (240, 226, 150))
            cv.dot(CX + 3, HEAD_CY - 1, (240, 226, 150))
            cv.dot(CX + 4, HEAD_CY - 2, (240, 226, 150))
            cv.dot(CX + 4, HEAD_CY + 1, (240, 226, 150))
        elif kind == 'patch':               # eye patch
            # An oval over ONE eye on a thin strap. The old version was
            # an eight by four slab that blacked out half his face.
            blk = Ramp('#141018')
            cv.sphere(CX - 3.5, HEAD_CY, 3.0, 2.6, blk, spec=False)
            for x in range(int(CX) - 8, int(CX) + 9):
                cv.dot(x, HEAD_CY - 3 + (0 if x < CX else 1), blk.lit)
        elif kind == 'bolt':
            for sx in (-10, 10):
                cv.dot(CX + sx, HEAD_CY + 3, (206, 170, 92))
                cv.dot(CX + sx, HEAD_CY + 4, (150, 118, 56))
        elif kind == 'breath':
            # A plume blown UPWARD past his own face. On the crown it
            # just read as orange hair on a fire eater who was not
            # breathing anything.
            hot = Ramp(e[1])
            core = Ramp('#f8e07a')
            # It leaves the MOUTH. Rooted at the head's edge it was a
            # column of fire standing next to a man, which is a torch.
            for i, (dx, dy, r_) in enumerate(
                    ((5.0, 19, 1.5), (7.5, 17, 2.2), (10.0, 13, 3.0),
                     (12.0, 8, 3.2), (12.5, 3, 2.2), (12.0, 0, 1.3))):
                cv.sphere(CX + dx, dy, r_, r_ * 1.15, hot, spec=True)
                if i >= 1:
                    cv.sphere(CX + dx, dy, r_ * 0.45, r_ * 0.6, core, spec=True)
        elif kind == 'flame':
            r = Ramp(e[1])
            # Rooted on the crown. Floating clear of the skull made it read
            # as a separate object hovering over the character's head.
            crown_y = HEAD_CY - HEAD_RY
            for dx, dy, rr in ((0, -1.6, 3.6), (-3.4, 1.0, 2.6), (3.4, 0.6, 2.8)):
                cv.sphere(CX + dx, crown_y + dy, rr, rr * 1.25, r, spec=True)
        elif kind == 'shell':               # egg body highlight
            pass
        elif kind == 'bandage':
            r = Ramp(e[1])
            # A turned up trench collar under the wraps, the other half
            # of the look: bandages plus a coat he is hiding inside.
            coat = Ramp(shade(spec.get('shirt', '#4a4a5a'), -0.3))
            cv.taper(21, 27, 20, 21, coat)
            for i in range(4):
                cv.dot(CX - 5 - i * 0.5, 22 + i, coat.lit)
                cv.dot(CX + 5 + i * 0.5, 22 + i, coat.lit)
            # Wrapped ON the head, so each turn is clipped to the skull's
            # width at that row. Flat full width bars turned the head into
            # a rectangular bucket with no shape under the wrapping.
            #
            # And drawn with rect, not cyl: a cylinder one row tall gets
            # its shading from a normal that points sideways everywhere, so
            # every band came out dark at both ends and the head read as
            # corrugated metal.
            # Only from the brow down. Wrapping the whole skull painted
            # over the character's own hat, which is drawn first, and the
            # head came out as a banded bucket with no hat on it at all.
            for i, yy in enumerate(range(int(HEAD_CY) - 2, int(HEAD_CY) + 9, 2)):
                half = head_edge(yy, floor=0.34) - (0.8 if i % 2 else 0)
                cv.rect(CX - half, yy, CX + half, yy, r, l=0.66 if i % 2 else 0.52)


# ----------------------------------------------------------- archetypes
def legs(cv, pants, boot, pose, top=31, bot=38, spread=3):
    """Three pose variants drive the run cycle."""
    la, ra = LEG_OFF.get(pose, (0, 0))
    cv.cyl(CX - spread - 3, top + max(0, la), CX - spread, bot + la, pants)
    cv.cyl(CX + spread, top + max(0, ra), CX + spread + 3, bot + ra, pants)
    cv.cyl(CX - spread - 3, bot - 1 + la, CX - spread, bot + la, boot)
    cv.cyl(CX + spread, bot - 1 + ra, CX + spread + 3, bot + ra, boot)


# THE POSES, AS OFFSETS. Every limb in every archetype is a cylinder at a
# fixed x, so a pose is a vertical offset per arm and per leg: the run cycle
# pumps them in opposition, the windup throws the pitching arm straight up
# beside the head and lifts the stride leg, the release drives that arm
# down and forward over a planted front leg, and the swing (seen from
# behind) carries both arms up and through. The pitcher was drawn with the
# idle frame all game before these existed: drawField asked for windup and
# release and nothing answered.
#
# Arm offsets are given at the human amplitude (2 px per run beat); an
# archetype with shorter arms asks for amp=1 and gets the same shape at
# half the swing. The windup and release keep their full reach at any amp,
# because a raised arm that is only raised a pixel is not a raised arm.
ARM_OFF = {
    'run1':    (-2, 2),
    'run2':    (2, -2),
    'windup':  (1, -7),
    'release': (-2, 3),
    'swing':   (-5, -5),
}
LEG_OFF = {
    'run1':    (-1, 1),
    'run2':    (1, -1),
    'windup':  (-3, 0),
    'release': (1, -1),
    'swing':   (0, 0),
}


def arm_off(pose, amp=2):
    """(left, right) vertical offset for the arms in this pose."""
    lo, ro = ARM_OFF.get(pose, (0, 0))
    if pose in ('run1', 'run2'):
        return lo * amp // 2, ro * amp // 2
    return lo, ro


def run_off(pose):
    """The vertical swing the pose gives each arm, as (left, right).

    Anything HELD has to ride it. A magnifying glass, a fishing pole or
    a wand pinned to fixed coordinates hangs in the air beside a runner
    whose arms are pumping, which reads as a bug rather than as a prop."""
    return arm_off(pose, 2)


def arms(cv, sleeve, skin, pose, top=24, length=7, out=0):
    lo, ro = run_off(pose)
    # Same reason as the hulk's arms: a sleeve in the shirt's own ramp
    # melts into the shirt. One shade off is all it takes to read.
    cuff = Ramp(shade(sleeve.base, -0.16))
    for side, off in ((-1, lo), (1, ro)):
        x0 = CX + side * (9 + out) - 1
        cv.cyl(x0, top + off, x0 + 2, top + length + off, cuff, round_bot=1)
        cv.cyl(x0, top + length + off, x0 + 2, top + length + 2 + off, skin, round_bot=1)


def arch_human(cv, spec, pose):
    skin = Ramp(spec.get('skin', '#f0c088'))
    shirt = Ramp(spec.get('shirt', '#c93030'))
    pants = Ramp(spec.get('pants', '#2a3550'))
    boot = Ramp(spec.get('boot', '#2a2018'))
    legs(cv, pants, boot, pose, top=30)
    if not spec.get('noarms'):
        arms(cv, shirt, skin, pose)
    cv.cyl(CX - TORSO_HW, 23, CX + TORSO_HW, 30, shirt, round_bot=1)
    if spec.get('belt'):
        cv.rect(CX - TORSO_HW, 28, CX + TORSO_HW, 29, Ramp(spec['belt']), l=0.45)
    cv.sphere(CX, HEAD_CY, HEAD_RX, HEAD_RY, skin)


def arch_hulk(cv, spec, pose):
    """Heavy, wide, long arms: Kong, Franky, Cyclops, Sasquatch, Yeti."""
    body = Ramp(spec.get('shirt', spec.get('skin', '#3f2716')))
    skin = Ramp(spec.get('skin', '#a87b4c'))
    boot = Ramp(spec.get('boot', '#241608'))
    hand = Ramp(spec.get('hand', shade(body.base, -0.3)))
    pants = Ramp(spec['pants']) if spec.get('pants') else body
    cv.sphere(CX, 27.0, 9.2, 7.4, body, spec=False)
    legs(cv, pants, boot, pose, top=32, bot=38, spread=3)
    lo, ro = arm_off(pose, 2)
    # The arms take their OWN ramp, a shade off the body. Drawn in the
    # body's ramp they share an owner, outline() skips the seam, and the
    # whole figure reads as one blob with no limbs in it.
    arm = Ramp(shade(body.base, -0.20))
    for side, off in ((-1, lo), (1, ro)):
        sx = CX + side * 8
        cv.ball(sx, 23.0 + off, 4.6, 4.2, arm, spec=False)
        cv.cyl(sx - 2, 23 + off, sx + 2, 33 + off, arm, round_bot=2)
        cv.ball(sx, 33.5 + off, 3.0, 2.8, hand, spec=False)
    if spec.get('chest'):
        cv.sphere(CX, 27.5, 5.4, 4.2, Ramp(spec['chest']), spec=False)
    # The head is SKIN, not body: for every ape and monster so far the two
    # were the same color, but Frankenstein wears a jacket, and a jacket
    # colored head is not a look anyone asked for.
    cv.sphere(CX, 12.5, 9.8, 8.8, skin)
    if spec.get('muzzle'):
        cv.sphere(CX, 16.2, 6.2, 4.0, Ramp(spec['muzzle']))


def arch_round(cv, spec, pose):
    """A body that is mostly one big sphere: Pooh, Humpty, Bunny."""
    body = Ramp(spec.get('shirt', '#f4c25a'))
    skin = Ramp(spec.get('skin', body.base))
    boot = Ramp(spec.get('boot', '#2a2018'))
    cv.ball(CX, 28.0, 9.6, 8.6, body)
    legs(cv, body, boot, pose, top=33, bot=38, spread=3)
    lo, ro = arm_off(pose, 1)
    for side, off in ((-1, lo), (1, ro)):
        cv.cyl(CX + side * 10 - 1, 24 + off, CX + side * 10 + 1, 31 + off, body, round_bot=1)
    cv.sphere(CX, HEAD_CY + 1, HEAD_RX * 0.94, HEAD_RY * 0.94, skin)


def arch_egg(cv, spec, pose):
    """One continuous egg: head and body are the same form."""
    body = Ramp(spec.get('skin', '#f2e2c4'))
    boot = Ramp(spec.get('boot', '#3a2818'))
    band = spec.get('shirt')
    cv.sphere(CX, 16.0, 10.0, 13.0, body)
    if band:
        cv.rect(CX - 9, 22, CX + 9, 24, Ramp(band), l=0.5)
    lo, ro = arm_off(pose, 1)
    for side, off in ((-1, lo), (1, ro)):
        cv.cyl(CX + side * 4 - 1, 29 + off, CX + side * 4 + 1, 37 + off, body)
        cv.cyl(CX + side * 4 - 1, 37 + off, CX + side * 4 + 1, 38 + off, boot)


def arch_robed(cv, spec, pose):
    """A figure in a floor length robe: Liberty, Father Time, Witch."""
    robe = Ramp(spec.get('shirt', '#6db8a2'))
    skin = Ramp(spec.get('skin', '#f0c088'))
    cv.taper(21, 38, 12, 24, robe, folds=spec.get('folds', 3))
    lo, ro = arm_off(pose, 1)
    for side, off in ((-1, lo), (1, ro)):
        cv.cyl(CX + side * 8 - 1, 23 + off, CX + side * 8 + 1, 30 + off, robe, round_bot=1)
        cv.cyl(CX + side * 8 - 1, 30 + off, CX + side * 8 + 1, 32 + off, skin, round_bot=1)
    cv.sphere(CX, HEAD_CY, HEAD_RX * 0.94, HEAD_RY * 0.94, skin)


def arch_beast(cv, spec, pose):
    """Four legged or low slung: dog, chupacabra, nessie, dragon.

    BUILD matters more than color here. Two quadrupeds sharing one body
    plan read as the same animal painted twice, which is exactly what
    the rabid dog and the chupacabra were. 'stocky' is a barrel chested
    dog low to the ground; 'lean' is a long legged, narrow, hungry
    thing."""
    body = Ramp(spec.get('skin', '#5a3a20'))
    boot = Ramp(spec.get('boot', shade(body.base, -0.4)))
    build = spec.get('build', 'stocky')
    # The body used to sit so low that only two rows of leg showed under
    # it, which is why both quadrupeds read as a barrel on castors. It
    # rides higher now and the legs get six to nine rows to be legs in.
    if build == 'lean':
        bw, bh, bcy, legtop, hy, hr = 8.2, 4.4, 24.5, 27, 12.5, 6.8
        hindx, frontx, thigh = (-7, -2), (2, 7), 3.6
    else:
        bw, bh, bcy, legtop, hy, hr = 11.0, 6.2, 26.5, 29, 14.0, 7.8
        hindx, frontx, thigh = (-8, -3), (2, 7), 4.6
    cv.sphere(CX, bcy, bw, bh, body, spec=False)
    off = 1 if pose == 'run1' else (-1 if pose == 'run2' else 0)
    # FRONT and HIND legs are not the same leg. Four identical posts under
    # a barrel is a table, and it is what made the rabid dog and the
    # chupacabra read as one animal painted twice however their bodies
    # differed. A front leg is a straight column off a shoulder; a hind
    # leg is a thigh, then a shank angled FORWARD off the hock, then a
    # foot that lands ahead of where the thigh started.
    for lx in frontx:
        o = -off
        cv.sphere(CX + lx, legtop + o, 2.6, 2.4, body, spec=False)
        cv.cyl(CX + lx - 1, legtop + o, CX + lx + 1, 36 + o, body)
        cv.cyl(CX + lx - 1, 36 + o, CX + lx + 2, 37 + o, boot)
    for lx in hindx:
        o = off
        hock = legtop + 3
        cv.sphere(CX + lx, legtop - 1 + o, thigh, thigh * 0.86, body, spec=False)
        cv.cyl(CX + lx - 1, legtop + o, CX + lx + 1, hock + o, body)
        cv.cyl(CX + lx, hock + o, CX + lx + 2, 36 + o, body)
        cv.cyl(CX + lx, 36 + o, CX + lx + 3, 37 + o, boot)
    # neck, then a forward facing head centred over the body
    if build == 'lean':
        cv.cyl(CX - 2, 16, CX + 2, 25, body, round_top=1)
    else:
        cv.cyl(CX - 2, 19, CX + 2, 26, body, round_top=1)
    cv.sphere(CX, hy, hr, hr * 1.08, body)
    if spec.get('muzzle'):
        # The muzzle needs its own value, not just its own hue. Drawn in a
        # near neighbour of the body color, the only thing that showed was
        # the sphere's rim shading, which read as a dark V scored into the
        # face rather than as a snout.
        m = Ramp(shade(spec['muzzle'], 0.18))
        my = hy + 5.6
        cv.sphere(CX, my, 5.2 if build != 'lean' else 4.4, 3.8, m)
        # The seam where the muzzle meets the head is a straight bar two
        # rows deep across the top of the snout. A round bead below it
        # left the bar reading as a visor; a wedge sitting ON it reads as
        # the nose it is.
        nose = shade(spec['muzzle'], -0.62)
        ny = int(my) - 2
        for i, w in enumerate((2, 1, 0)):
            for dx in range(-w, w + 1):
                cv.dot(CX + dx, ny + i, nose)


def arch_centaur(cv, spec, pose):
    """Half human, half horse. The beast archetype alone is a quadruped
    with an animal head, which is a pony, not a centaur."""
    horse = Ramp(spec.get('pants', '#8b6a3a'))
    skin = Ramp(spec.get('skin', '#e8b888'))
    boot = Ramp(spec.get('boot', shade(horse.base, -0.4)))
    tail = Ramp('#3a2412')
    for dx, dy in ((10.5, 26), (12, 28), (12.5, 31), (12, 34)):
        cv.sphere(CX + dx, dy, 1.3, 1.7, tail, spec=False)
    cv.sphere(CX, 28.0, 10.4, 6.0, horse, spec=False)
    off = 1 if pose == 'run1' else (-1 if pose == 'run2' else 0)
    for lx in (-8, -3, 3, 8):
        o = off if lx < 0 else -off
        cv.cyl(CX + lx - 1, 30 + o, CX + lx + 1, 37 + o, horse)
        cv.cyl(CX + lx - 1, 36 + o, CX + lx + 1, 37 + o, boot)
    # the human half, rising from the horse's shoulders, in a tunic
    cv.cyl(CX - 4, 15, CX + 4, 24, skin, round_top=2)
    # A tunic that FOLLOWS the torso and flares at the waist. A straight
    # box across his chest read as a signboard hung round his neck.
    tunic = Ramp(spec.get('tunic', '#8a4a3a'))
    cv.taper(19, 26, 7, 12, tunic, folds=2)
    cv.rect(CX - 3, 18, CX + 3, 18, Ramp(shade(tunic.base, 0.2)), l=0.6)
    lo, ro = arm_off(pose, 1)
    for side, o in ((-1, lo), (1, ro)):
        cv.cyl(CX + side * 6 - 1, 17 + o, CX + side * 6 + 1, 23 + o, skin, round_bot=1)
    cv.sphere(CX, 9.5, 6.8, 7.4, skin)
    cv.sphere(CX, 7.6, 6.4, 4.6, Ramp('#5a3a1c'), ymax=7)   # hair


def arch_nessie(cv, spec, pose):
    """The Loch Ness silhouette: humps low in the water and a long neck
    rising to a small head. She was drawn thin and small inside the frame,
    so she read as a lizard on a stick; the neck is the widest thing about
    her after the body and it has to be built like a neck, tapering."""
    body = Ramp(spec.get('skin', '#2a7a5a'))
    lite = Ramp(spec.get('muzzle') or '#4aa878')
    off = 1 if pose == 'run1' else (-1 if pose == 'run2' else 0)
    # the tail, curling up and away behind the second hump
    for i, (dx, dy, r) in enumerate(((10, 32, 3.0), (13, 30, 2.4),
                                     (14, 27, 1.8), (14, 24, 1.3))):
        cv.sphere(CX + dx, dy + (off if i > 1 else 0), r, r * 0.9, body,
                  spec=False)
    cv.sphere(CX + 7.5, 31.0, 5.0, 3.4, body, spec=False)   # second hump
    cv.sphere(CX - 2.0, 30.5, 9.8, 5.8, body, spec=False)   # main hump
    for side, o in ((-1, off), (1, -off)):                  # flippers
        cv.sphere(CX + side * 6, 35.5 + o, 3.4, 2.2, body, spec=False)
    # THE NECK, tapering in three stages and leaning as it rises, so it
    # reads as a curve of muscle rather than a pipe stuck in a hump
    cv.cyl(CX - 5, 20, CX + 2, 31, body)
    cv.cyl(CX - 3, 12, CX + 3, 22, body)
    cv.cyl(CX, 6, CX + 5, 14, body, round_top=2)
    cv.sphere(CX + 3.4, 6.0, 5.2, 4.6, body)                # the head
    cv.sphere(CX + 4.6, 8.4, 3.4, 2.0, lite)                # the muzzle
    # her face lives here: the head is off centre, so face() cannot
    for sx in (-2, 2):
        x = int(CX + 3 + sx)
        cv.dot(x - 1, 4, (250, 250, 252))
        cv.dot(x, 4, (250, 250, 252))
        cv.dot(x - 1, 5, (250, 250, 252))
        cv.dot(x, 5, (24, 20, 30))
    for dx in (2, 4, 6):                                    # a small smile
        cv.dot(CX + dx, 10, shade(lite.base, -0.45))
    cv.dot(CX + 3, 11, shade(lite.base, -0.45))
    cv.dot(CX + 5, 11, shade(lite.base, -0.45))
    # a run of lighter scutes down the neck and over the humps
    for dx, dy in ((0, 14), (-2, 19), (-4, 24), (-6, 29), (1, 31), (8, 30)):
        cv.dot(CX + dx, dy, lite.mid)
        cv.dot(CX + dx + 1, dy, lite.lit)


def arch_dragon(cv, spec, pose):
    """A chunky dragon SITTING: lighter belly, a wing nub, and the thick
    tail curling up beside him."""
    body = Ramp(spec.get('skin', '#2e8a3a'))
    belly = Ramp(spec.get('muzzle') or '#8fd06a')
    for dx, dy, r_ in ((8, 34, 2.6), (11, 32, 2.4), (13, 29, 2.2),
                       (13.5, 25.5, 1.8), (12.5, 22.5, 1.4)):
        cv.sphere(CX + dx, dy, r_, r_, body, spec=False)     # the tail curl
    cv.sphere(CX + 12.5, 21.0, 1.0, 1.0, belly, spec=False)  # tail tip
    off = 1 if pose == 'run1' else (-1 if pose == 'run2' else 0)
    for side, o in ((-1, off), (1, -off)):
        cv.cyl(CX + side * 5 - 1, 32 + o, CX + side * 5 + 1, 38 + o, body, round_bot=1)
    cv.sphere(CX - 1, 27.5, 9.0, 7.6, body, spec=False)      # sitting body
    cv.sphere(CX - 2, 28.5, 5.4, 6.0, belly, spec=False)     # the belly
    wing = Ramp(shade(body.base, -0.15))
    cv.tri([(CX - 13, 14), (CX - 5, 22), (CX - 13, 26)], wing, l=0.55)
    # belly ridge lines
    ridge = Ramp(shade(belly.base, -0.14))
    for yy in (26, 28, 30):
        t = (yy - 28.5) / 6.0
        halfw = 5.4 * math.sqrt(max(0.0, 1 - t * t)) - 0.8
        if halfw > 1:
            cv.rect(CX - 2 - halfw, yy, CX - 2 + halfw, yy, ridge, l=0.5)
    cv.sphere(CX, 12.0, 8.2, 7.2, body)                      # broad head
    cv.sphere(CX, 15.8, 5.6, 3.2, belly)                     # big muzzle
    cv.dot(CX - 2, 15, shade(body.base, -0.4))               # nostrils
    cv.dot(CX + 2, 15, shade(body.base, -0.4))
    cv.dot(CX - 3, 17, (245, 243, 240))                      # little fangs
    cv.dot(CX + 3, 17, (245, 243, 240))


def arch_cat(cv, spec, pose):
    body = Ramp(spec.get('skin', '#141018'))
    belly = Ramp(spec.get('chest', '#eaeaea'))
    cv.ball(CX, 27.0, 8.0, 9.4, body, spec=False)
    cv.ball(CX, 28.0, 4.4, 5.4, belly, spec=False)
    legs(cv, body, body, pose, top=33, bot=38, spread=3)
    cv.sphere(CX, 13.0, 9.4, 8.2, body, spec=False)
    # A cat drawn in near black loses its whole face. Give it a lighter
    # muzzle so the eyes, nose and whiskers have something to sit on.
    # muzzle=None (the back view) suppresses the whole face group.
    if spec.get('muzzle', belly.base) is not None:
        muz = Ramp(spec.get('muzzle', belly.base))
        cv.sphere(CX, 16.4, 5.6, 3.6, muz, spec=False)
        cv.dot(CX, 15, shade(muz.base, -0.45))
        cv.dot(CX - 1, 15, shade(muz.base, -0.30))
        for wx in (-5, -4, 4, 5):
            cv.dot(CX + wx, 17, shade(muz.base, -0.35))


def arch_bird(cv, spec, pose):
    body = Ramp(spec.get('skin', '#e04520'))
    wing = Ramp(spec.get('chest', '#f4922a'))
    cv.ball(CX, 25.0, 8.6, 9.4, body)
    off = 2 if pose == 'run1' else (-2 if pose == 'run2' else 0)
    if not spec.get('nowings'):
        for side in (-1, 1):
            cv.sphere(CX + side * 10, 24 + side * off, 4.6, 7.4, wing, spec=False)
    cv.cyl(CX - 4, 31, CX - 2, 38, wing)
    cv.cyl(CX + 2, 31, CX + 4, 38, wing)
    cv.sphere(CX, 12.0, 8.4, 7.6, body)


ARCH = {
    'human': arch_human, 'hulk': arch_hulk, 'round': arch_round,
    'egg': arch_egg, 'robed': arch_robed, 'beast': arch_beast,
    'cat': arch_cat, 'bird': arch_bird, 'centaur': arch_centaur,
    'nessie': arch_nessie, 'dragon': arch_dragon,
}


def back_head(cv, spec):
    """The back of the head: hair covers the whole rear of the skull down
    to the collar, and there is no face. Characters with no hair (bald,
    or a nonhuman skull) just show the skull itself, which the archetype
    already drew."""
    h = spec.get('hair')
    if not h or spec.get('hairstyle') == 'bald':
        return
    r = Ramp(h)
    cv.sphere(CX, HEAD_CY - 0.4, HEAD_RX * 0.99, HEAD_RY * 0.96, r,
              spec=False, ymax=HEAD_CY + 6)
    kind = spec.get('hairstyle', 'short')
    if kind in ('long', 'braids'):
        sidelock(cv, r, -1, HEAD_CY - 2, HEAD_CY + 9, 2.4)
        sidelock(cv, r, 1, HEAD_CY - 2, HEAD_CY + 9, 2.4)


# Extras that are anchored to the face and make no sense from behind.
FRONT_ONLY_EXTRAS = {'pipe', 'monocle', 'patch'}


# ------------------------------------------------------- signatures
# The iconic thing about a character, drawn bespoke. The archetype
# system keeps fifty four figures consistent, but consistency is also
# how Popeye loses his forearms: canonical pixel art of these
# characters leads with the one feature everyone recognizes, so each
# entry here draws that feature over (or under, via 'pre') the shared
# body. Keyed by character key; 'pre' runs before the archetype (a
# cape hangs BEHIND the body), 'post' after everything but the
# outline. Both receive (cv, spec, body_pose, back).

def sig_kong(cv, spec, pose, back):
    body = Ramp(spec.get('skin', '#3f2716'))
    muz = Ramp(spec.get('muzzle', '#b0855a'))
    for side in (-1, 1):
        ex = CX + side * (HEAD_RX * 0.98)
        cv.sphere(ex, 9.5, 2.6, 2.8, body, spec=False)
        if not back:
            cv.sphere(ex, 9.5, 1.2, 1.4, muz, spec=False)
    if back:
        return
    # The muzzle takes over the whole lower face, the way the reference
    # ape's does, with the eyes perched right on its top edge and the
    # big happy grin across it.
    cv.sphere(CX, 17.2, 7.0, 4.8, muz)
    xC = int(CX)
    for side in (-1, 1):
        for dx in (1, 2, 3):
            for dy in (11, 12, 13):
                cv.dot(xC + side * dx, dy, (250, 250, 252))
    cv.dot(xC, 12, (250, 250, 252))
    for x in (xC - 1, xC + 1):
        cv.dot(x, 12, (36, 28, 40))
        cv.dot(x, 13, (36, 28, 40))
    cv.dot(CX - 2, 15, shade(muz.base, -0.4))
    cv.dot(CX + 2, 15, shade(muz.base, -0.4))
    dk = shade(body.base, -0.5)
    cv.dot(CX - 5, 16, dk)
    cv.dot(CX + 5, 16, dk)
    cv.dot(CX - 4, 17, dk)
    cv.dot(CX + 4, 17, dk)
    for x in range(int(CX) - 3, int(CX) + 4):
        cv.dot(x, 17, (245, 243, 240))
        cv.dot(x, 18, (245, 243, 240))
    cv.dot(CX - 1, 19, (170, 60, 58))
    cv.dot(CX, 19, (170, 60, 58))
    cv.dot(CX + 1, 19, (170, 60, 58))


def sig_franky(cv, spec, pose, back):
    skin = Ramp(spec.get('skin', '#7ea86a'))
    # The neck: he is famously a head bolted onto a body, so give him
    # one, with the bolts THROUGH IT rather than stuck to his skull.
    cv.cyl(CX - 4, 20, CX + 4, 23, skin)
    if not back:
        bolt = (196, 168, 92)
        for side in (-1, 1):
            cv.dot(CX + side * 5, 21, bolt)
            cv.dot(CX + side * 6, 21, shade(bolt, -0.25))
            cv.dot(CX + side * 5, 22, shade(bolt, -0.35))
        # the stitch scar across one cheek
        st = shade(skin.base, -0.5)
        for dy in (14, 15, 16, 17):
            cv.dot(CX - 7, dy, st)
        cv.dot(CX - 8, 15, st)
        cv.dot(CX - 6, 15, st)
        cv.dot(CX - 8, 17, st)
        cv.dot(CX - 6, 17, st)
        # suit lapels over a white shirt V
        coat = Ramp(shade(spec.get('shirt', '#3f2a1c'), -0.25))
        for i in range(4):
            cv.dot(CX - 2 - i, 24 + i, coat.mid)
            cv.dot(CX - 1 - i, 24 + i, coat.dark)
            cv.dot(CX + 2 + i, 24 + i, coat.mid)
            cv.dot(CX + 1 + i, 24 + i, coat.dark)
        for dy in (24, 25, 26):
            cv.dot(CX, dy, (232, 232, 234))
        cv.dot(CX, 27, (40, 40, 48))
    ink = Ramp('#181418')
    # flat topped black hair, squared past the skull's curve
    cv.rect(CX - 9, 3, CX + 9, 8, ink, l=0.5)
    cv.sphere(CX, HEAD_CY - 1.0, HEAD_RX, HEAD_RY * 0.98, ink, spec=False, ymax=8)
    # jagged fringe
    # The fringe is jagged but SHORT: hair that hangs into the eyes
    # turns a friendly monster into a menacing one.
    drops = (0, 1, 0, 1, 0, 0, 1, 0, 1, 0)
    for i, x in enumerate(range(int(CX) - 9, int(CX) + 10, 2)):
        for k in range(drops[i % 10] + 1):
            cv.dot(x, 9 + k, ink.mid)
            cv.dot(x + 1, 9 + k, ink.mid)
    if back:
        cv.sphere(CX, HEAD_CY, HEAD_RX * 0.99, HEAD_RY * 0.96, ink,
                  spec=False, ymax=HEAD_CY + 4)
        return


def sig_popeye(cv, spec, pose, back):
    skin = Ramp(spec.get('skin', '#f0c088'))
    lo, ro = arm_off(pose, 2)
    sleeve = Ramp(shade(spec.get('shirt', '#e9e9ea'), -0.16))
    for side, off in ((-1, lo), (1, ro)):
        ax = CX + side * 10.5
        # THE forearms. They have to GROW out of a normal upper arm, or
        # they read as two mittens floating beside him: short sleeve,
        # then the swell, then the fist.
        cv.cyl(CX + side * 8 - 1, 23 + off, CX + side * 8 + 1, 27 + off, sleeve, round_bot=1)
        cv.ball(ax, 29.5 + off, 3.8, 5.4, skin, spec=False)
        cv.ball(ax + side * 0.5, 34.5 + off, 2.8, 2.8,
                Ramp(shade(skin.base, -0.12)), spec=False)
    # THE JAW, which is the entire character. A skull ellipse tapers to
    # about four pixels wide by row 22; his does the opposite, so the
    # lantern chin is hung UNDER the face as its own mass, wider at row
    # 21 than the cheeks are. Same ramp as the skin so no seam cuts him
    # in half, and drawn before the collar so the collar sits in front.
    if not back:
        # THE JAW. A skull ellipse tapers to four pixels wide by row 22;
        # his does the opposite. Hung under the face as its own mass so
        # the silhouette goes SQUARE at the chin, which is the character.
        cv.sphere(CX, 19.5, 7.8, 4.4, skin, spec=False)
    # sailor collar, low enough that the chin clears it
    col = Ramp('#2a4a8a')
    cv.rect(CX - 5, 24, CX + 5, 25, col, l=0.55)
    if back:
        return
    dk = shade(skin.base, -0.55)
    mid = shade(skin.base, -0.32)
    lit = skin.lit
    # BOTH eyes are shut. He has one open eye in no drawing of him: the
    # squint IS the face. The lash slopes DOWN toward the nose, which is
    # what separates a squint from two flat bars ruled across a head.
    for side in (-1, 1):
        for dx in (4, 5, 6):
            cv.dot(CX + side * dx, 12, dk)
        cv.dot(CX + side * 3, 13, dk)
        cv.dot(CX + side * 7, 13, dk)
    # THE NOSE, and it has to be a bulb with a hard edge on it. Drawn as
    # lighter skin on lighter skin it vanished: at this size a feature
    # exists only if something dark closes it off.
    for dx in (-1, 0, 1):
        cv.dot(CX + dx, 14, lit)
    for dx in (-2, -1, 0, 1, 2):
        cv.dot(CX + dx, 15, lit)
        cv.dot(CX + dx, 16, skin.mid)
    cv.dot(CX - 2, 15, WHITEISH)
    for dx in (-1, 0, 1):
        cv.dot(CX + dx, 17, dk)
    for side in (-1, 1):
        cv.dot(CX + side * 2, 17, mid)
        cv.dot(CX + side * 3, 16, mid)
    # the laugh: wide open, top teeth showing, corners hooked up ABOVE
    # the lip line. A closed line here reads as a boxer, not a sailor.
    mdk = (72, 32, 28)
    cv.dot(CX - 5, 18, mdk)
    cv.dot(CX + 5, 18, mdk)
    for dx in range(-4, 5):
        cv.dot(CX + dx, 19, mdk)
    for dx in range(-3, 4):
        cv.dot(CX + dx, 20, (246, 244, 240))
    for dx in range(-2, 3):
        cv.dot(CX + dx, 21, (150, 52, 54))
    # two full rows of chin below it, which is the whole silhouette
    cv.dot(CX, 22, shade(skin.base, -0.16))
    for side in (-1, 1):
        cv.dot(CX + side * 5, 21, mid)
    # anchor tattoo on the right forearm
    ink = (60, 74, 108)
    cv.dot(CX + 10, 28, ink)
    cv.dot(CX + 10, 29, ink)
    cv.dot(CX + 9, 30, ink)
    cv.dot(CX + 10, 30, ink)
    cv.dot(CX + 11, 30, ink)
    # the corncob pipe, CLENCHED in the corner of the mouth and angled
    # up, which is where it lives. Beside the cheek it read as a stick
    # somebody was holding near him.
    wood = (168, 116, 48)
    cv.dot(CX + 6, 18, wood)
    cv.dot(CX + 7, 17, wood)
    cv.dot(CX + 8, 16, wood)
    cv.cyl(CX + 9, 12, CX + 10, 16, Ramp('#d9b45e'), spec=False)
    cv.dot(CX + 11, 10, (206, 210, 216))
    cv.dot(CX + 12, 8, (176, 182, 192))


def sig_cape_pre(cv, spec, pose, back):
    if back:
        return              # from behind the cape covers the body: see post
    cape = Ramp(spec.get('capecolor', '#1a1220'))
    cv.taper(20, 37, 14, 30, cape, folds=2)
    cv.rect(CX - 14, 36, CX + 14, 37, Ramp(spec.get('capehem', '#7a1620')), l=0.5)


def sig_cape_post(cv, spec, pose, back):
    cape = Ramp(spec.get('capecolor', '#1a1220'))
    if not back:
        # widow's peak: the hairline comes to a point on the forehead
        ink = Ramp(spec.get('hair', '#141018'))
        cv.dot(CX, 9, ink.mid)
        cv.dot(CX - 1, 8, ink.mid)
        cv.dot(CX, 8, ink.mid)
        cv.dot(CX + 1, 8, ink.mid)
    if back:
        cv.taper(18, 38, 16, 30, cape, folds=3)
        cv.rect(CX - 14, 37, CX + 14, 38, Ramp(spec.get('capehem', '#7a1620')), l=0.5)
    # The high collar frames the SHOULDERS. Drawn up to row 8 it rose
    # past his ears and read as two black horns on his head.
    cv.tri([(CX - 9, 25), (CX - 13, 16), (CX - 6, 22)], cape, l=0.5)
    cv.tri([(CX + 9, 25), (CX + 13, 16), (CX + 6, 22)], cape, l=0.4)


def sig_liberty(cv, spec, pose, back):
    skin = Ramp(spec.get('skin', '#6db8a2'))
    ax = CX + 9.5
    # The arm has to reach the SHOULDER. Starting at row 22 it floated
    # in the top corner with nothing holding it up.
    cv.cyl(ax - 1, 9, ax + 1, 25, skin, round_bot=1)
    cv.sphere(CX + 7, 24.5, 3.2, 3.0, skin, spec=False)   # the shoulder
    cv.rect(ax - 2.5, 7, ax + 2.5, 8, Ramp('#3f7f6d'), l=0.5)
    cv.sphere(ax, 3.4, 2.6, 3.4, Ramp('#f4b03a'), spec=True)  # the flame
    cv.dot(ax, 3, (255, 248, 225))
    # the tablet, held against her left side
    tab = Ramp('#b8a888')
    cv.rect(CX - 12, 25, CX - 8, 30, tab, l=0.6)
    cv.rect(CX - 12, 25, CX - 12, 30, Ramp('#8a7a5c'), l=0.4)


def sig_peter(cv, spec, pose, back):
    # the red feather in the cap
    r = Ramp('#c93030')
    cv.tri([(CX + 9, 1), (CX + 5, 7), (CX + 8, 7)], r, l=0.6)
    # THE LEAF HEM. A tunic of leaves ends in points, not a straight
    # line: a row of darker leaf tips hanging off the bottom of the shirt,
    # plus a lighter vein on the chest, so the green reads as foliage
    # rather than as a jersey.
    leaf = Ramp(shade(spec.get('shirt', '#7a9a3a'), -0.28))
    for i, dx in enumerate((-6, -3, 0, 3, 6)):
        tip = 32 if i % 2 else 31
        cv.tri([(CX + dx - 1.5, 29.5), (CX + dx + 1.5, 29.5), (CX + dx, tip)], leaf, l=0.5)
    if not back:
        vein = shade(spec.get('shirt', '#7a9a3a'), 0.3)
        for dy in range(24, 29):
            cv.dot(CX, dy, vein)
        cv.dot(CX - 1, 26, vein); cv.dot(CX + 1, 25, vein)


def sig_medusa(cv, spec, pose, back):
    # the hair is SNAKES: heads and flicked tongues on the wild locks
    head = Ramp('#3f8f4f')
    for dx, ty in ((-7.5, 4), (-3, 1), (2, 2), (7, 3)):
        hx, hy = CX + dx, ty
        cv.sphere(hx, hy, 1.5, 1.2, head, spec=False)
        cv.dot(hx - 1, hy, (240, 240, 244))
        cv.dot(hx + 1, hy, (240, 240, 244))
        cv.dot(hx, hy - 2, (201, 43, 43))


def sig_pooh(cv, spec, pose, back):
    gold = spec.get('skin', '#f4c25a')
    body = Ramp(gold)
    # EARS on the upper SIDES of the skull, small and round. Sat on top
    # they are Mickey's, and a bear with mouse ears is nobody.
    for side in (-1, 1):
        cv.sphere(CX + side * 7.6, 8.2, 3.4, 3.2, body, spec=False)
        if not back:
            cv.sphere(CX + side * 7.6, 8.4, 1.8, 1.7,
                      Ramp(shade(gold, -0.22)), spec=False)
    if back:
        return
    # the round belly, lighter, so a bear with no shirt still has a front
    cv.ball(CX, 30.0, 5.6, 5.2, Ramp(shade(gold, 0.16)), spec=False)
    # THE HONEY POT, hugged at his side: a little blue-grey crock with a
    # pale band and a drip of honey over the lip. It rides the arm.
    o = run_off(pose)[1]
    px, py = CX + 11, 30 + o
    pot = Ramp('#8fa4c4')
    cv.cyl(px - 2, py - 3, px + 2, py + 2, pot, round_bot=1)
    cv.rect(px - 2, py - 2, px + 2, py - 2, Ramp('#e8e4d8'), l=0.6)
    honey = (232, 170, 48)
    cv.dot(px - 1, py - 4, honey); cv.dot(px, py - 4, honey); cv.dot(px + 1, py - 4, honey)
    cv.dot(px + 1, py - 3, honey)
    # THE MUZZLE, which is the whole face. Pooh is a pale snout with a
    # black bead on the end of it and two dots above; drawn with the
    # roster's standard googly pair and a grin he was a yellow ball.
    cv.sphere(CX, 17.4, 5.6, 3.8, Ramp(shade(gold, 0.42)), spec=False)
    ink = (26, 20, 18)
    # the nose is a rounded WEDGE on the top of the snout, not a square
    for dx in (-1, 0, 1):
        cv.dot(CX + dx, 14, ink)
        cv.dot(CX + dx, 15, ink)
    for dx in (-2, 2):
        cv.dot(CX + dx, 14, ink)
    cv.dot(CX, 16, ink)
    cv.dot(CX - 1, 14, (96, 84, 78))        # one highlight, so it reads wet
    # eyes: two beads set CLOSE, just above and outside the nose. Wide
    # apart on a round head they read as a teddy bear rather than as him.
    for side in (-1, 1):
        x = int(CX + side * 4)
        for dy in (11, 12):
            cv.dot(x, dy, ink)
    # the philtrum line and the smile under it, which is how every Pooh
    # since Shepard has been drawn: nose, stroke down, small curve
    md = shade(gold, -0.55)
    cv.dot(CX, 17, md)
    cv.dot(CX, 18, md)
    for dx in (-1, 1):
        cv.dot(CX + dx, 19, md)
    for dx in (-2, 2):
        cv.dot(CX + dx, 18, md)


def sig_tom(cv, spec, pose, back):
    # denim overalls: bib, straps, brass buttons
    den = Ramp('#2a4a7a')
    cv.rect(CX - 4, 25, CX + 4, 30, den, l=0.55)
    for side in (-1, 1):
        cv.dot(CX + side * 4, 24, den.mid)
        cv.dot(CX + side * 5, 23, den.mid)
        if not back:
            cv.dot(CX + side * 3, 25, (201, 160, 48))
    # the fishing pole over his shoulder: one clean unbroken diagonal
    wood = (150, 96, 42)
    o = run_off(pose)[1]
    for i in range(13):
        cv.dot(CX + 5 + i * 0.62, 24 - i + o, wood if i % 3 else (122, 82, 40))
    for dy in (13, 14, 15, 16):
        cv.dot(CX + 14, dy + o, (206, 212, 220))


def sig_huck(cv, spec, pose, back):
    # one strap overalls and a patch: the other strap is long gone
    den = Ramp('#3a5a6a')
    cv.rect(CX - 4, 26, CX + 4, 30, den, l=0.5)
    cv.dot(CX - 4, 25, den.mid)
    cv.dot(CX - 5, 24, den.mid)
    cv.dot(CX - 5, 23, den.mid)
    if not back:
        cv.dot(CX - 3, 26, (201, 160, 48))
        cv.rect(CX + 2, 33, CX + 4, 34, Ramp('#7a5a2a'), l=0.5)


def sig_flash(cv, spec, pose, back):
    if back:
        return
    # the lightning bolt on his chest
    g = (248, 216, 74)
    cv.dot(CX, 24, g); cv.dot(CX - 1, 25, g)
    cv.dot(CX, 26, g); cv.dot(CX - 1, 27, g)
    cv.dot(CX, 25, g); cv.dot(CX - 1, 26, g)


def sig_hyde(cv, spec, pose, back):
    """Hyde is not Jekyll in a bad mood. He is SHORTER, WIDER and lower to
    the ground, and every drawing of him since 1886 says so with the
    shoulders. Drawn on the human frame with wild hair he was a tidy
    gentleman having a rough evening."""
    coat = Ramp(spec.get('shirt', '#2f2418'))
    lo, ro = run_off(pose)
    # the hunch: two mounds of shoulder standing PROUD of the neck, so
    # the head sits down between them instead of on top of a body
    for side, off in ((-1, lo), (1, ro)):
        cv.sphere(CX + side * 7.4, 23.5 + off * 0.5, 4.6, 3.4, coat, spec=False)
    cv.rect(CX - 5, 23, CX + 5, 24, Ramp(shade(coat.base, -0.28)), l=0.45)
    if back:
        return
    skin = Ramp(spec.get('skin', '#c8a878'))
    # A hulk's face runs rows 10 to 20 and no further: the body sphere
    # takes over at 20 and the shoulders above cover the rest. The snarl
    # went in at 18 to 21 and came out on his collarbone.
    hollow = shade(skin.base, -0.30)
    for dx in (-8, -7, 7, 8):
        cv.dot(CX + dx, 11, hollow)
        cv.dot(CX + dx, 12, hollow)
    # THE SNARL: uneven square teeth, which is the whole difference
    # between a monster and a man smiling
    lip = (52, 26, 22)
    for dx in range(-5, 6):
        cv.dot(CX + dx, 16, lip)
    for dx in range(-4, 5):
        cv.dot(CX + dx, 19, lip)
    for dx in range(-4, 5):
        cv.dot(CX + dx, 17, (34, 18, 16))
        cv.dot(CX + dx, 18, (34, 18, 16))
    for dx in (-4, -2, 0, 2, 4):
        cv.dot(CX + dx, 17, (238, 232, 216))
    for dx in (-3, 1, 3):
        cv.dot(CX + dx, 18, (214, 206, 188))
    for dx in (-5, 5):                      # the two that stick out
        cv.dot(CX + dx, 17, (238, 232, 216))
        cv.dot(CX + dx, 18, (214, 206, 188))
    # the coat is TORN: a ragged hem rather than a hem
    tear = shade(coat.base, -0.45)
    for dx in (-7, -4, -1, 2, 5):
        cv.dot(CX + dx, 32, tear)
        cv.dot(CX + dx + 1, 33, tear)


def sig_sherlock(cv, spec, pose, back):
    hat = Ramp(spec.get('hatcolor', '#8b6a3a'))
    # The deerstalker's EAR FLAPS, the thing that makes the silhouette
    # his. Without them it is any old fedora.
    for side in (-1, 1):
        cv.sphere(CX + side * 10.0, 7.6, 2.8, 3.6, hat, spec=False)
        cv.dot(CX + side * 10, 4, shade(hat.base, -0.30))
    # the Inverness cape over the shoulders, with a standing collar
    cape = Ramp(shade(spec.get('shirt', '#8b6a3a'), -0.22))
    cv.taper(22, 28, 19, 23, cape)
    cv.rect(CX - 6, 21, CX + 6, 22, Ramp(shade(cape.base, -0.24)), l=0.5)
    if back:
        return
    # the calabash pipe, curved down out of the corner of his mouth
    wood = (122, 82, 40)
    for dx, dy in ((-5, 19), (-6, 20), (-7, 21), (-7, 22)):
        cv.dot(CX + dx, dy, wood)
    cv.sphere(CX - 8.5, 23.5, 2.4, 2.0, Ramp('#8a5a28'), spec=False)
    # the magnifying glass, held UP beside his face where he would use it
    rim = (176, 142, 60)
    gx, gy = CX + 11, 19 + run_off(pose)[1]
    for dx, dy in ((-1, -3), (0, -3), (1, -3), (2, -2), (3, -1), (3, 0),
                   (2, 1), (1, 2), (0, 2), (-1, 2), (-2, 1), (-3, 0),
                   (-3, -1), (-2, -2)):
        cv.dot(gx + dx, gy + dy, rim)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            cv.dot(gx + dx, gy + dy, (188, 214, 232) if dx + dy else (214, 234, 246))
    for i in range(4):
        cv.dot(gx - 3 - i, gy + 3 + i, shade(rim, -0.3))


def sig_tracy(cv, spec, pose, back):
    coat = Ramp(shade(spec.get('shirt', '#f4c25a'), -0.22))
    cv.taper(22, 26, 17, 19, coat)      # the trench coat's collar
    if back:
        return
    # A white shirt V under the tie. The bare tie on the coat read as a
    # black hole punched in his chest.
    sh = Ramp('#eceff2')
    for i in range(4):
        cv.rect(CX - 3 + i * 0.4, 24 + i, CX + 3 - i * 0.4, 24 + i, sh, l=0.7)
    tie = Ramp('#1a1a20')
    cv.rect(CX - 1, 25, CX + 1, 29, tie, l=0.5)
    cv.dot(CX, 24, tie.mid)
    # lapels
    for i in range(4):
        cv.dot(CX - 4 - i * 0.5, 24 + i, coat.dark)
        cv.dot(CX + 4 + i * 0.5, 24 + i, coat.dark)


def sig_alice(cv, spec, pose, back):
    # the white pinafore apron over the blue dress, and the hairband
    ap = Ramp('#f2f2f4')
    cv.rect(CX - 3, 25, CX + 3, 30, ap, l=0.58)
    for side in (-1, 1):
        cv.dot(CX + side * 3, 24, ap.mid)
        cv.dot(CX + side * 4, 23, ap.mid)
    band = (20, 16, 24)
    for dx in range(-4, 5):
        cv.dot(CX + dx, 5 + (1 if abs(dx) > 2 else 0), band)


def sig_dorothy(cv, spec, pose, back):
    # bows on the braids; gingham check on the dress
    bow = (201, 48, 48)
    for side in (-1, 1):
        bx = CX + side * 8
        cv.dot(bx, 12, bow); cv.dot(bx + side, 12, bow)
        cv.dot(bx, 13, bow); cv.dot(bx + side, 11, bow)
    if back:
        return
    chk = (207, 228, 242)
    for yy in (25, 27, 29):
        for xx in (-4, -2, 0, 2, 4):
            off = 1 if yy == 27 else 0
            cv.dot(CX + xx + off, yy, chk)


def sig_scarecrow(cv, spec, pose, back):
    # A scarecrow is straw wearing clothes: the tunic flares and ends in
    # a jagged straw fringe, straw pokes out at the collar and wrists,
    # and the mouth is STITCHED on.
    st = (232, 194, 90)
    tunic = Ramp(spec.get('shirt', '#7a3812'))
    cv.taper(24, 31, 13, 19, tunic, folds=2)
    for i, dx in enumerate(range(-9, 10, 2)):
        drop = (0, 2, 1, 2, 0, 2, 1, 2, 0, 1)[i % 10]
        for k in range(drop + 1):
            cv.dot(CX + dx, 31 + k, st)
            cv.dot(CX + dx + 1, 31 + k, tunic.dark)
    for dx in (-4, -2, 0, 2, 4):
        cv.dot(CX + dx, 22 + (dx % 2 == 0), st)
    for side in (-1, 1):
        wx = CX + side * 10
        cv.dot(wx, 33, st)
        cv.dot(wx - side, 34, st)
        cv.dot(wx + side, 34, st)
    if back:
        return
    # the stitched smile
    mc = shade(hex2rgb(spec.get('skin', '#eecc78')), -0.5)
    for dx in (-2, -1, 0, 1, 2):
        cv.dot(CX + dx, 18, mc)
    for dx in (-2, 0, 2):
        cv.dot(CX + dx, 17, mc)
        cv.dot(CX + dx, 19, mc)


def sig_witch(cv, spec, pose, back):
    # She is all hat and NOSE. The brim grows past the standard point
    # hat, the tip flops over, and the long green nose hooks down over
    # a two toothed grimace.
    hatc = Ramp(spec.get('hatcolor', '#141020'))
    for side in (-1, 1):
        for dx in (12, 13):
            cv.dot(CX + side * dx, HEAD_CY - 5, hatc.mid)
        cv.dot(CX + side * 12, HEAD_CY - 4, hatc.dark)
    cv.dot(CX + 1, 0, hatc.mid); cv.dot(CX + 2, 0, hatc.mid)
    cv.dot(CX + 3, 1, hatc.mid)
    if back:
        return
    skin = Ramp(spec.get('skin', '#7ea86a'))
    # The nose has to PROTRUDE: lit on top, shadowed underneath, and a
    # tip that hangs over the mouth. Painted flat in the face's own
    # color it simply vanished.
    nd = shade(skin.base, -0.45)
    cv.dot(CX - 1, 13, skin.spec)
    cv.dot(CX, 13, skin.lit)
    cv.dot(CX - 1, 14, skin.lit)
    cv.dot(CX, 14, skin.mid)
    cv.dot(CX + 1, 14, nd)
    cv.dot(CX - 1, 15, skin.mid)
    cv.dot(CX, 15, skin.mid)
    cv.dot(CX + 1, 15, nd)
    cv.dot(CX, 16, skin.mid)
    cv.dot(CX + 1, 16, nd)
    cv.dot(CX, 17, nd)
    mc = shade(skin.base, -0.5)
    for dx in (-2, -1, 0, 1, 2):
        cv.dot(CX + dx, 18, mc)
    cv.dot(CX - 1, 19, (245, 243, 240))
    cv.dot(CX + 1, 19, (245, 243, 240))


def sig_zombie(cv, spec, pose, back):
    # THE LURCH: both arms straight out, one higher than the other,
    # over a torn white tee and ragged cuffs.
    skin = Ramp(spec.get('skin', '#8aae64'))
    shirt = Ramp(spec.get('shirt', '#e8e8e6'))
    lo, ro = arm_off(pose, 1)
    for side, o in ((-1, 24 + lo), (1, 26 + ro)):
        sx = side if side > 0 else side
        x0 = CX + side * 6
        x1 = CX + side * 13
        lo2, hi = sorted((x0, x1))
        cv.rect(lo2, o, hi, o + 1, shirt, l=0.6)
        cv.rect(CX + side * 12, o, CX + side * 13, o + 1, skin, l=0.55)
        cv.dot(CX + side * 14, o, skin.mid)
    # torn shirt hem
    for dx in (-5, -3, -1, 1, 3, 5):
        cv.dot(CX + dx, 31, shirt.mid)
        cv.dot(CX + dx, 32, shirt.dark)
    # ragged pant cuffs
    for side in (-1, 1):
        cv.dot(CX + side * 4, 36, skin.mid)


def sig_werewolf(cv, spec, pose, back):
    # A real SNOUT with a toothy grin, tall pointed ears, fur tufts on
    # the shoulders, and the bushy tail.
    fur = Ramp(spec.get('skin', '#4a3524'))
    for side in (-1, 1):
        ex = CX + side * 6
        cv.tri([(ex, 1), (ex - 2, 6), (ex + 2, 6)], fur, l=0.5)
        if not back:
            cv.dot(ex, 4, (168, 132, 88))
    # the tail, swinging off his right hip
    for dx, dy, r_ in ((11, 30, 1.6), (13, 27.5, 2.0), (14, 24.5, 1.8), (13.5, 22, 1.2)):
        cv.sphere(CX + dx, dy, r_, r_ + 0.4, fur, spec=False)
    # shoulder fur tufts
    for side in (-1, 1):
        cv.dot(CX + side * 10, 20, fur.mid)
        cv.dot(CX + side * 11, 21, fur.mid)
        cv.dot(CX + side * 10, 22, fur.dark)
    # torn shorts: the tell that he WAS a person at moonrise
    den = Ramp('#3a4e6a')
    for x0 in (-5, 3):
        cv.rect(CX + x0, 32, CX + x0 + 2, 34, den, l=0.5)
    for dx in (-5, -3, 3, 5):
        cv.dot(CX + dx, 35, den.mid)
    if back:
        return
    muz = Ramp(spec.get('wolfmuzzle', '#a88458'))
    cv.sphere(CX, 16.6, 6.4, 3.8, muz)
    cv.dot(CX - 1, 14, shade(muz.base, -0.55))
    cv.dot(CX, 14, shade(muz.base, -0.55))
    # a wolfish grin: dark smile line with two fangs, not a grate of
    # teeth across the whole snout
    for dx in (-3, -2, -1, 0, 1, 2, 3):
        cv.dot(CX + dx, 17, shade(muz.base, -0.5))
    cv.dot(CX - 4, 16, shade(muz.base, -0.5))
    cv.dot(CX + 4, 16, shade(muz.base, -0.5))
    cv.dot(CX - 2, 18, (245, 243, 240))
    cv.dot(CX + 2, 18, (245, 243, 240))


def sig_humpty(cv, spec, pose, back):
    # Humpty is DRESSED: the big grey collar, the red sash under it,
    # blue trousers over the lower half of the egg, grey boots.
    col = Ramp('#9a9aa2')
    blue = Ramp('#3a6aa8')
    # trousers: the egg's own curve, filled blue from the waist down
    for y in range(25, 33):
        t = (y + 0.5 - 18.0) / 15.0
        half = 10.0 * math.sqrt(max(0.0, 1 - t * t)) - 0.6
        cv.rect(CX - half, y, CX + half, y, blue, l=0.62 - (y - 25) * 0.03)
    cv.rect(CX - 1, 26, CX, 32, Ramp(shade(blue.base, -0.25)), l=0.45)
    # legs in blue, boots grey
    for side in (-1, 1):
        lx = CX + side * 4
        cv.rect(lx - 1, 33, lx + 1, 35, blue, l=0.5)
        cv.rect(lx - 1, 36, lx + 1, 38, col, l=0.5)
    # the collar: BIG grey wings, wider than the egg, the sash beneath
    for side in (-1, 1):
        a, b = sorted((CX + side * 5, CX + side * 11))
        cv.rect(a, 19, b, 20, col, l=0.66)
        a, b = sorted((CX + side * 6, CX + side * 11))
        cv.rect(a, 21, b, 21, col, l=0.5)
        cv.dot(CX + side * 11, 22, col.dark)
    cv.rect(CX - 5, 20, CX + 5, 21, col, l=0.55)


def sig_lion(cv, spec, pose, back):
    # THE MANE, bright orange around a yellow face, with little ears
    # poking out the top and the tail flicking its orange tuft.
    mane = Ramp('#e07818')
    cv.sphere(CX, 12.5, 12.2, 11.2, mane, spec=False)
    for a in range(12):
        ang = a * math.pi / 6
        tx = CX + math.cos(ang) * 12.2
        ty = 12.5 + math.sin(ang) * 11.2
        if 0 <= ty <= 24:
            cv.dot(tx, ty, mane.dark)
    for side in (-1, 1):
        cv.sphere(CX + side * 7, 2.0, 1.8, 1.8, mane, spec=False)
    # the tail, swung out to his right, tufted
    tail = Ramp(spec.get('skin', '#eab84a'))
    for dx, dy in ((11, 32), (12.5, 30), (13.5, 28), (14, 26)):
        cv.sphere(CX + dx, dy, 1.2, 1.2, tail, spec=False)
    cv.sphere(CX + 14, 24.0, 1.8, 2.0, mane, spec=False)


def sig_lion_face(cv, spec, pose, back):
    if back:
        return
    # orange nose over the tan muzzle
    n = (224, 120, 24)
    cv.dot(CX - 1, 14, n)
    cv.dot(CX, 14, n)
    cv.dot(CX, 15, shade(n, -0.3))


def sig_santa(cv, spec, pose, back):
    """A white sphere for a beard and nothing else is a snowman in a hat.
    What makes him Santa is the mouth and moustache INSIDE the beard, the
    belt, and the fur cuffs."""
    white = Ramp(spec.get('beard', '#f5efe8'))
    # the black belt with its brass buckle, across the widest of him
    cv.rect(CX - 10, 29, CX + 10, 31, Ramp('#2a2018'), l=0.42)
    buck = Ramp('#e0b038')
    cv.rect(CX - 3, 29, CX + 3, 31, buck, l=0.62)
    cv.rect(CX - 1, 30, CX + 1, 30, Ramp('#8a6a20'), l=0.5)
    # fur cuffs at both wrists and along the hem
    for side in (-1, 1):
        o = run_off(pose)[0 if side < 0 else 1]
        cv.cyl(CX + side * 10 - 1, 28 + o, CX + side * 10 + 1, 29 + o, white)
    if back:
        return
    # the moustache: one band with tips that DROOP, sitting on the beard
    cv.rect(CX - 5, 18, CX + 5, 18, Ramp(shade(white.base, -0.10)), l=0.72)
    for side in (-1, 1):
        cv.dot(CX + side * 6, 19, white.mid)
        cv.dot(CX + side * 6, 20, white.dark)
    # a mouth in the gap below it, or the beard is a bib
    for dx in (-2, -1, 0, 1, 2):
        cv.dot(CX + dx, 20, (122, 58, 54))
    cv.dot(CX - 3, 19, (122, 58, 54))
    cv.dot(CX + 3, 19, (122, 58, 54))
    # the nose and two cheeks, which are the only skin left showing
    nose = (226, 138, 118)
    for dx in (-1, 0, 1):
        cv.dot(CX + dx, 16, nose)
    cv.dot(CX, 17, (200, 112, 96))
    for side in (-1, 1):
        cv.dot(CX + side * 6, 16, (238, 168, 160))
        cv.dot(CX + side * 7, 16, (238, 168, 160))


def sig_mrsclaus(cv, spec, pose, back):
    """Long loose hair and a plain red dress is any woman in red. Hers is
    a white BUN, an apron and half moon spectacles."""
    hair = Ramp(spec.get('hair', '#dcdcd8'))
    cv.sphere(CX, 2.6, 4.0, 3.0, hair, spec=False)          # the bun
    cv.dot(CX - 4, 4, shade(hair.base, -0.28))
    cv.dot(CX + 4, 4, shade(hair.base, -0.28))
    # the white apron, edge to edge down the front of the dress
    if not back:
        ap = Ramp('#f2efe8')
        cv.rect(CX - 4, 25, CX + 4, 31, ap, l=0.72)
        cv.rect(CX - 5, 25, CX + 5, 25, ap, l=0.60)
        cv.rect(CX - 6, 23, CX + 6, 24, ap, l=0.66)         # the collar
    if back:
        return
    # HALF MOON spectacles. The old pair were two gold hoops the size of
    # her eyes, which reads as goggles rather than as reading glasses.
    rim = (201, 160, 48)
    for side in (-1, 1):
        x = int(CX + side * 4)
        for dx in (-2, -1, 0, 1, 2):
            cv.dot(x + dx, 16, rim)     # only the BOTTOM arc is rimmed
            cv.dot(x + dx, 12, rim)
        cv.dot(x - 3, 15, rim)
        cv.dot(x + 3, 15, rim)
        cv.dot(x - 3, 12, rim)
        cv.dot(x + 3, 12, rim)
    for dx in (-1, 0, 1):
        cv.dot(CX + dx, 12, rim)
    for side in (-1, 1):                                    # rosy cheeks
        cv.dot(CX + side * 7, 16, (238, 168, 168))
        cv.dot(CX + side * 6, 17, (238, 168, 168))


def sig_bunny(cv, spec, pose, back):
    # TALL rabbit ears with pink inners, a pink nose, buck teeth
    fur = Ramp(spec.get('skin', '#f5efe8'))
    pink = (240, 184, 200)
    for side in (-1, 1):
        ex = CX + side * 5
        cv.cyl(ex - 1, 1, ex + 1, 9, fur, round_top=2)
        if not back:
            cv.dot(ex, 3, pink); cv.dot(ex, 4, pink)
            cv.dot(ex, 5, pink); cv.dot(ex, 6, pink)
    if back:
        return
    cv.dot(CX, 17, (232, 140, 160))
    cv.dot(CX - 1, 17, (232, 140, 160))
    cv.dot(CX - 1, 21, (250, 250, 252))
    cv.dot(CX, 21, (250, 250, 252))
    for side in (-1, 1):
        cv.dot(CX + side * 4, 17, (208, 208, 212))
        cv.dot(CX + side * 5, 16, (208, 208, 212))
    # the Easter basket, eggs and all
    bk = Ramp('#a8763a')
    o = run_off(pose)[1]
    cv.dot(CX + 9, 29 + o, (232, 140, 160))
    cv.dot(CX + 10, 28 + o, (140, 180, 232))
    cv.dot(CX + 11, 29 + o, (240, 214, 110))
    cv.rect(CX + 8, 30 + o, CX + 12, 33 + o, bk, l=0.55)
    cv.dot(CX + 8, 29 + o, bk.dark)
    cv.dot(CX + 12, 29 + o, bk.dark)
    cv.dot(CX + 9, 31 + o, bk.dark)
    cv.dot(CX + 11, 32 + o, bk.dark)


def sig_fairy(cv, spec, pose, back):
    """She is the TOOTH fairy, and nothing on her said so: a gold star on
    a stick is every fairy on every roster. The wand carries a tooth, and
    there is a pouch on her hip to put them in."""
    # a tulle skirt, so the body is not a rectangle of dress
    tut = Ramp(shade(spec.get('shirt', '#b08ac6'), 0.24))
    cv.taper(29, 33, 16, 22, tut, folds=2)
    if back:
        return
    # a small tiara
    g = (248, 216, 74)
    for dx, dy in ((-3, 6), (-2, 5), (-1, 6), (0, 5), (1, 6), (2, 5), (3, 6)):
        cv.dot(CX + dx, dy, g)
    o = run_off(pose)[1]
    # the wand: a stick with a MOLAR on the end of it, roots and all
    cv.dot(CX + 11, 30 + o, (150, 118, 56))
    cv.dot(CX + 12, 28 + o, (150, 118, 56))
    cv.dot(CX + 12, 27 + o, (150, 118, 56))
    tooth = (250, 248, 240)
    shad = (206, 202, 192)
    for dy in (21, 22, 23, 24):
        for dx in (10, 11, 12, 13, 14):
            cv.dot(CX + dx, dy + o, tooth)
    cv.dot(CX + 10, 21 + o, shad)
    cv.dot(CX + 14, 21 + o, shad)
    for dx in (10, 11, 13, 14):                 # two roots, and the gap
        cv.dot(CX + dx, 25 + o, shad)
    cv.dot(CX + 11, 26 + o, shad)
    cv.dot(CX + 13, 26 + o, shad)
    cv.dot(CX + 11, 22 + o, (255, 255, 255))
    # the pouch of collected teeth, on her other hip
    pouch = Ramp('#7a5aa0')
    cv.sphere(CX - 8, 30, 2.8, 3.0, pouch, spec=False)
    cv.rect(CX - 10, 27, CX - 6, 27, Ramp('#c8b0e0'), l=0.6)
    cv.dot(CX - 8, 29, tooth)
    cv.dot(CX - 9, 30, tooth)


def sig_pirate(cv, spec, pose, back):
    """A patch and a black hat is any of four characters on this roster.
    What is only his: the sash, the coat over the stripes, and a cutlass."""
    # the coat, open down the front over the striped shirt
    coat = Ramp('#5a1c22')
    for side in (-1, 1):
        cv.cyl(CX + side * 6 - 1, 23, CX + side * 6 + 1, 31, coat, round_bot=1)
    # the striped shirt in the gap the coat leaves
    red = Ramp('#c93030')
    for yy in (24, 26, 28):
        cv.rect(CX - 4, yy, CX + 4, yy, red, l=0.5)
    # the sash, tied at the hip with the tail hanging
    sash = Ramp('#b8451c')
    cv.rect(CX - 6, 29, CX + 6, 30, sash, l=0.58)
    cv.dot(CX + 6, 31, sash.mid)
    cv.dot(CX + 6, 32, sash.dark)
    if back:
        return
    # A full beard puts its top edge at row 16 and the stock mouth at 19,
    # so his grin was under it. Drawn on top, with the gold tooth.
    for dx in range(-3, 4):
        cv.dot(CX + dx, 19, (40, 24, 22))
    for dx in (-2, 0, 2):
        cv.dot(CX + dx, 20, (240, 236, 226))
    cv.dot(CX + 1, 20, (222, 184, 66))
    cv.dot(CX - 4, 18, (40, 24, 22))
    cv.dot(CX + 4, 18, (40, 24, 22))
    # gold buttons down the coat's near edge
    for dy in (24, 27, 30):
        cv.dot(CX - 6, dy, (222, 184, 66))
    # the CUTLASS, hilt at the sash and the blade curving down and out
    o = run_off(pose)[1]
    cv.dot(CX + 8, 29 + o, (222, 184, 66))
    cv.dot(CX + 8, 30 + o, (222, 184, 66))
    steel = (206, 212, 222)
    for dx, dy in ((9, 31), (10, 32), (11, 33), (12, 34), (12, 35), (11, 36)):
        cv.dot(CX + dx, dy + o, steel)
        cv.dot(CX + dx, dy + 1 + o, (150, 158, 170))


def sig_krampus(cv, spec, pose, back):
    # BIG curled ram horns, replacing the little nubs
    h = Ramp('#c9a256')
    for side in (-1, 1):
        for dx, dy in ((6, 5), (7, 4), (8, 3), (9, 2), (10, 2), (11, 3), (11, 4)):
            cv.dot(CX + side * dx, dy, h.mid)
            cv.dot(CX + side * dx, dy + 1, h.dark)
    if back:
        return
    # the long tongue, hanging out
    t = (201, 75, 75)
    cv.dot(CX, 19, t); cv.dot(CX, 20, t)
    cv.dot(CX, 21, t); cv.dot(CX + 1, 21, t)
    # The chain hangs in a SWAG across his chest, links touching, with
    # the bell at the low point. Scattered single dots read as noise.
    ch = (168, 172, 182)
    dk = (96, 100, 112)
    for i in range(13):
        u = i / 12.0
        x = CX - 7 + u * 14
        y = 24 + math.sin(u * math.pi) * 5
        cv.dot(x, y, ch if i % 2 else dk)
    g = (201, 160, 48)
    for dx in (-1, 0, 1):
        cv.dot(CX + dx, 30, g)
        cv.dot(CX + dx, 31, shade(g, -0.2))
    cv.dot(CX, 32, (110, 88, 30))


def sig_fathertime(cv, spec, pose, back):
    if back:
        return
    # the hourglass in his left hand
    g = (201, 160, 48)
    sand = (232, 194, 90)
    x = int(CX) - 10
    o = run_off(pose)[0]
    for dx in (-2, -1, 0, 1, 2):
        cv.dot(x + dx, 26 + o, g)
        cv.dot(x + dx, 31 + o, g)
    cv.dot(x - 1, 27 + o, (207, 228, 242)); cv.dot(x + 1, 27 + o, (207, 228, 242))
    cv.dot(x, 28 + o, (207, 228, 242))
    cv.dot(x, 29 + o, sand)
    cv.dot(x - 1, 30 + o, sand); cv.dot(x, 30 + o, sand); cv.dot(x + 1, 30 + o, sand)


def sig_mothernature(cv, spec, pose, back):
    # Vines and leaves growing up the robe: without them it is a flat
    # green wall and she is a woman in a bathrobe.
    leaf = Ramp('#2f7a34')
    for side in (-1, 1):
        for i in range(5):
            x = CX + side * (3 + i * 1.6)
            y = 36 - i * 3.4
            cv.dot(x, y, leaf.mid)
            cv.dot(x, y - 1, leaf.lit)
            if i % 2 == 0:
                cv.sphere(x + side * 2, y - 1, 1.8, 1.1, leaf, spec=False)
    # flowers in her hair
    for fx, fy in ((-5, 6), (0, 4), (5, 6)):
        x, y = CX + fx, fy
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            cv.dot(x + dx, y + dy, (250, 250, 252))
        cv.dot(x, y, (232, 140, 160))


def sig_raboddog(cv, spec, pose, back):
    # A tail up and wagging, and a collar: he was somebody's dog once.
    fur = Ramp(spec.get('skin', '#5a3a20'))
    wag = 1 if pose == 'run1' else (-1 if pose == 'run2' else 0)
    for i, (dx, dy) in enumerate(((11, 27), (13, 24), (14, 21), (14, 18))):
        cv.sphere(CX + dx + wag * i * 0.5, dy, 1.6, 1.8, fur, spec=False)
    col = Ramp('#8a1a1a')
    cv.rect(CX - 5, 23, CX + 5, 24, col, l=0.55)
    cv.dot(CX, 25, (214, 176, 60))
    if back:
        return
    # foam at the mouth: he is RABID
    for dx, dy in ((-3, 21), (-2, 22), (-1, 21), (0, 22), (1, 21), (2, 22), (3, 21)):
        cv.dot(CX + dx, dy, (245, 245, 247))


def sig_chupacabra(cv, spec, pose, back):
    # A ridge of spines running from the crown down the spine, plus tall
    # bat ears. Colour alone never separated him from the dog.
    sp = Ramp('#7a9c56')
    for x, top in ((-4, 2), (0, 0), (4, 2)):
        cv.tri([(CX + x, top), (CX + x - 1, top + 4), (CX + x + 1, top + 4)], sp, l=0.5)
    # Ears ABOVE the eyes and swept back. Reaching down to row 12 they
    # crossed his face and painted a dark bar over both eyes.
    fur = Ramp(spec.get('skin', '#4a5a3a'))
    for side in (-1, 1):
        cv.tri([(CX + side * 4, 8), (CX + side * 11, 1), (CX + side * 9, 9)], fur, l=0.5)


def sig_cupid(cv, spec, pose, back):
    """A winged blond adult is an angel. Cupid is a BABY: curls, a nappy,
    and a bow he is actually holding rather than one hanging beside him."""
    skin = Ramp(spec.get('skin', '#f7dcb4'))
    # the cloth, which is the only thing he is wearing
    cloth = Ramp('#f4f2ee')
    cv.rect(CX - 6, 30, CX + 6, 33, cloth, l=0.74)
    cv.dot(CX - 6, 29, cloth.mid)
    cv.dot(CX + 6, 29, cloth.mid)
    if back:
        return
    # curls, so the head is not a bald dome
    curl = Ramp(spec.get('hair', '#d8a24a'))
    for dx, dy in ((-6, 8), (-3, 6), (0, 5), (3, 6), (6, 8), (-5, 5), (5, 5)):
        cv.sphere(CX + dx, dy, 2.2, 1.9, curl, spec=False)
    for side in (-1, 1):                        # apple cheeks
        cv.dot(CX + side * 6, 17, (240, 172, 164))
        cv.dot(CX + side * 7, 17, (240, 172, 164))
    # THE BOW: a thick limb, a drawn string, and an arrow ON it. The old
    # one was a line of single dots and read as a crack in the sprite.
    wood = (150, 96, 42)
    lit = (186, 128, 62)
    o = run_off(pose)[1]
    for dy, dx in ((21, 9), (22, 10), (23, 11), (24, 11), (25, 11), (26, 11),
                   (27, 11), (28, 10), (29, 9)):
        cv.dot(CX + dx, dy + o, wood)
        cv.dot(CX + dx - 1, dy + o, lit)
    for dy in range(21, 30):                    # the string, drawn back
        cv.dot(CX + 6, dy + o, (232, 230, 234))
    for dx in range(-1, 11):                    # the shaft
        cv.dot(CX + dx, 25 + o, (214, 190, 140))
    for dy in (24, 26):                         # fletching
        cv.dot(CX - 1, dy + o, (240, 240, 244))
        cv.dot(CX, dy + o, (200, 200, 208))
    r = (210, 73, 73)                           # the heart on the tip
    for dx, dy in ((10, 24), (12, 24), (10, 25), (11, 25), (12, 25), (11, 26)):
        cv.dot(CX + dx, dy + o, r)


def sig_yeti(cv, spec, pose, back):
    """A grey oval on a white ball is a hippo mask. What a yeti has is a
    shaggy MANE breaking the whole silhouette, a heavy brow of fur over
    the eyes, and a roar with square teeth in it."""
    fur = Ramp(spec.get('skin', '#f0f6fb'))
    # the mane: tufts all round the head and shoulders, on both facings
    # They have to OVERLAP and vary. Evenly spaced circles of one size at
    # arm's length from the body read as a cog, not as fur.
    for dx, dy, r_ in ((-9, 6, 3.0), (-10.5, 10, 2.4), (-10, 14, 3.2),
                       (-11, 18, 2.5), (-10, 22, 3.0), (-9.5, 26, 2.4),
                       (-9, 29, 2.8),
                       (9, 6, 3.0), (10.5, 10, 2.4), (10, 14, 3.2),
                       (11, 18, 2.5), (10, 22, 3.0), (9.5, 26, 2.4),
                       (9, 29, 2.8), (-5, 3, 2.8), (0, 2, 2.4), (5, 3, 2.8)):
        cv.sphere(CX + dx, dy, r_, r_ * 0.86, fur, spec=False)
    if back:
        return
    face = Ramp('#93aec6')
    cv.sphere(CX, 15.2, 6.6, 4.4, face, spec=False)
    # the brow: a shelf of fur over the eyes, which is what keeps the
    # face from reading as a patch stuck on the front of a snowball
    for dx in range(-6, 7):
        cv.dot(CX + dx, 11, fur.dark)
    for dx in (-7, 7):
        cv.dot(CX + dx, 12, fur.dark)
    for side in (-1, 1):                        # eyes, deep under it
        x = int(CX + side * 3)
        for dy in (13, 14):
            cv.dot(x, dy, (22, 26, 38))
            cv.dot(x + side, dy, (22, 26, 38))
        cv.dot(x, 13, (150, 208, 240))
    # THE ROAR
    for dx in range(-4, 5):
        cv.dot(CX + dx, 16, (30, 34, 46))
        cv.dot(CX + dx, 17, (30, 34, 46))
    for dx in (-4, -2, 0, 2, 4):
        cv.dot(CX + dx, 16, (246, 250, 252))
    for dx in (-3, -1, 1, 3):
        cv.dot(CX + dx, 17, (222, 232, 240))
    for side in (-1, 1):                        # two tusks, pointing up
        cv.dot(CX + side * 5, 16, (246, 250, 252))
        cv.dot(CX + side * 5, 15, (246, 250, 252))


def sig_sasquatch(cv, spec, pose, back):
    # THE FEET. He is Bigfoot: wide flat feet and a heavy brow. Plus a
    # shaggy edge, because a smooth silhouette reads as a bear suit.
    fur = Ramp(spec.get('skin', '#4a2014'))
    for side in (-1, 1):
        cv.sphere(CX + side * 4, 37.4, 3.8, 1.8, Ramp(shade(fur.base, -0.2)), spec=False)
        for dy in (18, 21, 24, 27, 30):
            cv.dot(CX + side * 13, dy, fur.mid)
            cv.dot(CX + side * 12, dy + 1, fur.lit)
    if back:
        return
    brow = shade(fur.base, -0.5)
    for dx in range(-6, 7):
        cv.dot(CX + dx, 9, brow)
    for dx in (-6, 6):
        cv.dot(CX + dx, 10, brow)


def sig_felix(cv, spec, pose, back):
    if back:
        return
    # Felix IS the white face: a big white mask over the black head,
    # eyes at its top edge, the wide grin across it, white gloves and
    # big glossy shoe feet.
    white = Ramp('#f7f7f9')
    ink = (20, 16, 24)
    cv.sphere(CX, 15.0, 6.8, 5.8, white)
    for sx in (-3, 3):
        x = CX + sx
        for dx in (-1, 0):
            for dy in (-1, 0, 1):
                cv.dot(x + dx, 10 + dy, (250, 250, 252))
        cv.dot(x - (1 if sx > 0 else 0), 11, ink)
    cv.dot(CX - 1, 13, ink)
    cv.dot(CX, 13, ink)
    for dx in range(-4, 5):
        cv.dot(CX + dx, 17, ink)
    cv.dot(CX - 5, 16, ink)
    cv.dot(CX + 5, 16, ink)
    # the gloves sit ON the body's edge. Hung at the row the arms used to
    # end at, they float clear of it now the torso is longer than it is
    # wide there.
    for side in (-1, 1):
        cv.ball(CX + side * 7.6, 28.5, 2.6, 2.8, white, spec=False)
    shoe = Ramp('#181420')
    for side in (-1, 1):
        cv.sphere(CX + side * 4, 37.2, 3.2, 1.8, shoe, spec=True)


def sig_jack(cv, spec, pose, back):
    # THE BEANSTALK, climbing past his shoulder. A line of single dots
    # was a piece of string hung beside a boy. It is a STALK: three wide,
    # twisting the whole height of the frame, with tendrils curling off
    # it and leaves big enough to read at this size.
    vine = Ramp('#2f7a34')
    dk = shade(vine.base, -0.34)
    xs = []
    for y in range(0, 39):
        x = CX + 11.0 + math.sin(y / 38.0 * 6.0 + 0.7) * 2.0
        xs.append(x)
        cv.cyl(x - 1.5, y, x + 1.5, y, vine)
        if y % 5 == 0:
            cv.dot(x - 1, y, dk)      # the coil seam, so it reads twisted
            cv.dot(x + 1, y, dk)
    # tendrils: a curl of three off the stalk, alternating sides
    for y, side in ((6, -1), (17, 1), (29, -1), (36, 1)):
        x = xs[y]
        cv.dot(x + side * 2, y, vine.lit)
        cv.dot(x + side * 3, y - 1, vine.mid)
        cv.dot(x + side * 3, y - 2, vine.lit)
    leaf = Ramp('#3f9a44')
    for y, side in ((3, -1), (12, 1), (21, -1), (31, 1), (37, -1)):
        x = xs[y]
        cv.sphere(x + side * 3.4, y, 3.2, 2.0, leaf, spec=False)
        cv.dot(x + side * 3, y, shade(leaf.base, -0.28))
    if back:
        return
    for dx in (8, 9):                       # a couple of beans in hand
        cv.dot(CX + dx, 25, (232, 214, 140))
        cv.dot(CX + dx, 26, (206, 188, 116))


def sig_robin(cv, spec, pose, back):
    # The feather stays; add the QUIVER on his back with fletched
    # arrows, and the bow slung on the other side.
    sig_peter(cv, spec, pose, back)
    q = Ramp('#6a4326')
    cv.cyl(CX + 8, 20, CX + 11, 30, q, round_bot=1)
    for i, dx in enumerate((8, 9, 10)):
        cv.dot(CX + dx, 19 - i % 2, (226, 226, 230))
        cv.dot(CX + dx, 18 - i % 2, (201, 60, 48))
    bow = (160, 112, 52)
    o = run_off(pose)[0]
    for dy, ddx in ((22, 0), (24, 1), (26, 1.4), (28, 1), (30, 0)):
        cv.dot(CX - 10 - ddx, dy + o, bow)
        cv.dot(CX - 10 - ddx, dy + 1 + o, bow)
    for dy in range(22, 31):
        cv.dot(CX - 10, dy + o, (226, 226, 230))


def sig_tintin(cv, spec, pose, back):
    """The quiff and the PLUS FOURS. Long trousers on a blue jumper is a
    boy in a blue jumper; the breeches ending at the knee over pale socks
    are half of why he is recognisable from behind."""
    r = Ramp(spec.get('hair', '#c9a256'))
    # THE QUIFF, swept up and forward off the brow in one curl
    cv.tri([(CX - 3, 7), (CX + 2, -1), (CX + 6, 4)], r, l=0.70)
    cv.tri([(CX - 1, 6), (CX + 2, 1), (CX + 4, 4)], r, l=0.88)
    cv.tri([(CX + 2, 0), (CX + 7, 2), (CX + 3, 5)], r, l=0.60)
    # the breeches stop at the knee and BLOUSE out over the sock
    br = Ramp(spec.get('pants', '#6a4a2a'))
    if pose == 'run1':
        la, ra = -1, 1
    elif pose == 'run2':
        la, ra = 1, -1
    else:
        la, ra = 0, 0
    sock = Ramp('#e4e0d4')
    for side, a in ((-1, la), (1, ra)):
        x0 = CX + side * 3 - (2 if side < 0 else 0)
        cv.cyl(x0 - 1, 31 + max(0, a), x0 + 3, 34 + a, br, round_bot=1)
        cv.cyl(x0, 34 + a, x0 + 2, 36 + a, sock)


def sig_lupin(cv, spec, pose, back):
    # A gentleman thief wears a wing collar and a bow tie under the
    # tails, or he is just a man in a black box.
    if back:
        return
    cv.rect(CX - 3, 23, CX + 3, 24, Ramp('#f0f0f2'), l=0.72)
    bt = Ramp('#8a1a1a')
    cv.dot(CX - 2, 25, bt.mid); cv.dot(CX - 1, 25, bt.lit)
    cv.dot(CX + 1, 25, bt.lit); cv.dot(CX + 2, 25, bt.mid)
    cv.dot(CX, 25, bt.dark)


def sig_acrobat(cv, spec, pose, back):
    # A gold sash across the leotard and a star on the chest: circus.
    g = Ramp('#e8c04a')
    for i in range(11):
        cv.dot(CX - 5 + i, 24 + i * 0.45, g.mid)
        cv.dot(CX - 5 + i, 25 + i * 0.45, g.dark)
    if back:
        return
    st = (250, 244, 210)
    cv.dot(CX - 2, 28, st)
    for dx in (-3, -2, -1, 0, 1):
        cv.dot(CX + dx - 1, 29, st)
    cv.dot(CX - 3, 30, st); cv.dot(CX - 1, 30, st)


def sig_cyclops(cv, spec, pose, back):
    # The hide tunic over one shoulder, and a brow heavy enough to make
    # the single eye read as deliberate rather than as a missing pair.
    # A hide that DRAPES and flares, with a ragged hem and one strap over
    # the shoulder. A straight rectangle read as a sandwich board.
    hide = Ramp('#8a6a3a')
    cv.taper(23, 33, 9, 15, hide, folds=2)
    cv.cyl(CX - 6, 20, CX - 4, 25, hide)
    for i, dx in enumerate(range(-7, 8, 2)):
        for k in range((i * 5) % 3):
            cv.dot(CX + dx, 33 + k, hide.dark)
            cv.dot(CX + dx + 1, 33 + k, hide.dark)
    if back:
        return
    brow = shade(spec.get('skin', '#c8956a'), -0.5)
    for dx in range(-5, 6):
        cv.dot(CX + dx, 9, brow)
    for dx in (-5, 5):
        cv.dot(CX + dx, 10, brow)


def sig_firebreather(cv, spec, pose, back):
    """The plume has to come out of an OPEN mouth. Out of a closed one it
    reads as something burning behind him."""
    if back:
        return
    for dx in range(-3, 4):
        cv.dot(CX + dx, 18, (56, 26, 22))
    for dx in range(-2, 3):
        for dy in (19, 20):
            cv.dot(CX + dx, dy, (120, 44, 40))
    for dx in (-1, 0, 1):
        cv.dot(CX + dx, 19, (196, 76, 52))
    cv.dot(CX - 3, 19, (56, 26, 22))
    cv.dot(CX + 3, 19, (56, 26, 22))
    # the torch he lit it from, held low on the other side
    o = run_off(pose)[0]
    cv.cyl(CX - 11, 28 + o, CX - 10, 35 + o, Ramp('#6a4a2a'))
    for dy, r_ in ((26, 2.2), (23, 1.6)):
        cv.sphere(CX - 10.5, dy + o, r_, r_ * 1.3, Ramp('#f4922a'), spec=True)
    cv.dot(CX - 10, 26 + o, (250, 232, 140))


def sig_strongman(cv, spec, pose, back):
    """The singlet, the handlebar and a weight in his hand. Without the
    weight he is a large man in a leotard, which is the acrobat."""
    red = Ramp('#c02a2a')
    cv.cyl(CX - 7, 25, CX + 7, 32, red, round_bot=2)
    for side in (-1, 1):
        cv.cyl(CX + side * 4 - 1, 22, CX + side * 4 + 1, 25, red)
    # the dumbbell, held down at his side and riding the arm swing
    o = run_off(pose)[1]
    iron = Ramp('#4a4e58')
    cv.rect(CX + 9, 33 + o, CX + 13, 34 + o, iron, l=0.5)
    cv.rect(CX + 8, 31 + o, CX + 9, 36 + o, iron, l=0.62)
    cv.rect(CX + 13, 31 + o, CX + 14, 36 + o, iron, l=0.44)
    if back:
        return
    # THE HANDLEBAR: one band, and ends that curl UP off the lip. Two
    # solid rows across the middle of a face is an open mouth, which is
    # what the first one read as.
    m = (58, 36, 16)
    hi = (92, 62, 30)
    for dx in range(-4, 5):
        cv.dot(CX + dx, 16, m)
    for dx in (-2, -1, 0, 1, 2):
        cv.dot(CX + dx, 17, m)
    for side in (-1, 1):
        cv.dot(CX + side * 5, 15, m)
        cv.dot(CX + side * 6, 14, m)
        cv.dot(CX + side * 6, 13, hi)
    for dx in (-1, 0, 1):                       # a mouth under it
        cv.dot(CX + dx, 19, (120, 60, 52))
    # a stripe of chest, so the singlet has a body behind it
    cv.dot(CX - 3, 24, shade(spec.get('skin', '#e8b888'), -0.22))
    cv.dot(CX + 3, 24, shade(spec.get('skin', '#e8b888'), -0.22))


def sig_phoenix(cv, spec, pose, back):
    # wings SPREAD, swept up like flames: a red outer layer, an orange
    # inner layer, gold feather tips flicking off the top edge. Drawn
    # over the body (the bird archetype's own egg wings are suppressed
    # with the nowings flag, or they paint over these).
    red = Ramp('#c93018')
    org = Ramp('#f4922a')
    gold = (248, 216, 74)
    flap = 2 if pose == 'run1' else (-2 if pose == 'run2' else 0)
    for side in (-1, 1):
        sx = side
        f = flap * (1 if side > 0 else -1) * 0.0 + flap
        cv.tri([(CX + sx * 3, 26), (CX + sx * 15, 5 + f), (CX + sx * 12, 20 + f)], red, l=0.45)
        cv.tri([(CX + sx * 4, 25), (CX + sx * 11, 8 + f), (CX + sx * 8, 20 + f)], org, l=0.62)
        cv.dot(CX + sx * 15, 4 + f, gold)
        cv.dot(CX + sx * 13, 4 + f, gold)
        cv.dot(CX + sx * 11, 6 + f, gold)
    # tail streamers, flowing long below the body
    for dx, col in ((-3, (201, 48, 24)), (0, (244, 146, 42)), (3, (248, 216, 74))):
        for i, dy in enumerate(range(33, 40)):
            wob = 1 if (i + abs(dx)) % 3 == 0 else 0
            cv.dot(CX + dx + (wob if dx >= 0 else -wob), dy, col)


def sig_ringmaster(cv, spec, pose, back):
    gold = (201, 160, 48)
    glove = (245, 245, 247)
    # gold cuffs and white gloves on both facings
    for side in (-1, 1):
        x = CX + side * 9
        cv.rect(x - 1, 30, x + 1, 30, Ramp('#c9a030'), l=0.6)
        for dx in (-1, 0, 1):
            cv.dot(x + dx, 32, glove)
            cv.dot(x + dx, 33, glove)
    if back:
        return
    # lapels, double breasted gold buttons, white shirt V and tie
    for i in range(3):
        cv.dot(CX - 2 - i, 23 + i, gold)
        cv.dot(CX + 2 + i, 23 + i, gold)
    cv.dot(CX - 2, 26, gold); cv.dot(CX + 2, 26, gold)
    cv.dot(CX - 2, 28, gold); cv.dot(CX + 2, 28, gold)
    cv.dot(CX, 23, (245, 245, 247))
    cv.dot(CX, 24, (26, 26, 32))


SIGNATURES = {
    'kong': {'post': sig_kong},
    'franky': {'post': sig_franky},
    'popeye': {'post': sig_popeye},
    'dracula': {'pre': sig_cape_pre, 'post': sig_cape_post},
    'liberty': {'post': sig_liberty},
    'peter': {'post': sig_peter},
    'robin': {'post': sig_robin},
    'medusa': {'post': sig_medusa},
    'pooh': {'post': sig_pooh},
    'tom': {'post': sig_tom},
    'huck': {'post': sig_huck},
    'flash': {'post': sig_flash},
    'sherlock': {'post': sig_sherlock},
    'hyde': {'post': sig_hyde},
    'tracy': {'post': sig_tracy},
    'alice': {'post': sig_alice},
    'dorothy': {'post': sig_dorothy},
    'scarecrow': {'post': sig_scarecrow},
    'lion': {'pre': sig_lion, 'post': sig_lion_face},
    'mrsclaus': {'post': sig_mrsclaus},
    'santa': {'post': sig_santa},
    'bunny': {'post': sig_bunny},
    'fairy': {'post': sig_fairy},
    'vampire': {'pre': sig_cape_pre, 'post': sig_cape_post},
    'pirate': {'post': sig_pirate},
    'krampus': {'post': sig_krampus},
    'fathertime': {'post': sig_fathertime},
    'mothernature': {'post': sig_mothernature},
    'raboddog': {'post': sig_raboddog},
    'chupacabra': {'post': sig_chupacabra},
    'cupid': {'post': sig_cupid},
    'strongman': {'post': sig_strongman},
    'firebreather': {'post': sig_firebreather},
    'cyclops': {'post': sig_cyclops},
    'acrobat': {'post': sig_acrobat},
    'jack': {'pre': sig_jack},
    'tintin': {'post': sig_tintin},
    'lupin': {'post': sig_lupin},
    'phoenix': {'post': sig_phoenix},
    'ringmaster': {'post': sig_ringmaster},
    'witch': {'post': sig_witch},
    'zombie': {'post': sig_zombie},
    'werewolf': {'post': sig_werewolf},
    'humpty': {'post': sig_humpty},
    'felix': {'post': sig_felix},
    'yeti': {'post': sig_yeti},
    'sasquatch': {'post': sig_sasquatch},
}


def build(spec, pose='idle', key=None):
    cv = Canvas()
    # The swing is seen from behind, like everything a batter does.
    back = pose.startswith('back') or pose == 'swing'
    body_pose = {'back': 'idle', 'backrun1': 'run1', 'backrun2': 'run2', 'swing': 'swing'}[pose] if back else pose
    sig = SIGNATURES.get(key, {})
    if back:
        # The archetype is drawn with its FRONT features stripped: the
        # muzzle and the chest patch belong to the side facing the
        # camera, and Kong's back is not the side with his belly on it.
        bspec = dict(spec)
        bspec.pop('chest', None)
        if spec.get('arch') in ('hulk', 'beast', 'cat'):
            bspec['muzzle'] = None
        if 'pre' in sig: sig['pre'](cv, spec, body_pose, True)
        ARCH[spec.get('arch', 'human')](cv, bspec, body_pose)
        back_head(cv, spec)
        headwear(cv, spec)
        ex = [e for e in spec.get('extra', []) if e[0] not in FRONT_ONLY_EXTRAS]
        extras(cv, dict(spec, extra=ex), body_pose)
        if 'post' in sig: sig['post'](cv, spec, body_pose, True)
        cv.outline()
        return cv
    if 'pre' in sig: sig['pre'](cv, spec, body_pose, False)
    ARCH[spec.get('arch', 'human')](cv, spec, body_pose)
    hair(cv, spec)
    headwear(cv, spec)
    a = spec.get('arch', 'human')
    cy = HEAD_CY
    if a == 'hulk':
        cy = 12.5
    elif a == 'round':
        cy = HEAD_CY + 1
    elif a == 'egg':
        cy = 12.0
    elif a == 'beast':
        cy = 11.0 if spec.get('build') == 'lean' else 12.5
    elif a == 'cat':
        cy = 12.0
    elif a == 'centaur':
        cy = 9.5
    elif a == 'nessie':
        cy = 7.0
    elif a == 'dragon':
        cy = 11.0
    elif a == 'bird':
        cy = 12.0
    skin = Ramp(spec.get('skin', '#f0c088'))
    if a == 'hulk':
        skin = Ramp(spec.get('muzzle') or spec.get('skin', '#a87b4c'))
    face(cv, skin, spec, cy=cy)
    beard(cv, spec)
    extras(cv, spec, pose)
    if 'post' in sig: sig['post'](cv, spec, body_pose, False)
    cv.outline()
    return cv


# ------------------------------------------------------------------ specs
# One compact row per character. Anything omitted falls back to the
# archetype default, so a spec only says what makes that character
# different from every other figure of the same build.
SPECS = {
 'kong': dict(arch='hulk', skin='#4a2f1a', muzzle='#c29a6a', chest='#9c7448',
              hand='#33200f', boot='#33200f',
              eyes='normal', eyespread=3, mouth='none'),
 'franky': dict(arch='hulk', skin='#7ea86a', muzzle=None, shirt='#3f2a1c',
                hand='#7ea86a', pants='#22283a', chest=None,
                eyes='normal', mouth='open'),
 'popeye': dict(arch='human', skin='#f0c088', shirt='#e9e9ea', pants='#1c4f96',
                hat='sailor', hatcolor='#f2f2f3', hair='#c25c1a', hairstyle='bald',
                eyes='hidden', mouth='none'),
 'dracula': dict(arch='human', skin='#ded2cc', shirt='#3a3a44', pants='#2a2a32',
                 hair='#141018', hairstyle='short', eyes='normal', eyecolor='#8a2430',
                 mouth='fang'),
 'liberty': dict(arch='robed', skin='#6db8a2', shirt='#6db8a2', hat='crown',
                 hatcolor='#f4c25a', eyes='normal', mouth='line', folds=4),
 # Barrie's Peter is "clad in skeleton leaves and the juices that ooze out
 # of trees", and the stage Peter that followed wore a leaf edged tunic and
 # a feathered cap. The flat green tunic, green cap and belt are the 1953
 # film's, which is not public domain, and they also made him Robin Hood
 # with a different feather. Leaf green, a jagged leaf hem, red hair,
 # and no shoes: he never wore any.
 'peter': dict(arch='human', skin='#f2ceaa', shirt='#7a9a3a', pants='#5a7a30',
               hat='cap', hatcolor='#6a8a34', hair='#c94b1a', hairstyle='short',
               boot='#f2ceaa', eyes='normal', mouth='grin'),
 'felix': dict(arch='cat', skin='#141018', chest='#f0f0f2', muzzle=None,
               eyes='hidden', mouth='none',
               extra=[('ears', '#141018')]),
 'jack': dict(arch='human', skin='#f0c99a', shirt='#3a7f4a', pants='#5c3a1c',
              hair='#c9a256', hairstyle='mop', eyes='normal', mouth='grin'),
 'tom': dict(arch='human', skin='#f0c99a', shirt='#c94b1a', pants='#5a4a2a',
             hat='straw', hatcolor='#c9a256', hair='#c9a256', hairstyle='bald',
             eyes='normal', mouth='grin'),
 'huck': dict(arch='human', skin='#efc9a0', shirt='#a45b1a', pants='#5a4a2a',
              hat='straw', hatcolor='#b8933f', hair='#5a3618', hairstyle='bald',
              boot='#efc9a0', eyes='normal', mouth='grin'),
 'flash': dict(arch='human', skin='#f5d2a3', shirt='#c94b1a', pants='#3a2a1a',
               hair='#e9c76a', hairstyle='short', eyes='normal', mouth='line',
               belt='#f4c25a'),
 'invisible': dict(arch='human', skin='#f0e4d4', shirt='#4a4a5a', pants='#242430',
                   hat='brim', hatcolor='#12121a', hattrim='#2a2a3a',
                   eyes='goggles', eyecolor='#15151f', mouth='none',
                   extra=[('bandage', '#eaeaea')]),
 'sherlock': dict(arch='human', skin='#efc9a0', shirt='#8b6a3a', pants='#241812',
                  hat='deerstalker', hatcolor='#8b6a3a', hattrim='#5a4020',
                  hair='#3a1e08', hairstyle='bald', eyes='normal', mouth='line',
                  extra=[('pipe',)]),
 'tracy': dict(arch='human', skin='#efc9a0', shirt='#f4c25a', pants='#0e1a3a',
               hat='brim', hatcolor='#f4c25a', hattrim='#c9a030',
               eyes='angry', mouth='line'),
 'alice': dict(arch='human', skin='#f5d5a8', shirt='#5cb6e5', pants='#eaeaea',
               hair='#e9c76a', hairstyle='long', eyes='normal', mouth='grin',
               belt='#eaeaea'),
 # SILVER shoes. In the 1900 book Dorothy's shoes are silver; the ruby
 # slippers are the 1939 film's invention and the film is not public
 # domain until 2035. The blue and white checked gingham is Baum's.
 'dorothy': dict(arch='human', skin='#f5d5a8', shirt='#5cb6e5', pants='#eaeaea',
                 hair='#5a3618', hairstyle='braids', eyes='normal', mouth='grin',
                 boot='#cfd3dc'),
 'lupin': dict(arch='human', skin='#efc9a0', shirt='#0f0f16', pants='#0f0f16',
               hat='top', hatcolor='#141018', hattrim='#8a1a1a',
               eyes='normal', mouth='line', extra=[('monocle',)]),
 'hyde': dict(arch='hulk', skin='#c8a878', muzzle='#c8a878',
              shirt='#2f2418', pants='#241812', hand='#bda070',
              hair='#141018', hairstyle='wild', eyes='angry',
              eyecolor='#c94b1a', mouth='none'),
 'scarecrow': dict(arch='human', skin='#eecc78', shirt='#7a3812', pants='#5a3010',
                   hat='floppy', hatcolor='#c9a256', hattrim='#8b6a3a',
                   eyes='cartoon', eyecolor='#3a2410', mouth='none'),
 'lion': dict(arch='hulk', skin='#eab84a', muzzle='#ead0a0', chest='#eab84a',
              eyes='normal', eyespread=3, mouth='line'),
 # NO SHIRT. Shepard's 1926 Pooh, the one that is public domain, is a bare
 # honey coloured bear; the red shirt arrived on a 1932 licence and is not
 # public domain until 2028. He carries the honey pot instead, which is
 # the thing that was always his.
 'pooh': dict(arch='round', skin='#f4c25a', shirt='#f4c25a', eyes='hidden',
              eyecolor='#141018', mouth='none'),
 'robin': dict(arch='human', skin='#efc9a0', shirt='#3f7a3a', pants='#4a2d18',
               hat='cap', hatcolor='#3f7a3a', hair='#a45b1a', hairstyle='bald',
               eyes='normal', mouth='grin', belt='#f4c25a'),
 # The TRENCH COAT. The Tintin that is public domain is the 1929 one, who
 # reports from the Soviet Union in a tan trench coat over plus-fours; the
 # pale blue sweater is a later look and stays under copyright into the
 # 2030s. The quiff is his in every year.
 'tintin': dict(arch='human', skin='#f5d5a8', shirt='#c9a97a', pants='#6a4a2a',
                hair='#d98a3a', hairstyle='quiff', eyes='normal', mouth='line',
                belt='#a88a5a'),
 'santa': dict(arch='round', skin='#f5d2a3', shirt='#c93030', hat='santa',
               hatcolor='#c93030', hattrim='#f5efe8', beard='#f5efe8',
               beardsize='full', eyes='normal', mouth='none'),
 'mrsclaus': dict(arch='human', skin='#f5d2a3', shirt='#c93030', pants='#c93030',
                  hair='#dcdcd8', hairstyle='short', eyes='normal', mouth='grin',
                  belt='#f5efe8'),
 'bunny': dict(arch='round', skin='#f5efe8', shirt='#f5efe8', eyes='normal',
               eyecolor='#b06a80', mouth='line'),
 'fairy': dict(arch='human', skin='#f5d5a8', shirt='#b08ac6', pants='#8a5aa0',
               hair='#e9c76a', hairstyle='long', eyes='normal', eyecolor='#6a4a9a',
               mouth='grin', extra=[('wings', '#e8e0ff')]),
 'vampire': dict(arch='human', skin='#d5c6c6', shirt='#2a2a36', pants='#22222c',
                 hair='#141420', hairstyle='short', eyes='glow', eyecolor='#c94b1a',
                 mouth='fang', capecolor='#241430', capehem='#5a2a6a'),
 'pirate': dict(arch='human', skin='#efc9a0', shirt='#e8e8ea', pants='#3a2818',
                hat='tricorn', hatcolor='#141010', hair='#141010', hairstyle='bald',
                beard='#241c1c', beardsize='full',
                eyes='normal', mouth='grin', extra=[('patch',)]),
 'witch': dict(arch='robed', skin='#7ea86a', shirt='#1a2a30', hat='point',
               hatcolor='#141020', hattrim='#3a5a4a', hair='#141018',
               hairstyle='long', eyes='glow', eyecolor='#5bb083', mouth='none',
               folds=3),
 'centaur': dict(arch='centaur', skin='#e8b888', pants='#8b6a3a',
                 eyes='normal', mouth='grin'),
 'krampus': dict(arch='hulk', skin='#5a2812', muzzle='#5a2812', chest=None,
                 eyes='glow', eyecolor='#c94b1a', mouth='fang'),
 'fathertime': dict(arch='robed', skin='#e5c8a5', shirt='#5a4020',
                    hair='#f5efe8', hairstyle='short', beard='#f5efe8',
                    beardsize='long', eyes='normal', mouth='none', folds=4),
 'mothernature': dict(arch='robed', skin='#f5d5a8', shirt='#3a8a4a',
                      hair='#a4642a', hairstyle='long', eyes='normal',
                      mouth='grin', folds=3),
 'raboddog': dict(arch='beast', skin='#5a3a20', muzzle='#a88458',
                  eyes='glow', eyecolor='#c94b1a', mouth='fang',
                  extra=[('ears', '#5a3a20')]),
 'chupacabra': dict(arch='beast', build='lean', skin='#4a5a3a', muzzle='#7a9058',
                    eyes='glow', eyecolor='#f4c25a', mouth='fang'),
 'cupid': dict(arch='round', skin='#f7dcb4', shirt='#f7dcb4', eyes='normal',
               mouth='grin', hair='#d8a24a', hairstyle='bald',
               extra=[('wings', '#f2f4ff')]),
 'medusa': dict(arch='robed', skin='#86c46e', shirt='#2f7a4a',
                eyes='glow', eyecolor='#f4c25a', mouth='line', folds=3,
                hair='#57b56a', hairstyle='wild'),
 'cyclops': dict(arch='hulk', skin='#c8956a', muzzle='#c8956a', chest=None,
                 eyes='one', eyecolor='#3a2412', mouth='open',
                 hair='#5a3a2a', hairstyle='short'),
 'phoenix': dict(arch='bird', skin='#e04520', chest='#f4922a', nowings=True,
                 eyes='glow', eyecolor='#f8d84a', mouth='none',
                 extra=[('flame', '#f8d84a')]),
 'dragon': dict(arch='dragon', skin='#2e8a3a', muzzle='#8fd06a',
                eyes='normal', eyecolor='#141018', mouth='none',
                extra=[('horns', '#f4c25a')]),
 'sasquatch': dict(arch='hulk', skin='#4a2014', muzzle='#b08256', chest='#5e3220',
                   eyes='normal', mouth='line'),
 'yeti': dict(arch='hulk', skin='#f0f6fb', muzzle=None, chest='#dce8f2',
              eyes='hidden', mouth='none'),
 'nessie': dict(arch='nessie', skin='#2a7a5a', muzzle='#4aa878',
                eyes='hidden', mouth='none'),
 'horseman': dict(arch='human', skin='#f4922a', shirt='#2a1e2a', pants='#141014',
                  eyes='carved', eyecolor='#5e2a06', mouth='none'),
 'zombie': dict(arch='human', skin='#8aae64', shirt='#e8e8e6', pants='#3a5a8a',
                hair='#3a5424', hairstyle='short', eyes='cartoon',
                eyecolor='#8a2b2a', mouth='open', noarms=True),
 'werewolf': dict(arch='hulk', skin='#4a3524', muzzle=None, chest='#6a4e34',
                  wolfmuzzle='#a88458', eyes='glow', eyecolor='#f4c25a',
                  mouth='none'),
 'strongman': dict(arch='hulk', skin='#e8b888', muzzle='#e8b888', chest=None,
                   hair='#2a1c10', hairstyle='bald',
                   eyes='normal', mouth='none'),
 'beardedlady': dict(arch='human', skin='#f2ceaa', shirt='#b0447a', pants='#7a2a54',
                     hair='#3a2414', hairstyle='long', beard='#4a2f1a',
                     beardsize='long', eyes='normal', mouth='none'),
 'ringmaster': dict(arch='human', skin='#e8b888', shirt='#c93030', pants='#141014',
                    hat='top', hatcolor='#141010', hattrim='#c93030',
                    beard='#141010', beardsize='moustache',
                    eyes='normal', mouth='none', belt='#f4c25a'),
 'acrobat': dict(arch='human', skin='#e8b888', shirt='#c93a6a', pants='#c93a6a',
                 hair='#5a3a1c', hairstyle='short', eyes='normal', mouth='grin',
                 boot='#f4c25a'),
 'firebreather': dict(arch='human', skin='#c8956a', shirt='#3a2418', pants='#3a2418',
                      hair='#141010', hairstyle='short', eyes='angry',
                      mouth='open', extra=[('breath', '#f4922a')]),
 'blackcat': dict(arch='cat', skin='#141018', chest='#eaeaea', muzzle='#d8d8dc',
                  eyes='glow', eyecolor='#f4c25a', mouth='none', eyespread=3,
                  extra=[('ears', '#141018')]),
 'humpty': dict(arch='egg', skin='#f2e2c4', shirt='#c93030', boot='#6a6a72',
                eyes='cartoon', eyecolor='#141018', mouth='grin'),
}

# The back poses exist because of where the camera stands: the viewer is
# behind home plate, so the batter and any runner heading up the screen
# are seen from behind. A batter who faces the camera while "looking at"
# the pitcher breaks the whole view.
# The pitcher's two frames and the batter's swing came later: drawField had
# been asking for windup and release since the first camera, and the draw
# routine answered with idle because no such frame existed.
POSES = ('idle', 'run1', 'run2', 'back', 'backrun1', 'backrun2',
         'windup', 'release', 'swing')


# ------------------------------------------------------------------ faces
# THE CASTING SHEET. One row per character, and the rule is that no two
# rows may be identical: the check at the bottom of this file enforces it.
#
# It lives here rather than inside SPECS because SPECS is about what a
# character is made of and this is about who they are, and because thirty
# one characters ended up sharing one face precisely by nobody being able
# to see, in a wall of dict literals, that they had. As a table you can
# read down a column.
#
#   eyes      round oval wide bead squint sleepy lash, plus the special
#             whole face styles (glow angry one carved goggles cartoon)
#   sp        eye spread. 3 close set, 4 default, 5 wide set
#   brow      flat angry worried high bushy, or None. Two pixels a side
#             and the single most identifying thing on a face this size
#   nose      dot button bulb long beak, or None
#   mouth     line grin smirk frown oh buck fang open, or none.
#             There was a 'teeth' as well and it is gone: white teeth
#             between an upper and a lower lip read as a jaw clenched
#             on them at this size, however the corners are curved, and
#             a mouth that reads as a grimace on a hero is not a mouth
#
# Characters whose signature draws its own face are absent: Popeye, Pooh,
# Felix, the Yeti, Nessie and the Headless Horseman.
FACES = {
    # the leads
    'kong':         dict(eyes='round',  eyespread=3, brow='bushy',   nose='bulb',   mouth='none'),
    'franky':       dict(eyes='wide',   eyespread=5, brow='flat',    nose='long',   mouth='frown'),
    'dracula':      dict(eyes='round',  eyespread=4, brow='angry',   nose='long',   mouth='fang'),
    'liberty':      dict(eyes='oval',   eyespread=4, brow='flat',    nose='button', mouth='line'),
    # the boys, who were the whole problem: four of them in hats, one face
    'peter':        dict(eyes='round',  eyespread=3, brow='high',    nose='button', mouth='smirk', freckles=True),
    'jack':         dict(eyes='round',  eyespread=4, brow='worried', nose='button', mouth='oh',    freckles=True),
    'tom':          dict(eyes='round',  eyespread=3, brow='flat',    nose='button', mouth='smirk'),
    'huck':         dict(eyes='sleepy', eyespread=5, brow='flat',    nose='button', mouth='grin',  freckles=True),
    'flash':        dict(eyes='round',  eyespread=5, brow='flat',    nose='long',   mouth='open'),
    'tintin':       dict(eyes='bead',   eyespread=4,                 nose='dot',    mouth='line'),
    'robin':        dict(eyes='round',  eyespread=4, brow='flat',    nose='button', mouth='grin'),
    # the detectives. Both wear a brim that owns the brow row, so neither
    # gets one: drawn anyway it sits ON the hat.
    'sherlock':     dict(eyes='oval',   eyespread=4,                 nose='long',   mouth='line'),
    'tracy':        dict(eyes='angry',  eyespread=4,                 nose='long',   mouth='frown'),
    'lupin':        dict(eyes='oval',   eyespread=5, brow='flat',    nose='long',   mouth='smirk'),
    # the girls
    'alice':        dict(eyes='lash',   eyespread=4, brow='high',    nose='dot',    mouth='line',  blush=True),
    'dorothy':      dict(eyes='lash',   eyespread=3, brow='worried', nose='dot',    mouth='grin',  freckles=True, blush=True),
    'fairy':        dict(eyes='lash',   eyespread=5, brow='high',    nose='dot',    mouth='line',  blush=True),
    'beardedlady':  dict(eyes='lash',   eyespread=4, brow='high',    nose='button', mouth='none',  blush=True),
    'mothernature': dict(eyes='oval',   eyespread=5, brow='high',    nose='dot',    mouth='grin',  blush=True),
    'mrsclaus':     dict(eyes='oval',   eyespread=4, brow='high',    nose='dot',    mouth='grin',  blush=True),
    # the seasonal
    'santa':        dict(eyes='squint', eyespread=5, brow='bushy',                  mouth='none'),
    'bunny':        dict(eyes='round',  eyespread=5,                                mouth='buck'),
    'cupid':        dict(eyes='round',  eyespread=4, brow='high',    nose='button', mouth='oh',    blush=True),
    'fathertime':   dict(eyes='sleepy', eyespread=4, brow='bushy',   nose='bulb',   mouth='none'),
    # the circus
    'strongman':    dict(eyes='round',  eyespread=5, brow='flat',    nose='button', mouth='none'),
    'ringmaster':   dict(eyes='round',  eyespread=3, brow='high',    nose='bulb',   mouth='none'),
    'acrobat':      dict(eyes='round',  eyespread=5, brow='high',    nose='dot',    mouth='grin'),
    'firebreather': dict(eyes='angry',  eyespread=4, brow='flat',    nose='bulb',   mouth='none'),
    # the monsters
    'hyde':         dict(eyes='angry',  eyespread=5, brow='bushy',   nose='button', mouth='none'),
    'vampire':      dict(eyes='glow',   eyespread=3, brow='angry',   nose='long',   mouth='fang'),
    'witch':        dict(eyes='glow',   eyespread=5, brow='angry',   nose='beak',   mouth='none'),
    'krampus':      dict(eyes='glow',   eyespread=4, brow='angry',   nose='long',   mouth='fang'),
    'medusa':       dict(eyes='glow',   eyespread=4, brow='flat',    nose='dot',    mouth='line'),
    'werewolf':     dict(eyes='glow',   eyespread=5, brow='bushy',                  mouth='none'),
    'blackcat':     dict(eyes='glow',   eyespread=4,                                mouth='none'),
    'phoenix':      dict(eyes='glow',   eyespread=5,                                mouth='none'),
    'raboddog':     dict(eyes='glow',   eyespread=3,                                mouth='fang'),
    'chupacabra':   dict(eyes='glow',   eyespread=5,                                mouth='fang'),
    'cyclops':      dict(eyes='one',                 brow='flat',    nose='bulb',   mouth='open'),
    'dragon':       dict(eyes='wide',   eyespread=5, brow='angry',                  mouth='none'),
    'sasquatch':    dict(eyes='sleepy', eyespread=3, brow='bushy',   nose='bulb',   mouth='line'),
    'zombie':       dict(eyes='cartoon', eyespread=5, brow='worried',               mouth='open'),
    'scarecrow':    dict(eyes='cartoon', eyespread=4, brow='worried',               mouth='none'),
    'humpty':       dict(eyes='cartoon', eyespread=4, brow='high',   nose='button', mouth='grin', blush=True),
    # the rest
    'invisible':    dict(eyes='goggles',                                            mouth='none'),
    'pirate':       dict(eyes='round',  eyespread=3, brow='angry',   nose='button', mouth='grin'),
    'centaur':      dict(eyes='oval',   eyespread=3, brow='flat',    nose='long',   mouth='line'),
    'lion':         dict(eyes='wide',   eyespread=3, brow='worried', nose='bulb',   mouth='frown'),
}

for _k, _f in FACES.items():
    assert _k in SPECS, f'FACES has no character {_k}'
    SPECS[_k].update(_f)

# No two characters may wear the same face. This is the guard for the bug
# that produced the table: the old eye routine ignored eyespread, so half
# the roster was identical and nothing anywhere said so.
_seen = {}
for _k, _s in SPECS.items():
    _sig = tuple(_s.get(_f) for _f in
                 ('eyes', 'eyespread', 'brow', 'nose', 'mouth', 'freckles', 'blush'))
    if _sig[0] == 'hidden':
        continue                    # these draw their own face in a signature
    if _sig in _seen:
        raise SystemExit(f'same face: {_k} and {_seen[_sig]} -> {_sig}')
    _seen[_sig] = _k


def js_block(key, frames):
    """frames: {pose: (pal, rows)}. Palettes are merged so a character
    carries one palette across all of its frames."""
    merged = {}
    for pose in POSES:
        for ch, hexv in frames[pose][0].items():
            merged[hexv] = None
    order = sorted(merged.keys())
    alpha = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    assert len(order) <= len(alpha), f'{key} needs {len(order)} colors'
    code = {hexv: alpha[i] for i, hexv in enumerate(order)}
    pal_str = ', '.join(f"{code[h]}:'{h}'" for h in order)
    out = [f"  {key}:{{p:{{{pal_str}}},f:{{"]
    for pose in POSES:
        pal, rows = frames[pose]
        remapped = []
        for r in rows:
            remapped.append(''.join('.' if c == '.' else code[pal[c]] for c in r))
        body = ','.join(f"'{r}'" for r in remapped)
        out.append(f"    {pose}:[{body}],")
    out.append("  }},")
    return '\n'.join(out)


def main():
    blocks = []
    for key, spec in SPECS.items():
        frames = {}
        for pose in POSES:
            cv = build(spec, pose, key=key)
            pal, rows = cv.emit()
            assert len(rows) == OUT_H, f'{key}/{pose} rows={len(rows)}'
            assert all(len(r) == W for r in rows), f'{key}/{pose} width'
            frames[pose] = (pal, rows)
        blocks.append(js_block(key, frames))
    print(f"const V2_W = {W}, V2_H = {OUT_H};")
    print("const V2_SPRITES = {")
    print('\n'.join(blocks))
    print("};")


if __name__ == '__main__':
    main()
