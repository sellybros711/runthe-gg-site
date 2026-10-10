-- Putt Putt lives, on server time. Chain:
--   psql -d putt -f supabase/test/baseball_pro_base.sql      (auth.users, auth.uid() off test.uid, the roles)
--   psql -d putt -f supabase/138_putt_lives.sql
--   psql -d putt -f supabase/test/putt_lives_test.sql
\set ON_ERROR_STOP on
create table if not exists public.profiles (id uuid primary key, username text);
insert into public.profiles values
  ('00000000-0000-0000-0000-00000000000a', 'someone'),
  ('00000000-0000-0000-0000-00000000000b', 'CSEL8') on conflict do nothing;
delete from public.putt_lives;

create or replace function pg_temp.claim(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; raise notice 'ok  %', what; end $$;

set test.uid = '00000000-0000-0000-0000-00000000000a';
-- a first read seeds the row from the lives the browser already had, never a fresh three
select pg_temp.claim((select lives from putt_lives_state(3, 1)) = 1, 'the first read keeps the lives the player had');
select pg_temp.claim((select lives from putt_lives_state(3, 3)) = 1, 'a later read cannot raise them by claiming more');
select pg_temp.claim((select lives from putt_lives_spend(3)) = 0, 'spending takes one');
select pg_temp.claim((select refill_at from putt_lives_state(3)) > now() + interval '23 hours', 'the last life starts a 24 hour clock on the server');
select pg_temp.claim((select lives from putt_lives_spend(3)) = 0, 'lives never go below nought');
update putt_lives set refill_at = now() + interval '5 hours';
select putt_lives_spend(3);
select pg_temp.claim((select refill_at from putt_lives) < now() + interval '6 hours', 'a running clock is never restarted');
update putt_lives set refill_at = now() - interval '1 second';
select pg_temp.claim((select lives from putt_lives_state(3)) = 3, 'the lives fill when the clock runs out');
select pg_temp.claim((select refill_at from putt_lives_state(3)) is null, 'and the clock is cleared');
select pg_temp.claim((select max_lives from putt_lives_state(99)) = 3, 'a max that is not 3 or 6 is read as 3');
do $$ declare refused boolean := false; begin
  begin perform putt_lives_refill(3); exception when others then refused := true; end;
  perform pg_temp.claim(refused, 'a free refill is refused to an account that is not a tester'); end $$;

set test.uid = '00000000-0000-0000-0000-00000000000b';
select pg_temp.claim((select lives from putt_lives_state(6)) = 6, 'a new account with a pass starts on 6');
select putt_lives_spend(6);
select pg_temp.claim((select lives from putt_lives_refill(6)) = 6, 'a tester refills');

set test.uid = '';
do $$ declare refused boolean := false; begin
  begin perform putt_lives_state(3); exception when others then refused := true; end;
  perform pg_temp.claim(refused, 'signed out has no lives here'); end $$;
do $$ declare refused boolean := false; begin
  set local role authenticated;
  begin perform 1 from public.putt_lives; exception when others then refused := true; end;
  perform pg_temp.claim(refused, 'a browser cannot read the table directly'); end $$;
select 'all good';
