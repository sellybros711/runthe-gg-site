# Run The Setlist — draft a setlist from real shows

A jam-band setlist-drafting game at `runthe.gg/setlist`. Pick a band; each round
reveals one randomly-drawn real concert; you pull one song off it and lock it
into one of eight setlist slots. You commit before the next show appears, so the
lock is final. Eight rounds, then a score.

**Hidden for now** — `noindex`, not linked from the homepage, not in the
sitemap, same as `/arcade/` and `/touchdown/` while in development.

```
/setlist/
  index.html          the whole game UI, self-contained
  scoring.js          v2 scoring — the ONLY place a scoring constant lives
  dataLoader.js       band CSV → { shows, segues }
  verify-scoring.mjs  QA harness: 72 assertions against the v2 spec
  data/
    DATA_CONTRACT.md  the CSV columns, and how tags are derived
    goose.csv         NOT PRESENT YET — see "Getting the data"
    sample.csv        invented data, so the game is playable meanwhile
/scripts/setlist/
  ingest_band.mjs     elgoose.net → goose.csv
  make_sample.mjs     regenerates sample.csv
```

No build step, no bundler, no backend. The game is an ES module loaded directly
by the browser. Everything persists to `localStorage`.

## Getting the data

`goose.csv` is not in the repo yet. It is built from elgoose.net:

```bash
node scripts/setlist/ingest_band.mjs --probe   # ALWAYS run this first
node scripts/setlist/ingest_band.mjs           # → setlist/data/goose.csv
```

**Run `--probe` first.** The ingester was rebuilt from a schema description
rather than from a known-good script, and has never been run against the live
API. Probe fetches one year, prints the field names elgoose actually returns,
and names any expected field that is missing. Without it, a renamed field shows
up as a quietly half-empty CSV rather than an error.

A full run expects roughly **14k performances across ~1180 shows**. If the
counts are far off, or the run prints a SANITY CHECK warning, probe before
trusting the file. The fix is always the same: update the `pick()` calls in
`ingest_band.mjs` to the field names probe reported.

This needs outbound access to `elgoose.net`. Sessions whose network policy
blocks it will fail with a 403 on CONNECT — that is the egress policy, not a
bug in the script.

Once the CSV exists, Goose goes live in the picker with no code change.

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

## Modes

**Solo** — fresh random seed, replay as much as you like.
**Daily** — seeded by `hash(band + local YYYY-MM-DD)`, so everyone drafting
today's Goose gets the same eight shows in the same order. One attempt per band
per day, held in `localStorage` under `setlist_daily_<band>_<date>` along with
the day's result, which the home screen re-opens rather than replaying.

There is deliberately **no backend** — no database, no auth, no leaderboard.

## Open questions

Two decisions worth revisiting once real data lands:

1. **Tag inference is a proxy.** elgoose has no field saying a song is a ballad,
   so all six tags are derived from each song's own play history — see
   `DATA_CONTRACT.md`. Thresholds live in one `TAGS` block in `ingest_band.mjs`.
   These drive every placement multiplier, so they are the highest-leverage
   thing to tune against real Goose data. Two signals in the CSV are still
   unused and would likely beat the current ones: **length variance** (a song
   running 5:00 one night and 22:00 another is a jam vehicle; one that is always
   4:10 is not) and **segue-out rate**.

2. **Segues score across set breaks.** Slots 2→3 and 6→7 pay the segue bonus if
   the pair is canonical, which cannot happen in a real setlist. This is
   faithful to the v2 spec, which says "per adjacent canonical pair" with no
   exclusions. Restricting it to within-set boundaries is a two-line change.
