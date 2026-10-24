"""Shut The Door: the brand marks, built as outlined SVG.

    python3 shut-the-door/brand/build.py        (needs fonttools, brotli, uharfbuzz)

The owner picked the Strike Zone logo (2026-10-18). This writes the lockup,
the header wordmark and the app mark as plain SVG paths, so nothing in the
logo depends on a font loading. The letters are shaped with HarfBuzz (kerning
included) from the same Barlow Condensed files the UI uses, in
shut-the-door/fonts/, and outlined with fontTools.

Outputs, beside this file:
  lockup-light.svg, lockup-dark.svg      the mark with SHUT THE / DOOR and the seam
  wordmark-light.svg, wordmark-dark.svg  one line, SHUT THE DOOR, for the header
  mark.svg                               the app icon, rounded, for the page and the sheet
  mark-square.svg                        full bleed, the mark inside the maskable safe zone
  mark-small.svg                         the icon simplified for 16 and 32 px
  glyph.svg                              the mark alone on a transparent ground

render.mjs turns the marks into the PNG icons the manifest and the head link.
Run this, then render.mjs, after any change to the brand.
"""
import io
import math
import os

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, '..', 'fonts')
INK, WHITE, SIGNAL, MUTE = '#0b0f17', '#ffffff', '#ff4f1f', '#5b6476'

_faces = {}


def face(name):
    if name not in _faces:
        tt = TTFont(os.path.join(FONTS, name))
        tt.flavor = None
        raw = io.BytesIO()
        tt.save(raw)
        data = raw.getvalue()
        tt = TTFont(io.BytesIO(data))
        hbf = hb.Font(hb.Face(hb.Blob(data)))
        _faces[name] = (tt, hbf)
    return _faces[name]


def text_path(font, text, size, x, y, tracking=0.0):
    """Outline a line of text with its baseline at y. Returns (d, width)."""
    tt, hbf = face(font)
    upem = tt['head'].unitsPerEm
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(hbf, buf, {'kern': True, 'liga': True})
    gs, order = tt.getGlyphSet(), tt.getGlyphOrder()
    s = size / upem
    cx, parts = x, []
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        pen = SVGPathPen(gs, lambda v: ('%.2f' % v).rstrip('0').rstrip('.'))
        gs[order[info.codepoint]].draw(TransformPen(pen, (s, 0, 0, -s, cx + pos.x_offset * s, y - pos.y_offset * s)))
        parts.append(pen.getCommands())
        cx += pos.x_advance * s + tracking
    return ' '.join(p for p in parts if p), cx - tracking - x


def seam(p0, p1, p2, gap, size):
    """A baseball seam along a quadratic curve: the line, and two rows of short
    ticks either side of it, apart from it (they read as stitches, not arrows)."""
    def at(t):
        u = 1 - t
        return (u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1])
    pts = [at(i / 400) for i in range(401)]
    lens = [0.0]
    for a, b in zip(pts, pts[1:]):
        lens.append(lens[-1] + math.dist(a, b))
    total, ticks, s, i = lens[-1], [], gap / 2, 0
    while s < total:
        while lens[i + 1] < s:
            i += 1
        (ax, ay), (bx, by) = pts[i], pts[i + 1]
        ang = math.atan2(by - ay, bx - ax)
        tx, ty, nx, ny = math.cos(ang), math.sin(ang), -math.sin(ang), math.cos(ang)
        f = (s - lens[i]) / max(1e-9, lens[i + 1] - lens[i])
        qx, qy = ax + (bx - ax) * f, ay + (by - ay) * f
        for side in (-1, 1):
            x1, y1 = qx + nx * side * size * 0.42, qy + ny * side * size * 0.42
            x2 = qx + nx * side * size * 1.15 - tx * size * 0.32
            y2 = qy + ny * side * size * 1.15 - ty * size * 0.32
            ticks.append('M%.1f %.1fL%.1f %.1f' % (x1, y1, x2, y2))
        s += gap
    line = 'M%.1f %.1fQ%.1f %.1f %.1f %.1f' % (p0 + p1 + p2)
    return line, ' '.join(ticks)


def mark_body(grid, knob):
    """The strike zone, the last column a door almost shut. 512 units."""
    return (
        '<rect x="104" y="104" width="304" height="304" rx="34" fill="none" stroke="%s" stroke-width="20"/>'
        '<path d="M205 114V398M114 205H300M114 307H300" stroke="%s" stroke-width="10"/>'
        '<path d="M300 120L398 104Q408 104 408 116V396Q408 408 398 408L300 392Z" fill="%s"/>'
        '<circle cx="320" cy="256" r="11" fill="%s"/>' % (grid, grid, SIGNAL, knob))


def mark_small(grid, knob):
    """For 16 and 32 px: one row line and one column line fewer, all heavier."""
    return (
        '<rect x="100" y="100" width="312" height="312" rx="40" fill="none" stroke="%s" stroke-width="40"/>'
        '<path d="M120 256H300" stroke="%s" stroke-width="26"/>'
        '<path d="M290 116L400 100Q412 100 412 114V398Q412 412 400 412L290 396Z" fill="%s"/>' % (grid, grid, SIGNAL))


BG = ('<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1d2536"/>'
      '<stop offset="1" stop-color="%s"/></linearGradient></defs>' % INK)


def write(name, svg):
    with open(os.path.join(HERE, name), 'w') as f:
        f.write(svg + '\n')


def svg(vb, body, label):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s" role="img" aria-label="%s">'
            '<title>%s</title>%s</svg>' % (vb, label, label, body))


def main():
    # the marks
    write('mark.svg', svg('0 0 512 512', BG + '<rect width="512" height="512" rx="112" fill="url(#g)"/>' + mark_body(WHITE, INK), 'Shut The Door'))
    write('mark-square.svg', svg('0 0 512 512', BG + '<rect width="512" height="512" fill="url(#g)"/>'
                                 '<g transform="translate(256 256) scale(.86) translate(-256 -256)">' + mark_body(WHITE, INK) + '</g>', 'Shut The Door'))
    write('mark-small.svg', svg('0 0 512 512', BG + '<rect width="512" height="512" rx="96" fill="url(#g)"/>' + mark_small(WHITE, INK), 'Shut The Door'))
    write('glyph.svg', svg('104 104 304 304', mark_body(INK, '#ffffff'), 'Shut The Door'))

    # the lockup: mark, SHUT THE over DOOR, the seam under DOOR
    for theme, fg, knob in (('light', INK, '#ffffff'), ('dark', WHITE, INK)):
        top, wt = text_path('barlowcondensed-800italic.woff2', 'SHUT THE', 78, 300, 128, 3)
        door, wd = text_path('barlowcondensed-900italic.woff2', 'DOOR', 200, 290, 272, 2)
        line, ticks = seam((300, 300), (300 + wd * 0.48, 320), (290 + wd + 6, 293), 13, 10)
        w = int(290 + max(wd, wt) + 30)
        body = ('<g transform="translate(18 48) scale(.47)">%s</g>' % mark_body(fg, knob) +
                '<path d="%s" fill="%s"/><path d="%s" fill="%s"/>' % (top, fg, door, fg) +
                '<path d="%s" fill="none" stroke="%s" stroke-opacity=".45" stroke-width="2.5"/>' % (line, SIGNAL) +
                '<path d="%s" fill="none" stroke="%s" stroke-width="3.6" stroke-linecap="round"/>' % (ticks, SIGNAL))
        write('lockup-%s.svg' % theme, svg('0 0 %d 340' % w, body, 'Shut The Door'))

    # the header wordmark: one line, DOOR in signal orange
    for theme, fg in (('light', INK), ('dark', WHITE)):
        a, wa = text_path('barlowcondensed-900italic.woff2', 'SHUT THE ', 40, 0, 40, 0.6)
        b, wb = text_path('barlowcondensed-900italic.woff2', 'DOOR', 40, wa + 0.6, 40, 0.6)
        write('wordmark-%s.svg' % theme, svg('-2 4 %d 40' % int(wa + wb + 10), '<path d="%s" fill="%s"/><path d="%s" fill="%s"/>' % (a, fg, b, SIGNAL), 'Shut The Door'))
    print('brand: wrote the marks, the lockups and the wordmarks')


if __name__ == '__main__':
    main()
