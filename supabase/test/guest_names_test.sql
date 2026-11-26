-- ---------------------------------------------------------------------------
-- guest_names_test.sql : one guest name style, "SwiftShortstop48" (188).
--
-- Set up as in arcade_guest_server_test.sql (fantasy_base, subscriptions, 101,
-- 52, 70, 72, 74, 76, 82, 84, 85, 125, 131 and 185), then:
--   psql -d gst -f supabase/test/guest_names_test.sql   (it applies 188 itself, twice)
--
-- The claims: a guest row and an unnamed account written before 188 are
-- renamed to the new style; a row with a real username is left alone, even
-- one that looks like a generated name; a hand written name with spaces that
-- is not the row's own old name is left alone; a second run changes nothing;
-- new rows get the new style; the name has no spaces, two digits, and stays
-- the same for one id. The last lines print the fixtures that
-- scripts/check-arcade-names.mjs holds the browser to.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\pset pager off

do $$
declare
  g    uuid := 'aaaaaaaa-1111-4111-8111-111111111111';
  acct uuid := '22222222-2222-4222-8222-222222222222';
  real uuid := '44444444-4444-4444-8444-444444444444';
  odd  uuid := '55555555-5555-4555-8555-555555555555';
begin
  insert into auth.users values (acct), (real) on conflict do nothing;
  insert into profiles (id, username) values (acct, null), (real, 'SwiftShortstop48') on conflict do nothing;
  perform public.arcade_guest_submit(g, 'ipkey-names-0123456789', 'crossword', current_date, 120, 0, 0, null);
  insert into grid_runs (user_id, game, puzzle_date, base_seconds, mistakes, reveals, run_len, display_name, flawless) values
    (acct, 'crossword', current_date, 150, 0, 0, null, null, true),
    (real, 'crossword', current_date, 160, 0, 0, null, 'SwiftShortstop48', true),
    (odd,  'crossword', current_date, 170, 0, 0, null, 'Swift Shortstop 100', true);
  if (select display_name from grid_runs where user_id = g) !~ ' \d{3}$' then raise exception 'setup: the guest should carry the 131 name'; end if;
end $$;

\i supabase/188_guest_names_camel.sql
create temp table after_one as select user_id, display_name from grid_runs;
\i supabase/188_guest_names_camel.sql

do $$
declare
  g    uuid := 'aaaaaaaa-1111-4111-8111-111111111111';
  acct uuid := '22222222-2222-4222-8222-222222222222';
  real uuid := '44444444-4444-4444-8444-444444444444';
  odd  uuid := '55555555-5555-4555-8555-555555555555';
  g2   uuid := 'bbbbbbbb-2222-4222-8222-222222222222';
  nm text;
begin
  if (select display_name from grid_runs where user_id = g) <> public.rtg_guest_name(g) then raise exception 'the guest row was not renamed'; end if;
  if (select display_name from grid_runs where user_id = acct) <> public.rtg_guest_name(acct) then raise exception 'the unnamed account was not renamed'; end if;
  if (select display_name from grid_runs where user_id = real) <> 'SwiftShortstop48' then raise exception 'a real username changed'; end if;
  if (select display_name from grid_runs where user_id = odd) <> 'Swift Shortstop 100' then raise exception 'a name that is not the row''s own old name changed'; end if;
  if exists (select 1 from grid_runs r join after_one a using (user_id) where r.display_name is distinct from a.display_name) then
    raise exception 'a second run changed something'; end if;

  perform public.arcade_guest_submit(g2, 'ipkey-names-0123456789', 'career', current_date, 90, 0, 0, 6);
  nm := (select display_name from grid_runs where user_id = g2);
  if nm <> public.rtg_guest_name(g2) or nm !~ '^[A-Z][a-z]+[A-Z][a-z]+[1-9][0-9]$' then raise exception 'a new guest row is %', nm; end if;
  if public.arcade_generated_name(g2) <> public.rtg_guest_name(g2) then raise exception 'the two functions disagree'; end if;
  if public.rtg_guest_name(g2) <> public.rtg_guest_name(g2) then raise exception 'not stable'; end if;
end $$;

\echo 'guest names: all claims hold'
select public.rtg_guest_name('22222222-2222-4222-8222-222222222222') as a,
       public.rtg_guest_name('00000000-0000-4000-8000-000000000001') as b,
       public.rtg_guest_name('fedcba98-7654-4321-8abc-def012345678') as c,
       public.rtg_guest_name('ffffffff-ffff-4fff-8fff-ffffffffffff') as d;
