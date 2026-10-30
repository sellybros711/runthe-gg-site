-- Shut The Door's vote, Survivor, the archive and the Pro gate (160). Chain, after the 153, 155,
-- 156, 157 and 159 chains and their tests:
--   psql -d std -f supabase/160_shut_the_door_vote_survivor.sql
--   psql -d std -f supabase/160_shut_the_door_vote_survivor.sql   (twice: it is safe to rerun)
--   psql -d std -f supabase/test/shut_the_door_vote_survivor_test.sql
-- The expected candidates below are modes.js's (test/modes.mjs checks this file against it).
\set ON_ERROR_STOP on
create table if not exists public.profiles (id uuid primary key, username text);
insert into public.profiles values
  ('00000000-0000-0000-0000-0000000000a1', 'voter one'),
  ('00000000-0000-0000-0000-0000000000a2', 'voter two'),
  ('00000000-0000-0000-0000-0000000000a3', 'voter three') on conflict do nothing;
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000a3') on conflict do nothing;

create or replace function pg_temp.claim(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; raise notice 'ok  %', what; end $$;
create or replace function pg_temp.fails(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return true; end $$;
create or replace function pg_temp.calls(n int) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('type', 'FF', 'cell', 12, 'r', 7)) from generate_series(1, n) $$;
create or replace function pg_temp.post(d date, scenario text) returns json language sql as $$
  select shutdoor_submit(d, 1, scenario, pg_temp.calls(9), 'door_shut', 9, 800, 50, null,
    (select jsonb_agg('green'::text) from generate_series(1, 9))) $$;

-- the test sets the Eastern day (test.today); unset, it is the real one, as in 153
create or replace function public.shutdoor_today() returns date
language sql stable as $$ select coalesce(nullif(current_setting('test.today', true), '')::date,
                                          (now() at time zone 'America/New_York')::date) $$;
delete from public.shutdoor_votes;
delete from public.shutdoor_vote_days;
delete from public.shutdoor_survivor;
delete from public.shutdoor_archive;
delete from public.shutdoor_outings where day >= date '2026-11-01';

\i supabase/160_shut_the_door_vote_survivor.sql
select pg_temp.claim(true, 'running 160 again is safe');

-- 1. the candidates are modes.js's, day by day
set test.today = '2027-02-01';
create temp table expect (day date, a text, b text);
insert into expect values
  ('2026-11-16', 'std-2025-alcs7-hoffman', 'std-2016-ws7-chapman'),
  ('2026-11-17', 'std-2019-nlwc-hader', 'std-2007-ws4-papelbon'),
  ('2026-11-18', 'std-2008-krod-sea', 'std-2010-ws5-wilson'),
  ('2026-11-19', 'std-2014-ws7-bumgarner', 'std-2025-ws7-yamamoto'),
  ('2026-11-20', 'std-2025-diaz-cin', 'std-1988-ws1-eckersley'),
  ('2026-11-21', 'std-2011-ws6-feliz', 'std-2017-ws2-jansen'),
  ('2026-11-22', 'std-2023-hader-stl', 'std-2001-ws7-rivera'),
  ('2026-11-23', 'std-2022-ws6-pressly', 'std-2021-nlcs6-smith'),
  ('2026-11-24', 'std-2025-scott-kc', 'std-2015-alcs6-davis'),
  ('2026-11-25', 'std-2012-ws4-romo', 'std-2005-nlcs5-lidge'),
  ('2026-11-26', 'std-2024-ws5-buehler', 'std-2023-williams-sd'),
  ('2026-11-27', 'std-2010-hoffman-stl', 'std-2020-ws6-urias'),
  ('2026-11-28', 'std-2008-ws5-lidge', 'std-2011-rivera-min'),
  ('2026-11-29', 'std-2015-ws1-familia', 'std-2013-alcs6-uehara'),
  ('2026-11-30', 'std-2023-ws1-sewald', 'std-2025-alcs7-hoffman'),
  ('2026-12-01', 'std-2019-nlwc-hader', 'std-2018-alcs4-kimbrel'),
  ('2026-12-02', 'std-2016-ws7-chapman', 'std-2010-ws5-wilson'),
  ('2026-12-03', 'std-2007-ws4-papelbon', 'std-2014-ws7-bumgarner'),
  ('2026-12-04', 'std-1988-ws1-eckersley', 'std-2025-diaz-cin'),
  ('2026-12-05', 'std-2025-ws7-yamamoto', 'std-2017-ws2-jansen'),
  ('2026-12-06', 'std-2008-krod-sea', 'std-2001-ws7-rivera'),
  ('2026-12-07', 'std-2022-ws6-pressly', 'std-2021-nlcs6-smith'),
  ('2026-12-08', 'std-2025-scott-kc', 'std-2015-alcs6-davis'),
  ('2026-12-09', 'std-2005-nlcs5-lidge', 'std-2012-ws4-romo'),
  ('2026-12-10', 'std-2024-ws5-buehler', 'std-2023-williams-sd'),
  ('2026-12-11', 'std-2010-hoffman-stl', 'std-2011-ws6-feliz'),
  ('2026-12-12', 'std-2008-ws5-lidge', 'std-2011-rivera-min'),
  ('2026-12-13', 'std-2015-ws1-familia', 'std-2023-hader-stl'),
  ('2026-12-14', 'std-2023-ws1-sewald', 'std-2025-alcs7-hoffman'),
  ('2026-12-15', 'std-2019-nlwc-hader', 'std-2018-alcs4-kimbrel'),
  ('2026-12-16', 'std-2013-alcs6-uehara', 'std-2020-ws6-urias'),
  ('2026-12-17', 'std-2016-ws7-chapman', 'std-2007-ws4-papelbon'),
  ('2026-12-18', 'std-2025-diaz-cin', 'std-2010-ws5-wilson'),
  ('2026-12-19', 'std-2025-ws7-yamamoto', 'std-2017-ws2-jansen'),
  ('2026-12-20', 'std-2014-ws7-bumgarner', 'std-2008-krod-sea'),
  ('2026-12-21', 'std-2001-ws7-rivera', 'std-1988-ws1-eckersley'),
  ('2026-12-22', 'std-2025-scott-kc', 'std-2022-ws6-pressly'),
  ('2026-12-23', 'std-2015-alcs6-davis', 'std-2012-ws4-romo'),
  ('2026-12-24', 'std-2005-nlcs5-lidge', 'std-2021-nlcs6-smith'),
  ('2026-12-25', 'std-2011-ws6-feliz', 'std-2024-ws5-buehler'),
  ('2026-12-26', 'std-2010-hoffman-stl', 'std-2023-williams-sd'),
  ('2026-12-27', 'std-2023-hader-stl', 'std-2011-rivera-min'),
  ('2026-12-28', 'std-2015-ws1-familia', 'std-2023-ws1-sewald'),
  ('2026-12-29', 'std-2018-alcs4-kimbrel', 'std-2025-alcs7-hoffman'),
  ('2026-12-30', 'std-2020-ws6-urias', 'std-2008-ws5-lidge'),
  ('2026-12-31', 'std-2007-ws4-papelbon', 'std-2016-ws7-chapman'),
  ('2027-01-01', 'std-2025-diaz-cin', 'std-2019-nlwc-hader'),
  ('2027-01-02', 'std-2025-ws7-yamamoto', 'std-2013-alcs6-uehara'),
  ('2027-01-03', 'std-2010-ws5-wilson', 'std-2008-krod-sea'),
  ('2027-01-04', 'std-1988-ws1-eckersley', 'std-2017-ws2-jansen'),
  ('2027-01-05', 'std-2001-ws7-rivera', 'std-2014-ws7-bumgarner'),
  ('2027-01-06', 'std-2025-scott-kc', 'std-2022-ws6-pressly'),
  ('2027-01-07', 'std-2012-ws4-romo', 'std-2015-alcs6-davis'),
  ('2027-01-08', 'std-2021-nlcs6-smith', 'std-2005-nlcs5-lidge'),
  ('2027-01-09', 'std-2023-williams-sd', 'std-2024-ws5-buehler'),
  ('2027-01-10', 'std-2011-ws6-feliz', 'std-2010-hoffman-stl'),
  ('2027-01-11', 'std-2023-hader-stl', 'std-2015-ws1-familia'),
  ('2027-01-12', 'std-2025-alcs7-hoffman', 'std-2018-alcs4-kimbrel'),
  ('2027-01-13', 'std-2020-ws6-urias', 'std-2011-rivera-min'),
  ('2027-01-14', 'std-2007-ws4-papelbon', 'std-2023-ws1-sewald');
select pg_temp.claim((select count(*) from expect e where shutdoor_vote_candidates(e.day) = array[e.a, e.b]) = (select count(*) from expect),
  'the server''s candidates are modes.js''s for every one of the first 60 vote days');
select pg_temp.claim(shutdoor_vote_candidates(shutdoor_vote_epoch() - 1) is null, 'no candidates before the vote''s first day');
select pg_temp.claim(shutdoor_vote_candidates(date '2027-02-03') is null, 'none past tomorrow');
select pg_temp.claim(shutdoor_fixed_pack(date '2026-10-30') = 'std-2016-ws7-chapman', 'the day''s pack before the vote is the schedule''s (daily #5)');
select pg_temp.claim(shutdoor_hash('shut-the-door-2026-10-30') = 421820106, 'the hash is rng.js hashSeed');
delete from public.shutdoor_vote_days;

-- 2. a vote: finish today's daily, vote once for tomorrow; the lock at the day boundary
set test.today = '2026-11-15';
set test.uid = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.claim((shutdoor_vote(date '2026-11-16')->>'why') = 'finish today''s daily to vote', 'no vote before today''s daily is done');
select pg_temp.claim(pg_temp.fails($$select shutdoor_vote_cast(date '2026-11-16', (select a from expect where day = '2026-11-16'))$$),
  'and a cast is refused');
select pg_temp.post(date '2026-11-15', 'std-2023-ws1-sewald');
select pg_temp.claim((shutdoor_vote(date '2026-11-16')->>'canVote')::boolean, 'after the daily, a vote is open');
select pg_temp.claim((shutdoor_vote(date '2026-11-16')->>'votes') is null, 'the tally is hidden until you vote');
select pg_temp.claim(pg_temp.fails($$select shutdoor_vote_cast(date '2026-11-16', 'std-1988-ws1-eckersley')$$), 'a pack that is not a candidate is refused');
select pg_temp.claim(pg_temp.fails($$select shutdoor_vote_cast(date '2026-11-17', (select a from expect where day = '2026-11-17'))$$),
  'only tomorrow is open');
select pg_temp.claim((shutdoor_vote_cast(date '2026-11-16', (select b from expect where day = '2026-11-16'))->'votes'->>'b')::int = 1,
  'a vote for B counts, and the tally shows once you voted');
select pg_temp.claim((shutdoor_vote_cast(date '2026-11-16', (select a from expect where day = '2026-11-16'))->>'myVote')
  = (select b from expect where day = '2026-11-16'), 'one vote a player: the first stands');
set test.uid = '00000000-0000-0000-0000-0000000000a2';
select pg_temp.post(date '2026-11-15', 'std-2023-ws1-sewald');
select shutdoor_vote_cast(date '2026-11-16', (select b from expect where day = '2026-11-16'));
set test.uid = '00000000-0000-0000-0000-0000000000a3';
select pg_temp.post(date '2026-11-15', 'std-2023-ws1-sewald');
select shutdoor_vote_cast(date '2026-11-16', (select a from expect where day = '2026-11-16'));
set test.uid = '';
select pg_temp.claim(pg_temp.fails($$select shutdoor_vote_cast(date '2026-11-16', (select a from expect where day = '2026-11-16'))$$),
  'a guest cannot vote');
select pg_temp.claim((shutdoor_vote(date '2026-11-16')->>'why') = 'sign in to vote' and shutdoor_vote(date '2026-11-16')->>'winner' is null,
  'a guest reads the vote; no winner before the day begins');

set test.today = '2026-11-16';
select pg_temp.claim(shutdoor_vote(date '2026-11-16')->>'winner' = (select b from expect where day = '2026-11-16')
  and (shutdoor_vote(date '2026-11-16')->'votes'->>'a')::int = 1 and (shutdoor_vote(date '2026-11-16')->'votes'->>'b')::int = 2,
  'the day begins: two votes to one, B is the day''s situation, and the tally is shown');
select pg_temp.claim(shutdoor_vote_lock(date '2026-11-16') = (select b from expect where day = '2026-11-16'), 'the lock reads the same again');
set test.uid = '00000000-0000-0000-0000-0000000000a2';
select pg_temp.claim(pg_temp.fails($$select shutdoor_vote_cast(date '2026-11-16', (select a from expect where day = '2026-11-16'))$$),
  'a vote for today is closed');
select pg_temp.claim(pg_temp.fails($$select pg_temp.post(date '2026-11-16', (select a from expect where day = '2026-11-16'))$$),
  'a daily post for the losing situation is refused');
select pg_temp.claim((pg_temp.post(date '2026-11-16', (select b from expect where day = '2026-11-16'))->>'taken')::boolean,
  'a daily post for the locked situation is taken');
select shutdoor_vote_cast(date '2026-11-17', (select a from expect where day = '2026-11-17'));
set test.uid = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.post(date '2026-11-16', (select b from expect where day = '2026-11-16'));
select shutdoor_vote_cast(date '2026-11-17', (select b from expect where day = '2026-11-17'));
set test.today = '2026-11-18';
select pg_temp.claim(shutdoor_vote_lock(date '2026-11-17') = (select a from expect where day = '2026-11-17'), 'a tie is A');
select pg_temp.claim(shutdoor_vote_lock(date '2026-11-18') = (select a from expect where day = '2026-11-18'), 'no votes is A');
select pg_temp.claim(shutdoor_vote_lock(date '2026-11-19') is null, 'a day not begun has no lock');

-- 3. the Pro gate is off: false for everyone
select pg_temp.claim(shutdoor_is_pro('00000000-0000-0000-0000-0000000000a1') = false
  and (shutdoor_entitlements()->>'pro')::boolean = false and (shutdoor_entitlements()->>'survivorRuns')::int = 1,
  'Pro answers false, and a run a day is the allowance');
select pg_temp.claim(pg_temp.fails($$select shutdoor_archive_submit(date '2026-11-16', 'x', pg_temp.calls(9), 'door_shut', 9, 800, 50)$$),
  'the archive is for Pro');

-- 4. Survivor: run 0, in order, a door shut goes on and anything else ends it
set test.today = '2026-11-18';
select pg_temp.claim(((shutdoor_survivor_start(date '2026-11-18')->'runs'->0->>'run')::int) = 0, 'the day''s run is run 0');
select pg_temp.claim(json_array_length(shutdoor_survivor_start(date '2026-11-18')->'runs') = 1, 'starting again resumes the live run');
select pg_temp.claim((shutdoor_survivor_post(date '2026-11-18', 0, 0, 'std-2016-ws7-chapman', pg_temp.calls(9), 'door_shut', 9, 820)->'runs'->0->>'saves')::int = 1,
  'a door shut is a save');
select pg_temp.claim((shutdoor_survivor_post(date '2026-11-18', 0, 0, 'std-2016-ws7-chapman', pg_temp.calls(9), 'walk_off', 9, 10)->'runs'->0->>'saves')::int = 1,
  'a repeat of a posted situation changes nothing');
select pg_temp.claim(pg_temp.fails($$select shutdoor_survivor_post(date '2026-11-18', 0, 2, 'std-2016-ws7-chapman', pg_temp.calls(9), 'door_shut', 9, 820)$$),
  'a situation out of order is refused');
select pg_temp.claim(pg_temp.fails($$select shutdoor_survivor_post(date '2026-11-18', 0, 1, 'std-2016-ws7-chapman', pg_temp.calls(8), 'door_shut', 9, 820)$$),
  'calls that do not make the outing are refused');
select pg_temp.claim(pg_temp.fails($$select shutdoor_survivor_post(date '2026-11-18', 0, 1, 'std-nope', pg_temp.calls(9), 'door_shut', 9, 820)$$),
  'a situation that is not one of the 30 is refused');
select pg_temp.claim((shutdoor_survivor_post(date '2026-11-18', 0, 1, 'std-2001-ws7-rivera', pg_temp.calls(9), 'tie_held', 9, 500)->'runs'->0->>'over')::boolean,
  'a held tie ends the run, as it ends the daily''s streak');
select pg_temp.claim(pg_temp.fails($$select shutdoor_survivor_post(date '2026-11-18', 0, 2, 'std-2016-ws7-chapman', pg_temp.calls(9), 'door_shut', 9, 820)$$),
  'nothing more goes on a run that is over');
select pg_temp.claim(pg_temp.fails($$select shutdoor_survivor_start(date '2026-11-18')$$), 'free: one run a day');
select pg_temp.claim((shutdoor_survivor_state(date '2026-11-18')->>'canStart')::boolean = false, 'and the state says so');
set test.uid = '00000000-0000-0000-0000-0000000000a2';
select shutdoor_survivor_start(date '2026-11-18');
select shutdoor_survivor_post(date '2026-11-18', 0, 0, 'std-2016-ws7-chapman', pg_temp.calls(9), 'door_shut', 9, 700);
select shutdoor_survivor_post(date '2026-11-18', 0, 1, 'std-2001-ws7-rivera', pg_temp.calls(9), 'door_shut', 9, 700);
select pg_temp.claim(pg_temp.fails($$select shutdoor_survivor_start(date '2026-11-17')$$), 'a run starts today only');
select pg_temp.claim((select string_agg(username || ':' || saves || ':' || over, ',' order by rank) from shutdoor_survivor_board(date '2026-11-18'))
  = 'voter two:2:false,voter one:1:true', 'the board: most saves first, a live run shows as it stands');
set test.uid = '';
select pg_temp.claim(shutdoor_survivor_state(date '2026-11-18') is null, 'signed out, no state');
select pg_temp.claim(pg_temp.fails($$select shutdoor_survivor_start(date '2026-11-18')$$), 'a guest keeps no run on the server');
select pg_temp.claim((select count(*) from shutdoor_survivor_board(date '2026-11-18')) = 2, 'a guest reads the board');

-- 5. with the gate on (a stand-in for the store's later migration): more runs, the archive
create or replace function public.shutdoor_is_pro(p_uid uuid) returns boolean language sql stable as $$
  select p_uid = '00000000-0000-0000-0000-0000000000a1'::uuid $$;
set test.uid = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.claim(((shutdoor_survivor_start(date '2026-11-18')->'runs'->1->>'run')::int) = 1, 'Pro: a second run once the first is over');
select shutdoor_survivor_start(date '2026-11-18');
select pg_temp.claim(json_array_length(shutdoor_survivor_state(date '2026-11-18')->'runs') = 2, 'not a third while the second is live');
select shutdoor_survivor_post(date '2026-11-18', 1, 0, 'std-2016-ws7-chapman', pg_temp.calls(9), 'door_shut', 9, 900);
select shutdoor_survivor_post(date '2026-11-18', 1, 1, 'std-2016-ws7-chapman', pg_temp.calls(9), 'door_shut', 9, 900);
select shutdoor_survivor_post(date '2026-11-18', 1, 2, 'std-2016-ws7-chapman', pg_temp.calls(9), 'door_shut', 9, 900);
select pg_temp.claim((select saves from shutdoor_survivor_board(date '2026-11-18') where mine) = 1,
  'only run 0 is on the board: three saves in run 1 leave it at one');
select pg_temp.claim((shutdoor_archive_submit(date '2026-11-16', 'std-2016-ws7-chapman', pg_temp.calls(9), 'door_shut', 9, 650, 50)->>'taken')::boolean,
  'Pro keeps a past daily from the archive');
select pg_temp.claim((shutdoor_archive_submit(date '2026-11-16', 'std-2016-ws7-chapman', pg_temp.calls(9), 'walk_off', 9, 10, 0)->>'taken')::boolean = false,
  'the first one stands');
select pg_temp.claim(pg_temp.fails($$select shutdoor_archive_submit(date '2026-11-18', 'x', pg_temp.calls(9), 'door_shut', 9, 800, 50)$$),
  'today is not the archive');
select pg_temp.claim((select count(*) from shutdoor_board(date '2026-11-16') where username = 'voter one') = 1
  and (select score from shutdoor_board(date '2026-11-16') where username = 'voter one') = 800,
  'an archive play never touches the daily board: the daily''s 800 stands, not the archive''s 650');
set role anon;
select pg_temp.claim(pg_temp.fails($$select * from shutdoor_votes$$) and pg_temp.fails($$select * from shutdoor_survivor$$),
  'nobody reads the tables directly');
reset role;

-- put back what the test changed: 160's own gate, and 153's day
\i supabase/160_shut_the_door_vote_survivor.sql
create or replace function public.shutdoor_today() returns date
language sql stable as $$ select (now() at time zone 'America/New_York')::date $$;
reset test.today;
select pg_temp.claim(shutdoor_is_pro('00000000-0000-0000-0000-0000000000a1') = false, 'rerunning 160 puts the gate back off');
