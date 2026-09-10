-- ---------------------------------------------------------------------------
-- The checks for 92_ideas_board.sql. See ideas_base.sql for how to run it.
-- Every line this prints should start with " ok ".
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
-- Run a scalar query and HAND BACK THE ERROR INSTEAD OF RAISING IT. The switched-role
-- checks at the bottom of this file are checks about permission, so "permission denied"
-- is a result to report, not a crash: ON_ERROR_STOP would otherwise take the whole file
-- down on the first one and print nothing about the rest.
create or replace function q(sql text) returns text
  language plpgsql as $$
declare v text;
begin
  execute sql into v;
  return coalesce(v, '(null)');
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;

create or replace function throws(lbl text, sql text) returns void
  language plpgsql as $$
begin
  execute sql;
  raise notice 'FAIL  % was accepted and should not have been', lbl;
exception when others then
  raise notice ' ok   % is refused: %', lbl, sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- A CLEAN SLATE FIRST, so the file can be run twice. It could not: mkuser writes a
-- profile and username is unique, so the second run died on the first line of the first
-- test and reported a failure that was the harness rather than the schema.
-- ---------------------------------------------------------------------------
delete from idea_votes;
delete from ideas;
delete from profiles;
delete from auth.session;
delete from auth.users;

-- ---------------------------------------------------------------------------
-- three accounts
-- ---------------------------------------------------------------------------
-- :a is an ADMIN, per the list in ideas_set_status. If that list changes, this name
-- has to change with it, or the admin checks pass for the wrong reason.
select mkuser('malikwillislover') as a \gset
select mkuser('runnyj')    as b \gset
select mkuser('randomfan') as c \gset

-- ---------------------------------------------------------------------------
-- posting
-- ---------------------------------------------------------------------------
select become(:'c');
select ideas_post('nfl','Custom leagues with 8 to 12 friends','Draft against people you know.') as i1 \gset
select ok('an idea is posted',   (select title from ideas where id=:i1), 'Custom leagues with 8 to 12 friends');
select ok('and filed to its game',(select game  from ideas where id=:i1), 'nfl');
select ok('and opens as open',   (select status from ideas where id=:i1), 'open');

-- THE AUTHOR'S OWN VOTE IS CAST FOR THEM, which is what makes a fresh idea score 1
-- rather than 0 and rank above one nobody has looked at.
select ok('author voted for their own', (select (up_count-down_count)::text from ideas where id=:i1), '1');
select ok('and it is a real vote row',
  (select dir::text from idea_votes where idea_id=:i1 and user_id=:'c'::uuid), '1');

-- ---------------------------------------------------------------------------
-- what is refused
-- ---------------------------------------------------------------------------
select throws('a title of three characters', $$select ideas_post('nfl','abc','')$$);
select throws('a game that is not on the board', $$select ideas_post('quidditch','A real title here','')$$);
select throws('a body over 1000 characters',
  format($$select ideas_post('nfl','A real title here',%L)$$, repeat('x',1001)));
delete from auth.session;
select throws('posting signed out', $$select ideas_post('nfl','A real title here','')$$);

-- FIVE A DAY, and the sixth is refused. The five include the one posted above.
select become(:'c');
select ideas_post('nfl','Second idea from this account','') as _ \gset
select ideas_post('cfb','Third idea from this account','')  as _ \gset
select ideas_post('site','Fourth idea from this account','') as _ \gset
select ideas_post('nfl','Fifth idea from this account','')  as _ \gset
select throws('a sixth idea in 24 hours', $$select ideas_post('nfl','Sixth idea from this account','')$$);
-- and it is a ROLLING window, not a calendar day: age the five and the sixth lands.
update ideas set created_at = now() - interval '25 hours' where user_id = :'c'::uuid;
select ideas_post('nfl','Sixth idea, a day later','') as i6 \gset
select ok('the window rolls', (select title from ideas where id=:i6), 'Sixth idea, a day later');

-- ---------------------------------------------------------------------------
-- voting
-- ---------------------------------------------------------------------------
select become(:'a');
select ok('an upvote',        (select ideas_vote(:i1, 1)::text), '2');
select become(:'b');
select ok('a second upvote',  (select ideas_vote(:i1, 1)::text), '3');
select ok('one row per person',(select count(*)::text from idea_votes where idea_id=:i1), '3');

-- FLIPPING a vote moves it, it does not add one.
select ok('flipped to down',  (select ideas_vote(:i1,-1)::text), '1');
select ok('still one row for them',
  (select count(*)::text from idea_votes where idea_id=:i1 and user_id=:'b'::uuid), '1');
select ok('up and down counted apart',
  (select up_count||'/'||down_count from ideas where id=:i1), '2/1');

-- TAKING IT BACK. Zero is a real argument rather than something the client fakes by
-- clicking the same arrow twice.
select ok('vote withdrawn',   (select ideas_vote(:i1, 0)::text), '2');
select ok('and the row is gone',
  (select count(*)::text from idea_votes where idea_id=:i1 and user_id=:'b'::uuid), '0');

-- Voting the same way twice is idempotent, not a second vote.
select ok('voting up twice',  (select ideas_vote(:i1, 1)::text), '3');
select ok('voting up again',  (select ideas_vote(:i1, 1)::text), '3');

select throws('a vote of two',        format($$select ideas_vote(%s, 2)$$, :i1));
select throws('a vote on nothing',    $$select ideas_vote(999999, 1)$$);
delete from auth.session;
select throws('voting signed out',    format($$select ideas_vote(%s, 1)$$, :i1));

-- ---------------------------------------------------------------------------
-- status
-- ---------------------------------------------------------------------------
select become(:'c');
select throws('a stranger setting status', format($$select ideas_set_status(%s,'shipped')$$, :i1));
select become(:'a');
select ideas_set_status(:i1, 'planned');
select ok('an admin can set it', (select status from ideas where id=:i1), 'planned');
-- BOTH NAMES ON THE LIST, not just the first. The list had two entries before this and
-- only one of them was ever exercised, so a typo in the second would have passed.
select become(:'b');
select ideas_set_status(:i1, 'shipped');
select ok('and so can the other one', (select status from ideas where id=:i1), 'shipped');
select ideas_set_status(:i1, 'planned');
select throws('a status that is not one', format($$select ideas_set_status(%s,'maybe')$$, :i1));

-- THE NAME THAT USED TO BE ON THE LIST IS NOT ANY MORE. Without this the admin checks
-- above pass whatever the list says, as long as it contains :a.
select mkuser('sellybros') as old \gset
select become(:'old');
select throws('the previous admin name', format($$select ideas_set_status(%s,'shipped')$$, :i1));

-- ---------------------------------------------------------------------------
-- the read view
-- ---------------------------------------------------------------------------
select ok('the view carries the score',
  (select score::text from ideas_public where id=:i1), '3');
select ok('and the author name',
  (select author_name from ideas_public where id=:i1), 'randomfan');
select ok('and the author crest fields',
  (select author_color||'/'||author_initials from ideas_public where id=:i1), 'KC/RA');

-- HIDDEN LEAVES THE VIEW ENTIRELY, which is the whole moderation story.
update ideas set hidden = true where id = :i1;
select ok('a hidden idea is not in the view',
  (select count(*)::text from ideas_public where id=:i1), '0');
select throws('and cannot be voted on', format($$select ideas_vote(%s, 1)$$, :i1));
update ideas set hidden = false where id = :i1;

-- ---------------------------------------------------------------------------
-- the counters, and the repair
-- ---------------------------------------------------------------------------
-- Deleting a vote row directly is the drift this is guarding against; the trigger
-- catches that one, so break the counter itself and check the repair notices.
update ideas set up_count = 99, down_count = 42 where id = :i1;
select ok('a drifted counter is repaired', (select ideas_recount()::text), '1');
select ok('and the score is right again',
  (select (up_count-down_count)::text from ideas where id=:i1), '3');
select ok('a second recount changes nothing', (select ideas_recount()::text), '0');

-- Deleting the idea takes its votes with it.
select ok('votes exist before the delete',
  (select count(*)::text from idea_votes where idea_id=:i1), '3');
delete from ideas where id = :i1;
select ok('and are gone after it',
  (select count(*)::text from idea_votes where idea_id=:i1), '0');

-- ---------------------------------------------------------------------------
-- WHAT A BROWSER CAN ACTUALLY READ
--
-- Every check above this line ran as the owner of the database. That is what psql hands
-- you, and it is also what the Supabase SQL editor hands you, and that role bypasses
-- both table grants and row level security. So all of them passed on a board no visitor
-- could open: ideas_public is a security_invoker view, the base tables carried no grant
-- to anon or authenticated, and the live page said "Community Ideas is unavailable right
-- now" for as long as it was up. Sixty-three green lines and a dead board.
--
-- `set local role` is the only way to get the visitor's own privileges out of psql, and
-- it needs a transaction to be local to. The blocks roll back rather than commit, so a
-- write that is supposed to be refused cannot leave anything behind if it is not.
-- ---------------------------------------------------------------------------
select become(:'c');
select ideas_post('nfl','An idea the browser can open','Body text.') as i7 \gset
select ideas_post('nfl','An idea a moderator hid','') as i8 \gset
update ideas set hidden = true where id = :i8;
select become(:'b');
select ideas_vote(:i7, 1);

-- SIGNED OUT, which is every first visit: no session, and the anon role.
delete from auth.session;
begin;
set local role anon;
select ok('anon opens the board',
  q(format($$select title from ideas_public where id=%s$$, :i7)), 'An idea the browser can open');
select ok('anon reads the author off the join',
  q(format($$select author_name from ideas_public where id=%s$$, :i7)), 'randomfan');
select ok('anon is not shown a hidden idea',
  q(format($$select count(*)::text from ideas_public where id=%s$$, :i8)), '0');
-- The page reads this table directly, not through a view, to know which arrow to light.
-- Signed out there is nothing to light, and that is zero rows rather than an error.
select ok('anon reads the vote table and sees none',
  q($$select count(*)::text from idea_votes$$), '0');
-- THE GRANT IS NOT THE FENCE, the policy is. anon can read the ideas table directly now,
-- and what comes back is exactly what the policy allows: a hidden idea is missing from a
-- straight table read, not just from the view that filters it.
select ok('a hidden idea is gone from the table too',
  q(format($$select count(*)::text from ideas where id=%s$$, :i8)), '0');
select ok('no hidden idea is reachable at all',
  q($$select count(*)::text from ideas where hidden$$), '0');
select throws('anon posting', $$select ideas_post('nfl','A real title here','')$$);
select throws('anon writing a vote row by hand',
  format($$insert into idea_votes(idea_id,user_id,dir) values (%s, gen_random_uuid(), 1)$$, :i7));
rollback;

-- SIGNED IN: b, who voted for i7 above, and c, who did not.
select become(:'b');
begin;
set local role authenticated;
select ok('a signed in reader opens the board',
  q(format($$select title from ideas_public where id=%s$$, :i7)), 'An idea the browser can open');
select ok('and sees their own vote',
  q(format($$select dir::text from idea_votes where idea_id=%s$$, :i7)), '1');
select ok('and the score the view carries',
  q(format($$select score::text from ideas_public where id=%s$$, :i7)), '2');
select throws('editing an idea by hand',
  format($$update ideas set title='Mine now' where id=%s$$, :i7));
rollback;

select become(:'c');
begin;
set local role authenticated;
-- THE VOTE TABLE IS NOT A REGISTER OF WHO VOTED FOR WHAT. c posted i7, so c holds a vote
-- row on it, and b's row on the same idea is none of c's business.
select ok('somebody else votes and you cannot see it',
  q(format($$select count(*)::text from idea_votes where idea_id=%s$$, :i7)), '1');
select ok('the totals are public, the names are not',
  q(format($$select (up_count-down_count)::text from ideas_public where id=%s$$, :i7)), '2');
rollback;
