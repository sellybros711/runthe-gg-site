-- The Putt Putt Daily Hole board (148). Chain:
--   psql -d putt -f supabase/test/baseball_pro_base.sql      (auth.users, auth.uid() off test.uid, the roles)
--   psql -d putt -f supabase/148_putt_daily_board.sql
--   psql -d putt -f supabase/test/putt_daily_board_test.sql
\set ON_ERROR_STOP on
create table if not exists public.profiles (id uuid primary key, username text);
insert into public.profiles values
  ('00000000-0000-0000-0000-0000000000d1', 'ace'),
  ('00000000-0000-0000-0000-0000000000d2', 'birdie'),
  ('00000000-0000-0000-0000-0000000000d3', 'slow') on conflict do nothing;
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000d1'), ('00000000-0000-0000-0000-0000000000d2'), ('00000000-0000-0000-0000-0000000000d3') on conflict do nothing;

create or replace function pg_temp.claim(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; raise notice 'ok  %', what; end $$;
create or replace function pg_temp.fails(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return true; end $$;

delete from public.putt_daily;
\i supabase/148_putt_daily_board.sql
select pg_temp.claim(true, 'running 148 twice is safe');

set test.uid = '';
select pg_temp.claim(pg_temp.fails($$select putt_daily_submit((now() at time zone 'utc')::date, 3, 3, 9000)$$), 'a guest cannot post');

set test.uid = '00000000-0000-0000-0000-0000000000d1';
select pg_temp.claim(putt_daily_submit((now() at time zone 'utc')::date, 2, 3, 12000, '{"skin":"m"}'::jsonb), 'a signed in round posts');
select pg_temp.claim(not putt_daily_submit((now() at time zone 'utc')::date, 1, 3, 5000), 'a second round the same day is ignored');
select pg_temp.claim((select strokes from putt_daily where user_id = '00000000-0000-0000-0000-0000000000d1') = 2, 'the first round stands');
select pg_temp.claim(pg_temp.fails($$select putt_daily_submit((now() at time zone 'utc')::date - 5, 2, 3, 9000)$$), 'a day long past cannot be posted');
select pg_temp.claim(pg_temp.fails($$select putt_daily_submit((now() at time zone 'utc')::date, 0, 3, 9000)$$), 'nought strokes is refused');
select pg_temp.claim(pg_temp.fails($$select putt_daily_submit((now() at time zone 'utc')::date, 3, 3, 50)$$), 'a time no round can take is refused');

set test.uid = '00000000-0000-0000-0000-0000000000d2';
select putt_daily_submit((now() at time zone 'utc')::date, 2, 3, 9000);
set test.uid = '00000000-0000-0000-0000-0000000000d3';
select putt_daily_submit((now() at time zone 'utc')::date, 4, 3, 30000);
select pg_temp.claim((select string_agg(username, ',' order by rank) from putt_daily_board((now() at time zone 'utc')::date)) = 'birdie,ace,slow',
  'fewest strokes first, and the clock breaks a tie');
select pg_temp.claim((select mine from putt_daily_board((now() at time zone 'utc')::date) where username = 'slow'), 'the caller''s own row is marked');
select pg_temp.claim((select count(*) from putt_daily_board((now() at time zone 'utc')::date, 1)) = 2, 'a short board still carries the caller''s row');
select pg_temp.claim((select players from putt_daily_board((now() at time zone 'utc')::date) limit 1) = 3, 'and says how many played');
select pg_temp.claim((select look->>'skin' from putt_daily_board((now() at time zone 'utc')::date) where username = 'ace') = 'm', 'the golfer''s look is kept with the round');
