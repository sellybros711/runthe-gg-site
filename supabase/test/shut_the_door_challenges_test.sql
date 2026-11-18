-- Shut The Door custom challenges (183). Chain, after the 153 to 160 chains, storage_base.sql
-- and their tests:
--   psql -d std -f supabase/183_shut_the_door_challenges.sql
--   psql -d std -f supabase/183_shut_the_door_challenges.sql   (twice: it is safe to rerun)
--   psql -d std -f supabase/test/shut_the_door_challenges_test.sql
\set ON_ERROR_STOP on
create table if not exists public.profiles (id uuid primary key, username text);
insert into public.profiles values
  ('00000000-0000-0000-0000-0000000000c1', 'maker'),
  ('00000000-0000-0000-0000-0000000000c2', 'friend'),
  ('00000000-0000-0000-0000-0000000000c3', 'free maker') on conflict do nothing;
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000c1'), ('00000000-0000-0000-0000-0000000000c2'),
  ('00000000-0000-0000-0000-0000000000c3') on conflict do nothing;

create or replace function pg_temp.claim(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; raise notice 'ok  %', what; end $$;
create or replace function pg_temp.fails(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return true; end $$;
create or replace function pg_temp.calls(n int) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('type', 'FF', 'cell', 12, 'r', 12, 'q', 0.5, 'e', 0.4)) from generate_series(1, n) $$;
create or replace function pg_temp.strip(n int) returns jsonb language sql as $$
  select jsonb_agg('green'::text) from generate_series(1, n) $$;
create or replace function pg_temp.spec() returns jsonb language sql as $$
  select '{"v":1,"pitcher":"std-2016-ws7-chapman","lineup":"std-2025-ws7-yamamoto","up":4,"on":[3,null,1],
           "outs":1,"balls":2,"strikes":1,"lead":1,"them":4,"inning":9,"home":false}'::jsonb $$;
create or replace function pg_temp.sha() returns text language sql as $$ select repeat('ab', 32) $$;

-- 1. the bucket: public, and run twice it is still one
select pg_temp.claim((select count(*) from storage.buckets where id = 'shutdoor-matchups' and public) = 1, 'the matchup bucket is public');

-- 2. the spec, as challenge.js checks it
select pg_temp.claim(shutdoor_challenge_spec_ok(pg_temp.spec()) is null, 'a challenge is a challenge');
select pg_temp.claim(shutdoor_challenge_spec_ok(pg_temp.spec() || '{"lead":4}') = 'the lead is 1 to 3 runs', 'a lead of four');
select pg_temp.claim(shutdoor_challenge_spec_ok(pg_temp.spec() || '{"lead":0}') = 'the lead is 1 to 3 runs', 'a tie is not a lead');
select pg_temp.claim(shutdoor_challenge_spec_ok(pg_temp.spec() || '{"inning":7}') is not null, 'the 7th is not offered');
select pg_temp.claim(shutdoor_challenge_spec_ok(pg_temp.spec() || '{"balls":4}') = 'pick the count', 'four balls is a walk');
select pg_temp.claim(shutdoor_challenge_spec_ok(pg_temp.spec() || '{"outs":3}') = 'pick the outs', 'three outs is over');
select pg_temp.claim(shutdoor_challenge_spec_ok(pg_temp.spec() || '{"on":[4,null,null]}') = 'the man up cannot be on base', 'the man up is not on base');
select pg_temp.claim(shutdoor_challenge_spec_ok(pg_temp.spec() || '{"on":[3,3,null]}') = 'a runner on two bases', 'one man, one base');
select pg_temp.claim(shutdoor_challenge_spec_ok(pg_temp.spec() || '{"on":[5,null,null]}') is not null, 'the man after him is not on base');
select pg_temp.claim(shutdoor_challenge_spec_ok(pg_temp.spec() || '{"on":[0,null,null]}') is null, 'four before him may be');
select pg_temp.claim(shutdoor_challenge_spec_ok(pg_temp.spec() || '{"outs":"1"}') is not null, 'a number is a number');
select pg_temp.claim(shutdoor_challenge_spec_ok(pg_temp.spec() || '{"extra":1}') = 'not a challenge', 'nothing but the spec');
select pg_temp.claim(shutdoor_challenge_spec_ok(pg_temp.spec() - 'home') = 'not a challenge', 'every field is there');

-- 3. making one is for Pro (160's gate answers false for everyone until 181)
set test.uid = '00000000-0000-0000-0000-0000000000c3';
select pg_temp.claim(pg_temp.fails($$select shutdoor_challenge_create(pg_temp.spec(), 'm1', pg_temp.sha(), 12)$$), 'free: no challenge made');
reset test.uid;
select pg_temp.claim(pg_temp.fails($$select shutdoor_challenge_create(pg_temp.spec(), 'm1', pg_temp.sha(), 12)$$), 'signed out: no challenge made');

create or replace function public.shutdoor_is_pro(p_uid uuid) returns boolean language sql stable as $$
  select p_uid = '00000000-0000-0000-0000-0000000000c1'::uuid $$;
set test.uid = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.claim(pg_temp.fails($$select shutdoor_challenge_create(pg_temp.spec() || '{"pitcher":"std-1999-nobody"}', 'm1', pg_temp.sha(), 12)$$),
  'a pitcher in the game');
select pg_temp.claim(pg_temp.fails($$select shutdoor_challenge_create(pg_temp.spec(), 'm1', 'nope', 12)$$), 'a real sha');
select pg_temp.claim(pg_temp.fails($$select shutdoor_challenge_create(pg_temp.spec() || '{"lead":5}', 'm1', pg_temp.sha(), 12)$$), 'the spec is checked');
create temp table made as select shutdoor_challenge_create(pg_temp.spec(), 'm1', pg_temp.sha(), 12) as j;
grant select on made to anon;
select pg_temp.claim((select (j->>'code') ~ '^[A-HJ-NP-Z2-9]{6}$' from made), 'a six-letter code');
select pg_temp.claim((select (j->>'seed')::bigint between 0 and 4294967295 from made), 'the server draws the seed');
select pg_temp.claim((select (shutdoor_challenge_get((j->>'code'))->>'mine')::boolean from made), 'the maker''s own');
select pg_temp.claim((select shutdoor_challenge_get(lower(j->>'code'))->>'code' = j->>'code' from made), 'a code in lower case finds it');

-- 4. anyone reads it, signed out too
reset test.uid;
set role anon;
select pg_temp.claim((select (shutdoor_challenge_get(j->>'code')->>'players')::int = 0 from made), 'a guest reads it');
select pg_temp.claim((select shutdoor_challenge_get(j->>'code')->>'creator' = 'maker' from made), 'by the maker''s name');
select pg_temp.claim(shutdoor_challenge_get('ZZZZZZ') is null, 'no such code');
select pg_temp.claim(pg_temp.fails($$select * from shutdoor_challenges$$) and pg_temp.fails($$select * from shutdoor_challenge_results$$),
  'nobody reads the tables directly');
select pg_temp.claim(pg_temp.fails($$select shutdoor_challenge_submit('ZZZZZZ', pg_temp.calls(5), 'door_shut', 5, 800, pg_temp.strip(5))$$),
  'a guest posts nothing');
reset role;

-- 5. one counted try a player: the first post stands
set test.uid = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.claim((select (shutdoor_challenge_submit(j->>'code', pg_temp.calls(12), 'door_shut', 12, 812, pg_temp.strip(12))->>'taken')::boolean from made),
  'the maker''s try');
select pg_temp.claim((select (shutdoor_challenge_submit(j->>'code', pg_temp.calls(4), 'door_shut', 4, 990, pg_temp.strip(4))->>'taken')::boolean = false from made),
  'a second try does not count');
set test.uid = '00000000-0000-0000-0000-0000000000c3';
select pg_temp.claim((select (shutdoor_challenge_submit(j->>'code', pg_temp.calls(9), 'tie_held', 9, 640, pg_temp.strip(9))->>'taken')::boolean from made),
  'a free player plays it and posts');
select pg_temp.claim(pg_temp.fails(format($$select shutdoor_challenge_submit(%L, pg_temp.calls(9), 'door_shut', 8, 640, pg_temp.strip(9))$$,
  (select j->>'code' from made))), 'the calls make the outing');
select pg_temp.claim(pg_temp.fails(format($$select shutdoor_challenge_submit(%L, pg_temp.calls(9), 'door_shut', 9, 1640, pg_temp.strip(9))$$,
  (select j->>'code' from made))), 'a real score');
set test.uid = '00000000-0000-0000-0000-0000000000c2';
select pg_temp.claim((select (shutdoor_challenge_submit(j->>'code', pg_temp.calls(14), 'door_shut', 14, 900, pg_temp.strip(14))->'result'->>'players')::int = 3 from made),
  'three players');
create temp table got as select shutdoor_challenge_get((select j->>'code' from made)) as g;
select pg_temp.claim((select g->'results'->0->>'username' = 'friend' and (g->'results'->0->>'mine')::boolean from got), 'the friend beat the maker');
select pg_temp.claim((select g->'results'->1->>'username' = 'maker' and (g->'results'->1->>'creator')::boolean
                         and (g->'results'->1->>'score')::int = 812 from got), 'the maker''s first score stands');
select pg_temp.claim((select (g->'myResult'->>'score')::int = 900 and jsonb_array_length((g->'myResult'->'calls')::jsonb) = 14 from got),
  'the caller''s own try comes back to replay');
select pg_temp.claim(json_array_length(shutdoor_my_challenges()) = 1 and (shutdoor_my_challenges()->0->>'made')::boolean = false,
  'played, not made');
set test.uid = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.claim((shutdoor_my_challenges()->0->>'made')::boolean and (shutdoor_my_challenges()->0->>'best')::int = 900, 'made, and the best');

-- 6. never on a board: the daily, Survivor and the archive have none of it
select pg_temp.claim((select count(*) from shutdoor_outings o where o.user_id in ('00000000-0000-0000-0000-0000000000c1',
  '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c3')) = 0
  and (select count(*) from shutdoor_survivor s where s.user_id in ('00000000-0000-0000-0000-0000000000c1',
  '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c3')) = 0
  and (select count(*) from shutdoor_archive a where a.user_id in ('00000000-0000-0000-0000-0000000000c1',
  '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c3')) = 0, 'no challenge on any board');

-- 7. rerun: nothing kept is lost, the gate is 160's again
reset test.uid;
\i supabase/183_shut_the_door_challenges.sql
select pg_temp.claim((select count(*) from shutdoor_challenge_results) = 3, 'a rerun keeps every result');
\i supabase/160_shut_the_door_vote_survivor.sql
select pg_temp.claim(shutdoor_is_pro('00000000-0000-0000-0000-0000000000c1') = false, 'rerunning 160 puts the gate back off');
delete from shutdoor_challenges;
