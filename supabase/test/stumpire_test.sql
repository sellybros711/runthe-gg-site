-- Checks for 133_stumpire.sql. Each prints " ok <claim>" or " FAIL <claim>".
\set ON_ERROR_STOP off
\pset tuples_only on
\pset format unaligned
create or replace function pg_temp.claim(ok boolean, what text) returns text language sql as
  $$ select case when ok then ' ok ' else ' FAIL ' end || what $$;

insert into stumpire_testers (user_id, role) values
  ('00000000-0000-0000-0000-00000000000a', 'admin'),
  ('00000000-0000-0000-0000-00000000000b', 'tester') on conflict do nothing;

-- the gate
select pg_temp.claim(stumpire_access('00000000-0000-0000-0000-00000000000b') = 'tester', 'a tester is let in under testers mode');
select pg_temp.claim(stumpire_access('00000000-0000-0000-0000-00000000000c') is null, 'a non-tester is refused');
select pg_temp.claim(stumpire_access(null) is null, 'a guest is refused');
update stumpire_settings set value = '"off"' where key = 'mode';
select pg_temp.claim(stumpire_access('00000000-0000-0000-0000-00000000000b') is null, 'mode off shuts testers out');
select pg_temp.claim(stumpire_access('00000000-0000-0000-0000-00000000000a') = 'admin', 'mode off still lets an admin author');
update stumpire_settings set value = '"testers"' where key = 'mode';
delete from stumpire_testers where user_id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.claim(stumpire_access('00000000-0000-0000-0000-00000000000b') is null, 'removing a tester row takes them out with no deploy');
insert into stumpire_testers (user_id, role) values ('00000000-0000-0000-0000-00000000000b', 'tester');

-- browser roles get nothing
select pg_temp.claim(not has_table_privilege('anon', 'stumpire_prompt_answers', 'select'), 'anon cannot read answers');
select pg_temp.claim(not has_table_privilege('authenticated', 'stumpire_plays', 'select'), 'authenticated cannot read plays');
select pg_temp.claim(not has_function_privilege('anon', 'stumpire_access(uuid)', 'execute'), 'anon cannot call the gate');
select pg_temp.claim(not has_function_privilege('authenticated', 'stumpire_publish_slate(date,integer,text[],text[],text[],text[],jsonb,uuid)', 'execute'), 'authenticated cannot publish');

-- publish
select pg_temp.claim(stumpire_publish_slate('2026-10-09', 9,
  array['a','b','c','d','e'], array['A','B','C','D','E'], array['NFL','NBA','MLB','NBA','NFL'], array['athlete','athlete','athlete','athlete','team'],
  '[{"at_bat":0,"prompt_id":"a","entity_id":"x1","name":"X One","prior_share":0.5,"observed_count":0,"expected_share":0.5,"depth":0,"tier":1,"called":true,"arguable":false},
    {"at_bat":0,"prompt_id":"a","entity_id":"x2","name":"X Two","prior_share":0.5,"observed_count":0,"expected_share":0.5,"depth":0.5,"tier":1,"called":false,"arguable":false}]'::jsonb) = 2,
  'publishing writes every frozen row');
select pg_temp.claim((select frozen from stumpire_slates where slate_date = '2026-10-09'), 'a published slate is frozen');

do $$ begin
  perform stumpire_publish_slate('2026-10-09', 9, array['a','b','c','d','e'], array['A','B','C','D','E'],
    array['NFL','NBA','MLB','NBA','NFL'], array['athlete','athlete','athlete','athlete','team'], '[]'::jsonb);
  create temp table t_repub as select false as ok;
exception when others then create temp table t_repub as select true as ok; end $$;
select pg_temp.claim((select ok from t_repub), 'the same date cannot be published twice');

do $$ begin
  update stumpire_prompt_answers set tier = 4 where entity_id = 'x2';
  create temp table t_upd as select false as ok;
exception when others then create temp table t_upd as select true as ok; end $$;
select pg_temp.claim((select ok from t_upd), 'a frozen grade refuses an update');
select pg_temp.claim((select tier from stumpire_prompt_answers where entity_id = 'x2') = 1, 'and the grade did not move');

do $$ begin
  delete from stumpire_prompt_answers where entity_id = 'x1';
  create temp table t_del as select false as ok;
exception when others then create temp table t_del as select true as ok; end $$;
select pg_temp.claim((select ok from t_del), 'a frozen grade refuses a delete');

do $$ begin
  insert into stumpire_prompt_answers (slate_date, at_bat, prompt_id, entity_id, name, tier) values ('2026-10-09', 0, 'a', 'x9', 'X Nine', 4);
  create temp table t_ins as select false as ok;
exception when others then create temp table t_ins as select true as ok; end $$;
select pg_temp.claim((select ok from t_ins), 'a frozen slate refuses a new home run row');
select pg_temp.claim(stumpire_accept_answer('2026-10-09', 0::smallint, 'a', 'x9', 'X Nine'), 'an upheld challenge can add a benefit-of-the-doubt single');
select pg_temp.claim((select tier = 1 and arguable from stumpire_prompt_answers where entity_id = 'x9'), 'and it is a single, flagged arguable');

-- plays and the optimistic save
insert into stumpire_plays (slate_date, user_id, state) values ('2026-10-09', '00000000-0000-0000-0000-00000000000b', '{}');
select pg_temp.claim(stumpire_save_play((select id from stumpire_plays limit 1), 1, '{"i":1}', 2, 0, 0, false, false) = 2, 'a save at the right version goes through');
select pg_temp.claim(stumpire_save_play((select id from stumpire_plays limit 1), 1, '{"i":9}', 9, 0, 0, false, false) is null, 'a save at a stale version is refused');
select pg_temp.claim((select state->>'i' from stumpire_plays limit 1) = '1', 'and the stale write changed nothing');

-- one play a day each
do $$ begin
  insert into stumpire_plays (slate_date, user_id, state) values ('2026-10-09', '00000000-0000-0000-0000-00000000000b', '{}');
  create temp table t_two as select false as ok;
exception when others then create temp table t_two as select true as ok; end $$;
select pg_temp.claim((select ok from t_two), 'an account cannot hold two plays of one slate');

-- guest claim
insert into stumpire_plays (slate_date, guest_id, state) values ('2026-10-09', 'g-1', '{}');
select pg_temp.claim(stumpire_claim('g-1', '00000000-0000-0000-0000-00000000000b') = 0, 'a guest play does not overwrite the account''s own play that day');
select pg_temp.claim(stumpire_claim('g-1', '00000000-0000-0000-0000-00000000000a') = 1, 'a guest play joins an account with none');
select pg_temp.claim((select user_id from stumpire_plays where guest_id is null and user_id = '00000000-0000-0000-0000-00000000000a') is not null, 'and is now that account''s');

-- observed counts
insert into stumpire_answer_log (prompt_id, matched_id, status, ruling) values
  ('a','x2','match','SAFE'), ('a','x2','match','SAFE'), ('a','x1','match','OUT'), ('a','zz','match','STRIKE');
select pg_temp.claim((select n from stumpire_observed('a') where entity_id = 'x2') = 2, 'observed counts what players actually said');
select pg_temp.claim(not exists (select 1 from stumpire_observed('a') where entity_id = 'zz'), 'a strike is not an observation');
