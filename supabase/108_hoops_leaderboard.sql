-- ============================================================================
-- 108_hoops_leaderboard.sql : leaderboards for Run The Floor (/hoops)
-- ============================================================================
-- New and self-contained. It creates one table, four functions and its own
-- indexes, and alters nothing that already exists. Idempotent: re-running it
-- does nothing new.
--
-- Run it once in the Supabase SQL editor. Until it is run, hoops/board.js gets
-- a 404 from every call, reports itself unavailable, and the page says the
-- board is not reachable rather than showing a made-up rank. A run finished
-- against a database that has never seen this file still plays, still records
-- in the career, and still lights its badges.
--
-- IT IS 50_football_perfect_season.sql's SHAPE AND NOT ITS COPY. The two games
-- agree on what a leaderboard is (a table only a security-definer function may
-- write, every derived field owned by the server, RLS read for everybody, one
-- index per query the client actually makes) and disagree on every number in
-- it, because one plays 17 games and the other plays 82. Read that file's
-- header for the argument this one inherits; what follows is only what is
-- different here.
--
--
-- WHAT IS TRUSTED AND WHAT IS NOT
-- -------------------------------
-- The season is simulated in the browser, so the browser is the only thing
-- that knows how many games you won. There is no way to recompute that here
-- without replaying the engine against 16,057 player-seasons that live in a
-- JSON file the database has never seen. So wins ARE client-reported and a
-- determined person can post a season they did not play.
--
-- What this function does instead is own every DERIVED field and refuse any
-- row that is not internally coherent, which makes a whole class of forgery
-- and a whole class of client bug impossible rather than merely unlikely:
--
--   * 70-12 in a season that has 82 games
--   * a ring with fewer playoff wins than the bracket has rounds
--   * two playoff losses, when one series loss ends it
--   * a top six seed playing the play-in's five round bracket
--   * a One Franchise run with no club on it, or a Decades run with no era
--   * a run locked to both a club and a decade, which is a mode the game has
--     no door for
--
-- `seed` and `rng_calls` are stored and read by nothing, the same way they are
-- in the football table and for the same reason: they are what a replay
-- verifier would need, and the day one exists it needs them to already be
-- there for the runs already on the board.
--
--
-- FOUR BOARDS, NOT ONE, AND THE SPLIT IS THE WHOLE DESIGN
-- ------------------------------------------------------
-- The page has four doors and they are not four flavours of one competition.
-- This is already settled on the career shelf, in hoops/index.html, and it is
-- settled there because it was MEASURED:
--
--   * One Franchise pins chemistry near its ceiling whatever gets drafted
--     (+2.30 of a possible +2.50 across all thirty clubs), and best-available
--     finishes 46.8 wins against 42.0 off the whole league. One board would
--     retire the league record to whoever picked the deepest franchise.
--
--   * The decades are nine wins apart for the same drafting: best-available
--     takes the seventies to 49.6 and the aughts to 40.7. One board would
--     retire the record to the shallowest priced era.
--
--   * Today's run is one seed for everybody, so those runs are comparable with
--     each other in a way no two league runs ever are. Mixing them would make
--     the league board unfair in one direction, since a league player can
--     re-spin until the wheel is kind, and the daily board meaningless in the
--     other.
--
-- So `run_mode` leads every index, and inside the two locked modes the board is
-- scoped again by `lock_key`.
--
-- LOCK_KEY IS ONE COLUMN AND NOT TWO. A club and a decade are mutually
-- exclusive here: every door sets one or neither, and a run carrying both is
-- refused below rather than stored. Two nullable columns would need two more
-- indexes to answer the same two questions, and would allow a row whose mode
-- says club while its era column is populated, which is a state no reader
-- would know what to do with.
-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------
create table if not exists rtf_runs (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  -- Nullable, so a run finished by somebody signed out records now and can be
  -- claimed when they sign in. Same shape as ps_runs and claim_draft() before
  -- it. An account is a way to put your name on a run, never a gate in front
  -- of playing one.
  user_id       uuid,
  -- Denormalised out of `profiles` at insert time, and NEVER sent by the
  -- client: rtf_submit_run() reads it for auth.uid(). Nothing reachable from a
  -- browser can put a name on a row. The cost is that a rename leaves old rows
  -- under the old name, which rtf_rename_runs() below is for.
  display_name  text,

  -- ---- which competition this row is in ----
  -- 'league'  the whole game: season and club both spin
  -- 'club'    One Franchise, lock_key is the modern franchise code
  -- 'era'     Decades, lock_key is the era key
  -- 'daily'   today's run, daily_day is the puzzle
  run_mode      text not null,
  lock_key      text,
  -- THE DAY NUMBER AND NOT A DATE. The page's day rolls at Eastern midnight and
  -- is counted from its own epoch, so the integer IS the puzzle's identity.
  -- Storing a date instead would mean two places deciding what "today" is, in
  -- two time zones, and the one that is wrong would be the one nobody reads.
  -- daily_iso is carried beside it for a person reading the table by hand and
  -- is not what anything joins or windows on.
  daily_day     integer,
  daily_iso     date,

  -- ---- the result, as the server computed it ----
  -- Only regular_wins and playoff_wins come from the client.
  regular_wins  smallint not null,
  playoff_wins  smallint not null,
  wins          smallint not null,
  losses        smallint not null,
  games         smallint not null,
  made_playoffs boolean  not null,
  title_won     boolean  not null,
  -- 72 is the 1996 Bulls and 74 has never happened, so both are worth a column
  -- rather than being recomputed by every reader off a threshold it would have
  -- to carry its own copy of.
  beat_record   boolean  not null,
  is_goat       boolean  not null,
  seed_label    text     not null,

  -- ---- descriptive, shown on the board, bounded, never free text ----
  -- PER GAME, which is what a basketball differential means everywhere else. A
  -- season total would be 82 times larger and would need a different score
  -- shift, and the first person to compare it against a real team's number
  -- would be comparing two different quantities.
  point_diff    numeric(4,1) not null,
  rating        numeric(5,1),
  ortg          numeric(5,1),
  drtg          numeric(5,1),
  chemistry     numeric(4,2),
  structure_mult numeric(4,3),
  archetype     text,
  spend_musd    numeric(5,1),
  respins       smallint not null default 0,
  -- Where this roster lands among the real team-seasons in the data. The page
  -- prints it on the results screen, so the board can print it too without a
  -- second definition of it.
  all_time_rank integer,

  -- The roster, as the engine's own pkey: "<player_id>|<season>|<CLUB>". Rows
  -- are drawn from these keys by the client against its own copy of
  -- players.json, so no player-supplied text is ever stored or displayed.
  -- Deliberate: a free-text name or headline column would be an abuse surface,
  -- and there is no moderation here to answer it.
  --
  -- THE CLUB IS IN THE KEY AND HAS TO BE. The football table stores
  -- "<id>:<season>" because a player has one row a year there. Here 755 of
  -- 16,057 rows are a player traded mid-season, who has a row per club, so
  -- id and season together name two different half-seasons at two different
  -- prices. Dropping the club would have made those rosters unrenderable and
  -- the two halves indistinguishable, and it would have failed on 5% of
  -- players with nothing on screen to say which one it picked.
  --
  -- It is E.pkey()'s format EXACTLY, and not a second wire format translated
  -- at each end, because the client looks a row up in the map it already keys
  -- by that string. One definition, no translation, nothing to drift.
  picks         text[] not null,
  slots         text[],

  -- For a replay verifier that does not exist yet. See the header.
  seed          text,
  rng_calls     integer,

  -- ONE sortable key, so ranking is a single count(*) and one index covers it.
  -- Monotone in wins first, then per-game differential, which is shifted by 40
  -- and clamped into 0..9999 so it can never carry into the wins digit: a 50
  -- win season can never outrank a 51 win one however lopsided the scores.
  -- Measured over real drafts the differential runs about -12 to +12, so the
  -- clamp is a guard against a client bug rather than a live ceiling.
  score integer generated always as (
    wins::int * 10000
    + least(9999, greatest(0, round((point_diff + 40) * 100)::int))
  ) stored,

  -- The two modes that carry a lock must carry a key, and the two that do not
  -- must not. Written as a constraint rather than left to the function, because
  -- the function is one writer and a constraint is the table's own promise: a
  -- future second writer cannot get this wrong quietly.
  constraint rtf_runs_mode_chk check (run_mode in ('league','club','era','daily')),
  constraint rtf_runs_lock_chk check (
    (run_mode in ('club','era') and lock_key is not null)
    or (run_mode in ('league','daily') and lock_key is null)),
  constraint rtf_runs_daily_chk check (
    (run_mode = 'daily' and daily_day is not null and daily_day > 0)
    or (run_mode <> 'daily' and daily_day is null))
);

comment on table rtf_runs is
  'Completed runs of Run The Floor (/hoops). Written only by rtf_submit_run().';

alter table rtf_runs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'rtf_runs'
                    and policyname = 'rtf_runs_read') then
    create policy rtf_runs_read on rtf_runs for select using (true);
  end if;
end $$;

-- READ ONLY, AND THAT IS THE WHOLE SECURITY MODEL. Neither role may insert,
-- update or delete a row directly; the one writer is the security-definer
-- function below, which is what makes its coherence checks unavoidable rather
-- than advisory.
revoke all on rtf_runs from anon, authenticated;
grant select on rtf_runs to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Indexes: every query the client makes, and nothing speculative.
--
-- The shape is 50_football_perfect_season.sql's, which was measured on a local
-- Postgres 16 at two million rows and is quoted in full there. What it comes
-- down to: a leading equality column, then the sort column, then created_at, so
-- the filter, the order AND the time window all come out of one index scan with
-- no heap access. A window on a column the index does not carry turns a 9ms
-- query into a 252ms one, so any new way of windowing this board has to use a
-- column these indexes already have.
--
-- THERE IS NO ASCENDING TWIN, and that only works because the client reverses
-- the TIEBREAK along with the sort key. Postgres reads an index backwards as
-- happily as forwards, but only when every sort key reverses together.
-- ---------------------------------------------------------------------------
-- The league and daily boards: run_mode alone is the scope.
create index if not exists rtf_runs_mode_score_idx
  on rtf_runs (run_mode, score desc, created_at asc);
create index if not exists rtf_runs_mode_rating_idx
  on rtf_runs (run_mode, rating desc, created_at asc);
create index if not exists rtf_runs_mode_created_idx
  on rtf_runs (run_mode, created_at desc, score desc);
-- The two locked boards: the mode and the key together are the scope. Partial,
-- because a league or daily row can never match and indexing it would double
-- the write cost of the mode that sees the most traffic for nothing.
create index if not exists rtf_runs_lock_score_idx
  on rtf_runs (run_mode, lock_key, score desc, created_at asc)
  where lock_key is not null;
create index if not exists rtf_runs_lock_rating_idx
  on rtf_runs (run_mode, lock_key, rating desc, created_at asc)
  where lock_key is not null;
-- One day is one puzzle, so the day IS the window: an equality rather than a
-- range, which is why this needs no created_at companion to stay a plain scan.
create index if not exists rtf_runs_daily_score_idx
  on rtf_runs (daily_day, score desc, created_at asc)
  where daily_day is not null;
create index if not exists rtf_runs_daily_rating_idx
  on rtf_runs (daily_day, rating desc, created_at asc)
  where daily_day is not null;
-- Your own runs, newest first, which is what the profile asks for.
create index if not exists rtf_runs_user_idx
  on rtf_runs (user_id, created_at desc) where user_id is not null;

-- ---------------------------------------------------------------------------
-- rtf_submit_run(): the only thing that may write a row
-- ---------------------------------------------------------------------------
create or replace function rtf_submit_run(
  p_regular_wins  int,
  p_playoff_wins  int,
  p_point_diff    numeric,
  -- The lock, as the page knows it. The MODE IS DERIVED FROM THESE rather than
  -- sent beside them, because two arguments saying the same thing are two
  -- chances for a client to disagree with itself, and then the board and the
  -- row it came from describe two different competitions.
  p_club          text     default null,
  p_era           text     default null,
  p_daily_day     int      default null,
  p_rating        numeric  default null,
  p_ortg          numeric  default null,
  p_drtg          numeric  default null,
  p_chemistry     numeric  default null,
  p_structure_mult numeric default null,
  p_archetype     text     default null,
  p_spend_musd    numeric  default null,
  p_respins       int      default 0,
  p_all_time_rank int      default null,
  p_picks         text[]   default null,
  p_slots         text[]   default null,
  p_seed          text     default null,
  p_rng_calls     int      default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  -- MUST MATCH hoops/engine.js CONSTANTS. Literals rather than a read from a
  -- config table, so this file is a complete statement of the rules and can be
  -- read on its own. If one of these moves in the engine it has to move here in
  -- the same commit, or the board starts refusing runs the game can produce.
  RTF_REG_GAMES     constant int := 82;   -- REGULAR_SEASON_GAMES
  RTF_PLAY_IN_WINS  constant int := 43;   -- PLAY_IN_WINS
  RTF_TOP_SIX_WINS  constant int := 50;   -- TOP_SIX_WINS
  RTF_ROUNDS_SEEDED constant int := 4;    -- PLAYOFF_ROUNDS_SEEDED
  RTF_ROUNDS_PLAYIN constant int := 5;    -- PLAYOFF_ROUNDS_PLAY_IN
  RTF_RECORD_WINS   constant int := 72;   -- RECORD_WINS
  RTF_GOAT_WINS     constant int := 74;   -- GOAT_WINS
  RTF_ROSTER_SIZE   constant int := 6;
  RTF_CAP_MUSD      constant numeric := 126;  -- CAP_MUSD
  -- Day 1 of today's run, as hoops/index.html's DAILY_EPOCH. Eastern, because
  -- that is where the page's day rolls.
  RTF_DAILY_EPOCH   constant date := date '2026-09-18';

  v_reg    int := p_regular_wins;
  v_po     int := coalesce(p_playoff_wins, 0);
  v_wins   int;
  v_losses int;
  v_rounds int;
  v_made   boolean;
  v_title  boolean;
  v_label  text;
  v_mode   text;
  v_key    text;
  v_day    int;
  v_iso    date;
  v_today  int;
  v_user   uuid := auth.uid();
  v_name   text;
  v_dupe   bigint;
  v_id     bigint;
begin
  -- ---- which competition, decided here and never sent ----
  if p_club is not null and p_club <> '' and p_era is not null and p_era <> '' then
    raise exception 'a run is locked to a club or to a decade, never to both';
  end if;
  if p_daily_day is not null
     and ((p_club is not null and p_club <> '') or (p_era is not null and p_era <> '')) then
    raise exception 'today''s run is the whole league and carries no lock';
  end if;

  if p_daily_day is not null then
    v_mode := 'daily';
    v_day  := p_daily_day;
    -- A DAY EITHER SIDE OF TODAY, for a run that was in progress across
    -- midnight and for a clock that is a little out. Any wider and an old
    -- puzzle could be back-filled once its answers are known, which is the one
    -- thing that would make this board worth nothing.
    --
    -- THE WINDOW IS ASKED BEFORE THE FLOOR, and the order is the whole reason
    -- both checks are testable. Written the other way round, a day of zero or
    -- less is refused for being non-positive, which is true and useless: on
    -- day 2 of this mode's life "last week" IS a negative number, so the test
    -- for the window could only ever exercise the floor, and would have
    -- started passing for the right reason a week later with nobody the wiser.
    v_today := (((now() at time zone 'America/New_York')::date - RTF_DAILY_EPOCH) + 1)::int;
    if v_day < v_today - 1 or v_day > v_today + 1 then
      raise exception 'day % is not close enough to today (day %)', v_day, v_today;
    end if;
    -- And the floor still has a job: on day 1 the window admits day 0, which
    -- is a puzzle that never existed.
    if v_day < 1 then
      raise exception 'day number must be positive, got %', v_day;
    end if;
    v_iso := RTF_DAILY_EPOCH + (v_day - 1);
  elsif p_club is not null and p_club <> '' then
    v_mode := 'club';
    -- Modern franchise codes are two to four upper case letters in this data
    -- (BKN, PHO, WSB, and the three and four letter aliases beside them).
    if p_club !~ '^[A-Z]{2,4}$' then
      raise exception 'club code looks wrong: %', p_club;
    end if;
    v_key := p_club;
  elsif p_era is not null and p_era <> '' then
    v_mode := 'era';
    if p_era !~ '^[a-z]{4,12}$' then
      raise exception 'era key looks wrong: %', p_era;
    end if;
    v_key := p_era;
  else
    v_mode := 'league';
  end if;

  -- ---- the record has to be a record this game can produce ----
  if v_reg is null or v_reg < 0 or v_reg > RTF_REG_GAMES then
    raise exception 'regular season wins must be 0..%, got %', RTF_REG_GAMES, v_reg;
  end if;

  if v_reg >= RTF_TOP_SIX_WINS then
    v_rounds := RTF_ROUNDS_SEEDED;  v_label := 'Top six seed';
  elsif v_reg >= RTF_PLAY_IN_WINS then
    v_rounds := RTF_ROUNDS_PLAYIN;  v_label := 'Play-in';
  else
    v_rounds := 0;                  v_label := 'Lottery';
  end if;
  v_made := v_rounds > 0;

  if not v_made then
    if v_po <> 0 then
      raise exception 'playoff wins with % regular season wins, which misses the playoffs', v_reg;
    end if;
    v_title := false;
  else
    if v_po < 0 or v_po > v_rounds then
      raise exception 'playoff wins must be 0..% for a % seed, got %', v_rounds, v_label, v_po;
    end if;
    v_title := v_po = v_rounds;
  end if;

  -- THE LOSSES ARE THE REGULAR SEASON'S ALONE, which is the one place this
  -- deliberately differs from the football table. A round here is a SERIES, so
  -- a bracket loss is four wins and three losses for somebody and the games it
  -- took are not in anything the client sends. 58-24 is the record a basketball
  -- fan means, and putting playoff series into the win column would make every
  -- number on this board unreadable against a real team's.
  v_wins   := v_reg;
  v_losses := RTF_REG_GAMES - v_reg;

  -- ---- the descriptive numbers have to be in range ----
  if p_point_diff is null or p_point_diff < -60 or p_point_diff > 60 then
    raise exception 'point differential out of range: %', p_point_diff;
  end if;
  -- Client-reported for the same reason the wins are: recomputing a rating
  -- needs the win shares and prices in the browser's copy of players.json. A
  -- bound is a sanity check, not a fairness guarantee. For scale, verify.mjs
  -- measures a thoughtless draft near 42 wins and a perfect one near 61, on a
  -- rating scale whose real team-seasons run about 10 to 74.
  if p_rating is not null and (p_rating < 0 or p_rating > 200) then
    raise exception 'rating out of range: %', p_rating;
  end if;
  if p_ortg is not null and (p_ortg < 50 or p_ortg > 200) then
    raise exception 'offensive rating out of range: %', p_ortg;
  end if;
  if p_drtg is not null and (p_drtg < 50 or p_drtg > 200) then
    raise exception 'defensive rating out of range: %', p_drtg;
  end if;
  if p_chemistry is not null and (p_chemistry < -5 or p_chemistry > 10) then
    raise exception 'chemistry out of range: %', p_chemistry;
  end if;
  if p_structure_mult is not null and (p_structure_mult < 0.2 or p_structure_mult > 2) then
    raise exception 'structure multiplier out of range: %', p_structure_mult;
  end if;
  if p_spend_musd is not null and (p_spend_musd < 0 or p_spend_musd > RTF_CAP_MUSD) then
    raise exception 'spend of % is outside the $%M cap', p_spend_musd, RTF_CAP_MUSD;
  end if;
  if coalesce(p_respins, 0) < 0 or coalesce(p_respins, 0) > 6 then
    raise exception 'respins must be 0..6, got %', p_respins;
  end if;
  if p_archetype is not null and length(p_archetype) > 40 then
    raise exception 'archetype name is too long';
  end if;

  -- ---- the roster has to be six distinct, well-formed player-seasons ----
  if p_picks is null or cardinality(p_picks) <> RTF_ROSTER_SIZE then
    raise exception 'a run has % picks, got %', RTF_ROSTER_SIZE,
      coalesce(cardinality(p_picks), 0);
  end if;
  if cardinality(array(select distinct unnest(p_picks))) <> RTF_ROSTER_SIZE then
    raise exception 'the same player cannot be signed twice';
  end if;
  -- The separator is written [|] and not \| on purpose: a bracket expression
  -- is a literal in every regex flavour, where an escaped pipe is a literal in
  -- some and undefined in others, and this is the one check standing between
  -- the table and arbitrary text.
  if exists (select 1 from unnest(p_picks) k
              where k !~ '^[0-9a-z]{1,12}[|][12][0-9]{3}[|][A-Z]{2,4}$') then
    raise exception 'a pick is not of the form <player_id>|<season>|<CLUB>';
  end if;
  if p_slots is not null then
    if cardinality(p_slots) <> RTF_ROSTER_SIZE then
      raise exception 'slots must line up with picks';
    end if;
    if exists (select 1 from unnest(p_slots) s
                where s not in ('PG','SG','SF','PF','C','6TH')) then
      raise exception 'unknown slot name';
    end if;
  end if;

  -- ---- the name, read here and never sent ----
  if v_user is not null then
    select username::text into v_name from profiles where id = v_user;
  end if;

  -- ---- swallow an accidental double submit ----
  -- A retry after a timeout, or a second tap on a button, must not put the same
  -- season on the board twice. Same roster, same result, same competition,
  -- inside a minute: hand back the row that is already there. This is
  -- idempotency and NOT a rate limiter: two genuinely different runs a second
  -- apart both land.
  select id into v_dupe from rtf_runs
   where picks = p_picks and regular_wins = v_reg and playoff_wins = v_po
     and run_mode = v_mode
     and lock_key is not distinct from v_key
     and daily_day is not distinct from v_day
     and created_at > now() - interval '1 minute'
   limit 1;
  if v_dupe is not null then return v_dupe; end if;

  insert into rtf_runs (
    user_id, display_name, run_mode, lock_key, daily_day, daily_iso,
    regular_wins, playoff_wins, wins, losses, games,
    made_playoffs, title_won, beat_record, is_goat, seed_label,
    point_diff, rating, ortg, drtg, chemistry, structure_mult, archetype,
    spend_musd, respins, all_time_rank, picks, slots, seed, rng_calls
  ) values (
    v_user, v_name, v_mode, v_key, v_day, v_iso,
    v_reg, v_po, v_wins, v_losses, RTF_REG_GAMES,
    v_made, v_title, v_reg >= RTF_RECORD_WINS, v_reg >= RTF_GOAT_WINS, v_label,
    round(p_point_diff, 1), round(p_rating, 1), round(p_ortg, 1), round(p_drtg, 1),
    round(p_chemistry, 2), round(p_structure_mult, 3), p_archetype,
    round(p_spend_musd, 1), coalesce(p_respins, 0), p_all_time_rank,
    p_picks, p_slots, p_seed, p_rng_calls
  ) returning id into v_id;

  return v_id;
end $$;

revoke all on function rtf_submit_run(int,int,numeric,text,text,int,numeric,numeric,
  numeric,numeric,numeric,text,numeric,int,int,text[],text[],text,int) from public;
grant execute on function rtf_submit_run(int,int,numeric,text,text,int,numeric,numeric,
  numeric,numeric,numeric,text,numeric,int,int,text[],text[],text,int)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- rtf_claim_run(): the run you finished before you signed in
-- ---------------------------------------------------------------------------
-- Only ever stamps a row that is still UNOWNED, which is what makes it
-- impossible to take somebody else's. The id travels through the browser, so
-- the id alone must not be enough to own a row. Same guard as ps_claim_run()
-- and claim_draft() before it.
create or replace function rtf_claim_run(p_id bigint)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_rows int;
begin
  if v_user is null then return false; end if;
  select username::text into v_name from profiles where id = v_user;
  update rtf_runs
     set user_id = v_user, display_name = v_name
   where id = p_id and user_id is null;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;
revoke all on function rtf_claim_run(bigint) from public;
grant execute on function rtf_claim_run(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- rtf_rename_runs(): what keeps the denormalised copy honest
-- ---------------------------------------------------------------------------
-- Call it after set_username(). Without it a rename leaves every past run under
-- the old name, which is the one real cost of not joining profiles on read.
create or replace function rtf_rename_runs()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_rows int;
begin
  if v_user is null then return 0; end if;
  select username::text into v_name from profiles where id = v_user;
  update rtf_runs set display_name = v_name where user_id = v_user;
  get diagnostics v_rows = row_count;
  return v_rows;
end $$;
revoke all on function rtf_rename_runs() from public;
grant execute on function rtf_rename_runs() to authenticated;

-- ---------------------------------------------------------------------------
-- rtf_board_modes(): which locked boards have anything on them
-- ---------------------------------------------------------------------------
-- The picker needs this and cannot work it out client side without pulling the
-- whole table. Thirty clubs and six decades is a small enough answer to send
-- whole, and a board with nothing on it is worth offering anyway (being first
-- is the prize on a mode this new), so this reports COUNTS rather than deciding
-- anything: the page can order the picker by where the competition is and still
-- offer every door.
create or replace function rtf_board_modes()
returns table (run_mode text, lock_key text, runs bigint, best_wins smallint)
language sql stable security definer set search_path = public as $$
  select r.run_mode, r.lock_key, count(*)::bigint, max(r.wins)
    from rtf_runs r
   where r.run_mode in ('club','era')
   group by r.run_mode, r.lock_key
$$;
revoke all on function rtf_board_modes() from public;
grant execute on function rtf_board_modes() to anon, authenticated;

analyze rtf_runs;
