"""Build the daily packs (everything but the hold table and the closer pool,
which pool.js adds in node with the engine itself).

  python3 build_packs.py                 all ten (scenarios/scenarios.json)
  python3 build_packs.py std-2016-ws7-chapman

Writes cache/stage/<id>.json (the pack before pool.js) and prints a summary.
The facts of each spot come from data/verify/<verify>.json, built by
verify_scenarios.py from Savant, the Stats API and Retrosheet; the model from
the library (model.py). Nothing in a pack is typed in by hand except the
proxy arsenal settings scenarios.json names and flags.
"""

import json
import os
import sys
from collections import defaultdict

import numpy as np
import pandas as pd

import advance
import model as M
import prep
import retro
import savant
import statsapi
from common import CACHE, GAME, VERIFY, log, read_json, write_json

STAGE = os.path.join(CACHE, 'stage')
ADV_PATH = os.path.join(CACHE, 'advance.json')
ADV_YEARS = list(range(2015, 2026))
PROXY_WINDOW = [2021, 2022, 2023, 2024, 2025]
MIN_USAGE = 0.03
COLS = ['game_pk', 'at_bat_number', 'pitch_number', 'game_year', 'game_type', 'pitcher', 'batter', 'stand',
        'p_throws', 'pitch_type', 'release_speed', 'plate_x', 'plate_z', 'sz_top', 'sz_bot', 'balls', 'strikes',
        'description', 'events', 'bb_type', 'launch_speed', 'launch_angle', 'hc_x', 'hc_y',
        'estimated_woba_using_speedangle', 'pfx_x', 'pfx_z']
KEEP_PREP = ['game_pk', 'at_bat_number', 'pitch_number', 'game_year', 'game_type', 'pitcher', 'batter', 'stand',
             'p_throws', 'pitch_type', 'release_speed', 'plate_x', 'sz_top', 'sz_bot', 'zn', 'cell', 'bucket', 'key',
             'ki', 'family', 'res', 'bb', 'launch_speed', 'launch_angle', 'spray', 'damage', 'swing', 'events',
             'balls', 'strikes']

TEAM_COLORS = {
    'Los Angeles Dodgers': ['#005a9c', '#ffffff'], 'Texas Rangers': ['#003278', '#c0111f'],
    'New York Mets': ['#002d72', '#ff5910'], 'Oakland Athletics': ['#003831', '#efb21e'],
    'Chicago Cubs': ['#0e3386', '#cc3433'], 'Milwaukee Brewers': ['#12284b', '#ffc52f'],
    'Houston Astros': ['#002d62', '#eb6e1f'], 'New York Yankees': ['#0c2340', '#c4ced3'],
}
RETRO_TEAM = {'OAK': 'Oakland Athletics', 'NYA': 'New York Yankees', 'LAN': 'Los Angeles Dodgers',
              'ARI': 'Arizona Diamondbacks'}

_SEASONS = {}


def season(y):
    """One season of the library, prepped and cut to what the model reads. Kept
    in memory for the run."""
    if y not in _SEASONS:
        log(f'  loading {y}')
        df = prep.load([y], cols=COLS)
        p = prep.prep(df)
        p = p[p['pitch_type'].isin(prep.PITCH_TYPES)]
        _SEASONS[y] = p[KEEP_PREP].reset_index(drop=True)
    return _SEASONS[y]


def seasons(years):
    return pd.concat([season(y) for y in years], ignore_index=True)


def advance_table():
    if os.path.exists(ADV_PATH):
        return read_json(ADV_PATH)
    t, filled = advance.build(ADV_YEARS, lambda y: prep.load([y], cols=advance.COLS))
    log(f'  advancement table: {filled} states by rule')
    write_json(ADV_PATH, t)
    return t


# ---- the batters ---------------------------------------------------------------

def order_real(v):
    """The batting team's PA sequence for the game, from the spot's first batter,
    nine long (or as many as he faced): actual batters while the game had them,
    then the previous time through."""
    df, _ = savant.fetch(savant.search_url(game_pk=v['gamePk']), f'savant-game-{v["gamePk"]}.csv')
    df = df.sort_values(['at_bat_number', 'pitch_number'])
    half = 'Bot' if v['situation']['half'] == 'bottom' else 'Top'
    pas = df[df['inning_topbot'] == half].groupby('at_bat_number', sort=True).head(1)
    seq = [int(b) for b in pas['batter']]
    abs_ = [int(a) for a in pas['at_bat_number']]
    i = abs_.index(v['plateAppearances'][0]['atBat'])
    return extend(seq, i, max(9, v['realFaced']))


def extend(seq, i, n):
    out = []
    for j in range(i, i + n):
        if j < len(seq):
            out.append(seq[j])
        else:
            out.append(out[len(out) - 9] if len(out) >= 9 else seq[j - 9])
    return out


def order_proxy(spec_v):
    cand = next(c for c in read_json(os.path.join(os.path.dirname(__file__), 'candidates.json'))['proxy']
                if c['id'] == spec_v['id'])
    plays = list(retro.replay(retro.game_lines(cand['season'], cand['file'], cand['game'])))
    team = 1 if spec_v['situation']['half'] == 'bottom' else 0
    seq = []
    for p in plays:
        if p['before']['team'] == team and p['paOver']:
            seq.append(p['batter'])
    first = spec_v['plateAppearances'][0]['batterId']
    inning = spec_v['situation']['inning']
    # the index of the spot's first PA: the first of his PAs in that inning
    idx, k = None, 0
    for p in plays:
        if p['before']['team'] == team and p['paOver']:
            if p['batter'] == first and p['before']['inning'] == inning and idx is None:
                idx = k
            k += 1
    return extend(seq, idx, max(9, spec_v['realFaced'])), cand


def parse_line(line):
    return line


# ---- one scenario ------------------------------------------------------------

def arsenal_real(v, which):
    a = v['arsenal'][which]
    types = [t for t in a['types'] if t['type'] in prep.PITCH_TYPES and t['usage'] >= MIN_USAGE]
    tot = sum(t['usage'] for t in types)
    return [{'type': t['type'], 'usage': t['usage'] / tot, 'velo': t['velo'], 'pfxX': t['pfxXin'],
             'pfxZ': t['pfxZin']} for t in types], a['source']


def build_one(spec, adv):
    v = read_json(os.path.join(VERIFY, spec['verify'] + '.json'))
    proxy = v['resolution'] == 'proxy'
    sit = v['situation']
    if proxy:
        year = int(v['date'][:4])
        hand = v['pitcher']['throws']
        window = PROXY_WINDOW
        bat_window = []
    else:
        year = int(v['date'][:4])
        hand = v['pitcher']['throws']
        window = [y for y in (year - 1, year, year + 1) if 2008 <= y <= 2025]
        bat_window = [y for y in (year - 1, year) if y >= 2008]
    log(f'== {spec["id"]} ({hand}HP, window {window})')

    # arsenal
    sources = list(v['sources'])
    if spec['arsenal'] == 'proxy':
        pa = spec['proxyArsenal']
        if 'pitches' in pa:
            ars = [dict(p) for p in pa['pitches']]
            ars_src = 'public reporting (see scenarios.json); velocity and usage are the proxy settings'
            sources += pa['sources']
        else:
            vv = verify_like_arsenal(pa['pitcherId'], pa['fromSeason'])
            ars = vv
            ars_src = f'Baseball Savant {pa["pitcherId"]} {pa["fromSeason"]} season (his first tracked season)'
            sources.append(ars_src)
    else:
        ars, ars_src = arsenal_real(v, spec['arsenal'])
        sources.append(f'arsenal: {spec["arsenal"]} {year} mix from {ars_src}')

    lg = seasons(window)
    lg = lg[lg['p_throws'] == hand]
    zone_ft = round(float((lg['sz_top'] - lg['sz_bot']).mean()), 3)

    # command, from his own season (real) or the proxy's
    for a in ars:
        league_sp = M.league_spreads(lg, a['type'])
        if spec['arsenal'] == 'proxy' and 'pitches' in spec['proxyArsenal']:
            cmd = spec['proxyArsenal']['command']
            mu, sd = league_sp.mean(), league_sp.std()
            his = mu - (cmd - 50) / 10 * sd
            a['command'], a['sigmaFt'] = cmd, round(M.BASE_SIGMA_FT * his / mu, 3)
        else:
            pid = v['pitcher'].get('id') or spec['proxyArsenal']['pitcherId']
            sy = year if not proxy else spec['proxyArsenal']['fromSeason']
            mine = season(sy)
            mine = mine[(mine['pitcher'] == pid) & (mine['pitch_type'] == a['type'])]
            a['command'], a['sigmaFt'] = M.command_of(M.spread(mine), league_sp)
        a['name'] = prep.NAME[a['type']]
        a['shape'] = SHAPE[a['type']]
        a['usage'] = round(a['usage'], 4)
    ars = [{k: a[k] for k in ('type', 'name', 'usage', 'velo', 'pfxX', 'pfxZ', 'shape', 'command', 'sigmaFt')} for a in ars]
    fix = round(1 - sum(a['usage'] for a in ars), 4)
    ars[0]['usage'] = round(ars[0]['usage'] + fix, 4)

    # batters
    if proxy:
        order, cand = order_proxy(v)
        ids_retro = order
        mlb = retro.retro_to_mlbam(set(order))
        ros = retro.rosters(cand['season'], [cand['game'][:3], v['game'].split(' at ')[0]])
        batters_meta = []
        for rid in order:
            r = ros.get(rid, {})
            bats = r.get('bats')
            if bats == 'B':
                bats = 'L' if hand == 'R' else 'R'
            batters_meta.append({'retro': rid, 'mlbam': mlb.get(rid), 'bats': bats})
        ppl = statsapi.people([b['mlbam'] for b in batters_meta if b['mlbam']], season=year)
    else:
        order = order_real(v)
        ppl = statsapi.people(order, season=year)
        stands = {}
        g, _ = savant.fetch(savant.search_url(game_pk=v['gamePk']), f'savant-game-{v["gamePk"]}.csv')
        for pa in v['plateAppearances']:
            stands[pa['batterId']] = pa['bats']
        batters_meta = []
        bw = seasons(bat_window)
        for bid in order:
            p = ppl.get(bid, {})
            side = (p.get('batSide') or {}).get('code')
            if bid in stands:
                bats = stands[bid]
            elif side == 'S':
                bats = 'L' if hand == 'R' else 'R'
            else:
                mine = bw[bw['batter'] == bid]
                bats = mine['stand'].mode().iloc[0] if len(mine) else (side or 'R')
            batters_meta.append({'mlbam': bid, 'bats': bats})

    # the league pieces, per pitch type and batter side
    by_type = {}
    for a in ars:
        t = lg[lg['pitch_type'] == a['type']]
        stuff = t[(t['release_speed'] - a['velo']).abs() <= M.VELO_BAND]
        by_type[a['type']] = {s: {'type': M.count_cells(t[t['stand'] == s]),
                                  'stuff': M.count_cells(stuff[stuff['stand'] == s]),
                                  'pool': t[(t['stand'] == s) & ((t['release_speed'] - a['velo']).abs() <= M.VELO_EX)],
                                  'n_stuff': int((stuff['stand'] == s).sum())}
                              for s in ('L', 'R')}
    fam_groups = {s: M.count_groups(lg[lg['stand'] == s]) for s in ('L', 'R')}

    # similar batters
    if proxy:
        lines = M.season_lines(seasons(PROXY_WINDOW))
        lines = lines[lines['pa'] >= 300]
    else:
        bw_all = seasons(bat_window)
        feats = M.batter_features(bw_all)
        feats = feats[feats['n'] >= 500]

    pitches, pidx = [], {}

    def add_pitch(r):
        row = M.pitch_row(r)
        if row[0] not in pidx:
            pidx[row[0]] = len(pitches)
            pitches.append(row)
        return pidx[row[0]]

    library, batters, tiers_used = [], [], defaultdict(int)
    for bi, meta in enumerate(batters_meta):
        s = meta['bats']
        if proxy:
            p = ppl.get(meta['mlbam'], {}) if meta['mlbam'] else {}
            st = season_stat(p)
            if st:
                row = {'avg': st['avg'], 'obp': st['obp'], 'slg': st['slg'], 'hr_pa': st['hr'] / max(1, st['pa'])}
                nb = M.nearest(lines, row, cols=M.LINE_FEATS)
            else:
                nb = []
            mine = lg.iloc[0:0]
            n_mine = 0
        else:
            bid = meta['mlbam']
            allb = bw_all[bw_all['batter'] == bid]
            mine = allb[allb['p_throws'] == hand]
            n_mine = len(mine)
            if bid in feats.index:
                nb = M.nearest(feats, feats.loc[bid], exclude=bid)
            elif len(allb) >= 100:
                nb = M.nearest(feats, M.batter_features(allb).iloc[0])
            else:
                nb = []
        sim_rows = (seasons(PROXY_WINDOW) if proxy else bw_all)
        sim_rows = sim_rows[sim_rows['batter'].isin(nb) & (sim_rows['p_throws'] == hand)] if nb else lg.iloc[0:0]
        B = M.count_groups(mine)
        S = M.count_groups(sim_rows)
        lib = {}
        for a in ars:
            t = a['type']
            L = by_type[t][s]
            prob = M.outcome_table(L['stuff'], L['type'], fam_groups[s], B, S, t)
            pools = [(0, mine[mine['pitch_type'] == t]), (1, sim_rows[sim_rows['pitch_type'] == t]), (2, L['pool'])]
            pm = np.zeros((25, 4, M.NK), dtype=int)
            xs = []
            for cell in range(25):
                xcell = [-1] * M.NK
                tried = set()
                # Until stable: every key with a chance in any bucket needs a
                # real pitch; a key with none loses its chance to the others,
                # and the per mille rounding is redone (which can lift another
                # tiny key off zero, so it goes round again).
                while True:
                    for b in range(4):
                        if prob[cell, b].sum() <= 0:
                            raise RuntimeError(f'empty outcome row {spec["id"]} batter {bi} {t} cell {cell}')
                        pm[cell, b] = M.permille(prob[cell, b])
                    todo = [k for k in range(M.NK) if pm[cell, :, k].any() and xcell[k] < 0 and k not in tried]
                    if not todo:
                        break
                    for k in todo:
                        tried.add(k)
                        r, tier = M.pick_exemplar(pools, bi, t, cell, prep.KEYS[k], a['velo'])
                        if r is None:
                            prob[cell, :, k] = 0
                            continue
                        xcell[k] = add_pitch(r) * 3 + tier
                        tiers_used[tier] += 1
                for k in range(M.NK):
                    if pm[cell, :, k].any() and xcell[k] < 0:
                        prob[cell, :, k] = 0
                        for b in range(4):
                            pm[cell, b] = M.permille(prob[cell, b])
                    if not pm[cell, :, k].any():
                        xcell[k] = -1
                xs.append(xcell)
            lib[t] = {'p': pm.tolist(), 'x': xs}
        library.append(lib)
        batters.append(batter_record(meta, ppl, mine, sim_rows, lg, ars, s, n_mine, nb, proxy, year, hand))

    reveal = reveal_of(v)
    us_team = v['pitcher'].get('team') or RETRO_TEAM.get(v['game'].split(' at ')[0 if not sit['usHome'] else 1])
    sc = {
        'id': spec['id'], 'day': None, 'number': None, 'title': spec['title'],
        'setup': setup_of(v, spec, us_team, batters),
        'pitcher': {'name': v['pitcher']['name'], 'team': us_team, 'teamColors': TEAM_COLORS.get(us_team, ['#334155', '#e2e8f0']),
                    'year': year, 'throws': hand, 'arsenal': ars},
        'situation': {k: sit[k] for k in ('inning', 'half', 'outs', 'bases', 'score', 'usHome', 'walkOffLive')},
        'batters': batters,
        'realFaced': v['realFaced'],
        'resolution': 'proxy' if proxy else 'real',
        'sources': sources,
    }
    pack = {'v': 1, 'keys': prep.KEYS, 'scenario': sc, 'kernelZoneFt': zone_ft, 'pitches': pitches,
            'library': library, 'advance': adv, 'reveal': reveal,
            'build': {'window': window, 'batterWindow': bat_window, 'tiers': dict(tiers_used),
                      'leaguePitches': int(len(lg)), 'arsenalSource': ars_src}}
    return pack


SHAPE = {'FF': 'ride', 'SI': 'run', 'FC': 'cut', 'SL': 'slide', 'ST': 'sweep', 'SV': 'sweep', 'CU': 'drop',
         'KC': 'drop', 'CH': 'fade', 'FS': 'split', 'FO': 'split', 'KN': 'float'}


def verify_like_arsenal(pid, year):
    import verify_scenarios as vs
    a = vs.arsenal(pid, year, savant.GT_REGULAR, 'R')
    types = [t for t in a['types'] if t['type'] in prep.PITCH_TYPES and t['usage'] >= MIN_USAGE]
    tot = sum(t['usage'] for t in types)
    return [{'type': t['type'], 'usage': t['usage'] / tot, 'velo': t['velo'], 'pfxX': t['pfxXin'], 'pfxZ': t['pfxZin']}
            for t in types]


def season_stat(person):
    for s in person.get('stats', []) or []:
        if s.get('group', {}).get('displayName') != 'hitting':
            continue
        best = None
        for sp in s.get('splits', []):
            if best is None or 'team' not in sp:
                best = sp
        if best:
            st = best['stat']
            try:
                return {'avg': float(st['avg']), 'obp': float(st['obp']), 'slg': float(st['slg']),
                        'hr': int(st['homeRuns']), 'pa': int(st['plateAppearances'])}
            except (KeyError, ValueError):
                return None
    return None


# ---- the batter record and his profile --------------------------------------

def rate(num, den, prior, k):
    return float((num + k * prior) / (den + k))


def batter_record(meta, ppl, mine, sim, lg, ars, stand, n_mine, nb, proxy, year, hand):
    p = ppl.get(meta.get('mlbam'), {}) if meta.get('mlbam') else {}
    name = p.get('fullName') or meta.get('retro')
    line = statsapi.season_line(p, 'hitting') if p else None
    tier = 'batter' if n_mine >= M.MIN_BATTER_PITCHES else ('similar' if nb else 'league')
    base = mine if tier == 'batter' else sim
    L = lg[lg['stand'] == stand]
    z_l = prep.in_zone(L['cell'].values)
    lg_chase = float(L[~z_l]['swing'].mean())
    lg_zs = float(L[z_l]['swing'].mean())
    z_b = prep.in_zone(base['cell'].values) if len(base) else np.array([], dtype=bool)
    chase = rate(base[~z_b]['swing'].sum() if len(base) else 0, (~z_b).sum(), lg_chase, 50)
    zswing = rate(base[z_b]['swing'].sum() if len(base) else 0, z_b.sum(), lg_zs, 50)
    whiff = {}
    for a in ars:
        t = a['type']
        lsw = L[(L['pitch_type'] == t) & L['swing']]
        lw = float((lsw['key'] == 'swinging_strike').mean()) if len(lsw) else 0.25
        bsw = base[(base['pitch_type'] == t) & base['swing']] if len(base) else base
        whiff[t] = round(rate((bsw['key'] == 'swinging_strike').sum() if len(bsw) else 0, len(bsw), lw, 30), 3)
    heat, swing = [], []
    for c in range(25):
        lc = L[L['cell'] == c]
        ldm = lc['damage'].dropna()
        l_d = float(ldm.mean()) if len(ldm) else 0.3
        l_s = float(lc['swing'].mean()) if len(lc) else 0.4
        bc = base[base['cell'] == c] if len(base) else base
        bdm = bc['damage'].dropna() if len(bc) else bc
        heat.append(round(rate(bdm.sum() if len(bdm) else 0, len(bdm), l_d, 8), 3))
        swing.append(round(rate(bc['swing'].sum() if len(bc) else 0, len(bc), l_s, 15), 3))
    notes, notes_for = notes_of(base, L, ars, stand, tier, proxy, line, year)
    szt = float(mine['sz_top'].mean()) if n_mine else float(L['sz_top'].mean())
    szb = float(mine['sz_bot'].mean()) if n_mine else float(L['sz_bot'].mean())
    bid = f'retro:{meta["retro"]}' if proxy else str(meta['mlbam'])
    return {'id': bid, 'name': name, 'bats': meta['bats'], 'line': line or '', 'szTop': round(szt, 2),
            'szBot': round(szb, 2), 'profileTier': tier,
            'profile': {'chase': round(chase, 3), 'zoneSwing': round(zswing, 3), 'whiff': whiff, 'heat': heat,
                        'swing': swing, 'notes': notes, 'notesFor': notes_for}}


CHASE_DOWN_AWAY = {'R': [23, 24, 19], 'L': [21, 20, 15]}     # catcher's view: away from a righty is col 4
CHASE_DOWN = [20, 21, 22, 23, 24]
CHASE_UP = [0, 1, 2, 3, 4]
INSIDE = {'R': [6, 11, 16], 'L': [8, 13, 18]}
AWAY = {'R': [8, 13, 18], 'L': [6, 11, 16]}


def notes_of(base, L, ars, stand, tier, proxy, line, year):
    """Short facts the grade reason can quote, each with its number from the
    data, and (notesFor) the pitch and cells it is about. Proxy batters get no
    pitch notes: their profile is other batters'."""
    notes, nf = [], []
    if proxy or tier != 'batter' or not len(base):
        if line:
            notes.append(f'hit {line.split(",")[0]} in {year}')
        return notes, nf
    cand = []
    two = base[base['bucket'] == 3]
    for a in ars:
        t = a['type']
        nm = prep.NAME[t]
        for cells, where in ((CHASE_DOWN_AWAY[stand], 'down and away'), (CHASE_DOWN, 'in the dirt'), (CHASE_UP, 'up out of the zone')):
            d = two[(two['pitch_type'] == t) & two['cell'].isin(cells)]
            ld = L[(L['bucket'] == 3) & (L['pitch_type'] == t) & L['cell'].isin(cells)]
            if len(d) >= 15 and len(ld) >= 100:
                r, lr = d['swing'].mean(), ld['swing'].mean()
                if r <= lr:
                    continue                 # a chase note is only worth quoting when he chases more
                cand.append((abs(r - lr), r > lr, {'text': f'chases {nm}s {where} {round(r * 100)}% with two strikes',
                                                   'type': t, 'cells': list(cells)}))
        sw = base[(base['pitch_type'] == t) & base['swing']]
        lsw = L[(L['pitch_type'] == t) & L['swing']]
        if len(sw) >= 40:
            w, lw = (sw['key'] == 'swinging_strike').mean(), (lsw['key'] == 'swinging_strike').mean()
            cand.append((abs(w - lw), w > lw, {'text': f'whiffs on {round(w * 100)}% of his swings at {nm}s', 'type': t,
                                               'cells': list(range(25))}))
        for cells, where in ((INSIDE[stand], 'inside'), (AWAY[stand], 'away'), ([7, 12, 17], 'over the middle')):
            ip = base[(base['pitch_type'] == t) & base['cell'].isin(cells) & base['damage'].notna()]
            lip = L[(L['pitch_type'] == t) & L['cell'].isin(cells) & L['damage'].notna()]
            if len(ip) >= 20 and len(lip) >= 200:
                dmg, ldm = ip['damage'].mean(), lip['damage'].mean()
                txt = f'{"%.3f" % dmg}'.lstrip('0')
                cand.append((abs(dmg - ldm) * 0.6, dmg > ldm,
                             {'text': f'{txt} xwoba on contact against {nm}s {where}', 'type': t, 'cells': list(cells)}))
    cand.sort(key=lambda c: -c[0])
    for _, _, n in cand[:4]:
        notes.append(n['text'])
        nf.append(n)
    if not notes and line:
        notes.append(f'hit {line.split(",")[0]} in {year}')
    return notes, nf


# ---- copy built from the facts --------------------------------------------------

ORD = {1: '1st', 2: '2nd', 3: '3rd'}
BASE_WORDS = {0: 'nobody on', 1: 'a man on first', 2: 'a man on second', 3: 'men on first and second',
              4: 'a man on third', 5: 'men on first and third', 6: 'men on second and third', 7: 'bases loaded'}
OUT_WORDS = {0: 'nobody out', 1: 'one out', 2: 'two out'}


def inning_words(n):
    return {1: '1st', 2: '2nd', 3: '3rd'}.get(n, f'{n}th')


def setup_of(v, spec, us_team, batters):
    """One paragraph, house voice, every fact from the verify file."""
    s = v['situation']
    nick = us_team.split(' ')[-1].lower() if us_team else 'you'
    nick = {'sox': 'red sox'}.get(nick, nick)
    title = spec['title'].lower()
    first = batters[0]['name']
    lead = s['score']['us'] - s['score']['them']
    lines = [f'{title}.', f'{s["half"]} of the {inning_words(s["inning"])}.',
             f'the {nick} lead {s["score"]["us"]}-{s["score"]["them"]}.',
             f'{OUT_WORDS[s["outs"]]}, {BASE_WORDS[s["bases"]]}.', f'{first} is up.']
    lines.append('three outs and the door is shut.' if s['outs'] == 0 else
                 f'{3 - s["outs"]} {"out" if s["outs"] == 2 else "outs"} and the door is shut.')
    if lead == 1 and s['walkOffLive']:
        lines.append('two runs and it is over.')
    return ' '.join(lines)


EVENT_SHORT = {'strikeout': 'struck out', 'walk': 'walked', 'single': 'singled', 'double': 'doubled',
               'triple': 'tripled', 'home_run': 'homered', 'hit_by_pitch': 'hit by a pitch',
               'grounded_into_double_play': 'grounded into a double play', 'field_out': 'out',
               'force_out': 'out on a force', 'sac_bunt': 'sacrifice bunt', 'sac_fly': 'sac fly',
               'fielders_choice': "fielder's choice", 'fielders_choice_out': "fielder's choice",
               'field_error': 'reached on an error', 'double_play': 'double play', 'intent_walk': 'walked'}
RETRO_SHORT = [('HR', 'homered'), ('HP', 'hit by a pitch'), ('IW', 'walked'), ('W', 'walked'), ('K', 'struck out'),
               ('S', 'singled'), ('D', 'doubled'), ('T', 'tripled'), ('FC', "fielder's choice"), ('E', 'reached on an error')]


def retro_short(ev):
    for code, word in RETRO_SHORT:
        if ev.startswith(code) and not (code == 'S' and ev.startswith('SB')):
            if code == 'D' and ev.startswith('DI'):
                continue
            return word
    if 'GDP' in ev or 'DP' in ev.split('/')[1:2]:
        return 'grounded into a double play'
    if '/BG' in ev or '/BP' in ev or 'BG' in ev:
        return 'bunted'
    return 'out'


def reveal_of(v):
    pas = [p for p in v['plateAppearances'] if p.get('inSpot')]
    items = []
    for p in pas:
        name = p.get('name') or p.get('fullName') or ''
        if v['resolution'] == 'real':
            res = EVENT_SHORT.get(p.get('event') or '', (p.get('event') or 'out').replace('_', ' '))
        else:
            res = retro_short(p.get('event') or '')
        items.append({'batter': name, 'result': res, 'pitches': p.get('pitches')})
    r = v['real']
    rv = {'outcome': r['outcome'], 'pitches': r['pitches'], 'runs': r['runs'],
          'summary': summary_of(items), 'plateAppearances': items}
    if r['pitches'] is None:
        rv['pitchesNote'] = f'at least {r.get("pitchesKnown")} pitches'
    return rv


def summary_of(items):
    parts = []
    for it in items:
        # the surname with its particles (De La Cruz), without the suffix (Jr.)
        parts_n = (it['batter'] or 'he').split(' ')
        rest = [w for w in parts_n[1:] if w not in ('Jr.', 'Sr.', 'II', 'III')] or parts_n[-1:]
        last = ' '.join(rest)
        res = it['result']
        if res == 'struck out':
            parts.append(f'struck out {last}')
        elif res == 'walked':
            parts.append(f'walked {last}')
        elif res == 'hit by a pitch':
            parts.append(f'hit {last} with a pitch')
        elif res == 'out':
            parts.append(f'got {last}')
        else:
            parts.append(f'{last} {res}')
    if len(parts) > 1:
        return ', '.join(parts[:-1]) + ', then ' + parts[-1]
    return parts[0] if parts else ''


def main(argv):
    os.makedirs(STAGE, exist_ok=True)
    spec = read_json(os.path.join(GAME, 'scenarios', 'scenarios.json'))['scenarios']
    only = set(a for a in argv[1:] if not a.startswith('-'))
    adv = advance_table()
    for s in spec:
        if only and s['id'] not in only:
            continue
        pack = build_one(s, adv)
        path = os.path.join(STAGE, s['id'] + '.json')
        with open(path, 'w') as fh:
            json.dump(pack, fh, separators=(',', ':'))
        log(f'   staged {path}: {os.path.getsize(path) / 1e6:.2f} MB, {len(pack["pitches"])} pitches, tiers {pack["build"]["tiers"]}')


if __name__ == '__main__':
    main(sys.argv)
