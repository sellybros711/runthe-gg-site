# Run The Arcade — daily sports puzzles

RunTheGrid is a small suite of quick, daily sports brain-games on RunThe.GG,
sitting alongside RunTheTour (golf), RunThePitch (soccer) and RunTheDrive
(football). It's the "NYT Games" corner of the site: one of each puzzle a day,
one streak, one wallet.

Lives at `runthe.gg/arcade/`. **Hidden for now** — `noindex`, not linked from the
homepage — same as `/touchdown/` while it's in development.

```
/arcade/
  index.html            RunTheGrid hub — lists the day's puzzles
  match/                 Common Ground (live)
    index.html          the whole game UI, self-contained
    entities.js         tagged entity database — the real content source
    generator.js        seeded RNG + inverted-index generator + uniqueness solver
    data.js             authored, solver-verified board bank (fallback)
    verify.js           QA harness for the authored bank
    verify-generator.js QA harness for the data-driven generator
  (crossword/)          Daily Crossword — planned, not built yet
```

## The games

| Puzzle | Path | Status |
|---|---|---|
| **Common Ground** | `/arcade/match/` | Playable prototype |
| **Daily Crossword** | `/arcade/crossword/` | Planned |

There is no coin economy — the arcade is about building the longest daily
streak (NYT-style). Each game keeps its own streak (`grid_match_streak`, etc.);
in the prototype these live in localStorage, and the real build reads the
shared RunThe.GG account.

---

## Common Ground: "The Draft Board"

Sort 25 sports names into five hidden categories of five. A lane only checks
when it's full, so you can stage guesses freely; a wrong lane costs a miss and
+5s. Five misses allowed, the sixth ends the board. Easy mode shows the category
headers, Hard mode hides them. Built to the design spec in
`DailySportsMatchingPuzzleSpec` — see the section map below.

### Sport weighting

Football (NFL) and basketball (NBA) are the co-leads, baseball (MLB) a close
third. Golf/tennis/hockey/Olympics/wrestling/boxing/UFC are reserved for
occasional cameos as the very biggest stars only — none lead a board. The launch
bank stays inside NFL/NBA/MLB.

### How the spec maps to the code

| Spec section | Where |
|---|---|
| §2 Interaction (validate on lane-fill, bounce-back, modes) | `match/index.html` — `validate()`, `placeInLane()` |
| §4 Uniqueness solver (exactly ONE assignment) | `generator.js` — `solve()` / `isUnique()` |
| §5 Trap density (3–6 extra edges) | `generator.js` — `trapEdges()` |
| §6 Difficulty scoring + lane colours | `generator.js` — `scoreBoard()`, `categoryDifficulty()` |
| §7 Timer, par, coins, hints | `match/index.html` — `coinsFor()`, `parTimes()`, hint handlers |
| §8 Draft-Grade share card | `match/index.html` — `gradeFor()`, `shareText()` |
| §0/§10 Deterministic daily seed | `generator.js` — `seededRandom()`, `generateDaily()` |

### The one hard requirement

**Every board has exactly one valid complete assignment.** Without it a player
can deduce correctly and be told they're wrong. `generator.solve()` enforces it
(DFS over the tile→lane graph, aborting at the second solution — microseconds at
n=25), and `verify.js` asserts it for every board. Traps are *extra edges* in
that graph — an entity that genuinely fits two lanes but resolves to one
globally — which is real deduction, not a gotcha.

### Content: the data-driven generator

Boards are generated from the **tagged entity database** (`entities.js`), not
hand-authored. `generator.buildFromDB()` builds an inverted index over the tags,
discovers every candidate category (teams, jersey numbers, draft, awards,
milestones, positions, birthplaces, plus wordplay — surname/initials/alliterative
— derived from the name string), filters to viable ones (size, average fame, ≥2
recognizable anchors), samples 5 under the spread rules (§3), assigns a unique
25-tile board (`solve()` enforces exactly one solution), and tunes trap density
to 3–6. `daily()` runs this first and falls back to the authored bank only if a
given day can't satisfy the constraints.

**Why variety scales with tagging, not just headcount.** A single richly-tagged
star anchors ~12 different categories (LeBron = #23 / 2003 draft / #1 pick / born
in Ohio / scoring champ / 40K club / "James" / Cavaliers…), so every day pulls a
different slice. Categories are combinatorial, not enumerated.

**Measured on the current 79-entity seed** (`node verify-generator.js`):

| Metric | Result |
|---|---|
| Boards with exactly one solution | 365 / 365 |
| Distinct exact boards over a year | 364 / 365 (1 repeat) |
| Distinct 5-category line-ups | 340 (a set recurs ≤3×) |
| Trap density | always 3–6 |
| Avg. fame of shown names | 4.62 / 5 |

Even the seed goes ~a year with one repeat. Growing toward the spec's ~600
entities makes repeats effectively impossible for years and widens the category
menu (the seed leans on a few statistical/achievement lanes because it only has
3 statistical categories and no dense wordplay yet — both are pure DB-depth
fixes).

### Scaling the database

The seed is hand-tagged. To reach "as much info as possible" the real fill is
**importers over free canonical datasets**, not hand entry:

- **NFL** — nflverse (already used by RunTheDrive) + Pro-Football-Reference
- **NBA** — basketball-reference / nba_api
- **MLB** — the Lahman Database + Retrosheet

Structured tags (teams, draft, awards, stats) import automatically; wordplay tags
are derived from the name in code; `fame_tier` is the one manual overlay (and can
bootstrap from All-Star counts / HOF / career value). The generator consumes
whatever `entities.js` exports — no code change needed as the DB grows.

### QA

```
cd grid/match && node verify.js            # authored bank
cd grid/match && node verify-generator.js  # data-driven generator + variety report
```

Checks (spec §11): every board has exactly one solution, the authored solution
matches it, trap density is 3–6, family spread ≥3 with ≤2 per family, sport
spread ≥3, all 25 tiles assigned; then dry-runs a full year, asserts uniqueness
on every generated board, and reports the variety numbers above.

## Open items

- Wire coins/streak/leaderboard to the real RunThe.GG account (Supabase) instead
  of localStorage. (Mandatory before public launch — the streak + leaderboard are
  the retention hook.)
- Grow the entity DB via importers (nflverse / basketball-reference / Lahman) and
  add cross-day cooldowns (14-day player, 60-day category) at the backend layer.
- Fact-check pass on `entities.js` — the solver guarantees uniqueness but cannot
  know if a *tag* is wrong; a bad fact is the only way a "correct" answer misfires.
- Build the Daily Crossword.
- Decide archive access (seed-generated past days are free to serve).
- Add the game to the homepage roster when it leaves `noindex`.
