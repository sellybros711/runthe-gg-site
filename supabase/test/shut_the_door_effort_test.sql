-- Shut The Door's effort (157). Chain, after the 153, 155 and 156 chains and their tests:
--   psql -d std -f supabase/157_shut_the_door_effort.sql
--   psql -d std -f supabase/157_shut_the_door_effort.sql   (twice: it is safe to rerun)
--   psql -d std -f supabase/test/shut_the_door_effort_test.sql
\set ON_ERROR_STOP on
create table if not exists public.profiles (id uuid primary key, username text);
insert into public.profiles values
  ('00000000-0000-0000-0000-0000000000e1', 'effort'),
  ('00000000-0000-0000-0000-0000000000e2', 'no effort'),
  ('00000000-0000-0000-0000-0000000000e3', 'forged effort') on conflict do nothing;
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000e1'), ('00000000-0000-0000-0000-0000000000e2'),
  ('00000000-0000-0000-0000-0000000000e3') on conflict do nothing;

create or replace function pg_temp.claim(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; raise notice 'ok  %', what; end $$;
create or replace function pg_temp.fails(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return true; end $$;
-- one outing of n pitches: every call {type, cell, r 2}, plus q and e when given (jsonb values, or sql null for none)
create or replace function pg_temp.post(d date, n int, q jsonb, e jsonb) returns json language sql as $$
  select shutdoor_submit(d, 1, 'std-2025-ws7-yamamoto',
    (select jsonb_agg(jsonb_build_object('type', 'FF', 'cell', 12, 'r', 2)
                      || case when q is null then '{}'::jsonb else jsonb_build_object('q', q) end
                      || case when e is null then '{}'::jsonb else jsonb_build_object('e', e) end) from generate_series(1, n)),
    'door_shut', n, 820, 50, 'Josh Hader',
    (select jsonb_agg('green'::text) from generate_series(1, n)))
$$;

\i supabase/157_shut_the_door_effort.sql
select pg_temp.claim(true, 'running 157 again is safe');

delete from public.shutdoor_outings where user_id in ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e3');
delete from public.shutdoor_streaks where user_id in ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e3');

set test.uid = '00000000-0000-0000-0000-0000000000e1';
select pg_temp.claim((pg_temp.post(shutdoor_today(), 10, '0.83', '0.75')->>'taken')::boolean, 'calls with a release and an effort are taken');
select pg_temp.claim((select (calls->3->>'e')::numeric from shutdoor_outings where user_id = '00000000-0000-0000-0000-0000000000e1' and day = shutdoor_today()) = 0.75,
  'and the effort is stored with each call');
select pg_temp.claim((pg_temp.post(shutdoor_today() - 1, 9, '0.5', '0')->>'taken')::boolean and (pg_temp.post(shutdoor_today() + 1, 9, '1', '1')->>'taken')::boolean,
  'the ends of the range, 0 and 1, are taken');

set test.uid = '00000000-0000-0000-0000-0000000000e2';
select pg_temp.claim((pg_temp.post(shutdoor_today(), 11, '0.6', null)->>'taken')::boolean, 'calls with a release and no effort (the one stop meter) are taken');
select pg_temp.claim((pg_temp.post(shutdoor_today() - 1, 11, null, null)->>'taken')::boolean, 'calls with neither (the meter off) are taken');
select pg_temp.claim((pg_temp.post(shutdoor_today() + 1, 11, '0.6', 'null')->>'taken')::boolean, 'a null effort is taken as none');

set test.uid = '00000000-0000-0000-0000-0000000000e3';
select pg_temp.claim(pg_temp.fails($$select pg_temp.post(shutdoor_today(), 10, '0.7', '1.5')$$), 'an effort over 1 is refused');
select pg_temp.claim(pg_temp.fails($$select pg_temp.post(shutdoor_today(), 10, '0.7', '-0.1')$$), 'an effort under 0 is refused');
select pg_temp.claim(pg_temp.fails($$select pg_temp.post(shutdoor_today(), 10, '0.7', '"1"')$$), 'an effort as a string is refused');
select pg_temp.claim(pg_temp.fails($$select pg_temp.post(shutdoor_today(), 10, '0.7', '[1]')$$), 'an effort that is a list is refused');
select pg_temp.claim(pg_temp.fails($$select pg_temp.post(shutdoor_today(), 10, null, '1')$$), 'an effort without a release (the meter off) is refused');
select pg_temp.claim(pg_temp.fails($$select pg_temp.post(shutdoor_today(), 10, 'null', '1')$$), 'an effort with a null release is refused');
select pg_temp.claim(not exists (select 1 from shutdoor_outings where user_id = '00000000-0000-0000-0000-0000000000e3'), 'nothing was stored for the refused posts');
-- the rest of the guard is 156's
select pg_temp.claim(pg_temp.fails($$select pg_temp.post(shutdoor_today(), 10, '1.5', '0.5')$$), 'a release over 1 is still refused');
select pg_temp.claim(pg_temp.fails($$select shutdoor_submit(shutdoor_today(), 1, 'x', '[{"type":"FF","cell":25,"q":0.5,"e":0.5}]', 'door_shut', 1, 800, 50, null, '["green"]')$$),
  'a bad cell is still refused');
select pg_temp.claim((select shutdoor_submit(shutdoor_today(), 1, 'x', '[{"type":"FF","cell":12,"q":0.5,"e":1,"r":2}]', 'tie_held', 1, 600, 50, null, '["green"]')->>'taken')::boolean,
  'a held tie with an effort is taken');
set test.uid = '';
