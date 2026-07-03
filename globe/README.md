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
  (one assigned task) — GDD §5.
- Five wired minigame kinds driving the 6 content categories:
  `trivia`/`math` → multiple-choice, `word` → unscramble, `memory` → sequence-repeat,
  `reflex` → reaction-window, `spatial` → order-by-stat.
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

## Deferred (scaffolded or noted, not built)

- **Online modes** (team / auto-paired solo) and **local co-op** — shown as "Soon" cards
  on the home screen. Requires the online lobby + server-authoritative timing (GDD §9).
- **Duo-specific tasks** (GDD §6), **audio** and **drag-drop/tile** task kinds — no assets
  in the seed bank yet; engine adds them by mapping a new `KIND`.
- **Layover / Reroute** (Yield / U-Turn) opponent-targeting mechanics — online only.
- **Server-authoritative Checkpoint timing + anti-cheat** (GDD §9) — offline solo is
  client-timed by definition; enforce when the online layer lands.
- **Preset-phrase quick chat** (GDD §7) — partner comms, online only.
- **Landmark Walkthrough** 360° task (GDD §13) — explicitly v2.
- **Content scale-up**: seed pool is 12 countries; GDD §12 targets ~40–50 at launch,
  ~100 long-term (~27 tasks each). Append entries to `countries.js` with the same shape.

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
