"""The plays that end a half inning, from the real play by play.

advance.py follows runners by their ids from one plate appearance to the next.
When a ball in play ends the half there is no next plate appearance in that
half, so who was out, who scored and where the rest stood is not in the pitch
data. Until 2026-10-24 advance.py wrote those plays by a rule (the batter out,
then the runners nearest him), and dropped their runs. That rule broke MLB
rules: a two-out hit "with the batter out" kept the runner from first on
first, so the batter had passed him, and a run that crossed before a tag play
third out (Official Baseball Rules 5.08(a): it counts) was thrown away.

Here every such play is read from Savant's own play text (`des`) and its score
(`post_bat_score`), for the same seasons as the advancement table
(build_packs.ADV_YEARS), regular season only:

  hits      single, double, triple, field_error with two out and an out on
            the play: "Freddie Freeman scores. Will Smith out at home on the
            throw." The batter touched his hit's base first
  choices   force_out, fielders_choice_out, fielders_choice with two out: the
            batter reaches, a runner is put out
  doubles   grounded_into_double_play, double_play, sac_fly_double_play with
            one out, triple_play with none

For each play, every man on it (the batter and each runner, named through the
Stats API from the on_1b, on_2b, on_3b ids) is found in the text and the last
thing it says of him is his fate: scores (4), to 2nd or 3rd, out at a base or
doubled off (-1). A runner the text never names stayed where he was, left on
when the half ended. The batter unnamed is safe at his hit's base (first on a
fielder's choice), or out when the play needs his out (a caught line drive
double play). A play is kept only when the outs it reads are the outs that end
the half, the runs it reads scoring are post_bat_score - bat_score, and no
runner passes another (rowBreaks in check-rules.mjs is the full check). A play
that ended the game is left out, as advance.py leaves it out (no next state).

Output (pipeline/third_outs.json, committed: small and sourced):
  {years, kept, dropped: {why: n}, plays: {"cat|outs|bases|label": [[n, runs, moves], ...]}}
with moves [[from, to], ...] (0 batter, 1..3 bases, 4 scored, -1 out), the
advancement table's own encoding. advance.apply_third_outs splits each
modelled half-ending row of the table into these.

  python3 third_outs.py               fetch (cached) and write third_outs.json
"""

import io
import json
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from urllib.parse import urlencode

import pandas as pd

import statsapi
from common import HERE, get, log

OUT = os.path.join(HERE, 'third_outs.json')
YEARS = list(range(2015, 2026))      # build_packs.ADV_YEARS

GROUPS = {
    'hits': ('single|double|triple|field_error|', '2|'),
    'choices': ('force_out|fielders_choice_out|fielders_choice|', '2|'),
    'doubles': ('grounded_into_double_play|double_play|sac_fly_double_play|triple_play|', '0|1|'),
}
HIT_CAT = {'single': 'single', 'double': 'double', 'triple': 'triple', 'field_error': 'error'}
HIT_BASE = {'single': 1, 'double': 2, 'triple': 3, 'error': 1}
BB_KEY = {'ground_ball': 'out_ground', 'line_drive': 'out_line', 'fly_ball': 'out_fly', 'popup': 'out_popup'}
DP = {'grounded_into_double_play', 'double_play', 'sac_fly_double_play', 'triple_play'}
BASE_WORD = {'1st': 1, '2nd': 2, '3rd': 3, 'home': 4}


def url(events, outs, season):
    q = {'all': 'true', 'hfAB': events, 'hfGT': 'R|', 'hfSea': f'{season}|', 'hfOuts': outs,
         'player_type': 'batter', 'type': 'details', 'min_pitches': '0', 'min_results': '0',
         'min_pas': '0', 'group_by': 'name', 'sort_col': 'pitches', 'sort_order': 'desc'}
    return 'https://baseballsavant.mlb.com/statcast_search/csv?' + urlencode(q)


def load(group, season):
    events, outs = GROUPS[group]
    text = get(url(events, outs, season), cache_key=f'savant-thirdouts-{group}-{season}.csv').lstrip('﻿')
    df = pd.read_csv(io.StringIO(text), low_memory=False)
    if len(df) >= 25000:
        raise RuntimeError(f'{group} {season}: at the row cap')
    return df


def norm(s):
    s = unicodedata.normalize('NFKD', str(s))
    s = ''.join(c for c in s if not unicodedata.combining(c)).lower()
    return ' '.join(re.sub(r'[^a-z0-9]+', ' ', s).split())


SUFFIX = {'jr', 'sr', 'ii', 'iii', 'iv'}


def names_of(person, surname_ok=True):
    """The ways the play text may name him, longest first: his full name, his
    first and last, without a suffix (Jr., III) or a middle initial, and his
    surname alone (its last part, for Strange-Gordon) when surname_ok."""
    out = set()
    firsts = {person.get(k) for k in ('useName', 'firstName', 'nickName') if person.get(k)}
    lasts = {person.get(k) for k in ('useLastName', 'lastName') if person.get(k)}
    for k in ('fullName', 'nameFirstLast', 'firstLastName'):
        if person.get(k):
            out.add(norm(person[k]))
    for f in firsts:
        for l in lasts:
            out.add(norm(f'{f} {l}'))
    for n in list(out):
        w = [x for x in n.split() if x not in SUFFIX]
        out.add(' '.join(w))
        out.add(' '.join(x for i, x in enumerate(w) if not (0 < i < len(w) - 1 and len(x) == 1)))
    if surname_ok:
        for l in lasts:
            w = [x for x in norm(l).split() if x not in SUFFIX]
            if w:
                out.add(w[-1])
    return sorted((n for n in out if n), key=len, reverse=True)


# what the text says right after a name: (pattern, destination); -1 out
FATE = [
    (re.compile(r'^(scores)\b'), lambda m: 4),
    (re.compile(r'^(?:advances )?to (1st|2nd|3rd)\b'), lambda m: BASE_WORD[m.group(1)]),
    (re.compile(r'^(?:out at|thrown out at|tagged out at|out stretching at) (1st|2nd|3rd|home)\b'), lambda m: -1),
    (re.compile(r'^out on\b'), lambda m: -1),
    (re.compile(r'^doubled off\b'), lambda m: -1),
    (re.compile(r'^(?:caught stealing|picked off)\b'), lambda m: -1),
]


def fates(text, man_names):
    """{man: destination} for every man the text names, the last mention winning."""
    out = {}
    for man, names in man_names.items():
        hits = []
        for nm in names:
            for m in re.finditer(r'(?:^| )' + re.escape(nm) + r' ', text):
                rest = text[m.end():]
                for pat, dest in FATE:
                    mm = pat.match(rest)
                    if mm:
                        hits.append((m.start(), dest(mm)))
                        break
        if hits:
            out[man] = max(hits)[1]
    return out


def legal(bases, moves, k):
    """No runner passes another; the batter on a hit of k bases touched base k."""
    end = {f: f for f in (1, 2, 3) if bases & (1 << (f - 1))}
    for f, t in moves:
        end[f] = t
    order = sorted(end, reverse=True)
    safe = [f for f in order if end[f] != -1]
    for i, a in enumerate(safe):
        for b in safe[i + 1:]:
            if end[a] != 4 and (end[b] == 4 or end[b] >= end[a]):
                return False
    if k and end.get(0) == -1 and any(f > 0 and end[f] not in (-1, 4) and end[f] <= k for f in end):
        return False
    return True


def play_of(r, group, people):
    """(key, runs, moves) for one play that ends the half, or (None, why)."""
    outs = int(r.outs_when_up)
    ids = {b: int(v) for b, v in ((1, r.on_1b), (2, r.on_2b), (3, r.on_3b)) if pd.notna(v)}
    bases = sum(1 << (b - 1) for b in ids)
    ev = r.events
    if group == 'hits':
        cat = HIT_CAT[ev]
        k = HIT_BASE[cat]
        label = cat
    else:
        cat = BB_KEY.get(r.bb_type, 'out_ground')
        k = 0
        label = 'double_play' if ev in DP else 'fielders_choice'
    need = 3 - outs                                   # the outs that end the half
    if group == 'doubles' and need != (3 if ev == 'triple_play' else 2):
        return None, 'not the half'
    men = {0: int(r.batter), **ids}
    if any(pid not in people for pid in men.values()):
        return None, 'no name'
    # a surname alone only when no other man on the play shares it
    sur = Counter(names_of(people[pid])[-1] for pid in men.values())
    man_names = {}
    for man, pid in men.items():
        n = names_of(people[pid])
        man_names[man] = n if sur[n[-1]] == 1 else names_of(people[pid], surname_ok=False)
    text = norm(r.des)
    f = fates(text, man_names)
    nouts = sum(1 for t in f.values() if t == -1)
    # every out the text reads is tied to a man it names (a name the Stats API
    # spells another way would otherwise hand his out to the batter)
    if len(re.findall(r'\b(?:out at|doubled off|picked off|caught stealing)\b', text)) > nouts:
        return None, 'an out not tied to a man'
    if 0 not in f:
        if group == 'doubles' and nouts < need:
            f[0] = -1                                 # the double play needs his out: a caught ball, or out at first
        else:
            f[0] = k or 1                             # he reached: his hit's base, or first on a choice
    # a runner the text does not name, with a safe man ending on his bag, was
    # forced up a base (a force out ends the half, so the text never says it)
    for b in (1, 2, 3):
        if b in ids and b not in f and any(t == b for m, t in f.items() if m != b):
            f[b] = b + 1
    if k and f[0] not in (-1,) and f[0] < k:
        return None, 'batter short of his hit'
    nouts = sum(1 for t in f.values() if t == -1)
    if nouts != need:
        return None, 'not the half' if nouts < need else 'too many outs read'
    runs = int(r.post_bat_score - r.bat_score)
    scored = sum(1 for t in f.values() if t == 4)
    if scored != runs:
        return None, 'runs do not match'
    for man, t in f.items():
        if man > 0 and t != -1 and t <= man:
            return None, 'a runner went back'
    moves = sorted(((m, t) for m, t in f.items() if m == 0 or t != m), key=lambda x: -x[0])
    if not legal(bases, moves, k):
        return None, 'a runner passed'
    # a play that ended the game has no next state (advance.py leaves it out)
    if int(r.inning) >= 9:
        bat, fld = int(r.post_bat_score), int(r.fld_score)
        if r.inning_topbot == 'Top' and fld > bat:
            return None, 'game over'
        if r.inning_topbot == 'Bot' and bat != fld:
            return None, 'game over'
    return (f'{cat}|{outs}|{bases}|{label}', runs, tuple(moves)), None


def build(years=YEARS):
    frames = {g: pd.concat([load(g, y) for y in years], ignore_index=True) for g in GROUPS}
    # a play is one row (the PA's last pitch). A two-out hit ends the half only
    # with an out on the play, so only those are read
    h = frames['hits']
    frames['hits'] = h[h['des'].fillna('').str.contains(r'\bout\b|doubled off|picked off|caught stealing', regex=True)]
    ids = set()
    for df in frames.values():
        for c in ('batter', 'on_1b', 'on_2b', 'on_3b'):
            ids.update(int(v) for v in df[c].dropna())
    log(f'  third outs: {sum(len(d) for d in frames.values())} plays, {len(ids)} men to name')
    people = statsapi.people(ids)
    counts = defaultdict(Counter)
    dropped = Counter()
    kept = 0
    for g, df in frames.items():
        for r in df.itertuples(index=False):
            if pd.isna(r.des) or pd.isna(r.post_bat_score):
                dropped['no text'] += 1
                continue
            key, why = play_of(r, g, people)
            if key is None:
                dropped[why] += 1
                continue
            k, runs, moves = key
            counts[k][(runs, moves)] += 1
            kept += 1
    plays = {k: [[n, runs, [list(m) for m in moves]] for (runs, moves), n in c.most_common()] for k, c in sorted(counts.items())}
    return {'years': list(years), 'kept': kept, 'dropped': dict(dropped.most_common()), 'plays': plays}


if __name__ == '__main__':
    t = build()
    with open(OUT, 'w') as fh:
        json.dump(t, fh, separators=(',', ':'))
        fh.write('\n')
    log(f'third outs: {t["kept"]} plays kept, dropped {t["dropped"]}')
    for k in ('triple|2|1|triple', 'double|2|1|double', 'single|2|2|single', 'out_ground|2|1|fielders_choice'):
        log(f'  {k}: {t["plays"].get(k, [])[:5]}')
