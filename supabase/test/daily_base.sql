-- roles and the auth schema Supabase has that a bare cluster does not
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $$;

drop schema if exists auth cascade;
create schema auth;
create table auth.users (id uuid primary key);
create table auth.session (uid uuid);
create or replace function auth.uid() returns uuid
  language sql stable security definer as $$ select uid from auth.session limit 1 $$;
grant usage on schema auth to anon, authenticated;

create or replace function public.become(p uuid) returns void
  language sql as $$ delete from auth.session; insert into auth.session values (p); $$;

drop table if exists public.ps_daily_attempts cascade;
