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

-- Runs the function and reports whether it raised, and with what.
create or replace function t_submit(
  p_reg int, p_rank int, p_po int default 0, p_bowl_won boolean default false,
  p_picks text[] default array['a1:2019','b2:2020','c3:2021','d4:2015','e5:2011','f6:2008'],
  p_diff numeric default 10.0, p_chem numeric default 5.0, p_spend numeric default 12.5,
  p_sig int default 0, p_best int default null, p_respins int default 0,
  p_slots text[] default array['QB','RB','WR','WR','TE','FLEX']
) returns text
language plpgsql as $$
declare v_id bigint;
begin
  select cfb_submit_run(p_reg, p_rank, p_po, p_bowl_won, p_diff, p_chem, p_spend,
    p_respins, p_sig, p_best, p_picks, p_slots, 'seed', 100, 90.0, 1.05, 100.0, 74.0, 80)
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

-- The bowl tier is a function of losses, and the client never sends it.
select t_ok('7-5 ranked 60th reaches an ordinary bowl and loses it',
  t_submit(7, 60, 0, false, array['u1:2016','u2:2007','u3:2014','u4:2014','u5:2009','u6:2017']) like 'id:%');
select t_ok('  ...bowl tier, 7-6, 13 games',
  (select bowl='bowl' and not bowl_won and wins=7 and losses=6 and games=13
     from cfb_runs order by id desc limit 1));

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
  point_diff, chemistry_pct, spend_musd, overall, picks
)
select
  g % 13, 0, g % 13, 12 - (g % 13), 12,
  1 + (g % 134), case when (g % 134) < 12 then 1 + (g % 134) else null end,
  (g % 134) < 12, false, false, false, 'bulk',
  round((((g * 7) % 800) / 10.0 - 40)::numeric, 1), 5.0, 12.0,
  round((30 + ((g * 13) % 700) / 10.0)::numeric, 2),
  array['bulk' || g || ':2016','b2:2007','b3:2014','b4:2014','b5:2009','b6:2017']
from generate_series(1, 200000) g;
update cfb_runs set user_id='11111111-1111-1111-1111-111111111111'
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
select t_ok('the record board uses cfb_runs_score_idx',
  t_plan('select id from cfb_runs order by score desc, created_at asc limit 50') like '%cfb_runs_score_idx%');
select t_ok('the overall board uses cfb_runs_overall_idx',
  t_plan('select id from cfb_runs where overall is not null order by overall desc, created_at asc limit 50')
    like '%cfb_runs_overall_idx%');
select t_ok('the ranking board uses cfb_runs_rank_idx',
  t_plan('select id from cfb_runs order by national_rank asc, created_at asc limit 50')
    like '%cfb_runs_rank_idx%');
select t_ok('a player''s own history uses cfb_runs_user_idx',
  t_plan('select id from cfb_runs where user_id = ''11111111-1111-1111-1111-111111111111'' order by created_at desc limit 50')
    like '%cfb_runs_user_idx%');

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
