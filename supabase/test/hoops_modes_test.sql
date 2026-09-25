-- ---------------------------------------------------------------------------
-- 116_hoops_modes.sql against a real Postgres.
--
--   createdb hoops_modes
--   psql -d hoops_modes -c 'create role authenticated; create role anon;'
--   psql -d hoops_modes -f supabase/test/hoops_board_base.sql
--   psql -d hoops_modes -f supabase/116_hoops_modes.sql
--   psql -d hoops_modes -f supabase/test/hoops_modes_test.sql
--
-- One line per check, every one starting " ok ". The base file is the hoops
-- board's, because 116 reads exactly what 108 reads: auth.uid() and the
-- username column of profiles.
--
-- Like 108's test, most of this is REFUSALS. board.js fails soft, so a check
-- that stopped refusing would not show on any screen: the board would quietly
-- fill with plays the game cannot produce.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\pset pager off

create or replace function pg_temp.ck(label text, cond boolean) returns void
language plpgsql as $$
begin
  raise notice '%', (case when cond then ' ok  ' else ' FAIL ' end) || label;
end $$;

create or replace function pg_temp.boom(sql text) returns text
language plpgsql as $$
begin
  execute sql;
  return null;
exception when others then
  return sqlerrm;
end $$;

update public.profiles set username = 'jordan' where id = '00000000-0000-0000-0000-000000000001';
update public.profiles set username = 'pippen' where id = '00000000-0000-0000-0000-000000000002';
truncate public.rtf_plays;
select be(null);

-- A legal Fix History submit for today, with the odds and the move varied.
create or replace function pg_temp.fix(odds numeric, day int default null, inkey text default 'rodmade01|1992|DET')
returns bigint language sql as $$
  select rtf_submit_fix(coalesce(day, today_day()), 'BOS_2009', 1,
    'piercpa01|2009|BOS', inkey, odds, 0.237, 64, true)
$$;
create or replace function pg_temp.ps(n int, solved boolean default true, day int default null)
returns bigint language sql as $$
  select rtf_submit_passes(coalesce(day, today_day()),
    (array['birdla01','shawbr01','smithjo02','westbru01','a01','b01','c01','d01','e01','f01','g01','h01'])[1:n+1],
    3, solved)
$$;

-- ── the day ────────────────────────────────────────────────────────────────
select pg_temp.ck('today agrees with the test''s own arithmetic', rtf_play_today() = today_day());

-- ── Fix History ────────────────────────────────────────────────────────────
select pg_temp.ck('a legal fix lands', pg_temp.fix(0.3712) is not null);
select pg_temp.ck('its score is the odds, to four places',
  (select score from rtf_plays where mode = 'fix' order by id desc limit 1) = 0.3712);
select pg_temp.ck('a guest carries no name',
  (select display_name from rtf_plays where mode = 'fix' order by id desc limit 1) is null);
select pg_temp.ck('odds over 1 are refused',
  pg_temp.boom('select pg_temp.fix(1.2)') like '%odds must be 0 to 1%');
select pg_temp.ck('a day from last week is refused',
  pg_temp.boom('select pg_temp.fix(0.3, today_day() - 5)') like '%not close enough%');
select pg_temp.ck('yesterday is allowed, for a play across midnight',
  pg_temp.boom('select pg_temp.fix(0.3, today_day() - 1, ''kerrst01|1996|CHI'')') is null);
select pg_temp.ck('a slot of 5 is refused',
  pg_temp.boom('select rtf_submit_fix(today_day(), ''BOS_2009'', 5, ''piercpa01|2009|BOS'', ''a01|1990|BOS'', 0.3, 0.2, 60, false)') like '%slot must be 0 to 4%');
select pg_temp.ck('a player key without a club is refused',
  pg_temp.boom('select pg_temp.fix(0.3, null, ''rodmade01|1992'')') like '%new player looks wrong%');
select pg_temp.ck('a replay of 90 wins is refused',
  pg_temp.boom('select rtf_submit_fix(today_day(), ''BOS_2009'', 1, ''piercpa01|2009|BOS'', ''a01|1990|BOS'', 0.3, 0.2, 90, false)') like '%replay wins%');

-- One per account per day, and the first stands.
select be(1);
select pg_temp.ck('jordan files a fix', pg_temp.fix(0.25, null, 'grantho01|1991|CHI') is not null);
select pg_temp.ck('it carries his name, read from profiles',
  (select display_name from rtf_plays where mode = 'fix' and user_id is not null order by id desc limit 1) = 'jordan');
select pg_temp.ck('a second fix today hands back the first',
  pg_temp.fix(0.60, null, 'looneke01|2023|GSW') = (select id from rtf_plays where mode = 'fix' and display_name = 'jordan' limit 1));
select pg_temp.ck('and the first odds still stand',
  (select count(*) from rtf_plays where mode = 'fix' and display_name = 'jordan') = 1
  and (select score from rtf_plays where mode = 'fix' and display_name = 'jordan') = 0.25);

-- ── Six Passes ─────────────────────────────────────────────────────────────
select be(null);
select pg_temp.ck('a solved chain of 3 lands', pg_temp.ps(3) is not null);
select pg_temp.ck('it scores 97',
  (select score from rtf_plays where mode = 'passes' order by id desc limit 1) = 97);
-- The submit is its own statement. Called inside a WHERE it runs once per
-- row scanned and files a play each time, which is a test that writes the
-- table it is reading.
select pg_temp.ps(10, false) as clock_id \gset
select pg_temp.ck('a shot clock violation scores 0',
  (select score from rtf_plays where id = :clock_id) = 0);
select pg_temp.ck('eleven passes is past the shot clock',
  pg_temp.boom('select pg_temp.ps(11)') like '%1 to 10 passes%');
select pg_temp.ck('a solved chain under par is refused',
  pg_temp.boom('select pg_temp.ps(2)') like '%under par%');
select pg_temp.ck('an unsolved chain under par is fine, it just did not get there',
  pg_temp.boom('select pg_temp.ps(2, false)') is null);
select pg_temp.ck('a player id with a space is refused',
  pg_temp.boom('select rtf_submit_passes(today_day(), array[''birdla01'',''drop table''], 1, true)') like '%player id looks wrong%');
select be(2);
select pg_temp.ck('pippen files a chain', pg_temp.ps(4) is not null);
select pg_temp.ck('a second chain today is the first one back',
  pg_temp.ps(3) = (select id from rtf_plays where mode = 'passes' and display_name = 'pippen' limit 1));

-- ── Conquest ───────────────────────────────────────────────────────────────
select be(null);
select pg_temp.ck('a run lands',
  rtf_submit_conquest(12, 0, false, 'CHI_1996',
    array['a01|1990|BOS','b01|1990|BOS','c01|1990|BOS','d01|1990|BOS','e01|1990|BOS'],
    array['jordami01|1996|CHI'], 'seedabc123') is not null);
select pg_temp.ck('its score is the wins and its day is the server''s',
  (select score = 12 and day = today_day() from rtf_plays where seed = 'seedabc123'));
select pg_temp.ck('the same run twice is one row',
  rtf_submit_conquest(12, 0, false, 'CHI_1996', null, null, 'seedabc123')
    = (select id from rtf_plays where seed = 'seedabc123')
  and (select count(*) from rtf_plays where seed = 'seedabc123') = 1);
select pg_temp.ck('four lives is refused',
  pg_temp.boom('select rtf_submit_conquest(3, 4, false, null, null, null, ''seedxyz999'')') like '%lives must be 0 to 3%');
select pg_temp.ck('more steals than wins is refused',
  pg_temp.boom('select rtf_submit_conquest(1, 0, false, null, null, array[''a|1|X'',''b|1|X''], ''seedxyz998'')') like '%more steals than wins%');
select pg_temp.ck('a roster of four is refused',
  pg_temp.boom('select rtf_submit_conquest(3, 0, false, null, array[''a'',''b'',''c'',''d''], null, ''seedxyz997'')') like '%a roster is five%');
select pg_temp.ck('an uppercase seed is refused',
  pg_temp.boom('select rtf_submit_conquest(3, 0, false, null, null, null, ''SEED-1'')') like '%seed looks wrong%');

-- ── claiming ───────────────────────────────────────────────────────────────
select be(null);
select pg_temp.ck('a signed out visitor cannot claim',
  rtf_claim_play((select id from rtf_plays where seed = 'seedabc123')) = false);
select be(2);
select pg_temp.ck('pippen claims the guest conquest run',
  rtf_claim_play((select id from rtf_plays where seed = 'seedabc123')) = true);
select pg_temp.ck('and it is his',
  (select display_name from rtf_plays where seed = 'seedabc123') = 'pippen');
select be(1);
select pg_temp.ck('jordan cannot take it off him',
  rtf_claim_play((select id from rtf_plays where seed = 'seedabc123')) = false);
select pg_temp.ck('jordan cannot claim a second fix for a day he has filed',
  rtf_claim_play((select id from rtf_plays where mode = 'fix' and user_id is null and day = today_day() limit 1)) = false);

-- ── renames ────────────────────────────────────────────────────────────────
update public.profiles set username = 'mj' where id = '00000000-0000-0000-0000-000000000001';
-- Two statements: a subquery in the statement that makes the change reads the
-- snapshot from before it.
select rtf_rename_plays() as renamed \gset
select pg_temp.ck('a rename carries onto his plays', :renamed >= 1
  and not exists (select 1 from rtf_plays where display_name = 'jordan')
  and exists (select 1 from rtf_plays where display_name = 'mj'));
update public.profiles set username = 'jordan' where id = '00000000-0000-0000-0000-000000000001';

-- ── who may do what ────────────────────────────────────────────────────────
select pg_temp.ck('anon may read the table',
  has_table_privilege('anon', 'public.rtf_plays', 'select'));
select pg_temp.ck('anon may not insert into it',
  not has_table_privilege('anon', 'public.rtf_plays', 'insert'));
select pg_temp.ck('authenticated may not update it',
  not has_table_privilege('authenticated', 'public.rtf_plays', 'update'));
select pg_temp.ck('anon may not claim',
  not has_function_privilege('anon', 'rtf_claim_play(bigint)', 'execute'));
select pg_temp.ck('the submits are security definer, so the grant above is the only way in',
  (select bool_and(prosecdef) from pg_proc
    where proname in ('rtf_submit_fix','rtf_submit_passes','rtf_submit_conquest','rtf_claim_play')));
select pg_temp.ck('the one-a-day index exists',
  exists (select 1 from pg_indexes where indexname = 'rtf_plays_daily_one_idx'));
