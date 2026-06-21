-- ============================================================================
-- 16_username_login.sql  —  allow signing in with a username (not just email)
-- ============================================================================
-- Supabase auth signs in by email, so to let players log in with their username
-- the client first resolves the username → the account's email, then signs in
-- with email + password as usual.
--
-- PRIVACY NOTE: this maps a (public) username to its (private) email for anyone
-- who calls it, i.e. emails become enumerable by username. That's the standard
-- trade-off for username login. If that's not acceptable, drop this and keep
-- email-only sign-in.
--
-- Run after 15_name_tiers.sql. Idempotent.
-- ----------------------------------------------------------------------------

create or replace function email_for_username(p_username text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select u.email::text
  from profiles p
  join auth.users u on u.id = p.id
  where lower(p.username) = lower(trim(p_username))
  limit 1;
$$;

revoke all on function email_for_username(text) from public;
grant  execute on function email_for_username(text) to anon, authenticated;
