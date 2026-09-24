-- ---------------------------------------------------------------------------
-- The checks for 97_baseball_leaderboard.sql. See baseball_board_base.sql for
-- how to run it. Every line this prints should start with " ok ".
--
-- The refusal checks call the function with real typed arguments rather than
-- building a SQL string. An earlier version of this file built strings, got the
-- quoting wrong, and every refusal check "passed" on a syntax error: a test that
-- proves nothing while looking green. `throws` below now insists the failure is
-- a raised message and not a parse error.
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

-- Accepts only a run that IS refused, and only for a stated reason. A syntax
-- error (42601) is a broken check, not a passing one.
create or replace function throws(lbl text, body text) returns void
  language plpgsql as $$
begin
  execute 'do $inner$ begin ' || body || '; end $inner$';
  raise notice 'FAIL  % was accepted and should not have been', lbl;
exception
  when syntax_error then raise notice 'FAIL  % check is broken (syntax): %', lbl, sqlerrm;
  when others then raise notice ' ok   % refused: %', lbl, left(sqlerrm, 52);
end $$;

-- A legal twelve, in both slot shapes.
create or replace function pk() returns text[] language sql immutable as $$
  select array['a|2001|b','b|2001|b','c|2001|b','d|2001|b','e|2001|b','f|2001|b',
               'g|2001|b','h|2001|b','i|2001|b','j|2001|p','k|2001|p','l|2001|p'] $$;
create or replace function ls() returns text[] language sql immutable as $$
  select array['C','1B','2B','3B','SS','LF','CF','RF','DH','SP1','SP2','CL'] $$;
create or replace function ss() returns text[] language sql immutable as $$
  select array['SP1','SP2','SP3','SP4','SP5','RP1','RP2','RP3','RP4','RP5','SU','CL'] $$;

truncate rtd_runs;

-- ---- what the server derives from what the client sent ---------------------
do $$
declare i bigint; r rtd_runs%rowtype;
begin
  i := rtd_submit_run(103,3,'free',null,null,null,null,null,79,48,null,8.7,168,1,820,690,0,0,pk(),ls());
  select * into r from rtd_runs where id = i;
  perform ok('103 wins, losses derived',        r.losses::text,        '59');
  perform ok('103 wins, seed derived',          r.seed_label,          'Division winner');
  perform ok('103 wins, bracket derived',       r.playoff_rounds::text,'3');
  perform ok('3 of 3 rounds is a title',        r.title_won::text,     'true');
  perform ok('103 wins is not the record',      r.tied_record::text,   'false');

  i := rtd_submit_run(90,4,'free',null,null,null,null,null,76,120,null,6,160,2,null,null,0,0,pk(),ls());
  select * into r from rtd_runs where id = i;
  perform ok('90 wins is a wild card',          r.seed_label,          'Wild card');
  perform ok('a wild card plays four rounds',   r.playoff_rounds::text,'4');
  perform ok('4 of 4 rounds is a title',        r.title_won::text,     'true');

  i := rtd_submit_run(87,0,'free',null,null,null,null,null,70,400,null,5,150,0,null,null,0,0,pk(),ls());
  select * into r from rtd_runs where id = i;
  perform ok('87 wins misses October',          r.made_playoffs::text, 'false');
  perform ok('a missed season plays no rounds', r.playoff_rounds::text,'0');

  i := rtd_submit_run(117,3,'free',null,null,null,null,null,99,1,null,12,170,0,null,null,0,0,pk(),ls());
  select * into r from rtd_runs where id = i;
  perform ok('117 wins ties the record',        r.tied_record::text,   'true');
  perform ok('117 wins is the best ever',       r.is_goat::text,       'true');

  i := rtd_submit_run(95,1,'staff',null,null,null,null,null,63,null,3.16,4,165,0,null,null,0,0,pk(),ss());
  select * into r from rtd_runs where id = i;
  perform ok('a staff records its ERA',         r.staff_era::text,     '3.16');
  perform ok('a staff carries no rank',         coalesce(r.all_time_rank::text,'null'), 'null');
end $$;

-- ---- the ordering axis -----------------------------------------------------
do $$
declare a int; b int;
begin
  select score into a from rtd_runs where wins = 103;
  select score into b from rtd_runs where wins = 90 and playoff_wins = 4;
  perform ok('more wins outranks more playoff wins', (a > b)::text, 'true');
end $$;

-- ---- one daily per browser -------------------------------------------------
do $$
declare today text := (now() at time zone 'utc')::date::text; a bigint; b bigint;
begin
  a := rtd_submit_run(99,2,'free',null,null,null,today,'browser-1',82,20,null,7,169,0,null,null,0,0,pk(),ls());
  b := rtd_submit_run(120,3,'free',null,null,null,today,'browser-1',95,2,null,9,169,0,null,null,0,0,pk(),ls());
  perform ok('the first daily records',  (a is not null)::text, 'true');
  perform ok('the second is turned away',(b is null)::text,     'true');
  perform ok('one row on the daily board',
    (select count(*) from rtd_runs where daily_key is not null)::text, '1');
  perform ok('and it is the one that was played first',
    (select wins::text from rtd_runs where daily_key is not null), '99');
  perform ok('a different browser still records',
    (rtd_submit_run(88,0,'free',null,null,null,today,'browser-2',70,300,null,3,160,0,null,null,0,0,pk(),ls())
      is not null)::text, 'true');
end $$;

-- ---- the name is read, never sent ------------------------------------------
do $$
declare u uuid := '11111111-1111-1111-1111-111111111111'; i bigint;
begin
  insert into profiles (id, username) values (u, 'Coby') on conflict do nothing;
  perform set_config('test.uid', u::text, true);
  i := rtd_submit_run(101,1,'free',null,null,null,null,null,80,60,null,5,165,0,null,null,0,0,pk(),ls());
  perform ok('a signed-in run takes its name from profiles',
    (select display_name from rtd_runs where id = i), 'Coby');
  perform set_config('test.uid', '', true);
  i := rtd_submit_run(92,0,'free',null,null,null,null,null,74,200,null,4,160,0,null,null,0,0,pk(),ls());
  perform ok('a guest run stores no name',
    coalesce((select display_name from rtd_runs where id = i),'null'), 'null');
end $$;

-- ---- everything it must refuse ---------------------------------------------
select throws('playoff wins on a missed season',
  'perform rtd_submit_run(70,3,''free'',null,null,null,null,null,60,900,null,0,100,0,null,null,0,0,pk(),ls())');
select throws('more rounds than the bracket has',
  'perform rtd_submit_run(100,4,''free'',null,null,null,null,null,80,30,null,0,150,0,null,null,0,0,pk(),ls())');
select throws('more wins than games',
  'perform rtd_submit_run(170,0,''free'',null,null,null,null,null,90,1,null,0,150,0,null,null,0,0,pk(),ls())');
select throws('a negative record',
  'perform rtd_submit_run(-4,0,''free'',null,null,null,null,null,50,900,null,0,100,0,null,null,0,0,pk(),ls())');
select throws('a payroll above the cap plus fees',
  'perform rtd_submit_run(95,0,''free'',null,null,null,null,null,80,30,null,0,240,3,null,null,0,0,pk(),ls())');
select throws('chemistry above the ceiling',
  'perform rtd_submit_run(95,0,''free'',null,null,null,null,null,80,30,null,40,150,0,null,null,0,0,pk(),ls())');
select throws('a rating off the scale',
  'perform rtd_submit_run(95,0,''free'',null,null,null,null,null,140,30,null,0,150,0,null,null,0,0,pk(),ls())');
select throws('an all-time rank on a staff',
  'perform rtd_submit_run(95,0,''staff'',null,null,null,null,null,63,12,3.1,0,150,0,null,null,0,0,pk(),ss())');
select throws('a staff ERA on a lineup',
  'perform rtd_submit_run(95,0,''free'',null,null,null,null,null,80,30,3.1,0,150,0,null,null,0,0,pk(),ls())');
select throws('a staff filed under lineup slots',
  'perform rtd_submit_run(95,0,''staff'',null,null,null,null,null,63,null,3.1,0,150,0,null,null,0,0,pk(),ls())');
select throws('a lineup filed under staff slots',
  'perform rtd_submit_run(95,0,''free'',null,null,null,null,null,80,30,null,0,150,0,null,null,0,0,pk(),ss())');
select throws('an unknown mode',
  'perform rtd_submit_run(95,0,''cheating'',null,null,null,null,null,80,30,null,0,150,0,null,null,0,0,pk(),ls())');
select throws('a franchise field on a classic run',
  'perform rtd_submit_run(95,0,''free'',''NYY'',null,null,null,null,80,30,null,0,150,0,null,null,0,0,pk(),ls())');
select throws('One Franchise naming no club',
  'perform rtd_submit_run(95,0,''franchise'',null,null,null,null,null,80,30,null,0,150,0,null,null,0,0,pk(),ls())');
select throws('Division Draft naming no division',
  'perform rtd_submit_run(95,0,''division'',null,null,null,null,null,80,30,null,0,150,0,null,null,0,0,pk(),ls())');
select throws('a roster that is not twelve',
  'perform rtd_submit_run(95,0,''free'',null,null,null,null,null,80,30,null,0,150,0,null,null,0,0,array[''a|1|b''],ls())');
select throws('the same slot twice',
  'perform rtd_submit_run(95,0,''free'',null,null,null,null,null,80,30,null,0,150,0,null,null,0,0,pk(),'
  || 'array[''C'',''C'',''2B'',''3B'',''SS'',''LF'',''CF'',''RF'',''DH'',''SP1'',''SP2'',''CL''])');
select throws('more re-spins than exist',
  'perform rtd_submit_run(95,0,''free'',null,null,null,null,null,80,30,null,0,150,4,null,null,0,0,pk(),ls())');
select throws('a backdated daily',
  'perform rtd_submit_run(95,0,''free'',null,null,null,''2020-01-01'',''cli'',80,30,null,0,150,0,null,null,0,0,pk(),ls())');
select throws('a daily played under a mode',
  'perform rtd_submit_run(95,0,''staff'',null,null,null,(now() at time zone ''utc'')::date::text,''cli'',63,null,3.1,0,150,0,null,null,0,0,pk(),ss())');
