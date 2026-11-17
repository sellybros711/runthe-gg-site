-- ---------------------------------------------------------------------------
-- 177_shut_the_door_plates_more.sql : the throwback plates, and Diamond for Pro
--
-- Run AFTER 162_shut_the_door_plates.sql (and 166). Safe to run more than once.
--
-- The owner's ask (2026-11-17): "Can we add all clubs, including historic clubs
-- that are included in situations, and maybe one special diamond one that is for
-- pro users only?"
--
-- THE 30 CLUBS need nothing here: a key is a club the page draws, and a club
-- with no situation yet has no row, so nobody can wear it until a pack adds one.
--
-- THE THROWBACKS. A save in a situation from another era of a club's identity
-- (shut-the-door/plate.js THROWBACKS) unlocks that era's plate as well as the
-- club's own. One more column on each situation's row, the era's key, null for a
-- situation of today's identity. test/modes.mjs holds these rows to the packs.
--
-- DIAMOND. shutdoor_unlocked adds 'diamond' only while shutdoor_is_pro (160, the
-- gate the archive uses) says so. So the setter refuses it for an account that is
-- not Pro, and the boards (which show a plate only when it is in the wearer's own
-- unlocked list) draw the plain plate for anyone who stored it and is not Pro now.
--
-- WHAT IT CHANGES
--   * shutdoor_pack_clubs.throwback   the era's plate, null for none
--   * shutdoor_unlocked(uid)          the clubs, the throwbacks, and Diamond for Pro
-- Same signature as 162, so the grants, the setter and both boards keep working.
-- ---------------------------------------------------------------------------

begin;

alter table public.shutdoor_pack_clubs add column if not exists throwback text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'shutdoor_pack_clubs_throwback_ck') then
    alter table public.shutdoor_pack_clubs add constraint shutdoor_pack_clubs_throwback_ck
      check (throwback is null or throwback ~ '^[a-z]{2,16}$');
  end if;
end $$;

-- (situation, its closer's club as 162 and 167 have it, the era's plate)
insert into public.shutdoor_pack_clubs (id, club, throwback) values
  ('std-2005-nlcs5-lidge', 'astros', 'astrosbrick'),
  ('std-2010-hoffman-stl', 'brewers', 'brewersgold'),
  ('std-2019-nlwc-hader', 'brewers', 'brewersgold')
on conflict (id) do update set club = excluded.club, throwback = excluded.throwback;

create or replace function public.shutdoor_unlocked(p_uid uuid) returns text[]
language sql security definer set search_path = public stable as $$
  select coalesce(array_agg(distinct k order by k), '{}')
    from (
      select c.club as k
        from (
          select o.scenario_id as sid from shutdoor_outings o where o.user_id = p_uid and o.outcome = 'door_shut'
          union all
          select a.scenario_id from shutdoor_archive a where a.user_id = p_uid and a.outcome = 'door_shut'
          union all
          select e->>'scenarioId' from shutdoor_survivor s, jsonb_array_elements(s.entries) e
           where s.user_id = p_uid and e->>'outcome' = 'door_shut'
        ) w
        join shutdoor_pack_clubs c on c.id = w.sid
      union all
      select c.throwback
        from (
          select o.scenario_id as sid from shutdoor_outings o where o.user_id = p_uid and o.outcome = 'door_shut'
          union all
          select a.scenario_id from shutdoor_archive a where a.user_id = p_uid and a.outcome = 'door_shut'
          union all
          select e->>'scenarioId' from shutdoor_survivor s, jsonb_array_elements(s.entries) e
           where s.user_id = p_uid and e->>'outcome' = 'door_shut'
        ) w
        join shutdoor_pack_clubs c on c.id = w.sid
       where c.throwback is not null
      union all
      select 'diamond' where p_uid is not null and shutdoor_is_pro(p_uid)
    ) u
$$;
revoke all on function public.shutdoor_unlocked(uuid) from public;

commit;
