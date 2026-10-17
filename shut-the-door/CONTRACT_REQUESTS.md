# Shut The Door: contract requests

B1 to B7 are answered in `CONTRACT.md` section 14 (all accepted). B8 and B9 are new.

Agent B writes requests here. The lead answers each one below it and edits `CONTRACT.md` when one
is accepted. Until an answer lands, the UI runs on the stub described in each request.

## B1. How the UI learns today's state without throwing a pitch

**What the UI does now.** On boot it calls `startOuting(scenarioId, null, {mode: 'daily'})` to find
out whether today is fresh, part played or over. Over: it calls `finishOuting(outingId)` to show the
result on the home screen ("done for today", share, back tomorrow).

**What that needs from Agent A, stated so it can be held:**

1. `startOuting` in daily mode writes and submits nothing while `pitchNo` is 0. Opening the page must
   not count as playing.
2. `finishOuting` is idempotent on an outing that is over. A second call (a reload, the home screen)
   returns the same `OutingResult` and does not submit twice.
3. A rejected promise from `finishOuting` on a live outing is fine. The UI only calls it when
   `status === 'over'`.

If the lead prefers a fifth read-only call (`todayStatus(day)`), the UI switches in one place
(`boot()` in `ui.js`).

## B2. A runner who is put out on a play

`runnerMoves` is `{from, to}` with `0` the batter, `1..3` the bases and `4` scored. There is no way
to say a runner was put out (the lead runner on a double play, a runner thrown out). The mock simply
leaves such runners out of `runnerMoves`, and the UI reads only `bases` after the play for the
diamond. Proposed: `to: -1` for a runner put out. The UI does not need it in v1. It would let a
later version animate the double play.

## B3. The sign of `inPlay.spray`

The contract says "degrees, 0 = centre field". The UI assumes **negative is the left field side**
(Statcast's spray angle as most sites publish it). It only steers the batted ball's direction in the
animation (`offBat()` in `anim.js`). Please confirm the sign, or flip it there.

## B4. Streak for a guest, and stats for an account

`OutingResult.account` carries `{streak, best, rank, players}` when signed in, and the UI shows it.
Signed out, there is no streak in the contract, so the UI keeps its own small history
(`std_ui_hist_v1`: day, number, outcome, strip, percentile, pitches) and counts "doors shut in a
row" from that. The stats sheet reads the same history. Two asks:

1. Confirm that a guest streak kept on the device is wanted (it is what the home screen shows).
2. A read for the stats sheet when signed in (`shutdoor_my_stats()` through `auth.js`, say
   `STD_AUTH.myStats()`), so the sheet can show the account's record. Until then it shows the
   device's.

## B5. The interfaces the UI assumed for Agent A's other files

`mock-api.js` fills these only when the real one is absent, so `api.js`, `share.js` and `auth.js`
loaded before it replace them with no other change.

**`window.STD_API`**: the four calls of section 9, exactly. `API_VERSION: 1`.

**`window.STD_SHARE`**: `text(result, dailyNumber) -> string`. The UI prefers `result.share` and
calls this only if `share` is missing. The mock builds the section 11 text from
`STD_CONTRACT.SQUARE`, `SQUARES_PER_LINE`, `SHARE_TITLE` and `SHARE_URL`.

**`window.STD_AUTH`**, shaped like `baseball/auth.js`'s `RTD_AUTH`:

| member | used for |
|---|---|
| `boot()` | called once on load |
| `state() -> {ready, waiting, signedIn, email, userId, name}` | the profile button and the sign-in sheet |
| `onChange(fn)` | repaint the profile button and an open sign-in sheet |
| `signIn(email, password) -> Promise<{error}>` | the sheet's sign in |
| `signUp(email, password, username) -> Promise<{error}>` | the sheet's new account |
| `signInGoogle() -> Promise<{error}>` | "continue with google" (the brief said `google`; RTD_AUTH names it `signInGoogle`, and the UI calls either) |
| `signOut() -> Promise` | the sheet's sign out |
| `token()` | not read by the UI |

## B6. Load order at integration

`index.html` loads `contract.js`, `sprites.js`, `mound.js`, `anim.js`, `menus.js`, `mock-api.js`,
`ui.js`, each `?v=1`. At integration the lead adds `api.js`, `share.js` and `auth.js` (with their
own `?v=`) **before** `mock-api.js`, then either keeps `mock-api.js` (it steps aside) or removes its
tag. Nothing in `ui.js` reads `STD_API.MOCK`.

## B7. A note on the grid's scale (no change asked, for the record)

The mound draws two scales. The people, the plate and the boxes are to scale with each other. The
5x5 grid is drawn larger than life, centred on the batter's own zone (`szTop`, `szBot`), because a
to-scale grid beside a to-scale hitter leaves 39 pixel cells on a 390 phone. Everything the ball
does (target, where it crossed, the mitt) is in grid space, so what the grid shows is exactly what
the engine played. Mirroring is `screenCol()` and nothing else.

## B8. The shape assumed for `STD_AUTH.myStats()`

Section 14 adds `myStats()` reading `shutdoor_my_stats()` and names no shape. The stats sheet reads:

```js
/** @returns {Promise<null | {
 *   played: number, shut: number, streak: number, best: number,
 *   avgPercentile: number|null,
 *   bands: {green: number, yellow: number, orange: number, red: number},   pitches graded, all time
 *   recent: {day: string, number: number, outcome: Outcome, strip: Band[]}[]   newest first, up to 7
 * }>} */
```

Null, a rejection, or a non-object falls back to the device history, so a server without the
function costs the account view and nothing else. If `shutdoor_my_stats()` returns other names,
the mapping is one place (`renderStats` in `menus.js`).

## B9. Mock switches (no change asked, for the record)

`mock-api.js` reads four test switches off the page address. They exist only in the mock and are
what `test/check-browser.mjs` uses to play every ending:

| switch | does |
|---|---|
| `?mockEnd=door_shut` | every pitch a swinging strike: nine pitches, door shut |
| `?mockEnd=doors_open` | single, double play (two runners `to: -1`), solo home run: the tying run |
| `?mockEnd=walk_off` | single, single, three-run home run: the winning run |
| `?mockProxy=1` | `resolution: 'proxy'`, so the quiet "modern pitch data" note shows |
| `?mockNull=1` | `reveal.pitches` null with `pitchesNote: 'at least 13 pitches'` |
| `?mockAuth=1` | the `STD_AUTH` stub signed in, with `myStats()` and an `account` block on the result |

The mock also now reports an in-play out as `{from: 0, to: -1}` (section 6 as amended), and a
double play as two of them.
