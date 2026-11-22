-- Shut The Door's history, a Pro perk (182). Chain, after the 153 to 178 chains and their tests:
--   psql -d std -f supabase/182_shut_the_door_history.sql
--   psql -d std -f supabase/182_shut_the_door_history.sql   (twice: it is safe to rerun)
--   psql -d std -f supabase/test/shut_the_door_history_test.sql
-- Pro is off for everyone (160's PRO_LIVE), so the test stands in its own shutdoor_is_pro for one
-- account and puts the real one back at the end, whatever version the chain holds.
\set ON_ERROR_STOP on
insert into public.profiles (id, username) values
  ('00000000-0000-0000-0000-000000182001', 'keeper'),
  ('00000000-0000-0000-0000-000000182002', 'stranger') on conflict do nothing;
insert into auth.users (id) values ('00000000-0000-0000-0000-000000182001'), ('00000000-0000-0000-0000-000000182002')
  on conflict do nothing;

create or replace function pg_temp.claim(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; raise notice 'ok  %', what; end $$;
create or replace function pg_temp.calls(n int) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('type', 'FF', 'cell', 12, 'r', 12, 'q', 0.8, 'e', 0.5)) from generate_series(1, n) $$;
create or replace function pg_temp.strip(n int) returns jsonb language sql as $$
  select jsonb_agg('green'::text) from generate_series(1, n) $$;

\i supabase/182_shut_the_door_history.sql
select pg_temp.claim(true, 'running 182 again is safe');

delete from public.shutdoor_outings where user_id in ('00000000-0000-0000-0000-000000182001', '00000000-0000-0000-0000-000000182002');
delete from public.shutdoor_survivor where user_id in ('00000000-0000-0000-0000-000000182001', '00000000-0000-0000-0000-000000182002');

-- the keeper: three dailies and two Survivor runs over three days. The stranger: one of each on a day
-- the keeper also played, which must never show in the keeper's history
insert into public.shutdoor_outings (user_id, day, daily_number, scenario_id, calls, outcome, pitches, score, percentile, strip, created_at) values
  ('00000000-0000-0000-0000-000000182001', '2026-11-10', 16, 'std-2016-ws7-chapman', pg_temp.calls(9), 'door_shut', 9, 820, 71, pg_temp.strip(9), '2026-11-10 20:00+00'),
  ('00000000-0000-0000-0000-000000182001', '2026-11-12', 18, 'std-2011-ws6-feliz', pg_temp.calls(14), 'walk_off', 14, 310, 22, pg_temp.strip(14), '2026-11-12 21:00+00'),
  ('00000000-0000-0000-0000-000000182001', '2026-11-14', 20, 'std-2025-diaz-cin', pg_temp.calls(11), 'tie_held', 11, 540, 48, pg_temp.strip(11), '2026-11-14 19:00+00'),
  ('00000000-0000-0000-0000-000000182002', '2026-11-14', 20, 'std-2025-diaz-cin', pg_temp.calls(5), 'door_shut', 5, 990, 99, pg_temp.strip(5), '2026-11-14 18:00+00');
insert into public.shutdoor_survivor (user_id, day, run, entries, saves, points, over, created_at) values
  ('00000000-0000-0000-0000-000000182001', '2026-11-14', 0, jsonb_build_array(
      jsonb_build_object('scenarioId', 'std-2016-ws7-chapman', 'calls', pg_temp.calls(7), 'outcome', 'door_shut', 'pitches', 7, 'score', 700),
      jsonb_build_object('scenarioId', 'std-2011-ws6-feliz', 'calls', pg_temp.calls(12), 'outcome', 'doors_open', 'pitches', 12, 'score', 250)),
    1, 950, true, '2026-11-14 22:00+00'),
  ('00000000-0000-0000-0000-000000182001', '2026-11-12', 0, '[]'::jsonb, 0, 0, false, '2026-11-12 15:00+00'),
  ('00000000-0000-0000-0000-000000182002', '2026-11-14', 0, jsonb_build_array(
      jsonb_build_object('scenarioId', 'std-2016-ws7-chapman', 'calls', pg_temp.calls(3), 'outcome', 'walk_off', 'pitches', 3, 'score', 90)),
    0, 90, true, '2026-11-14 23:00+00');

-- 1. signed out: nothing
reset test.uid;
select pg_temp.claim(shutdoor_history(null, 30) is null, 'signed out: the list is null');
select pg_temp.claim(shutdoor_history_outing('2026-11-14', null, null) is null, 'signed out: an outing is null');

-- 2. signed in, not Pro (the real gate: false for everyone): the locked answer, no rows, no calls
set test.uid = '00000000-0000-0000-0000-000000182001';
select pg_temp.claim((shutdoor_history(null, 30)->>'pro')::boolean = false, 'not Pro: pro is false');
select pg_temp.claim(json_array_length(shutdoor_history(null, 30)->'items') = 0, 'not Pro: no rows');
select pg_temp.claim(shutdoor_history_outing('2026-11-14', null, null) is null, 'not Pro: a daily''s calls are not read');
select pg_temp.claim(shutdoor_history_outing('2026-11-14', 0, 0) is null, 'not Pro: a Survivor spot''s calls are not read');

-- 3. Pro (a stand-in gate for the keeper only)
select pg_get_functiondef('public.shutdoor_is_pro(uuid)'::regprocedure) as real_is_pro \gset
create or replace function public.shutdoor_is_pro(p_uid uuid) returns boolean language sql stable as $$
  select p_uid = '00000000-0000-0000-0000-000000182001'::uuid $$;

create temp table h as select shutdoor_history(null, 30)::jsonb as j;
select pg_temp.claim((select (j->>'pro')::boolean from h), 'Pro: pro is true');
select pg_temp.claim((select jsonb_array_length(j->'items') from h) = 5, 'Pro: three dailies and two runs, nothing of the stranger''s');
select pg_temp.claim((select string_agg(x->>'kind' || ':' || (x->>'day'), ',' order by n) from h, jsonb_array_elements(j->'items') with ordinality t(x, n))
  = 'survivor:2026-11-14,daily:2026-11-14,daily:2026-11-12,survivor:2026-11-12,daily:2026-11-10', 'Pro: newest first, by day then by time');
select pg_temp.claim((select x->>'score' from h, jsonb_array_elements(j->'items') x where x->>'kind' = 'daily' and x->>'day' = '2026-11-14') = '540',
  'Pro: the keeper''s own score on a day the stranger also played');
select pg_temp.claim((select (x->>'number')::int = 18 and x->>'outcome' = 'walk_off' and (x->>'percentile')::int = 22
  from h, jsonb_array_elements(j->'items') x where x->>'kind' = 'daily' and x->>'day' = '2026-11-12'), 'Pro: a daily carries its number, outcome and percentile');
select pg_temp.claim((select (x->>'saves')::int = 1 and (x->>'points')::int = 950 and (x->>'over')::boolean and jsonb_array_length(x->'spots') = 2
  from h, jsonb_array_elements(j->'items') x where x->>'kind' = 'survivor' and x->>'day' = '2026-11-14'), 'Pro: a run carries its saves, points and spots');
select pg_temp.claim((select string_agg((s->>'index') || ':' || (s->>'outcome') || ':' || (s->>'score'), ',' order by (s->>'index')::int)
  from h, jsonb_array_elements(j->'items') x, jsonb_array_elements(x->'spots') s where x->>'kind' = 'survivor' and x->>'day' = '2026-11-14')
  = '0:door_shut:700,1:doors_open:250', 'Pro: the spots in order, from 0');
select pg_temp.claim((select jsonb_array_length(x->'spots') = 0 and not (x->>'over')::boolean
  from h, jsonb_array_elements(j->'items') x where x->>'kind' = 'survivor' and x->>'day' = '2026-11-12'), 'Pro: a live run with no spot yet shows empty');
select pg_temp.claim(not exists (select 1 from h, jsonb_array_elements(j->'items') x where x ? 'calls')
  and not exists (select 1 from h, jsonb_array_elements(j->'items') x, jsonb_array_elements(coalesce(x->'spots', '[]')) s where s ? 'calls'),
  'Pro: the list carries no calls');
select pg_temp.claim((select not (j->>'more')::boolean and j->>'oldest' = '2026-11-10' from h), 'Pro: every day fits, nothing more');

-- the pages: one day at a time, then from the oldest shown
select pg_temp.claim((select (j->>'more')::boolean and j->>'oldest' = '2026-11-14' and jsonb_array_length(j->'items') = 2
  from (select shutdoor_history(null, 1)::jsonb j) x), 'Pro: one day, two rows, more remain');
select pg_temp.claim((select (j->>'more')::boolean and j->>'oldest' = '2026-11-12' and jsonb_array_length(j->'items') = 2
  from (select shutdoor_history('2026-11-14', 1)::jsonb j) x), 'Pro: the next page is the day before');
select pg_temp.claim((select not (j->>'more')::boolean and jsonb_array_length(j->'items') = 1
  from (select shutdoor_history('2026-11-12', 5)::jsonb j) x), 'Pro: the last page says no more');
select pg_temp.claim((select jsonb_array_length(j->'items') = 0 and j->>'oldest' is null
  from (select shutdoor_history('2026-11-10', 5)::jsonb j) x), 'Pro: past the oldest, empty');
select pg_temp.claim((select jsonb_array_length(j->'items') = 5 from (select shutdoor_history(null, 9999)::jsonb j) x)
  and (select jsonb_array_length(j->'items') = 2 from (select shutdoor_history(null, -3)::jsonb j) x), 'Pro: p_days is held to 1..60');

-- one outing, with its calls
select pg_temp.claim((select j->>'kind' = 'daily' and j->>'scenarioId' = 'std-2025-diaz-cin' and jsonb_array_length(j->'calls') = 11
  and (j->>'score')::int = 540 and (j->>'number')::int = 20 from (select shutdoor_history_outing('2026-11-14', null, null)::jsonb j) x),
  'Pro: a daily with its own calls, not the stranger''s');
select pg_temp.claim((select j->>'kind' = 'survivor' and j->>'scenarioId' = 'std-2011-ws6-feliz' and jsonb_array_length(j->'calls') = 12
  and (j->>'run')::int = 0 and (j->>'index')::int = 1 and (j->>'score')::int = 250 from (select shutdoor_history_outing('2026-11-14', 0, 1)::jsonb j) x),
  'Pro: a Survivor spot with its calls');
select pg_temp.claim(shutdoor_history_outing('2026-11-11', null, null) is null, 'Pro: a day not played is null');
select pg_temp.claim(shutdoor_history_outing('2026-11-14', 0, 2) is null and shutdoor_history_outing('2026-11-14', 0, -1) is null
  and shutdoor_history_outing('2026-11-14', 0, null) is null and shutdoor_history_outing('2026-11-14', 5, 0) is null, 'Pro: no such spot or run is null');

-- the stranger, not Pro under the stand-in: nothing, and never the keeper's
set test.uid = '00000000-0000-0000-0000-000000182002';
select pg_temp.claim((shutdoor_history(null, 30)->>'pro')::boolean = false and json_array_length(shutdoor_history(null, 30)->'items') = 0,
  'another account not Pro: nothing');
select pg_temp.claim(shutdoor_history_outing('2026-11-12', null, null) is null, 'another account cannot read the keeper''s day');

-- 4. the real gate back, whatever version the chain holds: the keeper is locked again
select :'real_is_pro' \gexec
revoke all on function public.shutdoor_is_pro(uuid) from public;
set test.uid = '00000000-0000-0000-0000-000000182001';
select pg_temp.claim((shutdoor_history(null, 30)->>'pro')::boolean = false, 'the real gate back: locked again');
reset test.uid;

-- 5. the grants: signed-in players only, never anon
select pg_temp.claim(has_function_privilege('authenticated', 'public.shutdoor_history(date, int)', 'execute')
  and has_function_privilege('authenticated', 'public.shutdoor_history_outing(date, int, int)', 'execute'), 'authenticated may call both');
select pg_temp.claim(not has_function_privilege('anon', 'public.shutdoor_history(date, int)', 'execute')
  and not has_function_privilege('anon', 'public.shutdoor_history_outing(date, int, int)', 'execute'), 'anon may call neither');

delete from public.shutdoor_outings where user_id in ('00000000-0000-0000-0000-000000182001', '00000000-0000-0000-0000-000000182002');
delete from public.shutdoor_survivor where user_id in ('00000000-0000-0000-0000-000000182001', '00000000-0000-0000-0000-000000182002');
select pg_temp.claim(true, 'history: every check passed');
