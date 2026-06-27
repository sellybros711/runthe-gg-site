-- ============================================================================
-- 23_runtour_stats.sql  —  RunTheTour lifetime badge stats (account-transferable)
-- ============================================================================
-- Stores each player's LIFETIME badge metrics so the tee-tier badge collection
-- (Red → Gold → White → Blue → Black) follows the RunThe.GG account across
-- devices instead of living only in that browser's localStorage.
--
-- Like 22_runtour_leaderboard.sql, everything here is namespaced `runtour_*` and
-- is COMPLETELY SEPARATE from the World Cup game (RunThePitch): it does NOT touch
-- `drafts`, `wc_players`, `submit_draft`, the daily tables, `profiles`, or any
-- existing object. One row per user, owned by that user.
--
-- The badge metrics are computed in the browser from the player's own career
-- history, so this is a sync store, not an authority — the same pragmatic stance
-- as the leaderboard. The full metric blob is kept (`lt`) plus the earned-tier
-- baseline (`btier`) and a denormalized `badges` count for cheap display/sorting.
-- The client adopts whichever side shows more progress (higher `badges`).
--
-- Idempotent: safe to re-run. Apply in the Supabase SQL editor.
-- ----------------------------------------------------------------------------

create table if not exists public.runtour_stats (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  lt         jsonb not null default '{}'::jsonb,   -- lifetime metric accumulator
  btier      jsonb not null default '{}'::jsonb,   -- earned tee level per badge id
  badges     int   not null default 0,             -- total tees earned (0..95)
  updated_at timestamptz not null default now()
);

alter table public.runtour_stats enable row level security;

-- Owner-only read; all writes go through the SECURITY DEFINER upsert below.
drop policy if exists runtour_stats_owner_read on public.runtour_stats;
create policy runtour_stats_owner_read on public.runtour_stats
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- upsert this user's lifetime badge stats
-- ---------------------------------------------------------------------------
create or replace function public.runtour_save_stats(
  p_lt     jsonb,
  p_btier  jsonb default '{}'::jsonb,
  p_badges int   default 0
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_b   int  := greatest(0, least(1000, coalesce(p_badges, 0)));
begin
  if v_uid is null then
    raise exception 'sign in to sync stats';
  end if;
  insert into public.runtour_stats(user_id, lt, btier, badges, updated_at)
  values (v_uid, coalesce(p_lt, '{}'::jsonb), coalesce(p_btier, '{}'::jsonb), v_b, now())
  on conflict (user_id) do update
    set lt = excluded.lt, btier = excluded.btier, badges = excluded.badges, updated_at = now();
  return v_b;
end;
$$;

-- ---------------------------------------------------------------------------
-- read this user's synced stats (returns one row or none)
-- ---------------------------------------------------------------------------
create or replace function public.runtour_my_stats()
returns table(lt jsonb, btier jsonb, badges int)
language sql security definer set search_path = public as $$
  select lt, btier, badges from public.runtour_stats where user_id = auth.uid();
$$;

revoke all on function public.runtour_save_stats(jsonb, jsonb, int) from public;
revoke all on function public.runtour_my_stats() from public;
grant execute on function public.runtour_save_stats(jsonb, jsonb, int) to authenticated;
grant execute on function public.runtour_my_stats() to authenticated;
