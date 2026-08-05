# Run The Setlist — draft a setlist from real shows

A jam-band setlist-drafting game at `runthe.gg/setlist`. Pick a band; each round
reveals one randomly-drawn real concert; you pull one song off it and lock it
into one of eight setlist slots. You commit before the next show appears, so the
lock is final. Eight rounds, then a score.

**In open testing.** Indexable and listed in `sitemap.xml`, but deliberately
**not linked from the homepage** yet — the URL is the only way in, so it can be
shared and found without being presented as a finished game.

```
/setlist/
  index.html          the whole game UI, self-contained
  scoring.js          v2 scoring — the ONLY place a scoring constant lives
  dataLoader.js       band CSV → { shows, segues }
  verify-scoring.mjs  QA harness: 72 assertions against the v2 spec
  data/
    DATA_CONTRACT.md  the CSV columns, and how tags are derived
    goose.csv         7504 performances · 655 shows · 366 songs · 2014–2026
    sample.csv        invented data, kept as an offline/regression fixture
/scripts/setlist/
  ingest_band.mjs     elgoose.net → goose.csv
  make_sample.mjs     regenerates sample.csv
```

No build step, no bundler, no backend. The game is an ES module loaded directly
by the browser. Everything persists to `localStorage`.

## Getting the data

`goose.csv` is committed. Regenerate it from elgoose.net when you want fresher
shows:

```bash
node scripts/setlist/ingest_band.mjs --probe   # ALWAYS run this first
node scripts/setlist/ingest_band.mjs           # → setlist/data/goose.csv
```

**Bump `DATA_VERSION` in `index.html` after regenerating** — the CSV is fetched
as `goose.csv?v=<DATA_VERSION>`, so without a bump returning players keep the
cached copy.

A full run should land near **7504 performances across 655 shows** (2014–2026).
Anything far below that is a bad run, not a smaller band — the ingester prints
a per-year row count, and the two failure modes it guards are described in
`data/DATA_CONTRACT.md`: elgoose serves ~100 bands from one API and mixes them
into every response, and it truncates any single response at 4000 rows without
saying so. If a year reports `0 rows after retries`, that is throttling; re-run.

`--probe` prints the field names elgoose actually returns plus the artist
breakdown of one year. Run it before trusting a run; if a field was renamed,
update the `pick()` calls to match.

This needs outbound access to `elgoose.net`. Sessions whose network policy
blocks it will fail with a 403 on CONNECT — that is the egress policy, not a
bug in the script.

Goose is already live in the picker; a regenerated CSV needs no code change.

## Running it

Any static server from the repo root:

```bash
python3 -m http.server 8765     # → http://localhost:8765/setlist/
```

Paths are absolute (`/setlist/data/…`, `/assets/…`), so it must be served from
the repo root, not from inside `setlist/`.

## Checking it

```bash
node setlist/verify-scoring.mjs   # expect "72 passed, 0 failed"
```

## Scoring

`scoring.js` is the source of truth; this is a summary, not a spec.

```
versionScore = round(base * v)
placed       = round(versionScore * placementMult * SCALE)
rarity       = round(rarityBase(gap) * (base/30) * SCALE)
subtotal     = placed + rarity
total        = sum(subtotal) + sum(segue bonuses) + completion
```

`SCALE` 1.3 · `SEGUE_COEF` 0.25 · completion +30 when all eight slots are full.
Placement multipliers: 1.15 all wanted tags · 1.08 some · 0.92 neutral · 0.65
hard clash (a ballad in an energy slot, or a jam/peak song in the breather).
Rarity by show gap: ≥100 → 50 · ≥50 → 35 · ≥20 → 20 · ≥8 → 10 · else 0.

`base` is `crowd_rating`, falling back to a neutral 30 — which for Goose is
every row, since elgoose carries no song ratings. Spotify track popularity is
the intended real source and has not been wired up.

The eight slots and the tags each wants:

| # | Slot | Wants |
|---|---|---|
| 0 | Set I Opener | `opener` |
| 1 | Set I Mid | anything |
| 2 | Set I Closer | `closer` `jam` |
| 3 | Set II Opener | `opener` `jam` |
| 4 | Set II Peak | `peak` |
| 5 | Set II Breather | `ballad` |
| 6 | Set II Closer | `closer` `peak` |
| 7 | Encore | `encore` |

## Mode

**One mode, on purpose.** Every run draws a fresh random eight shows and can be
replayed as often as you like. The structure is still being worked out, so
there is deliberately nothing to perfect around yet — no daily, no streak, no
carry-over state.

A daily existed and was removed: it was seeded by `hash(band + local date)` so
everyone got the same eight shows, allowed one attempt per band per day, and
persisted to `localStorage` under `setlist_daily_<band>_<date>`. Reinstating it
means re-seeding the draw in `start()` and restoring that read/write — the
scoring, draw and share paths are all mode-agnostic now, so nothing else has to
change. Nothing is written to `localStorage` today except the shared theme key.

There is deliberately **no backend** — no database, no auth, no leaderboard.

## Open questions

Both of the first two surfaced only once the real Goose archive landed — the
sample data is uniformly well-formed and hid them.

1. **The same song can be locked into two slots.** Each round is a different
   show, so a staple can be offered repeatedly, and nothing stops a player
   putting "Arrow" in both Set I Closer and Set II Peak — impossible in a real
   setlist. Deduping against already-locked songs is a filter in `renderDraft`.
   Still open.

2. **Thin shows made choiceless rounds — fixed.** 18 shows in the archive are a
   single song and 28 are three or fewer (early bar gigs the archive only partly
   logged), which put a no-decision round in ~20% of games. `drawableShows()` in
   `index.html` now requires `MIN_SONGS_PER_SHOW` (8), leaving 529 of 655 Goose
   shows. It falls back to the unfiltered set for any band too sparse to fill
   eight rounds. Raising or lowering that constant changes every daily result.

Two more worth revisiting:

3. **Tag inference is a proxy.** elgoose has no field saying a song is a ballad,
   so all six tags are derived from each song's own play history — see
   `DATA_CONTRACT.md`. Thresholds live in one `TAGS` block in `ingest_band.mjs`.
   These drive every placement multiplier, so they are the highest-leverage
   thing to tune against real Goose data. Two signals in the CSV are still
   unused and would likely beat the current ones: **length variance** (a song
   running 5:00 one night and 22:00 another is a jam vehicle; one that is always
   4:10 is not) and **segue-out rate**.

4. **Segues score across set breaks.** Slots 2→3 and 6→7 pay the segue bonus if
   the pair is canonical, which cannot happen in a real setlist. This is
   faithful to the v2 spec, which says "per adjacent canonical pair" with no
   exclusions. Restricting it to within-set boundaries is a two-line change.
