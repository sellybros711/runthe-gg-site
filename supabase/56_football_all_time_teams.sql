-- ============================================================================
-- 56_football_all_time_teams.sql : the daily puzzle goes, club boards arrive
-- ============================================================================
-- Safe to run more than once, and safe to run before or after any earlier file.
-- Run it in the Supabase SQL editor in one go.
--
-- WHAT CHANGES
--
-- The daily puzzle is retired and replaced by One Team mode: you pick one
-- of the thirty-two teams and every spin of that draft is that team, with only
-- the year moving, so the run is an attempt at the best Dolphins or Steelers or
-- Bears team anybody has built out of that club's own history. Each club gets
-- its own board.
--
-- WHY A `mode` COLUMN AND NOT A SECOND BOOLEAN
--
-- There are three kinds of run in this table now and there will not be two
-- again. A boolean per kind means every board query carries a growing pile of
-- "and not that one" clauses, and the day a fourth mode arrives every one of
-- them silently starts including it. One column with a check constraint says
-- what a row IS, and a board asks for the one it wants.
--
-- WHY `franchise` COULD NOT BE THE DISCRIMINATOR ON ITS OWN
--
-- It is tempting, because a club run always has one and a free run never does.
-- But the column predates this: an early version of the game asked for your
-- favourite club and stored it on ordinary free runs. Those rows are still
-- here, and treating "has a franchise" as "is a club run" would drop hundreds
-- of them onto club boards they were never played on.
--
-- THE DAILY ROWS STAY. They are somebody's season and they are somebody's best
-- record. They move to mode 'daily', which no board reads, so they are out of
-- the way rather than deleted.
-- ----------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. The list of clubs, once, as a function. Repeated from 55 so this file can
--    be run on a project that has not had that one; `create or replace` over an
--    identical definition costs nothing.
-- ---------------------------------------------------------------------------
create or replace function ps_is_franchise(p text)
returns boolean
language sql
immutable
as $$
  select p in (
    'ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU',
    'IND','JAX','KC','LAC','LAR','LV','MIA','MIN','NE','NO','NYG','NYJ','PHI',
    'PIT','SEA','SF','TB','TEN','WAS')
$$;
revoke all on function ps_is_franchise(text) from public;
grant execute on function ps_is_franchise(text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2. The column, then the backfill, then the constraint. In that order, because
--    a check constraint is validated against every existing row the moment it is
--    added: put it on before the daily rows are moved and it is fine, put it on
--    before the column is filled and there is nothing to check. The order also
--    means re-running this file is a no-op rather than an error.
-- ---------------------------------------------------------------------------
alter table ps_runs add column if not exists mode text not null default 'free';

-- Existing daily runs, off the free board and out of the way. Guarded on
-- mode = 'free' so a second run of this file cannot move anything twice.
update ps_runs set mode = 'daily' where daily and mode = 'free';

alter table ps_runs drop constraint if exists ps_runs_mode_ck;
alter table ps_runs add  constraint ps_runs_mode_ck
  check (mode in ('free', 'daily', 'club'));

-- A club run without a club is a row no board can place. Free and daily rows are
-- deliberately not constrained the other way: the old favourite-club rows are
-- free runs that carry a franchise, and rejecting them now would mean rewriting
-- history to satisfy a rule written after it.
alter table ps_runs drop constraint if exists ps_runs_club_needs_franchise_ck;
alter table ps_runs add  constraint ps_runs_club_needs_franchise_ck
  check (mode <> 'club' or (franchise is not null and ps_is_franchise(franchise)));

comment on column ps_runs.mode is
  'Which competition this run belongs to: free (the open draft), club (all-time '
  'team mode, franchise says which), or daily (the retired daily puzzle, kept so '
  'those seasons are not lost, read by nothing).';


-- ---------------------------------------------------------------------------
-- 3. Indexes.
--
-- THE RULE THIS FILE INHERITS, and the reason every index below ends in
-- created_at: the board windows on created_at, and a window has to be a column
-- the sort index already carries or it stops being an index condition and
-- becomes a heap fetch per candidate row. Measured on the real schema at
-- 2,000,000 rows: 1,081 buffers and 9.0ms with created_at in the index, 59,917
-- buffers and 251.9ms with it as a filter. The full working is in
-- 50_football_perfect_season.sql and in board.js; do not re-derive it.
--
-- The old indexes led on `daily`, which no query asks about any more. New names
-- rather than a drop-and-recreate under the old ones, so that re-running 50
-- later recreates something harmless instead of something wrong.
-- ---------------------------------------------------------------------------

-- The free board, both axes. mode leads because it is an equality on every read.
create index if not exists ps_runs_m_score_idx
  on ps_runs (mode, score desc, created_at asc);
create index if not exists ps_runs_m_rating_idx
  on ps_runs (mode, team_rating desc, created_at asc);

-- The same two over named rows only, which is every list and every placing. At
-- 2,000,000 rows of which 20 were named, the top-500 read as a plain filter
-- scanned 666,726 rows in 246ms; against a partial index it is 0.03ms off 16kB,
-- because the index only holds the rows a board can show.
create index if not exists ps_runs_m_named_score_idx
  on ps_runs (mode, score desc, created_at asc) where display_name is not null;
create index if not exists ps_runs_m_named_rating_idx
  on ps_runs (mode, team_rating desc, created_at asc) where display_name is not null;

-- The club boards. Partial on mode so franchise can lead: a club board is always
-- one club, so the equality that matters is the franchise and mode is a constant
-- the index does not need to store thirty-two million times over.
create index if not exists ps_runs_club_score_idx
  on ps_runs (franchise, score desc, created_at asc) where mode = 'club';
create index if not exists ps_runs_club_rating_idx
  on ps_runs (franchise, team_rating desc, created_at asc) where mode = 'club';
create index if not exists ps_runs_club_named_score_idx
  on ps_runs (franchise, score desc, created_at asc)
  where mode = 'club' and display_name is not null;
create index if not exists ps_runs_club_named_rating_idx
  on ps_runs (franchise, team_rating desc, created_at asc)
  where mode = 'club' and display_name is not null;

-- The retired ones. Nothing reads `daily` or `daily_date` any more, and an index
-- costs write time on every insert whether or not anything reads it.
drop index if exists ps_runs_mode_score_idx;
drop index if exists ps_runs_mode_created_idx;
drop index if exists ps_runs_mode_rating_idx;
drop index if exists ps_runs_daily_score_idx;
drop index if exists ps_runs_daily_rating_idx;
drop index if exists ps_runs_named_score_idx;
drop index if exists ps_runs_named_rating_idx;


-- ---------------------------------------------------------------------------
-- 4. ps_submit_run(), which now takes the mode.
--
-- THE OLD SIGNATURE HAS TO GO, not just be replaced. Adding a parameter makes a
-- new function rather than replacing the old one, and PostgREST picks an
-- overload by the argument names in the request body: with both installed, a
-- call that omits p_mode is ambiguous and fails with no useful message. So the
-- exact old signature is dropped first.
--
-- p_daily_date is kept, and still works. A browser holding a cached copy of the
-- old page can still finish the run it is in the middle of, and that run lands
-- as mode 'daily' where it bothers nobody, instead of erroring out on the last
-- call of the game.
-- ---------------------------------------------------------------------------
drop function if exists ps_submit_run(int,int,numeric,numeric,numeric,int,text,text,
  text[],text[],text,int,numeric,numeric,numeric,int);

create or replace function ps_submit_run(
  p_regular_wins  int,
  p_playoff_wins  int,
  p_point_diff    numeric,
  p_chemistry_pct numeric,
  p_spend_musd    numeric,
  p_respins       int      default 0,
  -- For a club run this is the club the whole draft was locked to. For a free run
  -- it is null, and for the oldest rows in the table it was a favourite club.
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
  -- 'free' or 'club'. Defaulted so an older client that does not send it keeps
  -- working, and so the daily branch below can still override it.
  p_mode          text     default 'free'
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Must match football/engine.js CONSTANTS. Kept as literals rather than read
  -- from a config table so this file is a complete statement of the rules.
  PS_REG_GAMES       constant int := 17;
  PS_PLAYOFF_WINS    constant int := 12;   -- regular wins needed to get in
  PS_BYE_SEED_WINS   constant int := 15;   -- regular wins that skip a round
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
begin
  -- ---- which competition, decided here and not sent twice ----
  v_mode := lower(btrim(coalesce(p_mode, 'free')));
  if v_mode not in ('free', 'club') then
    raise exception 'unknown mode %', p_mode;
  end if;

  -- A run from a cached copy of the old page. It is a real season and it is
  -- recorded, on the board nothing reads.
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

  -- ---- the club, which a club run must have and no other kind may ----
  v_club := nullif(upper(btrim(coalesce(p_franchise, ''))), '');
  if v_club is not null and not ps_is_franchise(v_club) then
    raise exception 'franchise code looks wrong: %', p_franchise;
  end if;
  if v_mode = 'club' and v_club is null then
    raise exception 'a One Team run has to say which team';
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
    -- One playoff loss ends the run, so a non-champion played exactly one game
    -- more than he won.
    v_po_games := case when v_title then v_rounds else v_po + 1 end;
  end if;

  v_wins   := v_reg + v_po;
  v_losses := (PS_REG_GAMES - v_reg) + (v_po_games - v_po);
  v_games  := PS_REG_GAMES + v_po_games;

  -- ---- the descriptive numbers have to be in range ----
  if p_point_diff is null or p_point_diff < -60 or p_point_diff > 60 then
    raise exception 'point differential out of range: %', p_point_diff;
  end if;
  -- 100 STAYS. There is nothing to raise it for: One Team suppresses the two links
  -- that would otherwise fire on every pair of a one-club roster, so measured over
  -- 796 One Team drafts across all 32 clubs chemistry comes out at a mean of +3.1%
  -- against +2.2% in free play. The engine also saturates toward a hard +15%
  -- ceiling rather than summing links, so no roster of any kind can approach this
  -- bound.
  if p_chemistry_pct is null or p_chemistry_pct < 0 or p_chemistry_pct > 100 then
    raise exception 'chemistry out of range: %', p_chemistry_pct;
  end if;
  if p_spend_musd is null or p_spend_musd < 0 or p_spend_musd > PS_CAP_MUSD then
    raise exception 'spend of % is outside the $%M cap', p_spend_musd, PS_CAP_MUSD;
  end if;
  if coalesce(p_respins, 0) < 0 or coalesce(p_respins, 0) > 3 then
    raise exception 'respins must be 0..3, got %', p_respins;
  end if;

  -- The rating is client-reported for the same reason wins are: recomputing it
  -- needs the player prices and per-player scoring rates, which live in the
  -- browser's copy of player_seasons.json and not in this database. These bounds
  -- are a sanity check, not a fairness guarantee.
  if p_squad_fppg is not null and (p_squad_fppg < 0 or p_squad_fppg > 250) then
    raise exception 'squad FPPG out of range: %', p_squad_fppg;
  end if;
  if p_structure_mult is not null and (p_structure_mult < 0.2 or p_structure_mult > 2) then
    raise exception 'structure multiplier out of range: %', p_structure_mult;
  end if;
  -- 400 stays too. One Team runs rate a little higher, measured at a mean of 71
  -- against 67 for free play and a largest of 108 against 100, because a club's
  -- best years are a richer pool than six random draws. That is nowhere near the
  -- bound, and the bound is a sanity check on a client-reported number, not a
  -- balance dial.
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

  -- ---- swallow an accidental double submit ----
  -- A retry after a timeout, or a second tap on Share, should not put the same
  -- season on the board twice. Same roster, same result, same mode, inside a
  -- minute: return the row that is already there. This is NOT a rate limiter, it
  -- is idempotency.
  select id into v_dupe from ps_runs
   where picks = p_picks and regular_wins = v_reg and playoff_wins = v_po
     and mode = v_mode
     and created_at > now() - interval '1 minute'
   limit 1;
  if v_dupe is not null then return v_dupe; end if;

  insert into ps_runs (
    user_id, regular_wins, playoff_wins, wins, losses, games,
    title_won, made_playoffs, perfect, seed_label,
    point_diff, chemistry_pct, spend_musd, respins, franchise, mode, daily, daily_date,
    picks, slots, seed, rng_calls,
    squad_fppg, structure_mult, team_rating, perfect_pct
  ) values (
    auth.uid(), v_reg, v_po, v_wins, v_losses, v_games,
    v_title, v_made, (v_title and v_losses = 0), v_label,
    round(p_point_diff, 1), round(p_chemistry_pct, 2), round(p_spend_musd, 1),
    coalesce(p_respins, 0), v_club, v_mode, v_daily, v_ddate,
    p_picks, p_slots, p_seed, p_rng_calls,
    round(p_squad_fppg, 1), round(p_structure_mult, 3), round(p_team_rating, 2),
    p_perfect_pct
  ) returning id into v_id;

  return v_id;
end $$;

revoke all on function ps_submit_run(int,int,numeric,numeric,numeric,int,text,text,
  text[],text[],text,int,numeric,numeric,numeric,int,text) from public;
grant execute on function ps_submit_run(int,int,numeric,numeric,numeric,int,text,text,
  text[],text[],text,int,numeric,numeric,numeric,int,text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 5. Tell PostgREST the shape changed, or ps_submit_run is a 404 and selecting
--    mode is a 400 until its cache happens to reload on its own.
-- ---------------------------------------------------------------------------
analyze ps_runs;
notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- 6. What is now in place. One row, so it reads on a phone. Every column should
--    say ok.
-- ---------------------------------------------------------------------------
select
  case when exists (select 1 from pg_attribute where attrelid=to_regclass('public.ps_runs')
        and attname='mode' and not attisdropped) then 'ok' else 'MISSING' end   as mode_column,
  case when exists (select 1 from pg_constraint
        where conrelid=to_regclass('public.ps_runs') and conname='ps_runs_mode_ck')
       then 'ok' else 'MISSING' end                                             as mode_check,
  case when (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='ps_submit_run') = 1
       then 'ok' else 'NOT EXACTLY ONE, drop the spare overload' end            as submit_fn,
  case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='ps_submit_run'
          and has_function_privilege('anon', p.oid, 'execute'))
       then 'ok' else 'NO GRANT' end                                            as anyone_can_submit,
  (select count(*) from pg_indexes where schemaname='public' and tablename='ps_runs'
     and indexname like 'ps_runs_club_%')                                       as club_indexes,
  (select count(*) from ps_runs where mode='free')                              as free_runs,
  (select count(*) from ps_runs where mode='club')                              as club_runs,
  (select count(*) from ps_runs where mode='daily')                             as retired_daily_runs;
