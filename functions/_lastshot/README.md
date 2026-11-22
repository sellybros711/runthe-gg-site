# Last Shot (live)

One possession. You are the coach. It starts in a timeout: draw a play, set when it goes (Go at,
on the clipboard: the handler holds till then), Run It, and your five run exactly what you drew
with 22.0 on the clock, down 1. Score in the last 4.9 to win. Score earlier and they get the ball
back, and a short cutaway shows their shot. A first visit finds a starter play already drawn (a
pin-down, Go at 6.0, the Pin-down starter) with Run It pulsing; Clear gives a blank clipboard. Runs have a 2x toggle and
synthesized sound (`sound.js`, mute remembered); dead time plays at 4x.

**The run gets the room.** While a play runs and its card is up, the clipboard's rows and the mode
bars step aside (`.app.running`); the top bar and the scoreboard stay. The court's camera
(`court2d.js`) frames every body, the ball and the rim, as big as the stage allows (never smaller than
the whole court fit, at most 2.2 times it), easing after the action; with reduced motion it holds
one frame for the whole run. Past half court the floor goes on, mirrored. The clipboard never uses
it. **The card docks** after the ball has played out (a made winner holds GAME WINNER over the court
first): small, at the bottom, no veil, with the verdict, the score, the reason and the first row
(Run it again or Next level first). More opens the rest (anything a card marks `xtra`); Less,
Escape or a tap beside it docks it again. The Daily's filed card on a later visit opens whole.
Every control is at least 44 by 44 CSS px (check-browser walks home, the clipboard and a card).
Escape closes the sheet on top (Plays, Test it, How it works), and any screen change closes them all.

## The run view (the tactics board)

The run is drawn by `court2d.js` (2026-11-19, Phase 1 of the owner's "hybrid": the board now, a 3D
shot cam later). A crisp top-down court: light maple boards toward the basket, the lane painted
navy, number discs with shoulders, a facing pointer and a stride bob on soft shadows (home navy and
gold, away red), short motion trails, the ball with a height shadow, swish rings on a make and
confetti on a winner. Over it, the coaching layer, every piece read off the sim:

- the coach's routes, faint as drawn, glowing as each runner covers them (worked out once a run
  from the frames: each runner's routes in order, projected), screen bars that light when set, and
  pass lines where the ball actually went
- at a screen, the cutter's own man's path (the defender whose `m` was the cutter just before
  `result.screens[i].t`) in red, with a chip for `result.scheme`: FOUGHT OVER, WENT UNDER, SWITCHED,
  ZONE SITS
- from the pass to the shooter, a ring as wide as his space to the closest defender, that becomes
  the shot event's own `open` at the release, coloured on the sim's thresholds (6, 4, 2 ft)
- at the release, a read chip: the shot caption's word and its make chance (`HAND UP · 40%`, the
  same numbers as the readout)

Chips stay on the stage, clear of the caption and the readout, and clear of each other. Reduced
motion: one fixed box, no trails, no bob, a still confetti scatter. The floor is one texture built
while the coach draws (`warm()`); lines, routes and glows are paths (a glow is a wide faint stroke
under a thin one, never a shadow blur); discs, the ball and chips are sprites made once. Nothing
from Run The Floor's rig (`/hoops/baller.js`) is loaded any more; hoops still has it.

**The seam for Phase 2.** `run-view.js` is the one switch: `RUN_VIEW` names the renderer, and every
renderer gives `draw`, `drawAnswer`, `camStart(frames, { res, play })`, `redraw` and `view`.
The 3D shot cam is a renderer registered there that keeps the board for the play and takes the span
`inShotSpan` names (the ball up, `fr.sk`, and the after-ball, `opts.after`) on a canvas of its own.
`client.js` (timing, captions, the bleed, the banner, the card) does not change.

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
Progress is `last_shot_ladder` in localStorage (best stars and a play per level with when it was
kept, the Daily's filed days, cleaned on read so garbage never breaks the page). Signed in, it is
also in the shared cloud saves, game `last_shot`, slot `ladder`: on load the two merge (per level the
best stars, the newer play; the days' union), and a change writes the cloud at most once per 30 s and
on page hide. A stale write is merged and sent again. Signed out it stays local.

## The Daily Last Shot

Home's first card: "Daily Last Shot #N", today's title ("Down 2. 14 seconds. Horns."), the clock
to the next one (midnight Eastern). One situation a day for everybody (`daily.js`), on the Arcade
Lab's daily service as the external game `last-shot` (flag `arcade_last_shot`):
`/api/arcade/last-shot/today|start|run|leaderboard`. The clipboard has the day's spots, clock and
score and no scout. Practice (the Run It button) is random seeds, unlimited, never posted. Take
your shot asks "One shot. Ready?" inline, then the run is FILED FIRST and played after: the server
runs the play itself, and only then does the court show it, so a run that does not file has shown
nothing and the play stays with one line saying why. The card: the stars, the score text, "Today
they played: X", "#3 of 41 today", the top ten with you, the streak ("3 day streak · Best 5": consecutive Eastern days with a
filed shot, kept with the ladder and synced with it; no notifications), Share (`Last Shot #N`, the
squares, the score text, the game's link: no spoiler) and Beat my play. A second visit shows the
filed card; practice stays open. No gems on any Last Shot screen (the
server still pays them; the Arcade Lab stays tester only). Local state is `last_shot_daily` (`daily-ui.js`). `#daily` opens
it straight away (the Lab links there).

## Beat my play

Every result card but a playbook's has Beat my play: a link, `/last-shot#beat=<code>`
(`challenge.js`), with the run's situation, seed, play and the level's scout scheme. Opening one
shows "Their play: WON · 2 stars · 64% look", worked out from their play, never the link. Watch
their play runs it on its seed; Draw yours opens their spot blank, and Run It always uses their seed
and scheme. The card says You beat it or They still have it. A bad link says "That link didn't
work." Leaving clears the hash (`beat-ui.js`).

**It is live (the launch PR, 2026-11-18).** The page and its browser modules are plain static
files in `last-shot/` at the site root (`index.html` and `m/<name>.js`), served by Pages to anybody,
signed in or not, with no Function and no database. `build/pages.mjs` writes them from the sources
here, with the same BUILD as `pages.js`; never edit the folder by hand. A static file costs no
Function invocation, so a visit costs none until the player's first events (the free plan counts
100,000 a day, and a Function counts even when its answer is cached). Only two routes are Functions:
`functions/last-shot/e.js` (POST, the events) and `functions/last-shot/report.js`, both through
`route.js`. A route file wins for its own path only, so everything else under `/last-shot/` is an
asset. There is no root `_routes.json`: Pages builds one from `functions/`, and a hand written one
would decide every Function on the site. `_headers` keeps `/last-shot/m/*` a year (immutable; every
import carries `?b=BUILD`) and revalidates the page. `/last-shot` redirects to `/last-shot/` (Pages,
308). The source stays under `functions/`, which `_redirects` 404s. The page is indexable: a canonical
(`https://runthe.gg/last-shot/`), a description, the share card (og and twitter, the image at
`/assets/last-shot-og_1200x630.png`, built from the game's own court) and VideoGame JSON-LD, and it
is in `sitemap.xml`. The share lines link `https://runthe.gg/last-shot/`. Guests' events count by
their device id (`gate.js PUBLIC_EVENTS`). **The report stays admins only**: GET
`/last-shot/report` answers a row in `stumpire_testers` with role admin, and everybody else gets the
site's 404 page, exactly as Stumpire answers them. A path with no file under `/last-shot/` is Pages'
own 404 (the same `404.html`, status 404).
Not yet on the home page or the newsletter list (`check-posture.mjs` LINKED, a change of its own),
and no ad tag (ADS; `ads.js` says what turns on). The Daily needs the Lab flag `arcade_last_shot`
on public, or a guest's home has no Daily card (a 404 hides it).

**The notes are in the vault** (`sellybros711/runthe-gg-kb`): `games/last-shot/last-shot-overview.md`
starts there, with the rules, the sim, the shot quality formula and the defensive schemes. How the
gate worked while it was a tester game is `platform/platform-tester-gate.md`.

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
| `run-view.js`, `court2d.js`, `view.js` | the renderer switch and the frame tween; the live court (the tactics board and its coaching layer); feet to pixels, shared with the clipboard |
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
| `web/play.html` -> `last-shot/`, `pages.js` | the static page and modules at the site root, and the same bytes as one bundle for the tests, both built by `build/pages.mjs` |
| `route.js`, `gate.js`, `db-supabase.js` | the two Function routes (`functions/last-shot/e.js`, `report.js`); the events and the admins only report (pure); the database calls |
| `check-posture.mjs` | live: indexable, in the sitemap, the folder in step, only the two routes are Functions, the report admins only, the same 404 as Stumpire |

## Scripts

```
node functions/_lastshot/build/pages.mjs          after editing web/play.html or any browser module (writes last-shot/ and pages.js)
node functions/_lastshot/build/dev-server.mjs     local play at /last-shot/ from the static folder (?as=nobody for a guest), the Daily in memory
node --test functions/_lastshot/test/*.test.mjs   the folder in step, the routes beside Stumpire's, the events, the sim, the three test plays
node functions/_lastshot/check-posture.mjs
node functions/_lastshot/test/check-browser.mjs   a whole play on a phone in Chromium
node functions/_lastshot/test/check-playbook.mjs  the storyboard and My Playbooks, phone and desktop, cloud in memory
node functions/_lastshot/test/check-ladder.mjs    the Ladder: unlocks, stars, plays kept, scout, down 2 and 3, overtime, garbage, the account's copy
node functions/_lastshot/test/check-daily.mjs     the Daily against the Lab's real handler in memory (test/fake-arcade.mjs)
node functions/_lastshot/test/check-beat.mjs      Beat my play links: watch, beat it or not, round trips, garbage, the hash
node functions/_lastshot/test/check-starters.mjs  Plays (the starters, replace, undo, a level's scout) and Save this play
node functions/_lastshot/test/check-analytics.mjs the round's events: every name, the beacon on hide, inert under automation
```

The seed for any result is behind **Seed** on the result screen. The same seed and the same play
always give the same result.
