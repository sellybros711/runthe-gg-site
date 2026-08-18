---
description: Pull the latest DataGolf skill ratings and re-rate the RunTheTour roster (in-session, human-reviewed)
---

# /update-rosters — refresh the golfer metrics from DataGolf

The owner triggers this (e.g. every Tuesday in season) by saying "update rosters" or `/update-rosters`.
It runs the roster re-rating pipeline that already exists (`build-a-golfer/dg_transform.py`), shows the
biggest movers for a human eyeball, and only writes after that. Follow these steps in order; do NOT skip
the review.

## DIVISION OF LABOR (owner's rule) — this environment extracts the roster data ONLY
This "Golf Roster Updates" environment is for **updating and extracting rosters only**. It produces the
new `golfers.json` and pushes just that one data file. It does **NOT** edit `build-a-golfer.html`, does
**NOT** regenerate the game's embedded `ROSTER`, and does **NOT** deploy to `/golf`. All game-file edits
and the live deploy happen in the main dev chat, which pulls `golfers.json`, patches the embedded ROSTER
from it (offline — see the hand-off note in Step 5), smoke-tests, and ships. That keeps the game source of
truth on one branch and one owner, so a roster deploy can never revert unrelated game work.

## What this touches (in THIS environment)
- `build-a-golfer/dg_transform.py` — the pull + re-rate tool (reads `DG_KEY` from env, hits
  `feeds.datagolf.com/preds/skill-ratings`, matches by name, re-rates the ~136 CURRENT player cards).
- `build-a-golfer/golfers.json` — the roster data file (`--write`). **This is the only file you commit.**
- NOT touched here: `build-a-golfer/build-a-golfer.html` (the embedded `const ROSTER=[…]`) and
  `golf/index.html` on `main` — those are the game dev chat's job (Step 5).
- ONLY the ~136 cards stamped `"data_source":"current (DataGolf …)"` change. Prime cards, retired greats,
  and `"reputation"` legends are hand-rated and are NOT touched by the pull.

## Step 0 — preflight (fail loudly, don't guess)
1. `echo "${DG_KEY:+set}"` — if it prints nothing, STOP: tell the owner to set `DG_KEY` in the
   environment's variables (never pasted in chat). Do not proceed.
2. `timeout 8 curl -sS -o /dev/null -w "%{http_code}\n" "$HTTPS_PROXY/__agentproxy/status" 2>/dev/null`
   then test reachability:
   `timeout 10 curl -sS -o /dev/null -w "%{http_code}\n" "https://feeds.datagolf.com/preds/skill-ratings?key=probe"`
   — if it returns `000`/403/407, `feeds.datagolf.com` is blocked by the network policy. STOP: tell the
   owner it must be allowed in the environment's network policy. (See /root/.ccr/README.md for proxy state.)
3. `cd build-a-golfer && git status` — note the branch. All work stays on the designated feature branch
   `claude/build-a-golfer-prototype-9zdmcq`; never commit roster data to `main` except the deploy step.

## Step 1 — dry run + the movers report
```
cd build-a-golfer
python3 dg_transform.py --report /tmp/dg_report.txt
```
This pulls the feed and PRINTS a match/biggest-moves report WITHOUT writing anything. Read the report.

## Step 2 — review before writing (the whole point of a human trigger)
Surface to the owner, and flag anything that needs a decision:
- **Match rate** — how many of the ~136 current players matched by name. A sudden drop means DataGolf
  renamed/transliterated someone; check the "unmatched" list and add an ALIAS in `dg_transform.py` if a
  real player fell out, then re-run Step 1. Do NOT ship a roster that silently dropped players.
- **Biggest movers** — a few points is normal week to week; a double-digit swing or a new #1 is worth a
  sanity check against the actual golf results that week.
- **Overall spread** — mean should stay ~80 (tour average anchor); the ceiling should be a real top player.
Only continue once the report looks sane.

## Step 3 — apply (data file ONLY — no `--html`)
```
cd build-a-golfer
python3 dg_transform.py --write
```
Writes `golfers.json` (a `.bak` is made). `data_source` is dated to the FEED date, not today. Do NOT pass
`--html`: the game chat regenerates the embedded ROSTER from this `golfers.json` (Step 5 hand-off), so
patching `build-a-golfer.html` here would create a stale edit on the wrong branch.

## Step 4 — sanity-check `golfers.json` (data only)
- Confirm it parses and is intact (no in-game test here — that's the game chat's job):
  `python3 -c "import json; g=json.load(open('golfers.json'))['golfers']; print(len(g)); assert all(isinstance(p[k],(int,float)) for p in g for k in ('dist','acc','app','sht','scr','bnk','put','clu','overall'))"`
  — expect ~242 players, every skill numeric.
- Confirm only the ~136 `current (DataGolf …)` cards moved; legends/primes unchanged.
- Spot-check 2-3 known movers in `golfers.json` to confirm the new numbers landed.

## Step 5 — commit `golfers.json` ONLY, then hand off
Pull the branch first so the data commit sits on top of the latest game code, then commit the ONE data file:
```
cd .. && git fetch origin && git checkout claude/build-a-golfer-prototype-9zdmcq
git pull --ff-only origin claude/build-a-golfer-prototype-9zdmcq
git add build-a-golfer/golfers.json          # ONLY the data file — never build-a-golfer.html
git commit   # message: "Refresh roster data from DataGolf feed YYYY-MM-DD" + the co-author/session trailer
git push origin claude/build-a-golfer-prototype-9zdmcq   # retry w/ backoff on network error
```
Do NOT commit the raw DataGolf CSV/JSON feed (3rd-party data / licensing) — it is not needed to re-run.
Then tell the owner the roster data is pushed. **The game chat finishes it** by pulling `golfers.json` and
patching the embedded ROSTER offline (no DG_KEY / no network):
```
cd build-a-golfer
python3 -c "import dg_transform, json; g=json.load(open('golfers.json'))['golfers']; print('synced', dg_transform.sync_html('build-a-golfer.html', g, {p['name'] for p in g}), 'ROSTER lines')"
```
then smoke-tests and deploys `/golf` via the established method.

## Step 6 — deploy is NOT done here
The `/golf` deploy (regenerate `golf/index.html` from `build-a-golfer.html`, push to `main`) happens in the
game dev chat, not this environment. This keeps game-file edits and the live push on one owner so a roster
refresh can never revert unrelated game work. Do not deploy from here.

## Notes
- Cadence: the owner runs this when they want (Tuesdays in season is the plan). Off-season / no-change weeks
  produce a near-empty diff — fine, just don't deploy a no-op.
- The paid DataGolf API key is the ONLY external dependency; keep it in env/secrets, never in code, logs,
  commits, or chat.
- A fully-automatic weekly alternative (a scheduled GitHub Action that opens a PR) is documented as an
  option; this runbook is the owner-triggered, human-reviewed path.
