-- ============================================================================
-- 63_runtour_guest_streaks.sql — GUESTS on the active-streak leaderboard
-- ============================================================================
-- The owner wants guests included on the Active Streaks list. Guests have no
-- auth.uid(), so they get their own table keyed by a client-generated device id
-- (a persistent random uuid in localStorage), an anon-callable submit RPC, and
-- the board RPC is redefined to UNION signed-in + guest streaks. Guest rows are
-- ANONYMIZED - they always display as "Guest" (no client-supplied name at all,
-- same posture as 37_'s guest season posting), so nothing spoofable is shown.
--
-- Anti-abuse posture (same as the other anon endpoints): no account to
-- rate-limit against, so values are clamped hard - a guest streak caps at 3650
-- (10 years of daily play) vs the signed-in clamp of 100000. A troll can at
-- worst plant a big anonymous "Guest" number; if that happens in practice a
-- per-IP throttle can be layered on later without a schema change.
--
-- NOTE: a player who builds a streak as a guest and then signs in will appear
-- twice for up to ~2 days (their guest row ages out once they stop playing as
-- a guest) - accepted, self-healing.
--
-- Safety: RLS on with NO direct policies (definer-only paths). Return-shape
-- change on runtour_streak_board (adds is_guest) needs a DROP first; deployed
-- clients only read username/current/longest, so the extra column is harmless.
-- Idempotent - safe to re-run. Run AFTER 55_runtour_streak_board.sql.
-- ----------------------------------------------------------------------------

create table if not exists public.runtour_guest_streaks (
  guest_id   uuid primary key,
  current    int not null default 0,
  longest    int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.runtour_guest_streaks enable row level security;
create index if not exists runtour_guest_streaks_current_idx
  on public.runtour_guest_streaks(current desc, updated_at desc);

-- ---- guest submit (anon-callable; upsert per device id; longest only grows) ----
create or replace function public.runtour_streak_submit_guest(p_guest uuid, p_current int, p_longest int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_guest is null then return; end if;
  p_current := greatest(0, least(coalesce(p_current,0), 3650));
  p_longest := greatest(0, least(coalesce(p_longest,0), 3650));
  insert into public.runtour_guest_streaks(guest_id, current, longest, updated_at)
    values (p_guest, p_current, greatest(p_current, p_longest), now())
  on conflict (guest_id) do update set
    current    = excluded.current,
    longest    = greatest(public.runtour_guest_streaks.longest, excluded.longest),
    updated_at = now();
end; $$;
grant execute on function public.runtour_streak_submit_guest(uuid,int,int) to anon, authenticated;

-- ---- the public board: ACTIVE streaks (~2 days), signed-in + guests unioned ----
drop function if exists public.runtour_streak_board(int);
create function public.runtour_streak_board(p_limit int default 100)
returns table(username text, current int, longest int, is_guest boolean)
language sql security definer set search_path = public as $$
  select t.username, t.current, t.longest, t.is_guest from (
    select coalesce(p.username, 'Golfer') as username, s.current, s.longest,
           false as is_guest, s.updated_at
    from public.runtour_streaks s
    left join public.profiles p on p.id = s.user_id
    where s.current > 0 and s.updated_at > now() - interval '2 days'
    union all
    select 'Guest' as username, g.current, g.longest, true as is_guest, g.updated_at
    from public.runtour_guest_streaks g
    where g.current > 0 and g.updated_at > now() - interval '2 days'
  ) t
  order by t.current desc, t.longest desc, t.updated_at desc
  limit greatest(1, least(coalesce(p_limit,100), 500));
$$;
grant execute on function public.runtour_streak_board(int) to anon, authenticated;
