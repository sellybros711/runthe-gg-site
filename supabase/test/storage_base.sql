-- The storage schema Supabase has and a bare cluster does not, for 165's test. Only what the
-- policies touch: the buckets, the objects (RLS on, as in Supabase), storage.foldername() and the
-- grants Supabase gives the browser roles. Safe to run twice.
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now());
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid, metadata jsonb, created_at timestamptz default now(),
  unique (bucket_id, name));
create or replace function storage.foldername(name text) returns text[]
  language plpgsql immutable as $$
declare p text[]; begin p := string_to_array(name, '/'); return p[1:array_length(p, 1) - 1]; end $$;
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant select on storage.buckets to anon, authenticated;
grant usage on schema public to anon, authenticated;
