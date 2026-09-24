# The cold path

Everything that needs Python or more than a couple of seconds. The hot path is
a Cloudflare Worker and is deliberately small: fetch, de-vig, apply precomputed
priors, write. Anything that has to download a season of game logs or fit a
distribution belongs here, where being slow is free.

```
python3 fantasy-pipeline/test_norm.py                    the name contract
python3 fantasy-pipeline/build_players.py --dry-run      builds, writes nothing
python3 fantasy-pipeline/build_players.py                writes
```

The workflow is `.github/workflows/fantasy-pipeline.yml`. It runs at 09:00 UTC
daily and has a button with a dry run default.

**The odds API key is not here and must never be.** This path touches nflverse
and Supabase. If something here starts wanting the provider key, it belongs in
the Worker.

## The name contract is the whole ballgame

A quote arrives from the odds provider and is normalised by `normName()` in
`fantasy/worker/src/parse.mjs`. The crosswalk is built here and normalised by
`norm_name()` in `norm.py`. **The join between every quote in this product and
every player it is about is a string equality between those two functions.**

There is no shared runtime to put that rule in. The hot path is a Worker, so it
is JavaScript. The cold path needs nflreadpy, so it is Python.

So neither is the authority. `fantasy/lib/name-fixture.json` is, and both sides
are driven against it: `test_norm.py` here, and the Name normalising section of
`fantasy/check-worker.mjs` there. Both run in CI, and the pipeline workflow runs
**both** before it installs anything, because a crosswalk built under a drifted
normaliser writes a thousand rows that match nothing and reports success.

**What drift looks like** is what the live database showed on 24 September 2026:
192 real quotes, correct player names, every one unresolved, nothing thrown and
nothing logged as an error.

**`re.ASCII` in `norm.py` is load bearing.** JavaScript's `\b` is ASCII, so an
accented letter is a non-word character; Python's is Unicode aware, so it is a
word character. Measured: without the flag, a tilde-n followed by `v` gives `v`
in Python and `""` in JavaScript. Two fixture cases exist for exactly that and
nothing else in the file fails either way, which is the point.

## What the build refuses to do

Two silent wrongs are possible and both are refusals rather than guesses.

**A colliding name.** `alias_norm` is a primary key, so two players who
normalise identically cannot both own it, and whichever loses gets the other's
quotes for ever. CLAUDE.md records this repo folding two people into one record
and a player emailing in about it. A collision writes **neither** alias and
reports both; those players have no quotes attributed until a rule tells them
apart.

Measured on real data: **0 collisions** among active fantasy players, **153**
across all history. The season filter (`last_season >= season - 1`) is the only
reason it is zero. Marvin Harrison Sr. last played in 2008. A Jr. debuting while
his father is still playing breaks it, so this is not hypothetical, it is just
not today.

**An empty normalisation.** A name that is nothing but a suffix normalises to
`""`, which as a key matches every other name that normalises to nothing.
Refused outright.

## And what it refuses to finish

`MIN_PLAYERS` is a floor of 600 against a real count near 1,066. A run that
produces fewer fails rather than writing a crosswalk with holes in it.

That is not belt and braces. A crosswalk missing half the league throws nowhere:
the poller keeps collecting, the quotes keep storing, and the only symptom is
players with no projection, **which looks exactly like a player with no market**.
Telling those two apart is the one thing the brief says this product must never
get wrong, so the pipeline is not allowed to create the ambiguity.

`load_players()`'s columns are named and checked for the same reason. A renamed
column upstream is the likeliest thing to change, and reading it as `None` would
build a crosswalk with no positions in it and report success.

## The quotes arrive before the crosswalk does

That is the normal case, not a mistake. `parse.mjs` stores a quote it cannot
attribute, with `player_id` null, because "throwing the data away is how you end
up unable to backfill once somebody works out who it was".

`supabase/114_fantasy_resolve.sql` is the working out, called at the end of
every run. One statement, one join: a client-side loop over a thousand players
would be a thousand round trips to do one join, and it would race the poller,
leaving rows written mid-loop null with nothing saying so.

It never overwrites an existing attribution. A correction belongs in the alias
table and a re-attribution should be a deliberate act with its own migration.

## What is not built yet

`fantasy/lib/dist.mjs` and `project.mjs` still carry `PLACEHOLDER_CV`,
`PLACEHOLDER_DISPERSION` and `PLACEHOLDER_CORR`. Those are shape priors and a
correlation matrix, and the brief is explicit that anything not estimated
in-house is folklore and must not be hardcoded. Measuring them from game logs is
this directory's next job, and they are named PLACEHOLDER so that shipping one
by accident is loud.
