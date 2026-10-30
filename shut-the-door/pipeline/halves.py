"""Rules 8: the closer's real outing to the end of the game, from the play by play.

  python3 halves.py chapman-2016-ws7 [...]     writes 'halves', 'between' and 'line' into
                                              data/verify/<id>.json (a tracked spot, the Stats API feed)

The owner's call (2026-10-30): a daily is the closer's real outing to the end of the game, and it
asks for at least three outs. A spot runs through every half he pitched, from the spot to the game's
final out, or to the last out of regulation when extras followed (a held tie ends it there). Between
two of his halves his team bats, and that half is played as it happened.

What it writes, every fact from MLB's live feed for the game (statsapi /api/v1.1/game/<pk>/feed/live):

  halves    every half he pitched from the spot: inning, half, the outs and bases when the spot
            starts (the first), the walk-off rule, and the lineup he would face, by batting slot from
            the slot of the spot's first batter: who batted in that slot in that real half, else who
            held the slot when the half began (the substitutions in the feed, in order)
  between   each half his team batted between two of his: every plate appearance in order, with the
            batter, the feed's event and description, the scorer's short form (from the event and
            the fielders the feed credits), the runs on the play, the outs, bases and runners after
            it, and whether it was a hit and how many errors the fielders made on it. A field the
            feed does not give is null.
  line      the line score when he came in: runs by inning for both teams (the spot's half up to his
            first batter), hits and errors so far.
"""

import json
import os
import sys

from common import VERIFY, get, log, read_json, write_json

HITS = {'single', 'double', 'triple', 'home_run'}
SHORT = {'single': '1B', 'double': '2B', 'triple': '3B', 'home_run': 'HR', 'walk': 'BB', 'intent_walk': 'IBB',
         'hit_by_pitch': 'HBP', 'catcher_interf': 'CI', 'fielders_choice': 'FC', 'fielders_choice_out': 'FC'}
TRAJ = {'fly_ball': 'F', 'line_drive': 'L', 'popup': 'P'}
BASES = {'1B': 1, '2B': 2, '3B': 3}


def feed(pk):
    return json.loads(get(f'https://statsapi.mlb.com/api/v1.1/game/{pk}/feed/live', cache_key=f'feed-{pk}.json'))


def slot_of(order):
    return int(str(order)[0]) if order else None


def fielders(play):
    """The fielders on the play's outs, in the scorer's order: each out's assists then its putout,
    the outs chained where one fielder ends one and starts the next (6-4-3)."""
    seqs = []
    for r in play.get('runners', []):
        cr = [c for c in r.get('credits', []) if c.get('credit') in ('f_assist', 'f_putout')]
        if not r['movement'].get('isOut') or not cr:
            continue
        s = [c['position']['code'] for c in cr if c['credit'] == 'f_assist'] + [c['position']['code'] for c in cr if c['credit'] == 'f_putout']
        seqs.append(s)
    out = []
    for s in seqs:
        if out and s and out[-1] == s[0]:
            out += s[1:]
        else:
            out += ([] if not out else ['/']) + s
    return out


def errors_on(play):
    seen = set()
    for r in play.get('runners', []):
        for c in r.get('credits', []):
            if 'error' in (c.get('credit') or ''):
                seen.add((c['player']['id'], c['credit'], r['details'].get('playIndex')))
    return len(seen)


def trajectory(play):
    for e in reversed(play.get('playEvents', [])):
        t = (e.get('hitData') or {}).get('trajectory')
        if t:
            return t
    return None


def short_of(play):
    """The scorer's short form: K, BB, 1B, HR, 6-3, F8, L6, P4, 6-4-3 DP, SF9, E6, FC. From the
    feed's event and the fielders it credits; null when they do not say."""
    ev = play['result'].get('eventType') or ''
    if ev in SHORT:
        return SHORT[ev]
    if ev.startswith('strikeout'):
        return 'K DP' if 'double_play' in ev else 'K'
    f = fielders(play)
    chain = '-'.join(x for x in f if x != '/') if f else None
    if ev == 'field_error':
        e = [c['position']['code'] for r in play.get('runners', []) for c in r.get('credits', []) if 'error' in (c.get('credit') or '')]
        return 'E' + e[0] if e else None
    if ev in ('grounded_into_double_play', 'double_play', 'triple_play', 'sac_fly_double_play'):
        return (chain + ' ' if chain else '') + ('TP' if ev == 'triple_play' else 'DP')
    if ev == 'sac_fly':
        return 'SF' + (f[-1] if f else '')
    if ev in ('sac_bunt', 'sac_bunt_double_play'):
        return 'SAC' + (' ' + chain if chain else '')
    if ev == 'force_out':
        return (chain + ' ' if chain else '') + 'FO'
    if ev == 'field_out':
        if not f:
            return None
        t = TRAJ.get(trajectory(play) or '')
        if len(f) == 1:
            return (t or 'F') + f[0] if t else f[0] + 'U'
        return chain
    return None


def bases_after(on, play):
    """Who is on after the play: each runner to the last base the feed moves him to, off when he is
    out or scores. on: {1: id, 2: id, 3: id}."""
    on = dict(on)
    runs = 0
    names = {}
    for r in play.get('runners', []):
        m, rid = r['movement'], r['details']['runner']['id']
        names[rid] = r['details']['runner'].get('fullName')
        start = BASES.get(m.get('start') or m.get('originBase') or '')
        if start and on.get(start) == rid:
            on.pop(start)
        for b in [k for k, v in on.items() if v == rid]:
            on.pop(b)
        if m.get('isOut'):
            continue
        end = m.get('end')
        if end == 'score':
            if r['details'].get('isScoringEvent') is not False:
                runs += 1
            continue
        if end in BASES:
            on[BASES[end]] = rid
    return on, runs, names


def half_plays(plays, inning, half):
    return [p for p in plays if p['about']['inning'] == inning and p['about']['halfInning'] == half]


def subs_in(play):
    for e in play.get('playEvents', []):
        if e.get('type') == 'action' and e.get('battingOrder') and e['details'].get('eventType') in (
                'offensive_substitution', 'defensive_substitution', 'defensive_switch'):
            yield e


def build(v):
    f = feed(v['gamePk'])
    plays = f['liveData']['plays']['allPlays']
    gd, ld = f['gameData'], f['liveData']
    s = v['situation']
    us_home = s['usHome']
    d_half = 'top' if us_home else 'bottom'          # the halves he pitches
    b_half = 'bottom' if us_home else 'top'          # the halves his team bats
    bat_side = 'away' if us_home else 'home'         # the side he faces
    first_ab = v['plateAppearances'][0]['atBat'] - 1  # Savant's at_bat_number is the feed's atBatIndex + 1
    i0 = next(i for i, p in enumerate(plays) if p['about']['atBatIndex'] == first_ab)
    assert plays[i0]['about']['inning'] == s['inning'] and plays[i0]['about']['halfInning'] == s['half'], 'the spot is not where the feed has it'
    pid = v['pitcher']['id']
    last_inning = max(p['about']['inning'] for p in plays)
    reg = max(9, s['inning'])

    # his halves: the spot's, then every later one he pitched in, through regulation (or the spot's
    # extra inning). A half he did not pitch ends the run of them.
    halves = []
    for inn in range(s['inning'], min(reg, last_inning) + 1):
        hp = half_plays(plays, inn, d_half)
        if inn > s['inning'] and not any(p['matchup']['pitcher']['id'] == pid for p in hp):
            break
        if not hp:
            break
        halves.append({'inning': inn, 'half': d_half})

    # the batting order he faces: the starters, then every substitution in the feed's order
    box = ld['boxscore']['teams'][bat_side]['players']
    order_of = {int(k[2:]): p.get('battingOrder') for k, p in box.items()}
    name_of = {int(k[2:]): p['person']['fullName'] for k, p in box.items()}
    holder = {}
    for k, p in box.items():
        bo = p.get('battingOrder')
        if bo and bo.endswith('00'):
            holder[slot_of(bo)] = int(k[2:])
    holders_at = []                                  # the slot holders after each play's substitutions
    for p in plays:
        for e in subs_in(p):
            # a substitution on the side he faces (its batting order is that side's slot); a
            # defensive switch moves a man in the field, not in the order
            if e['details'].get('eventType') != 'defensive_switch' and e.get('player') and e['player']['id'] in order_of:
                holder[slot_of(e['battingOrder'])] = e['player']['id']
        holders_at.append(dict(holder))
    first_batter = plays[i0]['matchup']['batter']['id']
    slot0 = slot_of(order_of.get(first_batter))
    assert slot0, 'no batting slot for the spot\'s first batter'

    lineups = []
    for k, hv in enumerate(halves):
        hp = half_plays(plays, hv['inning'], hv['half'])
        start_i = i0 if k == 0 else plays.index(hp[0])
        held = holders_at[start_i]
        batted = {}
        for p in (hp if k > 0 else []):
            bid = p['matchup']['batter']['id']
            sl = slot_of(order_of.get(bid))
            if sl and sl not in batted:
                batted[sl] = bid
        ids = []
        for pos in range(9):
            sl = (slot0 - 1 + pos) % 9 + 1
            ids.append(batted.get(sl, held.get(sl)))
        lineups.append(ids)
        hv['real'] = True
        if k == 0:
            hv.update({'outs': s['outs'], 'bases': s['bases']})
        else:
            hv.update({'outs': 0, 'bases': 0})
        hv['walkOffLive'] = (not us_home) and hv['inning'] >= 9

    # his team's halves between two of his
    between = []
    tm = gd['teams']['home' if us_home else 'away']
    for k in range(len(halves) - 1):
        inn = halves[k]['inning'] + (1 if b_half == 'top' else 0)
        hp = half_plays(plays, inn, b_half)
        on, outs, pas = {}, 0, []
        for p in hp:
            on, runs, names = bases_after(on, p)
            ev = p['result'].get('eventType')
            pas.append({
                'batter': {'id': p['matchup']['batter']['id'], 'name': p['matchup']['batter'].get('fullName')},
                'event': p['result'].get('event'), 'short': short_of(p), 'des': p['result'].get('description'),
                'runs': runs, 'outs': p['count'].get('outs'),
                'bases': sum(1 << (b - 1) for b in on), 'runners': [on.get(b) for b in (1, 2, 3)],
                'hit': ev in HITS, 'err': errors_on(p),
            })
        ls = next((x for x in ld['linescore']['innings'] if x['num'] == inn), None)
        total = ((ls or {}).get('home' if us_home else 'away') or {}).get('runs')
        assert total is not None, f'no line score for {b_half} {inn}'
        assert total == sum(x['runs'] for x in pas), f'{b_half} {inn}: the plays score {sum(x["runs"] for x in pas)}, the line score {total}'
        between.append({'inning': inn, 'half': b_half, 'team': tm['name'], 'abbr': tm.get('abbreviation'),
                        'runs': total, 'pas': pas,
                        'source': f'MLB Stats API live feed /api/v1.1/game/{v["gamePk"]}/feed/live, {b_half} {inn}'})

    # the line score when he came in
    innings = []
    for x in ld['linescore']['innings']:
        if x['num'] > s['inning']:
            break
        a, h = (x.get('away') or {}).get('runs'), (x.get('home') or {}).get('runs')
        innings.append([a, h])
    runs_at = {'away': 0, 'home': 0}
    hits, errs = {'away': 0, 'home': 0}, {'away': 0, 'home': 0}
    for p in plays[:i0]:
        bat = 'away' if p['about']['halfInning'] == 'top' else 'home'
        if p['result'].get('eventType') in HITS:
            hits[bat] += 1
        errs['home' if bat == 'away' else 'away'] += errors_on(p)
    spot = innings[s['inning'] - 1]
    pre = plays[i0 - 1]['result'] if i0 else {'awayScore': 0, 'homeScore': 0}
    before_inning = [sum(x[0] or 0 for x in innings[:s['inning'] - 1]), sum(x[1] or 0 for x in innings[:s['inning'] - 1])]
    if s['half'] == 'top':
        spot[0], spot[1] = pre['awayScore'] - before_inning[0], None
    else:
        spot[1] = pre['homeScore'] - before_inning[1]
    us = 'home' if us_home else 'away'
    them = 'away' if us_home else 'home'
    assert pre[us + 'Score'] == s['score']['us'] and pre[them + 'Score'] == s['score']['them'], 'the score before the spot is not the situation\'s'
    # check the counting over the whole game against the feed's own totals
    th, te = {'away': 0, 'home': 0}, {'away': 0, 'home': 0}
    for p in plays:
        bat = 'away' if p['about']['halfInning'] == 'top' else 'home'
        th[bat] += p['result'].get('eventType') in HITS
        te['home' if bat == 'away' else 'away'] += errors_on(p)
    tot = ld['linescore']['teams']
    hits_ok = all(th[x] == tot[x]['hits'] for x in th)
    errs_ok = all(te[x] == tot[x]['errors'] for x in te)
    line = {'teams': [gd['teams']['away'].get('abbreviation'), gd['teams']['home'].get('abbreviation')], 'innings': innings,
            'H': [hits['away'], hits['home']] if hits_ok else None, 'E': [errs['away'], errs['home']] if errs_ok else None,
            'source': f'MLB Stats API live feed /api/v1.1/game/{v["gamePk"]}/feed/live (linescore, and the plays before his first batter)'}
    # what he did in his halves after the spot's, for the reveal (the spot's own are the verify's)
    later = []
    for hv in halves[1:]:
        for p in half_plays(plays, hv['inning'], hv['half']):
            if p['matchup']['pitcher']['id'] != pid:
                continue
            on_runs = sum(1 for r in p.get('runners', []) if r['movement'].get('end') == 'score' and r['details'].get('isScoringEvent') is not False)
            later.append({'atBat': p['about']['atBatIndex'] + 1, 'batterId': p['matchup']['batter']['id'],
                          'name': p['matchup']['batter'].get('fullName'), 'event': p['result'].get('eventType'),
                          'des': p['result'].get('description'), 'runs': on_runs,
                          'pitches': sum(1 for e in p.get('playEvents', []) if e.get('isPitch')), 'inning': hv['inning']})
    # the real outing under rules 8: the score when his last half ended decides it, unless they went
    # ahead in one of his halves (the spot's verify outcome already says so then)
    lh = half_plays(plays, halves[-1]['inning'], halves[-1]['half'])
    end = lh[-1]['result']
    us_s, them_s = end[('home' if us_home else 'away') + 'Score'], end[('away' if us_home else 'home') + 'Score']
    if v['real']['outcome'] in ('doors_open', 'walk_off'):
        outcome = v['real']['outcome']
    else:
        outcome = 'door_shut' if us_s > them_s else 'tie_held' if us_s == them_s else ('walk_off' if halves[-1]['walkOffLive'] else 'doors_open')
    later_tot = {'outcome': outcome, 'pitches': (v['real']['pitches'] + sum(x['pitches'] for x in later)) if v['real']['pitches'] is not None else None,
                 'runs': v['real']['runs'] + sum(x['runs'] for x in later), 'score': {'us': us_s, 'them': them_s}}
    return halves, lineups, between, line, name_of, later, later_tot


def main(argv):
    for vid in argv[1:]:
        path = os.path.join(VERIFY, vid + '.json')
        v = read_json(path)
        halves, lineups, between, line, names, later, real8 = build(v)
        for h, ids in zip(halves, lineups):
            h['lineupIds'] = ids
            h['lineupNames'] = [names.get(i) for i in ids]
        v['halves'], v['between'], v['line'] = halves, between, line
        v['laterPlateAppearances'] = later
        v['realFull'] = real8
        write_json(path, v)
        log(f'{vid}: {len(halves)} halves ' + ', '.join(f'{h["half"]} {h["inning"]}' for h in halves) +
            '; between ' + ', '.join(f'{b["half"]} {b["inning"]} {b["abbr"]} {b["runs"]} ({len(b["pas"])} PA)' for b in between))


if __name__ == '__main__':
    main(sys.argv)
