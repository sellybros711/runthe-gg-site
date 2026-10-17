-- Putt Putt spare lives fill the hearts (150). Chain:
--   psql -d pspare -f supabase/test/baseball_pro_base.sql     (auth.users, auth.uid() off test.uid, the roles)
--   psql -d pspare -f supabase/138_putt_lives.sql
--   psql -d pspare -f supabase/146_putt_lives_nine.sql
--   psql -d pspare -f supabase/149_putt_lives_buy.sql
--   psql -d pspare -f supabase/150_putt_lives_spares.sql
--   psql -d pspare -f supabase/150_putt_lives_spares.sql      (twice: it is safe to re-run)
--   psql -d pspare -f supabase/test/putt_lives_spare_test.sql
\set ON_ERROR_STOP on
create table if not exists public.profiles (id uuid primary key, username text);
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c'), ('00000000-0000-0000-0000-00000000000d') on conflict do nothing;

create or replace function pg_temp.claim(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; raise notice 'ok  %', what; end $$;

delete from public.putt_lives;
delete from public.putt_lives_spares;

-- HEARTS FULL: the spare is kept, nothing is filed
set test.uid = '00000000-0000-0000-0000-00000000000a';
select pg_temp.claim((select not used and lives = 9 from putt_lives_spare(9, 'life:12')), 'with the hearts full a spare is not used');
select pg_temp.claim((select count(*) from putt_lives_spares) = 0, 'and nothing is filed');

-- BELOW THE MAX: the spare fills a heart and cancels the clock due back last
select putt_lives_spend(9) from generate_series(1, 3);
update putt_lives set back_at = array[now() + interval '1 hour', now() + interval '2 hours', now() + interval '3 hours']
 where user_id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.claim((select used and lives = 7 from putt_lives_spare(9, 'life:12')), 'six left and a spare makes seven');
select pg_temp.claim((select max(b) from putt_lives, unnest(back_at) b where user_id = '00000000-0000-0000-0000-00000000000a') < now() + interval '150 minutes',
  'the clock it cancelled was the last one due');
select pg_temp.claim((select refill_at from putt_lives_state(9)) < now() + interval '70 minutes', 'and the next life is still the one due first');

-- THE SAME SPARE TWICE (a second device that holds it too): used, and nothing given
select pg_temp.claim((select used and lives = 7 from putt_lives_spare(9, 'life:12')), 'the same spare again gives nothing');
select pg_temp.claim((select count(*) from putt_lives_spares where user_id = '00000000-0000-0000-0000-00000000000a') = 1, 'and is filed once');
select pg_temp.claim((select used and lives = 8 from putt_lives_spare(9, 'life:40')), 'another spare fills the next heart');
select pg_temp.claim((select used and lives = 9 from putt_lives_spare(9, 'life:41')), 'and a third fills them');
select pg_temp.claim((select not used and lives = 9 from putt_lives_spare(9, 'life:42')), 'a fourth waits for a lost life');
select pg_temp.claim((select back_at = '{}' and refill_at is null from putt_lives_state(9)), 'with no clock left running');

-- A LIFE LOST WITH A SPARE HELD: it fills the gap straight away
select putt_lives_spend(9);
select pg_temp.claim((select used and lives = 9 from putt_lives_spare(9, 'life:42')), 'a lost life is filled by the spare that waited');

-- OUT OF LIVES: a spare gives one back, and the clocks still due come back as they would have
set test.uid = '00000000-0000-0000-0000-00000000000b';
select putt_lives_spend(9) from generate_series(1, 9);
update putt_lives set back_at = (select array_agg(now() + make_interval(hours => g) order by g) from generate_series(1, 9) g)
 where user_id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.claim((select used and lives = 1 from putt_lives_spare(9, 'life:7')), 'out of lives, a spare gives one back');
select pg_temp.claim((select refill_at from putt_lives_state(9)) < now() + interval '70 minutes', 'the next life still comes back first');
select pg_temp.claim((select max(b) from putt_lives, unnest(back_at) b where user_id = '00000000-0000-0000-0000-00000000000b') < now() + interval '9 hours',
  'and the one due last is the one it cancelled');

-- A BUY AFTERWARDS still sees the right number missing: eight, and a nine-pack hands back eight
select pg_temp.claim(putt_lives_buy('cs_test_spare', '00000000-0000-0000-0000-00000000000b', 9), 'a buy after a spare is filed');
select pg_temp.claim((select given from putt_lives_buys where session_id = 'cs_test_spare') = 8, 'and gives the eight that were missing');
select pg_temp.claim((select lives from putt_lives_state(9)) = 9, 'back to nine, never past it');

-- A TOUR PASS: eighteen is the max
set test.uid = '00000000-0000-0000-0000-00000000000c';
select putt_lives_spend(18) from generate_series(1, 10);
select pg_temp.claim((select used and lives = 9 and max_lives = 18 from putt_lives_spare(18, 'life:7')), 'a pass holder with eight of eighteen fills to nine');
select pg_temp.claim((select count(*) from putt_lives_spares where spare_id = 'life:7') = 2, 'one spare id is each account''s own');

-- NO ROW YET: the first call makes a full row and keeps the spare
set test.uid = '00000000-0000-0000-0000-00000000000d';
select pg_temp.claim((select not used and lives = 9 from putt_lives_spare(9, 'life:3')), 'an account with no row is full, and keeps the spare');

-- WHAT IT REFUSES
create or replace function pg_temp.refused(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return true; end $$;
select pg_temp.claim(pg_temp.refused($q$ select * from putt_lives_spare(9, 'life:1234') $q$), 'an id past the pattern is refused');
select pg_temp.claim(pg_temp.refused($q$ select * from putt_lives_spare(9, 'coins:5') $q$), 'so is anything that is not a spare');
select pg_temp.claim(pg_temp.refused($q$ select * from putt_lives_spare(9, null) $q$), 'and no id at all');
set test.uid = '';
select pg_temp.claim(pg_temp.refused($q$ select * from putt_lives_spare(9, 'life:5') $q$), 'a guest has no server lives to fill');
select pg_temp.claim(has_function_privilege('authenticated', 'public.putt_lives_spare(int, text)', 'execute'), 'a signed in player may call it');
select pg_temp.claim(not has_function_privilege('anon', 'public.putt_lives_spare(int, text)', 'execute'), 'a guest may not');
select pg_temp.claim(not has_table_privilege('authenticated', 'public.putt_lives_spares', 'select'), 'nor read the ledger');
select pg_temp.claim(not has_table_privilege('authenticated', 'public.putt_lives_spares', 'insert'), 'nor write to it');
