# RunTheGlobe — build notes (preview)

Game #3 on the RunThe.GG platform. **Background build — not released live.** It is
intentionally:

- `noindex,nofollow` (see the `<meta>` in `index.html`)
- **not** linked from the homepage (`/index.html`)
- **not** listed in `sitemap.xml`

It is reachable directly at `/globe/` for testing. Flip those three things (and add
the homepage game card + sitemap entry) when it's ready to ship — same pattern the
other two games use.

## Layout

```
globe/
  index.html               self-contained game shell + Offline Solo engine
  data/
    countries.js           country task bank (seed pool of 12) — window.GLOBE_COUNTRIES
    finish_lines.js         Round-9 Finish Line Pool — window.GLOBE_FINISH_LINES
  manifest.webmanifest     PWA manifest (reuses shared RunThe.GG icons)
  README.md                this file
```

Matches the platform conventions: single large HTML app per game, content in
separate `data/*.js` files, shared Supabase account read fail-open, same brand
tokens/fonts, same AdSense publisher tag.

## What's playable now (MVP)

**Offline Solo** (GDD §7 — "fastest to ship, no backend dependency") is complete
end to end:

- Full per-round race loop (GDD §3): destination draw → challenge → **Checkpoint** →
  leaderboard → **Grounded**, across 9 Stages, 11-team field, one elimination per Stage.
- **Effective time scoring** (GDD §4): `raw + penalty × misses`, category penalties applied.
- **Split Path** (choose 1 of 2, brain+reflex pairing preference) and **Solo Call**
  (one assigned task) — GDD §5. Selection actively diversifies game types across
  stages and never offers two of the same type at once.
- **14 game types** across the taxonomy (GDD §5). Some are authored per country,
  but most are GENERATED from country/world data (flags, capitals, regions, stats,
  coordinates) so variety scales without hand-authoring every type:
  - *Trivia* (multiple choice) · *Guess The Flag* · *Name The Capital* ·
    *Odd One Out* (by region) · *True or False* (rapid-fire)
  - *Word Scramble* · *Rank The Order* (order-by-stat) · *Higher or Lower* (compare a stat)
  - *Memory Sequence* (repeat) · *Memory Match* (concentration)
  - *Reaction* (green-light) · *Whack-A-Landmark* · *Quick Tap*
  - *Find It On The Map* — pin-drop on a world map, scored by real great-circle
    distance from the country's coordinates (`ll` in `countries.js`).
  All 14 verified in-browser end to end (offline and, via the shared renderers, online).
- **AI ghost field** (GDD §8): lobby-fill ghosts, per-team skill, per-stage noise,
  labeled `(AI)`. As weak ghosts are Grounded the field naturally speeds up (emergent
  difficulty ramp). Ghosts are labeled per the §8 rule.
- **Skip Pass** (GDD §2 Fast-Forward analog): once per race, check in at the field median.
- **Grounded / spectator flow** (GDD §10): binary Watch-the-rest / Return-home, no reward.
- **Finish Line Pool** (GDD §11): the Final always ends at a tagged real-world location;
  reuses the linked country's task bank when one exists.
- Local **records** (races / wins / top-3 / countries visited / best finish / fastest stage).
- IP-safe terminology throughout (GDD §2): Checkpoint, Split Path, Solo Call, Skip Pass,
  Grounded, Stage.
- **Content: 46 countries** (GDD §12 targets ~40–50 at launch — met). Scale toward ~100
  by appending entries to `countries.js` with the same shape.

## Online Race (Beta) — GDD §3/§7-9

Server-authoritative multiplayer. **Requires the migration `supabase/41_globe_online.sql`
to be applied to the Supabase project** (creates the tables/RPCs and enables realtime).
Until then the "Online Race" card falls back to an "Online is offline" message.

- **Lobby by code**: any signed-in player creates a race (5-char code); others join.
  Up to 11 teams; empty slots fill with AI ghosts at start (GDD §8 lobby-fill).
- **Server-authoritative timing (GDD §9)**: the Checkpoint effective time is computed
  by `globe_checkpoint` from the server-stamped stage start — never trusted from the
  client. A sub-300 ms "completion" is rejected as submission-before-load.
- **Host-driven rounds**: the host draws the shared destination and advances; the server
  paces the ghost field to the live human median (GDD §8) and Grounds the slowest.
- **Realtime**: clients subscribe to the lobby/team/stage tables for live lobby +
  leaderboard (with a polling fallback if realtime isn't enabled).

**Testing status**: the full client loop (menu → lobby → start → stage → Checkpoint →
advance → Final → finish) is verified in-browser against a stubbed backend with no JS
errors. Live multiplayer — realtime propagation, real server timing, cross-device play —
still needs to be tested with the migration applied and two+ real clients.

**Still to build on top of this foundation**: two-humans-per-team (shared team code) and
auto-paired **online solo** matchmaking (GDD §7); **preset-phrase quick chat** (GDD §7);
mid-race ghost **substitution** on quit/timeout (GDD §8); **Layover / Reroute** opponent
mechanics; anti-cheat **detection** logic beyond the timing guard (GDD §9).

## Deferred (scaffolded or noted, not built)

- **Local co-op** (pass-and-play) — shown as a "Soon" card.
- **Audio** (identify a place from a sound clip) and **duo-specific** tasks (GDD §6) —
  need audio assets / two live inputs; engine adds them by mapping a new `KIND`.

### Virtual / street-level games (the immersive next step — needs external imagery)

The user wants "walk the streets of a city" style games (GDD §13 Landmark Walkthrough).
`Find It On The Map` already delivers real interactive geography self-contained, but
true street/panorama imagery needs an external source and a licensing decision — it
can't be shipped self-contained. Options, in order of licensing cleanliness:

1. **Mapillary** (open, crowd-sourced street imagery; MIT `mapillary-js` viewer).
   Needs a free client token. Most permissive for gamifying. Recommended.
2. **Self-hosted 360° panoramas** + Pannellum/Three.js viewer. Full ownership, no API
   key, but each panorama must be sourced/licensed (CC0 libraries exist) and hosted.
3. **Google Street View Embed** — best coverage, but ToS restricts gamifying the tiles
   and requires a Maps API key + attribution (GDD §13 flags this). Use with caution.

Game designs this unlocks: **"Where am I?"** (drop into a mystery pano → pin the guess on
the existing map, GeoGuessr-style), **"Find the landmark"** (look around a 360° view for a
target), and the GDD §13 look-around. The engine's kind/renderer pattern + the map
minigame's distance scoring are already in place to plug this in — the blocker is an API
key/imagery source, which is a product/licensing call.

## Open decisions to confirm with design

1. **Penalty for categories not in the §4 table.** §4 lists 5 scoring categories.
   `word`, `dragdrop`, `audio` aren't among them. Current engine defaults
   (`word:+12`, `dragdrop:+12`, `audio:+15`) are placeholders in `PENALTY` (index.html)
   — confirm or override.
2. **Badge / progression schema** (GDD §14, open item). The existing RunThePitch/
   RunTheTour system is **server-computed badge tiers** off `profiles`/`drafts`
   (see `supabase/13_profile_stats.sql`, `18_more_badges.sql`). RunTheGlobe should
   plug into that rather than invent a parallel one. Records are local-only in this
   preview; the tracked tallies (races, wins, top-3, countries visited, fastest stage,
   ghost-free streaks) map cleanly onto that schema when the online/account layer lands.
3. **Finish Line dataset** (GDD §11, open item). Seeded with 20 tagged locations
   (`tier` 1–3 + `global_landmark`) so weighting/filtering is possible without a
   re-tag pass. Expand to the full pool when compiled.
