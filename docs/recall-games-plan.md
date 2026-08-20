# Run The Arcade: the recall slate

Sportegories and Alma Mater are the two games people come back to. What they
share is not a sport, a length or a look. It is that the answer is not on the
screen. You have to produce it out of your own head and type it.

Everything below follows from that one observation: which of the ten games we
already have are recall games, which new ones the data we hold can support
today, and which good ideas need a scrape before they are real.

Numbers in this doc were measured against the files in this repo, not
estimated. The commands are in the "How these were counted" section.

---

## The axis

| Game | What the player does | Recall? |
|---|---|---|
| Sportegories | Types names against eight categories | **Yes** |
| Alma Mater | Types the college | **Yes** (a 4 choice fallback scores 1 instead of 2) |
| Career Path | Types the player behind the path | **Yes** |
| Daily Crossword | Types words, with crossing letters as help | **Yes** |
| Guess the Player | Types a guess, eight tries, feedback narrows it | **Mostly**, it is deduction on top of recall |
| Number Game | Types a jersey number | **Partly**, the answer space is 0 to 99 |
| Odd One Out | Taps one of five, then may type the link | **No**, with a recall bonus bolted on |
| Common Ground | Taps sixteen tiles into groups | **No** |
| Rank It | Drags five given names into order | **No** |
| High Low | Higher or lower, one of two | **No** |

The free four used to be Common Ground, Sportegories, Alma Mater, Career Path:
three recall games and the one pure tapping game. It is now the Daily
Crossword in Common Ground's place, so every game a free account can reach
makes you produce the answer. That is shipped.

---

## Build these next

### 1. The Grid

Three by three. Rows and columns are teams, colleges, positions or honours.
Type a player who satisfies both. Nine cells, nine guesses, no list to pick
from. Rarer answers score more, exactly as Sportegories scores them today.

Why it is the strongest idea here: the format is proven elsewhere, it is the
purest form of the thing our two best games do, and every argument it starts
("you used Vince Carter for THAT?") is a share.

What the data says, counting only players a casual fan would recognise
(6,059 of the 9,696 in `sportegories-data.js`):

* 122 franchises hold at least 8 recognisable players
* **1,415 team by team cells** have 3 or more shared players
* **796 team by college cells** have 3 or more
* 95 colleges hold at least 8

That is thousands of viable boards before touching positions, decades or
awards as axes. Three or more answers per cell is the floor Sportegories
already uses for a fair category.

Reuses: `type.js` (typed answers), `livecheck.js` (confirm an answer our file
does not know), the rarity scale in `sportegories.js`, `board.js` for the
leaderboard.

### 2. Roll Call

One team, one season, ninety seconds. Name as many of that roster as you can.
Each correct name flips a hidden slot. The share grid draws itself: filled
slots against empty ones.

`jerseys.js` already holds 7,022 stints as (player, team, first year, last
year), which is a roster for any year in the range:

* **3,175 team seasons** are represented
* **1,123** of them hold 8 or more players
* **1,364** hold 6 or more recognisable ones
* Coverage by decade: 1990s 1,019 stints, 2000s 2,134, 2010s 2,349, 2020s 1,520

So this is a modern era game, roughly 1990 to now. Worth saying out loud in
the copy rather than letting a 1974 fan feel cheated.

It is also the most social game on this list: everyone who watched that team
remembers a different eight players.

---

## Cheap, and probably a mode rather than a tile

### Who Wore It

The Number Game asks what number he wore. The inverse asks who wore it: "the
Bulls, number 91". Same file, no new data.

* 4,154 distinct team and number combinations
* **2,344 have exactly one wearer** in our file, so the answer is unambiguous
* 3,836 have at least one wearer a casual fan would know

Ship it as a second mode inside the Number Game, not an eleventh tile. The
arcade does not need another game as much as the Number Game needs a reason to
be played twice.

---

## Good ideas that need work first

### Chain (six degrees of teammates)

Start at one player, end at another, connect them by shared teammates. Pure
recall, extremely shareable.

The graph is real: 1,709 recognisable players, and within each sport it is
fully connected (NFL 1,105, MLB 334, NBA 270 nodes).

Two problems, both fixable, neither trivial:

1. **It is too shallow.** From Tom Brady, 950 of 1,105 NFL players sit exactly
   two hops away. "Find any chain" is not a puzzle when almost every pair is
   two links apart. The game has to be a constraint: an exact chain length, a
   ban on hub players, or a fixed middle man.
2. **Names are not people.** Keying the graph on name alone made all three
   sports appear connected, because a Chris Davis in the NFL merged with the
   Chris Davis in MLB. It is the same trap the two Josh Allens sprang on
   Sportegories. The graph has to be keyed on the record, not the string.

### Trophy Room

Name a winner of an award in a given year. `awards.js` holds 4,516 records
across 17 honours (Pro Bowl 1,847, Hall of Fame 1,149, MLB All-Star 1,069,
Gold Glove 405, Cy Young 88, NBA MVP 36 and so on), but **the records carry no
year**. "Name an MVP" is a Sportegories category we already have. "Name the
2014 MVP" needs a scrape that adds seasons to every award row.

### Stat Line

Show a season line, name the player. We hold career totals only
(`stats.js`, `rosterstats.js`), never a single season. Needs a new data job.

---

## Cheaper than any new game

Three of the four games that are not recall games could ask for one extra
thing, and the ask is small:

* **Rank It** shows five names, then asks you to order them. Ask who leads
  BEFORE revealing the five, for a bonus. Typed, one line, no new data.
* **Common Ground** already knows each group's connection. Odd One Out asks
  the player to name its link for a bonus point. Common Ground could ask the
  same thing of the last group standing.
* **High Low** is a coin flip by construction. It cannot become a recall game
  without becoming a different game. Leave it.

This is worth doing before or alongside a new build: it moves the median game
toward what the two best ones do, without shipping a new page.

---

## What I would do first

1. **The Grid.** Highest ceiling, data is ready, and it reuses four modules we
   already ship.
2. **Roll Call.** Fastest to build of the two, and the share image is the best
   on the site.
3. **Who Wore It** as a Number Game mode, whenever the Number Game is next
   open.
4. The Rank It and Common Ground recall bonuses, as a small batch.

---

## How these were counted

All from files already in the repo, no network:

* Recognisable player pool, team and college intersections:
  `arcade/sportegories-data.js`, players with fame 3 or better
* Rosters by season, jersey numbers, teammate graph: `arcade/jerseys.js`
  stints joined to `arcade/former.js` fame tiers
* Award coverage: `arcade/awards.js`
* Season stat coverage: `arcade/stats.js` and `arcade/rosterstats.js`
