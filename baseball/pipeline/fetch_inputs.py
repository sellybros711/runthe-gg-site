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

print("3/3  Lahman (positions + decade benchmarks)")
def _lah(tbl, out):
    def go():
        from pybaseball import lahman
        getattr(lahman, tbl)().to_csv(os.path.join(DATA, out), index=False)
    return go
save("Appearances.csv", _lah("appearances","Appearances.csv"))
save("People.csv",      _lah("people","People.csv"))
save("Teams.csv",       _lah("teams","Teams.csv"))

# bundle
zpath = "data_for_claude.zip"
with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
    for f in sorted(os.listdir(DATA)):
        z.write(os.path.join(DATA, f), arcname=f)

print("\n" + "="*50)
print(f"DONE. Bundled {len(ok)} files -> {os.path.abspath(zpath)}")
if failed:
    print(f"\n{len(failed)} file(s) failed (I can work with partial data):")
    for n,e in failed: print(f"  - {n}: {e[:80]}")
    print("The 4 WAR files (war_daily_bat/pitch, fg_bat/pitch) are the essential ones.")
print("="*50)
