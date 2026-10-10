-- Run after arcade_lab_base.sql, 134_arcade_lab.sql and 135_arcade_lab_content.sql.
-- Every line should start " ok ".
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
create or replace function pg_temp.claim(ok boolean, what text) returns text language sql as
  $$ select case when ok then ' ok   ' else ' FAIL ' end || what $$;

select pg_temp.claim((select count(*) = 6 and bool_and(mode = 'testers') from arcade_lab_flags), 'all six games are on for testers');

insert into arcade_slates (game_id, date_key, payload) values ('whack', '2026-10-10', '{"rounds":[]}');
do $$ begin
  begin update arcade_slates set payload = '{}' where game_id = 'whack'; raise notice 'UPDATED';
  exception when raise_exception then null; end;
  begin delete from arcade_slates where game_id = 'whack'; raise notice 'DELETED';
  exception when raise_exception then null; end;
end $$;
select pg_temp.claim((select payload = '{"rounds":[]}' from arcade_slates where game_id = 'whack'), 'a published slate cannot be changed or deleted');

select pg_temp.claim(arcade_lab_start('u:1', 'pinball', '2026-10-10') = 1, 'a first start counts one');
select pg_temp.claim(arcade_lab_start('u:1', 'pinball', '2026-10-10') = 2, 'a second start counts two');

insert into arcade_runs (user_id, game_id, date_key, mode, seed, score, duration_ms, restarted)
  values ('00000000-0000-0000-0000-0000000000a1', 'pinball', '2026-10-10', 'daily', 1, 90000, 60000, true),
         ('00000000-0000-0000-0000-0000000000b2', 'pinball', '2026-10-10', 'daily', 1, 100, 60000, false);
select pg_temp.claim((select array_agg(score) = array[100] from arcade_lab_board('pinball', '2026-10-10', 10, true)), 'a restarted run is off the board');

insert into arcade_reports (user_id, game_id, date_key, prompt_id, athlete_id) values ('00000000-0000-0000-0000-0000000000a1', 'whack', '2026-10-10', 'p', 'x');
do $$ begin
  begin insert into arcade_reports (user_id, game_id, date_key, prompt_id, athlete_id) values ('00000000-0000-0000-0000-0000000000a1', 'whack', '2026-10-10', 'p', 'x');
  exception when unique_violation then null; end;
end $$;
select pg_temp.claim((select count(*) = 1 from arcade_reports), 'one report per player, card and day');

select pg_temp.claim(not has_table_privilege('anon', 'public.arcade_slates', 'select') and not has_table_privilege('authenticated', 'public.arcade_prompts', 'select'), 'no browser role reads the content tables');
select pg_temp.claim(not has_function_privilege('anon', 'public.arcade_lab_start(text,text,date)', 'execute'), 'no browser role records a start');
