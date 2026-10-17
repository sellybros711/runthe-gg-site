"""Shared helpers for the Shut The Door pipeline.

Plain Python 3.11, pandas, requests and sqlite3. Nothing here is loaded by the
page. The pipeline runs on GitHub Actions (shut-the-door-data.yml) because the
data hosts (baseballsavant.mlb.com, statsapi.mlb.com, www.retrosheet.org) do not
answer from the cloud development container.

Paths:
  pipeline/cache/            never in git (Pages refuses files over 25 MB).
                             Kept between runs by actions/cache.
  data/verify/*.json         small outputs, committed back by the workflow.
  pipeline/report.md         the short build report, committed back.
"""

import json
import os
import sys
import time

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
CACHE = os.path.join(HERE, 'cache')
HTTP_CACHE = os.path.join(CACHE, 'http')
LIBRARY = os.path.join(CACHE, 'library.sqlite')
DATA = os.path.join(GAME, 'data')
VERIFY = os.path.join(DATA, 'verify')
REPORT = os.path.join(HERE, 'report.md')

POLITE_S = float(os.environ.get('STD_POLITE_S', '0.6'))
UA = {'User-Agent': 'runthe.gg shut-the-door pipeline (github actions)'}


def ensure_dirs():
    for d in (CACHE, HTTP_CACHE, os.path.join(CACHE, 'chunks'), VERIFY):
        os.makedirs(d, exist_ok=True)


def log(*a):
    print(*a, flush=True)


def get(url, *, tries=5, timeout=120, cache_key=None, binary=False):
    """GET with retries and a polite back-off. With cache_key, the body is kept
    under cache/http so a re-run of the workflow (cache restored) does not ask
    the host again."""
    ensure_dirs()
    path = os.path.join(HTTP_CACHE, cache_key) if cache_key else None
    if path and os.path.exists(path) and os.path.getsize(path) > 0:
        with open(path, 'rb') as fh:
            body = fh.read()
        return body if binary else body.decode('utf-8', 'replace')
    last = None
    for i in range(tries):
        try:
            r = requests.get(url, headers=UA, timeout=timeout)
            time.sleep(POLITE_S)  # be polite to the hosts: one request at a time, spaced
            if r.status_code == 200:
                body = r.content
                if path:
                    with open(path, 'wb') as fh:
                        fh.write(body)
                return body if binary else body.decode('utf-8', 'replace')
            last = f'HTTP {r.status_code}'
        except requests.RequestException as e:  # network blip, retry
            last = repr(e)
        time.sleep(2 * (i + 1))
    raise RuntimeError(f'GET failed after {tries} tries: {url} ({last})')


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(obj, fh, indent=1, ensure_ascii=False, sort_keys=False, default=_plain)
        fh.write('\n')


def _plain(o):
    # numpy scalars and the like
    try:
        return o.item()
    except Exception:
        return str(o)


def read_json(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path, encoding='utf-8') as fh:
        return json.load(fh)


def fail(msg):
    log('FAIL', msg)
    sys.exit(1)
