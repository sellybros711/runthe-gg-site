-- ============================================================================
-- 51_football_accounts.sql : put names on the Perfect Season board
-- ============================================================================
-- Run AFTER 50_football_perfect_season.sql. Safe to re-run.
--
-- This adds NO new account system. The site already has one: `profiles`, created
-- by 10_accounts.sql, with a citext-unique username, a handle_new_user trigger
-- that makes a row the moment somebody signs up, and set_username/
-- username_available helpers. Email-and-password and Google are already
-- configured on the project because the other games use them. So a RunThe.GG
-- account IS the account here, and nothing in this file creates a parallel one.
--
-- What it does add:
--   * ps_runs.display_name, copied from profiles at insert time
--   * ps_claim_run(), so a run finished as a guest can be taken over on sign-in
--   * ps_rename_runs(), so changing your username fixes your old rows
--
-- THE NAME IS NEVER SENT BY THE CLIENT. ps_submit_run() reads it out of profiles
-- for auth.uid(), which is the same thing submit_draft() does for the soccer
-- game and for the same reason: a client-supplied name on a public board is a
-- forgery and an abuse surface at once. There is still no free-text column here
-- that a player can write into.
--
-- Guests still record, as they did before, and appear as Anonymous. That is a
-- deliberate difference from the soccer game, which writes nothing for a guest:
-- this game's whole first minute is one draft, and demanding an account before
-- the board will admit it happened is the wrong trade for a game with no other
-- friction in it.
-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The column
-- ---------------------------------------------------------------------------
-- Denormalised on purpose. The alternative is embedding profiles in every board
-- read, which turns each of the six count queries and both list queries into a
-- join, and those counts are index-only scans today. ps_rename_runs() below is
-- what keeps a denormalised copy honest when somebody changes their name.
alter table ps_runs add column if not exists display_name text;

-- A player's own history, and the rename below.
create index if not exists ps_runs_owner_idx on ps_runs (user_id) where user_id is not null;

-- ---------------------------------------------------------------------------
-- ps_submit_run(), now server-attributed
-- ---------------------------------------------------------------------------
-- Same signature, so the client needs no change to keep working: this only
-- replaces the body. The two lines that matter are the lookup into profiles and
-- the extra insert column.
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
  p_perfect_pct   int      default null
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
  v_user    uuid := auth.uid();
  v_name    text;
begin
  -- ---- free run or daily ----
  if p_daily_date is null or p_daily_date = '' then
    v_ddate := null; v_daily := false;
  else
    if p_daily_date !~ '^[12][0-9]{3}-[01][0-9]-[0-3][0-9]$' then
      raise exception 'daily date must be YYYY-MM-DD, got %', p_daily_date;
    end if;
    v_ddate := p_daily_date::date;
    v_daily := true;
    if v_ddate < (now() at time zone 'utc')::date - 1
       or v_ddate > (now() at time zone 'utc')::date + 1 then
      raise exception 'daily date % is not close enough to today', v_ddate;
    end if;
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
  if p_franchise is not null and p_franchise !~ '^[A-Z]{2,3}$' then
    raise exception 'franchise code looks wrong: %', p_franchise;
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

  -- ---- THE NAME, read here and never accepted from the caller ----
  if v_user is not null then
    select username::text into v_name from profiles where id = v_user;
  end if;

  -- ---- swallow an accidental double submit ----
  select id into v_dupe from ps_runs
   where picks = p_picks and regular_wins = v_reg and playoff_wins = v_po
     and daily = v_daily
     and created_at > now() - interval '1 minute'
   limit 1;
  if v_dupe is not null then return v_dupe; end if;

  insert into ps_runs (
    user_id, display_name, regular_wins, playoff_wins, wins, losses, games,
    title_won, made_playoffs, perfect, seed_label,
    point_diff, chemistry_pct, spend_musd, respins, franchise, daily, daily_date,
    picks, slots, seed, rng_calls,
    squad_fppg, structure_mult, team_rating, perfect_pct
  ) values (
    v_user, v_name, v_reg, v_po, v_wins, v_losses, v_games,
    v_title, v_made, (v_title and v_losses = 0), v_label,
    round(p_point_diff, 1), round(p_chemistry_pct, 2), round(p_spend_musd, 1),
    coalesce(p_respins, 0), p_franchise, v_daily, v_ddate,
    p_picks, p_slots, p_seed, p_rng_calls,
    round(p_squad_fppg, 1), round(p_structure_mult, 3), round(p_team_rating, 2),
    p_perfect_pct
  ) returning id into v_id;

  return v_id;
end $$;

revoke all on function ps_submit_run(int,int,numeric,numeric,numeric,int,text,text,text[],text[],text,int,numeric,numeric,numeric,int) from public;
grant execute on function ps_submit_run(int,int,numeric,numeric,numeric,int,text,text,text[],text[],text,int,numeric,numeric,numeric,int)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- ps_claim_run(): the run you finished before you signed in
-- ---------------------------------------------------------------------------
-- Only ever stamps a row that is still unowned, which is what makes it
-- impossible to take somebody else's. Same guard as claim_draft() in
-- 17_claim_draft.sql, and the same reason: the id travels through the browser,
-- so the id alone must not be enough to own a row.
create or replace function ps_claim_run(p_id bigint)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_rows int;
begin
  if v_user is null then return false; end if;
  select username::text into v_name from profiles where id = v_user;
  update ps_runs
     set user_id = v_user, display_name = v_name
   where id = p_id and user_id is null;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;
revoke all on function ps_claim_run(bigint) from public;
grant execute on function ps_claim_run(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- ps_rename_runs(): what keeps the denormalised copy honest
-- ---------------------------------------------------------------------------
-- Call it after set_username(). Without it a rename leaves every past run under
-- the old name, which is the one real cost of not joining profiles on every read.
create or replace function ps_rename_runs()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_rows int;
begin
  if v_user is null then return 0; end if;
  select username::text into v_name from profiles where id = v_user;
  update ps_runs set display_name = v_name where user_id = v_user;
  get diagnostics v_rows = row_count;
  return v_rows;
end $$;
revoke all on function ps_rename_runs() from public;
grant execute on function ps_rename_runs() to authenticated;

analyze ps_runs;
