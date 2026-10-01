-- ---------------------------------------------------------------------------
-- 130_hoops_careers.sql against a real Postgres.
--
--   createdb hoops_careers
--   psql -d hoops_careers -c 'create role authenticated; create role anon;'
--   psql -d hoops_careers -f supabase/test/hoops_board_base.sql
--   psql -d hoops_careers -f supabase/130_hoops_careers.sql
--   psql -d hoops_careers -f supabase/test/hoops_careers_test.sql
--
-- One line per check, every one starting " ok ". The base file is the hoops
-- board's, because 130 reads exactly what 108 reads: auth.uid() and the
-- username column of profiles.
--
-- Most of this is REFUSALS, for 108's reason: board.js fails soft, so a check
-- that stopped refusing would not show on any screen. The board would quietly
-- fill with careers the game cannot produce.
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

truncate public.rtf_careers;
select be(null);

-- A legal career, with what the tests vary as arguments. A long, good one:
-- 18 seasons, 24,000 points, two rings and an MVP.
create or replace function pg_temp.car(id text, rings int default 2, mvp int default 1,
  fmvp int default 1, an int default 6, an1 int default 3, road boolean default false,
  ncaa int default 0, jersey text default 'BOS', player text default 'Dante Okafor')
returns bigint language sql as $$
  select rtf_submit_career(id, player, 'SF', 23, road, null, 4, 2026, 2043,
    array['BOS','MIA'], jersey, 25.4, 18, 1350, 24000, 7100, 4300,
    rings, mvp, fmvp, an, an1, 9, 0, 1, 1, ncaa, 0, 0)
$$;

-- ── the score is the server's ──────────────────────────────────────────────
select pg_temp.ck('a legal career lands', pg_temp.car('c1') is not null);
-- 24000*14 + 7100*5 + 4300*7 = 336000 + 35500 + 30100 = 401600
-- (2*4 + 13 + 6 + 3*5 + 9*2 + 0 + 2 + 2) * 10000 = 64 * 10000 = 640000
-- (6 - 3) * 25000 = 75000; total 1116600, half up: 112
select pg_temp.ck('its score is worked out here, not sent: 112',
  (select score from rtf_careers where client_id = 'c1') = 112);
select pg_temp.ck('a total exactly on a half rounds up, the way the page does',
  rtf_career_score(500, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0) = 1);
select pg_temp.ck('and just under a half rounds down',
  rtf_career_score(357, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0) = 0);
select pg_temp.ck('a second-team All-NBA is worth two and a half',
  rtf_career_score(0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0) = 5);
select pg_temp.ck('a guest carries no name',
  (select display_name from rtf_careers where client_id = 'c1') is null);

-- ── one row per career ─────────────────────────────────────────────────────
select pg_temp.ck('the same career twice is the first row',
  pg_temp.car('c1', 3) = (select id from rtf_careers where client_id = 'c1'));
select pg_temp.ck('and the first totals stand',
  (select count(*) from rtf_careers where client_id = 'c1') = 1
  and (select rings from rtf_careers where client_id = 'c1') = 2);

-- ── refusals ───────────────────────────────────────────────────────────────
select pg_temp.ck('more rings than seasons is refused',
  pg_temp.boom('select pg_temp.car(''r1'', 19, 0, 0)') like '%more rings than seasons%');
select pg_temp.ck('a Finals MVP without a ring is refused',
  pg_temp.boom('select pg_temp.car(''r2'', 0, 0, 1)') like '%more Finals MVPs than rings%');
select pg_temp.ck('a first team that is not an All-NBA team is refused',
  pg_temp.boom('select pg_temp.car(''r3'', 2, 1, 1, 2, 3)') like '%a first team is an All-NBA team%');
select pg_temp.ck('a national title with no college is refused',
  pg_temp.boom('select pg_temp.car(''r4'', 2, 1, 1, 6, 3, false, 1)') like '%need a road career%');
select pg_temp.ck('the same title on a road career lands',
  pg_temp.boom('select pg_temp.car(''r5'', 2, 1, 1, 6, 3, true, 1)') is null);
select pg_temp.ck('a number retired by a club he never played for is refused',
  pg_temp.boom('select pg_temp.car(''r6'', 2, 1, 1, 6, 3, false, 0, ''LAL'')') like '%club he played for%');
select pg_temp.ck('a name with markup in it is refused',
  pg_temp.boom('select pg_temp.car(''r7'', 2, 1, 1, 6, 3, false, 0, ''BOS'', ''<b>x</b>'')') like '%player name looks wrong%');
select pg_temp.ck('a name with an apostrophe and a hyphen lands',
  pg_temp.boom('select pg_temp.car(''r8'', 2, 1, 1, 6, 3, false, 0, ''BOS'', ''D''''Angelo Smith-Ross'')') is null);
select pg_temp.ck('no name at all lands',
  pg_temp.boom('select pg_temp.car(''r9'', 2, 1, 1, 6, 3, false, 0, ''BOS'', null)') is null);
select pg_temp.ck('a career id with a quote in it is refused',
  pg_temp.boom('select pg_temp.car(''x''''y'')') like '%career id looks wrong%');
select pg_temp.ck('sixty points a game for a career is refused',
  pg_temp.boom('select rtf_submit_career(''r10'', null, ''SF'', 1, false, null, 4, 2026, 2027, array[''BOS''], null, 20,
    2, 100, 9000, 100, 100, 0,0,0,0,0,0,0,0,0,0,0,0)') like '%points look wrong%');
select pg_temp.ck('more seasons than years is refused',
  pg_temp.boom('select rtf_submit_career(''r11'', null, ''SF'', 1, false, null, 4, 2026, 2027, array[''BOS''], null, 20,
    5, 300, 3000, 100, 100, 0,0,0,0,0,0,0,0,0,0,0,0)') like '%more seasons than years%');

-- ── accounts ───────────────────────────────────────────────────────────────
select be(1);
-- Each write and the read that checks it are two statements, for the reason
-- the rename below gives.
select pg_temp.ck('jordan files a career', pg_temp.car('j1') is not null);
select pg_temp.ck('it carries his name, read from profiles',
  (select display_name from rtf_careers where client_id = 'j1') = 'jordan');
select pg_temp.ck('a guest career is claimed on the way in',
  rtf_claim_career((select id from rtf_careers where client_id = 'c1')));
select pg_temp.ck('and it carries his name now',
  (select display_name from rtf_careers where client_id = 'c1') = 'jordan');
select be(2);
select pg_temp.ck('a career somebody already owns cannot be claimed',
  not rtf_claim_career((select id from rtf_careers where client_id = 'c1'))
  and (select display_name from rtf_careers where client_id = 'c1') = 'jordan');
select be(1);
update public.profiles set username = 'mj23' where id = '00000000-0000-0000-0000-000000000001';
-- Two statements: a check in the statement that made the rename reads the
-- snapshot from before it.
select pg_temp.ck('a rename updates both careers on the account', rtf_rename_careers() = 2);
select pg_temp.ck('and both carry the new name',
  (select count(*) from rtf_careers where display_name = 'mj23') = 2);
update public.profiles set username = 'jordan' where id = '00000000-0000-0000-0000-000000000001';
select be(null);
select pg_temp.ck('a signed out claim does nothing',
  not rtf_claim_career((select id from rtf_careers where client_id = 'r9')));

-- ── the grants ─────────────────────────────────────────────────────────────
-- RLS narrows a grant, it does not make one. Asked as a real read as the real
-- role, and the write asked as a real insert, so a careless grant shows here.
set role anon;
select pg_temp.ck('anon can read the board', (select count(*) from rtf_careers) > 0);
select pg_temp.ck('anon cannot write the table directly',
  pg_temp.boom('insert into rtf_careers (client_id, score, pos, first_year, last_year, clubs, seasons, gp, pts, reb, ast)
    values (''forged'', 999, ''C'', 2026, 2027, array[''BOS''], 1, 10, 10, 10, 10)') like '%permission denied%');
reset role;
