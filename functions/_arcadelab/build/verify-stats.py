#!/usr/bin/env python3
"""Drop Board's checked career numbers: content/verified-stats.js.

The Stumpire index carries career stats, and some of them are wrong: it had
Chris Webber at 9,123 rebounds (the record is 8,124), Elton Brand at 8,213
(9,040), Carlos Boozer at 12,842 points (13,976). A board that orders seven
numbers is only as good as the worst of them, so Drop Board does not trust the
index. A slot ships only when this table holds the same number, worked out
from a source a fan can check:

  MLB  the Lahman database (cran/Lahman), Batting and Pitching summed over
       the career. Anybody with a stint outside the AL and NL is left out:
       since 2024 MLB counts the Negro Leagues, so Jackie Robinson has 137
       home runs or 141 depending on where a fan looks.
  NBA  Basketball-Reference season totals (sumitrodatta/bball-reference-datasets),
       NBA and BAA rows, one row a season (the 2TM/3TM total when he was traded).
  NFL  nflverse weekly stats, regular season. They start in 1999, so only a
       career whose rookie season is 1999 or later can be totalled; every
       older career is in MANUAL below, each figure checked by hand.

Run it from a machine that can reach raw.githubusercontent.com and github.com:

  python3 functions/_arcadelab/build/verify-stats.py [cache dir]

It reads the index to decide who could ever be drafted (a retired, uniquely
named player with the stat), finds each one in the source by name and era,
and writes only the people it can place with certainty. A name the source
holds twice in the same era is left out rather than guessed.
"""
import collections, csv, json, os, re, subprocess, sys, unicodedata, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'content', 'verified-stats.js')
CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '.cache')
SRC = {
    'Player_Totals.csv': 'https://raw.githubusercontent.com/sumitrodatta/bball-reference-datasets/master/Data/Player%20Totals.csv',
    'Batting.RData': 'https://raw.githubusercontent.com/cran/Lahman/master/data/Batting.RData',
    'Pitching.RData': 'https://raw.githubusercontent.com/cran/Lahman/master/data/Pitching.RData',
    'People.RData': 'https://raw.githubusercontent.com/cran/Lahman/master/data/People.RData',
    'player_stats.csv': 'https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats.csv',
    'players.csv': 'https://github.com/nflverse/nflverse-data/releases/download/players/players.csv',
}
KEYS = ['mlb_hr', 'mlb_hits', 'mlb_sb', 'mlb_wins', 'mlb_strikeouts', 'nba_points', 'nba_rebounds', 'nba_assists',
        'nfl_passtd', 'nfl_rushyds', 'nfl_recyds']

# NFL careers that began before 1999, which nflverse cannot total: the
# official career lines as Pro Football Reference gives them, written down by
# hand. Each still has to match the index exactly, so a slip in either one
# leaves the player out rather than shipping. A name not here is not offered.
MANUAL = {
    'nfl_passtd': {'Peyton Manning': 539, 'Johnny Unitas': 290, 'John Elway': 300, 'Troy Aikman': 165, 'Drew Bledsoe': 251,
                   'Roger Staubach': 153, 'Sammy Baugh': 187, 'Fran Tarkenton': 342, 'Terry Bradshaw': 212, 'Steve Young': 232,
                   'Steve McNair': 174, 'Dan Marino': 420, 'Joe Montana': 273, 'Brett Favre': 508, 'Jim Kelly': 237,
                   'Warren Moon': 291, 'Kurt Warner': 208, 'Joe Namath': 173},
    'nfl_rushyds': {'Emmitt Smith': 18355, 'Tony Dorsett': 12739, 'Terrell Davis': 7607, 'Marshall Faulk': 12279,
                    'Barry Sanders': 15269, 'Walter Payton': 16726, 'Eric Dickerson': 13259, 'Jerome Bettis': 13662,
                    'Curtis Martin': 14101, 'Thurman Thomas': 12074, 'Franco Harris': 12120, 'Jim Brown': 12312,
                    'Fred Taylor': 11695, 'Corey Dillon': 11241, 'Warrick Dunn': 10967, 'Ricky Williams': 10009,
                    'Eddie George': 10441, 'Earl Campbell': 9407, 'O.J. Simpson': 11236, 'Priest Holmes': 8172},
    'nfl_recyds': {'Jerry Rice': 22895, 'Tim Brown': 14934, 'Cris Carter': 13899, 'Shannon Sharpe': 10060,
                   'Michael Irvin': 11904, 'Steve Largent': 13089, 'Randy Moss': 15292, 'Terrell Owens': 15934,
                   'Isaac Bruce': 15208, 'Marvin Harrison': 14580, 'Tony Gonzalez': 15127, 'Hines Ward': 12083,
                   'Andre Reed': 13198, 'James Lofton': 14004, 'Henry Ellard': 13777, 'Keyshawn Johnson': 10571,
                   'Derrick Mason': 12061, 'Torry Holt': 13382, 'Muhsin Muhammad': 11438, 'Jimmy Smith': 12287},
}


MANUAL_IDS = set()


def fetch():
    os.makedirs(CACHE, exist_ok=True)
    for f, u in SRC.items():
        p = os.path.join(CACHE, f)
        if not os.path.exists(p):
            print('fetching', f)
            urllib.request.urlretrieve(u, p)


norm = lambda s: re.sub(r'[^a-z ]', '', unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower().replace(' jr', '').replace(' sr', '').replace(' iii', '').replace(' ii', '')).strip()


def candidates():
    """Everybody the index could ever put on a board, with the decades it gives them."""
    script = '''
      import(process.argv[1]).then(m => { const d = m.default;
        const n = {}; for (const e of d.entities) if (e.k === 'p') n[e.n] = (n[e.n] || 0) + 1;
        const out = d.entities.filter(e => e.k === 'p' && !e.act && e.st && n[e.n] === 1).map(e => ({ id: e.id, n: e.n, s: e.s, dc: e.dc || [], st: e.st }));
        process.stdout.write(JSON.stringify(out)); });'''
    js = subprocess.run(['node', '-e', script, os.path.join(HERE, '..', '..', '_stumpire', 'data', 'entities.js')],
                        capture_output=True, text=True, check=True).stdout
    return json.loads(js)


def overlaps(dc, first, last):
    return any(d <= last and d + 9 >= first for d in dc)


def mlb(cands):
    import pyreadr
    P = pyreadr.read_r(os.path.join(CACHE, 'People.RData'))['People']
    B = pyreadr.read_r(os.path.join(CACHE, 'Batting.RData'))['Batting']
    T = pyreadr.read_r(os.path.join(CACHE, 'Pitching.RData'))['Pitching']
    other = set(B[~B.lgID.isin(['AL', 'NL'])].playerID) | set(T[~T.lgID.isin(['AL', 'NL'])].playerID)
    years = collections.defaultdict(lambda: [9999, 0])
    for df in (B, T):
        for pid, y in zip(df.playerID, df.yearID):
            r = years[pid]; r[0] = min(r[0], int(y)); r[1] = max(r[1], int(y))
    byname = collections.defaultdict(list)
    for pid, f, l in zip(P.playerID, P.nameFirst.fillna(''), P.nameLast.fillna('')):
        byname[norm(f + ' ' + l)].append(pid)
    bt = B.groupby('playerID')[['H', 'HR', 'SB']].sum()
    pt = T.groupby('playerID')[['W', 'SO']].sum()
    col = {'mlb_hits': (bt, 'H'), 'mlb_hr': (bt, 'HR'), 'mlb_sb': (bt, 'SB'), 'mlb_wins': (pt, 'W'), 'mlb_strikeouts': (pt, 'SO')}
    out = collections.defaultdict(dict)
    for e in cands:
        if e['s'] != 'MLB': continue
        ids = [p for p in byname.get(norm(e['n']), []) if p in years and overlaps(e['dc'], *years[p])]
        if len(ids) != 1 or ids[0] in other: continue
        for k, (df, c) in col.items():
            if k in e['st'] and ids[0] in df.index:
                out[k][e['id']] = int(df.loc[ids[0], c])
    return out


def nba(cands):
    seasons = collections.defaultdict(lambda: collections.defaultdict(dict))  # player_id -> season -> team -> row
    names = collections.defaultdict(set)
    for r in csv.DictReader(open(os.path.join(CACHE, 'Player_Totals.csv'))):
        if r['lg'] not in ('NBA', 'BAA'): continue
        seasons[r['player_id']][int(r['season'])][r['team']] = r
        names[norm(r['player'])].add(r['player_id'])
    def total(pid, stat):
        s = 0
        for teams in seasons[pid].values():
            row = next((teams[t] for t in teams if t == 'TOT' or re.match(r'\dTM$', t)), None)
            if row is None:
                if len(teams) != 1: return None
                row = next(iter(teams.values()))
            s += int(float(row[stat] or 0))
        return s
    out = collections.defaultdict(dict)
    for e in cands:
        if e['s'] != 'NBA': continue
        ids = [p for p in names.get(norm(e['n']), []) if overlaps(e['dc'], min(seasons[p]) - 1, max(seasons[p]))]
        if len(ids) != 1: continue
        for k, c in (('nba_points', 'pts'), ('nba_rebounds', 'trb'), ('nba_assists', 'ast')):
            if k in e['st']:
                v = total(ids[0], c)
                if v is not None: out[k][e['id']] = v
    return out


def nfl(cands):
    rookie, names = {}, collections.defaultdict(set)
    for r in csv.DictReader(open(os.path.join(CACHE, 'players.csv'))):
        y = r['rookie_season'] or r['draft_year']
        rookie[r['gsis_id']] = int(y) if y else None
        names[norm(r['display_name'])].add(r['gsis_id'])
    tot = collections.defaultdict(lambda: collections.Counter())
    for r in csv.DictReader(open(os.path.join(CACHE, 'player_stats.csv'))):
        if r['season_type'] != 'REG': continue
        t = tot[r['player_id']]
        for k, c in (('nfl_passtd', 'passing_tds'), ('nfl_rushyds', 'rushing_yards'), ('nfl_recyds', 'receiving_yards')):
            t[k] += int(float(r[c] or 0))
    out = collections.defaultdict(dict)
    for e in cands:
        if e['s'] != 'NFL': continue
        for k, m in MANUAL.items():
            if e['n'] in m and k in e['st']: out[k][e['id']] = m[e['n']]; MANUAL_IDS.add(e['id'])
        ids = [g for g in names.get(norm(e['n']), []) if g in tot]
        if len(ids) != 1 or not rookie.get(ids[0]) or rookie[ids[0]] < 1999: continue
        for k in ('nfl_passtd', 'nfl_rushyds', 'nfl_recyds'):
            if k in e['st'] and e['id'] not in out[k]: out[k][e['id']] = tot[ids[0]][k]
    return out


def main():
    fetch()
    cands = candidates()
    out = {}
    for part in (mlb(cands), nba(cands), nfl(cands)):
        for k, v in part.items(): out[k] = dict(sorted(v.items()))
    # Two sources must agree: the index and the checked source. A
    # disagreement leaves the player out, whichever side is wrong, and is
    # printed so it can be read. nflverse is built from play-by-play and
    # drifts a little from the official record (it has Larry Fitzgerald at
    # 17,524 receiving yards; the record is 17,492), so for the NFL the
    # index's number is kept when the two are within NFL_SLACK of each other.
    by = {e['id']: e for e in cands}
    NFL_SLACK = lambda a: max(1, round(a * 0.003))
    agreed = {}
    for k in KEYS:
        v, keep = out.get(k, {}), {}
        for i, x in v.items():
            ix = by[i]['st'].get(k)
            if ix == x or (k.startswith('nfl') and isinstance(ix, int) and abs(ix - x) <= NFL_SLACK(ix) and i not in MANUAL_IDS):
                keep[i] = ix
            else:
                print(f'  left out {k} {by[i]["n"]}: index {ix}, source {x}')
        agreed[k] = dict(sorted(keep.items()))
        print(f'{k:16} {len(keep):5} agreed of {len(v)}')
    out = agreed
    body = json.dumps({k: out.get(k, {}) for k in KEYS}, separators=(',', ':'))
    with open(OUT, 'w') as f:
        f.write('/* Written by build/verify-stats.py: every career number Drop Board may show,\n'
                '   agreed by the Stumpire index and a source a fan can check. Do not edit by hand. */\n'
                'export default ' + body + ';\n')
    print('wrote', os.path.relpath(OUT))


if __name__ == '__main__':
    main()
