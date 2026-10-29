# Arcade Lab (testers only)

The arcade skill games: Roll-Ball, Field Goal Flick, Hoop Shoot, Whack the
Right Player, Drop Board and Pinball, all six built. Each is a small daily game
with one scored run a day, a practice mode, and a no-spoiler share line.

**Nobody but testers can see any of it, gated exactly like Stumpire.** The
tester list IS Stumpire's (`stumpire_testers`), the pages and their browser
modules are served by a Pages Function and never as static files, every API
route answers 404 to anybody refused, and the hub adds a tile only after
`/api/arcade/me` confirms access. Nothing is in the sitemap, the public game
lists or the newsletter list.

## Turning a game on

Each game has its own flag in `arcade_lab_flags`. 134 created them `off`
(visible to admins, `stumpire_testers.role = 'admin'`, alone); 135 set all six
to `testers`, so every tester sees every game and nobody else does. To take
one away again:

```
update arcade_lab_flags set mode = 'off' where flag = 'arcade_pinball';
```

The admin page at `/arcade/lab/admin/` has the same switches.

`off`, `testers` or `public` (a future launch). An admin can also POST
`/api/arcade/admin/flag` with `{ "flag": "arcade_roll_ball", "mode": "testers" }`.

Add or remove a tester exactly as for Stumpire (a row in `stumpire_testers`,
or the Stumpire admin page). One list for every tester-only game.

## Where things are

| | |
|---|---|
| `registry.js` | every game, its flag and `accessFor()`, the one access rule |
| `api.js` | `/api/arcade/*`: me, today, start, run, leaderboard, report, claim |
| `admin.js` | `/api/arcade/admin/*`: flags, prompts and themes, validate, draft, approve, preview, publish, reports |
| `gate.js` | the page gate for `/arcade/lab/<game>/`, `/arcade/lab/admin/` and `/arcade/lab/m/*` |
| `content/` | server only: the Whack prompt validator, the Drop Board theme validator, Claude's drafts, slate snapshots |
| `shared/seed.js` | Eastern date key, the daily seed, mulberry32 (browser and server) |
| `shared/gems.js` | the gem rule: 5 for a daily plus up to 10 by score band |
| `shared/dmath.js` | sin, cos, atan2 in plain arithmetic, so the browser and the server agree to the bit |
| `shared/replay.js` | replay any sim from its log (the server), and fast forward to resume |
| `shared/app.js` | the game shell: the 60 Hz accumulator loop, pause, exit guard, resume, intro, result, board, share |
| `shared/kit.js`, `shared/share.js` | the browser half: API, guest id, sound, haptics, host hook, share |
| `games/<game>/config.js` | every tuning number for that game, commented. Start here |
| `games/<game>/sim.js` | the rules as a pure fixed-step sim (no DOM, no Math.random) |
| `games/<game>/client.js` | input and drawing, as a view the shell drives |
| `web/shell.html`, `web/admin.html` -> `pages.js` | page shells and browser modules, built by `build/pages.mjs` |
| `db-supabase.js`, `db-memory.js` | production and in-memory stores |
| `../api/arcade/[[path]].js`, `../arcade/lab/[[path]].js` | the two Pages Functions |
| `supabase/134_arcade_lab.sql` | flags, `arcade_runs`, `gem_ledger`, rejections |
| `supabase/135_arcade_lab_content.sql` | slates (immutable), prompts, reports, the restart guard; all six flags to `testers` |

## The run

The server's score is the score. A daily arrives as the seed and an input log
(`{ f, ... }`: the frame, and what the game takes, such as angle and power, a
drop position, a hole, a flipper); `sim.replay()` plays it back against the
day's config and the claimed score must match. Refused: a wrong seed, a forged score, an illegal
input, a run finished faster than its frames take, a second daily, a stale
day (a daily started before midnight files for 20 minutes after it), and more
than 12 posts in 10 minutes. Every refusal is logged in
`arcade_run_rejections`.

## Restarts

A fresh daily posts `start`. Leaving mid-run and coming back on the same
device resumes from the saved log and posts nothing. A second fresh start on
the same day (storage cleared, another device) marks the run `restarted`: it
still files and pays its gems, and it is kept off the board.

## Content: Whack the Right Player and Drop Board

These two play a published slate, not a day derived from the seed. The flow,
all in the admin page:

1. **Draft.** "Draft from the templates" makes Claude's drafts (`content/whack.js`
   `TEMPLATES`, `content/drop.js` `STAT_THEMES`). An editor can also write one.
2. **Validate.** Every save runs the validator against the Stumpire dataset
   and lists, in plain words, every reason a card or value is refused.
3. **Approve.** An editor approves. Approval re-validates; a draft never ships.
4. **Publish.** Pick the day (three prompts, easiest first, for Whack; one
   theme for Drop Board), preview, publish. The slate stores a snapshot of
   every card and value, and a trigger refuses any later update or delete.

What the Whack validator refuses: a field the dataset does not hold for the
prompt's years (Stumpire's coverage table, so career stats never), a correct
card that fails the query, a decoy that passes it, any name shared with
another record, anybody obscure, a decoy below fame tier 4 (tier 3 is mostly
college names), a decoy who is still active (a season the data does not have
yet could make him a winner), a decoy whose career may predate the data, a
decoy missing the field it fails on, a famous decoy with no awards on record,
a decoy within 15% of a numeric line, and too few cards.

A decoy is "plausible" when it plays a position group that wins the prompt
(15% of the winners or more): a pitcher for the Cy Young, a QB or a back for
the NFL MVP. `PLAUSIBLE_SHARE` ramps that share of the decoys 0.4, 0.65, 0.85
across the three rounds, and a draft keeps eight famous players from elsewhere
on the field for the early rounds to draw from. A shared team used to count as
plausible too, and almost everybody shares a team with somebody.

The Drop Board validator holds every value to the record AND to a second
source, `content/verified-stats.js`, written by `build/verify-stats.py` from
Lahman (MLB), Basketball-Reference season totals (NBA) and nflverse plus a
hand-checked list of pre-1999 careers (NFL). The index alone was wrong for
fourteen NBA players (Chris Webber 9,123 rebounds for 8,124, Elton Brand
8,213 for 9,040, Carlos Boozer 12,842 points for 13,976); a player the two
sources disagree on is left out, whichever is wrong. Rebuild the table when
the index changes. It also refuses a
missing value, a wrong one, an unreadable one, a stat for anybody who may
still be active, a career with any club in a league whose records are partial
(Satchel Paige's record carries Negro League wins), a label that is not the
athlete's name, and a surname alone when another well known player in the
league wears it. There is no sacks theme: the record rounds half sacks, wrongly
for some. Each theme drafts `VARIANTS` boards, one athlete from each of seven
value bands, so a theme that comes round again is not the same seven names.

### Publishing a run of days without an editor

`--replace whack|drop-board` takes down and republishes that game's days,
but only a day nobody has played: a slate with a run on it is what that run
was scored against and stays. `supabase/137` is that, for Drop Board, after
the second source went in.


```
node functions/_arcadelab/build/publish-days.mjs 2026-10-10 30 > supabase/136_arcade_lab_publish_days.sql
```

It re-validates every draft, approves them as Claude's, and publishes each day
exactly as the admin page would. A published day is never touched again; a
prompt only Claude has drafted is refreshed on a re-run. The audit that went
into the first run: every award winner list the templates read was checked
against the record, and 40 missing facts (37 AL MVPs, Fergie Jenkins' Cy
Young, Joe Dumars' Finals MVP, Ja'Marr Chase's Offensive Rookie of the Year)
went into `functions/_stumpire/data/fixes.json`. Without them the MLB MVP
prompt dealt Ichiro and Clemens as decoys.

Players can report a card from the result screen ("Something here was wrong");
reports land in `arcade_reports` and the admin page.

## Gems

A cosmetic currency with **no cash value**, never redeemable for money. One
award per run, held by a unique index (`gem_ledger_one_per_run`). Guest gems
sit under the guest id and move on sign in (`POST claim`), which only matters
once a game is public: under `testers` a guest gets a 404 like anyone else.

## Tester data

Every run and gem row filed while a game is not public carries `tester = true`,
is left out of any public board, and wipes in one go:

```
delete from gem_ledger where tester; delete from arcade_runs where tester;
```

## Scripts

```
node functions/_arcadelab/build/pages.mjs           after editing web/*.html or a browser module
node functions/_arcadelab/build/dev-server.mjs      local play, in-memory store (?as=nobody for the 404)
node functions/_arcadelab/build/tune-rollball.mjs   Roll-Ball's zone mix for three kinds of player
node functions/_arcadelab/build/tune-hoop.mjs       Hoop Shoot's makes for three hands
node functions/_arcadelab/build/tune-drop.mjs       Drop Board: how much the drop position decides
node functions/_arcadelab/build/tune-pinball.mjs    Pinball: 1000 fast balls, nothing tunnels, nothing sticks, replay time
node --test functions/_arcadelab/test/*.test.mjs
node functions/_arcadelab/test/check-browser.mjs    a whole Roll-Ball daily in Chromium on a phone
node functions/_arcadelab/test/check-games.mjs      every other game, end to end, plus the admin page
```

The dev server publishes Claude's drafts for today so every game is playable
(`?as=boss` for the admin page). SQL: see the header of
`supabase/test/arcade_lab_base.sql`. Add `?debug=1` to a
game's url for fps, the seed, the tuning values and the hitboxes.

## Roll-Ball tuning, measured

`build/tune-rollball.mjs`, 300 runs each. A steady hand aiming at a pocket
(aim sd 0.022 rad, power sd 0.035) lands 45% home runs, 39% singles and 15%
fouls: a mean of 21 and a best of 34. The same hand aiming at the middle
means 23 and tops out near 30. So the middle is safe and the pockets win
boards. A shaky hand mostly lands singles and doubles (about 17 of 36).
Real thumbs are shakier than the model; re-measure with testers.

## Pinball, measured

`build/tune-pinball.mjs`: 1000 balls fired at full speed every way across
the table with the flippers flapping, and not one crossed a wall or a flipper.
A bot's ball lives about 20 seconds; nothing sat slow longer than half a
second. Replaying a 76 second run takes about 32 ms of CPU in Node (about 7
microseconds a frame), which is
over the Workers free plan's 10 ms limit: the site needs the paid plan's
limit for Pinball's run endpoint, or the run is refused as an error.
