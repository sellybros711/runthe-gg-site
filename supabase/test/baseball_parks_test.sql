-- Run The Diamond: the ballpark ladder (128_baseball_parks.sql).
--
--   createdb rtd_parks
--   psql -d rtd_parks -f supabase/test/baseball_pro_base.sql
--   psql -d rtd_parks -f supabase/127_baseball_profiles.sql
--   psql -d rtd_parks -f supabase/128_baseball_parks.sql
--   psql -d rtd_parks -f supabase/128_baseball_parks.sql   (twice: it is idempotent)
--   psql -d rtd_parks -v ON_ERROR_STOP=1 -f supabase/test/baseball_parks_test.sql
--
-- The list of ids in 128 is held to baseball/parks.js by check-parks.mjs. What is
-- asked here is that the database really takes the new ones and still takes the
-- old ones, and still refuses a park that does not exist.

\set ON_ERROR_STOP 1

do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a';
  p public.rtd_profiles;
  refused boolean;
  id text;
begin
  perform set_config('test.uid', a::text, true);
  foreach id in array array['sandlot','littleleague','varsity','campus','singlea','doublea','triplea',
      'opener','fireworks','haunted','winter','moonlight','rainout','golden'] loop
    p := public.rtd_set_profile(p_park => id);
    assert p.park = id, 'a new park is saved: ' || id;
  end loop;
  foreach id in array array['home','ivy','monster','dome','neon'] loop
    p := public.rtd_set_profile(p_park => id);
    assert p.park = id, 'a park 127 allowed is still allowed: ' || id;
  end loop;
  refused := false;
  begin perform public.rtd_set_profile(p_park => 'wrigley'); exception when others then refused := true; end;
  assert refused, 'a park that does not exist is still refused';
  raise notice 'baseball parks: every claim held';
end $$;
