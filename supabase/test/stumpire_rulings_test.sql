-- 136_stumpire_rulings.sql, against a real Postgres.
--
--   createdb rulings && psql -d rulings -c 'create role anon; create role authenticated;'
--   psql -d rulings -f supabase/136_stumpire_rulings.sql
--   psql -d rulings -f supabase/136_stumpire_rulings.sql     (twice: idempotent)
--   psql -d rulings -v ON_ERROR_STOP=1 -f supabase/test/stumpire_rulings_test.sql
--
-- Every write is its own statement and every check reads afterwards, because a
-- check in the same statement as the write reads the snapshot from before it.

\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
create temp table claims (ok boolean, what text);
grant insert on claims to public;

-- the server's upsert, exactly as supabaseMemory().put sends it
insert into stumpire_rulings (prompt_id, name, entity_id, verdict, qid, wd_name)
values ('nfl-lb-pro-bowl', 'Rodney Stuckey', 'nfl-rodney-stuckey', 'upheld', 'Q1', 'Rodney Stuckey')
on conflict (prompt_id, entity_id) do update
  set verdict = excluded.verdict, qid = excluded.qid, updated_at = now();
insert into claims select verdict = 'upheld', 'a ruling is filed' from stumpire_rulings where entity_id = 'nfl-rodney-stuckey';

-- a re-ruling moves the verdict and keeps the first spelling
insert into stumpire_rulings (prompt_id, name, entity_id, verdict)
values ('nfl-lb-pro-bowl', 'rodney stuckey', 'nfl-rodney-stuckey', 'denied')
on conflict (prompt_id, entity_id) do update
  set verdict = excluded.verdict, updated_at = now();
insert into claims select verdict = 'denied', 'a re-ruling moves the verdict'
  from stumpire_rulings where entity_id = 'nfl-rodney-stuckey';

-- an admin overrules it
update stumpire_rulings set verdict = 'upheld', source = 'admin' where entity_id = 'nfl-rodney-stuckey';
insert into claims select verdict = 'upheld' and source = 'admin', 'an admin can overrule'
  from stumpire_rulings where entity_id = 'nfl-rodney-stuckey';

-- and the server cannot overrule the admin
insert into stumpire_rulings (prompt_id, name, entity_id, verdict, source)
values ('nfl-lb-pro-bowl', 'Rodney Stuckey', 'nfl-rodney-stuckey', 'denied', 'wikidata')
on conflict (prompt_id, entity_id) do update
  set verdict = excluded.verdict, source = excluded.source, updated_at = now();
insert into claims select verdict = 'upheld' and source = 'admin', 'the server cannot write over an admin'
  from stumpire_rulings where entity_id = 'nfl-rodney-stuckey';

-- one row per prompt and player, a second prompt is a second row
insert into stumpire_rulings (prompt_id, name, entity_id, verdict)
values ('nba-all-star', 'Rodney Stuckey', 'nfl-rodney-stuckey', 'upheld');
insert into claims select count(*) = 2, 'one row per prompt and player' from stumpire_rulings;

-- a bad verdict is refused
do $$ begin
  begin
    insert into stumpire_rulings (prompt_id, entity_id, verdict) values ('a', 'b', 'maybe');
    insert into claims values (false, 'a verdict other than upheld or denied is refused');
  exception when check_violation then
    insert into claims values (true, 'a verdict other than upheld or denied is refused');
  end;
end $$;

-- no page may read or write it
set role anon;
do $$ begin
  begin
    perform 1 from stumpire_rulings limit 1;
    insert into claims values (false, 'anon cannot read the rulings');
  exception when insufficient_privilege then
    insert into claims values (true, 'anon cannot read the rulings');
  end;
  begin
    insert into stumpire_rulings (prompt_id, entity_id, verdict) values ('x', 'y', 'upheld');
    insert into claims values (false, 'anon cannot write a ruling');
  exception when insufficient_privilege then
    insert into claims values (true, 'anon cannot write a ruling');
  end;
end $$;
reset role;
set role authenticated;
do $$ begin
  begin
    insert into stumpire_rulings (prompt_id, entity_id, verdict) values ('x', 'y', 'upheld');
    insert into claims values (false, 'a signed in player cannot write a ruling');
  exception when insufficient_privilege then
    insert into claims values (true, 'a signed in player cannot write a ruling');
  end;
end $$;
reset role;

select case when ok then ' ok ' else ' FAIL ' end || what from claims;
do $$ begin
  if exists (select 1 from claims where not ok) then raise exception 'stumpire_rulings_test: % failing', (select count(*) from claims where not ok); end if;
end $$;
