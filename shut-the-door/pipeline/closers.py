"""The regular-season search: a top closer's highest-leverage ninth, 2023-2025.

Reads the ninth inning of 2023-2025 from the library.

  A save here is a ninth-inning half the fielding team finished ahead, by the
  pitcher who threw its last pitch, who entered in that half with a save-rule
  lead (3 runs or fewer, or the tying run on base, at bat or on deck). A game
  that ends that half is over, so the lead held is the game won.
  A blown save is the same entry with the lead gone in the half.

  Top closers: 40 or more such saves over the three seasons.

  The spot: he starts the ninth, nobody on, up one, faces four or more, ranked
  by the outing's summed win-expectancy swing (how much each pitch mattered).

  Leverage: LI9, an empirical leverage index from the same data. For every
  ninth-inning plate appearance, the swing in home win expectancy over the PA
  (Savant's delta_home_win_exp summed over its pitches). LI9 of a state (half,
  outs, bases, lead) is the mean absolute swing of PAs starting there, over the
  mean across all ninth-inning PAs. So LI9 = 1 is an average ninth-inning PA, not
  an average PA, and it is not Tom Tango's LI (not compared here).

The shortlist is verified like any candidate (verify_scenarios.build_real) and
written to data/verify/rs-*.json; the search itself to _regular_season.json.
"""

import os
import sqlite3
import sys
import unicodedata

import pandas as pd

import savant
import statsapi
import verify_scenarios as vs
from common import LIBRARY, VERIFY, log, write_json

SEASONS = (2023, 2024, 2025)
MIN_SAVES = 40
SHORT = 3


def load():
    if not os.path.exists(LIBRARY):
        return None
    con = sqlite3.connect(LIBRARY)
    names = [r[0] for r in con.execute("SELECT slice FROM fetched WHERE slice LIKE 'season-%' OR slice LIKE 'ninth-%'")]
    have = {int(n.split('-')[1]) for n in names if n.split('-')[1].isdigit()}
    if not set(SEASONS) <= have:
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
    # the state at the first pitch of each PA (groupby 'first' would skip an
    # empty base and read a runner from later in the PA, so take the row)
    pa = df.groupby(['game_pk', 'at_bat_number'], sort=True).head(1).copy()
    pa['swing'] = df.groupby(['game_pk', 'at_bat_number'], sort=True)['dwe'].sum().values
    pa['half'] = pa['inning_topbot']
    pa['outs'] = pa['outs_when_up']
    pa['fld'] = pa['fld_score']
    pa['bat'] = pa['bat_score']
    pa['bases'] = (pa['on_1b'].notna().astype(int) + 2 * pa['on_2b'].notna().astype(int)
                   + 4 * pa['on_3b'].notna().astype(int))
    pa['lead'] = (pa['fld'] - pa['bat']).clip(-4, 5)
    pa['abs'] = pa['swing'].abs()
    mean_all = pa['abs'].mean()
    li = (pa.groupby(['half', 'outs', 'bases', 'lead'])['abs'].agg(['mean', 'count']).reset_index())
    li['li9'] = li['mean'] / mean_all
    LI = {(r.half, int(r.outs), int(r.bases), int(r.lead)): (float(r.li9), int(r.n)) for r in li.rename(columns={'count': 'n'}).itertuples()}
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
    top = saves[saves['saves'] >= MIN_SAVES].sort_values('saves', ascending=False)
    log(f'closers with {MIN_SAVES}+ saves found here, 2023-2025:')
    log(top.to_string(index=False))

    # The spot the game plays best: he starts the ninth, nobody on, up one, and
    # the inning goes long (four or more batters). Among those, rank by how
    # much the outing swung the game (the summed win-expectancy swing), since
    # LI at entry is the same for every one of them.
    pool = o[o['pitcher'].isin(top['pitcher']) & (o['outs'] == 0) & (o['bases'] == 0)
             & (o['lead'] == 1) & (o['faced'] >= 4)].copy()
    pool = pool.sort_values('swing', ascending=False)

    short = {}
    for hand, held in (('R', True), ('L', True), ('L', False)):
        cand = pool[(pool['throws'] == hand) & (pool['held'] == held)].drop_duplicates('pitcher')
        short[f'{hand}-{"held" if held else "blown"}'] = cand.head(SHORT * 2).to_dict('records')

    verified = []
    for group in ('R-held', 'L-held', 'L-blown'):
        hand = group[0]
        for c in short[group][:SHORT if group != 'L-blown' else 2]:
            last = unicodedata.normalize('NFKD', c['name'].split(',')[0]).encode('ascii', 'ignore').decode()
            sid = f'rs-{last.lower().replace(" ", "")}-{c["date"]}'
            log(f'== {sid} swing {c["swing"]} LI9 {c["li9"]}')
            try:
                df_g, _ = savant.fetch(savant.search_url(game_pk=c['gamePk']), f'savant-game-{c["gamePk"]}.csv')
                df_g = df_g.sort_values(['at_bat_number', 'pitch_number']).reset_index(drop=True)
                mine = df_g[(df_g['pitcher'] == c['pitcher']) & (df_g['inning'] == 9)]
                games = statsapi.schedule(c['date'], 'R')
                game = next(gg for gg in games if gg['gamePk'] == c['gamePk'])
                out = vs.build_real({'id': sid, 'plan': f'regular season {group}', 'date': c['date']},
                                    game, df_g, mine, savant.search_url(game_pk=c['gamePk']), [])
                out['search'] = c
                try:
                    wp = statsapi.win_probability(c['gamePk'])
                    first_ab = out['plateAppearances'][0]['atBat'] - 1
                    hit = next((p for p in wp if isinstance(p, dict) and p.get('atBatIndex') == first_ab), None) \
                        if isinstance(wp, list) else None
                    # only the leverage: the probabilities on this record are after the play
                    out['mlbWinProbabilityAtEntry'] = {k: v for k, v in (hit or {}).items()
                                                       if k in ('leverageIndex', 'atBatIndex')}
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
