#!/usr/bin/env python3
"""Sprite engine v2 for Run The All-Stars.

Three structural changes from v1, each aimed at a specific reason the old
sprites read flat:

1. COLORED OUTLINES. v1 outlined every form in the same near-black. Real
   chibi sprites (and the reference sheets) edge each form with a darker
   shade of that form's OWN color, reserving true dark only for the
   outermost silhouette. That single change is most of the "sticker" look.

2. REAL LIGHTING. v1 shaded on a linear gradient (dx*0.7 + dy*0.7). v2
   treats the head as a sphere and limbs/torso as cylinders, computes a
   surface normal per pixel, and takes a Lambert term against a fixed
   light. That produces a genuine terminator and a specular hotspot
   instead of a diagonal wash.

3. ROOM. 32x40 instead of 24x32, so a pipe or a monocle is more than two
   pixels.

Renders to a paletted grid: each cell holds an RGB tuple, then colors are
quantized into a per-character palette and emitted as JS.
"""
import math

W, H = 32, 40
LIGHT = (-0.55, -0.62, 0.56)   # from upper-left, slightly toward viewer


# ---------- color helpers ----------
def hex2rgb(h):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))

def rgb2hex(c):
    return '#%02x%02x%02x' % tuple(max(0, min(255, int(round(v)))) for v in c)

def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))

def shade(c, amt):
    """amt<0 darker, amt>0 lighter, perceptual-ish (darken toward a cool
    shadow, lighten toward a warm highlight, not toward pure grey)."""
    if amt < 0:
        return mix(c, (18, 14, 30), -amt)
    return mix(c, (255, 248, 225), amt)


class Ramp:
    """A material: base color plus derived tones and its own outline."""
    def __init__(self, base):
        self.base = hex2rgb(base) if isinstance(base, str) else base
        self.spec = shade(self.base, 0.55)
        self.lit = shade(self.base, 0.26)
        self.mid = self.base
        self.dark = shade(self.base, -0.26)
        self.core = shade(self.base, -0.44)
        self.line = shade(self.base, -0.60)   # this material's own outline

    def by_lambert(self, l, spec=False):
        if spec and l > 0.93:
            return self.spec
        if l > 0.72:
            return self.lit
        if l > 0.40:
            return self.mid
        if l > 0.16:
            return self.dark
        return self.core


class Canvas:
    def __init__(self):
        self.px = [[None] * W for _ in range(H)]     # RGB or None
        self.owner = [[None] * W for _ in range(H)]  # Ramp that painted it

    def set(self, x, y, rgb, ramp=None):
        if 0 <= x < W and 0 <= y < H:
            self.px[y][x] = rgb
            self.owner[y][x] = ramp

    def get(self, x, y):
        if 0 <= x < W and 0 <= y < H:
            return self.px[y][x]
        return None

    # ---------- primitives ----------
    def sphere(self, cx, cy, rx, ry, ramp, spec=True, squash_z=1.0):
        for y in range(H):
            for x in range(W):
                nx = (x + 0.5 - cx) / rx
                ny = (y + 0.5 - cy) / ry
                d2 = nx * nx + ny * ny
                if d2 > 1.0:
                    continue
                nz = math.sqrt(max(0.0, 1.0 - d2)) * squash_z
                n = (nx, ny, nz)
                ln = math.sqrt(sum(v * v for v in n)) or 1.0
                n = tuple(v / ln for v in n)
                l = sum(n[i] * LIGHT[i] for i in range(3))
                l = (l + 1) / 2
                # rim: darken hard at the very edge so the form closes
                if d2 > 0.90:
                    l *= 0.55
                self.set(x, y, ramp.by_lambert(l, spec), ramp)

    def cylinder(self, x0, y0, x1, y1, ramp, round_top=0, round_bot=0):
        """Vertical cylinder: shading varies across x only, like a limb."""
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if x1 == x0:
                    u = 0.0
                else:
                    u = (x + 0.5 - x0) / (x1 + 1 - x0) * 2 - 1   # -1..1
                # round the caps
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
                l = sum(n[i] * LIGHT[i] for i in range(3))
                l = (l + 1) / 2
                if abs(u) > 0.88:
                    l *= 0.6
                self.set(x, y, ramp.by_lambert(l, False), ramp)

    def blob(self, pts, ramp, l=0.55):
        """Flat-ish filled polygon at a fixed light level (hats, cloth)."""
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
                for x in range(int(round(xs[i])), int(round(xs[i + 1])) + 1):
                    # light falls off to the right/bottom of the shape
                    span = max(1.0, xs[-1] - xs[0])
                    u = (x - xs[0]) / span
                    ll = l + 0.28 * (0.5 - u)
                    self.set(x, y, ramp.by_lambert(ll, False), ramp)

    def rect(self, x0, y0, x1, y1, ramp, l=0.55):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                u = (x - x0) / max(1, (x1 - x0))
                self.set(x, y, ramp.by_lambert(l + 0.26 * (0.5 - u), False), ramp)

    def dot(self, x, y, rgb):
        self.set(x, y, rgb, None)

    # ---------- outlining ----------
    def outline(self, silhouette_rgb):
        """Two-tier outline. Pixels on the OUTER silhouette get a shared
        dark line; interior boundaries between two different materials get
        the darker material's own line color. This is the change that stops
        the sprite reading as a sticker."""
        adds = []
        for y in range(H):
            for x in range(W):
                if self.px[y][x] is not None:
                    continue
                # empty cell touching filled: outer silhouette
                touch = None
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    o = self.owner[y + dy][x + dx] if (0 <= x + dx < W and 0 <= y + dy < H) else None
                    if self.get(x + dx, y + dy) is not None:
                        touch = o
                        break
                if touch is not None:
                    adds.append((x, y, silhouette_rgb, touch))
        for (x, y, rgb, ow) in adds:
            self.set(x, y, rgb, ow)

        # interior material boundaries: darken the edge with the owner's line
        edits = []
        for y in range(H):
            for x in range(W):
                o = self.owner[y][x]
                if o is None or self.px[y][x] is None:
                    continue
                for dx, dy in ((1, 0), (0, 1)):
                    nxp, nyp = x + dx, y + dy
                    if not (0 <= nxp < W and 0 <= nyp < H):
                        continue
                    o2 = self.owner[nyp][nxp]
                    if o2 is None or o2 is o:
                        continue
                    # darken the lower/right side of the seam
                    edits.append((nxp, nyp, o2.line))
        for (x, y, rgb) in edits:
            self.set(x, y, rgb, self.owner[y][x])

    # ---------- output ----------
    def emit(self):
        """Quantize to a palette and return (palette dict, rows)."""
        colors = {}
        for y in range(H):
            for x in range(W):
                c = self.px[y][x]
                if c is None:
                    continue
                key = rgb2hex(c)
                colors[key] = colors.get(key, 0) + 1
        # stable, most-used first
        ordered = sorted(colors.items(), key=lambda kv: (-kv[1], kv[0]))
        alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
        if len(ordered) > len(alphabet):
            # merge the rarest colors into their nearest kept neighbour
            keep = [c for c, _ in ordered[:len(alphabet)]]
            keeprgb = [hex2rgb(c) for c in keep]
            remap = {}
            for c, _ in ordered[len(alphabet):]:
                r = hex2rgb(c)
                best = min(range(len(keep)),
                           key=lambda i: sum((r[j] - keeprgb[i][j]) ** 2 for j in range(3)))
                remap[c] = keep[best]
            ordered = ordered[:len(alphabet)]
        else:
            remap = {}
        pal = {}
        rev = {}
        for i, (c, _) in enumerate(ordered):
            ch = alphabet[i]
            pal[ch] = c
            rev[c] = ch
        rows = []
        for y in range(H):
            row = ''
            for x in range(W):
                c = self.px[y][x]
                if c is None:
                    row += '.'
                else:
                    hx = rgb2hex(c)
                    hx = remap.get(hx, hx)
                    row += rev[hx]
            rows.append(row)
        return pal, rows


# ============================ characters ============================
# Shared geometry for a chibi: head is ~44% of the height.
HEAD_CY, HEAD_RX, HEAD_RY = 13.0, 10.5, 10.0
BODY_TOP, BODY_BOT = 23, 31
LEG_TOP, LEG_BOT = 31, 38
CX = 16.0

SIL = (14, 11, 20)   # outer silhouette line, shared


def base_body(cv, skin, shirt, pants, boot, arms_out=False):
    """Torso, arms, legs. Drawn before the head so the head overlaps."""
    cv.cylinder(11, BODY_TOP, 20, BODY_BOT, shirt, round_bot=1)
    # arms
    ax = 2 if arms_out else 0
    cv.cylinder(8 - ax, BODY_TOP + 1, 10 - ax, BODY_TOP + 6, shirt)
    cv.cylinder(21 + ax, BODY_TOP + 1, 23 + ax, BODY_TOP + 6, shirt)
    cv.cylinder(8 - ax, BODY_TOP + 6, 10 - ax, BODY_TOP + 8, skin)
    cv.cylinder(21 + ax, BODY_TOP + 6, 23 + ax, BODY_TOP + 8, skin)
    # legs
    cv.cylinder(12, LEG_TOP, 14, LEG_BOT - 1, pants)
    cv.cylinder(17, LEG_TOP, 19, LEG_BOT - 1, pants)
    cv.cylinder(12, LEG_BOT - 1, 14, LEG_BOT, boot)
    cv.cylinder(17, LEG_BOT - 1, 19, LEG_BOT, boot)


def eyes(cv, y=13, spread=4, white=(250, 250, 252), pupil=(20, 16, 28), lit=True):
    for sx in (-spread, spread):
        x = int(CX + sx)
        cv.dot(x, y, white)
        cv.dot(x, y + 1, pupil)
        cv.dot(x - 1, y, mixhex(white, 0.85))
    return


def mixhex(c, f):
    return tuple(v * f for v in c)


def gen_popeye():
    cv = Canvas()
    skin = Ramp('#f0c088')
    shirt = Ramp('#e9e9ea')
    pants = Ramp('#1c4f96')
    boot = Ramp('#2a2018')
    hair = Ramp('#c25c1a')
    cap = Ramp('#f2f2f3')
    base_body(cv, skin, shirt, pants, boot)
    cv.sphere(CX, HEAD_CY, HEAD_RX, HEAD_RY, skin)
    # sailor cap: dome + brim
    cv.sphere(CX, HEAD_CY - 6.5, 10.0, 5.6, cap, spec=True)
    cv.rect(5, int(HEAD_CY - 3), 26, int(HEAD_CY - 2), cap, l=0.42)
    # ginger hair fringe under the cap
    cv.rect(7, int(HEAD_CY - 1), 24, int(HEAD_CY - 1), hair, l=0.6)
    # squint + open eye
    cv.dot(12, 14, (30, 24, 34)); cv.dot(13, 14, (30, 24, 34))
    cv.dot(19, 13, (250, 250, 252)); cv.dot(19, 14, (26, 20, 30)); cv.dot(20, 14, (26, 20, 30))
    # jaw + mouth
    for x in range(13, 20):
        cv.dot(x, 19, shade(skin.base, -0.30))
    cv.dot(15, 20, (120, 62, 48)); cv.dot(16, 20, (120, 62, 48)); cv.dot(17, 20, (120, 62, 48))
    # pipe
    for x in range(20, 24):
        cv.dot(x, 20, (46, 34, 26))
    cv.dot(24, 19, (196, 112, 40)); cv.dot(24, 20, (150, 82, 30))
    # anchor on the shirt
    for y in range(25, 29):
        cv.dot(16, y, (40, 74, 140))
    cv.dot(15, 26, (40, 74, 140)); cv.dot(17, 26, (40, 74, 140))
    cv.outline(SIL)
    return cv


def gen_kong():
    cv = Canvas()
    fur = Ramp('#3f2716')
    face = Ramp('#b0855a')
    dark = Ramp('#241608')
    # Torso first, then arms OVERLAPPING it so they read as attached.
    cv.sphere(CX, 27.0, 9.2, 7.4, fur, spec=False)          # barrel chest
    cv.cylinder(11, 32, 15, 38, fur)                         # thighs
    cv.cylinder(17, 32, 21, 38, fur)
    cv.cylinder(11, 37, 15, 38, dark)                        # feet
    cv.cylinder(17, 37, 21, 38, dark)
    # shoulders sit ON the chest, arms hang from them and taper
    cv.sphere(8.0, 23.0, 4.6, 4.2, fur, spec=False)
    cv.sphere(24.0, 23.0, 4.6, 4.2, fur, spec=False)
    cv.cylinder(5, 23, 9, 34, fur, round_bot=2)
    cv.cylinder(23, 23, 27, 34, fur, round_bot=2)
    cv.sphere(7.0, 34.0, 3.0, 2.6, dark, spec=False)         # knuckles
    cv.sphere(25.0, 34.0, 3.0, 2.6, dark, spec=False)
    # lighter chest patch, smaller so the fur frames it
    cv.sphere(CX, 27.5, 5.4, 4.2, face, spec=False)
    # head overlaps the shoulders
    cv.sphere(CX, 12.5, 9.8, 8.8, fur)
    # brow follows the skull instead of a flat bar
    for x in range(7, 26):
        u = (x - CX) / 9.8
        if abs(u) > 1: continue
        y = int(8.4 + 2.0 * u * u)
        cv.dot(x, y, shade(fur.base, -0.42))
        cv.dot(x, y + 1, shade(fur.base, -0.30))
    # muzzle low and wide
    cv.sphere(CX, 16.2, 6.2, 4.0, face)
    eyes(cv, y=11, spread=3)
    cv.dot(15, 15, (74, 44, 26)); cv.dot(18, 15, (74, 44, 26))   # nostrils
    for x in range(13, 20):
        cv.dot(x, 18, (86, 46, 28))
    cv.dot(13, 17, (86, 46, 28)); cv.dot(19, 17, (86, 46, 28))
    cv.outline(SIL)
    return cv


def gen_medusa():
    cv = Canvas()
    skin = Ramp('#86c46e')
    dress = Ramp('#2f7a4a')
    snake = Ramp('#57b56a')
    boot = Ramp('#1d3a24')
    # gown: a tapered cylinder plus a flared hem, not a flat box
    cv.cylinder(12, 23, 19, 30, dress, round_bot=1)
    cv.cylinder(10, 30, 21, 36, dress, round_bot=2)
    cv.cylinder(9, 24, 11, 31, skin)      # arms
    cv.cylinder(20, 24, 22, 31, skin)
    cv.cylinder(13, 36, 15, 38, boot)
    cv.cylinder(16, 36, 18, 38, boot)
    # a dense crown of snakes, drawn behind the head and touching it
    for (sx, sy, l) in [(-10, 5, 5), (-7, 2, 6), (-3, 0, 6), (1, 0, 6),
                        (5, 1, 6), (9, 3, 5), (12, 7, 4), (-12, 8, 4)]:
        x = int(CX + sx)
        cv.cylinder(x - 1, sy, x + 1, sy + l, snake, round_top=1)
        cv.dot(x, sy, shade(snake.base, 0.40))
        cv.dot(x, sy + 1, shade(snake.base, 0.18))
    cv.sphere(CX, HEAD_CY, HEAD_RX * 0.94, HEAD_RY * 0.94, skin)
    # glowing eyes with a lid line above so the face has structure
    for sx in (-4, 4):
        x = int(CX + sx)
        cv.dot(x - 1, 12, shade(skin.base, -0.40))
        cv.dot(x, 12, shade(skin.base, -0.40))
        cv.dot(x + 1, 12, shade(skin.base, -0.40))
        cv.dot(x, 13, (250, 214, 90))
        cv.dot(x - 1, 13, (252, 240, 186))
        cv.dot(x, 14, (172, 124, 28))
    cv.dot(16, 16, shade(skin.base, -0.26))          # nose
    for x in range(14, 19):                           # mouth
        cv.dot(x, 19, (58, 96, 52))
    cv.dot(13, 18, (58, 96, 52)); cv.dot(19, 18, (58, 96, 52))
    # gown folds: vertical shadow lines that follow the taper
    for (x0, y0, y1) in [(13, 25, 35), (16, 24, 36), (19, 25, 35)]:
        for y in range(y0, y1):
            cv.dot(x0, y, shade(dress.base, -0.34))
    cv.outline(SIL)
    return cv


def js_block(key, pal, rows):
    pal_str = ', '.join(f"{k}:'{v}'" for k, v in pal.items())
    body = ',\n      '.join(f"'{r}'" for r in rows)
    return (f"  {key}: {{\n"
            f"    pal:{{ {pal_str} }},\n"
            f"    art: [\n      {body}\n    ],\n"
            f"  }},")


if __name__ == '__main__':
    out = ["const V2_W = %d, V2_H = %d;" % (W, H), "const V2_SPRITES = {"]
    for key, fn in (('popeye', gen_popeye), ('kong', gen_kong), ('medusa', gen_medusa)):
        cv = fn()
        pal, rows = cv.emit()
        assert len(rows) == H
        assert all(len(r) == W for r in rows)
        out.append(js_block(key, pal, rows))
    out.append("};")
    print('\n'.join(out))
