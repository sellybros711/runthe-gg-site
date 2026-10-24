"""The advancement table: what a ball in play does to the runners, from data.

For every ball in play in the regular seasons asked for, the state before it
(outs, and who stood on which base: Savant's on_1b, on_2b, on_3b are player
ids) against the state at the next plate appearance's first pitch in the same
half inning. Following the ids gives each runner's destination; a runner who
vanished either scored or was put out, and the score says how many scored (the
lead runners are taken as the ones who scored). A play that ends the half has
outs added = 3 - outs before.

Rows are kept only when they conserve runners (runners after + runs + outs
added = runners before + 1), which is also what lets the solver's recursion
terminate. A play that ends the game (a walk-off) has no next state and is left
out: its runners are not observed.

Output: {cat: {outs * 8 + bases: [[p, basesAfter, runs, outsAdded, label, moves], ...]}}
with cat the outcome key of the ball in play (single ... out_popup), label the
contract's InPlayResult, moves [[from, to], ...] (0 batter, 1..3 bases, 4
scored, -1 out). Rows under MIN_P are dropped and the rest renormalised.

A PLAY THAT ENDS THE HALF has no next plate appearance in that half, so the
ids cannot say who was out or who scored. Counted here only by its share (one
row per state and label), it is then split by apply_third_outs into the real
plays of that kind, read from Savant's play text (third_outs.py, committed as
third_outs.json): who was out, who scored, and the runs that counted (Official
Baseball Rules 5.08(a): a run that crosses before a third out counts, unless
that out is a force or the batter before first). Until 2026-10-24 these rows
were a rule (the batter out, then the runners nearest him, no runs), which kept
a runner on his bag while the batter behind him was put out further round.
"""

import json
import os
import sys
from collections import Counter, defaultdict

import numpy as np
import pandas as pd

import prep

MIN_P = 0.004
COLS = ['game_pk', 'at_bat_number', 'pitch_number', 'inning', 'inning_topbot', 'outs_when_up',
        'on_1b', 'on_2b', 'on_3b', 'batter', 'bat_score', 'post_bat_score', 'description', 'events',
        'bb_type', 'game_type', 'balls', 'strikes', 'plate_x', 'plate_z', 'sz_top', 'sz_bot',
        'estimated_woba_using_speedangle', 'hc_x', 'hc_y', 'pitch_type']

DP = {'grounded_into_double_play', 'double_play', 'sac_fly_double_play', 'triple_play'}
FC = {'fielders_choice', 'fielders_choice_out', 'force_out'}


def label_of(cat, ev):
    if cat in ('single', 'double', 'triple', 'home_run', 'error'):
        return cat
    if ev in DP:
        return 'double_play'
    if ev in ('sac_fly',):
        return 'sac_fly'
    if ev in FC:
        return 'fielders_choice'
    return 'out'


def season_counts(df, counts):
    """Adds one season's plays to counts[(cat, outs, bases)][(nb, runs, oa, label, moves)]."""
    df = df[df['game_type'] == 'R'].sort_values(['game_pk', 'at_bat_number', 'pitch_number'])
    # the first pitch of every PA: the state the next PA starts from
    first = df.groupby(['game_pk', 'at_bat_number'], sort=True).head(1)
    nxt = first[['game_pk', 'at_bat_number', 'inning', 'inning_topbot', 'outs_when_up', 'on_1b', 'on_2b', 'on_3b']].copy()
    nxt['key'] = list(zip(nxt['game_pk'], nxt['at_bat_number']))
    pa_list = nxt.reset_index(drop=True)
    # the next PA in the same game, by at_bat_number order
    pa_list['n_inning'] = pa_list.groupby('game_pk')['inning'].shift(-1)
    pa_list['n_half'] = pa_list.groupby('game_pk')['inning_topbot'].shift(-1)
    pa_list['n_outs'] = pa_list.groupby('game_pk')['outs_when_up'].shift(-1)
    for b in ('on_1b', 'on_2b', 'on_3b'):
        pa_list['n_' + b] = pa_list.groupby('game_pk')[b].shift(-1)
    nmap = pa_list.set_index(['game_pk', 'at_bat_number'])

    d = prep.prep(df)
    ip = d[d['key'].isin(prep.IN_PLAY)]
    kept = dropped = 0
    for r in ip.itertuples(index=False):
        k = (r.game_pk, r.at_bat_number)
        if k not in nmap.index:
            continue
        n = nmap.loc[k]
        outs = int(r.outs_when_up)
        before = {1: r.on_1b, 2: r.on_2b, 3: r.on_3b}
        before = {b: int(v) for b, v in before.items() if pd.notna(v)}
        bases = sum(1 << (b - 1) for b in before)
        runs = int(r.post_bat_score - r.bat_score) if pd.notna(r.post_bat_score) else 0
        if pd.isna(n['n_inning']):
            continue                                   # game over: a walk-off, not observed
        same_half = n['n_inning'] == r.inning and n['n_half'] == r.inning_topbot
        if same_half:
            oa = int(n['n_outs']) - outs
            after = {b: int(n['n_' + c]) for b, c in ((1, 'on_1b'), (2, 'on_2b'), (3, 'on_3b')) if pd.notna(n['n_' + c])}
        else:
            oa = 3 - outs
            after = {}
        if oa < 0 or oa > 3:
            dropped += 1
            continue
        where = {pid: b for b, pid in after.items()}
        movers = [(b, pid) for b, pid in sorted(before.items(), reverse=True)] + [(0, int(r.batter))]
        moves, gone = [], []
        for frm, pid in movers:
            if pid in where:
                if where[pid] != frm:
                    moves.append((frm, where[pid]))
            else:
                gone.append(frm)
        if not same_half:
            # The half ended, so nobody is on base after and runners left on
            # are stranded: neither scored nor out. The row only needs the outs
            # (the outing ends in a hold): the batter is out, then the runners
            # nearest him for a second or third out.
            outs_list = [0] + sorted(before)[:max(0, oa - 1)]
            moves = [(f, -1) for f in outs_list]
            lab = label_of(r.key, r.events if isinstance(r.events, str) else '')
            counts[(r.key, outs, bases)][(bases, 0, oa, lab, tuple(sorted(moves, key=lambda m: -m[0])))] += 1
            kept += 1
            continue
        if len(gone) != runs + oa:
            dropped += 1
            continue
        if r.key == 'home_run' and 0 not in gone:
            dropped += 1
            continue
        # lead runners scored first (gone is lead runner first, batter last);
        # on a home run everyone scored
        nsc = runs
        for frm in gone:
            if nsc > 0:
                moves.append((frm, 4))
                nsc -= 1
            else:
                moves.append((frm, -1))
        nb = sum(1 << (b - 1) for b in after) if same_half else 0
        if outs + oa >= 3:
            runs_kept = 0
            moves = [m for m in moves if m[1] != 4]
        else:
            runs_kept = runs
        moves = tuple(sorted(moves, key=lambda m: -m[0]))
        lab = label_of(r.key, r.events if isinstance(r.events, str) else '')
        counts[(r.key, outs, bases)][(nb, runs_kept, oa, lab, moves)] += 1
        kept += 1
    return kept, dropped


def default_rows(cat, outs, bases):
    """A plain rule for a state the data never showed: hits move everyone the
    hit's bases, outs move nobody. Marked by the label alone (no data row)."""
    on = lambda n: bool(bases & (1 << (n - 1)))
    adv = {'single': 1, 'double': 2, 'triple': 3, 'home_run': 4, 'error': 1}.get(cat)
    moves, runs, nb = [], 0, 0
    if adv:
        for frm in (3, 2, 1, 0):
            if frm and not on(frm):
                continue
            to = min(4, frm + adv)
            moves.append((frm, to))
            if to == 4:
                runs += 1
            else:
                nb |= 1 << (to - 1)
        return [[1.0, nb, runs, 0, cat, [list(m) for m in moves]]]
    oa = 1
    if outs + oa >= 3:
        return [[1.0, bases, 0, oa, 'out', [[0, -1]]]]
    return [[1.0, bases, 0, oa, 'out', [[0, -1]]]]


def build(years, loader):
    counts = defaultdict(Counter)
    for y in years:
        df = loader(y)
        k, dr = season_counts(df, counts)
        print(f'  advance {y}: {k} plays kept, {dr} dropped', flush=True)
    table = {c: {} for c in prep.IN_PLAY}
    filled = 0
    for cat in prep.IN_PLAY:
        for outs in range(3):
            for bases in range(8):
                c = counts.get((cat, outs, bases))
                tot = sum(c.values()) if c else 0
                if tot < 20:
                    table[cat][str(outs * 8 + bases)] = default_rows(cat, outs, bases)
                    filled += 1
                    continue
                rows = [(n / tot, key) for key, n in c.items() if n / tot >= MIN_P]
                z = sum(p for p, _ in rows)
                out = []
                for p, (nb, runs, oa, lab, moves) in sorted(rows, key=lambda t: -t[0]):
                    out.append([round(p / z, 5), nb, runs, oa, lab, [list(m) for m in moves]])
                # exact sum to 1 on the first row
                s = sum(r[0] for r in out)
                out[0][0] = round(out[0][0] + 1 - s, 5)
                table[cat][str(outs * 8 + bases)] = out
    apply_third_outs(table)
    return table, filled


THIRD_OUTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'third_outs.json')


def end_bases(bases, moves):
    """Where the runners stand when the half ends on the play: the bases
    before with the moves applied (engine.js endBases), the rest left on."""
    b = bases
    for f, _ in moves:
        if 1 <= f <= 3:
            b &= ~(1 << (f - 1))
    for _, t in moves:
        if 1 <= t <= 3:
            b |= 1 << (t - 1)
    return b


def apply_third_outs(table, plays=None, log=None):
    """Splits each row that ends the half into the real plays of its kind
    (third_outs.json: cat|outs|bases|label to [[n, runs, moves], ...]), in
    place: the row's own share is divided by the plays' counts, a play under
    MIN_P is dropped and the rest renormalised to that share (the most common
    play kept whole when none clears it), and the split sums to the row's
    share exactly, so every other row keeps its place for the runner draw.
    A batter put out on a ball that is not a hit (an out at two out) is the
    play as it was: the rows the ids already saw right. Returns a report."""
    if plays is None:
        with open(THIRD_OUTS) as fh:
            plays = json.load(fh)['plays']
    report = {'split': 0, 'kept': 0, 'missing': []}
    for cat, states in table.items():
        for key, rows in states.items():
            outs, bases = divmod(int(key), 8)
            out = []
            for row in rows:
                p, nb, runs, oa, lab, moves = row
                if outs + oa < 3:
                    out.append(row)
                    continue
                if lab == 'out' and [list(m) for m in moves] == [[0, -1]]:
                    out.append([p, end_bases(bases, moves), 0, oa, lab, moves])
                    report['kept'] += 1
                    continue
                real = plays.get(f'{cat}|{outs}|{bases}|{lab}')
                if not real and cat == 'error':
                    # a model, labelled: an error puts the batter on first as a
                    # single does, so a state with no real error of this kind
                    # takes the real singles' plays (error|2|4: 27 of 28 singles
                    # score the runner from third, then the batter is out)
                    real = plays.get(f'single|{outs}|{bases}|single')
                    if real:
                        report.setdefault('borrowed', []).append(f'{cat}|{outs}|{bases}|{lab}')
                if not real:
                    report['missing'].append(f'{cat}|{outs}|{bases}|{lab}')
                    out.append(row)
                    continue
                tot = sum(n for n, _, _ in real)
                sub = [(n, r, m) for n, r, m in real if p * n / tot >= MIN_P] or [real[0]]
                z = sum(n for n, _, _ in sub)
                parts = [[round(p * n / z, 5), end_bases(bases, m), r, oa, lab, [list(x) for x in m]] for n, r, m in sub]
                parts[-1][0] = round(p - sum(x[0] for x in parts[:-1]), 5)
                out.extend(parts)
                report['split'] += 1
            states[key] = out
    if log:
        log(f'  third outs: {report["split"]} rows split into real plays, {report["kept"]} batter outs kept, '
            f'{len(report.get("borrowed", []))} errors from the singles {report.get("borrowed", [])}, '
            f'{len(report["missing"])} with no real play: {report["missing"]}')
    return report


def patch_pack(src, dst):
    """A committed pack's advancement table with the real third outs, for
    pool.js to solve again (the pitch library is not needed)."""
    with open(src) as fh:
        pack = json.load(fh)
    rep = apply_third_outs(pack['advance'], log=print)
    with open(dst, 'w') as fh:
        json.dump(pack, fh, separators=(',', ':'))
    return rep


if __name__ == '__main__':
    if sys.argv[1:2] == ['--patch']:
        # python3 advance.py --patch <pack.json> <staged.json>: then node ../pool.js <staged> ...
        patch_pack(sys.argv[2], sys.argv[3])
        sys.exit(0)
    years = [int(a) for a in sys.argv[1:]] or [2023]
    t, f = build(years, lambda y: prep.load([y], cols=COLS))
    print('states filled by rule:', f)
    for k in ('0', '1', '9', '12'):
        print('out_ground', k, t['out_ground'][k][:4])
    print('single 2', t['single']['2'][:4])
