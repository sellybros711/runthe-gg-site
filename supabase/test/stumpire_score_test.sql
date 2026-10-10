-- Checks for 134_stumpire_score.sql, run after stumpire_base.sql, 133 and 134.
\set ON_ERROR_STOP off
\pset tuples_only on
\pset format unaligned
create or replace function pg_temp.claim(ok boolean, what text) returns text language sql as
  $$ select case when ok then ' ok ' else ' FAIL ' end || what $$;

insert into stumpire_slates (slate_date, slate_no, prompt_ids, prompt_text, leagues, types, frozen)
  values ('2030-01-01', 1, '{a,b,c,d,e}', '{a,b,c,d,e}', '{NBA,NBA,NBA,NBA,NBA}', '{athlete,athlete,athlete,athlete,athlete}', false)
  on conflict do nothing;
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000d1') on conflict do nothing;
insert into stumpire_plays (slate_date, user_id, state) values ('2030-01-01', '00000000-0000-0000-0000-0000000000d1', '{}');
select pg_temp.claim(stumpire_save_play_v2((select id from stumpire_plays where slate_date = '2030-01-01'), 1, '{"i":5}', 6, 1, 1, true, true, 95, 1, 2, 1, 0) = 2, 'a save with the score goes through');
select pg_temp.claim((select score = 95 and runs = 1 and hits = 2 and hr = 1 and ks = 0 from stumpire_plays where slate_date = '2030-01-01'), 'and the score columns are written');
select pg_temp.claim(stumpire_save_play_v2((select id from stumpire_plays where slate_date = '2030-01-01'), 1, '{}', 0, 0, 0, false, false, 0, 0, 0, 0, 0) is null, 'a stale version is refused');
select pg_temp.claim(has_function_privilege('service_role', 'public.stumpire_save_play_v2(bigint,integer,jsonb,integer,integer,integer,boolean,boolean,integer,integer,integer,integer,integer)', 'execute'), 'service_role can save a score');
select pg_temp.claim(not has_function_privilege('anon', 'public.stumpire_save_play_v2(bigint,integer,jsonb,integer,integer,integer,boolean,boolean,integer,integer,integer,integer,integer)', 'execute'), 'anon cannot');
