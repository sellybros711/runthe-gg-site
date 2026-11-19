-- ---------------------------------------------------------------------------
-- 184_shut_the_door_reds.sql : the Reds' situation, the last of the 13 clubs that had none
--
-- Run AFTER the site PR merges and the site has redeployed, and BEFORE 2026-11-25 begins
-- (Eastern). Safe to run more than once. Needs 179 (from_day and its shutdoor_vote_candidates).
--
-- THE ASK (the owner, 2026-11-18). 179 gave 12 of the 13 clubs with no closer in any situation one
-- real save situation each. The Reds' (std-2025-pagan-mil: Emilio Pagan, 2025-09-26 at Milwaukee, up
-- 3-1 in the bottom of the 9th) waited on a 3D fix to the slow roller's pull up. With that fix in, it
-- joins at the end of the list, ord 42, and a save there unlocks the Reds the normal way.
--
-- WHAT IT CHANGES
--   * shutdoor_packs                   std-2025-pagan-mil at ord 42, from 2026-11-26
--   * shutdoor_pack_clubs              std-2025-pagan-mil, the Reds (plate.js PACK_CLUBS)
-- shutdoor_vote_candidates (179) already draws only from the situations a day has (from_day).
--
-- NO DAY ALREADY DRAWN MOVES. A day's two candidates are stored once, the day before, and every
-- later day reads the 13 before it. So the Reds join on a day of their own, 2026-11-26 (modes.js
-- POOL.GROW, the page's copy of the rule): every day before it draws from what it did, the thirty
-- before 2026-11-25 and the 42 on 2026-11-25. The server stores 2026-11-26's candidates on
-- 2026-11-25, so this must run before that day begins. If it runs later, it stops before changing
-- anything and says so: move POOL.GROW's last day and the date in this file to a later day (a site
-- PR), then run it.
-- ---------------------------------------------------------------------------

begin;

-- too late: a vote day on or after 2026-11-26 was already drawn without the Reds (a first run only)
do $$
begin
  if not exists (select 1 from public.shutdoor_packs where id = 'std-2025-pagan-mil')
     and exists (select 1 from public.shutdoor_vote_days where day >= date '2026-11-26') then
    raise exception '184: the vote days from 2026-11-26 are already drawn without the Reds. Move modes.js POOL.GROW''s last day and this file''s date to a day not drawn yet, then run it again';
  end if;
end $$;

-- after the 12, in data/schedule.json's rotation order (test/modes.mjs checks it)
insert into public.shutdoor_packs (id, ord, from_day) values
  ('std-2025-pagan-mil', 42, date '2026-11-26')
on conflict (id) do update set ord = excluded.ord, from_day = excluded.from_day;

-- (situation, its closer's club as plate.js keys it)
insert into public.shutdoor_pack_clubs (id, club) values
  ('std-2025-pagan-mil', 'reds')
on conflict (id) do update set club = excluded.club;

commit;
