-- 4th and What's daily 4th down (162). Chain:
--   psql -d faw -f supabase/test/baseball_pro_base.sql   (auth.users, auth.uid() off test.uid, the roles)
--   psql -d faw -c "create table if not exists public.profiles (id uuid primary key, username text)"
--   psql -d faw -f supabase/162_fourth_and_what_daily.sql
--   psql -d faw -f supabase/162_fourth_and_what_daily.sql   (twice: it is safe to rerun)
--   psql -d faw -f supabase/test/fourth_and_what_daily_test.sql
\set ON_ERROR_STOP on
create table if not exists public.profiles (id uuid primary key, username text);
insert into public.profiles values
  ('00000000-0000-0000-0000-0000000000f1', 'payton'),
  ('00000000-0000-0000-0000-0000000000f2', 'reid') on conflict do nothing;
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000f1'), ('00000000-0000-0000-0000-0000000000f2'),
  ('00000000-0000-0000-0000-0000000000f3') on conflict do nothing;

create or replace function pg_temp.claim(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; raise notice 'ok  %', what; end $$;
create or replace function pg_temp.fails(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return true; end $$;
create or replace function pg_temp.post(d date, conv boolean, y int) returns json language sql as $$
  select faw_daily_submit(d, 1, '2017_21_PHI_NE-1234', conv, y, 'cover1', 12345,
    '{"formation":"gun3x1","routes":[],"blocks":[],"handoff":{"to":"RB","path":[[2,4]]},"targets":[]}'::jsonb)
$$;

delete from public.faw_daily;
delete from public.faw_daily_streaks;
\i supabase/162_fourth_and_what_daily.sql
select pg_temp.claim(true, 'running 162 again is safe');

set test.uid = '';
select pg_temp.claim(pg_temp.fails($$select pg_temp.post(faw_today(), true, 4)$$), 'a guest cannot post');
select pg_temp.claim(faw_daily_my_stats() is null, 'a guest has no stats');

set test.uid = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.claim((pg_temp.post(faw_today() - 1, false, 0)->>'streak')::int = 1, 'playing starts a streak, made or not');
select pg_temp.claim((pg_temp.post(faw_today(), true, 6)->>'streak')::int = 2, 'the next day makes it two');
select pg_temp.claim((pg_temp.post(faw_today(), false, -3)->>'taken')::boolean = false, 'a second post the same day is ignored');
select pg_temp.claim((pg_temp.post(faw_today(), false, -3)->>'converted')::boolean = true, 'and the first one is what it answers');
select pg_temp.claim(pg_temp.fails($$select pg_temp.post(faw_today() + 3, true, 4)$$), 'a day that is not open is refused');
select pg_temp.claim(pg_temp.fails($$select faw_daily_submit(faw_today(), 1, 'x', true, 400, 'cover1', 1, '{}'::jsonb)$$), 'yards past the field are refused');
select pg_temp.claim(pg_temp.fails($$select faw_daily_submit(faw_today(), 1, 'x', true, 4, 'cover1', 1, '[]'::jsonb)$$), 'a drawn play has to be a play');
select pg_temp.claim((faw_daily_my_stats()->>'played')::int = 2 and (faw_daily_my_stats()->>'converted')::int = 1, 'my record: two played, one made');
select pg_temp.claim((faw_daily_my_stats()->'today'->>'yards')::int = 6, 'today''s kept snap comes back for a second device');

set test.uid = '00000000-0000-0000-0000-0000000000f2';
select pg_temp.claim((pg_temp.post(faw_today(), false, 2)->>'players')::int = 2, 'the day counts both players');
select pg_temp.claim((faw_daily_day(faw_today())->>'converted')::int = 1, 'and one of them converted');
select pg_temp.claim((select username from faw_daily_board(faw_today()) where rank = 1) = 'payton', 'the board puts the conversion first');
select pg_temp.claim((select mine from faw_daily_board(faw_today()) where rank = 2), 'and marks my row');

set test.uid = '00000000-0000-0000-0000-0000000000f3';
select pg_temp.claim((pg_temp.post(faw_today(), true, 1)->>'taken')::boolean, 'a player with no profile still posts');
select pg_temp.claim((select username from faw_daily_board(faw_today()) where mine) = 'Coach', 'and shows as Coach');

-- a missed day reads as no streak
update public.faw_daily_streaks set last_day = faw_today() - 3 where user_id = '00000000-0000-0000-0000-0000000000f1';
set test.uid = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.claim((faw_daily_my_stats()->>'streak')::int = 0 and (faw_daily_my_stats()->>'best')::int = 2, 'a missed day ends the streak, the best stays');

select 'fourth_and_what_daily_test: all ok' as result;
