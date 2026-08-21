# Run The Floor: where the data comes from

The game loads exactly two files, and only the first one is large:

| file | what it is |
|---|---|
| `hoops/data/players.json` | one row per player-season, priced |
| `hoops/data/chemistry.json` | curated real relationships, hand written |

Everything in this directory exists to produce the first of those.

## The state it is in right now

`data/players.json` is built from **a hand-entered seed**, not from a fetch. It
is 171 player-seasons off 22 all-time team-seasons, the win share splits and the
per-game lines are entered from memory and rounded, and none of it should ever
be shown to a player as a fact about a real season. See the header of
`seed-rosters.mjs`, which says the same thing at more length.

The seed exists because Basketball-Reference is blocked from the development
sandbox and open from GitHub's runners, which is the same split
`scripts/build-register.mjs` documents. Without it, nobody could open the game
until a workflow had run, and an engine nobody can play is an engine nobody can
tell is wrong.

## Running the real thing

Two stages. The first needs network access to Basketball-Reference and will get
a 403 from the sandbox proxy; run it in CI.

```
node hoops/build/fetch-nba.mjs --from 1974 --to 2026
node hoops/build/build-players.mjs --from hoops/build/raw/nba_player_seasons.json
```

Then, and this is not optional:

```
node hoops/verify.mjs
```

Read the **TARGETS** block at the bottom of that output. It states what the
balance is supposed to look like and flags anything outside its band. Two of the
four targets are deliberately outside their band on the seed, for a reason the
block itself explains: the seed holds no cheap useful player, so the cap cannot
buy a sixty win roster out of it. **The first real fetch is expected to move
those two into range on its own.** If it does not, the dial is `CAP_MUSD` and
then the two `REPLACEMENT_` ratings in `engine.js`, in that order.

`node hoops/build/check-fetch.mjs` runs the scraper's parsers against saved
markup and needs no network. It is the thing to run after touching
`fetch-nba.mjs`, and the reason it exists is that the only place the fetcher can
run is the one place nobody is watching it.

## Why win shares, and why Basketball-Reference

The engine is driven by win shares split into offensive and defensive halves.
That split is load-bearing rather than decorative: offensive win shares move
what a roster scores and defensive win shares move what it allows, so a lockdown
wing and a scoring guard are not interchangeable piles of the same currency.

Win shares are a derived statistic that Basketball-Reference computes and
publishes and that stats.nba.com does not carry at all, so the choice of source
is really the choice of currency, and it was made first.

## What is not filled in yet

`col` (college) and `dr` (draft year) come back `null` from the fetcher, because
neither is on a season page: both need a pass over the individual player pages.
They are chemistry inputs, so until that pass exists the `alma_mater` and
`draft_class` links never fire. That is a link that is missing, not a link that
is wrong, which is the right way round for a gap to sit.

`build-players.mjs` prints how many curated chemistry families are live against
the current data on every build, so a typo in an id in `chemistry.json` shows up
as a family that never went live rather than as silence.
