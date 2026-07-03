-- ============================================================================
-- 41_h2h_phase1.sql — Online multiplayer (Phase 1: 1v1). See build-a-golfer/H2H-SPEC.md
-- ============================================================================
-- Deterministic-sim multiplayer: each player drafts their own golfer, everyone watches the
-- rounds play out in lockstep, and the official result is confirmed by client consensus.
-- The schema is general (supports the Phase-2 foursome modes: bestball/scramble/ffa); the
-- RPCs below implement the full lifecycle and are correct for 1v1 and ready for 4-player.
--
-- Course + conditions are a pure function of `seed` (computed identically on every client),
-- so the server stores only the seed. Drafts are hidden from opponents until status='live'.
-- Records are updated exactly once, on consensus. RLS on; all access via SECURITY DEFINER.
--
-- Idempotent. Apply in the Supabase SQL editor (after the profiles/accounts migrations).
-- ----------------------------------------------------------------------------

create table if not exists public.h2h_matches (
  id            bigserial primary key,
  mode          text        not null check (mode in ('1v1','bestball','scramble','ffa')),
  holes         int         not null check (holes in (9,18)),
  seed          bigint      not null,
  join_code     text        unique,
  is_public     boolean     not null default false,   -- true = joinable via Quick-Match
  capacity      int         not null check (capacity in (2,4)),
  status        text        not null default 'lobby'
                  check (status in ('lobby','drafting','live','done','void')),
  created_by    uuid        not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  draft_deadline timestamptz,
  resolved_at   timestamptz,
  result        jsonb
);

create table if not exists public.h2h_players (
  id              bigserial primary key,
  match_id        bigint  not null references public.h2h_matches(id) on delete cascade,
  user_id         uuid    not null references auth.users(id) on delete cascade,
  username        text    not null,
  slot            int     not null,
  team            int,                                  -- 0/1 for 2v2, null for 1v1/ffa
  wheel_seed      bigint  not null,                     -- each player's own draft wheel
  draft           jsonb,
  submitted_at    timestamptz,
  reported_result jsonb,
  unique (match_id, user_id),
  unique (match_id, slot)
);

create table if not exists public.h2h_records (
  user_id     uuid not null references auth.users(id) on delete cascade,
  mode        text not null,
  wins        int  not null default 0,
  losses      int  not null default 0,
  ties        int  not null default 0,
  streak      int  not null default 0,
  best_streak int  not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (user_id, mode)
);

create table if not exists public.h2h_queue (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  mode        text not null,
  holes       int  not null,
  enqueued_at timestamptz not null default now()
);

create index if not exists idx_h2h_matches_open  on public.h2h_matches (mode, holes, status) where is_public;
create index if not exists idx_h2h_players_match  on public.h2h_players (match_id);
create index if not exists idx_h2h_players_user   on public.h2h_players (user_id);
create index if not exists idx_h2h_records_mode   on public.h2h_records (mode, wins desc);

alter table public.h2h_matches enable row level security;
alter table public.h2h_players enable row level security;
alter table public.h2h_records enable row level security;
alter table public.h2h_queue   enable row level security;
-- public read of the boards; everything else flows through the definer RPCs below.
drop policy if exists h2h_records_read on public.h2h_records;
create policy h2h_records_read on public.h2h_records for select using (true);

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function public._h2h_seed() returns bigint
language sql volatile as $$ select floor(random()*2147483647)::bigint $$;

create or replace function public._h2h_code() returns text
language plpgsql volatile set search_path=public, extensions as $$
declare c text; begin
  loop
    -- 6 chars, no ambiguous 0/O/1/I
    c := upper(substr(translate(encode(gen_random_bytes(6),'hex'),'01','GH'),1,6));
    exit when not exists (select 1 from h2h_matches where join_code=c);
  end loop;
  return c;
end $$;

create or replace function public._h2h_username(p_uid uuid) returns text
language sql stable set search_path=public as $$
  select username from profiles where id = p_uid
$$;

-- flip a lobby to drafting once it's full: assign random teams for 4-player team modes,
-- set the draft deadline. Called from join/quick when the last slot fills.
create or replace function public._h2h_begin_if_full(p_match_id bigint) returns void
language plpgsql set search_path=public as $$
declare m public.h2h_matches; n int;
begin
  select * into m from public.h2h_matches where id=p_match_id for update;
  if m.status <> 'lobby' then return; end if;
  select count(*) into n from public.h2h_players where match_id=p_match_id;
  if n < m.capacity then return; end if;
  if m.mode in ('bestball','scramble') then
    -- random 2/2 split: two random slots -> team 0, rest -> team 1
    update public.h2h_players set team=0 where id in (
      select id from public.h2h_players where match_id=p_match_id order by random() limit 2);
    update public.h2h_players set team=1 where match_id=p_match_id and team is distinct from 0;
  end if;
  update public.h2h_matches
     set status='drafting', draft_deadline = now() + interval '90 seconds'
   where id=p_match_id;
end $$;

-- ---------------------------------------------------------------------------
-- create a private (friend) or public (quick) lobby, join as slot 0
-- ---------------------------------------------------------------------------
create or replace function public.h2h_create(p_mode text, p_holes int, p_public boolean default false)
returns table(match_id bigint, join_code text)
language plpgsql security definer set search_path=public as $$
declare v_uid uuid := auth.uid(); v_name text; v_cap int; v_id bigint; v_code text;
begin
  if v_uid is null then raise exception 'sign in to play online'; end if;
  v_name := public._h2h_username(v_uid);
  if v_name is null or length(trim(v_name))=0 then raise exception 'set a username on RunThe.GG first'; end if;
  if p_mode not in ('1v1','bestball','scramble','ffa') then raise exception 'bad mode'; end if;
  if p_holes not in (9,18) then raise exception 'bad hole count'; end if;
  v_cap := case when p_mode='1v1' then 2 else 4 end;
  v_code := public._h2h_code();
  insert into public.h2h_matches(mode,holes,seed,join_code,is_public,capacity,created_by)
    values (p_mode,p_holes,public._h2h_seed(),v_code,coalesce(p_public,false),v_cap,v_uid)
    returning id into v_id;
  insert into public.h2h_players(match_id,user_id,username,slot,wheel_seed)
    values (v_id,v_uid,v_name,0,public._h2h_seed());
  return query select v_id, v_code;
end $$;

-- ---------------------------------------------------------------------------
-- join a lobby by code (idempotent if already in it); auto-begins when full
-- ---------------------------------------------------------------------------
create or replace function public.h2h_join(p_join_code text)
returns bigint
language plpgsql security definer set search_path=public as $$
declare v_uid uuid := auth.uid(); v_name text; m public.h2h_matches; v_slot int;
begin
  if v_uid is null then raise exception 'sign in to play online'; end if;
  v_name := public._h2h_username(v_uid);
  if v_name is null then raise exception 'set a username on RunThe.GG first'; end if;
  select * into m from public.h2h_matches where join_code=upper(trim(p_join_code)) for update;
  if m.id is null then raise exception 'no match with that code'; end if;
  if exists (select 1 from public.h2h_players where match_id=m.id and user_id=v_uid) then
    return m.id;   -- already joined
  end if;
  if m.status <> 'lobby' then raise exception 'that match already started'; end if;
  select count(*) into v_slot from public.h2h_players where match_id=m.id;
  if v_slot >= m.capacity then raise exception 'that match is full'; end if;
  insert into public.h2h_players(match_id,user_id,username,slot,wheel_seed)
    values (m.id,v_uid,v_name,v_slot,public._h2h_seed());
  perform public._h2h_begin_if_full(m.id);
  return m.id;
end $$;

-- ---------------------------------------------------------------------------
-- Quick-Match: join the oldest open public lobby of this mode/holes, else create one
-- ---------------------------------------------------------------------------
create or replace function public.h2h_quick(p_mode text, p_holes int)
returns bigint
language plpgsql security definer set search_path=public as $$
declare v_uid uuid := auth.uid(); v_name text; v_cap int; m_id bigint; v_slot int; v_code text; v_new bigint;
begin
  if v_uid is null then raise exception 'sign in to play online'; end if;
  v_name := public._h2h_username(v_uid);
  if v_name is null then raise exception 'set a username on RunThe.GG first'; end if;
  if p_mode not in ('1v1','bestball','scramble','ffa') then raise exception 'bad mode'; end if;
  if p_holes not in (9,18) then raise exception 'bad hole count'; end if;
  v_cap := case when p_mode='1v1' then 2 else 4 end;
  -- claim an open public lobby with a free slot, skipping ones another txn is grabbing
  select id into m_id from public.h2h_matches
    where is_public and status='lobby' and mode=p_mode and holes=p_holes and created_by <> v_uid
      and (select count(*) from public.h2h_players p where p.match_id=h2h_matches.id) < capacity
    order by created_at asc
    for update skip locked
    limit 1;
  if m_id is not null then
    if not exists (select 1 from public.h2h_players where match_id=m_id and user_id=v_uid) then
      select count(*) into v_slot from public.h2h_players where match_id=m_id;
      insert into public.h2h_players(match_id,user_id,username,slot,wheel_seed)
        values (m_id,v_uid,v_name,v_slot,public._h2h_seed());
      perform public._h2h_begin_if_full(m_id);
    end if;
    return m_id;
  end if;
  -- none waiting → open a public lobby and wait
  v_code := public._h2h_code();
  insert into public.h2h_matches(mode,holes,seed,join_code,is_public,capacity,created_by)
    values (p_mode,p_holes,public._h2h_seed(),v_code,true,v_cap,v_uid) returning id into v_new;
  insert into public.h2h_players(match_id,user_id,username,slot,wheel_seed)
    values (v_new,v_uid,v_name,0,public._h2h_seed());
  return v_new;
end $$;

-- ---------------------------------------------------------------------------
-- submit your draft; flips the match to 'live' when everyone has submitted
-- ---------------------------------------------------------------------------
create or replace function public.h2h_submit_draft(p_match_id bigint, p_skills jsonb, p_look jsonb default null)
returns boolean
language plpgsql security definer set search_path=public as $$
declare v_uid uuid := auth.uid(); m public.h2h_matches; n_players int; n_done int;
begin
  if v_uid is null then raise exception 'sign in'; end if;
  select * into m from public.h2h_matches where id=p_match_id for update;
  if m.id is null then raise exception 'no such match'; end if;
  if m.status not in ('drafting') then raise exception 'not drafting'; end if;
  if p_skills is null or jsonb_typeof(p_skills) <> 'object' then raise exception 'bad draft'; end if;
  -- NOTE (Phase 1): light validation only. Full wheel-legality (picks match the seeded wheel,
  -- <=3 re-spins) / OVR clamp is Phase 2 hardening; see H2H-SPEC.md.
  update public.h2h_players
     set draft = jsonb_build_object('skills',p_skills,'look',coalesce(p_look,'{}'::jsonb)),
         submitted_at = now()
   where match_id=p_match_id and user_id=v_uid;
  if not found then raise exception 'you are not in this match'; end if;
  select count(*), count(*) filter (where submitted_at is not null)
    into n_players, n_done from public.h2h_players where match_id=p_match_id;
  if n_players = m.capacity and n_done = m.capacity then
    update public.h2h_matches set status='live' where id=p_match_id and status='drafting';
  end if;
  return (n_done = m.capacity and n_players = m.capacity);
end $$;

-- ---------------------------------------------------------------------------
-- read match state; opponents' drafts are hidden until the round is live/done
-- ---------------------------------------------------------------------------
create or replace function public.h2h_state(p_match_id bigint)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_uid uuid := auth.uid(); m public.h2h_matches; reveal boolean; js jsonb;
begin
  select * into m from public.h2h_matches where id=p_match_id;
  if m.id is null then raise exception 'no such match'; end if;
  reveal := m.status in ('live','done');
  select jsonb_build_object(
    'id',m.id,'mode',m.mode,'holes',m.holes,'seed',m.seed,'join_code',m.join_code,
    'status',m.status,'capacity',m.capacity,'created_by',m.created_by,
    'draft_deadline',m.draft_deadline,'result',m.result,
    'players', coalesce((select jsonb_agg(jsonb_build_object(
        'user_id',p.user_id,'username',p.username,'slot',p.slot,'team',p.team,
        'wheel_seed',p.wheel_seed,'submitted', p.submitted_at is not null,
        -- your own draft always; others' only once revealed
        'draft', case when reveal or p.user_id=v_uid then p.draft else null end
      ) order by p.slot) from public.h2h_players p where p.match_id=m.id), '[]'::jsonb)
  ) into js;
  return js;
end $$;

-- ---------------------------------------------------------------------------
-- report your computed result; on consensus, resolve once + update records.
-- p_result must include the winner: {"win": <slot-or-team int>, "kind":"slot"|"team", ...}
-- ---------------------------------------------------------------------------
create or replace function public.h2h_report(p_match_id bigint, p_result jsonb)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_uid uuid := auth.uid();
  m public.h2h_matches;
  n_players int; n_rep int; n_agree int; v_win int; v_kind text; did_transition int;
  rec record;
begin
  if v_uid is null then raise exception 'sign in'; end if;
  select * into m from public.h2h_matches where id=p_match_id for update;
  if m.id is null then raise exception 'no such match'; end if;
  if m.status = 'done' then return m.result; end if;         -- already resolved
  if m.status <> 'live' then raise exception 'match not live'; end if;
  if p_result is null or (p_result->>'win') is null then raise exception 'bad result'; end if;

  update public.h2h_players set reported_result = p_result
    where match_id=p_match_id and user_id=v_uid;
  if not found then raise exception 'you are not in this match'; end if;

  v_win  := (p_result->>'win')::int;
  v_kind := coalesce(p_result->>'kind', case when m.mode in ('bestball','scramble') then 'team' else 'slot' end);

  -- consensus: everyone reported AND everyone agrees on the winner value
  select count(*),
         count(*) filter (where reported_result is not null),
         count(*) filter (where (reported_result->>'win')::int = v_win)
    into n_players, n_rep, n_agree
    from public.h2h_players where match_id=p_match_id;

  if n_rep < m.capacity or n_players < m.capacity then
    return null;    -- still waiting on the other player(s)
  end if;
  if n_agree < m.capacity then
    update public.h2h_matches set status='void' where id=p_match_id and status='live';
    return jsonb_build_object('void',true);
  end if;

  -- atomically claim the resolve so records update exactly once
  update public.h2h_matches
     set status='done', resolved_at=now(),
         result = jsonb_build_object('win',v_win,'kind',v_kind,'detail',p_result)
   where id=p_match_id and status='live';
  get diagnostics did_transition = row_count;
  if did_transition = 0 then
    select result into p_result from public.h2h_matches where id=p_match_id;   -- lost the race; return official
    return p_result;
  end if;

  -- update every player's per-mode W/L record
  for rec in select user_id, slot, team from public.h2h_players where match_id=p_match_id loop
    declare won boolean;
    begin
      won := case when v_kind='team' then rec.team = v_win else rec.slot = v_win end;
      insert into public.h2h_records(user_id,mode,wins,losses,streak,best_streak,updated_at)
        values (rec.user_id, m.mode, case when won then 1 else 0 end,
                case when won then 0 else 1 end, case when won then 1 else 0 end,
                case when won then 1 else 0 end, now())
      on conflict (user_id,mode) do update set
        wins   = public.h2h_records.wins   + case when won then 1 else 0 end,
        losses = public.h2h_records.losses + case when won then 0 else 1 end,
        streak = case when won then public.h2h_records.streak + 1 else 0 end,
        best_streak = greatest(public.h2h_records.best_streak,
                               case when won then public.h2h_records.streak + 1 else 0 end),
        updated_at = now();
    end;
  end loop;

  return (select result from public.h2h_matches where id=p_match_id);
end $$;

-- ---------------------------------------------------------------------------
-- per-mode W/L leaderboard (public read): join usernames from profiles.
-- ---------------------------------------------------------------------------
create or replace function public.h2h_board(p_mode text, p_limit int default 100)
returns table(user_id uuid, username text, wins int, losses int, ties int,
              streak int, best_streak int, games int, win_pct numeric)
language sql stable security definer set search_path=public as $$
  select r.user_id,
         coalesce(pr.username,'—') as username,
         r.wins, r.losses, r.ties, r.streak, r.best_streak,
         (r.wins + r.losses + r.ties) as games,
         round(r.wins::numeric / nullif(r.wins + r.losses + r.ties,0), 3) as win_pct
    from public.h2h_records r
    left join public.profiles pr on pr.id = r.user_id
   where r.mode = p_mode and (r.wins + r.losses + r.ties) > 0
   order by r.wins desc, win_pct desc nulls last, r.best_streak desc
   limit greatest(1, least(coalesce(p_limit,100), 500));
$$;

grant execute on function public.h2h_board(text,int)                 to anon, authenticated;
grant execute on function public.h2h_create(text,int,boolean)        to authenticated;
grant execute on function public.h2h_join(text)                      to authenticated;
grant execute on function public.h2h_quick(text,int)                 to authenticated;
grant execute on function public.h2h_submit_draft(bigint,jsonb,jsonb) to authenticated;
grant execute on function public.h2h_state(bigint)                   to authenticated;
grant execute on function public.h2h_report(bigint,jsonb)            to authenticated;
