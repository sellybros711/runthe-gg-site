-- Shut The Door's vote from 2026-11-05 (163). Chain, after 161 and its test:
--   psql -d std -f supabase/163_shut_the_door_vote_nov5.sql
--   psql -d std -f supabase/163_shut_the_door_vote_nov5.sql   (twice: it is safe to rerun)
--   psql -d std -f supabase/test/shut_the_door_vote_nov5_test.sql
-- The expected candidates below are modes.js's (test/modes.mjs checks this file against it).
\set ON_ERROR_STOP on
create or replace function pg_temp.claim(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; raise notice 'ok  %', what; end $$;

select pg_temp.claim(shutdoor_vote_epoch() = date '2026-11-05', 'the vote begins on 2026-11-05');
select pg_temp.claim(not exists (select 1 from shutdoor_vote_days where day > shutdoor_today()), 'no day not begun is stored');
select pg_temp.claim(shutdoor_fixed_pack(date '2026-10-25') = 'std-2001-ws7-rivera'
  and shutdoor_fixed_pack(date '2026-10-16') = 'std-2025-ws7-yamamoto', 'a preview day walks the preview rotation (the first ten)');
select pg_temp.claim(shutdoor_fixed_pack(date '2026-10-30') = 'std-2016-ws7-chapman'
  and shutdoor_fixed_pack(date '2026-11-24') = 'std-2009-alcs6-rivera', 'daily #1 on is the thirty, as before');

-- the days 160's and 161's tests stored, from the clock they set: a clean slate
delete from public.shutdoor_votes;
delete from public.shutdoor_vote_days;

-- the test sets the Eastern day (test.today), as 160's test does; put back at the end
create or replace function public.shutdoor_today() returns date
language sql stable as $$ select coalesce(nullif(current_setting('test.today', true), '')::date,
                                          (now() at time zone 'America/New_York')::date) $$;

set test.today = '2026-11-04';
select pg_temp.claim(shutdoor_vote_candidates(date '2026-11-04') is null, 'no candidates before the first day');
select pg_temp.claim((shutdoor_vote(date '2026-11-05')->>'open')::boolean, 'on 2026-11-04 the vote for 2026-11-05 is open');
select pg_temp.claim(shutdoor_vote_lock(date '2026-11-04') is null, 'the day before the vote is the schedule''s, no lock');

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
  ('2026-11-25', 'std-2005-nlcs5-lidge', 'std-2023-hader-stl'),
  ('2026-11-26', 'std-2011-rivera-min', 'std-2008-ws5-lidge'),
  ('2026-11-27', 'std-2025-ws6-glasnow', 'std-2023-ws1-sewald'),
  ('2026-11-28', 'std-2016-ws7-chapman', 'std-2011-ws6-feliz'),
  ('2026-11-29', 'std-2025-scott-kc', 'std-2025-diaz-cin'),
  ('2026-11-30', 'std-2018-alcs4-kimbrel', 'std-2014-ws7-bumgarner'),
  ('2026-12-01', 'std-2010-ws5-wilson', 'std-2021-nlcs6-smith'),
  ('2026-12-02', 'std-2017-ws2-jansen', 'std-2001-ws7-rivera'),
  ('2026-12-03', 'std-1988-ws1-eckersley', 'std-2022-ws6-pressly'),
  ('2026-12-04', 'std-2023-williams-sd', 'std-2012-ws4-romo'),
  ('2026-12-05', 'std-2019-nlwc-hader', 'std-2024-ws5-buehler'),
  ('2026-12-06', 'std-2008-alcs7-price', 'std-2008-krod-sea'),
  ('2026-12-07', 'std-2007-ws4-papelbon', 'std-2009-alcs6-rivera'),
  ('2026-12-08', 'std-2015-alcs6-davis', 'std-2025-ws7-yamamoto'),
  ('2026-12-09', 'std-2005-nlcs5-lidge', 'std-2013-alcs6-uehara'),
  ('2026-12-10', 'std-2011-rivera-min', 'std-2008-ws5-lidge'),
  ('2026-12-11', 'std-2010-hoffman-stl', 'std-2025-ws6-glasnow'),
  ('2026-12-12', 'std-2023-ws1-sewald', 'std-2011-ws6-feliz'),
  ('2026-12-13', 'std-2025-diaz-cin', 'std-2025-scott-kc'),
  ('2026-12-14', 'std-2023-hader-stl', 'std-2018-alcs4-kimbrel'),
  ('2026-12-15', 'std-2016-ws7-chapman', 'std-2010-ws5-wilson'),
  ('2026-12-16', 'std-2021-nlcs6-smith', 'std-2017-ws2-jansen'),
  ('2026-12-17', 'std-2022-ws6-pressly', 'std-2001-ws7-rivera'),
  ('2026-12-18', 'std-2012-ws4-romo', 'std-2014-ws7-bumgarner'),
  ('2026-12-19', 'std-2019-nlwc-hader', 'std-2023-williams-sd'),
  ('2026-12-20', 'std-2008-krod-sea', 'std-1988-ws1-eckersley'),
  ('2026-12-21', 'std-2008-alcs7-price', 'std-2024-ws5-buehler'),
  ('2026-12-22', 'std-2025-ws7-yamamoto', 'std-2009-alcs6-rivera'),
  ('2026-12-23', 'std-2007-ws4-papelbon', 'std-2015-alcs6-davis'),
  ('2026-12-24', 'std-2005-nlcs5-lidge', 'std-2008-ws5-lidge'),
  ('2026-12-25', 'std-2013-alcs6-uehara', 'std-2011-rivera-min'),
  ('2026-12-26', 'std-2010-hoffman-stl', 'std-2025-ws6-glasnow'),
  ('2026-12-27', 'std-2025-scott-kc', 'std-2025-diaz-cin'),
  ('2026-12-28', 'std-2023-ws1-sewald', 'std-2023-hader-stl'),
  ('2026-12-29', 'std-2016-ws7-chapman', 'std-2018-alcs4-kimbrel'),
  ('2026-12-30', 'std-2021-nlcs6-smith', 'std-2017-ws2-jansen'),
  ('2026-12-31', 'std-2022-ws6-pressly', 'std-2011-ws6-feliz'),
  ('2027-01-01', 'std-2012-ws4-romo', 'std-2014-ws7-bumgarner'),
  ('2027-01-02', 'std-2019-nlwc-hader', 'std-2010-ws5-wilson'),
  ('2027-01-03', 'std-2023-williams-sd', 'std-1988-ws1-eckersley');
set test.today = '2027-01-10';
select pg_temp.claim((select count(*) from expect e where shutdoor_vote_candidates(e.day) = array[e.a, e.b]) = (select count(*) from expect),
  'the server''s candidates are modes.js''s for every one of the first 60 vote days');
reset test.today;
create or replace function public.shutdoor_today() returns date
language sql stable as $$ select (now() at time zone 'America/New_York')::date $$;
