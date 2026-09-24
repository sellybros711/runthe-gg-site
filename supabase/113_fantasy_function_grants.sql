-- ---------------------------------------------------------------------------
-- 113_fantasy_function_grants.sql
--
-- 112's bug, one level deeper, found because 112's fix let the Worker say so.
--
--
-- WHAT HAPPENED, AGAIN
-- ---------------------------------------------------------------------------
-- The poller went live and the first tick that reached the budget wrote:
--
--   budget check failed: supabase POST /rpc/fantasy_budget_spend -> 403
--
-- 112's header says it at length: BYPASSRLS skips row level security and skips
-- no privilege at all. That is as true of a function as it is of a sequence.
--
-- 111 carries this, and it is correct as far as it goes:
--
--   revoke all on function public.fantasy_budget_spend(int) from public;
--
-- POSTGRES GRANTS EXECUTE ON A NEW FUNCTION TO **PUBLIC** BY DEFAULT, which is
-- the whole trap. Revoking from public is how you stop anon and authenticated
-- calling a function, and it removes it from every role that was relying on
-- that default, which is every role that was not granted it by name. So the
-- revoke that was there to keep browsers out kept the backend out too, and the
-- only role that has any business calling it is the one that could not.
--
--
-- I FIXED THE COMMENT AND NOT THE GRANT, WHICH IS THE PART WORTH REMEMBERING
-- ---------------------------------------------------------------------------
-- 111 used to assert "the service role bypasses grants entirely". 112 was
-- written because that is false, and the comment was corrected in the same
-- commit. The corrected comment sits four lines above this exact revoke.
--
-- Having the right diagnosis in hand is not the same as having applied it
-- everywhere it belongs. 112 went looking for sequences because a sequence is
-- what the error named. Nothing went looking for the OTHER kind of privilege
-- the same misunderstanding had already touched, so the second half stayed
-- broken for three days and cost another live deploy to find.
--
--
-- WHAT IT DID NOT COST, WHICH IS THE OTHER HALF OF THE STORY
-- ---------------------------------------------------------------------------
-- Nothing. Budget read `used 0, cap 12` afterwards and no odds request was
-- made. The tick opened its run row, the budget call was refused, the row was
-- closed carrying the reason and the sweep stopped. That ordering is the fix
-- from three nights ago (open the run before the charge, stop the tick if
-- either fails), working the first time it was ever asked a real question.
--
--
-- SCOPE: EVERY fantasy_ FUNCTION, TO service_role, AND TO NOBODY ELSE
-- ---------------------------------------------------------------------------
-- Catalog driven for 112's reason: a hand written list drifts the first time
-- somebody adds a function, and this file is then a fix for the functions that
-- were already working.
--
-- service_role is the backend. The Worker and the cold path run as it, and it
-- already bypasses RLS on every table here, so there is nothing it can reach
-- through EXECUTE that it could not reach anyway. What this does NOT do is
-- grant to anon or authenticated, and the revokes in 109 and 111 stay exactly
-- as they are: what a browser may call is decided there, by name, and this
-- file must never become the place that quietly widens it.
--
-- Re-running it is a no-op.
--
--
-- NO `alter default privileges` HERE, unlike 112
-- ---------------------------------------------------------------------------
-- It would do nothing. A new function already gets EXECUTE to PUBLIC, so it
-- works until somebody revokes it, and the revoke is written after the create
-- in the same file. A default privilege cannot survive a later explicit
-- revoke. The defence against the next one is the preflight check, which asks
-- the catalog whether service_role can call every fantasy function, and fails
-- if it cannot.
-- ---------------------------------------------------------------------------

do $$
declare
  f record;
  n int := 0;
begin
  for f in
    select n.nspname as sch,
           p.proname as fn,
           pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname like 'fantasy%'
  loop
    execute format('grant execute on function %I.%I(%s) to service_role',
                   f.sch, f.fn, f.args);
    n := n + 1;
  end loop;

  -- LOUD IF IT FOUND NOTHING, the same as 112. A loop over an empty set is a
  -- successful run that granted nothing, which is exactly the shape of failure
  -- this file exists to stop being invisible. Six functions is what 109 and
  -- 111 create today.
  if n = 0 then
    raise exception 'no fantasy functions found. Did 109 and 111 actually run?';
  end if;

  raise notice 'granted execute on % fantasy functions to service_role', n;
end $$;

-- ---------------------------------------------------------------------------
-- Read it back. Anything false here is a call the Worker cannot make.
-- ---------------------------------------------------------------------------
select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
         as function,
       has_function_privilege('service_role', p.oid, 'EXECUTE')
         as "service_role can call it",
       has_function_privilege('anon', p.oid, 'EXECUTE')
         as "anon can call it",
       has_function_privilege('authenticated', p.oid, 'EXECUTE')
         as "authenticated can call it"
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname like 'fantasy%'
 order by 1;
