"""Write pipeline/report.md: the short build report the workflow commits back."""

import glob
import json
import os
from datetime import datetime, timezone

from common import REPORT, VERIFY, read_json

BASES = {0: 'empty', 1: '1st', 2: '2nd', 3: '1st and 2nd', 4: '3rd', 5: '1st and 3rd', 6: '2nd and 3rd', 7: 'loaded'}


def main():
    out = ['# Shut The Door pipeline report', '',
           f'Built {datetime.now(timezone.utc).isoformat(timespec="minutes")} by shut-the-door-data.yml.', '']
    lib = read_json(os.path.join(VERIFY, '_library.json'))
    if lib:
        out += ['## Library', '', f'{lib["pitches"]} pitches, {lib["mb"]} MB (cached, never in git).', '',
                '| slice | rows | cached |', '|---|---|---|']
        out += [f'| {s["slice"]} | {s["rows"]} | {"yes" if s.get("cached") else "no"} |' for s in lib['slices']]
        out += ['']
    rows = []
    for p in sorted(glob.glob(os.path.join(VERIFY, '*.json'))):
        name = os.path.basename(p)[:-5]
        if name.startswith('_'):
            continue
        d = read_json(p)
        if 'error' in d:
            rows.append(f'| {name} | | | | ERROR: {d["error"]} |')
            continue
        s, r = d['situation'], d['real']
        faced = ', '.join(f'{pa.get("name")} ({pa.get("bats")})' for pa in d['plateAppearances'] if pa.get('inSpot'))
        rows.append(f'| {name} | {d["date"]} | {s["half"]} {s["inning"]}, {s["outs"]} out, {BASES[s["bases"]]}, '
                    f'{s["score"]["us"]}-{s["score"]["them"]} | {faced} | {r["outcome"]}, '
                    f'{r["pitches"] if r["pitches"] is not None else "?"} pitches, {r["runs"]} runs |')
    if rows:
        out += ['## Scenarios verified', '', '| id | date | start | faced | real result |', '|---|---|---|---|---|'] + rows + ['']
    packs = sorted(glob.glob(os.path.join(os.path.dirname(VERIFY), 'packs', '*.json')))
    if packs:
        out += ['## Packs', '', '| pack | MB | start hold% | pool runs | pool holds | pool bands g/y/o/r | tiers b/s/l |',
                '|---|---|---|---|---|---|---|']
        for p in packs:
            d = read_json(p)
            b = d.get('build', {})
            pl = b.get('pool', {})
            bands = pl.get('bands', {})
            t = sum(bands.values()) or 1
            tiers = b.get('tiers', {})
            out.append(f'| {d["scenario"]["id"]} | {os.path.getsize(p) / 1e6:.2f} | {b.get("startHold")} | {pl.get("runs")} | '
                       f'{pl.get("holdRate")} | ' + '/'.join(str(round(100 * bands.get(k, 0) / t)) for k in ('green', 'yellow', 'orange', 'red')) +
                       ' | ' + '/'.join(str(tiers.get(k, tiers.get(str(k), 0))) for k in (0, 1, 2)) + ' |')
        out += ['']
    cal = read_json(os.path.join(VERIFY, '_calibration.json'))
    if cal:
        out += ['## Calibration: hold% from the start', '', '| pack | best play | closer pool | real 2015-2025 | real spots |', '|---|---|---|---|---|']
        for k, c in cal.items():
            out.append(f'| {k} | {c["startHold"]}% | {c["poolHold"]} | {c["realHold"]} | {c["realSpots"]} |')
        out += ['']
    tp = os.path.join(os.path.dirname(REPORT), 'packs-test.txt')
    if os.path.exists(tp):
        out += ['## Pack tests', '', '```'] + open(tp).read().rstrip().splitlines() + ['```', '']
    rs = read_json(os.path.join(VERIFY, '_regular_season.json'))
    if rs:
        out += ['## Regular-season search', '', rs.get('summary', ''), '']
    with open(REPORT, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(out))
    print('\n'.join(out))


if __name__ == '__main__':
    main()
