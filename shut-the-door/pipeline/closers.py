"""The regular-season search: a top closer's highest-leverage ninth, 2023-2025.

Reads the ninth-inning slices of the library (slices named 'ninth-YYYY').

  A save here is a ninth-inning half the fielding team finished ahead, by the
  pitcher who threw its last pitch, who entered in that half with a save-rule
  lead (3 runs or fewer, or the tying run on base, at bat or on deck). A game
  that ends that half is over, so the lead held is the game won.
  A blown save is the same entry with the lead gone in the half.

  Top closers: the most such saves over the three seasons, per hand.

  Leverage: LI9, an empirical leverage index from the same data. For every
  ninth-inning plate appearance, the swing in home win expectancy over the PA
  (Savant's delta_home_win_exp summed over its pitches). LI9 of a state (half,
  outs, bases, lead) is the mean absolute swing of PAs starting there, over the
  mean across all ninth-inning PAs. So LI9 = 1 is an average ninth-inning PA, not
  an average PA. Tom Tango's LI (an average PA anywhere = 1) is higher for the
  same state, since ninth-inning PAs swing more than most.

The shortlist is verified like any candidate (verify_scenarios.build_real) and
written to data/verify/rs-*.json; the search itself to _regular_season.json.
"""

import os
import sqlite3
import sys

import pandas as pd

import savant
import statsapi
import verify_scenarios as vs
from common import LIBRARY, VERIFY, log, write_json

SEASONS = (2023, 2024, 2025)
TOP_R, TOP_L = 12, 8
SHORT = 3


def load():
    if not os.path.exists(LIBRARY):
        return None
    con = sqlite3.connect(LIBRARY)
    names = [r[0] for r in con.execute("SELECT slice FROM fetched WHERE slice LIKE 'ninth-%'")]
    if not names:
        return None
    q = ('SELECT * FROM pitches WHERE inning = 9 AND game_type = "R" AND game_year IN (%s)'
         % ','.join(map(str, SEASONS)))
    df = pd.read_sql_query(q, con)
    return df.sort_values(['game_pk', 'at_bat_number', 'pitch_number']).reset_index(drop=True), names


def bases(r):
    return int(pd.notna(r['on_1b'])) | (int(pd.notna(r['on_2b'])) << 1) | (int(pd.notna(r['on_3b'])) << 2)


def nrunners(m):
    return bin(m).count('1')


def main(argv):
    got = load()
    if not got:
        log('No ninth-inning slice in the library yet (slices named ninth-YYYY). Nothing to search.')
        write_json(os.path.join(VERIFY, '_regular_season.json'),
                   {'summary': 'Not run: the library has no ninth-inning slice yet.'})
        return
    df, slices = got
    log(f'{len(df)} ninth-inning regular-season pitches from {slices}')
    df['dwe'] = pd.to_numeric(df['delta_home_win_exp'], errors='coerce').fillna(0.0)

    # plate appearances
    pa = df.groupby(['game_pk', 'at_bat_number'], sort=True).agg(
        half=('inning_topbot', 'first'), outs=('outs_when_up', 'first'),
        fld=('fld_score', 'first'), bat=('bat_score', 'first'),
        on1=('on_1b', 'first'), on2=('on_2b', 'first'), on3=('on_3b', 'first'),
        swing=('dwe', 'sum'), year=('game_year', 'first')).reset_index()
    pa['bases'] = (pa['on1'].notna().astype(int) | (pa['on2'].notna().astype(int) << 1)
                   | (pa['on3'].notna().astype(int) << 2))
    pa['lead'] = (pa['fld'] - pa['bat']).clip(-4, 5)
    pa['abs'] = pa['swing'].abs()
    mean_all = pa['abs'].mean()
    li = (pa.groupby(['half', 'outs', 'bases', 'lead'])['abs'].agg(['mean', 'count']).reset_index())
    li['li9'] = li['mean'] / mean_all
    LI = {(r.half, int(r.outs), int(r.bases), int(r.lead)): (float(r.li9), int(r['count'])) for r in li.itertuples()}
    log(f'mean |win expectancy swing| per ninth-inning PA: {mean_all:.4f}')

    outings = []
    for (gpk, half), g in df.groupby(['game_pk', 'inning_topbot'], sort=False):
        last = g.iloc[-1]
        closer = int(last['pitcher'])
        mine = g[g['pitcher'] == closer]
        e = mine.iloc[0]
        lead = int(e['fld_score'] - e['bat_score'])
        b = bases(e)
        if lead <= 0 or not (lead <= 3 or lead <= nrunners(b) + 2):
            continue
        end_lead = int(last['post_fld_score'] - last['post_bat_score'])
        sub = g[g.index >= e.name]
        ent_li = LI.get((half, int(e['outs_when_up']), b, max(-4, min(5, lead))), (None, 0))
        outings.append({
            'gamePk': int(gpk), 'date': str(e['game_date'])[:10], 'year': int(e['game_year']),
            'half': half, 'pitcher': closer, 'name': e['player_name'], 'throws': e['p_throws'],
            'home': e['home_team'], 'away': e['away_team'],
            'outs': int(e['outs_when_up']), 'bases': b, 'lead': lead,
            'midPA': bool((g[(g['at_bat_number'] == e['at_bat_number'])].index < e.name).any()),
            'li9': None if ent_li[0] is None else round(ent_li[0], 2), 'li9n': ent_li[1],
            'swing': round(float(sub['dwe'].abs().sum()), 3),
            'held': end_lead > 0, 'endLead': end_lead,
            'faced': int(sub['at_bat_number'].nunique()), 'pitches': int((sub['pitcher'] == closer).sum()),
        })
    o = pd.DataFrame(outings)
    saves = o[o['held']].groupby(['pitcher', 'name', 'throws']).size().rename('saves').reset_index()
    blown = o[~o['held']].groupby('pitcher').size().rename('blown')
    saves = saves.join(blown, on='pitcher').fillna({'blown': 0})
    top = pd.concat([
        saves[saves['throws'] == 'R'].nlargest(TOP_R, 'saves'),
        saves[saves['throws'] == 'L'].nlargest(TOP_L, 'saves'),
    ])
    log('top closers by saves found here, 2023-2025:')
    log(top.to_string(index=False))
    pool = o[o['pitcher'].isin(top['pitcher'])].copy()
    pool = pool[pool['li9n'] >= 30]   # a leverage read on at least 30 PAs
    pool = pool.sort_values(['li9', 'swing'], ascending=False)

    short = {}
    for hand, want_held in (('R', True), ('L', None)):
        cand = pool[pool['throws'] == hand]
        if want_held is not None:
            cand = cand[cand['held'] == want_held]
        cand = cand[cand['faced'] >= 3]                 # a spot with something in it
        cand = cand.drop_duplicates('pitcher')          # one per closer
        short[hand] = cand.head(SHORT * 2).to_dict('records')

    verified = []
    for hand in ('R', 'L'):
        for c in short[hand][:SHORT]:
            sid = f'rs-{c["name"].split(",")[0].lower().replace(" ", "")}-{c["date"]}'
            log(f'== {sid} LI9 {c["li9"]}')
            try:
                df_g, _ = savant.fetch(savant.search_url(game_pk=c['gamePk']), f'savant-game-{c["gamePk"]}.csv')
                df_g = df_g.sort_values(['at_bat_number', 'pitch_number']).reset_index(drop=True)
                mine = df_g[(df_g['pitcher'] == c['pitcher']) & (df_g['inning'] == 9)]
                games = statsapi.schedule(c['date'], 'R')
                game = next(gg for gg in games if gg['gamePk'] == c['gamePk'])
                out = vs.build_real({'id': sid, 'plan': f'regular season {hand}', 'date': c['date']},
                                    game, df_g, mine, savant.search_url(game_pk=c['gamePk']), [])
                out['search'] = c
                try:
                    wp = statsapi.win_probability(c['gamePk'])
                    first_ab = out['plateAppearances'][0]['atBat'] - 1
                    hit = next((p for p in wp if isinstance(p, dict) and p.get('atBatIndex') == first_ab), None) \
                        if isinstance(wp, list) else None
                    out['mlbWinProbabilityAtEntry'] = {k: v for k, v in (hit or {}).items()
                                                       if k in ('leverageIndex', 'homeTeamWinProbability',
                                                                'awayTeamWinProbability', 'atBatIndex')}
                except Exception as e:
                    out['mlbWinProbabilityAtEntry'] = {'error': repr(e)}
            except Exception as e:
                import traceback
                traceback.print_exc()
                out = {'id': sid, 'error': repr(e), 'search': c}
            write_json(os.path.join(VERIFY, sid + '.json'), out)
            verified.append(sid)

    summary = (f'{len(df)} ninth-inning pitches, {len(o)} save-rule entries, {int(o["held"].sum())} held. '
               f'Shortlist: {", ".join(verified)}.')
    write_json(os.path.join(VERIFY, '_regular_season.json'), {
        'summary': summary,
        'method': __doc__,
        'meanAbsSwingPerPA': round(float(mean_all), 5),
        'topClosers': top.to_dict('records'),
        'shortlist': short,
        'verified': verified,
    })
    log(summary)


if __name__ == '__main__':
    main(sys.argv)
