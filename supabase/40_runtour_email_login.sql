-- ============================================================================
-- 40_runtour_email_login.sql — stop leaking account emails to anonymous callers
-- ============================================================================
-- PROBLEM: 16_username_login.sql created email_for_username(username), a SECURITY
-- DEFINER function GRANTed to `anon` that returns auth.users.email for any
-- username. Usernames are PUBLIC on the leaderboard, so a scraper could walk them
-- and build a full username → private-email list (email harvesting). All three
-- RunThe.GG games (golf, hub, soccer) call it to allow "sign in with a username."
--
-- FIX: replace it with a PASSWORD-VERIFIED lookup. email_for_login(username,
-- password) returns the email ONLY when the supplied password matches the
-- account's stored bcrypt hash — so a harvester without the password gets NOTHING,
-- while legitimate username sign-in still works (the client already has the
-- password the user just typed). Email-based sign-in is unaffected.
--
-- Supabase Auth (GoTrue) stores passwords as bcrypt hashes in
-- auth.users.encrypted_password; pgcrypto's crypt(pw, hash) = hash verifies a
-- bcrypt password. pgcrypto lives in the `extensions` schema on Supabase, so it's
-- on this function's search_path.
--
-- The old email_for_username is REVOKED from anon/authenticated (harvesting vector
-- closed) but left DEFINED, so a rollback is just a re-GRANT if ever needed.
--
-- Idempotent. Apply in the Supabase SQL editor. Deploy the matching client change
-- (all three games call email_for_login instead) at the same time.
-- ----------------------------------------------------------------------------

create or replace function public.email_for_login(p_username text, p_password text)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_email text;
  v_hash  text;
begin
  if p_username is null or p_password is null or length(p_password) = 0 then
    return null;
  end if;
  select u.email::text, u.encrypted_password::text
    into v_email, v_hash
    from public.profiles p
    join auth.users u on u.id = p.id
    where lower(p.username) = lower(trim(p_username))
    limit 1;
  if v_email is null or v_hash is null then
    return null;   -- no such username (or no password set, e.g. Google-only account)
  end if;
  -- only reveal the email when the bcrypt password check passes
  if v_hash = crypt(p_password, v_hash) then
    return v_email;
  end if;
  return null;
end; $$;

grant execute on function public.email_for_login(text, text) to anon, authenticated;

-- close the harvesting vector: the password-less lookup is no longer callable by
-- clients. Kept defined (not dropped) so a rollback is a one-line re-grant.
revoke execute on function public.email_for_username(text) from anon, authenticated, public;
