"""Effort (the owner's call, 2026-10-22): what a real pitcher's harder and
softer pitches look like, and what they do.

A call may carry e, the effort, 0..1 (CONTRACT.md 5c). More effort throws the
pitch from further up HIS OWN velocity distribution for that pitch type, so
every speed a player reads is a real one. This script measures the two halves:

  The five points are slices of his own speed (SLICES): his slowest 5%, the
  second, middle and fourth fifths, and his fastest 5%.

  league    python3 effort.py league season.csv.gz [more ...] > effort.json
            Every 2024 regular season pitch (savant.fetch_range in chunks, the
            same pull as effects.py). Each pitch's place in its own pitcher's
            velocity for that type that season (a percentile, groups of 100 or
            more), cut in five bins (quintiles). Per pitch family and bin:
              - the outcome, key by key, observed over expected, where the
                expected mix is what that family does in that cell, at that
                exact count and platoon (effects.py's stratum). Every pitcher
                puts a fifth of his pitches in each bin, so who is pitching
                cancels; the count and the location are held by the stratum.
              - damage on contact (xwOBA) against the stratum's
              - the location spread against his own (effects.py C)
              - the mean velocity and break against his own mean (mph, inches
                along his own break direction): the league's typical spread,
                used only for a pitcher with no tracked pitches (Eckersley 1988)

  arsenal   python3 effort.py arsenal [pack ids]       writes data/effort_arsenal.json
            For each scenario pitcher, from the same Savant search his arsenal
            came from (the pack's build.arsenalSource, or his first tracked
            season for a proxy): per arsenal pitch, the mean velocity and break
            (pfx, inches, catcher's view) of his pitches in each of the five
            velocity bins. engine.js reads it from the pack (arsenal[i].stuff).

  packs     python3 effort.py packs [pack ids]         puts data/effort_arsenal.json into the
            committed packs (arsenal[i].stuff), for pool.js to rebuild them. With
            ids, only those packs are written (and arsenal keeps the others' rows)

  constants python3 effort.py constants [effort.json]  prints grade.js EFFORT.BINS

What is measured and what is a model is in the README (Effort).
"""
import json
import os
import sys

import numpy as np
import pandas as pd

import prep
import savant
from common import DATA, GAME, log

BINS = 5
# The five points effort walks, as slices of his own speed for a type (percentiles): his slowest
# 5%, the second fifth, the middle fifth, the fourth fifth, his fastest 5%. The ends are the tails
# (the owner, 2026-10-23: max effort should show more speed), every speed still one he threw.
SLICES = [(0.0, 0.05), (0.2, 0.4), (0.4, 0.6), (0.6, 0.8), (0.95, 1.0)]


def slice_of(pct):
    """The slice 0..4 of each percentile, or -1 between slices."""
    pct = np.asarray(pct, dtype=float)
    out = np.full(pct.shape, -1)
    for i, (lo, hi) in enumerate(SLICES):
        out[(pct > lo) & (pct <= hi) if lo > 0 else (pct <= hi)] = i
    return out
MIN_GROUP = 100     # pitches of one type by one pitcher in one season, for a percentile to mean something
MIN_OWN = 40        # below this many of his own pitches of a type, his bins are his mean plus the league's spread
GROUPS = {'ball': [0], 'called': [1], 'whiff': [2], 'foul': [3], 'hbp': [4], 'hit': [5, 6, 7], 'hr': [8],
          'error': [9], 'out': [10, 11, 12, 13], 'inplay': [5, 6, 7, 8, 9, 10, 11, 12, 13]}


def velo_bin(df, by):
    """The percentile of each pitch's velocity inside its group, and its bin 0..4."""
    g = df.groupby(by)['release_speed']
    n = g.transform('size')
    pct = g.rank(method='average', pct=True)
    b = np.minimum(BINS - 1, np.floor((pct - 1e-9) * BINS)).astype('Int64')
    return pct, b, n


def along(df, by):
    """Break along the pitcher's own mean break direction for that type, inches."""
    px, pz = df['pfx_x'] * 12, df['pfx_z'] * 12
    mx = px.groupby([df[c] for c in by]).transform('mean')
    mz = pz.groupby([df[c] for c in by]).transform('mean')
    norm = np.sqrt(mx ** 2 + mz ** 2).replace(0, np.nan)
    return (px * mx + pz * mz) / norm, np.sqrt(mx ** 2 + mz ** 2)


def league(files):
    raw = pd.concat([pd.read_csv(f, low_memory=False) for f in files], ignore_index=True)
    raw = raw.drop_duplicates(['game_pk', 'at_bat_number', 'pitch_number'])
    raw = raw.sort_values(['game_pk', 'at_bat_number', 'pitch_number']).reset_index(drop=True)
    for c in ('release_speed', 'pfx_x', 'pfx_z', 'plate_x', 'plate_z', 'sz_top', 'sz_bot', 'hc_x', 'hc_y',
              'launch_speed', 'launch_angle', 'estimated_woba_using_speedangle'):
        raw[c] = pd.to_numeric(raw[c], errors='coerce')     # a chunk with every value empty reads as text
    first = raw.groupby(['game_pk', 'inning_topbot'])['pitcher'].transform('first')
    raw['reliever'] = raw['pitcher'] != first
    raw['pcount'] = raw.groupby(['game_pk', 'pitcher']).cumcount() + 1
    df = prep.prep(raw)
    df = df[df['pitch_type'].isin(prep.PITCH_TYPES) & df['release_speed'].notna()].copy()
    df['platoon'] = (df['stand'] == df['p_throws']).astype(int)
    by = ['pitcher', 'pitch_type', 'game_year']
    df['pct'], _, df['gn'] = velo_bin(df, by)
    df = df[df['gn'] >= MIN_GROUP].copy()
    df['vbin'] = slice_of(df['pct'].values)
    df['dvelo'] = df['release_speed'] - df.groupby(by)['release_speed'].transform('mean')
    df['brk'], df['brk0'] = along(df, by)
    df['dbrk'] = df['brk'] - df['brk0']
    NK = len(prep.KEYS)
    df['stratum'] = (df['family'].map({'hard': 0, 'breaking': 1, 'offspeed': 2}) * 1000
                     + df['cell'] * 40 + (df['balls'].clip(0, 3) * 3 + df['strikes'].clip(0, 2)) * 2 + df['platoon'])
    onehot = np.zeros((len(df), NK))
    onehot[np.arange(len(df)), df['ki'].values] = 1
    st_codes, st_idx = np.unique(df['stratum'].values, return_inverse=True)
    sums = np.zeros((len(st_codes), NK))
    np.add.at(sums, st_idx, onehot)
    exp = sums[st_idx] / sums.sum(axis=1, keepdims=True)[st_idx]
    dmg = df['damage'].values
    ip = ~np.isnan(dmg)
    st_d = pd.Series(dmg[ip]).groupby(st_idx[ip]).mean()
    exp_d = np.full(len(df), np.nan)
    exp_d[ip] = st_d.reindex(st_idx[ip]).values

    # the location spread, effects.py C: RMS from his own mean per (pitcher, type, bucket, side, season)
    key = ['pitcher', 'pitch_type', 'bucket', 'stand', 'game_year']
    gsz = df.groupby(key)['plate_x'].transform('size')
    mx = df.groupby(key)['plate_x'].transform('mean')
    mz = df.groupby(key)['zn'].transform('mean')
    zft = df['sz_top'] - df['sz_bot']
    r2 = ((df['plate_x'] - mx) ** 2 + ((df['zn'] - mz) * zft) ** 2) * gsz / (gsz - 1).clip(lower=1)
    r2 = r2.where(gsz >= 10)
    rel_r2 = r2 / r2.groupby([df[c] for c in by]).transform('mean')

    def block(mask):
        o = onehot[mask].sum(axis=0)
        e = exp[mask].sum(axis=0)
        g = {}
        for name, ks in GROUPS.items():
            oo, ee = o[ks].sum(), e[ks].sum()
            g[name] = [round(float(oo / ee), 4), round(float(np.sqrt(max(oo, 1)) / ee), 4)] if ee > 0 else None
        m2 = mask & ip
        return {
            'n': int(mask.sum()),
            'groups': g,
            'damage': [round(float(np.nanmean(dmg[m2])), 4), round(float(np.nanmean(exp_d[m2])), 4)] if m2.sum() else None,
            'spread': round(float(np.sqrt(np.nanmean(rel_r2.values[mask]))), 4),
            'dvelo': round(float(df['dvelo'].values[mask].mean()), 3),
            'dbrk': round(float(np.nanmean(df['dbrk'].values[mask])), 3),
        }

    out = {'pitches': int(len(df)), 'seasons': sorted(int(y) for y in df['game_year'].unique()),
           'groups_of': GROUPS, 'bins': BINS, 'slices': SLICES, 'minGroup': MIN_GROUP}
    fams = {}
    for fam in ('hard', 'breaking', 'offspeed'):
        fm = (df['family'] == fam).values
        fams[fam] = {
            'all': [block(fm & (df['vbin'].values == b)) for b in range(BINS)],
            'relievers': [block(fm & df['reliever'].values & (df['vbin'].values == b)) for b in range(BINS)],
            'two_strikes': [block(fm & (df['strikes'].values == 2) & (df['vbin'].values == b)) for b in range(BINS)],
        }
    out['family'] = fams
    # velocity and break by type: the league's typical place of each bin against a pitcher's mean
    types = {}
    for t, g in df.groupby('pitch_type'):
        if len(g) < 2000:
            continue
        types[t] = {'n': int(len(g)),
                    'dvelo': [round(float(g.loc[g['vbin'] == b, 'dvelo'].mean()), 2) for b in range(BINS)],
                    'dbrk': [round(float(g.loc[g['vbin'] == b, 'dbrk'].mean()), 2) for b in range(BINS)]}
    out['type'] = types
    # how the outing goes: velocity by a reliever's pitch count (the cost of effort is fatigue)
    rel = df[df['reliever']]
    out['reliever_velo_by_count'] = {f'{lo}-{hi}': round(float(rel.loc[(rel['pcount'] >= lo) & (rel['pcount'] <= hi), 'dvelo'].mean()), 3)
                                     for lo, hi in [(1, 5), (6, 10), (11, 15), (16, 20), (21, 30), (31, 99)]}
    return out


# ---- one pitcher's own bins -------------------------------------------------------

def pack_source(pack, spec):
    pa = spec.get('proxyArsenal') or {}
    if 'pitches' in pa:
        return None, None                              # public reporting only: no tracked pitch
    if 'pitcherId' in pa:
        return savant.search_url(pitcher=pa['pitcherId'], season=pa['fromSeason'], game_types=savant.GT_REGULAR), \
            f'savant-arsenal-{pa["pitcherId"]}-{pa["fromSeason"]}-R.csv'
    url = pack['build']['arsenalSource']
    return url, None


def own_bins(df, ptype):
    g = df[(df['pitch_type'] == ptype) & df['release_speed'].notna() & df['pfx_x'].notna() & df['pfx_z'].notna()].copy()
    if not len(g):
        return None
    g['pct'] = g['release_speed'].rank(method='average', pct=True)
    g['b'] = slice_of(g['pct'].values)
    by = g.groupby('b')
    return {'n': int(len(g)),
            'velo': [round(float(by['release_speed'].mean().get(b, np.nan)), 1) for b in range(BINS)],
            'pfxX': [round(float(by['pfx_x'].mean().get(b, np.nan)) * 12, 1) for b in range(BINS)],
            'pfxZ': [round(float(by['pfx_z'].mean().get(b, np.nan)) * 12, 1) for b in range(BINS)]}


def from_league(a, lg):
    """No tracked pitches of his own (or too few): his arsenal mean, plus the league's typical
    distance of each bin from a pitcher's mean for that type (velocity, and break along his
    own break direction). Marked src 'league'."""
    t = lg['type'].get(a['type'])
    if not t:
        return None
    norm = (a['pfxX'] ** 2 + a['pfxZ'] ** 2) ** 0.5 or 1
    return {'n': 0, 'src': 'league',
            'velo': [round(a['velo'] + dv, 1) for dv in t['dvelo']],
            'pfxX': [round(a['pfxX'] + db * a['pfxX'] / norm, 1) for db in t['dbrk']],
            'pfxZ': [round(a['pfxZ'] + db * a['pfxZ'] / norm, 1) for db in t['dbrk']]}


def arsenal(ids):
    lg = json.load(open(os.path.join(os.path.dirname(__file__), 'effort.json')))
    specs = {s['id']: s for s in json.load(open(os.path.join(GAME, 'scenarios', 'scenarios.json')))['scenarios']}
    out = {'_about': 'Per scenario pitcher and arsenal pitch: the mean velocity (mph) and break (pfx inches, '
                     "catcher's view) of his own pitches in each slice of his velocity for that type, slowest "
                     'first (his slowest 5%, second fifth, middle fifth, fourth fifth, fastest 5%). src his: his own pitches from the arsenal source; src league: his arsenal mean plus '
                     "the league's typical spread (pipeline/effort.json), when he has fewer than "
                     f'{MIN_OWN} tracked pitches of it. Built by pipeline/effort.py arsenal.', 'packs': {}}
    path = os.path.join(DATA, 'effort_arsenal.json')
    if ids and os.path.exists(path):      # some ids: the others stay as they are
        out['packs'] = json.load(open(path))['packs']
    for pid in ids or specs:
        pack = json.load(open(os.path.join(DATA, 'packs', pid + '.json')))
        url, ck = pack_source(pack, specs[pid])
        df = None
        if url:
            df, _ = savant.fetch(url, ck or f'savant-effort-{pid}.csv')
            df = df[df['pitch_type'].isin(prep.PITCH_TYPES)]
        rows = {}
        for a in pack['scenario']['pitcher']['arsenal']:
            b = own_bins(df, a['type']) if df is not None else None
            if b and b['n'] >= MIN_OWN:
                b['src'] = 'his'
            else:
                n = b['n'] if b else 0
                b = from_league(a, lg)
                if b:
                    b['n'] = n
            rows[a['type']] = b
            log(pid, a['type'], a['velo'], json.dumps(b))
        out['packs'][pid] = {'source': url or 'none: no tracked pitches (public reporting)', 'arsenal': rows}
    json.dump(out, open(path, 'w'), indent=1)


def packs(ids=None):
    ea = json.load(open(os.path.join(DATA, 'effort_arsenal.json')))['packs']
    for pid, row in ea.items():
        if ids and pid not in ids:
            continue
        path = os.path.join(DATA, 'packs', pid + '.json')
        pack = json.load(open(path))
        for a in pack['scenario']['pitcher']['arsenal']:
            s = row['arsenal'].get(a['type'])
            if s:
                a['stuff'] = {k: s[k] for k in ('src', 'n', 'velo', 'pfxX', 'pfxZ')}
            else:
                a.pop('stuff', None)
        json.dump(pack, open(path, 'w'), separators=(',', ':'), ensure_ascii=False)
        log('stuff into', pid)


def constants(path):
    """grade.js EFFORT.BINS from effort.json: per family and key group, each fifth's observed
    over expected (all pitchers), shrunk toward 1 by its own standard error
    (x 1 - se^2 / d^2, never past 1), then divided by the mean of the middle three fifths, and
    the middle fifth set to exactly 1 so e 0.5 is his ordinary pitch."""
    lg = json.load(open(path))
    out = {}
    for fam, v in lg['family'].items():
        rows = {}
        for g in ('ball', 'called', 'whiff', 'foul', 'hit', 'hr', 'out'):
            raw = []
            for b in v['all']:
                r, se = b['groups'][g]
                d = r - 1
                k = max(0.0, 1 - (se * se) / (d * d)) if d else 0.0
                raw.append(1 + d * k)
            mid = (raw[1] + raw[2] + raw[3]) / 3      # the middle three, so one noisy slice cannot tilt the rest
            rows[g] = [round(x / mid, 3) for x in raw]
            rows[g][2] = 1.0                            # e 0.5 is his ordinary pitch, exactly
        # the location spread above the middle (harder than his ordinary pitch), against the middle
        # slice, never under 1. Below the middle it is left at 1: the data's slowest slice is wider,
        # but that is a slipped pitch more than an eased one (a game choice, README)
        sp = [b['spread'] for b in v['all']]
        rows['spread'] = [1.0, 1.0, 1.0] + [round(max(1.0, sp[i] / sp[2]), 3) for i in (3, 4)]
        out[fam] = rows
    return out


if __name__ == '__main__':
    if sys.argv[1] == 'league':
        json.dump(league(sys.argv[2:]), sys.stdout, indent=1)
    elif sys.argv[1] == 'arsenal':
        arsenal(sys.argv[2:])
    elif sys.argv[1] == 'packs':
        packs(sys.argv[2:])
    elif sys.argv[1] == 'constants':
        json.dump(constants(sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), 'effort.json')), sys.stdout)
