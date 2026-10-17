-- Putt Putt lives taken back on a refund or a chargeback (152). Chain:
--   psql -d pbuy -f supabase/test/baseball_pro_base.sql      (auth.users, auth.uid() off test.uid, the roles)
--   psql -d pbuy -f supabase/138_putt_lives.sql
--   psql -d pbuy -f supabase/146_putt_lives_nine.sql
--   psql -d pbuy -f supabase/149_putt_lives_buy.sql
--   psql -d pbuy -f supabase/150_putt_lives_spares.sql
--   psql -d pbuy -f supabase/151_putt_lives_extra.sql
--   psql -d pbuy -f supabase/152_putt_lives_refund.sql
--   psql -d pbuy -f supabase/152_putt_lives_refund.sql            (twice: it is safe to re-run)
--   psql -d pbuy -f supabase/test/putt_lives_refund_test.sql
\set ON_ERROR_STOP on
create table if not exists public.profiles (id uuid primary key, username text);
insert into auth.users values ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000b3'), ('00000000-0000-0000-0000-0000000000b4') on conflict do nothing;

create or replace function pg_temp.claim(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; raise notice 'ok  %', what; end $$;
create or replace function pg_temp.extra(u text) returns int language sql as $$
  select extra from public.putt_lives where user_id = u::uuid $$;

delete from public.putt_lives where user_id::text like '00000000-0000-0000-0000-0000000000b%';
delete from public.putt_lives_buys where session_id like 'cs_r_%';

-- BOUGHT AT FULL, REFUNDED UNPLAYED: the three extras go, the hearts stay full
set test.uid = '00000000-0000-0000-0000-0000000000b1';
select putt_lives_state(9);
select putt_lives_buy('cs_r_one', '00000000-0000-0000-0000-0000000000b1', 3);
select pg_temp.claim((select lives from putt_lives_state(9)) = 12, 'bought three at full: twelve');
select pg_temp.claim(putt_lives_reclaim('cs_r_one') = 3, 'the refund takes three');
select pg_temp.claim((select lives from putt_lives_state(9)) = 9 and pg_temp.extra('00000000-0000-0000-0000-0000000000b1') = 0, 'back to nine, no extras');
select pg_temp.claim((select back_at from putt_lives_state(9)) = '{}', 'and no clock, because only extras went');
select pg_temp.claim(putt_lives_reclaim('cs_r_one') = 0 and (select lives from putt_lives_state(9)) = 9, 'a second refund event takes nothing');
select pg_temp.claim((select reclaimed = 3 and reclaimed_at is not null from putt_lives_buys where session_id = 'cs_r_one'), 'filed as three taken');

-- ONE EXTRA PLAYED: the two left go, then one heart, on its 24 hour clock
set test.uid = '00000000-0000-0000-0000-0000000000b2';
select putt_lives_state(9);
select putt_lives_buy('cs_r_two', '00000000-0000-0000-0000-0000000000b2', 3);
select putt_lives_spend(9);
select pg_temp.claim((select lives from putt_lives_state(9)) = 11, 'one extra played: eleven');
select pg_temp.claim(putt_lives_reclaim('cs_r_two') = 3, 'the refund still takes three');
select pg_temp.claim((select lives from putt_lives_state(9)) = 8, 'two extras and a heart: eight');
select pg_temp.claim((select refill_at from putt_lives_state(9)) > now() + interval '23 hours', 'the heart comes back in 24 hours, like a lost life');

-- BOUGHT WHILE DOWN: the lives filled hearts, so hearts go back on clocks
set test.uid = '00000000-0000-0000-0000-0000000000b3';
select putt_lives_spend(9) from generate_series(1, 9);
select putt_lives_buy('cs_r_three', '00000000-0000-0000-0000-0000000000b3', 3);
select pg_temp.claim((select lives from putt_lives_state(9)) = 3, 'out of lives, three bought: three');
select pg_temp.claim(putt_lives_reclaim('cs_r_three') = 3 and (select lives from putt_lives_state(9)) = 0, 'refunded: back to nought');
select pg_temp.claim(array_length((select back_at from putt_lives_state(9)), 1) = 9, 'nine clocks again');

-- NEVER BELOW NOUGHT: two of the three already played and nothing else held
select putt_lives_buy('cs_r_four', '00000000-0000-0000-0000-0000000000b3', 3);
select putt_lives_spend(9) from generate_series(1, 2);
select pg_temp.claim(putt_lives_reclaim('cs_r_four') = 1 and (select lives from putt_lives_state(9)) = 0, 'only the one still held is taken');
select pg_temp.claim(array_length((select back_at from putt_lives_state(9)), 1) = 9, 'and no clock past the max');

-- A CLOCK THAT RAN OUT SINCE THE LAST ASK is a heart held, and can be taken
set test.uid = '00000000-0000-0000-0000-0000000000b4';
select putt_lives_spend(9) from generate_series(1, 9);
select putt_lives_buy('cs_r_five', '00000000-0000-0000-0000-0000000000b4', 3);
update putt_lives set back_at = array_cat(array[now() - interval '1 minute'], back_at[2:]) where user_id = '00000000-0000-0000-0000-0000000000b4';
select pg_temp.claim(putt_lives_reclaim('cs_r_five') = 3, 'three taken, one from a clock that had run out');
select pg_temp.claim((select lives from putt_lives_state(9)) = 1, 'the life that came back on its own is kept');

-- A SESSION NEVER FILED
select pg_temp.claim(putt_lives_reclaim('cs_r_never') is null, 'a session never filed answers null');

-- NOBODY BUT THE WEBHOOK
select pg_temp.claim(not has_function_privilege('authenticated', 'public.putt_lives_reclaim(text)', 'execute'), 'a signed in player cannot call it');
select pg_temp.claim(not has_function_privilege('anon', 'public.putt_lives_reclaim(text)', 'execute'), 'nor can a guest');
select pg_temp.claim(has_function_privilege('service_role', 'public.putt_lives_reclaim(text)', 'execute'), 'the webhook (service_role) can');
