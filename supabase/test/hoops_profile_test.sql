-- Run The Floor profiles (128_hoops_profiles.sql).
--
--   createdb rtf_prof
--   psql -d rtf_prof -f supabase/test/baseball_pro_base.sql
--   psql -d rtf_prof -f supabase/128_hoops_profiles.sql
--   psql -d rtf_prof -f supabase/128_hoops_profiles.sql   (twice: it is idempotent)
--   psql -d rtf_prof -v ON_ERROR_STOP=1 -f supabase/test/hoops_profile_test.sql
--
-- baseball_pro_base.sql supplies auth.users with two accounts and an auth.uid()
-- that reads a setting, so each claim sets who is asking.

\set ON_ERROR_STOP 1

do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a';
  b uuid := '00000000-0000-0000-0000-00000000000b';
  p public.rtf_profiles;
  refused boolean;
  bad text;
begin
  -- signed out: nothing is written
  perform set_config('test.uid', '', true);
  refused := false;
  begin perform public.rtf_set_profile('BOS'); exception when others then refused := true; end;
  assert refused, 'a guest cannot save a profile';

  -- the choices
  perform set_config('test.uid', a::text, true);
  p := public.rtf_set_profile(p_club => 'BOS', p_num => '33', p_arena => 'parquet', p_camera => 'tq');
  assert p.jersey_club = 'BOS' and p.jersey_num = '33' and p.arena = 'parquet' and p.camera = 'tq',
    'the jersey, the arena and the camera are saved';

  -- null leaves a field alone
  p := public.rtf_set_profile(p_camera => 'top', p_last_club => 'lal', p_last_era => 'eighties', p_guide => true);
  assert p.jersey_club = 'BOS' and p.jersey_num = '33' and p.arena = 'parquet' and p.camera = 'top'
    and p.last_club = 'LAL' and p.last_era = 'eighties' and p.guide_seen,
    'setting the camera and the doors leaves the jersey and the arena where they were';

  -- the empty string clears, and only that field
  p := public.rtf_set_profile(p_arena => '');
  assert p.arena is null and p.jersey_club = 'BOS', 'an empty string clears one field';

  -- every field is held to its list
  foreach bad in array array['club:NYY','club:SEA','num:100','num:7a','arena:ivy','camera:side','era:fifties','lastclub:<b>']
  loop
    refused := false;
    begin
      case split_part(bad, ':', 1)
        when 'club' then perform public.rtf_set_profile(p_club => split_part(bad, ':', 2));
        when 'num' then perform public.rtf_set_profile(p_num => split_part(bad, ':', 2));
        when 'arena' then perform public.rtf_set_profile(p_arena => split_part(bad, ':', 2));
        when 'camera' then perform public.rtf_set_profile(p_camera => split_part(bad, ':', 2));
        when 'era' then perform public.rtf_set_profile(p_last_era => split_part(bad, ':', 2));
        else perform public.rtf_set_profile(p_last_club => split_part(bad, ':', 2));
      end case;
    exception when others then refused := true; end;
    assert refused, 'refused: ' || bad;
  end loop;

  -- one account never writes another's row
  perform set_config('test.uid', b::text, true);
  p := public.rtf_set_profile(p_club => 'house', p_num => '1');
  assert p.user_id = b, 'the row written is the caller''s';
  assert (select jersey_club from public.rtf_profiles where user_id = a) = 'BOS', 'and the first account''s is untouched';
  assert (select count(*) from public.rtf_profiles) = 2, 'one row an account';
end $$;

-- a board draws other players' jerseys, so anybody may read; nobody may write directly
do $$
declare refused boolean;
begin
  assert has_table_privilege('anon', 'public.rtf_profiles', 'select'), 'anon can read the jerseys';
  assert not has_table_privilege('authenticated', 'public.rtf_profiles', 'update'), 'nobody updates the table directly';
  assert not has_table_privilege('authenticated', 'public.rtf_profiles', 'insert'), 'or inserts into it';
end $$;

select 'hoops_profile_test: all claims hold' as result;
