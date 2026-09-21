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
close to the ceiling and anything over it is quantised down with a warning.
"""
import argparse
import json
import os
import sys
from collections import Counter

import numpy as np
from PIL import Image

from spritelib import border_background, drop_edge_bleed, edge_run, frames_of

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

# NINETEEN STRIP FILES ARE NAMED AFTER THE WRONG CHARACTER, AND THE GAME HAS
# BEEN SHIPPING IT. A character's STILLS and its STRIPS came out of the pack
# under the same name and only the stills are that character: medusa stood at
# the plate as a gorgon and swung as a brown haired woman in a blue dress,
# apollo stood holding a lyre and played as a centaur, krampus batted as
# Humpty Dumpty. Every screen rendered perfectly. A player watched somebody
# change species between the pitch and the swing, which is the exact failure
# the one-source-per-character rule in this file was written to prevent,
# arriving from inside the pack instead of from the builder.
#
# THIS MAP IS AN OBSERVATION, WRITTEN THE DIRECTION IT WAS OBSERVED: the file
# on the left draws the character on the right. The builder wants the inverse
# and computes it, because a hand written inverse is a second copy of an
# answer and the two drift.
#
# NO AUTOMATIC MATCHER IS AVAILABLE, which is worth knowing before anybody
# tries to regenerate this. The pack redrew every character for the strips
# with a different palette: measured, a character's strips and its own stills
# share ZERO exact colours, and quantising both (3, 4 and 5 bits, three mass
# floors) never separates a known good pairing from a known bad one at any
# setting. Two colour matchers were written and both confidently named the
# wrong character. It was read by eye off contact sheets.
#
# WHAT CORROBORATES IT is the shape rather than any one row. The nineteen sit
# in two CONTIGUOUS blocks of manifest.json's own key order, 13 to 22 and 33
# to 42, and each block is a CLOSED permutation of itself: every file in the
# block draws another character from the same block, exactly once. Nothing
# outside those two blocks is touched and all 36 other files are their own
# character. That is what a packaging bug looks like and it is not what a
# string of eyesight mistakes looks like. `build_table.py` asserts both
# properties on every run, so a typo here fails rather than ships.
FILE_DRAWS = {
    # manifest block 13-22
    'acrobat':           'cowardly_lion',
    'apollo':            'centaur',
    'ares':              'arsene_lupin',
    'arsene_lupin':      'ares',
    'athena':            'bearded_lady',
    'bearded_lady':      'chupacabra',
    'black_cat':         'acrobat',
    'centaur':           'black_cat',
    'chupacabra':        'athena',
    'cowardly_lion':     'apollo',
    # manifest block 33-42 (mr_hyde is the one file in it that is itself)
    'headless_horseman': 'long_john_silver',
    'hera':              'mother_nature',
    'hermes':            'mrs_claus',
    'humpty_dumpty':     'medusa',
    'krampus':           'humpty_dumpty',
    'long_john_silver':  'headless_horseman',
    'medusa':            'hera',
    'mother_nature':     'krampus',
    'mrs_claus':         'hermes',
}
# The builder asks the other way round: whose art am I, and which file holds
# it. Anything not named here is its own file, which is the other 36.
STRIP_FILE = {v: k for k, v in FILE_DRAWS.items()}
if len(STRIP_FILE) != len(FILE_DRAWS):
    sys.exit('FILE_DRAWS is not a bijection: two files claim one character')


# WHICH PACK FRAME STANDS FOR WHICH GAME POSE. The game asks for sixteen and
# the pack draws six, so the rest are filled from the stills rather than left
# out. A missing pose falls through to idle, and idle faces the wrong way for
# half of them: a runner heading for second would face the camera.
# EVERY FRAME THE ARTIST DREW, because the game was showing about a quarter
# of them. A run strip is a four frame cycle (contact, passing, contact,
# passing) and the page played a two frame toggle off frames 0 and 2, so
# every runner in the game shuffled between two poses while two more sat in
# the file. The swing strip is four beats and the page used three. Counted
# over the pack, 274 drawn and usable frames were never on screen.
POSE_SOURCE = {
    'idle':    ('idle', 0),
    'run1':    ('run', 0),
    'run2':    ('run', 1),
    'run3':    ('run', 2),
    'run4':    ('run', 3),
    'ready':   ('batting_stance', 0),
    'load':    ('swing', 0),
    'swing1':  ('swing', 1),
    'swing':   ('swing', 2),
    'follow':  ('swing', 3),
    'windup':  ('pitch', 0),
    'kick':    ('pitch', 1),
    'release': ('pitch', 2),
    'throw':   ('pitch', 3),
    'cheer':   ('celebrate', 0),
}

# THE CELEBRATION BELONGS TO WHOEVER THREW THE PITCH, NOT TO WHOEVER MISSED
# IT. `slump` was sourced from the celebrate strip, so for 51 characters the
# beat after a called third strike was the batter throwing both arms in the
# air. The art is right and drawn; it was pointed at the wrong man. It is
# `cheer` now and the pitcher wears it on a strikeout, and `slump` is the walk
# back, below.
#
# NOTHING MAY SOURCE `slump` FROM A STRIP. The pack has no dejection art of
# any kind, and the nearest looking frame is the one that means the opposite,
# so the way this comes back is somebody reaching for the closest frame again.
NO_STRIP = {'slump'}
if NO_STRIP & set(POSE_SOURCE):
    sys.exit('%s may not come from an animation strip: see NO_STRIP'
             % ', '.join(sorted(NO_STRIP & set(POSE_SOURCE))))

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
#
# `slump` IS THE WALK BACK AND NOTHING MORE, which is a loss stated plainly
# rather than papered over. The generator made one by dropping a parametric
# figure's arms five pixels; hand drawn art has no arms to find, so there is
# no dejection here to reach for and the honest pose is the man turning away
# from the plate. It is the same left facing still `back` is, so it costs
# nothing in the table, and the day somebody draws a real slump it plugs
# straight in. docs/ART_ORDER.md orders it.
STILL_POSE = {
    'back': 'left', 'backrun1': 'left', 'backrun2': 'left',
    'catch': 'right', 'throw': 'right', 'slump': 'left',
}
# front exists for 59 of the 68, so the nine without one fall back to LEFT
# rather than to right: catch has to differ from the right facing idle or it
# is a pose the player cannot tell happened.
STILL_FALLBACK = {}

# WHICH POSE OWNS A DRAWING WHEN SEVERAL SHARE ONE, used only to decide which
# of them is written out in full and which are written as '@' references to
# it. It is idle first and then the order the game plays them in, so the one
# holding the pixels is the earliest use rather than whichever way a dict
# happened to iterate. Every pose appears exactly once, which the build
# asserts: a name missing here would be dropped from the table outright.
ALIAS_ORDER = ['idle', 'ready', 'load', 'swing1', 'swing', 'follow',
               'run1', 'run2', 'run3', 'run4',
               'back', 'backrun1', 'backrun2', 'slump', 'windup', 'kick',
               'release', 'throw', 'catch', 'cheer']


# A FRAME HAS TO HOLD MOST OF ITS OWN CHARACTER, and 200 pixels cannot say
# that. The absolute floor was written to catch a blank, and a character here
# is 1,300 to 2,800 opaque pixels, so it let through four frames where the
# PERSON had walked out of the canvas and left his kit behind: a bat and a hat
# lying on the grass (long_john_silver), a bat and one shoe (mother_nature),
# popeye's bat with a sliver of leg, and a fire_breather cut off at the waist.
# Every one passed, because a bat really is more than 200 pixels.
#
# THE FLOOR IS RELATIVE AND THE GAP IS MEASURED. Sorted by share of that
# character's own still, the four sit at 0.13, 0.15, 0.25 and 0.29, and the
# next frame up is 0.38. Nothing lives in between. 0.33 is the middle of that
# gap rather than the last value that passes, which is the same rule the
# premium sheet's breakpoint was picked by.
#
# IT CANNOT BE ABSOLUTE AND IT CANNOT BE TIGHTER. humpty_dumpty's whole strip
# set runs 0.38 to 0.42 of his still, because he is drawn as a big egg
# standing still and a smaller figure moving. That is an artist's choice about
# one character, not a fragment, so a floor at 0.45 would delete his entire
# animation set and report it as a cleanup.
MASS_FLOOR = 0.33

# HOW FAR A FIGURE MAY RUN DOWN A SIDE EDGE BEFORE IT HAS BEEN CUT OFF.
# Measured after the bleed is removed, the runs are 0 to 30 and then one at
# 51, which is fire_breather's idle: over three quarters of the frame height
# flat against the wall, which is what a figure sliced in half looks like.
# Nothing else is above 30, so 40 sits in the gap.
EDGE_RUN_MAX = 40


def usable_frame(f, ref_mass=None):
    """Is THIS frame usable, whatever the rest of its strip is like?

    THE STRIP IS THE WRONG UNIT AND USING IT THREW ART AWAY. The audit
    classifies a strip, because that is what an artist redraws, and the first
    build read that verdict straight: one clipped frame in a four frame swing
    condemned the other three, so acrobat's follow through fell back to a
    still while the drawn follow through sat in the file untouched. A frame is
    good or bad on its own, and this asks about the frame.

    It is the same mistake the audit's own clipping rule makes one level up,
    arriving again: do not condemn good art because of its neighbour.

    `ref_mass` is the character's own still, against which MASS_FLOOR above
    decides whether there is a character in here at all.
    """
    if f is None:
        return False
    if edge_run(f) > EDGE_RUN_MAX:
        return False
    n = int((f[:, :, 3] > 0).sum())
    if n < 200:
        return False
    return ref_mass is None or n >= MASS_FLOOR * ref_mass


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
    # BEFORE THE BASELINE IS MEASURED, NOT AFTER. The shift seats the feet on
    # y=62, and a blob bleeding in from the frame next door is usually lower
    # than the character is, so left in place it is what gets seated and the
    # character floats above the dirt by however tall the blob was.
    f = drop_edge_bleed(f)
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
    base = static_for(pack_name)
    # THE STILLS AND THE STRIPS ARE LOOKED UP UNDER DIFFERENT NAMES, and that
    # is the whole of the mislabelling fix. `pack_name` is right for the
    # stills, which really are this character; the strips for nineteen of
    # them live in a file named after somebody else. See FILE_DRAWS.
    strip_name = STRIP_FILE.get(pack_name, pack_name)
    if base is None:
        return None
    ref_mass = int((base[:, :, 3] > 0).sum())
    # WHICH POSES CARRY A BAT IN THE ART, which only the builder can know: it
    # is the one that picked the frame. The page draws a prop bat over the
    # sprite, written when the generator's figures held nothing, and the pack
    # draws real bats in the swing and batting stance strips. Left alone that
    # is TWO bats on the most looked at frame in the game, the batter waiting
    # on the pitch. Only the swing and batting stance strips hold one; the
    # pitch, run, idle and celebrate strips do not, and neither does a still.
    BAT_ANIMS = ('swing', 'batting_stance')
    bat = []
    # WHICH FRAME OF A STRIP IS ALREADY SPOKEN FOR, so two poses off one
    # animation cannot end up being the same drawing. See the walk below.
    claimed = {}
    for pose, (anim, idx) in POSE_SOURCE.items():
        strip = '%s_%s' % (strip_name, anim)
        path = os.path.join(STRIPS, strip + '.png')
        if not os.path.exists(path):
            continue
        fr = frames_of(path)
        # THE WALK GOES OUTWARD FROM THE FRAME ASKED FOR, AND PREFERS ONE
        # NOBODY ELSE HAS TAKEN. Both halves of that were wrong and the two
        # faults compounded into a swing that does not swing.
        #
        # It used to be [idx] + [0, 1, 2, ...], so every pose that could not
        # have the frame it wanted landed on frame ZERO of the strip. Three
        # poses come off the swing strip (load #0, swing #2, follow #3) and
        # four off the pitch strip, so one broken frame in the middle sent
        # the rest to the same drawing: measured, `swing` was pixel identical
        # to `load` on 31 characters and `release` to `windup` on 32. The bat
        # came round by not moving, and nothing anywhere said so, because a
        # repeated frame is a perfectly valid frame.
        #
        # So the order is by DISTANCE from what was asked for, which keeps a
        # substitute inside the same beat of the action, and an unclaimed
        # frame is taken over a claimed one. A claimed one is still allowed
        # last, because the right action drawn twice beats a still.
        near = sorted(range(len(fr)), key=lambda i: (abs(i - idx), i))
        order = [i for i in near if (strip, i) not in claimed] + \
                [i for i in near if (strip, i) in claimed]
        for i in order:
            c = cleaned(fr[i])
            if usable_frame(c, ref_mass):
                poses[pose] = c
                claimed[(strip, i)] = pose
                note.append((game_key, pose, strip + '#%d' % i))
                if anim in BAT_ANIMS:
                    bat.append(pose)
                break

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

    # ANYTHING STILL ABSENT STANDS ON THE PROFILE, NOT ON IDLE. A pose that is
    # pixel identical to idle is a pose the player cannot tell happened, and
    # 151 of the 1088 were exactly that.
    #
    # The profile is the right stand-in rather than a second-best one, because
    # every one of these poses is a thing done side on. A right handed batter
    # is drawn unflipped and a lefty is mirrored (`drawRunner`'s flip), the
    # pitcher works the same way, so the pack's RIGHT facing still already
    # points where the action goes. Idle faces the camera, so a character with
    # no strips used to stand square to the reader through a whole at bat.
    #
    # THE BRANCH THIS REPLACES COULD NEVER FIRE. It preferred the front still
    # for `ready` and `load` and guarded on `front is not None and front !=
    # poses['idle']`, written before idle BECAME the front still. After that
    # change the two are the same object, so the test was false every time and
    # 28 batting stances quietly fell through to a repeat of idle.
    #
    # It refuses to invent: where the profile IS idle (the nine characters
    # with no front view) there is no second drawing to reach for, so the
    # repeat stands and the art order is what fixes it.
    for pose in POSE_SOURCE:
        if pose not in poses:
            if not np.array_equal(base, poses['idle']):
                poses[pose] = base
                note.append((game_key, pose, 'source_reference/right'))
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

    # NEVER DUPLICATE ART. A pose that came out pixel identical to one already
    # in this character is stored as '@thatpose' and the page resolves it
    # before decoding. It is lossless: the same drawing either way, and the
    # two poses now share one decoded rows array instead of building two.
    #
    # It is not a rounding saving. Three poses are the same left facing still
    # by construction (back and the two backruns), catch and throw are the
    # same right facing one, and everything the pack cannot draw stands on a
    # still as well, so 37.7% of the table was one string written again.
    #
    # '@' is safe as the mark because the row format uses letters for palette
    # keys, digits for run counts and '.' for transparent, so it can never be
    # the first character of a real row.
    enc = {k: encode(v, palette) for k, v in poses.items()}
    if set(ALIAS_ORDER) != set(enc):
        sys.exit('ALIAS_ORDER and the poses built disagree: %s'
                 % sorted(set(ALIAS_ORDER) ^ set(enc)))
    seen, out = {}, {}
    for pose in ALIAS_ORDER:
        rle = enc[pose]
        out[pose] = '@' + seen[rle] if rle in seen else rle
        seen.setdefault(rle, pose)
    rec = {
        'p': {palette[c]: '#%02x%02x%02x' % c for c in sorted(cols)},
        'f': out,
    }
    if bat:
        rec['b'] = sorted(bat)
    return rec


def check_file_draws():
    """FILE_DRAWS still has the shape that corroborates it, or the build stops.

    The map was read by eye and no automatic matcher can re-derive it (see the
    note over it), so what holds it up is not any one row: it is that the
    nineteen form CLOSED permutations of two contiguous runs of the pack's own
    key order, touching nothing else. A typo turns one of those into an open
    chain, which is a claim about the pack that is not true, and it would
    otherwise ship as one more character wearing somebody else's face.

    It also refuses a name the pack does not have, which is the ordinary way
    this breaks: a file that does not exist falls through to the stills in
    silence and the character simply stops moving.
    """
    mpath = os.path.join(ROOT, 'manifest.json')
    if not os.path.exists(mpath):
        return
    order = list(json.load(open(mpath)).keys())
    seen = set(order)
    for k, v in FILE_DRAWS.items():
        for n in (k, v):
            if n not in seen:
                sys.exit('FILE_DRAWS names %r, which the pack does not have' % n)
    pos = {n: i for i, n in enumerate(order)}
    todo, blocks = set(FILE_DRAWS), []
    while todo:
        lo = hi = pos[min(todo, key=lambda n: pos[n])]
        grew = True
        while grew:                       # widen to the closure of the cycle
            grew = False
            for k in FILE_DRAWS:
                if lo <= pos[k] <= hi or lo <= pos[FILE_DRAWS[k]] <= hi:
                    a, b = sorted((pos[k], pos[FILE_DRAWS[k]]))
                    if a < lo or b > hi:
                        lo, hi, grew = min(lo, a), max(hi, b), True
        span = order[lo:hi + 1]
        files = {n for n in span if n in FILE_DRAWS}
        arts = {FILE_DRAWS[n] for n in files}
        if files != arts:
            sys.exit('FILE_DRAWS is not a closed permutation over manifest '
                     '%d-%d: %s' % (lo, hi, sorted(files ^ arts)))
        blocks.append((lo, hi, len(files)))
        todo -= files
    print('FILE_DRAWS: %d files remapped in %d closed block(s) %s'
          % (len(FILE_DRAWS), len(blocks),
             ', '.join('%d-%d' % (a, b) for a, b, _ in blocks)))


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

    check_file_draws()
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
    # COUNT WHAT THE SOURCE ACTUALLY SAYS, never "not a still". Written as
    # `not s.startswith('source_reference')` this counted every `repeat of
    # idle` as a real drawn frame, so it reported 788 when 637 poses came off
    # a strip and 151 were the character standing still.
    drawn = sum(1 for _, _, s in note if '#' in s)
    repeats = sum(1 for _, _, s in note if s == 'repeat of idle')
    print('%d characters, %d KB' % (len(table), kb))
    print('  poses from a real drawn frame : %d' % drawn)
    print('  poses standing on a still     : %d' % (len(note) - drawn - repeats))
    print('  poses the reader cannot tell from idle : %d' % repeats)
    # a '@' value is a reference to another pose, so it is not a drawing
    distinct = [sum(1 for r in v['f'].values() if not r.startswith('@'))
                for v in table.values()]
    print('  distinct drawings a character : min %d, mean %.1f'
          % (min(distinct), sum(distinct) / float(len(distinct))))
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
