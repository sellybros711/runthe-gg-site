"""Calibration: the model's hold% against how real spots ended (PLAN.md risks).

For each scenario's start state (half, inning 9 or later or its own inning,
outs, bases, lead), every plate appearance in the 2015-2025 regular seasons
that started in that state, and whether the fielding team still led at the end
of that half inning. Compared with the pack's hold% under best play and the
closer pool's hold rate. Writes data/verify/_calibration.json.

The real rate is real pitchers against real lineups with real bullpens; best
play is an upper bound by construction; the pool should sit near the real rate
if the model is right.
"""

import glob
import json
import os
import sys

import pandas as pd

import prep
from common import DATA, VERIFY, log, write_json

YEARS = list(range(2015, 2026))
COLS = ['game_pk', 'at_bat_number', 'pitch_number', 'inning', 'inning_topbot', 'outs_when_up', 'on_1b', 'on_2b',
        'on_3b', 'bat_score', 'fld_score', 'post_bat_score', 'post_fld_score', 'game_type']


def main(argv):
    packs = sorted(glob.glob(os.path.join(DATA, 'packs', '*.json')))
    states = {}
    for p in packs:
        d = json.load(open(p))
        s = d['scenario']['situation']
        states[d['scenario']['id']] = {
            'half': 'Bot' if s['half'] == 'bottom' else 'Top', 'inning': s['inning'], 'outs': s['outs'],
            'bases': s['bases'], 'lead': s['score']['us'] - s['score']['them'],
            'startHold': d['build'].get('startHold'), 'poolHold': d['build'].get('pool', {}).get('holdRate')}
    counts = {k: [0, 0] for k in states}
    for y in YEARS:
        df = prep.load([y], cols=COLS, where="game_type = 'R' AND inning >= 8")
        df = df.sort_values(['game_pk', 'at_bat_number', 'pitch_number'])
        pa = df.groupby(['game_pk', 'at_bat_number'], sort=False).head(1).copy()
        pa['bases'] = pa['on_1b'].notna().astype(int) + 2 * pa['on_2b'].notna().astype(int) + 4 * pa['on_3b'].notna().astype(int)
        pa['lead'] = pa['fld_score'] - pa['bat_score']
        last = df.groupby(['game_pk', 'inning', 'inning_topbot'], sort=False).tail(1)
        end = {(r.game_pk, r.inning, r.inning_topbot): r.post_fld_score - r.post_bat_score for r in last.itertuples()}
        for k, s in states.items():
            inn_ok = (pa['inning'] >= 9) if s['inning'] >= 9 else (pa['inning'] == s['inning'])
            m = pa[inn_ok & (pa['inning_topbot'] == s['half']) & (pa['outs_when_up'] == s['outs'])
                   & (pa['bases'] == s['bases']) & (pa['lead'] == s['lead'])]
            for r in m.itertuples():
                e = end.get((r.game_pk, r.inning, r.inning_topbot))
                if e is None:
                    continue
                counts[k][0] += 1
                counts[k][1] += int(e > 0)
        log(f'  {y} counted')
    out = {}
    for k, s in states.items():
        n, h = counts[k]
        out[k] = dict(s, realSpots=n, realHold=round(h / n, 3) if n else None)
        log(f'{k}: best play {s["startHold"]}%, pool {s["poolHold"]}, real {out[k]["realHold"]} over {n} spots')
    write_json(os.path.join(VERIFY, '_calibration.json'), out)


if __name__ == '__main__':
    main(sys.argv)
