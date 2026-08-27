-- ---------------------------------------------------------------------------
-- A stand-in schema for testing 96_commish_terms.sql against a real Postgres.
--
--   createdb terms_test
--   psql -d terms_test -f supabase/test/terms_base.sql
--   psql -d terms_test -f supabase/96_commish_terms.sql
--   psql -d terms_test -f supabase/test/terms_test.sql
--
-- The last file prints one line per check. Every line should start with " ok ".
--
-- It needs roles Supabase has and a bare cluster does not:
--   create role authenticated;  create role anon;
--
-- WHAT THE STAND-IN IS AND IS NOT, same as the others in this directory: only what 96 reads
-- or writes. That is auth.uid(), auth.users, and the three profile fields the board joins on
-- for a crest. A stand-in carrying the whole schema would hide a missing dependency.
-- ---------------------------------------------------------------------------

drop schema if exists auth cascade;
create schema auth;
create table auth.users (id uuid primary key);
create table auth.session (uid uuid);
create or replace function auth.uid() returns uuid
  language sql stable as $$ select uid from auth.session limit 1 $$;

drop table if exists public.commish_terms cascade;
drop table if exists public.profiles cascade;

-- Only the three fields the board selects.
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  username        text unique,
  avatar_color    text,
  avatar_initials text
);

insert into auth.users (id)
select ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid
  from generate_series(1, 60) as i;
insert into public.profiles (id, username, avatar_color, avatar_initials)
select id, 'commish' || row_number() over (order by id), '#123456', 'CM'
  from auth.users;

insert into auth.session (uid)
values ('00000000-0000-0000-0000-000000000001'::uuid);

create or replace function be(n integer) returns void
  language sql as $$
  update auth.session
     set uid = case when n is null then null
               else ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid end;
$$;

-- Finishing a term as somebody, in one line, because every test below is "several people
-- each finish a term and then we ask what the numbers say".
create or replace function fin(n integer, d text, sc integer) returns jsonb
  language plpgsql as $$
begin
  perform be(n);
  return commish_finish_term(d, array[10,20,30,40]::smallint[], sc::smallint, 'B',
    false, 5::smallint, 45::smallint, 5::smallint);
end $$;
