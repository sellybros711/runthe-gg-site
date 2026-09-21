-- ============================================================================
-- 109_fantasy_access.sql : the dev gate for Run The Fantasy League (/fantasy)
-- ============================================================================
-- New and self-contained. It creates one table and two functions and alters
-- nothing that already exists. Idempotent: re-running it does nothing new.
--
-- Run it FIRST, before 110 and 111, because both of those hang every one of
-- their policies off fantasy_is_allowed() defined here.
--
--
-- THIS FILE IS A PERMISSION, NOT A FEATURE FLAG, AND THE DIFFERENCE IS THE
-- WHOLE REASON IT EXISTS
-- ---------------------------------------------------------------------------
-- This repo already has three access files: football/dynasty-access.js,
-- football/fullteam-access.js and cfb/commish/access.js. Every one of them
-- carries a header saying, in as many words, THIS IS A FEATURE FLAG AND NOT A
-- PERMISSION: the list ships inside the page, anybody can read it in the
-- console, and anybody who wants to bother can forge their way past it. That
-- is fine for hiding an unannounced game mode.
--
-- It is NOT fine here. /fantasy is an unreleased product, and the failure this
-- guards against is not somebody playing a mode early. It is somebody finding
-- out the product exists. So the list lives in the database, the rows are
-- unreadable to anybody not on it, and the page cannot decide the answer for
-- itself.
--
-- mythiball/check-posture.mjs states the same distinction from the other side:
-- "Unlisted is the whole of the gate. It is not access control: anyone with
-- the URL is in, and if the game ever needs a real gate it needs a real one
-- rather than a quiet path." This is that real one. The noindex meta and the
-- absent sitemap entry still ship, because two cheap layers beat one, but they
-- are the second layer and this is the first.
--
--
-- IT FAILS CLOSED, WHICH IS BACKWARDS FROM EVERY OTHER GATE ON THIS SITE
-- ---------------------------------------------------------------------------
-- Worth reading before anybody "fixes" it into consistency with its
-- neighbours. clock.js, board.js, cloudsave.js and all four daily meters fail
-- OPEN on purpose, and the argument for that is written at length in
-- cfb/commish/clock.js: a wrongly granted season costs a fraction of one sale,
-- and a wrongly refused one costs a player who was engaged enough to come
-- back.
--
-- The costs here are not symmetric in that direction. A wrongly refused
-- teammate presses reload. A wrongly admitted stranger cannot be un-shown what
-- they saw. So an unreachable database, a migration that was never pasted, a
-- request that times out and a row that is simply absent all resolve to the
-- same answer, which is no. fantasy/gate.js carries the same note at the point
-- where it renders the 404.
--
--
-- WHAT A STRANGER CAN LEARN FROM THIS TABLE
-- ---------------------------------------------------------------------------
-- Nothing, and that is asserted in supabase/test/fantasy_rls_test.sql rather
-- than assumed. The anon key is published in the source of every game on this
-- site, so "not linked" protects nothing at the database layer and the RLS has
-- to carry it alone:
--
--   * anon, no session          reads zero rows (auth.uid() is null)
--   * signed in, not on it      reads zero rows (no row matches their uid)
--   * signed in, on it          reads exactly their own row
--
-- Nobody, including a member, can see WHO ELSE is on the list or HOW MANY
-- people are. A member reading their own row is the whole read surface, and it
-- is there because that read IS the membership check the page makes.
--
-- There is no insert, update or delete policy at all, so the table is
-- writable only by the service role (the Supabase SQL editor, and the hot-path
-- Worker, which holds the service key). Adding somebody is a deliberate act by
-- somebody with the keys, which is what an allowlist is for.
-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------
create table if not exists public.fantasy_access_allowlist (
  -- Keyed on the auth user rather than on a username, and the reason is
  -- written up in cfb/commish/access.js: a username is what somebody typed on
  -- the leaderboard, and an account that signed in with Google and never chose
  -- a name has no username at all. The uuid exists from the moment the account
  -- does. The seed block at the bottom resolves names to uuids once, here,
  -- rather than teaching every reader to do it.
  user_id    uuid primary key references auth.users(id) on delete cascade,
  -- Required by the brief and genuinely load-bearing: a list of bare uuids is
  -- unreadable six months from now, and the question anybody asks of this
  -- table is "who is this and why are they on it".
  note       text not null default '',
  added_at   timestamptz not null default now()
);

alter table public.fantasy_access_allowlist enable row level security;
-- FORCE as well as ENABLE, and the two are not the same thing. ENABLE applies
-- the policy to ordinary roles; the table's OWNER skips it unless forced. So
-- without this line a query run as the owning role answers every row, and any
-- test written as the owner would certify a rule the real client never meets.
--
-- Missed on the first draft. 110 and 111 both had it and the allowlist, which
-- is the most sensitive table of the thirteen, did not.
-- supabase/test/fantasy_preflight.sql caught it, and the RLS test structurally
-- could not: that file runs as anon and authenticated, so it never touches the
-- owner path at all. Two checkers, two blind spots, and they do not overlap.
alter table public.fantasy_access_allowlist force row level security;

-- A member may read their OWN row and nothing else. This single policy is both
-- halves of the gate: it is what lets the page ask "am I allowed", and it is
-- what stops everybody else learning anything. See the header.
drop policy if exists fantasy_allowlist_read_self on public.fantasy_access_allowlist;
create policy fantasy_allowlist_read_self on public.fantasy_access_allowlist
  for select using (user_id = auth.uid());

-- Deliberately no insert, update or delete policy. Do not add one.

-- A POLICY WITHOUT A GRANT IS A LOCKED DOOR IN A WALL WITH NO DOORWAY, and the
-- first draft of this file had exactly that. The two are separate mechanisms
-- and both are required: the grant decides whether a role may look at the
-- table at all, and the policy decides which rows it sees when it does. With
-- the policy alone, an allowlisted member reading their own row got
-- "permission denied for table fantasy_access_allowlist" instead.
--
-- It went unnoticed because fantasy_gate() is SECURITY DEFINER and answered
-- correctly throughout, so the gate worked and only the direct read was
-- broken. supabase/test/fantasy_rls_test.sql caught it, which is what that
-- file is for.
--
-- NOT GRANTED TO ANON, deliberately, and that is the tighter half. An
-- allowlist member is by definition signed in, so the anon role has no
-- business looking at this table even though the policy would answer it
-- nothing anyway. A signed-out reader is refused before RLS is consulted.
grant select on public.fantasy_access_allowlist to authenticated;

-- ---------------------------------------------------------------------------
-- The one question every fantasy_ table asks
-- ---------------------------------------------------------------------------
-- Every policy in 110 and 111 is `using (public.fantasy_is_allowed())`, so the
-- rule lives in one place and a table added later cannot get it subtly wrong.
-- That is the same argument cfb/commish/access.js makes for putting the tester
-- list in one file: a rule written eight times is a rule that drifts.
--
-- SECURITY DEFINER so it can read the allowlist regardless of the caller's own
-- RLS view of it. It is safe because it takes no argument and can only ever
-- ask about auth.uid(), so there is no input a caller could use to ask about
-- somebody else.
--
-- STABLE rather than VOLATILE so the planner may call it once per statement
-- instead of once per row. On a policy over a table with a million odds
-- snapshots in it that is the difference between a query and a timeout.
create or replace function public.fantasy_is_allowed()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.fantasy_access_allowlist where user_id = auth.uid()
  );
$$;

revoke all on function public.fantasy_is_allowed() from public;
-- Granted to anon as well as authenticated, deliberately. auth.uid() is null
-- for anon so the answer is always false, and a clean false is easier for the
-- page to handle than a permission error it would have to tell apart from a
-- network failure. Both end at the 404 either way.
grant execute on function public.fantasy_is_allowed() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- What the page actually calls
-- ---------------------------------------------------------------------------
-- The page could select from the allowlist directly and count the rows, and
-- the first draft did. This is better for one reason: a select that returns
-- zero rows and a select that FAILED both come back looking like "no rows" to
-- a client that is not careful, and the careless version of that check is the
-- one somebody writes at 1am. A function returns an explicit boolean or it
-- raises, and gate.js treats a raise as a no.
--
-- It answers about the CALLER and takes no argument, so there is no version of
-- this that can be pointed at somebody else's account.
create or replace function public.fantasy_gate()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.fantasy_is_allowed();
$$;

revoke all on function public.fantasy_gate() from public;
grant execute on function public.fantasy_gate() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------
-- Resolved from usernames because that is what a person knows about their own
-- account. profiles.username is citext, so the comparison is already
-- case-insensitive and the "exact-case match silently misses them" trap that
-- 72_comp_passes.sql wrote up does not apply. It is written through lower()
-- anyway, so it stays correct if that column type ever changes.
--
-- IT REPORTS WHAT IT DID, and that is not decoration. A username that matches
-- nothing inserts nothing and raises no error, so without the notice the only
-- symptom of a typo is a teammate seeing a 404 and telling you the site is
-- broken. That is the same class as the Commish tester list whose first
-- version held a username guessed from an email address and matched nobody.
insert into public.fantasy_access_allowlist (user_id, note)
select p.id, 'dev access, seeded by 109_fantasy_access.sql'
  from public.profiles p
 where lower(p.username::text) in ('malikwillislover', 'runnyj')
    on conflict (user_id) do nothing;

do $$
declare
  wanted text[] := array['malikwillislover', 'runnyj'];
  n      int;
  missing text;
begin
  select count(*) into n from public.fantasy_access_allowlist;
  raise notice 'fantasy_access_allowlist now holds % row(s).', n;

  select string_agg(w, ', ') into missing
    from unnest(wanted) w
   where not exists (
     select 1 from public.profiles p
      where lower(p.username::text) = w
   );

  if missing is not null then
    raise warning 'no profile found for: %. That account will get the 404. Check the spelling on the leaderboard, or add the row by uuid.', missing;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Adding somebody later
-- ---------------------------------------------------------------------------
-- By username:
--
--   insert into public.fantasy_access_allowlist (user_id, note)
--   select id, 'why they are here' from public.profiles
--    where lower(username::text) = 'thename'
--       on conflict (user_id) do nothing;
--
-- By uuid, for an account that never chose a username:
--
--   insert into public.fantasy_access_allowlist (user_id, note)
--   values ('00000000-0000-0000-0000-000000000000', 'why they are here')
--       on conflict (user_id) do nothing;
--
-- Removing somebody is a delete, and it takes effect on their next page load.
-- Nothing is cached anywhere that would keep them in.
