-- Putt Putt nine lives, each on its own clock (146). Chain:
--   psql -d putt -f supabase/test/baseball_pro_base.sql      (auth.users, auth.uid() off test.uid, the roles)
--   psql -d putt -f supabase/138_putt_lives.sql
--   (rows from 138 are made here, then)
--   psql -d putt -f supabase/146_putt_lives_nine.sql
--   psql -d putt -f supabase/test/putt_lives_nine_test.sql
\set ON_ERROR_STOP on
create table if not exists public.profiles (id uuid primary key, username text);
insert into public.profiles values
  ('00000000-0000-0000-0000-00000000000a', 'someone'),
  ('00000000-0000-0000-0000-00000000000b', 'CSEL8') on conflict do nothing;

create or replace function pg_temp.claim(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; raise notice 'ok  %', what; end $$;

-- THE ONE TIME MOVE, checked on the rows 138 left behind (made by the runner before 146)
select pg_temp.claim((select lives from putt_lives where user_id = '00000000-0000-0000-0000-0000000000c1') = 3,
  'a 138 row with one life left becomes one full heart');
select pg_temp.claim((select array_length(back_at, 1) from putt_lives where user_id = '00000000-0000-0000-0000-0000000000c1') = 6,
  'and the six it no longer has are on clocks');
select pg_temp.claim((select bool_and(b > now() + interval '23 hours') from putt_lives, unnest(back_at) b where user_id = '00000000-0000-0000-0000-0000000000c1'),
  'lives lost before, with no clock running, come back 24 hours from the move');
select pg_temp.claim((select lives from putt_lives where user_id = '00000000-0000-0000-0000-0000000000c2') = 0
  and (select bool_and(b < now() + interval '6 hours') from putt_lives, unnest(back_at) b where user_id = '00000000-0000-0000-0000-0000000000c2'),
  'a 138 row waiting on its clock gets every life back when that clock ends, no later');
select pg_temp.claim((select lives from putt_lives where user_id = '00000000-0000-0000-0000-0000000000c3') = 9
  and (select back_at from putt_lives where user_id = '00000000-0000-0000-0000-0000000000c3') = '{}',
  'a full 138 row is a full nine');
select pg_temp.claim((select bool_and(nine) from putt_lives), 'every row is marked moved');
\i supabase/146_putt_lives_nine.sql
select pg_temp.claim((select lives from putt_lives where user_id = '00000000-0000-0000-0000-0000000000c1') = 3,
  'running 146 again changes nothing');

delete from public.putt_lives;
set test.uid = '00000000-0000-0000-0000-00000000000a';
select pg_temp.claim((select lives from putt_lives_state(9)) = 9, 'a new account starts on nine');
select pg_temp.claim((select max_lives from putt_lives_state(9)) = 9, 'nine is the max');
select pg_temp.claim((select lives from putt_lives_spend(9)) = 8, 'spending takes one');
select pg_temp.claim((select refill_at from putt_lives_state(9)) > now() + interval '23 hours', 'and starts that life''s 24 hour clock at once, the first life lost');
select putt_lives_spend(9); select putt_lives_spend(9);
select pg_temp.claim((select array_length(back_at, 1) from putt_lives_state(9)) = 3, 'each lost life has a clock of its own');
-- the first life lost is due back: only it returns
update putt_lives set back_at = array[now() - interval '1 second', now() + interval '5 hours', now() + interval '6 hours'];
select pg_temp.claim((select lives from putt_lives_state(9)) = 7, 'a life comes back when its own clock ends, and only that one');
select pg_temp.claim((select refill_at from putt_lives_state(9)) < now() + interval '5 hours 1 minute', 'and the clock shown is the next one back');
-- lives never go below nought, and a spend at nought starts no clock
update putt_lives set back_at = (select array_agg(now() + interval '1 hour') from generate_series(1, 9));
select pg_temp.claim((select lives from putt_lives_spend(9)) = 0, 'lives never go below nought');
select pg_temp.claim((select array_length(back_at, 1) from putt_lives) = 9, 'and a spend at nought adds no clock');
-- a device clock cannot help: only now() on the server counts
select pg_temp.claim((select lives from putt_lives_state(9, 9)) = 0, 'a later read cannot raise them by claiming more');
-- an old page asks with 3: read as nine
select pg_temp.claim((select max_lives from putt_lives_state(3)) = 9, 'an old page asking for 3 is read as nine');
select pg_temp.claim((select max_lives from putt_lives_state(99)) = 9, 'a max that is not 9 or 18 is read as nine');
do $$ declare refused boolean := false; begin
  begin perform putt_lives_refill(9); exception when others then refused := true; end;
  perform pg_temp.claim(refused, 'a free refill is refused to an account that is not a tester'); end $$;

set test.uid = '00000000-0000-0000-0000-00000000000b';
select pg_temp.claim((select lives from putt_lives_state(18)) = 18, 'a new account with a pass starts on eighteen, six hearts');
select pg_temp.claim((select max_lives from putt_lives_state(6)) = 18, 'an old page asking for 6 is read as eighteen');
select putt_lives_spend(18);
select pg_temp.claim((select lives from putt_lives_state(18)) = 17, 'a pass holder spends one of eighteen');
select pg_temp.claim((select lives from putt_lives_state(9)) = 8, 'a pass that lapses holds them to nine, less the lives on clocks');
select pg_temp.claim((select lives from putt_lives_refill(18)) = 18, 'a tester refills');
select pg_temp.claim((select back_at from putt_lives_state(18)) = '{}', 'and the clocks are cleared');

set test.uid = '';
do $$ declare refused boolean := false; begin
  begin perform putt_lives_state(9); exception when others then refused := true; end;
  perform pg_temp.claim(refused, 'a signed out caller is refused'); end $$;

select pg_temp.claim(not has_table_privilege('authenticated', 'public.putt_lives', 'select'), 'the table is not readable directly');
select pg_temp.claim(not has_table_privilege('authenticated', 'public.putt_lives', 'update'), 'nor writable directly');
\echo 'putt_lives_nine_test: all good'
