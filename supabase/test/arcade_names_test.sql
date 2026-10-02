-- ---------------------------------------------------------------------------
-- arcade_names_test.sql : every row on the arcade board carries a name (131).
--
--   createdb namest
--   psql -d namest -f supabase/test/fantasy_base.sql
--   psql -d namest -c 'create table public.subscriptions(user_id uuid, status text, current_period_end timestamptz);'
--   psql -d namest -f supabase/101_premium_bundles.sql
--   psql -d namest -f supabase/52_grid_daily.sql   (then 70, 72, 73, 74, 75, 76, 82, 85 and 125, in that order)
--   psql -d namest -f supabase/test/arcade_names_test.sql   (it applies 131 itself, between the two halves)
--
-- The claims: an account with no username is filed under a generated name and
-- never under 'Player'; two such accounts get two different names; a named
-- account keeps its own; a row written before 131 is backfilled; the name is
-- stable for the account; and the all-time board reads the same name.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\pset pager off

create or replace function public.claim(p_label text, p_ok boolean)
returns void language plpgsql as $$
begin
  if p_ok then raise notice 'ok    %', p_label;
  else raise exception 'FAILED: %', p_label;
  end if;
end $$;

insert into auth.users values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222'),
  ('33333333-3333-4333-8333-333333333333');
insert into public.profiles(id, username) values
  ('11111111-1111-4111-8111-111111111111', 'named_one'),
  ('22222222-2222-4222-8222-222222222222', null),
  ('33333333-3333-4333-8333-333333333333', null);

-- A row from before 131: the submit wrote a null name.
select public.become('22222222-2222-4222-8222-222222222222');
select public.grid_submit_run('match', current_date, 40, 0, 0, null);
select public.claim('before 131 an unnamed account is filed with no name',
  (select display_name from grid_runs where user_id = '22222222-2222-4222-8222-222222222222') is null);

\i supabase/131_arcade_generated_names.sql

select public.claim('the old blank row is backfilled',
  (select display_name from grid_runs where user_id = '22222222-2222-4222-8222-222222222222')
    = public.arcade_generated_name('22222222-2222-4222-8222-222222222222'));

select public.become('33333333-3333-4333-8333-333333333333');
select public.grid_submit_run('match', current_date, 50, 0, 0, null);
select public.become('11111111-1111-4111-8111-111111111111');
select public.grid_submit_run('match', current_date, 60, 0, 0, null);

select public.claim('a new unnamed row gets a generated name, not Player',
  (select display_name from grid_runs where user_id = '33333333-3333-4333-8333-333333333333') ~ '^[A-Z][a-z]+ [A-Z][A-Za-z ]+ [0-9]{3}$');
select public.claim('two unnamed accounts get two different names',
  public.arcade_generated_name('22222222-2222-4222-8222-222222222222')
    <> public.arcade_generated_name('33333333-3333-4333-8333-333333333333'));
select public.claim('a named account keeps its own name',
  (select display_name from grid_runs where user_id = '11111111-1111-4111-8111-111111111111') = 'named_one');
select public.claim('the name is stable for an account',
  public.arcade_generated_name('33333333-3333-4333-8333-333333333333')
    = public.arcade_generated_name('33333333-3333-4333-8333-333333333333'));
select public.claim('no row on the board says Player',
  not exists (select 1 from public.grid_alltime_board('match', 10, 0) where display_name = 'Player'));
select public.claim('the all-time board reads the generated name',
  exists (select 1 from public.grid_alltime_board('match', 10, 0)
          where display_name = public.arcade_generated_name('33333333-3333-4333-8333-333333333333')));
-- The browser derives the same string; scripts/check-arcade-names.mjs holds these.
select 'fixture' as k, public.arcade_generated_name('22222222-2222-4222-8222-222222222222') as v
union all select 'fixture2', public.arcade_generated_name('00000000-0000-4000-8000-000000000001')
union all select 'fixture3', public.arcade_generated_name('fedcba98-7654-4321-8abc-def012345678');

\echo 'arcade names ok'
