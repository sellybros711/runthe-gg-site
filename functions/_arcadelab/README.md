# Arcade Lab (testers only)

The arcade skill games: Roll-Ball first, then Field Goal Flick, Hoop Shoot,
Whack the Right Player, Drop Board and Pinball. Each is a small daily game
with one scored run a day, a practice mode, and a no-spoiler share line.

**Nobody but testers can see any of it, gated exactly like Stumpire.** The
tester list IS Stumpire's (`stumpire_testers`), the pages and their browser
modules are served by a Pages Function and never as static files, every API
route answers 404 to anybody refused, and the hub adds a tile only after
`/api/arcade/me` confirms access. Nothing is in the sitemap, the public game
lists or the newsletter list.

## Turning a game on

Each game has its own flag in `arcade_lab_flags`, all shipping `off`, which
leaves a game visible to admins (`stumpire_testers.role = 'admin'`) alone:

```
update arcade_lab_flags set mode = 'testers' where flag = 'arcade_roll_ball';
```

`off`, `testers` or `public` (a future launch). An admin can also POST
`/api/arcade/admin/flag` with `{ "flag": "arcade_roll_ball", "mode": "testers" }`.

Add or remove a tester exactly as for Stumpire (a row in `stumpire_testers`,
or the Stumpire admin page). One list for every tester-only game.

## Where things are

| | |
|---|---|
| `registry.js` | every game, its flag and `accessFor()`, the one access rule |
| `api.js` | `/api/arcade/*`: me, today, run, leaderboard, claim, admin/flag |
| `gate.js` | the page gate for `/arcade/lab/<game>/` and `/arcade/lab/m/*` |
| `shared/seed.js` | Eastern date key, the daily seed, mulberry32 (browser and server) |
| `shared/gems.js` | the gem rule: 5 for a daily plus up to 10 by score band |
| `shared/kit.js`, `shared/share.js` | the browser half: API, guest id, sound, haptics, host hook, share |
| `games/rollball/config.js` | every Roll-Ball tuning number, commented |
| `games/rollball/sim.js` | the rules as a pure fixed-step sim (no DOM, no Math.random) |
| `games/rollball/client.js` | input, the 60 Hz accumulator loop, drawing, screens |
| `web/*.html` -> `pages.js` | page shells and browser modules, built by `build/pages.mjs` |
| `db-supabase.js`, `db-memory.js` | production and in-memory stores |
| `../api/arcade/[[path]].js`, `../arcade/lab/[[path]].js` | the two Pages Functions |
| `supabase/134_arcade_lab.sql` | flags, `arcade_runs`, `gem_ledger`, rejections |

## The run

The server's score is the score. A daily arrives as the seed and an input log
of `{ f, a, p }` (frame, angle, power); `sim.replay()` plays it back and the
claimed score must match. Refused: a wrong seed, a forged score, an illegal
input, a run finished faster than its frames take, a second daily, a stale
day (a daily started before midnight files for 20 minutes after it), and more
than 12 posts in 10 minutes. Every refusal is logged in
`arcade_run_rejections`.

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
node --test functions/_arcadelab/test/*.test.mjs
node functions/_arcadelab/test/check-browser.mjs    a whole daily in Chromium on a phone
```

SQL: see the header of `supabase/test/arcade_lab_base.sql`. Add `?debug=1` to a
game's url for fps, the seed, the tuning values and the hitboxes.

## Roll-Ball tuning, measured

`build/tune-rollball.mjs`, 300 runs each. A steady hand aiming at a pocket
(aim sd 0.022 rad, power sd 0.035) lands about half its balls in a home run
pocket and fouls about a third; the same hand aiming at the triple averages
25 of 36. A shaky hand mostly lands singles and doubles (about 17 of 36).
The brief asked for a good player near one home run in three: real thumbs
are shakier than the model, so expect that, and re-measure with testers.
