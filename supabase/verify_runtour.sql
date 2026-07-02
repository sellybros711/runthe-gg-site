-- RunTheTour schema verification — run in the Supabase SQL editor.
-- Every row should read 'OK'. Any 'MISSING' row tells you which migration to (re)run.
with expected(kind, name, migration) as (
  values
    -- 22_runtour_leaderboard.sql
    ('table',    'runtour_scores',         '22_runtour_leaderboard.sql'),
    ('function', 'runtour_submit_season',  '22_runtour_leaderboard.sql'),
    ('function', 'runtour_season_board',   '22_runtour_leaderboard.sql'),
    ('function', 'runtour_career_board',   '22_runtour_leaderboard.sql'),
    -- 23_runtour_stats.sql
    ('table',    'runtour_stats',          '23_runtour_stats.sql'),
    ('function', 'runtour_save_stats',     '23_runtour_stats.sql'),
    ('function', 'runtour_my_stats',       '23_runtour_stats.sql'),
    -- 24_runtour_daily.sql
    ('table',    'runtour_daily_scores',   '24_runtour_daily.sql'),
    ('function', 'runtour_submit_daily',   '24_runtour_daily.sql'),
    ('function', 'runtour_daily_board',    '24_runtour_daily.sql'),
    ('function', 'runtour_course_records', '24_runtour_daily.sql'),
    ('function', 'runtour_my_daily',       '24_runtour_daily.sql')
)
select
  e.migration,
  e.kind,
  e.name,
  case when (
    (e.kind = 'table'    and exists (select 1 from pg_tables    where schemaname='public' and tablename = e.name)) or
    (e.kind = 'function' and exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                     where n.nspname='public' and p.proname = e.name))
  ) then 'OK' else 'MISSING' end as status
from expected e
order by e.migration, e.kind desc, e.name;
