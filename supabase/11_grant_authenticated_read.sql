-- ============================================================================
-- 11_grant_authenticated_read.sql  —  Let signed-in users read the board
-- ============================================================================
-- Symptom: once you SIGN IN, the leaderboard shows "Couldn't load the
-- leaderboard" and a saved score reads "your account" instead of your username.
-- Guests are unaffected.
--
-- Cause: REST calls now run as the `authenticated` role (the client sends the
-- user's JWT so scores can be attributed). But that role was never granted
-- SELECT on the pre-existing tables, so PostgREST returns 401 "permission
-- denied". The `anon` role already had read access, which is why it only broke
-- after sign-in.
--
-- Fix: grant read to both roles, and — only if RLS is enabled on drafts —
-- ensure a SELECT policy that also covers `authenticated`. Idempotent and safe
-- to re-run. Run AFTER 10_accounts.sql.
-- ----------------------------------------------------------------------------

grant usage  on schema public        to anon, authenticated;
grant select on table public.drafts   to anon, authenticated;
grant select on table public.profiles to anon, authenticated;

-- Belt-and-suspenders: if Row Level Security is enabled on `drafts`, make sure
-- signed-in users have a read policy (the existing one may have targeted anon
-- only). This does NOT enable RLS where it's off, so the guest path is untouched.
do $$
begin
  if (select relrowsecurity from pg_class where oid = 'public.drafts'::regclass) then
    drop policy if exists drafts_public_read on public.drafts;
    create policy drafts_public_read on public.drafts
      for select to anon, authenticated using (true);
  end if;
end
$$;
