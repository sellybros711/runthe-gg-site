-- ---------------------------------------------------------------------------
-- 161_shut_the_door_full_close.sql : Shut The Door's rules 8 (site PR #830).
--
-- Safe to run more than once. Needs 160 (shutdoor_packs, the vote tables).
-- Run it AFTER #830 merges, as soon as the site has redeployed. Before then the
-- page still serves the old list and agrees with 160.
--
-- WHAT IT DOES. Rules 8 (the owner's call, 2026-10-30): a daily is the closer's
-- real outing to the end of the game, and it asks for at least three outs. Two
-- of the thirty asked fewer, with no earlier moment of the outing that asked
-- more, so their places in the rotation went to two other real outings:
--   ord 18  std-2020-nlds2-kelly    ->  std-2008-alcs7-price
--   ord 29  std-2016-nlds5-kershaw  ->  std-2009-alcs6-rivera
-- The order is data/schedule.json's rotation (test/modes.mjs holds 160 with
-- these two renames to it). The vote's candidates are a hash over the whole
-- list, so every stored vote day drawn from the old list is cleared with its
-- votes: each day not begun yet, and any day naming an old id with every day
-- after it (a day's candidates depend on the 13 before it). The next read draws
-- them again from the new list, as modes.js does. There should be none: the
-- vote's first day is 2026-11-16, and a day's candidates are stored only from
-- the day before. So run it before 2026-11-15: after that a cleared day would
-- lose the votes cast for it.
--
-- AFTER IT: do not rerun 160 on its own. Its seed would put Kelly back at
-- ord 18, which Price now holds, and the unique ord stops it. Run 161 again
-- after any rerun of 160.
-- ---------------------------------------------------------------------------

begin;

delete from public.shutdoor_packs where id in ('std-2020-nlds2-kelly', 'std-2016-nlds5-kershaw');
insert into public.shutdoor_packs (id, ord) values
  ('std-2008-alcs7-price', 18),
  ('std-2009-alcs6-rivera', 29)
on conflict (id) do update set ord = excluded.ord;

-- the first vote day drawn from the old list: tomorrow, or the first naming an old id if earlier;
-- it and every later day go, with their votes
create temporary table shutdoor_161_from on commit drop as
  select least(public.shutdoor_today() + 1, (select min(day) from public.shutdoor_vote_days
   where a in ('std-2020-nlds2-kelly', 'std-2016-nlds5-kershaw')
      or b in ('std-2020-nlds2-kelly', 'std-2016-nlds5-kershaw')
      or winner in ('std-2020-nlds2-kelly', 'std-2016-nlds5-kershaw'))) as day;
delete from public.shutdoor_votes v using shutdoor_161_from f where v.day >= f.day;
delete from public.shutdoor_vote_days v using shutdoor_161_from f where v.day >= f.day;

commit;
