-- ---------------------------------------------------------------------------
-- The checks for 95_commish_choices.sql. See commish_base.sql for how to run it.
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

-- A clean slate, so the file runs twice. The tally is emptied through the choices, which
-- also exercises the delete arm of the trigger before anything else asserts on it.
delete from commish_choices;
delete from commish_tally;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== one person, one ruling per item ==='
-- ---------------------------------------------------------------------------
select be(1);
select ok('a first ruling records',
  (commish_rule('roster-limits', 'hold') ->> 'recorded'), 'true');
select ok('and comes back counting you',
  (commish_rule('roster-limits', 'hold') ->> 'total'), '1');

-- THE CASE THE PRIMARY KEY EXISTS FOR. The mode is built to be replayed, so this is the
-- ordinary path and not the rare one: a second term rules on the same item again.
select be(1);
select commish_rule('roster-limits', 'hold');
select commish_rule('roster-limits', 'hold');
select commish_rule('roster-limits', 'hold');
select ok('ruling the same way four times is still one vote',
  (commish_split('roster-limits') ->> 'total'), '1');

-- AND THE TRIGGER'S UPDATE ARM, which is the half that is easy to leave out: taking the
-- old vote off the option it was on. Without it the total climbs on every change of mind
-- and the percentages stop summing to a hundred.
select commish_rule('roster-limits', 'raise');
select ok('changing your mind moves the vote rather than adding one',
  (commish_split('roster-limits') ->> 'total'), '1');
select ok('  off the old option',
  ((commish_split('roster-limits') -> 'counts') ->> 'hold'), null);
select ok('  and onto the new one',
  ((commish_split('roster-limits') -> 'counts') ->> 'raise'), '1');

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== a crowd ==='
-- ---------------------------------------------------------------------------
-- Twelve people on one item: seven hold, four raise, one scraps.
do $$
declare i integer;
begin
  for i in 1..12 loop
    perform be(i);
    perform commish_rule('playoff-size',
      case when i <= 7 then 'hold' when i <= 11 then 'raise' else 'scrap' end);
  end loop;
end $$;

select ok('twelve rulings, twelve votes',
  (commish_split('playoff-size') ->> 'total'), '12');
select ok('  seven held',   ((commish_split('playoff-size') -> 'counts') ->> 'hold'), '7');
select ok('  four raised',  ((commish_split('playoff-size') -> 'counts') ->> 'raise'), '4');
select ok('  one scrapped', ((commish_split('playoff-size') -> 'counts') ->> 'scrap'), '1');
-- THE SUM IS THE TOTAL, which is what makes the percentages on the page land on a
-- hundred. If these ever disagree the client trusts the counts, and this is the check
-- that says they never should.
select ok('the counts sum to the total',
  (select sum(v::int)::text from jsonb_each_text(commish_split('playoff-size') -> 'counts') as t(k, v)),
  (commish_split('playoff-size') ->> 'total'));

-- The stored counters are the counted rows, which is the whole bargain this table makes.
select ok('the stored counter is the rows underneath',
  (select n::text from commish_tally where item_id = 'playoff-size' and option_id = 'hold'),
  (select count(*)::text from commish_choices where item_id = 'playoff-size' and option_id = 'hold'));

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== an item nobody has ruled on ==='
-- ---------------------------------------------------------------------------
-- ONE SHAPE, NOT TWO. A caller that has to tell "no rows" from "no votes" apart will get
-- it wrong once, and the once will be a division by null on somebody's screen.
select ok('comes back as zero rather than as null',
  (commish_split('never-asked') ->> 'total'), '0');
select ok('  with an empty object rather than a null one',
  (commish_split('never-asked') ->> 'counts'), '{}');

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== what a public key can and cannot do ==='
-- ---------------------------------------------------------------------------
-- The anon key is in the page source of every game on this site. The shape check is the
-- only thing standing between it and a table full of whatever somebody felt like typing.
select throws('an item id with a space',      $$ select commish_rule('roster limits', 'hold') $$);
select throws('an item id in capitals',       $$ select commish_rule('RosterLimits', 'hold') $$);
select throws('an item id of forty one chars',
  $$ select commish_rule('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'hold') $$);
select throws('an option id with punctuation', $$ select commish_rule('roster-limits', 'hold;drop') $$);
select throws('a null item',                   $$ select commish_rule(null, 'hold') $$);
select ok('while a real slug is fine',
  (commish_rule('bowl-season', 'onto-books') ->> 'recorded'), 'true');

-- READING A RUBBISH ID IS NOT AN ERROR, unlike writing one. A read is harmless and a
-- caller reading an id the docket no longer has should get an empty split, not a failure
-- that takes down a screen listing forty five of them.
select ok('reading a rubbish id answers empty rather than failing',
  (commish_split('NOT A SLUG') ->> 'total'), '0');

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== signed out ==='
-- ---------------------------------------------------------------------------
-- NOT AN ERROR. Most of the mode works signed out and a ruling is not the place to stop
-- somebody: they see the split, their own ruling just does not join it.
select be(null);
select ok('a signed out ruling is not recorded',
  (commish_rule('playoff-size', 'hold') ->> 'recorded'), 'false');
select ok('  and does not move the count',
  (commish_split('playoff-size') ->> 'total'), '12');
select ok('  but the split still comes back',
  ((commish_split('playoff-size') -> 'counts') ->> 'hold'), '7');

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== many at once ==='
-- ---------------------------------------------------------------------------
select be(1);
select ok('a batch answers for every id asked for',
  (select count(*)::text from jsonb_object_keys(
    commish_splits(array['playoff-size', 'roster-limits', 'never-asked']))), '3');
select ok('  with the same numbers a single read gives',
  ((commish_splits(array['playoff-size']) -> 'playoff-size') ->> 'total'), '12');
select ok('  and a duplicate asked for twice comes back once',
  (select count(*)::text from jsonb_object_keys(
    commish_splits(array['playoff-size', 'playoff-size']))), '1');
select ok('an empty array is an empty answer, not a failure',
  commish_splits(array[]::text[])::text, '{}');
select ok('a null array too', commish_splits(null)::text, '{}');
-- RAISES RATHER THAN TRUNCATING. A silently short answer would report a term as more
-- ordinary than it was, which is the failure nobody would ever see.
select throws('past the cap it refuses rather than trimming',
  $$ select commish_splits((select array_agg('i' || i) from generate_series(1, 121) as i)) $$);

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== your own rulings, and only your own ==='
-- ---------------------------------------------------------------------------
select be(1);
select ok('you get back what you ruled',
  (commish_my_rulings() ->> 'roster-limits'), 'raise');
select be(12);
select ok('and somebody else gets back theirs',
  (commish_my_rulings() ->> 'playoff-size'), 'scrap');
select ok('  not yours',
  (commish_my_rulings() ->> 'roster-limits'), null);
select be(null);
select ok('signed out, nothing', commish_my_rulings()::text, '{}');

-- THE POLICY ITSELF, not just the function. A function is one way in; RLS is what
-- happens when somebody with the anon key selects from the table directly, which is a
-- thing anybody who reads the page source can do.
select ok('there is no policy letting anybody read anybody else',
  (select count(*)::text from pg_policies
    where tablename = 'commish_choices' and cmd = 'SELECT'), '1');
select ok('and no write policy on either table at all',
  (select count(*)::text from pg_policies
    where tablename in ('commish_choices', 'commish_tally') and cmd <> 'SELECT'), '0');
select ok('row level security is on for the rulings',
  (select relrowsecurity::text from pg_class where relname = 'commish_choices'), 'true');
select ok('and for the counts',
  (select relrowsecurity::text from pg_class where relname = 'commish_tally'), 'true');

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== who may call what ==='
-- ---------------------------------------------------------------------------
-- The two repair functions are the owner's hand. Granting either to the public would be
-- handing anybody with the page source a button that erases the feature.
select ok('anybody may read a split',
  has_function_privilege('anon', 'public.commish_split(text)', 'execute')::text, 'true');
select ok('and record a ruling',
  has_function_privilege('anon', 'public.commish_rule(text,text)', 'execute')::text, 'true');
select ok('nobody may recount',
  has_function_privilege('authenticated', 'public.commish_recount()', 'execute')::text, 'false');
select ok('nobody may forget an item',
  has_function_privilege('authenticated', 'public.commish_forget_item(text)', 'execute')::text, 'false');
select ok('and a signed out caller cannot ask what they ruled',
  has_function_privilege('anon', 'public.commish_my_rulings()', 'execute')::text, 'false');

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== repairing it ==='
-- ---------------------------------------------------------------------------
-- DRIFT IS THE PRICE OF A STORED COUNTER, so the fix has to work from a state that
-- should be impossible. Break it on purpose first.
update commish_tally set n = 999 where item_id = 'playoff-size' and option_id = 'hold';
delete from commish_tally where item_id = 'roster-limits';
select ok('a drifted counter is visibly wrong first',
  (commish_split('playoff-size') ->> 'total'), '1004');
select commish_recount();
select ok('and a recount puts it back',
  (commish_split('playoff-size') ->> 'total'), '12');
select ok('  including a row that had gone missing entirely',
  (commish_split('roster-limits') ->> 'total'), '1');
select ok('  with nothing left over',
  (select count(*)::text from commish_tally where n = 0), '0');

-- WHEN AN ITEM IS REWRITTEN UNDER ITS OLD ID. Both halves go, or the counts outlive the
-- rulings and the split describes a question nobody is being asked any more.
select commish_forget_item('playoff-size');
select ok('forgetting an item clears its split',
  (commish_split('playoff-size') ->> 'total'), '0');
select ok('  and its rulings',
  (select count(*)::text from commish_choices where item_id = 'playoff-size'), '0');
select ok('  and leaves every other item alone',
  (commish_split('roster-limits') ->> 'total'), '1');

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== running the file twice ==='
-- ---------------------------------------------------------------------------
-- Every migration in this directory says "safe to run more than once" at the top, and
-- the way that stops being true is a constraint added without a guard. The check here
-- is that the constraints exist exactly once, which is what a second run would break.
select ok('the shape constraints are there once each',
  (select count(*)::text from pg_constraint
    where conname in ('commish_choices_item_ck', 'commish_choices_option_ck')), '2');
select ok('and the trigger is there once',
  (select count(*)::text from pg_trigger where tgname = 'commish_tally_sync_trg'), '1');
