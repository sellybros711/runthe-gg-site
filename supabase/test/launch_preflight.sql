-- ---------------------------------------------------------------------------
-- launch_preflight.sql : is this database ready for the modes that are live?
--
-- Paste the whole file into the Supabase SQL editor and read the last column.
-- It READS ONLY: no table is written, no function is called, nothing is
-- created. Running it twice is the same as running it once.
--
-- WHY THIS FILE EXISTS
-- ---------------------------------------------------------------------------
-- Dynasty, Full Team and Commissioner Simulator are open to everybody. Two of
-- those three fail SILENTLY against a database that is missing a migration:
-- the mode plays perfectly, the player finishes a season, and the row is
-- refused on submit with nothing said to them. Nobody reports it because
-- nothing looks broken. The only way to know is to ask the catalog.
--
-- WHY IT ASKS THE CATALOG AND NEVER CALLS ANYTHING
-- ---------------------------------------------------------------------------
-- Postgres resolves a function call at PARSE time, so one missing function in
-- a query that calls them would fail the whole statement with "function does
-- not exist" and report nothing about any of the others. Every check below is a
-- catalog lookup or a constraint definition, so a database missing everything
-- still returns a full readable report rather than one error.
--
-- HOW TO READ IT
-- ---------------------------------------------------------------------------
-- ok = true      that migration is deployed
-- ok = false     it is not, and the `breaks` column says what that costs
--
-- Anything false in the first block is a mode losing player progress right
-- now. The last row is the summary.
--
-- NOT EVERY ROW COSTS A SEASON, and the `if_missing` column is what says which
-- do. The last block is decoration: its absence takes a mark off a leaderboard
-- and nothing else. It is still on the list, because a migration nobody can see
-- the absence of is a migration that never gets run, and reading one column is
-- cheaper than remembering which files matter.
-- ---------------------------------------------------------------------------

with
-- `prokind = 'f'` IS WHAT MAKES THIS FILE RUNNABLE AT ALL, and without it this
-- whole report was one error line against every database it was written for.
--
-- `pg_get_functiondef` RAISES on an aggregate ("min is an aggregate function")
-- and on a window function. `pg_proc` holds all four kinds, so an unfiltered
-- walk of `public` evaluates that call over whatever else is in there. Installing
-- the citext extension puts `min(citext)` and `max(citext)` in public, and
-- `10_accounts.sql` needs citext because an account's `username` is one. So every
-- Supabase project this was meant to be pasted into answered with a single
-- ERROR and not one row of the table below.
--
-- THAT IS THIS FILE'S OWN HEADER ARGUMENT ARRIVING FROM A SIDE IT DID NOT
-- EXPECT. It asks the catalog rather than calling anything, precisely so one
-- missing piece cannot take the whole report down, and then took the whole
-- report down on a catalog function raising over a row nothing was asking about.
-- Found by running it against a scratch database built from the real fixture.
--
-- Nothing below asks about an aggregate, a window function or a procedure, so
-- restricting to plain functions costs nothing.
proc as (
  select p.proname as name,
         pg_get_function_identity_arguments(p.oid) as args,
         pg_get_functiondef(p.oid) as body
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
),
con as (
  select c.conname as name, pg_get_constraintdef(c.oid) as def
  from pg_constraint c
  join pg_namespace n on n.oid = c.connamespace
  where n.nspname = 'public'
),
-- EVERY TABLE ANY ROW BELOW ASKS ABOUT HAS TO BE ON THIS LIST, and that is a
-- trap rather than a convenience. `has_table` reads like a general helper and
-- is an allowlist: a check that names a table missing from it finds nothing,
-- reads false against a database where the table is sitting right there, and
-- says NO for ever. A preflight row that can only ever say NO is worse than no
-- row at all, because it tells a correctly deployed database it is broken and
-- everybody learns to ignore the column. Caught the first time a row was added
-- after this list was written: rtf_runs existed and the report said it did not.
has_table as (
  select t as name from unnest(array[
    'ps_daily_attempts','ps_dynasty_day','premium_unlocks','ps_saves',
    'commish_free_clock','ps_runs','profiles',
    'fantasy_weeks','fantasy_prices','fantasy_results','fantasy_entries',
    'nfl_games','fantasy_prizes',
    'rtf_runs','rtd_runs','rtf_plays'
  ]) as t
  where to_regclass('public.' || t) is not null
),
-- NEITHER OF THESE TWO IS AN ALLOWLIST, which is the whole reason they are shaped this
-- way. `col` and `trg` ask the catalog for everything in the schema and let the row below
-- do the filtering, so a check naming a column or a trigger that nobody thought to add to
-- a list up here cannot quietly read false for ever. That is the trap the block above
-- carries, stated as a warning, arriving at two new helpers.
col as (
  select c.relname as tbl, a.attname as name
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and a.attnum > 0 and not a.attisdropped
),
trg as (
  select t.tgname as name, c.relname as tbl
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal
),
-- AN INDEX CAN FAIL ON ITS OWN WHERE THE TABLE BESIDE IT CANNOT, which is the
-- only reason this third helper exists. A unique index is refused outright by
-- data that already breaks it, so a file pasted into the SQL editor statement by
-- statement can leave the table committed and the index raised, and `if not
-- exists` does not help: it skips on a name that is taken, never on a duplicate
-- row. Applied through `--single-transaction` the whole file rolls back and the
-- table is missing too, which the block above already catches; pasted by hand it
-- is the 114 trigger all over again, an object whose absence is invisible from
-- every side. Like `col` and `trg` and unlike `has_table`, it asks the catalog
-- for everything and lets the row do the filtering.
idx as (
  select i.relname as name, t.relname as tbl
  from pg_index x
  join pg_class i on i.oid = x.indexrelid
  join pg_class t on t.oid = x.indrelid
  join pg_namespace n on n.oid = i.relnamespace
  where n.nspname = 'public'
),
check_rows(sort, migration, what, breaks, ok) as (
  values
  -- ---- the two that lose a finished season -------------------------------
  (1, '97_football_gauntlet_mode',
      'ps_football_modes() lists every recordable mode',
      'Dynasty and Full Team seasons are REJECTED on submit. The mode plays, the season vanishes.',
      (select count(*) > 0 from proc where name = 'ps_football_modes')
      and (select count(*) > 0 from con
           where name = 'ps_runs_run_mode_ck' and def like '%ps_football_modes%')),

  (2, '93_football_fullteam_mode',
      'ps_runs accepts a fullteam run',
      'Every Full Team season is refused by the check constraint.',
      (select count(*) > 0 from con where name = 'ps_runs_run_mode_ck')),

  -- ---- the free allowance, which decides who is metered -------------------
  (3, '99_daily_attempts',
      'ps_daily_attempts, the day ledger',
      'No daily limit exists at all. Every mode is unlimited for everybody, free or paid.',
      (select count(*) > 0 from has_table where name = 'ps_daily_attempts')),

  (4, '100_daily_grace_reasons',
      'ps_attempt_grace takes a reason',
      'A granted extra run cannot be recorded with why it was granted.',
      (select count(*) > 0 from proc
       where name = 'ps_attempt_grace' and args like '%,%')),

  (5, '101_dynasty_seasons',
      'ps_day_unit, so Dynasty is metered in SEASONS',
      'Dynasty falls back to one RUN a day: a player gets one season, not three, and the page says so.',
      (select count(*) > 0 from proc where name = 'ps_day_unit')),

  (6, '102_dynasty_rolling_day',
      'ps_dynasty_day, the per account 24 hour clock',
      'The dynasty day resets at a shared midnight, so when you sit down decides your budget.',
      (select count(*) > 0 from has_table where name = 'ps_dynasty_day')),

  (7, '102 ambiguity fix',
      'ps_attempt_spend increments a QUALIFIED column',
      'Every dynasty kickoff throws server side. It is caught and fails open, so the budget never counts down and nothing is reported.',
      (select count(*) > 0 from proc
       where name = 'ps_attempt_spend' and body like '%d.used + 1%')),

  (8, '105_fullteam_daily',
      'the ledger accepts mode = full',
      'Full Team is never metered: a free account plays it without limit and the bundle sells nothing there.',
      (select count(*) > 0 from con
       where name = 'ps_daily_attempts_mode_ck' and def like '%full%')),

  (9, '104_commish_free_clock',
      'commish_free_clock and its functions',
      'The clock FAILS OPEN, so Commissioner is unlimited for free accounts. Seasons given away, none lost.',
      (select count(*) > 0 from has_table where name = 'commish_free_clock')
      and (select count(*) > 0 from proc where name = 'commish_clock_state')
      and (select count(*) > 0 from proc where name = 'commish_is_pro')),

  -- ---- what the money depends on -----------------------------------------
  (10, '101_premium_bundles',
      'premium_unlocks and premium_products()',
      'NOTHING a buyer pays for is recorded or readable. Every purchase is lost.',
      (select count(*) > 0 from has_table where name = 'premium_unlocks')
      and (select count(*) > 0 from proc where name = 'premium_products')),

  (11, '103_runtour_bundle_redeem',
      'runtour_redeem_bundle()',
      'A Run The Bundle buyer never receives their coins or pack in Run The Tour.',
      (select count(*) > 0 from proc where name = 'runtour_redeem_bundle')),

  (12, '103_cloud_saves',
      'ps_saves, a run kept against the account',
      'A run in progress lives only in that browser. Clearing site data loses a dynasty.',
      (select count(*) > 0 from has_table where name = 'ps_saves')),

  -- ---- decoration, and it is on the list so its absence is a row rather than a report ----
  (13, '107_board_pro_and_live',
      'display_pro, dynasty_over and ps_dynasty_end',
      'The leaderboard loses two marks and NOTHING ELSE: no gold on a paid name, no LIVE on a running dynasty. The board is the board it was.',
      (select count(*) > 0 from proc where name = 'ps_dynasty_end')
      and (select count(*) > 0 from proc where name = 'ps_is_pro')),

  (14, '108_dynasty_slot',
      'dynasty_slot, and dynasty_current on the board',
      'The LIVE badge over-counts: an account can wear one on every run it played inside 48 hours, and there are only two slots. Decoration, and it was reported by a player.',
      (select count(*) > 0 from proc
        where name = 'ps_dynasty_tag' and args like '%text%')),

  -- ---- the chain that is not live yet, and the one that fails CLOSED -----
  -- Everything above fails OPEN or loses a mark. Fantasy Challenge refuses, by
  -- design: there is a prize on it, so a week the server has never heard of
  -- takes no entries rather than waving everybody through. Loud rather than
  -- silent, and only testers can reach it while FANTASY_LIVE is false.
  --
  -- IT IS SEVEN FILES AND THEY ARE SEVEN ROWS, because the ways they go missing are
  -- not the same failure at different sizes. One of them refuses every lineup
  -- and says so. Three of them leave a screen that renders perfectly and is
  -- quietly a week behind, or empty, or silent about who is in. A single row
  -- reading "the fantasy layer" would answer NO to all seven and say which of
  -- those is happening about none of them.
  --
  -- The order they are listed in is the order they must be applied in. 110
  -- restates two of 109's functions, 111 and 112 each restate 110's board, and
  -- 113 restates 109's submit, so the LAST file to touch a thing is the one
  -- that wins. `.github/workflows/fantasy-sql.yml` runs all seven in that order
  -- inside one transaction, which is why a half applied chain is not a state
  -- this report expects to meet.
  (15, '109_fantasy_challenge',
      'the weekly challenge can take an entry at all',
      'Fantasy Challenge refuses every lineup. A tester drafts five times and is told the week is not open. Nothing is lost, and nothing can be entered.',
      (select count(*) > 0 from proc where name = 'fantasy_submit')
      and (select count(*) > 0 from proc where name = 'fantasy_standings')
      and (select count(*) = 4 from has_table
            where name in ('fantasy_weeks','fantasy_prices','fantasy_results',
                           'fantasy_entries'))),

  -- Asked of `fantasy_mark_results` and of the column that makes the two clocks
  -- honest, never of `fantasy_board`, which 111 and 112 both restate: its mere
  -- presence says nothing about which of the three wrote it.
  (16, '110_fantasy_live',
      'the board can move while the games are on',
      'The board is correct and frozen: a score lands and nothing writes it, so the screen shows the same standings all afternoon and cannot say when it last moved. A frozen feed and a quiet Sunday are the same picture.',
      (select count(*) > 0 from proc where name = 'fantasy_mark_results')
      and (select count(*) > 0 from col
            where tbl = 'fantasy_weeks' and name = 'results_sig')),

  -- THE SECOND HALF IS THE ONE ORDERING HAZARD IN THE CHAIN. 110 has a copy of
  -- `fantasy_board` with no `games` key in it, so 111 applied BEFORE 110 leaves
  -- the tables and the writer in place above a board that never answers with a
  -- scoreboard. Both halves of that are invisible from the page, which draws the
  -- slate off the pool either way and simply shows no scores.
  (17, '111_nfl_scores',
      'nfl_games, and the board answers with a scoreboard',
      'The live screen draws the sixteen games off the pool and no score ever appears on any of them, for ever. It reads as a Sunday on which nothing has kicked off.',
      (select count(*) > 0 from has_table where name = 'nfl_games')
      and (select count(*) > 0 from proc where name = 'nfl_put_games')
      and (select count(*) > 0 from proc
            where name = 'fantasy_board' and body like '%''games''%')),

  (18, '112_fantasy_entrants',
      'who is in, before the lock',
      'Before the first kickoff the board can say how many have entered and never who. The page falls back to the count, correctly, so nothing looks broken and the screen somebody opens after submitting is emptier than it should be.',
      (select count(*) > 0 from proc where name = 'fantasy_entrants')
      and (select count(*) > 0 from proc
            where name = 'fantasy_board' and body like '%''entrants''%')),

  -- THE LOUDEST ROW HERE AND THE ONLY ONE THAT HAS ALREADY BITTEN. `profiles`
  -- has no `display_name`: an account's name is `username`. Asked of the body
  -- rather than of the function's existence, because 109 declares it too and
  -- the broken read is inside a function that is present, granted and correct
  -- in every other respect.
  (19, '113_fantasy_submit_username',
      'fantasy_submit reads profiles.username',
      'EVERY ENTRY RAISES. Not one lineup can be recorded, and the player is shown a column name under the submit button. Reported once already as "nothing happens when I press submit".',
      (select count(*) > 0 from proc
        where name = 'fantasy_submit' and body like '%p.username%')),

  -- The trigger is asked for separately from the function it calls. They are two
  -- objects and only one of them is `create or replace`, so a database can hold a
  -- perfectly good `fantasy_settle_week` that nothing ever fires.
  (20, '114_fantasy_prizes',
      'the top three are filed, and a reader is told where they came',
      'The week scores and settles nobody. No placement popup for any entrant, no winner recorded, and nothing for the minting script to read. The competition runs and pays no one.',
      (select count(*) > 0 from has_table where name = 'fantasy_prizes')
      and (select count(*) > 0 from proc where name = 'fantasy_settle_week')
      and (select count(*) > 0 from proc where name = 'fantasy_my_result')
      and (select count(*) > 0 from proc where name = 'fantasy_my_wins')
      and (select count(*) > 0 from trg
            where name = 'fantasy_settle_on_scored' and tbl = 'fantasy_weeks')),

  -- Asked of the body, the way 113's row is: 115 restates a function 114 already
  -- declares, so its presence says nothing about which of the two wrote it.
  (21, '115_fantasy_result_when_ready',
      'nobody is told the result until the winner has a code',
      'The result popup opens the moment a week is scored, before the code is made. A winner who looks in that gap is told they won with no code on the sheet, and the sheet only opens by itself once.',
      (select count(*) > 0 from proc
        where name = 'fantasy_my_result' and body like '%promo_state%')),

  -- AND THE ONE THAT LOOKS EXACTLY LIKE A BAD NETWORK DAY. Run The Floor's
  -- board fails soft on purpose, the way every board on this site does: an
  -- unreachable server costs a list and never a run. That is right, and it is
  -- what makes this migration's absence unreportable. Every call in board.js
  -- resolves to null, the screen says the board is not reachable, and it says
  -- that for ever, on every device, while the game plays perfectly. There is
  -- no state in which a player can tell the two apart, so the only way to know
  -- is to ask here.
  --
  -- 108 TWICE IS NOT A TYPO. This migration and 108_dynasty_slot were written
  -- for two different games in the same week and share a number. They touch
  -- nothing in common, so the collision costs nothing but a second look.
  (22, '108_hoops_leaderboard',
      'rtf_runs, and a Run The Floor season can be filed at all',
      'The Run The Floor board never loads, for everybody, for ever, and it is indistinguishable from a network that is down. The game plays, the run records in the career, the badges light, and the one thing missing is the list. Nobody reports it.',
      (select count(*) > 0 from has_table where name = 'rtf_runs')
      and (select count(*) > 0 from proc where name = 'rtf_submit_run')
      and (select count(*) > 0 from proc where name = 'rtf_board_modes')
      -- AND THE VERSION THAT RANKS A RING FIRST. The first cut of 108 ranked
      -- on the regular season alone, and a database holding it plays and
      -- files perfectly while the board puts a champion 98th. record_score
      -- only exists in the version that fixed it.
      and (select count(*) > 0 from col where tbl = 'rtf_runs' and name = 'record_score')),

  -- AND THE SAME SHAPE ONE GAME ALONG, for a game that is now LINKED FROM THE
  -- HOME PAGE, which is what makes this row the one most worth reading. Run The
  -- Diamond's board fails soft exactly as Run The Floor's does: every call in
  -- `baseball/board.js` resolves to null, the screen says the board is not
  -- reachable, and it says it on every device for ever while twelve modes play
  -- perfectly, the career records and every badge lights. There is no state a
  -- player can tell an undeployed migration and a dead network apart from, so
  -- asking here is the only way to know.
  (23, '97_baseball_leaderboard',
      'rtd_runs, and a Run The Diamond season can be filed at all',
      'The Run The Diamond board never loads, for everybody, for ever, and it is indistinguishable from a network that is down. Nobody reports it, because nothing looks broken.',
      (select count(*) > 0 from has_table where name = 'rtd_runs')
      and (select count(*) > 0 from proc where name = 'rtd_submit_run')
      and (select count(*) > 0 from proc where name = 'rtd_claim_run')),

  -- ITS OWN ROW BECAUSE IT IS ITS OWN FAILURE, which is the seven fantasy rows'
  -- argument arriving inside one file. The row above is the board not existing.
  -- This is the board existing and the daily quietly not being a competition:
  -- one partial unique index is the whole of the rule that a browser files one
  -- result per puzzle, so without it the same person can submit the same day
  -- repeatedly and every copy ranks. The board draws, the scores are real, and
  -- the only symptom is a daily leaderboard whose top is one player several
  -- times over. Folded into the row above it would answer NO about the board
  -- when the board is fine.
  (24, '97 daily-once index',
      'rtd_runs_daily_once, so the daily takes one result per browser',
      'The daily is scored and not policed: one browser can file the same puzzle again and again and every attempt ranks. The board renders perfectly and its top is one player repeated.',
      (select count(*) > 0 from idx
        where name = 'rtd_runs_daily_once' and tbl = 'rtd_runs')),

  -- A THIRD ROW, because an early copy of 97 is a board that exists and a daily
  -- that is refused every evening. That copy checked a daily against the UTC
  -- date while the page names it by the Eastern one, so from 8pm Eastern (7pm in
  -- winter) to midnight every daily was refused as backdated. Row 23 answers yes
  -- to that database, because every object it asks for is there. What tells the
  -- two apart is whether the submit reads rtd_board_day(), which only the fixed
  -- copy has, so this asks the function's BODY rather than its existence.
  (25, '97 daily on the Eastern day',
      'rtd_submit_run reads rtd_board_day(), so an evening daily is accepted',
      'Every daily finished between 8pm and midnight Eastern is refused as backdated and never reaches the board. It looks like a quiet evening. Re-run 97, which is safe over an existing copy.',
      (select count(*) > 0 from proc where name = 'rtd_board_day')
      and (select count(*) > 0 from proc
            where name = 'rtd_submit_run' and body like '%rtd_board_day(%')),

  -- RUN THE FLOOR'S OTHER THREE MODES, and the same silence as row 22. Fix
  -- History, Six Passes and Conquest play entirely in the browser, keep their
  -- results on the device, and file to rtf_plays through board.js, which fails
  -- soft. Against a database without 116 every mode plays, every result screen
  -- draws, and the one thing missing is a place and a leaderboard, which reads
  -- exactly like a network that is down. The one-a-day index is in the same
  -- row rather than its own, because 116 creates it in the same file and the
  -- table is new, so nothing already in it can refuse the index.
  (26, '116_hoops_modes',
      'rtf_plays, so Fix History, Six Passes and Conquest have leaderboards',
      'The three new modes play and never reach a board: no place on the result screen and an empty leaderboard, for everybody. It looks like a bad network day.',
      (select count(*) > 0 from has_table where name = 'rtf_plays')
      and (select count(*) > 0 from proc where name = 'rtf_submit_fix')
      and (select count(*) > 0 from proc where name = 'rtf_submit_passes')
      and (select count(*) > 0 from proc where name = 'rtf_submit_conquest')
      and (select count(*) > 0 from proc where name = 'rtf_claim_play')
      and (select count(*) > 0 from idx
            where name = 'rtf_plays_daily_one_idx' and tbl = 'rtf_plays')),

  -- FIX HISTORY AS A TRADE. The page files a trade through rtf_submit_trade,
  -- which 116 does not have, and board.js fails soft, so against a database on
  -- 116 alone every trade plays, the result screen draws, and nothing reaches
  -- the board. The leaderboard itself still reads: board.js asks for the new
  -- columns and falls back without them. So this row is its own rather than a
  -- clause on 26, because 26 answering yes is exactly the state it misses.
  (27, '117_hoops_trade',
      'rtf_submit_trade and the trade columns, so a Fix History trade reaches the board',
      'Fix History plays and no trade is ever filed: no place on the result screen, and today''s board holds only players on a page cached from before the trade finder. It looks like a quiet day.',
      (select count(*) > 0 from proc where name = 'rtf_submit_trade')
      and (select count(*) > 0 from col where tbl = 'rtf_plays' and name = 'fix_ins')
      and (select count(*) > 0 from col where tbl = 'rtf_plays' and name = 'fix_outs')
      and (select count(*) > 0 from col where tbl = 'rtf_plays' and name = 'fix_with'))
)
-- The summary has to come LAST, and a UNION can only be ordered by an output
-- column, so the sort key is carried through a subquery rather than sorted on
-- the migration name. Ordering by the name alone put the summary first, where
-- it reads as a heading.
select migration, what, deployed, if_missing from (
  select 1 as block, sort,
         migration,
         what,
         case when ok then 'yes' else 'NO' end as deployed,
         case when ok then '' else breaks end as if_missing
  from check_rows
  union all
  select 2, 0,
         '',
         '',
         case when (select bool_and(ok) from check_rows)
              then 'ALL PRESENT' else 'SOMETHING IS MISSING' end,
         case when (select bool_and(ok) from check_rows) then 'safe to be live'
              else (select string_agg(migration, ', ' order by sort)
                    from check_rows where not ok) || ' need running' end
) z
order by block, sort;
