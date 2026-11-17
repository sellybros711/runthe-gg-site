-- The throwback plates and Diamond (177). Chain, after 166 and its test:
--   psql -d std -f supabase/177_shut_the_door_plates_more.sql
--   psql -d std -f supabase/177_shut_the_door_plates_more.sql   (twice: it is safe to rerun)
--   psql -d std -f supabase/test/shut_the_door_plates_more_test.sql
\set ON_ERROR_STOP on
insert into public.profiles (id, username) values
  ('00000000-0000-0000-0000-000000177001', 'brickred'),
  ('00000000-0000-0000-0000-000000177002', 'gemcutter') on conflict do nothing;
insert into auth.users (id) values ('00000000-0000-0000-0000-000000177001'), ('00000000-0000-0000-0000-000000177002')
  on conflict do nothing;

create or replace function pg_temp.claim(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; raise notice 'ok  %', what; end $$;
create or replace function pg_temp.fails(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return true; end $$;

-- a day of this test's own
delete from public.shutdoor_outings where day = date '2026-01-09';
update public.profiles set shutdoor_plate = null where id::text like '00000000-0000-0000-0000-000000177%';
insert into shutdoor_outings (user_id, day, daily_number, scenario_id, calls, outcome, pitches, score, percentile, strip) values
  ('00000000-0000-0000-0000-000000177001', date '2026-01-09', 1, 'std-2005-nlcs5-lidge',
   (select jsonb_agg(jsonb_build_object('type', 'FF', 'cell', 12)) from generate_series(1, 9)), 'door_shut', 9, 820, 70,
   (select jsonb_agg('green'::text) from generate_series(1, 9))),
  ('00000000-0000-0000-0000-000000177002', date '2026-01-09', 1, 'std-2005-nlcs5-lidge',
   (select jsonb_agg(jsonb_build_object('type', 'FF', 'cell', 12)) from generate_series(1, 9)), 'walk_off', 9, 300, 20,
   (select jsonb_agg('green'::text) from generate_series(1, 9)));

\i supabase/177_shut_the_door_plates_more.sql
select pg_temp.claim(true, 'running 177 again is safe');

-- 1. the rows: 162's clubs kept, the eras beside them
select pg_temp.claim((select club = 'astros' and throwback = 'astrosbrick' from shutdoor_pack_clubs where id = 'std-2005-nlcs5-lidge'), '2005 Houston: the Astros and the 2000-2012 Astros');
select pg_temp.claim((select club = 'dodgers' and throwback is null from shutdoor_pack_clubs where id = 'std-2025-ws7-yamamoto'), 'a situation of today''s identity has no throwback');
select pg_temp.claim(pg_temp.fails($q$ update shutdoor_pack_clubs set throwback = 'Not A Key' where id = 'std-2005-nlcs5-lidge' $q$), 'a throwback is a key like any plate');

-- 2. a save in an era unlocks the club and the era; a loss unlocks nothing
select pg_temp.claim(shutdoor_unlocked('00000000-0000-0000-0000-000000177001') = array['astros', 'astrosbrick'], 'the save: astros and astrosbrick');
select pg_temp.claim(shutdoor_unlocked('00000000-0000-0000-0000-000000177002') = '{}'::text[], 'the walk-off: nothing');
set test.uid = '00000000-0000-0000-0000-000000177001';
select pg_temp.claim((shutdoor_set_plate('astrosbrick')->>'plate') = 'astrosbrick', 'the throwback can be worn');
select pg_temp.claim((select plate from shutdoor_board(date '2026-01-09', 50) where username = 'brickred') = 'astrosbrick', 'and the board shows it');
select pg_temp.claim(pg_temp.fails($q$ select shutdoor_set_plate('brewersgold') $q$), 'a throwback not earned is refused');

-- 3. Diamond: refused while the gate is off (it is off for everyone today)
select pg_temp.claim(not ('diamond' = any(shutdoor_unlocked('00000000-0000-0000-0000-000000177001'))), 'not Pro: no Diamond in the list');
select pg_temp.claim(pg_temp.fails($q$ select shutdoor_set_plate('diamond') $q$), 'not Pro: the setter refuses Diamond');
select pg_temp.claim(pg_temp.fails($q$ select shutdoor_set_plate('DIAMOND ') $q$), 'not Pro: in any case or spacing');
-- stored behind the setter's back, a non-Pro board row still shows the plain plate
update profiles set shutdoor_plate = 'diamond' where id = '00000000-0000-0000-0000-000000177002';
select pg_temp.claim((select plate is null from shutdoor_board(date '2026-01-09', 50) where username = 'gemcutter'), 'not Pro: the board draws plain, never Diamond');
select pg_temp.claim((shutdoor_my_plates()->>'plate') = 'astrosbrick', 'my plates is unchanged for the other account');

-- 4. with the gate on for one account (a stand-in for the store's later migration)
create or replace function public.shutdoor_is_pro(p_uid uuid) returns boolean language sql stable as $$
  select p_uid = '00000000-0000-0000-0000-000000177002'::uuid $$;
select pg_temp.claim('diamond' = any(shutdoor_unlocked('00000000-0000-0000-0000-000000177002')), 'Pro: Diamond is in the list');
select pg_temp.claim((select plate from shutdoor_board(date '2026-01-09', 50) where username = 'gemcutter') = 'diamond', 'Pro: the board shows Diamond');
set test.uid = '00000000-0000-0000-0000-000000177002';
select pg_temp.claim((shutdoor_set_plate('diamond')->>'plate') = 'diamond', 'Pro: the setter takes Diamond');
select pg_temp.claim((shutdoor_my_plates()->>'plate') = 'diamond', 'Pro: my plates answers it');
set test.uid = '00000000-0000-0000-0000-000000177001';
select pg_temp.claim(pg_temp.fails($q$ select shutdoor_set_plate('diamond') $q$), 'another account is still refused');

-- put back 160's gate: Pro ends, and Diamond falls back to plain everywhere
create or replace function public.shutdoor_is_pro(p_uid uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  PRO_LIVE constant boolean := false;
  ok boolean := false;
begin
  if not PRO_LIVE or p_uid is null or to_regclass('public.premium_unlocks') is null then return false; end if;
  execute 'select exists (select 1 from public.premium_unlocks u where u.user_id = $1 and u.product = ''std_premium''
             and (u.expires_at is null or u.expires_at > now()))' into ok using p_uid;
  return coalesce(ok, false);
end $$;
revoke all on function public.shutdoor_is_pro(uuid) from public;
set test.uid = '00000000-0000-0000-0000-000000177002';
select pg_temp.claim((shutdoor_my_plates()->>'plate') is null, 'Pro ends: my plates answers plain');
select pg_temp.claim((select plate is null from shutdoor_board(date '2026-01-09', 50) where username = 'gemcutter'), 'Pro ends: the board draws plain');
reset test.uid;
