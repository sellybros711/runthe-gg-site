"""THE REFERENCE PACKET FOR ONE CHARACTER, for handing to an artist.

    python3 tools/ref_sheet.py sherlock
    python3 tools/ref_sheet.py sherlock --out /tmp

Writes `<key>_ref.png` and prints the palette and the register row.

IT IS THE SHIPPED ART, IN THE FORMAT THE BRIEF ASKS FOR: one 64x64 cell a
still, drawn at 16x on magenta, so the two cells the artist is asked to
reproduce can be compared against these pixel for pixel. That comparison is
the whole calibration. An artist handed a description instead has nothing to
be wrong against.

THE PALETTE IS QUANTISED TO 22 AND THAT IS NOT A LOSS. The stills carry 99
distinct colours and 51 of them cover twelve pixels or more, mostly
near-identical browns; quantised to 22 the sprite is visually identical at
every size the game draws it. So 22 is a real number to hand over rather
than an approximation of one, and it is inside the table's own ceiling of
52 palette keys a character.
"""
import argparse
import json
import os
import sys
from collections import Counter

import numpy as np
from PIL import Image

from build_table import NAME_MAP, REF, cleaned

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MAGENTA = (255, 0, 255)
SIZE, ZOOM, COLOURS = 64, 16, 22
FACINGS = ('right', 'front', 'left')


def register_row(game_key, pack_name):
    """The character's line out of PD_SOURCES.md, which is the source of truth
    for what may be drawn and what has to be avoided."""
    p = os.path.join(ROOT, '..', 'PD_SOURCES.md')
    if not os.path.exists(p):
        return None
    words = set(pack_name.split('_')) | {game_key}
    for line in open(p, encoding='utf-8'):
        if not line.startswith('|'):
            continue
        cells = [c.strip() for c in line.strip('|\n').split('|')]
        if len(cells) < 4:
            continue
        name = cells[0].lower()
        if any(w and w in name for w in words) or name.replace(' ', '_') == pack_name:
            return cells
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('character')
    ap.add_argument('--out', default='/tmp')
    args = ap.parse_args()

    gk = args.character
    keys = json.load(open(os.path.join(HERE, 'game_keys.json')))
    if gk not in keys:
        sys.exit('%r is not a game key. See tools/game_keys.json' % gk)
    pk = NAME_MAP.get(gk, gk)

    # LEFT IS DELIBERATELY NOT DRAWN INTO THE SHEET. It is exactly mirror(right)
    # for every character and the game mirrors at draw time, so putting it in
    # front of an artist invites a second drawing of a pose nobody needs.
    cells = []
    for facing in FACINGS[:2]:
        p = os.path.join(REF, 'sprites_64', facing, pk + '.png')
        if not os.path.exists(p):
            continue
        f = cleaned(np.asarray(Image.open(p).convert('RGBA'), dtype=np.uint8))
        if f is not None:
            cells.append((facing, f))
    if not cells:
        sys.exit('no stills on disk for %s' % pk)

    # ONE PALETTE ACROSS EVERY CELL, because the brief asks the artist for one
    # palette across the whole character. Quantising each still on its own
    # would hand over two lists that do not agree.
    both = np.concatenate([f[:, :, :3][f[:, :, 3] > 0] for _, f in cells])
    pal = Image.fromarray(both.reshape(1, -1, 3).astype(np.uint8))
    table = np.array(pal.quantize(colors=COLOURS, method=Image.MAXCOVERAGE)
                     .getpalette()[:COLOURS * 3], dtype=np.int16).reshape(-1, 3)

    sheet = Image.new('RGB', (SIZE * ZOOM * len(cells), SIZE * ZOOM), MAGENTA)
    used = Counter()
    for i, (_, f) in enumerate(cells):
        op = f[:, :, 3] > 0
        px = f[:, :, :3][op].astype(np.int16)
        near = np.abs(px[:, None, :] - table[None, :, :]).sum(axis=2).argmin(axis=1)
        rgb = np.full((SIZE, SIZE, 3), MAGENTA, dtype=np.uint8)
        rgb[op] = table[near].astype(np.uint8)
        for j in near:
            used[tuple(int(v) for v in table[j])] += 1
        sheet.paste(Image.fromarray(rgb).resize((SIZE * ZOOM, SIZE * ZOOM), Image.NEAREST),
                    (i * SIZE * ZOOM, 0))

    out = os.path.join(args.out, '%s_ref.png' % gk)
    sheet.save(out)

    op = cells[0][1][:, :, 3] > 0
    ys, xs = np.where(op)
    print('%s  (pack name %s)' % (gk, pk))
    print('  %s  %dx%d, cells: %s' % (out, sheet.size[0], sheet.size[1],
                                      ', '.join(n for n, _ in cells)))
    print('  the figure: %d px tall, %d wide, columns %d-%d, feet on row %d'
          % (ys.max() - ys.min() + 1, xs.max() - xs.min() + 1, xs.min(), xs.max(), ys.max()))
    order = [c for c, _ in used.most_common()]
    print('  palette, commonest first:')
    for r in range(0, len(order), 6):
        print('    ' + '  '.join('#%02x%02x%02x' % c for c in order[r:r + 6]))
    row = register_row(gk, pk)
    if row:
        print('  source  : %s' % row[1])
        print('  shows   : %s' % row[2])
        print('  AVOID   : %s' % row[3])
    else:
        print('  NO ROW IN PD_SOURCES.md: do not brief this one until there is')


if __name__ == '__main__':
    main()
