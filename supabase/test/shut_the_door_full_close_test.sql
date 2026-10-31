-- Shut The Door's rules 8 rotation (161). Chain, after 160 and its test:
--   psql -d std -f supabase/161_shut_the_door_full_close.sql
--   psql -d std -f supabase/161_shut_the_door_full_close.sql   (twice: it is safe to rerun)
--   psql -d std -f supabase/test/shut_the_door_full_close_test.sql
-- The expected candidates below are modes.js's on the rules 8 rotation (test/modes.mjs checks
-- this file against it).
\set ON_ERROR_STOP on
create or replace function pg_temp.claim(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; raise notice 'ok  %', what; end $$;

-- the test sets the Eastern day (test.today), as 160's test does; put back at the end
create or replace function public.shutdoor_today() returns date
language sql stable as $$ select coalesce(nullif(current_setting('test.today', true), '')::date,
                                          (now() at time zone 'America/New_York')::date) $$;

-- 1. the list: thirty, the two new ids at the old ones' places, no old id left
select pg_temp.claim((select count(*) from shutdoor_packs) = 30, 'thirty situations');
select pg_temp.claim((select id from shutdoor_packs where ord = 18) = 'std-2008-alcs7-price'
  and (select id from shutdoor_packs where ord = 29) = 'std-2009-alcs6-rivera', 'Price at 18, Rivera at 29');
select pg_temp.claim(not exists (select 1 from shutdoor_packs where id in ('std-2020-nlds2-kelly', 'std-2016-nlds5-kershaw')),
  'Kelly and Kershaw are gone');
select pg_temp.claim(shutdoor_fixed_pack(date '2026-11-13') = 'std-2008-alcs7-price'
  and shutdoor_fixed_pack(date '2026-11-24') = 'std-2009-alcs6-rivera', 'their days are the new spots''');

-- 2. the vote: 160's test stored days drawn from the old list; 161 cleared every day not begun,
--    and the server draws modes.js's candidates from the new one
select pg_temp.claim(not exists (select 1 from shutdoor_vote_days where a in ('std-2020-nlds2-kelly', 'std-2016-nlds5-kershaw')
  or b in ('std-2020-nlds2-kelly', 'std-2016-nlds5-kershaw')), 'no vote day names an old id');
create temporary table expect (day date, a text, b text);
insert into expect values
  ('2026-11-16', 'std-2009-alcs6-rivera', 'std-2025-ws6-glasnow'),
  ('2026-11-17', 'std-2019-nlwc-hader', 'std-2007-ws4-papelbon'),
  ('2026-11-18', 'std-2008-krod-sea', 'std-2016-ws7-chapman'),
  ('2026-11-19', 'std-2010-ws5-wilson', 'std-2014-ws7-bumgarner'),
  ('2026-11-20', 'std-2025-diaz-cin', 'std-1988-ws1-eckersley'),
  ('2026-11-21', 'std-2011-ws6-feliz', 'std-2017-ws2-jansen'),
  ('2026-11-22', 'std-2023-hader-stl', 'std-2001-ws7-rivera'),
  ('2026-11-23', 'std-2022-ws6-pressly', 'std-2021-nlcs6-smith'),
  ('2026-11-24', 'std-2025-scott-kc', 'std-2015-alcs6-davis'),
  ('2026-11-25', 'std-2012-ws4-romo', 'std-2025-ws7-yamamoto'),
  ('2026-11-26', 'std-2024-ws5-buehler', 'std-2023-williams-sd'),
  ('2026-11-27', 'std-2005-nlcs5-lidge', 'std-2010-hoffman-stl'),
  ('2026-11-28', 'std-2008-alcs7-price', 'std-2008-ws5-lidge'),
  ('2026-11-29', 'std-2013-alcs6-uehara', 'std-2011-rivera-min'),
  ('2026-11-30', 'std-2023-ws1-sewald', 'std-2018-alcs4-kimbrel'),
  ('2026-12-01', 'std-2019-nlwc-hader', 'std-2025-ws6-glasnow'),
  ('2026-12-02', 'std-2016-ws7-chapman', 'std-2009-alcs6-rivera'),
  ('2026-12-03', 'std-2007-ws4-papelbon', 'std-2014-ws7-bumgarner'),
  ('2026-12-04', 'std-1988-ws1-eckersley', 'std-2025-diaz-cin'),
  ('2026-12-05', 'std-2017-ws2-jansen', 'std-2008-krod-sea'),
  ('2026-12-06', 'std-2001-ws7-rivera', 'std-2023-hader-stl'),
  ('2026-12-07', 'std-2022-ws6-pressly', 'std-2021-nlcs6-smith'),
  ('2026-12-08', 'std-2025-scott-kc', 'std-2015-alcs6-davis'),
  ('2026-12-09', 'std-2012-ws4-romo', 'std-2025-ws7-yamamoto'),
  ('2026-12-10', 'std-2024-ws5-buehler', 'std-2023-williams-sd'),
  ('2026-12-11', 'std-2010-hoffman-stl', 'std-2005-nlcs5-lidge'),
  ('2026-12-12', 'std-2008-ws5-lidge', 'std-2011-ws6-feliz'),
  ('2026-12-13', 'std-2011-rivera-min', 'std-2013-alcs6-uehara'),
  ('2026-12-14', 'std-2023-ws1-sewald', 'std-2018-alcs4-kimbrel'),
  ('2026-12-15', 'std-2025-ws6-glasnow', 'std-2019-nlwc-hader'),
  ('2026-12-16', 'std-2009-alcs6-rivera', 'std-2010-ws5-wilson'),
  ('2026-12-17', 'std-2016-ws7-chapman', 'std-2007-ws4-papelbon'),
  ('2026-12-18', 'std-2025-diaz-cin', 'std-2014-ws7-bumgarner'),
  ('2026-12-19', 'std-2008-alcs7-price', 'std-2017-ws2-jansen'),
  ('2026-12-20', 'std-2008-krod-sea', 'std-2001-ws7-rivera'),
  ('2026-12-21', 'std-1988-ws1-eckersley', 'std-2023-hader-stl'),
  ('2026-12-22', 'std-2025-scott-kc', 'std-2022-ws6-pressly'),
  ('2026-12-23', 'std-2015-alcs6-davis', 'std-2012-ws4-romo'),
  ('2026-12-24', 'std-2021-nlcs6-smith', 'std-2025-ws7-yamamoto'),
  ('2026-12-25', 'std-2024-ws5-buehler', 'std-2023-williams-sd'),
  ('2026-12-26', 'std-2005-nlcs5-lidge', 'std-2010-hoffman-stl'),
  ('2026-12-27', 'std-2011-ws6-feliz', 'std-2011-rivera-min'),
  ('2026-12-28', 'std-2023-ws1-sewald', 'std-2018-alcs4-kimbrel'),
  ('2026-12-29', 'std-2013-alcs6-uehara', 'std-2008-ws5-lidge'),
  ('2026-12-30', 'std-2025-ws6-glasnow', 'std-2009-alcs6-rivera'),
  ('2026-12-31', 'std-2007-ws4-papelbon', 'std-2016-ws7-chapman'),
  ('2027-01-01', 'std-2025-diaz-cin', 'std-2019-nlwc-hader'),
  ('2027-01-02', 'std-2010-ws5-wilson', 'std-2014-ws7-bumgarner'),
  ('2027-01-03', 'std-2008-alcs7-price', 'std-2008-krod-sea'),
  ('2027-01-04', 'std-1988-ws1-eckersley', 'std-2017-ws2-jansen'),
  ('2027-01-05', 'std-2001-ws7-rivera', 'std-2025-scott-kc'),
  ('2027-01-06', 'std-2022-ws6-pressly', 'std-2012-ws4-romo'),
  ('2027-01-07', 'std-2015-alcs6-davis', 'std-2021-nlcs6-smith'),
  ('2027-01-08', 'std-2025-ws7-yamamoto', 'std-2024-ws5-buehler'),
  ('2027-01-09', 'std-2023-williams-sd', 'std-2023-hader-stl'),
  ('2027-01-10', 'std-2005-nlcs5-lidge', 'std-2011-ws6-feliz'),
  ('2027-01-11', 'std-2018-alcs4-kimbrel', 'std-2011-rivera-min'),
  ('2027-01-12', 'std-2010-hoffman-stl', 'std-2013-alcs6-uehara'),
  ('2027-01-13', 'std-2009-alcs6-rivera', 'std-2023-ws1-sewald'),
  ('2027-01-14', 'std-2025-ws6-glasnow', 'std-2007-ws4-papelbon');
set test.today = '2027-02-03';
select pg_temp.claim((select count(*) from expect e where shutdoor_vote_candidates(e.day) = array[e.a, e.b]) = (select count(*) from expect),
  'the server''s candidates are modes.js''s on the new list for every one of the first 60 vote days');

-- 3. a stored day naming an old id (one already begun, by the test's clock) is cleared with every
--    later day and their votes, and drawn again
insert into shutdoor_vote_days (day, a, b) values (date '2027-01-20', 'std-2020-nlds2-kelly', 'std-2025-ws6-glasnow')
  on conflict (day) do update set a = excluded.a, b = excluded.b, winner = null;
insert into shutdoor_votes (day, user_id, pack)
  select date '2027-01-20', id, 'std-2020-nlds2-kelly' from auth.users limit 1 on conflict do nothing;
set test.today = '2027-02-03';
\i supabase/161_shut_the_door_full_close.sql
select pg_temp.claim(not exists (select 1 from shutdoor_vote_days where day >= date '2027-01-20')
  and not exists (select 1 from shutdoor_votes where day >= date '2027-01-20'), 'a day naming Kelly goes, with the days after it and their votes');
select pg_temp.claim((select count(*) from expect e where shutdoor_vote_candidates(e.day) = array[e.a, e.b]) = (select count(*) from expect),
  'and every day is drawn again the same');
reset test.today;
create or replace function public.shutdoor_today() returns date
language sql stable as $$ select (now() at time zone 'America/New_York')::date $$;
