"""Baseball Savant Statcast search, as CSV.

The search returns at most 25,000 rows a request, so a date range is asked for
in chunks small enough to stay under it. A chunk that comes back at the cap is
split in two and asked again, so a busy week cannot be silently truncated.

PITCHf/x seasons (2008 to 2014) come from the same search: Savant carries them
with the same columns, minus the Statcast-only ones (launch speed and angle,
expected wOBA), which come back empty.
"""

import io
import os
import sqlite3
from datetime import date, timedelta
from urllib.parse import urlencode

import pandas as pd

from common import CACHE, LIBRARY, ensure_dirs, get, log

CHUNKS = os.path.join(CACHE, 'chunks')

BASE = 'https://baseballsavant.mlb.com/statcast_search/csv'
CAP = 25000

# What the game uses, and nothing else (the brief's list, plus the keys that
# order and identify a pitch, and the win expectancy the scenario search reads).
KEEP = [
    'game_pk', 'game_date', 'game_type', 'game_year', 'at_bat_number', 'pitch_number',
    'pitcher', 'batter', 'player_name', 'stand', 'p_throws', 'home_team', 'away_team',
    'inning', 'inning_topbot', 'outs_when_up', 'on_1b', 'on_2b', 'on_3b',
    'balls', 'strikes', 'home_score', 'away_score', 'bat_score', 'fld_score',
    'post_home_score', 'post_away_score', 'post_bat_score', 'post_fld_score',
    'pitch_type', 'pitch_name', 'release_speed', 'pfx_x', 'pfx_z', 'plate_x', 'plate_z',
    'sz_top', 'sz_bot', 'zone', 'type', 'description', 'events', 'des', 'bb_type',
    'launch_speed', 'launch_angle', 'hc_x', 'hc_y', 'hit_location',
    'estimated_woba_using_speedangle', 'woba_value', 'delta_run_exp',
    'delta_home_win_exp', 'home_win_exp', 'bat_win_exp',
]

# Regular season and every postseason round. Spring training never.
GT_REGULAR = 'R|'
GT_POST = 'F|D|L|W|'


def search_url(start=None, end=None, *, game_types=GT_REGULAR + GT_POST, innings=None,
               pitcher=None, season=None, game_pk=None):
    if game_pk:
        return f'{BASE}?all=true&type=details&game_pk={game_pk}'
    q = {
        'all': 'true', 'hfPT': '', 'hfAB': '', 'hfGT': game_types, 'hfPR': '', 'hfZ': '',
        'hfStadium': '', 'hfBBL': '', 'hfNewZones': '', 'hfPull': '', 'hfC': '',
        'hfSea': f'{season}|' if season else '', 'hfSit': '', 'player_type': 'pitcher',
        'hfOuts': '', 'hfOpponent': '', 'pitcher_throws': '', 'batter_stands': '',
        'hfSA': '', 'game_date_gt': start or '', 'game_date_lt': end or '',
        'hfMo': '', 'hfTeam': '', 'home_road': '', 'hfRO': '', 'position': '',
        'hfInfield': '', 'hfOutfield': '', 'hfInn': ''.join(f'{i}|' for i in innings) if innings else '',
        'hfBBT': '', 'hfFlag': '', 'metric_1': '', 'group_by': 'name', 'min_pitches': '0',
        'min_results': '0', 'min_pas': '0', 'sort_col': 'pitches',
        'player_event_sort': 'api_p_release_speed', 'sort_order': 'desc', 'type': 'details',
    }
    url = BASE + '?' + urlencode(q)
    if pitcher:
        url += f'&pitchers_lookup%5B%5D={pitcher}'
    return url


def _parse(text):
    text = text.lstrip('﻿')
    if not text.strip():
        return pd.DataFrame(columns=KEEP), []
    if text.lstrip().startswith('<'):
        raise RuntimeError('Savant answered HTML, not CSV: ' + text[:200].replace('\n', ' '))
    df = pd.read_csv(io.StringIO(text), low_memory=False)
    if 'error' in df.columns:
        raise RuntimeError('Savant error: ' + str(df['error'].iloc[0]))
    missing = [c for c in KEEP if c not in df.columns]
    for c in missing:
        df[c] = None
    return df[KEEP].copy(), missing


def fetch(url, cache_key):
    """One request, parsed and trimmed. Returns (frame, missing columns)."""
    return _parse(get(url, cache_key=cache_key))


def fetch_trimmed(url, cache_key):
    """Like fetch, but what is kept on disk is the TRIMMED chunk, gzipped. A raw
    Savant CSV carries about 118 columns, so a season kept raw is near a
    gigabyte; trimmed and gzipped it is a small fraction of that, which is
    what lets 2008 to the present fit in actions/cache."""
    ensure_dirs()
    path = os.path.join(CHUNKS, cache_key)
    if os.path.exists(path) and os.path.getsize(path) > 0:
        df = pd.read_csv(path, low_memory=False)
        return df, []
    df, missing = _parse(get(url))
    tmp = path + '.tmp'
    df.to_csv(tmp, index=False, compression='gzip')
    os.replace(tmp, path)
    return df, missing


def fetch_range(start, end, *, game_types=GT_REGULAR + GT_POST, innings=None, step_days=7, tag='range'):
    """Every pitch from start to end inclusive, in chunks under the row cap."""
    frames, missing_all = [], set()
    d0 = date.fromisoformat(start)
    d1 = date.fromisoformat(end)
    todo = []
    while d0 <= d1:
        e = min(d1, d0 + timedelta(days=step_days - 1))
        todo.append((d0, e))
        d0 = e + timedelta(days=1)
    while todo:
        a, b = todo.pop(0)
        key = f'savant-{tag}-{a}-{b}-{game_types.replace("|", "")}-{"".join(map(str, innings or []))}.csv.gz'
        df, missing = fetch_trimmed(search_url(str(a), str(b), game_types=game_types, innings=innings), key)
        missing_all.update(missing)
        if len(df) >= CAP and a < b:
            mid = a + (b - a) // 2
            log(f'  {a}..{b}: {len(df)} rows, at the cap, splitting')
            todo[0:0] = [(a, mid), (mid + timedelta(days=1), b)]
            continue
        if len(df) >= CAP:
            raise RuntimeError(f'{a}: one day is over the {CAP} row cap')
        log(f'  {a}..{b}: {len(df)} rows')
        frames.append(df)
    df = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame(columns=KEEP)
    return df, sorted(missing_all)


def to_library(df, table='pitches'):
    """Upsert into the SQLite library, keyed by (game_pk, at_bat_number, pitch_number)."""
    ensure_dirs()
    con = sqlite3.connect(LIBRARY)
    cols = ', '.join(f'"{c}"' for c in KEEP)
    con.execute(f'CREATE TABLE IF NOT EXISTS {table} ({cols}, '
                'PRIMARY KEY (game_pk, at_bat_number, pitch_number))')
    con.execute('CREATE TABLE IF NOT EXISTS fetched (slice TEXT PRIMARY KEY, rows INTEGER, at TEXT)')
    if len(df):
        ph = ', '.join('?' for _ in KEEP)
        rows = df[KEEP].astype(object).where(pd.notna(df[KEEP]), None).values.tolist()
        con.executemany(f'INSERT OR REPLACE INTO {table} ({cols}) VALUES ({ph})', rows)
    con.commit()
    return con
