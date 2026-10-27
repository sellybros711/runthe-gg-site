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

`setlist/data/DATA_CONTRACT.md` stays here: `check_data.mjs` reads it.

## Commands

```
node scripts/setlist/check_data.mjs          the data, the launch posture, the contract
node setlist/verify-scoring.mjs              scoring
node scripts/setlist/check_venues.mjs        rooms: fields, archive names, rules, no names on screen
node scripts/setlist/make_venue_thumbs.mjs   render every room to setlist/venues/<id>.png
```

## Rules a change here must keep

- **It is in the sitemap and indexable, and NOT linked from the home page or nav.** Linking it is
  the launch. `check_data.mjs` asserts all three, so changing one means changing a guard on purpose.
- **No room is named on screen.** `archive` holds the venue as `goose_shows.csv` spells it, for
  joining, and is never rendered. `check_venues` fails on a venue name in copy.
- **Room unlocks are derived from `segue_runs` rows, never stored.** Only the choice is stored
  (`segue_venue_v1`). Random is the default.
- A room changes how the night looks, never a score.
- **`check-cachebust` does not follow `stage.js`'s imports.** A change to `rooms.js` bumps its `?v=`
  in `stage.js` and `stage.js`'s `?v=` in `index.html`, together. A new picture bumps `VENUE_ART_V`.
- **A data refresh only appends.** `data_drift.mjs` fails a refresh where a derived value moved for a
  song whose own history did not.
- **A button that starts a show says "Build your show"** (the scorecard's says "Build another
  show"). It names what the player gets, never the spin. Respin stays: it really is a spin. The
  owner's call, 2026-10-27, and it applies to every mockup too.
- **"Tonight" means the band's real show** (the tour countdown, the last show). The show a player
  builds is "your show": "Where your show is played", "Your show", "Your setlist". The owner's call,
  2026-10-27.
