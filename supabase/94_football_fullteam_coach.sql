-- ---------------------------------------------------------------------------
-- 94_football_fullteam_coach.sql : the coach, the game plan, and the twelve
--
-- Safe to run more than once. Run it BEFORE anybody plays a Full Team season, or
-- every one of them is thrown away on submit.
--
-- ---------------------------------------------------------------------------
-- 93 WAS NOT ENOUGH, AND THIS IS WHY
-- ---------------------------------------------------------------------------
-- 93 widened ps_runs_run_mode_ck so the mode could exist, and stopped there. The
-- submit function still checked every roster against a constant six and every
-- payroll against a constant $140M, so a full team run reached the database and
-- was rejected on its lineup for the crime of having twelve men in it. Widening
-- the mode list is necessary and it is not sufficient: every rule that assumed
-- one roster shape has to be shown the second one.
--
-- WHAT IT ADDS
--   * ps_runs.coach   who coached the season, or null
--   * ps_runs.plan    the three axis game plan, or null
--   * ps_submit_run() twelve men, a $280M cap, and the two columns above
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The two columns.
-- ---------------------------------------------------------------------------
alter table ps_runs add column if not exists coach text;
alter table ps_runs add column if not exists plan  jsonb;

comment on column ps_runs.coach is
  'Full Team only: the head coach hired for this season, by name, out of the '
  'same cap as the players. Null on every other mode, and forced null by '
  'ps_submit_run if one arrives on one.';
comment on column ps_runs.plan is
  'Full Team only: {tempo, fourth, pressure}, each -1, 0 or 1. Both this and '
  'coach move the score, so a season without them recorded is a season nobody '
  'can reproduce.';

-- A coach name is shown to people, so it is bounded here as well as in the
-- function: the function is the door, and this is the wall beside it.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ps_runs_coach_ck') then
    alter table ps_runs add constraint ps_runs_coach_ck
      check (coach is null or char_length(coach) between 1 and 60);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The submit function, taking both and knowing about twelve.
-- ---------------------------------------------------------------------------
-- Replaced whole rather than patched, because a plpgsql body cannot be edited in
-- place. This is 86's function with four changes: two new arguments, a
-- mode-aware roster size and cap, a slot list that admits both sides of the ball
-- for this mode alone, and the two columns written on the way out.
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
  p_points_allowed numeric default null,
  -- FULL TEAM'S TWO, defaulted on the same terms as every optional argument above: a
  -- browser holding a cached page sends neither and still records its run.
  p_coach         text     default null,
  p_plan          jsonb    default null
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
  -- FULL TEAM IS TWELVE MEN AND ITS OWN CAP. Without these the mode could not record a
  -- single season: 93 widened the run_mode list and left the roster checks alone, so a
  -- full team run was rejected on its lineup for having twice as many men as this
  -- function had ever seen. $280M is what the mode was balanced at; see FULL_CAP_MUSD.
  PS_FULL_ROSTER     constant int := 12;
  PS_FULL_CAP_MUSD   constant numeric := 280;
  v_roster_size      int;
  v_coach            text;
  v_plan             jsonb;
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
  -- THE FOURTH COPY OF THE MODE LIST, and the fourth time it has been the bug. There is
  -- one in ps_runs_run_mode_ck, one in board.js's SOLO_MODES, one in the page's runMode,
  -- and this. 93 widened the constraint and this list still said no, so a full team run
  -- passed the table's rule and was refused by the function guarding it.
  if v_mode not in ('free', 'club', 'era', 'trade', 'defense', 'fullteam') then
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
  v_cap := case
             when v_mode = 'trade'    then PS_TRADE_MAX_MUSD
             when v_mode = 'fullteam' then PS_FULL_CAP_MUSD
             else PS_CAP_MUSD end;
  v_roster_size := case when v_mode = 'fullteam' then PS_FULL_ROSTER else PS_ROSTER_SIZE end;
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
  if p_picks is null or cardinality(p_picks) <> v_roster_size then
    raise exception 'a run has % picks, got %', v_roster_size,
      coalesce(cardinality(p_picks), 0);
  end if;
  if cardinality(array(select distinct unnest(p_picks))) <> v_roster_size then
    raise exception 'the same player cannot be signed twice';
  end if;
  if exists (select 1 from unnest(p_picks) k where k !~ '^[0-9A-Za-z-]{1,32}:[12][0-9]{3}$') then
    raise exception 'a pick is not of the form <player_id>:<season>';
  end if;
  if p_slots is not null then
    if cardinality(p_slots) <> v_roster_size then
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
    elsif v_mode = 'fullteam' then
      -- BOTH SIDES ARE LEGAL HERE AND ONLY HERE, which is the one place merging the two
      -- lists is right rather than sloppy: a full team roster genuinely holds a
      -- quarterback and a cornerback, and it is the only shape in the game that does.
      if exists (select 1 from unnest(p_slots) s
                 where s not in ('QB','RB','WR','TE','DL','LB','DB','FLEX')) then
        raise exception 'unknown slot name on a full team roster';
      end if;
    else
      if exists (select 1 from unnest(p_slots) s where s not in ('QB','RB','WR','TE','FLEX')) then
        raise exception 'unknown slot name';
      end if;
    end if;
  end if;

  -- ---- the coach and the plan, which belong to Full Team alone ----
  -- Forced null on every other mode for the same reason the defense columns are: "Bill
  -- Belichick" on a One Franchise row is a claim about a season nobody coached.
  if v_mode = 'fullteam' then
    v_coach := nullif(btrim(coalesce(p_coach, '')), '');
    if v_coach is not null and char_length(v_coach) > 60 then
      raise exception 'that is not a coach name';
    end if;
    v_plan := p_plan;
    -- THE PLAN IS THREE NAMED AXES AND NOTHING ELSE. Checked rather than trusted,
    -- because it arrives as jsonb from a browser and an unchecked jsonb column is a
    -- place to put anything at all.
    if v_plan is not null then
      if jsonb_typeof(v_plan) <> 'object' then
        raise exception 'the game plan is not an object';
      end if;
      if exists (select 1 from jsonb_object_keys(v_plan) k
                 where k not in ('tempo','fourth','pressure')) then
        raise exception 'unknown game plan axis';
      end if;
      if exists (select 1 from jsonb_each(v_plan) e
                 where jsonb_typeof(e.value) <> 'number'
                    or (e.value)::numeric not in (-1, 0, 1)) then
        raise exception 'a game plan axis is not -1, 0 or 1';
      end if;
    end if;
  else
    v_coach := null;
    v_plan := null;
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
    def_takeaways, def_tds, points_allowed,
    coach, plan
  ) values (
    v_user, v_name, v_reg, v_po, v_wins, v_losses, v_games,
    v_title, v_made, (v_title and v_losses = 0), v_label,
    round(p_point_diff, 1), round(p_chemistry_pct, 2), round(p_spend_musd, 1),
    coalesce(p_respins, 0), v_club, v_era, v_mode, v_daily, v_ddate,
    p_picks, p_slots, p_seed, p_rng_calls,
    round(p_squad_fppg, 1), round(p_structure_mult, 3), round(p_team_rating, 2),
    p_perfect_pct,
    round(v_gm, 2), v_moves,
    v_tk, v_dtd, v_pa,
    v_coach, v_plan
  ) returning id into v_id;

  return v_id;
end $$;

-- THE OLD int,int,numeric,numeric,numeric,int,text,text,text[],text[],text,int,numeric,numeric,numeric,int,text,text,numeric,jsonb,int,int,numeric,text,jsonbNATURE IS DROPPED. Postgres would hold both as overloads and
-- PostgREST resolves an RPC by the argument names in the body, so a submit
-- naming p_coach would match the new one and a submit without it would match
-- BOTH and answer 300. Same trap 89_football_crest_tier.sql documents.
drop function if exists ps_submit_run(int,int,numeric,numeric,numeric,int,text,text,
  text[],text[],text,int,numeric,numeric,numeric,int,text,text,numeric,jsonb,
  int,int,numeric);

revoke all on function ps_submit_run(int,int,numeric,numeric,numeric,int,text,text,text[],text[],text,int,numeric,numeric,numeric,int,text,text,numeric,jsonb,int,int,numeric,text,jsonb) from public;
grant execute on function ps_submit_run(int,int,numeric,numeric,numeric,int,text,text,text[],text[],text,int,numeric,numeric,numeric,int,text,text,numeric,jsonb,int,int,numeric,text,jsonb)
  to anon, authenticated;

analyze ps_runs;

notify pgrst, 'reload schema';
