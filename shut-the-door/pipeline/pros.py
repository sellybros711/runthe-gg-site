"""The pro examples for the lesson (CONTRACT.md section 15): real pitches, never invented.

From the 2015-2025 library, every pitch thrown by a pitcher in the closer pool
(data/closers.json) with a good result, tagged with each principle it shows:

  chase_when_ahead                 ahead or two strikes, out of the zone, a whiff or an out
  strike_when_behind               behind, in the zone, a strike or an out
  first_pitch_strike               0-0, a strike or an out
  avoid_his_damage                 not over the heart, an out or a strike
  attack_his_hole                  a whiff
  same_side_breaker_away           same hand, a breaking ball away, a whiff or an out
  change_eye_level                 a fastball up or a breaking ball down, a whiff
  double_play_ball                 a ground ball double play
  strikeout_with_runner_on_third   a man on third, less than two out, strike three
  dont_walk_the_tying_run          three balls, a strike or an out
  use_your_best_pitch              his most used pitch that season, a whiff or strike three

and kept, per (principle, count bucket, platoon, pitch family, batter-relative
cell), the one that ranks first by: postseason, then leverage (the mean swing
in win expectancy of plate appearances from that state, inning, outs, bases
and lead), then the latest date. The cell is batter-relative (columns mirrored
for a left-handed batter, so col 0 is always inside) because the lesson matches
on where the pitch was relative to the hitter.

Writes cache/pros.json; pool.js takes the rows a pack's best calls can reach.
"""

import os
import sys

import numpy as np
import pandas as pd

import prep
import statsapi
from common import CACHE, DATA, log, read_json, write_json

YEARS = list(range(2015, 2026))
COLS = ['game_pk', 'at_bat_number', 'pitch_number', 'game_date', 'game_year', 'game_type', 'pitcher', 'batter',
        'stand', 'p_throws', 'home_team', 'away_team', 'inning', 'inning_topbot', 'outs_when_up', 'on_1b', 'on_2b',
        'on_3b', 'balls', 'strikes', 'bat_score', 'fld_score', 'pitch_type', 'plate_x', 'plate_z', 'sz_top',
        'sz_bot', 'description', 'events', 'bb_type', 'estimated_woba_using_speedangle', 'hc_x', 'hc_y',
        'release_speed', 'launch_speed', 'launch_angle', 'delta_home_win_exp']
BUCKETS = ['even', 'ahead', 'behind', 'two_strikes']
GAME = {'F': 'wild card', 'D': 'division series', 'L': 'lcs', 'W': 'world series'}
HEART = {7, 11, 12, 13, 17}


def result_of(r):
    d, e, bb = r.description, (r.events if isinstance(r.events, str) else ''), r.bb_type
    if e == 'strikeout':
        return 'called strike three' if d == 'called_strike' else 'swinging strike three'
    if e in ('grounded_into_double_play', 'double_play') and bb == 'ground_ball':
        return 'ground ball double play'
    if d in ('swinging_strike', 'swinging_strike_blocked'):
        return 'swinging strike'
    if d == 'called_strike':
        return 'called strike'
    if d == 'foul_tip':
        return 'foul tip'
    if d.startswith('hit_into_play') and e not in ('single', 'double', 'triple', 'home_run', 'field_error') and e:
        return {'ground_ball': 'ground out', 'fly_ball': 'fly out', 'line_drive': 'line out', 'popup': 'pop out'}.get(bb, 'out')
    return None


def main(argv):
    pool = read_json(os.path.join(DATA, 'closers.json'))['closers']
    ids = {c['id']: c['name'] for c in pool}
    keep = {}
    lev_rows = []
    frames = []
    for y in YEARS:
        df = prep.load([y], cols=COLS, where='inning >= 7')
        df = df.sort_values(['game_pk', 'at_bat_number', 'pitch_number'])
        # leverage by state, from every PA in the 7th or later
        first = df.groupby(['game_pk', 'at_bat_number'], sort=False).head(1)
        sw = df.groupby(['game_pk', 'at_bat_number'], sort=False)['delta_home_win_exp'].sum().abs().values
        st = pd.DataFrame({'inn': np.minimum(first['inning'].values, 9), 'half': first['inning_topbot'].values,
                           'outs': first['outs_when_up'].values,
                           'bases': (first['on_1b'].notna().astype(int) + 2 * first['on_2b'].notna().astype(int)
                                     + 4 * first['on_3b'].notna().astype(int)).values,
                           'lead': np.clip((first['fld_score'] - first['bat_score']).values, -4, 4), 'sw': sw})
        lev_rows.append(st)
        p = df[df['pitcher'].isin(ids)]
        p = prep.prep(p)
        p = p[p['pitch_type'].isin(prep.PITCH_TYPES)]
        frames.append(p)
        log(f'  {y}: {len(p)} pitches by pool closers')
    lev = pd.concat(lev_rows)
    mean = lev['sw'].mean()
    LEV = (lev.groupby(['inn', 'half', 'outs', 'bases', 'lead'])['sw'].mean() / mean).to_dict()
    d = pd.concat(frames, ignore_index=True)
    # each pitcher's most used type, per season
    top = d.groupby(['pitcher', 'game_year'])['pitch_type'].agg(lambda s: s.value_counts().index[0]).to_dict()
    d['res'] = [result_of(r) for r in d.itertuples()]
    d = d[d['res'].notna()]
    d['rel'] = np.where(d['stand'] == 'L', (d['cell'] // 5) * 5 + (4 - d['cell'] % 5), d['cell'])
    d['bases'] = d['on_1b'].notna().astype(int) + 2 * d['on_2b'].notna().astype(int) + 4 * d['on_3b'].notna().astype(int)
    d['platoon'] = np.where(d['stand'] == d['p_throws'], 'same', 'opp')
    d['post'] = d['game_type'].isin(list(GAME)).astype(int)
    d['lev'] = [LEV.get((min(r.inning, 9), r.inning_topbot, r.outs_when_up, r.bases,
                         max(-4, min(4, r.fld_score - r.bat_score))), 0.0) for r in d.itertuples()]
    zone = prep.in_zone(d['cell'].values)
    whiff = d['res'].isin(['swinging strike', 'swinging strike three'])
    strike = d['res'].isin(['swinging strike', 'swinging strike three', 'called strike', 'called strike three', 'foul tip'])
    out = d['res'].str.contains('out') | d['res'].eq('ground ball double play')
    k3 = d['res'].str.endswith('three')
    b = d['bucket'].values
    rowr = d['rel'] // 5
    tags = {
        'chase_when_ahead': np.isin(b, [1, 3]) & ~zone & (whiff | out),
        'strike_when_behind': (b == 2) & zone & (strike | out),
        'first_pitch_strike': (d['balls'] == 0) & (d['strikes'] == 0) & (strike | out),
        'avoid_his_damage': ~d['cell'].isin(HEART) & (strike | out),
        'attack_his_hole': whiff,
        'same_side_breaker_away': (d['platoon'] == 'same') & (d['family'] == 'breaking') & (d['rel'] % 5 >= 3) & (whiff | out),
        'change_eye_level': (((d['family'] == 'hard') & (rowr <= 1)) | ((d['family'] == 'breaking') & (rowr >= 3))) & whiff,
        'double_play_ball': d['res'].eq('ground ball double play'),
        'strikeout_with_runner_on_third': d['on_3b'].notna() & (d['outs_when_up'] < 2) & k3,
        'dont_walk_the_tying_run': (d['balls'] == 3) & (strike | out),
        'use_your_best_pitch': np.array([top.get((r.pitcher, r.game_year)) == r.pitch_type for r in d.itertuples()]) & (whiff | k3),
    }
    d = d.sort_values(['post', 'lev', 'game_date'], ascending=[False, False, False])
    rows = {}
    for pr, mask in tags.items():
        sub = d[mask]
        sub = sub.drop_duplicates(['bucket', 'platoon', 'family', 'rel'])
        for r in sub.itertuples():
            rows.setdefault(f'{pr}|{BUCKETS[r.bucket]}|{r.platoon}|{r.family}', []).append(r)
    batters = sorted({int(r.batter) for v in rows.values() for r in v})
    log(f'  {sum(len(v) for v in rows.values())} examples, {len(batters)} batters to name')
    names = {}
    ppl = statsapi.people(batters)
    for b_ in batters:
        names[b_] = (ppl.get(b_) or {}).get('fullName')
    pitchers = sorted({int(r.pitcher) for v in rows.values() for r in v})
    pidx = {p_: i for i, p_ in enumerate(pitchers)}
    bl = [b_ for b_ in batters if names.get(b_)]
    bidx = {b_: i for i, b_ in enumerate(bl)}
    out_rows = {}
    for k, v in rows.items():
        lst = []
        for r in v:
            if int(r.batter) not in bidx:
                continue                         # no name, no example
            home = str(r.home_team).lower()
            game = (GAME[r.game_type] + ' at ' + home) if r.game_type in GAME else 'at ' + home
            lst.append([pidx[int(r.pitcher)], bidx[int(r.batter)], str(r.game_date)[:10], game, int(r.balls), int(r.strikes),
                        int(r.outs_when_up), int(r.bases), r.pitch_type, int(r.cell), r.stand, r.res,
                        f'{int(r.game_pk)}:{int(r.at_bat_number)}:{int(r.pitch_number)}'])
        out_rows[k] = lst
    write_json(os.path.join(CACHE, 'pros.json'), {
        'years': YEARS, 'pitchers': [ids[p_] for p_ in pitchers], 'batters': [names[b_] for b_ in bl], 'rows': out_rows})
    log(f'pros: {sum(len(v) for v in out_rows.values())} examples in {len(out_rows)} keys')


if __name__ == '__main__':
    main(sys.argv)
