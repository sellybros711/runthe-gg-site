"""Rules 4 (2026-10-24): the numbers behind contract.js UMPIRE and ABS, and the
error check. Reads the 2024 regular season pitch chunks the sequencing pipeline
caches (cache/chunks/savant-seq2024-*.csv.gz, Baseball Savant) and prints:

  1. UMPIRE: the called strike rate of every taken ball or strike by its signed
     distance from the zone's edge (contract.js zoneDist: the plate's width
     plus a ball, 0.83 ft a side; the batter's own sz_bot..sz_top), in half
     inches. contract.js UMPIRE.P is this column, made monotone.
  2. ABS: the challenge models' fit. MLB's 2025 spring training test (288
     games, 1,182 challenges, 52.2% overturned): batters 2.1 a game, 4.4% of
     called strikes, won 50%; the defense 2.0 a game, 1.8% of called balls,
     won 54%. Triple-A 2025: batters won 45%. The shape (a miss challenged more
     the further out, a gamble on a close strike, more on strike three or ball
     four) is a MODEL; its four numbers are fitted to those rates on the 2024
     called pitches.
  3. Errors: reached on error per ball in play, overall and on routine chances
     (a ground ball under 80 mph, a fly or popup under 90 mph at 30 degrees or
     more), for the engine check in the README. Rules 5 (2026-10-25): the same
     by contract.js ROUTINE (routine grounders, routine flies and popups, the
     rest), the rates its KEEP is set against.

    python3 shut-the-door/pipeline/umpire.py [chunk dir]
"""
import glob
import json
import itertools
import os
import subprocess
import sys

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
CHUNKS = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'cache', 'chunks')
COLS = ['game_pk', 'game_type', 'description', 'events', 'type', 'bb_type', 'launch_speed', 'launch_angle',
        'balls', 'strikes', 'plate_x', 'plate_z', 'sz_top', 'sz_bot', 'hc_x', 'hc_y']


def signed_in(c):
    h = c.sz_top - c.sz_bot
    zn = (c.plate_z - c.sz_bot) / h
    dx = (0.83 - c.plate_x.abs()) * 12
    dz = np.minimum(zn, 1 - zn) * h * 12
    inside = (dx >= 0) & (dz >= 0)
    return np.where(inside, np.minimum(dx, dz), -np.hypot(np.minimum(0, dx), np.minimum(0, dz)))


def fit(d, late, target_rate, target_won, grids):
    """d: inches the call was wrong by (> 0 the ABS overturns it)."""
    best = None
    for a, b, gam, L in itertools.product(*grids):
        p = np.where(d > 0, np.minimum(0.9, a + b * d), gam * np.exp(d / L))
        p = np.minimum(0.95, p * np.where(late, 1.5, 1))
        rate, won = p.mean(), (p * (d > 0)).sum() / p.sum()
        err = ((rate - target_rate) / target_rate) ** 2 + 4 * ((won - target_won) / target_won) ** 2
        if best is None or err < best[0]:
            best = (err, a, b, gam, L, rate, won)
    return best


def main():
    files = sorted(glob.glob(os.path.join(CHUNKS, 'savant-seq2024-*.csv.gz')))
    if not files:
        sys.exit('no 2024 chunks in ' + CHUNKS)
    df = pd.concat([pd.read_csv(f, usecols=COLS) for f in files])
    df = df[df.game_type == 'R']
    print(f'{len(df)} pitches, {df.game_pk.nunique()} games')

    called = df[df.description.isin(['called_strike', 'ball', 'blocked_ball'])].dropna(
        subset=['plate_x', 'plate_z', 'sz_top', 'sz_bot']).copy()
    called['d'] = signed_in(called)
    called['cs'] = (called.description == 'called_strike').astype(int)
    edges = list(np.arange(-6, 8.5, 0.5))
    t = called.groupby(pd.cut(called.d, [-99] + edges + [99], right=False), observed=True).cs.agg(['mean', 'count'])
    print('UMPIRE: called strike rate by inches inside the zone edge')
    print(t.to_string())
    zn = (called.plate_z - called.sz_bot) / (called.sz_top - called.sz_bot)
    heart = called[(called.plate_x.abs() < 0.83 / 3) & (zn > 1 / 3) & (zn < 2 / 3)]
    print(f'heart (the middle cell): called ball {1 - heart.cs.mean():.5f} of {len(heart)}')

    cs = called[called.cs == 1]
    cb = called[called.cs == 0]
    g = np.arange
    bat = fit(-cs.d.values, cs.strikes.values == 2, 0.044, 0.45,
              [g(0, 0.21, 0.02), g(0.02, 0.31, 0.02), g(0.02, 0.21, 0.01), [0.5, 1.0, 1.5, 2.0]])
    print('ABS.BATTER: MISS_A %.2f MISS_B %.2f GAMBLE %.2f GAMBLE_IN %.1f: %.2f%% of called strikes, won %.1f%%'
          % (bat[1], bat[2], bat[3], bat[4], 100 * bat[5], 100 * bat[6]))
    dfn = fit(cb.d.values, cb.balls.values == 3, 0.019, 0.544,
              [g(0, 0.31, 0.02), g(0.02, 0.41, 0.02), g(0.005, 0.2, 0.005), [0.5, 1.0, 1.5, 2.0]])
    print('ABS.DEFENSE: MISS_A %.2f MISS_B %.2f GAMBLE %.3f GAMBLE_IN %.1f: %.2f%% of called balls, won %.1f%%'
          % (dfn[1], dfn[2], dfn[3], dfn[4], 100 * dfn[5], 100 * dfn[6]))

    bip = df[df.type == 'X']
    e = bip.events == 'field_error'
    soft = (bip.bb_type == 'ground_ball') & (bip.launch_speed < 80)
    lazy = bip.bb_type.isin(['fly_ball', 'popup']) & (bip.launch_speed < 90) & (bip.launch_angle >= 30)
    for name, m in [('all balls in play', bip.index == bip.index), ('ground balls', bip.bb_type == 'ground_ball'),
                    ('soft grounders', soft), ('lazy flies and popups', lazy)]:
        n, k = int(m.sum()), int((e & m).sum())
        print(f'errors, {name}: {k} of {n}, 1 per {n / max(1, k):.0f}')
    # rules 5: contract.js ROUTINE, read from the contract so the two never differ
    js = 'process.stdout.write(JSON.stringify(require(process.argv[1]).ROUTINE))'
    rt = json.loads(subprocess.run(['node', '-e', js, os.path.join(HERE, '..', 'contract.js')],
                                   capture_output=True, text=True, check=True).stdout)
    spray = np.degrees(np.arctan2(bip.hc_x - 125.42, 198.27 - bip.hc_y))
    at = np.min([np.abs(spray - f) for f in rt['FIELDERS']], axis=0) <= rt['FIELDER_DEG']
    ev, la = bip.launch_speed, bip.launch_angle
    rg = (bip.bb_type == 'ground_ball') & at & (ev >= rt['GROUND_EV'][0]) & (ev < rt['GROUND_EV'][1])
    ra = (bip.bb_type == 'popup') | ((bip.bb_type == 'fly_ball') & (la >= rt['FLY_LA'])
                                     & (ev >= rt['FLY_EV'][0]) & (ev < rt['FLY_EV'][1]))
    for name, m, keep in [('routine grounders', rg, rt['KEEP']['ground']), ('routine flies and popups', ra, rt['KEEP']['air']),
                          ('not routine', ~(rg | ra), 1)]:
        n, k = int(m.sum()), int((e & m).sum())
        print(f'errors, {name}: {k} of {n}, 1 per {n / max(1, k):.0f}; at KEEP {keep}: 1 per {n / max(1e-9, k * keep):.0f}')


if __name__ == '__main__':
    main()
