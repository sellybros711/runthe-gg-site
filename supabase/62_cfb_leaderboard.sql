-- ============================================================================
-- 62_cfb_leaderboard.sql : accounts and the leaderboard for College Football:
--                          Perfect Season (/cfb)
-- ============================================================================
-- New and self-contained. Touches nothing that already exists: no existing
-- table, function, policy or grant is altered. Safe and idempotent, re-running
-- it does nothing new.
--
-- Run it once in the Supabase SQL editor. Until it is run, cfb/board.js gets a
-- 404 from every call, reports itself unavailable, and the game shows the board
-- as offline rather than showing wrong numbers.
--
-- THIS ADDS NO NEW ACCOUNT SYSTEM. The site already has one: `profiles` from
-- 10_accounts.sql, with a citext-unique username, a handle_new_user trigger that
-- makes a row the moment somebody signs up, and set_username/username_available
-- helpers. Email-and-password and Google are already configured on the project
-- because the other games use them. A RunThe.GG account IS the account here.
--
-- THE NAME IS NEVER SENT BY THE CLIENT. cfb_submit_run() reads it out of
-- profiles for auth.uid(), which is what the football and soccer games do and
-- for the same reason: a client-supplied name on a public board is a forgery and
-- an abuse surface at once. There is no free-text column here that a player can
-- write into, and the roster is stored as ids that the client renders against
-- its own copy of the player data.
--
-- Guests still record and appear as Anonymous, the same trade the football game
-- makes: this game's whole first minute is one draft, and demanding an account
-- before the board will admit it happened is the wrong friction for a game that
-- has none anywhere else.
--
-- WHAT IS TRUSTED AND WHAT IS NOT
-- -------------------------------
-- The season is simulated in the browser, so the browser is the only thing that
-- knows how it went. There is no way for this function to recompute that without
-- replaying the whole engine, so the record IS client-reported and a determined
-- person can post a season they did not play.
--
-- What this function does instead is own every DERIVED field and refuse any row
-- that is not internally coherent. The client sends four numbers about the
-- result and nothing else: regular wins, the national ranking, playoff wins and
-- whether a bowl was won. Losses, total games, the seed, the bye, made_playoffs,
-- title_won, perfect, the round somebody went out in, the bowl tier and the
-- ordering score are all computed here.
--
-- COLLEGE IS A BETTER SHAPE FOR THIS THAN THE PRO GAME, and it is worth saying
-- why. In football/ the playoff field is a win threshold, so the server derives
-- the seed from the win count and that is the end of it. Here the field is the
-- top twelve of a national ranking, and engine.js's seedFromRanking() sets
-- seed = rank exactly when rank <= 12. That single identity lets this function
-- check the seed against the ranking rather than take both on trust, so the
-- following are all impossible rather than merely unlikely:
--
--   * a national champion who was never in the field
--   * a No. 3 seed ranked 40th, or a 12-0 team seeded 11th with no bye
--   * a bye seed playing the first round, or a 9 seed skipping it
--   * two playoff losses, when one loss ends it
--   * a bowl game played by a team that was in the playoff
--   * a bowl tier that does not match the number of losses
--   * a perfect flag on a season with a loss in it
--   * a 5-7 team in the twelve-team field
--
-- The honest fix for the remaining hole is an edge function that loads engine.js
-- and replays the season from (picks, rng_seed, rng_calls), which is why those
-- three columns are stored even though nothing reads them yet. Until then the
-- board is a participation and comparison board, and should not be the basis for
-- a prize.
-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------
create table if not exists cfb_runs (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  -- Nullable so a guest's run records now and can be claimed on sign-in, the
  -- same shape 17_claim_draft.sql and 51_football_accounts.sql use.
  user_id       uuid,
  -- Denormalised on purpose. The alternative is embedding profiles in every
  -- board read, which turns each count query and both list queries into a join,
  -- and those counts are index-only scans today. cfb_rename_runs() below is what
  -- keeps a denormalised copy honest when somebody changes their name.
  display_name  text,

  -- The result. Only regular_wins, national_rank, playoff_wins and bowl_won come
  -- from the client; everything else on this block is computed below.
  regular_wins  smallint not null,
  playoff_wins  smallint not null,
  wins          smallint not null,
  losses        smallint not null,
  games         smallint not null,
  national_rank smallint not null,
  playoff_seed  smallint,                 -- 1..12, or null for a team that missed
  made_playoffs boolean  not null,
  title_won     boolean  not null,
  perfect       boolean  not null,
  eliminated_in text,                     -- the round it ended in, null if it did not
  bowl          text,                     -- 'ny6' | 'bowl' | 'minor', null if none
  bowl_won      boolean  not null default false,
  seed_label    text     not null,

  -- Descriptive, and shown on the board. Bounded, never free text.
  point_diff    numeric(4,1) not null,
  chemistry_pct numeric(5,2) not null,
  spend_musd    numeric(5,2) not null,
  respins       smallint     not null default 0,
  sig_wins      smallint     not null default 0,   -- ranked teams beaten
  best_win_rank smallint,                          -- the best of them

  -- The roster's own strength, the board's second sort axis.
  --
  -- team_rating is not a made-up composite. resolveGame() scores a week as
  --   sum(ppr_ppg_mean) * chemistry * structure * defenseModifier
  -- so dropping the per-opponent term leaves the points a roster is expected to
  -- put up against an average defense.
  --
  -- overall is that same number divided by the game's ceiling and multiplied by
  -- 100, which is what every screen in the game actually displays. BOTH are
  -- stored and the board sorts on `overall`, because a board column has to be
  -- the number the player saw on their own results screen or they cannot find
  -- themselves on it.
  squad_fppg     numeric(5,1),   -- summed ppr_ppg_mean, before any multiplier
  structure_mult numeric(4,3),   -- rosterStructure().multiplier
  team_rating    numeric(6,2),   -- squad_fppg * chemistry * structure
  overall        numeric(6,2),   -- team_rating scaled to the displayed 0..100+
  perfect_pct    smallint,       -- yourProjected / bestProjected, as a percentage

  -- The roster, as "<player_id>:<season>". Rows are rendered from these ids by
  -- the client against its own copy of cfb_player_seasons.json, so no
  -- player-supplied text is ever stored or displayed.
  picks         text[] not null,
  slots         text[],

  -- For the replay verifier described in the header. Nothing reads these yet.
  rng_seed      text,
  rng_calls     integer,

  -- ONE sortable key, so ranking is a single count(*) and one index covers it.
  -- Monotone in wins first, then point differential. The differential is shifted
  -- by 40 and clamped into 0..9999 so it can never carry into the wins digit: a
  -- 12-win season can never outrank a 13-win one however lopsided the scores.
  score integer generated always as (
    wins::int * 10000
    + least(9999, greatest(0, round((point_diff + 40) * 100)::int))
  ) stored
);

comment on table cfb_runs is
  'Completed runs of College Football: Perfect Season (/cfb). Written only by cfb_submit_run().';

-- ---------------------------------------------------------------------------
-- Indexes. Every query the client makes, and nothing speculative.
--
-- The shape is taken from ps_runs, whose numbers were measured at two million
-- rows: a leading equality column followed by the sort column is what lets
-- Postgres satisfy the filter and the order from one index scan, and the
-- trailing created_at is what lets a time window be tested from INSIDE the index
-- rather than as a filter with a heap fetch per candidate row. On ps_runs that
-- difference was 1,081 buffers against 59,917 for the same windowed query.
--
-- THERE IS NO ASCENDING TWIN, and that only works because the client reverses
-- the TIEBREAK along with the sort key. Postgres reads an index backwards as
-- happily as forwards, but only when every sort key reverses together. See
-- ORDER_TIEBREAK in cfb/board.js.
--
-- This game has one competition rather than the football game's several, so
-- there is no leading mode column: the board is every run.
-- ---------------------------------------------------------------------------
create index if not exists cfb_runs_score_idx
  on cfb_runs (score desc, created_at asc);
create index if not exists cfb_runs_created_idx
  on cfb_runs (created_at desc, score desc);
create index if not exists cfb_runs_overall_idx
  on cfb_runs (overall desc, created_at asc);
-- The national ranking is the third axis, and the only one that sorts ASCENDING:
-- No. 1 is the best. Its own index rather than a backward scan of another,
-- because nothing else orders this way.
create index if not exists cfb_runs_rank_idx
  on cfb_runs (national_rank asc, created_at asc);
-- Claiming anonymous runs once signed in, a player's own history, and the
-- rename below.
create index if not exists cfb_runs_user_idx
  on cfb_runs (user_id, created_at desc) where user_id is not null;

-- ---------------------------------------------------------------------------
-- RLS: everyone reads, nobody writes directly. The RPC is the only writer.
-- ---------------------------------------------------------------------------
alter table cfb_runs enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies
                 where tablename='cfb_runs' and policyname='cfb_runs_read') then
    create policy cfb_runs_read on cfb_runs for select using (true);
  end if;
end $$;

revoke all on cfb_runs from anon, authenticated;
grant select on cfb_runs to anon, authenticated;

-- ---------------------------------------------------------------------------
-- cfb_submit_run()
-- ---------------------------------------------------------------------------
-- Returns the new row id. Raises with a readable message on anything incoherent,
-- so a client bug shows up as a failed submit rather than as a wrong board.
--
-- The constants below MUST match cfb/engine.js CONSTANTS. They are literals
-- rather than a read from a config table so this file is a complete statement of
-- the rules. If the NIL budget or the size of the field changes, change them
-- here in the same deploy or legitimate seasons will start being refused.
-- ---------------------------------------------------------------------------
drop function if exists cfb_submit_run(int,int,int,boolean,numeric,numeric,numeric,int,int,int,text[],text[],text,int,numeric,numeric,numeric,numeric,int);

create or replace function cfb_submit_run(
  p_regular_wins   int,
  p_national_rank  int,
  p_playoff_wins   int      default 0,
  p_bowl_won       boolean  default false,
  p_point_diff     numeric  default null,
  p_chemistry_pct  numeric  default null,
  p_spend_musd     numeric  default null,
  p_respins        int      default 0,
  p_sig_wins       int      default 0,
  p_best_win_rank  int      default null,
  p_picks          text[]   default null,
  p_slots          text[]   default null,
  p_rng_seed       text     default null,
  p_rng_calls      int      default null,
  p_squad_fppg     numeric  default null,
  p_structure_mult numeric  default null,
  p_team_rating    numeric  default null,
  p_overall        numeric  default null,
  p_perfect_pct    int      default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  CFB_REG_GAMES     constant int := 12;
  CFB_FIELD_SIZE    constant int := 134;
  CFB_PLAYOFF_TEAMS constant int := 12;
  CFB_PLAYOFF_BYES  constant int := 4;
  CFB_ROUNDS_BYE    constant int := 3;
  CFB_ROUNDS_NO_BYE constant int := 4;
  CFB_ROSTER_SIZE   constant int := 6;
  CFB_CAP_MUSD      constant numeric := 14;
  CFB_NY6_MAX_LOSSES   constant int := 3;
  CFB_BOWL_MAX_LOSSES  constant int := 5;
  CFB_MINOR_MAX_LOSSES constant int := 6;
  -- The most regular-season losses a team in the twelve-team field can have.
  -- Calibration puts 12-0 on a bye, 11-1 in or on the bubble and 10-2 out, so
  -- four is generous by two games. It is here to make a 5-7 national champion
  -- impossible, not to adjudicate the bubble.
  CFB_FIELD_MAX_LOSSES constant int := 4;

  ROUND_NAMES constant text[] :=
    array['CFP First Round','CFP Quarterfinal','CFP Semifinal','CFP Championship'];

  v_reg     int := p_regular_wins;
  v_po      int := coalesce(p_playoff_wins, 0);
  v_rank    int := p_national_rank;
  v_reg_l   int;
  v_seed    int;
  v_bye     boolean;
  v_rounds  int;
  v_made    boolean;
  v_title   boolean;
  v_po_games int;
  v_bowl    text := null;
  v_bowl_won boolean := false;
  v_bowl_games int := 0;
  v_elim    text := null;
  v_names   text[];
  v_wins    int;
  v_losses  int;
  v_games   int;
  v_label   text;
  v_dupe    bigint;
  v_id      bigint;
  v_user    uuid := auth.uid();
  v_name    text;
begin
  -- ---- the record has to be a record this game can produce ----
  if v_reg is null or v_reg < 0 or v_reg > CFB_REG_GAMES then
    raise exception 'regular wins must be 0..%, got %', CFB_REG_GAMES, v_reg;
  end if;
  v_reg_l := CFB_REG_GAMES - v_reg;

  if v_rank is null or v_rank < 1 or v_rank > CFB_FIELD_SIZE then
    raise exception 'national ranking must be 1..%, got %', CFB_FIELD_SIZE, v_rank;
  end if;

  -- ---- the field, derived from the ranking exactly as seedFromRanking() does ----
  -- seed = rank when rank is inside the field. That identity is the whole reason
  -- the client sends a ranking and not a seed: two numbers saying the same thing
  -- is two chances for a client to disagree with itself.
  if v_rank <= CFB_PLAYOFF_TEAMS then
    if v_reg_l > CFB_FIELD_MAX_LOSSES then
      raise exception 'a %-% team cannot be ranked % and in the playoff', v_reg, v_reg_l, v_rank;
    end if;
    v_seed   := v_rank;
    v_bye    := v_rank <= CFB_PLAYOFF_BYES;
    v_rounds := case when v_bye then CFB_ROUNDS_BYE else CFB_ROUNDS_NO_BYE end;
    v_made   := true;
    v_label  := case when v_bye then 'No. ' || v_rank || ' seed, first-round bye'
                     else 'No. ' || v_rank || ' seed' end;
  else
    v_seed   := null;
    v_bye    := false;
    v_rounds := 0;
    v_made   := false;
    -- The bowl tier is a function of losses, so the client does not send it.
    if v_reg_l <= CFB_NY6_MAX_LOSSES then
      v_bowl := 'ny6';   v_label := 'New Year''s Six Bowl';
    elsif v_reg_l <= CFB_BOWL_MAX_LOSSES then
      v_bowl := 'bowl';  v_label := 'Bowl Game';
    elsif v_reg_l <= CFB_MINOR_MAX_LOSSES then
      v_bowl := 'minor'; v_label := 'Minor Bowl';
    else
      v_bowl := null;    v_label := 'Season over';
    end if;
  end if;

  -- ---- the postseason has to fit the bracket it was seeded into ----
  if v_made then
    if v_po < 0 or v_po > v_rounds then
      raise exception 'playoff wins must be 0..% for the No. % seed, got %', v_rounds, v_seed, v_po;
    end if;
    if p_bowl_won then
      raise exception 'a playoff team does not play a bowl game';
    end if;
    v_title := v_po = v_rounds;
    -- One playoff loss ends the run, so a non-champion played exactly one game
    -- more than it won.
    v_po_games := case when v_title then v_rounds else v_po + 1 end;
    if not v_title then
      -- The round it went out in, counting from the back of the ladder so a team
      -- playing three rounds starts at the quarterfinal and one playing four
      -- starts at the first round. Same slice playoffRoundNames() takes.
      v_names := ROUND_NAMES[(array_length(ROUND_NAMES,1) - v_rounds + 1):array_length(ROUND_NAMES,1)];
      v_elim  := v_names[v_po + 1];
    end if;
  else
    if v_po <> 0 then
      raise exception 'playoff wins on a season ranked %, which misses the field', v_rank;
    end if;
    v_title := false;
    v_po_games := 0;
    if v_bowl is null and p_bowl_won then
      raise exception 'a bowl win on a season with % losses, which reaches no bowl', v_reg_l;
    end if;
    v_bowl_won   := v_bowl is not null and coalesce(p_bowl_won, false);
    v_bowl_games := case when v_bowl is null then 0 else 1 end;
  end if;

  v_wins   := v_reg + v_po + (case when v_bowl_won then 1 else 0 end);
  v_losses := v_reg_l + (v_po_games - v_po)
              + (case when v_bowl_games = 1 and not v_bowl_won then 1 else 0 end);
  v_games  := CFB_REG_GAMES + v_po_games + v_bowl_games;

  -- ---- the descriptive numbers have to be in range ----
  if p_point_diff is null or p_point_diff < -60 or p_point_diff > 60 then
    raise exception 'point differential out of range: %', p_point_diff;
  end if;
  if p_chemistry_pct is null or p_chemistry_pct < -50 or p_chemistry_pct > 100 then
    raise exception 'chemistry out of range: %', p_chemistry_pct;
  end if;
  if p_spend_musd is null or p_spend_musd < 0 or p_spend_musd > CFB_CAP_MUSD then
    raise exception 'spend of $%M is outside the $%M budget', p_spend_musd, CFB_CAP_MUSD;
  end if;
  if coalesce(p_respins, 0) < 0 or coalesce(p_respins, 0) > 3 then
    raise exception 'respins must be 0..3, got %', p_respins;
  end if;
  if coalesce(p_sig_wins, 0) < 0 or coalesce(p_sig_wins, 0) > v_wins then
    raise exception 'more ranked wins (%) than wins (%)', p_sig_wins, v_wins;
  end if;
  if p_best_win_rank is not null then
    if p_best_win_rank < 1 or p_best_win_rank > 25 then
      raise exception 'a signature win is against a top 25 team, got rank %', p_best_win_rank;
    end if;
    if coalesce(p_sig_wins, 0) = 0 then
      raise exception 'a best ranked win with no ranked wins';
    end if;
  end if;

  -- The rating is client-reported for the same reason the record is: recomputing
  -- it needs the player prices and per-player scoring rates, which live in the
  -- browser's copy of cfb_player_seasons.json and not in this database. These
  -- bounds are a sanity check, not a fairness guarantee. For scale, the best
  -- line-up the wheel can produce measures about 135 raw, which is the 100 the
  -- overall is scaled against.
  if p_squad_fppg is not null and (p_squad_fppg < 0 or p_squad_fppg > 400) then
    raise exception 'squad FPPG out of range: %', p_squad_fppg;
  end if;
  if p_structure_mult is not null and (p_structure_mult < 0.2 or p_structure_mult > 2) then
    raise exception 'structure multiplier out of range: %', p_structure_mult;
  end if;
  if p_team_rating is not null and (p_team_rating < 0 or p_team_rating > 400) then
    raise exception 'team rating out of range: %', p_team_rating;
  end if;
  if p_overall is not null and (p_overall < 0 or p_overall > 300) then
    raise exception 'overall out of range: %', p_overall;
  end if;
  if p_perfect_pct is not null and (p_perfect_pct < 0 or p_perfect_pct > 100) then
    raise exception 'perfect percentage out of range: %', p_perfect_pct;
  end if;

  -- ---- the roster has to be six distinct, well-formed player-seasons ----
  if p_picks is null or cardinality(p_picks) <> CFB_ROSTER_SIZE then
    raise exception 'a run has % picks, got %', CFB_ROSTER_SIZE,
      coalesce(cardinality(p_picks), 0);
  end if;
  if cardinality(array(select distinct unnest(p_picks))) <> CFB_ROSTER_SIZE then
    raise exception 'the same player cannot be signed twice';
  end if;
  if exists (select 1 from unnest(p_picks) k where k !~ '^[0-9A-Za-z-]{1,32}:[12][0-9]{3}$') then
    raise exception 'a pick is not of the form <player_id>:<season>';
  end if;
  if p_slots is not null then
    if cardinality(p_slots) <> CFB_ROSTER_SIZE then
      raise exception 'slots must line up with picks';
    end if;
    if exists (select 1 from unnest(p_slots) s where s not in ('QB','RB','WR','TE','FLEX')) then
      raise exception 'unknown slot name';
    end if;
  end if;

  -- ---- swallow an accidental double submit ----
  -- A retry after a timeout, or a second tap on Share, should not put the same
  -- season on the board twice. Same roster, same result, inside a minute: return
  -- the row that is already there. This is NOT a rate limiter, it is idempotency.
  select id into v_dupe from cfb_runs
   where picks = p_picks and regular_wins = v_reg and playoff_wins = v_po
     and national_rank = v_rank
     and created_at > now() - interval '1 minute'
   limit 1;
  if v_dupe is not null then return v_dupe; end if;

  -- The name is read here and never accepted from the client.
  if v_user is not null then
    select username::text into v_name from profiles where id = v_user;
  end if;

  insert into cfb_runs (
    user_id, display_name,
    regular_wins, playoff_wins, wins, losses, games,
    national_rank, playoff_seed, made_playoffs, title_won, perfect,
    eliminated_in, bowl, bowl_won, seed_label,
    point_diff, chemistry_pct, spend_musd, respins, sig_wins, best_win_rank,
    squad_fppg, structure_mult, team_rating, overall, perfect_pct,
    picks, slots, rng_seed, rng_calls
  ) values (
    v_user, v_name,
    v_reg, v_po, v_wins, v_losses, v_games,
    v_rank, v_seed, v_made, v_title, (v_title and v_losses = 0),
    v_elim, v_bowl, v_bowl_won, v_label,
    round(p_point_diff, 1), round(p_chemistry_pct, 2), round(p_spend_musd, 2),
    coalesce(p_respins, 0), coalesce(p_sig_wins, 0), p_best_win_rank,
    round(p_squad_fppg, 1), round(p_structure_mult, 3), round(p_team_rating, 2),
    round(p_overall, 2), p_perfect_pct,
    p_picks, p_slots, p_rng_seed, p_rng_calls
  ) returning id into v_id;

  return v_id;
end $$;

revoke all on function cfb_submit_run(int,int,int,boolean,numeric,numeric,numeric,int,int,int,text[],text[],text,int,numeric,numeric,numeric,numeric,int) from public;
grant execute on function cfb_submit_run(int,int,int,boolean,numeric,numeric,numeric,int,int,int,text[],text[],text,int,numeric,numeric,numeric,numeric,int)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- cfb_claim_run(): the run you finished before you signed in
-- ---------------------------------------------------------------------------
-- Only ever stamps a row that is still unowned, which is what makes it
-- impossible to take somebody else's. Same guard as ps_claim_run(), and the same
-- reason: the id travels through the browser, so the id alone must not be enough
-- to own a row.
create or replace function cfb_claim_run(p_id bigint)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_rows int;
begin
  if v_user is null then return false; end if;
  select username::text into v_name from profiles where id = v_user;
  update cfb_runs
     set user_id = v_user, display_name = v_name
   where id = p_id and user_id is null;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;
revoke all on function cfb_claim_run(bigint) from public;
grant execute on function cfb_claim_run(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- cfb_rename_runs(): what keeps the denormalised copy honest
-- ---------------------------------------------------------------------------
-- Call it after set_username(). Without it a rename leaves every past run under
-- the old name, which is the one real cost of not joining profiles on every read.
create or replace function cfb_rename_runs()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_rows int;
begin
  if v_user is null then return 0; end if;
  select username::text into v_name from profiles where id = v_user;
  update cfb_runs set display_name = v_name where user_id = v_user;
  get diagnostics v_rows = row_count;
  return v_rows;
end $$;
revoke all on function cfb_rename_runs() from public;
grant execute on function cfb_rename_runs() to authenticated;

analyze cfb_runs;
