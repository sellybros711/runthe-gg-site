-- The 13 clubs' situations (179). Chain, after 178 and its test:
--   psql -d std -c "delete from shutdoor_votes; delete from shutdoor_vote_days"   (a clean slate: the
--     earlier tests stored vote days far ahead on their own clocks, which 179's guard would refuse)
--   psql -d std -f supabase/179_shut_the_door_thirteen_clubs.sql
--   psql -d std -f supabase/179_shut_the_door_thirteen_clubs.sql   (twice: it is safe to rerun)
--   psql -d std -f supabase/test/shut_the_door_thirteen_clubs_test.sql
-- The expected candidates below are modes.js's (test/modes.mjs checks this file against it).
\set ON_ERROR_STOP on
create or replace function pg_temp.claim(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; raise notice 'ok  %', what; end $$;
create or replace function pg_temp.fails(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return true; end $$;

-- 1. the list: the thirty as they were, then the 13 from their own day
select pg_temp.claim((select count(*) from shutdoor_packs) = 43, '43 situations');
select pg_temp.claim((select count(*) from shutdoor_packs where ord < 30 and from_day is null) = 30, 'the thirty keep every day');
select pg_temp.claim((select count(*) from shutdoor_packs where ord between 30 and 42 and from_day = date '2026-11-25') = 13, 'the 13 from 2026-11-25');
select pg_temp.claim(shutdoor_fixed_pack(date '2026-10-30') = 'std-2016-ws7-chapman'
  and shutdoor_fixed_pack(date '2026-11-24') = 'std-2009-alcs6-rivera'
  and shutdoor_fixed_pack(date '2026-10-25') = 'std-2001-ws7-rivera', 'the days before the vote are the thirty''s, as before');

-- 2. the plates: each of the 13 unlocks its closer's club
select pg_temp.claim((select count(*) from shutdoor_pack_clubs c join shutdoor_packs p on p.id = c.id where p.ord >= 30) = 13, 'every one of the 13 has a club');
select pg_temp.claim((select count(distinct club) from shutdoor_pack_clubs) = 30, 'all 30 of today''s clubs have a situation');
select pg_temp.claim((select club from shutdoor_pack_clubs where id = 'std-2016-britton-tor') = 'orioles'
  and (select club from shutdoor_pack_clubs where id = 'std-2025-smith-det') = 'guardians'
  and (select club from shutdoor_pack_clubs where id = 'std-2020-nlwc2-kintzler') = 'marlins', 'Britton the Orioles, Smith the Guardians, Kintzler the Marlins');
insert into public.profiles (id, username) values ('00000000-0000-0000-0000-000000179001', 'thirteen') on conflict do nothing;
insert into auth.users (id) values ('00000000-0000-0000-0000-000000179001') on conflict do nothing;
delete from public.shutdoor_outings where user_id = '00000000-0000-0000-0000-000000179001';
insert into shutdoor_outings (user_id, day, daily_number, scenario_id, calls, outcome, pitches, score, percentile, strip) values
  ('00000000-0000-0000-0000-000000179001', date '2026-01-10', 1, 'std-2016-britton-tor',
   (select jsonb_agg(jsonb_build_object('type', 'SI', 'cell', 12)) from generate_series(1, 9)), 'door_shut', 9, 820, 70,
   (select jsonb_agg('green'::text) from generate_series(1, 9))),
  ('00000000-0000-0000-0000-000000179001', date '2026-01-11', 2, 'std-2019-nlwc-hudson',
   (select jsonb_agg(jsonb_build_object('type', 'FF', 'cell', 12)) from generate_series(1, 9)), 'doors_open', 9, 300, 20,
   (select jsonb_agg('green'::text) from generate_series(1, 9)));
select pg_temp.claim(shutdoor_unlocked('00000000-0000-0000-0000-000000179001') = array['orioles'], 'a save as Britton unlocks the Orioles; a door''s open as Hudson unlocks nothing');
delete from public.shutdoor_outings where user_id = '00000000-0000-0000-0000-000000179001';

-- 3. the vote: from a clean slate, the first 60 vote days on the server are modes.js's
delete from public.shutdoor_votes;
delete from public.shutdoor_vote_days;
create or replace function public.shutdoor_today() returns date
language sql stable as $$ select coalesce(nullif(current_setting('test.today', true), '')::date,
                                          (now() at time zone 'America/New_York')::date) $$;
create temporary table expect (day date, a text, b text);
insert into expect values
  ('2026-11-05', 'std-2008-alcs7-price', 'std-2023-williams-sd'),
  ('2026-11-06', 'std-2009-alcs6-rivera', 'std-2012-ws4-romo'),
  ('2026-11-07', 'std-2015-alcs6-davis', 'std-2007-ws4-papelbon'),
  ('2026-11-08', 'std-2008-krod-sea', 'std-2008-ws5-lidge'),
  ('2026-11-09', 'std-2013-alcs6-uehara', 'std-2025-ws7-yamamoto'),
  ('2026-11-10', 'std-2005-nlcs5-lidge', 'std-2010-hoffman-stl'),
  ('2026-11-11', 'std-2011-ws6-feliz', 'std-2023-hader-stl'),
  ('2026-11-12', 'std-2025-ws6-glasnow', 'std-2011-rivera-min'),
  ('2026-11-13', 'std-2023-ws1-sewald', 'std-2018-alcs4-kimbrel'),
  ('2026-11-14', 'std-2016-ws7-chapman', 'std-2014-ws7-bumgarner'),
  ('2026-11-15', 'std-2025-scott-kc', 'std-2025-diaz-cin'),
  ('2026-11-16', 'std-2019-nlwc-hader', 'std-2010-ws5-wilson'),
  ('2026-11-17', 'std-2021-nlcs6-smith', 'std-2024-ws5-buehler'),
  ('2026-11-18', 'std-2017-ws2-jansen', 'std-2001-ws7-rivera'),
  ('2026-11-19', 'std-2022-ws6-pressly', 'std-1988-ws1-eckersley'),
  ('2026-11-20', 'std-2023-williams-sd', 'std-2012-ws4-romo'),
  ('2026-11-21', 'std-2015-alcs6-davis', 'std-2007-ws4-papelbon'),
  ('2026-11-22', 'std-2008-alcs7-price', 'std-2008-krod-sea'),
  ('2026-11-23', 'std-2009-alcs6-rivera', 'std-2013-alcs6-uehara'),
  ('2026-11-24', 'std-2025-ws7-yamamoto', 'std-2010-hoffman-stl'),
  ('2026-11-25', 'std-2018-davis-wsh', 'std-2020-nlwc2-kintzler'),
  ('2026-11-26', 'std-2025-pagan-mil', 'std-2015-melancon-chc'),
  ('2026-11-27', 'std-2005-nlcs5-lidge', 'std-2025-smith-det'),
  ('2026-11-28', 'std-2020-alwc1-colome', 'std-2019-nlwc-hudson'),
  ('2026-11-29', 'std-2025-ws6-glasnow', 'std-2024-alwc2-vest'),
  ('2026-11-30', 'std-2008-ws5-lidge', 'std-2025-alcs1-munoz'),
  ('2026-12-01', 'std-2010-ws5-wilson', 'std-2019-rogers-det'),
  ('2026-12-02', 'std-2016-ws7-chapman', 'std-2017-ws2-jansen'),
  ('2026-12-03', 'std-2025-scott-kc', 'std-2011-ws6-feliz'),
  ('2026-12-04', 'std-2023-hader-stl', 'std-2001-ws7-rivera'),
  ('2026-12-05', 'std-1988-ws1-eckersley', 'std-2021-nlcs6-smith'),
  ('2026-12-06', 'std-2008-alcs7-price', 'std-2008-krod-sea'),
  ('2026-12-07', 'std-2022-ws6-pressly', 'std-2007-ws4-papelbon'),
  ('2026-12-08', 'std-2015-alcs6-davis', 'std-2025-diaz-cin'),
  ('2026-12-09', 'std-2020-nlwc2-kintzler', 'std-2013-alcs6-uehara'),
  ('2026-12-10', 'std-2024-ws5-buehler', 'std-2011-rivera-min'),
  ('2026-12-11', 'std-2010-hoffman-stl', 'std-2005-nlcs5-lidge'),
  ('2026-12-12', 'std-2019-nlwc-hudson', 'std-2015-melancon-chc'),
  ('2026-12-13', 'std-2023-ws1-sewald', 'std-2016-britton-tor'),
  ('2026-12-14', 'std-2024-helsley-sf', 'std-2025-alcs1-munoz'),
  ('2026-12-15', 'std-2025-ws7-yamamoto', 'std-2025-ws6-glasnow'),
  ('2026-12-16', 'std-2009-alcs6-rivera', 'std-2019-nlwc-hader'),
  ('2026-12-17', 'std-2018-davis-wsh', 'std-2023-williams-sd'),
  ('2026-12-18', 'std-2012-ws4-romo', 'std-2020-alwc1-colome'),
  ('2026-12-19', 'std-2016-ws7-chapman', 'std-2025-pagan-mil'),
  ('2026-12-20', 'std-2010-ws5-wilson', 'std-2019-rogers-det'),
  ('2026-12-21', 'std-2014-ws7-bumgarner', 'std-2008-alcs7-price'),
  ('2026-12-22', 'std-2025-scott-kc', 'std-2017-ws2-jansen'),
  ('2026-12-23', 'std-2001-ws7-rivera', 'std-2020-nlwc2-kintzler'),
  ('2026-12-24', 'std-2011-ws6-feliz', 'std-2022-ws6-pressly'),
  ('2026-12-25', 'std-2023-hader-stl', 'std-2008-krod-sea'),
  ('2026-12-26', 'std-2013-alcs6-uehara', 'std-2005-nlcs5-lidge'),
  ('2026-12-27', 'std-2015-alcs6-davis', 'std-1988-ws1-eckersley'),
  ('2026-12-28', 'std-2010-hoffman-stl', 'std-2016-britton-tor'),
  ('2026-12-29', 'std-2024-ws5-buehler', 'std-2015-melancon-chc'),
  ('2026-12-30', 'std-2024-alwc2-vest', 'std-2025-ws6-glasnow'),
  ('2026-12-31', 'std-2025-alcs1-munoz', 'std-2025-smith-det'),
  ('2027-01-01', 'std-2024-helsley-sf', 'std-2020-alwc1-colome'),
  ('2027-01-02', 'std-2012-ws4-romo', 'std-2025-ws7-yamamoto'),
  ('2027-01-03', 'std-2009-alcs6-rivera', 'std-2023-williams-sd');
set test.today = '2027-01-10';
select pg_temp.claim((select count(*) from expect e where shutdoor_vote_candidates(e.day) = array[e.a, e.b]) = (select count(*) from expect),
  'the server''s candidates are modes.js''s for every one of the first 60 vote days');
select pg_temp.claim(not exists (select 1 from shutdoor_vote_days v join shutdoor_packs p on p.id in (v.a, v.b)
  where p.from_day is not null and v.day < p.from_day), 'no situation is offered before its first day');
select pg_temp.claim(exists (select 1 from shutdoor_vote_days v join shutdoor_packs p on p.id in (v.a, v.b) where p.ord >= 30),
  'and the 13 are offered from it');

-- 4. too late: a vote day stored on or after 2026-11-25 stops a first run, and nothing changes
delete from public.shutdoor_pack_clubs where id = 'std-2025-alcs7-hoffman';
delete from public.shutdoor_packs where id = 'std-2025-alcs7-hoffman';
delete from public.shutdoor_votes;
delete from public.shutdoor_vote_days;
insert into public.shutdoor_vote_days (day, a, b) values (date '2026-11-25', 'std-2018-davis-wsh', 'std-2020-nlwc2-kintzler');
\set ON_ERROR_STOP off
\echo 'the next ERROR (179: the vote days from 2026-11-25 are already drawn) is expected'
\i supabase/179_shut_the_door_thirteen_clubs.sql
\set ON_ERROR_STOP on
select pg_temp.claim(not exists (select 1 from shutdoor_packs where id = 'std-2025-alcs7-hoffman')
  and not exists (select 1 from shutdoor_pack_clubs where id = 'std-2025-alcs7-hoffman'), 'too late: the first run stops and changes nothing');
delete from public.shutdoor_vote_days;
\i supabase/179_shut_the_door_thirteen_clubs.sql
select pg_temp.claim((select ord = 30 and from_day = date '2026-11-25' from shutdoor_packs where id = 'std-2025-alcs7-hoffman')
  and (select club from shutdoor_pack_clubs where id = 'std-2025-alcs7-hoffman') = 'bluejays', 'with nothing stored from that day, it goes through');

-- put the clock back
reset test.today;
create or replace function public.shutdoor_today() returns date
language sql stable as $$ select (now() at time zone 'America/New_York')::date $$;
delete from public.shutdoor_vote_days;
