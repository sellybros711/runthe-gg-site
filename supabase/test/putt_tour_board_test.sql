-- The Putt Putt Tour board (166). Chain:
--   createdb tour
--   psql -d tour -f supabase/test/ps_saves_base.sql
--   psql -d tour -f supabase/103_cloud_saves.sql
--   psql -d tour -f supabase/143_ps_save_put_fix.sql
--   psql -d tour -c "create table public.profiles (id uuid primary key, username text)"
--   psql -d tour -f supabase/148_putt_daily_board.sql
--   psql -d tour -f supabase/166_putt_tour_board.sql
--   psql -d tour -f supabase/test/putt_tour_board_test.sql
\set ON_ERROR_STOP on
insert into auth.users values ('33333333-3333-3333-3333-333333333333'), ('44444444-4444-4444-4444-444444444444') on conflict do nothing;
insert into public.profiles values
  ('11111111-1111-1111-1111-111111111111', 'leader'),
  ('22222222-2222-2222-2222-222222222222', 'chaser'),
  ('33333333-3333-3333-3333-333333333333', 'broken'),
  ('44444444-4444-4444-4444-444444444444', 'nostars') on conflict do nothing;

create or replace function pg_temp.claim(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; raise notice 'ok  %', what; end $$;

\i supabase/166_putt_tour_board.sql
select pg_temp.claim(true, 'running 166 twice is safe');

delete from public.ps_saves; delete from public.putt_daily;
set test.uid = '11111111-1111-1111-1111-111111111111';
select ok from ps_save_put('putt', 'tour', '{"v":2,"tours":{},"card":{"v":1,"lv":40,"levels":252,"stars":90,"starsMax":756,"world":"Pirate Cove","look":{"polo":"navy"}}}'::jsonb, 50);
insert into putt_daily (day, user_id, strokes, par, ms) values ((now() at time zone 'utc')::date, '11111111-1111-1111-1111-111111111111', 3, 3, 9000);
set test.uid = '22222222-2222-2222-2222-222222222222';
select ok from ps_save_put('putt', 'tour', '{"v":2,"tours":{},"card":{"v":1,"lv":45,"levels":252,"stars":90,"starsMax":756,"world":"Pirate Cove"}}'::jsonb, 50);
-- a card a page could write to break the board: strings where numbers go, a huge number
set test.uid = '33333333-3333-3333-3333-333333333333';
select ok from ps_save_put('putt', 'tour', '{"v":2,"tours":{},"card":{"v":1,"lv":"abc","stars":"lots","starsMax":"x","levels":1e40,"world":{"a":1}}}'::jsonb, 50);
set test.uid = '44444444-4444-4444-4444-444444444444';
select ok from ps_save_put('putt', 'tour', '{"v":2,"tours":{},"card":{"v":1,"lv":1,"levels":252,"stars":0,"starsMax":756}}'::jsonb, 5);

set test.uid = '';
select pg_temp.claim((select count(*) from putt_tour_board(10)) = 2, 'only cards with stars are ranked, and a broken card is left off');
select pg_temp.claim((select username from putt_tour_board(10) where rank = 1) = 'chaser', 'level breaks a tie on stars');
select pg_temp.claim((select stars = 90 and stars_max = 756 and lv = 40 and levels = 252 and world = 'Pirate Cove' from putt_tour_board(10) where username = 'leader'), 'the row carries the card''s numbers');
select pg_temp.claim((select look->>'polo' = 'navy' and not (card ? 'look') from putt_tour_board(10) where username = 'leader'), 'the look draws the golfer and is not repeated in the card');
select pg_temp.claim((select board_days from putt_tour_board(10) where username = 'leader') = 1, 'the Daily Holes posted are counted');
select pg_temp.claim((select players from putt_tour_board(10) limit 1) = 2, 'players counts the ranked cards');
select pg_temp.claim((select count(*) from putt_tour_board(1)) = 1, 'the limit holds');
set test.uid = '11111111-1111-1111-1111-111111111111';
select pg_temp.claim((select count(*) from putt_tour_board(1)) = 2 and (select mine from putt_tour_board(1) where username = 'leader'), 'the caller''s own row comes back past the limit, marked mine');
select pg_temp.claim(has_function_privilege('anon', 'public.putt_tour_board(int)', 'execute'), 'a guest can read the board');
