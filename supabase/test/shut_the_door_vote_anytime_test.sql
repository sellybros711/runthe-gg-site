-- Shut The Door's vote without playing today (164). Chain, after 163 and its test:
--   psql -d std -f supabase/164_shut_the_door_vote_anytime.sql
--   psql -d std -f supabase/164_shut_the_door_vote_anytime.sql   (twice: it is safe to rerun)
--   psql -d std -f supabase/test/shut_the_door_vote_anytime_test.sql
-- The candidates are read from shutdoor_vote_candidates (163's test holds them to modes.js).
\set ON_ERROR_STOP on
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000b2')
  on conflict do nothing;

create or replace function pg_temp.claim(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; raise notice 'ok  %', what; end $$;
create or replace function pg_temp.fails(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return true; end $$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $$
begin execute q; return null; exception when others then return sqlerrm; end $$;

-- the test sets the Eastern day (test.today), as 160's and 163's tests do; put back at the end
create or replace function public.shutdoor_today() returns date
language sql stable as $$ select coalesce(nullif(current_setting('test.today', true), '')::date,
                                          (now() at time zone 'America/New_York')::date) $$;
delete from public.shutdoor_votes;
delete from public.shutdoor_vote_days;
set test.today = '2026-11-10';
create temporary table cand as select shutdoor_vote_candidates(date '2026-11-11') as c;

-- nobody here has a row in shutdoor_outings for today
select pg_temp.claim(not exists (select 1 from shutdoor_outings o where o.day = date '2026-11-10'
  and o.user_id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2')), 'the two voters have not played today');

-- signed out: the two, no vote, and the reason
set test.uid = '';
select pg_temp.claim((shutdoor_vote(date '2026-11-11')->>'why') = 'sign in to vote'
  and not (shutdoor_vote(date '2026-11-11')->>'canVote')::boolean, 'signed out: no vote, sign in to vote');
select pg_temp.claim(pg_temp.err($$select shutdoor_vote_cast(date '2026-11-11', (select c[1] from cand))$$) = 'sign in to vote',
  'signed out: a cast is refused');

-- signed in, not played today: the vote is open and a cast counts
set test.uid = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.claim((shutdoor_vote(date '2026-11-11')->>'canVote')::boolean
  and shutdoor_vote(date '2026-11-11')->>'why' is null, 'signed in without today''s daily: the vote is open');
select pg_temp.claim(pg_temp.fails($$select shutdoor_vote_cast(date '2026-11-11', 'not-a-pack')$$), 'a pack that is not a candidate is refused');
select pg_temp.claim(pg_temp.err($$select shutdoor_vote_cast(date '2026-11-12', (select c[1] from cand))$$) = 'voting is closed',
  'only tomorrow: the day after is refused');
select pg_temp.claim(pg_temp.err($$select shutdoor_vote_cast(date '2026-11-10', (select c[1] from cand))$$) = 'voting is closed',
  'only tomorrow: today is refused');
select pg_temp.claim((shutdoor_vote_cast(date '2026-11-11', (select c[2] from cand))->'votes'->>'b')::int = 1,
  'a vote without playing counts: B 1');
select pg_temp.claim((shutdoor_vote_cast(date '2026-11-11', (select c[1] from cand))->>'myVote') = (select c[2] from cand),
  'one vote an account: the first stands');
select pg_temp.claim((shutdoor_vote(date '2026-11-11')->>'why') = 'you voted'
  and not (shutdoor_vote(date '2026-11-11')->>'canVote')::boolean, 'after the vote: you voted, no second');
select pg_temp.claim((select count(*) from shutdoor_votes where day = date '2026-11-11') = 1, 'one row for the account');

-- a second player who has not played votes A
set test.uid = '00000000-0000-0000-0000-0000000000b2';
select pg_temp.claim((shutdoor_vote_cast(date '2026-11-11', (select c[1] from cand))->'votes'->>'a')::int = 1, 'a second voter counts: A 1');

-- the lock is unchanged: a tie is A
set test.today = '2026-11-11';
select pg_temp.claim(shutdoor_vote_lock(date '2026-11-11') = (select c[1] from cand), 'a tie at the lock is A, as before');

-- clean up the votes this test stored, and put the clock back
delete from public.shutdoor_votes;
delete from public.shutdoor_vote_days;
reset test.today;
reset test.uid;
create or replace function public.shutdoor_today() returns date
language sql stable as $$ select (now() at time zone 'America/New_York')::date $$;
