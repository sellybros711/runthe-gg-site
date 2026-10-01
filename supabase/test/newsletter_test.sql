-- newsletter_test.sql: drives 121_newsletter.sql against a scratch Postgres.
--
--   createdb news && psql -d news -f supabase/test/newsletter_test.sql
--
-- It builds its own stand-in for Supabase's auth schema, WITH the email column
-- the real auth.users has (the functions read the address from there, so a
-- fixture without it would certify nothing), loads the migration twice to prove
-- it re-runs, and asserts every rule by what it does.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
drop schema if exists auth cascade;
create schema auth;
create table auth.users (id uuid primary key, email text);
create table auth.session (uid uuid);
create function auth.uid() returns uuid language sql stable security definer as $$ select uid from auth.session limit 1 $$;
create function pg_temp.login(p uuid) returns void language sql as $$ delete from auth.session; insert into auth.session values (p); $$;
create function pg_temp.logout() returns void language sql as $$ delete from auth.session; $$;
grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.session to anon, authenticated, service_role;

drop table if exists public.newsletter_subscribers, public.newsletter_issues cascade;
\i supabase/121_newsletter.sql
\i supabase/121_newsletter.sql

insert into auth.users values ('00000000-0000-0000-0000-00000000000a', 'Ava@Example.com'),
                              ('00000000-0000-0000-0000-00000000000b', 'bo@example.com');

do $$
declare t uuid; t2 uuid; st text; ok boolean; denied boolean;
begin
  -- a signed-out caller has no status and cannot tick the box
  perform pg_temp.logout();
  assert newsletter_status() = 'none', 'signed out reads none';
  denied := false;
  begin perform newsletter_set(true); exception when others then denied := true; end;
  assert denied, 'signed out cannot subscribe';

  -- signed in: tick, read, untick, tick again
  perform pg_temp.login('00000000-0000-0000-0000-00000000000a');
  assert newsletter_status() = 'none', 'fresh account reads none';
  assert newsletter_set(true, 'home') = 'active';
  assert newsletter_status() = 'active';
  assert (select email from newsletter_subscribers where user_id = '00000000-0000-0000-0000-00000000000a') = 'ava@example.com',
    'the address is the account''s own, case folded by citext';
  assert newsletter_set(false) = 'unsubscribed';
  assert newsletter_status() = 'unsubscribed';
  assert newsletter_set(true, 'football') = 'active';
  assert (select count(*) from newsletter_subscribers) = 1, 'one row per address';

  -- guest: first request mails, a repeat inside the cooldown does not
  t := newsletter_guest_request('  New@Guest.io ', 'home');
  assert t is not null, 'first guest request returns a token';
  assert newsletter_guest_request('new@guest.io') is null, 'cooldown holds';
  assert (select status from newsletter_subscribers where email = 'new@guest.io') = 'pending';

  -- a guest request for an address already active mails nothing
  assert newsletter_guest_request('ava@example.com') is null, 'active address is not re-mailed';

  -- confirm, then unsubscribe by token
  assert newsletter_confirm(t), 'confirm token works';
  assert (select status from newsletter_subscribers where email = 'new@guest.io') = 'active';
  assert not newsletter_confirm(gen_random_uuid()), 'unknown token confirms nothing';
  select unsub_token into t2 from newsletter_subscribers where email = 'new@guest.io';
  assert newsletter_unsubscribe(t2);
  assert (select status from newsletter_subscribers where email = 'new@guest.io') = 'unsubscribed';
  -- an old confirm link cannot resubscribe somebody who left
  assert not newsletter_confirm(t), 'confirm after unsubscribe does nothing';

  -- rejoining as a guest after leaving issues a NEW confirm token
  update newsletter_subscribers set confirm_sent_at = now() - interval '1 hour' where email = 'new@guest.io';
  t2 := newsletter_guest_request('new@guest.io');
  assert t2 is not null and t2 <> t, 'rejoin gets a fresh token';

  -- five unanswered confirms and the address is left alone
  perform newsletter_guest_request('spam@target.io');
  for i in 1..6 loop
    update newsletter_subscribers set confirm_sent_at = now() - interval '1 hour' where email = 'spam@target.io';
    perform newsletter_guest_request('spam@target.io');
  end loop;
  assert (select confirm_sends from newsletter_subscribers where email = 'spam@target.io') = 5, 'capped at five';

  denied := false;
  begin perform newsletter_guest_request('not an email'); exception when others then denied := true; end;
  assert denied, 'garbage is refused';

  -- a guest who later makes an account with the same address sees the box ticked
  perform newsletter_guest_request('bo@example.com');
  perform newsletter_confirm((select confirm_token from newsletter_subscribers where email = 'bo@example.com'));
  perform pg_temp.login('00000000-0000-0000-0000-00000000000b');
  assert newsletter_status() = 'active', 'matched on the account address';
end $$;

-- the roles a browser holds cannot read an address, or call the service functions
set role anon;
do $$ declare denied boolean := false; begin
  begin perform 1 from public.newsletter_subscribers limit 1; exception when insufficient_privilege then denied := true; end;
  assert denied, 'anon cannot read subscribers';
  denied := false;
  begin perform public.newsletter_guest_request('x@y.io'); exception when insufficient_privilege then denied := true; end;
  assert denied, 'anon cannot call the guest function directly';
end $$;
reset role;
set role authenticated;
do $$ declare denied boolean := false; begin
  begin perform 1 from public.newsletter_subscribers limit 1; exception when insufficient_privilege then denied := true; end;
  assert denied, 'authenticated cannot read subscribers';
  denied := false;
  begin perform public.newsletter_unsubscribe(gen_random_uuid()); exception when insufficient_privilege then denied := true; end;
  assert denied, 'authenticated cannot call the token functions';
end $$;
reset role;

\echo 'newsletter ok'
