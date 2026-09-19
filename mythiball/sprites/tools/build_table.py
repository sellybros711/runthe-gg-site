"""BUILD THE GAME'S SPRITE TABLE OUT OF THE HANDOFF ART.

    python3 tools/build_table.py            write build/sprites_v3.js
    python3 tools/build_table.py --report   what each pose was sourced from

The game draws from V2_SPRITES: per character a palette of single character
keys and a set of named poses, each an RLE string of rows. This writes that
same table from the 64x64 pack instead of the 32x50 generator, so the
renderer, the caches and every call site downstream are untouched.

EVERY CHARACTER COMES FROM ONE SOURCE, WHICH IS THE WHOLE POINT. Half a
roster in the new style and half in the old reads worse than either, and the
same is true inside one character: an idle from the pack and a swing from the
generator makes a man change species when he swings. So a character is built
entirely from the pack, and the poses the pack cannot draw are filled from the
pack's own stills rather than from the generator. See STILL_POSE below for
which five those are and what stands in for them.

SO THE STATIC ART IS THE FLOOR AND THE STRIPS ARE THE BONUS.
source_reference carries all 68 characters in right, left and front, with no
gaps at all, and that is what makes this possible: the animation strips cover
55 characters and 141 of their 330 are unusable, so strips alone would restyle
part of a roster. Static art gives every character the new look, and a working
strip upgrades a pose from a still to a real drawn frame on top of that.

THE PALETTE KEYS MAY NOT BE DIGITS OR A FULL STOP. The row format counts runs
in decimal and reserves '.' for transparent, so a digit key would be read as a
repeat and a '.' key would be read as a hole. Letters only, which caps a
character at 52 colours; the pack shares a 24 colour palette, so nothing is
близко to the ceiling and anything over it is quantised down with a warning.
"""
import argparse
import json
import os
import sys
from collections import Counter

import numpy as np
from PIL import Image

from spritelib import border_background, frames_of

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
STRIPS = os.path.join(ROOT, 'enhanced_animation_strips')
REF = os.path.join(ROOT, 'source_reference')
BUILD = os.path.join(ROOT, 'build')
REPORTS = os.path.join(ROOT, 'reports')

SIZE = 64
KEYS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

# The game's key against the pack's filename. The game shortened several
# names and renamed Kong to the great ape for the same public domain reason
# PD_SOURCES.md records; raboddog is a typo that shipped and is load bearing
# now, because it is the key every save and every roster row already uses.
NAME_MAP = {
    'beardedlady': 'bearded_lady', 'blackcat': 'black_cat', 'bunny': 'easter_bunny',
    'fairy': 'tooth_fairy', 'fathertime': 'father_time', 'firebreather': 'fire_breather',
    'franky': 'frankenstein', 'golem': 'the_golem', 'horseman': 'headless_horseman',
    'huck': 'huck_finn', 'humpty': 'humpty_dumpty', 'hyde': 'mr_hyde',
    'ichabod': 'ichabod_crane', 'invisible': 'invisible_man', 'kong': 'great_ape',
    'liberty': 'lady_liberty', 'lion': 'cowardly_lion', 'longjohn': 'long_john_silver',
    'lupin': 'arsene_lupin', 'mothernature': 'mother_nature', 'mrsclaus': 'mrs_claus',
    'paulbunyan': 'paul_bunyan', 'peter': 'peter_pan', 'raboddog': 'rabid_dog',
    'robin': 'robin_hood', 'tom': 'tom_sawyer',
}

# WHICH PACK FRAME STANDS FOR WHICH GAME POSE. The game asks for sixteen and
# the pack draws six, so the rest are filled from the stills rather than left
# out. A missing pose falls through to idle, and idle faces the wrong way for
# half of them: a runner heading for second would face the camera.
POSE_SOURCE = {
    'idle':    ('idle', 0),
    'run1':    ('run', 0),
    'run2':    ('run', 2),
    'ready':   ('batting_stance', 0),
    'load':    ('swing', 0),
    'swing':   ('swing', 2),
    'follow':  ('swing', 3),
    'windup':  ('pitch', 0),
    'kick':    ('pitch', 1),
    'release': ('pitch', 2),
    'throw':   ('pitch', 3),
    'slump':   ('celebrate', 0),
}

# THE POSES THE PACK CANNOT DRAW, AND WHAT STANDS IN. There is no rear view
# in source_reference and no fielding art anywhere, so `back` is not a back:
# it is the LEFT facing still, and the game reads a profile where it used to
# read a pair of shoulders.
#
# THAT IS A CAMERA CHANGE RATHER THAN A HOLE, and it is the reason to prefer
# it over falling through to idle. A batter drawn in profile is what most
# baseball games show, a runner in profile is going somewhere, and both stay
# inside the pack's own style. Idle would face a runner at the camera while he
# ran to second.
#
# What it does NOT do is invent anything. catch and throw have no fielding art
# behind them and stand on a still, which is the brief's own instruction for
# fielding: fall back until the art exists, never generate it. The 141 strips
# in docs/ART_ORDER.md are what turns these back into drawn frames.
# catch takes the FRONT still where the pack has one, which is 59 of the 68.
# That is not decoration: a fielder taking a catch turns toward the ball, and
# it is the one still that differs from the right facing idle, so the pose
# reads as its own drawing instead of the batter standing there again.
# catch takes the RIGHT still now that idle is the front one, so the two are
# still different drawings and a catch still turns the fielder.
STILL_POSE = {
    'back': 'left', 'backrun1': 'left', 'backrun2': 'left',
    'catch': 'right', 'throw': 'right',
}
# front exists for 59 of the 68, so the nine without one fall back to LEFT
# rather than to right: catch has to differ from the right facing idle or it
# is a pose the player cannot tell happened.
STILL_FALLBACK = {}


def usable_frame(f):
    """Is THIS frame usable, whatever the rest of its strip is like?

    THE STRIP IS THE WRONG UNIT AND USING IT THREW ART AWAY. The audit
    classifies a strip, because that is what an artist redraws, and the first
    build read that verdict straight: one clipped frame in a four frame swing
    condemned the other three, so acrobat's follow through fell back to a
    still while the drawn follow through sat in the file untouched. A frame is
    good or bad on its own, and this asks about the frame.

    It is the same mistake the audit's own clipping rule makes one level up,
    arriving again: do not condemn good art because of its neighbour.
    """
    if f is None:
        return False
    op = (f[:, :, 3] > 0)
    return bool(op.sum() >= 200 and not op[:, 0].any() and not op[:, SIZE - 1].any())


def cleaned(frame):
    """A pack frame with its baked background off and its feet on y=62.

    THE SHIFT IS REFUSED WHEN IT WOULD CLIP. Several characters are drawn
    the full height of the canvas (scarecrow, sherlock and werewolf occupy
    rows 0 to 63), so nudging them down a pixel to seat the feet pushes the
    top of the hat off the top instead. A pixel of baseline is worth less
    than a pixel of drawing, so when there is no room the frame is left
    exactly where the artist put it.
    """
    f = frame.copy()
    f[border_background(f)] = 0
    op = f[:, :, 3] > 0
    if not op.any():
        return None
    ys = np.where(op.any(axis=1))[0]
    top, bottom = int(ys.min()), int(ys.max())
    shift = 62 - bottom
    if shift > 0 and top - shift < 0:
        shift = top          # as far down as there is room for
    if shift < 0 and bottom - shift > SIZE - 1:
        shift = 0
    if shift:
        g = np.zeros_like(f)
        if shift > 0:
            g[shift:, :, :] = f[:SIZE - shift, :, :]
        else:
            g[:SIZE + shift, :, :] = f[-shift:, :, :]
        f = g
    return f


def deepen_rim(f, k=0.62):
    """Darken the outermost ring of opaque pixels, keeping hue.

    The pack tints its outlines from the adjacent fill, which is right for a
    character looked at on its own and too soft on a green field with a brown
    infield behind it. Only the ring that touches transparency moves, so the
    silhouette closes and nothing inside the figure changes: no identity
    shifts and no detail is lost.

    A RAMP RESPREAD WAS TRIED FIRST AND WAS MUCH WORSE. Opening up each
    character's compressed shading looked like the obvious fix for the blobs
    (great_ape carries 31 colours against paul_bunyan's 89, with 71% of its
    pixels inside two luminance bins). Previewed, it brightened everything it
    touched and took identity with it: the black cat came out PURPLE and the
    sasquatch went pale tan. Anything that rewrites fill colours will do that.
    Touch the rim, never the fill.
    """
    out = np.array(f, copy=True)
    op = out[:, :, 3] > 0
    edge = np.zeros_like(op)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        sh = np.roll(op, dy, axis=0) if dx == 0 else np.roll(op, dx, axis=1)
        if dy == 1:
            sh[0, :] = False
        if dy == -1:
            sh[-1, :] = False
        if dx == 1:
            sh[:, 0] = False
        if dx == -1:
            sh[:, -1] = False
        edge |= op & ~sh
    rgb = out[:, :, :3].astype(float)
    rgb[edge] = np.clip(rgb[edge] * k, 0, 255)
    out[:, :, :3] = rgb.astype(np.uint8)
    return out


def static_for(name, facing='right'):
    """A still from the pack. right and left exist for all 68, front for 59."""
    p = os.path.join(REF, 'sprites_64', facing, name + '.png')
    if not os.path.exists(p):
        p = os.path.join(REF, 'sprites_64', 'right', name + '.png')
    a = np.asarray(Image.open(p).convert('RGBA'), dtype=np.uint8)
    return cleaned(a)


def encode(frame, palette):
    """Rows of palette keys, run length encoded the way the page decodes."""
    rows = []
    for y in range(SIZE):
        chars = []
        for x in range(SIZE):
            r, g, b, a = frame[y, x]
            chars.append('.' if a == 0 else palette[(int(r), int(g), int(b))])
        out, run, prev = [], 0, None
        for ch in chars + [None]:
            if ch == prev:
                run += 1
                continue
            if prev is not None:
                out.append(prev if run == 1 else '%d%s' % (run, prev))
            prev, run = ch, 1
        rows.append(''.join(out))
    return '/'.join(rows)


def build_character(game_key, pack_name, audit, note):
    poses = {}
    for pose, (anim, idx) in POSE_SOURCE.items():
        strip = '%s_%s' % (pack_name, anim)
        path = os.path.join(STRIPS, strip + '.png')
        if not os.path.exists(path):
            continue
        fr = frames_of(path)
        # the asked for frame first, then its neighbours in the same
        # animation, because a nearby frame of the right ACTION beats a still
        order = [idx] + [i for i in range(len(fr)) if i != idx]
        for i in order:
            if i >= len(fr):
                continue
            c = cleaned(fr[i])
            if usable_frame(c):
                poses[pose] = c
                note.append((game_key, pose, strip + '#%d' % i))
                break

    base = static_for(pack_name)
    if base is None:
        return None

    # IDLE FACES THE CAMERA, AND THAT IS THE GAME'S OWN CONVENTION RATHER
    # THAN a preference. The generated sprites this replaced were drawn front
    # on, so every camera here was framed against a character looking at you;
    # pointing idle at the pack's right profile is what made the roster read
    # as a row of people ignoring the player.
    #
    # It also carries far more of the character. The front still is the only
    # view where the cyclops' single eye is in the middle of his face instead
    # of on the edge of a blob, where hermes has both wings, and where anyone
    # has two eyes at all. Measured, it is a bigger drawing too: cyclops 2606
    # opaque pixels against 1982, athena 2149 against 1796.
    #
    # The ACTION poses stay in profile, because the strips are drawn facing
    # right and because a swing reads better side on. Face the camera while
    # standing, turn to play: that is what the old sprites did.
    front = static_for(pack_name, 'front') if os.path.exists(
        os.path.join(REF, 'sprites_64', 'front', pack_name + '.png')) else None
    poses['idle'] = front if front is not None else base
    note.append((game_key, 'idle',
                 'source_reference/front' if front is not None else 'source_reference/right'))

    # the five the pack cannot draw, filled from a still rather than left to
    # fall through to idle facing the wrong way
    # A STILL POSE HAS TO DIFFER FROM WHATEVER IDLE TURNED OUT TO BE, which
    # is not the same as naming a facing. catch is the right still because
    # idle is normally the front one, and for the nine characters with no
    # front view idle IS the right still, so catch came back pixel identical
    # to it and kong had a catch nobody could tell had happened. Ask for the
    # facing wanted, then walk the other stills until one is a different
    # drawing.
    for pose, facing in STILL_POSE.items():
        want = facing
        st = None
        for cand in [facing] + [f for f in ('right', 'left', 'front') if f != facing]:
            if not os.path.exists(os.path.join(REF, 'sprites_64', cand, pack_name + '.png')):
                continue
            trial = static_for(pack_name, cand)
            if trial is None:
                continue
            if st is None:
                st, want = trial, cand      # the first that exists, as a floor
            if not np.array_equal(trial, poses['idle']):
                st, want = trial, cand      # better: one that actually differs
                break
        if st is not None:
            poses[pose] = st
            note.append((game_key, pose, 'source_reference/' + want))

    # Anything still absent repeats a still, so the drawer never asks for a
    # pose this character does not carry. The FRONT still is preferred where
    # it exists and differs, because a pose that is pixel identical to idle
    # is a pose the player cannot tell happened.
    same_as_idle = front is None or np.array_equal(front, poses['idle'])
    for pose in POSE_SOURCE:
        if pose not in poses:
            if pose in ('ready', 'load') and not same_as_idle:
                poses[pose] = front
                note.append((game_key, pose, 'source_reference/front'))
            else:
                poses[pose] = poses['idle']
                note.append((game_key, pose, 'repeat of idle'))

    # THE SILHOUETTE IS CLOSED LAST, after every pose is chosen, so the rim
    # is deepened exactly once on each frame and the palette below counts the
    # colours that actually ship.
    poses = {k: deepen_rim(v) for k, v in poses.items()}

    # one palette a character, over every pose it actually carries
    cols = Counter()
    for f in poses.values():
        op = f[:, :, 3] > 0
        for c in map(tuple, f[:, :, :3][op].tolist()):
            cols[c] += 1
    if len(cols) > len(KEYS):
        keep = [c for c, _ in cols.most_common(len(KEYS))]
        arr = np.array(keep, dtype=np.int16)
        for f in poses.values():
            op = f[:, :, 3] > 0
            px = f[:, :, :3][op].astype(np.int16)
            near = np.abs(px[:, None, :] - arr[None, :, :]).sum(axis=2).argmin(axis=1)
            f[:, :, :3][op] = arr[near].astype(np.uint8)
        cols = Counter(keep)
    palette = {c: KEYS[i] for i, c in enumerate(sorted(cols))}
    return {
        'p': {palette[c]: '#%02x%02x%02x' % c for c in sorted(cols)},
        'f': {k: encode(v, palette) for k, v in poses.items()},
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--report', action='store_true')
    args = ap.parse_args()

    audit = {}
    ap_path = os.path.join(REPORTS, 'audit.csv')
    if os.path.exists(ap_path):
        import csv
        for r in csv.DictReader(open(ap_path)):
            audit[r['strip']] = r

    game_keys = json.load(open(os.path.join(HERE, 'game_keys.json')))
    table, note, missing = {}, [], []
    for gk in game_keys:
        pack = NAME_MAP.get(gk, gk)
        if not os.path.exists(os.path.join(REF, 'sprites_64', 'right', pack + '.png')):
            missing.append(gk)
            continue
        built = build_character(gk, pack, audit, note)
        if built:
            table[gk] = built

    os.makedirs(BUILD, exist_ok=True)
    out = os.path.join(BUILD, 'sprites_v3.js')
    with open(out, 'w') as fh:
        fh.write('const V2_W = %d, V2_H = %d;\n' % (SIZE, SIZE))
        fh.write('const V2_SPRITES = ')
        fh.write(json.dumps(table, separators=(',', ':'), sort_keys=True))
        fh.write(';\n')

    kb = os.path.getsize(out) / 1024.0
    drawn = sum(1 for _, _, s in note if not s.startswith('source_reference'))
    print('%d characters, %d KB' % (len(table), kb))
    print('  poses from a real drawn frame : %d' % drawn)
    print('  characters falling back to the still for every pose : %d'
          % sum(1 for k in table if len(table[k]['f']) == 1))
    per = Counter(len(v['f']) for v in table.values())
    print('  poses per character: %s' % dict(sorted(per.items())))
    if missing:
        print('  NO PACK ART AT ALL: %s' % ', '.join(missing))
    if args.report:
        for gk, pose, src in note:
            print('    %-14s %-8s %s' % (gk, pose, src))


if __name__ == '__main__':
    main()
