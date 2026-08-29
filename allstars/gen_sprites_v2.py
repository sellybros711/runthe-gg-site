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
        self.spec = shade(self.base, 0.55)
        self.lit = shade(self.base, 0.26)
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
        self.px = [[None] * W for _ in range(H)]
        self.owner = [[None] * W for _ in range(H)]

    def set(self, x, y, rgb, ramp=None):
        x, y = int(x), int(y)
        if 0 <= x < W and 0 <= y < H:
            self.px[y][x] = rgb
            self.owner[y][x] = ramp

    def get(self, x, y):
        if 0 <= x < W and 0 <= y < H:
            return self.px[y][x]
        return None

    def sphere(self, cx, cy, rx, ry, ramp, spec=True, ymax=None):
        """ymax cuts the sphere off below that row, so a hair or hat shape
        can be a CAP that follows the skull's own curve rather than a
        separate wider ellipse pasted over it."""
        for y in range(H):
            if ymax is not None and y > ymax:
                break
            for x in range(W):
                nx = (x + 0.5 - cx) / rx
                ny = (y + 0.5 - cy) / ry
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
                self.set(x, y, ramp.at(l, spec), ramp)

    def cyl(self, x0, y0, x1, y1, ramp, round_top=0, round_bot=0, spec=False):
        """Vertical cylinder; shading varies across x like a limb."""
        x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                u = 0.0 if x1 == x0 else (x + 0.5 - x0) / (x1 + 1 - x0) * 2 - 1
                if round_top:
                    ty = (y - y0) / max(1, round_top)
                    if ty < 1 and abs(u) > math.sqrt(max(0.0, 1 - (1 - ty) ** 2)):
                        continue
                if round_bot:
                    by = (y1 - y) / max(1, round_bot)
                    if by < 1 and abs(u) > math.sqrt(max(0.0, 1 - (1 - by) ** 2)):
                        continue
                nz = math.sqrt(max(0.0, 1 - u * u))
                n = (u, -0.15, nz)
                ln = math.sqrt(sum(v * v for v in n)) or 1.0
                n = tuple(v / ln for v in n)
                l = (sum(n[i] * LIGHT[i] for i in range(3)) + 1) / 2
                if abs(u) > 0.88:
                    l *= 0.6
                self.set(x, y, ramp.at(l, spec), ramp)

    def taper(self, y0, y1, w0, w1, ramp, cx=CX, folds=0):
        """A robe or gown: a cylinder whose width grows down the shape, so
        it reads as cloth hanging rather than a box. Optional vertical
        fold lines that darken with the same light model."""
        for y in range(int(y0), int(y1) + 1):
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
                self.set(x, y, ramp.at(l), ramp)
            if folds:
                for k in range(folds):
                    fu = -0.55 + 1.1 * (k / max(1, folds - 1))
                    fx = int(cx + fu * half)
                    if abs(fu) < 0.92:
                        self.set(fx, y, ramp.at(0.22), ramp)

    def rect(self, x0, y0, x1, y1, ramp, l=0.55):
        for y in range(int(y0), int(y1) + 1):
            for x in range(int(x0), int(x1) + 1):
                u = (x - x0) / max(1, (x1 - x0))
                self.set(x, y, ramp.at(l + 0.26 * (0.5 - u)), ramp)

    def tri(self, pts, ramp, l=0.55):
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
        self.set(x, y, rgb, None)

    def outline(self):
        """Outer silhouette in shared dark; interior material seams in the
        darker material's own line color."""
        adds = []
        for y in range(H):
            for x in range(W):
                if self.px[y][x] is not None:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    if self.get(x + dx, y + dy) is not None:
                        o = self.owner[y + dy][x + dx] if 0 <= y + dy < H and 0 <= x + dx < W else None
                        adds.append((x, y, o))
                        break
        for (x, y, o) in adds:
            self.set(x, y, SIL, o)
        edits = []
        for y in range(H):
            for x in range(W):
                o = self.owner[y][x]
                if o is None or self.px[y][x] is None:
                    continue
                for dx, dy in ((1, 0), (0, 1)):
                    nx, ny = x + dx, y + dy
                    if not (0 <= nx < W and 0 <= ny < H):
                        continue
                    o2 = self.owner[ny][nx]
                    if o2 is None or o2 is o:
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
        for y in range(H):
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
    """Eyes and mouth. Eye style varies so characters are not all the same
    doll: normal, glow, angry, patch, hidden, cartoon."""
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
    for sx in (-sp, sp):
        x = int(CX + sx)
        if style == 'glow':
            g = hex2rgb(ec or '#f4c25a')
            cv.dot(x - 1, y - 1, shade(skin.base, -0.42))
            cv.dot(x, y - 1, shade(skin.base, -0.42))
            cv.dot(x, y, g)
            cv.dot(x - 1, y, shade(g, 0.45))
            cv.dot(x, y + 1, shade(g, -0.40))
        elif style == 'angry':
            cv.dot(x - 1, y - 1, shade(skin.base, -0.50))
            cv.dot(x, y - 1, shade(skin.base, -0.50))
            cv.dot(x + 1, y - 1, shade(skin.base, -0.50))
            cv.dot(x, y, (248, 248, 250))
            cv.dot(x, y + 1, hex2rgb(ec or '#1a1420'))
        elif style == 'cartoon':
            cv.dot(x - 1, y - 1, (250, 250, 252))
            cv.dot(x, y - 1, (250, 250, 252))
            cv.dot(x - 1, y, (250, 250, 252))
            cv.dot(x, y, hex2rgb(ec or '#141018'))
            cv.dot(x, y + 1, (250, 250, 252))
        else:
            cv.dot(x, y, (250, 250, 252))
            cv.dot(x - 1, y, (218, 220, 228))
            cv.dot(x, y + 1, hex2rgb(ec or '#1a1420'))
    m = spec.get('mouth', 'line')
    my = int(cy + 6)
    mc = shade(skin.base, -0.42)
    if m == 'none':
        return
    if m == 'fang':
        for x in range(int(CX) - 2, int(CX) + 3):
            cv.dot(x, my, (92, 26, 32))
        cv.dot(int(CX) - 2, my + 1, (250, 250, 252))
        cv.dot(int(CX) + 2, my + 1, (250, 250, 252))
    elif m == 'grin':
        for x in range(int(CX) - 3, int(CX) + 4):
            cv.dot(x, my, mc)
        cv.dot(int(CX) - 4, my - 1, mc)
        cv.dot(int(CX) + 4, my - 1, mc)
    elif m == 'open':
        for x in range(int(CX) - 2, int(CX) + 3):
            cv.dot(x, my, (96, 40, 44))
            cv.dot(x, my + 1, (72, 28, 34))
    else:
        for x in range(int(CX) - 2, int(CX) + 3):
            cv.dot(x, my, mc)


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
        cv.cyl(lo, y, hi, y, r)


def hair(cv, spec):
    h = spec.get('hair')
    if not h:
        return
    r = Ramp(h)
    kind = spec.get('hairstyle', 'short')
    # Every cap is drawn INSIDE the skull box and cut off at the brow, so
    # the outline the eye follows is the head's, not the hair's.
    cap = lambda rx, ry, dy=0.0: cv.sphere(CX, HEAD_CY + dy, HEAD_RX * rx,
                                           HEAD_RY * ry, r, ymax=HEAD_BROW)
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
        for dx, up, lean in ((-6.0, 4, -2), (-2.0, 7, -1), (2.5, 5, 1), (6.5, 6, 3)):
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
        cv.sphere(CX, HEAD_CY + 8.6, HEAD_RX * 0.94, HEAD_RY * 0.62, r)
    elif size == 'long':
        cv.sphere(CX, HEAD_CY + 8.2, HEAD_RX * 0.96, HEAD_RY * 0.58, r)
        cv.taper(HEAD_CY + 10, HEAD_CY + 19, 13, 7, r)
    elif size == 'moustache':
        cv.rect(CX - 5, HEAD_CY + 4, CX + 5, HEAD_CY + 5, r, l=0.6)
        cv.dot(CX - 6, HEAD_CY + 4, shade(r.base, -0.2))
        cv.dot(CX + 6, HEAD_CY + 4, shade(r.base, -0.2))


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
                                         HEAD_RY * ry, c, ymax=HEAD_CY - 2)
    if hw == 'cap':
        crown(0.99, 0.99, -0.8)
        cv.rect(CX - 10, HEAD_CY - 3, CX + 3, HEAD_CY - 2, c, l=0.40)
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
        elif kind == 'ears':                # cat / animal ears
            r = Ramp(e[1])
            cv.tri([(CX - 9, 1), (CX - 4, 6), (CX - 12, 6)], r, l=0.6)
            cv.tri([(CX + 9, 1), (CX + 4, 6), (CX + 12, 6)], r, l=0.5)
        elif kind == 'wings':
            r = Ramp(e[1])
            for side in (-1, 1):
                bx = CX + side * 11
                cv.sphere(bx, 24, 5.2, 7.0, r, spec=False)
        elif kind == 'cape':
            r = Ramp(e[1])
            cv.taper(22, 36, 22, 26, r, folds=3)
        elif kind == 'monocle':
            cv.dot(CX + 5, HEAD_CY - 1, (240, 226, 150))
            cv.dot(CX + 3, HEAD_CY - 1, (240, 226, 150))
            cv.dot(CX + 4, HEAD_CY - 2, (240, 226, 150))
            cv.dot(CX + 4, HEAD_CY + 1, (240, 226, 150))
        elif kind == 'patch':               # eye patch
            cv.rect(CX - 8, HEAD_CY - 2, CX - 1, HEAD_CY + 1, Ramp('#141018'), l=0.4)
            cv.rect(CX - 8, HEAD_CY - 3, CX + 9, HEAD_CY - 3, Ramp('#141018'), l=0.5)
        elif kind == 'bolt':
            for sx in (-10, 10):
                cv.dot(CX + sx, HEAD_CY + 3, (206, 170, 92))
                cv.dot(CX + sx, HEAD_CY + 4, (150, 118, 56))
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
    if pose == 'run1':
        la, ra = -1, 1
    elif pose == 'run2':
        la, ra = 1, -1
    else:
        la, ra = 0, 0
    cv.cyl(CX - spread - 2, top + max(0, la), CX - spread, bot + la, pants)
    cv.cyl(CX + spread, top + max(0, ra), CX + spread + 2, bot + ra, pants)
    cv.cyl(CX - spread - 2, bot - 1 + la, CX - spread, bot + la, boot)
    cv.cyl(CX + spread, bot - 1 + ra, CX + spread + 2, bot + ra, boot)


def arms(cv, sleeve, skin, pose, top=24, length=7, out=0):
    if pose == 'run1':
        lo, ro = -2, 2
    elif pose == 'run2':
        lo, ro = 2, -2
    else:
        lo, ro = 0, 0
    for side, off in ((-1, lo), (1, ro)):
        x0 = CX + side * (9 + out) - 1
        cv.cyl(x0, top + off, x0 + 2, top + length + off, sleeve, round_bot=1)
        cv.cyl(x0, top + length + off, x0 + 2, top + length + 2 + off, skin, round_bot=1)


def arch_human(cv, spec, pose):
    skin = Ramp(spec.get('skin', '#f0c088'))
    shirt = Ramp(spec.get('shirt', '#c93030'))
    pants = Ramp(spec.get('pants', '#2a3550'))
    boot = Ramp(spec.get('boot', '#2a2018'))
    legs(cv, pants, boot, pose)
    arms(cv, shirt, skin, pose)
    cv.cyl(CX - TORSO_HW, 23, CX + TORSO_HW, 31, shirt, round_bot=1)
    if spec.get('belt'):
        cv.rect(CX - TORSO_HW, 29, CX + TORSO_HW, 30, Ramp(spec['belt']), l=0.45)
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
    lo, ro = (-2, 2) if pose == 'run1' else ((2, -2) if pose == 'run2' else (0, 0))
    for side, off in ((-1, lo), (1, ro)):
        sx = CX + side * 8
        cv.sphere(sx, 23.0 + off, 4.6, 4.2, body, spec=False)
        cv.cyl(sx - 2, 23 + off, sx + 2, 33 + off, body, round_bot=2)
        cv.sphere(sx, 33.5 + off, 3.0, 2.6, hand, spec=False)
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
    cv.sphere(CX, 27.5, 9.6, 8.4, body)
    legs(cv, body, boot, pose, top=34, bot=38, spread=3)
    lo, ro = (-1, 1) if pose == 'run1' else ((1, -1) if pose == 'run2' else (0, 0))
    for side, off in ((-1, lo), (1, ro)):
        cv.cyl(CX + side * 10 - 1, 24 + off, CX + side * 10 + 1, 29 + off, body, round_bot=1)
    cv.sphere(CX, HEAD_CY + 1, HEAD_RX * 0.94, HEAD_RY * 0.94, skin)


def arch_egg(cv, spec, pose):
    """One continuous egg: head and body are the same form."""
    body = Ramp(spec.get('skin', '#f2e2c4'))
    boot = Ramp(spec.get('boot', '#3a2818'))
    band = spec.get('shirt')
    cv.sphere(CX, 18.0, 10.0, 15.0, body)
    if band:
        cv.rect(CX - 9, 22, CX + 9, 24, Ramp(band), l=0.5)
    lo, ro = (-1, 1) if pose == 'run1' else ((1, -1) if pose == 'run2' else (0, 0))
    for side, off in ((-1, lo), (1, ro)):
        cv.cyl(CX + side * 4 - 1, 33 + off, CX + side * 4 + 1, 37 + off, body)
        cv.cyl(CX + side * 4 - 1, 37 + off, CX + side * 4 + 1, 38 + off, boot)


def arch_robed(cv, spec, pose):
    """A figure in a floor length robe: Liberty, Father Time, Witch."""
    robe = Ramp(spec.get('shirt', '#6db8a2'))
    skin = Ramp(spec.get('skin', '#f0c088'))
    cv.taper(21, 38, 12, 24, robe, folds=spec.get('folds', 3))
    lo, ro = (-1, 1) if pose == 'run1' else ((1, -1) if pose == 'run2' else (0, 0))
    for side, off in ((-1, lo), (1, ro)):
        cv.cyl(CX + side * 8 - 1, 23 + off, CX + side * 8 + 1, 30 + off, robe, round_bot=1)
        cv.cyl(CX + side * 8 - 1, 30 + off, CX + side * 8 + 1, 32 + off, skin, round_bot=1)
    cv.sphere(CX, HEAD_CY, HEAD_RX * 0.94, HEAD_RY * 0.94, skin)


def arch_beast(cv, spec, pose):
    """Four legged or low slung: dog, chupacabra, nessie, dragon."""
    body = Ramp(spec.get('skin', '#5a3a20'))
    boot = Ramp(spec.get('boot', shade(body.base, -0.4)))
    cv.sphere(CX, 28.0, 10.4, 6.2, body, spec=False)
    off = 1 if pose == 'run1' else (-1 if pose == 'run2' else 0)
    for lx in (-8, -3, 3, 8):
        o = off if lx < 0 else -off
        cv.cyl(CX + lx - 1, 31 + o, CX + lx + 1, 37 + o, body)
        cv.cyl(CX + lx - 1, 36 + o, CX + lx + 1, 37 + o, boot)
    # neck, then a forward facing head centred over the body
    cv.cyl(CX - 2, 19, CX + 2, 26, body, round_top=1)
    cv.sphere(CX, 14.0, 7.8, 8.4, body)
    if spec.get('muzzle'):
        # The muzzle needs its own value, not just its own hue. Drawn in a
        # near neighbour of the body color, the only thing that showed was
        # the sphere's rim shading, which read as a dark V scored into the
        # face rather than as a snout.
        m = Ramp(shade(spec['muzzle'], 0.18))
        cv.sphere(CX, 18.0, 5.2, 3.8, m)
        cv.sphere(CX, 16.4, 1.8, 1.4, Ramp(shade(spec['muzzle'], -0.55)))


def arch_cat(cv, spec, pose):
    body = Ramp(spec.get('skin', '#141018'))
    belly = Ramp(spec.get('chest', '#eaeaea'))
    cv.sphere(CX, 27.0, 8.0, 7.4, body)
    cv.sphere(CX, 28.5, 4.4, 4.6, belly, spec=False)
    legs(cv, body, body, pose, top=33, bot=38, spread=3)
    cv.sphere(CX, 13.0, 9.4, 8.2, body)
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
    cv.sphere(CX, 25.0, 8.0, 9.0, body)
    off = 2 if pose == 'run1' else (-2 if pose == 'run2' else 0)
    for side in (-1, 1):
        cv.sphere(CX + side * 10, 24 + side * off, 4.6, 7.4, wing, spec=False)
    cv.cyl(CX - 4, 34, CX - 2, 38, wing)
    cv.cyl(CX + 2, 34, CX + 4, 38, wing)
    cv.sphere(CX, 12.0, 8.4, 7.6, body)


ARCH = {
    'human': arch_human, 'hulk': arch_hulk, 'round': arch_round,
    'egg': arch_egg, 'robed': arch_robed, 'beast': arch_beast,
    'cat': arch_cat, 'bird': arch_bird,
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
              ymax=HEAD_CY + 6)
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
    brow = shade(body.base, -0.45)
    for x in range(int(CX) - 6, int(CX) + 7):
        cv.dot(x, 10, brow)
    # the big open grin: white teeth over a red mouth
    for x in range(int(CX) - 4, int(CX) + 5):
        cv.dot(x, 17, (245, 243, 240))
        cv.dot(x, 18, (245, 243, 240))
        cv.dot(x, 19, (150, 40, 44))
    cv.dot(CX - 5, 17, (110, 30, 34))
    cv.dot(CX + 5, 17, (110, 30, 34))


def sig_franky(cv, spec, pose, back):
    ink = Ramp('#181418')
    # flat topped black hair, squared past the skull's curve
    cv.rect(CX - 9, 3, CX + 9, 8, ink, l=0.5)
    cv.sphere(CX, HEAD_CY - 1.0, HEAD_RX, HEAD_RY * 0.98, ink, ymax=8)
    # jagged fringe
    drops = (1, 2, 0, 2, 1, 0, 2, 1, 2, 0)
    for i, x in enumerate(range(int(CX) - 9, int(CX) + 10, 2)):
        for k in range(drops[i % 10] + 1):
            cv.dot(x, 9 + k, ink.mid)
            cv.dot(x + 1, 9 + k, ink.mid)
    if back:
        cv.sphere(CX, HEAD_CY, HEAD_RX * 0.99, HEAD_RY * 0.96, ink,
                  ymax=HEAD_CY + 4)
        return
    # heavy brow right over the eyes
    for x in range(int(CX) - 6, int(CX) + 7):
        cv.dot(x, 11, ink.mid)


def sig_popeye(cv, spec, pose, back):
    skin = Ramp(spec.get('skin', '#f0c088'))
    lo, ro = (-2, 2) if pose == 'run1' else ((2, -2) if pose == 'run2' else (0, 0))
    for side, off in ((-1, lo), (1, ro)):
        ax = CX + side * 10.5
        # THE forearms: a swollen oval where a wrist should be
        cv.sphere(ax, 29 + off, 3.6, 4.6, skin, spec=False)
        cv.sphere(ax + side * 0.5, 33.5 + off, 2.4, 2.2, skin, spec=False)
    # sailor collar
    col = Ramp('#2a4a8a')
    cv.rect(CX - 5, 22, CX + 5, 23, col, l=0.55)


def sig_dracula_pre(cv, spec, pose, back):
    if back:
        return              # from behind the cape covers the body: see post
    cape = Ramp('#1a1220')
    cv.taper(20, 37, 14, 30, cape, folds=2)
    cv.rect(CX - 14, 36, CX + 14, 37, Ramp('#7a1620'), l=0.5)


def sig_dracula_post(cv, spec, pose, back):
    cape = Ramp('#1a1220')
    if back:
        cv.taper(18, 38, 16, 30, cape, folds=3)
        cv.rect(CX - 14, 37, CX + 14, 38, Ramp('#7a1620'), l=0.5)
    # the high collar, framing the head
    cv.tri([(CX - 9, 20), (CX - 12, 8), (CX - 4, 16)], cape, l=0.5)
    cv.tri([(CX + 9, 20), (CX + 12, 8), (CX + 4, 16)], cape, l=0.4)


def sig_liberty(cv, spec, pose, back):
    skin = Ramp(spec.get('skin', '#6db8a2'))
    ax = CX + 9.5
    cv.cyl(ax - 1, 9, ax + 1, 22, skin, round_bot=1)      # the raised arm
    cv.rect(ax - 2.5, 7, ax + 2.5, 8, Ramp('#3f7f6d'), l=0.5)
    cv.sphere(ax, 4.0, 2.2, 3.0, Ramp('#f4b03a'), spec=True)  # the flame


SIGNATURES = {
    'kong': {'post': sig_kong},
    'franky': {'post': sig_franky},
    'popeye': {'post': sig_popeye},
    'dracula': {'pre': sig_dracula_pre, 'post': sig_dracula_post},
    'liberty': {'post': sig_liberty},
}


def build(spec, pose='idle', key=None):
    cv = Canvas()
    back = pose.startswith('back')
    body_pose = {'back': 'idle', 'backrun1': 'run1', 'backrun2': 'run2'}[pose] if back else pose
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
        cy = 14.0
    elif a == 'cat':
        cy = 13.0
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
 'kong': dict(arch='hulk', skin='#3f2716', muzzle='#b0855a', chest='#a87b4c',
              eyes='normal', eyespread=3, mouth='none'),
 'franky': dict(arch='hulk', skin='#7ea86a', muzzle=None, shirt='#5b3a28',
                hand='#7ea86a', pants='#2c3a5c', chest='#8a8f96',
                eyes='normal', mouth='open', extra=[('bolt',)]),
 'popeye': dict(arch='human', skin='#f0c088', shirt='#e9e9ea', pants='#1c4f96',
                hat='cap', hatcolor='#f2f2f3', hair='#c25c1a', hairstyle='bald',
                eyes='angry', mouth='line', extra=[('pipe',)]),
 'dracula': dict(arch='human', skin='#cabcbc', shirt='#3a3a44', pants='#2a2a32',
                 hair='#141018', hairstyle='short', eyes='glow', eyecolor='#c94b1a',
                 mouth='fang'),
 'liberty': dict(arch='robed', skin='#6db8a2', shirt='#6db8a2', hat='crown',
                 hatcolor='#f4c25a', eyes='normal', mouth='line', folds=4),
 'peter': dict(arch='human', skin='#f2ceaa', shirt='#3a8a4a', pants='#3a6a3a',
               hat='cap', hatcolor='#3a8a4a', hair='#c07a2a', hairstyle='short',
               eyes='normal', mouth='grin'),
 'felix': dict(arch='cat', skin='#141018', chest='#f0f0f2', muzzle='#f7f7f9',
               eyes='cartoon', eyecolor='#141018', mouth='none', eyespread=3,
               extra=[('ears', '#141018')]),
 'jack': dict(arch='human', skin='#f0c99a', shirt='#3a7f4a', pants='#5c3a1c',
              hair='#c9a256', hairstyle='mop', eyes='normal', mouth='grin'),
 'tom': dict(arch='human', skin='#f0c99a', shirt='#c94b1a', pants='#5a4a2a',
             hat='straw', hatcolor='#c9a256', hair='#c9a256', hairstyle='bald',
             eyes='normal', mouth='grin'),
 'huck': dict(arch='human', skin='#efc9a0', shirt='#a45b1a', pants='#5a4a2a',
              hat='straw', hatcolor='#b8933f', hair='#5a3618', hairstyle='bald',
              eyes='normal', mouth='grin'),
 'flash': dict(arch='human', skin='#f5d2a3', shirt='#c94b1a', pants='#3a2a1a',
               hair='#e9c76a', hairstyle='short', eyes='normal', mouth='line',
               belt='#f4c25a'),
 'invisible': dict(arch='human', skin='#f0e4d4', shirt='#4a4a5a', pants='#242430',
                   hat='brim', hatcolor='#12121a', hattrim='#2a2a3a',
                   eyes='goggles', eyecolor='#15151f', mouth='none',
                   extra=[('bandage', '#eaeaea')]),
 'sherlock': dict(arch='human', skin='#efc9a0', shirt='#8b6a3a', pants='#241812',
                  hat='brim', hatcolor='#8b6a3a', hattrim='#5a4020',
                  hair='#3a1e08', hairstyle='bald', eyes='normal', mouth='line',
                  extra=[('pipe',)]),
 'tracy': dict(arch='human', skin='#efc9a0', shirt='#f4c25a', pants='#0e1a3a',
               hat='brim', hatcolor='#f4c25a', hattrim='#c9a030',
               eyes='angry', mouth='line'),
 'alice': dict(arch='human', skin='#f5d5a8', shirt='#5cb6e5', pants='#eaeaea',
               hair='#e9c76a', hairstyle='long', eyes='normal', mouth='grin',
               belt='#eaeaea'),
 'dorothy': dict(arch='human', skin='#f5d5a8', shirt='#5cb6e5', pants='#eaeaea',
                 hair='#5a3618', hairstyle='braids', eyes='normal', mouth='grin',
                 boot='#c94b1a'),
 'lupin': dict(arch='human', skin='#efc9a0', shirt='#0f0f16', pants='#0f0f16',
               hat='top', hatcolor='#141018', hattrim='#8a1a1a',
               eyes='normal', mouth='line', extra=[('monocle',)]),
 'hyde': dict(arch='human', skin='#c8a878', shirt='#3a2818', pants='#241812',
              hair='#141018', hairstyle='wild', eyes='angry', eyecolor='#c94b1a',
              mouth='grin'),
 'scarecrow': dict(arch='human', skin='#eecc78', shirt='#7a3812', pants='#5a3010',
                   hat='point', hatcolor='#c9a256', hattrim='#8b6a3a',
                   eyes='cartoon', eyecolor='#3a2410', mouth='line'),
 'lion': dict(arch='hulk', skin='#c25c1a', muzzle='#f5e6c8', chest='#f5c47a',
              eyes='normal', mouth='line'),
 'pooh': dict(arch='round', skin='#f4c25a', shirt='#d24949', eyes='cartoon',
              eyecolor='#141018', mouth='grin', extra=[('ears', '#f4c25a')]),
 'robin': dict(arch='human', skin='#efc9a0', shirt='#3f7a3a', pants='#4a2d18',
               hat='cap', hatcolor='#3f7a3a', hair='#a45b1a', hairstyle='bald',
               eyes='normal', mouth='grin', belt='#f4c25a'),
 'tintin': dict(arch='human', skin='#f5d5a8', shirt='#5cb6e5', pants='#6a4a2a',
                hair='#c9a256', hairstyle='quiff', eyes='normal', mouth='line'),
 'santa': dict(arch='round', skin='#f5d2a3', shirt='#c93030', hat='santa',
               hatcolor='#c93030', hattrim='#f5efe8', beard='#f5efe8',
               beardsize='full', eyes='normal', mouth='none'),
 'mrsclaus': dict(arch='human', skin='#f5d2a3', shirt='#c93030', pants='#c93030',
                  hair='#dcdcd8', hairstyle='long', eyes='normal', mouth='grin',
                  belt='#f5efe8'),
 'bunny': dict(arch='round', skin='#f5efe8', shirt='#f5efe8', eyes='glow',
               eyecolor='#e88ca0', mouth='line',
               extra=[('ears', '#f5efe8')]),
 'fairy': dict(arch='human', skin='#f5d5a8', shirt='#b08ac6', pants='#8a5aa0',
               hair='#e9c76a', hairstyle='long', eyes='glow', eyecolor='#f0e4ff',
               mouth='grin', extra=[('wings', '#e8e0ff')]),
 'vampire': dict(arch='human', skin='#c8bcbc', shirt='#141420', pants='#141420',
                 hair='#141420', hairstyle='short', eyes='glow', eyecolor='#c94b1a',
                 mouth='fang', extra=[('cape', '#3a1a3a')]),
 'pirate': dict(arch='human', skin='#efc9a0', shirt='#e8e8ea', pants='#3a2818',
                hat='tricorn', hatcolor='#141010', hair='#141010', hairstyle='bald',
                eyes='normal', mouth='grin', belt='#8a1a1a', extra=[('patch',)]),
 'witch': dict(arch='robed', skin='#7ea86a', shirt='#141020', hat='point',
               hatcolor='#141020', hattrim='#f4c25a', hair='#141018',
               hairstyle='long', eyes='glow', eyecolor='#5bb083', mouth='grin',
               folds=3),
 'centaur': dict(arch='beast', skin='#8b6a3a', muzzle='#a88458',
                 eyes='normal', mouth='line'),
 'krampus': dict(arch='hulk', skin='#5a2812', muzzle='#5a2812', chest='#3a2010',
                 eyes='glow', eyecolor='#c94b1a', mouth='fang',
                 extra=[('horns', '#c9a256')]),
 'fathertime': dict(arch='robed', skin='#e5c8a5', shirt='#5a4020',
                    hair='#f5efe8', hairstyle='short', beard='#f5efe8',
                    beardsize='long', eyes='normal', mouth='none', folds=4),
 'mothernature': dict(arch='robed', skin='#f5d5a8', shirt='#3a8a4a',
                      hair='#a4642a', hairstyle='long', eyes='normal',
                      mouth='grin', folds=3),
 'raboddog': dict(arch='beast', skin='#5a3a20', muzzle='#a88458',
                  eyes='glow', eyecolor='#c94b1a', mouth='fang',
                  extra=[('ears', '#5a3a20')]),
 'chupacabra': dict(arch='beast', skin='#4a5a3a', muzzle='#7a9058',
                    eyes='glow', eyecolor='#f4c25a', mouth='fang'),
 'cupid': dict(arch='round', skin='#f7dcb4', shirt='#f7dcb4', eyes='normal',
               mouth='grin', hair='#d8a24a', hairstyle='short',
               extra=[('wings', '#fdfbf5')]),
 'medusa': dict(arch='robed', skin='#86c46e', shirt='#2f7a4a',
                eyes='glow', eyecolor='#f4c25a', mouth='line', folds=3,
                hair='#57b56a', hairstyle='wild'),
 'cyclops': dict(arch='hulk', skin='#c8956a', muzzle='#c8956a', chest='#b0855a',
                 eyes='normal', eyespread=0, mouth='open',
                 hair='#5a3a2a', hairstyle='short'),
 'phoenix': dict(arch='bird', skin='#e04520', chest='#f4922a',
                 eyes='glow', eyecolor='#f8d84a', mouth='none',
                 extra=[('flame', '#f8d84a')]),
 'dragon': dict(arch='beast', skin='#2e8a3a', muzzle='#5cc060',
                eyes='glow', eyecolor='#f4c25a', mouth='fang',
                extra=[('horns', '#f4c25a')]),
 'sasquatch': dict(arch='hulk', skin='#4a3020', muzzle='#c8a074', chest='#8a6a44',
                   eyes='normal', mouth='line'),
 'yeti': dict(arch='hulk', skin='#f0f6fb', muzzle='#d8e8f4', chest='#c8d8e8',
              eyes='glow', eyecolor='#5cb6e5', mouth='open'),
 'nessie': dict(arch='beast', skin='#2a7a5a', muzzle='#4aa878',
                eyes='normal', mouth='line'),
 'horseman': dict(arch='human', skin='#f4922a', shirt='#2a1e2a', pants='#141014',
                  eyes='carved', eyecolor='#5e2a06', mouth='none'),
 'zombie': dict(arch='human', skin='#8aae64', shirt='#3a2818', pants='#2a1a10',
                hair='#3a5424', hairstyle='short', eyes='cartoon',
                eyecolor='#8a2b2a', mouth='open'),
 'werewolf': dict(arch='hulk', skin='#4a3524', muzzle='#a88458', chest='#6a4e34',
                  eyes='glow', eyecolor='#f4c25a', mouth='fang',
                  extra=[('ears', '#4a3524')]),
 'strongman': dict(arch='hulk', skin='#e8b888', muzzle='#e8b888', chest='#e8b888',
                   hair='#5a3a1c', hairstyle='short', beard='#5a3a1c',
                   beardsize='moustache', eyes='normal', mouth='line'),
 'beardedlady': dict(arch='human', skin='#f2ceaa', shirt='#b0447a', pants='#7a2a54',
                     hair='#3a2414', hairstyle='long', beard='#3a2414',
                     beardsize='moustache', eyes='normal', mouth='line'),
 'ringmaster': dict(arch='human', skin='#e8b888', shirt='#c93030', pants='#141014',
                    hat='top', hatcolor='#141010', hattrim='#f4c25a',
                    beard='#141010', beardsize='moustache',
                    eyes='normal', mouth='line', belt='#f4c25a'),
 'acrobat': dict(arch='human', skin='#e8b888', shirt='#c93a6a', pants='#c93a6a',
                 hair='#5a3a1c', hairstyle='short', eyes='normal', mouth='grin',
                 boot='#f4c25a'),
 'firebreather': dict(arch='human', skin='#c8956a', shirt='#3a2418', pants='#3a2418',
                      hair='#141010', hairstyle='short', eyes='angry',
                      mouth='open', extra=[('flame', '#f4922a')]),
 'blackcat': dict(arch='cat', skin='#141018', chest='#eaeaea', muzzle='#d8d8dc',
                  eyes='glow', eyecolor='#f4c25a', mouth='none', eyespread=3,
                  extra=[('ears', '#141018')]),
 'humpty': dict(arch='egg', skin='#f2e2c4', shirt='#c93030', boot='#3a2818',
                eyes='cartoon', eyecolor='#141018', mouth='grin'),
}

# The back poses exist because of where the camera stands: the viewer is
# behind home plate, so the batter and any runner heading up the screen
# are seen from behind. A batter who faces the camera while "looking at"
# the pitcher breaks the whole view.
POSES = ('idle', 'run1', 'run2', 'back', 'backrun1', 'backrun2')


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
            assert len(rows) == H, f'{key}/{pose} rows={len(rows)}'
            assert all(len(r) == W for r in rows), f'{key}/{pose} width'
            frames[pose] = (pal, rows)
        blocks.append(js_block(key, frames))
    print(f"const V2_W = {W}, V2_H = {H};")
    print("const V2_SPRITES = {")
    print('\n'.join(blocks))
    print("};")


if __name__ == '__main__':
    main()
