-- What a Run The Floor player wears, on the public profile (139_hoops_wardrobe.sql).
--
--   createdb rtf_ward
--   psql -d rtf_ward -f supabase/test/baseball_pro_base.sql
--   psql -d rtf_ward -f supabase/129_hoops_profiles.sql
--   psql -d rtf_ward -f supabase/139_hoops_wardrobe.sql
--   psql -d rtf_ward -f supabase/139_hoops_wardrobe.sql   (twice: it is idempotent)
--   psql -d rtf_ward -v ON_ERROR_STOP=1 -f supabase/test/hoops_wardrobe_test.sql

\set ON_ERROR_STOP 1

do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a';
  p public.rtf_profiles;
  refused boolean;
begin
  perform set_config('test.uid', a::text, true);
  p := public.rtf_set_profile(p_club => 'BOS', p_num => '33');

  -- the two loadouts are saved, and an old field is left alone
  p := public.rtf_set_profile(p_wear_street => '{"top":"hoodie_black","hat":"cap_navy"}', p_wear_court => '{"goggles":"goggles_specs","shoes":"hitop_red"}');
  assert p.wear_street ->> 'top' = 'hoodie_black' and p.wear_court ->> 'goggles' = 'goggles_specs', 'both looks are saved';
  assert p.jersey_club = 'BOS' and p.jersey_num = '33', 'saving a look leaves the jersey where it was';

  -- null leaves a loadout alone; an old caller who knows nothing of them cannot wipe them
  p := public.rtf_set_profile(p_camera => 'top');
  assert p.wear_street ->> 'hat' = 'cap_navy' and p.wear_court ->> 'shoes' = 'hitop_red', 'a call without the loadouts keeps them';

  -- the empty object is the starters, a choice, and is kept
  p := public.rtf_set_profile(p_wear_street => '{}');
  assert p.wear_street = '{}'::jsonb and p.wear_court ->> 'goggles' = 'goggles_specs', 'the empty loadout is stored, and only that look';

  -- shape: a slot the look does not have
  refused := false;
  begin perform public.rtf_set_profile(p_wear_street => '{"goggles":"goggles_specs"}'); exception when check_violation then refused := true; end;
  assert refused, 'a court slot is refused in the street look';
  refused := false;
  begin perform public.rtf_set_profile(p_wear_court => '{"hat":"cap_navy"}'); exception when check_violation then refused := true; end;
  assert refused, 'a street slot is refused in the court look';
  -- shape: an id that is not one
  refused := false;
  begin perform public.rtf_set_profile(p_wear_street => '{"top":"<script>"}'); exception when check_violation then refused := true; end;
  assert refused, 'an id that is not a catalogue id is refused';
  refused := false;
  begin perform public.rtf_set_profile(p_wear_street => '{"top":42}'); exception when check_violation then refused := true; end;
  assert refused, 'an id that is not a string is refused';
  refused := false;
  begin perform public.rtf_set_profile(p_wear_street => '["top"]'); exception when check_violation then refused := true; end;
  assert refused, 'a loadout that is not an object is refused';
  p := (select r from public.rtf_profiles r where r.user_id = a);
  assert p.wear_street = '{}'::jsonb, 'a refused loadout changes nothing';

  -- one function, not two overloads that would make a call by name ambiguous
  assert (select count(*) from pg_proc where proname = 'rtf_set_profile') = 1, 'there is one rtf_set_profile';

  -- a guest still cannot write
  perform set_config('test.uid', '', true);
  refused := false;
  begin perform public.rtf_set_profile(p_wear_street => '{}'); exception when others then refused := true; end;
  assert refused, 'a guest cannot save a look';

  raise notice 'hoops wardrobe: all claims hold';
end $$;
