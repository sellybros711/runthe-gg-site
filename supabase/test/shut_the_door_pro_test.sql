-- Shut The Door Pro goes on sale (181). Chain, after 178 and its test, with the store's table:
--   psql -d std -f supabase/101_premium_bundles.sql
--   psql -d std -f supabase/142_hoops_pass.sql
--   psql -d std -f supabase/181_shut_the_door_pro.sql
--   psql -d std -f supabase/181_shut_the_door_pro.sql   (twice: it is safe to rerun)
--   psql -d std -f supabase/test/shut_the_door_pro_test.sql
--
-- Pro here is a REAL premium_unlocks row, the one the webhook writes, never a stand-in for the
-- gate: what 181 switches on is that the row is honoured. Every perk is asked of the function the
-- page calls, and every perk is asked again once the row has ended.
\set ON_ERROR_STOP on
insert into public.profiles (id, username) values
  ('00000000-0000-0000-0000-000000181001', 'doorpro'),
  ('00000000-0000-0000-0000-000000181002', 'doorfree') on conflict do nothing;
insert into auth.users (id) values ('00000000-0000-0000-0000-000000181001'), ('00000000-0000-0000-0000-000000181002')
  on conflict do nothing;

create or replace function pg_temp.claim(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; raise notice 'ok  %', what; end $$;
create or replace function pg_temp.fails(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return true; end $$;
create or replace function pg_temp.calls(n int) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('type', 'FF', 'cell', 12, 'r', 7)) from generate_series(1, n) $$;
-- one finished Survivor run for the caller: one door shut, then a walk-off ends it
create or replace function pg_temp.run(d date, n int) returns json language sql as $$
  select shutdoor_survivor_start(d);
  select shutdoor_survivor_post(d, n, 0, 'std-2016-ws7-chapman', pg_temp.calls(9), 'door_shut', 9, 800);
  select shutdoor_survivor_post(d, n, 1, 'std-2001-ws7-rivera', pg_temp.calls(9), 'walk_off', 9, 10) $$;

-- the test sets the Eastern day (test.today), as 160's test does; put back at the end
create or replace function public.shutdoor_today() returns date
language sql stable as $$ select coalesce(nullif(current_setting('test.today', true), '')::date,
                                          (now() at time zone 'America/New_York')::date) $$;
set test.today = '2027-03-10';
delete from public.shutdoor_survivor where day = date '2027-03-10';
delete from public.shutdoor_archive where user_id::text like '00000000-0000-0000-0000-000000181%';
delete from public.premium_unlocks where user_id::text like '00000000-0000-0000-0000-000000181%';
update public.profiles set shutdoor_plate = null where id::text like '00000000-0000-0000-0000-000000181%';

\i supabase/181_shut_the_door_pro.sql
select pg_temp.claim(true, 'running 181 again is safe');

-- 1. the product
select pg_temp.claim(not pg_temp.fails($q$ insert into premium_unlocks (user_id, product, source) values
  ('00000000-0000-0000-0000-000000181002', 'std_premium', 'test') $q$), 'the table takes std_premium');
delete from premium_unlocks where user_id = '00000000-0000-0000-0000-000000181002';
select pg_temp.claim(pg_temp.fails($q$ insert into premium_unlocks (user_id, product, source) values
  ('00000000-0000-0000-0000-000000181002', 'std_pro', 'test') $q$), 'and still refuses a product nobody sells');
select pg_temp.claim(not pg_temp.fails($q$ insert into premium_unlocks (user_id, product, source) values
  ('00000000-0000-0000-0000-000000181002', 'rtd_premium', 'test') $q$), 'the products before it are still allowed');
delete from premium_unlocks where user_id = '00000000-0000-0000-0000-000000181002';

-- 2. no row is no Pro, with the gate on
set test.uid = '00000000-0000-0000-0000-000000181002';
select pg_temp.claim(not shutdoor_is_pro('00000000-0000-0000-0000-000000181002'), 'no row: not Pro');
select pg_temp.claim((shutdoor_entitlements()->>'pro')::boolean = false and (shutdoor_entitlements()->>'archive')::boolean = false
  and (shutdoor_entitlements()->>'survivorRuns')::int = 1, 'no row: one Survivor run a day and no archive');
select pg_temp.run(date '2027-03-10', 0) is not null as ran \g /dev/null
select pg_temp.claim(pg_temp.fails($q$ select shutdoor_survivor_start(date '2027-03-10') $q$), 'no row: a second run is refused');
select pg_temp.claim(pg_temp.fails($q$ select shutdoor_archive_submit(date '2027-03-08', 'std-2016-ws7-chapman', pg_temp.calls(9), 'door_shut', 9, 650, 50) $q$),
  'no row: the archive is refused');
select pg_temp.claim(not ('diamond' = any(shutdoor_unlocked('00000000-0000-0000-0000-000000181002'))), 'no row: no Diamond');
-- Run The Diamond Pro on its own is not Shut The Door Pro (the owner, 2026-11-18)
insert into premium_unlocks (user_id, product, source, expires_at)
  values ('00000000-0000-0000-0000-000000181002', 'rtd_premium', 'subscription:diamond-pro', now() + interval '300 days');
select pg_temp.claim(not shutdoor_is_pro('00000000-0000-0000-0000-000000181002'), 'Diamond Pro alone is not Shut The Door Pro');

-- 3. a paid year, as the webhook writes it (door-pro, or the pair with rtd_premium beside it)
insert into premium_unlocks (user_id, product, source, payload, expires_at)
  values ('00000000-0000-0000-0000-000000181001', 'std_premium', 'subscription:door-pro',
          '{"stripe_subscription": "sub_test", "status": "active"}', now() + interval '368 days');
set test.uid = '00000000-0000-0000-0000-000000181001';
select pg_temp.claim(shutdoor_is_pro('00000000-0000-0000-0000-000000181001'), 'a live std_premium row is Pro');
select pg_temp.claim((shutdoor_entitlements()->>'pro')::boolean and (shutdoor_entitlements()->>'archive')::boolean
  and (shutdoor_entitlements()->>'survivorRuns') is null, 'entitlements: Pro, the archive, Survivor runs unlimited');
-- Survivor: as many runs as they like, one after another
select pg_temp.run(date '2027-03-10', 0) is not null as ran \g /dev/null
select pg_temp.run(date '2027-03-10', 1) is not null as ran \g /dev/null
select pg_temp.run(date '2027-03-10', 2) is not null as ran \g /dev/null
select pg_temp.run(date '2027-03-10', 3) is not null as ran \g /dev/null
select pg_temp.run(date '2027-03-10', 4) is not null as ran \g /dev/null
select pg_temp.run(date '2027-03-10', 5) is not null as ran \g /dev/null
select pg_temp.claim(json_array_length(shutdoor_survivor_state(date '2027-03-10')->'runs') = 6, 'Pro: six runs in a day, and no cap');
select pg_temp.claim((shutdoor_survivor_state(date '2027-03-10')->>'canStart')::boolean, 'and a seventh may start');
select pg_temp.claim((select count(*) from shutdoor_survivor_board(date '2027-03-10') where username = 'doorpro') = 1
  and (select saves from shutdoor_survivor_board(date '2027-03-10') where username = 'doorpro') = 1,
  'the board keeps run 0 only: one row, one save');
-- the archive
select pg_temp.claim((shutdoor_archive_submit(date '2027-03-08', 'std-2016-ws7-chapman', pg_temp.calls(9), 'door_shut', 9, 650, 50)->>'taken')::boolean,
  'Pro: a past daily from the archive is kept');
select pg_temp.claim((select count(*) from shutdoor_board(date '2027-03-08') where username = 'doorpro') = 0,
  'and never goes on that day''s board');
-- the Diamond plate, on the account and the board
select pg_temp.claim('diamond' = any(shutdoor_unlocked('00000000-0000-0000-0000-000000181001')), 'Pro: Diamond is unlocked');
select pg_temp.claim((shutdoor_set_plate('diamond')->>'plate') = 'diamond', 'Pro: Diamond can be worn');
select pg_temp.claim((select plate from shutdoor_survivor_board(date '2027-03-10') where username = 'doorpro') = 'diamond',
  'Pro: the Survivor board draws Diamond');

-- 4. the year ends (a cancel, a refund, a lapse: the webhook pulls the end in)
update premium_unlocks set expires_at = now() - interval '1 minute'
 where user_id = '00000000-0000-0000-0000-000000181001' and product = 'std_premium';
select pg_temp.claim(not shutdoor_is_pro('00000000-0000-0000-0000-000000181001'), 'an ended row is not Pro');
select pg_temp.claim(pg_temp.fails($q$ select shutdoor_survivor_start(date '2027-03-10') $q$), 'ended: no more runs today');
select pg_temp.claim(pg_temp.fails($q$ select shutdoor_archive_submit(date '2027-03-07', 'std-2016-ws7-chapman', pg_temp.calls(9), 'door_shut', 9, 650, 50) $q$),
  'ended: the archive is refused');
select pg_temp.claim((shutdoor_my_plates()->>'plate') is null, 'ended: the stored Diamond answers plain');
select pg_temp.claim((select plate is null from shutdoor_survivor_board(date '2027-03-10') where username = 'doorpro'),
  'ended: the board draws plain');

-- 5. a comp, by hand, with no end date, is Pro for good
update premium_unlocks set expires_at = null, source = 'comp'
 where user_id = '00000000-0000-0000-0000-000000181001' and product = 'std_premium';
select pg_temp.claim(shutdoor_is_pro('00000000-0000-0000-0000-000000181001'), 'a comp with no end date is Pro');

-- put back what the test changed
reset test.uid;
delete from public.premium_unlocks where user_id::text like '00000000-0000-0000-0000-000000181%';
update public.profiles set shutdoor_plate = null where id::text like '00000000-0000-0000-0000-000000181%';
create or replace function public.shutdoor_today() returns date
language sql stable as $$ select (now() at time zone 'America/New_York')::date $$;
reset test.today;
