-- The stat line on Shut The Door's boards (166). Chain, after 165 and its test:
--   psql -d std -f supabase/166_shut_the_door_board_stats.sql
--   psql -d std -f supabase/166_shut_the_door_board_stats.sql   (twice: it is safe to rerun)
--   psql -d std -f supabase/test/shut_the_door_board_stats_test.sql
\set ON_ERROR_STOP on
insert into public.profiles (id, username) values
  ('00000000-0000-0000-0000-000000166001', 'boxline'),
  ('00000000-0000-0000-0000-000000166002', 'oldpage') on conflict do nothing;
insert into auth.users (id) values ('00000000-0000-0000-0000-000000166001'), ('00000000-0000-0000-0000-000000166002')
  on conflict do nothing;

create or replace function pg_temp.claim(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; raise notice 'ok  %', what; end $$;
create or replace function pg_temp.fails(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return true; end $$;

-- a day of this test's own, far from the dailies the other tests post
delete from public.shutdoor_outings where day = date '2026-01-07';
delete from public.shutdoor_survivor where day = date '2026-01-07';
insert into shutdoor_outings (user_id, day, daily_number, scenario_id, calls, outcome, pitches, score, percentile, strip) values
  ('00000000-0000-0000-0000-000000166001', date '2026-01-07', 1, 'std-2025-ws7-yamamoto',
   (select jsonb_agg(jsonb_build_object('type', 'FF', 'cell', 12)) from generate_series(1, 14)), 'door_shut', 14, 820, 70,
   (select jsonb_agg('green'::text) from generate_series(1, 14))),
  ('00000000-0000-0000-0000-000000166002', date '2026-01-07', 1, 'std-2025-ws7-yamamoto',
   (select jsonb_agg(jsonb_build_object('type', 'FF', 'cell', 12)) from generate_series(1, 9)), 'doors_open', 9, 410, 30,
   (select jsonb_agg('green'::text) from generate_series(1, 9)));

\i supabase/166_shut_the_door_board_stats.sql
select pg_temp.claim(true, 'running 166 again is safe');

-- 1. the shape: postgame.js summary's, and nothing else
create temp table good as select '{"v":1,"p":14,"s":10,"b":4,"k":2,"bb":1,"h":1,"r":0,"hbp":0,"pa":5,"fps":3}'::jsonb as j;
select pg_temp.claim(shutdoor_stats_ok((select j from good), 14), 'a real box line passes');
select pg_temp.claim(not shutdoor_stats_ok((select j from good), 13), 'the pitches must be the row''s');
select pg_temp.claim(not shutdoor_stats_ok((select j || '{"s":11}' from good), 14), 'strikes and balls add up to the pitches');
select pg_temp.claim(not shutdoor_stats_ok((select j || '{"k":"2"}' from good), 14), 'a string is refused, never cast');
select pg_temp.claim(not shutdoor_stats_ok((select j || '{"k":2.5}' from good), 14), 'a fraction is refused');
select pg_temp.claim(not shutdoor_stats_ok((select j || '{"k":-1}' from good), 14), 'a negative is refused');
select pg_temp.claim(not shutdoor_stats_ok((select j || '{"x":1}' from good), 14), 'an extra key is refused');
select pg_temp.claim(not shutdoor_stats_ok((select j - 'fps' from good), 14), 'a missing key is refused');
select pg_temp.claim(not shutdoor_stats_ok((select j || '{"v":2}' from good), 14), 'another version is refused');
select pg_temp.claim(not shutdoor_stats_ok((select j || '{"k":3,"bb":1,"h":2}' from good), 14), 'no more K, BB, HBP and H than plate appearances');
select pg_temp.claim(not shutdoor_stats_ok((select j || '{"fps":6}' from good), 14), 'first-pitch strikes are at most the plate appearances');
select pg_temp.claim(not shutdoor_stats_ok('[1]'::jsonb, 14) and not shutdoor_stats_ok(null, 14), 'an array or nothing is refused');

-- 2. the daily's line: signed in, the caller's own row, once
set test.uid = '';
select pg_temp.claim(pg_temp.fails($q$ select shutdoor_post_stats(date '2026-01-07', (select j from good)) $q$), 'signed out: refused');
set test.uid = '00000000-0000-0000-0000-000000166001';
select pg_temp.claim(pg_temp.fails($q$ select shutdoor_post_stats(date '2026-01-08', (select j from good)) $q$), 'a day with no outing: refused');
select pg_temp.claim(pg_temp.fails($q$ select shutdoor_post_stats(date '2026-01-07', (select j || '{"p":9,"s":5}' from good)) $q$), 'a line for another outing (9 pitches) is refused');
select pg_temp.claim((shutdoor_post_stats(date '2026-01-07', (select j from good))->>'taken')::boolean, 'the first line is kept');
select pg_temp.claim(not (shutdoor_post_stats(date '2026-01-07', (select j || '{"k":4,"h":0}' from good))->>'taken')::boolean, 'a second line changes nothing');
select pg_temp.claim((select (stats->>'k')::int from shutdoor_outings where user_id = '00000000-0000-0000-0000-000000166001' and day = date '2026-01-07') = 2,
  'the first one stands');
select pg_temp.claim(pg_temp.fails($q$ update shutdoor_outings set stats = '{"v":1}' where user_id = '00000000-0000-0000-0000-000000166002' and day = date '2026-01-07' $q$),
  'the column itself refuses a bad line');

-- 3. the board answers it, and a row without one answers null
select pg_temp.claim((select b.stats->>'p' from shutdoor_board(date '2026-01-07', 50) b where b.username = 'boxline') = '14', 'the board carries the line');
select pg_temp.claim((select b.stats is null from shutdoor_board(date '2026-01-07', 50) b where b.username = 'oldpage'), 'a row without one: null, and the page shows no line');
select pg_temp.claim((select count(*) from shutdoor_board(date '2026-01-07', 50)) = 2 and (select plate is null and initials is null from shutdoor_board(date '2026-01-07', 50) limit 1),
  'the board keeps its rows and 162''s columns');

-- 4. Survivor: a line per situation, added up on the board only when every one has it
insert into shutdoor_survivor (user_id, day, run, entries, saves, points, over) values
  ('00000000-0000-0000-0000-000000166001', date '2026-01-07', 0,
   jsonb_build_array(jsonb_build_object('scenarioId', 'a', 'calls', '[]'::jsonb, 'outcome', 'door_shut', 'pitches', 14, 'score', 800),
                     jsonb_build_object('scenarioId', 'b', 'calls', '[]'::jsonb, 'outcome', 'walk_off', 'pitches', 9, 'score', 200)), 1, 1000, true);
create temp table t0 as select updated_at from shutdoor_survivor where user_id = '00000000-0000-0000-0000-000000166001' and day = date '2026-01-07';
select pg_temp.claim((shutdoor_survivor_stats(date '2026-01-07', 0, 0, (select j from good))->>'taken')::boolean, 'situation 1 gets its line');
select pg_temp.claim((select b.stats is null from shutdoor_survivor_board(date '2026-01-07', 50) b where b.username = 'boxline'), 'one of two: the run has no line yet');
select pg_temp.claim(pg_temp.fails($q$ select shutdoor_survivor_stats(date '2026-01-07', 0, 1, (select j from good)) $q$), 'situation 2 had 9 pitches: a 14 pitch line is refused');
select pg_temp.claim(pg_temp.fails($q$ select shutdoor_survivor_stats(date '2026-01-07', 0, 2, (select j from good)) $q$), 'a situation not posted: refused');
select pg_temp.claim((shutdoor_survivor_stats(date '2026-01-07', 0, 1,
  '{"v":1,"p":9,"s":5,"b":4,"k":0,"bb":1,"h":2,"r":2,"hbp":0,"pa":4,"fps":2}'::jsonb)->>'taken')::boolean, 'situation 2 gets its line');
select pg_temp.claim(not (shutdoor_survivor_stats(date '2026-01-07', 0, 0, (select j from good))->>'taken')::boolean, 'a repeat changes nothing');
select pg_temp.claim((select b.stats->>'p' = '23' and b.stats->>'s' = '15' and b.stats->>'h' = '3' and b.stats->>'r' = '2'
  from shutdoor_survivor_board(date '2026-01-07', 50) b where b.username = 'boxline'), 'the board adds the run up: 23 pitches, 15 strikes, 3 hits, 2 runs');
select pg_temp.claim((select updated_at from shutdoor_survivor where user_id = '00000000-0000-0000-0000-000000166001' and day = date '2026-01-07') = (select updated_at from t0),
  'the board''s tie break does not move');
set test.uid = '00000000-0000-0000-0000-000000166002';
select pg_temp.claim(pg_temp.fails($q$ select shutdoor_survivor_stats(date '2026-01-07', 0, 0, (select j from good)) $q$), 'another player''s run: refused');

-- 5. the grants, as 162 has them for the boards
select pg_temp.claim(has_function_privilege('anon', 'public.shutdoor_board(date, int)', 'execute')
  and has_function_privilege('anon', 'public.shutdoor_survivor_board(date, int)', 'execute'), 'the boards read signed out');
select pg_temp.claim(not has_function_privilege('anon', 'public.shutdoor_post_stats(date, jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.shutdoor_post_stats(date, jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.shutdoor_survivor_stats(date, int, int, jsonb)', 'execute'), 'the writes are for accounts only');
select pg_temp.claim(not has_function_privilege('anon', 'public.shutdoor_stats_ok(jsonb, int)', 'execute'), 'the check is not callable from outside');

delete from public.shutdoor_outings where day = date '2026-01-07';
delete from public.shutdoor_survivor where day = date '2026-01-07';
