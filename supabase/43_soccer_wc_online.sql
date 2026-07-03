-- ============================================================================
-- 43_soccer_wc_online.sql  —  RunThePitch: Online World Cup (48-player pool)
-- ============================================================================
-- Same platform pattern as 42_soccer_h2h_online.sql (RLS-enabled/no-policy
-- tables, SECURITY DEFINER RPCs only, `soccer_wc_`-prefixed to avoid colliding
-- with any other game's schema on this shared Supabase project).
--
-- Unlike Online Friendly (a 1-vs-1 match that two clients can both simulate
-- and reconcile), a 48-entrant tournament has no natural second party to check
-- a result against — so the ENTIRE bracket is computed server-side, once,
-- atomically, when the pool locks. This is a from-scratch SQL port of the
-- win-probability/scoreline formulas already live in soccer/index.html
-- (winProbability/belowThresholdPenalty/eliteBoost/earlyRoundPenalty/
-- simGroupMatchResult's expectedGoals*variance model) — group standings are
-- real round-robin results between real entrants (not solo mode's synthetic
-- groupStageAdvance gate, which only exists there because solo play has no
-- real opponents to stand against). Determinism isn't required across clients
-- here (nobody else re-runs this), only fairness of the formula + a seed tied
-- to the season so a re-run of the same season id is reproducible for
-- debugging.
--
-- Pool cadence (per product decision): always-open — a pool locks once it
-- either fills to 48 or its lock_deadline passes, whichever comes first; bots
-- fill freely below 48 so tournaments run often even with light real traffic.
-- Locking is "lazily" triggered by ordinary traffic (soccer_wc_join /
-- soccer_wc_pool_state both opportunistically check for a due season) since
-- there's no confirmed pg_cron on this project — mirrors the "optional
-- housekeeping, run manually or via pg_cron if available" note elsewhere in
-- this repo's migrations.
--
-- Bots are NEVER disclosed as bots in the client UI. Their squads are drawn
-- from real wc_players rows (not synthetic stats) so they look like real
-- drafts in the bracket view.
--
-- Idempotent. Run after 42_soccer_h2h_online.sql.
-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- profiles: Online World Cup record
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists soccer_wc_titles int not null default 0;
alter table profiles add column if not exists soccer_wc_played int not null default 0;

-- ---------------------------------------------------------------------------
-- tables
-- ---------------------------------------------------------------------------
create table if not exists soccer_wc_seasons (
  id               uuid primary key default gen_random_uuid(),
  status           text not null default 'open' check (status in ('open','done')),
  opened_at        timestamptz not null default now(),
  lock_deadline    timestamptz not null,
  locked_at        timestamptz,
  champion_entrant uuid,
  updated_at       timestamptz not null default now()
);
alter table soccer_wc_seasons enable row level security;
create index if not exists soccer_wc_seasons_open_idx on soccer_wc_seasons(status, opened_at);

create table if not exists soccer_wc_entrants (
  id           uuid primary key default gen_random_uuid(),
  season_id    uuid not null references soccer_wc_seasons(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  is_bot       boolean not null default false,
  name         text not null,
  flag         text not null default 'USA',
  picks        jsonb not null,             -- [{id, slot}] x6
  overall      numeric not null,           -- server-recomputed from wc_players
  group_no     int,                        -- 0..15, assigned at lock
  group_pos    int,                        -- 0/1/2 seat within the group
  group_rank   int,                        -- 1/2/3 final group standing
  pts          int not null default 0,
  gf           int not null default 0,
  ga           int not null default 0,
  advanced     boolean not null default false,
  eliminated_round text,                   -- 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'champion'
  joined_at    timestamptz not null default now(),
  unique(season_id, user_id)
);
alter table soccer_wc_entrants enable row level security;
create index if not exists soccer_wc_entrants_season_idx on soccer_wc_entrants(season_id);

create table if not exists soccer_wc_matches (
  id                uuid primary key default gen_random_uuid(),
  season_id         uuid not null references soccer_wc_seasons(id) on delete cascade,
  stage             text not null check (stage in ('group','r32','r16','qf','sf','final')),
  group_no          int,
  entrant_a         uuid references soccer_wc_entrants(id) on delete cascade,
  entrant_b         uuid references soccer_wc_entrants(id) on delete cascade,
  goals_a           int not null,
  goals_b           int not null,
  winner_entrant_id uuid references soccer_wc_entrants(id),
  created_at        timestamptz not null default now()
);
alter table soccer_wc_matches enable row level security;
create index if not exists soccer_wc_matches_season_idx on soccer_wc_matches(season_id, stage);

-- ---------------------------------------------------------------------------
-- tunable: how long a pool waits for real signups before bots top it off.
-- ---------------------------------------------------------------------------
create or replace function _soccer_wc_lock_window() returns interval
language sql immutable as $$ select interval '3 hours'; $$;

-- ---------------------------------------------------------------------------
-- ported win/scoreline formulas (see soccer/index.html: winProbability,
-- belowThresholdPenalty, eliteBoost, earlyRoundPenalty, simGroupMatchResult)
-- ---------------------------------------------------------------------------
create or replace function _soccer_wc_win_probability(a numeric, b numeric) returns numeric
language sql immutable as $$ select 1.0/(1.0+exp(-(a-b)*0.20)); $$;

create or replace function _soccer_wc_expected_goals(ov numeric) returns numeric
language sql immutable as $$ select (ov/100.0)*1.8; $$;

create or replace function _soccer_wc_below_threshold_penalty(ov numeric) returns numeric
language sql immutable as $$
  select case when ov >= 86 then 1.0 else 0.64*power(0.80, 86-ov) end;
$$;

create or replace function _soccer_wc_early_round_penalty(ov numeric, round_idx int) returns numeric
language sql immutable as $$
  select case
    when ov > 84 then 1.0
    when round_idx >= 2 then 1.0
    else 0.82*power(0.93, 84-ov)
  end;
$$;

create or replace function _soccer_wc_elite_boost(ov numeric) returns numeric
language sql immutable as $$
  select case
    when ov >= 93 then (1.34 + (ov-91)*0.02) * 0.97
    when ov >= 92 then (1.46 + (ov-92)*(1.38-1.46)) * 0.97
    when ov >= 91 then (1.34 + (ov-91)*(1.46-1.34)) * 0.97
    when ov >= 90 then (1.22 + (ov-90)*(1.34-1.22)) * 0.97
    when ov >= 89 then (1.2125 + (ov-89)*(1.22-1.2125)) * 0.97
    when ov >= 86 then (0.92 + (ov-86)*0.0975) * 0.97
    else 1.0
  end;
$$;

create or replace function _soccer_wc_goal_count(ov numeric) returns int
language sql volatile as $$
  select greatest(0, least(5, round(_soccer_wc_expected_goals(ov) * (0.4 + random()*1.2))::int));
$$;

-- One group-stage match: can draw. Mirrors simGroupMatchResult's ~26% draw share.
create or replace function _soccer_wc_sim_group(ov_a numeric, ov_b numeric,
  out goals_a int, out goals_b int, out res text)
language plpgsql volatile as $$
declare
  p_win numeric := _soccer_wc_win_probability(ov_a, ov_b);
  draw_share numeric := 0.26;
  r numeric := random();
begin
  if r < p_win*(1-draw_share) then res := 'W';
  elsif r < p_win*(1-draw_share)+draw_share then res := 'D';
  else res := 'L';
  end if;

  goals_a := _soccer_wc_goal_count(ov_a);
  goals_b := _soccer_wc_goal_count(ov_b);

  if res = 'W' then
    if goals_a <= goals_b then
      goals_a := least(5, goals_b+1);
      if goals_a <= goals_b then goals_b := greatest(0, goals_a-1); end if;
    end if;
  elsif res = 'L' then
    if goals_b <= goals_a then
      goals_b := least(5, goals_a+1);
      if goals_b <= goals_a then goals_a := greatest(0, goals_b-1); end if;
    end if;
  else
    goals_b := goals_a;
  end if;
end;
$$;

-- One knockout match: always decisive (mirrors simulateMatch's post-hoc
-- winner-gets-more-goals enforcement; no draws survive the knockout stage).
create or replace function _soccer_wc_sim_knockout(ov_a numeric, ov_b numeric, round_idx int,
  out goals_a int, out goals_b int, out a_wins boolean)
language plpgsql volatile as $$
declare
  base_prob numeric := _soccer_wc_win_probability(ov_a, ov_b);
  final_prob_a numeric;
  gap numeric := ov_a - ov_b;
  max_prob numeric := least(0.975, 0.94 + greatest(0, gap-10)*0.0025);
begin
  final_prob_a := base_prob * _soccer_wc_below_threshold_penalty(ov_a)
                            * _soccer_wc_elite_boost(ov_a)
                            * _soccer_wc_early_round_penalty(ov_a, round_idx);
  final_prob_a := least(final_prob_a, max_prob);
  a_wins := random() < final_prob_a;

  goals_a := _soccer_wc_goal_count(ov_a);
  goals_b := _soccer_wc_goal_count(ov_b);

  if a_wins and goals_a <= goals_b then
    if goals_b >= 5 then goals_b := 4; goals_a := 5;
    else goals_a := goals_b + 1; end if;
  elsif (not a_wins) and goals_b <= goals_a then
    if goals_a >= 5 then goals_a := 4; goals_b := 5;
    else goals_b := goals_a + 1; end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- bot squad: 6 real wc_players ids drawn from a randomized overall band, so a
-- bot's roster looks exactly like a real draft in the bracket view.
-- ---------------------------------------------------------------------------
create or replace function _soccer_wc_bot_squad(out picks jsonb, out overall numeric)
language plpgsql volatile as $$
declare
  v_lo numeric := 60 + random()*15;
  v_hi numeric := v_lo + 15 + random()*10;
  v_ids text[];
  v_slots text[] := array['GK','DEF','DEF','MID','FWD','FLEX'];
  n_found int; v_avg numeric; v_num99 int; v_caps int; v_awards int;
begin
  select array_agg(player_id) into v_ids from (
    (select player_id from wc_players where position='GK'  and wc_overall between v_lo and v_hi order by random() limit 1)
    union all
    (select player_id from wc_players where position='DEF' and wc_overall between v_lo and v_hi order by random() limit 2)
    union all
    (select player_id from wc_players where position='MID' and wc_overall between v_lo and v_hi order by random() limit 1)
    union all
    (select player_id from wc_players where position='FWD' and wc_overall between v_lo and v_hi order by random() limit 1)
    union all
    (select player_id from wc_players where wc_overall between v_lo and v_hi order by random() limit 1)
  ) s;

  if coalesce(array_length(v_ids,1),0) < 6 then
    select array_agg(player_id) into v_ids from (
      (select player_id from wc_players where position='GK' order by random() limit 1)
      union all (select player_id from wc_players where position='DEF' order by random() limit 2)
      union all (select player_id from wc_players where position='MID' order by random() limit 1)
      union all (select player_id from wc_players where position='FWD' order by random() limit 1)
      union all (select player_id from wc_players order by random() limit 1)
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

-- Believable bot identities — never surfaced as bots anywhere in the UI.
create or replace function _soccer_wc_bot_name() returns text
language sql volatile as $$
  select (array[
    'PitchKing','StrikerX22','GoalMachine','TikiTakaTom','FutbolFanatic','TheGaffer',
    'MidfieldMaestro','CleanSheetKid','NetBuster','BoxToBox','WingWizard','ElCapitan',
    'TouchlineTerror','FreeKickFred','LastManStanding','OffsideOllie','CounterAttack',
    'FullTimeWhistle','SixYardSam','CrossbarChris','VolleyVic','NutmegNate','CaptainArmband',
    'DerbyDayDan','StoppageTimeHero','HatTrickHana','CornerKickKid','PenaltyPro','SweeperKeeper',
    'TotalFootball','GegenpressGus','LaLigaLuis','SerieAFan','BundesligaBen','PremGoals',
    'TifoTerry','UltrasUnited','MatchdayMel','LoneStriker9','TheFalseNine','InvertedWinger',
    'BoxOfficeBaller','ClinicalFinisher','ManOfTheMatch','TrebleChaser','TrophyHunter7',
    'PitchInvader','GroupStageGrinder','KnockoutKid','ExtraTimeEddie'
  ])[1+floor(random()*49)];
$$;

create or replace function _soccer_wc_bot_flag() returns text
language sql volatile as $$
  select (array['USA','BRA','ARG','GER','FRA','ESP','ENG','POR','NED','ITA',
                'MEX','JPN','KOR','MAR','SEN','NGA','HRV','BEL','URY','COL'])[1+floor(random()*20)];
$$;

-- ---------------------------------------------------------------------------
-- lock a season: bot-fill to 48, draw 16 groups of 3, play the round-robin
-- group stage, seed 32 into the knockout bracket, play it out to a champion.
-- Runs once, atomically, inside the caller's transaction.
-- ---------------------------------------------------------------------------
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
  insert into soccer_wc_seasons(status, lock_deadline)
    values ('open', now() + _soccer_wc_lock_window());
end;
$$;

-- Check every currently-open season; lock any that are past their deadline.
-- An all-bot season (nobody real ever joined) just gets pushed back rather
-- than run for no one.
create or replace function _soccer_wc_check_due_seasons() returns void
language plpgsql security definer set search_path = public as $$
declare r record; v_real int;
begin
  for r in select id from soccer_wc_seasons where status='open' and now() >= lock_deadline
           for update skip locked
  loop
    select count(*) into v_real from soccer_wc_entrants where season_id = r.id and user_id is not null;
    if v_real = 0 then
      update soccer_wc_seasons set lock_deadline = now() + _soccer_wc_lock_window() where id = r.id;
    else
      perform _soccer_wc_lock_season(r.id);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- join the currently open pool (or create it, if none is open yet). Locks
-- immediately once this join brings the pool to 48.
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

  if n_ids <> 6 then raise exception 'the world cup pool needs exactly 6 players, got %', n_ids; end if;
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

-- Poll target for the "waiting in the pool" screen. Also opportunistically
-- locks any season whose deadline has passed, so a lock isn't stuck waiting
-- on someone to call soccer_wc_join.
create or replace function soccer_wc_pool_state()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_season soccer_wc_seasons%rowtype; v_count int;
begin
  perform _soccer_wc_check_due_seasons();
  select * into v_season from soccer_wc_seasons where status='open' order by opened_at limit 1;
  if not found then
    return jsonb_build_object('season_id', null, 'count', 0, 'lock_deadline', null);
  end if;
  select count(*) into v_count from soccer_wc_entrants where season_id=v_season.id;
  return jsonb_build_object('season_id', v_season.id, 'count', v_count, 'lock_deadline', v_season.lock_deadline);
end;
$$;

-- The caller's own entry (current pool or their most recent finished run),
-- so the client can render "waiting..." vs "you reached the Quarter-final".
create or replace function soccer_wc_my_entry()
returns jsonb
language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'season_id', e.season_id, 'entrant_id', e.id, 'status', s.status,
    'group_no', e.group_no, 'group_rank', e.group_rank, 'advanced', e.advanced,
    'eliminated_round', e.eliminated_round, 'pts', e.pts, 'gf', e.gf, 'ga', e.ga
  )
  from soccer_wc_entrants e
  join soccer_wc_seasons s on s.id = e.season_id
  where e.user_id = auth.uid()
  order by e.joined_at desc
  limit 1;
$$;

-- Full bracket for a season (entrants + every match), for the bracket-view screen.
create or replace function soccer_wc_bracket(p_season_id uuid)
returns jsonb
language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'season', jsonb_build_object('id', s.id, 'status', s.status, 'champion_entrant', s.champion_entrant),
    'entrants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'name', e.name, 'flag', e.flag, 'is_bot', e.is_bot,
        'group_no', e.group_no, 'group_pos', e.group_pos, 'group_rank', e.group_rank,
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

-- Online World Cup leaderboard (titles won).
create or replace function soccer_wc_board(p_limit int default 100)
returns table(username text, flag text, titles int, played int)
language sql security definer set search_path = public stable as $$
  select username::text, flag, soccer_wc_titles, soccer_wc_played
  from profiles
  where soccer_wc_played > 0
  order by soccer_wc_titles desc, soccer_wc_played desc
  limit greatest(1, least(200, coalesce(p_limit, 100)));
$$;

-- ---------------------------------------------------------------------------
-- grants (all access via these RPCs; tables stay locked by RLS-with-no-policy)
-- ---------------------------------------------------------------------------
revoke all on function soccer_wc_join(text[], text[])   from public;
revoke all on function soccer_wc_pool_state()            from public;
revoke all on function soccer_wc_my_entry()               from public;
revoke all on function soccer_wc_bracket(uuid)            from public;
revoke all on function soccer_wc_board(int)                from public;

grant execute on function soccer_wc_join(text[], text[]) to authenticated;
grant execute on function soccer_wc_pool_state()          to authenticated, anon;
grant execute on function soccer_wc_my_entry()            to authenticated;
grant execute on function soccer_wc_bracket(uuid)         to authenticated, anon;
grant execute on function soccer_wc_board(int)            to authenticated, anon;

-- Seed the very first open season if this migration runs on a fresh install.
insert into soccer_wc_seasons(status, lock_deadline)
  select 'open', now() + _soccer_wc_lock_window()
  where not exists (select 1 from soccer_wc_seasons where status = 'open');
