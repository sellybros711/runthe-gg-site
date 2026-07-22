# RunTheGrid

The hub for RunThe.GG's daily grid games. `/grid/` is the chooser; each game
lives in its own folder and they **share one streak, stats, and account** through
a single module.

```
/grid/                 the chooser (hub landing)
/grid/rtg.js           shared state: streak · stats · account (both games use it)
/grid/crossword/       Daily Crossword  (live)
/grid/match/           Daily Match      (drop in here)
```

## Shared state — `/grid/rtg.js`

One `localStorage` namespace (`rtg:v1`) holds a **combined streak** (a day counts
if you finish *either* game), per-game stats, shared coins, and an account slot
for later RunThe.GG sync. Both games load the same file:

```html
<script src="/grid/rtg.js"></script>
```

A game only needs **two calls**:

```js
// when the player completes today's puzzle:
RTG.recordPlay("match", { win: true, timeSec: 73, moves: 18 });
//   -> advances the shared streak at most once per day; stores best time and
//      any extra fields (moves, etc.) per game. Idempotent per game per day.

// to show the current streak anywhere:
RTG.getStreak();            // e.g. 3
```

Also available: `RTG.playedToday(game)`, `RTG.gameStats(game)` (`{bestTime,plays,…}`),
`RTG.get()` (full snapshot), `RTG.addCoins(n)`, `RTG.onChange(fn)`. Game keys the
hub knows: `"crossword"`, `"match"`.

The hub reads this to show the streak chip and a "✓ Done today" badge per game;
the crossword calls `RTG.recordPlay("crossword", …)` on solve. When the match
game does the same with `"match"`, the streak is instantly shared — no other
wiring.

## Adding the Match game

1. Put a **self-contained** `index.html` (+ its assets) in `/grid/match/`.
2. Load `/grid/rtg.js` and call `RTG.recordPlay("match", { win, timeSec, … })`
   when the daily board is completed; read `RTG.getStreak()` for display.
3. Use the shared design tokens for a consistent look: background `#0a1420`,
   panel `#12273c`, gold accent `#f2b21c`, green `#7bd67e`; `Press Start 2P` for
   the RunTheGrid wordmark only, `Rubik` for everything else.
4. In `/grid/index.html`, flip the Match card from `class="card soon"` to
   `class="card live"` and its label from "Coming to the hub" to "Play now →".

That's it — the hub, streak, and stats already account for both games.
