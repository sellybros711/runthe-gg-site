-- ============================================================================
-- 43_h2h_bots.sql — AI backfill for online matches (early-development cold-start)
-- ============================================================================
-- Quick-Match fills with believable AI players when no human is available, so users
-- always get a game. Bots are NOT real accounts (no auth.users / h2h_players rows) — a
-- bot match is played out entirely client-side; this migration only (a) records the
-- HUMAN's real per-mode W/L for that match and (b) keeps a running record per bot persona
-- so the leaderboard shows a populated, active-looking field.
--
-- Scope / guardrails:
--   * Quick-Match only (private friend rooms stay human-only).
--   * Client-gated behind H2H_BOTS_ENABLED — flip off once there's a real player base.
--   * MUST be disabled (or disclosed) before any real-money/wagering feature ships.
--   * Trust model is the same single-client-trusted posture as the rest of h2h (no server
--     re-sim yet); a client could pad its own record. Acceptable pre-launch, no stakes.
--
-- Idempotent. Apply after 41_h2h_phase1.sql (and 42). SQL editor.
-- ----------------------------------------------------------------------------

-- bot personas' running records (username is the identity; no FK to auth.users)
create table if not exists public.h2h_bots (
  username    text not null,
  mode        text not null,
  wins        int  not null default 0,
  losses      int  not null default 0,
  ties        int  not null default 0,
  streak      int  not null default 0,
  best_streak int  not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (username, mode)
);
alter table public.h2h_bots enable row level security;   -- reached only via SECURITY DEFINER below

-- ---------------------------------------------------------------------------
-- record a completed bot match: bump the caller's real record + each bot's record.
-- p_bots = [{"username":"...","won":true/false}, ...]
-- ---------------------------------------------------------------------------
create or replace function public.h2h_record_bot_match(p_mode text, p_won boolean, p_bots jsonb default '[]'::jsonb)
returns void
language plpgsql security definer set search_path=public as $$
declare rec jsonb; bnm text; bwon boolean;
        v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'sign in'; end if;
  if p_mode not in ('1v1','bestball','scramble','ffa') then raise exception 'bad mode'; end if;

  insert into public.h2h_records(user_id,mode,wins,losses,streak,best_streak,updated_at)
    values (v_uid,p_mode, case when p_won then 1 else 0 end, case when p_won then 0 else 1 end,
            case when p_won then 1 else 0 end, case when p_won then 1 else 0 end, now())
  on conflict (user_id,mode) do update set
    wins   = public.h2h_records.wins   + case when p_won then 1 else 0 end,
    losses = public.h2h_records.losses + case when p_won then 0 else 1 end,
    streak = case when p_won then public.h2h_records.streak + 1 else 0 end,
    best_streak = greatest(public.h2h_records.best_streak, case when p_won then public.h2h_records.streak + 1 else 0 end),
    updated_at = now();

  for rec in select * from jsonb_array_elements(coalesce(p_bots,'[]'::jsonb)) loop
    bnm := left(trim(coalesce(rec->>'username','')),24);
    bwon := coalesce((rec->>'won')::boolean,false);
    if bnm <> '' then
      insert into public.h2h_bots(username,mode,wins,losses,streak,best_streak,updated_at)
        values (bnm,p_mode, case when bwon then 1 else 0 end, case when bwon then 0 else 1 end,
                case when bwon then 1 else 0 end, case when bwon then 1 else 0 end, now())
      on conflict (username,mode) do update set
        wins   = public.h2h_bots.wins   + case when bwon then 1 else 0 end,
        losses = public.h2h_bots.losses + case when bwon then 0 else 1 end,
        streak = case when bwon then public.h2h_bots.streak + 1 else 0 end,
        best_streak = greatest(public.h2h_bots.best_streak, case when bwon then public.h2h_bots.streak + 1 else 0 end),
        updated_at = now();
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- clean up an empty Quick-Match lobby the caller opened, when it converts to bots
-- (so a later human doesn't get stranded joining a lobby nobody will finish).
-- ---------------------------------------------------------------------------
create or replace function public.h2h_abandon(p_match_id bigint)
returns void
language plpgsql security definer set search_path=public as $$
declare v_uid uuid := auth.uid(); m public.h2h_matches; n int;
begin
  if v_uid is null then return; end if;
  select * into m from public.h2h_matches where id=p_match_id for update;
  if m.id is null or m.created_by <> v_uid or m.status <> 'lobby' then return; end if;
  select count(*) into n from public.h2h_players where match_id=p_match_id and user_id <> v_uid;
  if n > 0 then return; end if;   -- someone else is in it, leave it alone
  delete from public.h2h_matches where id=p_match_id;   -- FK-cascades the lone player row
end $$;

-- ---------------------------------------------------------------------------
-- leaderboard now unions real players + bot personas so the board looks populated
-- ---------------------------------------------------------------------------
create or replace function public.h2h_board(p_mode text, p_limit int default 100)
returns table(user_id uuid, username text, wins int, losses int, ties int,
              streak int, best_streak int, games int, win_pct numeric)
language sql stable security definer set search_path=public as $$
  with allrec as (
    select r.user_id, coalesce(pr.username,'—') as username, r.wins, r.losses, r.ties, r.streak, r.best_streak
      from public.h2h_records r left join public.profiles pr on pr.id = r.user_id
     where r.mode = p_mode
    union all
    select null::uuid, b.username, b.wins, b.losses, b.ties, b.streak, b.best_streak
      from public.h2h_bots b where b.mode = p_mode
  )
  select user_id, username, wins, losses, ties, streak, best_streak,
         (wins + losses + ties) as games,
         round(wins::numeric / nullif(wins + losses + ties,0), 3) as win_pct
    from allrec
   where (wins + losses + ties) > 0
   order by wins desc, win_pct desc nulls last, best_streak desc
   limit greatest(1, least(coalesce(p_limit,100), 500));
$$;

grant execute on function public.h2h_record_bot_match(text,boolean,jsonb) to authenticated;
grant execute on function public.h2h_abandon(bigint)                     to authenticated;
grant execute on function public.h2h_board(text,int)                     to anon, authenticated;
