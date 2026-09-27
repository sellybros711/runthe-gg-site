-- Run The Diamond profiles and the career (125_baseball_profiles.sql).
--
--   createdb rtd_prof
--   psql -d rtd_prof -f supabase/test/baseball_pro_base.sql
--   psql -d rtd_prof -f supabase/125_baseball_profiles.sql
--   psql -d rtd_prof -f supabase/125_baseball_profiles.sql   (twice: it is idempotent)
--   psql -d rtd_prof -v ON_ERROR_STOP=1 -f supabase/test/baseball_profile_test.sql
--
-- baseball_pro_base.sql supplies auth.users with two accounts and an auth.uid()
-- that reads a setting, so each claim sets who is asking. 125 needs nothing else.

\set ON_ERROR_STOP 1

do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a';
  b uuid := '00000000-0000-0000-0000-00000000000b';
  p public.rtd_profiles;
  c jsonb;
  refused boolean;
begin
  -- ── signed out: nothing is written ─────────────────────────────────────
  perform set_config('test.uid', '', true);
  refused := false;
  begin perform public.rtd_set_profile('NYY'); exception when others then refused := true; end;
  assert refused, 'a guest cannot save a profile';
  refused := false;
  begin perform public.rtd_career_merge('[{"ts":1700000000000}]'); exception when others then refused := true; end;
  assert refused, 'a guest cannot file a career';

  -- ── the choices ────────────────────────────────────────────────────────
  perform set_config('test.uid', a::text, true);
  p := public.rtd_set_profile(p_club => 'NYY', p_initials => 'dj', p_mark => 'ball');
  assert p.club = 'NYY' and p.initials = 'DJ' and p.mark = 'ball', 'the choices are saved, initials upper-cased';

  -- null leaves a field alone, so changing one thing never needs the rest
  p := public.rtd_set_profile(p_park => 'ivy');
  assert p.club = 'NYY' and p.initials = 'DJ' and p.mark = 'ball' and p.park = 'ivy',
    'setting the park leaves the club, initials and mark where they were';

  -- the empty string clears
  p := public.rtd_set_profile(p_club => '', p_initials => '');
  assert p.club is null and p.initials is null and p.mark = 'ball', 'an empty string clears, and only that field';

  -- every field is held to its list
  refused := false;
  begin perform public.rtd_set_profile(p_club => 'KC'); exception when others then refused := true; end;
  assert refused, 'a football club is refused';
  refused := false;
  begin perform public.rtd_set_profile(p_club => 'OAK'); exception when others then refused := true; end;
  assert refused, 'a club code that is not playing today is refused';
  refused := false;
  begin perform public.rtd_set_profile(p_initials => 'ABC'); exception when others then refused := true; end;
  assert refused, 'three initials are refused';
  refused := false;
  begin perform public.rtd_set_profile(p_initials => '<b'); exception when others then refused := true; end;
  assert refused, 'markup in the initials is refused';
  refused := false;
  begin perform public.rtd_set_profile(p_mark => 'pad'); exception when others then refused := true; end;
  assert refused, 'a football mark is refused';
  refused := false;
  begin perform public.rtd_set_profile(p_park => 'wrigley'); exception when others then refused := true; end;
  assert refused, 'a park that does not exist is refused';
  refused := false;
  begin perform public.rtd_set_profile(p_tier => 'platinum'); exception when others then refused := true; end;
  assert refused, 'a tier that does not exist is refused';
  select * into p from public.rtd_profiles where user_id = a;
  assert p.club is null and p.mark = 'ball' and p.park = 'ivy', 'a refused write changed nothing';

  p := public.rtd_set_profile(p_tier => 'silver2', p_ring => 'gold', p_rung => 2);
  assert p.tier = 'silver2' and p.ring = 'gold' and p.rung = 2, 'the rank, the ring and the rung are saved';
  refused := false;
  begin perform public.rtd_set_profile(p_rung => 4); exception when others then refused := true; end;
  assert refused, 'a rung past the World Series is refused';

  -- one account's profile is not another's
  perform set_config('test.uid', b::text, true);
  p := public.rtd_set_profile(p_club => 'BOS');
  assert p.club = 'BOS', 'b has its own profile';
  select * into p from public.rtd_profiles where user_id = a;
  assert p.mark = 'ball' and p.club is null, 'and writing it did not touch a';

  -- ── the career: it only ever adds ──────────────────────────────────────
  perform set_config('test.uid', a::text, true);
  c := public.rtd_career_merge('[{"ts":1700000000001,"wins":90},{"ts":1700000000002,"wins":80}]');
  assert jsonb_array_length(c) = 2, 'two seasons filed';

  -- a second device with one season the server has and one it has not
  c := public.rtd_career_merge('[{"ts":1700000000002,"wins":1},{"ts":1700000000003,"wins":70}]');
  assert jsonb_array_length(c) = 3, 'the union of both devices: ' || jsonb_array_length(c);
  assert (select (r->>'wins')::int from jsonb_array_elements(c) r where r->>'ts' = '1700000000002') = 80,
    'a season already held is never replaced by a later copy';

  -- an empty send is a read, and loses nothing
  c := public.rtd_career_merge('[]');
  assert jsonb_array_length(c) = 3, 'sending nothing returns everything and removes nothing';
  c := public.rtd_career_merge(null);
  assert jsonb_array_length(c) = 3, 'a null send is a read too';

  -- ordered oldest first, which is the order the page files them in
  assert (c->0->>'ts') = '1700000000001' and (c->2->>'ts') = '1700000000003', 'oldest first';

  -- every row is stamped with the caller, whatever it claimed
  c := public.rtd_career_merge('[{"ts":1700000000004,"u":"00000000-0000-0000-0000-00000000000b"}]');
  assert (select bool_and(r->>'u' = a::text) from jsonb_array_elements(c) r),
    'every row is filed under the account that sent it';

  -- junk rows are dropped rather than stored
  c := public.rtd_career_merge('[5, "x", {"wins":3}, {"ts":"abc"}, {"ts":1700000000005}]');
  assert jsonb_array_length(c) = 5, 'only the row with a real ts was added: ' || jsonb_array_length(c);

  refused := false;
  begin perform public.rtd_career_merge('{"ts":1}'); exception when others then refused := true; end;
  assert refused, 'a non-array is refused';

  -- another account cannot see or touch it
  perform set_config('test.uid', b::text, true);
  c := public.rtd_career_merge('[]');
  assert jsonb_array_length(c) = 0, 'b has no career of a''s';
  perform set_config('test.uid', a::text, true);
  c := public.rtd_career_merge('[]');
  assert jsonb_array_length(c) = 5, 'and a still has all five';

  -- the cap keeps the NEWEST thousand
  c := public.rtd_career_merge((select jsonb_agg(jsonb_build_object('ts', 1800000000000 + g)) from generate_series(1, 1000) g));
  assert jsonb_array_length(c) = 1000, 'capped at a thousand';
  assert (c->0->>'ts')::bigint = 1800000000001, 'the oldest five went, the newest thousand stayed';

  -- deleting the account deletes both
  delete from auth.users where id = a;
  assert not exists (select 1 from public.rtd_profiles where user_id = a), 'the profile goes with the account';
  assert not exists (select 1 from public.rtd_career where user_id = a), 'and the career does too';

  raise notice 'baseball_profile_test: all claims hold';
end $$;

-- ── who can read what, asked as the real roles ────────────────────────────
set role anon;
select count(*) from public.rtd_profiles;                       -- public
do $$ begin
  perform count(*) from public.rtd_career;
  raise exception 'anon read rtd_career';
exception when insufficient_privilege then null; end $$;
reset role;

set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  assert (select count(*) from public.rtd_career) = 1, 'b reads its own career row and only that';
  begin
    insert into public.rtd_profiles (user_id, club) values ('00000000-0000-0000-0000-00000000000b', 'NYY');
    raise exception 'authenticated wrote rtd_profiles directly';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
