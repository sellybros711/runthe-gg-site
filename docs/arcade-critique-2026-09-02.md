# Run The Arcade: an honest critique

2 September 2026. Written against the code as it stands on `main`, after two
weeks inside it. Nothing here is softened, and where I am guessing I say so.

The short version: the concept is proven and the raw material is better than
the product. Twelve games were built one at a time, each with its own modal,
its own colours, its own idea of what "done" means and its own reason to
come back, and the result is a games *collection* rather than a daily
*habit*. The hub is a catalogue. The best mechanic in the building (Career
Path's reveal) is under-shared, the two most shareable formats (Common
Ground's emoji grid, Guess the Player's tile grid) are behind the paywall, and
the thing that makes Wordle a habit, one number you carry from day to day,
does not exist here at all. There is no Arcade streak. There are twelve
separate ones, and the hub shows you the biggest as if it were the one.

Four things are true and worth saying first, because the rest of this
document is going to sound harsh:

- The **content engine** is real. 16,000 player-seasons, verified jerseys,
  rosters by decade, a college matcher that now survives the feeds, clue
  generation with a rival check. Most sports dailies are running on a
  spreadsheet. This one is not.
- **Career Path** is a genuinely great mechanic and nobody else has it in
  this form.
- **Sportegories** is the right flagship: it makes you *produce*, it rewards
  depth of knowledge with rarity scoring, and it is over in two minutes.
- The **shared plumbing** (tokens, board, share, funnel, howto, demo) exists.
  The redesign is mostly about making twelve games *use* it the same way.

---

## A. Every game, rated

Scale is 1 to 10 on five criteria. **Understand** is "a new player knows the
goal, the input and how they win within five seconds." **Satisfy** is the
feeling at the end of a good run. **Daily** is "would I do this every day
without it feeling like homework." **Sports** is "is the sports knowledge
the *fun* or merely the *gate*." **Share** is "would the result screen make
somebody send it to a friend."

| Game | Tier | Understand | Satisfy | Daily | Sports | Share | Verdict |
|---|---|---|---|---|---|---|---|
| Sportegories | free | 8 | 7 | 8 | 9 | **5** | **Keep**, flagship |
| Career Path | free | 8 | **8** | 8 | **10** | 6 | **Keep**, second flagship |
| Guess the Player | card | 6 | 8 | **9** | 9 | **8** | **Keep**, should be free |
| Common Ground | card | **9** | 8 | 8 | 5 | **9** | **Keep**, should be free |
| Daily Crossword | free | 9 | 5 | 7 | 6 | 4 | **Rework** the clues |
| Chain | card | **4** | 7 | 6 | 9 | 5 | **Rework** the onboarding and the share |
| Alma Mater | free | 8 | 5 | **4** | 7 | 3 | **Rework** into a bounded round |
| Roll Call | card | 9 | 5 | **4** | 10 | 4 | **Rework** into Starting Five |
| Rank It | card | 8 | 5 | 4 | 5 | 4 | **Cut** |
| Odd One Out | card | 6 | 5 | 4 | 6 | 3 | **Cut** (its best idea moves into Common Ground) |
| Number Game | card | 8 | **3** | **3** | 6 | **2** | **Cut** |
| High Low | card | 9 | 5 | 3 | 5 | 2 | **Cut from the daily**, keep as the bonus game |

### The lowest scores, explained

**Number Game, Satisfy 3 / Daily 3 / Share 2.** "What number did he wear for
that club? Within two counts." This is pure recall with no deduction, no
reveal, and no way to reason your way to an answer you do not already have.
When you know it there is no satisfaction, and when you do not there is no
path. The run ends on a miss, so the typical session is three questions long
and ends in a shrug. The share is a bare integer. This is the game where
sports knowledge is entirely a gate.

**Alma Mater, Daily 4 / Share 3.** The same shape: recall, no reveal, one miss
ends it. It is better than Number Game because a college is a fact people
half-remember and the four-choice fallback gives them a way through, but
"keep naming schools until you miss" is a quiz, and quizzes are homework by
day four. It is also the game that generates the bug emails, because typing a
school is the one input on the site where a right answer can be written a
dozen ways. That is fixed now, but it will always be the fragile one.

**Roll Call, Daily 4.** Name a whole roster in ninety seconds is a great idea
for a Sunday afternoon and a bad one for a Tuesday commute. The floor is
brutal: a casual fan names four of fifteen, watches the clock run out, and is
shown eleven names they did not get. Naming a *lineup* is the same thrill at
a size a person can actually clear.

**Chain, Understand 4.** "Two players, two teammates in between, each name has
to have played alongside the one above it" is a paragraph, and the demo has to
do all the work. It is the cleverest game here and the one most people bounce
off in the first five seconds. It is also the game whose *result* is the most
shareable thing on the site (the chain itself is a story: Duncan to Parker to
Ginobili to Leonard) and the share card prints a time.

**Common Ground, Sports 5.** It is Connections with athletes. That is fine, it
is the most-understood format in the world, but the sports knowledge is doing
less than it could. Odd One Out's "name the link" is the piece that would make
it sports rather than generic: naming the category is where the fan shows off.

**High Low, Daily 3.** It is endless, it has no shared board (share.js
literally lists it as the one game with no puzzle number), and its result is a
personal best. It is not a daily puzzle. It is an arcade cabinet, and a good
one, and it belongs *after* the day rather than in it.

**Share, across the board.** Only two of twelve games produce an emoji grid
(Common Ground, Guess the Player), and both are behind the card. Six produce a
number. Two produce a time. The single most-played thing on the site, the
free four, cannot produce the artefact that made Wordle spread.

### Keep / rework / cut

**Keep (5):** Sportegories, Career Path, Guess the Player, Common Ground,
Daily Crossword.

**Rework (3):** Alma Mater (bounded round, partial credit, a grid to share),
Chain (a first-five-seconds it can survive, and the chain as the share),
Roll Call (becomes Starting Five: pick the five who started, from ten).

**Cut (4):** Number Game, Rank It, Odd One Out, High Low (from the daily; it
becomes the golden game).

That is 8 dailies plus a bonus. Twelve is a catalogue number. Eight is a
"did you do them all" number, which is the only count that matters.

---

## B. The hub as a habit machine

The loop the best dailies run: **land, know what to do, play, get a result
you want to share, see your streak, leave with a reason to come back.**

| Step | Arcade today | Grade |
|---|---|---|
| Land | Hub is quick. But a game page loads 1.2 MB (Sportegories) to 2.6 MB (Guess) of script for a one-minute game, on a phone, every time. The whole 1.2 MB former-players file and 764 KB of jerseys ride along on games that use a slice of them. | **Break** |
| Know what to do | Now good. Four free tiles, a clear ladder, animated intro on first visit. | OK |
| Play | Each game is quick and the input is honest. | OK |
| A result you want to share | Two games out of twelve produce something worth sending. The rest hand you a number. | **Break** |
| See your streak | There is no Arcade streak. The nav's "Streak" shows the *largest* of your per-game streaks, which is a number that can go up while you skip most of the arcade, and it is labelled as if it were the one. Sportegories, Roll Call and Chain do not show a streak on their result screen at all (their SEO paragraphs promise one). | **Break** |
| A reason to come back | A countdown to midnight, and "Clean sweep!" text. Nothing that grows. No weekly anything. | **Break** |

So the loop breaks in four of six places, and three of the four are the same
underlying absence: **there is no single number you carry across days.** Not
a day score, not a day streak, not a percentile. The pips fill in and reset.
The best you can do today is play all twelve, see a gold ticket, and come back
tomorrow to a blank one.

The second absence is that finishing a game does not *pull* you into the
next. funnel.js puts a "Next: Career Path" link on the result modal, which is
right, but it is one line of text under a wall of buttons (Play again, Share,
Leaderboard, More games, Back to the arcade), and clicking it loads a fresh
two-megabyte page. The dead time between games is where a daily loses people.

---

## C. First-time understanding

Within five seconds: goal, input, how you win. The animated demos have made
this much better than it was, so this is the state *with* the demos.

| Game | Goal in 5s | Input in 5s | Win condition in 5s | Needs a paragraph |
|---|---|---|---|---|
| Sportegories | yes | yes | mostly (rarity scoring is a surprise) | the either-name rule, fixed today |
| Career Path | yes | yes | yes | no |
| Guess the Player | yes | yes | **no**: what the tile colours mean per column takes a round | yes |
| Common Ground | yes | yes | yes | no |
| Daily Crossword | yes | yes | yes | no |
| Chain | **no** | yes | **no** | **yes**, two of them |
| Alma Mater | yes | yes | yes | no |
| Roll Call | yes | yes | yes | no |
| Rank It | yes | mostly (tap two to swap is not obvious) | yes | a little |
| Odd One Out | **no** (two-part answer) | yes | **no** | yes |
| Number Game | yes | yes | yes ("within two" is a surprise) | a little |
| High Low | yes | yes | there is no win, only a best | no |

### Conventions that disagree with each other

These are the things a returning player has to re-learn per game, and every
one is a small tax on the habit.

- **Submit.** Sportegories and Alma Mater submit on Enter. Rank It has a
  "Check order" button. Guess has a "Clue" button in the same slot other games
  put Submit. Common Ground has "Done". Crossword has no submit at all.
- **Start.** Three games (Sportegories, Roll Call, Chain) have a "Start
  today's ..." button and a timer that begins on it. Nine drop you straight
  onto the board and charge the play on first interaction. A new player does
  not know which kind they are in until they tap something.
- **Wrong-answer colour.** Six games use `--red`, six use `--coral`, and four
  use both. Guess the Player uses coral for *everything* including its brand,
  so a wrong tile and the accent are the same colour. Green is the right-answer
  colour in nine games and absent from Crossword and Common Ground. Gold means
  "perfect" in some games and "your best" in others and is the accent in Number
  Game and Alma Mater, so it means nothing.
- **Timers.** Crossword counts up. Sportegories, Roll Call and Chain count
  down. Guess counts up but hides it. Six games have no clock. Nothing tells
  you which before you start.
- **End-of-game buttons.** "Share" / "Share your card" / "Share result" are
  three labels for one action. "More games" / "Back to the arcade" / "Back to
  board" / "Back to puzzle" / "Close" / "Done" are six labels for two actions.
- **The result modal layout** is different on every page. The score is a big
  number in eight of them, a time in two, a word ("SOLVED", "Chain closed") in
  two. Streak appears on nine, best on eleven, rank on zero, percentile on
  zero.

### Where the hub fails to explain a streak

- It never says what a streak *is*. Per game? Per day? Any game? The answer is
  per game, and nothing on the hub says so.
- The nav's Streak tab shows the max across games with a flame. A player who
  has a 30-day Crossword streak and has never opened anything else sees "30",
  which teaches them that the number is about the Arcade, and it is not.
- The result screens that do show a streak say "day streak" without saying
  which game's, and on a page with one game that is fine, but it never adds
  up anywhere.
- Nothing says what *breaks* it. Missing a day breaks a per-game streak; the
  server rule is `last_date = today - 1` or reset. Nothing on screen says
  "play by midnight to keep it," and there is no warning state.

---

## D. Coherence: hub to tomorrow

**Hub → pick game.** Fine now. The one abrupt step: a card game's tile for a
free account says "1 free try", you tap it, and get a gate that says "Your
free play, it locks after this." Two screens saying one thing. The gate is
right (spending is irreversible) and the tile badge is now redundant with it.

**Pick → play.** The 1 to 2.6 MB page load is the abrupt step. On a phone on
cellular that is a visible pause on every game, twelve times a day for a
member. It is the single largest piece of dead time in the loop and it is
invisible on a developer's laptop.

**Play → result.** Each game's modal is its own design. What is missing on
most of them: how you did *relative to anyone*. The rank RPC exists
(leaderboard.js calls `B.rank(game, date, score)` for the "your place" line)
and nothing surfaces "you beat 71% of players today," which is the single
most shareable sentence a daily can print.

**Result → next game.** The funnel link exists and is buried, and on the
Daily Crossword it does not exist at all: that modal's buttons were Play
again, Share, Stats and Close, so the free flagship's result screen was a dead
end (fixed in Pass 1 by giving it the link every other game had). The result modal
has up to six buttons, and "Next: Career Path" is a text link under them. The
hierarchy should be inverted: the next game is the primary action once you
have seen your score.

**Next → all done.** The hub shows "Clean sweep!" and a countdown. For a
member that is twelve games and maybe fifteen minutes and the reward is a
sentence. There is no day summary, no day share, no day score.

**All done → tomorrow.** A countdown. dayroll.js correctly reloads a
backgrounded tab on the new day. Nothing else: no "tomorrow's letter", no
teaser, no streak-at-risk nudge, no weekly recap.

### Edge cases, checked

- **Partial completion.** Every game keeps its per-day save in localStorage;
  a half-played Crossword resumes. Sportegories, Roll Call and Chain are timed
  from a Start button and a closed tab mid-round *forfeits* the round (the
  play was charged on Start). That is defensible for a timed game and never
  explained before Start.
- **Closing mid-puzzle.** As above. The pregame gate warns for the *trial*
  play only. A free player who closes Sportegories mid-round has used their
  daily play and gets the "back tomorrow" screen with no explanation of why.
- **Replaying.** Members can replay (practice, not ranked; `replay:true`
  posts only to an empty slot, which is correct). The hub tile says PLAYED
  either way. Free players cannot replay, and the Play Again button becomes
  the card offer, which is the right ask in the wrong tone after a good
  result.
- **Timezone and midnight.** The day is the device's *local* date
  (`todayStr` = `new Date()` local, duplicated in nine files). Puzzles are
  keyed by that ISO date, so a New Yorker and a Londoner get the same board
  on the same calendar date but five hours apart, and leaderboards for a date
  fill in over a 24-hour wave. That is fine. What is not: a traveller
  crossing west can see the same date twice and, on the server, `arcade_spend_game`
  compares against New York time (tokens.js mentions self-healing "a local/NY
  date skew"), so the client and the server can disagree about what day it is
  for a few hours around midnight for anyone not in Eastern time. Nothing
  fails loudly; the client wallet says one thing and the server says another,
  and the replay path papers over it. It should be one clock.
- **Missed-day streak.** Server rule per game: `last_date = today - 1` extends,
  anything else resets to 1. Correct and invisible. There is no grace, no
  freeze, and no warning.
- **Leaderboard ties.** "Most points wins, ties broken by time" (and the
  equivalents for runs and tries). Documented in leaderboard.js. Fine.
- **Logged-out vs logged-in.** Now coherent: guests play the four, nothing
  posts, the result screen says so. The remaining gap is that a guest's
  streak lives in one browser and nothing on the hub says "sign in to keep
  it" until *after* they have played.

### Content: the three failure modes and a validation step

A daily must never be (1) unsolvable, (2) rejecting one of two valid answers,
or (3) hinging on trivia so obscure it feels unfair.

What exists: check-facts (39 totals, 16 shirts pinned), check-colleges (517
schools, both directions, one printed name), check-teammates (1042 Roll Call
slots on their own roster), check-grid (crossword grids for 30 days per
sport), check-cluebank, verify-scoring for Segue. That is good coverage of
(2) and of "the data is wrong." It is thin on (1) and absent on (3).

What I would add, as one script that runs on every data refresh and every
generator change:

**`scripts/check-daily.mjs`: generate the next 30 days of every game and
assert, per puzzle:**

- *Solvable*: the generator returns a puzzle; every answer exists in the
  corpus; every Common Ground group has exactly one valid assignment; every
  Chain has at least one path of the stated length; every Crossword fills.
- *One answer*: for type-in games, the accepted-answer set is computed and
  checked for collisions against the corpus (two players with the same
  normalised name and the same clue facts is a rejected puzzle).
- *Fair*: every answer player has fame `f` above a floor that scales with the
  game (Sportegories categories are allowed deep cuts *as options*, never as
  the *only* option; a Guess the Player target is never below the 60th
  percentile of fame; a Crossword grid never has more than one entry below
  the median).
- *Not repeated*: no answer player appears in two games on the same day, and
  no game repeats a target within 60 days.
- *No leak*: no clue text contains the answer's surname (the crossword already
  asserts this; make it universal).
- *Print the hardest puzzle of the 30* for each game, so a human looks at the
  worst case rather than a random one.

---

## E. Dopamine

### Every reward moment today

| Moment | What happens | Rating |
|---|---|---|
| Correct answer | Green flash in most games; a `+2` pop in Alma Mater (added recently); tiles turn in Guess/Common Ground | okay |
| Wrong answer | Red or coral, sometimes a shake, always different per game | weak |
| Puzzle complete | The modal opens. Big number. Confetti nowhere. | weak |
| Perfect | Gold border on the modal in some games; "flawless" word in Crossword; nothing in most | weak |
| Fast | A time. No par, no "faster than yesterday", no comparison | weak |
| All done | "Clean sweep!" banner, gold ticket, countdown | weak |
| Streak extended | A number on nine result modals; a flame in the nav | weak |
| Streak milestone | Nothing. Day 7 and day 8 look identical | **absent** |
| Rank | Leaderboard exists (opt-in tap). Your row is highlighted | okay |
| Percentile | **absent**, and the RPC to compute it already exists | **absent** |
| Personal best | "best" on eleven modals. No moment when you *set* one | weak |
| Trophies | My Card lists earned achievements. Nothing on the result screen when one lands | weak |
| Near miss | **absent**. Missing a perfect by one is identical to missing it by five | **absent** |
| Comeback | **absent**. A lapsed player returns to a zeroed streak and a blank page | **absent** |

The pattern: the *information* is mostly there and the *moment* never is. A
personal best is a label rather than an event. A streak is a count rather
than a thing that grows.

### The reward system I would build from scratch

One spine, and everything hangs off it.

**1. The Day Score.** Every game reports one normalised number, 0 to 100,
against a par set by the generator (Sportegories: points against the day's
par; Crossword: time against par; Career Path: points out of the maximum;
Guess: tries; Common Ground: mistakes and time). The Day Score is the sum
across the games you have access to, so a free player's perfect day is 400
and a member's is 800. It is the only number the hub headlines.

**2. The ring.** A progress ring on the hub and on every result screen: games
done out of games available, with the Day Score in the middle. It fills as
you play. It is what you look at instead of the pips.

**3. The Arcade streak.** Days in a row with at least one game finished.
*One* streak, shown once, that grows visibly (the ring's outer band, the
flame in the nav). Per-game streaks stay, demoted to each game's own result
screen where they belong. This needs one new server-side read (days with any
run, for a user, consecutive from today) and I would wait for approval on
that rather than invent a device-local streak that resets when someone
changes phones.

**4. Share per game, share per day.** Every game gets an emoji grid, not just
the two that have one: Sportegories is eight squares (green filled, gold
rare, grey blank); Career Path is the reveal position (🟩 off one club,
🟨 off three, 🟥 missed); Chain is the chain itself; Crossword is the grid
shape with time. The *day* card is one row per game plus the Day Score and
streak, which is the artefact that sells the whole arcade in one message.

**5. "You beat 71% of players today."** The rank RPC exists. It goes on every
result screen, in the headline, for signed-in players, and it is the line the
share card leads with.

**6. Personal bests as events.** When a best is set, the result screen says
so before it says anything else, with the old number crossed out. Streak
milestones (3, 7, 14, 30, 100) get a full-screen moment, once.

**7. The golden game.** Finish everything and High Low unlocks as the bonus:
endless, no daily lock, your best on the card. The reward for doing the day
is *more* arcade, which is the only reward a games site can honestly offer.

**8. Near miss.** Missing a perfect by one gets its own line ("One off a
perfect day") rather than the same screen as a bad day. Missing a personal
best by a second gets "one second off your best."

**9. Comeback.** A player returning after a gap sees "Welcome back. Your best
streak was 12. Start a new one today" and their first day back counts double
toward the weekly recap. No fake streak restore; an honest re-entry.

**10. Weekly recap.** Sunday: a card with the week's Day Scores as a bar
strip, best game, worst game, rank among the week's players, and the share.
For members, by email (the scheduled-email plumbing exists in the Analytics
property; on our side this is one query and one template).

### Removing dead time

The loop should feel like one session, not twelve page loads.

- **Cut the payload.** No game needs the full former-players file. Ship each
  game a per-day slice generated at build time (the puzzle plus its accepted
  answers plus its suggestion pool), the way Roll Call already ships one
  roster shard. Target under 150 KB of script per game page. This is the
  largest single improvement to "land → play" available and it is invisible
  from a laptop.
- **Preload the next game.** When the result screen shows "Next: Career
  Path," start fetching it. Tapping it should feel instant.
- **Invert the result screen.** Score, then percentile, then ring, then one
  big NEXT button. Share and Play Again are secondary. Leaderboard and archive
  are tertiary.
- **Auto-advance for members.** Optional: after the result screen, a
  three-second countdown into the next game with a Skip.
- **A single shell.** Longer term, one page that swaps game modules in,
  so the topbar, ring, streak and sound never reload. Not a pass; a direction.

---

## F. New games

Five concepts that beat the four cuts on every criterion. Ratings are my
honest estimate for a first version.

### 1. Stat Line
**Rule:** A real box score line, name hidden. "51 PTS, 12 REB, Game 7." Name
the player. Three lines a day, each worth more the fewer hints you take
(hint 1: the year, hint 2: the opponent).
**Input:** type a name, with the shared suggester.
**Why it satisfies:** the recognition moment is a real "oh, THAT game." Great
lines are famous; you are not recalling a fact, you are recognising a story.
**Generated from:** the per-game stat tables (hlstats, rosterstats). Pick
lines by outlier score (z-score within that season) so every one is a
memorable performance, never a random Tuesday.
**Estimate:** Understand 9 · Satisfy 8 · Daily 8 · Sports 10 · Share 7.

### 2. Starting Five (Roll Call, reworked)
**Rule:** One club, one season. Ten names, five started. Tap the five.
**Input:** tap. Five taps, one Check.
**Why it satisfies:** the same "I remember that team" thrill as Roll Call at
a size a casual fan can clear, with decoys that are *plausible* (same era,
adjacent club) so the last pick is a real decision rather than a guess.
**Generated from:** the roster shards already built, with starters from
games-started, and decoys chosen by team-adjacency.
**Estimate:** Understand 10 · Satisfy 7 · Daily 8 · Sports 10 · Share 8 (a
five-square row, green and red).

### 3. Timeline
**Rule:** Six moments, put them in order. "Jordan's first title", "the
Malice at the Palace", "LeBron's Decision", each a card.
**Input:** drag, or tap-to-place on mobile. One Check, with partial credit
per card in the right slot.
**Why it satisfies:** it is deduction, not recall. You reason ("that was
before the lockout, after the Bulls") and the cascade of a correct chain is
the Wordle-row feeling.
**Generated from:** championship years, award years, debut years and
retirements already in the data; moments are a curated bank that grows
(the cluebank pattern).
**Estimate:** Understand 9 · Satisfy 8 · Daily 8 · Sports 8 · Share 8.

### 4. Feud
**Rule:** "Name a quarterback who won a Super Bowl." Five answers. The *most
common* answers score most (the exact inverse of Sportegories).
**Input:** type.
**Why it satisfies:** it is social, it rewards reading the room rather than
depth, and it pairs perfectly with Sportegories: one game for the deep cut,
one for the crowd.
**Generated from:** the answer frequencies Sportegories already records for
its rarity scoring. The crowd data is the puzzle.
**Estimate:** Understand 9 · Satisfy 7 · Daily 8 · Sports 8 · Share 7.

### 5. Two Truths
**Rule:** Three facts about one player. One is false. Tap it.
**Input:** tap. Three rounds a day.
**Why it satisfies:** it turns the facts engine into a bluff. The false fact
is *plausible* (right era, wrong team; right team, wrong number), so the fan
has to actually know rather than eliminate.
**Generated from:** the facts already pinned by check-facts, with the lie
built by swapping one field for a rival's.
**Estimate:** Understand 10 · Satisfy 6 · Daily 8 · Sports 8 · Share 6.

### 6. Top Five (bonus concept)
**Rule:** "Most career three-pointers." Name the top five. A board reveals
each as you hit it, Family Feud style.
**Input:** type.
**Why it satisfies:** the reveal board, and the fifth name is always the one
you argue about.
**Generated from:** the stats tables; only categories where the top five are
all fame-above-floor.
**Estimate:** Understand 9 · Satisfy 7 · Daily 7 · Sports 9 · Share 7.

Any one of these outscores Number Game on all five criteria, and all six
beat Rank It and Odd One Out on Satisfy and Share. They also share a
property the cuts lack: **you can reason your way to the answer.** That is
the difference between sports knowledge being the fun and being the gate.
