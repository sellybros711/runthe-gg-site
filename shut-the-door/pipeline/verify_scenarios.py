"""Verify the candidate scenarios in candidates.json from the data.

For each spot: date, game, inning and half, outs, runners, score, home or away,
the batters faced in order with their side, the pitcher's arsenal that season
(usage, velo, movement), and what actually happened (pitch count, runs, the
outcome under the contract's end rules). Writes data/verify/<id>.json.

Real spots (2008 on): Savant pitch-by-pitch for the game (by game_pk) and the
pitcher's season; the Stats API for the game_pk, names, season lines, the
play descriptions and the batting order. Proxy spots: Retrosheet event files.

Nothing is written for a spot that cannot be found. A spot is reported, with
the reason, rather than guessed.
"""

import json
import os
import subprocess
import sys

import pandas as pd

import retro
import savant
import statsapi
from common import GAME, HERE, VERIFY, ensure_dirs, log, read_json, write_json

# The contract's pitch types (contract.js PITCH_TYPES; read from there, never retyped).
PITCH_TYPES = set(json.loads(subprocess.run(
    ['node', '-e', 'process.stdout.write(JSON.stringify(require(process.argv[1]).PITCH_TYPES))',
     os.path.join(GAME, 'contract.js')], capture_output=True, text=True, check=True).stdout))

OUTCOME_RANK = {'door_shut': 2, 'doors_open': 1, 'walk_off': 0}


def bases_mask(row):
    m = 0
    if pd.notna(row['on_1b']):
        m |= 1
    if pd.notna(row['on_2b']):
        m |= 2
    if pd.notna(row['on_3b']):
        m |= 4
    return m


def judge(lead, pas, walk_off_live, start_outs):
    """The contract's end rules over a list of plate appearances, each with
    'runs' and 'outs'. Marks which PAs fall inside the spot."""
    runs = 0
    outs = start_outs
    outcome = None
    for pa in pas:
        pa['inSpot'] = outcome is None
        if outcome is not None:
            continue
        runs += pa['runs']
        outs += pa['outs']
        if runs >= lead:
            outcome = 'walk_off' if (runs > lead and walk_off_live) else 'doors_open'
        elif outs >= 3:
            outcome = 'door_shut'
    return outcome, runs


def arsenal(pitcher_id, season, game_types, tag):
    url = savant.search_url(pitcher=pitcher_id, season=season, game_types=game_types)
    df, _ = savant.fetch(url, f'savant-arsenal-{pitcher_id}-{season}-{tag}.csv')
    df = df[df['pitch_type'].notna()]
    # Only the contract's pitch types: IN (intentional ball), PO (pitchout), FA,
    # EP and the like are not pitches a closer chooses. Dropped and counted.
    dropped = df[~df['pitch_type'].isin(PITCH_TYPES)]['pitch_type'].value_counts().to_dict()
    df = df[df['pitch_type'].isin(PITCH_TYPES)]
    n = len(df)
    out = []
    if not n:
        return {'pitches': 0, 'types': [], 'dropped': dropped}
    for pt, g in df.groupby('pitch_type'):
        out.append({
            'type': pt,
            'name': str(g['pitch_name'].mode().iloc[0]) if g['pitch_name'].notna().any() else None,
            'n': int(len(g)),
            'usage': round(len(g) / n, 4),
            'velo': round(float(g['release_speed'].mean()), 1) if g['release_speed'].notna().any() else None,
            'pfxXin': round(float(g['pfx_x'].mean()) * 12, 1) if g['pfx_x'].notna().any() else None,
            'pfxZin': round(float(g['pfx_z'].mean()) * 12, 1) if g['pfx_z'].notna().any() else None,
        })
    out.sort(key=lambda r: -r['usage'])
    return {'pitches': n, 'types': out, 'dropped': dropped, 'source': url}


def verify_real(spec):
    games = statsapi.schedule(spec['date'], spec.get('gameType'))
    if not games:
        return {'id': spec['id'], 'error': f'no {spec.get("gameType")} game on {spec["date"]} in the Stats API schedule'}
    for g in games:
        pk = g['gamePk']
        url = savant.search_url(game_pk=pk)
        df, missing = savant.fetch(url, f'savant-game-{pk}.csv')
        if not len(df):
            continue
        df = df.sort_values(['at_bat_number', 'pitch_number']).reset_index(drop=True)
        # In a game_pk search player_name is the BATTER, so the pitcher is found
        # by id: the Stats API's players for the game, matched on the name.
        players = statsapi.feed(pk).get('gameData', {}).get('players', {})
        ids = {int(p['id']) for p in players.values()
               if spec['pitcher'].lower() in (p.get('fullName') or '').lower()}
        mine = df[df['pitcher'].isin(ids)]
        if spec.get('inning'):
            mine = mine[mine['inning'] == spec['inning']]
        if not len(mine):
            continue
        return build_real(spec, g, df, mine, url, missing)
    return {'id': spec['id'], 'error': f'no pitch by {spec["pitcher"]} in the {len(games)} game(s) on {spec["date"]}'}


def build_real(spec, game, df, mine, savant_url, missing):
    pk = game['gamePk']
    start_i = mine.index[0]
    s = df.loc[start_i]
    pid = int(s['pitcher'])
    half = s['inning_topbot']
    inning = int(s['inning'])
    half_rows = df[(df['inning'] == inning) & (df['inning_topbot'] == half)]
    spot_rows = half_rows[half_rows.index >= start_i]
    us_home = half == 'Top'
    lead = int(s['fld_score'] - s['bat_score'])
    walk_off_live = (half == 'Bot') and inning >= 9

    feed = None
    try:
        feed = statsapi.feed(pk)
    except Exception as e:
        log('  feed failed:', e)
    feed_plays = {}
    if feed:
        for p in feed.get('liveData', {}).get('plays', {}).get('allPlays', []):
            feed_plays[p['about']['atBatIndex'] + 1] = p

    abs_ = list(dict.fromkeys(spot_rows['at_bat_number'].tolist()))
    pas = []
    for k, ab in enumerate(abs_):
        r = df[df['at_bat_number'] == ab]
        first, last = r.iloc[0], r.iloc[-1]
        # outs made: the next PA's outs in this half, or what the half's end implies
        nxt = half_rows[half_rows['at_bat_number'] > ab]
        runs = int((last['post_bat_score'] if pd.notna(last['post_bat_score']) else last['bat_score']) - first['bat_score'])
        if len(nxt):
            outs = int(nxt.iloc[0]['outs_when_up'] - first['outs_when_up'])
        else:
            later = df[df['at_bat_number'] > ab]
            ended_game = not len(later)
            walked_off = ended_game and half == 'Bot' and (last['post_bat_score'] > last['post_fld_score'])
            outs = 0 if walked_off else int(3 - first['outs_when_up'])
        fp = feed_plays.get(ab)
        pas.append({
            'atBat': int(ab),
            'batterId': int(first['batter']),
            'bats': first['stand'],
            'countAtEntry': f"{int(s['balls'])}-{int(s['strikes'])}" if (k == 0 and int(r.index[0]) < start_i) else None,
            'pitchesBy': {str(int(p)): int((r['pitcher'] == p).sum()) for p in r['pitcher'].unique()},
            'pitches': int((r['pitcher'] == pid).sum()),
            'event': last['events'] if pd.notna(last['events']) else None,
            'des': last['des'] if pd.notna(last['des']) else None,
            'feedEvent': fp['result'].get('eventType') if fp else None,
            'feedDescription': fp['result'].get('description') if fp else None,
            'runs': runs,
            'outs': outs,
        })
    # a mid-PA entry: the first PA's pitches by the earlier pitcher
    first_ab_rows = df[df['at_bat_number'] == abs_[0]]
    entered_mid_pa = bool((first_ab_rows.index < start_i).any())
    if entered_mid_pa:
        pre = df.loc[start_i]
        pas[0]['countAtEntry'] = f"{int(pre['balls'])}-{int(pre['strikes'])}"

    outcome, runs = judge(lead, pas, walk_off_live, int(s['outs_when_up']))
    spot = [p for p in pas if p['inSpot']]
    other_pitchers = sorted({int(p) for pa in spot for p in map(int, pa['pitchesBy']) if p != pid})

    year = int(s['game_year'])
    ids = {pa['batterId'] for pa in pas} | {pid}
    try:
        ppl = statsapi.people(ids, season=year)
    except Exception as e:
        log('  people failed:', e)
        ppl = {}
    for pa in pas:
        p = ppl.get(pa['batterId'], {})
        pa['name'] = p.get('fullName')
        pa['batSideListed'] = (p.get('batSide') or {}).get('code')
        pa['seasonLine'] = statsapi.season_line(p, 'hitting') if p else None

    # the lineup continuing past the spot, from the final box score order
    lineup = None
    if feed:
        side = 'away' if half == 'Top' else 'home'
        order = feed['liveData']['boxscore']['teams'][side].get('battingOrder', [])
        last_b = spot[-1]['batterId'] if spot else None
        if last_b in order:
            i = order.index(last_b)
            lineup = [order[(i + k) % 9] for k in range(1, 10)]
            names = statsapi.people(lineup, season=year)
            lineup = [{'id': b, 'name': names.get(b, {}).get('fullName'),
                       'batSideListed': (names.get(b, {}).get('batSide') or {}).get('code')} for b in lineup]

    pitcher = ppl.get(pid, {})
    teams = game['teams']
    home_name, away_name = teams['home']['team']['name'], teams['away']['team']['name']
    return {
        'id': spec['id'],
        'plan': spec.get('plan'),
        'resolution': 'real',
        'gamePk': pk,
        'date': spec['date'],
        'game': f"{game.get('seriesDescription', '')} Game {game.get('seriesGameNumber', '?')}: {away_name} at {home_name}".strip(),
        'gameType': game.get('gameType'),
        'pitcher': {'id': pid, 'name': pitcher.get('fullName'),
                    'throws': s['p_throws'], 'team': home_name if us_home else away_name,
                    'seasonLine': statsapi.season_line(pitcher, 'pitching') if pitcher else None},
        'situation': {
            'inning': inning, 'half': 'top' if half == 'Top' else 'bottom',
            'outs': int(s['outs_when_up']), 'bases': bases_mask(s),
            'score': {'us': int(s['fld_score']), 'them': int(s['bat_score'])},
            'usHome': us_home, 'walkOffLive': walk_off_live,
            'enteredMidPA': entered_mid_pa,
        },
        'plateAppearances': pas,
        'realFaced': len(spot),
        'real': {
            'outcome': outcome,
            'pitches': sum(pa['pitches'] for pa in spot),
            'runs': runs if outcome != 'door_shut' else sum(pa['runs'] for pa in spot),
            'otherPitchersInSpot': other_pitchers,
        },
        'lineupNext': lineup,
        'arsenal': {
            'regular': arsenal(pid, year, savant.GT_REGULAR, 'R'),
            'postseason': arsenal(pid, year, savant.GT_POST, 'PO'),
        },
        'missingColumns': missing,
        'sources': [
            f'Baseball Savant pitch-by-pitch, game_pk {pk}: {savant_url}',
            f'MLB Stats API schedule {spec["date"]} and live feed /api/v1.1/game/{pk}/feed/live',
            f'MLB Stats API people with {year} season stats',
            f'Baseball Savant {pid} {year} season search (regular season and postseason) for the arsenal',
        ],
    }


def verify_proxy(spec):
    lines = retro.game_lines(spec['season'], spec['file'], spec['game'])
    plays = list(retro.replay(lines))
    info = plays[-1]['info']
    names = plays[-1]['names']
    vis, home = info.get('visteam'), info.get('hometeam')
    ros = retro.rosters(spec['season'], [vis, home])
    ls = retro.line_score(spec['game'])
    final = plays[-1]['score']
    check = None
    if ls:
        check = {'lineScore': ls, 'replay': {'away': final[0], 'home': final[1]},
                 'agrees': ls['awayRuns'] == final[0] and ls['homeRuns'] == final[1]}
    start = next((i for i, p in enumerate(plays)
                  if p['pitcher'] == spec['pitcher'] and (not spec.get('inning') or p['before']['inning'] == spec['inning'])), None)
    if start is None:
        return {'id': spec['id'], 'error': 'pitcher not found in the event file'}
    s = plays[start]
    team = s['before']['team']           # the batting side
    us = 1 - team
    inning = s['before']['inning']
    half = [p for p in plays[start:] if p['before']['inning'] == inning and p['before']['team'] == team]
    p_throws = ros.get(spec['pitcher'], {}).get('throws')
    pas, cur = [], None
    for p in half:
        if cur is None or cur['batterId'] != p['batter'] or cur.get('_over'):
            cur = {'batterId': p['batter'], 'records': [], 'runs': 0, 'outs': 0}
            pas.append(cur)
        cur['records'].append(p['event'])
        cur['runs'] += p['runs']
        cur['outs'] += p['outs']
        cur['seq'] = p['pitches']
        cur['count'] = p['count']
        cur['pitcher'] = p['pitcher']
        if p['paOver']:
            cur['_over'] = True
    for pa in pas:
        pa.pop('_over', None)
        r = ros.get(pa['batterId'], {})
        bats = r.get('bats')
        if bats == 'B' and p_throws:
            bats = 'L' if p_throws == 'R' else 'R'
        pa['name'] = names.get(pa['batterId'])
        pa['bats'] = bats
        pa['batsListed'] = r.get('bats')
        pa['pitches'] = None if ('?' in (pa['count'] or '') and not pa['seq']) else retro.count_pitches(pa['seq'])
        pa['event'] = pa['records'][-1]
    pas = [pa for pa in pas if not all(e == 'NP' for e in pa['records'])]
    # MLBAM ids through the Chadwick register, then names, bat sides and
    # season lines from the Stats API (it carries historical seasons)
    ids = retro.retro_to_mlbam({pa['batterId'] for pa in pas} | {spec['pitcher']})
    try:
        ppl = statsapi.people(ids.values(), season=spec['season'])
    except Exception as e:
        log('  people failed:', e)
        ppl = {}
    for pa in pas:
        p = ppl.get(ids.get(pa['batterId']), {})
        pa['mlbamId'] = ids.get(pa['batterId'])
        pa['fullName'] = p.get('fullName')
        pa['batSideListed'] = (p.get('batSide') or {}).get('code')
        pa['seasonLine'] = statsapi.season_line(p, 'hitting') if p else None
    pp = ppl.get(ids.get(spec['pitcher']), {})
    lead = s['before']['score'][us] - s['before']['score'][team]
    walk_off_live = team == 1 and inning >= 9
    outcome, runs = judge(lead, pas, walk_off_live, s['before']['outs'])
    spot = [pa for pa in pas if pa['inSpot']]
    known = [pa['pitches'] for pa in spot]
    return {
        'id': spec['id'],
        'plan': spec.get('plan'),
        'resolution': 'proxy',
        'retroGame': spec['game'],
        'date': info.get('date'),
        'game': f'{vis} at {home}',
        'pitcher': {'retroId': spec['pitcher'], 'mlbamId': ids.get(spec['pitcher']),
                    'name': pp.get('fullName') or names.get(spec['pitcher']), 'throws': p_throws,
                    'seasonLine': statsapi.season_line(pp, 'pitching') if pp else None},
        'situation': {
            'inning': inning, 'half': 'bottom' if team == 1 else 'top',
            'outs': s['before']['outs'], 'bases': sum({1: 1, 2: 2, 3: 4}[b] for b in s['before']['bases']),
            'score': {'us': s['before']['score'][us], 'them': s['before']['score'][team]},
            'usHome': us == 1, 'walkOffLive': walk_off_live,
        },
        'plateAppearances': pas,
        'realFaced': len(spot),
        'real': {
            'outcome': outcome,
            'pitches': None if None in known else sum(known),
            'pitchesKnown': sum(k for k in known if k is not None),
            'pitchesUnknownPAs': sum(1 for k in known if k is None),
            'runs': runs if outcome != 'door_shut' else sum(pa['runs'] for pa in spot),
        },
        'scoreCheck': check,
        'arsenal': None,
        'sources': [
            f'Retrosheet event file {spec["file"]}, game {spec["game"]} (via github.com/chadwickbureau/retrosheet)',
            f'Retrosheet rosters {vis}{spec["season"]}.ROS and {home}{spec["season"]}.ROS for bat and throw hands',
            f'Retrosheet game log {ls["log"] if ls else "(not found)"} for the line score check',
            'Chadwick Bureau register (github.com/chadwickbureau/register) for Retrosheet to MLBAM ids',
            f'MLB Stats API people with {spec["season"]} season stats for names and season lines',
            'The information used here was obtained free of charge from and is copyrighted by Retrosheet. '
            'Interested parties may contact Retrosheet at www.retrosheet.org.',
        ],
    }


def main(argv):
    ensure_dirs()
    cands = read_json(os.path.join(HERE, 'candidates.json'))
    only = set(argv[1:])
    which = argv[1] if len(argv) > 1 and argv[1] in ('real', 'proxy') else None
    if which:
        only = set()
    bad = 0
    for kind in ('real', 'proxy'):
        if which and which != kind:
            continue
        for spec in cands[kind]:
            if only and spec['id'] not in only:
                continue
            log(f'== {spec["id"]}')
            try:
                out = verify_real(spec) if kind == 'real' else verify_proxy(spec)
            except Exception as e:
                import traceback
                traceback.print_exc()
                out = {'id': spec['id'], 'error': repr(e)}
            if 'error' in out:
                bad += 1
                log('  ERROR', out['error'])
            else:
                r = out['real']
                log(f"  {out['situation']} faced {out['realFaced']} -> {r['outcome']}, {r['pitches']} pitches, {r['runs']} runs")
            write_json(os.path.join(VERIFY, spec['id'] + '.json'), out)
    log(f'{bad} spot(s) could not be verified')


if __name__ == '__main__':
    main(sys.argv)
