# Segue, the setlist game

The repo-wide rules are in the root CLAUDE.md. This file holds only what a change to `setlist/` must
obey. The why and the history live in the knowledge base.

## The knowledge base

`sellybros711/runthe-gg-kb`, folder `games/setlist/`. Start at `setlist-overview.md`. In a cloud
session it is cloned at `/home/user/runthe-gg-kb`. If it is not there, attach it (add_repo) before a
design task. After a meaningful change, update the matching note by pull request there.

| task | read |
|---|---|
| the rooms a player earns | `setlist-rooms.md` |
| the daily data refresh | `setlist-data.md` |
| the band's looks and outfits | `setlist-band-looks.md` |

`setlist/data/DATA_CONTRACT.md` stays here: `check_data.mjs` reads it.

## Commands

```
node scripts/setlist/check_data.mjs          the data, the launch posture, the contract
node setlist/verify-scoring.mjs              scoring
node scripts/setlist/check_venues.mjs        rooms: fields, archive names, rules, no names on screen
node scripts/setlist/make_venue_thumbs.mjs   render every room to setlist/venues/<id>.png
```

## Rules a change here must keep

- **It is unlaunched: out of the sitemap, noindexed, carrying no ad tag, and NOT linked from the home
  page or nav.** Since 2026-10-24 it is playable by URL and nothing else. Launching it moves all four
  together, on the owner's say. `check_data.mjs` asserts all four, so changing one means changing a
  guard on purpose.
- **No room is named on screen.** `archive` holds the venue as `goose_shows.csv` spells it, for
  joining, and is never rendered. `check_venues` fails on a venue name in copy.
- **Room unlocks are derived from `segue_runs` rows, never stored.** Only the choice is stored
  (`segue_venue_v1`). Random is the default.
- A room changes how the night looks, never a score.
- **The band is known by its signature, never named on screen.** A player is their instrument. Six
  outfits each (`outfits.js`), earned on one ladder from `segue_runs` rows like the rooms, never
  stored and never sold. Only the choice is stored (`segue_outfits_v1`). An outfit never changes a
  score. A change to `outfits.js` bumps its `?v=` in `world.js` and `index.html`, then `world.js`'s
  everywhere (`stage.js`, `backstage.js`, `world-worker.js`) and the worker's by hand.
- **`check-cachebust` does not follow `stage.js`'s imports.** A change to `rooms.js` bumps its `?v=`
  in `stage.js` and `stage.js`'s `?v=` in `index.html`, together. A new picture bumps `VENUE_ART_V`.
- **`check-cachebust` cannot see `import()` or a worker's `new URL()`.** `backstage.js` is loaded by
  `import('./backstage.js?v=N')` in `index.html`, and `world-worker.js` by `new URL(...)` in both
  `stage.js` and `backstage.js`. A change to either file bumps those `?v=` by hand, every place.
- **A data refresh only appends.** `data_drift.mjs` fails a refresh where a derived value moved for a
  song whose own history did not.
- **"Tonight" means the band's real show** (the tour countdown, the last show). The show a player
  builds is "your show": "Where your show is played", "Your show", "Your setlist". The owner's call,
  2026-10-27.
- **A button that starts a show says "Build your show"** (the scorecard's says "Build another
  show"). It names what the player gets, never the spin. Respin stays: it really is a spin. The
  owner's call, 2026-10-27, and it applies to every mockup too.
