-- Run after arcade_lab_base.sql and 134_arcade_lab.sql. Every line should start " ok ".
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
create or replace function pg_temp.claim(ok boolean, what text) returns text language sql as
  $$ select case when ok then ' ok   ' else ' FAIL ' end || what $$;

select pg_temp.claim((select count(*) = 6 and bool_and(mode = 'off') from arcade_lab_flags), 'six flags, all off');

insert into arcade_runs (user_id, game_id, date_key, mode, seed, score, duration_ms)
  values ('00000000-0000-0000-0000-0000000000a1', 'roll-ball', '2026-10-10', 'daily', 1, 20, 60000);
do $$ begin
  begin
    insert into arcade_runs (user_id, game_id, date_key, mode, seed, score, duration_ms)
      values ('00000000-0000-0000-0000-0000000000a1', 'roll-ball', '2026-10-10', 'daily', 1, 30, 60000);
    raise notice 'second daily accepted';
  exception when unique_violation then null; end;
end $$;
select pg_temp.claim((select count(*) = 1 from arcade_runs where user_id = '00000000-0000-0000-0000-0000000000a1'), 'one daily per player per game per day');

insert into gem_ledger (user_id, amount, reason, game_id, run_id) select user_id, 11, 'roll-ball daily', game_id, id from arcade_runs limit 1;
do $$ begin
  begin
    insert into gem_ledger (user_id, amount, reason, game_id, run_id) select user_id, 11, 'again', game_id, id from arcade_runs limit 1;
  exception when unique_violation then null; end;
end $$;
select pg_temp.claim(arcade_gem_total('00000000-0000-0000-0000-0000000000a1', null) = 11, 'gems are paid once per run');

insert into arcade_runs (guest_id, game_id, date_key, mode, seed, score, duration_ms, tester)
  values ('guest-zzzzzzzz', 'roll-ball', '2026-10-10', 'daily', 1, 9, 60000, false),
         ('guest-zzzzzzzz', 'roll-ball', '2026-10-09', 'daily', 1, 12, 60000, false);
insert into gem_ledger (guest_id, amount, reason, game_id, run_id) select guest_id, 5, 'g', game_id, id from arcade_runs where guest_id is not null;
select pg_temp.claim(arcade_lab_claim('guest-zzzzzzzz', '00000000-0000-0000-0000-0000000000a1') = 1, 'a claim skips a day the account already played');
select pg_temp.claim(arcade_gem_total('00000000-0000-0000-0000-0000000000a1', null) = 21, 'and moves the guest''s gems');

insert into arcade_runs (user_id, game_id, date_key, mode, seed, score, duration_ms)
  values ('00000000-0000-0000-0000-0000000000b2', 'roll-ball', '2026-10-10', 'daily', 1, 33, 60000);
select pg_temp.claim((select array_agg(username order by score desc) = array['beta','alpha'] from arcade_lab_board('roll-ball', '2026-10-10', 10, true)), 'the board ranks by score with names');
select pg_temp.claim((select count(*) = 0 from arcade_lab_board('roll-ball', '2026-10-10', 10, false)), 'a public board leaves tester runs out');

select pg_temp.claim(not has_table_privilege('anon', 'public.arcade_runs', 'select'), 'anon cannot read runs');
select pg_temp.claim(not has_table_privilege('authenticated', 'public.gem_ledger', 'select'), 'authenticated cannot read the ledger');
select pg_temp.claim(not has_function_privilege('anon', 'public.arcade_lab_claim(text,uuid)', 'execute'), 'anon cannot call claim');
select pg_temp.claim(has_function_privilege('service_role', 'public.arcade_lab_board(text,date,integer,boolean)', 'execute'), 'the service role can');

delete from gem_ledger where tester; delete from arcade_runs where tester;
select pg_temp.claim((select count(*) = 0 from arcade_runs where tester), 'tester data wipes in one statement each');
