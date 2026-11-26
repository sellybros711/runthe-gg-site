-- ---------------------------------------------------------------------------
-- soccer_club_seasons_test.sql : the Club Season's board (191).
--
--   createdb scs
--   psql -d scs -f supabase/test/soccer_club_seasons_test.sql
--
-- It builds its own base (roles, auth.users, profiles, wc_players), applies 12
-- and 189 (the guest name), then 191 twice (it must be safe to re-run).
--
-- The claims: a browser role can call only submit_club_season and
-- club_season_rank, and can read only the board view, which shows no user or
-- guest id; an account's season is filed under its name with points worked out
-- from the results; impossible seasons are refused (not nine matches, goals
-- that do not fit, a cup outside the top four, no cup inside it, the wrong
-- squad size, a duplicate, an unknown id); a club pool man's Wikidata id is
-- accepted; a second season inside a minute is refused; a guest's season needs
-- the service role, takes the device's Daily name, and is capped per IP key;
-- the board orders by points, goal difference, the cup, goals; the rank call
-- agrees with that order and with its windows; a claim moves every guest
-- season under the account's name; deleting the account deletes its seasons;
-- old guest seasons are pruned.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\pset pager off

do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;

create extension if not exists citext;
-- Supabase's own defaults: anon and authenticated are handed ALL on every new table, view and
-- function in public. A script that forgets to revoke passes on a bare cluster and is wide open
-- in production, so the test's base sets the same defaults (QA's review of 191).
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
drop schema if exists auth cascade;
create schema auth;
create table auth.users (id uuid primary key);
create table auth.session (uid uuid);
create or replace function auth.uid() returns uuid
  language sql stable security definer as $$ select uid from auth.session limit 1 $$;
grant usage on schema auth to anon, authenticated, service_role;
create or replace function public.become(p uuid) returns void
  language sql as $$ delete from auth.session; insert into auth.session values (p); $$;

drop view if exists public.club_season_board, public.daily_board;
drop table if exists public.soccer_club_seasons, public.soccer_season_guest_posts, public.soccer_daily_guest,
  public.soccer_daily_guest_posts, public.daily_results, public.profiles, public.wc_players cascade;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext unique, flag text not null default '',
  current_streak int not null default 0, longest_streak int not null default 0, last_played_date date
);
create table public.wc_players (player_id text primary key, wc_overall int not null, position text not null,
  is_captain boolean not null default false, award text not null default '');
insert into public.wc_players (player_id, wc_overall, position)
  select 'P' || i, 80 + (i % 10), 'MID' from generate_series(1, 20) i;

\i supabase/12_daily_challenge.sql
\i supabase/189_soccer_daily_guest.sql
\i supabase/191_soccer_club_seasons.sql
\i supabase/191_soccer_club_seasons.sql

create or replace function pg_temp.must_fail(sql text, what text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then return; end;
  raise exception 'should have failed: %', what;
end $$;

do $$
declare
  acct  uuid := 'cccccccc-3333-4333-8333-333333333333';
  acct2 uuid := 'dddddddd-4444-4444-8444-444444444444';
  g     uuid := 'aaaaaaaa-1111-4111-8111-111111111111';
  g2    uuid := 'bbbbbbbb-2222-4222-8222-222222222222';
  ip    text := 'ipkey-0123456789abcdef';
  xi    text[] := array['P1','P2','P3','P4','P5','P6','P7','P8','P9','P10','Q12345'];   -- ten World Cup men and one pool man
  six   text[] := array['P1','P2','P3','P4','P5','P6'];
  sig_s text := 'public.submit_club_season(text,text,int,int,int,int,int,int,text,numeric,int,text[],text[])';
  sig_g text := 'public.soccer_season_guest_submit(uuid,text,text,text,int,int,int,int,int,int,text,numeric,int,text[],text[])';
  sig_c text := 'public.soccer_season_guest_claim(uuid,uuid)';
  id1 bigint; r json; n int; nm text; i int;
begin
  insert into auth.users values (acct), (acct2);
  insert into profiles (id, username, flag) values (acct, 'RealPlayer', 'USA'), (acct2, 'Other', '');

  -- 1. who may call and read what
  if has_function_privilege('anon', sig_s, 'execute') or not has_function_privilege('authenticated', sig_s, 'execute') then raise exception 'submit_club_season is not for accounts only'; end if;
  if has_function_privilege('anon', sig_g, 'execute') or has_function_privilege('authenticated', sig_g, 'execute')
     or has_function_privilege('anon', sig_c, 'execute') or has_function_privilege('authenticated', sig_c, 'execute') then raise exception 'a browser role can call a guest function'; end if;
  if not has_function_privilege('service_role', sig_g, 'execute') or not has_function_privilege('service_role', sig_c, 'execute') then raise exception 'the service role cannot call a guest function'; end if;
  if has_table_privilege('anon', 'public.soccer_club_seasons', 'select') or has_table_privilege('authenticated', 'public.soccer_club_seasons', 'select')
     or has_table_privilege('authenticated', 'public.soccer_club_seasons', 'insert') then raise exception 'a browser role can reach the table'; end if;
  if not has_table_privilege('anon', 'public.club_season_board', 'select') then raise exception 'anon cannot read the board'; end if;
  if exists (select 1 from information_schema.columns where table_name = 'club_season_board' and column_name in ('user_id', 'ip_key'))
     or (select data_type from information_schema.columns where table_name = 'club_season_board' and column_name = 'guest') <> 'boolean' then
    raise exception 'the board view shows an id it should not';
  end if;
  if not has_function_privilege('anon', 'public.club_season_rank(text,int,int,text,int,timestamptz)', 'execute') then raise exception 'anon cannot ask a rank'; end if;

  -- 2. an account's season: its name, points from the results
  perform become(acct);
  id1 := submit_club_season('full', 'easy', 6, 2, 1, 17, 8, 2, 'finalist', 88.46, 1, xi, null);
  if not exists (select 1 from soccer_club_seasons where id = id1 and user_id = acct and guest is null and name = 'RealPlayer' and flag = 'USA'
                 and points = 20 and gd = 9 and cup_rank = 2 and overall = 88.5 and signings = 1) then raise exception 'the account season was not filed as sent'; end if;
  -- a second inside a minute is a double post
  perform pg_temp.must_fail(format($q$select submit_club_season('full','easy',9,0,0,30,2,1,'winner',99,0,%L::text[])$q$, xi), 'a second season inside a minute');
  update soccer_club_seasons set created_at = now() - interval '5 minutes' where id = id1;

  -- 3. seasons that cannot be
  perform pg_temp.must_fail(format($q$select submit_club_season('full','easy',9,1,0,30,2,1,'winner',99,0,%L::text[])$q$, xi), 'ten matches');
  perform pg_temp.must_fail(format($q$select submit_club_season('full','easy',9,0,0,5,2,1,'winner',99,0,%L::text[])$q$, xi), 'nine wins on five goals');
  perform pg_temp.must_fail(format($q$select submit_club_season('full','easy',0,0,9,5,2,10,'none',99,0,%L::text[])$q$, xi), 'nine defeats conceding two');
  perform pg_temp.must_fail(format($q$select submit_club_season('full','easy',5,2,2,12,8,6,'winner',99,0,%L::text[])$q$, xi), 'a cup from sixth');
  perform pg_temp.must_fail(format($q$select submit_club_season('full','easy',5,2,2,12,8,3,'none',99,0,%L::text[])$q$, xi), 'third with no cup');
  perform pg_temp.must_fail(format($q$select submit_club_season('full','easy',5,2,2,12,8,11,'none',99,0,%L::text[])$q$, xi), 'eleventh of ten');
  perform pg_temp.must_fail(format($q$select submit_club_season('full','easy',9,0,0,20,2,2,'winner',99,0,%L::text[])$q$, xi), 'nine wins and second');
  perform pg_temp.must_fail(format($q$select submit_club_season('full','easy',0,0,9,2,20,7,'none',99,0,%L::text[])$q$, xi), 'nine defeats and seventh');
  perform pg_temp.must_fail(format($q$select submit_club_season('full','easy',5,2,2,12,8,3,'champion',99,0,%L::text[])$q$, xi), 'a made-up cup word');
  perform pg_temp.must_fail(format($q$select submit_club_season('mega','easy',5,2,2,12,8,3,'semi',99,0,%L::text[])$q$, xi), 'a made-up draft type');
  perform pg_temp.must_fail(format($q$select submit_club_season('full','easy',5,2,2,12,8,3,'semi',99,0,%L::text[])$q$, six), 'six men in a full squad');
  perform pg_temp.must_fail($q$select submit_club_season('full','easy',5,2,2,12,8,3,'semi',99,0,array['P1','P1','P3','P4','P5','P6','P7','P8','P9','P10','P11'])$q$, 'a duplicate');
  perform pg_temp.must_fail($q$select submit_club_season('full','easy',5,2,2,12,8,3,'semi',99,0,array['NOPE','P2','P3','P4','P5','P6','P7','P8','P9','P10','P11'])$q$, 'an unknown id');
  perform pg_temp.must_fail($q$select submit_club_season('full','easy',5,2,2,12,8,3,'semi',99,0,array['Q1;drop','P2','P3','P4','P5','P6','P7','P8','P9','P10','P11'])$q$, 'a strange id');
  perform become(null);
  perform pg_temp.must_fail(format($q$select submit_club_season('full','easy',5,2,2,12,8,3,'semi',99,0,%L::text[])$q$, xi), 'signed out');
  if (select count(*) from soccer_club_seasons) <> 1 then raise exception 'a refused season was stored'; end if;
  -- a quick squad is six, and the rating shown is clamped
  perform become(acct2);
  perform submit_club_season('quick', 'hard', 3, 3, 3, 9, 9, 5, 'none', 999, 7, six, null);
  if not exists (select 1 from soccer_club_seasons where user_id = acct2 and draft_type = 'quick' and points = 12 and overall = 110 and signings = 2) then raise exception 'the quick season was not clamped as it should be'; end if;

  -- 4. a guest: the Daily's name, no account row, the cap
  perform soccer_daily_guest_submit(g, ip, array['P1','P2','P3','P4','P5','P6','P7','P8','P9','P10','P11'], 3);
  select name into nm from soccer_daily_guest where guest = g;
  r := soccer_season_guest_submit(g, ip, 'full', 'easy', 7, 1, 1, 20, 6, 1, 'winner', 91.2, 2, xi, null);
  if r->>'name' <> nm then raise exception 'the guest season is not under the device''s Daily name'; end if;
  if not exists (select 1 from soccer_club_seasons where guest = g and user_id is null and points = 22 and name = nm) then raise exception 'the guest season was not filed'; end if;
  if exists (select 1 from auth.users where id = g) or exists (select 1 from profiles where id = g) then raise exception 'a guest got an account row'; end if;
  perform pg_temp.must_fail(format($q$select soccer_season_guest_submit(%L, %L, 'full','easy',7,1,1,20,6,1,'winner',91,0,%L::text[])$q$, g, ip, xi), 'a guest season inside a minute');
  perform pg_temp.must_fail(format($q$select soccer_season_guest_submit(%L, %L, 'full','easy',7,1,1,20,6,1,'winner',91,0,%L::text[])$q$, acct, ip, xi), 'an account id as a guest');
  perform pg_temp.must_fail(format($q$select soccer_season_guest_submit(%L, %L, 'full','easy',7,1,1,20,6,6,'winner',91,0,%L::text[])$q$, g2, ip, xi), 'a guest cup from sixth');
  -- a fresh device gets a generated name; 20 new rows a day per IP key
  r := soccer_season_guest_submit(g2, ip, 'full', 'easy', 2, 2, 5, 8, 14, 8, 'none', 78, 0, xi, null);
  if r->>'name' !~ '^[A-Z][a-z]+[A-Z][a-z]+[0-9]{2}$' then raise exception 'guest name % is not two words and two digits', r->>'name'; end if;
  update soccer_season_guest_posts set n = 20 where ip_key = ip;
  perform pg_temp.must_fail(format($q$select soccer_season_guest_submit('eeeeeeee-5555-4555-8555-555555555555', %L, 'full','easy',2,2,5,8,14,8,'none',78,0,%L::text[])$q$, ip, xi), 'a twenty first guest season from one IP key');
  perform soccer_season_guest_submit('eeeeeeee-5555-4555-8555-555555555555', 'another-ipkey-0123456789', 'full', 'easy', 7, 1, 1, 20, 6, 2, 'semi', 90, 0, xi, null);

  -- 5. the board's order: points, goal difference, the cup, goals
  --    g 22 pts +14 winner | eeee 22 pts +14 semi | RealPlayer 20 | g2 8
  if (select array_agg(points order by points desc, gd desc, cup_rank desc, gf desc, created_at) from club_season_board where draft_type = 'full') <> array[22, 22, 20, 8] then raise exception 'the full board is not the four full seasons'; end if;
  if (select cup from club_season_board where draft_type = 'full' order by points desc, gd desc, cup_rank desc, gf desc, created_at limit 1) <> 'winner' then raise exception 'the cup does not break a tie on points and goal difference'; end if;
  if (select count(*) from club_season_board where guest) <> 3 then raise exception 'the board does not mark guests'; end if;
  -- the rank call agrees
  if (club_season_rank('full', 22, 14, 'winner', 20)->>'rank')::int <> 1 or (club_season_rank('full', 22, 14, 'semi', 20)->>'rank')::int <> 2
     or (club_season_rank('full', 20, 9, 'finalist', 17)->>'rank')::int <> 3 or (club_season_rank('full', 8, -6, 'none', 8)->>'rank')::int <> 4
     or (club_season_rank('full', 27, 30, 'winner', 40)->>'rank')::int <> 1 or (club_season_rank('full', 0, -30, 'none', 0)->>'rank')::int <> 5
     or (club_season_rank('full', 20, 9, 'finalist', 17)->>'total')::int <> 4 or (club_season_rank('quick', 12, 0, 'none', 9)->>'total')::int <> 1 then
    raise exception 'club_season_rank disagrees with the board';
  end if;
  -- a window: the account's season is five minutes old
  if (club_season_rank('full', 20, 9, 'finalist', 17, now() - interval '1 minute')->>'total')::int <> 3 then raise exception 'the window does not cut by time'; end if;

  -- 6. the claim: every guest season moves, under the account's name
  r := soccer_season_guest_claim(acct, g);
  if (r->>'moved')::int <> 1 or exists (select 1 from soccer_club_seasons where guest = g)
     or (select count(*) from soccer_club_seasons where user_id = acct and name = 'RealPlayer' and flag = 'USA') <> 2 then raise exception 'the claim did not move the guest season under the account'; end if;
  if (soccer_season_guest_claim(acct, g)->>'moved')::int <> 0 or (soccer_season_guest_claim(acct, acct2)->>'moved')::int <> 0 then raise exception 'a second claim, or an account claimed as a guest, moved rows'; end if;
  perform pg_temp.must_fail(format($q$select soccer_season_guest_claim('abababab-abab-4bab-8bab-abababababab', %L)$q$, g2), 'a claim for no account');
  if (select count(*) from club_season_board where guest) <> 2 then raise exception 'a claimed season still reads as a guest''s'; end if;

  -- 7. deleting the account deletes its seasons; guests' stay
  delete from auth.users where id = acct;
  if exists (select 1 from soccer_club_seasons where user_id = acct) or not exists (select 1 from soccer_club_seasons where guest = g2) then raise exception 'account deletion did not cascade cleanly'; end if;

  -- 8. old guest seasons are pruned when a new one arrives; an account's are kept
  update soccer_club_seasons set created_at = now() - interval '61 days' where guest = g2;
  update soccer_club_seasons set created_at = now() - interval '61 days' where user_id = acct2;
  delete from soccer_season_guest_posts;
  perform soccer_season_guest_submit('13131313-1313-4313-8313-131313131313', ip, 'quick', 'easy', 4, 4, 1, 12, 7, 3, 'semi', 84, 0, six, null);
  if exists (select 1 from soccer_club_seasons where guest = g2) then raise exception 'a 61 day old guest season was kept'; end if;
  if not exists (select 1 from soccer_club_seasons where user_id = acct2) then raise exception 'an account''s old season was pruned'; end if;
end $$;

-- 9. the board is read only: as a browser role, an update and a delete on the view are refused
--    and change nothing (a view over one table is auto-updatable unless it is revoked)
select count(*) as rows_before, coalesce(sum(points), 0) as points_before from public.soccer_club_seasons \gset
set role anon;
select count(*) > 0 as anon_reads from public.club_season_board \gset
do $$ begin
  begin update public.club_season_board set points = 27, name = 'hacked'; raise exception 'HOLE: anon updated the board';
  exception when insufficient_privilege then null; end;
  begin delete from public.club_season_board; raise exception 'HOLE: anon deleted from the board';
  exception when insufficient_privilege then null; end;
  begin insert into public.club_season_board (name, points) values ('hacked', 27); raise exception 'HOLE: anon inserted into the board';
  exception when insufficient_privilege then null; when others then null; end;
  begin perform 1 from public.soccer_club_seasons; raise exception 'HOLE: anon read the table';
  exception when insufficient_privilege then null; end;
end $$;
set role authenticated;
do $$ begin
  begin update public.club_season_board set points = 27; raise exception 'HOLE: an account updated the board';
  exception when insufficient_privilege then null; end;
  begin delete from public.club_season_board; raise exception 'HOLE: an account deleted from the board';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select (count(*) = :rows_before and coalesce(sum(points), 0) = :points_before) as untouched from public.soccer_club_seasons \gset
\if :anon_reads
\else
  \echo 'FAIL: anon cannot read the board'
  \quit 1
\endif
\if :untouched
\else
  \echo 'FAIL: a browser role changed the board'
  \quit 1
\endif

-- 10. a hidden season leaves the board and the rank, and nothing else changes
do $$
declare before_n int; top_id bigint;
begin
  select count(*) into before_n from club_season_board where draft_type = 'quick';
  select id into top_id from soccer_club_seasons where draft_type = 'quick' order by points desc limit 1;
  update soccer_club_seasons set hidden = true where id = top_id;
  if (select count(*) from club_season_board where draft_type = 'quick') <> before_n - 1 or exists (select 1 from club_season_board where id = top_id) then raise exception 'a hidden season is still on the board'; end if;
  if (club_season_rank('quick', 0, -30, 'none', 0)->>'total')::int <> before_n - 1 then raise exception 'a hidden season still counts in the rank'; end if;
end $$;

\echo 'soccer_club_seasons_test: all passed'
