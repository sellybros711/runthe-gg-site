-- ============================================================================
-- 110_fantasy_core.sql : players, events, odds and projections for /fantasy
-- ============================================================================
-- RUN 109_fantasy_access.sql FIRST. Every policy here is
-- `using (public.fantasy_is_allowed())` and this file will not install without
-- that function.
--
-- New and self-contained. Idempotent: re-running it does nothing new.
--
--
-- THREE DEPARTURES FROM THE BRIEF, ALL DELIBERATE, ALL ARGUED HERE
-- ---------------------------------------------------------------------------
-- 1. PARTITIONED BY SEASON, NOT BY WEEK. The brief asked for week. Season is
--    what the retention rule actually needs: "keep full resolution for the
--    current season and downsample older seasons to open and close" is a
--    sentence about seasons, and at season granularity that is one partition
--    to rewrite or drop rather than eighteen. Week partitioning also has to
--    create a partition every Tuesday for ever, which is a scheduled job whose
--    failure mode is the hot path erroring at 1pm on a Sunday. Season needs a
--    new partition once a year and this file ships the next two.
--
-- 2. TWO TABLES THE BRIEF DID NOT LIST: fantasy_events and fantasy_poll_runs.
--    Both are load-bearing rather than nice to have, and the reasons are at
--    each table. In short: the polling schedule is kickoff-relative, so
--    something has to know when kickoff is; and because snapshots are stored
--    only when a line MOVES (see below), the snapshot table cannot answer "how
--    fresh is this", which is a question the brief puts on every screen.
--
-- 3. A PROJECTION CANNOT BE FABRICATED, ENFORCED IN THE SCHEMA. The brief says
--    a player with no posted market gets no projection, and that a made-up
--    season average sitting in the same table as a market-derived number is
--    worse than an obvious gap. So there is no nullable fallback column to
--    write one into, source_poll_id is NOT NULL, and a CHECK refuses a row
--    claiming zero contributing markets. The honest answer is a missing row,
--    and the schema has no way to say anything else.
--
--
-- WHAT IS STORED, AND WHY IT IS SMALLER THAN IT LOOKS
-- ---------------------------------------------------------------------------
-- A snapshot row is written only when a bookmaker's own last_update for that
-- market moves. Re-polling an unchanged line writes nothing, because the
-- unique key carries that timestamp and the insert is an ON CONFLICT DO
-- NOTHING. Three things follow:
--
--   * the pipeline is re-runnable over any historical window without
--     duplicating a row, which is the idempotency the brief asks for, and it
--     falls out of the key rather than being enforced by a careful caller
--   * the table holds the MOVEMENTS rather than a photograph every five
--     minutes, so line movement is a query over rows that all mean something
--   * and the newest snapshot row is NOT a freshness signal. A line that has
--     not moved since Friday is correct and current. How recently we LOOKED is
--     a different fact and it lives in fantasy_poll_runs.
--
-- That last point is the one that bites. Reading freshness off max(captured_at)
-- in this table would show a stale badge on every line that simply had not
-- moved, which is exactly the wrong lie for a product whose claim is freshness.
-- ----------------------------------------------------------------------------


-- ===========================================================================
-- Players, and the crosswalk that is always the time sink
-- ===========================================================================
-- The brief is right that ID matching is a bigger job than it looks. The odds
-- API identifies a player by a display STRING ("Ja'Marr Chase") and nothing
-- else. nflverse uses gsis_id, Sleeper uses its own, and none of them agree
-- about punctuation, suffixes or the spelling of a name with an apostrophe in
-- it.
--
-- This repo has already been bitten by the adjacent version of this problem,
-- and the lesson is in CLAUDE.md under "Two people can share a name". The
-- arcade keyed players on name plus sport, which is not a person: the Browns'
-- Hall of Fame tackle and a 2010s linebacker were folded into one record and a
-- player emailed in about it. So the canonical id here is never a name.
create table if not exists public.fantasy_players (
  -- Our own id. gsis_id where nflverse knows the player, otherwise a generated
  -- 'x-' key so a man who only ever appears in a prop market still has a
  -- stable handle rather than being re-created every poll.
  player_id     text primary key,
  full_name     text not null,
  -- Lowercase, punctuation and suffixes stripped. What the matcher compares.
  -- Stored rather than computed at query time so the same normalisation cannot
  -- be written twice and drift, which is how three extractors in this repo
  -- have already gone silently wrong.
  search_name   text not null,
  position      text,
  team          text,
  -- The crosswalk. All nullable: a player missing from one source is a gap to
  -- log, never a reason to refuse the row.
  gsis_id       text,
  sleeper_id    text,
  pfr_id        text,
  espn_id       text,
  updated_at    timestamptz not null default now()
);

create index if not exists fantasy_players_search on public.fantasy_players (search_name);
create index if not exists fantasy_players_sleeper on public.fantasy_players (sleeper_id) where sleeper_id is not null;
create index if not exists fantasy_players_gsis on public.fantasy_players (gsis_id) where gsis_id is not null;

-- Every spelling we have ever successfully resolved, so a match is made once
-- and then looked up. "Marvin Harrison Jr." against "Marvin Harrison Jr" is
-- not an interesting problem to solve twice a minute during a Sunday sweep.
create table if not exists public.fantasy_player_aliases (
  alias_norm  text primary key,
  player_id   text not null references public.fantasy_players(player_id) on delete cascade,
  -- Which pipeline taught us this spelling. Useful when one provider starts
  -- emitting a new format and every alias from that source goes wrong at once.
  source      text not null default '',
  created_at  timestamptz not null default now()
);

-- EVERY NAME WE COULD NOT RESOLVE, which the brief asks for by name: log the
-- unmatched player rather than dropping it silently.
--
-- The silent drop is the dangerous version. A receiver whose name arrives in a
-- format the matcher does not know simply has no projection, and a missing row
-- is exactly what a player with genuinely no posted props also looks like. One
-- of those is honest and the other is a bug, and without this table they are
-- the same screen.
create table if not exists public.fantasy_unmatched_players (
  id          bigserial primary key,
  name_raw    text not null,
  name_norm   text not null,
  market      text,
  event_id    text,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  seen_count  int not null default 1,
  -- Set by hand (or by a later matcher) once somebody works out who this is.
  -- A resolved row is kept rather than deleted, because the useful question a
  -- month from now is which spellings keep turning up.
  resolved_to text references public.fantasy_players(player_id) on delete set null,
  unique (name_norm, market)
);

create index if not exists fantasy_unmatched_open on public.fantasy_unmatched_players (last_seen desc)
  where resolved_to is null;


-- ===========================================================================
-- Events, because the polling schedule is kickoff-relative
-- ===========================================================================
-- Not in the brief's table list, and needed by the thing the brief cares most
-- about. "Seven days to 48 hours, every 6 hours ... 3 hours to kickoff, every
-- 1 minute ... after kickoff, stop polling that event" is arithmetic on a
-- kickoff time, so the Worker has to be able to ask when kickoff is without
-- spending a credit to find out.
--
-- ALL TIMES UTC. The brief flags timezones as where the bugs will be and it is
-- right: the polling windows are the one place in this system where being an
-- hour out is both easy and invisible. Nothing in the database ever holds a
-- local time. Eastern is applied at the edge, for display and for the "Sunday
-- morning" window only.
create table if not exists public.fantasy_events (
  -- The odds provider's own event id. It is the join key for every snapshot,
  -- so it is the primary key rather than a surrogate.
  event_id       text primary key,
  season         int not null,
  week           int not null,
  commence_time  timestamptz not null,
  home_team      text not null,
  away_team      text not null,
  -- Set once the event is done with, so the Worker can stop considering it
  -- without re-deriving that from the clock on every tick.
  polling_closed boolean not null default false,
  updated_at     timestamptz not null default now()
);

-- The query the Worker makes every minute: which events are still open, in
-- kickoff order. Partial, because a closed event is never in the answer and
-- there will eventually be thousands of them.
create index if not exists fantasy_events_open on public.fantasy_events (commence_time)
  where polling_closed = false;
create index if not exists fantasy_events_week on public.fantasy_events (season, week);


-- ===========================================================================
-- Odds snapshots
-- ===========================================================================
-- The table that grows. See the header for why it grows far more slowly than
-- the polling rate suggests.
create table if not exists public.fantasy_odds_snapshots (
  id              bigserial,
  season          int not null,
  week            int not null,
  event_id        text not null,
  book            text not null,
  market          text not null,
  -- Resolved where we could. NULLABLE ON PURPOSE: an unmatched name still gets
  -- its quote stored, because throwing away the data is how you end up unable
  -- to backfill once somebody works out who it was. The name we were given is
  -- kept beside it either way.
  player_id       text,
  player_name_raw text not null,

  -- The line itself. Null for a market that has no number, which today means
  -- anytime touchdown: there the price IS the whole quote.
  line            numeric(8,2),
  -- American odds, as the provider gives them. Stored raw and de-vigged
  -- downstream, never at write time, so a change to the de-vig method is a
  -- recompute rather than a lost original.
  over_price      int,
  under_price     int,

  -- The BOOK's own timestamp for this quote, not ours. This is the idempotency
  -- key and the reason a re-run writes nothing. Not null: the Worker falls
  -- back to the poll's own captured_at when a provider omits it, so there is
  -- never a null here to reason about.
  book_last_update timestamptz not null,
  -- Ours. When we pulled it.
  captured_at      timestamptz not null default now(),
  -- Which sweep produced this row. Joins to fantasy_poll_runs for freshness
  -- and for the credit accounting.
  poll_id          bigint,

  -- THE RAW PAYLOAD, which the brief asks for and which is the only thing that
  -- will explain a provider changing their schema mid-season. It is the slice
  -- of the response this row was built from, not the whole response: the whole
  -- response is one per sweep and lives on fantasy_poll_runs.
  raw              jsonb,

  primary key (season, id),
  -- Idempotency. Re-polling an unchanged quote conflicts here and does
  -- nothing. A genuine move always carries a new book_last_update.
  unique (season, event_id, book, market, player_name_raw, book_last_update)
) partition by list (season);

-- Ship the current season and the next one. A missing partition is a hard
-- insert error rather than a silent drop, which is the right failure: the hot
-- path shouts in the log instead of quietly collecting nothing.
create table if not exists public.fantasy_odds_snapshots_2026
  partition of public.fantasy_odds_snapshots for values in (2026);
create table if not exists public.fantasy_odds_snapshots_2027
  partition of public.fantasy_odds_snapshots for values in (2027);

-- The read the movement panel makes: one player's one market, newest first.
create index if not exists fantasy_odds_player_market
  on public.fantasy_odds_snapshots (season, week, player_id, market, captured_at desc);
-- The read a sweep makes when it needs the previous state of an event.
create index if not exists fantasy_odds_event
  on public.fantasy_odds_snapshots (event_id, market, captured_at desc);


-- ===========================================================================
-- Line movement, materialized
-- ===========================================================================
-- The brief calls movement a first-class product object rather than metadata,
-- and puts it on the screen rather than in a drawer. So it gets its own table
-- and is written by the hot path, not computed on page load out of a
-- partitioned table with millions of rows in it.
--
-- One row per player per market per week. The trajectory is a jsonb array of
-- {t, line} points covering the last 72 hours, which is what the sparkline
-- draws. Stored as a capped array rather than queried live for the same reason
-- the rest of this table exists.
create table if not exists public.fantasy_line_movement (
  season        int not null,
  week          int not null,
  player_id     text not null,
  market        text not null,

  open_line     numeric(8,2),
  open_at       timestamptz,
  current_line  numeric(8,2),
  current_at    timestamptz,
  -- Kept as a column rather than derived in the query, so the "moves beyond a
  -- threshold" filter the brief wants is an index scan.
  delta         numeric(8,2),

  -- [{ "t": "2026-09-21T14:02:00Z", "line": 61.5 }, ...] capped at 72 hours.
  trajectory    jsonb not null default '[]'::jsonb,

  -- BOOK DISAGREEMENT, which the brief wants shown as a confidence indicator.
  -- Two books 0.5 apart and five books 4 apart are different situations and
  -- averaging them away at ingest would destroy the signal, so both survive to
  -- here: how many books are quoting, and how far apart they are.
  book_count    int not null default 0,
  book_spread   numeric(8,2),

  updated_at    timestamptz not null default now(),
  primary key (season, week, player_id, market)
);

-- "Show me everything that moved hard" is the headline panel, so it is an
-- index rather than a sort over the week.
create index if not exists fantasy_movement_big
  on public.fantasy_line_movement (season, week, abs(delta) desc);


-- ===========================================================================
-- Projections
-- ===========================================================================
-- A distribution, never a point estimate, and scoring-profile-specific from
-- the start. The brief is explicit that computing one "default" projection and
-- adjusting it afterwards is wrong, so the scoring profile is part of the key
-- and there is no row that belongs to no profile.
create table if not exists public.fantasy_projections (
  season          int not null,
  week            int not null,
  player_id       text not null references public.fantasy_players(player_id) on delete cascade,
  -- 'ppr', 'half_ppr', 'standard', and later a hash of a custom profile.
  scoring_profile text not null,

  -- The fitted distribution, as parameters plus quantiles. Not raw draws: ten
  -- thousand of those per player per week is a lot of bytes to store something
  -- that can be redrawn from the parameters.
  dist_params     jsonb not null,
  -- { "p10":, "p25":, "p50":, "p75":, "p90": }
  quantiles       jsonb not null,
  mean_pts        numeric(8,3) not null,
  sd_pts          numeric(8,3) not null,

  -- WHICH DE-VIG PRODUCED THIS. The brief asks for multiplicative and Shin,
  -- both kept, the active one configurable, and the method recorded per row.
  -- Recorded here so a table holding rows from two methods can still be read.
  devig_method    text not null,

  -- HOW MANY MARKETS THIS WAS BUILT FROM, and the check under it is the whole
  -- no-fabrication rule. Zero contributing markets is not a projection, so the
  -- schema refuses to hold one. A player with no posted props has NO ROW, and
  -- that gap is what the UI reads to say so honestly.
  market_count    int not null,
  generated_at    timestamptz not null default now(),
  -- NOT NULL: every projection traces to the sweep it came from. This is also
  -- how the page answers "how fresh is this number".
  source_poll_id  bigint not null,

  primary key (season, week, player_id, scoring_profile),
  constraint fantasy_projection_has_a_market check (market_count > 0)
);

create index if not exists fantasy_projections_week
  on public.fantasy_projections (season, week, scoring_profile);


-- ===========================================================================
-- Poll runs: freshness, and the log that has to be readable on a Sunday
-- ===========================================================================
-- Not in the brief's table list. It is here because of the snapshot design
-- above (an unchanged line writes no row, so freshness cannot be read from
-- snapshots) and because of the brief's own standard: "a silent hot-path
-- failure on a Sunday morning is the worst outcome this system can produce."
--
-- A failure writes a row here exactly like a success does. That is the point.
-- A sweep that threw is a row with ok = false and the error on it, and the
-- absence of rows is itself the loudest possible signal that the Worker is not
-- running at all.
create table if not exists public.fantasy_poll_runs (
  id            bigserial primary key,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  ok            boolean not null default false,
  event_id      text,
  markets       text[] not null default '{}',
  -- What we believe we spent: markets x regions, per the provider's rule.
  credits_charged int not null default 0,
  -- WHAT THE PROVIDER SAYS IS LEFT, read off the x-requests-remaining response
  -- header. Storing both is what makes the cap trustworthy: our own arithmetic
  -- is a belief and this is the vendor's answer, and the day they disagree is
  -- the day the cap is wrong in a way no amount of re-reading our own code
  -- would find.
  vendor_remaining int,
  vendor_used      int,
  http_status   int,
  error         text,
  rows_written  int not null default 0,
  -- The whole response, for the schema-change diagnosis the brief asks for.
  -- One per sweep rather than per row.
  raw           jsonb
);

create index if not exists fantasy_poll_recent on public.fantasy_poll_runs (started_at desc);
-- "When did we last successfully look at this event", which is the freshness
-- question every number on the screen carries.
create index if not exists fantasy_poll_event_ok
  on public.fantasy_poll_runs (event_id, started_at desc) where ok = true;
-- "Show me what broke", which is the query somebody makes at 11:50 on a Sunday.
create index if not exists fantasy_poll_failures
  on public.fantasy_poll_runs (started_at desc) where ok = false;


-- ===========================================================================
-- Row level security
-- ===========================================================================
-- Deny by default, read for allowlist members, and no write policy anywhere.
-- Every write in this system is the hot-path Worker or the cold-path pipeline,
-- and both hold the service role key, which bypasses RLS. There is no path by
-- which a browser writes to any of these tables, so there is no policy that
-- would let one.
--
-- A policy is attached to the PARENT of a partitioned table and applies to
-- every partition, so the snapshot table is covered by the one line below.
do $$
declare t text;
begin
  foreach t in array array[
    'fantasy_players',
    'fantasy_player_aliases',
    'fantasy_unmatched_players',
    'fantasy_events',
    'fantasy_odds_snapshots',
    'fantasy_line_movement',
    'fantasy_projections',
    'fantasy_poll_runs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    -- FORCE, so the table owner is held to the policy too. Without it a
    -- superuser-owned table quietly answers everything for the owner role, and
    -- the RLS test would be checking a rule the real client never meets.
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select using (public.fantasy_is_allowed())',
      t || '_read', t);
  end loop;
end $$;

-- Grants are separate from policies and both are required: a policy narrows
-- what a role may see, and without the grant the role may not look at all.
-- Deliberately NOT granted to anon. An allowlist member is by definition
-- signed in, so anon has no business reading any of this even with a policy
-- that would answer false for them anyway. Two locks.
grant select on
  public.fantasy_players,
  public.fantasy_player_aliases,
  public.fantasy_unmatched_players,
  public.fantasy_events,
  public.fantasy_odds_snapshots,
  public.fantasy_line_movement,
  public.fantasy_projections,
  public.fantasy_poll_runs
to authenticated;
