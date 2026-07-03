-- ============================================================================
-- 47_soccer_bots_persistent.sql  —  persistent bot identities + fixed flags
-- ============================================================================
-- Two bugs from the original bot system:
--   1. Bot flags were 3-letter codes ('USA','BRA','GER',...) but flagChip()/
--      FLAG_CODES in soccer/index.html is keyed by full country names (or the
--      literal 'USA') — every bot except an accidental 'USA' hit rendered a
--      blank/gray flag placeholder.
--   2. Bots got a brand-new throwaway name every single match/tournament, so
--      there was no persistent record for them to accumulate — the W/L
--      leaderboards could never actually look "populated," which was the
--      whole point of the bot system from the start (mimic real, active
--      users). A fresh name every time can't have a win/loss history.
--
-- Fix: soccer_bots is a small fixed roster (~65) of persistent identities with
-- correct flags. Online Friendly's bot-backfill and World Cup's bot-fill both
-- draw from this SAME pool now (instead of inventing a name), crediting wins/
-- losses/titles/played to that specific bot so it actually accumulates a
-- record — and both leaderboard RPCs now union soccer_bots in with profiles,
-- so the boards read as populated from day one. Still never disclosed as
-- bots anywhere in the UI.
--
-- `create or replace function` patches on top of 42/43/45/46 (same
-- signatures except soccer_h2h_record_bot_match, which drops its two
-- now-server-decided params — see the explicit drop/grant at the bottom).
--
-- Idempotent. Run after 46_soccer_wc_pool_trickle_v2.sql.
-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- table + seed roster
-- ---------------------------------------------------------------------------
create table if not exists soccer_bots (
  id              serial primary key,
  name            text not null unique,
  flag            text not null,
  h2h_wins        int not null default 0,
  h2h_losses      int not null default 0,
  h2h_streak      int not null default 0,
  h2h_best_streak int not null default 0,
  wc_titles       int not null default 0,
  wc_played       int not null default 0
);
alter table soccer_bots enable row level security;

insert into soccer_bots (name, flag)
select name, (array['USA','Brazil','Argentina','Germany','France','Spain','England',
       'Portugal','Netherlands','Italy','Mexico','Japan','South Korea','Morocco','Senegal',
       'Nigeria','Croatia','Belgium','Uruguay','Colombia'])[1 + ((rn-1) % 20)]
-- `with ordinality` is required here, not row_number() over() — Postgres
-- computes window functions BEFORE expanding a set-returning function used
-- in the SELECT list, so row_number() over() sees only one input row and
-- returns 1 for every expanded element (silently giving every bot the same
-- flag). with ordinality ties the ordinal to the unnest itself instead.
from unnest(array[
    'PitchKing','StrikerX22','GoalMachine','TikiTakaTom','FutbolFanatic','TheGaffer',
    'MidfieldMaestro','CleanSheetKid','NetBuster','BoxToBox','WingWizard','ElCapitan',
    'TouchlineTerror','FreeKickFred','LastManStanding','OffsideOllie','CounterAttack',
    'FullTimeWhistle','SixYardSam','CrossbarChris','VolleyVic','NutmegNate','CaptainArmband',
    'DerbyDayDan','StoppageTimeHero','HatTrickHana','CornerKickKid','PenaltyPro','SweeperKeeper',
    'TotalFootball','GegenpressGus','LaLigaLuis','SerieAFan','BundesligaBen','PremGoals',
    'TifoTerry','UltrasUnited','MatchdayMel','LoneStriker9','TheFalseNine','InvertedWinger',
    'BoxOfficeBaller','ClinicalFinisher','ManOfTheMatch','TrebleChaser','TrophyHunter7',
    'PitchInvader','GroupStageGrinder','KnockoutKid','ExtraTimeEddie',
    'WingbackWiz','SweatEquitySam','ClinicalClint','BoxToBoxBrenda','ThePlaymaker',
    'SetPieceSam','CounterPresser','TotalFootballTia','LibraryLuis','GaffersPet',
    'TouchlineTina','ExtraTimeElla','ShootoutSammy','PressingPete','OverlapOscar'
  ]) with ordinality as t(name, rn)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Online Friendly: bot-backfill now draws a persistent identity and updates
-- ITS record, not a one-off name that vanishes after the match.
-- ---------------------------------------------------------------------------
drop function if exists soccer_h2h_record_bot_match(uuid, int, int, text, text, text);

create or replace function soccer_h2h_record_bot_match(
  p_match_id uuid, p_host_goals int, p_guest_goals int, p_winner text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_match soccer_h2h_matches%rowtype;
  v_bot soccer_bots%rowtype;
begin
  if uid is null then raise exception 'must be signed in to play online'; end if;
  if p_winner not in ('host','guest') then raise exception 'invalid winner'; end if;

  select * into v_match from soccer_h2h_matches where id = p_match_id for update;
  if not found then raise exception 'no such match'; end if;
  if v_match.host <> uid then raise exception 'only the host can record a bot match'; end if;
  if v_match.guest is not null then raise exception 'a real opponent already joined this match'; end if;
  if v_match.status in ('done','void') then return _soccer_h2h_state_json(p_match_id); end if;

  select * into v_bot from soccer_bots order by random() limit 1;

  update soccer_h2h_matches
     set guest_is_bot = true, guest_name = v_bot.name, guest_flag = v_bot.flag,
         status = 'done', host_goals = p_host_goals, guest_goals = p_guest_goals, winner = p_winner,
         updated_at = now()
   where id = p_match_id;

  perform _soccer_h2h_apply_result(p_match_id);   -- host's own (real) W/L

  if p_winner = 'host' then
    update soccer_bots set h2h_losses = h2h_losses + 1, h2h_streak = 0 where id = v_bot.id;
  else
    update soccer_bots set h2h_wins = h2h_wins + 1, h2h_streak = h2h_streak + 1,
           h2h_best_streak = greatest(h2h_best_streak, h2h_streak + 1) where id = v_bot.id;
  end if;

  return jsonb_build_object('guest_name', v_bot.name, 'guest_flag', v_bot.flag);
end;
$$;

revoke all on function soccer_h2h_record_bot_match(uuid, int, int, text) from public;
grant execute on function soccer_h2h_record_bot_match(uuid, int, int, text) to authenticated;

-- Leaderboard now unions the persistent bot roster with real accounts.
create or replace function soccer_h2h_board(p_limit int default 100)
returns table(username text, flag text, wins int, losses int, streak int, best_streak int)
language sql security definer set search_path = public stable as $$
  select * from (
    select username::text, flag, soccer_h2h_wins as wins, soccer_h2h_losses as losses,
           soccer_h2h_streak as streak, soccer_h2h_best_streak as best_streak
    from profiles
    where soccer_h2h_wins + soccer_h2h_losses > 0
    union all
    select name::text, flag, h2h_wins as wins, h2h_losses as losses,
           h2h_streak as streak, h2h_best_streak as best_streak
    from soccer_bots
    where h2h_wins + h2h_losses > 0
  ) t
  order by wins desc, (wins - losses) desc, best_streak desc
  limit greatest(1, least(200, coalesce(p_limit, 100)));
$$;

-- ---------------------------------------------------------------------------
-- World Cup: bot-fill (both the initial big batch and the one-by-one
-- trickle) now draws DISTINCT persistent identities not already seated in
-- this season, and the champion/played crediting flows to soccer_bots too.
-- ---------------------------------------------------------------------------
alter table soccer_wc_entrants add column if not exists bot_id int references soccer_bots(id);

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

-- One-by-one trickle: same "distinct persistent identity" sourcing.
create or replace function _soccer_wc_maybe_trickle_open_season() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_season soccer_wc_seasons%rowtype;
  v_count int; v_bot jsonb; v_bot_ov numeric; v_botrow record;
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

  select id, name, flag into v_botrow from soccer_bots
    where id not in (
      select bot_id from soccer_wc_entrants where season_id = v_season.id and bot_id is not null
    )
    order by random() limit 1;

  if v_botrow.id is not null then
    select picks, overall into v_bot, v_bot_ov from _soccer_wc_bot_squad();
    insert into soccer_wc_entrants(season_id, is_bot, name, flag, picks, overall, bot_id)
      values (v_season.id, true, v_botrow.name, v_botrow.flag, v_bot, v_bot_ov, v_botrow.id);
  end if;

  update soccer_wc_seasons
     set next_trickle_at = now() + _soccer_wc_trickle_window()
   where id = v_season.id;

  if v_count + 1 >= 48 then
    perform _soccer_wc_lock_season(v_season.id);
  end if;
end;
$$;

-- Leaderboard now unions the persistent bot roster with real accounts.
create or replace function soccer_wc_board(p_limit int default 100)
returns table(username text, flag text, titles int, played int)
language sql security definer set search_path = public stable as $$
  select * from (
    select username::text, flag, soccer_wc_titles as titles, soccer_wc_played as played
    from profiles where soccer_wc_played > 0
    union all
    select name::text, flag, wc_titles as titles, wc_played as played
    from soccer_bots where wc_played > 0
  ) t
  order by titles desc, played desc
  limit greatest(1, least(200, coalesce(p_limit, 100)));
$$;
