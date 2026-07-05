-- ============================================================================
-- 49_soccer_wc_groups_of_4.sql  —  12 groups of 4 (real World Cup format),
--                                    top 2 + best 8 third-place teams advance
-- ============================================================================
-- Switches the group stage from 16 groups of 3 (top 2 advance) to 12 groups
-- of 4 (top 2 automatically advance, PLUS the best 8 of the 12 third-place
-- teams — ranked against each other the same way group standings are —
-- advance too). That's exactly the actual 2026 World Cup format, and still
-- lands on a clean 32-team knockout bracket (24 + 8 = 32), so the existing
-- Round of 32 -> Final knockout logic is untouched.
--
-- The Round of 32 draw itself is a best-effort shuffle that avoids pairing
-- two teams from the same original group in the very first round — NOT the
-- official FIFA draw table (which depends on exactly which combination of
-- thirds qualified). This is a simulation, not a licensed broadcast.
--
-- Adds soccer_wc_entrants.third_rank (1-12, only set for group_rank=3 rows)
-- so the client can render a "Best Third-Place Teams" table and know exactly
-- where the cutoff between advancing and eliminated falls.
--
-- `create or replace function` patch on top of 43/45/46/47 — same
-- signatures. Idempotent. Run after 48_soccer_h2h_stall_recovery.sql.
-- ----------------------------------------------------------------------------

alter table soccer_wc_entrants add column if not exists third_rank int;

create or replace function _soccer_wc_lock_season(p_season_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_count int; v_needed int; i int;
  v_bot jsonb; v_bot_ov numeric; v_botrow record;
  v_round_idx int; v_stage text;
  v_stage_names text[] := array['r32','r16','qf','sf','final'];
  v_seat_count int; v_match_count int; m int;
  a_id uuid; b_id uuid; a_ov numeric; b_ov numeric;
  gres record; kres record;
  v_champion uuid;
  v_qual_ids uuid[]; v_qual_grp int[];
  v_tmp_id uuid; v_tmp_grp int; v_j int; v_k int; v_pass int;
begin
  perform setseed( (abs(hashtext(p_season_id::text)) % 1000000)::float/500000.0 - 1.0 );

  -- ---- bot-fill up to 48, one persistent identity per slot, none repeated ----
  select count(*) into v_count from soccer_wc_entrants where season_id = p_season_id;
  v_needed := greatest(0, 48 - v_count);
  for v_botrow in
    select id, name, flag from soccer_bots
      where id not in (
        select bot_id from soccer_wc_entrants where season_id = p_season_id and bot_id is not null
      )
      order by random() limit v_needed
  loop
    select picks, overall into v_bot, v_bot_ov from _soccer_wc_bot_squad();
    insert into soccer_wc_entrants(season_id, is_bot, name, flag, picks, overall, bot_id)
      values (p_season_id, true, v_botrow.name, v_botrow.flag, v_bot, v_bot_ov, v_botrow.id);
  end loop;

  -- ---- 12 groups of 4, seeded shuffle ----
  with shuffled as (
    select id, row_number() over (order by random()) - 1 as rn
    from soccer_wc_entrants where season_id = p_season_id
  )
  update soccer_wc_entrants e set group_no = s.rn/4, group_pos = s.rn%4
  from shuffled s where s.id = e.id;

  -- ---- group stage: full round-robin (6 games) per group of 4 ----
  for i in 0..11 loop
    for gres in select * from (values (0,1),(0,2),(0,3),(1,2),(1,3),(2,3)) as p(pa,pb) loop
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

  -- ---- standings within each group of 4: top 2 auto-advance ----
  with ranked as (
    select id, row_number() over (
      partition by group_no order by pts desc, (gf-ga) desc, gf desc, random()
    ) as rnk
    from soccer_wc_entrants where season_id = p_season_id
  )
  update soccer_wc_entrants e set advanced = (r.rnk <= 2), group_rank = r.rnk,
         eliminated_round = case when r.rnk <= 2 then null else 'group' end
  from ranked r where r.id = e.id;

  -- ---- best 8 of the 12 third-place teams also advance ----
  with third_ranked as (
    select id, row_number() over (
      order by pts desc, (gf-ga) desc, gf desc, random()
    ) as trk
    from soccer_wc_entrants where season_id = p_season_id and group_rank = 3
  )
  update soccer_wc_entrants e set third_rank = t.trk,
         advanced = (t.trk <= 8),
         eliminated_round = case when t.trk <= 8 then null else 'group' end
  from third_ranked t where t.id = e.id;

  -- ---- seed the Round of 32 from all 32 qualifiers (24 winners/runners-up +
  -- 8 best thirds), shuffled with a best-effort pass so two teams from the
  -- same original group don't meet in the very first round ----
  create temp table if not exists _wc_qual(rn int, entrant_id uuid, grp int) on commit drop;
  create temp table if not exists _wc_round(seat int, entrant_id uuid) on commit drop;
  create temp table if not exists _wc_next(seat int, entrant_id uuid) on commit drop;
  truncate _wc_qual; truncate _wc_round; truncate _wc_next;

  insert into _wc_qual(rn, entrant_id, grp)
    select row_number() over () - 1, id, group_no
    from (select id, group_no from soccer_wc_entrants
            where season_id = p_season_id and advanced = true order by random()) shuffled;

  select array_agg(entrant_id order by rn), array_agg(grp order by rn)
    into v_qual_ids, v_qual_grp
  from _wc_qual;

  for v_pass in 1..6 loop
    for m in 0..15 loop
      if v_qual_grp[2*m+1] = v_qual_grp[2*m+2] then
        for v_k in 1..30 loop
          v_j := ((2*m+1+v_k) % 32) + 1;
          if v_qual_grp[v_j] <> v_qual_grp[2*m+1] then
            v_tmp_id := v_qual_ids[2*m+2]; v_tmp_grp := v_qual_grp[2*m+2];
            v_qual_ids[2*m+2] := v_qual_ids[v_j]; v_qual_grp[2*m+2] := v_qual_grp[v_j];
            v_qual_ids[v_j] := v_tmp_id; v_qual_grp[v_j] := v_tmp_grp;
            exit;
          end if;
        end loop;
      end if;
    end loop;
  end loop;

  insert into _wc_round(seat, entrant_id)
    select gs.i - 1, v_qual_ids[gs.i] from generate_series(1,32) as gs(i);

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

  -- ---- profile OR bot stats: titles + games played ----
  update profiles set soccer_wc_titles = soccer_wc_titles + 1
    where id = (select user_id from soccer_wc_entrants where id = v_champion and user_id is not null);
  update soccer_bots set wc_titles = wc_titles + 1
    where id = (select bot_id from soccer_wc_entrants where id = v_champion and bot_id is not null);

  update profiles set soccer_wc_played = soccer_wc_played + 1
    where id in (select user_id from soccer_wc_entrants where season_id = p_season_id and user_id is not null);
  update soccer_bots set wc_played = wc_played + 1
    where id in (select bot_id from soccer_wc_entrants where season_id = p_season_id and bot_id is not null);

  update soccer_wc_seasons
     set status = 'done', locked_at = now(), champion_entrant = v_champion, updated_at = now()
   where id = p_season_id;

  -- the pool is always open: start the next one immediately
  insert into soccer_wc_seasons(status, lock_deadline, next_trickle_at)
    values ('open', now() + _soccer_wc_lock_window(), now() + _soccer_wc_trickle_window());
end;
$$;

-- Bracket payload now also carries third_rank so the client can render the
-- "Best Third-Place Teams" table in the correct cross-group order.
create or replace function soccer_wc_bracket(p_season_id uuid)
returns jsonb
language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'season', jsonb_build_object('id', s.id, 'status', s.status, 'champion_entrant', s.champion_entrant),
    'entrants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'name', e.name, 'flag', e.flag, 'is_bot', e.is_bot,
        'group_no', e.group_no, 'group_pos', e.group_pos, 'group_rank', e.group_rank,
        'third_rank', e.third_rank,
        'pts', e.pts, 'gf', e.gf, 'ga', e.ga, 'advanced', e.advanced, 'eliminated_round', e.eliminated_round
      )) from soccer_wc_entrants e where e.season_id = s.id), '[]'::jsonb),
    'matches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'stage', m.stage, 'group_no', m.group_no,
        'entrant_a', m.entrant_a, 'entrant_b', m.entrant_b,
        'goals_a', m.goals_a, 'goals_b', m.goals_b, 'winner_entrant_id', m.winner_entrant_id
      )) from soccer_wc_matches m where m.season_id = s.id), '[]'::jsonb)
  )
  from soccer_wc_seasons s where s.id = p_season_id;
$$;
