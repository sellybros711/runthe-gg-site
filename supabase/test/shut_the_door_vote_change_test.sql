-- Shut The Door's vote can be changed until it closes (180). Chain, after 178 and its test:
--   psql -d std -f supabase/180_shut_the_door_vote_change.sql
--   psql -d std -f supabase/180_shut_the_door_vote_change.sql   (twice: it is safe to rerun)
--   psql -d std -f supabase/test/shut_the_door_vote_change_test.sql
-- The candidates are read from shutdoor_vote_candidates (163's test holds them to modes.js).
\set ON_ERROR_STOP on
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000c1'), ('00000000-0000-0000-0000-0000000000c2')
  on conflict do nothing;

create or replace function pg_temp.claim(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; raise notice 'ok  %', what; end $$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $$
begin execute q; return null; exception when others then return sqlerrm; end $$;

-- the test sets the Eastern day (test.today), as 160's and 164's tests do; put back at the end
create or replace function public.shutdoor_today() returns date
language sql stable as $$ select coalesce(nullif(current_setting('test.today', true), '')::date,
                                          (now() at time zone 'America/New_York')::date) $$;
delete from public.shutdoor_votes;
delete from public.shutdoor_vote_days;
set test.today = '2026-11-10';
create temporary table cand as select shutdoor_vote_candidates(date '2026-11-11') as c;

-- signed out: no vote, no change
set test.uid = '';
select pg_temp.claim((shutdoor_vote(date '2026-11-11')->>'why') = 'sign in to vote'
  and not (shutdoor_vote(date '2026-11-11')->>'canVote')::boolean
  and not (shutdoor_vote(date '2026-11-11')->>'canChange')::boolean, 'signed out: no vote and nothing to change');

-- signed in, not voted: a first vote is open, there is nothing to change yet
set test.uid = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.claim((shutdoor_vote(date '2026-11-11')->>'canVote')::boolean
  and not (shutdoor_vote(date '2026-11-11')->>'canChange')::boolean, 'before a vote: canVote, not canChange');

-- the first vote: B
select pg_temp.claim((shutdoor_vote_cast(date '2026-11-11', (select c[2] from cand))->'votes'->>'b')::int = 1, 'the first vote counts: B 1');
select pg_temp.claim(not (shutdoor_vote(date '2026-11-11')->>'canVote')::boolean
  and (shutdoor_vote(date '2026-11-11')->>'canChange')::boolean
  and shutdoor_vote(date '2026-11-11')->>'why' = 'you voted', 'after a vote: canChange, canVote off, why stays you voted');

-- a second player votes B too
set test.uid = '00000000-0000-0000-0000-0000000000c2';
select shutdoor_vote_cast(date '2026-11-11', (select c[2] from cand));

-- the first player changes to A: the vote moves, the total stays 2
set test.uid = '00000000-0000-0000-0000-0000000000c1';
create temporary table moved as select shutdoor_vote_cast(date '2026-11-11', (select c[1] from cand)) as v;
select pg_temp.claim((select v->>'myVote' from moved) = (select c[1] from cand), 'a change: my vote is now A');
select pg_temp.claim((select (v->'votes'->>'a')::int from moved) = 1 and (select (v->'votes'->>'b')::int from moved) = 1,
  'a change moves the vote: A 1, B 1');
select pg_temp.claim((select count(*) from shutdoor_votes where day = date '2026-11-11') = 2, 'still one row per account: two rows');
select pg_temp.claim((select count(*) from shutdoor_votes where day = date '2026-11-11'
  and user_id = '00000000-0000-0000-0000-0000000000c1') = 1, 'the changer has one row');

-- the same candidate again changes nothing
select shutdoor_vote_cast(date '2026-11-11', (select c[1] from cand));
select pg_temp.claim((shutdoor_vote(date '2026-11-11')->'votes'->>'a')::int = 1
  and (shutdoor_vote(date '2026-11-11')->'votes'->>'b')::int = 1, 'the same pick twice: still A 1, B 1');

-- and back again: still one vote
select pg_temp.claim((shutdoor_vote_cast(date '2026-11-11', (select c[2] from cand))->'votes'->>'b')::int = 2
  and (shutdoor_vote(date '2026-11-11')->'votes'->>'a')::int = 0, 'changed back: A 0, B 2');
select pg_temp.claim(pg_temp.err($$select shutdoor_vote_cast(date '2026-11-11', 'not-a-pack')$$) = 'not a candidate',
  'a change to a pack that is not a candidate is refused');
select pg_temp.claim((shutdoor_vote(date '2026-11-11')->>'myVote') = (select c[2] from cand), 'the refused change left the vote on B');

-- the cutoff: once 2026-11-11 begins, the vote is closed to a change and the lock holds
set test.today = '2026-11-11';
select pg_temp.claim(pg_temp.err($$select shutdoor_vote_cast(date '2026-11-11', (select c[1] from cand))$$) = 'voting is closed',
  'a change after the vote closes is refused');
select pg_temp.claim(not (shutdoor_vote(date '2026-11-11')->>'canChange')::boolean
  and (shutdoor_vote(date '2026-11-11')->>'why') = 'voting is closed', 'closed: canChange off');
select pg_temp.claim(shutdoor_vote_lock(date '2026-11-11') = (select c[2] from cand), 'the lock counts the moved votes: B wins 2 to 0');
select pg_temp.claim((select votes_a = 0 and votes_b = 2 from shutdoor_vote_days where day = date '2026-11-11'), 'the lock stored A 0, B 2');

-- a day with no vote carries canChange too
select pg_temp.claim(not (shutdoor_vote(date '2026-01-01')->>'canChange')::boolean, 'no vote for that day: canChange false');

-- clean up the votes this test stored, and put the clock back
delete from public.shutdoor_votes;
delete from public.shutdoor_vote_days;
reset test.today;
reset test.uid;
create or replace function public.shutdoor_today() returns date
language sql stable as $$ select (now() at time zone 'America/New_York')::date $$;
