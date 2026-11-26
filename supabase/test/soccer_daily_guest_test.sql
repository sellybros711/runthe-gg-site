-- ---------------------------------------------------------------------------
-- soccer_daily_guest_test.sql : a guest's Daily reaches the day's board through
-- the server under a generated name, and follows the device onto an account (188).
--
--   createdb sdg
--   psql -d sdg -f supabase/test/soccer_daily_guest_test.sql
--
-- It builds its own base (roles, auth.users, profiles, wc_players), applies
-- 12_daily_challenge.sql, then 188 twice (it must be safe to re-run).
--
-- The claims: only the service role can call the guest functions and nobody
-- reads the guest table; an account's Daily scores exactly as it did before 188
-- and a guest with the same eleven scores the same; a guest row makes no auth
-- user, profile or streak; the name is two words and two digits and never an
-- account's; ten players, a duplicate, an unknown id and an account's own id are
-- refused; made-up result words are dropped; a second post keeps the first and
-- costs nothing; a fourth new row from one IP key in a day is refused while
-- another key still posts; the board view shows both with a negative guest id
-- and no guest uuid; a claim moves the days the account has none of under its
-- name, keeps the account's own, deletes the rest and rebuilds the streak; a
-- deleted account still cascades; old guest rows are pruned.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\pset pager off

do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;

create extension if not exists citext;
drop schema if exists auth cascade;
create schema auth;
create table auth.users (id uuid primary key);
create table auth.session (uid uuid);
create or replace function auth.uid() returns uuid
  language sql stable security definer as $$ select uid from auth.session limit 1 $$;
grant usage on schema auth to anon, authenticated, service_role;
create or replace function public.become(p uuid) returns void
  language sql as $$ delete from auth.session; insert into auth.session values (p); $$;

drop view if exists public.daily_board;
drop table if exists public.soccer_daily_guest, public.soccer_daily_guest_posts, public.daily_results, public.profiles, public.wc_players cascade;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext unique, flag text not null default '',
  current_streak int not null default 0, longest_streak int not null default 0, last_played_date date
);
create table public.wc_players (player_id text primary key, wc_overall int not null, position text not null,
  is_captain boolean not null default false, award text not null default '');
insert into public.wc_players (player_id, wc_overall, position, is_captain, award)
  select 'P' || i, 80 + (i % 10), 'MID', i = 3, case when i = 5 then 'golden_ball|golden_boot' else '' end
    from generate_series(1, 20) i;
insert into public.wc_players values ('STAR', 99, 'FWD', false, '');

\i supabase/12_daily_challenge.sql

-- An account's Daily BEFORE 188, to hold submit_daily to the same score after it.
insert into auth.users values ('cccccccc-3333-4333-8333-333333333333'), ('dddddddd-4444-4444-8444-444444444444');
insert into public.profiles (id, username, flag) values
  ('cccccccc-3333-4333-8333-333333333333', 'RealPlayer', 'USA'),
  ('dddddddd-4444-4444-8444-444444444444', 'Other', '');
select public.become('dddddddd-4444-4444-8444-444444444444');
select submit_daily(array['P1','P2','P3','P4','P5','P6','P7','P8','P9','P10','STAR'], 4, 'Quarter-Finalists', 'Quarter-final', null, 'The 90s') as before_id \gset
select overall as before_overall from daily_results where id = :before_id \gset
create temp table before as select :before_overall::numeric as overall;
delete from daily_results; update profiles set current_streak = 0, longest_streak = 0, last_played_date = null;

\i supabase/188_soccer_daily_guest.sql
\i supabase/188_soccer_daily_guest.sql

create or replace function pg_temp.must_fail(sql text, what text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then return; end;
  raise exception 'should have failed: %', what;
end $$;

-- same eleven, same account path, after 188
select submit_daily(array['P1','P2','P3','P4','P5','P6','P7','P8','P9','P10','STAR'], 4, 'Quarter-Finalists', 'Quarter-final', null, 'The 90s') as after_id \gset
select (overall = :before_overall) as same_score, overall from daily_results where id = :after_id \gset
\if :same_score
\else
  \echo 'FAIL: submit_daily scores differently after 188'
  \quit 1
\endif
delete from daily_results; update profiles set current_streak = 0, longest_streak = 0, last_played_date = null;

do $$
declare
  g    uuid := 'aaaaaaaa-1111-4111-8111-111111111111';
  g2   uuid := 'bbbbbbbb-2222-4222-8222-222222222222';
  acct uuid := 'cccccccc-3333-4333-8333-333333333333';
  ip   text := 'ipkey-0123456789abcdef';
  xi   text[] := array['P1','P2','P3','P4','P5','P6','P7','P8','P9','P10','STAR'];
  sl   text[] := array['GK','DEF','DEF','DEF','MID','MID','FWD','FWD','FLEX','FLEX','FLEX'];
  today date := (now() at time zone 'utc')::date;
  r json; r2 json; nm text; ov numeric; n int; i int;
begin
  -- 1. only the service role; nobody reads the guest table directly
  if has_function_privilege('anon', 'public.soccer_daily_guest_submit(uuid,text,text[],int,text,text,text[],text)', 'execute')
     or has_function_privilege('authenticated', 'public.soccer_daily_guest_submit(uuid,text,text[],int,text,text,text[],text)', 'execute')
     or has_function_privilege('anon', 'public.soccer_daily_guest_claim(uuid,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.soccer_daily_guest_claim(uuid,uuid)', 'execute') then
    raise exception 'a browser role can call a guest function';
  end if;
  if not has_function_privilege('service_role', 'public.soccer_daily_guest_submit(uuid,text,text[],int,text,text,text[],text)', 'execute')
     or not has_function_privilege('service_role', 'public.soccer_daily_guest_claim(uuid,uuid)', 'execute') then
    raise exception 'the service role cannot call a guest function';
  end if;
  if has_table_privilege('anon', 'public.soccer_daily_guest', 'select') or has_table_privilege('authenticated', 'public.soccer_daily_guest', 'select')
     or has_table_privilege('anon', 'public.soccer_daily_guest_posts', 'select') then
    raise exception 'a browser role can read a guest table';
  end if;
  if not has_table_privilege('anon', 'public.daily_board', 'select') then raise exception 'anon cannot read the board view'; end if;

  -- 2. a guest's Daily: the server's score, the same as an account's for the same eleven
  r := soccer_daily_guest_submit(g, ip, xi, 4, 'Quarter-Finalists', 'Quarter-final', sl, 'The 90s');
  if not (r->>'first')::boolean then raise exception 'first post not marked first'; end if;
  select name, overall into nm, ov from soccer_daily_guest where guest = g and date = today;
  if ov <> (select overall from pg_temp.before) then raise exception 'guest scored % , an account scores %', ov, (select overall from pg_temp.before); end if;
  if nm !~ '^[A-Z][a-z]+[A-Z][a-z]+[0-9]{2}$' and nm !~ '^[A-Z][a-z]+[0-9]{2}$' then raise exception 'name % is not two words and two digits', nm; end if;
  if nm <> r->>'name' then raise exception 'returned name differs from the stored one'; end if;
  if exists (select 1 from auth.users where id = g) or exists (select 1 from profiles where id = g) then raise exception 'a guest got an account row'; end if;
  if exists (select 1 from daily_results) then raise exception 'a guest wrote daily_results'; end if;

  -- 3. refusals
  perform pg_temp.must_fail(format($q$select soccer_daily_guest_submit(%L, %L, array['P1','P2','P3','P4','P5','P6','P7','P8','P9','P10'], 3)$q$, g2, ip), 'ten players');
  perform pg_temp.must_fail(format($q$select soccer_daily_guest_submit(%L, %L, array['P1','P1','P3','P4','P5','P6','P7','P8','P9','P10','STAR'], 3)$q$, g2, ip), 'a duplicate player');
  perform pg_temp.must_fail(format($q$select soccer_daily_guest_submit(%L, %L, array['NOPE','P2','P3','P4','P5','P6','P7','P8','P9','P10','STAR'], 3)$q$, g2, ip), 'an unknown player');
  perform pg_temp.must_fail(format($q$select soccer_daily_guest_submit(%L, %L, %L::text[], 3)$q$, acct, ip, xi), 'an account id as a guest');
  perform pg_temp.must_fail(format($q$select soccer_daily_guest_submit(%L, 'short', %L::text[], 3)$q$, g2, xi), 'no ip key');
  select count(*) into n from soccer_daily_guest_posts where ip_key = ip;
  if (select coalesce(sum(p.n), 0) from soccer_daily_guest_posts p where ip_key = ip) <> 1 then raise exception 'a refused post counted against the cap'; end if;

  -- 4. the first attempt is kept, a second post costs nothing, and progress is clamped
  r2 := soccer_daily_guest_submit(g, ip, array['P11','P12','P13','P14','P15','P16','P17','P18','P19','P20','STAR'], 99, 'World Cup Winners', 'Final', sl, 'The 90s');
  if (r2->>'first')::boolean or (r2->>'id') <> (r->>'id') then raise exception 'a second post replaced the first'; end if;
  if (select overall from soccer_daily_guest where guest = g and date = today) <> ov then raise exception 'the first score changed'; end if;
  if (select p.n from soccer_daily_guest_posts p where ip_key = ip and day = today) <> 1 then raise exception 'a repeat post counted against the cap'; end if;

  -- 5. made-up words are dropped, not stored; progress is clamped
  r2 := soccer_daily_guest_submit(g2, ip, xi, 99, '<b>Champion</b>', 'Moon', array['GK','x'], 'DROP TABLE;');
  if exists (select 1 from soccer_daily_guest where guest = g2 and (result is not null or furthest is not null or theme_id is not null or slots is not null)) then
    raise exception 'made-up words were stored';
  end if;
  if (select progress from soccer_daily_guest where guest = g2) <> 6 then raise exception 'progress not clamped'; end if;

  -- 6. the cap: three new rows a day from one IP key, another key still posts
  perform soccer_daily_guest_submit('eeeeeeee-5555-4555-8555-555555555555', ip, xi, 1);
  perform pg_temp.must_fail(format($q$select soccer_daily_guest_submit('ffffffff-6666-4666-8666-666666666666', %L, %L::text[], 1)$q$, ip, xi), 'a fourth new row from one IP key');
  if exists (select 1 from soccer_daily_guest where guest = 'ffffffff-6666-4666-8666-666666666666') then raise exception 'the capped row was stored'; end if;
  perform soccer_daily_guest_submit('ffffffff-6666-4666-8666-666666666666', 'another-ipkey-0123456789', xi, 1);

  -- 7. a name an account holds is stepped past
  insert into auth.users values ('99999999-9999-4999-8999-999999999999');
  insert into profiles (id, username) values ('99999999-9999-4999-8999-999999999999', soccer_guest_name('12121212-1212-4212-8212-121212121212'));
  r2 := soccer_daily_guest_submit('12121212-1212-4212-8212-121212121212', 'third-ipkey-0123456789ab', xi, 1);
  if exists (select 1 from profiles where lower(username::text) = lower(r2->>'name')) then raise exception 'a guest was given an account''s name'; end if;

  -- 8. the board view: both kinds, a negative guest id, no guest uuid
  perform become('dddddddd-4444-4444-8444-444444444444');
  perform submit_daily(array['P11','P12','P13','P14','P15','P16','P17','P18','P19','P20','STAR'], 2, 'Round of 16', 'Round of 16', sl, 'The 90s');
  if (select count(*) from daily_board where date = today) <> 6 then raise exception 'the board shows % rows, not 6', (select count(*) from daily_board where date = today); end if;
  if (select count(*) from daily_board where guest and id < 0) <> 5 or exists (select 1 from daily_board where not guest and id < 0) then raise exception 'guest ids are not negative'; end if;
  if exists (select 1 from information_schema.columns where table_name = 'daily_board' and column_name in ('guest_id', 'user_id', 'ip_key')) then raise exception 'the board view shows an id it should not'; end if;

  -- 9. the claim. The guest also has yesterday and the day before; the account already has yesterday.
  insert into soccer_daily_guest (guest, date, overall, progress, name) values (g, today - 1, 70.0, 1, nm), (g, today - 2, 71.5, 2, nm);
  insert into daily_results (user_id, date, overall, progress, name) values (acct, today - 1, 88.8, 5, 'RealPlayer');
  r := soccer_daily_guest_claim(acct, g);
  if (r->>'moved')::int <> 2 then raise exception 'claim moved % days, not 2', r->>'moved'; end if;
  if exists (select 1 from soccer_daily_guest where guest = g) then raise exception 'claimed guest rows were left behind'; end if;
  if (select overall from daily_results where user_id = acct and date = today - 1) <> 88.8 then raise exception 'the account''s own day was replaced'; end if;
  if (select overall from daily_results where user_id = acct and date = today) <> ov then raise exception 'the moved day lost its score'; end if;
  if exists (select 1 from daily_results where user_id = acct and (name <> 'RealPlayer' or (date <> today - 1 and flag is distinct from 'USA'))) then raise exception 'a moved day is not under the account''s name and flag'; end if;
  if (select current_streak from profiles where id = acct) <> 3 or (select longest_streak from profiles where id = acct) <> 3
     or (select last_played_date from profiles where id = acct) <> today then
    raise exception 'streak not rebuilt: % / %', (select current_streak from profiles where id = acct), (select longest_streak from profiles where id = acct);
  end if;
  -- the board keeps the spot under the new name
  if not exists (select 1 from daily_board where date = today and name = 'RealPlayer' and overall = ov and not guest) then raise exception 'the claimed day is not on the board under the account'; end if;
  -- a second claim, another account's id as the guest, and an unknown account
  if (soccer_daily_guest_claim(acct, g)->>'moved')::int <> 0 then raise exception 'a second claim moved rows'; end if;
  if (soccer_daily_guest_claim(acct, 'dddddddd-4444-4444-8444-444444444444')->>'moved')::int <> 0 then raise exception 'an account was claimed as a guest'; end if;
  perform pg_temp.must_fail(format($q$select soccer_daily_guest_claim('abababab-abab-4bab-8bab-abababababab', %L)$q$, g2), 'a claim for no account');
  -- the account plays tomorrow: submit_daily extends the rebuilt streak (checked by its own rule: last = today)

  -- 10. deleting the account still cascades, guest rows untouched
  delete from auth.users where id = acct;
  if exists (select 1 from daily_results where user_id = acct) then raise exception 'account deletion no longer cascades'; end if;
  if not exists (select 1 from soccer_daily_guest where guest = g2) then raise exception 'another guest''s row vanished'; end if;

  -- 11. old guest days are pruned when a new one arrives
  insert into soccer_daily_guest (guest, date, overall, progress, name) values (g2, today - 61, 70.0, 1, 'OldGuest10'), (g2, today - 59, 70.0, 1, 'OldGuest10');
  delete from soccer_daily_guest_posts;
  perform soccer_daily_guest_submit('13131313-1313-4313-8313-131313131313', ip, xi, 1);
  if exists (select 1 from soccer_daily_guest where date = today - 61) then raise exception 'a 61 day old guest row was kept'; end if;
  if not exists (select 1 from soccer_daily_guest where date = today - 59) then raise exception 'a 59 day old guest row was pruned'; end if;
end $$;

\echo 'soccer_daily_guest_test: all passed'
