# Last Shot (testers only)

One possession. You are the coach. It starts in a timeout: draw a play, set when it goes (Go at,
on the clipboard: the handler holds till then), Run It, and your five run exactly what you drew
with 22.0 on the clock, down 1. Score in the last 4.9 to win. Score earlier and they get the ball
back, and a short cutaway shows their shot. A first visit finds a starter play already drawn (a
pin-down, Go at 6.0, the Pin-down starter) with Run It pulsing; Clear gives a blank clipboard. Runs have a 2x toggle and
synthesized sound (`sound.js`, mute remembered); dead time plays at 4x.

## Start from a play, and Save this play

**Plays** on the clipboard opens a sheet of four starters (`starters.js`: Pin-down, Floppy, Horns
Twist, Spain pick and roll), each with its note and a small diagram. A tap puts its spots, steps
and Go at on the clipboard, in free play, a level, the Daily (practice and the scored shot) and
Draw yours. A clipboard with steps asks "Replace your play?" inline first. Undo right after puts the
old play back. A starter's spots replace a level's or the day's set; the scout scheme and the
day's seed are left alone.

Every result card but a playbook's has **Save this play**: the run's play goes into the first
playbook (or a new "My plays"), named from the coach's terminology, with its situation when it is
not the game's (clock, down, handler), and the run counted in its stats as edit mode counts one.
The button then reads "Saved · Open", which opens the play; a run saves once. Signed out it reads
"Sign in to save", and a tap goes to the Arcade's sign in (no popup).

## The Ladder

Home's second card. 24 levels in four chapters (Down 1, Down 2, Zones, Down 3), each a situation
with its own clock, score, starting set and sometimes a defense the scout already told you about
("Scout: 2-3 zone", shown on the tile and above the clipboard, and the X's set up that way). A
level opens once the one before it is won; 1-1 is always open. Three stars a level: win, win with
an open look, and let it go late. The result card lands the stars one at a time with the rules
as a checklist, says New best, and offers Next level, Try again and Back to Ladder. Three stars
gets a party. Down 2 and down 3 bring overtime (a coin flip), which gets its own OVERTIME beat.
Progress is `last_shot_ladder` in localStorage (best stars and a play per level, cleaned on read
so garbage never breaks the page). No cloud sync yet.

## The Daily Last Shot

Home's first card: "Daily Last Shot #N", today's title ("Down 2. 14 seconds. Horns."), the clock
to the next one (midnight Eastern). One situation a day for everybody (`daily.js`), on the Arcade
Lab's daily service as the external game `last-shot` (flag `arcade_last_shot`):
`/api/arcade/last-shot/today|start|run|leaderboard`. The clipboard has the day's spots, clock and
score and no scout. Practice (the Run It button) is random seeds, unlimited, never posted. Take
your shot asks "One shot. Ready?" inline, then the run is FILED FIRST and played after: the server
runs the play itself, and only then does the court show it, so a run that does not file has shown
nothing and the play stays with one line saying why. The card: the stars, the score text, "Today
they played: X", "#3 of 41 today", the top ten with you, gems, Share (`Last Shot #N`, the
squares, the score text, the arcade link: no spoiler) and Beat my play. A second visit shows the
filed card; practice stays open. Local state is `last_shot_daily` (`daily-ui.js`). `#daily` opens
it straight away (the Lab links there).

## Beat my play

Every result card but a playbook's has Beat my play: a link, `/last-shot#beat=<code>`
(`challenge.js`), with the run's situation, seed, play and the level's scout scheme. Opening one
shows "Their play: WON · 2 stars · 64% look", worked out from their play, never the link. Watch
their play runs it on its seed; Draw yours opens their spot blank, and Run It always uses their seed
and scheme. The card says You beat it or They still have it. A bad link says "That link didn't
work." Leaving clears the hash (`beat-ui.js`).

**Nobody but testers can see it.** The page and its browser modules are served by
`functions/last-shot/[[path]].js` to a row in `stumpire_testers` (the one tester list), never as
static files. Everybody else gets the site's 404 page, exactly as Stumpire answers them. It is in no
nav, sitemap, home page or newsletter list, and its share line links `/arcade/`. A tester signs in
at `/arcade/` first (that sets the signed page cookie), then opens `/last-shot`.

**The notes are in the vault** (`sellybros711/runthe-gg-kb`): `games/last-shot/last-shot-overview.md`
starts there, with the rules, the sim, the shot quality formula and the defensive schemes. How the
gate works for every tester game is `platform/platform-tester-gate.md`.

## My Playbooks

Home has two parts: **Play** (the game, first and biggest) and **My Playbooks** (needs a Run The Games
account). A playbook play is drawn as a **storyboard**: Next frame opens a frame where everyone
ended, earlier frames show faintly, Play frame runs just that frame. Frames are presentation only:
the sim never reads them. Plays are named from the coach's terminology, tested against every
defense (switch, fight over, go under, and the 2-3, 1-3-1, 3-2 and match-up zones), and printed as
frames side by side.
Storage is the shared cloud saves (`/assets/cloudsave.js`, game `last_shot`), no new table.

## Where things are

| | |
|---|---|
| `scenario.js` | the one scenario object: score, clock, rosters, every tuning number. Start here |
| `playbook.js` | the play format, the order rule, screen names, what makes a play illegal |
| `sim.js` | the possession as a pure fixed-step sim (60 Hz, no DOM, no Math.random) |
| `motion.js`, `defense.js`, `shot.js` | how bodies move; man to man and the three screen schemes; shot quality |
| `board.js` | the clipboard: Move, Screen, Pass, Shoot, Undo, Clear, Run It (pointer events) |
| `court.js`, `view.js` | the live court, drawn with Run The Floor's rig (`/hoops/baller.js`, read only) |
| `client.js`, `share.js`, `sound.js` | home, the page flow (the hold, the run, the answer cutaway), the result and the share line; the sounds |
| `starters.js` | the four starter plays behind Plays (and the first run's play) |
| `levels.js`, `ladder-ui.js` | the ladder's levels, sets and star rules; its storage, unlocks and screen |
| `daily.js`, `daily-ui.js` | the Daily's situation, score and replay (server and page); the API calls, the home card, the result card and board |
| `challenge.js`, `beat-ui.js` | Beat my play links (format, decode, result); the Challenge screen and the share |
| `cards.js` | the result card pieces shared by the level, daily and challenge cards |
| `book.js`, `book-ui.js` | playbooks: the model, the store (local first, cloud behind), the file; the screens |
| `names.js` | the terminology: names from the set and the actions, in the coach's words |
| `testit.js` | Test it: every defense, forced after the roll, the same every time |
| `diagram.js`, `export.js` | a play drawn the way a coach prints it; every print and export option |
| `web/play.html` -> `pages.js` | the page shell and modules as strings, built by `build/pages.mjs` |
| `gate.js`, `db-supabase.js` | who gets in (pure), and the one database question |
| `check-posture.mjs` | tester only, linked from nowhere, the same 404 as Stumpire |

## Scripts

```
node functions/_lastshot/build/pages.mjs          after editing web/play.html or any browser module
node functions/_lastshot/build/dev-server.mjs     local play at /last-shot (?as=nobody for the 404), the Daily in memory
node --test functions/_lastshot/test/*.test.mjs   the gate beside Stumpire's, the sim, the three test plays
node functions/_lastshot/check-posture.mjs
node functions/_lastshot/test/check-browser.mjs   a whole play on a phone in Chromium
node functions/_lastshot/test/check-playbook.mjs  the storyboard and My Playbooks, phone and desktop, cloud in memory
node functions/_lastshot/test/check-ladder.mjs    the Ladder: unlocks, stars, plays kept, scout, down 2 and 3, overtime, garbage
node functions/_lastshot/test/check-daily.mjs     the Daily against the Lab's real handler in memory (test/fake-arcade.mjs)
node functions/_lastshot/test/check-beat.mjs      Beat my play links: watch, beat it or not, round trips, garbage, the hash
node functions/_lastshot/test/check-starters.mjs  Plays (the starters, replace, undo, a level's scout) and Save this play
```

The seed for any result is behind **Seed** on the result screen. The same seed and the same play
always give the same result.
