#!/usr/bin/env python3
"""
Fetch the raw inputs for the MLB draft-game pricing dataset, then zip them up.
Run this on a normal machine (open internet). At the end you'll have
    data_for_claude.zip
Hand that single file back to Claude (or run build_pricing.py next to it).

Requires: pip install pandas numpy pybaseball
"""
import os, sys, urllib.request, zipfile, traceback

DATA = "data"
os.makedirs(DATA, exist_ok=True)
ok, failed = [], []

def save(name, fn):
    try:
        print(f"  fetching {name} ...", flush=True)
        fn()
        ok.append(name)
        print(f"  ✓ {name}")
    except Exception as e:
        failed.append((name, str(e)))
        print(f"  ✗ {name}: {e}")

print("1/3  bWAR (Baseball-Reference bulk files)")
def _bref(f):
    return lambda: urllib.request.urlretrieve(
        f"https://www.baseball-reference.com/data/{f}", os.path.join(DATA, f))
save("war_daily_bat.txt",   _bref("war_daily_bat.txt"))
save("war_daily_pitch.txt", _bref("war_daily_pitch.txt"))

print("2/3  fWAR (FanGraphs leaderboards, 1901-present, everyone)")
def _fg_bat():
    from pybaseball import batting_stats
    batting_stats(1901, 2025, qual=0).to_csv(os.path.join(DATA,"fg_bat.csv"), index=False)
def _fg_pitch():
    from pybaseball import pitching_stats
    pitching_stats(1901, 2025, qual=0).to_csv(os.path.join(DATA,"fg_pitch.csv"), index=False)
save("fg_bat.csv",   _fg_bat)
save("fg_pitch.csv", _fg_pitch)

print("3/3  Lahman (positions, closer flags, decade benchmarks)")

# ONE LIST, because the fetch and the builds disagreed about it and nothing
# said so. This got Appearances, People and Teams; build_positions.py loads
# Appearances, People and PITCHING, so the closer flags fell through to a
# download of their own on every run, including the runs where these three
# worked. check_lahman.py's last section holds the two lists together now.
#
# It no longer goes through `pybaseball.lahman`, which asks for a branch the
# Chadwick Bureau renamed and has no `teams` function any more. See lahman.py.
LAHMAN_TABLES = ["Appearances.csv", "People.csv", "Teams.csv", "Pitching.csv"]

import lahman as lahman_src

def _lah(name):
    def go():
        rows = lahman_src.save(name, DATA)
        print(f"    {rows:,} rows", flush=True)
    return go

for _t in LAHMAN_TABLES:
    save(_t, _lah(_t))

# bundle
zpath = "data_for_claude.zip"
with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
    for f in sorted(os.listdir(DATA)):
        z.write(os.path.join(DATA, f), arcname=f)

print("\n" + "="*50)
print(f"DONE. Bundled {len(ok)} files -> {os.path.abspath(zpath)}")
if failed:
    # NOT TRUNCATED. This used to print `e[:120]`, and the Lahman refusal is a
    # line per source: 120 characters cut it off after three of the four, so the
    # log read as if the last one had never been tried. The whole point of that
    # message is which places answered what, and a summary that drops the tail
    # is the "File is not a zip file" problem arriving one level up. Four
    # sources times four tables is sixteen lines once, which is cheap.
    print(f"\n{len(failed)} file(s) failed:")
    for n, e in failed:
        print(f"  - {n}: {e}")
print("="*50)

# WHAT IS ALLOWED TO FAIL, AND WHAT IS NOT.
#
# fWAR is allowed: the shipped pool is bWAR only and says so, and the blend is
# opt in through build_positions.py's --require-fwar. That is a source this
# game deliberately does not depend on.
#
# LAHMAN IS NOT ALLOWED, and it used to be. It carries the POSITIONS, and a
# pool with no positions is not a harder pool or a smaller one: it is twelve
# slots with nothing eligible for them. The refresh proved it by building one,
# 60,208 batters and a position on none of them, and reporting it as a warning
# under a green step. A fetch that cannot get the tables the build needs has
# failed, so it says so here rather than three steps later.
ESSENTIAL = ["war_daily_bat.txt", "war_daily_pitch.txt"] + LAHMAN_TABLES
lost = [n for n, _ in failed if n in ESSENTIAL]
if lost:
    print(f"\nFAILED: {', '.join(lost)}")
    print("These are what the build needs. fWAR is the only source allowed to")
    print("be missing, because the pool is bWAR only by design.")
    sys.exit(1)
