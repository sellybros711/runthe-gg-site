# Run The Arcade: the plan

2 September 2026. A ranked backlog from the code on `main` to
`docs/arcade-redesign-2026-09-02.md`, in passes of one to three hours that
each ship on their own.

Ranked by one question: **does this make a new player more likely to finish
day one and come back on day two?** Passes that need your approval before
they start are marked **ASK**. Nothing below changes ads, pricing, or the
server schema without one.

Passes 1 to 4 are built and on `main`. Pass 5 is half built. The rest wait.

| # | Pass | Hours | Day-one | Day-two | Needs |
|---|---|---|---|---|---|
| **1** | **The Day spine**: `day.js`, the ring on the hub and on every result screen, the Day Card when the ring is full, share-the-day, "Next" pulled up to the primary action | 3 | high | high | built |
| **2** | **Shared result screen** (`result.js`): one layout for every game, percentile line from the rank RPC, personal-best-as-event, streak line. Built and applied to the free four plus Guess and Common Ground. | 3 | high | high | **built** |
| **3** | Shared result screen on the rest. Built 3 Sep: Odd One Out, Number Game, Rank It, High Low, Roll Call and Chain. All twelve now set a spec, and `check-result.mjs` reads the game list out of `tokens.js` rather than carrying its own, so a game cannot be added and left off. Two of the six score LOWER is better: Rank It on tries, Chain on time. The check pins the `!prev \|\|` clause on both, because without it a player's very first solve is never gold and nothing looks broken. | 2 | med | med | **built** |
| **4** | **Cut the payload.** Built 2 Sep, and the target was written against the wrong number: `ls` says a game ships 2.5 MB, but Cloudflare compresses it to about 600 KB, so "under 150 KB" was chasing seven eighths that were never on the wire. What it cost instead was PARSING, which compression does not touch. The four generated datasets are packed (field names once, repeated strings once) and a 512px illustration serving as a 30px crest was re-encoded. Mean per page: **wire 607 to 440 KB, parsed bytes 2268 to 1424 KB**. `node scripts/measure-payload.mjs` prints the table. Per-day slices are NOT done and are now a smaller prize than they looked: several games reseed at random on replay, so a day slice would have to keep the pool anyway. | 3 | high | med | **built** |
| 5 | **The Arcade streak**: `arcade_day_streak` RPC, hub shows one streak. Migration applied 2 Sep; milestones at 3/7/14/30/100 and the streak-at-risk sentence are still to build | 2 | low | **high** | **part done** |
| 6 | **Grid shares for every game**: Sportegories 8 squares, Career Path reveal position, Chain as the chain, Crossword shape and time, Starting Five row | 2 | med | med | |
| 7 | **Shared feedback**: one right/wrong/perfect colour rule, one `+N` pop, one shake, one Check button label, countdown timers only | 2 | med | low | |
| 8 | **Career Path bounded**: five players a day, partial credit, par, no "until you miss" | 2 | high | med | |
| 9 | **Starting Five** (Roll Call reworked): ten names, five started, decoys by adjacency | 3 | med | med | |
| 10 | **Chain onboarding**: demo-first gate until the first solve, the chain as the share | 1 | med | low | |
| 11 | **Common Ground absorbs "name the link"**; Odd One Out retired to the archive | 2 | low | low | **ASK** (a cut) |
| 12 | **Golden game**: High Low unlocks on a full ring, tile leaves the daily grid | 1 | low | med | **ASK** (a lineup change) |
| 13 | **Cut Number Game and Rank It**: tiles off, routes to hub, records kept in My Card and the archive | 1 | low | low | **ASK** |
| ~~14~~ | ~~**The free set** becomes Sportegories, Career Path, Guess the Player, Common Ground~~ **Proposed, applied, reverted 2 Sep.** The argument stands (the two games that end in a shareable grid were both behind the card) and the counter-argument won: the crossword is a daily habit for people who already have one, so the cost is paid today by real players against a growth benefit that is a bet. Revisiting it is one line in tokens.js and one in arcade_free_games(). | 1 | high | high | **declined** |
| 15 | **Stat Line**, new game, on the shell | 3 | low | med | Passes 2 and 7 |
| 16 | **Comeback and near-miss** lines on hub and result screen | 1 | low | med | |
| 17 | **Weekly recap** card on the hub, Sundays | 2 | low | med | |
| 18 | **Timeline**, new game, on the shell | 3 | low | med | Passes 2 and 7 |
| 19 | **`check-daily.mjs`**: 30 days of every game asserted solvable, single-answer, fair, unrepeated, unleaked; gates the data refreshes | 3 | med (fewer bad days) | med | |
| 20 | **One clock**: the day boundary computed in one place, and the client and `arcade_spend_game` agreeing on it | 2 | low | low | **ASK** (touches the spend RPC) |
| 21 | Alma Mater folded into Career Path's scouting file and Stat Line's hints; tile retired | 2 | low | low | **ASK** (a cut) |
| 22 | Tests: scoring maps for every game, streak extend and reset, midnight rollover, missed day, all-done, guest vs signed-in, run as one suite in CI | 3 | (prevents regressions in all of the above) | | |

Passes 2 to 7 are the shell. After them, every later pass is a game being
built *on* the shell rather than beside it, which is what keeps this from
becoming twelve more one-off modals.

Pass 22 is listed last because it is ranked by player impact, and it should
be *done* alongside Passes 2, 5 and 8, not after them. Each of those passes
adds its own tests as it goes.

## What Pass 1 is, and why it went first

The critique found the loop breaks at "see your streak" and "a reason to come
back," and both breaks are the same absence: nothing accumulates across a
day, and nothing carries across days. The Day spine is the smallest thing
that makes something accumulate. It touches no game's board, no scoring, and
no server. It is one shared module, the hub, and the strip that already
sits on every result screen.

What it does, end to end:
- **`arcade/day.js`**: one place that knows, for today, which games are
  available to this player, which are done, and what each one's result line
  is. The hub and every game page read it.
- **The ring**: an SVG ring, games done of games available, on the hub in
  place of "N / M played," and in every game's result strip.
- **NEXT as the primary action**: the result strip's "Next: X" becomes the
  button, above the game's own buttons, styled like the game's PLAY pill.
- **The Day Card**: when the ring is full, the hub's top block becomes the
  card: full ring, every game's line, "Share today" (an emoji row per game
  through `share.js`), and the countdown.
- **The last result screen** says SEE YOUR DAY and opens the hub on the card.

What it does *not* do, on purpose: no Day Score yet (the per-game 0 to 100
maps are Pass 2's scoring contract and should be tested, not guessed at
midnight), no Arcade streak (needs the server read, Pass 5), no percentile
(Pass 2).

## How to play Pass 1

It is on the branch, not on `main`. Locally:

```
git fetch origin claude/runthe-gg-design-background-l1u1h5
git checkout claude/runthe-gg-design-background-l1u1h5
python3 -m http.server 8000
```

then open `http://localhost:8000/arcade/`. Play any game to the result
screen and watch the strip; play all of the free four (or all twelve as a
member) and go back to the hub.
