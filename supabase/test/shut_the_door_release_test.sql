-- Shut The Door's release (156). Chain, after the 153 and 155 chains and their tests:
--   psql -d std -f supabase/156_shut_the_door_release.sql
--   psql -d std -f supabase/156_shut_the_door_release.sql   (twice: it is safe to rerun)
--   psql -d std -f supabase/test/shut_the_door_release_test.sql
\set ON_ERROR_STOP on
create table if not exists public.profiles (id uuid primary key, username text);
insert into public.profiles values
  ('00000000-0000-0000-0000-0000000000d1', 'timed'),
  ('00000000-0000-0000-0000-0000000000d2', 'untimed'),
  ('00000000-0000-0000-0000-0000000000d3', 'forged') on conflict do nothing;
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000d1'), ('00000000-0000-0000-0000-0000000000d2'),
  ('00000000-0000-0000-0000-0000000000d3') on conflict do nothing;

create or replace function pg_temp.claim(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; raise notice 'ok  %', what; end $$;
create or replace function pg_temp.fails(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return true; end $$;
-- one outing of n pitches, every call {type, cell} plus the given q (a jsonb value, or sql null for none)
create or replace function pg_temp.post(d date, n int, q jsonb) returns json language sql as $$
  select shutdoor_submit(d, 1, 'std-2025-ws7-yamamoto',
    (select jsonb_agg(case when q is null then jsonb_build_object('type', 'FF', 'cell', 12)
                           else jsonb_build_object('type', 'FF', 'cell', 12, 'q', q) end) from generate_series(1, n)),
    'door_shut', n, 820, 50, 'Josh Hader',
    (select jsonb_agg('green'::text) from generate_series(1, n)))
$$;

\i supabase/156_shut_the_door_release.sql
select pg_temp.claim(true, 'running 156 again is safe');

delete from public.shutdoor_outings where user_id in ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d3');
delete from public.shutdoor_streaks where user_id in ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d3');

set test.uid = '00000000-0000-0000-0000-0000000000d1';
select pg_temp.claim((pg_temp.post(shutdoor_today(), 10, '0.83')->>'taken')::boolean, 'calls with a release are taken');
select pg_temp.claim((select (calls->3->>'q')::numeric from shutdoor_outings where user_id = '00000000-0000-0000-0000-0000000000d1' and day = shutdoor_today()) = 0.83,
  'and the release is stored with each call');
select pg_temp.claim((pg_temp.post(shutdoor_today() - 1, 9, '0')->>'taken')::boolean and (pg_temp.post(shutdoor_today() + 1, 9, '1')->>'taken')::boolean,
  'the ends of the range, 0 and 1, are taken');

set test.uid = '00000000-0000-0000-0000-0000000000d2';
select pg_temp.claim((pg_temp.post(shutdoor_today(), 11, null)->>'taken')::boolean, 'calls without a release (the meter off, or before it) are taken');
select pg_temp.claim((pg_temp.post(shutdoor_today() - 1, 11, 'null')->>'taken')::boolean, 'a null release is taken as none');

set test.uid = '00000000-0000-0000-0000-0000000000d3';
select pg_temp.claim(pg_temp.fails($$select pg_temp.post(shutdoor_today(), 10, '1.5')$$), 'a release over 1 is refused');
select pg_temp.claim(pg_temp.fails($$select pg_temp.post(shutdoor_today(), 10, '-0.1')$$), 'a release under 0 is refused');
select pg_temp.claim(pg_temp.fails($$select pg_temp.post(shutdoor_today(), 10, '"0.9"')$$), 'a release as a string is refused');
select pg_temp.claim(pg_temp.fails($$select pg_temp.post(shutdoor_today(), 10, '"x"')$$), 'a release that is not a number is refused');
select pg_temp.claim(pg_temp.fails($$select pg_temp.post(shutdoor_today(), 10, '{}')$$), 'a release that is an object is refused');
select pg_temp.claim(not exists (select 1 from shutdoor_outings where user_id = '00000000-0000-0000-0000-0000000000d3'), 'nothing was stored for the refused posts');
-- the rest of the guard is 155's
select pg_temp.claim(pg_temp.fails($$select shutdoor_submit(shutdoor_today(), 1, 'x', '[{"type":"FF","cell":25,"q":0.5}]', 'door_shut', 1, 800, 50, null, '["green"]')$$),
  'a bad cell is still refused');
select pg_temp.claim((select shutdoor_submit(shutdoor_today(), 1, 'x', '[{"type":"FF","cell":12,"q":0.5}]', 'tie_held', 1, 600, 50, null, '["green"]')->>'taken')::boolean,
  'a held tie with a release is taken');
set test.uid = '';
