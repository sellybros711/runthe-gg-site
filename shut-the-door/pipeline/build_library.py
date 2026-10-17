"""Fill the trimmed pitch library (cache/library.sqlite) from Savant, slice by slice.

slices.json lists what the library should hold. A slice already in the
`fetched` table is skipped, so a run with the cache restored only asks for
what is new. Prints the rows per slice and the columns Savant did not send.
"""

import json
import os
import sys
from datetime import datetime, timezone

import savant
from common import HERE, VERIFY, ensure_dirs, get, log, read_json, write_json


def season_slices(first, last):
    """Whole seasons, every inning, regular season and postseason, dated by the
    Stats API's own season calendar. Three days a chunk: a busy regular-season
    day is about 4,500 pitches, so three stay under the row cap and a chunk
    that does not is split by fetch_range."""
    out = []
    for y in range(first, last + 1):
        cal = json.loads(get(f'https://statsapi.mlb.com/api/v1/seasons/{y}?sportId=1',
                             cache_key=f'statsapi-season-{y}.json'))['seasons'][0]
        start = cal.get('regularSeasonStartDate')
        end = cal.get('postSeasonEndDate') or cal.get('seasonEndDate') or cal.get('regularSeasonEndDate')
        out.append({'name': f'season-{y}', 'start': start, 'end': end,
                    'gameTypes': savant.GT_REGULAR + savant.GT_POST, 'innings': None, 'stepDays': 3})
    return out


def main(argv):
    ensure_dirs()
    spec = read_json(os.path.join(HERE, 'slices.json'))
    # --seasons 2008-2025 adds whole seasons to what slices.json lists
    if '--seasons' in argv:
        a, _, b = argv[argv.index('--seasons') + 1].partition('-')
        spec['slices'] += season_slices(int(a), int(b or a))
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
