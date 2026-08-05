# Run The Setlist — band data contract

One CSV per band, served from `/setlist/data/<band>.csv`. The CSV is the single
source of truth for the game: `dataLoader.js` turns it into `{ shows, segues }`
and `scoring.js` scores against it. Nothing else feeds the game.

Generate with:

```
node scripts/setlist/ingest_band.mjs        # → setlist/data/goose.csv
node scripts/setlist/ingest_band.mjs --probe   # check the API before trusting a run
```

As of the last run: **7504 performances · 655 shows · 366 songs**, 2014–2026.
A run that lands far below that is a bad run, not a smaller band — see below.

### Two things that will silently corrupt a run

elgoose.net serves ~100 bands from one API, and every response mixes them
together. The ingester filters on `artist_id` (`1` = Goose, `--artist` to
change it). Without that filter the CSV fills up with Orebolo, Vasudo and
Umphrey's McGee shows.

The API also caps **any** response at 4000 rows, with no error and no paging —
the array just ends. `/setlists.json` and `/setlists/artist_id/1.json` both blow
past that cap, so neither can return a full history; the ingester fetches year
by year for this reason and flags any year that hits the cap.

Related: the API throttles by returning an empty `200` rather than a `429`, so
a year can vanish from an otherwise clean-looking run. The ingester paces its
requests, retries empty responses, and prints a per-year row count — if a year
reports `0 rows after retries`, re-run before trusting the file.

## Columns

Header row required. Read by **name**, so extra columns are ignored and order is
not enforced — but the ingester writes them in this order and should keep doing so.

| Column | Meaning |
|---|---|
| `show_id` | Stable id for the concert. Rows sharing one are one show. |
| `show_date` | `YYYY-MM-DD`. Shows are drafted in date order. |
| `year` | `YYYY`, denormalised from `show_date`. |
| `venue` / `city` / `state` | Shown on the reveal card. `state` may be blank. |
| `set` | `1`, `2`, `3`… for sets; `E` (or `E2`) for encores. Drives set grouping and blocks cross-set segues. |
| `position` | 1-based position within the set. Sets running order. |
| `song` | Display title. |
| `song_id` | Stable song identity. **Segues and gap are keyed on this**, so it must be consistent across shows. |
| `is_cover` | `true` / `false`. |
| `original_artist` | Blank for originals. |
| `length_sec` | Integer seconds. Feeds the version multiplier (15 min / 20 min tiers). Blank is tolerated. |
| `show_gap` | Shows between this play and the song's previous one. `0` on debut. **Feeds rarity scoring.** |
| `times_played` | Running count including this play. Display only. |
| `rarity_rating` | The rarity tier this gap lands in. Display only — `scoring.js` recomputes from `show_gap`. |
| `crowd_rating` | Song esteem — how much fans treasure the song. 30 = ordinary, 75 = top of the jamcharts. Derived, see below. Blank falls back to `NEUTRAL_BASE`. |
| `is_jamchart` | `true` / `false`. The jamchart curators wrote this version up. |
| `is_recommended` | `true` / `false`. The curators flagged this version a standout — the strongest quality signal in the data. 126 of 7504 rows. |
| `jamchart_note` | The curators' prose on why this version matters. Shown on the result screen. |
| `transition` | Raw transition mark out of this song (`>`, `->`, `,`, ``). |
| `is_segue` | `true` when `transition` is a real segue (`>` / `->`). |
| `tags` | Pipe-delimited slot-fit tags. **Drives placement scoring.** |

## Tags

Six tags, and only these six, are scored: `opener`, `closer`, `jam`, `peak`,
`ballad`, `encore`. `scoring.js` maps them onto the 8 slots.

**These are inferred, not sourced.** elgoose has no field saying a song is a
ballad, so `ingest_band.mjs` derives each tag from the song's own history across
every show. The thresholds live in one `TAGS` block at the top of that script:

| Tag | Inferred when |
|---|---|
| `opener` | opens a set in ≥20% of its plays |
| `closer` | closes a set in ≥20% of its plays |
| `encore` | lands in an encore in ≥20% of plays (min 2 plays) |
| `jam` | jamcharted in ≥15% of plays, **or** median length ≥15 min |
| `peak` | jamcharted in ≥25% of plays **and** median length ≥12 min |
| `ballad` | median length ≤5:30, never jamcharted, closes a set <10% of the time |

All except `encore` require at least 3 plays. A song can carry several tags, or
none — an untagged song scores the neutral placement multiplier everywhere.

Tuning these changes how the game plays, so treat a threshold change as a
gameplay change: edit `TAGS`, regenerate, and replay a few rounds.

## Song esteem (`crowd_rating`)

elgoose publishes no song ratings, so before v3 this column was blank and every
song scored identically — song choice, the whole point of the game, was worth
nothing.

It now comes from the community's own jamcharts: how many versions of a song the
curators wrote up, and how many of those they marked "recommended" (worth
double). The top song sets the ceiling at 75 and the rest scale by square root;
songs the curators never wrote up stay at the neutral 30 rather than being
punished, because plenty of well-loved songs are simply not jam vehicles.

**Why this is a fair stand-in for fan opinion.** Checked against the six annual
fan-voted *Goose Jam of the Year* brackets: of the nine songs known to have won
or been most-nominated, eight land in the top 18 of the 91 charted songs. The
outlier is A Western Sun, which won in 2021 and has been played far less since.

The brackets themselves would be a better source, but they live in PDFs on sites
that return 403 to automated fetches, so they cannot be ingested or refreshed.
Jamchart standing comes down the same API as everything else.

91 of 366 songs carry a rating; 27 distinct values are in play.

## Adding a band

1. Write `setlist/data/<band>.csv` to this contract.
2. Add an entry to `BANDS` in `setlist/index.html`.

Every run draws a fresh random eight shows; there is no seeded mode.
