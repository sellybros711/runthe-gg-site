-- roles Supabase has that a bare cluster does not
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

-- a minimal ps_runs: only the columns 98 reads or writes
drop table if exists public.ps_runs cascade;
create table public.ps_runs (
  id bigint generated always as identity primary key,
  user_id uuid,
  display_name text,
  run_mode text,
  created_at timestamptz not null default now(),
  display_color text, display_initials text,
  display_mark text, display_rung smallint, display_tier text, display_ring text
);
alter table public.ps_runs enable row level security;
create policy "ps_runs read" on public.ps_runs for select using (true);
grant select on public.ps_runs to anon, authenticated;

-- a helper to insert a validated dynasty season row the way ps_submit_run would, returning id
create or replace function public.mkrun(p_user uuid, p_name text) returns bigint
  language sql as $$
    insert into public.ps_runs(user_id, display_name, run_mode, display_color, display_initials,
                               display_mark, display_rung, display_tier, display_ring)
    values (p_user, p_name, 'dynasty', 'KC', upper(substr(p_name,1,2)), 'shield', 3, 'gold', 'ring')
    returning id;
  $$;
