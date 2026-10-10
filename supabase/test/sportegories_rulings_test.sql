-- 135_sportegories_rulings.sql, against a real Postgres.
--
--   createdb rulings && psql -d rulings -c 'create role anon; create role authenticated;'
--   psql -d rulings -f supabase/78_answer_gaps.sql
--   psql -d rulings -f supabase/135_sportegories_rulings.sql
--   psql -d rulings -f supabase/135_sportegories_rulings.sql     (twice: idempotent)
--   psql -d rulings -v ON_ERROR_STOP=1 -f supabase/test/sportegories_rulings_test.sql
--
-- Every write is its own statement and every check reads afterwards, because a
-- check in the same statement as the write reads the snapshot from before it.

\set ON_ERROR_STOP 1
create temp table claims (ok boolean, what text);
grant insert on claims to public;

-- the server's upsert, exactly as supabaseMemory().put sends it
insert into sportegories_rulings (answer_key, as_typed, category, letter, verdict, qid, wd_name)
values ('rodney|stuckey', 'Rodney Stuckey', 'Played for the Pacers', 'S', 'upheld', 'Q1', 'Rodney Stuckey')
on conflict (answer_key, category) do update
  set verdict = excluded.verdict, qid = excluded.qid, as_typed = excluded.as_typed, updated_at = now();
insert into claims select verdict = 'upheld', 'a ruling is filed' from sportegories_rulings where answer_key = 'rodney|stuckey';

-- a re-ruling moves the verdict and keeps the first spelling
insert into sportegories_rulings (answer_key, as_typed, category, letter, verdict)
values ('rodney|stuckey', 'rodney stuckey', 'Played for the Pacers', 'S', 'denied')
on conflict (answer_key, category) do update
  set verdict = excluded.verdict, as_typed = excluded.as_typed, updated_at = now();
insert into claims select verdict = 'denied' and as_typed = 'Rodney Stuckey', 'a re-ruling moves the verdict and keeps the first spelling'
  from sportegories_rulings where answer_key = 'rodney|stuckey';

-- an admin overrules it
update sportegories_rulings set verdict = 'upheld', source = 'admin' where answer_key = 'rodney|stuckey';
insert into claims select verdict = 'upheld' and source = 'admin', 'an admin can overrule'
  from sportegories_rulings where answer_key = 'rodney|stuckey';

-- and the server cannot overrule the admin
insert into sportegories_rulings (answer_key, as_typed, category, letter, verdict, source)
values ('rodney|stuckey', 'Rodney Stuckey', 'Played for the Pacers', 'S', 'denied', 'wikidata')
on conflict (answer_key, category) do update
  set verdict = excluded.verdict, source = excluded.source, updated_at = now();
insert into claims select verdict = 'upheld' and source = 'admin', 'the server cannot write over an admin'
  from sportegories_rulings where answer_key = 'rodney|stuckey';

-- one row per name and category, a second category is a second row
insert into sportegories_rulings (answer_key, as_typed, category, letter, verdict)
values ('rodney|stuckey', 'Rodney Stuckey', 'Played for the Pistons', 'S', 'upheld');
insert into claims select count(*) = 2, 'one row per name and category' from sportegories_rulings;

-- a bad verdict is refused
do $$ begin
  begin
    insert into sportegories_rulings (answer_key, as_typed, category, verdict) values ('a|b', 'A B', 'X', 'maybe');
    insert into claims values (false, 'a verdict other than upheld or denied is refused');
  exception when check_violation then
    insert into claims values (true, 'a verdict other than upheld or denied is refused');
  end;
end $$;

-- no page may read or write it
set role anon;
do $$ begin
  begin
    perform 1 from sportegories_rulings limit 1;
    insert into claims values (false, 'anon cannot read the rulings');
  exception when insufficient_privilege then
    insert into claims values (true, 'anon cannot read the rulings');
  end;
  begin
    insert into sportegories_rulings (answer_key, as_typed, category, verdict) values ('x|y', 'X Y', 'Z', 'upheld');
    insert into claims values (false, 'anon cannot write a ruling');
  exception when insufficient_privilege then
    insert into claims values (true, 'anon cannot write a ruling');
  end;
end $$;
reset role;
set role authenticated;
do $$ begin
  begin
    insert into sportegories_rulings (answer_key, as_typed, category, verdict) values ('x|y', 'X Y', 'Z', 'upheld');
    insert into claims values (false, 'a signed in player cannot write a ruling');
  exception when insufficient_privilege then
    insert into claims values (true, 'a signed in player cannot write a ruling');
  end;
end $$;
reset role;

select case when ok then 'ok   ' else 'FAIL ' end || what from claims;
do $$ begin
  if exists (select 1 from claims where not ok) then raise exception 'sportegories_rulings_test: % failing', (select count(*) from claims where not ok); end if;
end $$;
