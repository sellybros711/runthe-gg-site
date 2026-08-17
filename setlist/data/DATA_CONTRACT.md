# Segue — band data contract

Two CSVs per band, served from `/setlist/data/`. `<band>.csv` is the single
source of truth for the game: `dataLoader.js` turns it into `{ shows, segues }`
and `scoring.js` scores against it. Nothing else feeds the game.

`<band>_shows.csv` is the show-level table beside it, and it exists to hold the
rows the setlist file cannot. The setlist file is one row per **performance**,
so a show with no setlist has nothing to put in it, and every date the band has
not played yet is exactly that. It also carries the tour name, which the
setlist endpoint does not return at all. It feeds the tour schedule and the
show browser, and nothing in the scoring reads it.

Generate with:

```
node scripts/setlist/ingest_band.mjs        # → setlist/data/goose.csv
node scripts/setlist/ingest_band.mjs --probe   # check the API before trusting a run
```

As of the last run: **7558 performances · 659 shows · 367 songs**, 2014–2026.
A run that lands far below that is a bad run, not a smaller band — see below.

The show table from the same run: **855 shows · 659 with a setlist · 28 still to
play**. The gap between those first two figures is not an error. It is announced
dates that were never played, plus shows nobody has transcribed.

(Deliberately not restating either number in this sentence: `sync_counts.mjs`
keeps the bolded line current on every refresh and cannot reach prose, so a
figure repeated here goes stale the next time the band plays. It already did.)

## `<band>_shows.csv`

| column | notes |
|---|---|
| `show_id` | joins to `show_id` in the setlist CSV |
| `show_date` | `YYYY-MM-DD`, past and future |
| `year` | the first four characters of `show_date` |
| `tour_id` | elgoose's tour key |
| `tour` | display name, **blank for a one-off**. elgoose writes "Not Part of a Tour", which is a sentence rather than a name, so the ingester blanks it and the UI decides how to say it |
| `venue`, `city`, `state`, `country` | display text, entity-decoded |
| `has_setlist` | `true` when the setlist CSV has rows for this `show_id` |

## `<band>_latest.json`

About 1KB, and that size is the reason it exists. The home screen prints last
night's setlist and a countdown to the next date; reading those out of the
1.2MB archive or even the 72KB show table is not a defensible cost for a panel
that has to be on screen before anybody has decided to play.

```
{ "last":     { show_id, date, venue, city, state, country, tour,
                run?: {night, of},
                sets: [ { label, songs: [ { n, s?, l? } ] } ] },
  "upcoming": [ { date, venue, city, state, country, tour }, ... ] }
```

`n` is the title, `s` is `1` when the song segued into the next one, and `l` is
its length in seconds when the archive has one (a show transcribed overnight
often has none yet). Sets are grouped by `dataLoader.setLabel`, so set order
here and in the game come from the same code.

**`upcoming` carries three dates, not one.** This file is written by a scheduled
job and read whenever somebody visits, so the top of the list goes stale the
moment the band plays it. Three lets the page pick the first date still ahead
and stay right even if a refresh is missed.

Nothing in the scoring reads this file, and the home screen treats it as
optional: if it 404s, fails, or parses badly, the band panel simply renders
without the live section.

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
| `length_sec` | Integer seconds. **Load-bearing since v4** — it is the resource a player spends, so a show is only drawable when every song in it is timed. Also feeds the version multiplier (15 / 20 min tiers). |
| `show_gap` | Shows between this play and the song's previous one. `0` on debut. **Feeds rarity scoring.** |
| `times_played` | Running count including this play. Display only. |
| `rarity_rating` | The rarity tier this gap lands in. Display only — `scoring.js` recomputes from `show_gap`. |
| `crowd_rating` | Song esteem — how much fans treasure the song. 30 = ordinary, 75 = top of the jamcharts. Derived, see below. Blank falls back to `NEUTRAL_BASE`. |
| `is_jamchart` | `true` / `false`. The jamchart curators wrote this version up. |
| `is_recommended` | `true` / `false`. The curators flagged this version a standout — the strongest quality signal in the data. 126 of 7504 rows. |
| `jamchart_note` | The curators' prose on why this version matters. Shown on the result screen. |
| `transition` | Raw transition mark out of this song (`>`, `->`, `,`, ``). |
| `is_segue` | `true` when `transition` is a real segue (`>` / `->`). Shown in the draft as a `>` on the song and drives the segue-building mechanic. 30% of performances. |
| `tags` | Pipe-delimited role tags. **Drives placement scoring.** |

## Tags

Six tags, and only these six, are scored: `opener`, `closer`, `jam`, `peak`,
`ballad`, `encore`. `scoring.js` maps them onto the role a song lands in.

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

Every run draws fresh random shows until the night is over; there is no seeded
mode. Set budgets (75 / 70 / 10 minutes) are the medians of this archive — see
the "How a show works" section of the README.
