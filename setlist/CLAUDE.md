# Segue, the setlist game

This file holds the decisions for this game. The repo-wide rules are in the root CLAUDE.md.

## Segue, the setlist game

`setlist/index.html`, same one-file convention. It is NOT in the same state as
the wrestling game above and the difference is deliberate, so it is written
down here rather than inferred from that paragraph:

| | wrestling | setlist |
|---|---|---|
| in `sitemap.xml` | no | **yes** |
| indexable | no, noindexed | **yes** |
| linked from the homepage or nav | no | no |

So Segue is live and findable by search, and a visitor browsing runthe.gg will
not stumble on it. Linking it from the homepage is the step that launches it,
and it has not been taken. `check_data.mjs` asserts all three of those, so
changing any of them means changing a guard on purpose.

It has its own regression suite, which is the thing to run after editing:

```
node scripts/setlist/check_data.mjs
node setlist/verify-scoring.mjs
```

### Rooms: venues a player earns, and none of them has a name

```
node scripts/setlist/check_venues.mjs          fields, archive names, rules, no names on screen
node scripts/setlist/make_venue_thumbs.mjs     render every room to setlist/venues/<id>.png
```

`setlist/venues.js` is the rules (pure, no imports) and `setlist/rooms.js` the pictures, built with
the stage's own kit and drawn by `stage.js`. A room changes how the night looks, never a score.

- **No room is named on screen.** The picture is the reward. `archive` holds the venue exactly as
  `goose_shows.csv` spells it, for joining picks, and is never rendered. Clues use cities, years and
  lore. `check_venues` fails on a venue name in copy.
- **Unlocks are derived from the account's `segue_runs` rows** (`board.js venueRows`, which selects
  `picks` and `rng_seed`), never stored. Only the choice is stored (`segue_venue_v1`). **Random is
  the default**: each show draws an open room (`tonightVenue`), never the same one twice running when
  there is a choice. A hand pick sticks until changed, and a pick the rows do not back counts as random.
- **No screen behind the band.** Goose tours a light rig, not video, so every room hangs its pods:
  six flown diamond truss pods in a V (three small ones in a bar), with pixel battens along the truss
  and movers fanning out of the corners. `RIGS` in `rooms.js` places them; `stage.js` draws them.
- **A `picks` rule needs a drawable night.** O'Neill's (18 shows) and the Factory Underground have
  none with a full timed setlist, so their rooms are earned by ladder and season rules instead.
- **Design inside what the camera sees.** On a phone the show sees x from about -15 to 15 and, on a
  back wall at y -21.5, z up to about 25. A room's signature has to sit above or behind the stage.
- **`check-cachebust` does not follow stage.js's imports.** A change to `rooms.js` bumps its `?v=`
  in `stage.js` and stage.js's `?v=` in `index.html`, together. A new picture bumps `VENUE_ART_V`.

## Segue's data

Its data refreshes itself daily at 6am Eastern
(`.github/workflows/setlist-data.yml`) and commits three files:
`goose.csv` (performances), `goose_shows.csv` (every show, past and future,
with tour names) and `goose_latest.json` (last night's setlist plus the next
three dates, for the home screen). A refresh APPENDS: song esteem is derived
but its ceiling is pinned, so adding a show touches the rows it adds plus any
song a curator wrote up, and nothing else. `data_drift.mjs` enforces that,
failing any refresh where a derived value moved for a song whose own history
did not.
