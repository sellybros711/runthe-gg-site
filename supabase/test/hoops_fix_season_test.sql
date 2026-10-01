-- ---------------------------------------------------------------------------
-- 118_hoops_fix_season.sql against a real Postgres.
--
--   createdb hoops_season
--   psql -d hoops_season -c 'create role authenticated; create role anon;'
--   psql -d hoops_season -f supabase/test/hoops_board_base.sql
--   psql -d hoops_season -f supabase/116_hoops_modes.sql
--   psql -d hoops_season -f supabase/117_hoops_trade.sql
--   psql -d hoops_season -f supabase/118_hoops_fix_season.sql
--   psql -d hoops_season -f supabase/118_hoops_fix_season.sql     twice, on purpose
--   psql -d hoops_season -f supabase/test/hoops_fix_season_test.sql
--
-- One line per check, every one starting " ok ". Mostly refusals, because
-- board.js fails soft and a check that stopped refusing shows on no screen.
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
truncate public.rtf_plays;
select be(null);

-- A legal season: Booker and a pick to Philadelphia in preseason, then one of
-- the men who came back and Ayton to Utah at game 20.
create or replace function pg_temp.good() returns jsonb language sql as $$
  select '[
    {"w":0,"with":"PHI_2021","outs":["bookede01|2021|PHO"],"picks":["R1Y2022"],"ins":["harrito02|2021|PHI","curryse01|2021|PHI"]},
    {"w":1,"with":"UTA_2021","outs":["harrito02|2021|PHI","aytonde01|2021|PHO"],"picks":[],"ins":["goberru01|2021|UTA"]}
  ]'::jsonb
$$;
create or replace function pg_temp.fs(trades jsonb, headline text default 'goberru01|2021|UTA', odds numeric default 0.31, day int default null)
returns bigint language sql as $$
  select rtf_submit_fix_season(coalesce(day, today_day()), 'PHO_2021', trades, headline, odds, 0.05, 55, false)
$$;
create or replace function pg_temp.one(t text) returns jsonb language sql as $$ select ('[' || t || ']')::jsonb $$;

select pg_temp.ck('a legal season lands, the second trade sending on a man the first took back', pg_temp.fs(pg_temp.good()) is not null);
select pg_temp.ck('its score is the odds', (select score from rtf_plays order by id desc limit 1) = 0.31);
select pg_temp.ck('the whole season is kept',
  (select fix_trades = pg_temp.good() from rtf_plays order by id desc limit 1));
select pg_temp.ck('the headline is in fix_in so the move count reads',
  (select fix_in = 'goberru01|2021|UTA' and fix_out = 'bookede01|2021|PHO' from rtf_plays order by id desc limit 1));
select pg_temp.ck('a retry inside the minute lands on the same row',
  pg_temp.fs(pg_temp.good()) = (select max(id) from rtf_plays));
select pg_temp.ck('standing pat all season is a result too',
  pg_temp.boom($q$select pg_temp.fs('[]'::jsonb, null, 0.05)$q$) is null);

select pg_temp.ck('five trades are refused',
  pg_temp.boom($q$select pg_temp.fs(pg_temp.one(
    '{"w":0,"with":"PHI_2021","outs":["a01|2021|PHO"],"ins":["b01|2021|PHI"]},{"w":1,"with":"PHI_2021","outs":["c01|2021|PHO"],"ins":["d01|2021|PHI"]},{"w":2,"with":"PHI_2021","outs":["e01|2021|PHO"],"ins":["f01|2021|PHI"]},{"w":3,"with":"PHI_2021","outs":["g01|2021|PHO"],"ins":["h01|2021|PHI"]},{"w":3,"with":"PHI_2021","outs":["i01|2021|PHO"],"ins":["j01|2021|PHI"]}'
  ), 'b01|2021|PHI')$q$) like '%four trades at most%');
select pg_temp.ck('two trades in one window are refused',
  pg_temp.boom($q$select pg_temp.fs(pg_temp.one(
    '{"w":1,"with":"PHI_2021","outs":["a01|2021|PHO"],"ins":["b01|2021|PHI"]},{"w":1,"with":"UTA_2021","outs":["c01|2021|PHO"],"ins":["d01|2021|UTA"]}'
  ), 'b01|2021|PHI')$q$) like '%one trade a window%');
select pg_temp.ck('a fifth window is refused',
  pg_temp.boom($q$select pg_temp.fs(pg_temp.one('{"w":4,"with":"PHI_2021","outs":["a01|2021|PHO"],"ins":["b01|2021|PHI"]}'), 'b01|2021|PHI')$q$) like '%windows 0 to 3%');
select pg_temp.ck('four out is refused',
  pg_temp.boom($q$select pg_temp.fs(pg_temp.one('{"w":0,"with":"PHI_2021","outs":["a01|2021|PHO","b01|2021|PHO","c01|2021|PHO","d01|2021|PHO"],"ins":["x01|2021|PHI"]}'), 'x01|2021|PHI')$q$) like '%one to three players out%');
select pg_temp.ck('picks alone are refused, a player has to go',
  pg_temp.boom($q$select pg_temp.fs(pg_temp.one('{"w":0,"with":"PHI_2021","outs":[],"picks":["R1Y2022"],"ins":["x01|2021|PHI"]}'), 'x01|2021|PHI')$q$) like '%one to three players out%');
select pg_temp.ck('a partner from another season is refused',
  pg_temp.boom($q$select pg_temp.fs(pg_temp.one('{"w":0,"with":"PHI_2020","outs":["a01|2021|PHO"],"ins":["x01|2020|PHI"]}'), 'x01|2020|PHI')$q$) like '%another season%');
select pg_temp.ck('a man in who is not on the partner is refused',
  pg_temp.boom($q$select pg_temp.fs(pg_temp.one('{"w":0,"with":"PHI_2021","outs":["a01|2021|PHO"],"ins":["x01|2021|LAL"]}'), 'x01|2021|LAL')$q$) like '%not on the partner%');
select pg_temp.ck('a man out who was never on the team is refused',
  pg_temp.boom($q$select pg_temp.fs(pg_temp.one('{"w":0,"with":"PHI_2021","outs":["a01|2021|LAL"],"ins":["x01|2021|PHI"]}'), 'x01|2021|PHI')$q$) like '%not on the team%');
select pg_temp.ck('a man sent out twice is refused',
  pg_temp.boom($q$select pg_temp.fs(pg_temp.one(
    '{"w":0,"with":"PHI_2021","outs":["a01|2021|PHO"],"ins":["x01|2021|PHI"]},{"w":1,"with":"UTA_2021","outs":["a01|2021|PHO"],"ins":["y01|2021|UTA"]}'
  ), 'x01|2021|PHI')$q$) like '%not on the team%');
select pg_temp.ck('a pick the team does not own is refused',
  pg_temp.boom($q$select pg_temp.fs(pg_temp.one('{"w":0,"with":"PHI_2021","outs":["a01|2021|PHO"],"picks":["R1Y2030"],"ins":["x01|2021|PHI"]}'), 'x01|2021|PHI')$q$) like '%not a pick this team owns%');
select pg_temp.ck('a third-year second-round pick is not one of the five',
  pg_temp.boom($q$select pg_temp.fs(pg_temp.one('{"w":0,"with":"PHI_2021","outs":["a01|2021|PHO"],"picks":["R2Y2024"],"ins":["x01|2021|PHI"]}'), 'x01|2021|PHI')$q$) like '%not a pick this team owns%');
select pg_temp.ck('a pick sent twice is refused',
  pg_temp.boom($q$select pg_temp.fs(pg_temp.one(
    '{"w":0,"with":"PHI_2021","outs":["a01|2021|PHO"],"picks":["R1Y2022"],"ins":["x01|2021|PHI"]},{"w":1,"with":"UTA_2021","outs":["b01|2021|PHO"],"picks":["R1Y2022"],"ins":["y01|2021|UTA"]}'
  ), 'x01|2021|PHI')$q$) like '%a pick sent twice%');
select pg_temp.ck('a headline nobody traded for is refused',
  pg_temp.boom($q$select pg_temp.fs(pg_temp.good(), 'jamesle01|2021|LAL')$q$) like '%headline%');

select be(1);
select pg_temp.fs(pg_temp.good(), 'goberru01|2021|UTA', 0.4);
select pg_temp.ck('a signed in season lands with a name',
  (select display_name from rtf_plays where user_id is not null order by id desc limit 1) = 'jordan');
select pg_temp.ck('a second season the same day hands back the first',
  pg_temp.fs('[]'::jsonb, null, 0.9) = (select id from rtf_plays where user_id = '00000000-0000-0000-0000-000000000001' and mode = 'fix' and day = today_day()));
select pg_temp.ck('and so do the two older submits',
  rtf_submit_trade(today_day(), 'PHO_2021', 'MIL_2021', array['bookede01|2021|PHO'], array['antetgi01|2021|MIL'], 0.8, 0.05, 60, false)
  = (select id from rtf_plays where user_id = '00000000-0000-0000-0000-000000000001' and mode = 'fix' and day = today_day()));
select pg_temp.ck('the score that stands is the first',
  (select score from rtf_plays where user_id = '00000000-0000-0000-0000-000000000001' and mode = 'fix' and day = today_day()) = 0.4);

select pg_temp.ck('anon may call it',
  has_function_privilege('anon', 'rtf_submit_fix_season(int,text,jsonb,text,numeric,numeric,int,boolean)', 'execute'));
select pg_temp.ck('anon may read the new column', has_column_privilege('anon', 'rtf_plays', 'fix_trades', 'select'));
select pg_temp.ck('and may not write the table', not has_table_privilege('anon', 'rtf_plays', 'insert'));
