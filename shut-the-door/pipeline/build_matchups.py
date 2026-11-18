"""Build the custom challenges' matchups: every pack's pitcher against every pack's lineup.

  python3 build_matchups.py                          every pair of the committed packs
  python3 build_matchups.py --pitchers A,B --lineups C,D
  python3 build_matchups.py --check-own              each pack's own pitcher against its own
                                                     lineup, compared with the committed pack

Writes cache/matchups/stage/<pitcher>__<lineup>.json, a pack before pool.js. node
../matchups.js adds the hold table, the rules 2 centre and the pro examples.

A MATCHUP is a pack of one half: pitcher P as his pack has him (his arsenal, its command,
his release) against the first nine of lineup Q's pack, in Q's batting order. Its outcome
tables come from the pitch library by the same model the packs use (model.py), with each
side read in its own era:

  his pitches     the league's outcomes on pitches like each of his (type, hand, within
                  VELO_BAND of his speed) in HIS window, as in his own pack
  the hitter      his own pitches against P's hand and the similar batters', in HIS
                  pack's batter window, as in his own pack
  the hitter's lean is measured against the league of HIS pack's window (that hand), the
                  league his own numbers were drawn from. For a pack's own pair every
                  window is its pack's, so the tables are the pack's own (--check-own).

A switch hitter bats from the side away from P's hand. Each hitter keeps his own zone,
stance, name and season line from Q's pack; his profile and notes are read again against
P's arsenal and hand, as build_packs.py reads them. The running game is P's pack's (its
era's rates, his pickoff, his catcher) with Q's runners. Nothing is typed in: a pair whose
cell keeps no real pitch is widened as build_packs.py widens it, and a pair that still
cannot be built is reported and left out.
"""

import hashlib
import json
import os
import pickle
import sys
import time
from collections import defaultdict

import numpy as np

import build_packs as BP
import model as M
import prep
import retro
import statsapi
from common import CACHE, GAME, VERIFY, log, read_json

PACKS = os.path.join(GAME, 'data', 'packs')
STAGE = os.path.join(CACHE, 'matchups', 'stage')
PDIR = os.path.join(CACHE, 'matchups', 'pitchers')
NINE = 9
TABLE_LEAD = 3
SLOW = '--slow-check' in sys.argv     # each record against build_packs.batter_record too
# Retrosheet team codes the proxy spots name (the four before 2008), to full names
RETRO_NAMES = dict(BP.RETRO_TEAM, SLN='St. Louis Cardinals', COL='Colorado Rockies')


def pitcher_path(pid):
    """A pitcher's pieces on disk, named by his pack's bytes and this file's, so neither can go stale."""
    h = hashlib.sha1()
    for f in (os.path.join(PACKS, pid + '.json'), __file__, M.__file__, BP.__file__):
        with open(f, 'rb') as fh:
            h.update(fh.read())
    return os.path.join(PDIR, f'{pid}-{h.hexdigest()[:12]}.pkl')


def read_pack(pid):
    with open(os.path.join(PACKS, pid + '.json')) as fh:
        return json.load(fh)


def spec_of(pid):
    for s in read_json(os.path.join(GAME, 'scenarios', 'scenarios.json'))['scenarios']:
        if s['id'] == pid:
            return s
    raise KeyError(pid)


def teams_of(v):
    """(away, home) full names from a verify file's game line."""
    g = v['game'].split(': ', 1)[-1]
    a, h = g.split(' at ')
    return RETRO_NAMES.get(a, a), RETRO_NAMES.get(h, h)



# ---- the same picks and records, faster -----------------------------------------------
#
# A pair repeats the pack builder's pandas filters thousands of times over the same frames.
# These index each frame once and give exactly what model.pick_exemplar and
# build_packs.batter_record give (the own-pair check compares every pick and every record).

SORT = ['game_pk', 'at_bat_number', 'pitch_number']
# what a pick reads (the group, the speed) and what model.pitch_row writes
POOL_COLS = SORT + ['cell', 'key', 'release_speed', 'res', 'bb', 'launch_speed', 'launch_angle', 'spray']


class Grouped:
    """A prepped frame indexed by (cell, key), each group in model.pick_exemplar's sort order."""

    def __init__(self, f):
        self.f = f.reset_index(drop=True)
        self.velo = self.f['release_speed'].to_numpy(dtype=float)
        self.g = {}
        if len(self.f):
            order = self.f.sort_values(SORT, kind='mergesort').index.to_numpy()
            cells = self.f['cell'].to_numpy()[order]
            keys = self.f['key'].to_numpy()[order]
            buckets = defaultdict(list)
            for i, c, k in zip(order, cells, keys):
                buckets[(int(c), k)].append(i)
            self.g = {k: np.array(v) for k, v in buckets.items()}
            dup = self.f.duplicated(SORT).any()
            if dup:
                raise RuntimeError('a pool with the same pitch twice: the pick order would not be the pack builder\'s')


def pick_grouped(pools, bi, ptype, cell, key, velo):
    """model.pick_exemplar over Grouped pools."""
    for tier, G in pools:
        idx = G.g.get((cell, key))
        if idx is None or not len(idx):
            continue
        near = idx[np.abs(G.velo[idx] - velo) <= M.VELO_EX]
        c = near if len(near) else (idx if tier == 2 else near)
        if not len(c):
            continue
        i = M.stable_pick(len(c), ptype, cell, key, tier, bi if tier < 2 else 'league')
        return G.f.iloc[int(c[i])], tier
    return None, None


class LeagueSide:
    """build_packs.batter_record's league numbers for one hand and side, computed once."""

    def __init__(self, lg, stand):
        L = lg[lg['stand'] == stand]
        self.L = L
        z_l = prep.in_zone(L['cell'].values)
        self.lg_chase = float(L[~z_l]['swing'].mean())
        self.lg_zs = float(L[z_l]['swing'].mean())
        self.cell = []
        for c in range(25):
            lc = L[L['cell'] == c]
            ldm = lc['damage'].dropna()
            self.cell.append((float(ldm.mean()) if len(ldm) else 0.3, float(lc['swing'].mean()) if len(lc) else 0.4))
        self.by_t = {}

    def t(self, t):
        if t not in self.by_t:
            L = self.L
            lsw = L[(L['pitch_type'] == t) & L['swing']]
            self.by_t[t] = {'lsw': lsw, 'lw': float((lsw['key'] == 'swinging_strike').mean()) if len(lsw) else 0.25,
                            }
        return self.by_t[t]


class Record:
    """build_packs.batter_record for one hitter against one hand: the parts no pitch type
    touches once, and each type's whiff and note candidates once."""

    def __init__(self, meta, ppl, mine, sim, side, stand, n_mine, nb, proxy, year):
        self.meta, self.stand, self.proxy, self.year, self.side = meta, stand, proxy, year, side
        p = ppl.get(meta.get('mlbam'), {}) if meta.get('mlbam') else {}
        self.name = p.get('fullName') or meta.get('retro')
        self.line = statsapi.season_line(p, 'hitting') if p else None
        self.tier = 'batter' if n_mine >= M.MIN_BATTER_PITCHES else ('similar' if nb else 'league')
        base = mine if self.tier == 'batter' else sim
        self.base = base
        z_b = prep.in_zone(base['cell'].values) if len(base) else np.array([], dtype=bool)
        self.chase = BP.rate(base[~z_b]['swing'].sum() if len(base) else 0, (~z_b).sum(), side.lg_chase, 50)
        self.zswing = BP.rate(base[z_b]['swing'].sum() if len(base) else 0, z_b.sum(), side.lg_zs, 50)
        self.heat, self.swing = [], []
        for c in range(25):
            l_d, l_s = side.cell[c]
            bc = base[base['cell'] == c] if len(base) else base
            bdm = bc['damage'].dropna() if len(bc) else bc
            self.heat.append(round(BP.rate(bdm.sum() if len(bdm) else 0, len(bdm), l_d, 8), 3))
            self.swing.append(round(BP.rate(bc['swing'].sum() if len(bc) else 0, len(bc), l_s, 15), 3))
        self.two = base[base['bucket'] == 3] if len(base) else base
        self.by_t = {}

    def t(self, t):
        if t in self.by_t:
            return self.by_t[t]
        base, side, stand = self.base, self.side, self.stand
        lt = side.t(t)
        bsw = base[(base['pitch_type'] == t) & base['swing']] if len(base) else base
        whiff = round(BP.rate((bsw['key'] == 'swinging_strike').sum() if len(bsw) else 0, len(bsw), lt['lw'], 30), 3)
        cand = []
        if not (self.proxy or self.tier != 'batter' or not len(base)):
            # build_packs.notes_of's body for one pitch type, in its order
            L = side.L
            two = self.two
            nm = prep.NAME[t]
            for cells, where in ((BP.CHASE_DOWN_AWAY[stand], 'down and away'), (BP.CHASE_DOWN, 'in the dirt'), (BP.CHASE_UP, 'up out of the zone')):
                d = two[(two['pitch_type'] == t) & two['cell'].isin(cells)]
                ld = L[(L['bucket'] == 3) & (L['pitch_type'] == t) & L['cell'].isin(cells)]
                if len(d) >= 15 and len(ld) >= 100:
                    r, lr = d['swing'].mean(), ld['swing'].mean()
                    if r <= lr:
                        continue
                    cand.append((abs(r - lr), r > lr, {'text': f'chases {nm}s {where} {round(r * 100)}% with two strikes',
                                                       'type': t, 'cells': list(cells), 'good': True}))
            sw = base[(base['pitch_type'] == t) & base['swing']]
            lsw = lt['lsw']
            if len(sw) >= 40:
                w, lw = (sw['key'] == 'swinging_strike').mean(), (lsw['key'] == 'swinging_strike').mean()
                txt = (f'whiffs on {round(w * 100)}% of his swings at {nm}s' if w > lw
                       else f'misses only {round(w * 100)}% of his swings at {nm}s')
                cand.append((abs(w - lw), w > lw, {'text': txt, 'type': t,
                                                   'cells': list(range(25)), 'good': bool(w > lw)}))
            for cells, where in ((BP.INSIDE[stand], 'inside'), (BP.AWAY[stand], 'away'), ([7, 12, 17], 'over the middle')):
                ip = base[(base['pitch_type'] == t) & base['cell'].isin(cells) & base['damage'].notna()]
                lip = L[(L['pitch_type'] == t) & L['cell'].isin(cells) & L['damage'].notna()]
                if len(ip) >= 20 and len(lip) >= 200:
                    dmg, ldm = ip['damage'].mean(), lip['damage'].mean()
                    txt = f'{"%.3f" % dmg}'.lstrip('0')
                    cand.append((abs(dmg - ldm) * 0.6, dmg > ldm,
                                 {'text': f'{txt} xwoba on contact against {nm}s {where}', 'type': t, 'cells': list(cells),
                                  'good': bool(dmg < ldm)}))
        self.by_t[t] = (whiff, cand)
        return self.by_t[t]

    def record(self, ars):
        whiff, cand = {}, []
        for a in ars:
            w, c = self.t(a['type'])
            whiff[a['type']] = w
            cand.extend(c)
        notes, nf = [], []
        if self.proxy or self.tier != 'batter' or not len(self.base):
            if self.line:
                notes.append(f'hit {self.line.split(",")[0]} in {self.year}')
        else:
            cand.sort(key=lambda c: -c[0])
            for _, _, n in cand[:4]:
                notes.append(n['text'])
                nf.append(n)
            if not notes and self.line:
                notes.append(f'hit {self.line.split(",")[0]} in {self.year}')
        return {'profileTier': self.tier,
                'profile': {'chase': round(self.chase, 3), 'zoneSwing': round(self.zswing, 3), 'whiff': whiff, 'heat': self.heat,
                            'swing': self.swing, 'notes': notes, 'notesFor': nf}}

# ---- the pitcher's side ----------------------------------------------------------

class Pitcher:
    """P's league pieces, per pitch type and batter side, from his own window."""

    def __init__(self, pid):
        self.id = pid
        self.pack = read_pack(pid)
        sc = self.pack['scenario']
        self.proxy = sc['resolution'] == 'proxy'
        self.hand = sc['pitcher']['throws']
        self.year = int(sc['pitcher']['year'])
        y = self.year
        self.window = BP.PROXY_WINDOW if self.proxy else [x for x in (y - 1, y, y + 1) if 2008 <= x <= 2025]
        self.ars = sc['pitcher']['arsenal']
        lg = BP.seasons(self.window)
        lg = lg[lg['p_throws'] == self.hand]
        self.by_type = {}
        for a in self.ars:
            t = lg[lg['pitch_type'] == a['type']]
            stuff = t[(t['release_speed'] - a['velo']).abs() <= M.VELO_BAND]
            self.by_type[a['type']] = {s: {'type': M.count_cells(t[t['stand'] == s]),
                                           'stuff': M.count_cells(stuff[stuff['stand'] == s]),
                                           'pool': Grouped(t[(t['stand'] == s) & ((t['release_speed'] - a['velo']).abs() <= M.VELO_EX)][POOL_COLS])}
                                       for s in ('L', 'R')}
        self.wide_cache = {}
        self.wide_grouped = {}

    @staticmethod
    def window_of(pid):
        sc = read_pack(pid)['scenario']
        y = int(sc['pitcher']['year'])
        return BP.PROXY_WINDOW if sc['resolution'] == 'proxy' else [x for x in (y - 1, y, y + 1) if 2008 <= x <= 2025]

    def wide(self, t, stand_, velo):
        """build_packs.py's widened league pool: every season, the same type, hand and side."""
        if t not in self.wide_cache:
            years = list(range(2008, 2026))
            df = prep.load(years, where=f"pitch_type = '{t}' AND p_throws = '{self.hand}' AND release_speed BETWEEN {velo - M.VELO_EX} AND {velo + M.VELO_EX}", cols=BP.COLS)
            p_ = prep.prep(df)
            self.wide_cache[t] = p_[p_['pitch_type'].isin(prep.PITCH_TYPES)][BP.KEEP_PREP].reset_index(drop=True)
        w = self.wide_cache[t]
        k = (t, stand_)
        if k not in self.wide_grouped:
            self.wide_grouped[k] = Grouped(w[w['stand'] == stand_])
        return self.wide_grouped[k]


# ---- the lineup's side -------------------------------------------------------------

class Lineup:
    """Q's first nine, with everything about each hitter that does not depend on the pitcher."""

    def __init__(self, qid):
        self.id = qid
        self.pack = read_pack(qid)
        sc = self.pack['scenario']
        self.spec = spec_of(qid)
        self.v = read_json(os.path.join(VERIFY, self.spec['verify'] + '.json'))
        self.proxy = sc['resolution'] == 'proxy'
        self.year = int(sc['pitcher']['year'])
        y = self.year
        self.window = BP.PROXY_WINDOW if self.proxy else [x for x in (y - 1, y, y + 1) if 2008 <= x <= 2025]
        self.bat_window = [] if self.proxy else [x for x in (y - 1, y) if x >= 2008]
        halves = sc.get('halves')
        order = halves[0]['lineup'] if halves else list(range(len(sc['batters'])))
        self.order = order[:NINE]
        self.batters = [sc['batters'][i] for i in self.order]
        away, home = teams_of(self.v)
        self.team = away if self.v['situation']['usHome'] else home
        # one frame of the window. The batter window is its first seasons and a proxy's window is
        # PROXY_WINDOW itself, so each is cut from it in the order BP.seasons would give it
        lg = self.all = BP.seasons(self.window)
        BP._SEASONS.clear()           # the frame holds them now: a lineup never keeps two copies
        self.lg = {h: lg[lg['p_throws'] == h] for h in ('L', 'R')}
        self.fam = {h: {s: M.count_groups(self.lg[h][self.lg[h]['stand'] == s]) for s in ('L', 'R')} for h in ('L', 'R')}
        if self.proxy:
            self._proxy_people()
        else:
            ids = [int(b['id']) for b in sc['batters']]          # the pack's own list, so its cached people answer
            self.ppl = statsapi.people(ids, season=self.year)
            self.bw_all = lg[lg['game_year'].isin(self.bat_window)].reset_index(drop=True)
            feats = M.batter_features(self.bw_all)
            self.feats = feats[feats['n'] >= 500]
        self.hitters = [self._hitter(bi, b) for bi, b in enumerate(self.batters)]
        self.sides = {(h, s): LeagueSide(self.lg[h], s) for h in ('L', 'R') for s in ('L', 'R')}
        del self.all, lg
        if not SLOW:
            del self.lg
            self.bw_all = None

    @staticmethod
    def windows_of(qid):
        """Every season a lineup reads: its league window, its batters' and the proxy window."""
        sc = read_pack(qid)['scenario']
        return set(Pitcher.window_of(qid)) | (set(BP.PROXY_WINDOW) if sc['resolution'] == 'proxy' else set())

    def side(self, hand, stand):
        if (hand, stand) not in self.sides:
            self.sides[(hand, stand)] = LeagueSide(self.lg[hand], stand)
        return self.sides[(hand, stand)]

    def record(self, h, hand, stand):
        k = ('rec', hand, stand)
        if k not in h:
            meta = dict(h['meta'], bats=stand)
            h[k] = Record(meta, self.ppl, h['mine'][hand], h['sim'][hand], self.side(hand, stand), stand,
                          len(h['mine'][hand]), h['nb'], self.proxy, self.year)
        return h[k]

    def grouped(self, h, hand, t):
        k = ('g', hand, t)
        if k not in h:
            mine, sim = h['mine'][hand], h['sim'][hand]
            h[k] = (Grouped(mine[mine['pitch_type'] == t]), Grouped(sim[sim['pitch_type'] == t]))
        return h[k]

    def _proxy_people(self):
        cand = next(c for c in read_json(os.path.join(os.path.dirname(__file__), 'candidates.json'))['proxy']
                    if c['id'] == self.v['id'])
        sc = self.pack['scenario']
        rids = [b['id'].replace('retro:', '') for b in sc['batters']]
        mlb = retro.retro_to_mlbam(set(rids))
        self.ros = retro.rosters(cand['season'], [cand['game'][:3], self.v['game'].split(' at ')[0]])
        self.mlb = mlb
        self.ppl = statsapi.people([mlb[r] for r in rids if mlb.get(r)], season=self.year)
        lines = M.season_lines(self.all)
        self.lines = lines[lines['pa'] >= 300]

    def _hitter(self, bi, b):
        """Everything about one hitter that P does not change: his meta, his neighbours, his
        own pitches and the similar batters' (both hands), and whether he switch hits."""
        h = {'bi': bi, 'pack': b}
        if self.proxy:
            rid = b['id'].replace('retro:', '')
            mlbam = self.mlb.get(rid)
            h['meta'] = {'retro': rid, 'mlbam': mlbam}
            h['switch'] = self.ros.get(rid, {}).get('bats') == 'B'
            h['side'] = self.ros.get(rid, {}).get('bats')
            p = self.ppl.get(mlbam, {}) if mlbam else {}
            st = BP.season_stat(p)
            if st:
                row = {'avg': st['avg'], 'obp': st['obp'], 'slg': st['slg'], 'hr_pa': st['hr'] / max(1, st['pa'])}
                nb = M.nearest(self.lines, row, cols=M.LINE_FEATS)
            else:
                nb = []
            h['nb'] = nb
            sim_all = self.all
            sim_all = sim_all[sim_all['batter'].isin(nb)] if nb else sim_all.iloc[0:0].copy()
            h['mine'] = {x: self.lg[x].iloc[0:0].copy() for x in ('L', 'R')}
            h['sim'] = {x: sim_all[sim_all['p_throws'] == x] if nb else self.lg[x].iloc[0:0].copy() for x in ('L', 'R')}
        else:
            bid = int(b['id'])
            h['meta'] = {'mlbam': bid}
            p = self.ppl.get(bid, {})
            code = (p.get('batSide') or {}).get('code')
            h['switch'] = code == 'S'
            allb = self.bw_all[self.bw_all['batter'] == bid]
            if code in ('L', 'R'):
                h['side'] = code
            else:
                h['side'] = allb['stand'].mode().iloc[0] if len(allb) else (code or 'R')
            if bid in self.feats.index:
                nb = M.nearest(self.feats, self.feats.loc[bid], exclude=bid)
            elif len(allb) >= 100:
                nb = M.nearest(self.feats, M.batter_features(allb).iloc[0])
            else:
                nb = []
            h['nb'] = nb
            sim_all = self.bw_all[self.bw_all['batter'].isin(nb)] if nb else None
            h['mine'] = {x: allb[allb['p_throws'] == x] for x in ('L', 'R')}
            h['sim'] = {x: sim_all[sim_all['p_throws'] == x] if nb else self.lg[x].iloc[0:0].copy() for x in ('L', 'R')}
        h['B'] = {x: M.count_groups(h['mine'][x]) for x in ('L', 'R')}
        h['S'] = {x: M.count_groups(h['sim'][x]) for x in ('L', 'R')}
        return h

    def bats(self, h, hand):
        """His side against a pitcher of this hand. The side he batted in Q's game is kept when
        that game's pitcher threw with this hand (the pack's own answer)."""
        if h['switch']:
            return 'L' if hand == 'R' else 'R'
        if hand == self.pack['scenario']['pitcher']['throws']:
            return h['pack']['bats']
        return h['side'] if h['side'] in ('L', 'R') else h['pack']['bats']


# ---- one pair ------------------------------------------------------------------------

def build_pair(P, Q, adv):
    hand = P.hand
    pitches, pidx = [], {}

    def add_pitch(r):
        row = M.pitch_row(r)
        if row[0] not in pidx:
            pidx[row[0]] = len(pitches)
            pitches.append(row)
        return pidx[row[0]]

    library, batters, tiers_used, wide_cells = [], [], defaultdict(int), []
    for h in Q.hitters:
        bi = h['bi']
        s = Q.bats(h, hand)
        mine, sim_rows = h['mine'][hand], h['sim'][hand]
        B, S = h['B'][hand], h['S'][hand]
        lib = {}
        for a in P.ars:
            t = a['type']
            L = P.by_type[t][s]
            prob = M.outcome_table(L['stuff'], L['type'], Q.fam[hand][s], B, S, t)
            gm, gs = Q.grouped(h, hand, t)
            pools = [(0, gm), (1, gs), (2, L['pool'])]
            pm = np.zeros((25, 4, M.NK), dtype=int)
            xs = []

            def fill(cell, cell_pools):
                # build_packs.py build_one's fill, line for line
                xcell = [-1] * M.NK
                tried = set()
                while True:
                    for b in range(4):
                        if prob[cell, b].sum() <= 0:
                            raise BP.EmptyRow(f'empty outcome row {P.id} x {Q.id} batter {bi} {t} cell {cell}')
                        pm[cell, b] = M.permille(prob[cell, b])
                    todo = [k for k in range(M.NK) if pm[cell, :, k].any() and xcell[k] < 0 and k not in tried]
                    if not todo:
                        break
                    for k in todo:
                        tried.add(k)
                        r, tier = pick_grouped(cell_pools, bi, t, cell, prep.KEYS[k], a['velo'])
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
                return xcell

            for cell in range(25):
                kept_row, kept_tiers = prob[cell].copy(), dict(tiers_used)
                try:
                    xcell = fill(cell, pools)
                except BP.EmptyRow:
                    prob[cell] = kept_row
                    tiers_used.clear()
                    tiers_used.update(kept_tiers)
                    xcell = fill(cell, pools + [(2, P.wide(t, s, a['velo']))])
                    wide_cells.append(f'{bi}:{t}:{cell}')
                xs.append(xcell)
            lib[t] = {'p': pm.tolist(), 'x': xs}
        library.append(lib)
        meta = dict(h['meta'], bats=s)
        rec = Q.record(h, hand, s).record(P.ars)
        if SLOW:
            slow = BP.batter_record(meta, Q.ppl, mine, sim_rows, Q.lg[hand], P.ars, s, len(mine), h['nb'], Q.proxy, Q.year, hand)
            if slow['profile'] != rec['profile'] or slow['profileTier'] != rec['profileTier']:
                raise RuntimeError(f'the fast record differs from build_packs.batter_record: {P.id} x {Q.id} batter {bi}')
        # his own name, line, zone and stance, as Q's pack has them; the profile is P's
        out = {k: v for k, v in h['pack'].items() if k not in ('profile', 'profileTier', 'bats')}
        out.update(bats=s, profileTier=rec['profileTier'], profile=rec['profile'])
        batters.append(out)

    psc, qsc = P.pack['scenario'], Q.pack['scenario']
    us_home = False
    sc = {
        'id': f'{P.id}__{Q.id}', 'day': None, 'number': None,
        'title': f'{psc["pitcher"]["name"]} vs the {Q.year} {Q.team}',
        'setup': '',
        'matchup': {'pitcher': P.id, 'lineup': Q.id, 'lineupTeam': Q.team, 'lineupYear': Q.year,
                    'proxyPitcher': P.proxy, 'proxyLineup': Q.proxy},
        'pitcher': psc['pitcher'],
        # the default start the table and the rules 2 centre are measured from; a challenge
        # replaces it with its own (challenge.js), and every start it can pick is in the table
        'situation': {'inning': 9, 'half': 'bottom', 'outs': 0, 'bases': 0, 'score': {'us': TABLE_LEAD, 'them': 0},
                      'usHome': us_home, 'walkOffLive': True},
        'tableLead': TABLE_LEAD,
        'batters': batters,
        'realFaced': None,
        'resolution': 'proxy' if (P.proxy or Q.proxy) else 'real',
        'sources': [x for x in psc['sources'] if x.startswith('arsenal') or 'arsenal' in x or 'reporting' in x]
                   + [f'the hitters: {Q.team}, {Q.year}, from the pack {Q.id}'] + [
                     'outcomes: the pitch library (Baseball Savant), pipeline/build_matchups.py'],
    }
    pk = {'v': 2, 'keys': prep.KEYS, 'scenario': sc, 'kernelZoneFt': P.pack['kernelZoneFt'], 'pitches': pitches,
          'library': library, 'advance': adv, 'reveal': None,
          'build': {'window': P.window, 'batterWindow': Q.bat_window, 'leanWindow': Q.window, 'tiers': dict(tiers_used),
                    **({'wideCells': len(wide_cells)} if wide_cells else {})}}
    # the running game: P's spot (its era, his pickoff, his catcher) with Q's runners
    st = P.pack.get('steal')
    if st:
        qst = Q.pack.get('steal') or {}
        keep = {str(b['id']) for b in batters}
        pk['steal'] = dict(st, runners={k: v for k, v in (qst.get('runners') or {}).items() if k in keep}, start={})
        pk['steal'].pop('halves', None)
    return pk


def own_check(P, Q, pk):
    """A pack's own pair against the committed pack: the same tables, the same real pitches."""
    pack = Q.pack
    bad = 0
    for bi in range(len(Q.order)):
        i = Q.order[bi]
        for t, e in pack['library'][i].items():
            mine = pk['library'][bi][t]
            if e['p'] != mine['p']:
                bad += 1
                log(f'   p differs: batter {bi} {t}')
                continue
            for c in range(25):
                for k in range(M.NK):
                    a, b = e['x'][c][k], mine['x'][c][k]
                    if (a < 0) != (b < 0) or (a >= 0 and (pack['pitches'][a // 3][0] != pk['pitches'][b // 3][0] or a % 3 != b % 3)):
                        bad += 1
        pb, mb = pack['scenario']['batters'][i], pk['scenario']['batters'][bi]
        if pb['bats'] != mb['bats'] or pb['profile'] != mb['profile'] or pb['profileTier'] != mb['profileTier']:
            bad += 1
            log(f'   batter {bi} record differs')
    return bad


def main(argv):
    os.makedirs(STAGE, exist_ok=True)
    def arg(name):
        return argv[argv.index(name) + 1].split(',') if name in argv else None
    ids = sorted(f[:-5] for f in os.listdir(PACKS) if f.endswith('.json'))
    ps, qs = arg('--pitchers') or ids, arg('--lineups') or ids
    own = '--check-own' in argv
    skip = '--skip-built' in argv
    adv = BP.advance_table()
    t0 = time.time()
    # --shard i/n: this process builds every n-th lineup from the i-th (several run side by side)
    if '--shard' in argv:
        i, n = (int(x) for x in argv[argv.index('--shard') + 1].split('/'))
        qs = qs[i::n]
    todo = [(p, q) for q in qs for p in ([q] if own else ps)
            if not (skip and os.path.exists(os.path.join(STAGE, f'{p}__{q}.json')))]
    need_p = sorted({p for p, _ in todo}, key=lambda x: (read_pack(x)['scenario']['pitcher']['year'], x))
    # every pitcher's league pieces once, oldest first, each season let go once no later one reads it
    # Each pitcher's pieces are built once and kept on disk (cache/matchups/pitchers): thirty of
    # them in memory are several GB, more than a runner has. --keep N holds up to N in memory
    # as well (a machine with room); a pair loads its pitcher from disk otherwise, about a second.
    os.makedirs(PDIR, exist_ok=True)
    keep = int(argv[argv.index('--keep') + 1]) if '--keep' in argv else 0
    pitchers = {}
    for k, p in enumerate(need_p):
        path = pitcher_path(p)
        if not os.path.exists(path):
            P = Pitcher(p)
            with open(path + '.tmp', 'wb') as fh:
                pickle.dump(P, fh, protocol=pickle.HIGHEST_PROTOCOL)
            os.replace(path + '.tmp', path)
            if len(pitchers) < keep:
                pitchers[p] = P
            del P
        nxt = set(Pitcher.window_of(need_p[k + 1])) if k + 1 < len(need_p) else set()
        for y in list(BP._SEASONS):
            if y not in nxt:
                del BP._SEASONS[y]
    BP._SEASONS.clear()
    log(f'{len(need_p)} pitchers ready, {time.time() - t0:.0f} s')

    def pitcher(p):
        if p in pitchers:
            return pitchers[p]
        with open(pitcher_path(p), 'rb') as fh:
            P = pickle.load(fh)
        if len(pitchers) < keep:
            pitchers[p] = P
        return P
    bad_total, built, failed = 0, 0, []
    lineups = sorted({q for _, q in todo}, key=lambda x: (read_pack(x)['scenario']['pitcher']['year'], x))
    for k, q in enumerate(lineups):
        tq = time.time()
        Q = Lineup(q)
        log(f'== lineup {q}: {Q.team} {Q.year}, {time.time() - tq:.0f} s')
        for p in [p for p, qq in todo if qq == q]:
            out = os.path.join(STAGE, f'{p}__{q}.json')
            P = pitcher(p)
            tp = time.time()
            try:
                pk = build_pair(P, Q, adv)
            except BP.EmptyRow as e:
                failed.append(f'{p}__{q}: {e}')
                log(f'   LEFT OUT {p} x {q}: {e}')
                continue
            if own:
                bad = own_check(P, Q, pk)
                bad_total += bad
                log(f'   own check {q}: {"the same" if not bad else str(bad) + " differences"}')
            tmp = out + '.tmp'
            with open(tmp, 'w') as fh:
                json.dump(pk, fh, separators=(',', ':'))
            os.replace(tmp, out)
            built += 1
            log(f'   {p} x {q}: {time.time() - tp:.1f} s, {len(pk["pitches"])} pitches, tiers {pk["build"]["tiers"]}')
        nxt = set(Lineup.windows_of(lineups[k + 1])) if k + 1 < len(lineups) else set()
        for y in list(BP._SEASONS):
            if y not in nxt:
                del BP._SEASONS[y]
        for P in pitchers.values():
            P.wide_cache.clear()
            P.wide_grouped.clear()
        P = None
    log(f'built {built} pairs in {time.time() - t0:.0f} s; left out {len(failed)}')
    for f in failed:
        log('  ' + f)
    with open(os.path.join(CACHE, 'matchups', 'failed.json'), 'w') as fh:
        json.dump(failed, fh, indent=1)
    if own and bad_total:
        sys.exit(f'{bad_total} differences from the committed packs')


if __name__ == '__main__':
    main(sys.argv)
