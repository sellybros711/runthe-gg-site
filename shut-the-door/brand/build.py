"""Shut The Door: the brand marks, built as outlined SVG.

    python3 shut-the-door/brand/build.py        (needs fonttools)

The owner picked the Home Plate Crest (2026-11-02), the Strike Zone concept
redrawn as a ballclub crest: a home plate shield with an orange keyline and a
stitched inner border, SHUT THE arched across the top, DOOR in sewn collegiate
block breaking out past the plate's sides, a seam under it, and the zone with
its door swinging shut in the point. Palette unchanged: ink, navy, white and
signal orange.

Every letter is outlined here from Graduate (OFL, brand/fonts/), so nothing in
the logo depends on a font loading and no new web font ships. The outlines are
placed by the font's own advances and kerning, then bent by a gentle arch.

Outputs, beside this file:
  lockup-light.svg, lockup-dark.svg      the crest (the loading screen, the footer, the home page card)
  wordmark-light.svg, wordmark-dark.svg  SHUT THE over DOOR, stacked, for the header
  mark.svg                               the app icon: the plate and the zone on a rounded tile
  mark-square.svg                        full bleed, the plate inside the maskable safe zone
  mark-small.svg                         the icon simplified for 16 and 32 px
  glyph.svg                              the plate alone on a transparent ground

render.mjs turns the marks into the PNG icons the manifest and the head link.
Run this, then render.mjs, after any change to the brand.
"""
import math
import os

from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, 'fonts', 'Graduate-Regular.ttf')
# the header wordmark's face, the game's display face for its big moments (OFL, brand/fonts/)
ANTON = os.path.join(HERE, 'fonts', 'Anton-Regular.ttf')
INK, NAVY, WHITE, SIGNAL = '#0b0f17', '#1d2536', '#ffffff', '#ff4f1f'

_tt = {}
_ids = [0]
_defs = []


def f2(v):
    s = ('%.2f' % v).rstrip('0').rstrip('.')
    return '0' if s == '-0' else s


def tt(path=None):
    path = path or FONT
    if path not in _tt:
        _tt[path] = TTFont(path)
    return _tt[path]


def uid(kind):
    """An id unique across every file one run writes, so the SVGs can sit inline on one page."""
    _ids[0] += 1
    return 'std%s%d' % (kind, _ids[0])


# ---------------------------------------------------------------- letters
class WarpPen(BasePen):
    """Draws glyph outlines through a point function, splitting lines so a warp bends them."""

    def __init__(self, glyphset, fn, split):
        super().__init__(glyphset)
        self.fn, self.split, self.out, self.cur = fn, split, [], None

    def P(self, p):
        x, y = self.fn(*p)
        return f2(x) + ' ' + f2(y)

    def _moveTo(self, p):
        self.out.append('M' + self.P(p))
        self.cur = p

    def _lineTo(self, p):
        a = self.cur
        for i in range(1, self.split + 1):
            t = i / self.split
            self.out.append('L' + self.P((a[0] + (p[0] - a[0]) * t, a[1] + (p[1] - a[1]) * t)))
        self.cur = p

    def _qCurveToOne(self, c, p):
        self.out.append('Q' + self.P(c) + ' ' + self.P(p))
        self.cur = p

    def _curveToOne(self, c1, c2, p):
        self.out.append('C' + self.P(c1) + ' ' + self.P(c2) + ' ' + self.P(p))
        self.cur = p

    def _closePath(self):
        self.out.append('Z')


def layout(txt, size, tracking, font=None):
    f = tt(font)
    s = size / f['head'].unitsPerEm
    cmap, hmtx = f.getBestCmap(), f['hmtx']
    kern = {}
    if 'kern' in f:
        for t in f['kern'].kernTables:
            kern.update(t.kernTable)
    names = [cmap[ord(c)] for c in txt]
    xs, x = [], 0.0
    for i, g in enumerate(names):
        xs.append(x)
        x += hmtx[g][0] * s + tracking
        if i + 1 < len(names):
            x += kern.get((g, names[i + 1]), 0) * s
    return names, xs, x - tracking, s


def measure(txt, size, tracking=0.0, font=None):
    return layout(txt, size, tracking, font)[2]


def cap(size, font=None):
    f = tt(font)
    gs = f.getGlyphSet()
    bp = BoundsPen(gs)
    gs[f.getBestCmap()[ord('H')]].draw(bp)
    return bp.bounds[3] * size / f['head'].unitsPerEm


def text(txt, size, x, y, tracking=0.0, anchor='start', warp=None, font=None):
    """Path data for a line with its baseline at y. warp(x, y) -> (x, y) bends it."""
    names, xs, width, s = layout(txt, size, tracking, font)
    if anchor == 'middle':
        x -= width / 2
    gs = tt(font).getGlyphSet()
    parts = []
    for g, gx in zip(names, xs):
        def fn(px, py, gx=gx):
            X, Y = x + gx + px * s, y - py * s
            return warp(X, Y) if warp else (X, Y)
        pen = WarpPen(gs, fn, 8 if warp else 1)
        gs[g].draw(pen)
        parts.append(''.join(pen.out))
    return ' '.join(p for p in parts if p), width


def arch(cx, half, rise):
    """Points rise by `rise` at cx, none at cx +- half. Letters stay upright, the line bows."""
    def fn(X, Y):
        u = (X - cx) / half
        return X, Y - rise * (1 - u * u)
    return fn


def layered(d, fill, rings, shadow=None):
    """Athletic lettering: an optional offset shadow, stacked outlines (outermost first), the face.
    One path in defs, drawn by <use> for each layer."""
    if not rings and not shadow:
        return '<path d="%s" fill="%s"/>' % (d, fill)
    i = uid('p')
    _defs.append('<path id="%s" d="%s"/>' % (i, d))
    u = '<use href="#%s"' % i
    out = []
    if shadow:
        col, dx, dy, w = shadow
        out.append('%s transform="translate(%s %s)" fill="%s" stroke="%s" stroke-width="%s" stroke-linejoin="round"/>' % (u, f2(dx), f2(dy), col, col, f2(w)))
    for col, w in rings:
        out.append('%s fill="%s" stroke="%s" stroke-width="%s" stroke-linejoin="round"/>' % (u, col, col, f2(w)))
    out.append('%s fill="%s"/>' % (u, fill))
    return ''.join(out)


# ---------------------------------------------------------------- shapes
def plate(cx, top, w, h, shoulder=.6):
    """Home plate, point down: flat top, straight sides, two edges to the point."""
    x0, x1, sh = cx - w / 2, cx + w / 2, top + h * shoulder
    return 'M%s %sH%sV%sL%s %sL%s %sZ' % (f2(x0), f2(top), f2(x1), f2(sh), f2(cx), f2(top + h), f2(x0), f2(sh))


def zone(x, y, w, line=WHITE, door=SIGNAL, knob=INK, frame=22, grid=11, simple=False):
    """The Strike Zone in a w x w box: the 3x3 zone, its last column a door swinging shut.
    Drawn on a 304 unit grid. simple drops to one row line for 16 and 32 px."""
    k = w / 304.0

    def X(v):
        return f2(x + v * k)

    def Y(v):
        return f2(y + v * k)
    o = ['<rect x="%s" y="%s" width="%s" height="%s" rx="%s" fill="none" stroke="%s" stroke-width="%s"/>' % (
        X(0), Y(0), f2(304 * k), f2(304 * k), f2(30 * k), line, f2(frame * k))]
    if simple:
        o.append('<path d="M%s %sH%s" stroke="%s" stroke-width="%s"/>' % (X(10), Y(152), X(196), line, f2(grid * 2.4 * k)))
    else:
        o.append('<path d="M%s %sV%sM%s %sH%sM%s %sH%s" stroke="%s" stroke-width="%s"/>' % (
            X(101), Y(10), Y(294), X(10), Y(101), X(196), X(10), Y(203), X(196), line, f2(grid * k)))
    o.append('<path d="M%s %sL%s %sQ%s %s %s %sV%sQ%s %s %s %sL%s %sZ" fill="%s"/>' % (
        X(196), Y(18), X(292), Y(0), X(306), Y(0), X(306), Y(14), Y(290), X(306), Y(304), X(292), Y(304), X(196), Y(286), door))
    if knob and not simple:
        o.append('<circle cx="%s" cy="%s" r="%s" fill="%s"/>' % (X(218), Y(152), f2(12 * k), knob))
    return ''.join(o)


def stitches(p0, p1, p2, gap, length, angle=60, side=1):
    """Short slanted ticks along a quadratic curve, like the stitching beside a seam."""
    def at(t):
        u = 1 - t
        return (u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1])
    pts = [at(i / 600) for i in range(601)]
    lens = [0.0]
    for a, b in zip(pts, pts[1:]):
        lens.append(lens[-1] + math.dist(a, b))
    out, d, i = [], gap / 2, 0
    ca, sa = math.cos(math.radians(angle)), math.sin(math.radians(angle))
    while d < lens[-1]:
        while lens[i + 1] < d:
            i += 1
        a, b = pts[i], pts[i + 1]
        tx, ty = b[0] - a[0], b[1] - a[1]
        n = math.hypot(tx, ty) or 1
        tx, ty = tx / n, ty / n
        nx, ny = -ty * side, tx * side
        dx, dy = nx * sa + tx * ca, ny * sa + ty * ca
        out.append('M%s %sL%s %s' % (f2(a[0]), f2(a[1]), f2(a[0] + dx * length), f2(a[1] + dy * length)))
        d += gap
    return ''.join(out)


def seam(p0, p1, p2, col, w, gap, tick):
    return ('<path d="M%s %sQ%s %s %s %s" fill="none" stroke="%s" stroke-width="%s" stroke-linecap="round" opacity=".55"/>'
            '<path d="%s" fill="none" stroke="%s" stroke-width="%s" stroke-linecap="round"/>') % (
        f2(p0[0]), f2(p0[1]), f2(p1[0]), f2(p1[1]), f2(p2[0]), f2(p2[1]), col, f2(w * .55),
        stitches(p0, p1, p2, gap, tick), col, f2(w))


def svg(vb, body, defs=''):
    defs += ''.join(_defs)
    del _defs[:]
    d = '<defs>%s</defs>' % defs if defs else ''
    # viewBox only: card.js gives a mark its size when it draws one to a canvas
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s" role="img" aria-label="Shut The Door">'
            '<title>Shut The Door</title>%s%s</svg>') % (' '.join(f2(v) for v in vb), d, body)


def write(name, s):
    with open(os.path.join(HERE, name), 'w') as f:
        f.write(s + '\n')


def tile(body, rx):
    g = uid('g')
    defs = ('<linearGradient id="%s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="%s"/>'
            '<stop offset="1" stop-color="%s"/></linearGradient>') % (g, NAVY, INK)
    rect = '<rect width="512" height="512"%s fill="url(#%s)"/>' % (' rx="%s"' % rx if rx else '', g)
    return svg((0, 0, 512, 512), rect + body, defs)


# ---------------------------------------------------------------- the crest
W = H = 640
CX = W / 2


def crest(ground):
    """The primary lockup. ground: 'dark' (navy plate) or 'light' (ink plate, it reads on paper)."""
    shape = plate(CX, 26, 430, 590)
    inner = plate(CX, 48, 386, 538)
    o = ['<path d="%s" fill="%s" stroke="%s" stroke-width="22" stroke-linejoin="round"/>' % (shape, NAVY if ground == 'dark' else INK, SIGNAL),
         '<path d="%s" fill="none" stroke="%s" stroke-width="5" stroke-linejoin="round" stroke-dasharray="14 9" opacity=".9"/>' % (inner, WHITE)]
    st, _ = text('SHUT THE', 66, CX, 150, tracking=5, anchor='middle', warp=arch(CX, 200, 20))
    o.append(layered(st, WHITE, [(WHITE, 3)]))
    dd, _ = text('DOOR', 172, CX, 334, tracking=2, anchor='middle', warp=arch(CX, 300, 24))
    o.append(layered(dd, SIGNAL, [(INK, 34), (WHITE, 18)], shadow=(INK, 8, 10, 34)))
    o.append(seam((CX - 168, 384), (CX, 368), (CX + 168, 384), WHITE, 5, 17, 11))
    o.append(zone(CX - 52, 412, 104, line=WHITE, door=SIGNAL, knob=NAVY if ground == 'dark' else INK, frame=28, grid=15))
    return svg((0, 0, W, H), ''.join(o))


def icon_plate(simple):
    """The plate and the zone, no words, in 512 units."""
    if simple:
        p = plate(256, 64, 372, 392, shoulder=.56)
        return ('<path d="%s" fill="%s" stroke="%s" stroke-width="26" stroke-linejoin="round"/>' % (p, NAVY, SIGNAL) +
                zone(156, 118, 200, knob=None, frame=40, grid=14, simple=True))
    p = plate(256, 64, 372, 392, shoulder=.56)
    pi = plate(256, 84, 332, 350, shoulder=.56)
    return ('<path d="%s" fill="%s" stroke="%s" stroke-width="18" stroke-linejoin="round"/>' % (p, NAVY, SIGNAL) +
            '<path d="%s" fill="none" stroke="%s" stroke-width="5" stroke-dasharray="13 9" stroke-linejoin="round" opacity=".85"/>' % (pi, WHITE) +
            zone(166, 126, 180, knob=NAVY, frame=24, grid=13))


def wordmark(ground):
    """One line for the header, beside the crest: SHUT THE DOOR in Anton, DOOR in signal (the owner,
    2026-11-02: option 3 of the font round, Anton for the big moments). Plain letters, no rings: it
    sits at about 25 px. A viewBox only; card.js and the page give it its size."""
    face = WHITE if ground == 'dark' else INK
    # the stacked wordmark this replaced drew two layered paths, two ids; keep the count so the marks
    # written after it (cached at ?v=2) keep their ids byte for byte
    _ids[0] += 2
    size, tr = 40, 1.2
    a, wa = text('SHUT THE ', size, 2, 2 + cap(size, ANTON), tracking=tr, font=ANTON)
    b, wb = text('DOOR', size, 2 + wa + tr, 2 + cap(size, ANTON), tracking=tr, font=ANTON)
    w, h = 2 + wa + tr + wb + 2, cap(size, ANTON) + 4
    return svg((0, 0, w, h), '<path d="%s" fill="%s"/><path d="%s" fill="%s"/>' % (a, face, b, SIGNAL))


def main():
    write('lockup-dark.svg', crest('dark'))
    write('lockup-light.svg', crest('light'))
    write('wordmark-dark.svg', wordmark('dark'))
    write('wordmark-light.svg', wordmark('light'))
    write('mark.svg', tile(icon_plate(False), 112))
    write('mark-small.svg', tile(icon_plate(True), 96))
    # maskable: full bleed, the plate scaled into the safe circle (radius 40% of the icon)
    write('mark-square.svg', tile('<g transform="translate(256 262) scale(.74) translate(-256 -262)">%s</g>' % icon_plate(False), 0))
    write('glyph.svg', svg((44, 44, 424, 424), icon_plate(False)))
    print('brand: wrote the crest, the wordmarks and the marks')


if __name__ == '__main__':
    main()
