"""Turning library rows into what the model reads: the outcome key, the grid
cell, the count bucket, the spray angle and the damage of a batted ball.

The grid is contract.js's, ported: catcher's view, 5x5, the zone |x| <= 0.83 ft
and 0 <= zn <= 1 with zn = (plate_z - sz_bot) / (sz_top - sz_bot). A check
(check_grid) holds this port to contract.js through node.
"""

import json
import os
import sqlite3
import subprocess

import numpy as np
import pandas as pd

from common import GAME, LIBRARY

KEYS = ['ball', 'called_strike', 'swinging_strike', 'foul', 'hit_by_pitch',
        'single', 'double', 'triple', 'home_run', 'error', 'out_ground', 'out_line', 'out_fly', 'out_popup']
KI = {k: i for i, k in enumerate(KEYS)}
IN_PLAY = KEYS[5:]

PITCH_TYPES = ['FF', 'SI', 'FC', 'SL', 'ST', 'SV', 'CU', 'KC', 'CH', 'FS', 'FO', 'KN']
FAMILY = {'FF': 'hard', 'SI': 'hard', 'FC': 'hard', 'SL': 'breaking', 'ST': 'breaking', 'SV': 'breaking',
          'CU': 'breaking', 'KC': 'breaking', 'CH': 'offspeed', 'FS': 'offspeed', 'FO': 'offspeed', 'KN': 'offspeed'}
NAME = {'FF': 'four-seam', 'SI': 'sinker', 'FC': 'cutter', 'SL': 'slider', 'ST': 'sweeper', 'SV': 'slurve',
        'CU': 'curveball', 'KC': 'knuckle curve', 'CH': 'changeup', 'FS': 'splitter', 'FO': 'forkball',
        'KN': 'knuckleball'}

ZONE_HALF_FT = 0.83
COL_FT = ZONE_HALF_FT * 2 / 3
ROW_ZN = 1 / 3

BALL = {'ball', 'blocked_ball', 'pitchout'}
CALLED = {'called_strike'}
SWINGING = {'swinging_strike', 'swinging_strike_blocked', 'foul_tip'}
FOUL = {'foul', 'foul_pitchout'}
HBP = {'hit_by_pitch'}
IN_PLAY_DESC = {'hit_into_play', 'hit_into_play_no_out', 'hit_into_play_score'}
BUNT_DESC = {'foul_bunt', 'missed_bunt', 'bunt_foul_tip'}
BUNT_EVENTS = {'sac_bunt', 'sac_bunt_double_play'}
HIT_EVENTS = {'single': 'single', 'double': 'double', 'triple': 'triple', 'home_run': 'home_run',
              'field_error': 'error'}
BB_KEY = {'ground_ball': 'out_ground', 'line_drive': 'out_line', 'fly_ball': 'out_fly', 'popup': 'out_popup'}
BB_SHORT = {'ground_ball': 'ground', 'line_drive': 'line', 'fly_ball': 'fly', 'popup': 'popup'}
RESULT_OF_DESC = {**{d: 'ball' for d in BALL}, 'called_strike': 'called_strike',
                  'swinging_strike': 'swinging_strike', 'swinging_strike_blocked': 'swinging_strike',
                  'foul_tip': 'foul_tip', 'foul': 'foul', 'foul_pitchout': 'foul', 'hit_by_pitch': 'hit_by_pitch',
                  **{d: 'in_play' for d in IN_PLAY_DESC}}

# Linear weights for the damage of a batted ball when Statcast has no expected
# wOBA for it (all of 2008 to 2014, and the odd untracked ball since): the
# usual wOBA weights, close to FanGraphs' for the 2010s.
WOBA_W = {'single': 0.88, 'double': 1.25, 'triple': 1.58, 'home_run': 2.03, 'error': 0.0}


def cell_of(x, zn):
    c = np.clip(np.floor(x / COL_FT + 2.5), 0, 4)
    r = np.clip(np.floor((1 - zn) / ROW_ZN + 1), 0, 4)
    return (r * 5 + c).astype(int)


def in_zone(cell):
    r, c = cell // 5, cell % 5
    return (r >= 1) & (r <= 3) & (c >= 1) & (c <= 3)


def bucket_of(b, s):
    """contract.js countBucket, as an index into even, ahead, behind, two_strikes."""
    b = np.asarray(b)
    s = np.asarray(s)
    return np.where(s == 2, 3, np.where(b > s, 2, np.where(s > b, 1, 0)))


def load(years, where='', cols=None, con=None):
    own = con is None
    con = con or sqlite3.connect(LIBRARY)
    yrs = ','.join(str(int(y)) for y in years)
    sel = ', '.join(f'"{c}"' for c in cols) if cols else '*'
    q = f'SELECT {sel} FROM pitches WHERE game_year IN ({yrs})' + (f' AND ({where})' if where else '')
    df = pd.read_sql_query(q, con)
    if own:
        con.close()
    return df


def prep(df):
    """Adds key, cell, zn, bucket, family, spray, damage, res. Drops what the
    library cannot use (intentional balls, bunts, pitches with no location,
    catcher's interference). Keeps the row order."""
    df = df.copy()
    d = df['description'].fillna('')
    ev = df['events'].fillna('')
    keep = ~d.isin(BUNT_DESC) & ~ev.isin(BUNT_EVENTS) & (ev != 'catcher_interf') & (d != 'intent_ball')
    keep &= df['plate_x'].notna() & df['plate_z'].notna() & df['sz_top'].notna() & df['sz_bot'].notna()
    keep &= (df['sz_top'] - df['sz_bot']) > 0.5
    df = df[keep].copy()
    d = df['description'].fillna('')
    ev = df['events'].fillna('')
    key = pd.Series(None, index=df.index, dtype=object)
    key[d.isin(BALL)] = 'ball'
    key[d.isin(CALLED)] = 'called_strike'
    key[d.isin(SWINGING)] = 'swinging_strike'
    key[d.isin(FOUL)] = 'foul'
    key[d.isin(HBP)] = 'hit_by_pitch'
    ip = d.isin(IN_PLAY_DESC)
    hit = ev.map(HIT_EVENTS)
    key[ip & hit.notna()] = hit[ip & hit.notna()]
    outk = df['bb_type'].map(BB_KEY).fillna('out_ground')
    key[ip & hit.isna()] = outk[ip & hit.isna()]
    df['key'] = key
    df = df[df['key'].notna()].copy()
    df['ki'] = df['key'].map(KI).astype(int)
    df['zn'] = (df['plate_z'] - df['sz_bot']) / (df['sz_top'] - df['sz_bot'])
    df['cell'] = cell_of(df['plate_x'].values, df['zn'].values)
    df['bucket'] = bucket_of(df['balls'].values, df['strikes'].values)
    df['family'] = df['pitch_type'].map(FAMILY)
    df['res'] = df['description'].map(RESULT_OF_DESC)
    df['bb'] = df['bb_type'].map(BB_SHORT)
    # spray: degrees from centre field, negative the left field side (catcher's
    # view x grows toward first base, so right field is positive)
    df['spray'] = np.degrees(np.arctan2(df['hc_x'] - 125.42, 198.27 - df['hc_y']))
    dmg = pd.to_numeric(df['estimated_woba_using_speedangle'], errors='coerce')
    fallback = df['key'].map(WOBA_W).fillna(0.0)
    df['damage'] = np.where(df['key'].isin(IN_PLAY), np.where(dmg.notna(), dmg, fallback), np.nan)
    df['swing'] = df['key'].isin(['swinging_strike', 'foul'] + IN_PLAY)
    return df


def check_grid():
    """The Python grid is contract.js's grid: every cell centre, and a sweep of
    points, land in the same cell both ways."""
    js = ("const K=require(process.argv[1]);const o=[];"
          "for(let i=0;i<=40;i++)for(let j=0;j<=40;j++){const x=-1.8+i*0.09,z=-0.8+j*0.065;o.push(K.cellAt(x,z));}"
          "process.stdout.write(JSON.stringify(o));")
    out = json.loads(subprocess.run(['node', '-e', js, os.path.join(GAME, 'contract.js')],
                                    capture_output=True, text=True, check=True).stdout)
    xs, zs = [], []
    for i in range(41):
        for j in range(41):
            xs.append(-1.8 + i * 0.09)
            zs.append(-0.8 + j * 0.065)
    mine = cell_of(np.array(xs), np.array(zs)).tolist()
    bad = sum(1 for a, b in zip(out, mine) if a != b)
    return bad


if __name__ == '__main__':
    print('grid mismatches against contract.js:', check_grid())
