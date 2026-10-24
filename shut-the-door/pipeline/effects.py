"""Rules 2: what a real Statcast season says about the effects the owner asked
for (2026-10-22). grade.js R2 uses the shares and the runners-on spread from
here as they are, and the README says what is measured and what is a model.

  A. Hitter adjustment inside a plate appearance: the outcome of a pitch, against
     what the same pitch family in the same cell, count bucket and platoon does on
     average (observed / expected, key by key), by how many pitches of that same
     type the batter has already seen in the PA and whether one of them crossed
     within one cell of this one.
  B. Later in the outing: the same observed / expected by how many pitches of
     that type this reliever had already thrown to earlier batters in the outing.
  C. Command by the reliever's pitch count in the outing, and with runners on:
     RMS distance from his own mean location for that type, count bucket and
     batter side (the pipeline's command_of measure), relative to his overall.
  D. Command on a repeat: the same spread when the last pitch was the same type.

  E. Where he has aimed: outcomes by the share of his earlier pitches this game
     in the zone, against his own season rate.

  python3 effects.py season.csv.gz [more.csv.gz ...] > effects.json
  python3 effects.py --year 2024 > effects.json      from the library (cache/library.sqlite)

The 2024 run (effects.json) read savant.fetch_range('2024-03-20', '2024-09-30',
game_types=GT_REGULAR) in five day chunks.
"""
import sys, json
import numpy as np
import pandas as pd
import prep
from savant import LIB

if sys.argv[1] == '--year':
    raw = prep.load([int(sys.argv[2])], where="game_type = 'R'", cols=LIB)
else:
    raw = pd.concat([pd.read_csv(f, low_memory=False) for f in sys.argv[1:]], ignore_index=True)
raw = raw.drop_duplicates(['game_pk', 'at_bat_number', 'pitch_number'])
raw = raw.sort_values(['game_pk', 'at_bat_number', 'pitch_number']).reset_index(drop=True)
# the reliever flag and the pitch count need every pitch, before prep drops any
raw['team_side'] = raw['inning_topbot']
first = raw.groupby(['game_pk', 'inning_topbot'])['pitcher'].transform('first')
raw['reliever'] = raw['pitcher'] != first
raw['pcount'] = raw.groupby(['game_pk', 'pitcher']).cumcount() + 1     # this pitch is his nth of the game
df = prep.prep(raw)
df = df[df['pitch_type'].isin(prep.PITCH_TYPES)].copy()
df['platoon'] = (df['stand'] == df['p_throws']).astype(int)
NK = len(prep.KEYS)
out = {'pitches': int(len(df)), 'seasons': sorted(int(y) for y in df['game_year'].unique())}

# ---- the expected mix: family x cell x exact count x platoon ---------------------
df['stratum'] = (df['family'].map({'hard': 0, 'breaking': 1, 'offspeed': 2}) * 1000
                 + df['cell'] * 40 + (df['balls'].clip(0, 3) * 3 + df['strikes'].clip(0, 2)) * 2 + df['platoon'])
onehot = np.zeros((len(df), NK))
onehot[np.arange(len(df)), df['ki'].values] = 1
st_codes, st_idx = np.unique(df['stratum'].values, return_inverse=True)
sums = np.zeros((len(st_codes), NK))
np.add.at(sums, st_idx, onehot)
exp = sums[st_idx] / sums.sum(axis=1, keepdims=True)[st_idx]


def ratios(mask):
    o = onehot[mask].sum(axis=0)
    e = exp[mask].sum(axis=0)
    return {k: (round(float(o[i] / e[i]), 4) if e[i] > 0 else None) for i, k in enumerate(prep.KEYS)}, int(mask.sum())


def groups(mask):
    """Grouped keys, with a standard error from the count."""
    G = {'ball': [0], 'called': [1], 'whiff': [2], 'foul': [3], 'hbp': [4], 'hit': [5, 6, 7, 8], 'hr': [8],
         'xbh': [6, 7, 8], 'out': [10, 11, 12, 13], 'inplay': [5, 6, 7, 8, 9, 10, 11, 12, 13],
         'swing': [2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13]}
    r = {}
    for g, ks in G.items():
        o = onehot[mask][:, ks].sum()
        e = exp[mask][:, ks].sum()
        r[g] = [round(float(o / e), 4), round(float(np.sqrt(max(o, 1)) / e), 4)] if e > 0 else None
    # xwOBA on contact against the stratum's
    return r


# ---- A. within the plate appearance ------------------------------------------
pa = df.groupby(['game_pk', 'at_bat_number'], sort=False)
seenN = np.zeros(len(df), dtype=int)
near = np.zeros(len(df), dtype=bool)
lastSame = np.zeros(len(df), dtype=bool)
lastNear = np.zeros(len(df), dtype=bool)
types = df['pitch_type'].values
cells = df['cell'].values
for _, idx in pa.indices.items():
    hist = []
    for j in idx:
        t, c = types[j], cells[j]
        same = [hc for ht, hc in hist if ht == t]
        seenN[j] = len(same)
        near[j] = any(max(abs(hc // 5 - c // 5), abs(hc % 5 - c % 5)) <= 1 for hc in same)
        if hist:
            lastSame[j] = hist[-1][0] == t
            lastNear[j] = lastSame[j] and max(abs(hist[-1][1] // 5 - c // 5), abs(hist[-1][1] % 5 - c % 5)) <= 1
        hist.append((t, c))
df['seenN'] = seenN
df['near'] = near
A = {}
for n in range(0, 4):
    m = (np.minimum(seenN, 3) == n)
    if n == 0:
        A['seen0'] = {'n': int(m.sum()), 'groups': groups(m), 'keys': ratios(m)[0]}
        continue
    for nr in (False, True):
        mm = m & (near == nr)
        A[f'seen{n}{"_near" if nr else "_far"}'] = {'n': int(mm.sum()), 'groups': groups(mm), 'keys': ratios(mm)[0]}
A['last_same_near'] = {'n': int(lastNear.sum()), 'groups': groups(lastNear)}
A['last_same_far'] = {'n': int((lastSame & ~lastNear).sum()), 'groups': groups(lastSame & ~lastNear)}
A['last_diff'] = {'n': int((~lastSame & (seenN >= 0) & (df['pitch_number'].values > 1)).sum()),
                  'groups': groups(~lastSame & (df['pitch_number'].values > 1))}
out['A_in_pa'] = A
out['A_shares'] = {k: round(v['n'] / len(df), 4) for k, v in A.items() if k.startswith('seen')}
# damage on contact (xwOBA) by condition, against the stratum's mean
dmg = df['damage'].values
ip = ~np.isnan(dmg)
st_d = pd.Series(dmg[ip]).groupby(st_idx[ip]).mean()
exp_d = np.full(len(df), np.nan)
exp_d[ip] = st_d.reindex(st_idx[ip]).values
dd = {}
for n in range(0, 4):
    for nr in ((None,) if n == 0 else (False, True)):
        m = (np.minimum(seenN, 3) == n) & ip
        if nr is not None:
            m &= (near == nr)
        dd[f'seen{n}' + ('' if nr is None else ('_near' if nr else '_far'))] = [round(float(np.nanmean(dmg[m])), 4), round(float(np.nanmean(exp_d[m])), 4), int(m.sum())]
out['A_damage_on_contact'] = dd

# ---- B. later in the outing (relievers) ---------------------------------------
rel = df['reliever'].values
# pitches of this type he threw to EARLIER batters this game
df['ord'] = np.arange(len(df))
cum_type = df.groupby(['game_pk', 'pitcher', 'pitch_type']).cumcount()          # before this pitch, this game
before_pa = np.maximum(0, cum_type.values - seenN)   # a pitching change mid PA can make it negative
df['typeBefore'] = before_pa
B = {}
for lo, hi in [(0, 0), (1, 4), (5, 9), (10, 14), (15, 99)]:
    m = rel & (before_pa >= lo) & (before_pa <= hi) & (seenN == 0)
    B[f'{lo}-{hi}'] = {'n': int(m.sum()), 'groups': groups(m)}
out['B_outing_first_of_type_in_pa'] = B
out['B_before_hist_relievers'] = np.bincount(np.minimum(before_pa[rel], 30)).tolist()
B2 = {}
for lo, hi in [(0, 0), (1, 4), (5, 9), (10, 14), (15, 99)]:
    m = rel & (before_pa >= lo) & (before_pa <= hi)
    B2[f'{lo}-{hi}'] = {'n': int(m.sum()), 'groups': groups(m)}
out['B_outing_all'] = B2

# ---- E. zone predictability: the share of his earlier pitches this game in the zone,
# against his own season zone rate (so a strike-thrower is compared with himself)
inz = prep.in_zone(df['cell'].values).astype(float)
df['inz'] = inz
gk = df.groupby(['game_pk', 'pitcher'], sort=False)
zb = gk['inz'].cumsum().values - inz
nb = gk.cumcount().values
season = df.groupby('pitcher')['inz'].transform('mean').values
K0 = 4.0
Zp = (zb + K0 * season) / (nb + K0)
dz = Zp - season
out['E_zone_share_hist'] = np.histogram(dz, bins=[-1, -0.15, -0.075, -0.025, 0.025, 0.075, 0.15, 1])[0].tolist()
E_ = {}
for lo, hi in [(-1, -0.15), (-0.15, -0.075), (-0.075, -0.025), (-0.025, 0.025), (0.025, 0.075), (0.075, 0.15), (0.15, 1)]:
    for z in (True, False):
        m = (dz >= lo) & (dz < hi) & (inz.astype(bool) == z) & (nb >= 3)
        E_[f'{"zone" if z else "chase"} {lo:+.3f}..{hi:+.3f}'] = {'n': int(m.sum()), 'mean_dz': round(float(dz[m].mean()), 4) if m.sum() else None, 'groups': groups(m)}
out['E_zone_predictability'] = E_
out['E_season_zone_rate_mean'] = round(float(season.mean()), 4)

# ---- C, D. command --------------------------------------------------------------
c = df.copy()
c['x'] = c['plate_x']
c['z'] = c['zn']
key = ['pitcher', 'pitch_type', 'bucket', 'stand', 'game_year']
g = c.groupby(key)
c['gn'] = g['x'].transform('size')
c = c[c['gn'] >= 10].copy()
mx = c.groupby(key)['x'].transform('mean')
mz = c.groupby(key)['z'].transform('mean')
zft = (c['sz_top'] - c['sz_bot'])
c['r2'] = (c['x'] - mx) ** 2 + ((c['z'] - mz) * zft) ** 2
c['r2'] *= c['gn'] / (c['gn'] - 1)            # small-group correction
base = c.groupby(['pitcher', 'pitch_type', 'game_year'])['r2'].transform('mean')
c['rel'] = c['r2'] / base
c['dvelo'] = c['release_speed'] - c.groupby(['pitcher', 'pitch_type', 'game_year'])['release_speed'].transform('mean')
cr = c[c['reliever']]
C = {}
for lo, hi in [(1, 5), (6, 10), (11, 15), (16, 20), (21, 25), (26, 30), (31, 40), (41, 999)]:
    m = (cr['pcount'] >= lo) & (cr['pcount'] <= hi)
    C[f'{lo}-{hi}'] = {'n': int(m.sum()), 'spread': round(float(np.sqrt(cr.loc[m, 'rel'].mean())), 4),
                       'velo': round(float(cr.loc[m, 'dvelo'].mean()), 3) if m.sum() else None}
out['C_spread_by_pitch_count_relievers'] = C
hist_pc = np.bincount(np.minimum(cr['pcount'].values, 60))
out['C_pitch_count_hist_relievers'] = hist_pc.tolist()
runners = (cr['on_1b'].notna()) | (cr['on_2b'].notna()) | (cr['on_3b'].notna())
risp = (cr['on_2b'].notna()) | (cr['on_3b'].notna())
close = (cr['bat_score'] - cr['fld_score']).abs() <= 1
late = cr['inning'] >= 8
P = {}
for name, m in [('empty', ~runners), ('on', runners), ('risp', risp), ('on_late_close', runners & late & close),
                ('risp_late_close', risp & late & close), ('empty_late_close', ~runners & late & close)]:
    P[name] = {'n': int(m.sum()), 'spread': round(float(np.sqrt(cr.loc[m, 'rel'].mean())), 4)}
out['C_spread_by_runners_relievers'] = P
# D: the last pitch the same type (in the same PA)
c['lastSame'] = lastSame[c['ord'].values] if 'ord' in c.columns else False
D = {}
for name, m in [('last_same', c['lastSame']), ('last_diff', ~c['lastSame'] & (c['pitch_number'] > 1)),
                ('first_of_pa', c['pitch_number'] == 1)]:
    D[name] = {'n': int(m.sum()), 'spread': round(float(np.sqrt(c.loc[m, 'rel'].mean())), 4)}
out['D_spread_on_repeat'] = D
print(json.dumps(out, indent=1))
