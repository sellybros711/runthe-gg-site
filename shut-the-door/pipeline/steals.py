"""Rules 7 (2026-10-26): stolen bases, the pickoff and the slide step. The
numbers behind pack.steal and contract.js STEAL.

The owner: "Runners could also steal, and if that's the case it should show
the catcher trying to throw them out. They may win or lose that moment, but
adding players stealing in realistic scenarios will make this game feel a lot
more real." And: "yes add pickoffs and slide step".

WHAT IS READ
  MLB Stats API game feeds (statsapi.mlb.com /v1.1/game/{pk}/feed/live), every
  regular season game of the seasons asked for. Each feed is read once, pitch
  by pitch, and only a compact line per pitch is kept (cache/steals-{season}.json.gz):
  the runners on each base (their ids), the outs, the count before the pitch,
  the inning, the score from the batting side, the pickoff throws already made
  in this plate appearance (by base), and what the runner did on the pitch
  (stole, was caught, nothing). Pickoff throws are kept as their own lines:
  the base, and safe, out or an error.

  People (Stats API /v1/people, hydrated with season hitting, pitching and
  fielding stats): each scenario's batters' stolen bases and caught stealing,
  the scenario pitcher's stolen bases and caught stealing against, and the
  real game's catcher's. Savant's sprint speed leaderboard (2015 on) for each
  runner's speed. League totals per season (/v1/teams/stats) for the era.

WHAT IS MEASURED (printed, and written to data/steals.json)
  ATTEMPT   the chance a runner goes on a pitch: per pitch with a steal on
            (a runner on first with second open, or on second with third
            open), by the base, the outs, the count bucket, late and close
            (inning 8 on, the margin 0 or 1) or not, and the pickoff throws
            already made at him in the plate appearance (0, 1, 2).
  SUCCESS   safe on an attempt: by the base, late and close or not, and after
            a pickoff throw or not.
  PICKOFF   out per pickoff throw, by base; an error per throw.
  RUNNER    each scenario batter's attempt rate (attempts per time on first:
            singles, walks and hit by pitch) and success, shrunk toward the
            league by K_ATT and K_SUC, as multipliers; his sprint speed.
  BATTERY   the scenario pitcher's and catcher's success against, shrunk the
            same way, as probit shifts; the pitcher's attempts against per
            time on first allowed, as a multiplier.
  ERA       each scenario season's league attempt rate and success against
            the sample seasons', so 1988 runs at 1988's rates (labelled: before
            2015 there is no sprint speed, and before 2023 the bases were
            smaller and pickoffs unlimited).

    python3 shut-the-door/pipeline/steals.py [--seasons 2022,2024] [--threads 6]
"""
import gzip
import json
import math
import os
import sys
import threading
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from statistics import NormalDist

from common import CACHE, DATA, ensure_dirs, get, log, write_json

BASES = {'1B': 1, '2B': 2, '3B': 3, 'score': 4}
STEAL_EV = {'stolen_base_2b': (2, True), 'stolen_base_3b': (3, True), 'caught_stealing_2b': (2, False),
            'caught_stealing_3b': (3, False)}
PICKOFF_OUT = {'pickoff_1b': 1, 'pickoff_2b': 2, 'pickoff_3b': 3}
PICKOFF_CS = {'pickoff_caught_stealing_2b': 2, 'pickoff_caught_stealing_3b': 3}
K_ATT = 15.0      # attempts of prior on a runner's or pitcher's attempt rate
K_SUC = 20.0      # attempts of prior on a runner's, pitcher's or catcher's success


def schedule(season):
    j = json.loads(get(f'https://statsapi.mlb.com/api/v1/schedule?sportId=1&season={season}&gameType=R',
                       cache_key=f'statsapi-schedule-season-{season}.json'))
    pks = []
    for d in j.get('dates', []):
        for g in d.get('games', []):
            if g.get('status', {}).get('codedGameState') == 'F' and g['gamePk'] not in pks:
                pks.append(g['gamePk'])
    return pks


def bucket(b, s):
    return 'ahead' if s > b else 'behind' if b > s else 'even'


def extract(pk, season):
    """One game's feed, as compact lines: ('p', ...) a pitch, ('k', ...) a pickoff throw."""
    import requests  # common.get caches whole bodies; a season of feeds is read once and dropped
    from common import UA
    r = None
    for i in range(4):
        try:
            r = requests.get(f'https://statsapi.mlb.com/api/v1.1/game/{pk}/feed/live', headers=UA, timeout=60)
            if r.status_code == 200:
                break
        except requests.RequestException:
            pass
    if r is None or r.status_code != 200:
        return []
    d = r.json()
    out = []
    occ, half, outs, score = [None, None, None, None], None, 0, {'away': 0, 'home': 0}
    for p in d['liveData']['plays']['allPlays']:
        ab = p['about']
        h = (ab['inning'], ab['halfInning'])
        if h != half:
            half, occ, outs = h, [None, None, None, None], 0
        bat = 'away' if ab['isTopInning'] else 'home'
        margin = score[bat] - score['home' if bat == 'away' else 'away']
        moves = defaultdict(list)
        for rn in p.get('runners', []):
            moves[rn['details'].get('playIndex')].append(rn)
        b = s = 0
        po = {1: 0, 2: 0, 3: 0}
        last_pitch = None
        for i, e in enumerate(p['playEvents']):
            if e.get('isPitch'):
                last_pitch = [ 'p', season, ab['inning'], outs, b, s, margin, occ[1], occ[2], occ[3], po[1], po[2], po[3],
                               p['matchup']['pitcher']['id'], e['details'].get('call', {}).get('code'), None, None, None]
                out.append(last_pitch)
                c = e.get('count', {})
                b, s = min(3, c.get('balls', b)), min(2, c.get('strikes', s))
            elif e.get('type') == 'pickoff':
                desc = e['details'].get('description', '')
                base = 1 if '1B' in desc else 2 if '2B' in desc else 3 if '3B' in desc else None
                if base:
                    po[base] += 1
                    out.append(['k', season, ab['inning'], outs, base, occ[base], 'error' if 'Error' in desc else 'throw',
                                p['matchup']['pitcher']['id']])
            for rn in moves.get(i, []):
                et = rn['details'].get('eventType', '')
                mv = rn['movement']
                rid = rn['details'].get('runner', {}).get('id')
                if et in STEAL_EV and last_pitch is not None and last_pitch[15] is None:
                    to, ok = STEAL_EV[et]
                    last_pitch[15], last_pitch[16], last_pitch[17] = to, rid, 1 if ok else 0
                if et in PICKOFF_OUT and rn['movement'].get('isOut'):
                    out.append(['k', season, ab['inning'], outs, PICKOFF_OUT[et], rid, 'out', p['matchup']['pitcher']['id']])
                if et in PICKOFF_CS:
                    out.append(['k', season, ab['inning'], outs, PICKOFF_CS[et] - 1, rid, 'cs', p['matchup']['pitcher']['id']])
                # the runners as they stand after this event
                st, en = BASES.get(mv.get('start')), BASES.get(mv.get('end'))
                if st and st < 4 and occ[st] == rid:
                    occ[st] = None
                if en and en < 4 and not mv.get('isOut'):
                    occ[en] = rid
                if mv.get('isOut'):
                    outs = min(2, outs + 1)
        # the batter and the runners at the end of the play, from the record
        m = p['matchup']
        occ = [None, (m.get('postOnFirst') or {}).get('id'), (m.get('postOnSecond') or {}).get('id'),
               (m.get('postOnThird') or {}).get('id')]
        outs = p['count'].get('outs', outs)
        if outs >= 3:
            occ = [None, None, None, None]
        res = p.get('result', {})
        score = {'away': res.get('awayScore', score['away']), 'home': res.get('homeScore', score['home'])}
    return out


def season_lines(season, threads):
    ensure_dirs()
    path = os.path.join(CACHE, f'steals-{season}.json.gz')
    if os.path.exists(path):
        with gzip.open(path, 'rt') as fh:
            return json.load(fh)
    pks = schedule(season)
    log(f'{season}: {len(pks)} games')
    lines, lock, done = [], threading.Lock(), [0]

    def one(pk):
        x = extract(pk, season)
        with lock:
            lines.extend(x)
            done[0] += 1
            if done[0] % 200 == 0:
                log(f'  {season}: {done[0]} of {len(pks)}')

    with ThreadPoolExecutor(threads) as ex:
        list(ex.map(one, pks))
    with gzip.open(path, 'wt') as fh:
        json.dump(lines, fh)
    return lines


# ---- the measurements --------------------------------------------------------
N01 = NormalDist()
probit = lambda p: N01.inv_cdf(min(0.999, max(0.001, p)))


def late(inning, margin):
    """Innings 8 on, by the batting side's margin; None before the 8th."""
    if inning < 8:
        return None
    return 'd3' if margin <= -3 else 'd2' if margin == -2 else 'd1' if margin == -1 else 't0' if margin == 0 else 'up'


def opp_of(x):
    """The steal on for a pitch line: (to, runner, pickoffs at him) or None."""
    r1, r2, r3 = x[7], x[8], x[9]
    if r2 and not r3:
        return 3, r2, x[11]
    if r1 and not r2:
        return 2, r1, x[10]
    return None


def measure(lines):
    att = defaultdict(lambda: [0, 0])          # (to, outs, b, s) -> [opps, attempts]
    sub = defaultdict(lambda: [0, 0.0, 0])     # (kind, to, key) -> [attempts seen, attempts expected, opps]
    suc = defaultdict(lambda: [0, 0])          # (to, kind, key) -> [attempts, safe]
    ops = []
    for x in lines:
        if x[0] != 'p':
            continue
        o = opp_of(x)
        if not o:
            continue
        to, rid, po = o
        went = x[15] == to and x[16] == rid
        k = (to, x[3], x[4], x[5])
        att[k][0] += 1
        att[k][1] += went
        ops.append((k, x, po, went, to))
        if went:
            for kind, key in (('all', ''), ('late', late(x[2], x[6])), ('po', min(2, po))):
                if key is not None:
                    suc[(to, kind, key)][0] += 1
                    suc[(to, kind, key)][1] += x[17]
    rate = {k: (v[1] + 0.5) / (v[0] + 50) for k, v in att.items()}
    # each runner's own tendency (attempts over what the cells expect of him, shrunk), so a pickoff
    # throw, which goes to the runners who run, is measured against the same runner without one
    own = defaultdict(lambda: [0, 0.0])
    for k, x, po, went, to in ops:
        own[x[7] if to == 2 else x[8]][0] += went
        own[x[7] if to == 2 else x[8]][1] += rate[k]
    mult = {r: (a + 2.0) / (e + 2.0) for r, (a, e) in own.items()}
    sown = defaultdict(lambda: [0, 0])
    for k, x, po, went, to in ops:
        if went:
            r = x[7] if to == 2 else x[8]
            sown[r][0] += 1
            sown[r][1] += x[17]
    for k, x, po, went, to in ops:
        r = x[7] if to == 2 else x[8]
        for kind, key in (('late', late(x[2], x[6])), ('po', min(2, po))):
            if key is None:
                continue
            s = sub[(kind, to, key)]
            s[0] += went
            s[1] += rate[k] * mult[r]
            s[2] += 1
    out = {
        'attempt': {f'{to}|{o}|{b}|{s}': round(r, 5) for (to, o, b, s), r in rate.items()},
        'opps': {f'{to}|{o}|{b}|{s}': v[0] for (to, o, b, s), v in att.items()},
        'attMult': {f'{kind}|{to}|{key}': round(v[0] / v[1], 3) for (kind, to, key), v in sub.items() if v[1] > 5},
        'attN': {f'{kind}|{to}|{key}': v[0] for (kind, to, key), v in sub.items()},
        'success': {}, 'sucZ': {}, 'sucN': {},
    }
    for to in (2, 3):
        a, s = suc[(to, 'all', '')]
        p = s / a
        out['success'][str(to)] = round(p, 4)
        out['sucN'][str(to)] = a
        for (t2, kind, key), (aa, ss) in suc.items():
            if t2 != to or kind == 'all':
                continue
            # expected: each attempt at its runner's own shrunk success
            ex = 0.0
            for k, x, po, went, tt in ops:
                if went and tt == to and ((kind == 'late' and late(x[2], x[6]) == key) or (kind == 'po' and min(2, po) == key)):
                    r = x[7] if to == 2 else x[8]
                    ex += probit((sown[r][1] + K_SUC * p) / (sown[r][0] + K_SUC))
            pp = (ss + K_SUC * p) / (aa + K_SUC)
            out['sucZ'][f'{kind}|{to}|{key}'] = round(probit(pp) - ex / aa, 3) if aa else 0.0
            out['sucN'][f'{kind}|{to}|{key}'] = aa
    # the pickoff: an out per throw, and an error per throw, by base
    pk = defaultdict(lambda: defaultdict(int))
    for x in lines:
        if x[0] == 'k':
            pk[x[4]][x[6]] += 1
    out['pickoff'] = {}
    for b, c in pk.items():
        n = c['throw'] + c['out'] + c['error']
        out['pickoff'][str(b)] = {'throws': n, 'out': round(c['out'] / n, 4), 'error': round(c['error'] / n, 4)}
    return out


# ---- people and leaderboards ------------------------------------------------------
def stats(season, group, position=None):
    pos = f'&position={position}' if position else ''
    j = json.loads(get(f'https://statsapi.mlb.com/api/v1/stats?stats=season&group={group}&season={season}&sportId=1'
                       f'&playerPool=ALL&limit=5000&gameType=R{pos}', cache_key=f'statsapi-stats-{group}-{season}{pos}.json'))
    by = defaultdict(list)
    for sp in j['stats'][0]['splits']:
        if position and sp.get('position', {}).get('abbreviation') != position:
            continue
        by[sp['player']['id']].append(sp)
    out = {}
    for pid, sps in by.items():
        tot = [s for s in sps if 'team' not in s]
        use = tot[:1] or sps
        agg = defaultdict(float)
        for s in use:
            for k, v in s['stat'].items():
                if isinstance(v, (int, float)):
                    agg[k] += v
        agg['name'] = sps[0]['player'].get('fullName')
        out[pid] = agg
    return out


def first_base_times(s):
    return max(0.0, s['hits'] - s['doubles'] - s['triples'] - s['homeRuns']) + s['baseOnBalls'] + s.get('hitByPitch', 0) \
        - s.get('intentionalWalks', 0) * 0


def leaderboard(kind, season):
    url = {'sprint': f'https://baseballsavant.mlb.com/leaderboard/sprint_speed?year={season}&position=&team=&min=0&csv=true',
           'pop': f'https://baseballsavant.mlb.com/leaderboard/poptime?year={season}&team=&min2b=1&min3b=0&csv=true'}[kind]
    import csv, io
    text = get(url, cache_key=f'savant-{kind}-{season}.csv').lstrip('﻿')
    rows = list(csv.DictReader(io.StringIO(text)))
    if kind == 'sprint':
        return {int(r['player_id']): float(r['sprint_speed']) for r in rows if r.get('sprint_speed')}
    return {int(r['entity_id']): float(r['pop_2b_sba']) for r in rows if r.get('pop_2b_sba')}


def league(season):
    h = stats(season, 'hitting')
    sb = sum(s['stolenBases'] for s in h.values())
    cs = sum(s['caughtStealing'] for s in h.values())
    fb = sum(first_base_times(s) for s in h.values())
    return {'sb': int(sb), 'cs': int(cs), 'firstBase': int(fb), 'attRate': (sb + cs) / fb, 'sbPct': sb / (sb + cs)}


def speed_prior(season):
    """How sprint speed moves the attempt rate (log) and success (probit), fitted on the season's
    runners with 30 or more times on first."""
    h, sp = stats(season, 'hitting'), leaderboard('sprint', season)
    import numpy as np
    xs, ya, wa, xs2, ys, ws = [], [], [], [], [], []
    for pid, s in h.items():
        if pid not in sp:
            continue
        fb = first_base_times(s)
        a = s['stolenBases'] + s['caughtStealing']
        if fb >= 30:
            xs.append(sp[pid]); ya.append(math.log((a + 0.5) / fb)); wa.append(fb)
        if a >= 5:
            xs2.append(sp[pid]); ys.append(probit((s['stolenBases'] + 0.5) / (a + 1))); ws.append(a)
    ba = np.polyfit(xs, ya, 1, w=np.sqrt(wa))
    bs = np.polyfit(xs2, ys, 1, w=np.sqrt(ws))
    mean = float(np.average(xs, weights=wa))
    return {'att': round(float(ba[0]), 4), 'z': round(float(bs[0]), 4), 'mean': round(mean, 2)}


def z_per_second(seasons=(2016, 2019, 2022, 2024, 2025)):
    """A second of catcher's pop time to second against stolen base success (probit), the
    catchers with 20 or more attempts against, every season pooled (each season's league mean
    taken out). The quick delivery's seconds are read at this rate."""
    import numpy as np
    xs, zs, ws = [], [], []
    for y in seasons:
        lg, pop, cf = league(y), leaderboard('pop', y), stats(y, 'fielding', 'C')
        for cid, t in pop.items():
            c = cf.get(cid)
            if not c:
                continue
            a = c.get('stolenBases', 0) + c.get('caughtStealing', 0)
            if a < 20:
                continue
            xs.append(t)
            zs.append(probit((c['stolenBases'] + 0.5) / (a + 1)) - probit(lg['sbPct']))
            ws.append(a)
    b = np.polyfit(xs, zs, 1, w=np.sqrt(ws))
    return {'z': round(float(b[0]), 3), 'catchers': len(xs), 'seasons': list(seasons)}


def quick_fifth(season, lg):
    """The best fifth of the season's pitchers at holding runners (10 or more attempts against),
    their success against as a probit shift from the league's: what a quicker delivery is worth.
    The slide step (contract.js STEAL.SLIDE) takes an ordinary delivery to this."""
    pi = stats(season, 'pitching')
    rows = []
    for s in pi.values():
        a = s['stolenBases'] + s['caughtStealing']
        if a >= 10:
            rows.append(((s['stolenBases'] + K_SUC * lg['sbPct']) / (a + K_SUC), a))
    rows.sort()
    top = rows[:max(1, len(rows) // 5)]
    p = sum(x * a for x, a in top) / sum(a for x, a in top)
    return {'pitchers': len(rows), 'sbPct': round(p, 4), 'z': round(probit(p) - probit(lg['sbPct']), 3)}


# ---- the scenario's facts: the catcher on the field, the runners on at the start ------
def catcher_at(feed, side, ab_index, inning=None, half=None):
    bx = feed['liveData']['boxscore']['teams'][side]['players']
    mine = {p['person']['id'] for p in bx.values()}
    cur = None
    for p in bx.values():
        bo = p.get('battingOrder')
        ap = p.get('allPositions') or []
        if bo and bo.endswith('00') and ap and ap[0].get('abbreviation') == 'C':
            cur = p['person']['id']
    for pl in feed['liveData']['plays']['allPlays']:
        a = pl['about']
        here = (ab_index is not None and pl['atBatIndex'] >= ab_index) or \
            (ab_index is None and a['inning'] == inning and a['halfInning'] == half)
        for e in pl['playEvents']:
            if here and e.get('isPitch'):
                break   # the spot's plate appearance: the changes made before its first pitch count
            pid = (e.get('player') or {}).get('id')
            if pid in mine and (e.get('position') or {}).get('abbreviation') == 'C':
                cur = pid
        if here:
            break
    return cur, next((p['person']['fullName'] for p in bx.values() if p['person']['id'] == cur), None)


def runner_entry(rid, name, season, h, sp, sprior, lgRate, lgP):
    """One runner: his attempts per time on first and his success, shrunk toward what his sprint
    speed predicts (SB and CS alone before 2015)."""
    s = h.get(rid)
    speed = sp.get(rid)
    m0 = math.exp(sprior['att'] * (speed - sprior['mean'])) if speed else 1.0
    z0 = sprior['z'] * (speed - sprior['mean']) if speed else 0.0
    r0, p0 = lgRate * m0, N01.cdf(probit(lgP) + z0)
    A = (s['stolenBases'] + s['caughtStealing']) if s else 0
    O = first_base_times(s) if s else 0
    SB = s['stolenBases'] if s else 0
    rate = (A + K_ATT) / (O + K_ATT / r0)
    p = (SB + K_SUC * p0) / (A + K_SUC)
    return {'name': name, 'att': round(rate / lgRate, 3), 'z': round(probit(p) - probit(lgP), 3),
            'sb': int(SB), 'cs': int(A - SB), 'firstBase': int(O), 'speed': speed,
            'src': 'SB, CS and sprint speed' if speed else 'SB and CS (no sprint speed before 2015)' if season < 2015 else 'SB and CS'}


def catcher_entry(cid, cname, cf, pop, lgP):
    """The catcher on the field: stolen bases and caught stealing against him, and his pop time."""
    c = cf.get(cid)
    if c:
        A = c.get('stolenBases', 0) + c.get('caughtStealing', 0)
        cp = (c.get('stolenBases', 0) + K_SUC * lgP) / (A + K_SUC)
        return {'id': cid, 'name': cname, 'z': round(probit(cp) - probit(lgP), 3), 'sb': int(c.get('stolenBases', 0)),
                'cs': int(c.get('caughtStealing', 0)), 'pop': pop.get(cid)}
    return {'id': cid, 'name': cname, 'z': 0.0, 'pop': pop.get(cid)}


def halves_main(ids):
    """Rules 8 (halves.py): for a spot with more than one half, the running game of its later
    halves, into data/steals.json beside what main() wrote: a runner for every batter in the pack
    who has none, and the catcher on the field when each later half began (halves[h], h >= 1)."""
    from common import read_json
    from statsapi import feed as gfeed
    GAME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(DATA, 'steals.json')
    allj = read_json(path)
    specs = {x['id']: x for x in read_json(os.path.join(GAME, 'scenarios', 'scenarios.json'))['scenarios']}
    for sid in ids:
        spec = specs[sid]
        v = read_json(os.path.join(DATA, 'verify', spec['verify'] + '.json'))
        pack = read_json(os.path.join(DATA, 'packs', sid + '.json'))
        sc = allj['scenarios'][sid]
        season = sc['season']
        S = allj['sample'][sc['era']]
        lg = league(season)
        h, cf = stats(season, 'hitting'), stats(season, 'fielding', 'C')
        sp = leaderboard('sprint', season) if season >= 2015 else {}
        pop = leaderboard('pop', season) if season >= 2016 else {}
        import retro
        for b in pack['scenario']['batters']:
            bid = str(b['id'])
            if bid in sc['runners']:
                continue
            mid = int(bid) if bid.isdigit() else retro.retro_to_mlbam({bid[6:]}).get(bid[6:]) if bid.startswith('retro:') else None
            sc['runners'][bid] = runner_entry(int(mid), b['name'], season, h, sp, S['speed'], lg['attRate'], lg['sbPct']) if mid else {
                'name': b['name'], 'att': 1.0, 'z': 0.0, 'speed': None, 'src': 'no MLBAM id: the league runner'}
        f = gfeed(v.get('gamePk') or scenario_facts(spec, v)[0])
        side = 'home' if v['situation']['usHome'] else 'away'
        out = []
        for hv in v['halves'][1:]:
            cid, cname = catcher_at(f, side, None, hv['inning'], hv['half'])
            out.append({'catcher': catcher_entry(cid, cname, cf, pop, lg['sbPct'])})
        sc['halves'] = out
        log(f'{sid}: runners {len(sc["runners"])}, later halves\' catchers ' + ', '.join(x['catcher']['name'] or '?' for x in out))
    write_json(path, allj)


def scenario_facts(spec, v):
    from statsapi import feed as gfeed
    pk = v.get('gamePk')
    if not pk:
        d = v['date'].replace('/', '-')
        s = json.loads(get(f'https://statsapi.mlb.com/api/v1/schedule?sportId=1&date={d}', cache_key=f'statsapi-schedule-{d}-all.json'))
        pk = s['dates'][0]['games'][0]['gamePk']
    f = gfeed(pk)
    sit = v['situation']
    side = 'home' if sit['usHome'] else 'away'
    ab = (v['plateAppearances'][0] or {}).get('atBat')
    ab = ab - 1 if ab else None   # Savant's at_bat_number counts from 1, the feed's atBatIndex from 0
    cid, cname = catcher_at(f, side, ab, sit['inning'], sit['half'])
    start = {}
    if sit.get('bases') and ab:
        prev = f['liveData']['plays']['allPlays'][ab - 1]['matchup']   # the plate appearance before the spot's
        for b, k in ((1, 'postOnFirst'), (2, 'postOnSecond'), (3, 'postOnThird')):
            if prev.get(k):
                start[b] = {'id': prev[k]['id'], 'name': prev[k]['fullName']}
    return pk, cid, cname, start, v['pitcher'].get('id') or v['pitcher'].get('mlbamId')


def main():
    from common import read_json
    a = sys.argv[1:]
    seasons = [int(x) for x in (a[a.index('--seasons') + 1] if '--seasons' in a else '2022,2024').split(',')]
    threads = int(a[a.index('--threads') + 1]) if '--threads' in a else 6
    # --spots-only: keep the measured league sample (every game feed of its seasons) and the pop
    # time slope from data/steals.json, and add only the spots it does not have yet: their people,
    # catcher and runners. The spots already in it are kept as they are.
    spots_only = '--spots-only' in a
    prev = read_json(os.path.join(DATA, 'steals.json')) if spots_only else None
    if spots_only and not prev:
        raise SystemExit('--spots-only needs data/steals.json')
    sample = dict(prev['sample']) if spots_only else {}
    if spots_only:
        seasons = [int(x) for x in sample]
    for se in ([] if spots_only else seasons):
        ln = season_lines(se, threads)
        m = measure(ln)
        m['league'] = league(se)
        m['speed'] = speed_prior(se)
        m['quick'] = quick_fifth(se, m['league'])
        sample[str(se)] = m
        log(f'{se}: {sum(1 for x in ln if x[0] == "p")} pitches; steal 2nd {m["success"]["2"]} of {m["sucN"]["2"]}, '
            f'3rd {m["success"]["3"]} of {m["sucN"]["3"]}; pickoff {m["pickoff"]}')
    GAME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    specs = read_json(os.path.join(GAME, 'scenarios', 'scenarios.json'))['scenarios']
    scen = dict(prev['scenarios']) if spots_only else {}
    for spec in specs:
        if spots_only and spec['id'] in scen:
            continue
        v = read_json(os.path.join(DATA, 'verify', spec['verify'] + '.json'))
        pack = read_json(os.path.join(DATA, 'packs', spec['id'] + '.json'))
        season = pack['scenario']['pitcher']['year']
        era = '2024' if season >= 2023 else '2022'
        S = sample[era]
        lg, lgS = league(season), S['league']
        pk, cid, cname, start, pid = scenario_facts(spec, v)
        h, pi = stats(season, 'hitting'), stats(season, 'pitching')
        cf = stats(season, 'fielding', 'C')
        sp = leaderboard('sprint', season) if season >= 2015 else {}
        pop = leaderboard('pop', season) if season >= 2016 else {}
        sprior = S['speed']
        lgRate, lgP = lg['attRate'], lg['sbPct']

        def runner(rid, name):
            return runner_entry(rid, name, season, h, sp, sprior, lgRate, lgP)

        runners = {}
        retro = {'retro:' + str(pa.get('batterId')): pa.get('mlbamId') for pa in v['plateAppearances'] if pa.get('mlbamId')}
        for b in pack['scenario']['batters']:
            bid = str(b['id'])
            mid = int(bid) if bid.isdigit() else retro.get(bid)
            runners[bid] = runner(int(mid), b['name']) if mid else {
                'name': b['name'], 'att': 1.0, 'z': 0.0, 'speed': None, 'src': 'no MLBAM id: the league runner'}
        for b, r in start.items():
            runners[str(r['id'])] = runner(int(r['id']), r['name'])
        p = pi.get(int(pid), None)
        if p:
            A = p['stolenBases'] + p['caughtStealing']
            O = max(0.0, p['hits'] - p['doubles'] - p['triples'] - p['homeRuns']) + p['baseOnBalls'] + p.get('hitBatsmen', 0)
            prate = (A + K_ATT) / (O + K_ATT / lgRate)
            pp = (p['stolenBases'] + K_SUC * lgP) / (A + K_SUC)
            pitcher = {'id': int(pid), 'att': round(prate / lgRate, 3), 'z': round(probit(pp) - probit(lgP), 3),
                       'sb': int(p['stolenBases']), 'cs': int(p['caughtStealing']), 'pickoffs': int(p.get('pickoffs', 0))}
        else:
            pitcher = {'id': pid, 'att': 1.0, 'z': 0.0}
        catcher = catcher_entry(cid, cname, cf, pop, lgP)
        scen[spec['id']] = {
            'season': season, 'era': era, 'gamePk': pk,
            'eraAtt': round(lg['attRate'] / lgS['attRate'], 3), 'eraZ': round(probit(lg['sbPct']) - probit(lgS['sbPct']), 3),
            'league': {'sb': lg['sb'], 'cs': lg['cs'], 'sbPct': round(lg['sbPct'], 4), 'attRate': round(lg['attRate'], 4)},
            'bigBases': season >= 2023, 'pitcher': pitcher, 'catcher': catcher, 'runners': runners,
            'start': {str(b): r['id'] for b, r in start.items()},
        }
        log(f'{spec["id"]}: catcher {cname} z {catcher["z"]}, pitcher z {pitcher["z"]} att {pitcher["att"]}, era att x{scen[spec["id"]]["eraAtt"]} z {scen[spec["id"]]["eraZ"]}')
    zps = prev['zPerSecond'] if spots_only else z_per_second()
    log(f'pop time: {zps}')
    write_json(os.path.join(DATA, 'steals.json'), {
        'zPerSecond': zps,
        'source': 'MLB Stats API game feeds (every regular season game of ' + ', '.join(map(str, seasons)) +
                  '), people season stats; Baseball Savant sprint speed and pop time',
        'K': {'att': K_ATT, 'suc': K_SUC}, 'sample': sample, 'scenarios': scen,
    })


if __name__ == '__main__':
    if '--halves' in sys.argv:
        halves_main([x for x in sys.argv[1:] if not x.startswith('--')])
    else:
        main()
