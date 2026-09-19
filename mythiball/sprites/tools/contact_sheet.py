"""EVERY CHARACTER'S IDLE FRAME, OVER GREEN, BIG ENOUGH TO SEE.

    python3 tools/contact_sheet.py

Writes reports/contact_green.png: idle frame 0 for all 55 enhanced
characters, composited over #00FF00 at 6x, labelled.

THE GREEN IS THE WHOLE INSTRUMENT. This art is dark, and it is viewed on
dark, so a baked background and a hole punched through a cape look exactly
like the page behind them. Over a colour that appears nowhere in the palette,
a background becomes a rectangle and a hole becomes a green wound. Neither is
visible on a checkerboard either, because a checkerboard is grey and so is
half the shading.

IT COMPOSITES RATHER THAN KEYING. The frame is drawn onto green with its own
alpha, so what shows through is exactly what a transparent pixel is, and a
semi transparent pixel tints instead of vanishing. Nothing here decides what
is background and what is art; that is the audit's job, and a contact sheet
that had already made the decision could not be used to check it.

The label carries the audit's verdict, so the sheet and the CSV can be read
side by side without counting rows.
"""
import csv
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from spritelib import frames_of

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
STRIPS = os.path.join(ROOT, 'enhanced_animation_strips')
REPORTS = os.path.join(ROOT, 'reports')

GREEN = (0, 255, 0, 255)
SCALE = 6
CELL = 64 * SCALE
LABEL = 30
COLS = 8

FONT_PATHS = ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
              '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']


def font(size):
    for p in FONT_PATHS:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def main():
    verdict = {}
    csv_path = os.path.join(REPORTS, 'audit.csv')
    if os.path.exists(csv_path):
        for r in csv.DictReader(open(csv_path)):
            if r['animation'] == 'idle':
                verdict[r['character']] = (r['classification'],
                                           r['classification_after_bg'])

    names = sorted(f[:-len('_idle.png')] for f in os.listdir(STRIPS)
                   if f.endswith('_idle.png'))
    rows = (len(names) + COLS - 1) // COLS
    sheet = Image.new('RGBA', (COLS * CELL, rows * (CELL + LABEL)), (24, 24, 28, 255))
    dr = ImageDraw.Draw(sheet)
    f_name = font(20)
    f_note = font(15)

    for i, name in enumerate(names):
        cx = (i % COLS) * CELL
        cy = (i // COLS) * (CELL + LABEL)
        fr = frames_of(os.path.join(STRIPS, name + '_idle.png'))[0]
        cell = Image.new('RGBA', (64, 64), GREEN)
        cell.alpha_composite(Image.fromarray(fr, 'RGBA'))
        sheet.paste(cell.resize((CELL, CELL), Image.NEAREST), (cx, cy))

        spec, after = verdict.get(name, ('?', '?'))
        # gold for art that only the spec's rule condemns, which is the set
        # worth looking at hardest on this sheet
        colour = ((120, 220, 120) if spec == 'REPAIRABLE'
                  else (235, 190, 60) if after == 'REPAIRABLE'
                  else (230, 90, 90))
        dr.rectangle([cx, cy + CELL, cx + CELL, cy + CELL + LABEL], fill=(18, 18, 22, 255))
        dr.text((cx + 8, cy + CELL + 4), name, font=f_name, fill=colour)
        tag = ('idle ok' if spec == 'REPAIRABLE'
               else 'idle: background only' if after == 'REPAIRABLE'
               else 'idle NEEDS ART')
        dr.text((cx + CELL - 8, cy + CELL + 7), tag, font=f_note,
                fill=colour, anchor='ra')

    os.makedirs(REPORTS, exist_ok=True)
    out = os.path.join(REPORTS, 'contact_green.png')
    sheet.convert('RGB').save(out)
    print('%d characters, %dx%d -> %s'
          % (len(names), sheet.width, sheet.height, os.path.relpath(out, ROOT)))
    n_ok = sum(1 for v in verdict.values() if v[0] == 'REPAIRABLE')
    n_bg = sum(1 for v in verdict.values() if v[0] != 'REPAIRABLE' and v[1] == 'REPAIRABLE')
    print('  idle strips: %d clean, %d background only, %d need art'
          % (n_ok, n_bg, len(names) - n_ok - n_bg))


if __name__ == '__main__':
    main()
