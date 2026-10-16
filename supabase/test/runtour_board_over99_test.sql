-- The season board keeps an overall past 99 (147). Chain:
--   psql -d board -f supabase/test/baseball_pro_base.sql      (auth.users, auth.uid() off test.uid, the roles)
--   psql -d board -f supabase/test/runtour_board_over99_test.sql
-- The board's table is older than this repo, so the columns 39 writes are made here, with the
-- 99 check an old table might carry.
\set ON_ERROR_STOP on
create table if not exists public.profiles (id uuid primary key, username text);
insert into public.profiles values ('00000000-0000-0000-0000-00000000000a', 'someone') on conflict do nothing;
drop table if exists public.runtour_scores;
create table public.runtour_scores (
  id bigserial primary key, user_id uuid, display_name text, golfer_name text, career_id text,
  ovr int check (ovr between 40 and 99), year int, season_earnings bigint, season_net bigint,
  wins int, majors int, skills jsonb, rep_pts int, is_guest boolean default false);

create or replace function pg_temp.claim(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; raise notice 'ok  %', what; end $$;
-- the row a submit wrote, read in its own snapshot (the calling statement's cannot see it)
create or replace function pg_temp.row_of(p_id bigint) returns public.runtour_scores language plpgsql volatile as $$
declare r public.runtour_scores; begin select * into r from public.runtour_scores where id = p_id; return r; end $$;

\i supabase/39_runtour_launch_hardening.sql
set test.uid = '00000000-0000-0000-0000-00000000000a';
select pg_temp.claim((pg_temp.row_of(runtour_submit_season('G', 102, 3, 1000, 900))).ovr = 99,
  'before 147: a 102 is stored as 99');

\i supabase/147_runtour_board_over99.sql
select pg_temp.claim((pg_temp.row_of(runtour_submit_season('G', 102, 3, 1000, 900))).ovr = 102,
  'a 102 is stored as 102');
select pg_temp.claim((pg_temp.row_of(runtour_submit_season_guest(104, 3, 1000, 900))).ovr = 104,
  'a guest 104 is stored as 104');
select pg_temp.claim((pg_temp.row_of(runtour_submit_season('G', 140, 3, 1000, 900))).ovr = 112,
  'a forged 140 is held to 112, the page''s own ceiling');
select pg_temp.claim((pg_temp.row_of(runtour_submit_season('G', 10, 3, 1000, 900))).ovr = 40,
  'the floor is still 40');
select pg_temp.claim((pg_temp.row_of(runtour_submit_season('G', 102, 3, 999999999999, 0))).season_earnings = 204000000,
  'the earnings cap is still 2,000,000 a point');
select pg_temp.claim((pg_temp.row_of(runtour_submit_season('G', 99, 3, 999999999999, 0))).season_earnings = 198000000,
  'and unchanged for a 99');
\i supabase/147_runtour_board_over99.sql
select pg_temp.claim((pg_temp.row_of(runtour_submit_season('G', 103, 3, 1000, 900))).ovr = 103,
  'running 147 again changes nothing');
select pg_temp.claim((select count(*) from pg_constraint where conrelid = 'public.runtour_scores'::regclass and contype = 'c') = 1,
  'one check on ovr, 40 to 112');
