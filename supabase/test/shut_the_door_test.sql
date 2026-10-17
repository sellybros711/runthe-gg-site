-- Shut The Door's outings, streaks and board (152). Chain:
--   psql -d std -f supabase/test/baseball_pro_base.sql   (auth.users, auth.uid() off test.uid, the roles)
--   psql -d std -c "create table if not exists public.profiles (id uuid primary key, username text)"
--   psql -d std -f supabase/152_shut_the_door.sql
--   psql -d std -f supabase/152_shut_the_door.sql        (twice: it is safe to rerun)
--   psql -d std -f supabase/test/shut_the_door_test.sql
\set ON_ERROR_STOP on
create table if not exists public.profiles (id uuid primary key, username text);
insert into public.profiles values
  ('00000000-0000-0000-0000-0000000000e1', 'mo'),
  ('00000000-0000-0000-0000-0000000000e2', 'eck'),
  ('00000000-0000-0000-0000-0000000000e3', 'wild') on conflict do nothing;
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000e1'), ('00000000-0000-0000-0000-0000000000e2'),
  ('00000000-0000-0000-0000-0000000000e3') on conflict do nothing;

create or replace function pg_temp.claim(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; raise notice 'ok  %', what; end $$;
create or replace function pg_temp.fails(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return true; end $$;
-- one outing of n pitches, as the page sends it
create or replace function pg_temp.post(d date, outcome text, n int, score int) returns json language sql as $$
  select shutdoor_submit(d, 1, 'std-2025-ws7-yamamoto',
    (select jsonb_agg(jsonb_build_object('type', 'FF', 'cell', 12)) from generate_series(1, n)),
    outcome, n, score, 50, 'Josh Hader',
    (select jsonb_agg('green'::text) from generate_series(1, n)))
$$;

delete from public.shutdoor_outings;
delete from public.shutdoor_streaks;
\i supabase/152_shut_the_door.sql
select pg_temp.claim(true, 'running 152 again is safe');

set test.uid = '';
select pg_temp.claim(pg_temp.fails($$select pg_temp.post(shutdoor_today(), 'door_shut', 10, 800)$$), 'a guest cannot post');
select pg_temp.claim(shutdoor_my_stats() is null, 'a guest has no stats');

set test.uid = '00000000-0000-0000-0000-0000000000e1';
select pg_temp.claim((pg_temp.post(shutdoor_today() - 1, 'door_shut', 12, 820)->>'streak')::int = 1, 'a door shut starts a streak');
select pg_temp.claim((pg_temp.post(shutdoor_today(), 'door_shut', 9, 860)->>'streak')::int = 2, 'a door shut the next day makes it two');
select pg_temp.claim((pg_temp.post(shutdoor_today(), 'walk_off', 9, 100)->>'taken')::boolean = false, 'a second post the same day is ignored');
select pg_temp.claim((select outcome from shutdoor_outings where user_id = '00000000-0000-0000-0000-0000000000e1' and day = shutdoor_today()) = 'door_shut', 'the first post stands');
select pg_temp.claim((shutdoor_my_stats()->>'streak')::int = 2 and (shutdoor_my_stats()->>'best')::int = 2, 'my stats carry the streak and the best');
select pg_temp.claim((shutdoor_my_stats()->>'played')::int = 2, 'my stats count what was played');
select pg_temp.claim(pg_temp.fails($$select pg_temp.post(shutdoor_today() - 5, 'door_shut', 10, 800)$$), 'a day long past cannot be posted');
select pg_temp.claim(pg_temp.fails($$select pg_temp.post(shutdoor_today() + 3, 'door_shut', 10, 800)$$), 'a day far ahead cannot be posted');

set test.uid = '00000000-0000-0000-0000-0000000000e2';
select pg_temp.claim(pg_temp.fails($$select pg_temp.post(shutdoor_today(), 'blown', 10, 800)$$), 'an outcome that is not one is refused');
select pg_temp.claim(pg_temp.fails($$select pg_temp.post(shutdoor_today(), 'door_shut', 0, 800)$$), 'no pitches is refused');
select pg_temp.claim(pg_temp.fails($$select pg_temp.post(shutdoor_today(), 'door_shut', 10, 5000)$$), 'a score no outing makes is refused');
select pg_temp.claim(pg_temp.fails($$select shutdoor_submit(shutdoor_today(), 1, 'x', '[{"type":"FF","cell":12}]'::jsonb, 'door_shut', 2, 800, 50, null, '["green","green"]'::jsonb)$$),
  'calls that do not match the pitch count are refused');
select pg_temp.claim(pg_temp.fails($$select shutdoor_submit(shutdoor_today(), 1, 'x', '[{"type":"FF","cell":40}]'::jsonb, 'door_shut', 1, 800, 50, null, '["green"]'::jsonb)$$),
  'a cell off the grid is refused');
select pg_temp.claim(pg_temp.fails($$select shutdoor_submit(shutdoor_today(), 1, 'x', '[{"type":"FF","cell":1}]'::jsonb, 'door_shut', 1, 800, 50, null, '["blue"]'::jsonb)$$),
  'a band that is not one is refused');
-- a missed day resets it
insert into shutdoor_streaks (user_id, streak, best, last_day) values ('00000000-0000-0000-0000-0000000000e2', 5, 5, shutdoor_today() - 3)
  on conflict (user_id) do update set streak = 5, best = 5, last_day = shutdoor_today() - 3;
select pg_temp.claim((shutdoor_my_stats()->>'streak')::int = 0, 'a streak whose last day is past yesterday reads 0');
select pg_temp.claim((pg_temp.post(shutdoor_today(), 'door_shut', 10, 700)->>'streak')::int = 1, 'after a missed day a door shut starts again at 1');
select pg_temp.claim((shutdoor_my_stats()->>'best')::int = 5, 'the best is kept');

set test.uid = '00000000-0000-0000-0000-0000000000e3';
select pg_temp.claim((pg_temp.post(shutdoor_today() - 1, 'door_shut', 10, 700)->>'streak')::int = 1, 'a door shut');
select pg_temp.claim((pg_temp.post(shutdoor_today(), 'doors_open', 14, 300)->>'streak')::int = 0, 'a blown save resets the streak');

select pg_temp.claim((select string_agg(username, ',' order by rank) from shutdoor_board(shutdoor_today())) = 'mo,eck,wild',
  'the board is by score, best first');
select pg_temp.claim((select players from shutdoor_board(shutdoor_today()) limit 1) = 3, 'and says how many played');
select pg_temp.claim((select mine from shutdoor_board(shutdoor_today()) where username = 'wild'), 'the caller''s own row is marked');
select pg_temp.claim((select count(*) from shutdoor_board(shutdoor_today(), 1)) = 2, 'a short board still carries the caller''s row');
select pg_temp.claim((pg_temp.post(shutdoor_today(), 'door_shut', 3, 999)->>'rank')::int = 3, 'a repeat post answers with the rank the first one has');

set test.uid = '';
select pg_temp.claim((select count(*) from shutdoor_board(shutdoor_today())) = 3, 'a guest can read the board');
set role anon;
select pg_temp.claim(pg_temp.fails($$select * from shutdoor_outings$$), 'nobody reads the table directly');
reset role;
