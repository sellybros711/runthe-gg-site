-- Checks for 170_game_events.sql. Every line printed starts ' ok ' or ' FAIL '.
-- Four new testers on 2026-11-02 (Eastern), and an admin who is left out:
--   A  ran 10 s in, lost 2 then won (win in 5), 3 runs, back on 11-03
--   B  ran 30 s in, lost 6 (no win in 5), 6 runs, not back
--   C  ran 15 s in, won first, 1 run then 8 runs in a 2nd session, back 11-03
--   D  opened and never ran (never), not back
--   admin  ran a lot; excluded
--   E  a veteran (first open says first:false): not a new player, but his
--      session (5 runs) counts in tries a session
-- So: median first run over (10, 15, 30, never) = 22.5 s; win_in_5 = 2/3;
-- runs per session with a run: A 3, B 6, C 1, C 8, E 5 -> median 5; day1 = 2/4.
\set QUIET on
\pset tuples_only on
\pset format unaligned
delete from game_events;
create temp table e (u text, s text, n text, ms int, at timestamptz, p jsonb);
insert into e values
 ('a','sess-aaaa1','open',0,'2026-11-02 15:00-05',jsonb_build_object('first',true)),
 ('a','sess-aaaa1','run',10000,'2026-11-02 15:00:10-05','{"mode":"free","n":1}'),
 ('a','sess-aaaa1','result',14000,'2026-11-02 15:00:14-05','{"outcome":"lose"}'),
 ('a','sess-aaaa1','run',20000,'2026-11-02 15:00:20-05','{"n":2}'),
 ('a','sess-aaaa1','result',24000,'2026-11-02 15:00:24-05','{"outcome":"lose"}'),
 ('a','sess-aaaa1','run',30000,'2026-11-02 15:00:30-05','{"n":3}'),
 ('a','sess-aaaa1','result',34000,'2026-11-02 15:00:34-05','{"outcome":"win"}'),
 ('a','sess-aaaa2','open',0,'2026-11-03 12:00-05','{"first":false}'),
 ('b','sess-bbbb1','open',0,'2026-11-02 16:00-05','{"first":true}'),
 ('d','sess-dddd1','open',0,'2026-11-02 18:00-05','{"first":true}'),
 ('c','sess-cccc1','open',0,'2026-11-02 17:00-05','{"first":true}'),
 ('c','sess-cccc1','run',15000,'2026-11-02 17:00:15-05','{"n":1}'),
 ('c','sess-cccc1','result',19000,'2026-11-02 17:00:19-05','{"outcome":"win"}'),
 ('c','sess-cccc2','open',0,'2026-11-03 09:00-05','{"first":false}'),
 ('e','sess-eeee1','open',0,'2026-11-02 19:00-05','{"first":false}'),
 ('e','sess-eeee1','run',2000,'2026-11-02 19:00:02-05','{}'),
 ('e','sess-eeee1','result',5000,'2026-11-02 19:00:05-05','{"outcome":"win"}'),
 ('e','sess-eeee1','run',9000,'2026-11-02 19:00:09-05','{}'),
 ('e','sess-eeee1','run',12000,'2026-11-02 19:00:12-05','{}'),
 ('e','sess-eeee1','run',15000,'2026-11-02 19:00:15-05','{}'),
 ('e','sess-eeee1','run',18000,'2026-11-02 19:00:18-05','{}');
insert into e select 'b','sess-bbbb1','run',30000+i*10000,'2026-11-02 16:00:30-05'::timestamptz + (i*10||' s')::interval,'{}' from generate_series(0,5) i;
insert into e select 'b','sess-bbbb1','result',34000+i*10000,'2026-11-02 16:00:34-05'::timestamptz + (i*10||' s')::interval,'{"outcome":"lose"}' from generate_series(0,5) i;
insert into e select 'c','sess-cccc2','run',5000+i*1000,'2026-11-03 09:00:05-05'::timestamptz + (i||' s')::interval,'{}' from generate_series(0,7) i;
insert into e select 'ad','sess-admin1','run',1000+i,'2026-11-02 10:00-05'::timestamptz + (i||' s')::interval,'{}' from generate_series(0,49) i;
insert into game_events (game, user_id, session_id, name, client_ms, props, created_at)
  select 'last-shot', ('00000000-0000-0000-0000-0000000000' || lpad(u, 2, '0'))::uuid, s, n, ms, p, at from e;
insert into game_events (game, user_id, session_id, name, client_ms, props, created_at)
  values ('4th-and-what', '00000000-0000-0000-0000-00000000000a', 'other-game-1', 'run', 1, '{}', '2026-11-02 15:00-05');
create temp table r as select game_round_report('last-shot', '2026-11-01 00:00-05', '2026-11-10 00:00-05', true)::jsonb as j;
select case when (j->>'new_players')::int = 4 and (j->>'veterans')::int = 1 then ' ok four new players and one veteran, the admin left out' else ' FAIL new_players ' || (j->>'new_players') || ' veterans ' || (j->>'veterans') end from r;
select case when (j->>'first_run_median_s')::numeric = 22.5 then ' ok median first run 22.5 s' else ' FAIL first_run_median_s ' || (j->>'first_run_median_s') end from r;
select case when (j->>'first_run_never')::int = 1 then ' ok one never ran' else ' FAIL first_run_never ' || (j->>'first_run_never') end from r;
select case when (j->>'win_in_5')::numeric = 0.667 then ' ok win in 5 is 2 of 3 who ran' else ' FAIL win_in_5 ' || (j->>'win_in_5') end from r;
select case when (j->>'tries_per_session')::numeric = 5 then ' ok median tries a session 5 (the veteran counts here)' else ' FAIL tries_per_session ' || (j->>'tries_per_session') end from r;
select case when (j->>'day1_return')::numeric = 0.5 and (j->>'day1_eligible')::int = 4 then ' ok day 1 return 2 of 4' else ' FAIL day1 ' || (j->>'day1_return') || ' of ' || (j->>'day1_eligible') end from r;
select case when (j->'funnel'->>'run')::int = 4 then ' ok funnel counts players, not events, and only this game' else ' FAIL funnel ' || (j->>'funnel') end from r;
select case when (select (game_round_report('last-shot', '2026-11-01 00:00-05', '2026-11-10 00:00-05', false)::jsonb->>'veterans')::int) = 2 then ' ok admins counted when asked (the admin opened nothing, so a veteran)' else ' FAIL exclude_admins false' end;
select case when has_table_privilege('authenticated', 'public.game_events', 'select') or has_table_privilege('anon', 'public.game_events', 'insert') then ' FAIL a browser role can reach game_events' else ' ok no browser role can reach game_events' end;
select case when has_function_privilege('authenticated', 'public.game_round_report(text, timestamptz, timestamptz, boolean)', 'execute') then ' FAIL a browser role can run the report' else ' ok only the service role runs the report' end;
do $$ begin
  begin insert into game_events (game, user_id, session_id, name, client_ms) values ('Last Shot!', '00000000-0000-0000-0000-00000000000a', 'sess-xxxx1', 'run', 1);
        raise notice 'FAIL'; exception when check_violation then null; end;
end $$;
select ' ok a bad game name is refused';
