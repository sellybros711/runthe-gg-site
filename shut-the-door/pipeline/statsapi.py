"""MLB Stats API: schedules, play-by-play, people and win probability.

Used to identify a game (its game_pk), to name batters and their bat side, to
read the batting order, and for the leverage index the regular-season search
ranks by. Pitch-level facts (type, velo, location) come from Savant.
"""

import json

from common import get

BASE = 'https://statsapi.mlb.com/api'


def _json(path, key):
    return json.loads(get(BASE + path, cache_key='statsapi-' + key + '.json'))


def schedule(day, game_type=None):
    gt = f'&gameType={game_type}' if game_type else ''
    data = _json(f'/v1/schedule?sportId=1&date={day}{gt}', f'schedule-{day}-{game_type or "all"}')
    games = []
    for d in data.get('dates', []):
        games.extend(d.get('games', []))
    return games


def feed(game_pk):
    return _json(f'/v1.1/game/{game_pk}/feed/live', f'feed-{game_pk}')


def win_probability(game_pk):
    try:
        return _json(f'/v1/game/{game_pk}/winProbability', f'wp-{game_pk}')
    except Exception as e:  # not every game has it; the caller says so
        return {'error': repr(e)}


def people(ids, season=None):
    ids = sorted({int(i) for i in ids})
    if not ids:
        return {}
    out = {}
    for k in range(0, len(ids), 50):
        chunk = ids[k:k + 50]
        hyd = f'&hydrate=stats(group=[hitting,pitching],type=[season],season={season})' if season else ''
        data = _json(f'/v1/people?personIds={",".join(map(str, chunk))}{hyd}',
                     f'people-{season}-{chunk[0]}-{chunk[-1]}-{len(chunk)}')
        for p in data.get('people', []):
            out[p['id']] = p
    return out


def season_line(person, group='hitting'):
    """'.287/.371/.515, 31 HR' from a people record hydrated with season stats.
    For a traded player the Stats API gives one split per club plus a total;
    the total (no team) wins."""
    best = None
    for s in person.get('stats', []) or []:
        if s.get('group', {}).get('displayName') != group:
            continue
        for sp in s.get('splits', []):
            if best is None or 'team' not in sp:
                best = sp
    if not best:
        return None
    st = best['stat']
    if group == 'hitting':
        return f"{st.get('avg')}/{st.get('obp')}/{st.get('slg')}, {st.get('homeRuns')} HR"
    return f"{st.get('era')} ERA, {st.get('saves')} SV, {st.get('inningsPitched')} IP"
