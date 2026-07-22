# RunTheGrid — daily sports puzzles

RunTheGrid is a small suite of quick, daily sports brain-games on RunThe.GG,
sitting alongside RunTheTour (golf), RunThePitch (soccer) and RunTheDrive
(football). It's the "NYT Games" corner of the site: one of each puzzle a day,
one streak, one wallet.

Lives at `runthe.gg/grid/`. **Hidden for now** — `noindex`, not linked from the
homepage — same as `/football/` while it's in development.

```
/grid/
  index.html            RunTheGrid hub — lists the day's puzzles
  matching/             Daily Match (live)
    index.html          the whole game UI, self-contained
    data.js             authored, solver-verified board bank
    generator.js        seeded RNG + uniqueness solver + difficulty + daily pick
    verify.js           QA harness (node verify.js)
  (crossword/)          Daily Crossword — planned, not built yet
```

## The games

| Puzzle | Path | Status |
|---|---|---|
| **Daily Match** | `/grid/matching/` | Playable prototype |
| **Daily Crossword** | `/grid/crossword/` | Planned |

Coins are a shared RunTheGrid wallet (`runthegrid_coins`); each game keeps its
own streak (`grid_match_streak`, etc.). In the prototype these live in
localStorage; the real build reads the shared RunThe.GG account.

---

## Daily Match — "The Draft Board"

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
| §2 Interaction (validate on lane-fill, bounce-back, modes) | `matching/index.html` — `validate()`, `placeInLane()` |
| §4 Uniqueness solver (exactly ONE assignment) | `generator.js` — `solve()` / `isUnique()` |
| §5 Trap density (3–6 extra edges) | `generator.js` — `trapEdges()` |
| §6 Difficulty scoring + lane colours | `generator.js` — `scoreBoard()`, `categoryDifficulty()` |
| §7 Timer, par, coins, hints | `matching/index.html` — `coinsFor()`, `parTimes()`, hint handlers |
| §8 Draft-Grade share card | `matching/index.html` — `gradeFor()`, `shareText()` |
| §0/§10 Deterministic daily seed | `generator.js` — `seededRandom()`, `generateDaily()` |

### The one hard requirement

**Every board has exactly one valid complete assignment.** Without it a player
can deduce correctly and be told they're wrong. `generator.solve()` enforces it
(DFS over the tile→lane graph, aborting at the second solution — microseconds at
n=25), and `verify.js` asserts it for every board. Traps are *extra edges* in
that graph — an entity that genuinely fits two lanes but resolves to one
globally — which is real deduction, not a gotcha.

### Prototype vs. the full spec

The spec generates boards from a ~600-entity tagged database via an inverted
index (§5). The prototype ships an **authored board bank** instead, and runs the
real solver / difficulty / RNG on top of it. The path to the full generator:

1. Grow `data.js` into the tagged entity table (`fame_tier`, `jersey_number`,
   `teams`, `awards`, `surname`, … per spec §3).
2. Implement `selectBoard()` in `generator.js`: build the inverted index, filter
   viable categories (§2 constraints), sample 5 with family/sport/difficulty
   spread (§3), then reuse the existing `solve()` to enforce uniqueness and
   `trapEdges()` to tune trap density.
3. `generateDaily()` already deterministically drives everything else.

### QA

```
cd grid/matching && node verify.js
```

Checks (spec §11): every board has exactly one solution, the authored solution
matches it, trap density is 3–6, family spread ≥3 with ≤2 per family, sport
spread ≥3, all 25 tiles assigned; then dry-runs 365 consecutive days for zero
generation failures and confirms determinism.

## Open items

- Wire coins/streak/leaderboard to the real RunThe.GG account (Supabase) instead
  of localStorage.
- Grow the entity DB and switch on the full inverted-index generator.
- Build the Daily Crossword.
- Decide archive access (seed-generated past days are free to serve).
- Add the game to the homepage roster when it leaves `noindex`.
