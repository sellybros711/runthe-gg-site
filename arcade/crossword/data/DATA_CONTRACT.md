# RunTheGrid Crossword — data contract

The generator (`../scripts/generate.mjs`) reads exactly two data files. Build
these and drop them in `grid/crossword/data/` — no code changes needed. Bigger
files = denser, more varied daily puzzles (crossword fill is dictionary-bound, so
more answers is strictly better).

**Global rules for every `answer`:** it's the grid entry. The pipeline uppercases
it and strips everything except A–Z (so `O'Neil` → `ONEIL`, `Ruth Jr.` → `RUTHJR`).
Only answers **3–8 letters** after stripping are used; anything else is silently
skipped. Answers should be unique across all sections; the first occurrence wins
(players are loaded first, then teams/stats/venues/glossary, then fill).

---

## 1. `baseball.csv` — players (the big, growable table)

One row per player. **Header row is required, with these exact column names:**

```
answer,first,team,note,hof
```

| Column | Meaning | Example |
|---|---|---|
| `answer` | Player **surname** = the grid entry | `RUTH` |
| `first` | First name — appears in the clue, never the answer | `Babe` |
| `team` | Primary team **nickname** | `Yankees` |
| `note` | Short signature fact, lowercase, **no leading capital, no trailing period**, reads naturally after the name | `who hit 714 career home runs` |
| `hof` | `1` if a Hall of Famer, else `0` | `1` |

The clue templates fill like: `Hall of Famer Babe ___` → `RUTH`, or
`Babe ___, who hit 714 career home runs` → `RUTH`. So `note` must complete the
sentence "`{first} ___, {note}`".

**CSV quoting:** if any field contains a comma, quote the whole field. Escape a
literal `"` by doubling it (`""`). Example row with a comma:

```
CLEMENTE,Roberto,Pirates,"who reached exactly 3,000 hits",1
```

Accuracy matters — this ships to a live site. Stick to well-established facts.

---

## 2. `baseball.json` — structured lookups + common fill

One JSON object with these five arrays (any may be empty/omitted):

```json
{
  "teams":    [ { "answer": "YANKEES", "city": "New York", "league": "AL", "venue": "Yankee Stadium" } ],
  "stats":    [ { "answer": "ERA", "full": "earned run average" } ],
  "venues":   [ { "answer": "FENWAY", "team": "Red Sox", "city": "Boston", "note": "home of the Green Monster" } ],
  "glossary": [ { "answer": "BUNT", "clue": "Soft tap to advance a runner" } ],
  "fill":     [ { "answer": "AREA", "clue": "Zone" } ]
}
```

| Section | Fields | Clue it produces |
|---|---|---|
| `teams` | `answer` (nickname), `city`, `league` (`AL`/`NL`), `venue` | `New York's AL team` / `MLB club that plays at Yankee Stadium` |
| `stats` | `answer` (abbr.), `full` (spelled out) | `Box-score abbr. for earned run average` |
| `venues` | `answer`, `team`, `city`, `note` | `Red Sox ballpark, home of the Green Monster` |
| `glossary` | `answer`, `clue` (baseball term, static) | uses `clue` verbatim |
| `fill` | `answer`, `clue` (common non-baseball word, static) | uses `clue` verbatim |

`fill` exists only to resolve crossings the baseball answers can't — the engine
always prefers baseball. Keep `fill` heavy on **3–5 letter** words (that's where
grids get stuck). `glossary`/`fill` `clue` is used exactly as written, so make it
a clean, self-contained crossword clue.

---

## How to grow it

- **More players** in the CSV is the single biggest win — aim for hundreds
  (thousands from a full Lahman export). Include a healthy mix of **short
  surnames** (4–6 letters); those do the crossing work.
- Keep `fill` a few hundred common words; it stays a minority as the player pool
  grows.
- Re-run `node scripts/generate.mjs 7` after dropping in new files.
