-- 59_football_era_mode.sql
--
-- Adds the Eras Draft game mode. A player picks a decade (2000s, 2010s, or
-- 2020s) and drafts only from teams and players of that era. Each decade
-- has its own leaderboard, separate from free play and One Franchise.
--
-- Safe to re-run: every statement is IF NOT EXISTS, OR REPLACE, or guarded.


-- ---------------------------------------------------------------------------
-- 1. The era column.
-- ---------------------------------------------------------------------------
alter table ps_runs add column if not exists era text;

comment on column ps_runs.era is
  'Which decade an Eras Draft run belongs to: 2000s, 2010s, or 2020s. '
  'Null for free and club runs.';


-- ---------------------------------------------------------------------------
-- 2. Constraints.
-- ---------------------------------------------------------------------------

-- Widen the run_mode check to include 'era'.
alter table ps_runs drop constraint if exists ps_runs_run_mode_ck;
alter table ps_runs add  constraint ps_runs_run_mode_ck
  check (run_mode in ('free', 'daily', 'club', 'era'));

-- An era run must name its decade, and no other mode may.
alter table ps_runs drop constraint if exists ps_runs_era_needs_era_ck;
alter table ps_runs add  constraint ps_runs_era_needs_era_ck
  check (run_mode <> 'era' or (era is not null and era in ('2000s', '2010s', '2020s')));

alter table ps_runs drop constraint if exists ps_runs_era_only_era_ck;
alter table ps_runs add  constraint ps_runs_era_only_era_ck
  check (run_mode = 'era' or era is null);


-- ---------------------------------------------------------------------------
-- 3. Indexes.
--
-- Three era boards (one per decade), each windowed on created_at the same
-- way the club boards are. Partial on run_mode='era' so era can lead.
-- ---------------------------------------------------------------------------
create index if not exists ps_runs_era_score_idx
  on ps_runs (era, score desc, created_at asc) where run_mode = 'era';
create index if not exists ps_runs_era_rating_idx
  on ps_runs (era, team_rating desc, created_at asc) where run_mode = 'era';
create index if not exists ps_runs_era_named_score_idx
  on ps_runs (era, score desc, created_at asc)
  where run_mode = 'era' and display_name is not null;
create index if not exists ps_runs_era_named_rating_idx
  on ps_runs (era, team_rating desc, created_at asc)
  where run_mode = 'era' and display_name is not null;


-- ---------------------------------------------------------------------------
-- 4. ps_submit_run() -- add p_era parameter.
--
-- The old 17-argument signature from 57 has to go, same reason as before:
-- adding a parameter makes a new overload, and PostgREST picks one by
-- argument names, so two installed means every call is ambiguous.
-- ---------------------------------------------------------------------------
drop function if exists ps_submit_run(int,int,numeric,numeric,numeric,int,text,text,
  text[],text[],text,int,numeric,numeric,numeric,int,text);

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
  p_era           text     default null
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
  v_user    uuid := auth.uid();
  v_name    text;
begin
  -- ---- which competition ----
  v_mode := lower(btrim(coalesce(p_mode, 'free')));
  if v_mode not in ('free', 'club', 'era') then
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
  if p_spend_musd is null or p_spend_musd < 0 or p_spend_musd > PS_CAP_MUSD then
    raise exception 'spend of % is outside the $%M cap', p_spend_musd, PS_CAP_MUSD;
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
    squad_fppg, structure_mult, team_rating, perfect_pct
  ) values (
    v_user, v_name, v_reg, v_po, v_wins, v_losses, v_games,
    v_title, v_made, (v_title and v_losses = 0), v_label,
    round(p_point_diff, 1), round(p_chemistry_pct, 2), round(p_spend_musd, 1),
    coalesce(p_respins, 0), v_club, v_era, v_mode, v_daily, v_ddate,
    p_picks, p_slots, p_seed, p_rng_calls,
    round(p_squad_fppg, 1), round(p_structure_mult, 3), round(p_team_rating, 2),
    p_perfect_pct
  ) returning id into v_id;

  return v_id;
end $$;

-- Grant to the same roles as before.
revoke all on function ps_submit_run(int,int,numeric,numeric,numeric,int,text,text,
  text[],text[],text,int,numeric,numeric,numeric,int,text,text) from public;
grant execute on function ps_submit_run(int,int,numeric,numeric,numeric,int,text,text,
  text[],text[],text,int,numeric,numeric,numeric,int,text,text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 5. Tell PostgREST the shape changed.
-- ---------------------------------------------------------------------------
analyze ps_runs;
notify pgrst, 'reload schema';
