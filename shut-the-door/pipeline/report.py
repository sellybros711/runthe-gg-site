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
    rs = read_json(os.path.join(VERIFY, '_regular_season.json'))
    if rs:
        out += ['## Regular-season search', '', rs.get('summary', ''), '']
    with open(REPORT, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(out))
    print('\n'.join(out))


if __name__ == '__main__':
    main()
