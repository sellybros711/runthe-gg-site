-- Checks for 175_last_shot_guest_events.sql. Every line printed starts ' ok ' or ' FAIL '.
--   createdb ev; roles; supabase/test/game_events_base.sql
--   supabase/170, 171, then 175 (twice: it is idempotent)
--   supabase/test/game_events_test.sql            (170's checks still pass)
--   supabase/test/last_shot_guest_events_test.sql
-- Two guests (devices) and one tester, new on 2026-11-02, plus the admin:
--   G1  a guest: ran 12 s in, won on the 2nd result, back on 11-03
--   G2  a guest: ran 40 s in, lost 3, not back
--   A   the tester from 170's test is left in place (it counts too)
\set QUIET on
\pset tuples_only on
\pset format unaligned
delete from game_events where game = 'last-shot' and (user_id is null or session_id like 'sess-wwww%');
create temp table g (d text, s text, n text, ms int, at timestamptz, p jsonb);
insert into g values
 ('dev-gggg1','sess-gggg1','open',0,'2026-11-02 14:00-05','{"first":true}'),
 ('dev-gggg1','sess-gggg1','run',12000,'2026-11-02 14:00:12-05','{}'),
 ('dev-gggg1','sess-gggg1','result',15000,'2026-11-02 14:00:15-05','{"outcome":"lose"}'),
 ('dev-gggg1','sess-gggg1','run',20000,'2026-11-02 14:00:20-05','{}'),
 ('dev-gggg1','sess-gggg1','result',24000,'2026-11-02 14:00:24-05','{"outcome":"win"}'),
 ('dev-gggg1','sess-gggg2','open',0,'2026-11-03 09:00-05','{"first":false}'),
 ('dev-gggg2','sess-gggg3','open',0,'2026-11-02 20:00-05','{"first":true}'),
 ('dev-gggg2','sess-gggg3','run',40000,'2026-11-02 20:00:40-05','{}'),
 ('dev-gggg2','sess-gggg3','result',44000,'2026-11-02 20:00:44-05','{"outcome":"lose"}'),
 ('dev-gggg2','sess-gggg3','run',50000,'2026-11-02 20:00:50-05','{}'),
 ('dev-gggg2','sess-gggg3','result',54000,'2026-11-02 20:00:54-05','{"outcome":"lose"}'),
 ('dev-gggg2','sess-gggg3','run',60000,'2026-11-02 20:01:00-05','{}'),
 ('dev-gggg2','sess-gggg3','result',64000,'2026-11-02 20:01:04-05','{"outcome":"lose"}');
insert into game_events (game, device_id, session_id, name, client_ms, props, created_at)
  select 'last-shot', d, s, n, ms, p, at from g;
create temp table r as select game_round_report('last-shot', '2026-11-01 00:00-05', '2026-11-10 00:00-05', true)::jsonb as j;
select case when (j->>'new_players')::int = 6 and (j->>'guests')::int = 2 then ' ok two guests count beside the four testers' else ' FAIL new_players ' || (j->>'new_players') || ' guests ' || (j->>'guests') end from r;
select case when (j->>'win_in_5')::numeric = 0.6 then ' ok win in 5 is 3 of 5 who ran, guests in' else ' FAIL win_in_5 ' || (j->>'win_in_5') end from r;
select case when (j->>'day1_return')::numeric = 0.5 and (j->>'day1_eligible')::int = 6 then ' ok day 1 return 3 of 6' else ' FAIL day1 ' || (j->>'day1_return') || ' of ' || (j->>'day1_eligible') end from r;
select case when (j->>'veterans')::int = 1 then ' ok the veteran still left out, the admin still out' else ' FAIL veterans ' || (j->>'veterans') end from r;

select case when last_shot_events_add(null, 'dev-wwww1', '[{"session_id":"sess-wwww1","name":"open","client_ms":0,"props":{"first":true}}]'::jsonb) = 1 then ' ok a guest writes a row' else ' FAIL guest write' end;
-- (written first, read in its own statement: a statement does not see its own function's rows)
select last_shot_events_add('00000000-0000-0000-0000-00000000000a', 'dev-wwww2', '[{"session_id":"sess-wwww2","name":"open","client_ms":0}]'::jsonb) \g /dev/null
select case when (select user_id::text || ' ' || device_id from game_events where session_id = 'sess-wwww2') = '00000000-0000-0000-0000-00000000000a dev-wwww2'
  then ' ok a tester writes with the account and the device' else ' FAIL tester write' end;
select case when last_shot_events_add(null, 'bad id!', '[{"session_id":"sess-wwww3","name":"open","client_ms":0}]'::jsonb) = 0 then ' ok no account and a bad device writes nothing' else ' FAIL bad device' end;
select case when last_shot_events_add(null, 'dev-wwww1', (select jsonb_agg(jsonb_build_object('session_id','sess-wwww1','name','run','client_ms',x)) from generate_series(1, 41) x)) = 0 then ' ok a batch over 40 writes nothing' else ' FAIL batch cap' end;
select case when (select game from game_events where session_id = 'sess-wwww1' limit 1) = 'last-shot' then ' ok the rows are Last Shot''s' else ' FAIL game' end;
insert into game_events (game, device_id, session_id, name, client_ms, created_at)
  values ('last-shot', 'dev-old00001', 'sess-old00001', 'open', 0, now() - interval '200 days'),
         ('4th-and-what', 'dev-old00002', 'sess-old00002', 'open', 0, now() - interval '200 days');
select last_shot_events_add(null, 'dev-wwww1', '[{"session_id":"sess-wwww1","name":"run","client_ms":5}]'::jsonb) \g /dev/null
select case when not exists (select 1 from game_events where session_id = 'sess-old00001') and exists (select 1 from game_events where session_id = 'sess-old00002')
  then ' ok a write trims Last Shot''s old rows and never 4th and What''s' else ' FAIL trim' end;
select case when has_function_privilege('authenticated', 'public.last_shot_events_add(uuid, text, jsonb)', 'execute') or has_function_privilege('anon', 'public.last_shot_events_add(uuid, text, jsonb)', 'execute')
  then ' FAIL a browser role can write events' else ' ok only the service role writes events' end;
