-- ps_saves_test.sql : the account's save shelf accepts a save.
--
--   createdb saves
--   psql -d saves -f supabase/test/ps_saves_base.sql
--   psql -d saves -f supabase/103_cloud_saves.sql
--   psql -d saves -f supabase/143_ps_save_put_fix.sql
--   psql -d saves -f supabase/172_ps_save_put_skip_equal.sql
--   psql -d saves -f supabase/test/ps_saves_test.sql
--
-- 103 shipped with no test, and every call to ps_save_put raised "column
-- reference slot is ambiguous" for as long as it was deployed. So this file
-- opens with the one claim that would have caught it: a save is written and
-- can be read back. Against 103 alone it stops at the first call.
\set ON_ERROR_STOP 1

create or replace function pg_temp.claim(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAIL: %', what; end if;
  raise notice 'ok: %', what;
end $$;

-- player one
set test.uid = '11111111-1111-1111-1111-111111111111';
select pg_temp.claim((select ok from ps_save_put('putt', 'tour', '{"v":2,"lv":5}'::jsonb, 5)), 'a first save is accepted');
select pg_temp.claim((select (payload->>'lv')::int = 5 from ps_save_get('putt', 'tour')), 'and reads back');
select pg_temp.claim((select ok from ps_save_put('putt', 'tour', '{"v":2,"lv":9}'::jsonb, 9)), 'a save further on is accepted');
select pg_temp.claim((select (payload->>'lv')::int = 9 from ps_save_get('putt', 'tour')), 'and replaces the first');
select pg_temp.claim((select not ok and progress = 9 and (payload->>'lv')::int = 9 from ps_save_put('putt', 'tour', '{"v":2,"lv":1}'::jsonb, 1)),
  'a save behind the shelf is refused and hands back what is stored');
select pg_temp.claim((select (payload->>'lv')::int = 9 from ps_save_get('putt', 'tour')), 'and the shelf did not move');
select pg_temp.claim((select ok from ps_save_put('ps_dynasty', 'open', '{"s":3}'::jsonb, 3)), 'another game is its own row');
select pg_temp.claim((select count(*) = 1 from ps_save_all('putt')), 'ps_save_all answers one game');

-- player two cannot see or move player one
set test.uid = '22222222-2222-2222-2222-222222222222';
select pg_temp.claim((select count(*) = 0 from ps_save_get('putt', 'tour')), 'another account sees nothing');
select pg_temp.claim((select ok from ps_save_put('putt', 'tour', '{"v":2,"lv":2}'::jsonb, 2)), 'and saves its own');
set test.uid = '11111111-1111-1111-1111-111111111111';
select pg_temp.claim((select (payload->>'lv')::int = 9 from ps_save_get('putt', 'tour')), 'without touching the first account');

-- 172: an equal save writes nothing (the row keeps its version and its saved_at)
create temp table before_equal as
  select ctid::text as row_ctid, xmin::text as row_xmin, saved_at from ps_saves
   where game = 'putt' and slot = 'tour' and user_id = '11111111-1111-1111-1111-111111111111';
select pg_temp.claim((select ok and progress = 9 from ps_save_put('putt', 'tour', '{"lv":9,"v":2}'::jsonb, 9)),
  'an equal save (keys in another order) is accepted');
select pg_temp.claim((select b.row_ctid = s.ctid::text and b.row_xmin = s.xmin::text and b.saved_at = s.saved_at
   from ps_saves s, before_equal b
  where s.game = 'putt' and s.slot = 'tour' and s.user_id = '11111111-1111-1111-1111-111111111111'),
  'and wrote nothing: same row version, same saved_at');
select pg_temp.claim((select ok from ps_save_put('putt', 'tour', '{"v":2,"lv":9,"x":1}'::jsonb, 9)),
  'a changed payload at the same progress is still written');
select pg_temp.claim((select (payload->>'x')::int = 1 from ps_save_get('putt', 'tour')), 'and reads back');

-- signed out
set test.uid = '';
do $$ declare raised boolean := false; begin
  begin perform * from ps_save_put('putt', 'tour', '{}'::jsonb, 1); exception when others then raised := true; end;
  if not raised then raise exception 'FAIL: a signed out save is refused'; end if;
  raise notice 'ok: a signed out save is refused';
end $$;

\echo ALL PASSED
