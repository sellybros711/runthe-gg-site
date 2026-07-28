-- ============================================================================
-- 57_football_run_mode.sql : One Franchise mode, with a column name that cannot bite
-- ============================================================================
-- Replaces 56_football_all_time_teams.sql and is safe whether or not you ever ran
-- that one. Safe to run more than once. Run it in the Supabase SQL editor in one
-- go, and run 58_football_stamp_display.sql after it: an earlier version of this
-- file dropped display_name from the insert, so runs recorded by it were counted
-- and never listed. 58 fixes the rows that already exist and moves the stamping
-- into the trigger so it cannot be dropped again.
--
-- ----------------------------------------------------------------------------
-- WHY THIS FILE EXISTS: `mode` IS A FUNCTION NAME IN POSTGRES
-- ----------------------------------------------------------------------------
-- 56 added a column called `mode`. The board then failed with
--
--     400 42809. WITHIN GROUP is required for ordered-set aggregate mode
--
-- which is a message about an aggregate function, on a query that calls no
-- function at all. Reproduced against a real database, the cause is exact:
--
--     select id from ps_runs where mode(ps_runs) = 'club';
--     ERROR: WITHIN GROUP is required for ordered-set aggregate mode
--
-- PostgREST allows filtering on a computed column, which is a function taking
-- the table's row type. When its schema cache does not have the column -- either
-- because the migration has not run or because the cache has not reloaded since
-- it did -- a filter on that name is resolved as a computed column and emitted
-- as an unqualified `mode(ps_runs)`. Postgres then finds pg_catalog.mode(), the
-- ordered-set aggregate that computes the most common value, and complains that
-- it was called without WITHIN GROUP.
--
-- So the name turned "you are one migration behind" into a message nobody can
-- act on. `run_mode` collides with nothing, and a stale cache now says the
-- column is missing, which is the truth and is fixable.
--
-- The lesson is bigger than this column: a column named after a built-in
-- aggregate (mode, min, max, sum, avg, count, rank, percentile_cont) can be
-- resolved as a function call by anything that guesses. Do not use one.
-- ----------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. The list of teams, once, as a function, so the constraint and
--    ps_submit_run cannot disagree about it.
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
-- 2. The column, from any starting state.
--
--    Three states are possible and all three end the same way: 56 was run and
--    there is a `mode` column to rename, 56 was never run and there is nothing,
--    or this file has already been run and there is a `run_mode`. A rename
--    rather than a new column plus a copy, so the club runs somebody has already
--    played keep their mode instead of silently reverting to 'free'.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_attribute
              where attrelid = to_regclass('public.ps_runs')
                and attname = 'mode' and not attisdropped)
     and not exists (select 1 from pg_attribute
              where attrelid = to_regclass('public.ps_runs')
                and attname = 'run_mode' and not attisdropped)
  then
    alter table ps_runs rename column mode to run_mode;
  end if;
end $$;

alter table ps_runs add column if not exists run_mode text not null default 'free';

-- The retired daily runs, off the free board and out of the way rather than
-- deleted: they are somebody's season and somebody's best record. Guarded on
-- 'free' so running this file twice cannot move anything twice, and guarded on
-- the column existing because a project that never had the daily still has it.
update ps_runs set run_mode = 'daily' where daily and run_mode = 'free';

-- Constraints AFTER the backfill: a check constraint is validated against every
-- existing row the moment it is added.
alter table ps_runs drop constraint if exists ps_runs_mode_ck;
alter table ps_runs drop constraint if exists ps_runs_run_mode_ck;
alter table ps_runs add  constraint ps_runs_run_mode_ck
  check (run_mode in ('free', 'daily', 'club'));

-- A One Franchise run without a team is a row no board can place. Free and daily rows
-- are deliberately NOT constrained the other way: the oldest rows in this table
-- are free runs that carry the player's favourite team, from a version of the
-- game that asked for one, and rejecting those now would mean rewriting history
-- to satisfy a rule written after it.
alter table ps_runs drop constraint if exists ps_runs_club_needs_franchise_ck;
alter table ps_runs add  constraint ps_runs_club_needs_franchise_ck
  check (run_mode <> 'club' or (franchise is not null and ps_is_franchise(franchise)));

comment on column ps_runs.run_mode is
  'Which competition this run belongs to: free (the open draft), club (One Franchise '
  'mode, franchise says which team), or daily (the retired daily puzzle, kept so '
  'those seasons are not lost, read by nothing). Named run_mode and not mode '
  'because a column called mode is resolved as pg_catalog.mode() by anything '
  'that guesses at it; see the header of this file.';


-- ---------------------------------------------------------------------------
-- 3. Indexes.
--
-- THE RULE EVERY ONE OF THESE FOLLOWS, and the reason they all end in
-- created_at: the board windows on created_at, and a window has to be a column
-- the sort index already carries or it stops being an index condition and
-- becomes a heap fetch per candidate row. Measured on the real schema at
-- 2,000,000 rows: 1,081 buffers and 9.0ms with created_at in the index, 59,917
-- buffers and 251.9ms with it as a filter. The full working is in
-- 50_football_perfect_season.sql and in board.js; do not re-derive it.
-- ---------------------------------------------------------------------------

-- The free board, both axes. run_mode leads because it is an equality on every read.
create index if not exists ps_runs_rm_score_idx
  on ps_runs (run_mode, score desc, created_at asc);
create index if not exists ps_runs_rm_rating_idx
  on ps_runs (run_mode, team_rating desc, created_at asc);

-- The same two over named rows only, which is every list and every placing. At
-- 2,000,000 rows of which 20 were named, the top-500 read as a plain filter
-- scanned 666,726 rows in 246ms; against a partial index it is 0.03ms off 16kB,
-- because the index only holds the rows a board can show.
create index if not exists ps_runs_rm_named_score_idx
  on ps_runs (run_mode, score desc, created_at asc) where display_name is not null;
create index if not exists ps_runs_rm_named_rating_idx
  on ps_runs (run_mode, team_rating desc, created_at asc) where display_name is not null;

-- The thirty-two One Franchise boards. Partial on run_mode so franchise can lead: one
-- of these boards is always one team, so the equality that matters is the
-- franchise and the mode is a constant the index need not store per row.
create index if not exists ps_runs_rmclub_score_idx
  on ps_runs (franchise, score desc, created_at asc) where run_mode = 'club';
create index if not exists ps_runs_rmclub_rating_idx
  on ps_runs (franchise, team_rating desc, created_at asc) where run_mode = 'club';
create index if not exists ps_runs_rmclub_named_score_idx
  on ps_runs (franchise, score desc, created_at asc)
  where run_mode = 'club' and display_name is not null;
create index if not exists ps_runs_rmclub_named_rating_idx
  on ps_runs (franchise, team_rating desc, created_at asc)
  where run_mode = 'club' and display_name is not null;

-- Everything the older files left behind. A renamed column takes its indexes
-- with it, so 56's are still here under their old names and still correct; they
-- are dropped anyway because two indexes answering one query is write cost for
-- nothing. `daily` and `daily_date` are read by nothing at all now.
drop index if exists ps_runs_m_score_idx;
drop index if exists ps_runs_m_rating_idx;
drop index if exists ps_runs_m_named_score_idx;
drop index if exists ps_runs_m_named_rating_idx;
drop index if exists ps_runs_club_score_idx;
drop index if exists ps_runs_club_rating_idx;
drop index if exists ps_runs_club_named_score_idx;
drop index if exists ps_runs_club_named_rating_idx;
drop index if exists ps_runs_mode_score_idx;
drop index if exists ps_runs_mode_created_idx;
drop index if exists ps_runs_mode_rating_idx;
drop index if exists ps_runs_daily_score_idx;
drop index if exists ps_runs_daily_rating_idx;
drop index if exists ps_runs_named_score_idx;
drop index if exists ps_runs_named_rating_idx;


-- ---------------------------------------------------------------------------
-- 4. ps_submit_run().
--
-- EVERY OLD SIGNATURE HAS TO GO, not just be replaced. Adding a parameter makes
-- a new function rather than replacing the old one, and PostgREST picks an
-- overload by the argument names in the request body: with two installed, a call
-- is ambiguous and fails with no useful message. Both earlier signatures are
-- dropped by name below, the 16-argument one from 50 and the 17-argument one
-- from 56.
--
-- p_mode keeps its name. It is an argument and not a column, so it cannot be
-- mistaken for a function, and renaming it would break any browser still holding
-- a cached copy of the page mid-run.
--
-- p_daily_date is kept and still works, for the same reason: a browser part-way
-- through a daily puzzle can still finish it, and that run lands as 'daily'
-- where it bothers nobody, instead of erroring out on the last call of the game.
-- ---------------------------------------------------------------------------
drop function if exists ps_submit_run(int,int,numeric,numeric,numeric,int,text,text,
  text[],text[],text,int,numeric,numeric,numeric,int);
drop function if exists ps_submit_run(int,int,numeric,numeric,numeric,int,text,text,
  text[],text[],text,int,numeric,numeric,numeric,int,text);

create or replace function ps_submit_run(
  p_regular_wins  int,
  p_playoff_wins  int,
  p_point_diff    numeric,
  p_chemistry_pct numeric,
  p_spend_musd    numeric,
  p_respins       int      default 0,
  -- For a One Franchise run this is the team the whole draft was locked to. For a free
  -- run it is null, and for the oldest rows in the table it was a favourite team.
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
  -- THE NAME, and it is read here rather than accepted from the caller so that no
  -- client can put a name on a row it does not own. Both earlier rewrites of this
  -- function for One Franchise mode were made from the pre-accounts version in 50 and
  -- silently dropped it, which recorded every signed-in run unnamed and therefore
  -- off the board. 58_football_stamp_display.sql moves the same job into the
  -- BEFORE INSERT trigger as well, which is what makes it un-loseable; this stays
  -- so that a project running 50, 51, 55 and 57 in order is correct without it.
  v_user    uuid := auth.uid();
  v_name    text;
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

  -- ---- the team, which a One Franchise run must have and no other kind may ----
  v_club := nullif(upper(btrim(coalesce(p_franchise, ''))), '');
  if v_club is not null and not ps_is_franchise(v_club) then
    raise exception 'franchise code looks wrong: %', p_franchise;
  end if;
  if v_mode = 'club' and v_club is null then
    raise exception 'a One Franchise run has to say which team';
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
  -- 100 STAYS, and it was worth measuring rather than assuming. One Franchise
  -- suppresses the two chemistry links that would otherwise fire on every pair of
  -- a one-team roster, so measured over 796 One Franchise drafts across all 32 teams
  -- chemistry comes out at a mean of +3.1% against +2.2% in free play. The engine
  -- also saturates toward a hard +15% ceiling rather than summing links, so no
  -- roster of any kind can approach this bound.
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
  -- 400 stays too. One Franchise runs rate a little higher, measured at a mean of 71
  -- against 67 for free play and a largest of 108 against 100, because a team's
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

  -- ---- the name, read from the profile and never from the caller ----
  if v_user is not null then
    select username::text into v_name from profiles where id = v_user;
  end if;

  -- ---- swallow an accidental double submit ----
  -- A retry after a timeout, or a second tap on Share, should not put the same
  -- season on the board twice. Same roster, same result, same mode, inside a
  -- minute: return the row that is already there. This is NOT a rate limiter, it
  -- is idempotency.
  select id into v_dupe from ps_runs
   where picks = p_picks and regular_wins = v_reg and playoff_wins = v_po
     and run_mode = v_mode
     and created_at > now() - interval '1 minute'
   limit 1;
  if v_dupe is not null then return v_dupe; end if;

  insert into ps_runs (
    user_id, display_name, regular_wins, playoff_wins, wins, losses, games,
    title_won, made_playoffs, perfect, seed_label,
    point_diff, chemistry_pct, spend_musd, respins, franchise, run_mode, daily, daily_date,
    picks, slots, seed, rng_calls,
    squad_fppg, structure_mult, team_rating, perfect_pct
  ) values (
    v_user, v_name, v_reg, v_po, v_wins, v_losses, v_games,
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
-- 5. Tell PostgREST the shape changed. Without this its cache can keep the old
--    shape for a while, and a filter on a column it does not know about is
--    exactly the failure this whole file is about.
-- ---------------------------------------------------------------------------
analyze ps_runs;
notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- 6. What is now in place. One row, so it reads on a phone. Every column that
--    can say ok should say ok.
-- ---------------------------------------------------------------------------
select
  case when exists (select 1 from pg_attribute where attrelid=to_regclass('public.ps_runs')
        and attname='run_mode' and not attisdropped) then 'ok' else 'MISSING' end
                                                                          as run_mode_column,
  case when exists (select 1 from pg_attribute where attrelid=to_regclass('public.ps_runs')
        and attname='mode' and not attisdropped) then 'STILL THERE' else 'gone, good' end
                                                                          as old_mode_column,
  case when exists (select 1 from pg_constraint
        where conrelid=to_regclass('public.ps_runs') and conname='ps_runs_run_mode_ck')
       then 'ok' else 'MISSING' end                                       as run_mode_check,
  case when (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='ps_submit_run') = 1
       then 'ok' else 'NOT EXACTLY ONE, drop the spare overload' end      as submit_fn,
  case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='ps_submit_run'
          and has_function_privilege('anon', p.oid, 'execute'))
       then 'ok' else 'NO GRANT' end                                      as anyone_can_submit,
  (select count(*) from pg_indexes where schemaname='public' and tablename='ps_runs'
     and indexname like 'ps_runs_rm%')                                    as new_indexes,
  (select count(*) from ps_runs where run_mode='free')                    as free_runs,
  (select count(*) from ps_runs where run_mode='club')                    as one_team_runs,
  (select count(*) from ps_runs where run_mode='daily')                   as retired_daily_runs;
