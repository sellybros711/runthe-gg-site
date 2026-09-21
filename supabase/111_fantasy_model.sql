-- ============================================================================
-- 111_fantasy_model.sql : priors, team totals, cached sims, and the credit cap
-- ============================================================================
-- RUN 109_fantasy_access.sql FIRST, then 110_fantasy_core.sql.
--
-- New and self-contained. Idempotent: re-running it does nothing new.
--
-- This is the slow half. 110 holds what the market said and what we projected
-- from it; this holds everything the cold path computes overnight and the hot
-- path only ever reads, plus the one piece of accounting that has to be
-- correct or a bug costs real money.
-- ----------------------------------------------------------------------------


-- ===========================================================================
-- The credit cap
-- ===========================================================================
-- The brief asks for a hard cap with a tracked running total, "so a bug cannot
-- burn a month of credits in an afternoon". That is the right instinct and it
-- needs to be enforced somewhere a bug cannot skip, which means here rather
-- than in the Worker that might be the thing with the bug in it.
--
-- TWO NUMBERS, AND THE SECOND ONE IS THE HONEST ONE. credits_used is what WE
-- believe we spent, incremented before each sweep. vendor_remaining is read
-- off the provider's own x-requests-remaining response header. Our arithmetic
-- is a belief about a pricing rule we read in documentation; theirs is the
-- balance. When the two disagree, they are right, and the disagreement is
-- itself the finding: it means the cost model in the Worker is wrong, which is
-- not something any amount of re-reading our own code would ever reveal.
create table if not exists public.fantasy_poll_budget (
  -- First of the month, UTC. The provider's billing period is a calendar
  -- month and this has to agree with it, so it is not a rolling window and
  -- deliberately not one of this site's Eastern calendar days.
  period           date primary key,
  credits_used     int not null default 0,
  credits_cap      int not null,
  vendor_remaining int,
  vendor_used      int,
  updated_at       timestamptz not null default now()
);

-- WHAT THE CAP IS SET TO, AND WHY IT IS THIS NUMBER.
--
-- The free plan is 500 credits a month. 450 leaves fifty for looking at things
-- by hand without the scheduled polling having quietly eaten the lot, which is
-- the state that makes a free tier useless: the allowance is gone and you
-- cannot run one request to find out why.
--
-- MOVING TIER IS THIS ONE NUMBER. Not a code change, not a deploy:
--
--   update public.fantasy_poll_budget set credits_cap = 19000
--    where period = date_trunc('month', now() at time zone 'utc')::date;
--
-- 19000 rather than 20000 on the paid tier, for the same fifty-credit reason
-- scaled up. The polling schedule in the Worker is separate and lives in its
-- own constants; this is the backstop under it, not the plan.
create or replace function public.fantasy_default_cap()
returns int language sql immutable as $$ select 450; $$;

-- ---------------------------------------------------------------------------
-- Atomic check-and-spend
-- ---------------------------------------------------------------------------
-- The Worker calls this BEFORE a sweep and does not send the request if the
-- answer is no. Atomic because two overlapping cron ticks are a thing that
-- happens, and a read-then-write would let both of them pass a cap neither one
-- alone would have broken.
--
-- THE OUT PARAMETER TRAP, WHICH THIS REPO HAS ALREADY PAID FOR ONCE.
-- 102_dynasty_rolling_day.sql wrote `set used = used + 1` inside a function
-- declared RETURNS TABLE (ok, used, ...), so `used` was an OUT parameter,
-- Postgres refused the statement as ambiguous, and it THREW ON EVERY DYNASTY
-- KICKOFF. Nothing said so, because the caller caught and failed open, so a
-- three-a-day budget silently never decremented and nobody noticed until
-- somebody wrote a test for a different migration.
--
-- Two defences here. The OUT names share no spelling with any column
-- (`allowed`, `used_after`, `cap_after`, `left_now` against `credits_used`,
-- `credits_cap`), and every column reference in the DML is table-qualified
-- anyway. Either alone would do. Both, because this one fails silently.
create or replace function public.fantasy_budget_spend(p_credits int)
returns table (allowed boolean, used_after int, cap_after int, left_now int)
language plpgsql security definer set search_path = public as $$
declare
  v_period date := date_trunc('month', now() at time zone 'utc')::date;
  v_used   int;
  v_cap    int;
begin
  if p_credits is null or p_credits < 0 then
    raise exception 'fantasy_budget_spend: refusing a spend of %', p_credits;
  end if;

  insert into public.fantasy_poll_budget (period, credits_used, credits_cap)
  values (v_period, 0, public.fantasy_default_cap())
  on conflict (period) do nothing;

  -- FOR UPDATE is what makes this atomic. Two ticks arriving together
  -- serialise here rather than both reading the same pre-spend total.
  select b.credits_used, b.credits_cap
    into v_used, v_cap
    from public.fantasy_poll_budget b
   where b.period = v_period
     for update;

  if v_used + p_credits > v_cap then
    -- Refused. Nothing is incremented, so a Worker that keeps asking does not
    -- dig the hole deeper.
    return query select false, v_used, v_cap, greatest(v_cap - v_used, 0);
    return;
  end if;

  update public.fantasy_poll_budget b
     set credits_used = b.credits_used + p_credits,
         updated_at   = now()
   where b.period = v_period
  returning b.credits_used, b.credits_cap into v_used, v_cap;

  return query select true, v_used, v_cap, greatest(v_cap - v_used, 0);
end $$;

revoke all on function public.fantasy_budget_spend(int) from public;
-- Service role only. This is a write, and nothing in a browser may move it.
-- The service role bypasses grants entirely, so the absence of a grant here is
-- the statement: no client role can call it.

-- ---------------------------------------------------------------------------
-- Reconciling against the provider
-- ---------------------------------------------------------------------------
-- Called after a sweep with whatever the response headers said. Never lowers
-- our own used count: if we believe we spent more than the vendor says, the
-- higher number is the safer one to keep enforcing against.
create or replace function public.fantasy_budget_observe(p_remaining int, p_used int)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_period date := date_trunc('month', now() at time zone 'utc')::date;
begin
  update public.fantasy_poll_budget b
     set vendor_remaining = coalesce(p_remaining, b.vendor_remaining),
         vendor_used      = coalesce(p_used, b.vendor_used),
         -- Adopt the vendor's count only when it is HIGHER than ours. Lower
         -- means our model over-charges, which is a bug to find rather than a
         -- refund to take, and adopting it would loosen the cap on the
         -- strength of a number we do not yet understand.
         credits_used     = greatest(b.credits_used, coalesce(p_used, 0)),
         updated_at       = now()
   where b.period = v_period;
end $$;

revoke all on function public.fantasy_budget_observe(int, int) from public;

-- A member may READ the budget, because the brief asks for the cap to be
-- observable and because a tool quietly not polling is exactly the thing that
-- should be visible on the screen rather than only in a log.
create or replace function public.fantasy_budget_state()
returns table (period date, credits_used int, credits_cap int,
               vendor_remaining int, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.period, b.credits_used, b.credits_cap, b.vendor_remaining, b.updated_at
    from public.fantasy_poll_budget b
   where public.fantasy_is_allowed()
     and b.period = date_trunc('month', now() at time zone 'utc')::date;
$$;

revoke all on function public.fantasy_budget_state() from public;
grant execute on function public.fantasy_budget_state() to authenticated;


-- ===========================================================================
-- Priors: everything the cold path computes and the hot path only reads
-- ===========================================================================
-- Usage rates, efficiency priors, per-player volatility, team pace, pass rate
-- over expectation, correlation matrices, team strength. One table with a
-- kind, rather than seven tables, because they share every operational
-- property: written nightly by one job, versioned, read by key, never updated
-- in place.
--
-- VERSIONED RATHER THAN OVERWRITTEN, which the brief asks for and which earns
-- its keep the first time a projection looks wrong. A prior set is identified
-- by the run that produced it, so "what did the model believe on the Sunday it
-- got that badly wrong" is answerable. Overwriting makes that question
-- permanently unanswerable and the failure is silent: everything renders.
--
-- CORRELATION LIVES HERE AND NOWHERE ELSE. The brief is emphatic that there is
-- no published academic correlation matrix for NFL fantasy and that anything
-- not estimated in-house is folklore. So there is no constants file with a
-- hardcoded matrix in it anywhere in this feature. A matrix is a prior row
-- with kind = 'correlation', produced by the cold path from our own
-- play-by-play, or it does not exist and the simulation says so.
create table if not exists public.fantasy_priors (
  id           bigserial primary key,
  -- 'usage' | 'efficiency' | 'volatility' | 'correlation' | 'pace'
  -- | 'team_strength' | 'proe'
  kind         text not null,
  -- The cold-path run that produced it. A date, or a git sha when the job
  -- stamps one, so two runs on one day are distinguishable.
  version      text not null,
  season       int not null,
  -- 0 MEANS SEASON-LEVEL rather than null, and that is not a style choice.
  -- Postgres treats nulls as distinct in a unique constraint before 15, so a
  -- nullable week here would let the same season-level prior be inserted
  -- twice with nothing complaining.
  week         int not null default 0,
  -- A player_id, a team code, or '' for a league-wide prior. Same reasoning
  -- as week: '' rather than null so the unique constraint actually holds.
  scope_key    text not null default '',
  payload      jsonb not null,
  generated_at timestamptz not null default now(),
  unique (kind, version, season, week, scope_key)
);

-- The read the projection engine makes: newest version of one kind for one
-- scope. generated_at descending rather than version descending, because a
-- version is a string and string ordering on a git sha means nothing.
create index if not exists fantasy_priors_lookup
  on public.fantasy_priors (kind, season, week, scope_key, generated_at desc);


-- ===========================================================================
-- Market-implied team totals
-- ===========================================================================
-- The brief's answer to strength of schedule, and it is the right one. Prior
-- season points allowed is the trap: NFL defensive performance regresses hard
-- year over year, and there is no evidence prior-season positional SOS
-- predicts anything about fantasy outcomes. A current team total is the
-- market's live read on the same question.
--
-- Derived from the game total and the spread, both of which exist all season
-- for every game, unlike player props which exist for the current week only.
-- That asymmetry is the whole reason the Trade Analyzer leans on this table
-- and Start/Sit barely touches it.
create table if not exists public.fantasy_team_totals (
  season        int not null,
  week          int not null,
  team          text not null,
  event_id      text,
  -- The two the market actually posts.
  game_total    numeric(6,2),
  spread        numeric(6,2),
  -- The one we want: (game_total / 2) - (spread / 2), with spread negative for
  -- a favourite. Stored rather than computed on read so the page and the
  -- simulator cannot derive it two different ways.
  implied_total numeric(6,2),
  captured_at   timestamptz not null default now(),
  primary key (season, week, team)
);

create index if not exists fantasy_team_totals_week
  on public.fantasy_team_totals (season, week);


-- ===========================================================================
-- Cached baseline simulations
-- ===========================================================================
-- The brief's rule, and it is the difference between a tool that works and one
-- that times out: precompute the baseline, cache it, and compute a trade as a
-- PERTURBATION of the cached baseline rather than a second full simulation.
-- Never simulate on page load.
--
-- KEYED ON THE ROSTER STATE, which is what makes the cache correct rather than
-- merely fast. roster_hash covers the rosters, league_hash covers the settings
-- that change the answer (size, scoring, starting requirements), and
-- as_of_week covers the fact that the same roster is a different question in
-- week 4 and week 11. Miss any of those out of the key and the cache returns a
-- confident answer to a question nobody asked, which is worse than a slow one.
create table if not exists public.fantasy_sim_runs (
  id              bigserial primary key,
  -- Stable hash of every roster in the league, including the opponents',
  -- because the brief wants the simulation run against the ACTUAL opposing
  -- rosters rather than a generic field.
  roster_hash     text not null,
  -- Size, scoring profile, starting slots, playoff weeks.
  league_hash     text not null,
  season          int not null,
  as_of_week      int not null,
  scoring_profile text not null,
  n_sims          int not null,

  -- Playoff odds, championship odds, the weekly distribution, the variance
  -- measures, and whatever else the delta needs to perturb against.
  payload         jsonb not null,

  created_at      timestamptz not null default now(),
  -- A baseline goes stale when the market moves under it. The hot path stamps
  -- this so a Sunday morning recompute is a cheap comparison rather than a
  -- judgement call.
  expires_at      timestamptz,

  unique (roster_hash, league_hash, season, as_of_week, scoring_profile)
);

create index if not exists fantasy_sim_fresh
  on public.fantasy_sim_runs (created_at desc);


-- ===========================================================================
-- Row level security
-- ===========================================================================
-- Same posture as 110: deny by default, read for allowlist members, no write
-- policy anywhere, and FORCE so the owner is held to it too.
do $$
declare t text;
begin
  foreach t in array array[
    'fantasy_poll_budget',
    'fantasy_priors',
    'fantasy_team_totals',
    'fantasy_sim_runs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select using (public.fantasy_is_allowed())',
      t || '_read', t);
  end loop;
end $$;

grant select on
  public.fantasy_priors,
  public.fantasy_team_totals,
  public.fantasy_sim_runs
to authenticated;

-- fantasy_poll_budget is deliberately NOT granted, even to authenticated. The
-- cap is readable through fantasy_budget_state(), which answers only for the
-- current period and only for a member. A table grant would also expose every
-- past month, which is billing history rather than product state.
