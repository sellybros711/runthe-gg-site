# Run The Arcade: the redesign

2 September 2026. This is the Arcade I would ship, built from the code that
exists. It follows `docs/arcade-critique-2026-09-02.md` and does not repeat its
arguments. Where something needs your approval before it can be built (the
free lineup, a new server read) it is marked **ASK**.

Sacred and unchanged: a daily sports habit, solo, feeding shared RunThe.GG
streaks, trophies and leaderboards, every game under two minutes.

---

## 1. The lineup

**Eight dailies and one bonus.** Every daily is bounded (a fixed number of
rounds or a clock), gives partial credit, produces an emoji grid, and reports
a 0 to 100 score against a par. No daily ends on a single miss.

| # | Game | From | Tier today | Tier proposed | What changes |
|---|---|---|---|---|---|
| 1 | **Sportegories** | keep | free | free | Grid share (8 squares). Rarity kept. Par per letter. |
| 2 | **Career Path** | keep | free | free | Bounded: 5 players a day, not "until you miss." Score is reveal position. Grid share. |
| 3 | **Guess the Player** | keep | card | **free (ASK)** | Column legend on first round. Grid share exists. |
| 4 | **Common Ground** | keep | card | **free (ASK)** | Absorbs Odd One Out's "name the link": naming a solved group's category is a bonus point. |
| 5 | **Daily Crossword** | keep | free | **card (ASK)** | Curated moments in clues (cluebank) at a much higher rate; grid-shape share with time. |
| 6 | **Starting Five** | Roll Call, reworked | card | card | Ten names, five started, tap five. Decoys by adjacency. |
| 7 | **Chain** | reworked | card | card | Demo-first gate on every visit until the first solve. The chain is the share. |
| 8 | **Stat Line** | new | | card | Three box-score lines, name the player, hints cost points. |
| bonus | **High Low** | reworked | card | card, unlocks after the day | Endless, best-on-card. The reward for finishing. |

**Cut:** Number Game, Rank It, Odd One Out. Their saves, streaks and boards
are kept read-only in My Card for a season so nobody loses a record; the
tiles go, the routes redirect to the hub, the archive keeps their past days.

**Alma Mater** is not in the eight. Its mechanic (type the school) lives on
inside Career Path as the scouting file (college shown after the first club)
and inside Stat Line as a hint. If you want it kept as a standalone, it
becomes a bounded 6-player round with the four-choice fallback always visible;
I would rather fold it.

**The free four (ASK).** The proposal swaps Crossword out and Guess the Player
and Common Ground in, so the free set is the four most *shareable* games:
Sportegories, Career Path, Guess the Player, Common Ground. That is the set
a stranger can be sent a card from and want to play. Crossword is the most
generic format and the one most likely to be bought for. This is a change to
the free-to-play model and I have not made it; the day spine built in Pass 1
works with any four.

**Second game on the free tier, later:** Timeline (from the critique's new
game list) is the strongest candidate for a ninth game once the eight are
solid, and Feud is the strongest for a tenth. Neither is in this lineup on
purpose. Eight, done well, first.

---

## 2. The hub

The hub's job is to be the ring.

```
+------------------------------------------------+
|  Run The Arcade                    [streak 🔥 12]|
|                                                 |
|            ( ring: 5 of 8 )   Day Score 412     |
|            "3 to go. Next: Chain"               |
|                                                 |
|  [ Sportegories  ✓ 41 pts ]  [ Career Path ✓ 18 ]|
|  [ Guess         ✓ 4/8   ]  [ Common Ground ✓  ]|
|  [ Crossword     ✓ 1:12  ]  [ Starting Five  ▶ ]|
|  [ Chain         ▶       ]  [ Stat Line      ▶ ]|
|                                                 |
|  Arcade Card pitch (non-members)                |
+------------------------------------------------+
```

- **Top:** the ring, the Day Score, the Arcade streak, and one sentence that
  says what to do next. That sentence is the whole hub for a returning
  player.
- **Tiles:** fixed order, always. A done tile shows its one-line result and a
  tick; an undone tile shows PLAY. No sections by mechanic; the card pitch
  sits under the free tiles for non-members exactly as it does today.
- **Done state:** when the ring is full, the top block becomes the Day Card:
  every game's line, the Day Score, the streak, "Share today", and the
  golden game's door. The countdown lives here.
- **Tomorrow:** the countdown, plus one teaser the generators can produce
  cheaply (tomorrow's Sportegories letter, tomorrow's Starting Five club).
- **Streak at risk:** after 8pm local with nothing played, the top sentence
  becomes "Play one game to keep your 12-day streak."

The Vault, My Card and the leaderboards stay where they are in the nav.

---

## 3. Shared conventions, every game

One shell, written once, used twelve times. A game is a board and a scoring
function; everything around it is shared.

**Shell.** Topbar with the game mark, the "?" (animated intro), sound and
theme. Under it: the day strip (mini ring, streak, "Next"). The board. Nothing
else per game.

**Start.** Every game shows its board immediately. Timed games (Sportegories,
Starting Five, Chain) have a single **Start** button over the board and the
clock begins on it; the gate says "closing the tab ends the round" once,
before the first play ever. Untimed games charge the play on first
interaction, as now.

**Input.** Type-in games share one suggester and one Enter-to-submit.
Tap games share one Check button, bottom right, always labelled **Check**.
No game has a bespoke submit label.

**Feedback.** Right is `--green`, wrong is `--red`, the game's accent is
identity and never a verdict. Right: green flash and a `+N` pop (the Alma
Mater one, everywhere). Wrong: red flash and a 200ms shake. Perfect or
personal best: gold, and only those two things are ever gold.

**Timers.** Count *down* if there is a clock, top centre, and the last ten
seconds pulse. No game counts up on screen; elapsed time is on the result
screen only.

**How to play.** The animated demo, first visit, then behind "?". The rules
paragraph is inside it behind "Scoring and rules". No game has its own
tutorial code.

**Result screen** (shared module, `result.js`). In order, always:
1. Headline: the verdict word (PERFECT / SOLVED / TIME) and the score.
2. "You beat 71% of players today" for signed-in players (the rank RPC).
3. Personal best line: set (gold, old number struck) or standing.
4. The mini ring with Day Score, and this game's streak.
5. **NEXT: Career Path →** as the single primary button. When the day is
   done, it becomes **SEE YOUR DAY →**.
6. Share (the emoji grid card), Play again (members) or the card offer
   (free, spent).
7. Leaderboard, quietly.

**Share card.** `share.js` already unifies header and footer. Every game
supplies a grid line, so every card looks like a Wordle card: header, the
grid, the stat, the link. The day card is the eight grid lines stacked.

**Scoring.** Every game reports `{score, par, perfect}` where score is 0 to
100 against par. The mapping is the game's only scoring responsibility and
it is asserted by a test with the game's own fixtures.

**Timing.** Under two minutes, enforced by design: a clock of 90 to 120
seconds or a bounded round of 3 to 8 items. Nothing is "until you miss."

---

## 4. The reward system

Built once, in the shell, and the games feed it.

- **Day Score** (sum of 0 to 100 per game available) is the headline number
  on the hub and every result screen.
- **The ring** shows games done of games available, on the hub and in the
  result screen.
- **Arcade streak (ASK):** days in a row with at least one finished game.
  Needs one server read: `arcade_day_streak(user)` over `grid_runs` dates,
  returning `{streak, best, last_date}`. Per-game streaks stay as each game's
  own line. Until approved, the hub shows the best of the per-game streaks
  labelled *as such* ("Crossword streak 12") rather than as the Arcade's.
- **Percentile** on every result screen from the existing rank RPC.
- **Personal best** as an event: gold headline, the old number struck out,
  once.
- **Milestones**: streak 3, 7, 14, 30, 100 and the first perfect day each
  get one full-screen card, once, with a share.
- **The golden game**: High Low unlocks on a full ring.
- **Near miss**: "one off a perfect day", "one second off your best" as
  their own headline lines.
- **Comeback**: a lapsed player (7+ days) gets "Welcome back. Your best
  streak was 12" on the hub, once.
- **Weekly recap**: Sunday hub card with the seven Day Scores as a strip,
  the week's rank, and a share. Email for members later.
- **Trophies**: the existing My Card achievements, plus the result screen
  announcing one the moment it lands.

---

## 5. The daily loop, end to end

1. **Land.** Hub, under a second. Ring shows 0 of N, streak, "Start with
   Sportegories" (the flagship leads for a new player; for a returning player
   the sentence names their most-played unplayed game).
2. **Play.** Tap. The game page is under 150 KB and opens on the board. Timed
   games show Start.
3. **Result.** Score, percentile, best, ring, and one big NEXT.
4. **Next.** The next game was preloaded while the result screen was up.
   It opens instantly on its board.
5. **All done.** The last result screen's button says SEE YOUR DAY. The hub
   opens on the Day Card: full ring, Day Score, streak grown by one, every
   game's line, Share today, and the golden game's door.
6. **Tomorrow.** Countdown and a teaser on the Day Card. A backgrounded tab
   reloads on the new day (dayroll.js, already right). After 8pm with nothing
   played, the hub leads with the streak at risk.
7. **Day two.** The hub shows the streak at 2, the ring empty, and the same
   sentence. The whole habit is the ring filling and the streak counting.

---

## 6. Content validation

`scripts/check-daily.mjs`, as specified in the critique: generate the next 30
days of every game and assert solvable, single-answer, fair (fame floor),
not repeated within 60 days, and no clue leaks its answer. Runs on every
data refresh (gated before the commit, the way former.yml now gates
check-colleges) and every generator change.

---

## 7. Things I am deliberately not changing

- Ad placements and the AdSense posture on indexable pages.
- The Arcade Card price, the trial, and the four-free model (the swap in the
  free set is proposed above and not made).
- The server schema. The one new read (the Arcade streak) is proposed and
  waits.
- The archive, My Card, leaderboards and the auth surface, other than what
  the result screen reads from them.
