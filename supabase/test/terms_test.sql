-- ---------------------------------------------------------------------------
-- The checks for 96_commish_terms.sql. See terms_base.sql for how to run it.
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

delete from commish_terms;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== recording a term ==='
-- ---------------------------------------------------------------------------
select ok('a finished term records', (fin(1, 'purse-', 71) ->> 'recorded'), 'true');
select ok('  and comes back knowing where it stands',
  ((fin(2, 'purse-', 55) -> 'place')::text), '2');
select ok('  the better term being first',
  ((fin(3, 'purse-', 90) -> 'place')::text), '1');
select ok('  counting only its own doctrine',
  ((fin(4, 'gate+', 10) -> 'place')::text), '1');

-- THE AXES GO IN AND COME BACK IN THE ORDER doctrine.js PACKS THEM.
select ok('the four axes land in their own columns',
  (select purse || ',' || gate || ',' || stage || ',' || throne
     from commish_terms order by id limit 1), '10,20,30,40');

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== the split counts people, the board counts terms ==='
-- ---------------------------------------------------------------------------
-- THE POINT OF THE WHOLE FILE. One player replaying eleven times must not move the number
-- everybody else is measured against, and every term they played is still a real term.
delete from commish_terms;
select fin(1, 'purse-', 50);
select fin(1, 'purse-', 60);
select fin(1, 'purse-', 70);
select fin(2, 'gate+', 80);

select ok('one person who played four terms counts once in the split',
  (commish_doctrine_split() ->> 'total'), '2');
select ok('  under the doctrine of their LATEST term',
  ((commish_doctrine_split() -> 'counts') ->> 'purse-'), '1');
select ok('  while the board still holds every term they played',
  (select count(*)::text from commish_doctrine_board('purse-', 50)), '3');

-- And a change of heart moves the person rather than adding one.
select fin(1, 'stage+', 65);
select ok('somebody who came out differently moves in the split',
  (commish_doctrine_split() ->> 'total'), '2');
select ok('  off their old doctrine',
  ((commish_doctrine_split() -> 'counts') ->> 'purse-'), null);
select ok('  and onto the new one',
  ((commish_doctrine_split() -> 'counts') ->> 'stage+'), '1');
select ok('  with their old terms still on the old board',
  (select count(*)::text from commish_doctrine_board('purse-', 50)), '3');

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== ranking inside a doctrine, not across all of them ==='
-- ---------------------------------------------------------------------------
delete from commish_terms;
select fin(10, 'gate+', 40);
select fin(11, 'gate+', 60);
select fin(12, 'gate+', 80);
select fin(13, 'throne-', 95);
select fin(14, 'throne-', 99);

select ok('a term is placed against its own kind',
  (commish_term_standing('gate+', 60::smallint) ->> 'place'), '2');
select ok('  out of its own kind',
  (commish_term_standing('gate+', 60::smallint) ->> 'terms'), '3');
-- THE WHOLE REASON THE BOARD IS SPLIT. A 60 is middling among gate+ and would be last of
-- five on one big board, and being last of five for believing something is the message this
-- design exists to avoid sending.
select ok('  and the best of a small doctrine is first, not fourth',
  (commish_term_standing('throne-', 99::smallint) ->> 'place'), '1');

select ok('the board comes back best first',
  (select string_agg(score::text, ',' order by place) from commish_doctrine_board('gate+', 20)),
  '80,60,40');
select ok('  numbered from one',
  (select min(place)::text from commish_doctrine_board('gate+', 20)), '1');
select ok('  with the author joined on',
  (select author_name from commish_doctrine_board('gate+', 1)), 'commish12');
select ok('  and nobody from another doctrine on it',
  (select count(*)::text from commish_doctrine_board('gate+', 50)), '3');

-- The cap is a cap, and it is not a way to ask the database for everything.
select ok('a silly limit is clamped rather than obeyed',
  (select count(*)::text from commish_doctrine_board('gate+', 100000)), '3');
select ok('  and so is a nonsense one',
  (select count(*)::text from commish_doctrine_board('gate+', -5)), '1');

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== an ungraded term is unfinished, not bad ==='
-- ---------------------------------------------------------------------------
-- A term with no season played has nothing for report.js to grade. Filing it at the bottom
-- of a board would be a claim the data does not support.
delete from commish_terms;
select fin(20, 'gate+', 70);
select be(21);
select commish_finish_term('gate+', array[0,0,0,0]::smallint[], null, null,
  false, 1::smallint, 3::smallint, 0::smallint);
select ok('an ungraded term records', (select count(*)::text from commish_terms), '2');
select ok('  but has no place',
  (commish_term_standing('gate+', null) ->> 'place'), null);
select ok('  and is not on the board at all',
  (select count(*)::text from commish_doctrine_board('gate+', 20)), '1');
select ok('  nor counted in how many terms there are to beat',
  (commish_term_standing('gate+', 70::smallint) ->> 'terms'), '1');
select ok('  while still counting as a person in the split',
  (commish_doctrine_split() ->> 'total'), '2');

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== what a public key can and cannot do ==='
-- ---------------------------------------------------------------------------
select be(30);
select throws('a doctrine nobody defined',
  $$ select commish_finish_term('vibes', array[0,0,0,0]::smallint[], 50::smallint) $$);
select throws('three axes instead of four',
  $$ select commish_finish_term('gate+', array[1,2,3]::smallint[], 50::smallint) $$);
select throws('no axes at all',
  $$ select commish_finish_term('gate+', null, 50::smallint) $$);
-- THE TABLE BOUNDS THE AXES ITSELF. doctrine.js clamps, but this is reachable with the
-- anon key and one row at 32000 would stretch every bar drawn from this table for everybody.
select throws('an axis off the scale',
  $$ select commish_finish_term('gate+', array[900,0,0,0]::smallint[], 50::smallint) $$);
select throws('a score out of a thousand',
  $$ select commish_finish_term('gate+', array[0,0,0,0]::smallint[], 900::smallint) $$);
select throws('a grade nobody gives',
  $$ select commish_finish_term('gate+', array[0,0,0,0]::smallint[], 50::smallint, 'Z') $$);
select throws('four hundred seasons in a five year term',
  $$ select commish_finish_term('gate+', array[0,0,0,0]::smallint[], 50::smallint, 'B',
       false, 300::smallint) $$);
select ok('while a real term is fine',
  (commish_finish_term('gate+', array[0,0,0,0]::smallint[], 50::smallint, 'B') ->> 'recorded'),
  'true');

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== signed out ==='
-- ---------------------------------------------------------------------------
delete from commish_terms;
select fin(40, 'gate+', 70);
select be(null);
select ok('a signed out term is not recorded',
  (commish_finish_term('gate+', array[0,0,0,0]::smallint[], 99::smallint) ->> 'recorded'), 'false');
select ok('  and does not join the split',
  (commish_doctrine_split() ->> 'total'), '1');
select ok('  but the split still comes back',
  ((commish_doctrine_split() -> 'counts') ->> 'gate+'), '1');
select ok('  and the board is still readable',
  (select count(*)::text from commish_doctrine_board('gate+', 20)), '1');

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== your own terms, and only your own ==='
-- ---------------------------------------------------------------------------
delete from commish_terms;
select fin(50, 'gate+', 70);
select fin(50, 'purse-', 80);
select fin(51, 'stage+', 90);
select be(50);
select ok('you get your own back', (select count(*)::text from commish_my_terms(20)), '2');
select ok('  newest first',
  (select doctrine from commish_my_terms(1)), 'purse-');
select be(51);
select ok('and somebody else gets theirs', (select count(*)::text from commish_my_terms(20)), '1');
select be(null);
select ok('signed out, none', (select count(*)::text from commish_my_terms(20)), '0');

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== who may call what ==='
-- ---------------------------------------------------------------------------
-- Postgres grants EXECUTE to PUBLIC by default and anon is a member of PUBLIC, so revoking
-- from the role names alone leaves the grant in place. This is the check that caught it in
-- 95_commish_choices.sql.
select ok('anybody may read the split',
  has_function_privilege('anon', 'public.commish_doctrine_split()', 'execute')::text, 'true');
select ok('and a board',
  has_function_privilege('anon', 'public.commish_doctrine_board(text,int)', 'execute')::text, 'true');
select ok('and finish a term',
  has_function_privilege('anon',
    'public.commish_finish_term(text,smallint[],smallint,text,boolean,smallint,smallint,smallint)',
    'execute')::text, 'true');
select ok('a signed out caller cannot ask for their own terms',
  has_function_privilege('anon', 'public.commish_my_terms(int)', 'execute')::text, 'false');
select ok('and nobody may move a doctrine',
  has_function_privilege('authenticated', 'public.commish_move_doctrine(text,text)', 'execute')::text,
  'false');

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== reading the table directly, with the anon key ==='
-- ---------------------------------------------------------------------------
select ok('row level security is on', (select relrowsecurity::text from pg_class
  where relname = 'commish_terms'), 'true');
select ok('  with one read policy and no write policy',
  (select count(*) filter (where cmd = 'SELECT')::text || '/' ||
          count(*) filter (where cmd <> 'SELECT')::text
     from pg_policies where tablename = 'commish_terms'), '1/0');

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== renaming a doctrine ==='
-- ---------------------------------------------------------------------------
delete from commish_terms;
select fin(55, 'gate+', 70);
select fin(56, 'gate+', 60);
select ok('moving a doctrine moves every term under it',
  commish_move_doctrine('gate+', 'gate-')::text, '2');
select ok('  onto the new one',
  (select count(*)::text from commish_doctrine_board('gate-', 20)), '2');
select ok('  and off the old one',
  (select count(*)::text from commish_doctrine_board('gate+', 20)), '0');
select throws('and it refuses to move them somewhere that does not exist',
  $$ select commish_move_doctrine('gate-', 'nowhere') $$);

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== running the file twice ==='
-- ---------------------------------------------------------------------------
select ok('the constraints are there once each',
  (select count(*)::text from pg_constraint
    where conname in ('commish_terms_doctrine_ck','commish_terms_axes_ck',
                      'commish_terms_score_ck','commish_terms_grade_ck',
                      'commish_terms_count_ck')), '5');
select ok('and the board index is there once',
  (select count(*)::text from pg_indexes where indexname = 'commish_terms_board_idx'), '1');
