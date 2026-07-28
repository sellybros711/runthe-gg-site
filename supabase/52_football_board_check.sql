-- ---------------------------------------------------------------------------
-- Is the Perfect Season leaderboard set up? Read-only, writes nothing, safe to run
-- any number of times.
--
-- TWO QUERIES, EACH RETURNING EXACTLY ONE ROW. That is not tidiness: the Supabase SQL
-- editor on a phone shows "Preview (first 3 rows)" and nothing else, so a check that
-- returns eleven rows tells you about three of them and hides the ones that matter.
-- One row per query, with every answer as its own column, reads fine on a phone.
--
-- Run query 1 first. It is the only one that can prove the problem, for the reason
-- written above it.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. WHAT THE WEBSITE ACTUALLY SEES.
--
-- This is the important one, and the role switch is the whole point of it. The SQL
-- editor runs as `postgres`, which has BYPASSRLS: every catalog check in query 2 can
-- come back "ok" while the anon key the website uses still reads zero rows, because
-- row level security is enabled with no SELECT policy behind it. Counting as `anon`
-- inside a transaction is the same read the browser makes, so a zero here IS the bug
-- and a number here means reads are fine and the problem is elsewhere.
--
-- `set local` is scoped to the transaction, so the role is back to normal at commit.
--
-- Reading zero rows while ps_runs is known to hold some:
--     -> row level security is on with no read policy. Fix:
--        create policy ps_runs_read on ps_runs for select using (true);
-- Reading rows, but recorded_today is 0 and you have just played:
--     -> reads work and WRITES do not. Look at anon_can_submit in query 2.
-- An error rather than a result:
--     -> the message names what anon is not allowed to do.
-- ---------------------------------------------------------------------------
begin;
set local role anon;
select
  count(*)                                        as rows_anon_can_see,
  count(*) filter (where not daily)               as free_runs,
  count(*) filter (where daily)                   as daily_runs,
  count(*) filter (where created_at >=
    date_trunc('day', now() at time zone 'America/New_York')
      at time zone 'America/New_York')            as recorded_today,
  max(created_at)                                 as newest_run
from ps_runs;
commit;


-- ---------------------------------------------------------------------------
-- 2. THE SETUP, one column per thing the board needs. Every column reads either "ok"
-- or what to do about it. Catalog only, so it answers even when nothing is installed.
-- ---------------------------------------------------------------------------
select
  case when to_regclass('public.ps_runs') is null
       then 'MISSING, run 50_football_perfect_season.sql' else 'ok' end        as runs_table,
  case when exists (select 1 from pg_attribute where attrelid=to_regclass('public.ps_runs')
        and attname='score' and not attisdropped)
       then 'ok' else 'MISSING, run 50_football_perfect_season.sql' end        as score_column,
  case when exists (select 1 from pg_attribute where attrelid=to_regclass('public.ps_runs')
        and attname='team_rating' and not attisdropped)
       then 'ok' else 'MISSING, the rating board will be empty; run 50' end    as rating_column,
  case when exists (select 1 from pg_attribute where attrelid=to_regclass('public.ps_runs')
        and attname='display_name' and not attisdropped)
       then 'ok' else 'MISSING, every row reads Anonymous; run 51_football_accounts.sql' end
                                                                              as names_column,
  case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='ps_submit_run')
       then 'ok' else 'MISSING, nothing can be recorded; run 50' end           as submit_function,
  case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='ps_submit_run'
          and has_function_privilege('anon',p.oid,'execute'))
       then 'ok' else 'NO, re-run the grants at the end of 50' end             as anon_can_submit,
  case when to_regclass('public.ps_runs') is null then 'no table'
       when has_table_privilege('anon','public.ps_runs','select') then 'ok'
       else 'NO, grant select on ps_runs to anon, authenticated;' end          as anon_can_read,
  case when to_regclass('public.ps_runs') is null then 'no table'
       when has_table_privilege('authenticated','public.ps_runs','select') then 'ok'
       else 'NO, grant select on ps_runs to anon, authenticated;' end          as signed_in_can_read,
  -- RLS on with no SELECT policy is the quietest possible failure: the grant is there,
  -- the query succeeds, and every row is filtered away. Query 1 is what proves it.
  case when to_regclass('public.ps_runs') is null then 'no table'
       when not (select relrowsecurity from pg_class where oid=to_regclass('public.ps_runs'))
         then 'off, rows are readable'
       when exists (select 1 from pg_policies where schemaname='public'
              and tablename='ps_runs' and cmd in ('SELECT','ALL'))
         then 'on, with a read policy'
       else 'ON WITH NO READ POLICY, every read returns nothing. '
            || 'create policy ps_runs_read on ps_runs for select using (true);'
       end                                                                    as row_security,
  coalesce((select string_agg(policyname||' '||cmd,', ' order by policyname)
              from pg_policies where schemaname='public' and tablename='ps_runs'),'none')
                                                                              as policies,
  coalesce((select string_agg(indexname,', ' order by indexname) from pg_indexes
              where schemaname='public' and tablename='ps_runs'
                and indexname like 'ps_runs_mode%'),
           'none, the board still works but scans; run 50')                    as board_indexes;


-- ---------------------------------------------------------------------------
-- 3. THE PROFILE CIRCLES, added by 55_football_avatars_setup.sql. Catalog only, so
-- this one answers whatever state the database is in and never errors. Every column
-- reads "ok" when the clubs and initials are switched on.
-- ---------------------------------------------------------------------------
select
  case when exists (select 1 from pg_attribute where attrelid=to_regclass('public.profiles')
        and attname='avatar_color' and not attisdropped)
       then 'ok' else 'MISSING, run 55_football_avatars_setup.sql' end        as profiles_color,
  case when exists (select 1 from pg_attribute where attrelid=to_regclass('public.ps_runs')
        and attname='display_color' and not attisdropped)
       then 'ok' else 'MISSING, run 55' end                                   as runs_color,
  case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='ps_set_avatar')
       then 'ok' else 'MISSING, saving a club fails; run 55' end              as set_avatar_fn,
  case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='ps_set_avatar'
          and has_function_privilege('authenticated', p.oid, 'execute'))
       then 'ok' else 'NO GRANT, re-run the grants at the end of 55' end      as signed_in_can_call,
  case when exists (select 1 from pg_trigger
        where tgrelid=to_regclass('public.ps_runs') and tgname='ps_runs_avatar_stamp')
       then 'ok' else 'MISSING, new runs will not carry a club; run 55' end   as new_run_trigger,
  coalesce((select string_agg(indexname,', ' order by indexname) from pg_indexes
              where schemaname='public' and tablename='ps_runs'
                and indexname like 'ps_runs_named%'),
           'none, the named board still works but scans; run 55')             as named_indexes,
  (select count(*) from profiles where avatar_color is not null)              as accounts_with_a_club;


-- ---------------------------------------------------------------------------
-- 4. THE SAME COLUMNS, READ THE WAY THE WEBSITE READS THEM. Query 3 is catalog, and
-- the editor runs as `postgres`, which has BYPASSRLS: it can say "ok" to all of it
-- while the anon key still gets nothing. This is the read the browser makes.
--
-- An error naming display_color is the answer too: the column is not there, so 55
-- has not run or did not finish.
-- ---------------------------------------------------------------------------
begin;
set local role anon;
select
  count(*)                                              as rows_anon_can_see,
  count(*) filter (where display_color is not null)     as runs_showing_a_club,
  count(*) filter (where display_initials is not null)  as runs_with_own_initials
from ps_runs;
commit;
