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

## Open questions for the owners
- Primary daily metric: **net profit** (recommended — it's the game's point) vs
  gross money vs FedEx points?
- Accounts at launch, or anonymous-only first?
- Host: subpath of runthe.gg vs own domain (still TBD per handoff §6).
