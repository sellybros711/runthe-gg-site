-- ---------------------------------------------------------------------------
-- 162_shut_the_door_plates.sql : the plate you wear, and the clubs you unlocked
--
-- Run AFTER 160_shut_the_door_vote_survivor.sql. Safe to run more than once.
--
-- The owner's call (2026-11-03): the avatar is the home plate crest in a club's
-- colours, with your initials. Everyone starts on the neutral plate. Shutting the
-- door as a club's closer unlocks that club.
--
-- WHAT IS VERIFIED. The unlocks are never sent by the page. They are read from
-- the stored outings (the daily, the archive and every Survivor entry) whose
-- outcome is door_shut, through the situation's club below. The setter refuses a
-- club the caller has not unlocked. The initials are the site wide
-- profiles.avatar_initials when set, else the page cuts them from the username.
--
-- A KEY, NOT A COLOUR, the bargain 53 and 66 make: 'dodgers', which the page
-- resolves against 3d/clubs.js. Nothing here reaches a style attribute.
--
-- WHAT IT ADDS
--   * profiles.shutdoor_plate        the club key you wear, null for neutral
--   * shutdoor_pack_clubs            each situation's closer's club
--   * shutdoor_unlocked(uid)         the clubs a player's saves unlocked
--   * shutdoor_my_plates()           {plate, unlocked} for the caller
--   * shutdoor_set_plate(key)        the setter, verified
--   * shutdoor_board, shutdoor_survivor_board   two more columns: plate, initials
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists shutdoor_plate text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_shutdoor_plate_ck') then
    alter table public.profiles add constraint profiles_shutdoor_plate_ck
      check (shutdoor_plate is null or shutdoor_plate ~ '^[a-z]{2,16}$');
  end if;
end $$;

-- the closer's club for each situation: the pack's pitcher.team as clubs.js keys it
-- (its nickname, lower case, letters only). A pack with no team is left out.
create table if not exists public.shutdoor_pack_clubs (
  id   text primary key check (length(id) between 1 and 64),
  club text not null check (club ~ '^[a-z]{2,16}$')
);
alter table public.shutdoor_pack_clubs enable row level security;
revoke all on public.shutdoor_pack_clubs from anon, authenticated;
insert into public.shutdoor_pack_clubs (id, club) values
  ('std-1988-ws1-eckersley', 'athletics'),
  ('std-2001-ws7-rivera', 'yankees'),
  ('std-2008-alcs7-price', 'rays'),
  ('std-2008-krod-sea', 'angels'),
  ('std-2008-ws5-lidge', 'phillies'),
  ('std-2009-alcs6-rivera', 'yankees'),
  ('std-2010-hoffman-stl', 'brewers'),
  ('std-2010-ws5-wilson', 'giants'),
  ('std-2011-rivera-min', 'yankees'),
  ('std-2011-ws6-feliz', 'rangers'),
  ('std-2012-ws4-romo', 'giants'),
  ('std-2013-alcs6-uehara', 'redsox'),
  ('std-2014-ws7-bumgarner', 'giants'),
  ('std-2015-alcs6-davis', 'royals'),
  ('std-2016-ws7-chapman', 'cubs'),
  ('std-2017-ws2-jansen', 'dodgers'),
  ('std-2018-alcs4-kimbrel', 'redsox'),
  ('std-2019-nlwc-hader', 'brewers'),
  ('std-2021-nlcs6-smith', 'braves'),
  ('std-2022-ws6-pressly', 'astros'),
  ('std-2023-hader-stl', 'padres'),
  ('std-2023-williams-sd', 'brewers'),
  ('std-2023-ws1-sewald', 'diamondbacks'),
  ('std-2024-ws5-buehler', 'dodgers'),
  ('std-2025-diaz-cin', 'mets'),
  ('std-2025-scott-kc', 'dodgers'),
  ('std-2025-ws6-glasnow', 'dodgers'),
  ('std-2025-ws7-yamamoto', 'dodgers')
on conflict (id) do update set club = excluded.club;

create or replace function public.shutdoor_unlocked(p_uid uuid) returns text[]
language sql security definer set search_path = public stable as $$
  select coalesce(array_agg(distinct c.club order by c.club), '{}')
    from (
      select o.scenario_id as sid from shutdoor_outings o where o.user_id = p_uid and o.outcome = 'door_shut'
      union all
      select a.scenario_id from shutdoor_archive a where a.user_id = p_uid and a.outcome = 'door_shut'
      union all
      select e->>'scenarioId' from shutdoor_survivor s, jsonb_array_elements(s.entries) e
       where s.user_id = p_uid and e->>'outcome' = 'door_shut'
    ) w
    join shutdoor_pack_clubs c on c.id = w.sid
$$;

create or replace function public.shutdoor_my_plates() returns json
language plpgsql security definer set search_path = public stable as $$
declare uid uuid := auth.uid(); u text[]; k text; ini text;
begin
  if uid is null then return null; end if;
  u := shutdoor_unlocked(uid);
  select p.shutdoor_plate, p.avatar_initials into k, ini from profiles p where p.id = uid;
  return json_build_object('plate', case when k = any(u) then k end, 'unlocked', to_json(u), 'initials', ini);
end $$;

-- '' or null clears it (the neutral plate). Anything else must be a club the
-- caller's own stored saves unlocked.
create or replace function public.shutdoor_set_plate(p_plate text) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); k text := nullif(lower(trim(coalesce(p_plate, ''))), '');
begin
  if uid is null then raise exception 'sign in first'; end if;
  if k is not null and not (k = any(shutdoor_unlocked(uid))) then raise exception 'that plate is locked'; end if;
  update profiles set shutdoor_plate = k where id = uid;
  return shutdoor_my_plates();
end $$;

-- the boards: the same rows with the plate and the initials on the end. The
-- return type changes, so they are dropped and made again (with their grants).
drop function if exists public.shutdoor_board(date, int);
create function public.shutdoor_board(p_day date, p_limit int default 50)
returns table (rank bigint, username text, outcome text, pitches int, score int, percentile int,
               pitched_like text, strip jsonb, mine boolean, players bigint, plate text, initials text)
language sql security definer set search_path = public stable as $$
  with r as (
    select o.*, row_number() over (order by o.score desc, o.created_at) as rk, count(*) over () as n
      from shutdoor_outings o where o.day = p_day
  )
  select r.rk, coalesce(p.username, 'Closer')::text, r.outcome, r.pitches, r.score, r.percentile,
         r.pitched_like, r.strip, r.user_id = auth.uid(), r.n,
         case when p.shutdoor_plate = any(shutdoor_unlocked(r.user_id)) then p.shutdoor_plate end,
         p.avatar_initials
    from r left join profiles p on p.id = r.user_id
   where r.rk <= greatest(1, least(100, coalesce(p_limit, 50))) or r.user_id = auth.uid()
   order by r.rk
$$;

drop function if exists public.shutdoor_survivor_board(date, int);
create function public.shutdoor_survivor_board(p_day date, p_limit int default 50)
returns table (rank bigint, username text, saves int, points int, over boolean, mine boolean, players bigint,
               plate text, initials text)
language sql security definer set search_path = public stable as $$
  with r as (
    select s.*, row_number() over (order by s.saves desc, s.points desc, s.updated_at) as rk, count(*) over () as n
      from shutdoor_survivor s where s.day = p_day and s.run = 0
  )
  select r.rk, coalesce(p.username, 'Closer')::text, r.saves, r.points, r.over, r.user_id = auth.uid(), r.n,
         case when p.shutdoor_plate = any(shutdoor_unlocked(r.user_id)) then p.shutdoor_plate end,
         p.avatar_initials
    from r left join profiles p on p.id = r.user_id
   where r.rk <= greatest(1, least(100, coalesce(p_limit, 50))) or r.user_id = auth.uid()
   order by r.rk
$$;

revoke all on function public.shutdoor_unlocked(uuid) from public;
revoke all on function public.shutdoor_my_plates() from public;
revoke all on function public.shutdoor_set_plate(text) from public;
revoke all on function public.shutdoor_board(date, int) from public;
revoke all on function public.shutdoor_survivor_board(date, int) from public;
grant execute on function public.shutdoor_my_plates() to authenticated;
grant execute on function public.shutdoor_set_plate(text) to authenticated;
grant execute on function public.shutdoor_board(date, int) to anon, authenticated;
grant execute on function public.shutdoor_survivor_board(date, int) to anon, authenticated;
