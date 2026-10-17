"""Retrosheet play-by-play for the spots before pitch tracking (proxy scenarios).

Read from the Chadwick Bureau's mirror of the Retrosheet event files on GitHub
(github.com/chadwickbureau/retrosheet), which answers from everywhere, including
the development container. The files are Retrosheet's own; the mirror is only
where they are fetched from.

  The information used here was obtained free of charge from and is
  copyrighted by Retrosheet. Interested parties may contact Retrosheet at
  "www.retrosheet.org".

The parser walks the whole game so the score, outs and bases at the spot are
the event file's own, then checks its runs by inning against Retrosheet's game
log line score. A game whose replay disagrees with the line score is refused.
"""

import csv
import re

from common import get

RAW = 'https://raw.githubusercontent.com/chadwickbureau/retrosheet/master'
PITCH_CHARS = set('BCFHIKLMOPQRSTUVXY')


def fetch(path):
    return get(f'{RAW}/{path}', cache_key='retro-' + path.replace('/', '-'))


def game_lines(season, fname, game_id):
    text = fetch(f'seasons/{season}/{fname}')
    out, on = [], False
    for line in text.splitlines():
        if line.startswith('id,'):
            on = line.strip() == f'id,{game_id}'
            continue
        if on:
            out.append(line.strip())
    if not out:
        raise RuntimeError(f'{game_id} not in {fname}')
    return out


def rosters(season, teams):
    out = {}
    for t in teams:
        try:
            text = fetch(f'seasons/{season}/{t}{season}.ROS')
        except RuntimeError:
            continue
        for line in text.splitlines():
            f = line.strip().split(',')
            if len(f) >= 5:
                out[f[0]] = {'last': f[1], 'first': f[2], 'bats': f[3], 'throws': f[4], 'team': f[5] if len(f) > 5 else t}
    return out


def line_score(game_id, logs=('gamelog/GLWS.TXT', 'gamelog/GLLC.TXT', 'gamelog/GLDV.TXT', 'gamelog/GLWC.TXT')):
    """Runs by inning for each side, from the Retrosheet game logs."""
    date, num, home = game_id[3:11], game_id[11], game_id[:3]
    for path in logs:
        for line in fetch(path).splitlines():
            f = [x.strip('"') for x in line.split(',')]
            if len(f) > 20 and f[0] == date and f[1] == num and f[6] == home:
                return {'away': f[19], 'home': f[20], 'awayRuns': int(f[9]), 'homeRuns': int(f[10]), 'log': path}
    return None


def count_pitches(seq):
    if seq is None or '?' in seq:
        return None
    return sum(1 for ch in seq if ch in PITCH_CHARS)


# ---- the event parser -----------------------------------------------------

BASE_NUM = {'B': 0, '1': 1, '2': 2, '3': 3, 'H': 4}


def _advances(adv):
    """'1-2;2XH(25);B-1' -> {src: (dest, out)}."""
    out = {}
    if not adv:
        return out
    for a in adv.split(';'):
        m = re.match(r'([B123])([-X])([123H])(.*)', a)
        if not m:
            continue
        src, op, dest, rest = BASE_NUM[m.group(1)], m.group(2), BASE_NUM[m.group(3)], m.group(4)
        is_out = op == 'X'
        if is_out and re.search(r'\(\d*E\d', rest):
            is_out = False  # an error on the throw: safe after all
        out[src] = (dest, is_out)
    return out


def apply_event(state, event):
    """state: {'outs', 'bases': {1: id, 2: id, 3: id}, 'batter'}. Returns runs and outs
    made on the play, and whether the plate appearance ended."""
    main, _, adv = event.partition('.')
    basic = main.split('/')[0]
    moves = _advances(adv)
    runs = outs = 0
    pa_over = True
    batter_dest = None  # None: out, 0: stays at the plate (PA continues), 1..4

    def runner_event(code):
        nonlocal outs
        for m in re.finditer(r'SB([23H])', code):
            dest = BASE_NUM[m.group(1)]
            moves.setdefault(dest - 1, (dest, False))
        for m in re.finditer(r'(?:PO)?CS([23H])(\([^)]*\))?', code):
            dest = BASE_NUM[m.group(1)]
            err = m.group(2) and 'E' in m.group(2)
            if not err:
                moves.setdefault(dest - 1, (dest, True))
        for m in re.finditer(r'(?<!S)PO([123])(\([^)]*\))?', code):
            b = int(m.group(1))
            err = m.group(2) and 'E' in m.group(2)
            if not err:
                moves.setdefault(b, (b, True))

    if basic in ('NP',) or re.match(r'^(SB|CS|PO|POCS|WP|PB|BK|DI|OA|FLE)', basic):
        pa_over = False
        batter_dest = 0
        runner_event(basic)
    elif basic.startswith('K'):
        batter_dest = None
        if '+' in basic:
            runner_event(basic.split('+', 1)[1])
    elif re.match(r'^(W|IW|I|HP)(\+|$)', basic) or basic.startswith('C/') or basic == 'C':
        batter_dest = 1
        if '+' in basic:
            runner_event(basic.split('+', 1)[1])
    elif re.match(r'^(S|D|T)\d*', basic) and not basic.startswith('SB'):
        batter_dest = {'S': 1, 'D': 2, 'T': 3}[basic[0]]
    elif basic.startswith('DGR'):
        batter_dest = 2
    elif basic.startswith('HR') or (basic.startswith('H') and not basic.startswith('HP')):
        batter_dest = 4
        for b in (1, 2, 3):
            if state['bases'].get(b) and b not in moves:
                moves[b] = (4, False)
    elif basic.startswith('E'):
        batter_dest = 1
    elif basic.startswith('FC'):
        batter_dest = 1
    elif re.match(r'^\d', basic):
        # Fielding play. '(n)' marks a runner put out; trailing digits after the
        # last group put the batter out too. A string with no group is a plain out.
        groups = re.findall(r'\(([B123])\)', basic)
        for g in groups:
            if g != 'B':
                b = int(g)
                moves.setdefault(b, (b, True))
        tail = re.sub(r'.*\)', '', basic) if groups else basic
        batter_dest = None if (not groups or re.search(r'\d', tail) or 'B' in groups) else 1
    else:
        raise ValueError(f'unparsed event {event!r}')

    if 0 in moves:  # an explicit batter advance wins
        dest, out = moves.pop(0)
        batter_dest = None if out else dest

    # Forced runners on a walk or hit by pitch move up if the file does not say.
    if batter_dest == 1 and re.match(r'^(W|IW|I|HP|C)', basic):
        if state['bases'].get(1) and 1 not in moves:
            if state['bases'].get(2) and 2 not in moves:
                if state['bases'].get(3) and 3 not in moves:
                    moves[3] = (4, False)
                moves[2] = (3, False)
            moves[1] = (2, False)

    nb = {b: r for b, r in state['bases'].items() if r and b not in moves}
    for src in sorted(moves, reverse=True):
        dest, out = moves[src]
        rid = state['bases'].get(src)
        if out:
            outs += 1
        elif dest == 4:
            runs += 1
        else:
            nb[dest] = rid
    if pa_over:
        if batter_dest is None:
            outs += 1
        elif batter_dest == 4:
            runs += 1
        elif batter_dest > 0:
            nb[batter_dest] = state['batter']
    state['bases'] = {b: r for b, r in nb.items() if r}
    state['outs'] += outs
    return runs, outs, pa_over


def replay(lines):
    """Walk the game. Yields one dict per play record with the state before it."""
    info, names = {}, {}
    fielding_pitcher = {}
    score = {0: 0, 1: 0}
    by_inning = {0: {}, 1: {}}
    half = None
    state = None
    for line in lines:
        f = next(csv.reader([line]), [])
        if not f:
            continue
        kind = f[0]
        if kind == 'info' and len(f) >= 3:
            info[f[1]] = f[2]
        elif kind in ('start', 'sub'):
            pid, name, team, pos = f[1], f[2], int(f[3]), int(f[5])
            names[pid] = name
            if pos == 1:
                fielding_pitcher[team] = pid
        elif kind == 'play':
            inning, team, batter, count, pitches, event = int(f[1]), int(f[2]), f[3], f[4], (f[5] if len(f) > 6 else ''), f[-1]
            if (inning, team) != half:
                half = (inning, team)
                state = {'outs': 0, 'bases': {}, 'batter': None}
            state['batter'] = batter
            before = {'inning': inning, 'team': team, 'outs': state['outs'],
                      'bases': dict(state['bases']), 'score': dict(score)}
            runs, outs, pa_over = apply_event(state, event)
            score[team] += runs
            by_inning[team][inning] = by_inning[team].get(inning, 0) + runs
            yield {
                'before': before, 'batter': batter, 'count': count, 'pitches': pitches,
                'event': event, 'runs': runs, 'outs': outs, 'paOver': pa_over,
                'pitcher': fielding_pitcher.get(1 - team), 'score': dict(score),
                'byInning': by_inning, 'names': names, 'info': info,
            }
