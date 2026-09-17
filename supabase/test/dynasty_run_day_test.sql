-- ============================================================================
-- dynasty_run_day_test.sql : one NEW dynasty a day, counted.
--
--   psql -d dynrun -f supabase/test/daily_base.sql
--   then 99, 100, 101_dynasty_seasons, 102, 105, 101_premium_bundles, then 106
--   psql -d dynrun -f supabase/test/dynasty_run_day_test.sql
--
-- IT OPENS WITH THE AMBIGUITY TRAP, because that is how 102 shipped broken. A
-- function that RETURNS TABLE makes every column name in that list an OUT
-- parameter, so an unqualified reference to a name that is also a column is
-- ambiguous and Postgres refuses the whole statement AT CALL TIME. It creates
-- cleanly. It throws the first time anybody plays. And the page fails open by
-- design, so nothing on screen says so and the meter simply never counts.
--
-- Written as what a player would notice rather than as the error text: start one
-- run, the second is refused.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

create or replace function pg_temp.say(label text, got boolean)
returns void language plpgsql as $$
begin
  raise notice '%  %', case when got then '  ok  ' else ' FAIL ' end, label;
  if not got then
    raise exception 'FAILED: %', label;
  end if;
end $$;

-- A free account. auth.uid() is stubbed by daily_base.sql's harness.
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111')
  on conflict do nothing;
select public.become('11111111-1111-1111-1111-111111111111'::uuid);
delete from public.ps_dynasty_day where user_id = auth.uid();
delete from public.premium_unlocks where user_id = auth.uid();

-- ---------- 1) the first new run is free ------------------------------------
do $$
declare r record;
begin
  select * into r from public.ps_dynasty_run_state();
  perform pg_temp.say('a fresh account may start a run', r.ok and not r.pro);
end $$;

do $$
declare r record;
begin
  -- THE CALL THAT WOULD THROW on the 102 bug. Reaching a verdict at all is half
  -- the assertion.
  select * into r from public.ps_dynasty_run_start();
  perform pg_temp.say('and starting it is allowed', r.ok);
  perform pg_temp.say('  with no wait attached', r.next_at is null);
end $$;

-- ---------- 2) the second is refused ----------------------------------------
do $$
declare r record;
begin
  select * into r from public.ps_dynasty_run_start();
  perform pg_temp.say('a SECOND new run the same day is refused', not r.ok);
  perform pg_temp.say('  and it says when the next one lands', r.next_at is not null);
  perform pg_temp.say('  about a day out',
    r.next_at > now() + interval '23 hours' and r.next_at < now() + interval '25 hours');
end $$;

do $$
declare r record;
begin
  select * into r from public.ps_dynasty_run_state();
  perform pg_temp.say('and the READ agrees with the spend', not r.ok);
end $$;

-- ---------- 3) the refusal did not move the clock ---------------------------
-- A refused attempt must not push the wait out, or tapping a shut door twice
-- would keep the day shut for ever.
do $$
declare v1 timestamptz; v2 timestamptz;
begin
  select run_at into v1 from public.ps_dynasty_day where user_id = auth.uid();
  perform public.ps_dynasty_run_start();
  perform public.ps_dynasty_run_start();
  select run_at into v2 from public.ps_dynasty_day where user_id = auth.uid();
  perform pg_temp.say('a refused attempt never extends the wait', v1 = v2);
end $$;

-- ---------- 4) the day rolls -------------------------------------------------
do $$
declare r record;
begin
  update public.ps_dynasty_day
     set run_at = now() - interval '25 hours'
   where user_id = auth.uid();
  select * into r from public.ps_dynasty_run_state();
  perform pg_temp.say('a day later a new run is allowed again', r.ok);
  select * into r from public.ps_dynasty_run_start();
  perform pg_temp.say('  and taking it works', r.ok);
end $$;

-- ---------- 5) THE SEASON BUDGET IS UNTOUCHED --------------------------------
-- The whole design of 106 is that it adds a column and restates nothing. This is
-- what says so: three seasons still spend the way 101 and 102 say they do, on an
-- account that has already used its one new run today.
do $$
declare r record; n int := 0;
begin
  for i in 1..3 loop
    select * into r from public.ps_attempt_spend('dynasty');
    if r.ok then n := n + 1; end if;
  end loop;
  perform pg_temp.say('three dynasty seasons still spend', n = 3);
  select * into r from public.ps_attempt_spend('dynasty');
  perform pg_temp.say('  and the fourth is refused', not r.ok);
end $$;

-- ---------- 6) a paying account is never metered and never written -----------
do $$
declare r record; c int;
begin
  delete from public.ps_dynasty_day where user_id = auth.uid();
  insert into public.premium_unlocks (user_id, product, source, granted_at)
  values (auth.uid(), 'ps_premium', 'test', now());

  select * into r from public.ps_dynasty_run_start();
  perform pg_temp.say('an owner may always start a run', r.ok and r.pro);
  select * into r from public.ps_dynasty_run_start();
  perform pg_temp.say('  twice, and again', r.ok and r.pro);

  select count(*) into c from public.ps_dynasty_day where user_id = auth.uid();
  perform pg_temp.say('  and is never written to the table at all', c = 0);
  delete from public.premium_unlocks where user_id = auth.uid();
end $$;

-- ---------- 7) signed out is refused, loudly ---------------------------------
do $$
declare bad boolean := false;
begin
  delete from auth.session;
  begin
    perform public.ps_dynasty_run_start();
    bad := true;
  exception when others then
    null;
  end;
  perform pg_temp.say('a signed out caller is refused', not bad);
end $$;

\echo ''
\echo 'one new dynasty a day: all checks passed'
