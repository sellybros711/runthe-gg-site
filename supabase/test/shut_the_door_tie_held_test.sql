-- Shut The Door's held tie (155). Chain, after the 153 chain and its test:
--   psql -d std -f supabase/155_shut_the_door_tie_held.sql
--   psql -d std -f supabase/155_shut_the_door_tie_held.sql   (twice: it is safe to rerun)
--   psql -d std -f supabase/test/shut_the_door_tie_held_test.sql
\set ON_ERROR_STOP on
create table if not exists public.profiles (id uuid primary key, username text);
insert into public.profiles values
  ('00000000-0000-0000-0000-0000000000f1', 'tied'),
  ('00000000-0000-0000-0000-0000000000f2', 'shut') on conflict do nothing;
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000f1'), ('00000000-0000-0000-0000-0000000000f2')
  on conflict do nothing;

create or replace function pg_temp.claim(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; raise notice 'ok  %', what; end $$;
create or replace function pg_temp.fails(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return true; end $$;
create or replace function pg_temp.post(d date, outcome text, n int, score int) returns json language sql as $$
  select shutdoor_submit(d, 1, 'std-2011-ws6-feliz',
    (select jsonb_agg(jsonb_build_object('type', 'FF', 'cell', 12)) from generate_series(1, n)),
    outcome, n, score, 50, 'Josh Hader',
    (select jsonb_agg('green'::text) from generate_series(1, n)))
$$;

\i supabase/155_shut_the_door_tie_held.sql
select pg_temp.claim(true, 'running 155 again is safe');
select pg_temp.claim((select count(*) from pg_constraint where conrelid = 'public.shutdoor_outings'::regclass
                       and conname = 'shutdoor_outings_outcome_check') = 1, 'one outcome check, under its own name');

delete from public.shutdoor_outings where user_id in ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2');
delete from public.shutdoor_streaks where user_id in ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2');

set test.uid = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.claim((pg_temp.post(shutdoor_today() - 1, 'door_shut', 12, 820)->>'streak')::int = 1, 'a door shut starts a streak');
select pg_temp.claim((pg_temp.post(shutdoor_today(), 'tie_held', 22, 640)->>'taken')::boolean, 'a held tie is taken');
select pg_temp.claim((select outcome from shutdoor_outings where user_id = '00000000-0000-0000-0000-0000000000f1' and day = shutdoor_today()) = 'tie_held',
  'and stored as tie_held');
select pg_temp.claim((shutdoor_my_stats()->>'streak')::int = 0, 'a held tie is a blown save: the streak resets');
select pg_temp.claim((shutdoor_my_stats()->>'best')::int = 1, 'the best is kept');
select pg_temp.claim((shutdoor_my_stats()->>'tieHeld')::int = 1 and (shutdoor_my_stats()->>'doorShut')::int = 1
  and (shutdoor_my_stats()->>'doorsOpen')::int = 0 and (shutdoor_my_stats()->>'walkOff')::int = 0 and (shutdoor_my_stats()->>'played')::int = 2,
  'my stats count the held tie on its own');
select pg_temp.claim(pg_temp.fails($$select pg_temp.post(shutdoor_today(), 'tied', 10, 800)$$), 'an outcome that is not one is still refused');
select pg_temp.claim(pg_temp.fails($$insert into shutdoor_outings (user_id, day, daily_number, scenario_id, calls, outcome, pitches, score, percentile, strip)
  values ('00000000-0000-0000-0000-0000000000f2', shutdoor_today() - 7, 1, 'x', '[]', 'blown', 1, 1, 1, '[]')$$), 'the table''s check still refuses a made-up outcome');

set test.uid = '00000000-0000-0000-0000-0000000000f2';
select pg_temp.claim((pg_temp.post(shutdoor_today(), 'door_shut', 9, 900)->>'streak')::int = 1, 'a door shut still counts');
select pg_temp.claim((select string_agg(username, ',' order by rank) from shutdoor_board(shutdoor_today()) where username in ('tied', 'shut')) = 'shut,tied',
  'the board still ranks by score');
select pg_temp.claim((select outcome from shutdoor_board(shutdoor_today()) where username = 'tied') = 'tie_held', 'the board shows the held tie');
set test.uid = '';
