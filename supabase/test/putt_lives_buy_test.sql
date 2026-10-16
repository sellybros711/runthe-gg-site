-- Putt Putt lives bought with real money (149). Chain:
--   psql -d pbuy -f supabase/test/baseball_pro_base.sql      (auth.users, auth.uid() off test.uid, the roles)
--   psql -d pbuy -f supabase/138_putt_lives.sql
--   psql -d pbuy -f supabase/146_putt_lives_nine.sql
--   psql -d pbuy -f supabase/149_putt_lives_buy.sql
--   psql -d pbuy -f supabase/149_putt_lives_buy.sql            (twice: it is safe to re-run)
--   psql -d pbuy -f supabase/test/putt_lives_buy_test.sql
\set ON_ERROR_STOP on
create table if not exists public.profiles (id uuid primary key, username text);
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c'), ('00000000-0000-0000-0000-00000000000d') on conflict do nothing;

create or replace function pg_temp.claim(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; raise notice 'ok  %', what; end $$;

delete from public.putt_lives;
delete from public.putt_lives_buys;

-- OUT OF LIVES, on nine
set test.uid = '00000000-0000-0000-0000-00000000000a';
select putt_lives_spend(9) from generate_series(1, 9);
select pg_temp.claim((select lives from putt_lives_state(9)) = 0, 'a player who spends nine is out');
select pg_temp.claim(putt_lives_buy('cs_test_one', '00000000-0000-0000-0000-00000000000a', 9), 'a new session is filed');
select pg_temp.claim((select lives from putt_lives_state(9)) = 9, 'and all nine are back');
select pg_temp.claim((select back_at from putt_lives_state(9)) = '{}', 'with no clock left running');
select pg_temp.claim((select refill_at from putt_lives_state(9)) is null, 'so the page shows no clock');
select pg_temp.claim(not putt_lives_buy('cs_test_one', '00000000-0000-0000-0000-00000000000a', 9), 'Stripe delivering it again is refused');
select pg_temp.claim((select count(*) from putt_lives_buys) = 1, 'and filed once');
select putt_lives_spend(9);
select pg_temp.claim(not putt_lives_buy('cs_test_one', '00000000-0000-0000-0000-00000000000a', 9)
  and (select lives from putt_lives_state(9)) = 8, 'a retry after play gives nothing back');

-- A TOUR PASS: eighteen, out of all of them. Nine back keeps the nine due soonest.
set test.uid = '00000000-0000-0000-0000-00000000000b';
select putt_lives_spend(18) from generate_series(1, 18);
update putt_lives set back_at = (select array_agg(now() + make_interval(hours => g) order by g) from generate_series(1, 18) g)
 where user_id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.claim((select lives from putt_lives_state(18)) = 0, 'a pass holder who spends eighteen is out');
select putt_lives_buy('cs_test_two', '00000000-0000-0000-0000-00000000000b', 9);
select pg_temp.claim((select lives from putt_lives_state(18)) = 9, 'nine of eighteen are back');
select pg_temp.claim((select refill_at from putt_lives_state(18)) < now() + interval '90 minutes',
  'and the next life is still the one that was due first');
select pg_temp.claim((select max(b) from putt_lives, unnest(back_at) b where user_id = '00000000-0000-0000-0000-00000000000b') < now() + interval '10 hours',
  'the clocks it cancelled were the last ones due');

-- A CLOCK THAT RAN OUT while checkout was open: only what is still owed is cancelled
set test.uid = '00000000-0000-0000-0000-00000000000c';
select putt_lives_spend(9) from generate_series(1, 9);
update putt_lives set back_at = array_cat(array_fill(now() - interval '1 minute', array[3]), array_fill(now() + interval '5 hours', array[6]))
 where user_id = '00000000-0000-0000-0000-00000000000c';
select putt_lives_buy('cs_test_three', '00000000-0000-0000-0000-00000000000c', 9);
select pg_temp.claim((select lives from putt_lives_state(9)) = 9, 'three came back on their own, the buy gives the other six');
select pg_temp.claim((select given from putt_lives_buys where session_id = 'cs_test_three') = 6, 'and records that it gave six');

-- NO ROW YET: a buy for an account the server has not seen makes a full one
select putt_lives_buy('cs_test_four', '00000000-0000-0000-0000-00000000000d', 9);
set test.uid = '00000000-0000-0000-0000-00000000000d';
select pg_temp.claim((select lives from putt_lives_state(9)) = 9, 'an account with no row ends on nine');

-- NOBODY BUT THE WEBHOOK
select pg_temp.claim(not has_function_privilege('authenticated', 'public.putt_lives_buy(text, uuid, int)', 'execute'), 'a signed in player cannot call the writer');
select pg_temp.claim(not has_function_privilege('anon', 'public.putt_lives_buy(text, uuid, int)', 'execute'), 'nor can a guest');
select pg_temp.claim(not has_table_privilege('authenticated', 'public.putt_lives_buys', 'select'), 'nor read the ledger');
select pg_temp.claim(not has_table_privilege('authenticated', 'public.putt_lives_buys', 'insert'), 'nor write to it');
