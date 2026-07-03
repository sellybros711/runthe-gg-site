-- ============================================================================
-- 42_soccer_h2h_online.sql  —  RunThePitch: Online Friendly (1v1 head-to-head)
-- ============================================================================
-- Mirrors the platform's established online-multiplayer pattern (see
-- 05_friendly_challenges.sql, 10_accounts.sql, 41_globe_online.sql):
--   • The table has RLS ENABLED with NO direct policies — anon/authenticated
--     cannot read or write it directly. ALL access is through the SECURITY
--     DEFINER functions below, which keep the rules server-side.
--   • `profiles` is SHARED across every game on this Supabase project (golf,
--     globe, soccer all point at the same project), so every new column and
--     function here is prefixed `soccer_h2h_` to avoid colliding with golf's
--     own (uncommitted, applied-directly) h2h schema or globe's tables.
--   • The match itself is simulated CLIENT-SIDE (soccer's sim is plain JS, not
--     reimplemented in SQL). Determinism comes from `withSeededRandom(match.id,
--     ...)` in soccer/index.html — both clients run the identical simulateMatch
--     call in a canonical (host, guest) order and get a bit-identical result
--     from nothing but the match id. The server's job is only to: validate both
--     squads (same recomputation submit_draft already does, so a client can't
--     forge a stronger team), and reconcile the two independently-computed
--     reports so a lone dishonest client can't just declare itself the winner.
--   • Bots are NEVER disclosed as bots in the client UI — `*_is_bot` exists
--     purely so the leaderboard/stat updates can skip a non-existent account.
--     Polling only for now (no Realtime) — mirrors golf's H2H, "Realtime is a
--     Phase-3 upgrade" once this is proven out.
--
-- Idempotent. Run after 10_accounts.sql (needs `profiles`) and 02_wc_players.sql
-- (needs `wc_players` for server-side squad validation).
-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- profiles: Online Friendly W/L record
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists soccer_h2h_wins        int not null default 0;
alter table profiles add column if not exists soccer_h2h_losses      int not null default 0;
alter table profiles add column if not exists soccer_h2h_streak      int not null default 0;
alter table profiles add column if not exists soccer_h2h_best_streak int not null default 0;

-- ---------------------------------------------------------------------------
-- table
-- ---------------------------------------------------------------------------
create table if not exists soccer_h2h_matches (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,
  is_public     boolean not null default true,
  status        text not null default 'open'
                  check (status in ('open','drafting','ready','done','void','abandoned')),
  host          uuid references auth.users(id) on delete set null,
  guest         uuid references auth.users(id) on delete set null,
  host_name     text, host_flag text, host_is_bot  boolean not null default false,
  guest_name    text, guest_flag text, guest_is_bot boolean not null default false,
  host_picks    jsonb,   -- [{id, slot}, ...] x6, set once submitted
  guest_picks   jsonb,
  host_overall  numeric, -- server-recomputed from wc_players, never client-trusted
  guest_overall numeric,
  host_goals    int,
  guest_goals   int,
  winner        text check (winner in ('host','guest')),
  host_report   jsonb,   -- {goals_host, goals_guest, winner} as each client computed it
  guest_report  jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table soccer_h2h_matches enable row level security;
create index if not exists soccer_h2h_matches_open_idx
  on soccer_h2h_matches (is_public, status, created_at) where status in ('open','drafting');

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function _soccer_h2h_state_json(p_match_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', m.id, 'code', m.code, 'is_public', m.is_public, 'status', m.status,
    'host', m.host, 'guest', m.guest,
    'host_name', m.host_name, 'host_flag', m.host_flag, 'host_is_bot', m.host_is_bot,
    'guest_name', m.guest_name, 'guest_flag', m.guest_flag, 'guest_is_bot', m.guest_is_bot,
    'host_picks', m.host_picks, 'guest_picks', m.guest_picks,
    'host_overall', m.host_overall, 'guest_overall', m.guest_overall,
    'host_goals', m.host_goals, 'guest_goals', m.guest_goals, 'winner', m.winner,
    'created_at', m.created_at, 'updated_at', m.updated_at
  )
  from soccer_h2h_matches m where m.id = p_match_id;
$$;

-- Apply a finished match's result to both accounts' W/L/streak. No-op for a
-- bot side (nothing to update) or if the match isn't actually 'done' yet.
create or replace function _soccer_h2h_apply_result(p_match_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m soccer_h2h_matches%rowtype;
begin
  select * into m from soccer_h2h_matches where id = p_match_id;
  if not found or m.status <> 'done' then return; end if;

  if m.host is not null and not m.host_is_bot then
    if m.winner = 'host' then
      update profiles set soccer_h2h_wins = soccer_h2h_wins + 1,
             soccer_h2h_streak = soccer_h2h_streak + 1,
             soccer_h2h_best_streak = greatest(soccer_h2h_best_streak, soccer_h2h_streak + 1)
       where id = m.host;
    else
      update profiles set soccer_h2h_losses = soccer_h2h_losses + 1, soccer_h2h_streak = 0
       where id = m.host;
    end if;
  end if;

  if m.guest is not null and not m.guest_is_bot then
    if m.winner = 'guest' then
      update profiles set soccer_h2h_wins = soccer_h2h_wins + 1,
             soccer_h2h_streak = soccer_h2h_streak + 1,
             soccer_h2h_best_streak = greatest(soccer_h2h_best_streak, soccer_h2h_streak + 1)
       where id = m.guest;
    else
      update profiles set soccer_h2h_losses = soccer_h2h_losses + 1, soccer_h2h_streak = 0
       where id = m.guest;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- create a match (host). p_public=true → joinable via Quick Match; false →
-- only joinable by sharing the code (this replaces the old base64-link/
-- create_friendly_challenge flow with a real, deterministic, leaderboard-
-- tracked match).
-- ---------------------------------------------------------------------------
create or replace function soccer_h2h_create(p_public boolean default true)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text; v_try int := 0; i int;
  v_id uuid;
  v_name text; v_flag text;
begin
  if uid is null then raise exception 'must be signed in to play online'; end if;
  select username::text, nullif(flag,'') into v_name, v_flag from profiles where id = uid;

  loop
    v_try := v_try + 1; v_code := '';
    for i in 1..5 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random()*length(v_alphabet))::int, 1);
    end loop;
    begin
      insert into soccer_h2h_matches(code, is_public, host, host_name, host_flag)
        values (v_code, coalesce(p_public,true), uid, coalesce(v_name,'You'), coalesce(v_flag,'USA'))
        returning id into v_id;
      exit;
    exception when unique_violation then
      if v_try > 8 then raise exception 'could not allocate a match code'; end if;
    end;
  end loop;

  return jsonb_build_object('match_id', v_id, 'code', v_code, 'role', 'host');
end;
$$;

-- ---------------------------------------------------------------------------
-- quick match: claim the oldest open public match if one exists, else become
-- the host of a fresh one. `for update skip locked` keeps two simultaneous
-- quick-match callers from claiming the same row.
-- ---------------------------------------------------------------------------
create or replace function soccer_h2h_quick()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
  v_code text;
  v_name text; v_flag text;
begin
  if uid is null then raise exception 'must be signed in to play online'; end if;
  select username::text, nullif(flag,'') into v_name, v_flag from profiles where id = uid;

  select id, code into v_id, v_code from soccer_h2h_matches
    where is_public = true and status = 'open' and guest is null and host <> uid
    order by created_at asc
    limit 1
    for update skip locked;

  if v_id is not null then
    update soccer_h2h_matches
       set guest = uid, guest_name = coalesce(v_name,'Guest'), guest_flag = coalesce(v_flag,'USA'),
           status = 'drafting', updated_at = now()
     where id = v_id;
    return jsonb_build_object('match_id', v_id, 'code', v_code, 'role', 'guest');
  end if;

  return soccer_h2h_create(true);
end;
$$;

-- ---------------------------------------------------------------------------
-- join a match by code (private matches, or reconnecting to your own).
-- ---------------------------------------------------------------------------
create or replace function soccer_h2h_join(p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_match soccer_h2h_matches%rowtype;
  v_name text; v_flag text;
begin
  if uid is null then raise exception 'must be signed in to play online'; end if;
  select * into v_match from soccer_h2h_matches where code = upper(p_code) for update;
  if not found then raise exception 'no match with that code'; end if;

  if v_match.host = uid then
    return jsonb_build_object('match_id', v_match.id, 'code', v_match.code, 'role', 'host');
  elsif v_match.guest = uid then
    return jsonb_build_object('match_id', v_match.id, 'code', v_match.code, 'role', 'guest');
  end if;

  if v_match.status <> 'open' or v_match.guest is not null then
    raise exception 'that match is no longer open';
  end if;

  select username::text, nullif(flag,'') into v_name, v_flag from profiles where id = uid;
  update soccer_h2h_matches
     set guest = uid, guest_name = coalesce(v_name,'Guest'), guest_flag = coalesce(v_flag,'USA'),
         status = 'drafting', updated_at = now()
   where id = v_match.id;

  return jsonb_build_object('match_id', v_match.id, 'code', v_match.code, 'role', 'guest');
end;
$$;

-- ---------------------------------------------------------------------------
-- submit a squad (6 players, quick-draft shape — same shape as today's
-- Friendly). Server-recomputes overall from wc_players exactly like
-- submit_draft, so a client can never claim a stronger squad than it drafted.
-- ---------------------------------------------------------------------------
create or replace function soccer_h2h_submit_draft(p_match_id uuid, p_player_ids text[], p_slots text[])
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_match soccer_h2h_matches%rowtype;
  v_role text;
  n_ids int := coalesce(cardinality(p_player_ids), 0);
  n_distinct int := coalesce(cardinality(array(select distinct unnest(p_player_ids))), 0);
  n_found int;
  v_avg numeric; v_num99 int; v_caps int; v_awards int;
  v_overall numeric;
  v_picks jsonb;
begin
  if uid is null then raise exception 'must be signed in to play online'; end if;
  select * into v_match from soccer_h2h_matches where id = p_match_id for update;
  if not found then raise exception 'no such match'; end if;

  if v_match.host = uid then v_role := 'host';
  elsif v_match.guest = uid then v_role := 'guest';
  else raise exception 'you are not in this match'; end if;

  if v_match.status not in ('open','drafting') then
    raise exception 'this match is not accepting a draft';
  end if;

  if n_ids <> 6 then raise exception 'online friendly needs exactly 6 players, got %', n_ids; end if;
  if n_ids <> n_distinct then raise exception 'duplicate players not allowed'; end if;
  if coalesce(cardinality(p_slots),0) <> n_ids then raise exception 'slot/player count mismatch'; end if;

  select count(*), avg(wc_overall),
         count(*) filter (where wc_overall >= 99),
         count(*) filter (where is_captain),
         coalesce(sum(coalesce(array_length(string_to_array(nullif(award,''),'|'),1),0)),0)
    into n_found, v_avg, v_num99, v_caps, v_awards
  from wc_players where player_id = any(p_player_ids);

  if n_found <> n_ids then
    raise exception 'unknown player id(s): % of % matched', n_found, n_ids;
  end if;

  v_overall := round(round(v_avg + v_num99 * 0.15, 1) * power(1.005, v_caps) * power(1.02, v_awards), 1);

  select jsonb_agg(jsonb_build_object('id', pid, 'slot', slot))
    into v_picks
  from unnest(p_player_ids, p_slots) as u(pid, slot);

  if v_role = 'host' then
    update soccer_h2h_matches set host_picks = v_picks, host_overall = v_overall, updated_at = now()
     where id = p_match_id;
  else
    update soccer_h2h_matches set guest_picks = v_picks, guest_overall = v_overall, updated_at = now()
     where id = p_match_id;
  end if;

  -- both sides locked in + a real opponent is present → ready to simulate
  update soccer_h2h_matches
     set status = 'ready', updated_at = now()
   where id = p_match_id
     and status in ('open','drafting')
     and guest is not null
     and host_picks is not null and guest_picks is not null;

  return _soccer_h2h_state_json(p_match_id);
end;
$$;

-- read current match state (initial load / polling)
create or replace function soccer_h2h_state(p_match_id uuid)
returns jsonb language sql security definer set search_path = public stable as $$
  select _soccer_h2h_state_json(p_match_id);
$$;

-- ---------------------------------------------------------------------------
-- report a computed result. Both clients independently run the same seeded
-- sim and call this with what they got; the match only finalizes (and only
-- updates the leaderboard) once both reports agree. A mismatch voids the
-- match rather than trusting either side.
-- ---------------------------------------------------------------------------
create or replace function soccer_h2h_report(p_match_id uuid, p_host_goals int, p_guest_goals int, p_winner text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_match soccer_h2h_matches%rowtype;
  v_role text;
  v_report jsonb;
  v_other jsonb;
begin
  if uid is null then raise exception 'must be signed in to play online'; end if;
  if p_winner not in ('host','guest') then raise exception 'invalid winner'; end if;

  select * into v_match from soccer_h2h_matches where id = p_match_id for update;
  if not found then raise exception 'no such match'; end if;

  if v_match.host = uid then v_role := 'host';
  elsif v_match.guest = uid then v_role := 'guest';
  else raise exception 'you are not in this match'; end if;

  if v_match.status in ('done','void') then
    return _soccer_h2h_state_json(p_match_id);
  end if;
  if v_match.status <> 'ready' then raise exception 'match is not ready to report'; end if;

  v_report := jsonb_build_object('goals_host', p_host_goals, 'goals_guest', p_guest_goals, 'winner', p_winner);

  if v_role = 'host' then
    update soccer_h2h_matches set host_report = v_report, updated_at = now() where id = p_match_id;
    v_other := v_match.guest_report;
  else
    update soccer_h2h_matches set guest_report = v_report, updated_at = now() where id = p_match_id;
    v_other := v_match.host_report;
  end if;

  if v_other is not null then
    if v_other = v_report then
      update soccer_h2h_matches
         set status = 'done', host_goals = p_host_goals, guest_goals = p_guest_goals,
             winner = p_winner, updated_at = now()
       where id = p_match_id;
      perform _soccer_h2h_apply_result(p_match_id);
    else
      update soccer_h2h_matches set status = 'void', updated_at = now() where id = p_match_id;
    end if;
  end if;

  return _soccer_h2h_state_json(p_match_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- bot backfill: host alone (there's no second human to reconcile against),
-- trusted like golf's h2h_record_bot_match. Only usable while no real guest
-- has ever joined this match.
-- ---------------------------------------------------------------------------
create or replace function soccer_h2h_record_bot_match(
  p_match_id uuid, p_host_goals int, p_guest_goals int, p_winner text,
  p_bot_name text, p_bot_flag text default 'USA'
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_match soccer_h2h_matches%rowtype;
begin
  if uid is null then raise exception 'must be signed in to play online'; end if;
  if p_winner not in ('host','guest') then raise exception 'invalid winner'; end if;

  select * into v_match from soccer_h2h_matches where id = p_match_id for update;
  if not found then raise exception 'no such match'; end if;
  if v_match.host <> uid then raise exception 'only the host can record a bot match'; end if;
  if v_match.guest is not null then raise exception 'a real opponent already joined this match'; end if;
  if v_match.status in ('done','void') then return _soccer_h2h_state_json(p_match_id); end if;

  update soccer_h2h_matches
     set guest_is_bot = true,
         guest_name = left(coalesce(nullif(trim(p_bot_name),''), 'Opponent'), 24),
         guest_flag = coalesce(p_bot_flag, 'USA'),
         status = 'done', host_goals = p_host_goals, guest_goals = p_guest_goals, winner = p_winner,
         updated_at = now()
   where id = p_match_id;

  perform _soccer_h2h_apply_result(p_match_id);
  return _soccer_h2h_state_json(p_match_id);
end;
$$;

-- leave/cancel an unstarted or unfinished match
create or replace function soccer_h2h_abandon(p_match_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_match soccer_h2h_matches%rowtype;
begin
  if uid is null then raise exception 'must be signed in to play online'; end if;
  select * into v_match from soccer_h2h_matches where id = p_match_id for update;
  if not found then raise exception 'no such match'; end if;

  if v_match.host = uid then null;
  elsif v_match.guest = uid then null;
  else raise exception 'you are not in this match';
  end if;

  if v_match.status in ('done','void','abandoned') then
    return _soccer_h2h_state_json(p_match_id);
  end if;

  update soccer_h2h_matches set status = 'abandoned', updated_at = now() where id = p_match_id;
  return _soccer_h2h_state_json(p_match_id);
end;
$$;

-- Online Friendly leaderboard (W/L + streak).
create or replace function soccer_h2h_board(p_limit int default 100)
returns table(username text, flag text, wins int, losses int, streak int, best_streak int)
language sql security definer set search_path = public stable as $$
  select username::text, flag, soccer_h2h_wins, soccer_h2h_losses, soccer_h2h_streak, soccer_h2h_best_streak
  from profiles
  where soccer_h2h_wins + soccer_h2h_losses > 0
  order by soccer_h2h_wins desc, (soccer_h2h_wins - soccer_h2h_losses) desc, soccer_h2h_best_streak desc
  limit greatest(1, least(200, coalesce(p_limit, 100)));
$$;

-- ---------------------------------------------------------------------------
-- grants (all access via these RPCs; the table stays locked by RLS-with-no-policy)
-- ---------------------------------------------------------------------------
revoke all on function soccer_h2h_create(boolean)                       from public;
revoke all on function soccer_h2h_quick()                               from public;
revoke all on function soccer_h2h_join(text)                            from public;
revoke all on function soccer_h2h_submit_draft(uuid, text[], text[])    from public;
revoke all on function soccer_h2h_state(uuid)                           from public;
revoke all on function soccer_h2h_report(uuid, int, int, text)          from public;
revoke all on function soccer_h2h_record_bot_match(uuid, int, int, text, text, text) from public;
revoke all on function soccer_h2h_abandon(uuid)                         from public;
revoke all on function soccer_h2h_board(int)                            from public;

grant execute on function soccer_h2h_create(boolean)                    to authenticated;
grant execute on function soccer_h2h_quick()                            to authenticated;
grant execute on function soccer_h2h_join(text)                         to authenticated;
grant execute on function soccer_h2h_submit_draft(uuid, text[], text[]) to authenticated;
grant execute on function soccer_h2h_state(uuid)                        to authenticated, anon;
grant execute on function soccer_h2h_report(uuid, int, int, text)       to authenticated;
grant execute on function soccer_h2h_record_bot_match(uuid, int, int, text, text, text) to authenticated;
grant execute on function soccer_h2h_abandon(uuid)                      to authenticated;
grant execute on function soccer_h2h_board(int)                        to authenticated, anon;

-- Optional housekeeping (run manually or via pg_cron): matches that never left
-- 'open'/'drafting' after a long wait are just abandoned lobbies, not history.
--   delete from soccer_h2h_matches where status in ('open','drafting') and updated_at < now() - interval '2 hours';
