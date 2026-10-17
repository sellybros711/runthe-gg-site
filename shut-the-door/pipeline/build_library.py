"""Fill the trimmed pitch library (cache/library.sqlite) from Savant, slice by slice.

slices.json lists what the library should hold. A slice already in the
`fetched` table is skipped, so a run with the cache restored only asks for
what is new. Prints the rows per slice and the columns Savant did not send.
"""

import os
import sys
from datetime import datetime, timezone

import savant
from common import HERE, VERIFY, ensure_dirs, log, read_json, write_json


def main(argv):
    ensure_dirs()
    spec = read_json(os.path.join(HERE, 'slices.json'))
    con = savant.to_library(savant.pd.DataFrame(columns=savant.KEEP))
    done = {r[0] for r in con.execute('SELECT slice FROM fetched')}
    summary = []
    for sl in spec['slices']:
        name = sl['name']
        if name in done and '--refetch' not in argv:
            n = con.execute('SELECT rows FROM fetched WHERE slice = ?', (name,)).fetchone()[0]
            log(f'== {name}: in the cache ({n} rows)')
            summary.append({'slice': name, 'rows': n, 'cached': True})
            continue
        log(f'== {name}: {sl["start"]}..{sl["end"]} innings {sl.get("innings") or "all"}')
        gt = sl.get('gameTypes', savant.GT_REGULAR)
        df, missing = savant.fetch_range(sl['start'], sl['end'], game_types=gt,
                                         innings=sl.get('innings'), step_days=sl.get('stepDays', 7), tag=name)
        savant.to_library(df)
        con.execute('INSERT OR REPLACE INTO fetched VALUES (?, ?, ?)',
                    (name, len(df), datetime.now(timezone.utc).isoformat(timespec='seconds')))
        con.commit()
        log(f'   {len(df)} rows; columns Savant did not send: {missing or "none"}')
        summary.append({'slice': name, 'rows': len(df), 'missing': missing, 'cached': False})
    total = con.execute('SELECT COUNT(*) FROM pitches').fetchone()[0]
    years = con.execute('SELECT game_year, COUNT(*) FROM pitches GROUP BY game_year ORDER BY 1').fetchall()
    size = os.path.getsize(savant.LIBRARY)
    log(f'library: {total} pitches, {size / 1e6:.1f} MB, by year {years}')
    write_json(os.path.join(VERIFY, '_library.json'),
               {'slices': summary, 'pitches': total, 'mb': round(size / 1e6, 1), 'byYear': years})


if __name__ == '__main__':
    main(sys.argv)
