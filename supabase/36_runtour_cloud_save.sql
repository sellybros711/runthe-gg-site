-- ============================================================================
-- 36_runtour_cloud_save.sql — full profile cloud save (career saves, tokens, streaks, stats)
-- ============================================================================
-- Owner's ask, after the daily-attempt fix (35_runtour_daily_attempts.sql): "This should apply to
-- everything... your profile should look the same everywhere no matter what browser you are in. Saved
-- careers, stats, etc."
--
-- Prior state: only the public leaderboard rows, daily-challenge scores, course records, and (as of 35)
-- daily-attempt counts lived on the server. Everything else — the actual in-progress/finished career save,
-- Legend Tokens earned, the daily streak, Wordle-style daily stats, achievement unlocks, and Monthly
-- Spotlight progress — lived ONLY in this browser's localStorage. Signing into the same account on a
-- different browser/device showed none of it. (A narrower, single-purpose sync for lifetime badge/tee-tier
-- progress already existed via runtour_save_stats/runtour_my_stats — this generalizes the same idea to
-- cover everything else instead of adding yet another one-off table per data type.)
--
-- Design: ONE JSONB blob per account, containing a client-assembled bundle of the "your profile" pieces
-- (career save, lifetime stats, legend tokens, streak, daily stats, achievements, spotlight — deliberately
-- NOT device/UI preferences like autosim or dark mode, which aren't "your profile"). Conflict resolution is
-- timestamp last-write-wins: the client stamps every push with its own Date.now(), and the push is REJECTED
-- (not silently accepted) if a newer save already exists server-side — the same "only write if it's actually
-- better/newer" guard pattern already used in 24_runtour_daily.sql and 35_runtour_daily_attempts.sql. This
-- stops a stale, laggy device from clobbering a newer save pushed from somewhere else.
--
-- Idempotent: safe to re-run. Apply in the Supabase SQL editor.
-- ----------------------------------------------------------------------------

create table if not exists public.runtour_cloud_save (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  client_ts  bigint not null default 0,     -- the pushing device's Date.now() at save time
  updated_at timestamptz not null default now()
);

-- RLS on with NO policies: nobody can read or write this table directly from any role, including its
-- own owner. Every access goes through the SECURITY DEFINER functions below, which run as the table
-- owner and only ever touch the calling user's own (auth.uid()) row — never anyone else's.
alter table public.runtour_cloud_save enable row level security;

-- ---------------------------------------------------------------------------
-- push (upsert) the caller's profile bundle. Returns true if it was actually saved, false if a NEWER
-- client_ts already exists server-side (the push was rejected, not applied) — the client should treat
-- false as "pull the current server copy instead of trusting what I just tried to send."
-- ---------------------------------------------------------------------------
create or replace function public.runtour_cloud_save_push(p_data jsonb, p_client_ts bigint)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid    := auth.uid();
  v_ts  bigint  := coalesce(p_client_ts, 0);
  v_ok  boolean;
begin
  if v_uid is null then raise exception 'sign in to sync your profile'; end if;
  if p_data is null then raise exception 'no data to save'; end if;
  -- defensive anti-abuse cap (a real profile bundle is a few KB to maybe a couple hundred KB across a
  -- long career; this is nowhere near a normal payload, just a backstop against a malformed/huge blob)
  if pg_column_size(p_data) > 2000000 then raise exception 'save payload too large'; end if;

  insert into public.runtour_cloud_save(user_id, data, client_ts, updated_at)
  values (v_uid, p_data, v_ts, now())
  on conflict (user_id) do update
    set data = p_data, client_ts = v_ts, updated_at = now()
    where v_ts >= public.runtour_cloud_save.client_ts
  returning true into v_ok;

  return coalesce(v_ok, false);
end; $$;

-- ---------------------------------------------------------------------------
-- pull the caller's current server-side profile bundle (null data / 0 client_ts if never saved yet).
-- ---------------------------------------------------------------------------
create or replace function public.runtour_cloud_save_pull()
returns table(data jsonb, client_ts bigint)
language sql stable security definer set search_path = public as $$
  select data, client_ts from public.runtour_cloud_save where user_id = auth.uid();
$$;

grant execute on function public.runtour_cloud_save_push(jsonb,bigint) to authenticated;
grant execute on function public.runtour_cloud_save_pull()             to authenticated;
