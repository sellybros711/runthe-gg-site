"""Fill the trimmed pitch library (cache/library.sqlite) from Savant.

slices.json declares what the library holds: whole seasons (`seasons`, every
inning, regular season and postseason, dated by the Stats API's season
calendar) plus any extra date slices. Each season is fetched in five-day
chunks (a busy day is about 4,500 pitches, so five stay under Savant's 25,000
row cap; a chunk that does not is split in two and asked again).

What is cached, and why that way round: every chunk is kept trimmed and
gzipped under cache/chunks. The SQLite file is rebuilt from those chunks when
it is missing, which takes minutes and needs no network. So the workflow
caches only cache/chunks and cache/http (a few hundred MB for 2008 to the
present) and never the multi-GB SQLite.

  python3 build_library.py                    what slices.json declares
  python3 build_library.py --seasons 2015-2016 only these seasons (for a quick run)
  python3 build_library.py --workers 3        seasons fetched in parallel (default 3)

Polite to Savant: one request at a time per worker, spaced (common.POLITE_S).
"""

import json
import os
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

import savant
from common import HERE, VERIFY, ensure_dirs, get, log, read_json, write_json


def season_slice(y):
    cal = json.loads(get(f'https://statsapi.mlb.com/api/v1/seasons/{y}?sportId=1',
                         cache_key=f'statsapi-season-{y}.json'))['seasons'][0]
    start = cal.get('regularSeasonStartDate')
    end = cal.get('postSeasonEndDate') or cal.get('seasonEndDate') or cal.get('regularSeasonEndDate')
    return {'name': f'season-{y}', 'start': start, 'end': end,
            'gameTypes': savant.GT_REGULAR + savant.GT_POST, 'innings': None, 'stepDays': 5}


def parse_years(spec):
    a, _, b = str(spec).partition('-')
    return list(range(int(a), int(b or a) + 1))


def main(argv):
    ensure_dirs()
    spec = read_json(os.path.join(HERE, 'slices.json'))
    if '--seasons' in argv:
        years = parse_years(argv[argv.index('--seasons') + 1])
        extra = []
    else:
        years = parse_years(spec['seasons'])
        extra = spec.get('slices', [])
    order = [y for y in spec.get('priority', []) if y in years] + [y for y in years if y not in spec.get('priority', [])]
    workers = int(argv[argv.index('--workers') + 1]) if '--workers' in argv else 3
    slices = [season_slice(y) for y in order] + extra

    con = savant.to_library(savant.pd.DataFrame(columns=savant.LIB))
    done = {r[0]: r[1] for r in con.execute('SELECT slice, rows FROM fetched')}
    todo = [sl for sl in slices if sl['name'] not in done]
    for sl in slices:
        if sl['name'] in done:
            log(f'== {sl["name"]}: in the library ({done[sl["name"]]} rows)')
    lock = threading.Lock()

    def fetch(sl):
        log(f'== {sl["name"]}: {sl["start"]}..{sl["end"]}')
        df, missing = savant.fetch_range(sl['start'], sl['end'], game_types=sl.get('gameTypes', savant.GT_REGULAR),
                                         innings=sl.get('innings'), step_days=sl.get('stepDays', 5), tag=sl['name'])
        return sl, df, missing

    summary = []
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(fetch, sl) for sl in todo]
        for f in as_completed(futs):
            sl, df, missing = f.result()
            with lock:
                savant.to_library(df).close()
                c2 = savant.to_library(savant.pd.DataFrame(columns=savant.LIB))
                c2.execute('INSERT OR REPLACE INTO fetched VALUES (?, ?, ?)',
                           (sl['name'], len(df), datetime.now(timezone.utc).isoformat(timespec='seconds')))
                c2.commit()
                c2.close()
            log(f'   {sl["name"]}: {len(df)} rows; columns Savant did not send: {missing or "none"}')
            summary.append({'slice': sl['name'], 'rows': len(df), 'missing': missing})
            del df

    con = savant.to_library(savant.pd.DataFrame(columns=savant.LIB))
    con.execute('CREATE INDEX IF NOT EXISTS ix_batter ON pitches (batter, game_year)')
    con.execute('CREATE INDEX IF NOT EXISTS ix_pitcher ON pitches (pitcher, game_year)')
    con.execute('CREATE INDEX IF NOT EXISTS ix_year ON pitches (game_year, pitch_type)')
    con.commit()
    total = con.execute('SELECT COUNT(*) FROM pitches').fetchone()[0]
    years_n = con.execute('SELECT game_year, COUNT(*) FROM pitches GROUP BY game_year ORDER BY 1').fetchall()
    size = os.path.getsize(savant.LIBRARY)
    chunks = sum(os.path.getsize(os.path.join(savant.CHUNKS, f)) for f in os.listdir(savant.CHUNKS))
    log(f'library: {total} pitches, sqlite {size / 1e6:.0f} MB, chunks {chunks / 1e6:.0f} MB, by year {years_n}')
    all_slices = [{'slice': n, 'rows': r} for n, r in con.execute('SELECT slice, rows FROM fetched ORDER BY slice')]
    write_json(os.path.join(VERIFY, '_library.json'),
               {'slices': all_slices, 'pitches': total, 'mb': round(size / 1e6, 1),
                'chunksMb': round(chunks / 1e6, 1), 'byYear': years_n})


if __name__ == '__main__':
    main(sys.argv)
