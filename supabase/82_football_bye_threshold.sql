-- ============================================================================
-- 82_football_bye_threshold.sql : the server seeds a bye at 16 wins, not 15
-- ============================================================================
-- Safe to re-run: one CREATE OR REPLACE at the signature it already has.
--
-- ----------------------------------------------------------------------------
-- THE BUG: A REAL 18-3 SEASON WAS BEING RECORDED AS 18-2 WITH A TITLE
-- ----------------------------------------------------------------------------
-- engine.js seeds a first-round bye at BYE_SEED_WINS = 16 regular wins. The
-- server's ps_submit_run still used 15, left behind when the client's threshold
-- moved. Everything else about seeding matched, so nobody noticed until a
-- 15-win season landed.
--
-- What the player played, at 15 regular wins: the CLIENT calls that a wild card,
-- so it plays the four-round bracket. A 15-2 regular season that then wins the
-- wild card, divisional and conference rounds and LOSES the Super Bowl is 18-3,
-- out in the Super Bowl. That is the run.
--
-- What the SERVER recorded from the same regular_wins=15, playoff_wins=3: at a
-- bye threshold of 15 it read 15 wins as a TOP SEED with a bye, a three-round
-- bracket. Three playoff wins is then a clean sweep of three rounds, which the
-- function reads as a title: 18-2, trophy, "Top seed". The record was wrong by a
-- game, the trophy was invented, and the leaderboard showed both.
--
-- The fix is the threshold, nothing else. At 16 the server agrees with the
-- client: 15 wins is a wild card, four rounds, and three playoff wins with a
-- Super Bowl loss is 18-3 and no title.
--
-- STILL A GAP, flagged not fixed here: engine.js can also grant a bye below 16
-- by a hot finish (seedFromRecord's byFinish, last-stretch wins) or by an elite
-- rating (byStrength). The server cannot see the first (it is not sent) and the
-- second needs a rating no roster in the pool reaches. A hot-finishing 12-to-15
-- win team can still be recorded as a wild card it did not play. That is rarer
-- than the exact-15 case this fixes and wants a client change to send the seed,
-- so it is left for its own commit rather than guessed at here.
-- ----------------------------------------------------------------------------

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
  PS_BYE_SEED_WINS   constant int := 16;   -- MATCHES engine.js BYE_SEED_WINS. See header.
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
  if v_mode not in ('free', 'club', 'era', 'trade', 'defense') then
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

-- The signature is unchanged, so the existing grants still apply. Repeated here
-- because a CREATE OR REPLACE that ever does change one would otherwise leave
-- the function ungranted and every submit would fail on permission instead.
revoke all on function ps_submit_run(int,int,numeric,numeric,numeric,int,text,text,
  text[],text[],text,int,numeric,numeric,numeric,int,text,text,numeric,jsonb) from public;
grant execute on function ps_submit_run(int,int,numeric,numeric,numeric,int,text,text,
  text[],text[],text,int,numeric,numeric,numeric,int,text,text,numeric,jsonb)
  to anon, authenticated;

notify pgrst, 'reload schema';
