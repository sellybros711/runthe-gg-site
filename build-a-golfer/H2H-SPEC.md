# RunTheTour — Online Multiplayer Spec (Head-to-Head + Foursomes)

Status: **approved design, Phase 1 in progress.** Owner-confirmed decisions below.

## Concept
Real-time multiplayer where each player drafts their own golfer and everyone watches
their rounds play out simultaneously. Works cheaply because the sim is **deterministic**:
`skills + course + conditions + seed → identical round`. We sync only the seed, each
player's draft, and a synced "start"; every client then runs the same sim locally in
lockstep. The **official result is recomputed** from skills+seed (via client consensus in
Phase 1, an edge-function re-sim later), so visuals can't be cheated.

## Modes (owner-confirmed)
| Mode | Players | Teams | Wheel | Scoring | Record updated |
|---|---|---|---|---|---|
| **1v1** | 2 | — | independent | low total wins | `1v1` W/L |
| **Best Ball** | 4 | 2×2 random | independent | each hole = team's *better* ball; low team total | `bestball` W/L (both partners) |
| **Scramble** | 4 | 2×2 random | independent | team plays ONE combined golfer (per-skill = max of the two partners), low total | `scramble` W/L (both partners) |
| **Free-for-All** | 4 | — | independent | lowest individual total | `ffa` W/L |

Confirmed rules:
- **Wheels are independent for every player in every mode**; each player gets **3 re-spins**
  (vs the base 2). The extra re-spin is the fairness lever that offsets not sharing a wheel.
- **Shared across all players:** course, conditions, and the round/match seed (same hole,
  same wind). Only the *draft wheel* differs.
- **Length:** host picks **9 or 18** holes per match.
- **Records:** **separate W/L ladder per mode.** No ELO yet (Phase 3). In 2v2, both
  teammates get the same W or L on their personal per-mode record (no separate "duo" entity).
- **Teams:** assigned **randomly** ("flip a tee").
- **Scramble model:** the team's combined golfer's each skill = `max(partnerA, partnerB)`.
- **Free-for-All:** 1st place = Win, everyone else = Loss.
- **Ties:** sudden-death playoff hole(s) until decided.
- **No wagering yet** (currency is a separate future discussion).

## Course/conditions derivation
Course + conditions are a **pure function of the match `seed`** (e.g.
`course = DAILY_KEYS[hash(seed) % N]`, conditions from another hash), computed identically
on every client. The server stores only `seed`, so no player can pick a favorable course
and the catalog stays entirely client-side.

## Data model (Supabase Postgres)
- **`h2h_matches`** — `id, mode, holes, seed, join_code, is_public, capacity,
  status(lobby→drafting→live→done|void), created_by, created_at, draft_deadline,
  resolved_at, result jsonb`
- **`h2h_players`** — `id, match_id, user_id, username, slot(0..cap-1), team(0|1|null),
  wheel_seed, draft jsonb, submitted_at, reported_result jsonb`
- **`h2h_records`** — `user_id, mode, wins, losses, ties, streak, best_streak` (PK user+mode)
- **`h2h_queue`** — `user_id (PK), mode, holes, enqueued_at` (Quick-Match)

RLS on; all writes go through SECURITY DEFINER RPCs. Drafts are only readable by opponents
once `status` ∈ (`live`,`done`).

## RPCs
- `h2h_create(mode, holes, is_public)` → new lobby + `join_code`; inserts creator as slot 0.
- `h2h_join(join_code)` → take the next free slot (own wheel_seed); auto-flips to `drafting`
  (with a draft deadline + random teams for 2v2) when the room fills.
- `h2h_quick(mode, holes)` → atomically join an open public lobby of that mode/holes
  (`FOR UPDATE SKIP LOCKED`) or create one and wait.
- `h2h_submit_draft(match_id, skills, look)` → stores your draft (sanity-clamped); flips to
  `live` when all submitted.
- `h2h_state(match_id)` → match + players; opponents' drafts hidden until `live`.
- `h2h_report(match_id, result)` → stores your computed result; on **consensus** resolves
  the match once (status→done, official result, per-mode W/L records updated); disagreement
  → `void` + rematch.

## Realtime protocol (Supabase Realtime, channel `h2h:{id}`)
- Presence: who's connected. Broadcast: `player_joined`, `teams_set`, `draft_go`
  (deadline), `player_ready` (slot N submitted, not the draft), `watch_start`
  (shared `start_at` wall-clock ~2s out), `resolved`. (Emotes/taunts = Phase 3.)
- Disconnect-proof: any connected client holds all drafts, so the round always finishes and
  resolves; a draft-phase no-show forfeits.

## Screens
1. Multiplayer home — mode + length → Play with friends (create/enter code) or Quick Match.
2. Lobby — players filling in, teams shown once flipped, host Start.
3. Draft — timed, your own wheel, 3 re-spins.
4. Watch — 2 or 4 golfers in lockstep; team columns + live tally.
5. Result — winner, scorecards, share card, Rematch.
6. Leaderboards — a W/L table per mode + your records + head-to-head vs opponents.

## Phasing
- **Phase 1 — 1v1 (MVP):** friend-invite + Quick-Match, independent wheels/3 re-spins, 9/18,
  lockstep watch, consensus resolve, `1v1` W/L record + leaderboard, share card, rematch.
- **Phase 2 — Foursomes:** rooms of 4, random teams, Best Ball + Scramble + FFA, per-mode
  records + leaderboards, host-start.
- **Phase 3 — depth:** ELO/tiers/seasons, rivalry cards, emotes/spectate, tournaments,
  partner-coordinated drafting, currency/wagering.

## Known Phase-1 integrity gaps (hardened later)
- Draft legality (picks must match the seeded wheel, ≤3 re-spins) is only lightly sanity-
  checked in Phase 1; full wheel-replay verification or an edge-function re-sim comes in
  Phase 2/3. Consensus + OVR clamp bound the damage meanwhile.
- Result is trusted via 2-client consensus (deterministic), not yet server-re-simulated.
