-- ---------------------------------------------------------------------------
-- fantasy_preflight.sql : did 109, 110 and 111 actually land?
--
-- Paste the whole file into the Supabase SQL editor and read the ok column.
-- It READS ONLY: no table is written, no function is called, nothing is
-- created. Running it twice is the same as running it once.
--
--
-- WHY THIS FILE EXISTS
-- ---------------------------------------------------------------------------
-- The SQL in this repo is deployed by hand and the site is deployed by a push,
-- so the schema and the code move independently. supabase/test/launch_preflight
-- .sql exists because two live game modes fail SILENTLY against a database
-- missing a migration, and this is the same hazard pointed at /fantasy.
--
-- The failure here is worse than a missing feature, which is the reason this
-- file leads with the gate rather than with the tables. If 109 never ran,
-- fantasy_is_allowed() does not exist, every policy in 110 and 111 fails to
-- install, and the tables end up with RLS enabled and NO POLICY AT ALL. That
-- state is actually safe (no policy means no rows for anybody) but it is safe
-- by accident, and the neighbouring accident is not: a table created without
-- RLS enabled is world-readable to any holder of the anon key, which is
-- published in the source of every game on this site.
--
-- So this asks three separate questions of every table, and they are three
-- questions rather than one: does it exist, is RLS on and FORCED, and is there
-- a policy. A yes to the first and a no to either of the others is the
-- dangerous state.
--
--
-- WHY IT ASKS THE CATALOG AND NEVER CALLS ANYTHING
-- ---------------------------------------------------------------------------
-- Lifted straight from launch_preflight.sql, and its reasoning holds here
-- unchanged: Postgres resolves a function call at PARSE time, so one missing
-- function inside a query that called them would fail the whole statement with
-- "function does not exist" and report nothing about any of the others. A
-- database missing everything still returns a full readable report.
--
--
-- HOW TO READ IT
-- ---------------------------------------------------------------------------
-- ok = true      that piece is deployed
-- ok = false     it is not, and if_missing says what that costs
--
-- Any false in the GATE block means do not open the page to anybody.
-- ---------------------------------------------------------------------------

with
proc as (
  select p.proname as name
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
),
tbl as (
  select c.relname as name, c.relrowsecurity as rls_on, c.relforcerowsecurity as rls_forced
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
),
pol as (
  select tablename as name, count(*) as n
    from pg_policies
   where schemaname = 'public' and tablename like 'fantasy%'
   group by tablename
),
con as (
  select c.conname as name
    from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace
   where n.nspname = 'public'
),
-- Every table 110 and 111 create, in one list, so a table added later that
-- nobody adds here is the only way to be missed.
want as (
  select * from (values
    ('fantasy_access_allowlist'),
    ('fantasy_players'),
    ('fantasy_player_aliases'),
    ('fantasy_unmatched_players'),
    ('fantasy_events'),
    ('fantasy_odds_snapshots'),
    ('fantasy_line_movement'),
    ('fantasy_projections'),
    ('fantasy_poll_runs'),
    ('fantasy_poll_budget'),
    ('fantasy_priors'),
    ('fantasy_team_totals'),
    ('fantasy_sim_runs')
  ) as v(name)
),
rows_ as (

  -- ===================================================================
  -- 1. THE GATE. Nothing else matters if any of this is false.
  -- ===================================================================
  select 1 as ord, '109 GATE' as block,
         'fantasy_access_allowlist exists' as check_,
         exists (select 1 from tbl where name = 'fantasy_access_allowlist') as ok,
         'no allowlist table. The page cannot admit anybody and 110/111 will not install.' as if_missing

  union all
  select 2, '109 GATE', 'fantasy_is_allowed() exists',
         exists (select 1 from proc where name = 'fantasy_is_allowed'),
         'every policy in 110 and 111 references this. Without it those files fail to install and the tables are left with RLS on and no policy.'

  union all
  select 3, '109 GATE', 'fantasy_gate() exists',
         exists (select 1 from proc where name = 'fantasy_gate'),
         'the page has nothing to call. gate.js fails closed, so everybody gets the 404 including you.'

  union all
  select 4, '109 GATE', 'allowlist RLS is ON and FORCED',
         coalesce((select rls_on and rls_forced from tbl where name = 'fantasy_access_allowlist'), false),
         'THE SERIOUS ONE. The anon key is published in every game on this site. Without RLS the allowlist is world readable and it names your testers.'

  union all
  select 5, '109 GATE', 'allowlist has exactly one read policy',
         coalesce((select n from pol where name = 'fantasy_access_allowlist'), 0) = 1,
         'expected one policy (read own row). More than one means somebody added a second rule, and a second rule on an allowlist is how a deny-by-default table quietly becomes readable.'

  union all
  select 6, '109 GATE', 'somebody is on the allowlist',
         coalesce((select count(*) > 0 from public.fantasy_access_allowlist), false),
         'the table is empty, so /fantasy 404s for every account including yours. The seed in 109 resolves usernames through profiles: a username that matched nothing inserts nothing and raises no error.'

  -- ===================================================================
  -- 2. TABLES. Existence, then the two things that make them safe.
  -- ===================================================================
  union all
  select 10, '110/111 TABLES', 'every fantasy_ table exists',
         not exists (select 1 from want w where not exists (select 1 from tbl t where t.name = w.name)),
         (select coalesce('missing: ' || string_agg(w.name, ', '), '')
            from want w where not exists (select 1 from tbl t where t.name = w.name))

  union all
  select 11, '110/111 TABLES', 'RLS is ON for every one of them',
         not exists (select 1 from want w join tbl t on t.name = w.name where not t.rls_on),
         (select coalesce('RLS OFF, WORLD READABLE WITH THE PUBLISHED ANON KEY: ' || string_agg(t.name, ', '), '')
            from want w join tbl t on t.name = w.name where not t.rls_on)

  union all
  select 12, '110/111 TABLES', 'RLS is FORCED for every one of them',
         not exists (select 1 from want w join tbl t on t.name = w.name where not t.rls_forced),
         (select coalesce('not forced: ' || string_agg(t.name, ', '), '')
            from want w join tbl t on t.name = w.name where not t.rls_forced)
         || ' Without FORCE the owning role skips the policy, so a test run as owner checks a rule the real client never meets.'

  union all
  select 13, '110/111 TABLES', 'every one has a read policy',
         not exists (select 1 from want w where coalesce((select n from pol where name = w.name), 0) = 0),
         (select coalesce('no policy on: ' || string_agg(w.name, ', '), '')
            from want w where coalesce((select n from pol where name = w.name), 0) = 0)
         || ' RLS on with no policy denies everybody, so this is safe rather than leaky. It still means the page reads nothing.'

  union all
  select 14, '110/111 TABLES', 'NOBODY has a write policy',
         not exists (
           select 1 from pg_policies
            where schemaname = 'public' and tablename like 'fantasy%'
              and cmd <> 'SELECT'
         ),
         (select coalesce('write policy on: ' || string_agg(tablename || ' (' || cmd || ')', ', '), '')
            from pg_policies
           where schemaname = 'public' and tablename like 'fantasy%' and cmd <> 'SELECT')
         || ' Every write here is the Worker or the pipeline, both on the service role, which bypasses RLS. A write policy means a browser can write, and nothing in this design should.'

  -- ===================================================================
  -- 3. THE TWO STRUCTURAL RULES THAT ARE NOT JUST TABLES
  -- ===================================================================
  union all
  select 20, 'STRUCTURE', 'odds snapshots are partitioned, and this season has a partition',
         to_regclass('public.fantasy_odds_snapshots_2026') is not null,
         'no 2026 partition. Every insert into the snapshot table will ERROR rather than silently drop, which is the right failure, but the hot path will collect nothing.'

  union all
  select 21, 'STRUCTURE', 'a projection cannot claim zero markets',
         exists (select 1 from con where name = 'fantasy_projection_has_a_market'),
         'THE NO-FABRICATION RULE IS OFF. Without this constraint a projection can be written for a player with no posted props, which is the one thing the brief says is worse than showing a gap.'

  -- THE ONE THAT SHIPPED. Every insert the Worker made came back 403 42501
  -- "permission denied for sequence fantasy_poll_runs_id_seq", for an hour,
  -- while Cloudflare reported zero errors and fantasy_events filled up
  -- normally. BYPASSRLS skips row level security and skips no grant at all,
  -- and a bigserial default is a privileged call on a sequence.
  --
  -- It asks the WEAKEST sequence rather than counting grants, because one
  -- table added without the grant is the whole failure and an aggregate that
  -- said "4 of 5" would still read as mostly fine.
  union all
  select 22, 'STRUCTURE', 'service_role can use every fantasy sequence',
         not exists (
           select 1 from pg_sequences
            where schemaname = 'public' and sequencename like 'fantasy%'
              and not has_sequence_privilege('service_role',
                    schemaname || '.' || sequencename, 'USAGE')
         )
         and exists (select 1 from pg_sequences
                      where schemaname = 'public' and sequencename like 'fantasy%'),
         (select coalesce('cannot use: ' || string_agg(sequencename, ', '), 'no fantasy sequences exist at all, so 110 and 111 did not run')
            from pg_sequences
           where schemaname = 'public' and sequencename like 'fantasy%'
             and not has_sequence_privilege('service_role',
                   schemaname || '.' || sequencename, 'USAGE'))
         || ' RUN 112. Without it the Worker polls, spends credits and stores NOTHING,'
         || ' and the run log that would have told you is refused by the same grant.'

  union all
  select 23, 'STRUCTURE', 'the credit cap functions exist',
         (select count(*) from proc where name in
            ('fantasy_budget_spend', 'fantasy_budget_observe',
             'fantasy_budget_state', 'fantasy_default_cap')) = 4,
         'the hard cap is not installed. A bug in the Worker can burn the whole month allowance in an afternoon with nothing to stop it.'
)

select block, check_, ok, case when ok then '' else if_missing end as if_missing
  from rows_
union all
select 'SUMMARY',
       case when (select bool_and(ok) from rows_)
            then 'ALL PRESENT. The gate is real and the tables are closed.'
            else 'NOT READY. Read the false rows above, top down.' end,
       (select bool_and(ok) from rows_),
       ''
 order by 3, 1, 2;
