-- ---------------------------------------------------------------------------
-- 179_shut_the_door_thirteen_clubs.sql : a situation for 12 of the 13 clubs that had none
--
-- Run AFTER the site PR merges and the site has redeployed, and BEFORE 2026-11-24 begins
-- (Eastern). Safe to run more than once. Needs 160, 161, 163 (the vote) and 162 (the plates).
-- 178 is not needed: the rows below name no throwback, so they work with or without it.
--
-- THE ASK (the owner, 2026-11-18). Thirteen of today's clubs had no closer in any situation,
-- so their plates could never unlock: Orioles, Blue Jays, White Sox, Guardians, Tigers, Twins,
-- Mariners, Marlins, Nationals, Reds, Pirates, Cardinals and Rockies. One real save situation
-- each joins the packs (shut-the-door/data/packs), and a save there unlocks the club the normal way.
-- Twelve ship here. The Reds' (std-2025-pagan-mil) waits on a 3D fix to the slow roller's pull up
-- (the owner, 2026-11-18): a later migration adds it at ord 42, from a day of its own.
--
-- WHAT IT CHANGES
--   * shutdoor_packs.from_day          the first day a situation can be offered (null: always)
--   * shutdoor_packs                   the 12, at ord 30 to 41, from 2026-11-25
--   * shutdoor_vote_candidates(day)    draws only from the situations a day has (from_day)
--   * shutdoor_pack_clubs              the 12, each its closer's club (plate.js PACK_CLUBS)
--
-- NO DAY ALREADY DRAWN MOVES. A day's two candidates are stored once, the day before, and every
-- later day reads the 13 before it. So the 12 join on a day of their own, 2026-11-25 (modes.js
-- POOL.FROM, the page's copy of the rule): every day before it draws from the thirty exactly as
-- it did, on the server and the page alike, and Survivor's runs before it keep their order too.
-- The server stores 2026-11-25's candidates on 2026-11-24, so this must run before that day
-- begins. If it runs later, it stops before changing anything and says so: move POOL.FROM and
-- the date in this file to a later day (a site PR), then run it.
--
-- shutdoor_fixed_pack (163) is untouched: it walks ord 0 to 29 for the days before the vote, and
-- those days never change.
-- ---------------------------------------------------------------------------

begin;

alter table public.shutdoor_packs add column if not exists from_day date;

-- too late: a vote day on or after 2026-11-25 was already drawn from the thirty (a first run only)
do $$
begin
  if not exists (select 1 from public.shutdoor_packs where id = 'std-2025-alcs7-hoffman')
     and exists (select 1 from public.shutdoor_vote_days where day >= date '2026-11-25') then
    raise exception '179: the vote days from 2026-11-25 are already drawn from the thirty. Move modes.js POOL.FROM and this file''s date to a day not drawn yet, then run it again';
  end if;
end $$;

-- the 12, in data/schedule.json's rotation order after the thirty (test/modes.mjs checks it)
insert into public.shutdoor_packs (id, ord, from_day) values
  ('std-2025-alcs7-hoffman', 30, date '2026-11-25'),
  ('std-2016-britton-tor', 31, date '2026-11-25'),
  ('std-2020-alwc1-colome', 32, date '2026-11-25'),
  ('std-2025-smith-det', 33, date '2026-11-25'),
  ('std-2024-alwc2-vest', 34, date '2026-11-25'),
  ('std-2015-melancon-chc', 35, date '2026-11-25'),
  ('std-2019-rogers-det', 36, date '2026-11-25'),
  ('std-2024-helsley-sf', 37, date '2026-11-25'),
  ('std-2025-alcs1-munoz', 38, date '2026-11-25'),
  ('std-2018-davis-wsh', 39, date '2026-11-25'),
  ('std-2020-nlwc2-kintzler', 40, date '2026-11-25'),
  ('std-2019-nlwc-hudson', 41, date '2026-11-25')
on conflict (id) do update set ord = excluded.ord, from_day = excluded.from_day;

-- 160's rule, over the situations the day has. Everything else is 160's, line for line
create or replace function public.shutdoor_vote_candidates(p_day date) returns text[]
language plpgsql security definer set search_path = public as $$
declare d date; k int; seen text[]; pick text[];
begin
  if p_day is null or p_day < shutdoor_vote_epoch() or p_day > shutdoor_today() + 1 then return null; end if;
  select coalesce(max(v.day) + 1, shutdoor_vote_epoch()) into d from shutdoor_vote_days v;
  while d <= p_day loop
    seen := '{}';
    for k in 1 .. 13 loop
      if d - k >= shutdoor_vote_epoch() then
        seen := seen || (select array[v.a, v.b] from shutdoor_vote_days v where v.day = d - k);
      else
        seen := seen || shutdoor_fixed_pack(d - k);
      end if;
    end loop;
    select array_agg(x.id order by x.h, x.ord) into pick from (
      select p.id, p.ord, shutdoor_hash('shut-the-door-vote-' || to_char(d, 'YYYY-MM-DD') || '-' || p.id) as h
        from shutdoor_packs p
       where not (p.id = any(seen)) and (p.from_day is null or p.from_day <= d)
       order by 3, 2 limit 2) x;
    insert into shutdoor_vote_days (day, a, b) values (d, pick[1], pick[2]) on conflict (day) do nothing;
    d := d + 1;
  end loop;
  return (select array[v.a, v.b] from shutdoor_vote_days v where v.day = p_day);
end $$;
revoke all on function public.shutdoor_vote_candidates(date) from public;

-- (situation, its closer's club as plate.js keys it)
insert into public.shutdoor_pack_clubs (id, club) values
  ('std-2025-alcs7-hoffman', 'bluejays'),
  ('std-2016-britton-tor', 'orioles'),
  ('std-2020-alwc1-colome', 'whitesox'),
  ('std-2025-smith-det', 'guardians'),
  ('std-2024-alwc2-vest', 'tigers'),
  ('std-2015-melancon-chc', 'pirates'),
  ('std-2019-rogers-det', 'twins'),
  ('std-2024-helsley-sf', 'cardinals'),
  ('std-2025-alcs1-munoz', 'mariners'),
  ('std-2018-davis-wsh', 'rockies'),
  ('std-2020-nlwc2-kintzler', 'marlins'),
  ('std-2019-nlwc-hudson', 'nationals')
on conflict (id) do update set club = excluded.club;

commit;
