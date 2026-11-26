-- ---------------------------------------------------------------------------
-- usernames_not_guest_names_test.sql : a new username may not look like a
-- generated guest name (190).
--
-- Set up as in arcade_guest_server_test.sql (fantasy_base, subscriptions, 101,
-- 52, 70, 72, 74, 76, 82, 84, 85, 125, 131 and 188), then:
--   psql -d gst -f supabase/test/usernames_not_guest_names_test.sql   (it applies 190 itself, twice)
--
-- The claims: both generators' own names are caught, in any case; ordinary
-- names, a near miss and a name with an underscore are not; username_available
-- answers false for a guest style name; set_username refuses one for a new
-- holder but lets a player who already holds it save it again; sign-up
-- (handle_new_user) leaves such a name off the profile; username_ok is unchanged.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\pset pager off

-- A stand in for 189's generator (only its two word lists are read). Real
-- words from 189, so the claims below test the soccer side too.
create or replace function public.soccer_guest_name(p_guest uuid, p_salt int default 0)
returns text language sql immutable as $$
  select (array['Silly','Golden','Thunder'])[1]
      || (array['Dragontail','Nutmeg','Panenka'])[1] || '10';
$$;

-- 10's format rule, and a sign-up column the test base lacks
create or replace function username_ok(p text)
returns boolean language sql immutable as $$
  select p is not null and p ~ '^[A-Za-z0-9_]{3,20}$';
$$;
alter table auth.users add column if not exists raw_user_meta_data jsonb;

\i supabase/190_usernames_not_guest_names.sql
\i supabase/190_usernames_not_guest_names.sql

create or replace function pg_temp.must_fail(sql text, what text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then return; end;
  raise exception 'should have failed: %', what;
end $$;

do $$
declare
  holder uuid := '71717171-7171-4171-8171-717171717171';
  fresh  uuid := '72727272-7272-4272-8272-727272727272';
  signup uuid := '73737373-7373-4373-8373-737373737373';
  n text;
begin
  -- 1. the pattern
  n := public.rtg_guest_name('fedcba98-7654-4321-8abc-def012345678');
  if not public.username_guest_like(n) then raise exception 'the arcade''s own name % is not caught', n; end if;
  if not public.username_guest_like(lower(n)) or not public.username_guest_like(upper(n)) then raise exception 'case changes the answer'; end if;
  if not public.username_guest_like('SillyDragontail52') or not public.username_guest_like('ThunderPanenka10') then raise exception 'Run The Pitch''s names are not caught'; end if;
  if not public.username_guest_like('SwiftNutmeg33') then raise exception 'an arcade adjective with a soccer noun is not caught'; end if;
  if public.username_guest_like('realplayer') or public.username_guest_like('SwiftShortstop')
     or public.username_guest_like('SwiftShortstop482') or public.username_guest_like('Swift_Shortstop48')
     or public.username_guest_like('Shortstop48') or public.username_guest_like('SwiftShortstopX48')
     or public.username_guest_like(null) then
    raise exception 'an ordinary name or a near miss is caught'; end if;
  if not username_ok('SwiftShortstop48') then raise exception 'username_ok changed'; end if;

  -- 2. availability
  if username_available('SwiftShortstop48') then raise exception 'a guest style name is offered as available'; end if;
  if not username_available('realplayer2') then raise exception 'an ordinary free name is refused'; end if;

  -- 3. set_username: refused for a new holder, allowed for the one who has it
  insert into auth.users values (holder), (fresh) on conflict do nothing;
  insert into profiles (id, username) values (holder, 'CalmAnchor64'), (fresh, null) on conflict do nothing;
  perform public.become(fresh);
  perform pg_temp.must_fail($q$select set_username('LuckyCatcher55')$q$, 'a fresh guest style name');
  perform set_username('fresh_one');
  if (select username from profiles where id = fresh) <> 'fresh_one' then raise exception 'an ordinary rename failed'; end if;
  perform public.become(holder);
  perform set_username('CalmAnchor64');
  if (select username from profiles where id = holder) <> 'CalmAnchor64' then raise exception 'an existing holder lost their name'; end if;
  perform pg_temp.must_fail($q$select set_username('SlyKeeper73')$q$, 'an existing holder switching to another guest style name');

  -- 4. sign-up (10's trigger, on 190's handle_new_user)
  drop trigger if exists on_auth_user_created on auth.users;
  create trigger on_auth_user_created after insert on auth.users
    for each row execute function handle_new_user();
  insert into auth.users (id, raw_user_meta_data) values (signup, '{"username":"BoldCoach21"}'::jsonb);
  if (select username from profiles where id = signup) is not null then raise exception 'sign-up kept a guest style name'; end if;
  insert into auth.users (id, raw_user_meta_data) values ('74747474-7474-4474-8474-747474747474', null);
  if not exists (select 1 from profiles where id = '74747474-7474-4474-8474-747474747474' and username is null) then
    raise exception 'sign-up with no username made no profile'; end if;
  insert into auth.users (id, raw_user_meta_data) values ('75757575-7575-4575-8575-757575757575', '{"username":"realplayer9"}'::jsonb);
  if (select username from profiles where id = '75757575-7575-4575-8575-757575757575') is distinct from 'realplayer9' then
    raise exception 'sign-up lost an ordinary name'; end if;
end $$;

\echo 'usernames not guest names: all claims hold'
