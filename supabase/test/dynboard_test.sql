-- ---------------------------------------------------------------------------
-- A stand-in test for 98_football_gauntlet_board.sql against a real Postgres.
--
--   psql -d postgres -c 'create role anon' -c 'create role authenticated'
--   createdb dynboard
--   psql -d dynboard -f supabase/test/dynboard_base.sql
--   psql -d dynboard -f supabase/98_football_gauntlet_board.sql
--   psql -d dynboard -f supabase/test/dynboard_test.sql
--
-- Every line below should read " ok ". The board is a RUN board: it ranks runs by seasons
-- survived, ties broken by total score, and a run appears once however many seasons it played.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP 0
\pset tuples_only on
\pset format unaligned

insert into auth.users(id) values ('11111111-1111-1111-1111-111111111111') on conflict do nothing;
insert into auth.users(id) values ('22222222-2222-2222-2222-222222222222') on conflict do nothing;

-- A helper that returns the error text a call raised, or 'ok', so a guard can be asserted
-- without aborting the file.
create or replace function public.q(p_sql text) returns text
language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $$;

-- PLAYER A: one run, three seasons, tagged cumulatively (a validated ps_runs row a season).
select public.become('11111111-1111-1111-1111-111111111111');
select public.mkrun('11111111-1111-1111-1111-111111111111','alice') as rid \gset
select public.ps_dynasty_tag(:rid, 'aaaaaaaa-0000-0000-0000-000000000001', 1, 90000);
select public.mkrun('11111111-1111-1111-1111-111111111111','alice') as rid \gset
select public.ps_dynasty_tag(:rid, 'aaaaaaaa-0000-0000-0000-000000000001', 2, 210000);
select public.mkrun('11111111-1111-1111-1111-111111111111','alice') as rid \gset
select public.ps_dynasty_tag(:rid, 'aaaaaaaa-0000-0000-0000-000000000001', 3, 330000);

-- PLAYER B: two separate runs.
select public.become('22222222-2222-2222-2222-222222222222');
select public.mkrun('22222222-2222-2222-2222-222222222222','bob') as rid \gset
select public.ps_dynasty_tag(:rid, 'bbbbbbbb-0000-0000-0000-000000000001', 5, 500000);
select public.mkrun('22222222-2222-2222-2222-222222222222','bob') as rid \gset
select public.ps_dynasty_tag(:rid, 'bbbbbbbb-0000-0000-0000-000000000002', 2, 800000);

select case when (select count(*) from public.ps_dynasty_board) = 3
  then ' ok  one row per run, three runs' else ' FAIL run count' end;

select case when (select seasons from public.ps_dynasty_board where display_name='alice') = 3
        and  (select score   from public.ps_dynasty_board where display_name='alice') = 330000
  then ' ok  a run collapses to its furthest season' else ' FAIL alice not at 3/330000' end;

select case when (select array_agg(seasons order by seasons desc, score desc)
                    from public.ps_dynasty_board) = array[5,3,2]
  then ' ok  ranked by seasons, then score' else ' FAIL ranking' end;

-- The board reads as a browser: anon and authenticated, no permission denied.
select case when public.q('set local role anon;   select 1 from public.ps_dynasty_board limit 1') = 'ok'
  then ' ok  anon reads the board' else ' FAIL anon: ' || public.q('select 1 from public.ps_dynasty_board limit 1') end;

-- Guards.
select public.become(null);
select public.mkrun('11111111-1111-1111-1111-111111111111','alice') as rid \gset
select case when public.q(format('select public.ps_dynasty_tag(%s, %L, 1, 1000)', :rid, 'cccccccc-0000-0000-0000-000000000001')) like '%sign in%'
  then ' ok  a guest cannot tag' else ' FAIL guest tag allowed' end;

select public.become('22222222-2222-2222-2222-222222222222');
select id from public.ps_runs where user_id='11111111-1111-1111-1111-111111111111' limit 1 \gset
select case when public.q(format('select public.ps_dynasty_tag(%s, %L, 1, 1000)', :id, 'dddddddd-0000-0000-0000-000000000001')) like '%yours%'
  then ' ok  cannot tag another player''s row' else ' FAIL cross-user tag allowed' end;

select public.mkrun('22222222-2222-2222-2222-222222222222','bob') as rid \gset
select case when public.q(format('select public.ps_dynasty_tag(%s, %L, 999, 1000)', :rid, 'eeeeeeee-0000-0000-0000-000000000001')) like '%season%'
  then ' ok  an absurd season count is refused' else ' FAIL season bound' end;
select case when public.q(format('select public.ps_dynasty_tag(%s, %L, 1, 999999999999)', :rid, 'eeeeeeee-0000-0000-0000-000000000001')) like '%score%'
  then ' ok  an absurd score is refused' else ' FAIL score bound' end;
