"""Release and spin: where each scenario pitcher's hand let the ball go, and how it spun.

For the picture only (the 3D release point, the aim ball's spin). The engine and the grade read
none of it, so no outcome, score, band or percentile moves.

  arsenal   python3 tracking.py arsenal [pack ids]     writes data/tracking_arsenal.json
            For each scenario pitcher, from the same Savant search his arsenal came from (the
            pack's build.arsenalSource, effort.py pack_source), per arsenal pitch type, the mean
            over his real pitches of that type:
              release   {x, z, ext}   release_pos_x, release_pos_z, release_extension (feet,
                                      catcher's view: x < 0 is the third base side)
              armAngle                arm_angle (degrees; Savant carries it from 2020)
              spin      {rate, axis, active}
                        rate          release_spin_rate (rpm)
                        axis          spin_axis (degrees, 0..360, a circular mean)
                        active        active spin, percent, from Savant's active spin leaderboard
                                      for that season (regular season only: Savant publishes no
                                      postseason one). Spin-based from 2020, observed before.
            And the pitcher's own release {x, z, ext} and armAngle over all his arsenal pitches
            (what 3d/pitch.js releaseOf reads).

            A value Savant does not have is null, never filled: PITCHf/x seasons (2008 to 2014)
            carry release x and z but no extension, spin or arm angle. A proxy spot (no tracking
            that day: Eckersley 1988, Rivera 2001) is null throughout, so the 3D code's labelled
            fallbacks apply; Rivera's 2008 arsenal is a proxy for his stuff, not his 2001 hand.

  packs     python3 tracking.py packs                  puts data/tracking_arsenal.json into the
            committed packs (scenario.pitcher and each arsenal pitch), then rebuild with pool.js
"""
import io
import json
import math
import os
import sys

import numpy as np
import pandas as pd

import effort
from common import DATA, GAME, get, log

COLS = ['pitch_type', 'game_year', 'game_type', 'p_throws', 'release_pos_x', 'release_pos_z',
        'release_extension', 'arm_angle', 'release_spin_rate', 'spin_axis']
ACTIVE_URL = 'https://baseballsavant.mlb.com/leaderboard/active-spin?year={year}_{method}&min=0&hand=&csv=true'
# The leaderboard's columns for our types. Savant's leaderboards file the knuckle curve under curve.
ACTIVE_COL = {'FF': 'active_spin_fourseam', 'SI': 'active_spin_sinker', 'FC': 'active_spin_cutter',
              'CH': 'active_spin_changeup', 'FS': 'active_spin_splitter', 'CU': 'active_spin_curve',
              'KC': 'active_spin_curve', 'SL': 'active_spin_slider', 'ST': 'active_spin_sweeper',
              'SV': 'active_spin_slurve'}


def num(x, nd):
    return None if x is None or not np.isfinite(x) else round(float(x), nd)


def mean(s, nd):
    s = pd.to_numeric(s, errors='coerce').dropna()
    return num(s.mean(), nd) if len(s) else None


def circ_mean(s):
    """The mean of an angle in degrees (an axis near 0 and 360 is one direction, not 180)."""
    s = pd.to_numeric(s, errors='coerce').dropna()
    if not len(s):
        return None
    r = np.radians(s.values)
    a = math.degrees(math.atan2(np.sin(r).mean(), np.cos(r).mean())) % 360
    return int(round(a)) % 360


def release_of(g):
    rel = {'x': mean(g['release_pos_x'], 2), 'z': mean(g['release_pos_z'], 2), 'ext': mean(g['release_extension'], 2)}
    return rel if any(v is not None for v in rel.values()) else None


def active_table(year, pid):
    """(column -> percent, label) from Savant's active spin leaderboard, or ({}, None)."""
    method = 'spin-based' if year >= 2020 else 'observed'
    if year < 2016:
        return {}, None
    text = get(ACTIVE_URL.format(year=year, method=method), cache_key=f'savant-active-spin-{year}-{method}.csv')
    df = pd.read_csv(io.StringIO(text.lstrip('﻿')))
    row = df[df['entity_id'] == int(pid)]
    if not len(row):
        return {}, None
    r = row.iloc[0]
    return ({c: num(pd.to_numeric(r[c], errors='coerce'), 1) for c in set(ACTIVE_COL.values()) if c in r},
            f'Savant active spin leaderboard, {year} regular season, {method}')


def one(pid, pack, spec):
    sc = pack['scenario']
    p = sc['pitcher']
    nulls = {a['type']: {'n': 0, 'release': None, 'armAngle': None, 'spin': None} for a in p['arsenal']}
    if sc.get('resolution') == 'proxy':
        return {'source': None, 'tracking': None, 'release': None, 'armAngle': None, 'arsenal': nulls,
                'note': 'proxy spot: no pitch tracking that day'}
    url, ck = effort.pack_source(pack, spec)
    text = get(url, cache_key=f'savant-tracking-{pid}.csv')
    df = pd.read_csv(io.StringIO(text.lstrip('﻿')), low_memory=False)
    for c in COLS:
        if c not in df.columns:
            df[c] = np.nan
    types = [a['type'] for a in p['arsenal']]
    df = df[df['pitch_type'].isin(types)]
    years = sorted(set(int(y) for y in df['game_year'].dropna()))
    assert len(years) == 1, (pid, years)
    year = years[0]
    hands = set(df['p_throws'].dropna())
    assert hands == {p['throws']}, (pid, hands, p['throws'])
    pitcher_id = url.split('pitchers_lookup%5B%5D=')[1].split('&')[0]
    active, active_src = active_table(year, pitcher_id)
    has_cu = 'CU' in types
    rows = {}
    for t in types:
        g = df[df['pitch_type'] == t]
        col = ACTIVE_COL.get(t)
        if t == 'KC' and has_cu:
            col = None                       # the curve column would be his curveball's, not this
        spin = {'rate': None if mean(g['release_spin_rate'], 0) is None else int(mean(g['release_spin_rate'], 0)),
                'axis': circ_mean(g['spin_axis']),
                'active': active.get(col) if col else None}
        rows[t] = {'n': int(len(g)), 'release': release_of(g), 'armAngle': mean(g['arm_angle'], 1),
                   'spin': spin if any(v is not None for v in spin.values()) else None}
        log(pid, t, json.dumps(rows[t]))
    gt = set(df['game_type'].dropna())
    return {'source': url,
            'tracking': {'system': 'statcast' if year >= 2015 else 'pitchfx', 'season': year,
                         'games': 'regular' if gt == {'R'} else 'postseason', 'n': int(len(df)),
                         'active': active_src},
            'release': release_of(df), 'armAngle': mean(df['arm_angle'], 1), 'arsenal': rows}


def arsenal(ids):
    specs = {s['id']: s for s in json.load(open(os.path.join(GAME, 'scenarios', 'scenarios.json')))['scenarios']}
    path = os.path.join(DATA, 'tracking_arsenal.json')
    out = json.load(open(path)) if ids and os.path.exists(path) else {'packs': {}}
    out['_about'] = ('Per scenario pitcher: the mean release point (feet, catcher\'s view), arm angle and spin '
                     '(rate rpm, axis degrees as a circular mean, active spin percent from the season\'s Savant '
                     'leaderboard) of his own pitches, per arsenal type and over all of them, from the Savant '
                     'search his arsenal came from. Null where Savant has no value; null throughout for a '
                     'proxy spot. For the picture only: the engine reads none of it. Built by pipeline/tracking.py arsenal.')
    for pid in ids or specs:
        pack = json.load(open(os.path.join(DATA, 'packs', pid + '.json')))
        out['packs'][pid] = one(pid, pack, specs[pid])
    out['packs'] = dict(sorted(out['packs'].items()))
    json.dump(out, open(path, 'w'), indent=1)
    log('wrote', path)


def packs():
    tr = json.load(open(os.path.join(DATA, 'tracking_arsenal.json')))['packs']
    for pid, row in tr.items():
        path = os.path.join(DATA, 'packs', pid + '.json')
        pack = json.load(open(path))
        p = pack['scenario']['pitcher']
        p['release'] = row['release']
        p['armAngle'] = row['armAngle']
        p['tracking'] = row['tracking']
        for a in p['arsenal']:
            r = row['arsenal'][a['type']]
            a['release'] = r['release']
            a['armAngle'] = r['armAngle']
            a['spin'] = r['spin']
        json.dump(pack, open(path, 'w'), separators=(',', ':'), ensure_ascii=False)
        log('release and spin into', pid)


if __name__ == '__main__':
    if sys.argv[1] == 'arsenal':
        arsenal(sys.argv[2:])
    elif sys.argv[1] == 'packs':
        packs()
