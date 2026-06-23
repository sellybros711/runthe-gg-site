# Online Head-to-Head (H2H) — Plan

Add an **online** option inside Friendlies: when a player taps Friendlies they choose
**"Random Opponent (Online)"** or **"Challenge a Friend"** (the existing link flow).
Random opponents are matched live where possible, with a **ghost-squad fallback**
when nobody else is queued.

## The core insight that makes this cheap
A match is **simulated client-side and is fully determined by `(squadA, squadB, seed)`**.
So to have two people "watch the same game together," we **don't stream the match** —
we only sync the *inputs* (both squads + one shared seed + a start time). Each client
runs the identical deterministic sim locally and sees the identical scoreline.

Two big consequences:
- **No netcode for playback.** Just sync ~3 values.
- **Disconnects don't break the match.** Once you have the opponent's squad + seed, your
  client can finish the whole sim alone — if they drop mid-watch, you still see the real result.

## Prerequisites (must land first)

### P0a — Deterministic sim (the only real engineering)
Today the match sim calls `Math.random()` ~23× (scoreline variance, group advance, extra
time, penalties, goal minutes/scorers). For both players to see the same match, thread a
**seeded RNG** (reuse `mulberry32(hashStr(seed))`) through the match/tournament sim and
replace those `Math.random()` calls with `rng()`. Contained to ~one region of the file.
Bonus: makes Daily/Friendly outcomes reproducible too.

### P0b — Squad-legitimacy hardening
Online ladder + ghost pool must be clean, so the `submit_draft` "hand-picked XI" exploit
(see `supabase/audit_suspicious.sql`) has to be closed before launch — otherwise the online
record/ELO inherits it.

## Data model (new)
- `mm_queue(user_id, squad jsonb, rating int, draft_type, mode, enqueued_at)` — RLS, RPC-only.
- `h2h_matches(id, player_a, player_b nullable, squad_a jsonb, squad_b jsonb, seed bigint,
   is_ghost bool, state text /*pending|ready|done*/, winner text, score_a int, score_b int,
   start_at timestamptz, created_at)`.
- `ghost_squads(id, squad jsonb, rating int, source_draft_id)` — backfilled from real, validated
  drafts (varied ratings) so there's always an instant opponent.
- profiles: `online_rating int default 1200, online_wins int default 0, online_losses int default 0`.

## Matchmaking (atomic, race-safe)
A SECURITY DEFINER RPC `find_match(p_squad, p_filters)`:
1. `SELECT ... FOR UPDATE SKIP LOCKED` a compatible waiting opponent in `mm_queue`.
2. If found → pop them, create `h2h_matches` row (both squads, random `seed`,
   `start_at = now()+3s`, state='ready'), return `match_id`.
3. If none → insert me into `mm_queue`, return `{queued:true}`; I subscribe and wait.
4. Client-side timeout (~8–12s) → call `resolve_with_ghost()` → match vs a rating-matched
   `ghost_squads` row, `is_ghost=true`.

The *waiting* player learns they were matched via **Supabase Realtime** (subscribe to
`h2h_matches` rows where they're a participant, or to their `mm_queue` entry).

## Live synchronized viewing
- Both clients receive the match row (squads + seed + `start_at`).
- Each seeds the deterministic sim and begins animating at `start_at` (synced to server time)
  → both watch the same goals at ~the same moment.
- Result is identical on both ends; recorded once via an idempotent `report_h2h_result` RPC
  (server can even re-derive it from seed+squads to verify — zero trust in the client number).

## Result, ranking, profile
- Win/Loss/streak on the profile; an **Online** leaderboard.
- **ELO** (phase 3): `report_h2h_result` adjusts both ratings; used for skill-based matching.
- New achievements fit the existing system (e.g., "Online Ace" — win N online matches;
  "Giant Slayer" — beat a higher-rated squad).
- **Ghost matches**: count for fun/record but **not for ELO** (so you can't farm ghosts).

## Phasing & effort
- **P0** Deterministic sim + submit_draft hardening — ~2–3 days.
- **P1** Friendlies fork UI + Ghost mode (async, solo viewing, record W/L) — ~2–3 days.
  Ships the whole loop fast; "live" is additive.
- **P2** Live matchmaking: `mm_queue` + atomic match RPC + Realtime + synced start +
  disconnect handling — ~3–5 days.
- **P3** ELO, online leaderboard, rematch, skill matching, "X online" presence, polish — ongoing.

Polished live H2H end-to-end: **~2–3 weeks.**

## Open decisions (need your call)
1. **Ranked vs casual:** does online H2H affect a visible ELO/rank, or just W/L for now?
2. **Ghost wins:** count toward record? (recommend yes for record, no for ELO).
3. **Queue timeout** before falling back to a ghost: ~10s feels right — too long is dead air.
4. **Filters:** match across all draft types/difficulties, or only like-vs-like (Quick-vs-Quick)?
5. **Draft step:** do both players draft *then* match (current friendly flow), or match first
   then both draft simultaneously with a timer (more "live", more complex)?
6. **Rematch:** offer instant rematch vs the same opponent after a live game?
