-- ---------------------------------------------------------------------------
-- 117_hoops_trade.sql against a real Postgres.
--
--   createdb hoops_trade
--   psql -d hoops_trade -c 'create role authenticated; create role anon;'
--   psql -d hoops_trade -f supabase/test/hoops_board_base.sql
--   psql -d hoops_trade -f supabase/116_hoops_modes.sql
--   psql -d hoops_trade -f supabase/117_hoops_trade.sql
--   psql -d hoops_trade -f supabase/117_hoops_trade.sql      twice, on purpose
--   psql -d hoops_trade -f supabase/test/hoops_trade_test.sql
--
-- One line per check, every one starting " ok ". Most of it is REFUSALS, for
-- the reason 116's test gives: board.js fails soft, so a check that stopped
-- refusing would not show on any screen.
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

-- A legal trade: two Suns to the Bucks for two Bucks, 2021.
create or replace function pg_temp.tr(odds numeric, outs text[] default null, ins text[] default null,
  w text default 'MIL_2021', ts text default 'PHO_2021', day int default null)
returns bigint language sql as $$
  select rtf_submit_trade(coalesce(day, today_day()), ts, w,
    coalesce(outs, array['bookede01|2021|PHO','crowdja01|2021|PHO']),
    coalesce(ins, array['antetgi01|2021|MIL','connapa01|2021|MIL']),
    odds, 0.045, 60, false)
$$;

select pg_temp.ck('a legal two for two lands', pg_temp.tr(0.275) is not null);
select pg_temp.ck('its score is the odds',
  (select score from rtf_plays order by id desc limit 1) = 0.275);
select pg_temp.ck('both sides are kept whole',
  (select fix_outs = array['bookede01|2021|PHO','crowdja01|2021|PHO']
      and fix_ins = array['antetgi01|2021|MIL','connapa01|2021|MIL'] and fix_with = 'MIL_2021'
     from rtf_plays order by id desc limit 1));
select pg_temp.ck('and the first of each side is in the old columns, so the move count still reads',
  (select fix_out = 'bookede01|2021|PHO' and fix_in = 'antetgi01|2021|MIL' and fix_slot is null
     from rtf_plays order by id desc limit 1));
select pg_temp.ck('it is a fix row, on the same board as the first version',
  (select mode from rtf_plays order by id desc limit 1) = 'fix');
select pg_temp.ck('a retry inside the minute lands on the same row',
  pg_temp.tr(0.275) = (select max(id) from rtf_plays));
select pg_temp.ck('a one for one is legal too',
  pg_temp.boom($q$select pg_temp.tr(0.1, array['carteje01|2021|PHO'], array['forbebr01|2021|MIL'])$q$) is null);

select pg_temp.ck('a partner from another season is refused',
  pg_temp.boom($q$select pg_temp.tr(0.2, null, array['antetgi01|2020|MIL'], 'MIL_2020')$q$) like '%another season%');
select pg_temp.ck('trading with yourself is refused',
  pg_temp.boom($q$select pg_temp.tr(0.2, null, array['paulch01|2021|PHO'], 'PHO_2021')$q$) like '%with itself%');
select pg_temp.ck('three out is refused',
  pg_temp.boom($q$select pg_temp.tr(0.2, array['a01|2021|PHO','b01|2021|PHO','c01|2021|PHO'])$q$) like '%one or two players out%');
select pg_temp.ck('nobody in is refused',
  pg_temp.boom($q$select pg_temp.tr(0.2, null, array[]::text[])$q$) like '%one or two players in%');
select pg_temp.ck('the same man twice is refused',
  pg_temp.boom($q$select pg_temp.tr(0.2, array['a01|2021|PHO','a01|2021|PHO'])$q$) like '%same man out twice%');
select pg_temp.ck('a man out who is not on the team is refused',
  pg_temp.boom($q$select pg_temp.tr(0.2, array['jamesle01|2021|LAL'])$q$) like '%not on the team%');
select pg_temp.ck('a man in who is not on the partner is refused',
  pg_temp.boom($q$select pg_temp.tr(0.2, null, array['jamesle01|2021|LAL'])$q$) like '%not on the partner%');
select pg_temp.ck('a man in from the right club and the wrong year is refused',
  pg_temp.boom($q$select pg_temp.tr(0.2, null, array['antetgi01|2019|MIL'])$q$) like '%not on the partner%');
select pg_temp.ck('a malformed key is refused',
  pg_temp.boom($q$select pg_temp.tr(0.2, array['DROP TABLE|2021|PHO'])$q$) like '%looks wrong%');
select pg_temp.ck('odds over 1 are refused',
  pg_temp.boom($q$select pg_temp.tr(1.5)$q$) like '%odds must be 0 to 1%');
select pg_temp.ck('a day from last week is refused',
  pg_temp.boom($q$select pg_temp.tr(0.2, null, null, 'MIL_2021', 'PHO_2021', today_day() - 5)$q$) like '%not close enough%');

-- One a day per account, and the first stands, across both submits.
select be(1);
-- Two statements, because a submit inside a WHERE runs once per row scanned.
select pg_temp.tr(0.3);
select pg_temp.ck('a signed in trade lands with a name',
  (select display_name from rtf_plays where user_id is not null order by id desc limit 1) = 'jordan');
select pg_temp.ck('a second trade the same day hands back the first',
  pg_temp.tr(0.9, array['carteje01|2021|PHO'], array['forbebr01|2021|MIL']) =
  (select id from rtf_plays where user_id = '00000000-0000-0000-0000-000000000001' and mode = 'fix' and day = today_day()));
select pg_temp.ck('and so does the first version''s submit',
  rtf_submit_fix(today_day(), 'BOS_2009', 1, 'piercpa01|2009|BOS', 'rodmade01|1992|DET', 0.8, 0.2, 60, false) =
  (select id from rtf_plays where user_id = '00000000-0000-0000-0000-000000000001' and mode = 'fix' and day = today_day()));
select pg_temp.ck('the score that stands is the first one',
  (select score from rtf_plays where user_id = '00000000-0000-0000-0000-000000000001' and mode = 'fix' and day = today_day()) = 0.3);

-- The grants.
select pg_temp.ck('anon may call it',
  has_function_privilege('anon', 'rtf_submit_trade(int,text,text,text[],text[],numeric,numeric,int,boolean)', 'execute'));
select pg_temp.ck('anon may read the new columns',
  has_column_privilege('anon', 'rtf_plays', 'fix_ins', 'select'));
select pg_temp.ck('and may not write the table',
  not has_table_privilege('anon', 'rtf_plays', 'insert'));
