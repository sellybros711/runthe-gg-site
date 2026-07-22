# RunTheGrid — Daily Crossword

A daily sports crossword. One puzzle a day, fill the grid, beat the clock, keep
your streak alive. Lives at `runthe.gg/grid/crossword/`.

`RunTheGrid` is the **hub** for grid games — this Daily Crossword is one game
inside it; the Daily Matching Game is its sibling (`/grid/match/`, separate). The
hub landing at `/grid/` is still to be built.

## Status: design prototype

This is a **working front-end prototype**, not the production game. It is fully
playable today against a single hand-verified sample puzzle so the design, feel,
and UX can be reviewed in the browser. What's real vs. stubbed:

| Real | Stubbed for the prototype |
|---|---|
| Grid render, cell/word selection, across↔down toggle | Single sample puzzle (not a live daily) |
| Keyboard input (on-screen + physical), arrows, Tab between clues | No sports data pipeline yet (see below) |
| Timer, Check, Reveal, win detection | Leaderboard is a static teaser (no Supabase) |
| Streak logic + best time (`localStorage`, key `rtg:cw:v1`) | No accounts / online sync |
| Completion modal + emoji share grid | Share posts text only, no share-image/OG |

## Files

| File | Role |
|---|---|
| `index.html` | The whole game UI (self-contained: inline styles + logic). Renders any `{rows, entries}` puzzle, of any size. |
| `puzzles.js` | The daily puzzle data (`window.RTG_PUZZLES`). One machine-verified 5×5 sample with sports-flavored clues. |
| `scripts/fill.mjs` | Proof-of-concept crossword **fill engine** (GDD §6): backtracking word-fill over black-square templates, sports terms preferred, picks the sportiest valid fill. `node scripts/fill.mjs` prints a grid + the JSON that becomes a `puzzles.js` entry. |

## View it locally

It's static — no build step:

```
cd grid/crossword && python3 -m http.server 8000
# open http://localhost:8000/
```

Or open `index.html` directly (fonts need a network; everything else works offline).

## Design language

Matches the rest of RunThe.GG (same tokens as `/football/`): dark-navy
background, cream text, gold accent (`--gold:#f2b21c`), `Press Start 2P` for the
`RunTheGrid` wordmark only, `Rubik` for everything else. The grid uses a gold
selected cell, a blue active-word highlight, and NYT-style corner numbering.

## From prototype → live daily game

Mirrors the GDD build sequence (§8) and how RunTheDrive/RunThePitch shipped:

1. **Pick launch sports + data sources** — Baseball (Lahman), Basketball
   (nba_api/Kaggle), Football (nflverse, already owned). *Design is code-ready
   once this is chosen.*
2. **Extraction pipeline** → a cleaned answer word-list (3–8 letters) with
   category / length / fame-signal metadata (GDD §5). Feeds the fill engine.
3. **Template library** (GDD §4) — sentence-shell clues per category; the
   template × data-row combinations give the no-repeat pool (GDD §6).
4. **Grow the fill engine** in `scripts/fill.mjs` from POC to production: real
   dictionary/answer bank, 5×5 / 7×7 / 8×8 templates, difficulty→size coupling
   (GDD §7), and a daily deterministic seed so everyone gets the same grid.
5. **Generate dailies** — emit one `puzzles.js`-shaped record per day (or fetch
   from an endpoint); the UI already renders any size/shape unchanged.
6. **Static Track B glossary** (equipment/terms) — small, one-time (GDD §2/§8).
7. **Leaderboard + accounts** — wire the teaser to Supabase (same project as
   soccer/golf): one combined daily board ranked by completion time (GDD §1).
8. **Ship into the site** — build the `/grid/` hub, add a game card to the
   homepage, add routes to `sitemap.xml`, add `manifest.webmanifest` + icons.
9. **Layer in the seven limited sports** as curated Track A-lite lists.
