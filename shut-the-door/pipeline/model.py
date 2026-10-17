"""The outcome model for one scenario: per batter, arsenal pitch, cell and count
bucket, the chance of each outcome key, and a real pitch for each.

THE TIERS (CONTRACT.md: that batter, similar batters, league)

  league   L_stuff: every pitch of this type thrown by a pitcher of this hand
           within VELO_BAND mph of this pitcher's average, to a batter of this
           side, in the league window (real: the season and the ones either
           side; proxy: 2015 on), by cell, count bucket and key. Smoothed toward
           the same type at any velocity (K_STUFF pitches).
  similar  the NEIGHBOURS nearest batter-seasons to him (real: by chase,
           zone swing, whiff by family and damage by region; proxy: by season
           line, since the batter has no tracked pitches).
  batter   his own pitches against this hand, the season and the one before.

  Batter and similar adjust the league table by ratio, at a coarser grain so a
  batter's few hundred pitches mean something: 7 regions of the grid x two
  strikes or not x pitch family. In each group the batter's outcome mix is
  shrunk toward the similar batters' (K_BATTER pitches), theirs toward the
  league's (K_SIMILAR), and the ratio to the league's mix in that group scales
  L_stuff in every cell of the group, key by key, then renormalised.

THE REAL PITCH OF EACH KEY
  For each (batter, type, cell, key) with a chance, a real pitch of that type,
  in that cell, with that outcome: his own if he has one (tier batter), else a
  similar batter's (similar), else the league pool's (league). Within VELO_EX
  mph of this pitcher's average where possible, so the velo shown is near his.
  Picked by a fixed hash, so a rebuild picks the same pitch.

COMMAND
  sigmaFt = BASE_SIGMA_FT x (his location spread / the league's) for that type,
  where spread is the root-mean-square distance of his pitches from his own
  mean location in each count bucket and batter side (so aiming differently by
  count is not counted as a miss). command (20-80) is 50 + 10 x z of the same.
  BASE_SIGMA_FT is a game setting (the average pitcher's miss per axis), not a
  measurement: Statcast does not record the catcher's target.
"""

import hashlib
import math

import numpy as np
import pandas as pd

import prep

NK = len(prep.KEYS)
VELO_BAND = 2.0
VELO_EX = 3.0
K_STUFF = 40.0
K_BATTER = 80.0
K_SIMILAR = 200.0
NEIGHBOURS = 25
MIN_BATTER_PITCHES = 300
RATIO_CAP = (0.2, 5.0)
BASE_SIGMA_FT = 0.45

REGION = np.array([4, 4, 4, 4, 4,
                   5, 1, 1, 1, 5,
                   5, 2, 0, 2, 5,
                   5, 3, 3, 3, 5,
                   6, 6, 6, 6, 6])
FAMS = ['hard', 'breaking', 'offspeed']
FI = {f: i for i, f in enumerate(FAMS)}


def group_of(cell, bucket):
    return REGION[cell] * 2 + (np.asarray(bucket) == 3).astype(int)


def stable_pick(n, *key):
    h = hashlib.sha1('|'.join(map(str, key)).encode()).hexdigest()
    return int(h[:12], 16) % n


# ---- counting ---------------------------------------------------------------

def count_cells(df):
    """[25, 4, NK] counts from prepped rows."""
    a = np.zeros((25, 4, NK))
    if len(df):
        np.add.at(a, (df['cell'].values, df['bucket'].values, df['ki'].values), 1)
    return a


def count_groups(df):
    """[3 families, 14 groups, NK] counts."""
    a = np.zeros((3, 14, NK))
    df = df[df['family'].notna()]
    if len(df):
        g = group_of(df['cell'].values, df['bucket'].values)
        np.add.at(a, (df['family'].map(FI).values, g, df['ki'].values), 1)
    return a


def norm(a, axis=-1):
    s = a.sum(axis=axis, keepdims=True)
    return np.divide(a, s, out=np.zeros_like(a), where=s > 0)


def shrink(counts, prior, k):
    """(counts + k * prior) / (n + k), along the last axis."""
    n = counts.sum(axis=-1, keepdims=True)
    return (counts + k * prior) / (n + k)


# ---- similar batters ----------------------------------------------------------

def batter_features(df):
    """Per batter: chase, zone swing, whiff per family, damage on contact by
    zone part. Rows must be prepped. Returns a frame indexed by batter."""
    z = prep.in_zone(df['cell'].values)
    d = df.assign(z=z, whiff=df['key'].eq('swinging_strike'))
    g = d.groupby('batter')
    out = pd.DataFrame({
        'n': g.size(),
        'chase': d[~d['z']].groupby('batter')['swing'].mean(),
        'zswing': d[d['z']].groupby('batter')['swing'].mean(),
    })
    sw = d[d['swing']]
    for f in FAMS:
        out['whiff_' + f] = sw[sw['family'] == f].groupby('batter')['whiff'].mean()
    ip = d[d['damage'].notna()]
    out['dmg'] = ip.groupby('batter')['damage'].mean()
    out['dmg_heart'] = ip[ip['cell'].isin([7, 11, 12, 13, 17])].groupby('batter')['damage'].mean()
    out['dmg_edge'] = ip[~ip['cell'].isin([7, 11, 12, 13, 17])].groupby('batter')['damage'].mean()
    return out


FEATS = ['chase', 'zswing', 'whiff_hard', 'whiff_breaking', 'whiff_offspeed', 'dmg', 'dmg_heart', 'dmg_edge']


def nearest(feats, row, k=NEIGHBOURS, cols=FEATS, exclude=None):
    f = feats.dropna(subset=cols)
    if exclude is not None:
        f = f[f.index != exclude]
    mu, sd = f[cols].mean(), f[cols].std().replace(0, 1)
    zf = (f[cols] - mu) / sd
    zr = (pd.Series(row)[cols] - mu) / sd
    d = ((zf - zr) ** 2).sum(axis=1)
    return list(d.nsmallest(k).index)


def season_lines(df):
    """Per batter: PA, AVG, OBP, SLG, HR/PA from the events of his PAs."""
    ev = df[df['events'].notna() & (df['events'] != '')]
    e = ev['events']
    hit = e.isin(['single', 'double', 'triple', 'home_run'])
    tb = e.map({'single': 1, 'double': 2, 'triple': 3, 'home_run': 4}).fillna(0)
    bb = e.isin(['walk', 'intent_walk'])
    hbp = e.eq('hit_by_pitch')
    sf = e.isin(['sac_fly', 'sac_fly_double_play'])
    sh = e.isin(['sac_bunt', 'sac_bunt_double_play'])
    ci = e.eq('catcher_interf')
    t = pd.DataFrame({'batter': ev['batter'], 'pa': 1, 'h': hit, 'tb': tb, 'bb': bb, 'hbp': hbp,
                      'sf': sf, 'sh': sh, 'ci': ci, 'hr': e.eq('home_run')})
    g = t.groupby('batter').sum()
    ab = g['pa'] - g['bb'] - g['hbp'] - g['sf'] - g['sh'] - g['ci']
    out = pd.DataFrame({'pa': g['pa'], 'avg': g['h'] / ab, 'obp': (g['h'] + g['bb'] + g['hbp']) / (ab + g['bb'] + g['hbp'] + g['sf']),
                        'slg': g['tb'] / ab, 'hr_pa': g['hr'] / g['pa']})
    return out


LINE_FEATS = ['avg', 'obp', 'slg', 'hr_pa']


# ---- command -------------------------------------------------------------------

def spread(df):
    """Root-mean-square distance (ft, per axis) of pitches from their own mean
    location within each (count bucket, batter side)."""
    if len(df) < 30:
        return None
    zf = df['zn'] * (df['sz_top'] - df['sz_bot'])
    g = df.assign(zf=zf).groupby(['bucket', 'stand'])
    dx = df['plate_x'] - g['plate_x'].transform('mean')
    dz = zf - g['zf'].transform('mean')
    return float(np.sqrt(((dx ** 2 + dz ** 2) / 2).mean()))


def league_spreads(df, ptype, min_n=200):
    s = []
    for pid, g in df[df['pitch_type'] == ptype].groupby('pitcher'):
        if len(g) >= min_n:
            v = spread(g)
            if v:
                s.append(v)
    return np.array(s)


def command_of(his, league):
    if his is None or len(league) < 10:
        return 50, BASE_SIGMA_FT
    mu, sd = league.mean(), league.std()
    z = (mu - his) / sd if sd > 0 else 0
    return int(max(20, min(80, round(50 + 10 * z)))), round(BASE_SIGMA_FT * his / mu, 3)


# ---- the table -------------------------------------------------------------------

def permille(p):
    """Rows of probabilities to integers summing to 1000 (largest remainder)."""
    p = np.asarray(p, dtype=float)
    p = p / p.sum()
    s = p * 1000
    out = np.floor(s).astype(int)
    left = 1000 - out.sum()
    order = np.argsort(-(s - out), kind='stable')
    out[order[:left]] += 1
    return out


def outcome_table(L_stuff, L_type, L_fam_groups, B_groups, S_groups, ptype):
    """p[cell][bucket][key] for one batter and one pitch type.

    L_stuff, L_type: [25, 4, NK] league counts (stuff-matched, any velo)
    L_fam_groups:    [3, 14, NK] league counts by family and group (same hand)
    B_groups, S_groups: [3, 14, NK] the batter's and the similar batters' counts
    """
    base = shrink(L_stuff, norm(shrink(L_type, norm(L_type.sum(axis=(0, 1), keepdims=True)), 5.0)), K_STUFF)
    f = FI[prep.FAMILY[ptype]]
    lg = norm(L_fam_groups[f])                         # [14, NK]
    sim = shrink(S_groups[f], lg, K_SIMILAR)
    bat = shrink(B_groups[f], sim, K_BATTER)
    ratio = np.divide(bat, lg, out=np.ones_like(bat), where=lg > 0)
    ratio = np.clip(ratio, *RATIO_CAP)
    out = np.zeros((25, 4, NK))
    for cell in range(25):
        for b in range(4):
            g = REGION[cell] * 2 + (1 if b == 3 else 0)
            row = base[cell, b] * ratio[g]
            out[cell, b] = row / row.sum()
    return out


def pick_exemplar(pools, bi, ptype, cell, key, velo):
    """pools: [(tier, frame)] in tier order. Each frame prepped and already cut
    to this type. Returns (row, tier) or (None, None)."""
    for tier, f in pools:
        c = f[(f['cell'] == cell) & (f['key'] == key)]
        if not len(c):
            continue
        near = c[(c['release_speed'] - velo).abs() <= VELO_EX]
        c = near if len(near) else (c if tier == 2 else near)
        if not len(c):
            continue
        c = c.sort_values(['game_pk', 'at_bat_number', 'pitch_number'])
        # league exemplars are shared across batters, so the hash leaves bi out
        i = stable_pick(len(c), ptype, cell, key, tier, bi if tier < 2 else 'league')
        return c.iloc[i], tier
    return None, None


def pitch_row(r):
    def num(v, nd):
        return None if v is None or (isinstance(v, float) and math.isnan(v)) else round(float(v), nd)
    pid = f'{int(r["game_pk"])}:{int(r["at_bat_number"])}:{int(r["pitch_number"])}'
    res = r['res'] if isinstance(r['res'], str) else None
    return [pid, num(r['release_speed'], 1), res, r['bb'] if isinstance(r['bb'], str) else None,
            num(r['launch_speed'], 1), num(r['launch_angle'], 0), num(r['spray'], 1)]
