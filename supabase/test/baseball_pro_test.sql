-- Run The Diamond Pro and the daily mode meter (121_baseball_pro.sql).
--
--   createdb rtd_pro
--   psql -d rtd_pro -c 'create role authenticated; create role anon;'
--   psql -d rtd_pro -f supabase/test/baseball_pro_base.sql
--   psql -d rtd_pro -f supabase/101_premium_bundles.sql
--   psql -d rtd_pro -f supabase/121_baseball_pro.sql
--   psql -d rtd_pro -f supabase/121_baseball_pro.sql      (twice: it is idempotent)
--   psql -d rtd_pro -v ON_ERROR_STOP=1 -f supabase/test/baseball_pro_test.sql
--
-- auth.uid() is the stand-in in baseball_pro_base.sql, which reads a setting, so
-- each claim sets who is asking.

\set ON_ERROR_STOP 1

do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a';
  b uuid := '00000000-0000-0000-0000-00000000000b';
  r jsonb;
  failed boolean;
begin
  -- signed out: nothing is written and nothing is claimed
  perform set_config('test.uid', '', true);
  r := public.rtd_mode_spend('era');
  assert (r->>'ok')::boolean = false and r->>'reason' = 'signed_out', 'a guest is refused a server play';
  assert (public.rtd_mode_state()->>'signed_in')::boolean = false, 'a guest reads signed out';

  -- a free account: one token a day, shared by all six modes
  perform set_config('test.uid', a::text, true);
  r := public.rtd_mode_spend('era');
  assert (r->>'ok')::boolean, 'the first play of the day is allowed';
  r := public.rtd_mode_spend('era');
  assert not (r->>'ok')::boolean and r->>'reason' = 'used_today', 'a second era play is refused';
  r := public.rtd_mode_spend('trade');
  assert not (r->>'ok')::boolean, 'and so is any other mode: the token is shared';
  r := public.rtd_mode_state();
  assert r->'used' = '["era"]'::jsonb, 'state names the mode the token went on: ' || (r->'used')::text;
  assert not (r->>'pro')::boolean, 'a free account is not Pro';
  assert (r->>'next_at')::timestamptz > now(), 'the next day is in the future';
  assert (r->>'next_at')::timestamptz <= now() + interval '25 hours', 'and it is at most a day away';

  -- unknown modes and the two unmetered ones are refused rather than counted
  r := public.rtd_mode_spend('free');
  assert r->>'reason' = 'unknown_mode', 'Classic is never metered';
  r := public.rtd_mode_spend('daily');
  assert r->>'reason' = 'unknown_mode', 'the daily is never metered';

  -- yesterday's play does not count today
  update public.rtd_mode_plays set day = day - 1 where user_id = a and mode = 'era';
  r := public.rtd_mode_spend('trade');
  assert (r->>'ok')::boolean, 'a token spent yesterday leaves today open';

  -- Pro: unlimited, and never written to the ledger
  perform set_config('test.uid', b::text, true);
  insert into public.premium_unlocks (user_id, product, source) values (b, 'rtd_premium', 'bundle:diamond-pro');
  r := public.rtd_mode_spend('staff');
  assert (r->>'ok')::boolean and (r->>'pro')::boolean, 'Pro plays';
  r := public.rtd_mode_spend('staff');
  assert (r->>'ok')::boolean, 'Pro plays again';
  assert (select count(*) from public.rtd_mode_plays where user_id = b) = 0, 'Pro is never metered';
  assert (public.rtd_mode_state()->>'pro')::boolean, 'state says Pro';

  -- an ended pass is not Pro
  update public.premium_unlocks set expires_at = now() - interval '1 minute' where user_id = b;
  r := public.rtd_mode_spend('staff');
  assert (r->>'ok')::boolean and not (r->>'pro')::boolean, 'an ended unlock falls back to the free play';
  r := public.rtd_mode_spend('staff');
  assert not (r->>'ok')::boolean, 'and then to the limit';

  -- the constraint still refuses a product nobody sells
  failed := false;
  begin
    insert into public.premium_unlocks (user_id, product) values (a, 'nonsense');
  exception when check_violation then failed := true;
  end;
  assert failed, 'an unknown product is refused';

  -- and the table cannot hold a mode nobody meters
  failed := false;
  begin
    insert into public.rtd_mode_plays (user_id, mode, day) values (a, 'free', current_date);
  exception when check_violation then failed := true;
  end;
  assert failed, 'the ledger refuses an unmetered mode';

  raise notice 'baseball pro: all claims passed';
end $$;
