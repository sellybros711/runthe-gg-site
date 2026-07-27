-- ---------------------------------------------------------------------------
-- Is the Perfect Season leaderboard set up? A read-only check.
--
-- Writes nothing, changes nothing, safe to run any number of times. Paste the whole
-- thing into the Supabase SQL editor. Every row it returns is one thing the board needs,
-- and the status column says what to do when it is missing.
--
-- Run this FIRST when the board is showing nothing. It reads the catalog rather than the
-- table, so it works even when ps_runs does not exist, which is the one case where every
-- other query would just error.
-- ---------------------------------------------------------------------------
with checks as (
  select 1 as ord, 'table ps_runs' as thing,
         case when to_regclass('public.ps_runs') is null
              then 'MISSING -> run 50_football_perfect_season.sql'
              else 'ok' end as status
  union all
  select 2, 'ordering column ps_runs.score',
         case when not exists (select 1 from pg_attribute
                 where attrelid = to_regclass('public.ps_runs')
                   and attname = 'score' and not attisdropped)
              then 'MISSING -> run 50_football_perfect_season.sql'
              else 'ok' end
  union all
  select 3, 'rating column ps_runs.team_rating',
         case when not exists (select 1 from pg_attribute
                 where attrelid = to_regclass('public.ps_runs')
                   and attname = 'team_rating' and not attisdropped)
              then 'MISSING -> the rating board will be empty; run 50_football_perfect_season.sql'
              else 'ok' end
  union all
  select 4, 'name column ps_runs.display_name',
         case when not exists (select 1 from pg_attribute
                 where attrelid = to_regclass('public.ps_runs')
                   and attname = 'display_name' and not attisdropped)
              then 'MISSING -> every row reads Anonymous; run 51_football_accounts.sql'
              else 'ok' end
  union all
  select 5, 'function ps_submit_run',
         case when not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'ps_submit_run')
              then 'MISSING -> no run can be recorded; run 50_football_perfect_season.sql'
              else 'ok' end
  union all
  select 6, 'anon may execute ps_submit_run',
         case when not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'ps_submit_run'
                   and has_function_privilege('anon', p.oid, 'execute'))
              then 'NO -> re-run the grant at the end of 50_football_perfect_season.sql'
              else 'ok' end
  union all
  select 7, 'anon may read ps_runs',
         case when to_regclass('public.ps_runs') is null then 'no table to check'
              when not has_table_privilege('anon', 'public.ps_runs', 'select')
              then 'NO -> grant select on ps_runs to anon, authenticated;'
              else 'ok' end
  union all
  select 8, 'signed-in users may read ps_runs',
         case when to_regclass('public.ps_runs') is null then 'no table to check'
              when not has_table_privilege('authenticated', 'public.ps_runs', 'select')
              then 'NO -> grant select on ps_runs to anon, authenticated;'
              else 'ok' end
  union all
  -- RLS on with no SELECT policy is the quietest way to get an empty board: the grant is
  -- there, the query succeeds, and every row is filtered out.
  select 9, 'row level security',
         case when to_regclass('public.ps_runs') is null then 'no table to check'
              when not (select relrowsecurity from pg_class where oid = to_regclass('public.ps_runs'))
              then 'off (rows are readable)'
              when not exists (select 1 from pg_policies
                     where schemaname = 'public' and tablename = 'ps_runs'
                       and cmd in ('SELECT', 'ALL'))
              then 'ON WITH NO READ POLICY -> every read returns zero rows. '
                   || 'create policy ps_runs_read on ps_runs for select using (true);'
              else 'on, with a read policy' end
  union all
  select 10, 'read policies present',
         coalesce((select string_agg(policyname || ' (' || cmd || ')', ', ' order by policyname)
                     from pg_policies where schemaname = 'public' and tablename = 'ps_runs'),
                  'none')
  union all
  select 11, 'board indexes present',
         coalesce((select string_agg(indexname, ', ' order by indexname) from pg_indexes
                     where schemaname = 'public' and tablename = 'ps_runs'
                       and indexname like 'ps_runs_mode%'),
                  'NONE -> the board still works but scans; run 50_football_perfect_season.sql')
)
select thing, status from checks order by ord;

-- ---------------------------------------------------------------------------
-- WHAT IS ACTUALLY IN THERE. Run this second, and only if the check above says the
-- table exists: it reads ps_runs directly, so it errors rather than reporting when the
-- table is missing, which is why it is not part of the query above.
--
-- Windows match what the game shows: Today is the Eastern calendar day and the week
-- starts Monday, so a row counted here is a row the board counts.
-- ---------------------------------------------------------------------------
select
  count(*)                                                          as all_runs,
  count(*) filter (where not daily)                                 as free_runs,
  count(*) filter (where daily)                                     as daily_runs,
  count(*) filter (where team_rating is not null)                   as with_a_rating,
  count(*) filter (where display_name is not null)                  as with_a_name,
  count(*) filter (where not daily and created_at >=
    date_trunc('day', now() at time zone 'America/New_York')
      at time zone 'America/New_York')                              as free_today,
  count(*) filter (where not daily and created_at >=
    (date_trunc('week', now() at time zone 'America/New_York'))
      at time zone 'America/New_York')                              as free_this_week,
  max(created_at)                                                   as newest_run
from ps_runs;
