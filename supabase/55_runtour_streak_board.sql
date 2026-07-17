-- ============================================================================
-- 55_runtour_streak_board.sql — a leaderboard of ACTIVE daily-challenge streaks
-- ============================================================================
-- Stores each account's current + longest daily streak and exposes a public board
-- of ACTIVE streaks (players who have played within the last ~2 days), ranked by
-- current streak length. The client submits its streak on each new daily day and
-- on sign-in; the board is read on the leaderboard's "Streaks" tab.
--
-- Safety: RLS on with NO direct policies, so anon/authenticated can neither read
-- nor write the table directly — the only paths are the two SECURITY DEFINER
-- functions (submit scoped to auth.uid(); board is read-only, username attributed
-- server-side from profiles). Values are clamped. Idempotent — safe to re-run.
-- Apply in the Supabase SQL editor. No dependencies beyond profiles.
-- ----------------------------------------------------------------------------

create table if not exists public.runtour_streaks (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  current    int not null default 0,
  longest    int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.runtour_streaks enable row level security;
create index if not exists runtour_streaks_current_idx on public.runtour_streaks(current desc, updated_at desc);

-- ---- submit the caller's current + longest streak (upsert; longest only grows) ----
create or replace function public.runtour_streak_submit(p_current int, p_longest int)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  p_current := greatest(0, least(coalesce(p_current,0), 100000));
  p_longest := greatest(0, least(coalesce(p_longest,0), 100000));
  insert into public.runtour_streaks(user_id, current, longest, updated_at)
    values (v_uid, p_current, greatest(p_current, p_longest), now())
  on conflict (user_id) do update set
    current    = excluded.current,
    longest    = greatest(public.runtour_streaks.longest, excluded.longest),
    updated_at = now();
end; $$;
grant execute on function public.runtour_streak_submit(int,int) to authenticated;

-- ---- the public board of ACTIVE streaks (played within ~2 days), ranked by current ----
create or replace function public.runtour_streak_board(p_limit int default 100)
returns table(username text, current int, longest int) language sql security definer set search_path = public as $$
  select coalesce(p.username, 'Golfer') as username, s.current, s.longest
  from public.runtour_streaks s
  left join public.profiles p on p.id = s.user_id
  where s.current > 0 and s.updated_at > now() - interval '2 days'
  order by s.current desc, s.longest desc, s.updated_at desc
  limit greatest(1, least(coalesce(p_limit,100), 500));
$$;
grant execute on function public.runtour_streak_board(int) to anon, authenticated;
