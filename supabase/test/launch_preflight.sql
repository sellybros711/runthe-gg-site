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
proc as (
  select p.proname as name,
         pg_get_function_identity_arguments(p.oid) as args,
         pg_get_functiondef(p.oid) as body
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
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
    'rtf_runs'
  ]) as t
  where to_regclass('public.' || t) is not null
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

  -- ---- the one that is not live yet, and the one that fails CLOSED --------
  -- Everything above fails OPEN or loses a mark. This one refuses, by design:
  -- there is a prize on it, so a week the server has never heard of takes no
  -- entries rather than waving everybody through. Loud rather than silent, and
  -- only testers can reach it while FANTASY_LIVE is false.
  (15, '109_fantasy_challenge',
      'the weekly challenge can take an entry at all',
      'Fantasy Challenge refuses every lineup. A tester drafts five times and is told the week is not open. Nothing is lost, and nothing can be entered.',
      (select count(*) > 0 from proc where name = 'fantasy_submit')
      and (select count(*) > 0 from proc where name = 'fantasy_standings')
      and (select count(*) = 4 from has_table
            where name in ('fantasy_weeks','fantasy_prices','fantasy_results',
                           'fantasy_entries'))),

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
  (16, '108_hoops_leaderboard',
      'rtf_runs, and a Run The Floor season can be filed at all',
      'The Run The Floor board never loads, for everybody, for ever, and it is indistinguishable from a network that is down. The game plays, the run records in the career, the badges light, and the one thing missing is the list. Nobody reports it.',
      (select count(*) > 0 from has_table where name = 'rtf_runs')
      and (select count(*) > 0 from proc where name = 'rtf_submit_run')
      and (select count(*) > 0 from proc where name = 'rtf_board_modes'))
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
