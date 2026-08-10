-- Exercises supabase/62_cfb_leaderboard.sql against a real Postgres.
--
--   psql -d cfbtest -f cfb/build/test/stub_supabase.sql
--   psql -d cfbtest -f supabase/62_cfb_leaderboard.sql
--   psql -d cfbtest -f cfb/build/test/test_leaderboard.sql
--
-- Every check the function claims to make gets a case that should pass and a
-- case that should be refused, because a validator nobody has watched refuse
-- anything is a validator that might be returning true.
\set ON_ERROR_STOP off
\pset pager off
set client_min_messages = notice;

truncate cfb_runs;
delete from profiles;

insert into profiles (id, username) values
  ('11111111-1111-1111-1111-111111111111', 'coachprime'),
  ('22222222-2222-2222-2222-222222222222', 'saban');

create or replace function t_ok(name text, ok boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when ok then '  ok  ' else ' FAIL ' end, name;
end $$;

-- EVERY OVERLOAD OF t_submit, DROPPED FIRST. `create or replace` only replaces a
-- function with the SAME argument list; adding a parameter creates a second
-- overload beside the old one, and then every call that fits both is ambiguous:
--   ERROR: function t_submit(integer, integer, integer, boolean, text[]) is not unique
-- Which is how adding the mode argument broke sixteen tests that had nothing to do
-- with it.
do $$ declare r record; begin
  for r in select oid::regprocedure as sig from pg_proc where proname = 't_submit' loop
    execute 'drop function ' || r.sig;
  end loop;
end $$;

-- Runs the function and reports whether it raised, and with what.
create or replace function t_submit(
  p_reg int, p_rank int, p_po int default 0, p_bowl_won boolean default false,
  p_picks text[] default array['a1:2019','b2:2020','c3:2021','d4:2015','e5:2011','f6:2008'],
  p_diff numeric default 10.0, p_chem numeric default 5.0, p_spend numeric default 12.5,
  p_sig int default 0, p_best int default null, p_respins int default 0,
  p_slots text[] default array['QB','RB','WR','WR','TE','FLEX'],
  p_mode text default 'free'
) returns text
language plpgsql as $$
declare v_id bigint;
begin
  select cfb_submit_run(p_reg, p_rank, p_po, p_bowl_won, p_diff, p_chem, p_spend,
    p_respins, p_sig, p_best, p_picks, p_slots, 'seed', 100, 90.0, 1.05, 100.0, 74.0, 80,
    p_mode)
    into v_id;
  return 'id:' || v_id;
exception when others then
  return 'ERR:' || SQLERRM;
end $$;

\echo ''
\echo '=== seasons that must be accepted, and what the server derives ==='

-- A perfect season: 12-0, ranked 1, wins all three rounds off the bye.
select t_ok('12-0 No.1 seed wins the title',
  t_submit(12, 1, 3, false, array['p1:2016','p2:2007','p3:2014','p4:2014','p5:2009','p6:2017']) like 'id:%');
select t_ok('  ...derived 15-0, perfect, no elimination round',
  (select wins=15 and losses=0 and games=15 and perfect and title_won and made_playoffs
      and playoff_seed=1 and eliminated_in is null and bowl is null
      and seed_label='No. 1 seed, first-round bye'
     from cfb_runs order by id desc limit 1));

-- An 11-1 team seeded 9th plays four rounds and goes out in the semifinal.
select t_ok('11-1 No.9 seed, out in the semifinal',
  t_submit(11, 9, 2, false, array['q1:2016','q2:2007','q3:2014','q4:2014','q5:2009','q6:2017']) like 'id:%');
select t_ok('  ...derived 13-2, four rounds, eliminated in the CFP Semifinal',
  (select wins=13 and losses=2 and games=15 and not title_won and made_playoffs
      and playoff_seed=9 and eliminated_in='CFP Semifinal' and seed_label='No. 9 seed'
     from cfb_runs order by id desc limit 1));

-- A bye seed that loses its first game went out in the QUARTERFINAL, not the
-- first round: the round names are sliced off the back of the ladder.
select t_ok('12-0 No.2 seed loses its opener',
  t_submit(12, 2, 0, false, array['r1:2016','r2:2007','r3:2014','r4:2014','r5:2009','r6:2017']) like 'id:%');
select t_ok('  ...eliminated in the CFP Quarterfinal, not the First Round',
  (select eliminated_in='CFP Quarterfinal' and games=13 and losses=1
     from cfb_runs order by id desc limit 1));

-- A 12 seed that loses its opener went out in the FIRST ROUND.
select t_ok('9-3 No.12 seed loses its opener',
  t_submit(9, 12, 0, false, array['s1:2016','s2:2007','s3:2014','s4:2014','s5:2009','s6:2017']) like 'id:%');
select t_ok('  ...eliminated in the CFP First Round',
  (select eliminated_in='CFP First Round' from cfb_runs order by id desc limit 1));

-- Missed the field, won a New Year's Six bowl.
select t_ok('10-2 ranked 14th wins its bowl',
  t_submit(10, 14, 0, true, array['t1:2016','t2:2007','t3:2014','t4:2014','t5:2009','t6:2017']) like 'id:%');
select t_ok('  ...NY6 tier, 11-2, 13 games, not in the playoff',
  (select bowl='ny6' and bowl_won and wins=11 and losses=2 and games=13
      and not made_playoffs and playoff_seed is null
      and seed_label='New Year''s Six Bowl'
     from cfb_runs order by id desc limit 1));

-- THE BOWL TIER IS A FUNCTION OF THE RANKING, and the client never sends it.
-- It used to be read off the loss count here, which is not what engine.js does
-- and never was: seedFromRanking() needs six wins to go bowling and then reads
-- the ranking, top 18 for a New Year's Six and top 40 for a major. The two rules
-- disagree constantly, so a season recorded a tier it had not played. See the
-- header of 64_cfb_bowl_key.sql, and test_bowl_key.mjs, which sweeps every
-- reachable (wins, rank) against the engine rather than spot-checking four.
select t_ok('7-5 ranked 60th reaches a minor bowl and loses it',
  t_submit(7, 60, 0, false, array['u1:2016','u2:2007','u3:2014','u4:2014','u5:2009','u6:2017']) like 'id:%');
select t_ok('  ...minor tier, 7-6, 13 games, because 60th is outside the top 40',
  (select bowl='minor' and not bowl_won and wins=7 and losses=6 and games=13
     from cfb_runs order by id desc limit 1));

-- The two seasons the old rule got backwards, kept as the regression they are.
select t_ok('9-3 ranked 44th is a MINOR bowl, not a New Year''s Six',
  t_submit(9, 44, 0, true, array['x1:2016','x2:2007','x3:2014','x4:2014','x5:2009','x6:2017']) like 'id:%');
select t_ok('  ...three losses does not buy a New Year''s Six',
  (select bowl='minor' from cfb_runs order by id desc limit 1));

select t_ok('6-6 ranked 15th IS a New Year''s Six',
  t_submit(6, 15, 0, true, array['y1:2016','y2:2007','y3:2014','y4:2014','y5:2009','y6:2017']) like 'id:%');
select t_ok('  ...six losses does not disqualify a top-18 team',
  (select bowl='ny6' from cfb_runs order by id desc limit 1));

select t_ok('6-6 ranked 90th reaches a minor bowl',
  t_submit(6, 90, 0, true, array['v1:2016','v2:2007','v3:2014','v4:2014','v5:2009','v6:2017']) like 'id:%');
select t_ok('  ...minor tier, 7-6',
  (select bowl='minor' and bowl_won and wins=7 and losses=6 from cfb_runs order by id desc limit 1));

select t_ok('4-8 ranked 120th reaches nothing',
  t_submit(4, 120, 0, false, array['w1:2016','w2:2007','w3:2014','w4:2014','w5:2009','w6:2017']) like 'id:%');
select t_ok('  ...no bowl, 4-8, 12 games, season over',
  (select bowl is null and wins=4 and losses=8 and games=12 and seed_label='Season over'
     from cfb_runs order by id desc limit 1));

\echo ''
\echo '=== forgeries and client bugs that must be refused ==='

select t_ok('a 5-7 national champion',
  t_submit(5, 1, 3, false, array['x1:2016','x2:2007','x3:2014','x4:2014','x5:2009','x6:2017'])
    like 'ERR:%cannot be ranked%');
select t_ok('13 regular-season wins',
  t_submit(13, 1, 3) like 'ERR:%regular wins must be%');
select t_ok('a ranking outside the country',
  t_submit(12, 200, 0) like 'ERR:%national ranking must be%');
select t_ok('a bye seed playing four rounds',
  t_submit(12, 2, 4) like 'ERR:%playoff wins must be 0..3%');
select t_ok('playoff wins on a team that missed the field',
  t_submit(10, 20, 2) like 'ERR:%misses the field%');
select t_ok('a playoff team also playing a bowl',
  t_submit(12, 1, 3, true) like 'ERR:%does not play a bowl%');
select t_ok('a bowl win by a 3-9 team, which reaches no bowl',
  t_submit(3, 100, 0, true) like 'ERR:%reaches no bowl%');
select t_ok('spending over the NIL budget',
  t_submit(8, 40, 0, false, array['y1:2016','y2:2007','y3:2014','y4:2014','y5:2009','y6:2017'],
    10.0, 5.0, 15.0) like 'ERR:%outside the $14%');
select t_ok('five picks instead of six',
  t_submit(8, 40, 0, false, array['z1:2016','z2:2007','z3:2014','z4:2014','z5:2009'])
    like 'ERR:%has 6 picks, got 5%');
select t_ok('the same player signed twice',
  t_submit(8, 40, 0, false, array['z1:2016','z1:2016','z3:2014','z4:2014','z5:2009','z6:2017'])
    like 'ERR:%cannot be signed twice%');
select t_ok('a pick that is not player:season',
  t_submit(8, 40, 0, false, array['<script>','z2:2007','z3:2014','z4:2014','z5:2009','z6:2017'])
    like 'ERR:%player_id%');
select t_ok('a slot name the game does not have',
  t_submit(8, 41, 0, false, array['n1:2016','n2:2007','n3:2014','n4:2014','n5:2009','n6:2017'],
    10.0, 5.0, 12.5, 0, null, 0, array['QB','RB','WR','WR','TE','KICKER'])
    like 'ERR:%unknown slot name%');
select t_ok('four re-spins, when there are three',
  t_submit(8, 42, 0, false, array['m1:2016','m2:2007','m3:2014','m4:2014','m5:2009','m6:2017'],
    10.0, 5.0, 12.5, 0, null, 4) like 'ERR:%respins must be 0..3%');
select t_ok('more ranked wins than wins',
  t_submit(2, 99, 0, false, array['k1:2016','k2:2007','k3:2014','k4:2014','k5:2009','k6:2017'],
    10.0, 5.0, 12.5, 9) like 'ERR:%more ranked wins%');
select t_ok('a signature win over an unranked team',
  t_submit(8, 43, 0, false, array['j1:2016','j2:2007','j3:2014','j4:2014','j5:2009','j6:2017'],
    10.0, 5.0, 12.5, 2, 40) like 'ERR:%top 25%');
select t_ok('a point differential no game could produce',
  t_submit(8, 44, 0, false, array['h1:2016','h2:2007','h3:2014','h4:2014','h5:2009','h6:2017'],
    99.0) like 'ERR:%differential out of range%');

\echo ''
\echo '=== which competition a season belongs to ==='

-- Six boards, and only six. A typo in a future client must fail loudly rather than
-- quietly creating a seventh board nobody can find.
--
-- SUBMIT AND READ BACK IN ONE FUNCTION, because t_submit is volatile and a volatile
-- function in a WHERE clause is re-evaluated once per candidate row: written as
-- `where id = t_submit(...)` it inserted a fresh row for every row it compared
-- against, so nothing ever matched its own id and two tests failed for a reason
-- that had nothing to do with what they were testing.
create or replace function t_mode(p_mode text, p_rank int, p_prefix text) returns text
language plpgsql as $$
declare v text; v_id bigint;
begin
  v := t_submit(9, p_rank, 0, false,
    array[p_prefix||'1:2016',p_prefix||'2:2007',p_prefix||'3:2014',
          p_prefix||'4:2014',p_prefix||'5:2009',p_prefix||'6:2017'],
    10.0, 5.0, 12.5, 0, null, 0, array['QB','RB','WR','WR','TE','FLEX'], p_mode);
  if v not like 'id:%' then return v; end if;
  v_id := replace(v, 'id:', '')::bigint;
  return (select run_mode from cfb_runs where id = v_id);
end $$;

select t_ok('a free run records as free play', t_mode('free', 40, 'mode') = 'free');
select t_ok('a conference run records its conference',
  t_mode('conf:Pac-12', 41, 'mq') = 'conf:Pac-12');
select t_ok('a conference this game does not have is refused',
  t_submit(9, 42, 0, false, array['mr1:2016','mr2:2007','mr3:2014','mr4:2014','mr5:2009','mr6:2017'],
    10.0, 5.0, 12.5, 0, null, 0, array['QB','RB','WR','WR','TE','FLEX'], 'conf:Sun Belt')
    like 'ERR:%unknown run mode%');
select t_ok('and so is anything else',
  t_submit(9, 43, 0, false, array['ms1:2016','ms2:2007','ms3:2014','ms4:2014','ms5:2009','ms6:2017'],
    10.0, 5.0, 12.5, 0, null, 0, array['QB','RB','WR','WR','TE','FLEX'], '<script>')
    like 'ERR:%unknown run mode%');
-- The same roster in two competitions is two seasons, not one retried.
select t_ok('the same roster in two competitions is two seasons',
  t_submit(8, 50, 0, false, array['mt1:2016','mt2:2007','mt3:2014','mt4:2014','mt5:2009','mt6:2017'])
  <> t_submit(8, 50, 0, false, array['mt1:2016','mt2:2007','mt3:2014','mt4:2014','mt5:2009','mt6:2017'],
      10.0, 5.0, 12.5, 0, null, 0, array['QB','RB','WR','WR','TE','FLEX'], 'conf:ACC'));

\echo ''
\echo '=== who owns a row ==='

select set_config('test.uid', '', false);
select t_ok('a guest run records with no owner',
  t_submit(8, 30, 0, false, array['g1:2016','g2:2007','g3:2014','g4:2014','g5:2009','g6:2017']) like 'id:%');
select t_ok('  ...user_id and display_name are both null',
  (select user_id is null and display_name is null from cfb_runs order by id desc limit 1));

-- Claim it, as the football game does when somebody signs in after finishing.
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);
select t_ok('signing in claims that run',
  cfb_claim_run((select id from cfb_runs order by id desc limit 1)));
select t_ok('  ...and the name comes from profiles, never the client',
  (select display_name='coachprime' from cfb_runs order by id desc limit 1));

-- The guard that makes an id in a URL not enough to own somebody else's row.
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
select t_ok('somebody else cannot claim an owned run',
  cfb_claim_run((select id from cfb_runs order by id desc limit 1)) = false);
select t_ok('  ...and the original owner still has it',
  (select display_name='coachprime' from cfb_runs order by id desc limit 1));

-- Submitting while signed in attributes the row without the client saying so.
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
select t_ok('a signed-in run is attributed on insert',
  t_submit(9, 31, 0, false, array['f1:2016','f2:2007','f3:2014','f4:2014','f5:2009','f6:2017']) like 'id:%');
select t_ok('  ...to the name in profiles',
  (select display_name='saban' from cfb_runs order by id desc limit 1));

-- A rename has to reach rows already recorded, which is the price of storing a
-- copy of the name rather than joining profiles on every read.
update profiles set username='nicksaban' where id='22222222-2222-2222-2222-222222222222';
select t_ok('renaming fixes past runs',
  cfb_rename_runs() >= 1);
select t_ok('  ...and only that account''s runs',
  (select count(*) from cfb_runs where display_name='coachprime') = 1);

\echo ''
\echo '=== idempotency, so a retry is not a second season ==='
select set_config('test.uid', '', false);
select t_ok('the same season submitted twice returns the same row',
  t_submit(7, 55, 0, false, array['d1:2016','d2:2007','d3:2014','d4:2014','d5:2009','d6:2017'])
  = t_submit(7, 55, 0, false, array['d1:2016','d2:2007','d3:2014','d4:2014','d5:2009','d6:2017']));

\echo ''
\echo '=== the ordering key ==='
select t_ok('more wins always outranks a better margin',
  (select min(score) from cfb_runs where wins=15) > (select max(score) from cfb_runs where wins=13));
select t_ok('within the same win total, margin breaks the tie',
  (select count(*) from cfb_runs a join cfb_runs b on a.wins=b.wins
    where a.point_diff > b.point_diff and a.score <= b.score) = 0);

\echo ''
\echo '=== every board query is an index scan, not a table scan ==='
-- AT REALISTIC SIZE, which is the only size the question means anything at. On a
-- dozen rows Postgres reads the whole table because that is genuinely cheaper,
-- so a plan test against the rows above would prove nothing about the plan a
-- real board gets. 200,000 runs is far more than this game is likely to see.
--
-- Inserted directly rather than through cfb_submit_run(), because the point here
-- is the shape of the read path and 200,000 round trips through the validator
-- would take minutes to prove nothing extra.
insert into cfb_runs (
  regular_wins, playoff_wins, wins, losses, games, national_rank, playoff_seed,
  made_playoffs, title_won, perfect, bowl_won, seed_label,
  point_diff, chemistry_pct, spend_musd, overall, picks, run_mode
)
select
  g % 13, 0, g % 13, 12 - (g % 13), 12,
  1 + (g % 134), case when (g % 134) < 12 then 1 + (g % 134) else null end,
  (g % 134) < 12, false, false, false, 'bulk',
  round((((g * 7) % 800) / 10.0 - 40)::numeric, 1), 5.0, 12.0,
  round((30 + ((g * 13) % 700) / 10.0)::numeric, 2),
  array['bulk' || g || ':2016','b2:2007','b3:2014','b4:2014','b5:2009','b6:2017'],
  /* Spread across the six competitions, so the plan tests below are asking the
     question a real board asks: find one mode's rows among five others'. */
  (array['free','conf:SEC','conf:Big Ten','conf:Big 12','conf:ACC','conf:Pac-12'])[1 + g % 6]
from generate_series(1, 200000) g;
update cfb_runs set user_id='11111111-1111-1111-1111-111111111111'
 where id % 997 = 0;
/* NAMED ON A THIN SLICE, which is the shape that matters. The board lists only
   named seasons, and on a real board most seasons are guests, so the partial
   indexes in 67 have to be tested against a table where the predicate is highly
   selective. One row in 997 is roughly the ratio the football board measured at
   two million rows, and it is the ratio that makes an unindexed filter expensive:
   the planner walks the mode index in score order and discards 996 rows for every
   one it keeps. Naming every row instead would make the filter free and the test
   meaningless. */
update cfb_runs set display_name='bulkcoach'
 where id % 997 = 0;
analyze cfb_runs;

-- EXPLAIN returns one row per plan line, and `execute ... into` keeps only the
-- first, which is the Limit node and never names an index. Collect every line.
create or replace function t_plan(q text) returns text
language plpgsql as $$
declare v text := ''; r text;
begin
  for r in execute 'explain ' || q loop v := v || r || E'\n'; end loop;
  return v;
end $$;
-- EVERY BOARD QUERY CARRIES A MODE now, so every index has to lead with one: a
-- leading equality followed by the sort column is what lets Postgres satisfy the
-- filter and the order from a single scan.
select t_ok('the record board uses cfb_runs_mode_score_idx',
  t_plan('select id from cfb_runs where run_mode = ''free'' order by score desc, created_at asc limit 50')
    like '%cfb_runs_mode_score_idx%');
select t_ok('the overall board uses cfb_runs_mode_overall_idx',
  t_plan('select id from cfb_runs where run_mode = ''free'' and overall is not null order by overall desc, created_at asc limit 50')
    like '%cfb_runs_mode_overall_idx%');
select t_ok('the ranking board uses cfb_runs_mode_rank_idx',
  t_plan('select id from cfb_runs where run_mode = ''free'' order by national_rank asc, created_at asc limit 50')
    like '%cfb_runs_mode_rank_idx%');
select t_ok('a conference board is an index scan too',
  t_plan('select id from cfb_runs where run_mode = ''conf:SEC'' order by score desc, created_at asc limit 50')
    like '%cfb_runs_mode_score_idx%');
select t_ok('a player''s own history uses cfb_runs_user_idx',
  t_plan('select id from cfb_runs where user_id = ''11111111-1111-1111-1111-111111111111'' order by created_at desc limit 50')
    like '%cfb_runs_user_idx%');

-- THE NAMED BOARD, which is what the game actually lists now. Each of these is the
-- query above plus `display_name is not null`, and each must land on one of the partial
-- indexes from 67 rather than on the mode index with a filter bolted on: on a board
-- where most seasons are guests, the second one degrades with seasons PLAYED and the
-- first does not. If one of these starts naming a cfb_runs_mode_* index, the board
-- still returns the right rows and quietly gets slower with every guest run, which is
-- the failure worth catching early.
--
-- THE FAMILY, NOT THE EXACT INDEX, and that is deliberate. At the ratio above there
-- are a few dozen named seasons per mode, so once the planner is inside any partial
-- index it has already discarded 99.9% of the table and sorting what is left is free.
-- It therefore picks whichever named index it likes and sorts, which is the correct
-- plan and not the "matching" one. Demanding cfb_runs_named_score_idx for the score
-- board would be asserting the planner's cost model at one particular table shape;
-- what actually matters, and all that is worth pinning, is that the scan starts from
-- a partial index at all. A young board really does look like this.
select t_ok('the named record board scans a named index',
  t_plan('select id from cfb_runs where run_mode = ''free'' and display_name is not null order by score desc, created_at asc limit 50')
    like '%cfb_runs_named%');
select t_ok('the named overall board scans a named index',
  t_plan('select id from cfb_runs where run_mode = ''free'' and display_name is not null and overall is not null order by overall desc, created_at asc limit 50')
    like '%cfb_runs_named%');
select t_ok('the named ranking board scans a named index',
  t_plan('select id from cfb_runs where run_mode = ''free'' and display_name is not null order by national_rank asc, created_at asc limit 50')
    like '%cfb_runs_named%');
select t_ok('the newest-first board scans a named index',
  t_plan('select id from cfb_runs where run_mode = ''free'' and display_name is not null order by created_at desc, score desc limit 50')
    like '%cfb_runs_named%');
-- REVERSED, which the direction button on the board can now ask for. The whole cost
-- argument for that button is that Postgres reads an index backwards as cheaply as
-- forwards -- but only when EVERY key reverses together, which is why cfb/board.js
-- flips the created_at tiebreak along with the sort key. These three are the queries
-- it sends with the direction turned round, and they have to land on a partial index
-- exactly as the natural three above do.
--
-- Note the tiebreak on the ranking axis: reversed is created_at DESC, and NATURAL is
-- created_at ASC, matching the ranking check above. That is not symmetry for its own
-- sake -- national_rank's index is (national_rank ASC, created_at asc), so its natural
-- read is forwards, and asking for a DESC tiebreak there was a forward scan plus a
-- sort. board.js used to key the tiebreak on the literal direction, which is only
-- right for the two axes whose index runs (col desc, created_at asc).
select t_ok('the reversed record board scans a named index',
  t_plan('select id from cfb_runs where run_mode = ''free'' and display_name is not null order by score asc, created_at desc limit 50')
    like '%cfb_runs_named%');
select t_ok('the reversed overall board scans a named index',
  t_plan('select id from cfb_runs where run_mode = ''free'' and display_name is not null and overall is not null order by overall asc, created_at desc limit 50')
    like '%cfb_runs_named%');
select t_ok('the reversed ranking board scans a named index',
  t_plan('select id from cfb_runs where run_mode = ''free'' and display_name is not null order by national_rank desc, created_at desc limit 50')
    like '%cfb_runs_named%');

-- And the thing those four are really guarding against, stated once directly.
select t_ok('  ...and never the whole-mode index with a filter on top',
  t_plan('select id from cfb_runs where run_mode = ''free'' and display_name is not null order by score desc, created_at asc limit 50')
    not like '%cfb_runs_mode_%');
-- The count behind "N on the board" is the same predicate with no order, and it has
-- to come off the index too or the cheap half of the header line is the expensive one.
select t_ok('counting the named field is an index scan',
  t_plan('select count(*) from cfb_runs where run_mode = ''free'' and display_name is not null')
    like '%cfb_runs_named%');

\echo ''
select 'rows recorded: ' || count(*) from cfb_runs;

-- Timings, so a regression in the read path shows up as a number rather than a feeling.
\echo ''
\echo '=== board timings at 200k rows ==='
\timing on
select count(*) from (select id from cfb_runs order by score desc, created_at asc limit 50) t;
select count(*) from cfb_runs where score > 130000;
select count(*) from (select id from cfb_runs where overall is not null order by overall desc, created_at asc limit 50) t;
\timing off

-- ---------------------------------------------------------------------------
-- The ranking a season is submitted with is the SELECTION one, not the final one
-- ---------------------------------------------------------------------------
-- These two are the same season told two ways, and they are here because the
-- game told it the wrong way. The final ranking is settled on the field, so a
-- champion finishes first however they were seeded; the selection ranking is
-- what the twelve games earned and is the one seedFromRanking() ties the seed
-- to. Sending the final one meant every title won from outside the top four
-- seeds arrived as "No. 1 seed, four playoff wins" and was refused, which is the
-- exact set of seasons most worth having on a board.
\echo ''
select t_ok('a 9 seed that won the title records on its selection ranking',
  t_submit(11, 9, 4) like 'id:%');
select t_ok('  ...and keeps the seed, the wins and the trophy',
  (select playoff_seed = 9 and playoff_wins = 4 and title_won and not perfect
     from cfb_runs order by id desc limit 1));
select t_ok('the same season sent as the final ranking is refused',
  t_submit(11, 1, 4) like 'ERR:%0..3 for the No. 1 seed%');

-- The bulk rows have done their job, so they go. They exist to make the planner
-- choose a real board's plan, and nothing after this file wants them: the browser
-- tests run against this same database, and 200,000 synthetic near-perfect seasons
-- buried the one season those tests had just played, so "the board marks the row
-- as yours" failed for a reason that had nothing to do with the board.
delete from cfb_runs where seed_label = 'bulk';
analyze cfb_runs;
\echo ''
select 'bulk rows cleared, real rows left: ' || count(*) from cfb_runs;
