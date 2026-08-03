# Run The Arcade — Daily Crossword

A daily sports crossword. One puzzle a day, fill the grid, beat the clock, keep
your streak alive. Lives at `runthe.gg/arcade/crossword/`.

`RunTheGrid` is the **hub** for grid games — this Daily Crossword is one game
inside it; the Daily Matching Game is its sibling (`/arcade/match/`). The hub
landing is at `/arcade/`.

## What's here

A working front end **plus** a working generation pipeline for one launch sport
(baseball). The puzzles in `puzzles.js` are produced by the pipeline from a real
dataset — every clue is generated from a data row, not hand-written.

| File | Role |
|---|---|
| `index.html` | The whole game UI (self-contained). Renders any `{rows, entries}` puzzle of any size; on-screen + physical keyboard, across↔down, Check/Reveal, timer, streak (`localStorage` key `rtg:cw:v1`), win modal + emoji share, leaderboard teaser. |
| `puzzles.js` | **Generated** daily puzzles (`window.RTG_PUZZLES`). Do not hand-edit — re-run the generator. The UI serves today's puzzle by date, falling back to the first. |
| `data/baseball.csv` | **Players** — the big, growable answer table (one row each). Built by the data pipeline / externally. |
| `data/baseball.json` | **Teams, stats, venues, glossary, and common fill** words. Built externally alongside the CSV. |
| `data/DATA_CONTRACT.md` | The exact schema for those two files — hand this to whoever/whatever builds the data. |
| `scripts/generate.mjs` | **The pipeline.** load CSV+JSON → extraction (§5) → template clues (§4) → backtracking fill (§6) → difficulty (§7) → writes `puzzles.js`. Deterministic per date. |
| `scripts/find_templates.mjs` | Dev tool: searches black-square templates the current bank can actually fill. |

## Regenerate the puzzles

```
cd grid/crossword
node scripts/generate.mjs 7      # writes puzzles.js with 7 daily puzzles
```

Each daily puzzle is seeded from its date, so a given day always regenerates the
same grid + clues (reproducible). The clue for a repeated answer rotates by date
via the template library — e.g. `OTT` is clued "Hall of Famer Mel ___" one day,
"Giants great Mel ___" the next — which is the no-repeat mechanism (GDD §6) in
miniature.

## View it locally

Static, no build step:

```
cd grid/crossword && python3 -m http.server 8000   # http://localhost:8000/
```

## What's proven vs. what scales with data

**Proven end to end (this is the valuable part):** dataset → answer extraction
with category + difficulty metadata → template-driven clue generation → a
backtracking fill that produces a *machine-verified valid* grid (every across and
down run is a real bank word) → difficulty scoring → a `puzzles.js` the UI serves
unchanged. Add another sport by dropping in another `data/<sport>.json` and its
templates; nothing else changes.

**Limited by the demo dataset's size — not by the design:** the sample grids skew
toward common fill and don't vary much day to day, because the curated demo bank
is small (~130 baseball answers + ~350 fill words). Crossword construction is
dictionary-bound: a dense, theme-heavy 5×5 needs a large answer pool. The
production system inherits **thousands** of answers per sport from the real
datasets (Lahman, nba_api, nflverse), at which point the same fill engine yields
theme-dense, varied daily grids and the fill list becomes a small minority. The
generator is written to scale straight into that — it just needs the bigger bank.

## From here → full launch (GDD build sequence §8)

1. **Baseball to full scale** — swap the curated `baseball.json` for the Lahman
   extraction (players × season-years), which supplies the large answer pool the
   fill engine needs for rich daily grids.
2. **Basketball + Football** — `data/basketball.json`, `data/football.json` +
   their template sets (nflverse already owned).
3. **Grid sizes 7×7 / 8×8** and difficulty→size coupling (GDD §7); the UI already
   renders any size.
4. **No-repeat store** — persist used (answer, template, date) combos over a
   60–90 day window (GDD §6).
5. **Leaderboard + accounts** — wire the teaser to Supabase (same project as
   soccer/golf): one combined daily board ranked by completion time (GDD §1).
6. **Ship into the site** — homepage game card, `sitemap.xml`,
   `manifest.webmanifest` + icons.
7. **Seven limited sports** as curated Track A-lite lists (GDD §8).
