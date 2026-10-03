-- ---------------------------------------------------------------------------
-- arcade_guest_test.sql : a guest's runs reach the board and follow them onto
-- an account (132).
--
--   createdb guestt
--   psql -d guestt -f supabase/test/fantasy_base.sql
--   psql -d guestt -c 'create table public.subscriptions(user_id uuid, status text, current_period_end timestamptz);'
--   psql -d guestt -f supabase/101_premium_bundles.sql
--   psql -d guestt -f supabase/52_grid_daily.sql   (then 70, 72, 73, 74, 75, 76, 82, 85, 125 and 131, in that order)
--   psql -d guestt -f supabase/test/arcade_guest_test.sql   (it applies 132 itself)
--
-- The claims: an anonymous session can post and is filed under a generated
-- name; it can get a ticket and a real account cannot; a real account with the
-- secret takes the guest's days, keeps its own where both played, and has its
-- streak rebuilt across the two; a wrong secret, a used ticket and an
-- anonymous caller move nothing.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\pset pager off

-- auth.jwt() as Supabase has it, driven by the test: the claims of whoever is
-- signed in. Only is_anonymous is read.
create table if not exists auth.claims (c jsonb);
create or replace function auth.jwt() returns jsonb
  language sql stable as $$ select coalesce((select c from auth.claims limit 1), '{}'::jsonb) $$;
create or replace function public.anon_as(p uuid) returns void language sql as $$
  select public.become(p); delete from auth.claims; insert into auth.claims values ('{"is_anonymous":true}');
$$;
create or replace function public.user_as(p uuid) returns void language sql as $$
  select public.become(p); delete from auth.claims; insert into auth.claims values ('{"is_anonymous":false}');
$$;

create or replace function public.claim(p_label text, p_ok boolean)
returns void language plpgsql as $$
begin
  if p_ok then raise notice 'ok    %', p_label;
  else raise exception 'FAILED: %', p_label;
  end if;
end $$;

\i supabase/132_arcade_guest_board.sql
\i supabase/132_arcade_guest_board.sql

-- G is a guest, A an account that has played before, B a stranger.
insert into auth.users values
  ('aaaaaaaa-1111-4111-8111-111111111111'),
  ('bbbbbbbb-2222-4222-8222-222222222222'),
  ('eeeeeeee-9999-4999-8999-999999999999');
insert into public.profiles(id, username) values
  ('aaaaaaaa-1111-4111-8111-111111111111', 'acct_a'),
  ('bbbbbbbb-2222-4222-8222-222222222222', 'acct_b'),
  ('eeeeeeee-9999-4999-8999-999999999999', null);

-- The account played career two and three days ago, and crossword today.
select public.user_as('aaaaaaaa-1111-4111-8111-111111111111');
insert into grid_runs (user_id, game, puzzle_date, base_seconds, run_len, display_name)
  values ('aaaaaaaa-1111-4111-8111-111111111111', 'career', current_date - 3, 60, 10, 'acct_a'),
         ('aaaaaaaa-1111-4111-8111-111111111111', 'career', current_date - 2, 60, 11, 'acct_a');
insert into grid_streaks (user_id, game, streak, best_streak, last_date)
  values ('aaaaaaaa-1111-4111-8111-111111111111', 'career', 2, 5, current_date - 2);
select public.grid_submit_run('crossword', current_date, 200, 0, 0, null);

-- The guest played career yesterday and today, and crossword today.
select public.anon_as('eeeeeeee-9999-4999-8999-999999999999');
insert into grid_runs (user_id, game, puzzle_date, base_seconds, run_len)
  values ('eeeeeeee-9999-4999-8999-999999999999', 'career', current_date - 1, 60, 9);
insert into grid_streaks (user_id, game, streak, best_streak, last_date)
  values ('eeeeeeee-9999-4999-8999-999999999999', 'career', 1, 1, current_date - 1);
select public.grid_submit_run('career', current_date, 80, 0, 0, 14);
select public.grid_submit_run('crossword', current_date, 150, 0, 0, null);

select public.claim('a guest can post, under a generated name',
  (select display_name from grid_runs where user_id = 'eeeeeeee-9999-4999-8999-999999999999'
     and game = 'career' and puzzle_date = current_date) = public.arcade_generated_name('eeeeeeee-9999-4999-8999-999999999999'));

\set ticket_sql 'select public.arcade_guest_ticket()'
select public.arcade_guest_ticket() as secret \gset
select public.claim('the guest gets a ticket', length(:'secret') >= 32);
select public.claim('asking again gives the same ticket', public.arcade_guest_ticket() = :'secret');

-- a real account cannot mint a ticket
select public.user_as('bbbbbbbb-2222-4222-8222-222222222222');
do $$ declare refused boolean := false;
begin
  begin perform public.arcade_guest_ticket(); exception when others then refused := true; end;
  perform public.claim('an account cannot get a guest ticket', refused);
end $$;

-- the stranger with the wrong secret moves nothing
select public.claim('a wrong secret moves nothing',
  (public.arcade_claim_guest('eeeeeeee-9999-4999-8999-999999999999', 'nope') ->> 'moved')::int = 0);
select public.claim('and the guest still owns its rows',
  (select count(*) from grid_runs where user_id = 'eeeeeeee-9999-4999-8999-999999999999') = 3);

-- an anonymous caller cannot claim, even with the secret
select public.anon_as('eeeeeeee-9999-4999-8999-999999999999');
do $$ declare refused boolean := false; s text;
begin
  select secret into s from arcade_guest_tickets limit 1;
  begin perform public.arcade_claim_guest('eeeeeeee-9999-4999-8999-999999999999', s); exception when others then refused := true; end;
  perform public.claim('a guest session cannot claim', refused);
end $$;

-- the account claims
select public.user_as('aaaaaaaa-1111-4111-8111-111111111111');
select (public.arcade_claim_guest('eeeeeeee-9999-4999-8999-999999999999', :'secret') ->> 'moved')::int as moved \gset
select public.claim('two guest days move (career yesterday and today), crossword does not', :moved = 2);
select public.claim('the account kept its own crossword time, not the guest''s',
  (select base_seconds from grid_runs where user_id = 'aaaaaaaa-1111-4111-8111-111111111111'
     and game = 'crossword' and puzzle_date = current_date) = 200);
select public.claim('moved rows carry the account''s name',
  (select display_name from grid_runs where user_id = 'aaaaaaaa-1111-4111-8111-111111111111'
     and game = 'career' and puzzle_date = current_date) = 'acct_a');
select public.claim('the guest owns nothing now',
  (select count(*) from grid_runs where user_id = 'eeeeeeee-9999-4999-8999-999999999999') = 0
  and (select count(*) from grid_streaks where user_id = 'eeeeeeee-9999-4999-8999-999999999999') = 0);
select public.claim('the career streak joins up: four days in a row',
  (select streak from grid_streaks where user_id = 'aaaaaaaa-1111-4111-8111-111111111111' and game = 'career') = 4);
select public.claim('the best never goes down (5 stays 5)',
  (select best_streak from grid_streaks where user_id = 'aaaaaaaa-1111-4111-8111-111111111111' and game = 'career') = 5);
select public.claim('the streak runs to today',
  (select last_date from grid_streaks where user_id = 'aaaaaaaa-1111-4111-8111-111111111111' and game = 'career') = current_date);
select public.claim('the ticket is spent',
  (public.arcade_claim_guest('eeeeeeee-9999-4999-8999-999999999999', :'secret') ->> 'moved')::int = 0);

-- the next submit on the account carries on from the rebuilt streak
select (public.grid_submit_run('career', current_date, 90, 0, 0, 3) ->> 'streak')::int as s \gset
select public.claim('a later submit today keeps the joined streak', :s = 4);

\echo 'all guest board claims hold'
