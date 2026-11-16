-- Checks for 171_fourth_and_what_events.sql. Every line printed starts ' ok ' or ' FAIL '.
--   createdb ev
--   psql -d ev -c 'create role authenticated' -c 'create role anon' -c 'create role service_role'
--   psql -d ev -f supabase/test/game_events_base.sql
--   psql -d ev -f supabase/170_game_events.sql
--   psql -d ev -f supabase/171_fourth_and_what_events.sql   (twice: it is idempotent)
--   psql -d ev -f supabase/test/game_events_test.sql          (170's checks still pass)
--   psql -d ev -f supabase/test/fourth_and_what_events_test.sql
-- Three new devices on 2026-11-02 (Eastern) and a veteran:
--   A  snapped 8 s in, 10 snaps, started and finished a run, shared, back on 11-03
--   B  snapped 20 s in, 4 snaps, started a run and never finished it, not back
--   C  opened and never snapped, not back
--   V  a veteran (first open says first:false): 6 snaps and a save, counted in sessions only
-- So: first snap median over (8, 20, never) = 20 s; snaps a session over (10, 4, 6) = 6;
-- run_finish = 1 of 2 who started; share_save = 2 of 3 sessions; day1 = 1 of 3.
\set QUIET on
\pset tuples_only on
\pset format unaligned
delete from game_events where game = '4th-and-what';
create temp table e (d text, s text, n text, ms int, at timestamptz, p jsonb);
insert into e values
 ('dev-aaaa1','sess-aaaa1','open',0,'2026-11-02 15:00-05','{"first":true}'),
 ('dev-aaaa1','sess-aaaa1','run_start',5000,'2026-11-02 15:00:05-05','{}'),
 ('dev-aaaa1','sess-aaaa1','run_end',90000,'2026-11-02 15:01:30-05','{"converted":4}'),
 ('dev-aaaa1','sess-aaaa1','share',95000,'2026-11-02 15:01:35-05','{"kind":"run"}'),
 ('dev-aaaa1','sess-aaaa2','open',0,'2026-11-03 10:00-05','{"first":false}'),
 ('dev-bbbb1','sess-bbbb1','open',0,'2026-11-02 16:00-05','{"first":true}'),
 ('dev-bbbb1','sess-bbbb1','run_start',3000,'2026-11-02 16:00:03-05','{}'),
 ('dev-cccc1','sess-cccc1','open',0,'2026-11-02 17:00-05','{"first":true}'),
 ('dev-vvvv1','sess-vvvv1','open',0,'2026-11-02 18:00-05','{"first":false}'),
 ('dev-vvvv1','sess-vvvv1','save',70000,'2026-11-02 18:01:10-05','{"kind":"play"}');
insert into e select 'dev-aaaa1','sess-aaaa1','snap', 8000 + g * 6000, '2026-11-02 15:00:08-05'::timestamptz + (g * 6) * interval '1 second', '{}' from generate_series(0, 9) g;
insert into e select 'dev-bbbb1','sess-bbbb1','snap', 20000 + g * 6000, '2026-11-02 16:00:20-05'::timestamptz + (g * 6) * interval '1 second', '{}' from generate_series(0, 3) g;
insert into e select 'dev-vvvv1','sess-vvvv1','snap', 5000 + g * 6000, '2026-11-02 18:00:05-05'::timestamptz + (g * 6) * interval '1 second', '{}' from generate_series(0, 5) g;
insert into game_events (game, device_id, session_id, name, client_ms, created_at, props)
  select '4th-and-what', d, s, n, ms, at, p from e;
-- a Last Shot row (an account, no device) in the same table, never in this report
insert into game_events (game, user_id, session_id, name, client_ms, created_at, props)
  values ('last-shot', '00000000-0000-0000-0000-00000000000a', 'sess-lsls1', 'open', 0, '2026-11-02 15:00-05', '{"first":true}');

create temp table r as select faw_round_report('2026-11-01 00:00-05', '2026-11-10 00:00-05')::jsonb as j;
select case when (j->>'new_players')::int = 3 and (j->>'veterans')::int = 1 then ' ok three new devices and one veteran, Last Shot left out' else ' FAIL new_players ' || (j->>'new_players') || ' veterans ' || (j->>'veterans') end from r;
select case when (j->>'first_snap_median_s')::numeric = 20.0 and (j->>'first_snap_never')::int = 1 then ' ok median first snap 20 s, one never snapped' else ' FAIL first snap ' || (j->>'first_snap_median_s') || ' never ' || (j->>'first_snap_never') end from r;
select case when (j->>'snaps_per_session')::numeric = 6 and (j->>'sessions')::int = 3 then ' ok median snaps a session 6 over 3 sessions' else ' FAIL snaps_per_session ' || (j->>'snaps_per_session') || ' sessions ' || (j->>'sessions') end from r;
select case when (j->>'run_finish')::numeric = 0.5 and (j->>'started_run')::int = 2 then ' ok run finish 1 of 2 who started' else ' FAIL run_finish ' || (j->>'run_finish') end from r;
select case when (j->>'share_save')::numeric = 0.667 then ' ok share or save in 2 of 3 sessions' else ' FAIL share_save ' || (j->>'share_save') end from r;
select case when (j->>'day1_return')::numeric = 0.333 and (j->>'day1_eligible')::int = 3 then ' ok day 1 return 1 of 3' else ' FAIL day1 ' || (j->>'day1_return') || ' of ' || (j->>'day1_eligible') end from r;
select case when (j->'funnel'->>'snap')::int = 3 then ' ok funnel counts devices, not events' else ' FAIL funnel ' || (j->>'funnel') end from r;

select case when faw_events_add('dev-wwww1', '[{"session_id":"sess-wwww1","name":"open","client_ms":0,"props":{"first":true}}]'::jsonb) = 1 then ' ok a device writes its rows' else ' FAIL faw_events_add' end;
select case when faw_events_add('no', '[{"session_id":"sess-wwww1","name":"open","client_ms":0}]'::jsonb) = 0 then ' ok a bad device id writes nothing' else ' FAIL bad device' end;
select case when faw_events_add('dev-wwww1', (select jsonb_agg(jsonb_build_object('session_id','sess-wwww1','name','snap','client_ms',g)) from generate_series(1, 41) g)) = 0 then ' ok a batch over 40 writes nothing' else ' FAIL batch cap' end;
select case when (select device_id from game_events where game = '4th-and-what' and device_id = 'dev-wwww1' limit 1) = 'dev-wwww1' and (select user_id from game_events where device_id = 'dev-wwww1' limit 1) is null then ' ok a device row has no account' else ' FAIL device row' end;
do $$ begin
  begin insert into game_events (game, session_id, name, client_ms) values ('4th-and-what', 'sess-xxxx1', 'snap', 1);
        raise notice 'FAIL'; exception when check_violation then null; end;
end $$;
select ' ok a row with neither an account nor a device is refused';
select case when has_function_privilege('authenticated', 'public.faw_events_add(text, jsonb)', 'execute') or has_function_privilege('anon', 'public.faw_round_report(timestamptz, timestamptz)', 'execute')
  then ' FAIL a browser role can run 171''s functions' else ' ok only the service role runs 171''s functions' end;
