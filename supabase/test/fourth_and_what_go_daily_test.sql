-- 4th and What's daily Go For It run (169). Chain:
--   psql -d faw -f supabase/test/baseball_pro_base.sql   (auth.users, auth.uid() off test.uid, the roles)
--   psql -d faw -c "create table if not exists public.profiles (id uuid primary key, username text)"
--   psql -d faw -f supabase/162_fourth_and_what_daily.sql
--   psql -d faw -f supabase/169_fourth_and_what_go_daily.sql
--   psql -d faw -f supabase/169_fourth_and_what_go_daily.sql   (twice: it is safe to rerun)
--   psql -d faw -f supabase/test/fourth_and_what_go_daily_test.sql
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
-- a run of n snaps with c converted
create or replace function pg_temp.log(n int) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('seed', g, 'callKey', 'cover1', 'win', true, 'yards', 4)), '[]'::jsonb) from generate_series(1, n) g
$$;

delete from public.faw_go_daily;
\i supabase/169_fourth_and_what_go_daily.sql
select pg_temp.claim(true, 'running 169 again is safe');

set test.uid = '';
select pg_temp.claim(pg_temp.fails($$select faw_go_submit(faw_today(), 3, 40, 0, 6, pg_temp.log(6))$$), 'a guest cannot post');
select pg_temp.claim((select count(*) from faw_go_board(faw_today(), 10)) = 0, 'an empty day has an empty board');

set test.uid = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.claim((faw_go_submit(faw_today(), 3, 40, 0, 6, pg_temp.log(6))->>'taken')::boolean, 'the first run posts');
select pg_temp.claim((faw_go_submit(faw_today(), 9, 140, 1, 12, pg_temp.log(12))->>'taken')::boolean = false, 'a second run the same day is ignored');
select pg_temp.claim((faw_go_submit(faw_today(), 9, 140, 1, 12, pg_temp.log(12))->>'converted')::int = 3, 'and the first one is what it answers');
select pg_temp.claim(pg_temp.fails($$select faw_go_submit(faw_today() + 3, 3, 40, 0, 6, pg_temp.log(6))$$), 'a day that is not open is refused');
select pg_temp.claim(pg_temp.fails($$select faw_go_submit(faw_today(), 6, 40, 0, 6, pg_temp.log(6))$$), 'a run converts fewer than it snaps (it ends on a stop)');
select pg_temp.claim(pg_temp.fails($$select faw_go_submit(faw_today(), 3, 40, 4, 6, pg_temp.log(6))$$), 'no more touchdowns than conversions');
select pg_temp.claim(pg_temp.fails($$select faw_go_submit(faw_today(), 3, 40, 0, 6, pg_temp.log(5))$$), 'the log has one row a snap');
select pg_temp.claim(pg_temp.fails($$select faw_go_submit(faw_today(), 3, 40, 0, 6, '{}'::jsonb)$$), 'the log is a list');

set test.uid = '00000000-0000-0000-0000-0000000000f2';
select pg_temp.claim((faw_go_submit(faw_today(), 5, 61, 1, 8, pg_temp.log(8))->>'rank')::int = 1, 'more conversions rank first');
set test.uid = '00000000-0000-0000-0000-0000000000f3';
select pg_temp.claim((faw_go_submit(faw_today(), 3, 55, 0, 6, pg_temp.log(6))->>'rank')::int = 2, 'then more yards');

set test.uid = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.claim((select string_agg(username || ':' || converted, ',' order by rank) from faw_go_board(faw_today(), 10)) = 'reid:5,Coach:3,payton:3', 'the board: conversions, yards, then names from profiles');
select pg_temp.claim((select mine from faw_go_board(faw_today(), 1) where username = 'payton'), 'the caller''s own row is on the board past the limit');
select pg_temp.claim((select count(*) from faw_go_board(faw_today(), 1)) = 2, 'the limit holds, plus the caller');
select pg_temp.claim((select players from faw_go_board(faw_today(), 10) limit 1) = 3, 'it counts the players');

do $$ begin raise notice 'fourth_and_what_go_daily_test: all ok'; end $$;
