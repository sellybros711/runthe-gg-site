---
description: Pull the latest DataGolf skill ratings and re-rate the RunTheTour roster (in-session, human-reviewed)
---

# /update-rosters — refresh the golfer metrics from DataGolf

The owner triggers this (e.g. every Tuesday in season) by saying "update rosters" or `/update-rosters`.
It runs the roster re-rating pipeline that already exists (`build-a-golfer/dg_transform.py`), shows the
biggest movers for a human eyeball, and only writes/deploys after that. Follow these steps in order; do
NOT skip the review or deploy silently.

## What this touches
- `build-a-golfer/dg_transform.py` — the pull + re-rate tool (reads `DG_KEY` from env, hits
  `feeds.datagolf.com/preds/skill-ratings`, matches by name, re-rates the ~136 CURRENT player cards).
- `build-a-golfer/golfers.json` — the roster data file (`--write`).
- `build-a-golfer/build-a-golfer.html` — patches the embedded `const ROSTER=[…]` (`--html`), which is the
  source of truth the game runs from.
- `golf/index.html` on `main` — the LIVE deploy, regenerated from `build-a-golfer.html`.
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

## Step 3 — apply
```
cd build-a-golfer
python3 dg_transform.py --write --html build-a-golfer.html
```
Writes `golfers.json` (a `.bak` is made) and patches the embedded ROSTER in `build-a-golfer.html`,
touching ONLY the re-rated lines. `data_source` is dated to the FEED date, not today.

## Step 4 — smoke test (never ship an unparsed roster)
- `cd build-a-golfer && node --check` is not applicable (HTML). Instead parse-check the inline scripts and
  confirm the ROSTER array is intact:
  - Verify `ROSTER` still has the expected count (~242 total) and every skill is numeric.
  - If Playwright is available (global at `/opt/node22/lib/node_modules/playwright`), load the file over a
    local http server and confirm: the game boots with 0 page errors, a draft spins + reveals a golfer, and
    a card's stats render. (See prior test harnesses in prior sessions for the pattern.)
- Spot-check 2-3 known movers in the file to confirm the new numbers landed.

## Step 5 — commit (feature branch)
```
git add build-a-golfer/build-a-golfer.html build-a-golfer/golfers.json
git commit   # message: "Refresh roster from DataGolf feed YYYY-MM-DD" + the co-author/session trailer
git push -u origin claude/build-a-golfer-prototype-9zdmcq   # retry w/ backoff on network error
```
Do NOT commit the raw DataGolf CSV/JSON feed (3rd-party data / licensing) — it is not needed to re-run.

## Step 6 — deploy to /golf (ONLY on explicit confirmation)
The game is live at runthe.gg/golf via `golf/index.html` on `main`. This is an outward-facing change to a
live product, so CONFIRM with the owner before deploying (unless they pre-authorized "just ship it" in the
trigger). To deploy: regenerate the stripped `golf/index.html` from the updated `build-a-golfer.html` and
push it to `main` using the established /golf deploy method (a detached worktree on `origin/main`; the two
relative PWA links are stripped for the /golf path). Confirm `golf/index.html` ends up byte-identical to
the intended source and that ONLY that file changed. Verify runthe.gg/golf boots after.

## Notes
- Cadence: the owner runs this when they want (Tuesdays in season is the plan). Off-season / no-change weeks
  produce a near-empty diff — fine, just don't deploy a no-op.
- The paid DataGolf API key is the ONLY external dependency; keep it in env/secrets, never in code, logs,
  commits, or chat.
- A fully-automatic weekly alternative (a scheduled GitHub Action that opens a PR) is documented as an
  option; this runbook is the owner-triggered, human-reviewed path.
