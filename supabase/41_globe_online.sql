-- ============================================================================
-- 41_globe_online.sql  —  RunTheGlobe online multiplayer + server-authoritative
--                          Checkpoint timing (GDD v1 §3, §7-9)
-- ============================================================================
-- Stands up the backend for online RunTheGlobe races. Mirrors the platform's
-- established pattern (see 05_friendly_challenges.sql, 10_accounts.sql):
--   • Tables have RLS ENABLED with NO direct policies — anon/authenticated
--     cannot read or write them directly. ALL access is through the
--     SECURITY DEFINER functions below, which keep the rules server-side.
--   • Timing is SERVER-AUTHORITATIVE (GDD §9): a team's raw completion time is
--     computed as (server now() − server-stamped stage start), never trusted
--     from the client. This is what makes the anti-cheat in §9 enforceable.
--   • Realtime is enabled on the lobby/team/stage tables so clients get live
--     leaderboard + lobby updates without polling.
--
-- SCOPE (Phase 1): a race is a lobby of up to 11 teams reached by a short code.
-- Each signed-in human joins as their own team; empty slots are filled by AI
-- ghosts at start (GDD §8 lobby-fill). Per round the server draws one shared
-- country, stamps each team's start, computes effective time on Checkpoint,
-- paces the ghost field to the live median, and Grounds the slowest.
-- Two-humans-per-team pairing (shared team code) and auto-paired online-solo
-- matchmaking (GDD §7) build on this schema and are noted as follow-ups.
--
-- Requires: pgcrypto (gen_random_uuid) — enabled by default on Supabase.
-- Idempotent. Run after 40_runtour_email_login.sql.
-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- tables
-- ---------------------------------------------------------------------------
create table if not exists globe_lobbies (
  id           uuid primary key default gen_random_uuid(),
  code         text unique not null,
  host         uuid references auth.users(id) on delete set null,
  status       text not null default 'open' check (status in ('open','racing','done')),
  mode         text not null default 'team' check (mode in ('team','solo')),
  round        int  not null default 0,               -- 0 = lobby; 1..9 = stages
  country_id   text,                                  -- shared destination for the current round
  finish_line_id text,                                -- Round-9 location, locked at start (GDD §11)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table globe_lobbies enable row level security;

create table if not exists globe_teams (
  id               uuid primary key default gen_random_uuid(),
  lobby_id         uuid not null references globe_lobbies(id) on delete cascade,
  name             text not null,
  flag             text not null default '🧭',
  is_ghost         boolean not null default false,
  started_as_ghost boolean not null default false,    -- GDD §8 labeling rule
  ghost_skill      numeric,                           -- pace factor for ghost teams
  alive            boolean not null default true,
  captain          uuid references auth.users(id) on delete set null,
  partner          uuid references auth.users(id) on delete set null,
  slot             int  not null default 0,
  created_at       timestamptz not null default now()
);
alter table globe_teams enable row level security;
create index if not exists globe_teams_lobby_idx on globe_teams(lobby_id);

-- one row per team per round: server-stamped start + locked Checkpoint result
create table if not exists globe_stage (
  lobby_id     uuid not null references globe_lobbies(id) on delete cascade,
  team_id      uuid not null references globe_teams(id) on delete cascade,
  round        int  not null,
  country_id   text,
  category     text,
  started_at   timestamptz,                           -- SERVER clock (authoritative)
  effective_ms int,                                   -- raw + penalty*misses, locked at Checkpoint
  misses       int,
  submitted_at timestamptz,
  primary key (team_id, round)
);
alter table globe_stage enable row level security;
create index if not exists globe_stage_lobby_round_idx on globe_stage(lobby_id, round);

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
-- miss penalty (seconds) by scoring category — server-side source of truth so a
-- client can't understate its own penalty (mirrors the client PENALTY map, GDD §4).
create or replace function _globe_penalty(p_cat text)
returns int language sql immutable as $$
  select case p_cat
    when 'trivia' then 15 when 'math' then 15
    when 'memory' then 12 when 'spatial' then 12
    when 'reflex' then 10
    when 'word' then 12 when 'dragdrop' then 12 when 'audio' then 15
    when 'duo' then 8
    else 12 end;
$$;

-- serialize the whole lobby to one JSON blob the client can render directly.
create or replace function _globe_lobby_json(p_lobby uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', l.id, 'code', l.code, 'status', l.status, 'mode', l.mode,
    'round', l.round, 'country_id', l.country_id, 'finish_line_id', l.finish_line_id,
    'host', l.host,
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'flag', t.flag, 'is_ghost', t.is_ghost,
        'started_as_ghost', t.started_as_ghost, 'alive', t.alive, 'slot', t.slot,
        'captain', t.captain, 'partner', t.partner
      ) order by t.slot)
      from globe_teams t where t.lobby_id = l.id), '[]'::jsonb),
    'stage', coalesce((
      select jsonb_agg(jsonb_build_object(
        'team_id', s.team_id, 'round', s.round, 'effective_ms', s.effective_ms,
        'misses', s.misses, 'submitted', s.submitted_at is not null,
        'started', s.started_at is not null
      ))
      from globe_stage s where s.lobby_id = l.id and s.round = l.round), '[]'::jsonb)
  )
  from globe_lobbies l where l.id = p_lobby;
$$;

-- ---------------------------------------------------------------------------
-- create a lobby (host becomes team #1)
-- ---------------------------------------------------------------------------
create or replace function create_globe_lobby(p_team_name text, p_flag text default '🧭', p_mode text default 'team')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text; v_try int := 0; i int;
  v_lobby uuid;
begin
  if uid is null then raise exception 'must be signed in to play online'; end if;
  loop
    v_try := v_try + 1; v_code := '';
    for i in 1..5 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random()*length(v_alphabet))::int, 1);
    end loop;
    begin
      insert into globe_lobbies(code, host, mode) values (v_code, uid, coalesce(p_mode,'team'))
        returning id into v_lobby;
      exit;
    exception when unique_violation then
      if v_try > 8 then raise exception 'could not allocate a lobby code'; end if;
    end;
  end loop;

  insert into globe_teams(lobby_id, name, flag, captain, slot)
    values (v_lobby, left(coalesce(nullif(trim(p_team_name),''),'Team 1'),18), coalesce(p_flag,'🧭'), uid, 0);

  return jsonb_build_object('lobby_id', v_lobby, 'code', v_code);
end;
$$;

-- ---------------------------------------------------------------------------
-- join an open lobby by code (as your own team)
-- ---------------------------------------------------------------------------
create or replace function join_globe_lobby(p_code text, p_team_name text, p_flag text default '🧭')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_lobby globe_lobbies%rowtype;
  v_count int; v_team uuid;
begin
  if uid is null then raise exception 'must be signed in to play online'; end if;
  select * into v_lobby from globe_lobbies where code = upper(p_code);
  if not found then raise exception 'no lobby with that code'; end if;
  if v_lobby.status <> 'open' then raise exception 'that race has already started'; end if;

  -- already in this lobby? return the existing team (idempotent rejoin)
  select id into v_team from globe_teams
    where lobby_id = v_lobby.id and (captain = uid or partner = uid) limit 1;
  if v_team is not null then
    return jsonb_build_object('lobby_id', v_lobby.id, 'team_id', v_team);
  end if;

  select count(*) into v_count from globe_teams where lobby_id = v_lobby.id;
  if v_count >= 11 then raise exception 'that race is full'; end if;

  insert into globe_teams(lobby_id, name, flag, captain, slot)
    values (v_lobby.id, left(coalesce(nullif(trim(p_team_name),''),'Team '||(v_count+1)),18),
            coalesce(p_flag,'🧭'), uid, v_count)
    returning id into v_team;

  update globe_lobbies set updated_at = now() where id = v_lobby.id;
  return jsonb_build_object('lobby_id', v_lobby.id, 'team_id', v_team);
end;
$$;

-- ---------------------------------------------------------------------------
-- start the race (host only): fill empty slots with ghosts, draw stage 1
-- ---------------------------------------------------------------------------
create or replace function start_globe_race(p_lobby uuid, p_country_id text, p_finish_line_id text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_lobby globe_lobbies%rowtype;
  v_count int; i int;
  v_names text[] := array['Team Fox','Team Wolf','Team Hawk','Team Puma','Team Bear','Team Otter','Team Lynx','Team Raven','Team Bison','Team Cobra'];
  v_flags text[] := array['🦊','🐺','🦅','🐆','🐻','🦦','🐈','🐦‍⬛','🦬','🐍'];
begin
  select * into v_lobby from globe_lobbies where id = p_lobby;
  if not found then raise exception 'no such lobby'; end if;
  if v_lobby.host <> uid then raise exception 'only the host can start the race'; end if;
  if v_lobby.status <> 'open' then raise exception 'race already started'; end if;

  select count(*) into v_count from globe_teams where lobby_id = p_lobby;
  -- lobby-fill ghosts up to 11 (GDD §8), labeled by being is_ghost + started_as_ghost
  i := v_count;
  while i < 11 loop
    insert into globe_teams(lobby_id, name, flag, is_ghost, started_as_ghost, ghost_skill, slot)
      values (p_lobby, v_names[i - v_count + 1], v_flags[i - v_count + 1], true, true,
              0.80 + random()*0.75, i);
    i := i + 1;
  end loop;

  update globe_lobbies
     set status='racing', round=1, country_id=p_country_id, finish_line_id=p_finish_line_id, updated_at=now()
   where id = p_lobby;

  return _globe_lobby_json(p_lobby);
end;
$$;

-- ---------------------------------------------------------------------------
-- stage start: server stamps the caller's team start time (idempotent)
-- ---------------------------------------------------------------------------
create or replace function globe_stage_start(p_lobby uuid, p_round int, p_category text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_team uuid; v_lobby globe_lobbies%rowtype; v_started timestamptz;
begin
  select * into v_lobby from globe_lobbies where id = p_lobby;
  if not found then raise exception 'no such lobby'; end if;
  if v_lobby.round <> p_round then raise exception 'stale round'; end if;
  select id into v_team from globe_teams where lobby_id = p_lobby and (captain = uid or partner = uid) limit 1;
  if v_team is null then raise exception 'you are not in this race'; end if;

  insert into globe_stage(lobby_id, team_id, round, country_id, category, started_at)
    values (p_lobby, v_team, p_round, v_lobby.country_id, p_category, now())
  on conflict (team_id, round) do update set category = excluded.category
    where globe_stage.started_at is not null;   -- don't reset an existing start

  select started_at into v_started from globe_stage where team_id = v_team and round = p_round;
  return jsonb_build_object('team_id', v_team, 'started_at', v_started, 'server_now', now());
end;
$$;

-- ---------------------------------------------------------------------------
-- Checkpoint: server computes effective time (GDD §4/§9). misses come from the
-- client (gameplay outcome); the TIMING is server-authoritative.
-- ---------------------------------------------------------------------------
create or replace function globe_checkpoint(p_lobby uuid, p_round int, p_misses int, p_category text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_team uuid; v_started timestamptz; v_raw_ms int; v_pen int; v_eff int;
  v_misses int := greatest(0, least(20, coalesce(p_misses,0)));
begin
  select id into v_team from globe_teams where lobby_id = p_lobby and (captain = uid or partner = uid) limit 1;
  if v_team is null then raise exception 'you are not in this race'; end if;
  select started_at into v_started from globe_stage where team_id = v_team and round = p_round;
  if v_started is null then raise exception 'stage was never started'; end if;
  if exists (select 1 from globe_stage where team_id = v_team and round = p_round and submitted_at is not null) then
    return jsonb_build_object('already', true);
  end if;

  v_raw_ms := floor(extract(epoch from (now() - v_started)) * 1000)::int;
  -- basic anti-cheat guard (GDD §9): a sub-300ms "completion" is impossible.
  if v_raw_ms < 300 then raise exception 'submission before load'; end if;

  v_pen := _globe_penalty(p_category);
  v_eff := v_raw_ms + v_misses * v_pen * 1000;

  update globe_stage
     set effective_ms = v_eff, misses = v_misses, submitted_at = now()
   where team_id = v_team and round = p_round;

  return jsonb_build_object('effective_ms', v_eff, 'raw_ms', v_raw_ms, 'misses', v_misses);
end;
$$;

-- ---------------------------------------------------------------------------
-- advance the round (host): pace ghosts to the live median, Ground the slowest,
-- draw the next destination (or crown on the Final). GDD §3, §4, §8.
-- ---------------------------------------------------------------------------
create or replace function advance_globe_round(p_lobby uuid, p_next_country_id text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_lobby globe_lobbies%rowtype;
  v_median numeric; v_pen int; v_cat text;
  r record; v_slow uuid; v_slow_ms int := -1;
begin
  select * into v_lobby from globe_lobbies where id = p_lobby;
  if not found then raise exception 'no such lobby'; end if;
  if v_lobby.host <> uid then raise exception 'only the host can advance the race'; end if;
  if v_lobby.status <> 'racing' then raise exception 'race is not running'; end if;

  select category into v_cat from globe_stage where lobby_id = p_lobby and round = v_lobby.round and category is not null limit 1;
  v_pen := _globe_penalty(coalesce(v_cat,'trivia'));

  -- median of human submissions this round (fallback to a neutral pace)
  select percentile_cont(0.5) within group (order by effective_ms)
    into v_median
    from globe_stage s join globe_teams t on t.id = s.team_id
    where s.lobby_id = p_lobby and s.round = v_lobby.round and t.is_ghost = false and s.effective_ms is not null;
  if v_median is null then v_median := 8000; end if;

  -- pace ghost teams to the live median (GDD §8), then lock their effective time
  for r in select id, ghost_skill from globe_teams where lobby_id = p_lobby and is_ghost = true and alive = true loop
    insert into globe_stage(lobby_id, team_id, round, effective_ms, misses, started_at, submitted_at, category)
      values (p_lobby, r.id, v_lobby.round,
              greatest(600, floor(v_median * coalesce(r.ghost_skill,1.0) * (0.9 + random()*0.2))::int),
              0, now(), now(), v_cat)
    on conflict (team_id, round) do update set effective_ms = excluded.effective_ms, submitted_at = now();
  end loop;

  -- any human who never checked in is treated as slowest-eligible (max time)
  update globe_stage s set effective_ms = 999999, submitted_at = now()
    where s.lobby_id = p_lobby and s.round = v_lobby.round and s.submitted_at is null;

  -- Ground the slowest alive team (skip on the Final — round 9 just crowns)
  if v_lobby.round < 9 then
    for r in
      select t.id, s.effective_ms from globe_teams t
        join globe_stage s on s.team_id = t.id and s.round = v_lobby.round
       where t.lobby_id = p_lobby and t.alive = true
       order by s.effective_ms desc
    loop
      v_slow := r.id; exit;   -- first row = highest effective_ms = slowest
    end loop;
    if v_slow is not null then update globe_teams set alive = false where id = v_slow; end if;

    update globe_lobbies set round = round + 1, country_id = p_next_country_id, updated_at = now()
      where id = p_lobby;
  else
    update globe_lobbies set status = 'done', updated_at = now() where id = p_lobby;
  end if;

  return _globe_lobby_json(p_lobby);
end;
$$;

-- read the current lobby state (initial load / polling fallback)
create or replace function get_globe_lobby(p_lobby uuid)
returns jsonb language sql security definer set search_path = public stable as $$
  select _globe_lobby_json(p_lobby);
$$;

-- find an open lobby id by code (for the join screen)
create or replace function find_globe_lobby(p_code text)
returns uuid language sql security definer set search_path = public stable as $$
  select id from globe_lobbies where code = upper(p_code) and status = 'open';
$$;

-- ---------------------------------------------------------------------------
-- grants (all access via these RPCs; tables stay locked by RLS-with-no-policy)
-- ---------------------------------------------------------------------------
revoke all on function create_globe_lobby(text,text,text)         from public;
revoke all on function join_globe_lobby(text,text,text)           from public;
revoke all on function start_globe_race(uuid,text,text)           from public;
revoke all on function globe_stage_start(uuid,int,text)           from public;
revoke all on function globe_checkpoint(uuid,int,int,text)        from public;
revoke all on function advance_globe_round(uuid,text)             from public;
revoke all on function get_globe_lobby(uuid)                      from public;
revoke all on function find_globe_lobby(text)                     from public;

grant execute on function create_globe_lobby(text,text,text)      to authenticated;
grant execute on function join_globe_lobby(text,text,text)        to authenticated;
grant execute on function start_globe_race(uuid,text,text)        to authenticated;
grant execute on function globe_stage_start(uuid,int,text)        to authenticated;
grant execute on function globe_checkpoint(uuid,int,int,text)     to authenticated;
grant execute on function advance_globe_round(uuid,text)          to authenticated;
grant execute on function get_globe_lobby(uuid)                   to authenticated, anon;
grant execute on function find_globe_lobby(text)                  to authenticated, anon;

-- ---------------------------------------------------------------------------
-- realtime: clients subscribe to these tables for live lobby + leaderboard.
-- (Safe to re-run; ignore "already member" notices.)
-- ---------------------------------------------------------------------------
do $$
begin
  begin execute 'alter publication supabase_realtime add table globe_lobbies'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table globe_teams';   exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table globe_stage';   exception when others then null; end;
end $$;

-- Optional housekeeping (run manually or via pg_cron):
--   delete from globe_lobbies where updated_at < now() - interval '1 day';
