"""Rules 6 (2026-10-26): the runners read the ball. The numbers behind
pack.runners, which engine.js reads to choose the advancement row.

The owner: "every ball hit is hit into the gap ... We need to ensure runners
are advancing in realistic situations, and tagging up in realistic
situations." The advancement table (advance.py) gives, for a ball in play of
one outcome key at one base and out state, the real share of each runner
outcome. Before rules 6 the row was drawn from that share whatever the ball
was: a 180 ft fly scored the runner from third as often as a 380 ft one.

What this measures, from every ball in play of the 2024 regular season
(Baseball Savant, the play text read runner by runner):

  CARRY   how far an air ball goes, from its exit velocity and launch angle:
          a least squares fit of hit_distance_sc (contract.js carryOf holds
          the same formula; pack.runners.dist the coefficients).
  CLASS   each ball's kind for the runners (contract.js runnerClass): an air
          ball's carry band and field side, a ground ball's speed and side.
  FATE    each play's category for the runners: a runner put out on the
          bases (X), else how many bases the lead runner went (0 to 3).
  RATIO   for each key, lead runner's base, outs (0-1, 2) and class, the
          share of each category in that class over its share in the key,
          shrunk toward 1 by K pitches. The engine multiplies each row's
          chance by its category's ratio and renormalises: the same draw,
          a row that fits the ball.

Output: data/runners.json {source, n, dist, ratio, check, report}. pool.js
copies it into each pack it builds (pack.runners).

    python3 shut-the-door/pipeline/runners.py [--season 2024] [--from DIR_OF_CSVS]
"""
import glob
import io
import json
import os
import re
import sys
from datetime import date, timedelta

import numpy as np
import pandas as pd

from common import DATA, get, log, write_json
import prep

K = 10.0                     # shrinkage toward the key's own mix, in plays
DIST_EDGES = [150, 200, 250, 280, 300, 340]        # air outs: infield, then the outfield's depth
HIT_EDGES = [150, 220, 300]                        # air hits: infield, in front, at the fielders, deep
SOFT_EV = 85.0                                     # a ground ball under this is slow
SIDE_DEG = 15.0                                    # centre field is within this of straight away
AIR_KEYS = ('out_line', 'out_fly', 'out_popup')
HIT_KEYS = ('single', 'double', 'triple')
CATS = ('X', '0', '1', '2', '3')


def search(a, b, season):
    q = (f'https://baseballsavant.mlb.com/statcast_search/csv?all=true&hfPR=hit_into_play%7C&hfGT=R%7C'
         f'&hfSea={season}%7C&player_type=batter&game_date_gt={a}&game_date_lt={b}&type=details')
    return q


def load(season, src=None):
    if src:
        fs = sorted(glob.glob(os.path.join(src, '*.csv')))
        d = pd.concat([pd.read_csv(f, low_memory=False) for f in fs])
    else:
        frames, a, end = [], date(season, 3, 15), date(season, 10, 5)
        while a <= end:
            b = min(a + timedelta(days=4), end)
            text = get(search(a, b, season), cache_key=f'runners-{season}-{a}-{b}.csv').lstrip('﻿')
            if text.strip():
                frames.append(pd.read_csv(io.StringIO(text), low_memory=False))
            a = b + timedelta(days=1)
        d = pd.concat(frames)
    d = d.drop_duplicates(['game_pk', 'at_bat_number', 'pitch_number'])
    return d[d['description'].isin(prep.IN_PLAY_DESC)].copy()


def key_of(d):
    hit = d['events'].map(prep.HIT_EVENTS)
    out = d['bb_type'].map(prep.BB_KEY).fillna('out_ground')
    return hit.where(hit.notna(), out)


# ---- the play text, runner by runner ---------------------------------------
BASEW = {'1st': 1, '2nd': 2, '3rd': 3}


def names(d):
    out = {}
    for pid, pn in d[['batter', 'player_name']].drop_duplicates().itertuples(index=False):
        if isinstance(pn, str) and ', ' in pn:
            last, first = pn.split(', ', 1)
            out[int(pid)] = first + ' ' + last
    return out


def fate(des, n, base):
    """Where the runner on base ended the play: 1..3, 4 scored, -1 put out."""
    e = re.escape(n)
    if re.search(e + r' (?:out at|doubled off)', des):
        return -1
    if re.search(e + r' scores', des):
        return 4
    m = re.findall(e + r' (?:advances )?to (1st|2nd|3rd)', des)
    return BASEW[m[-1]] if m else base


# ---- the ball's class: contract.js carryOf and runnerClass are the same ----
def carry_X(ev, la):
    ev = np.asarray(ev, float) / 100
    la = np.radians(np.asarray(la, float))
    s, c, s2 = np.sin(la), np.cos(la), np.sin(2 * la)
    return np.column_stack([np.ones_like(ev), ev, ev ** 2, ev ** 3, s, s2, ev * s2, ev ** 2 * s2, ev * c,
                            ev ** 2 * c ** 2, s ** 2])


def carry_of(ev, la, coef):
    return np.clip(carry_X(ev, la) @ np.asarray(coef), 0, 480)


def band(x, edges):
    return 'abcdefg'[int(np.searchsorted(edges, x, side='right'))]


def side(spray):
    return 'L' if spray < -SIDE_DEG else 'R' if spray > SIDE_DEG else 'C'


def runner_class(key, bb, ev, la, spray, coef):
    nan = lambda v: v is None or (isinstance(v, float) and np.isnan(v))
    if nan(spray) or key in ('home_run', 'error'):
        return None
    if bb == 'ground' or (key == 'out_ground'):
        return None if nan(ev) else ('s' if ev < SOFT_EV else 'h') + side(spray)
    if nan(ev) or nan(la):
        return None
    d = float(carry_of([ev], [la], coef)[0])
    return band(d, DIST_EDGES if key in AIR_KEYS else HIT_EDGES) + side(spray)


def category(bases0, dest):
    """bases0: the occupied bases; dest: {base: where he ended}."""
    if any(dest[b] == -1 for b in bases0):
        return 'X'
    lead = max(bases0)
    return str(dest[lead] - lead)


def main():
    season = 2024
    src = None
    a = sys.argv[1:]
    if '--season' in a:
        season = int(a[a.index('--season') + 1])
    if '--from' in a:
        src = a[a.index('--from') + 1]
    d = load(season, src)
    d['key'] = key_of(d)
    d['bbs'] = d['bb_type'].map(prep.BB_SHORT)
    d['spray'] = np.degrees(np.arctan2(d['hc_x'] - 125.42, 198.27 - d['hc_y']))
    log(f'{season}: {len(d)} balls in play')

    # CARRY: air balls with a measured distance, not over the wall
    a_ = d[d['bb_type'].isin(['fly_ball', 'line_drive', 'popup']) & d['launch_speed'].notna()
           & d['launch_angle'].notna() & d['hit_distance_sc'].notna() & (d['events'] != 'home_run')
           & (d['launch_angle'] >= 5)]
    X = carry_X(a_['launch_speed'], a_['launch_angle'])
    coef, *_ = np.linalg.lstsq(X, a_['hit_distance_sc'].values, rcond=None)
    coef = [round(float(c), 3) for c in coef]
    res = a_['hit_distance_sc'].values - carry_of(a_['launch_speed'], a_['launch_angle'], coef)
    r2 = 1 - res.var() / a_['hit_distance_sc'].values.var()
    log(f'carry: n {len(a_)}, R2 {r2:.3f}, mean abs error {np.abs(res).mean():.1f} ft')

    # FATE and CLASS
    nm = names(d)
    rows = []
    for r in d.itertuples(index=False):
        occ = [b for b in (1, 2, 3) if pd.notna(getattr(r, f'on_{b}b'))]
        if not occ or r.key in ('home_run',) or not isinstance(r.des, str):
            continue
        dest = {}
        for b in occ:
            n = nm.get(int(getattr(r, f'on_{b}b')))
            if not n:
                break
            dest[b] = fate(r.des, n, b)
        if len(dest) != len(occ):
            continue
        cl = runner_class(r.key, r.bbs, r.launch_speed, r.launch_angle, r.spray, coef)
        rows.append((r.key, max(occ), 0 if r.outs_when_up < 2 else 1, cl, category(occ, dest)))
    f = pd.DataFrame(rows, columns=['key', 'lead', 'og', 'cls', 'cat'])
    log(f'runners on: {len(f)} plays')

    # RATIO
    ratio = {}
    for (key, lead, og), g in f.groupby(['key', 'lead', 'og']):
        m = g['cat'].value_counts(normalize=True).reindex(CATS, fill_value=0).values
        for cl, h in g[g['cls'].notna()].groupby('cls'):
            n = len(h)
            c = h['cat'].value_counts().reindex(CATS, fill_value=0).values
            p = (c + K * m) / (n + K)
            rt = np.where(m > 0, p / np.where(m > 0, m, 1), 1.0)
            if np.allclose(rt, 1, atol=0.02):
                continue
            ratio[f'{key}|{lead}|{og}|{cl}'] = [round(float(x), 3) for x in rt]
    log(f'ratio: {len(ratio)} classes that move a row')

    # a parity sample: contract.js runnerClass must give the same classes
    smp = d[d['key'].isin(AIR_KEYS + HIT_KEYS + ('out_ground',))].sample(400, random_state=7)
    check = [[r.key, r.bbs if isinstance(r.bbs, str) else None,
              None if pd.isna(r.launch_speed) else float(r.launch_speed),
              None if pd.isna(r.launch_angle) else float(r.launch_angle),
              None if pd.isna(r.spray) else round(float(r.spray), 1),
              runner_class(r.key, r.bbs, r.launch_speed, r.launch_angle,
                           None if pd.isna(r.spray) else round(float(r.spray), 1), coef)]
             for r in smp.itertuples(index=False)]

    write_json(os.path.join(DATA, 'runners.json'), {
        'source': f'Baseball Savant, {season} regular season, every ball in play with a runner on (play text)',
        'season': season, 'n': len(f), 'K': K,
        'dist': {'coef': coef, 'r2': round(float(r2), 3), 'mae': round(float(np.abs(res).mean()), 1)},
        'edges': {'air': DIST_EDGES, 'hit': HIT_EDGES, 'soft': SOFT_EV, 'side': SIDE_DEG},
        'ratio': ratio, 'check': check,
    })


if __name__ == '__main__':
    main()
