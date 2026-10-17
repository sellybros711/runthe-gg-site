-- Putt Putt lives bought over the max (151). Chain:
--   psql -d pbuy -f supabase/test/baseball_pro_base.sql      (auth.users, auth.uid() off test.uid, the roles)
--   psql -d pbuy -f supabase/138_putt_lives.sql
--   psql -d pbuy -f supabase/146_putt_lives_nine.sql
--   psql -d pbuy -f supabase/149_putt_lives_buy.sql
--   psql -d pbuy -f supabase/150_putt_lives_spares.sql
--   psql -d pbuy -f supabase/151_putt_lives_extra.sql
--   psql -d pbuy -f supabase/151_putt_lives_extra.sql            (twice: it is safe to re-run)
--   psql -d pbuy -f supabase/test/putt_lives_extra_test.sql
\set ON_ERROR_STOP on
create table if not exists public.profiles (id uuid primary key, username text);
insert into auth.users values ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000a3'), ('00000000-0000-0000-0000-0000000000a4') on conflict do nothing;

create or replace function pg_temp.claim(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; raise notice 'ok  %', what; end $$;
create or replace function pg_temp.extra(u text) returns int language sql as $$
  select extra from public.putt_lives where user_id = u::uuid $$;

delete from public.putt_lives where user_id::text like '00000000-0000-0000-0000-0000000000a%';
delete from public.putt_lives_buys where session_id like 'cs_x_%';

-- FULL, AND BUYS NINE MORE: eighteen, nine of them over the max
set test.uid = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.claim((select lives from putt_lives_state(9)) = 9, 'a new player starts on nine');
select pg_temp.claim(putt_lives_buy('cs_x_one', '00000000-0000-0000-0000-0000000000a1', 9), 'a buy at full is filed');
select pg_temp.claim((select lives from putt_lives_state(9)) = 18, 'and the player holds eighteen');
select pg_temp.claim(pg_temp.extra('00000000-0000-0000-0000-0000000000a1') = 9, 'nine of them over the max');
select pg_temp.claim((select given = 0 and to_extra = 9 from putt_lives_buys where session_id = 'cs_x_one'), 'filed as none off a clock, nine over');
select pg_temp.claim(not putt_lives_buy('cs_x_one', '00000000-0000-0000-0000-0000000000a1', 9)
  and (select lives from putt_lives_state(9)) = 18, 'Stripe delivering it again gives nothing');

-- A LOST LIFE COMES OUT OF THE EXTRAS, WITH NO CLOCK
select putt_lives_spend(9);
select pg_temp.claim((select lives from putt_lives_state(9)) = 17, 'a lost life leaves seventeen');
select pg_temp.claim((select back_at from putt_lives_state(9)) = '{}', 'and starts no clock');
select pg_temp.claim(pg_temp.extra('00000000-0000-0000-0000-0000000000a1') = 8, 'it came out of the extras');
select putt_lives_spend(9) from generate_series(1, 8);
select pg_temp.claim((select lives from putt_lives_state(9)) = 9 and pg_temp.extra('00000000-0000-0000-0000-0000000000a1') = 0
  and (select back_at from putt_lives_state(9)) = '{}', 'nine lost: the extras are gone, the hearts are full, no clock yet');
select putt_lives_spend(9);
select pg_temp.claim((select lives from putt_lives_state(9)) = 8 and array_length((select back_at from putt_lives_state(9)), 1) = 1,
  'the next one is a heart, on its 24 hour clock');

-- PART CLOCKS, PART OVER: missing three, buys nine. Three come off clocks, six go over.
set test.uid = '00000000-0000-0000-0000-0000000000a2';
select putt_lives_spend(9) from generate_series(1, 3);
select putt_lives_buy('cs_x_two', '00000000-0000-0000-0000-0000000000a2', 9);
select pg_temp.claim((select lives from putt_lives_state(9)) = 15, 'missing three, nine bought: fifteen');
select pg_temp.claim((select back_at from putt_lives_state(9)) = '{}', 'every clock cancelled');
select pg_temp.claim((select given = 3 and to_extra = 6 from putt_lives_buys where session_id = 'cs_x_two'), 'filed as three off clocks, six over');

-- STILL FIRST: a buy smaller than the clocks cancels the last ones and nothing goes over
set test.uid = '00000000-0000-0000-0000-0000000000a3';
select putt_lives_spend(9) from generate_series(1, 9);
select putt_lives_buy('cs_x_three', '00000000-0000-0000-0000-0000000000a3', 3);
select pg_temp.claim((select lives from putt_lives_state(9)) = 3 and pg_temp.extra('00000000-0000-0000-0000-0000000000a3') = 0,
  'out of lives, three bought: three, none over');

-- THE TOUR PASS MAX: eighteen hearts and the extras on top
set test.uid = '00000000-0000-0000-0000-0000000000a4';
select pg_temp.claim((select lives from putt_lives_state(18)) = 18, 'a pass holder starts on eighteen');
select putt_lives_buy('cs_x_four', '00000000-0000-0000-0000-0000000000a4', 3);
select pg_temp.claim((select lives from putt_lives_state(18)) = 21, 'three over a full eighteen is twenty-one');

-- THE CAP
update putt_lives set extra = 97 where user_id = '00000000-0000-0000-0000-0000000000a4';
select putt_lives_buy('cs_x_five', '00000000-0000-0000-0000-0000000000a4', 3);
select pg_temp.claim(pg_temp.extra('00000000-0000-0000-0000-0000000000a4') = 99, 'extras never pass 99 (the checkout refuses first)');

-- NOBODY BUT THE WEBHOOK, STILL
select pg_temp.claim(not has_function_privilege('authenticated', 'public.putt_lives_buy(text, uuid, int)', 'execute'), 'a signed in player cannot call the writer');
select pg_temp.claim(not has_function_privilege('anon', 'public.putt_lives_buy(text, uuid, int)', 'execute'), 'nor can a guest');
select pg_temp.claim(has_function_privilege('authenticated', 'public.putt_lives_spend(int)', 'execute')
  and not has_function_privilege('anon', 'public.putt_lives_spend(int)', 'execute'), 'spend is still for signed in players only');
select pg_temp.claim(has_function_privilege('service_role', 'public.putt_lives_buy(text, uuid, int)', 'execute'), 'the webhook (service_role) can call the writer');
