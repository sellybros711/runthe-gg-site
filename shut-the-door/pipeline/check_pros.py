"""Every pro example in every pack is a real pitch: its id is in the library,
with the count, the pitch type, the cell and the result the pack states.

  python3 check_pros.py            every pack in data/packs

Needs the library (cache/library.sqlite), so it runs in the data workflow and
locally, not in the checks workflow. Exit 1 on any mismatch.
"""

import glob
import json
import os
import sqlite3
import sys

import numpy as np
import pandas as pd

import prep
from common import DATA, LIBRARY
from pros import result_of


def main(argv):
    con = sqlite3.connect(LIBRARY)
    bad = total = 0
    for p in sorted(glob.glob(os.path.join(DATA, 'packs', '*.json'))):
        pack = json.load(open(p))
        pr = pack.get('pros') or {}
        n = 0
        for key, rows in (pr.get('rows') or {}).items():
            for r in rows:
                total += 1
                n += 1
                gpk, ab, pn = map(int, r[12].split(':'))
                q = pd.read_sql_query('SELECT * FROM pitches WHERE game_pk = ? AND at_bat_number = ? AND pitch_number = ?',
                                      con, params=(gpk, ab, pn))
                if len(q) != 1:
                    bad += 1
                    print(f'FAIL {pack["scenario"]["id"]} {r[12]}: not in the library')
                    continue
                x = q.iloc[0]
                zn = (x['plate_z'] - x['sz_bot']) / (x['sz_top'] - x['sz_bot'])
                cell = int(prep.cell_of(np.array([x['plate_x']]), np.array([zn]))[0])
                res = result_of(x)
                want = (int(r[4]), int(r[5]), r[8], int(r[9]), r[11])
                got = (int(x['balls']), int(x['strikes']), x['pitch_type'], cell, res)
                if want != got:
                    bad += 1
                    print(f'FAIL {pack["scenario"]["id"]} {r[12]}: pack says {want}, library says {got}')
        print(f'{"ok  " if not bad else "    "} {pack["scenario"]["id"]}: {n} pro examples checked')
    print(f'{total} pro examples, {bad} mismatches')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main(sys.argv)
