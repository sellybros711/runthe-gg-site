-- ============================================================================
-- 145_globe_archive.sql: retire RunTheGlobe's backend. It never launched.
--
-- ARCHIVES, NEVER DROPS, A TABLE. The six globe tables are renamed to
-- _archive_<name> with their rows, indexes and foreign keys intact, so the data
-- can still be read by the service role or restored with a rename back.
--
-- What it removes, and only for those six tables:
--   1. every non-internal trigger on them (the repo defines none; this catches
--      anything created directly in production)
--   2. every RLS policy on them. RLS stays ENABLED, so with no policy left the
--      archived tables are unreadable to anon and authenticated.
--   3. their membership in the supabase_realtime publication
--   4. the 15 globe RPCs from 41_globe_online.sql and 43_globe_duo.sql, matched
--      by exact name (every overload). Plain DROP, no CASCADE: if anything else
--      depends on one, this fails and changes nothing.
--
-- Nothing else is touched. No other table, function or game.
--
-- One DO block on purpose: it is a single statement, so it is atomic in the
-- Supabase SQL editor, in plain psql, and inside apply-football-sql.yml's -1
-- transaction alike. Safe to re-run: a second run finds nothing to do.
-- ============================================================================

do $$
declare
  tabs text[] := array['globe_lobbies', 'globe_teams', 'globe_stage',
                       'globe_duos', 'globe_duo_members', 'globe_duo_times'];
  fns  text[] := array['_globe_penalty', '_globe_lobby_json', 'create_globe_lobby',
                       'join_globe_lobby', 'start_globe_race', 'globe_stage_start',
                       'globe_checkpoint', 'advance_globe_round', 'get_globe_lobby',
                       'find_globe_lobby', '_globe_duo_json', 'create_globe_duo',
                       'join_globe_duo', 'post_globe_duo_time', 'get_globe_duo'];
  t text;
  r record;
begin
  -- Refuse to run over a half-finished archive rather than guess.
  foreach t in array tabs loop
    if to_regclass('public.' || t) is not null
       and to_regclass('public._archive_' || t) is not null then
      raise exception 'both public.% and public._archive_% exist; resolve by hand', t, t;
    end if;
  end loop;

  for r in
    select tg.tgname, c.relname
      from pg_trigger tg
      join pg_class c on c.oid = tg.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = any(tabs) and not tg.tgisinternal
  loop
    execute format('drop trigger %I on public.%I', r.tgname, r.relname);
    raise notice 'dropped trigger % on %', r.tgname, r.relname;
  end loop;

  for r in
    select policyname, tablename
      from pg_policies
     where schemaname = 'public' and tablename = any(tabs)
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    raise notice 'dropped policy % on %', r.policyname, r.tablename;
  end loop;

  for r in
    select tablename
      from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = any(tabs)
  loop
    execute format('alter publication supabase_realtime drop table public.%I', r.tablename);
    raise notice 'removed % from supabase_realtime', r.tablename;
  end loop;

  for r in
    select p.oid::regprocedure::text as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any(fns)
  loop
    execute format('drop function %s', r.sig);
    raise notice 'dropped function %', r.sig;
  end loop;

  foreach t in array tabs loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I rename to %I', t, '_archive_' || t);
      raise notice 'renamed % to _archive_%', t, t;
    end if;
  end loop;
end
$$;

-- What is left. The SQL editor shows this grid; every row should read as below.
select c.relname                                                  as table_name,
       c.relrowsecurity                                           as rls_enabled,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname)  as policies,
       (select count(*) from pg_trigger tg
         where tg.tgrelid = c.oid and not tg.tgisinternal)            as triggers,
       exists (select 1 from pg_publication_tables pt
                where pt.pubname = 'supabase_realtime'
                  and pt.schemaname = 'public' and pt.tablename = c.relname) as in_realtime,
       s.n_live_tup                                               as approx_rows
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_stat_user_tables s on s.relid = c.oid
 where n.nspname = 'public' and c.relkind = 'r' and c.relname like '%globe%'
 order by c.relname;
