"""Fill cache/chunks for some seasons without touching the SQLite file, so a
second process can fetch in parallel with build_library.py (which then reads
those chunks with no network). Same politeness: one request at a time per
worker, spaced.

  python3 prefetch.py 2008 2009 2013 --workers 3
"""

import sys
from concurrent.futures import ThreadPoolExecutor

import build_library
import savant
from common import ensure_dirs, log


def main(argv):
    ensure_dirs()
    workers = int(argv[argv.index('--workers') + 1]) if '--workers' in argv else 3
    years = [int(a) for a in argv[1:] if a.isdigit() and len(a) == 4]

    def one(y):
        sl = build_library.season_slice(y)
        df, _ = savant.fetch_range(sl['start'], sl['end'], game_types=sl['gameTypes'],
                                   step_days=sl['stepDays'], tag=sl['name'])
        log(f'prefetched {sl["name"]}: {len(df)} rows')
        return y

    with ThreadPoolExecutor(max_workers=workers) as ex:
        list(ex.map(one, years))


if __name__ == '__main__':
    main(sys.argv)
