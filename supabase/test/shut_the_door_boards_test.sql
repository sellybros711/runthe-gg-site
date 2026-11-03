-- Shut The Door's board end to end (159). Chain, after the 153, 155, 156 and 157 chains and their tests:
--   psql -d std -f supabase/159_shut_the_door_boards.sql
--   psql -d std -f supabase/159_shut_the_door_boards.sql   (twice: it is safe to rerun)
--   psql -d std -f supabase/test/shut_the_door_boards_test.sql
\set ON_ERROR_STOP on
create table if not exists public.profiles (id uuid primary key, username text);
insert into public.profiles values
  ('00000000-0000-0000-0000-0000000000b1', 'two phones'),
  ('00000000-0000-0000-0000-0000000000b2', 'late guest'),
  ('00000000-0000-0000-0000-0000000000b3', 'steady') on conflict do nothing;
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000b3') on conflict do nothing;

create or replace function pg_temp.claim(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; raise notice 'ok  %', what; end $$;
create or replace function pg_temp.fails(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return true; end $$;
-- one outing of n pitches, as the page sends it
create or replace function pg_temp.post(d date, outcome text, n int, score int) returns json language sql as $$
  select shutdoor_submit(d, 1, 'std-2025-ws7-yamamoto',
    (select jsonb_agg(jsonb_build_object('type', 'FF', 'cell', 12, 'r', 7)) from generate_series(1, n)),
    outcome, n, score, 50, 'Josh Hader',
    (select jsonb_agg('green'::text) from generate_series(1, n)))
$$;
-- the board can only be checked on rows this test wrote: today's and yesterday's are its own
delete from public.shutdoor_outings where day >= shutdoor_today() - 3;
delete from public.shutdoor_streaks where user_id::text like '00000000-0000-0000-0000-0000000000b%';

\i supabase/159_shut_the_door_boards.sql
select pg_temp.claim(true, 'running 159 again is safe');

-- 1. the streak does not depend on the order posts arrive in
set test.uid = '00000000-0000-0000-0000-0000000000b2';
-- a door shut two days ago (written as the server kept it then; a post that far back is closed now)
insert into shutdoor_outings (user_id, day, daily_number, scenario_id, calls, outcome, pitches, score, percentile, strip)
  values ('00000000-0000-0000-0000-0000000000b2', shutdoor_today() - 2, 1, 'std-2025-ws7-yamamoto',
          '[{"type":"FF","cell":12}]', 'door_shut', 1, 800, 50, '["green"]');
select pg_temp.claim((pg_temp.post(shutdoor_today(), 'door_shut', 9, 800)->>'streak')::int = 1,
  'today, with yesterday missing: a streak of 1');
-- yesterday's arrives late (a guest who signed in after midnight, or a second phone)
select pg_temp.claim((pg_temp.post(shutdoor_today() - 1, 'door_shut', 9, 800)->>'streak')::int = 3,
  'yesterday''s, posted after today''s, fills the gap: three in a row, not a reset to 1');
select pg_temp.claim((shutdoor_my_stats()->>'streak')::int = 3 and (shutdoor_my_stats()->>'best')::int = 3, 'my stats read the same three');
select pg_temp.claim((shutdoor_my_stats()->>'lastDay')::date = shutdoor_today(), 'the last day is still today');

set test.uid = '00000000-0000-0000-0000-0000000000b3';
select pg_temp.post(shutdoor_today() - 1, 'door_shut', 9, 700);
select pg_temp.claim((pg_temp.post(shutdoor_today(), 'tie_held', 9, 500)->>'streak')::int = 0, 'a held tie today ends it');
select pg_temp.claim((shutdoor_my_stats()->>'best')::int = 1, 'the best keeps the run it had');
-- an old best is never lowered by the count from the rows
update shutdoor_streaks set best = 9 where user_id = '00000000-0000-0000-0000-0000000000b3';
select pg_temp.claim((pg_temp.post(shutdoor_today() - 1, 'door_shut', 9, 900)->>'best')::int = 9, 'a repeat post keeps the best the server holds');

-- 2. two devices, one account: the first post stands, and the second learns which
set test.uid = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.claim(shutdoor_my_day(shutdoor_today()) is null, 'nothing kept yet: my_day is null');
select pg_temp.claim((pg_temp.post(shutdoor_today(), 'door_shut', 11, 870)->>'taken')::boolean, 'the first phone posts');
select pg_temp.claim((shutdoor_my_day(shutdoor_today())->>'score')::int = 870
  and jsonb_array_length((shutdoor_my_day(shutdoor_today())->'calls')::jsonb) = 11
  and shutdoor_my_day(shutdoor_today())->>'scenarioId' = 'std-2025-ws7-yamamoto',
  'my_day answers the kept outing, calls and all, so the second phone can replay it');
select pg_temp.claim((select (x->>'taken')::boolean = false and (x->>'keptScore')::int = 870 and x->>'keptOutcome' = 'door_shut'
                        from pg_temp.post(shutdoor_today(), 'walk_off', 6, 50) x),
  'the second phone''s post is not taken, and the reply says which outing counts');
select pg_temp.claim((select count(*) from shutdoor_board(shutdoor_today()) where username = 'two phones') = 1
  and (select score from shutdoor_board(shutdoor_today()) where username = 'two phones') = 870,
  'the board holds one row for the account, the first');

-- 3. the board: rank, ties, the caller's own row, and the day boundary
select pg_temp.claim((select string_agg(username || ':' || rank, ',' order by rank) from shutdoor_board(shutdoor_today()))
  = 'two phones:1,late guest:2,steady:3', 'today''s board ranks by score, then by who posted first');
select pg_temp.claim((select string_agg(username, ',' order by rank) from shutdoor_board(shutdoor_today() - 1)) = 'late guest,steady',
  'yesterday''s board is its own day');
select pg_temp.claim((pg_temp.post(shutdoor_today() - 1, 'door_shut', 9, 900)->>'rank')::int = 1,
  'a post for yesterday (one day either side is open) ranks on yesterday''s board');
select pg_temp.claim(pg_temp.fails($$select pg_temp.post(shutdoor_today() - 2, 'door_shut', 9, 900)$$), 'two days back is closed');

set test.uid = '';
select pg_temp.claim(shutdoor_my_day(shutdoor_today()) is null, 'signed out, my_day is null');
set role anon;
select pg_temp.claim(pg_temp.fails($$select shutdoor_my_day(current_date)$$), 'my_day is not granted to a guest');
select pg_temp.claim(pg_temp.fails($$select * from shutdoor_streak_of('00000000-0000-0000-0000-0000000000b1')$$), 'nobody calls the streak count directly');
reset role;
