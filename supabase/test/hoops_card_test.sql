-- The Run The Floor player card on the public profile (140_hoops_card.sql).
--
--   createdb rtf_card
--   psql -d rtf_card -f supabase/test/baseball_pro_base.sql
--   psql -d rtf_card -f supabase/129_hoops_profiles.sql
--   psql -d rtf_card -f supabase/139_hoops_wardrobe.sql
--   psql -d rtf_card -f supabase/140_hoops_card.sql
--   psql -d rtf_card -f supabase/140_hoops_card.sql   (twice: it is idempotent)
--   psql -d rtf_card -v ON_ERROR_STOP=1 -f supabase/test/hoops_card_test.sql

\set ON_ERROR_STOP 1

do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a';
  p public.rtf_profiles;
  refused boolean;
  good jsonb := '{"look":{"skin":3,"hc":1,"hair":"fade","beard":"none","bc":-1,"band":"none","sleeve":"none","shoes":"classic","build":"lean","ht":79,"wt":215},"name":"Dre O''Neal-Smith","num":23,"pos":"SF","c1":"#e8660f","c2":"#1d1f2b","rep":7}';
begin
  perform set_config('test.uid', a::text, true);
  p := public.rtf_set_profile(p_club => 'BOS', p_num => '33');

  -- the slots that are not clothes: an idle, a nameplate and a backdrop ride in
  -- the street loadout, and an idle in the court one. 139 refused all of them.
  p := public.rtf_set_profile(p_wear_street => '{"top":"hoodie_black","idle":"id_flex","plate":"pl_gold","bg":"bg_aurora"}',
                              p_wear_court => '{"goggles":"goggles_specs","idle":"id_wave"}');
  assert p.wear_street ->> 'plate' = 'pl_gold' and p.wear_street ->> 'bg' = 'bg_aurora' and p.wear_street ->> 'idle' = 'id_flex', 'the street look keeps its idle, plate and backdrop';
  assert p.wear_court ->> 'idle' = 'id_wave', 'the court look keeps its idle';
  refused := false;
  begin perform public.rtf_set_profile(p_wear_court => '{"plate":"pl_gold"}'); exception when check_violation then refused := true; end;
  assert refused, 'a nameplate is refused in the court look';
  -- fifteen slots fill the street look, and sixteen distinct keys are allowed
  p := public.rtf_set_profile(p_wear_street => '{"hat":"aa","eyes":"aa","top":"aa","outer":"aa","bottom":"aa","shoes":"aa","socks":"aa","chain":"aa","watch":"aa","bag":"aa","phones":"aa","held":"aa","idle":"aa","plate":"aa","bg":"aa"}');
  assert (select count(*) from jsonb_object_keys(p.wear_street)) = 15, 'a full street look of fifteen is kept';

  -- the player is saved, and an old field is left alone
  p := public.rtf_set_profile(p_player => good);
  assert p.player ->> 'name' = 'Dre O''Neal-Smith' and (p.player -> 'look' ->> 'ht')::int = 79, 'the player is saved';
  assert p.jersey_club = 'BOS' and p.wear_street ->> 'bg' = 'aa', 'saving the player leaves the jersey and the loadout alone';
  p := public.rtf_set_profile(p_camera => 'top');
  assert p.player ->> 'pos' = 'SF', 'a call without the player keeps him';

  -- shape, one key at a time, and each refused write changes nothing
  refused := false;
  begin perform public.rtf_set_profile(p_player => good || '{"name":"Big Mike 23"}'); exception when check_violation then refused := true; end;
  assert refused, 'a name the Career board would refuse is refused';
  refused := false;
  begin perform public.rtf_set_profile(p_player => good || '{"name":"<b>x</b>"}'); exception when check_violation then refused := true; end;
  assert refused, 'markup in a name is refused';
  refused := false;
  begin perform public.rtf_set_profile(p_player => good || '{"num":100}'); exception when check_violation then refused := true; end;
  assert refused, 'a number past 99 is refused';
  refused := false;
  begin perform public.rtf_set_profile(p_player => good || '{"num":7.5}'); exception when check_violation then refused := true; end;
  assert refused, 'a number that is not whole is refused';
  refused := false;
  begin perform public.rtf_set_profile(p_player => good || '{"pos":"QB"}'); exception when check_violation then refused := true; end;
  assert refused, 'a position basketball does not have is refused';
  refused := false;
  begin perform public.rtf_set_profile(p_player => good || '{"c1":"red"}'); exception when check_violation then refused := true; end;
  assert refused, 'a colour that is not a hex is refused';
  refused := false;
  begin perform public.rtf_set_profile(p_player => good || '{"rep":20}'); exception when check_violation then refused := true; end;
  assert refused, 'a rank past G.O.A.T. is refused';
  refused := false;
  begin perform public.rtf_set_profile(p_player => good || '{"bio":"hello"}'); exception when check_violation then refused := true; end;
  assert refused, 'a key the card does not have is refused';
  refused := false;
  begin perform public.rtf_set_profile(p_player => jsonb_set(good, '{look,hair}', '"<img src=x>"')); exception when check_violation then refused := true; end;
  assert refused, 'a look id that is not one is refused';
  refused := false;
  begin perform public.rtf_set_profile(p_player => jsonb_set(good, '{look,ht}', '9000')); exception when check_violation then refused := true; end;
  assert refused, 'a look number out of range is refused';
  refused := false;
  begin perform public.rtf_set_profile(p_player => '["look"]'); exception when check_violation then refused := true; end;
  assert refused, 'a player that is not an object is refused';
  p := (select r from public.rtf_profiles r where r.user_id = a);
  assert p.player = good, 'a refused player changes nothing';

  -- one function, not two overloads that would make a call by name ambiguous
  assert (select count(*) from pg_proc where proname = 'rtf_set_profile') = 1, 'there is one rtf_set_profile';

  -- a guest still cannot write
  perform set_config('test.uid', '', true);
  refused := false;
  begin perform public.rtf_set_profile(p_player => good); exception when others then refused := true; end;
  assert refused, 'a guest cannot save a player';

  raise notice 'hoops card: all claims hold';
end $$;
