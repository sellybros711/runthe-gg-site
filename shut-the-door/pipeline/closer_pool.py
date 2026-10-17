"""The closer pool: real closers' pitch selection, 2015 on, as policies the
engine can play (pool.js runs them through every scenario).

  A closer season: a pitcher with CLOSER_ENTRIES or more entries in a season
  into the 9th inning (first pitch of his outing in that half) with a lead of
  1 to 3. The pool: the POOL_SIZE pitchers with the most such entries over
  2015-2025.

  His policy, from all his pitches in the 8th inning or later in his closer
  seasons:
    fam[bucket][family]          the share of hard, breaking and offspeed by count bucket
    loc[family][bucket][cell]    where those pitches went, in a batter-relative
                                 grid (columns mirrored for a left-handed
                                 batter, so col 0 is always inside), smoothed
                                 toward his own all-count spread and then the
                                 league's
  His vector (for pitched like), the same 15 numbers engine.js styleVector
  builds from a player's calls: family share by count bucket (12), then the
  share in the zone, on its ring, and out of it.

Writes data/closers.json (committed: a few dozen KB).
"""

import os
import sys

import numpy as np
import pandas as pd

import prep
from common import CACHE, DATA, log, write_json

YEARS = list(range(2015, 2026))
CLOSER_ENTRIES = 15
POOL_SIZE = 40
# Not in the pool (so never 'pitched like'): the lead's ruling, CONTRACT.md
# section 14, that Clase is not used.
EXCLUDE = {661403}
FAMS = ['hard', 'breaking', 'offspeed']
RING = [6, 7, 8, 11, 13, 16, 17, 18]
COLS = ['game_pk', 'at_bat_number', 'pitch_number', 'game_year', 'game_type', 'pitcher', 'player_name', 'batter',
        'stand', 'p_throws', 'inning', 'inning_topbot', 'bat_score', 'fld_score', 'pitch_type', 'release_speed',
        'plate_x', 'plate_z', 'sz_top', 'sz_bot', 'balls', 'strikes', 'description', 'events', 'bb_type',
        'estimated_woba_using_speedangle', 'hc_x', 'hc_y']


def mirror(cell, stand):
    cell = np.asarray(cell)
    r, c = cell // 5, cell % 5
    return np.where(np.asarray(stand) == 'L', r * 5 + (4 - c), cell)


def main(argv):
    entries = []
    late = []
    for y in YEARS:
        df = prep.load([y], cols=COLS, where="game_type = 'R' AND inning >= 8")
        df = df.sort_values(['game_pk', 'at_bat_number', 'pitch_number'])
        first = df[df['inning'] == 9].groupby(['game_pk', 'inning_topbot', 'pitcher'], sort=False).head(1)
        lead = first['fld_score'] - first['bat_score']
        e = first[(lead >= 1) & (lead <= 3)]
        cnt = e.groupby(['pitcher']).size()
        names = e.groupby('pitcher')['player_name'].first()
        for pid, n in cnt.items():
            entries.append({'pitcher': int(pid), 'year': y, 'n': int(n), 'name': names[pid]})
        p = prep.prep(df)
        p = p[p['pitch_type'].isin(prep.PITCH_TYPES)]
        late.append(p[['pitcher', 'game_year', 'stand', 'p_throws', 'cell', 'bucket', 'family']])
        log(f'  {y}: {len(e)} save-rule ninth entries')
    ent = pd.DataFrame(entries)
    cs = ent[ent['n'] >= CLOSER_ENTRIES]
    tot = cs.groupby('pitcher')['n'].sum().sort_values(ascending=False)
    tot = tot[~tot.index.isin(EXCLUDE)]
    pool_ids = list(tot.index[:POOL_SIZE])
    late = pd.concat(late, ignore_index=True)
    late['rel'] = mirror(late['cell'].values, late['stand'].values)
    league_loc = np.bincount(late['rel'], minlength=25).astype(float)
    league_loc /= league_loc.sum()
    closers = []
    for pid in pool_ids:
        yrs = set(cs[cs['pitcher'] == pid]['year'])
        mine = late[(late['pitcher'] == pid) & late['game_year'].isin(yrs)]
        if len(mine) < 300:
            continue
        name = cs[cs['pitcher'] == pid]['name'].iloc[0]
        last, _, first_ = name.partition(', ')
        full = f'{first_} {last}'.strip()
        fam = np.zeros((4, 3))
        loc = np.zeros((3, 4, 25))
        for b in range(4):
            mb = mine[mine['bucket'] == b]
            for fi, f in enumerate(FAMS):
                fam[b, fi] = (mb['family'] == f).sum()
        fam = (fam + 1) / (fam + 1).sum(axis=1, keepdims=True)
        own_all = np.bincount(mine['rel'], minlength=25).astype(float)
        own_all = (own_all + 25 * league_loc) / (own_all.sum() + 25)
        for fi, f in enumerate(FAMS):
            mf = mine[mine['family'] == f]
            fall = np.bincount(mf['rel'], minlength=25).astype(float)
            fall = (fall + 30 * own_all) / (fall.sum() + 30)
            for b in range(4):
                c = np.bincount(mf[mf['bucket'] == b]['rel'], minlength=25).astype(float)
                loc[fi, b] = (c + 30 * fall) / (c.sum() + 30)
        z = prep.in_zone(mine['cell'].values)
        vec = list(fam.reshape(-1)) + [float(z.mean()), float(mine['cell'].isin(RING).mean()), float((~z).mean())]
        hard = (mine['family'] == 'hard').mean()
        brk = (mine['family'] == 'breaking').mean()
        if hard >= 0.6:
            lead_txt = f'fastballs on {round(hard * 100)}% of his pitches'
        elif brk >= 0.4:
            lead_txt = f'breaking balls on {round(brk * 100)}% of his pitches'
        else:
            lead_txt = f'a mix: {round(hard * 100)}% fastballs, {round(brk * 100)}% breaking'
        reason = f'{lead_txt}. {round(float((~z).mean()) * 100)}% out of the zone.'
        closers.append({'id': int(pid), 'name': full, 'throws': mine['p_throws'].iloc[0], 'seasons': sorted(int(y) for y in yrs),
                        'entries': int(tot[pid]), 'pitches': int(len(mine)),
                        'fam': np.round(fam, 4).tolist(), 'loc': np.round(loc, 4).tolist(),
                        'vec': [round(x, 4) for x in vec], 'reason': reason})
    # data/closers.json is committed (small): pool.js plays it and the pack
    # tests replay it, so CI can check a median outing without the library
    out = {'years': YEARS, 'closerEntries': CLOSER_ENTRIES, 'excluded': sorted(EXCLUDE), 'closers': closers}
    write_json(os.path.join(DATA, 'closers.json'), out)
    log(f'closer pool: {len(closers)} closers: ' + ', '.join(c['name'] for c in closers))


if __name__ == '__main__':
    main(sys.argv)
