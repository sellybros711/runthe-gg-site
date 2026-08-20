-- ============================================================================
-- 86_football_defense_stats.sql : what a defense season is judged on, stored
-- ============================================================================
-- RUN THIS BEFORE THE DEPLOY THAT SENDS THE COLUMNS, the same order 80 and 81
-- took for the mode itself. Between the two nothing changes: the client is not
-- sending these fields until the new page lands.
--
-- ----------------------------------------------------------------------------
-- WHY THESE THREE HAVE TO BE STORED WHEN NOTHING ELSE IS
-- ----------------------------------------------------------------------------
-- Every other number the badge cabinet reads is derived from the row, which is
-- why the cabinet is retroactive. Points allowed, forced turnovers and
-- defensive touchdowns cannot be: they are worked out from each game's own
-- seeded script at the moment the results screen paints, and the row keeps
-- neither the seed nor the game scores. So they are visible on your own run
-- and invisible on everybody else's, which is the wrong way round for the two
-- numbers that say what a drafted defense actually did.
--
-- Three columns, written once at submit, and every screen that shows a run can
-- show them from then on: the results screen, the share card, the run detail
-- sheet off the leaderboard, and the career list.
--
-- ----------------------------------------------------------------------------
-- WHAT THIS COSTS
-- ----------------------------------------------------------------------------
-- Rows written before this stay null and read as blank rather than as zero, in
-- the same way the Trade Machine's two columns did: absent is not zero. Defense
-- runs recorded before today therefore show a record and a rating and nothing
-- about takeaways, forever. That is the price of not having stored them, and it
-- is why this file exists rather than a client-side recomputation: without the
-- seed there is nothing to recompute from.
--
-- ----------------------------------------------------------------------------
-- THE FUNCTION IS DROPPED AND RECREATED, WHICH IS DELIBERATE
-- ----------------------------------------------------------------------------
-- Appending defaulted parameters to a CREATE OR REPLACE does not replace the
-- function, it creates a SECOND one with a different signature, and a call
-- carrying the old key set then matches both and fails as ambiguous. So the old
-- signature is dropped first. Old clients keep working across the change: every
-- new parameter is defaulted, so a body sending yesterday's keys resolves to
-- the one function that now exists.
-- ----------------------------------------------------------------------------

alter table ps_runs add column if not exists def_takeaways  int;
alter table ps_runs add column if not exists def_tds        int;
alter table ps_runs add column if not exists points_allowed numeric;

comment on column ps_runs.def_takeaways is
  'Defense runs only: interceptions plus forced fumbles across the season, derived on the client from each game seed.';
comment on column ps_runs.def_tds is
  'Defense runs only: takeaways returned for a touchdown.';
comment on column ps_runs.points_allowed is
  'Defense runs only: points allowed a game, one decimal.';

-- The table takes the same view of them the function does, so a row cannot be
-- written past the function with a number the game could not produce.
alter table ps_runs drop constraint if exists ps_runs_def_stats_ck;
alter table ps_runs add constraint ps_runs_def_stats_ck check (
  (def_takeaways is null or (def_takeaways between 0 and 120))
  and (def_tds is null or (def_tds between 0 and 30))
  and (points_allowed is null or (points_allowed between 0 and 80))
  and (def_tds is null or def_takeaways is null or def_tds <= def_takeaways)
  and (run_mode = 'defense'
       or (def_takeaways is null and def_tds is null and points_allowed is null))
);

drop function if exists ps_submit_run(int,int,numeric,numeric,numeric,int,text,text,
  text[],text[],text,int,numeric,numeric,numeric,int,text,text,numeric,jsonb);

create or replace function ps_submit_run(
  p_regular_wins  int,
  p_playoff_wins  int,
  p_point_diff    numeric,
  p_chemistry_pct numeric,
  p_spend_musd    numeric,
  p_respins       int      default 0,
  p_franchise     text     default null,
  p_daily_date    text     default null,
  p_picks         text[]   default null,
  p_slots         text[]   default null,
  p_seed          text     default null,
  p_rng_calls     int      default null,
  p_squad_fppg    numeric  default null,
  p_structure_mult numeric default null,
  p_team_rating   numeric  default null,
  p_perfect_pct   int      default null,
  p_mode          text     default 'free',
  p_era           text     default null,
  -- Both defaulted, so a browser holding a cached copy of the page keeps recording runs.
  p_gm_rating     numeric  default null,
  p_trade_moves   jsonb    default null,
  -- THE THREE NUMBERS A DEFENSE SEASON IS JUDGED ON. Defaulted for the same reason
  -- the two above are: a browser holding yesterday's page sends neither and still
  -- records its run. Null on every other mode, and forced null below if one arrives
  -- on one, because "12 takeaways" on a One Franchise row is a claim about a game
  -- that was never played.
  p_def_takeaways int      default null,
  p_def_tds       int      default null,
  p_points_allowed numeric default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  PS_REG_GAMES       constant int := 17;
  PS_PLAYOFF_WINS    constant int := 12;
  PS_BYE_SEED_WINS   constant int := 15;
  PS_ROUNDS_BYE      constant int := 3;
  PS_ROUNDS_WILDCARD constant int := 4;
  PS_ROSTER_SIZE     constant int := 6;
  PS_CAP_MUSD        constant numeric := 140;
  -- The Trade Machine's payroll is what it started with plus four windows of 8%
  -- inflation plus any salary taken on in trades, so it is MEANT to be exceedable.
  -- A sanity bound rather than a rule: the worst machine-played season measured
  -- finished at $150.1M and nothing legitimate approaches this.
  PS_TRADE_MAX_MUSD  constant numeric := 300;

  -- Null unless this is a defense run, whatever the client sent.
  v_tk      int;
  v_dtd     int;
  v_pa      numeric;

  v_reg     int := p_regular_wins;
  v_po      int := coalesce(p_playoff_wins, 0);
  v_rounds  int;
  v_title   boolean;
  v_made    boolean;
  v_po_games int;
  v_wins    int;
  v_losses  int;
  v_games   int;
  v_label   text;
  v_dupe    bigint;
  v_id      bigint;
  v_ddate   date;
  v_daily   boolean;
  v_mode    text;
  v_club    text;
  v_era     text;
  v_cap     numeric;
  v_gm      numeric;
  v_moves   jsonb;
  v_user    uuid := auth.uid();
  v_name    text;
begin
  -- ---- which competition ----
  v_mode := lower(btrim(coalesce(p_mode, 'free')));
  if v_mode not in ('free', 'club', 'era', 'trade', 'defense') then
    raise exception 'unknown mode %', p_mode;
  end if;

  -- ── THE DEFENSE COLUMNS, CHECKED AND CONFINED ────────────────────────────
  -- They are derived on the client from the same seed the broadcast uses, which
  -- means they are a claim rather than a fact this function can recompute. So it
  -- does the two things it can: it refuses them on a mode that cannot produce
  -- them, and it bounds them to what a season of football can hold. A defense
  -- forcing 1.3 a game over 21 games lands near 27, so 120 is far past any real
  -- run and still catches a client sending a total in the wrong unit.
  if v_mode = 'defense' then
    v_tk  := p_def_takeaways;
    v_dtd := p_def_tds;
    v_pa  := p_points_allowed;
    if v_tk is not null and (v_tk < 0 or v_tk > 120) then
      raise exception 'takeaways out of range %', v_tk;
    end if;
    if v_dtd is not null and (v_dtd < 0 or v_dtd > 30) then
      raise exception 'defensive touchdowns out of range %', v_dtd;
    end if;
    if v_dtd is not null and v_tk is not null and v_dtd > v_tk then
      raise exception 'more defensive touchdowns than takeaways';
    end if;
    if v_pa is not null and (v_pa < 0 or v_pa > 80) then
      raise exception 'points allowed out of range %', v_pa;
    end if;
    v_pa := round(v_pa, 1);
  else
    v_tk := null; v_dtd := null; v_pa := null;
  end if;

  -- A run from a cached copy of the old page.
  if p_daily_date is null or p_daily_date = '' then
    v_ddate := null; v_daily := false;
  else
    if p_daily_date !~ '^[12][0-9]{3}-[01][0-9]-[0-3][0-9]$' then
      raise exception 'daily date must be YYYY-MM-DD, got %', p_daily_date;
    end if;
    v_ddate := p_daily_date::date;
    v_daily := true;
    v_mode  := 'daily';
    if v_ddate < (now() at time zone 'utc')::date - 1
       or v_ddate > (now() at time zone 'utc')::date + 1 then
      raise exception 'daily date % is not close enough to today', v_ddate;
    end if;
  end if;

  -- ---- franchise (One Franchise) ----
  v_club := nullif(upper(btrim(coalesce(p_franchise, ''))), '');
  if v_club is not null and not ps_is_franchise(v_club) then
    raise exception 'franchise code looks wrong: %', p_franchise;
  end if;
  if v_mode = 'club' and v_club is null then
    raise exception 'a One Franchise run has to say which team';
  end if;

  -- ---- era (Eras Draft) ----
  v_era := nullif(btrim(coalesce(p_era, '')), '');
  if v_mode = 'era' and (v_era is null or v_era not in ('2000s', '2010s', '2020s')) then
    raise exception 'an Eras Draft run has to name a valid decade, got %', p_era;
  end if;
  if v_mode <> 'era' and v_era is not null then
    v_era := null;
  end if;

  -- ---- the record has to be a record this game can produce ----
  if v_reg is null or v_reg < 0 or v_reg > PS_REG_GAMES then
    raise exception 'regular wins must be 0..% , got %', PS_REG_GAMES, v_reg;
  end if;

  if v_reg >= PS_BYE_SEED_WINS then
    v_rounds := PS_ROUNDS_BYE;   v_label := 'Top seed';
  elsif v_reg >= PS_PLAYOFF_WINS then
    v_rounds := PS_ROUNDS_WILDCARD; v_label := 'Wild card';
  else
    v_rounds := 0; v_label := 'Missed the playoffs';
  end if;
  v_made := v_rounds > 0;

  if not v_made then
    if v_po <> 0 then
      raise exception 'playoff wins with % regular wins, which misses the playoffs', v_reg;
    end if;
    v_po_games := 0;
    v_title := false;
  else
    if v_po < 0 or v_po > v_rounds then
      raise exception 'playoff wins must be 0..% for a % seed, got %', v_rounds, v_label, v_po;
    end if;
    v_title := v_po = v_rounds;
    v_po_games := case when v_title then v_rounds else v_po + 1 end;
  end if;

  v_wins   := v_reg + v_po;
  v_losses := (PS_REG_GAMES - v_reg) + (v_po_games - v_po);
  v_games  := PS_REG_GAMES + v_po_games;

  -- ---- the descriptive numbers have to be in range ----
  if p_point_diff is null or p_point_diff < -60 or p_point_diff > 60 then
    raise exception 'point differential out of range: %', p_point_diff;
  end if;
  if p_chemistry_pct is null or p_chemistry_pct < 0 or p_chemistry_pct > 100 then
    raise exception 'chemistry out of range: %', p_chemistry_pct;
  end if;
  -- THE CAP, AND THE ONE MODE ALLOWED PAST IT. Rejecting an over-cap Trade Machine
  -- payroll threw away real seasons: see the header of this file.
  v_cap := case when v_mode = 'trade' then PS_TRADE_MAX_MUSD else PS_CAP_MUSD end;
  if p_spend_musd is null or p_spend_musd < 0 or p_spend_musd > v_cap then
    raise exception 'spend of % is outside the $%M limit for a % run',
      p_spend_musd, v_cap, v_mode;
  end if;
  if coalesce(p_respins, 0) < 0 or coalesce(p_respins, 0) > 3 then
    raise exception 'respins must be 0..3, got %', p_respins;
  end if;
  if p_squad_fppg is not null and (p_squad_fppg < 0 or p_squad_fppg > 250) then
    raise exception 'squad FPPG out of range: %', p_squad_fppg;
  end if;
  if p_structure_mult is not null and (p_structure_mult < 0.2 or p_structure_mult > 2) then
    raise exception 'structure multiplier out of range: %', p_structure_mult;
  end if;
  if p_team_rating is not null and (p_team_rating < 0 or p_team_rating > 400) then
    raise exception 'team rating out of range: %', p_team_rating;
  end if;
  if p_perfect_pct is not null and (p_perfect_pct < 0 or p_perfect_pct > 100) then
    raise exception 'perfect percentage out of range: %', p_perfect_pct;
  end if;

  -- ---- the roster has to be six distinct, well-formed player-seasons ----
  if p_picks is null or cardinality(p_picks) <> PS_ROSTER_SIZE then
    raise exception 'a run has % picks, got %', PS_ROSTER_SIZE,
      coalesce(cardinality(p_picks), 0);
  end if;
  if cardinality(array(select distinct unnest(p_picks))) <> PS_ROSTER_SIZE then
    raise exception 'the same player cannot be signed twice';
  end if;
  if exists (select 1 from unnest(p_picks) k where k !~ '^[0-9A-Za-z-]{1,32}:[12][0-9]{3}$') then
    raise exception 'a pick is not of the form <player_id>:<season>';
  end if;
  if p_slots is not null then
    if cardinality(p_slots) <> PS_ROSTER_SIZE then
      raise exception 'slots must line up with picks';
    end if;
    -- THE SLOT NAMES BELONG TO THE SIDE OF THE BALL THAT WAS DRAFTED, and this is the
    -- second thing that stopped a One Stop run, after the mode list above. A defensive
    -- roster fills DL DL LB DB DB FLEX, none of which were names this accepted, so even
    -- with the mode allowed the run was rejected on its lineup. Checked against the mode
    -- rather than merged into one list of nine: a free run claiming a DL is not a shape
    -- this game produces either.
    if v_mode = 'defense' then
      if exists (select 1 from unnest(p_slots) s where s not in ('DL','LB','DB','FLEX')) then
        raise exception 'unknown defensive slot name';
      end if;
    else
      if exists (select 1 from unnest(p_slots) s where s not in ('QB','RB','WR','TE','FLEX')) then
        raise exception 'unknown slot name';
      end if;
    end if;
  end if;

  -- ---- the two Trade Machine fields, which belong to that mode alone ----
  if v_mode = 'trade' then
    v_gm := p_gm_rating;
    if v_gm is not null and (v_gm < 0 or v_gm > 100) then
      raise exception 'GM rating out of range: %', v_gm;
    end if;
    v_moves := p_trade_moves;
    if not ps_trade_moves_ok(v_moves) then
      raise exception 'trade moves are not a shape this game produces';
    end if;
  else
    -- Dropped quietly rather than rejected: a client sending these on a free run has
    -- still played a real season, and refusing it would cost somebody that season to
    -- make a point about a field nothing reads.
    v_gm := null;
    v_moves := null;
  end if;

  -- ---- the name, read from the profile and never from the caller ----
  if v_user is not null then
    select username::text into v_name from profiles where id = v_user;
  end if;

  -- ---- swallow an accidental double submit ----
  select id into v_dupe from ps_runs
   where picks = p_picks and regular_wins = v_reg and playoff_wins = v_po
     and run_mode = v_mode
     and created_at > now() - interval '1 minute'
   limit 1;
  if v_dupe is not null then return v_dupe; end if;

  insert into ps_runs (
    user_id, display_name, regular_wins, playoff_wins, wins, losses, games,
    title_won, made_playoffs, perfect, seed_label,
    point_diff, chemistry_pct, spend_musd, respins, franchise, era, run_mode,
    daily, daily_date,
    picks, slots, seed, rng_calls,
    squad_fppg, structure_mult, team_rating, perfect_pct,
    gm_rating, trade_moves,
    def_takeaways, def_tds, points_allowed
  ) values (
    v_user, v_name, v_reg, v_po, v_wins, v_losses, v_games,
    v_title, v_made, (v_title and v_losses = 0), v_label,
    round(p_point_diff, 1), round(p_chemistry_pct, 2), round(p_spend_musd, 1),
    coalesce(p_respins, 0), v_club, v_era, v_mode, v_daily, v_ddate,
    p_picks, p_slots, p_seed, p_rng_calls,
    round(p_squad_fppg, 1), round(p_structure_mult, 3), round(p_team_rating, 2),
    p_perfect_pct,
    round(v_gm, 2), v_moves,
    v_tk, v_dtd, v_pa
  ) returning id into v_id;

  return v_id;
end $$;

revoke all on function ps_submit_run(int,int,numeric,numeric,numeric,int,text,text,
  text[],text[],text,int,numeric,numeric,numeric,int,text,text,numeric,jsonb,
  int,int,numeric) from public;
grant execute on function ps_submit_run(int,int,numeric,numeric,numeric,int,text,text,
  text[],text[],text,int,numeric,numeric,numeric,int,text,text,numeric,jsonb,
  int,int,numeric)
  to anon, authenticated;

notify pgrst, 'reload schema';
