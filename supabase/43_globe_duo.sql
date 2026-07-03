-- ============================================================================
-- 43_globe_duo.sql  —  RunTheGlobe "Two Devices" duo team (GDD §6/§7)
-- ============================================================================
-- Replaces the host-driven lobby model (41) for the Two-Devices case with a
-- much simpler, host-less design that matches the product vision:
--
--   • Two players pair into ONE team via a short code.
--   • The duo shares a SEED. Both devices run the SAME race deterministically
--     from that seed (identical country order, finish line, and AI opponent
--     field) — so the opponents always "finish", nobody hosts the overall game,
--     and both screens agree without streaming race state.
--   • Each Stage both players play on their own device and POST their effective
--     time. The team's Stage time = the two combined (summed by the client).
--   • Realtime pushes the partner's time so each device knows when both are in.
--
-- Same security posture as 41/42: tables have RLS with read-only policies (so
-- realtime works); all writes go through SECURITY DEFINER RPCs. Not sensitive
-- data (team/player names + times).
--
-- Idempotent. Run after 42_globe_realtime_select.sql.
-- ----------------------------------------------------------------------------

create table if not exists globe_duos (
  id         uuid primary key default gen_random_uuid(),
  code       text unique not null,
  seed       bigint not null,                 -- shared race seed (deterministic race)
  name       text,                            -- team name
  status     text not null default 'open',    -- open | racing | done
  created_at timestamptz not null default now()
);
alter table globe_duos enable row level security;

create table if not exists globe_duo_members (
  duo_id    uuid not null references globe_duos(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  name      text,                             -- player display name
  slot      int  not null,                    -- 0 (creator) or 1 (joiner)
  joined_at timestamptz not null default now(),
  primary key (duo_id, user_id)
);
alter table globe_duo_members enable row level security;

create table if not exists globe_duo_times (
  duo_id       uuid not null references globe_duos(id) on delete cascade,
  user_id      uuid not null,
  round        int  not null,
  effective_ms int  not null,
  submitted_at timestamptz not null default now(),
  primary key (duo_id, user_id, round)
);
alter table globe_duo_times enable row level security;
create index if not exists globe_duo_times_idx on globe_duo_times(duo_id, round);

-- read-only policies (writes are via the SECURITY DEFINER RPCs below)
drop policy if exists globe_duos_read on globe_duos;         create policy globe_duos_read on globe_duos for select using (true);
drop policy if exists globe_duo_members_read on globe_duo_members; create policy globe_duo_members_read on globe_duo_members for select using (true);
drop policy if exists globe_duo_times_read on globe_duo_times;     create policy globe_duo_times_read on globe_duo_times for select using (true);

-- serialize a duo to one JSON blob the client renders directly
create or replace function _globe_duo_json(p_duo uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'id', d.id, 'code', d.code, 'seed', d.seed, 'name', d.name, 'status', d.status,
    'members', coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',m.name,'slot',m.slot) order by m.slot)
                         from globe_duo_members m where m.duo_id=d.id), '[]'::jsonb),
    'times',   coalesce((select jsonb_agg(jsonb_build_object('user_id',t.user_id,'round',t.round,'effective_ms',t.effective_ms))
                         from globe_duo_times t where t.duo_id=d.id), '[]'::jsonb)
  ) from globe_duos d where d.id=p_duo;
$$;

-- create a duo (creator = slot 0). Returns the duo JSON (incl. code + seed).
create or replace function create_globe_duo(p_name text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  uid uuid := auth.uid();
  v_alpha text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text; v_try int := 0; i int; v_id uuid; v_nm text;
begin
  if uid is null then raise exception 'must be signed in'; end if;
  select username::text into v_nm from profiles where id=uid;
  loop
    v_try:=v_try+1; v_code:='';
    for i in 1..5 loop v_code:=v_code||substr(v_alpha,1+floor(random()*length(v_alpha))::int,1); end loop;
    begin
      insert into globe_duos(code, seed, name) values (v_code, floor(random()*2147483647)::bigint, left(coalesce(nullif(trim(p_name),''),'Our Team'),18))
        returning id into v_id; exit;
    exception when unique_violation then if v_try>8 then raise exception 'could not allocate a code'; end if; end;
  end loop;
  insert into globe_duo_members(duo_id, user_id, name, slot) values (v_id, uid, coalesce(v_nm,'Player 1'), 0);
  return _globe_duo_json(v_id);
end;
$$;

-- join a duo by code (joiner = slot 1). Idempotent rejoin. Returns duo JSON.
create or replace function join_globe_duo(p_code text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid := auth.uid(); d globe_duos%rowtype; n int; v_nm text;
begin
  if uid is null then raise exception 'must be signed in'; end if;
  select * into d from globe_duos where code=upper(p_code);
  if not found then raise exception 'no team with that code'; end if;
  if exists(select 1 from globe_duo_members where duo_id=d.id and user_id=uid) then
    return _globe_duo_json(d.id);                     -- rejoin
  end if;
  select count(*) into n from globe_duo_members where duo_id=d.id;
  if n>=2 then raise exception 'that team is full'; end if;
  select username::text into v_nm from profiles where id=uid;
  insert into globe_duo_members(duo_id, user_id, name, slot) values (d.id, uid, coalesce(v_nm,'Player 2'), n);
  return _globe_duo_json(d.id);
end;
$$;

-- post my effective time for a round (server clamps; client sums the two)
create or replace function post_globe_duo_time(p_duo uuid, p_round int, p_ms int)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'must be signed in'; end if;
  if not exists(select 1 from globe_duo_members where duo_id=p_duo and user_id=uid) then raise exception 'not in this team'; end if;
  insert into globe_duo_times(duo_id, user_id, round, effective_ms)
    values (p_duo, uid, p_round, greatest(0, least(600000, coalesce(p_ms,0))))
  on conflict (duo_id, user_id, round) do update set effective_ms=excluded.effective_ms, submitted_at=now();
  update globe_duos set status='racing' where id=p_duo and status='open';
  return _globe_duo_json(p_duo);
end;
$$;

create or replace function get_globe_duo(p_duo uuid)
returns jsonb language sql security definer set search_path=public stable as $$ select _globe_duo_json(p_duo); $$;

revoke all on function create_globe_duo(text)            from public;
revoke all on function join_globe_duo(text)              from public;
revoke all on function post_globe_duo_time(uuid,int,int) from public;
revoke all on function get_globe_duo(uuid)               from public;
grant execute on function create_globe_duo(text)            to authenticated;
grant execute on function join_globe_duo(text)              to authenticated;
grant execute on function post_globe_duo_time(uuid,int,int) to authenticated;
grant execute on function get_globe_duo(uuid)               to authenticated, anon;

do $$
begin
  begin execute 'alter publication supabase_realtime add table globe_duo_members'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table globe_duo_times';   exception when others then null; end;
end $$;
