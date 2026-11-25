-- Checks for 187_course.sql. Every line printed starts ' ok ' or ' FAIL '.
--   after game_events_base.sql, 170, 171 and 187 (twice):
--   psql -d ev -f supabase/test/course_test.sql
-- A first open makes the course; a second writes nothing; a shift files once,
-- in order; a resend and a skipped number change nothing; events are capped to
-- a known player; and only the service role can reach any of it.
\set QUIET on
\pset tuples_only on
\pset format unaligned
\set u '''00000000-0000-0000-0000-00000000000a'''
\set holes '''[{"ord":1,"par":3,"template":"p3","open":true,"condition":{"green":60,"fairway":70}},{"ord":2,"par":4,"template":"p4","open":true,"condition":{"green":60,"fairway":70}},{"ord":4,"par":4,"template":"plot","condition":{"green":60,"fairway":70}}]'''
create temp table t (name text, pass boolean);

insert into t select 'a first open makes the course with the seed it was given', (course_open(:u, 42, :holes::jsonb)->'course'->>'seed')::int = 42;
insert into t select 'and its holes, open and locked', json_array_length(course_open(:u, 42, :holes::jsonb)->'holes') = 3
  and (select count(*) from course_holes where open) = 2;
create temp table before as select xmin::text as x from course_courses;
insert into t select 'a second open keeps the first seed', (course_open(:u, 99, '[]'::jsonb)->'course'->>'seed')::int = 42;
insert into t select 'and writes nothing', (select xmin::text from course_courses) = (select x from before);
insert into t select 'a new course starts at 2 stars, no cash, no shifts', (select stars = 2 and cash = 0 and shifts_filed = 0 from course_courses);
insert into t select 'nobody gets no course', course_open(null, 1, :holes::jsonb) is null;

insert into t select 'shift 1 files', (course_shift_file(:u, 1, 7, 1, '{"rounds":5,"cash":80,"tips":12,"walk_offs":0,"avg_round_s":101.5,"low_round":22}',
  80, 2.4, '{"unlocks":{"cart_barn":"done"},"reviews":[3.1]}', '[{"ord":1,"condition":{"green":80,"fairway":60}}]', 'abc12345', 'replay')->>'filed')::boolean;
insert into t select 'the course has the server''s numbers', (select cash = 80 and stars = 2.40 and shifts_filed = 1 and state->'unlocks'->>'cart_barn' = 'done' from course_courses);
insert into t select 'the hole it named changed, the others did not', (select condition->>'green' from course_holes where ord = 1) = '80'
  and (select condition->>'green' from course_holes where ord = 2) = '60';
insert into t select 'a resend of shift 1 is refused', not (course_shift_file(:u, 1, 7, 1, '{"rounds":9,"cash":999,"tips":0,"walk_offs":0}', 999, 5, null, null, 'x', 'replay')->>'filed')::boolean;
insert into t select 'a skipped number is refused', not (course_shift_file(:u, 3, 7, 1, '{"rounds":9,"cash":999,"tips":0,"walk_offs":0}', 999, 5, null, null, 'x', 'replay')->>'filed')::boolean;
insert into t select 'negative cash is refused', not (course_shift_file(:u, 2, 7, 1, '{"rounds":1,"cash":1,"tips":0,"walk_offs":0}', -5, 3, null, null, 'x', 'replay')->>'filed')::boolean;
insert into t select 'and none of them changed the course', (select cash = 80 and shifts_filed = 1 from course_courses) and (select count(*) from course_shifts) = 1;
insert into t select 'shift 2 files after shift 1', (course_shift_file(:u, 2, 8, 1, '{"rounds":4,"cash":60,"tips":9,"walk_offs":1}', 140, 2.5, null, null, 'def', 'bounds')->>'filed')::boolean
  and (select state->'unlocks'->>'cart_barn' = 'done' from course_courses);
insert into t select 'a shift for somebody with no course is null', course_shift_file('00000000-0000-0000-0000-00000000000b', 1, 7, 1, '{}', 1, 2, null, null, 'x', 'replay') is null;

insert into t select 'events from an account are accepted', course_events_add(:u, null, '[{"session_id":"abcdefgh12","name":"shift_end","client_ms":1200,"props":{"rounds":5}}]') = 1;
insert into t select 'and stored as this game''s', (select count(*) from game_events where game = 'course' and user_id = :u) = 1;
insert into t select 'events from a guest are accepted', course_events_add(null, 'device-12345', '[{"session_id":"abcdefgh12","name":"open","client_ms":1,"props":{}}]') = 1;
insert into t select 'and stored by device', (select count(*) from game_events where game = 'course' and user_id is null and device_id = 'device-12345') = 1;
insert into t select 'no account and no device stores nothing', course_events_add(null, null, '[{"session_id":"abcdefgh12","name":"open","client_ms":1}]') = 0
  and course_events_add(null, 'bad id!', '[{"session_id":"abcdefgh12","name":"open","client_ms":1}]') = 0;
insert into t select 'a batch over 40 or not an array stores nothing', course_events_add(:u, null, '{"a":1}') = 0;

insert into t select 'service_role can call ' || f, has_function_privilege('service_role', f, 'execute') from (values
  ('public.course_open(uuid,int,jsonb)'), ('public.course_shift_file(uuid,int,int,int,jsonb,bigint,numeric,jsonb,jsonb,text,text)'), ('public.course_events_add(uuid,text,jsonb)')) v(f);
insert into t select r || ' cannot call ' || f, not has_function_privilege(r, f, 'execute') from (values ('anon'), ('authenticated')) a(r), (values
  ('public.course_open(uuid,int,jsonb)'), ('public.course_shift_file(uuid,int,int,int,jsonb,bigint,numeric,jsonb,jsonb,text,text)'), ('public.course_events_add(uuid,text,jsonb)')) v(f);
insert into t select r || ' cannot read or write ' || tb, not has_table_privilege(r, tb, 'select') and not has_table_privilege(r, tb, 'insert') and not has_table_privilege(r, tb, 'update')
  from (values ('anon'), ('authenticated')) a(r), (values ('public.course_courses'), ('public.course_holes'), ('public.course_shifts')) v(tb);
insert into t select 'row level security is on for ' || relname, relrowsecurity from pg_class where relname in ('course_courses', 'course_holes', 'course_shifts');

select case when pass then ' ok ' else ' FAIL ' end || name from t;
