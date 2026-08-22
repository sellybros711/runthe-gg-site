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
select mkuser('sellybros') as a \gset
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
select ok('the owner can set it', (select status from ideas where id=:i1), 'planned');
select throws('a status that is not one', format($$select ideas_set_status(%s,'maybe')$$, :i1));

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
