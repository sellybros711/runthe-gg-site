-- Exercises supabase/67_setlist_leaderboard.sql against a real Postgres.
--
--   psql -d seguetest -f setlist/build/test/stub_supabase.sql
--   psql -d seguetest -f supabase/67_setlist_leaderboard.sql
--   psql -d seguetest -f setlist/build/test/test_leaderboard.sql
--
-- Every check the function claims to make gets a case that should pass and a
-- case that should be refused, because a validator nobody has watched refuse
-- anything is a validator that might be returning true.
\set ON_ERROR_STOP off
\pset pager off
set client_min_messages = notice;

truncate segue_runs;
delete from segue_attended;

-- THE SUITE HAS TO BE RE-RUNNABLE, and the rename test is what makes that a real
-- concern rather than a nicety: it changes a username IN profiles, so a second
-- run against the same database starts with a name the earlier assertions do not
-- expect and five unrelated cases fail. Put back here rather than at the end,
-- because a suite that only cleans up when it finishes cleanly does not clean up
-- on the run that mattered.
update profiles set username = 'rickspringfield'
 where id = '11111111-1111-1111-1111-111111111111';
update profiles set username = 'peterframpton'
 where id = '22222222-2222-2222-2222-222222222222';

create or replace function t_ok(name text, ok boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when ok then '  ok  ' else ' FAIL ' end, name;
end $$;

-- EVERY OVERLOAD OF t_sub, DROPPED FIRST. `create or replace` only replaces a
-- function with the SAME argument list; adding a parameter creates a second
-- overload beside the old one, and then every call that fits both is ambiguous.
do $$ declare r record; begin
  for r in select oid::regprocedure as sig from pg_proc where proname = 't_sub' loop
    execute 'drop function ' || r.sig;
  end loop;
end $$;

-- Runs the function and reports whether it raised, and with what.
--
-- THE DEFAULTS ARE A VALID SHOW, so every case below changes exactly one thing
-- and the failure names its own subject. Seven songs, 858 points: 500 from the
-- songs, 180 for the clock, 60 of flow, and 118 from four breadth cards worth
-- 34, 32, 26 and 26.
create or replace function t_sub(
  p_band text default 'goose',
  p_total int default 858,
  p_song int default 500,
  p_time int default 180,
  p_flow int default 60,
  p_breadth int default 118,
  p_cards text[] default array['cover','bustout','jamchart','bigjam'],
  p_best int default 1200,
  p_songs int default 7,
  p_segues int default 2,
  p_sandwiches int default 1,
  p_covers int default 1,
  p_jamcharts int default 1,
  p_bustouts int default 1,
  p_cooldowns int default 1,
  p_longest int default 1400,
  p_respins int default 0,
  p_used int default 8000,
  p_picks text[] default array['s1:a','s1:b','s1:c','s2:d','s2:e','s2:f','s3:g'],
  p_seed text default null
) returns text
language plpgsql as $$
declare v_id bigint;
begin
  select segue_submit_run(p_band, p_total, p_song, p_time, p_flow, p_breadth,
    p_cards, p_best, p_songs, p_segues, p_sandwiches, p_covers, p_jamcharts,
    p_bustouts, p_cooldowns, p_longest, p_respins, p_used,
    array['s1','s2','s3'], p_picks, p_seed) into v_id;
  return 'ok:' || v_id;
exception when others then
  return 'raised:' || sqlerrm;
end $$;

-- ===========================================================================
-- The happy path
-- ===========================================================================
\echo ''
\echo 'a show that should record'
do $$
declare r text; v segue_runs%rowtype;
begin
  perform set_config('test.uid', '', true);
  r := t_sub();
  perform t_ok('a coherent show records', r like 'ok:%');
  select * into v from segue_runs order by id desc limit 1;
  perform t_ok('the total is stored', v.total = 858);
  perform t_ok('the band is stored', v.band = 'goose');
  perform t_ok('a guest has no name', v.display_name is null);
  perform t_ok('a guest has no user', v.user_id is null);
  perform t_ok('the cards are stored', array_length(v.cards, 1) = 4);
  perform t_ok('cards_got counts them', v.cards_got = 4);
  -- 858 of 1200.
  perform t_ok('the percentage is computed here', v.pct_of_best = 71.50);
end $$;

\echo ''
\echo 'the band id'
do $$
declare r text;
begin
  perform t_ok('an unknown band is still accepted, because bands are a client concern',
    t_sub(p_band => 'phish') like 'ok:%');
  perform t_ok('the band is lowercased', (select band from segue_runs order by id desc limit 1) = 'phish');
  perform t_ok('a band id with a space is refused', t_sub(p_band => 'goose the band') like 'raised:%');
  perform t_ok('an empty band is refused', t_sub(p_band => '') like 'raised:%');
  perform t_ok('a 40-character band is refused', t_sub(p_band => repeat('a', 40)) like 'raised:%');
end $$;

-- ===========================================================================
-- THE PARTS HAVE TO ADD UP. This is the check that makes every other number
-- here load-bearing: without it a client could send a huge total and honest
-- components, and the board would rank it.
-- ===========================================================================
\echo ''
\echo 'the total is the sum of its parts'
do $$
begin
  perform t_ok('a total one point over its parts is refused',
    t_sub(p_total => 859) like 'raised:%');
  perform t_ok('a total one point under its parts is refused',
    t_sub(p_total => 857) like 'raised:%');
  perform t_ok('a doubled total is refused', t_sub(p_total => 1716) like 'raised:%');
  perform t_ok('moving a point between two parts still adds up',
    t_sub(p_song => 501, p_flow => 59) like 'ok:%');
end $$;

\echo ''
\echo 'each part in range'
do $$
begin
  -- TIME_POINTS_PER_SET * 3 = 195.
  perform t_ok('195 time points is the most there is',
    t_sub(p_time => 195, p_total => 873) like 'ok:%');
  perform t_ok('196 time points is refused',
    t_sub(p_time => 196, p_total => 874) like 'raised:%');
  perform t_ok('negative time points are refused',
    t_sub(p_time => -1, p_total => 677) like 'raised:%');
  perform t_ok('song points beyond what nineteen songs can score are refused',
    t_sub(p_song => 10000, p_total => 10358) like 'raised:%');
  -- The arc bonus is the one part that can go negative.
  perform t_ok('negative flow is accepted, because the arc bonus can be',
    t_sub(p_flow => -40, p_total => 758) like 'ok:%');
  perform t_ok('flow beyond any reachable bonus is refused',
    t_sub(p_flow => 99999, p_total => 100797) like 'raised:%');
end $$;

-- ===========================================================================
-- The breadth cards, which the function values itself
-- ===========================================================================
\echo ''
\echo 'the breadth cards'
do $$
declare v segue_runs%rowtype;
begin
  perform t_ok('an unknown card is refused',
    t_sub(p_cards => array['cover','encore-of-the-year']) like 'raised:%');
  -- The client claiming a different value for the same cards is a client bug.
  perform t_ok('cards worth 118 sent as 200 are refused',
    t_sub(p_breadth => 200, p_total => 940) like 'raised:%');
  -- roles is 44, so all five are 162.
  perform t_ok('all five cards are worth 162',
    t_sub(p_cards => array['cover','bustout','jamchart','bigjam','roles'],
          p_breadth => 162, p_total => 902) like 'ok:%');
  select * into v from segue_runs order by id desc limit 1;
  perform t_ok('the stored breadth is the function''s own number', v.breadth_pts = 162);
  perform t_ok('a duplicated card is counted once',
    t_sub(p_cards => array['cover','cover','bustout'], p_breadth => 66, p_total => 806) like 'ok:%');
  perform t_ok('no cards at all is a real show',
    t_sub(p_cards => '{}', p_breadth => 0, p_total => 740) like 'ok:%');
end $$;

\echo ''
\echo 'a card needs something to have earned it'
do $$
begin
  perform t_ok('the cover card with no covers is refused',
    t_sub(p_covers => 0) like 'raised:%');
  perform t_ok('the jamchart card with no jamcharts is refused',
    t_sub(p_jamcharts => 0) like 'raised:%');
  perform t_ok('the bustout card with no bustouts is refused',
    t_sub(p_bustouts => 0) like 'raised:%');
  perform t_ok('the 20-minute card with a 19-minute longest song is refused',
    t_sub(p_longest => 1140) like 'raised:%');
  perform t_ok('the 20-minute card with exactly 20 minutes is accepted',
    t_sub(p_longest => 1200) like 'ok:%');
  perform t_ok('every kind of song in a five song night is refused',
    t_sub(p_cards => array['roles'], p_breadth => 44, p_total => 784,
          p_songs => 5, p_segues => 1, p_sandwiches => 0,
          p_picks => array['s1:a','s1:b','s1:c','s2:d','s3:e']) like 'raised:%');
end $$;

-- ===========================================================================
-- The shape of the night
-- ===========================================================================
\echo ''
\echo 'the shape of the night'
do $$
begin
  -- Three sets capped at 8, 8 and 3.
  perform t_ok('twenty songs is more than the sets hold',
    t_sub(p_songs => 20, p_picks =>
      array(select 's1:' || g from generate_series(1,20) g)) like 'raised:%');
  perform t_ok('nineteen songs is exactly the cap',
    t_sub(p_songs => 19, p_segues => 16, p_sandwiches => 8,
      p_picks => array(select 's1:' || g from generate_series(1,19) g)) like 'ok:%');
  perform t_ok('zero songs is not a show', t_sub(p_songs => 0, p_picks => '{}') like 'raised:%');
  perform t_ok('picks that do not match the song count are refused',
    t_sub(p_songs => 7, p_picks => array['s1:a','s1:b']) like 'raised:%');
  perform t_ok('the same performance twice is refused',
    t_sub(p_picks => array['s1:a','s1:a','s1:c','s2:d','s2:e','s2:f','s3:g']) like 'raised:%');
  perform t_ok('a malformed pick is refused',
    t_sub(p_picks => array['s1:a','not a pick','s1:c','s2:d','s2:e','s2:f','s3:g']) like 'raised:%');
end $$;

\echo ''
\echo 'the counts have to fit the night'
do $$
begin
  -- Seven songs across three sets offer at most four adjacent pairs.
  perform t_ok('four segues in a seven song show is the most there is',
    t_sub(p_segues => 4, p_sandwiches => 2) like 'ok:%');
  perform t_ok('five segues in a seven song show is refused',
    t_sub(p_segues => 5, p_sandwiches => 2) like 'raised:%');
  perform t_ok('a sandwich takes two segues, so three of them need six',
    t_sub(p_segues => 4, p_sandwiches => 3) like 'raised:%');
  perform t_ok('more covers than songs is refused', t_sub(p_covers => 9) like 'raised:%');
  perform t_ok('more jamcharts than songs is refused', t_sub(p_jamcharts => 9) like 'raised:%');
end $$;

\echo ''
\echo 'the clock'
do $$
begin
  -- 75 + 70 + 10 minutes is 9300 seconds.
  perform t_ok('9300 seconds of stage time is the whole night',
    t_sub(p_used => 9300) like 'ok:%');
  perform t_ok('9301 seconds is refused', t_sub(p_used => 9301) like 'raised:%');
  -- Respins come out of the same budget: one costs five minutes.
  perform t_ok('a respin takes its five minutes out of the night',
    t_sub(p_respins => 1, p_used => 9001) like 'raised:%');
  perform t_ok('the same show inside the shortened night records',
    t_sub(p_respins => 1, p_used => 9000) like 'ok:%');
  -- Three respins burn 5 + 10 + 15.
  perform t_ok('three respins burn half an hour',
    t_sub(p_respins => 3, p_used => 7500) like 'ok:%');
  perform t_ok('three respins and a full night is refused',
    t_sub(p_respins => 3, p_used => 7501) like 'raised:%');
  perform t_ok('a fourth respin is refused', t_sub(p_respins => 4, p_used => 6000) like 'raised:%');
end $$;

\echo ''
\echo 'the ceiling'
do $$
declare v segue_runs%rowtype;
begin
  perform t_ok('a ceiling below the score is refused', t_sub(p_best => 800) like 'raised:%');
  -- OWN PICKS, because these two differ from the default show only in the
  -- ceiling, and the ceiling is not part of what makes a submit a duplicate. On
  -- the shared picks the idempotency window would hand back the earlier row and
  -- both assertions would then read a percentage that belongs to it.
  perform t_ok('a ceiling equal to the score is a perfect run',
    t_sub(p_best => 858,
      p_picks => array['c1:a','c1:b','c1:c','c2:d','c2:e','c2:f','c3:g']) like 'ok:%');
  select * into v from segue_runs order by id desc limit 1;
  perform t_ok('a perfect run is 100 percent', v.pct_of_best = 100.00);
  perform t_ok('no ceiling at all is allowed',
    t_sub(p_best => null,
      p_picks => array['c4:a','c4:b','c4:c','c5:d','c5:e','c5:f','c6:g']) like 'ok:%');
  select * into v from segue_runs order by id desc limit 1;
  perform t_ok('and leaves the percentage null', v.pct_of_best is null);
end $$;

-- ===========================================================================
-- Accounts
-- ===========================================================================
\echo ''
\echo 'the name comes from profiles and never from the client'
do $$
declare v segue_runs%rowtype; r text;
begin
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', true);
  r := t_sub(p_picks => array['x1:a','x1:b','x1:c','x2:d','x2:e','x2:f','x3:g']);
  perform t_ok('a signed-in show records', r like 'ok:%');
  select * into v from segue_runs order by id desc limit 1;
  perform t_ok('the name is read out of profiles', v.display_name = 'rickspringfield');
  perform t_ok('and the row is owned', v.user_id = '11111111-1111-1111-1111-111111111111');
end $$;

\echo ''
\echo 'claiming a guest show'
do $$
declare v_id bigint; v segue_runs%rowtype;
begin
  perform set_config('test.uid', '', true);
  select id into v_id from segue_runs where user_id is null order by id desc limit 1;
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', true);
  perform t_ok('a guest show can be claimed', segue_claim_run(v_id) = true);
  select * into v from segue_runs where id = v_id;
  perform t_ok('claiming puts the name on it', v.display_name = 'rickspringfield');
  perform set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
  perform t_ok('an owned show cannot be claimed again', segue_claim_run(v_id) = false);
  select * into v from segue_runs where id = v_id;
  perform t_ok('and the owner did not change', v.display_name = 'rickspringfield');
  perform set_config('test.uid', '', true);
  perform t_ok('a guest cannot claim anything', segue_claim_run(v_id) = false);
end $$;

\echo ''
\echo 'renaming'
do $$
declare n int;
begin
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', true);
  update profiles set username = 'rickthesecond'
   where id = '11111111-1111-1111-1111-111111111111';
  n := segue_rename_runs();
  perform t_ok('the rename touched every owned row', n > 0);
  perform t_ok('and left none under the old name',
    not exists (select 1 from segue_runs
                 where user_id = '11111111-1111-1111-1111-111111111111'
                   and display_name <> 'rickthesecond'));
  perform t_ok('it did not touch anybody else''s rows',
    not exists (select 1 from segue_runs
                 where user_id is distinct from '11111111-1111-1111-1111-111111111111'
                   and display_name = 'rickthesecond'));
end $$;

-- ===========================================================================
-- Idempotency: a retry is not a second show
-- ===========================================================================
\echo ''
\echo 'a double submit'
do $$
declare a text; b text; c text;
begin
  perform set_config('test.uid', '', true);
  a := t_sub(p_picks => array['dd:1','dd:2','dd:3','dd:4','dd:5','dd:6','dd:7']);
  b := t_sub(p_picks => array['dd:1','dd:2','dd:3','dd:4','dd:5','dd:6','dd:7']);
  perform t_ok('the retry returns the row already there', a = b);
  -- A DIFFERENT show with the same picks is not a retry, and neither is the same
  -- picks with a different score.
  c := t_sub(p_total => 859, p_song => 501,
             p_picks => array['dd:1','dd:2','dd:3','dd:4','dd:5','dd:6','dd:7']);
  perform t_ok('a different score is a different show', c <> a);
end $$;

-- ===========================================================================
-- The shows you were at
-- ===========================================================================
\echo ''
\echo 'you were there'
do $$
declare out text[];
begin
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', true);
  out := segue_sync_attended('goose', array['100','200']);
  perform t_ok('a first sync stores what it was given', out @> array['100','200']);
  perform t_ok('and returns exactly those two', array_length(out, 1) = 2);

  -- THE MERGE, which is the whole point: neither side wins, both survive.
  out := segue_sync_attended('goose', array['300']);
  perform t_ok('a later sync adds without removing', out @> array['100','200','300']);
  perform t_ok('and the list is now three', array_length(out, 1) = 3);

  out := segue_sync_attended('goose', array['100']);
  perform t_ok('re-marking a show does not duplicate it', array_length(out, 1) = 3);

  out := segue_sync_attended('goose', '{}');
  perform t_ok('an empty sync is a read and not a wipe', array_length(out, 1) = 3);

  -- Bands are separate lists.
  out := segue_sync_attended('phish', array['900']);
  perform t_ok('another band has its own list', array_length(out, 1) = 1);
  out := segue_sync_attended('goose', null);
  perform t_ok('and the first band is untouched', array_length(out, 1) = 3);
end $$;

\echo ''
\echo 'forgetting a show'
do $$
declare out text[];
begin
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', true);
  perform t_ok('a marked show can be unmarked', segue_forget_attended('goose', '200') = true);
  out := segue_sync_attended('goose', null);
  perform t_ok('and is gone from the list', not (out @> array['200']));
  perform t_ok('unmarking something never marked answers false',
    segue_forget_attended('goose', '424242') = false);
end $$;

\echo ''
\echo 'attendance is private'
do $$
declare out text[];
begin
  perform set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
  out := segue_sync_attended('goose', null);
  perform t_ok('another account sees none of it', coalesce(array_length(out, 1), 0) = 0);
  perform set_config('test.uid', '', true);
  perform t_ok('a guest gets nothing back', segue_sync_attended('goose', array['1']) is null);
  perform t_ok('and cannot forget anything', segue_forget_attended('goose', '100') = false);
end $$;

\echo ''
\echo 'a sync is bounded'
do $$
declare r text;
begin
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', true);
  begin
    perform segue_sync_attended('goose', array['not a show id']);
    r := 'ok';
  exception when others then r := 'raised';
  end;
  perform t_ok('a malformed show id is refused', r = 'raised');
  begin
    perform segue_sync_attended('goose', array(select g::text from generate_series(1, 5001) g));
    r := 'ok';
  exception when others then r := 'raised';
  end;
  perform t_ok('an unbounded list is refused', r = 'raised');
end $$;

-- ===========================================================================
-- The board reads the client actually makes
-- ===========================================================================
\echo ''
\echo 'the board reads its indexes'
-- NOT AN ASSERTION ABOUT SPEED, an assertion about SHAPE. Every board read has
-- to be ANSWERABLE from an index, because the alternative at a million rows is a
-- sequential scan that only ever shows up in production.
--
-- BOTH KNOBS ARE OFF, and the second one is not belt and braces. On a table this
-- small the planner is right to fetch thirty rows and sort them, and it will do
-- exactly that however good the index is: with only enable_seqscan off, the
-- named board came back as a Bitmap Heap Scan plus a Sort and the assertion
-- failed on a plan that was the correct choice for the data in front of it.
-- Turning sort off as well leaves the ordering itself needing an index, which is
-- the question actually being asked: COULD this be answered from the index at a
-- size where it matters.
create or replace function t_plan(q text) returns text
language plpgsql as $$
declare r record; out text := '';
begin
  for r in execute 'explain ' || q loop out := out || r."QUERY PLAN" || ' '; end loop;
  return out;
end $$;

set enable_seqscan = off;
set enable_sort = off;
do $$
begin
  perform t_ok('the score board scans segue_runs_total_idx',
    t_plan($q$select id from segue_runs where band = 'goose'
             order by total desc, created_at asc limit 50$q$)
    like '%segue_runs_total_idx%');

  perform t_ok('the percentage board scans segue_runs_pct_idx',
    t_plan($q$select id from segue_runs where band = 'goose'
             order by pct_of_best desc, created_at asc limit 50$q$)
    like '%segue_runs_pct_idx%');

  -- The reversed board, which is the whole reason there is no ascending twin of
  -- any index: the TIEBREAK reverses with the sort key, so Postgres reads the
  -- same index backwards instead of sorting.
  perform t_ok('the reversed board reads the same index backwards',
    t_plan($q$select id from segue_runs where band = 'goose'
             order by total asc, created_at desc limit 50$q$)
    like '%segue_runs_total_idx%');

  perform t_ok('a named-only board scans the partial index',
    t_plan($q$select id from segue_runs where band = 'goose' and display_name is not null
             order by total desc, created_at asc limit 50$q$)
    like '%segue_runs_named_total_idx%');

  -- The windowed count, which is what "today" and "this week" are. created_at is
  -- the LAST column of the sort index precisely so this stays an index condition
  -- rather than a filter with a heap fetch per candidate row.
  perform t_ok('counting the shows ahead of you inside a window is an index scan',
    t_plan($q$select id from segue_runs where band = 'goose' and total > 858
             and created_at >= now() - interval '1 day'$q$)
    like '%Index%');

  perform t_ok('a profile''s own history scans segue_runs_user_idx',
    t_plan($q$select id from segue_runs
             where user_id = '11111111-1111-1111-1111-111111111111'
             order by created_at desc limit 500$q$)
    like '%segue_runs_user_idx%');
end $$;
reset enable_seqscan;
reset enable_sort;
drop function if exists t_plan(text);

\echo ''
\echo 'done'
drop function if exists t_ok(text, boolean);
