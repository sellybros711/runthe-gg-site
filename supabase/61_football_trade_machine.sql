-- ============================================================================
-- 61_football_trade_machine.sql : the Trade Machine gets its own mode, its GM
--                                 rating, and a record of what was dealt
-- ============================================================================
-- Safe to re-run: every statement is IF NOT EXISTS, OR REPLACE, or guarded.
-- Run it before deploying the client change that starts sending p_mode='trade',
-- or those runs are rejected by the run_mode check until it lands.
--
-- ----------------------------------------------------------------------------
-- TWO BUGS THIS FIXES, AND BOTH ARE LOSING REAL RUNS TODAY
-- ----------------------------------------------------------------------------
-- 1. TRADE RUNS ARE RECORDED AS FREE PLAY. board.js mapped the mode with
--
--        payload.mode === 'era' ? 'era' : payload.mode === 'club' ? 'club' : 'free'
--
--    so a Trade Machine season fell through to 'free' and went onto the open
--    draft board. Those are not the same game: a free run is six picks and one
--    shot, a trade run is a whole season of moves against an inflating payroll.
--    It also meant nothing could ever ask "did this player finish a Trade
--    Machine season", because no row has ever said so.
--
-- 2. AN OVER-CAP TRADE RUN IS REJECTED OUTRIGHT. ps_submit_run raises on
--    p_spend_musd > 140. Contracts in the Trade Machine inflate 8% at every
--    window, so the payroll a player finishes with is routinely above the cap
--    they started under, and going over is a legal (if penalised) choice the
--    mode deliberately offers. Measured over 26 machine-played seasons taking
--    only rating-positive trades, the final payroll ran to $150.1M and 4% of
--    runs were already over the ceiling; a player buying hard across all four
--    windows will be over far more often than that. Every one of those seasons
--    ended with the run silently failing to record.
--
--    The cap check STAYS for every other mode, where 140 is a real rule. Trade
--    mode gets a sanity bound instead, high enough that no legitimate run can
--    reach it.
--
-- ----------------------------------------------------------------------------
-- WHY trade_moves IS A COLUMN AND NOT A DERIVED FACT
-- ----------------------------------------------------------------------------
-- Everything else the badge cabinet reads is derived from columns that already
-- existed, which is what makes it retroactive. This one cannot be: `picks` is
-- the roster a run FINISHED with, and no combination of stored columns can say
-- which players left, when, or what came back. So the moves are stored, in the
-- same shape `picks` uses (player_id:season), and the cost is honest: badges
-- about dealing are earnable from the day this ships forward and not before.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. The columns.
-- ---------------------------------------------------------------------------
alter table ps_runs add column if not exists gm_rating   numeric;
alter table ps_runs add column if not exists trade_moves jsonb;

comment on column ps_runs.gm_rating is
  'The Trade Machine GM rating, 0..100: 40% result, 30% roster improvement, '
  '20% value for money, 10% beating what the roster you were handed should have '
  'won. Null for every other mode. Measured over machine-played seasons: never '
  'trading scores about 19, trading at random about 29, trading well about 62 '
  'with a p90 of 82 and a best of 88 without a title.';

comment on column ps_runs.trade_moves is
  'What was dealt, in order, for a Trade Machine run. A jsonb array of '
  '{"w":week, "t":type, "out":[picks], "in":[picks], "fa":1}, where week 0 is '
  'the window before kickoff, type is 1for1 / 2for2 / 2for1, picks are '
  'player_id:season exactly as the picks column spells them, and fa marks a '
  'move whose hole was filled from free agency. Null for every other mode, and '
  'null on trade runs recorded before this column existed.';


-- ---------------------------------------------------------------------------
-- 2. Shape validation, as a function, so the constraint and ps_submit_run
--    cannot disagree about what a legal move list is.
--
--    Bounds rather than a schema: four windows exist and a window can produce a
--    trade plus a free-agent signing, so a dozen entries is already generous,
--    and no exchange in the game moves more than three men a side. The point is
--    that a client cannot post a megabyte of arbitrary JSON into the table.
-- ---------------------------------------------------------------------------
create or replace function ps_trade_moves_ok(p jsonb)
returns boolean
language sql
immutable
as $$
  select p is null
     or (jsonb_typeof(p) = 'array'
         and jsonb_array_length(p) <= 12
         and pg_column_size(p) <= 4096
         and not exists (
           select 1 from jsonb_array_elements(p) e
            where jsonb_typeof(e.value) <> 'object'
               or jsonb_typeof(e.value -> 'w') <> 'number'
               or jsonb_typeof(e.value -> 't') <> 'string'
               or length(e.value ->> 't') > 12
               or (e.value ? 'out' and (jsonb_typeof(e.value -> 'out') <> 'array'
                     or jsonb_array_length(e.value -> 'out') > 3))
               or (e.value ? 'in'  and (jsonb_typeof(e.value -> 'in')  <> 'array'
                     or jsonb_array_length(e.value -> 'in')  > 3))))
$$;
revoke all on function ps_trade_moves_ok(jsonb) from public;
grant execute on function ps_trade_moves_ok(jsonb) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3. Constraints. Widened check first, then the new ones.
-- ---------------------------------------------------------------------------
alter table ps_runs drop constraint if exists ps_runs_run_mode_ck;
alter table ps_runs add  constraint ps_runs_run_mode_ck
  check (run_mode in ('free', 'daily', 'club', 'era', 'trade'));

-- Neither of the two new columns belongs to any other mode. Deliberately NOT
-- the other way round: a trade run is not required to carry them, because a
-- browser holding a cached copy of the page mid-season will finish that season
-- on the old payload and that run must still record.
alter table ps_runs drop constraint if exists ps_runs_gm_rating_ck;
alter table ps_runs add  constraint ps_runs_gm_rating_ck
  check (gm_rating is null or (run_mode = 'trade' and gm_rating >= 0 and gm_rating <= 100));

alter table ps_runs drop constraint if exists ps_runs_trade_moves_ck;
alter table ps_runs add  constraint ps_runs_trade_moves_ck
  check ((trade_moves is null or run_mode = 'trade') and ps_trade_moves_ok(trade_moves));


-- ---------------------------------------------------------------------------
-- 4. Indexes for the trade board.
--
-- Same four shapes every other board gets, and all of them end in created_at
-- for the reason set out in 57: the board windows on created_at, and a window
-- has to be a column the sort index already carries or it stops being an index
-- condition. Partial on run_mode so the mode is a constant the index need not
-- store per row.
-- ---------------------------------------------------------------------------
create index if not exists ps_runs_trade_score_idx
  on ps_runs (score desc, created_at asc) where run_mode = 'trade';
create index if not exists ps_runs_trade_rating_idx
  on ps_runs (team_rating desc, created_at asc) where run_mode = 'trade';
create index if not exists ps_runs_trade_named_score_idx
  on ps_runs (score desc, created_at asc)
  where run_mode = 'trade' and display_name is not null;
create index if not exists ps_runs_trade_named_rating_idx
  on ps_runs (team_rating desc, created_at asc)
  where run_mode = 'trade' and display_name is not null;

-- The mode's own axis. A Trade Machine board ranked on record is the same board
-- every other mode gets; ranked on GM RATING it is the one that measures the
-- thing this mode is actually about.
create index if not exists ps_runs_trade_gm_idx
  on ps_runs (gm_rating desc, created_at asc) where run_mode = 'trade';
create index if not exists ps_runs_trade_named_gm_idx
  on ps_runs (gm_rating desc, created_at asc)
  where run_mode = 'trade' and display_name is not null;


-- ---------------------------------------------------------------------------
-- 5. ps_submit_run().
--
-- THE 18-ARGUMENT SIGNATURE FROM 59 HAS TO GO, not just be replaced. Adding a
-- parameter makes a new overload rather than replacing the old one, and
-- PostgREST picks an overload by the argument names in the request body: with
-- two installed, every call is ambiguous and fails with no useful message.
-- ---------------------------------------------------------------------------
drop function if exists ps_submit_run(int,int,numeric,numeric,numeric,int,text,text,
  text[],text[],text,int,numeric,numeric,numeric,int,text,text);

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
  p_trade_moves   jsonb    default null
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
  if v_mode not in ('free', 'club', 'era', 'trade') then
    raise exception 'unknown mode %', p_mode;
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
    if exists (select 1 from unnest(p_slots) s where s not in ('QB','RB','WR','TE','FLEX')) then
      raise exception 'unknown slot name';
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
    gm_rating, trade_moves
  ) values (
    v_user, v_name, v_reg, v_po, v_wins, v_losses, v_games,
    v_title, v_made, (v_title and v_losses = 0), v_label,
    round(p_point_diff, 1), round(p_chemistry_pct, 2), round(p_spend_musd, 1),
    coalesce(p_respins, 0), v_club, v_era, v_mode, v_daily, v_ddate,
    p_picks, p_slots, p_seed, p_rng_calls,
    round(p_squad_fppg, 1), round(p_structure_mult, 3), round(p_team_rating, 2),
    p_perfect_pct,
    round(v_gm, 2), v_moves
  ) returning id into v_id;

  return v_id;
end $$;

revoke all on function ps_submit_run(int,int,numeric,numeric,numeric,int,text,text,
  text[],text[],text,int,numeric,numeric,numeric,int,text,text,numeric,jsonb) from public;
grant execute on function ps_submit_run(int,int,numeric,numeric,numeric,int,text,text,
  text[],text[],text,int,numeric,numeric,numeric,int,text,text,numeric,jsonb)
  to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 6. Tell PostgREST the shape changed.
-- ---------------------------------------------------------------------------
analyze ps_runs;
notify pgrst, 'reload schema';
