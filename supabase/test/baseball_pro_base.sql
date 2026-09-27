-- The auth schema Supabase has and a bare cluster does not, for
-- baseball_pro_test.sql. auth.uid() reads a setting so the test can change who
-- is asking inside one block.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $$;

drop schema if exists auth cascade;
create schema auth;
create table auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid
  language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;

insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');

-- 101 redefines arcade_card_active over this table.
create table if not exists public.subscriptions (
  user_id uuid, status text, current_period_end timestamptz);
