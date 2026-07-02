# Build a Golfer — Online Mode Plan (DESIGN ONLY — do not build/deploy yet)

> Status: **parked**. This is a design to execute *after* the owners give an
> explicit deploy go-ahead (see CLAUDE.md guardrails). Nothing here is wired up.
> It models RunThePitch's proven Supabase architecture and leans on the daily
> seeded-RNG work already shipped in the prototype.

## Goal
Let a player build a golfer, run the season, and see **how they did against
everyone else** — a global leaderboard. Two surfaces:
1. **Daily Challenge board** — everyone plays the same seeded wheel that day;
   rank by **net profit** (and a money/FedEx toggle). This is the headline hook.
2. **All-time / free-play board** — optional, rank best builds ever.

## Why this is now low-risk
The prototype's **daily challenge is already deterministic**: a UTC-date seed
fixes the wheel order *and* the sim RNG (`mulberry32`, threaded through `gauss`).
That means:
- Two players with the same picks get the same result — fair contest, no
  "lucky sim" complaints.
- The server can **re-simulate** a submitted build from `{seed, picks}` and
  verify the reported net/money — strong anti-cheat for the daily board. The
  sim is ~760 lines of pure JS that ports to a Supabase Edge Function (Deno)
  almost verbatim.

## Architecture (mirror RunThePitch)
- **Supabase** project (Postgres + Auth + RPC + Edge Functions). Public anon key
  for reads; writes via `SECURITY DEFINER` RPCs only.
- **No framework needed** — same self-contained HTML, add the `@supabase/supabase-js`
  CDN script and a thin client, exactly like RunThePitch `index.html` line ~2508.

### Tables
| Table | Columns (sketch) |
|---|---|
| `profiles` | `id` (auth uid), `username`, `created_at`, `current_streak`, `longest_streak` |
| `daily_results` | `id`, `user_id` (nullable for guests), `seed` (int, UTC day), `name`, `ovr`, `net`, `gross`, `money_rank`, `wins`, `majors`, `best`, `picks` (jsonb: slot→{golfer,skill,value}), `created_at`. **Unique (user_id, seed)** = one entry/day. |
| `seasons` | free-play submissions (optional): same shape minus `seed`. |

### RPCs
- `submit_daily(seed, name, picks, claimed_result jsonb)` →
  server **re-runs the sim** from `seed`+`picks`, ignores `claimed_result`
  except to flag mismatches, inserts the **server-computed** row. Returns the
  player's rank.
- `get_daily_board(seed, metric, window)` → ranked rows (metric: net|money|fedex).
- `get_my_daily(seed)` → the caller's row + rank.
- `set_username(username)` → with the same moderation filter RunThePitch uses
  (`index.html` ~line 8074: normalize + banned-substring check).

### Auth
- **Anonymous-first** (like RunThePitch): a device UUID in localStorage lets
  guests appear on the board immediately. Optional email/Google sign-in to claim
  a username + streaks + cross-device history. Reuse RunThePitch's pending-claim
  pattern (`claim_*` on sign-in).

### One RunThe.GG account for every game (owner request)
Goal: a single account that works across RunThePitch, Build a Golfer, and future
RunThe games — sign in once, play anything.

**Recommended architecture — shared Supabase project / shared auth.**
RunThePitch already has Supabase Auth + a `profiles` table (email + Google
OAuth, `index.html` ~line 5079). The cleanest path is for Build a Golfer to use
the **same Supabase project and the same `profiles`/auth**, and add only
*game-scoped* tables (`bag_daily_results`, etc.). Then:
- A user who signed up in RunThePitch is already signed in here (same JWT /
  session), and vice-versa — true single account, shared username, one streak
  system if desired.
- No data migration or account-linking logic needed; it's one identity.
- Per-game leaderboards live in per-game tables keyed by the shared `user_id`.

Alternative (more isolation, more work): a separate Supabase project per game
with an account-link table mapping the two `user_id`s. Only worth it if the
games must stay fully independent. **Recommendation: shared project.**

**⚠️ Sensitivity / guardrail.** This one is more than "a new backend" — it
**touches the live RunThePitch project** (its auth, its `profiles` table, its
RLS). That is exactly the kind of change the handoff says to stop and ask about.
So this requires, explicitly:
1. Owner go-ahead to deploy Build a Golfer at all, AND
2. Owner go-ahead to point it at the live RunThePitch Supabase project (vs a
   fresh project first, then merge later).
Until both are given, this stays a design only — nothing is wired to the live
project, and the prototype keeps using local-only `career()` storage.

Suggested safe rollout: build Build a Golfer's online board on a **separate
Supabase project first** (zero risk to the live site), prove it out, then — on a
second explicit approval — switch auth to the shared RunThePitch project so the
accounts unify.

## Client integration points (in build-a-golfer.html)
Already-built seams make this small:
- `startDaily()` / `S.dailySeed` — the seed to submit with.
- The daily result object stored at `LS.set('bag_daily', {...})` in `scrSummary`
  is exactly the submit payload (add `picks` = `S.slots`).
- `overlayDailyDone()` → add a "Today's Leaderboard" tab that calls
  `get_daily_board`.
- Title "📅 Daily — Done ✓" → also fetch the player's live rank.
- Replace the local-only `career()` Hall of Fame with a server merge when
  signed in (keep local as the offline fallback).

## Anti-cheat
1. **Server re-sim** of daily submissions (deterministic) — the strong guarantee.
2. Reject results whose `picks` violate draft rules (8 slots, one skill/golfer,
   ratings match roster).
3. Rate-limit + the username moderation filter.
4. Free-play board is softer (no fixed seed) — treat as "for fun", or seed it too.

## Rollout (each step gated on explicit deploy approval)
1. Stand up Supabase project; create tables + RLS (reads public, writes via RPC).
2. Port `simEvent`/`simRound`/`seasonNet` into an Edge Function; add a shared
   `sim.js` the page and the function both import so they can't drift.
3. Add the client: anon device id, `submit_daily` on daily completion, board UI.
4. Add accounts + streaks (optional, second pass).
5. Only then consider linking from the live site / a public URL.

## Cross-game achievements / badges (owner request)
Goal: earn a badge in Build a Golfer, see it on your RunThePitch profile too —
one unified achievement wall across all RunThe games.

**Why it's parked:** badges currently live only in this device's
`localStorage` (`bag_career.badges`). "Show in both games" requires (a) the
shared account/backend above, AND (b) **editing the live RunThePitch app** to
read/display cross-game badges — a change to the live site, gated on sign-off.

**Recommended design (on the shared Supabase project):**
- One `achievements` table: `(user_id, game, badge_id, earned_at)` — `game` is
  `'golf' | 'pitch' | …`, `badge_id` is namespaced (`golf.major`, `pitch.galacticos`).
- On unlock, each game upserts a row via a `grant_badge(game, badge_id)` RPC
  (idempotent). Build a Golfer already computes unlocks in `recordSeason()` —
  just add the RPC call there, keeping the local copy as the offline fallback.
- A shared `get_badges(user_id)` returns every game's badges; each game renders
  the full wall (its own + the others), grouped by game with a small game crest.
- Badge **metadata** (emoji, title, description) can live client-side per game or
  in a small `badge_defs` table so each game can render the others' badges
  without hardcoding them.
- RunThePitch's existing achievements (server-computed via `get_my_stats`) get
  mirrored into the same table so both systems share one source of truth.

**Two approvals needed (same as the account work):** deploy Build a Golfer, and
modify the live RunThePitch app to share the profile + badge wall. Safe first
step: build the achievements table + grant/get RPCs on a **separate** Supabase
project and prove the Build-a-Golfer side; wire RunThePitch in only on a second,
explicit approval.

## Open questions for the owners
- Primary daily metric: **net profit** (recommended — it's the game's point) vs
  gross money vs FedEx points?
- Accounts at launch, or anonymous-only first?
- Host: subpath of runthe.gg vs own domain (still TBD per handoff §6).
