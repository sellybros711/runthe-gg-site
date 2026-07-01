-- ============================================================================
-- 35_runtour_daily_attempts.sql — server-side, cross-device daily-attempt cap
-- ============================================================================
-- Owner report: signed into the same account on a second browser and saw the Daily
-- Challenge behave like a fresh account (course records looked empty there too, but
-- separately). Root cause of the retry exploit: the "3 attempts a day" cap was
-- ENTIRELY client-side (a localStorage counter, `bag_daily`, scoped to the browser).
-- Signing into the same account on a different browser/device — or just clearing
-- storage — gave a brand-new counter and effectively unlimited retries, even though
-- the account itself is server-based (Supabase auth). Nothing before this migration
-- tracked "how many times has THIS ACCOUNT played today" anywhere the server could
-- see or enforce.
--
-- Fix: a dedicated table + a SECURITY DEFINER function that atomically claims one
-- attempt per call, keyed by (user_id, day) — the account, not the browser. The
-- INSERT ... ON CONFLICT DO UPDATE ... WHERE guard is what makes this safe against
-- two devices racing to start an attempt at the same instant: Postgres locks the
-- conflicting row for the duration of the check-and-increment, so only one of two
-- simultaneous calls can ever win the last attempt of the day.
--
-- This is intentionally a SEPARATE table from runtour_daily_scores (24_runtour_daily),
-- which only ever stores the BEST round of the day per user — it has no concept of
-- how many times you tried, and upserting into it on every attempt would be the
-- wrong semantics (a worse attempt must never overwrite a better one, but every
-- attempt, better or worse, must still count against the cap).
--
-- Idempotent: safe to re-run. Apply in the Supabase SQL editor.
-- ----------------------------------------------------------------------------

create table if not exists public.runtour_daily_attempts (
  user_id    uuid not null references auth.users(id) on delete cascade,
  day        int  not null,           -- UTC date as YYYYMMDD, matches runtour_daily_scores.day
  attempts   int  not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- RLS on with NO policies: nobody can read or write this table directly, from any
-- role. Every access goes through the SECURITY DEFINER functions below, which run
-- as the table owner and only ever touch the calling user's own (auth.uid()) row.
alter table public.runtour_daily_attempts enable row level security;

-- ---------------------------------------------------------------------------
-- atomically claim the next attempt for today; raises an exception (no attempts
-- left) rather than returning a sentinel, so a client that forgets to check the
-- error can't accidentally treat a rejected claim as a granted one.
-- ---------------------------------------------------------------------------
create or replace function public.runtour_daily_attempt_start(p_day int, p_max int default 3)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day int  := coalesce(p_day, 0);
  v_max int  := greatest(1, least(20, coalesce(p_max, 3)));
  v_n   int;
begin
  if v_uid is null then raise exception 'sign in to play the daily challenge'; end if;
  insert into public.runtour_daily_attempts(user_id, day, attempts, updated_at)
  values (v_uid, v_day, 1, now())
  on conflict (user_id, day) do update
    set attempts = public.runtour_daily_attempts.attempts + 1, updated_at = now()
    where public.runtour_daily_attempts.attempts < v_max
  returning attempts into v_n;
  if v_n is null then
    raise exception 'no attempts left today';
  end if;
  return v_n;   -- the attempt number just claimed (1-based)
end; $$;

-- ---------------------------------------------------------------------------
-- read-only: how many attempts this account has used today (for display — e.g. so
-- a fresh browser/device shows the true remaining count before starting a round,
-- not just "3 available" until it gets rejected).
-- ---------------------------------------------------------------------------
create or replace function public.runtour_daily_attempts_used(p_day int)
returns int
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select attempts from public.runtour_daily_attempts where user_id = auth.uid() and day = coalesce(p_day, 0)),
    0);
$$;

grant execute on function public.runtour_daily_attempt_start(int,int) to authenticated;
grant execute on function public.runtour_daily_attempts_used(int)     to authenticated;
