# Data Runbook — building the real 1901+ pricing dataset

`build_pricing.py` is complete and validated, but the two WAR sources
(Baseball-Reference, FanGraphs) and the GitHub archive/API are **blocked by the
Cowork cloud sandbox's network allowlist**, so the raw pull has to run somewhere
without that allowlist — Coby's machine or any normal dev box. It's ~5 minutes of
fetching, then one command.

## 1. Install deps
```bash
pip install pandas numpy pybaseball
```

## 2. Fetch the inputs into ./data
```python
# fetch_inputs.py  — run on a machine with open internet
import os, urllib.request
os.makedirs("data", exist_ok=True)

# --- bWAR: Baseball-Reference bulk WAR files (comma-separated .txt) ---
for f in ["war_daily_bat.txt", "war_daily_pitch.txt"]:
    urllib.request.urlretrieve(f"https://www.baseball-reference.com/data/{f}", f"data/{f}")

# --- fWAR: FanGraphs season leaderboards (qual=0 => everyone) ---
from pybaseball import batting_stats, pitching_stats
batting_stats(1901, 2025, qual=0).to_csv("data/fg_bat.csv", index=False)     # has 'WAR' (fWAR)
pitching_stats(1901, 2025, qual=0).to_csv("data/fg_pitch.csv", index=False)  # has 'WAR','G','GS','SV'

# --- Lahman: positions + decade benchmarks ---
from pybaseball.lahman import appearances, people, teams
appearances().to_csv("data/Appearances.csv", index=False)
people().to_csv("data/People.csv", index=False)   # maps playerID -> bbrefID
teams().to_csv("data/Teams.csv", index=False)
```
Notes:
- If `pybaseball`'s bWAR helpers are preferred over the direct URL: `from pybaseball import bwar_bat, bwar_pitch` then `bwar_bat(return_all=True)`.
- FanGraphs' `batting_stats`/`pitching_stats` cover 1901+ but pre-1920 fWAR coverage thins; the pipeline falls back to bWAR-only for any season it can't match, and lists those in `coverage_report.txt`.

## 3. Build the priced dataset
```bash
python build_pricing.py --data-dir data --out-dir out
```

## 4. Outputs (in ./out)
- `priced_players.csv` / `.json` — one row per player-season 1901+:
  `bbref_id, name, season, team, role, primary_pos, eligible_pos, is_closer, bwar, fwar, rwar, rwar_source, price_m`
- `decade_benchmarks.csv` — best real team win% per decade (Era-mode targets), incl. `proj_wins_162`.
- `coverage_report.txt` — row counts, fWAR match rate, price range, unmatched sample.

## Locked constants (top of build_pricing.py — the tuning knobs)
```
W_BLEND  = 0.5     # rWAR = 0.5*bWAR + 0.5*fWAR
COEF     = 1.5     # price = 1.5 * rWAR^1.6
EXPONENT = 1.6     # calibrated so a ~60-rWAR roster ≈ $245M cap
PRICE_FLOOR_M = 1.0
POOL_MIN_YEAR = 1901
ELIG_GAMES    = 10   # min games at a position to be draft-eligible there
CLOSER_MIN_SV = 20   # saves to flag a closer option
SP_GS_RATIO   = 0.5  # GS/G >= this => starter-eligible
```

## Known items to smoke-test on real data
- **fWAR join is name+season** (with accent/suffix normalization). Expect a few
  unmatched pre-war seasons and duplicate common names — check `coverage_report.txt`
  and, if the miss rate is material, swap in the Chadwick register crosswalk
  (`key_bbref` ↔ `key_fangraphs`) for an exact-ID join.
- **Mid-season trades** are collapsed to one season row (bWAR summed, team = `TOT`);
  confirm that matches how you want split seasons drafted.
- **Two-way players** (Ohtani, deadball-era swingmen) appear in both bat and pitch
  spines; decide whether to keep both rows or merge.
