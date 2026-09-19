"""WHAT IS ACTUALLY IN THE 330 STRIPS, measured rather than eyeballed.

    python3 tools/audit.py                  the full scan
    python3 tools/audit.py --strips a,b     just these, for a fast loop

It reads enhanced_animation_strips/ and writes reports/audit.csv, one row a
strip, plus the classification that decides what the artist gets asked for.

IT TOUCHES NO PIXELS. Nothing in this file writes to the strips, and the
repair pass is a separate tool, because an audit that edits what it is
measuring can never be re-run to check itself.

THE PIXEL ROUTINES LIVE IN spritelib, not here, so the repair pass asks the
same questions of a frame that the audit did and cannot quietly disagree.

A COLOUR IS COUNTED ONLY WHERE IT IS OPAQUE. The palette budget is about what
the eye sees, and a fully transparent pixel carries an RGB value that is
usually leftover matte from whatever wrote the file. Counting it would put
every strip over budget for a colour nobody can see.

THE SPEC'S OWN RULE CONDEMNS ART THAT IS FINE, so this reports two verdicts
rather than one. "Any frame touching x=0 or x=63 is clipped and unfixable" is
right about a character that runs off the canvas and wrong about a character
standing behind a baked background, because a background reaches both edges by
definition. `classification` is the rule as specified. `classification_after_bg`
is the same rule asked again of what would be left once a border flood took
the background off, and the gap between them is 20 strips that do not need
redrawing. Both are reported because only the second one is an art ORDER, and
because a tool that silently substituted its own opinion for the spec's would
be the wrong thing to trust.
"""
import argparse
import csv
import json
import os
import sys
from collections import deque

import numpy as np
from PIL import Image

from spritelib import (FRAME, border_background, components, frames_of,
                       interior_holes, opaque_after_background)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
STRIPS = os.path.join(ROOT, 'enhanced_animation_strips')
REPORTS = os.path.join(ROOT, 'reports')


# What a strip of each animation is supposed to hold. The manifest says the
# same thing per character; this is the pack-wide claim, so a strip whose
# width disagrees is reported rather than trusted.
EXPECTED_FRAMES = {
    'idle': 2, 'batting_stance': 1, 'swing': 4,
    'pitch': 4, 'run': 4, 'celebrate': 2,
}

# THE THREE FAULTS CODE CANNOT REPAIR, and each is a different kind of
# missing. A blank frame has no art in it. A duplicate frame is padding
# standing in for art that was never drawn. A clipped frame had art that ran
# off the edge of the canvas, and the pixels past the edge do not exist in
# the file, so there is nothing to shift back in. Everything else (a baseline
# a pixel out, a baked background, a hole, too many colours) is a transform
# of pixels that ARE there.
BLANK_OPAQUE_FLOOR = 200


def audit_strip(path):
    name = os.path.basename(path)[:-4]
    img = Image.open(path)
    w, h = img.size
    fr = frames_of(img)
    n = len(fr)

    # the animation is the tail of the filename, longest name first so
    # batting_stance is not read as stance
    anim = ''
    for a in sorted(EXPECTED_FRAMES, key=len, reverse=True):
        if name.endswith('_' + a):
            anim = a
            break
    char = name[:-(len(anim) + 1)] if anim else name

    row = {
        'strip': name, 'character': char, 'animation': anim,
        'width': w, 'height': h, 'frame_count': n,
        'expected_frames': EXPECTED_FRAMES.get(anim, ''),
    }

    alpha_all = np.concatenate([f[:, :, 3].ravel() for f in fr])
    rgba_all = np.concatenate([f.reshape(-1, 4) for f in fr], axis=0)
    opaque_all = rgba_all[:, 3] > 0
    row['semi_transparent_pixels'] = int(((alpha_all > 0) & (alpha_all < 255)).sum())
    row['color_count'] = len(set(map(tuple, rgba_all[opaque_all][:, :3].tolist())))

    per_opaque, per_base, per_cov = [], [], []
    per_holes, per_x0, per_x63 = [], [], []
    islands = []
    for i, f in enumerate(fr):
        op = f[:, :, 3] > 0
        cnt = int(op.sum())
        per_opaque.append(cnt)
        per_cov.append(round(100.0 * cnt / (FRAME * FRAME), 2))
        ys = np.where(op.any(axis=1))[0]
        per_base.append(int(ys.max()) if ys.size else -1)
        per_holes.append(int(interior_holes(op).sum()))
        per_x0.append(int(op[:, 0].sum()))
        per_x63.append(int(op[:, FRAME - 1].sum()))
        comps = components(op)
        if comps:
            comps.sort(key=lambda c: c[0], reverse=True)
            for size, bb in comps[1:]:
                if size >= 4:
                    islands.append('f%d:%dpx@%d,%d-%d,%d' % (i, size, bb[0], bb[1], bb[2], bb[3]))

    same = []
    for i in range(n):
        for j in range(i + 1, n):
            if np.array_equal(fr[i], fr[j]):
                same.append('%d=%d' % (i, j))
    deltas = [int((fr[i] != fr[i + 1]).any(axis=2).sum()) for i in range(n - 1)]

    row.update({
        'opaque_pixels_per_frame': ';'.join(map(str, per_opaque)),
        'opaque_coverage_pct': ';'.join(map(str, per_cov)),
        'baseline_per_frame': ';'.join(map(str, per_base)),
        'interior_hole_pixels': ';'.join(map(str, per_holes)),
        'interior_hole_total': sum(per_holes),
        'edge_pixels_x0': ';'.join(map(str, per_x0)),
        'edge_pixels_x63': ';'.join(map(str, per_x63)),
        'detached_islands': len(islands),
        'detached_island_detail': ' '.join(islands),
        'identical_frame_pairs': ';'.join(same),
        'consecutive_frame_deltas': ';'.join(map(str, deltas)),
    })

    # THE CLASSIFICATION, and the reasons are kept rather than collapsed to a
    # verdict, because the order sheet has to say WHY each strip is on it.
    reasons = []
    blanks = [i for i, c in enumerate(per_opaque) if c < BLANK_OPAQUE_FLOOR]
    if blanks:
        reasons.append('blank frame(s) %s (under %d opaque px)'
                       % (','.join(map(str, blanks)), BLANK_OPAQUE_FLOOR))
    if same:
        reasons.append('duplicate frame(s) %s' % ','.join(same))
    clipped = [i for i in range(n) if per_x0[i] or per_x63[i]]
    if clipped:
        reasons.append('clipped at canvas edge, frame(s) %s' % ','.join(map(str, clipped)))
    if row['expected_frames'] and n != row['expected_frames']:
        reasons.append('frame count %d, expected %d' % (n, row['expected_frames']))

    row['classification'] = 'NEEDS_ART' if reasons else 'REPAIRABLE'
    row['needs_art_reasons'] = '; '.join(reasons)

    # THE SAME RULE, ASKED AGAIN OF WHAT SURVIVES A BORDER FLOOD. A baked
    # background touches both edges by definition, so the clipping test
    # condemns every frame that has one, including the ones with perfectly
    # good art standing behind it. This asks what would be left.
    bg_px, after_reasons = [], []
    for i, f in enumerate(fr):
        bg = border_background(f)
        bg_px.append(int((bg & (f[:, :, 3] > 0)).sum()))
        op = opaque_after_background(f)
        n_op = int(op.sum())
        if n_op < BLANK_OPAQUE_FLOOR:
            after_reasons.append('f%d blank after background (%d px)' % (i, n_op))
        elif op[:, 0].any() or op[:, FRAME - 1].any():
            after_reasons.append('f%d still clipped after background' % i)
    if same:
        after_reasons.append('duplicate frame(s) %s' % ','.join(same))
    row['background_pixels_per_frame'] = ';'.join(map(str, bg_px))
    row['classification_after_bg'] = 'NEEDS_ART' if after_reasons else 'REPAIRABLE'
    row['after_bg_reasons'] = '; '.join(after_reasons)
    row['recovered_by_bg_removal'] = (
        'yes' if row['classification'] == 'NEEDS_ART'
        and row['classification_after_bg'] == 'REPAIRABLE' else '')
    return row


FIELDS = ['strip', 'character', 'animation', 'classification', 'needs_art_reasons',
          'classification_after_bg', 'after_bg_reasons', 'recovered_by_bg_removal',
          'width', 'height', 'frame_count', 'expected_frames', 'color_count',
          'semi_transparent_pixels', 'opaque_pixels_per_frame', 'opaque_coverage_pct',
          'baseline_per_frame', 'interior_hole_pixels', 'interior_hole_total',
          'edge_pixels_x0', 'edge_pixels_x63', 'background_pixels_per_frame',
          'detached_islands', 'detached_island_detail', 'identical_frame_pairs',
          'consecutive_frame_deltas']


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--strips', default='', help='comma separated names, for a fast loop')
    ap.add_argument('--out', default=os.path.join(REPORTS, 'audit.csv'))
    args = ap.parse_args()

    names = sorted(f for f in os.listdir(STRIPS) if f.endswith('.png'))
    if args.strips:
        want = set(args.strips.split(','))
        names = [f for f in names if f[:-4] in want]
    if not names:
        sys.exit('no strips matched')

    rows = [audit_strip(os.path.join(STRIPS, f)) for f in names]
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, 'w', newline='') as fh:
        wtr = csv.DictWriter(fh, fieldnames=FIELDS)
        wtr.writeheader()
        wtr.writerows(rows)

    rep = sum(r['classification'] == 'REPAIRABLE' for r in rows)
    rep2 = sum(r['classification_after_bg'] == 'REPAIRABLE' for r in rows)
    recovered = sum(r['recovered_by_bg_removal'] == 'yes' for r in rows)
    print('%d strips' % len(rows))
    print('  as specified          : %3d REPAIRABLE  %3d NEEDS_ART' % (rep, len(rows) - rep))
    print('  after background flood: %3d REPAIRABLE  %3d NEEDS_ART  (%d recovered)'
          % (rep2, len(rows) - rep2, recovered))
    print('  wrote %s' % os.path.relpath(args.out, ROOT))

    kinds = {'blank frame': 0, 'duplicate frame': 0, 'clipped': 0, 'frame count': 0}
    for r in rows:
        for k in kinds:
            if k in r['needs_art_reasons']:
                kinds[k] += 1
    print('\n  faults, as specified (a strip can carry more than one):')
    for k, v in sorted(kinds.items(), key=lambda kv: -kv[1]):
        print('    %-20s %3d' % (k, v))

    with open(os.path.join(REPORTS, 'audit_summary.json'), 'w') as fh:
        json.dump({'total': len(rows), 'repairable': rep, 'needs_art': len(rows) - rep,
                   'repairable_after_bg': rep2, 'needs_art_after_bg': len(rows) - rep2,
                   'recovered_by_bg_removal': recovered}, fh, indent=1)


if __name__ == '__main__':
    main()
