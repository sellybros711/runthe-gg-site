# Run The Setlist — band data contract

One CSV per band, served from `/setlist/data/<band>.csv`. The CSV is the single
source of truth for the game: `dataLoader.js` turns it into `{ shows, segues }`
and `scoring.js` scores against it. Nothing else feeds the game.

Generate with:

```
node scripts/setlist/ingest_band.mjs        # → setlist/data/goose.csv
```

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
| `crowd_rating` | Song "belovedness", ~30 = neutral. **Blank for Goose** (elgoose has no ratings); the game falls back to `NEUTRAL_BASE`. |
| `is_jamchart` | `true` / `false`. Feeds the version multiplier. |
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

## Adding a band

1. Write `setlist/data/<band>.csv` to this contract.
2. Add an entry to `BANDS` in `setlist/index.html`.

The daily seed is `hash(band + YYYY-MM-DD)`, so each band has its own daily.
