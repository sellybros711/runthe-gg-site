-- ============================================================================
-- 45_soccer_wc_pool_trickle.sql  —  World Cup pool: gradual bot trickle +
--                                    much shorter lock window
-- ============================================================================
-- Problem: the pool could sit at a low count (e.g. 2/48) for the ENTIRE
-- 3-hour lock window with zero visible movement, because bots were only ever
-- added in one big batch at lock time (_soccer_wc_lock_season). That reads as
-- dead/broken, not "an active pool of real players."
--
-- Fix: a trickle mechanism adds a couple of undisclosed bot entrants every
-- ~45-75s (checked opportunistically on every poll/join, same "lazy cron via
-- ordinary traffic" pattern as _soccer_wc_check_due_seasons — no pg_cron
-- confirmed on this project) so the count visibly climbs while someone is
-- sitting on the waiting screen. The lock deadline also drops from 3 hours to
-- 6 minutes: a live-feeling pool shouldn't require an hours-long wait — the
-- trickle typically gets a good chunk of the way to 48 within that window,
-- and whatever's left is filled instantly (same as before) the moment the
-- pool locks, exactly like it already did.
--
-- `create or replace function` patch on top of 43 (+44) — same signatures,
-- existing grants still apply. Only new thing is the `next_trickle_at` column.
--
-- Idempotent. Run after 43_soccer_wc_online.sql (and 44, if applied).
-- ----------------------------------------------------------------------------

alter table soccer_wc_seasons add column if not exists next_trickle_at timestamptz;

-- Backstop dropped 3h -> 6min. Centralized here so it's a one-line tune later.
create or replace function _soccer_wc_lock_window() returns interval
language sql immutable as $$ select interval '6 minutes'; $$;

-- How long until the NEXT trickle add (45-75s, "every minute or so").
create or replace function _soccer_wc_trickle_window() returns interval
language sql volatile as $$ select make_interval(secs => 45 + random()*30); $$;

-- Add a couple of undisclosed bots to the currently-open season if its next
-- trickle is due. Locks (and simulates) immediately if this push reaches 48.
create or replace function _soccer_wc_maybe_trickle_open_season() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_season soccer_wc_seasons%rowtype;
  v_count int; v_add int; v_bot jsonb; v_bot_ov numeric; i int;
begin
  select * into v_season from soccer_wc_seasons where status='open'
    order by opened_at limit 1 for update skip locked;
  if not found then return; end if;
  if v_season.next_trickle_at is not null and now() < v_season.next_trickle_at then return; end if;

  select count(*) into v_count from soccer_wc_entrants where season_id = v_season.id;
  if v_count >= 48 then
    perform _soccer_wc_lock_season(v_season.id);
    return;
  end if;

  v_add := least(48 - v_count, 2 + floor(random()*4)::int);   -- 2-5 per tick
  for i in 1..v_add loop
    select picks, overall into v_bot, v_bot_ov from _soccer_wc_bot_squad();
    insert into soccer_wc_entrants(season_id, is_bot, name, flag, picks, overall)
      values (v_season.id, true, _soccer_wc_bot_name(), _soccer_wc_bot_flag(), v_bot, v_bot_ov);
  end loop;

  update soccer_wc_seasons
     set next_trickle_at = now() + _soccer_wc_trickle_window()
   where id = v_season.id;

  if v_count + v_add >= 48 then
    perform _soccer_wc_lock_season(v_season.id);
  end if;
end;
$$;

-- soccer_wc_pool_state: trickle-check on every poll (the client polls this
-- every 4s while on the "waiting in the pool" screen, plenty frequent for a
-- 45-75s trickle interval to fire close to on schedule).
create or replace function soccer_wc_pool_state()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_season soccer_wc_seasons%rowtype; v_count int;
begin
  perform _soccer_wc_check_due_seasons();
  perform _soccer_wc_maybe_trickle_open_season();
  select * into v_season from soccer_wc_seasons where status='open' order by opened_at limit 1;
  if not found then
    return jsonb_build_object('season_id', null, 'count', 0, 'lock_deadline', null);
  end if;
  select count(*) into v_count from soccer_wc_entrants where season_id=v_season.id;
  return jsonb_build_object('season_id', v_season.id, 'count', v_count, 'lock_deadline', v_season.lock_deadline);
end;
$$;

-- soccer_wc_join: same trickle check, plus stamp next_trickle_at on any newly
-- created season (the fresh-season insert here previously left it null).
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
  perform _soccer_wc_maybe_trickle_open_season();

  select * into v_season from soccer_wc_seasons where status='open' order by opened_at limit 1 for update;
  if not found then
    insert into soccer_wc_seasons(status, lock_deadline, next_trickle_at)
      values ('open', now() + _soccer_wc_lock_window(), now() + _soccer_wc_trickle_window())
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

-- _soccer_wc_lock_season: only the tail "start the next season" insert
-- changes, to also stamp next_trickle_at.
create or replace function _soccer_wc_lock_season(p_season_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_count int; v_needed int; i int;
  v_bot jsonb; v_bot_ov numeric;
  v_round_idx int; v_stage text;
  v_stage_names text[] := array['r32','r16','qf','sf','final'];
  v_seat_count int; v_match_count int; m int;
  a_id uuid; b_id uuid; a_ov numeric; b_ov numeric;
  gres record; kres record;
  v_champion uuid;
begin
  perform setseed( (abs(hashtext(p_season_id::text)) % 1000000)::float/500000.0 - 1.0 );

  -- ---- bot-fill up to 48 ----
  select count(*) into v_count from soccer_wc_entrants where season_id = p_season_id;
  v_needed := greatest(0, 48 - v_count);
  for i in 1..v_needed loop
    select picks, overall into v_bot, v_bot_ov from _soccer_wc_bot_squad();
    insert into soccer_wc_entrants(season_id, is_bot, name, flag, picks, overall)
      values (p_season_id, true, _soccer_wc_bot_name(), _soccer_wc_bot_flag(), v_bot, v_bot_ov);
  end loop;

  -- ---- 16 groups of 3, seeded shuffle ----
  with shuffled as (
    select id, row_number() over (order by random()) - 1 as rn
    from soccer_wc_entrants where season_id = p_season_id
  )
  update soccer_wc_entrants e set group_no = s.rn/3, group_pos = s.rn%3
  from shuffled s where s.id = e.id;

  -- ---- group stage: round-robin (0v1, 0v2, 1v2) per group ----
  for i in 0..15 loop
    for gres in select * from (values (0,1),(0,2),(1,2)) as p(pa,pb) loop
      select id, overall into a_id, a_ov from soccer_wc_entrants
        where season_id=p_season_id and group_no=i and group_pos=gres.pa;
      select id, overall into b_id, b_ov from soccer_wc_entrants
        where season_id=p_season_id and group_no=i and group_pos=gres.pb;

      select * into kres from _soccer_wc_sim_group(a_ov, b_ov);

      insert into soccer_wc_matches(season_id, stage, group_no, entrant_a, entrant_b, goals_a, goals_b, winner_entrant_id)
        values (p_season_id, 'group', i, a_id, b_id, kres.goals_a, kres.goals_b,
                case when kres.res='W' then a_id when kres.res='L' then b_id else null end);

      update soccer_wc_entrants set
          gf = gf + kres.goals_a, ga = ga + kres.goals_b,
          pts = pts + case when kres.res='W' then 3 when kres.res='D' then 1 else 0 end
        where id = a_id;
      update soccer_wc_entrants set
          gf = gf + kres.goals_b, ga = ga + kres.goals_a,
          pts = pts + case when kres.res='W' then 0 when kres.res='D' then 1 else 3 end
        where id = b_id;
    end loop;
  end loop;

  -- ---- standings: top 2 per group advance ----
  with ranked as (
    select id, row_number() over (
      partition by group_no order by pts desc, (gf-ga) desc, gf desc, random()
    ) as rnk
    from soccer_wc_entrants where season_id = p_season_id
  )
  update soccer_wc_entrants e set advanced = (r.rnk <= 2), group_rank = r.rnk,
         eliminated_round = case when r.rnk > 2 then 'group' else null end
  from ranked r where r.id = e.id;

  -- ---- seed the Round of 32: winner(group g) vs runner-up(group (g+8)%16) ----
  create temp table if not exists _wc_round(seat int, entrant_id uuid) on commit drop;
  create temp table if not exists _wc_next(seat int, entrant_id uuid) on commit drop;
  truncate _wc_round; truncate _wc_next;

  insert into _wc_round(seat, entrant_id)
    select g*2, (select id from soccer_wc_entrants
                  where season_id=p_season_id and group_no=g and group_rank=1)
    from generate_series(0,15) g;
  insert into _wc_round(seat, entrant_id)
    select g*2+1, (select id from soccer_wc_entrants
                    where season_id=p_season_id and group_no=((g+8)%16) and group_rank=2)
    from generate_series(0,15) g;

  -- ---- knockout: Round of 32 -> Round of 16 -> QF -> SF -> Final ----
  for v_round_idx in 0..4 loop
    v_stage := v_stage_names[v_round_idx+1];
    select count(*) into v_seat_count from _wc_round;
    v_match_count := v_seat_count/2;
    truncate _wc_next;

    for m in 0..v_match_count-1 loop
      select entrant_id into a_id from _wc_round where seat = m*2;
      select entrant_id into b_id from _wc_round where seat = m*2+1;
      select overall into a_ov from soccer_wc_entrants where id = a_id;
      select overall into b_ov from soccer_wc_entrants where id = b_id;

      select * into kres from _soccer_wc_sim_knockout(a_ov, b_ov, v_round_idx);

      insert into soccer_wc_matches(season_id, stage, entrant_a, entrant_b, goals_a, goals_b, winner_entrant_id)
        values (p_season_id, v_stage, a_id, b_id, kres.goals_a, kres.goals_b,
                case when kres.a_wins then a_id else b_id end);

      update soccer_wc_entrants set eliminated_round = v_stage
        where id = (case when kres.a_wins then b_id else a_id end);

      insert into _wc_next(seat, entrant_id)
        values (m, case when kres.a_wins then a_id else b_id end);
    end loop;

    truncate _wc_round;
    insert into _wc_round select * from _wc_next;
  end loop;

  select entrant_id into v_champion from _wc_round where seat = 0;
  update soccer_wc_entrants set eliminated_round = 'champion' where id = v_champion;

  -- ---- profile stats: titles + games played, real accounts only ----
  update profiles set soccer_wc_titles = soccer_wc_titles + 1
    where id = (select user_id from soccer_wc_entrants where id = v_champion and user_id is not null);
  update profiles set soccer_wc_played = soccer_wc_played + 1
    where id in (select user_id from soccer_wc_entrants where season_id = p_season_id and user_id is not null);

  update soccer_wc_seasons
     set status = 'done', locked_at = now(), champion_entrant = v_champion, updated_at = now()
   where id = p_season_id;

  -- the pool is always open: start the next one immediately
  insert into soccer_wc_seasons(status, lock_deadline, next_trickle_at)
    values ('open', now() + _soccer_wc_lock_window(), now() + _soccer_wc_trickle_window());
end;
$$;

-- Backfill next_trickle_at for any already-open season from an earlier
-- migration (it would be null otherwise, and the trickle function treats
-- null as "due immediately" — which is fine, but this makes it explicit).
update soccer_wc_seasons set next_trickle_at = now()
 where status = 'open' and next_trickle_at is null;
