-- ---------------------------------------------------------------------------
-- The checks for 104_commish_free_clock.sql. See commish_clock_base.sql for how
-- to run it. Every line this prints should start with " ok ".
--
-- WHAT IS WORTH TESTING HERE is not that a cooldown counts down. It is the four
-- ways a meter like this is normally wrong:
--
--   it charges the customer who paid to not be charged
--   it hands back hours somebody did not come and claim, so waiting banks turns
--   two taps in the same second both get through
--   one account can read, or move, another account's clock
--
-- Every one of those is silent in a browser and loud here.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\pset pager off
\pset footer off

create or replace function ok(lbl text, got text, want text) returns void
  language plpgsql as $$
begin
  raise notice '%  %  got=% want=%',
    case when got is not distinct from want then ' ok  ' else 'FAIL ' end, lbl, got, want;
end $$;

create or replace function throws(lbl text, sql text) returns void
  language plpgsql as $$
begin
  execute sql;
  raise notice 'FAIL  % was accepted and should not have been', lbl;
exception when others then
  raise notice ' ok   % is refused: %', lbl, sqlerrm;
end $$;

-- A clean slate, so the file runs twice.
delete from commish_free_clock;
delete from premium_unlocks;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== a free account plays, and then waits ==='
-- ---------------------------------------------------------------------------
select be(1);
-- THE FIRST SEASON IS FREE AND IT FALLS OUT OF HAVING NO ROW. Nothing special
-- cases it, which is why it is worth asserting: a later refactor that creates
-- the row up front would take the first season away and nothing else would fail.
select ok('a new account is not locked',
  (select locked::text from commish_clock_state()), 'false');
select ok('and is not pro',
  (select pro::text from commish_clock_state()), 'false');
select ok('and has no deadline to show',
  (select coalesce(next_at::text,'null') from commish_clock_state()), 'null');

select ok('spending the first season is allowed',
  (select ok::text from commish_clock_spend()), 'true');
select ok('it is now locked',
  (select locked::text from commish_clock_state()), 'true');
select ok('one season is counted',
  (select seasons::text from commish_clock_state()), '1');
-- Within a minute of a full day, which is as tight as this can be without
-- pinning now(), and loose enough not to flake on a slow box.
select ok('the wait is 24 hours',
  (select (abs(extract(epoch from (next_at - now())) - 86400) < 60)::text
     from commish_clock_state()), 'true');

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== the wall holds ==='
-- ---------------------------------------------------------------------------
select ok('a second season the same minute is refused',
  (select ok::text from commish_clock_spend()), 'false');
select ok('and the refusal did not count a season',
  (select seasons::text from commish_clock_state()), '1');
-- A REFUSED SPEND MUST NOT PUSH THE DEADLINE OUT. Otherwise somebody tapping the
-- locked button is punished for tapping it, and the wait never ends while they
-- are looking at it. This is the bug that makes a meter feel broken.
select ok('and did not move the deadline',
  (select (abs(extract(epoch from (next_at - now())) - 86400) < 60)::text
     from commish_clock_state()), 'true');

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== the day passes ==='
-- ---------------------------------------------------------------------------
-- Rather than wait a day, wind the clock back. This is the only place the test
-- touches the table directly, and it is standing in for time.
update commish_free_clock set next_at = now() - interval '1 minute'
 where user_id = who(1);
select ok('the clock has run out',
  (select locked::text from commish_clock_state()), 'false');
select ok('the next season is allowed',
  (select ok::text from commish_clock_spend()), 'true');
select ok('and it is counted',
  (select seasons::text from commish_clock_state()), '2');

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== waiting longer does not bank seasons ==='
-- ---------------------------------------------------------------------------
-- THE BUG THIS EXISTS FOR is adding the interval to the OLD deadline instead of
-- to now(). Do that and somebody who stays away for three days comes back owed
-- three seasons, and the cooldown has quietly become a balance. Wind three days
-- past the deadline and check that one spend still costs a full day.
update commish_free_clock set next_at = now() - interval '3 days'
 where user_id = who(1);
select ok('one season is allowed after a long absence',
  (select ok::text from commish_clock_spend()), 'true');
select ok('and the wait is a full day again, not three',
  (select (abs(extract(epoch from (next_at - now())) - 86400) < 60)::text
     from commish_clock_state()), 'true');
select ok('and the second one is refused',
  (select ok::text from commish_clock_spend()), 'false');

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== an account that paid is never metered ==='
-- ---------------------------------------------------------------------------
select be(2);
insert into premium_unlocks (user_id, product, source)
values (who(2), 'cfb_premium', 'perfect-season');
select ok('it reads as pro',
  (select pro::text from commish_clock_state()), 'true');
select ok('and is never locked',
  (select locked::text from commish_clock_state()), 'false');
select ok('spending is always allowed',
  (select ok::text from commish_clock_spend()), 'true');
select ok('and again, immediately',
  (select ok::text from commish_clock_spend()), 'true');
-- NO ROW AT ALL, which is the point rather than a detail. A paying account whose
-- clock had been ticking behind the paid tier would find it waiting for them the
-- day a card expired, having never played a season under it.
select ok('and nothing was written for them',
  (select count(*)::text from commish_free_clock
    where user_id = who(2)), '0');

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== buying mid wait clears it, with nothing to reset ==='
-- ---------------------------------------------------------------------------
-- The free account from earlier is still locked. Give it the row and it should
-- be unmetered on the very next call, because every function asks
-- premium_unlocks rather than reading a flag off the clock.
select be(1);
select ok('still locked before buying',
  (select locked::text from commish_clock_state()), 'true');
insert into premium_unlocks (user_id, product, source)
values (who(1), 'cfb_premium', 'perfect-season');
select ok('buying unlocks it at once',
  (select locked::text from commish_clock_state()), 'false');
select ok('and it reads as pro',
  (select pro::text from commish_clock_state()), 'true');
select ok('and play is allowed',
  (select ok::text from commish_clock_spend()), 'true');
-- AND THE OLD ROW IS LEFT ALONE rather than deleted. If the product ever lapses
-- the honest thing is the clock they actually had, not a fresh one: deleting on
-- purchase would make a refund into a free season.
select ok('the old clock is still on file',
  (select count(*)::text from commish_free_clock
    where user_id = who(1)), '1');
delete from premium_unlocks
 where user_id = who(1);
select ok('and it comes back if the product goes',
  (select locked::text from commish_clock_state()), 'true');

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== an expired product does not pay for anything ==='
-- ---------------------------------------------------------------------------
select be(2);
update premium_unlocks set expires_at = now() - interval '1 day'
 where user_id = who(2);
select ok('a lapsed unlock is not pro',
  (select pro::text from commish_clock_state()), 'false');
update premium_unlocks set expires_at = null
 where user_id = who(2);

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== a guest ==='
-- ---------------------------------------------------------------------------
select be(null);
-- The state call has to answer rather than throw, so a screen can be drawn
-- before anybody has signed in.
select ok('state answers for a guest',
  (select locked::text from commish_clock_state()), 'false');
-- Spending is a write and needs an account. The mode is behind the account wall
-- anyway, so this is the second lock on a door that already has one.
select throws('a guest spending', 'select * from commish_clock_spend()');
select throws('a guest finishing a term', 'select * from commish_term_done()');

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== a free account gets one contract, and one only ==='
-- ---------------------------------------------------------------------------
-- THE OTHER HALF OF THE FREE TIER. The clock paces a term at one season a day;
-- this ends the career after it. What is bought is the renewal.
select be(3);
select ok('a new account has no terms behind it',
  (select terms::text from commish_clock_state()), '0');
select ok('finishing one counts it',
  (select terms::text from commish_term_done()), '1');
select ok('and the state agrees',
  (select terms::text from commish_clock_state()), '1');
-- A TERM THAT ENDED BADLY STILL SPENDS IT. Removed in year two is a finished
-- contract, and so is walking away. Anything else makes quitting a free reroll.
select ok('a second finish counts again rather than being ignored',
  (select terms::text from commish_term_done()), '2');
-- Finishing a term does not itself cost a day: the season that ended it already
-- did. So somebody who finishes a term is not also locked out of the game.
update commish_free_clock set next_at = now() - interval '1 minute'
 where user_id = who(3);
select ok('and finishing does not start a wait of its own',
  (select locked::text from commish_clock_state()), 'false');

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== a paying account has no contract limit ==='
-- ---------------------------------------------------------------------------
select be(4);
insert into premium_unlocks (user_id, product, source)
values (who(4), 'cfb_premium', 'perfect-season');
select ok('finishing a term reads as pro',
  (select pro::text from commish_term_done()), 'true');
select ok('and counts nothing',
  (select terms::text from commish_term_done()), '0');
select ok('and wrote no row',
  (select count(*)::text from commish_free_clock where user_id = who(4)), '0');
select ok('the state reports no terms either',
  (select terms::text from commish_clock_state()), '0');

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== one account cannot see or move another one ==='
-- ---------------------------------------------------------------------------
-- The functions are security definer, so the protection that matters is that
-- they key on auth.uid() and never on anything passed in. There is no argument
-- to pass, which is the strongest version of that, and this is what says so.
select ok('the spend takes no arguments',
  (select count(*)::text from pg_proc where proname = 'commish_clock_spend'
     and pronargs = 0), '1');
select ok('and neither does the state',
  (select count(*)::text from pg_proc where proname = 'commish_clock_state'
     and pronargs = 0), '1');
select ok('nor the term counter',
  (select count(*)::text from pg_proc where proname = 'commish_term_done'
     and pronargs = 0), '1');
-- RLS on the table itself, for anything that reads it directly.
select ok('the table has row level security on',
  (select relrowsecurity::text from pg_class where relname = 'commish_free_clock'), 'true');
select ok('and exactly one policy, a select',
  (select count(*)::text from pg_policies where tablename = 'commish_free_clock'), '1');
select ok('with no write policy at all',
  (select count(*)::text from pg_policies where tablename = 'commish_free_clock'
     and cmd <> 'SELECT'), '0');

\echo ''
