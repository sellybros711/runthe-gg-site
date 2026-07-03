-- ============================================================================
-- 44_soccer_online_full_roster.sql  —  Online Friendly + Online World Cup:
--                                       full 11-man roster instead of the
--                                       6-man quick draft
-- ============================================================================
-- Product change: both online modes should use the same "Full Team" draft
-- (GK, 3 DEF, 2 MID, 2 FWD, 3 FLEX — soccer/index.html's FULL_OPEN_SLOTS) that
-- solo/Friendly already offer, not the 6-man quick draft they launched with.
--
-- This is a `create or replace function` patch on top of 42/43 — same
-- signatures, so grants/revokes from those files still apply unchanged. Only
-- the squad-size check (6 → 11) and the bot-squad generator (now drafting a
-- full 11-man roster in FULL_OPEN_SLOTS order) change.
--
-- Idempotent. Run after 42_soccer_h2h_online.sql and 43_soccer_wc_online.sql.
-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- soccer_h2h_submit_draft: 6 -> 11 players
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

  if n_ids <> 11 then raise exception 'online friendly needs a full 11-player roster, got %', n_ids; end if;
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

  update soccer_h2h_matches
     set status = 'ready', updated_at = now()
   where id = p_match_id
     and status in ('open','drafting')
     and guest is not null
     and host_picks is not null and guest_picks is not null;

  return _soccer_h2h_state_json(p_match_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- soccer_wc_join: 6 -> 11 players
-- ---------------------------------------------------------------------------
create or replace function soccer_wc_join(p_player_ids text[], p_slots text[])
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_season soccer_wc_seasons%rowtype;
  v_name text; v_flag text;
  n_ids int := coalesce(cardinality(p_player_ids),0);
  n_distinct int := coalesce(cardinality(array(select distinct unnest(p_player_ids))),0);
  n_found int; v_avg numeric; v_num99 int; v_caps int; v_awards int; v_overall numeric;
  v_picks jsonb; v_entrant_id uuid; v_count int;
begin
  if uid is null then raise exception 'must be signed in to play online'; end if;

  if n_ids <> 11 then raise exception 'the world cup pool needs a full 11-player roster, got %', n_ids; end if;
  if n_ids <> n_distinct then raise exception 'duplicate players not allowed'; end if;
  if coalesce(cardinality(p_slots),0) <> n_ids then raise exception 'slot/player count mismatch'; end if;

  select count(*), avg(wc_overall),
         count(*) filter (where wc_overall>=99),
         count(*) filter (where is_captain),
         coalesce(sum(coalesce(array_length(string_to_array(nullif(award,''),'|'),1),0)),0)
    into n_found, v_avg, v_num99, v_caps, v_awards
  from wc_players where player_id = any(p_player_ids);
  if n_found <> n_ids then raise exception 'unknown player id(s): % of % matched', n_found, n_ids; end if;
  v_overall := round(round(v_avg + v_num99*0.15,1) * power(1.005,v_caps) * power(1.02,v_awards), 1);

  select jsonb_agg(jsonb_build_object('id', pid, 'slot', slot)) into v_picks
    from unnest(p_player_ids, p_slots) as u(pid, slot);

  perform _soccer_wc_check_due_seasons();

  select * into v_season from soccer_wc_seasons where status='open' order by opened_at limit 1 for update;
  if not found then
    insert into soccer_wc_seasons(status, lock_deadline) values ('open', now() + _soccer_wc_lock_window())
      returning * into v_season;
  end if;

  select id into v_entrant_id from soccer_wc_entrants where season_id=v_season.id and user_id=uid;
  if v_entrant_id is not null then
    return jsonb_build_object('season_id', v_season.id, 'entrant_id', v_entrant_id, 'already_joined', true);
  end if;

  select username::text, nullif(flag,'') into v_name, v_flag from profiles where id=uid;
  insert into soccer_wc_entrants(season_id, user_id, name, flag, picks, overall)
    values (v_season.id, uid, coalesce(v_name,'You'), coalesce(v_flag,'USA'), v_picks, v_overall)
    returning id into v_entrant_id;

  select count(*) into v_count from soccer_wc_entrants where season_id=v_season.id;
  if v_count >= 48 then
    perform _soccer_wc_lock_season(v_season.id);
  end if;

  return jsonb_build_object('season_id', v_season.id, 'entrant_id', v_entrant_id, 'already_joined', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- _soccer_wc_bot_squad: now drafts a full 11-man roster (GK, 3 DEF, 2 MID,
-- 2 FWD, 3 FLEX — matches soccer/index.html's FULL_OPEN_SLOTS order) instead
-- of the old 6-man shape, so bot entrants match real full-roster drafts.
-- ---------------------------------------------------------------------------
create or replace function _soccer_wc_bot_squad(out picks jsonb, out overall numeric)
language plpgsql volatile as $$
declare
  v_lo numeric := 60 + random()*15;
  v_hi numeric := v_lo + 15 + random()*10;
  v_ids text[];
  v_slots text[] := array['GK','DEF','DEF','DEF','MID','MID','FWD','FWD','FLEX','FLEX','FLEX'];
  n_found int; v_avg numeric; v_num99 int; v_caps int; v_awards int;
begin
  select array_agg(player_id) into v_ids from (
    (select player_id from wc_players where position='GK'  and wc_overall between v_lo and v_hi order by random() limit 1)
    union all
    (select player_id from wc_players where position='DEF' and wc_overall between v_lo and v_hi order by random() limit 3)
    union all
    (select player_id from wc_players where position='MID' and wc_overall between v_lo and v_hi order by random() limit 2)
    union all
    (select player_id from wc_players where position='FWD' and wc_overall between v_lo and v_hi order by random() limit 2)
    union all
    (select player_id from wc_players where wc_overall between v_lo and v_hi order by random() limit 3)
  ) s;

  if coalesce(array_length(v_ids,1),0) < 11 then
    select array_agg(player_id) into v_ids from (
      (select player_id from wc_players where position='GK' order by random() limit 1)
      union all (select player_id from wc_players where position='DEF' order by random() limit 3)
      union all (select player_id from wc_players where position='MID' order by random() limit 2)
      union all (select player_id from wc_players where position='FWD' order by random() limit 2)
      union all (select player_id from wc_players order by random() limit 3)
    ) s;
  end if;

  select count(*), avg(wc_overall),
         count(*) filter (where wc_overall>=99),
         count(*) filter (where is_captain),
         coalesce(sum(coalesce(array_length(string_to_array(nullif(award,''),'|'),1),0)),0)
    into n_found, v_avg, v_num99, v_caps, v_awards
  from wc_players where player_id = any(v_ids);

  overall := round(round(v_avg + v_num99*0.15,1) * power(1.005,v_caps) * power(1.02,v_awards), 1);
  select jsonb_agg(jsonb_build_object('id', pid, 'slot', slot)) into picks
    from unnest(v_ids, v_slots) as u(pid, slot);
end;
$$;
