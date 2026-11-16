-- Run The Diamond's career, written only when something is new (172_rtd_career_sync.sql).
--
--   createdb rtd_prof
--   psql -d rtd_prof -f supabase/test/baseball_pro_base.sql
--   psql -d rtd_prof -f supabase/127_baseball_profiles.sql
--   psql -d rtd_prof -f supabase/172_rtd_career_sync.sql
--   psql -d rtd_prof -f supabase/172_rtd_career_sync.sql   (twice: it is idempotent)
--   psql -d rtd_prof -v ON_ERROR_STOP=1 -f supabase/test/baseball_career_sync_test.sql
--
-- "No write" is read off the row's xmin: an update makes a new row version with
-- a new xmin, so an unchanged xmin is a row nobody rewrote. Each step runs in its
-- own transaction (a separate do block), or every write would share one xmin.

\set ON_ERROR_STOP 1

create temp table seen (k text primary key, v text);

do $$
declare refused boolean := false;
begin
  perform set_config('test.uid', '', false);
  begin perform public.rtd_career_sync('[{"ts":1700000000000}]', 0); exception when others then refused := true; end;
  assert refused, 'a guest cannot file a career';
end $$;

-- a fresh account: nothing to send and nothing kept is a read, not a row
do $$
declare c jsonb;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000000b', false);
  c := public.rtd_career_sync('[]', 0);
  assert jsonb_array_length(c->'rows') = 0 and (c->>'n')::int = 0 and (c->>'top')::bigint = 0, 'an empty career reads as empty: ' || c::text;
  assert not exists (select 1 from public.rtd_career where user_id = '00000000-0000-0000-0000-00000000000b'),
    'reading an empty career creates no row';
end $$;

-- two new seasons are kept, and come back because since is 0
do $$
declare c jsonb;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000000a', false);
  c := public.rtd_career_sync('[{"ts":1700000000001,"wins":90},{"ts":1700000000002,"wins":80}]', 0);
  assert jsonb_array_length(c->'rows') = 2 and (c->>'n')::int = 2, 'two seasons filed: ' || c::text;
  assert (c->>'top')::bigint = 1700000000002, 'top is the newest ts';
  insert into seen select 'x1', xmin::text from public.rtd_career where user_id = '00000000-0000-0000-0000-00000000000a';
end $$;

-- the same two again: no write, and since = top sends back nothing
do $$
declare c jsonb;
begin
  c := public.rtd_career_sync('[{"ts":1700000000001,"wins":1},{"ts":1700000000002,"wins":1}]', 1700000000002);
  assert jsonb_array_length(c->'rows') = 0 and (c->>'n')::int = 2, 'nothing new comes back: ' || c::text;
  assert (select xmin::text from public.rtd_career where user_id = '00000000-0000-0000-0000-00000000000a') = (select v from seen where k = 'x1'),
    'resending seasons already kept rewrites nothing';
  assert (select (r->>'wins')::int from public.rtd_career c, jsonb_array_elements(c.rows) r
          where c.user_id = '00000000-0000-0000-0000-00000000000a' and r->>'ts' = '1700000000002') = 80,
    'a season already held is never replaced by a later copy';
end $$;

-- a page open with nothing pending: no write, nothing back
do $$
declare c jsonb;
begin
  c := public.rtd_career_sync('[]', 1700000000002);
  assert jsonb_array_length(c->'rows') = 0 and (c->>'n')::int = 2, 'an idle sync is empty';
  assert (select xmin::text from public.rtd_career where user_id = '00000000-0000-0000-0000-00000000000a') = (select v from seen where k = 'x1'),
    'an idle sync rewrites nothing';
end $$;

-- one new season: one write, and only seasons past since come back
do $$
declare c jsonb;
begin
  c := public.rtd_career_sync('[{"ts":1700000000002},{"ts":1700000000003,"wins":70,"u":"00000000-0000-0000-0000-00000000000b"}]', 1700000000002);
  assert jsonb_array_length(c->'rows') = 1 and (c->'rows'->0->>'ts') = '1700000000003', 'only the new season comes back: ' || c::text;
  assert (c->>'n')::int = 3 and (c->>'top')::bigint = 1700000000003, 'three kept, top moved';
  assert (c->'rows'->0->>'u') = '00000000-0000-0000-0000-00000000000a', 'the row is filed under the caller, whatever it claimed';
  assert (select xmin::text from public.rtd_career where user_id = '00000000-0000-0000-0000-00000000000a') <> (select v from seen where k = 'x1'),
    'a new season is written';
  update seen set v = (select xmin::text from public.rtd_career where user_id = '00000000-0000-0000-0000-00000000000a') where k = 'x1';
end $$;

-- a season another device filed late, under an older ts: since misses it, n does not
do $$
declare c jsonb;
begin
  c := public.rtd_career_sync('[{"ts":1700000000000,"wins":60}]', 0);
  c := public.rtd_career_sync('[]', 1700000000003);
  assert jsonb_array_length(c->'rows') = 0 and (c->>'n')::int = 4, 'n counts the late season the since window cannot see: ' || c::text;
  c := public.rtd_career_sync('[]', 0);
  assert jsonb_array_length(c->'rows') = 4 and (c->'rows'->0->>'ts') = '1700000000000', 'since 0 reads the whole career, oldest first';
end $$;

-- junk is dropped, never stored, and a send of only junk writes nothing
do $$
declare c jsonb; refused boolean := false;
begin
  update seen set v = (select xmin::text from public.rtd_career where user_id = '00000000-0000-0000-0000-00000000000a') where k = 'x1';
  c := public.rtd_career_sync('[5, "x", {"wins":3}, {"ts":"abc"}]', 0);
  assert (c->>'n')::int = 4, 'junk rows are not kept';
  assert (select xmin::text from public.rtd_career where user_id = '00000000-0000-0000-0000-00000000000a') = (select v from seen where k = 'x1'),
    'a send of only junk writes nothing';
  begin perform public.rtd_career_sync('{"ts":1}', 0); exception when others then refused := true; end;
  assert refused, 'a non-array is refused';
end $$;

-- the old call, for cached pages: same answer, but an unchanged merge writes nothing
do $$
declare c jsonb;
begin
  c := public.rtd_career_merge('[{"ts":1700000000001},{"ts":1700000000003}]');
  assert jsonb_array_length(c) = 4, 'the old call still returns the whole career';
  assert (select xmin::text from public.rtd_career where user_id = '00000000-0000-0000-0000-00000000000a') = (select v from seen where k = 'x1'),
    'the old call no longer rewrites an unchanged career';
  c := public.rtd_career_merge('[{"ts":1700000000009}]');
  assert jsonb_array_length(c) = 5, 'and still adds a new season';
end $$;

-- the cap still keeps the newest thousand
do $$
declare c jsonb;
begin
  c := public.rtd_career_sync((select jsonb_agg(jsonb_build_object('ts', 1800000000000 + g)) from generate_series(1, 1000) g), 0);
  assert (c->>'n')::int = 1000 and jsonb_array_length(c->'rows') = 1000, 'capped at a thousand';
  assert (c->'rows'->0->>'ts')::bigint = 1800000000001, 'the oldest went, the newest thousand stayed';
end $$;

-- b never sees a's career
do $$
declare c jsonb;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000000b', false);
  c := public.rtd_career_sync('[]', 0);
  assert (c->>'n')::int = 0, 'b has no career of a''s';
end $$;

\echo 'baseball career sync: all checks passed'
