-- ---------------------------------------------------------------------------
-- 74_runtour_pro_users.sql  —  who currently holds the Tour Pass (PRO)
--
-- Owner: "I want user names of people with the pro tour pass to be displayed
-- with an animated gold effect."
--
-- The client already knows its OWN pass status (runtour_wallet → pass_active),
-- but nothing told it whether ANOTHER player on a leaderboard holds the pass:
-- tour_pass is RLS'd to the owner, and the board RPCs (season / career / daily /
-- weekly / streaks / course records) don't carry a pro flag.
--
-- Rather than reshape six board functions (each a delicate drop+recreate whose
-- return shape the client has fallbacks for, and two of which are perf-tuned by
-- 61), this exposes ONE tiny read: the set of players holding the CURRENT
-- season's pass. The client caches it for the session and gilds any matching
-- name on every board at once — including boards that only carry a username
-- (the streak board), which an added per-board column could not cover.
--
-- Privacy: this returns exactly what the feature is about to display publicly
-- (a pass holder's username + the id already present in every board row). It
-- exposes NO purchase, amount, wallet balance or email. Read-only, no writes.
--
-- Run AFTER 72_runtour_pass_season.sql. Idempotent; safe to re-run.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- runtour_pro_users()  —  every player holding the CURRENT-season Tour Pass.
--   SECURITY DEFINER so it can read tour_pass (owner-only RLS) and call
--   runtour_pass_season() (not granted to anon) on the caller's behalf.
--   Bounded by a hard LIMIT so it can never become an unbounded scan.
-- ---------------------------------------------------------------------------
create or replace function public.runtour_pro_users()
returns table(user_id uuid, username text)
language sql stable security definer set search_path = public as $$
  select tp.user_id, p.username
  from public.tour_pass tp
  join public.profiles p on p.id = tp.user_id
  where tp.period = (select s.period from public.runtour_pass_season() s)
  limit 5000;
$$;

revoke all on function public.runtour_pro_users() from public;
grant execute on function public.runtour_pro_users() to anon, authenticated;
