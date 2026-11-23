-- ---------------------------------------------------------------------------
-- arcade_guest_server_test.sql : a guest's run reaches the board through the
-- server, with no anonymous sign-in, and follows the device onto an account (185).
--
--   createdb gst
--   psql -d gst -f supabase/test/fantasy_base.sql
--   psql -d gst -c 'create table public.subscriptions(user_id uuid, status text, current_period_end timestamptz);'
--   psql -d gst -f supabase/101_premium_bundles.sql
--   psql -d gst -f supabase/52_grid_daily.sql   (then 70, 72, 74, 76, 82, 84, 85, 125 and 131, in that order)
--   psql -d gst -f supabase/test/arcade_guest_server_test.sql   (it applies 185 itself, twice)
--
-- The claims: only the service role can call either function; a guest row is
-- filed under the generated name and makes no auth user; a card game, a bad
-- date, an implausible time and an account's own id are refused; a worse
-- second run keeps the better row and costs nothing against the cap; a 13th new
-- row from one IP key in a day is refused while another key still posts; a
-- claim moves the guest's days the account has none of, keeps the account's
-- own, deletes the rest, and builds the streak.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\pset pager off

do $$ begin
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;

\i supabase/185_arcade_guest_runs_server.sql
\i supabase/185_arcade_guest_runs_server.sql

create or replace function pg_temp.must_fail(sql text, what text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then return; end;
  raise exception 'should have failed: %', what;
end $$;

do $$
declare
  g  uuid := 'aaaaaaaa-1111-4111-8111-111111111111';
  g2 uuid := 'bbbbbbbb-2222-4222-8222-222222222222';
  acct uuid := 'cccccccc-3333-4333-8333-333333333333';
  ip text := 'ipkey-0123456789abcdef';
  nm text; sc int;
begin
  -- 1. only the service role
  if has_function_privilege('anon', 'public.arcade_guest_submit(uuid,text,text,date,integer,integer,integer,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.arcade_guest_submit(uuid,text,text,date,integer,integer,integer,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.arcade_guest_claim(uuid,uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.arcade_guest_submit(uuid,text,text,date,integer,integer,integer,integer)', 'execute')
  then raise exception 'grants are wrong'; end if;

  -- 2. a guest's crossword lands under the generated name, no auth user made
  perform public.arcade_guest_submit(g, ip, 'crossword', current_date, 120, 1, 0, null);
  select display_name, score into nm, sc from grid_runs where user_id = g and game = 'crossword';
  if nm is distinct from public.arcade_generated_name(g) then raise exception 'name % is not the generated one', nm; end if;
  if sc <> 130 then raise exception 'score % should be 130', sc; end if;
  if exists (select 1 from auth.users where id = g) then raise exception 'an auth user was made'; end if;
  if exists (select 1 from grid_streaks where user_id = g) then raise exception 'a guest got a streak row'; end if;

  -- 3. refusals
  perform pg_temp.must_fail(format('select public.arcade_guest_submit(%L, %L, %L, current_date, 60, 0, 0, 5)', g, ip, 'oddone'), 'a card game');
  perform pg_temp.must_fail(format('select public.arcade_guest_submit(%L, %L, %L, current_date - 5, 60, 0, 0, null)', g, ip, 'crossword'), 'an old date');
  perform pg_temp.must_fail(format('select public.arcade_guest_submit(%L, %L, %L, current_date, 1, 0, 0, null)', g2, ip, 'crossword'), 'a 1 second crossword');
  perform pg_temp.must_fail(format('select public.arcade_guest_submit(%L, %L, %L, current_date, 10, 0, 0, 50)', g2, ip, 'almamater'), '50 in a row in 10 seconds');
end $$;

do $$
declare
  g  uuid := 'aaaaaaaa-1111-4111-8111-111111111111';
  acct uuid := 'cccccccc-3333-4333-8333-333333333333';
  ip text := 'ipkey-0123456789abcdef';
  v_n int; sc int; i int;
begin
  insert into auth.users values (acct) on conflict do nothing;
  insert into profiles (id, username) values (acct, 'realplayer') on conflict do nothing;
  perform pg_temp.must_fail(format('select public.arcade_guest_submit(%L, %L, %L, current_date, 60, 0, 0, null)', acct, ip, 'crossword'), 'an account id');

  -- 4. a worse run keeps the better row and costs no cap
  select p.n into v_n from arcade_guest_posts p where p.ip_key = ip and p.day = current_date;
  perform public.arcade_guest_submit(g, ip, 'crossword', current_date, 300, 0, 0, null);
  select score into sc from grid_runs where user_id = g and game = 'crossword';
  if sc <> 130 then raise exception 'a worse run replaced the row (%)', sc; end if;
  if (select p.n from arcade_guest_posts p where p.ip_key = ip and p.day = current_date) <> v_n then raise exception 'a resubmit counted'; end if;

  -- 5. the cap: 12 new rows a day per IP key
  for i in 2..12 loop
    perform public.arcade_guest_submit(('dddddddd-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, ip, 'crossword', current_date, 100, 0, 0, null);
  end loop;
  perform pg_temp.must_fail(format('select public.arcade_guest_submit(%L, %L, %L, current_date, 100, 0, 0, null)',
    'eeeeeeee-0000-4000-8000-000000000013', ip, 'crossword'), 'a 13th new row from one IP');
  perform public.arcade_guest_submit('eeeeeeee-0000-4000-8000-000000000013', 'ipkey-other-0123456789', 'crossword', current_date, 100, 0, 0, null);

  -- 6. the claim
  perform public.arcade_guest_submit(g, 'ipkey-third-0123456789', 'career', current_date, 90, 0, 0, 6);
  insert into grid_runs (user_id, game, puzzle_date, base_seconds, mistakes, reveals, run_len, display_name, flawless)
    values (acct, 'crossword', current_date, 200, 0, 0, null, 'realplayer', true);
  perform public.arcade_guest_claim(acct, g);
  if exists (select 1 from grid_runs where user_id = g) then raise exception 'guest rows left behind'; end if;
  if (select base_seconds from grid_runs where user_id = acct and game = 'crossword' and puzzle_date = current_date) <> 200 then
    raise exception 'the account lost its own crossword'; end if;
  if not exists (select 1 from grid_runs where user_id = acct and game = 'career' and display_name = 'realplayer') then
    raise exception 'the career day did not move'; end if;
  if (select streak from grid_streaks where user_id = acct and game = 'career') <> 1 then raise exception 'no career streak'; end if;
  if (public.arcade_guest_claim(acct, g)->>'moved')::int <> 0 then raise exception 'a second claim moved something'; end if;
  if (public.arcade_guest_claim(acct, acct)->>'moved')::int <> 0 then raise exception 'claiming yourself moved something'; end if;
end $$;

\echo 'arcade guest server: all claims hold'
