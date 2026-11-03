-- ---------------------------------------------------------------------------
-- 163_shut_the_door_vote_nov5.sql : the vote starts on 2026-11-05.
--
-- The owner's call (2026-11-03): start the vote sooner. The first day picked by
-- a vote moves from 2026-11-16 (160) to 2026-11-05, so the first votes are cast
-- after the 2026-11-04 daily. The same date is modes.js VOTE.EPOCH.
--
-- Safe to run more than once. Needs 160 and 161. Run it AFTER the site PR
-- merges and redeploys, and before midnight Eastern tonight (the vote for
-- 2026-11-05 is open all of 2026-11-04).
--
-- A day's candidates read the 13 days before it, so every vote day not begun
-- yet is cleared with its votes and drawn again from the new first day. On the
-- live database there are none: under 160 the first row would come on
-- 2026-11-15. After any rerun of 160 or 161, run 163 again.
--
-- It also fixes the day before the vote for the preview days (below).
-- ---------------------------------------------------------------------------

begin;

create or replace function public.shutdoor_vote_epoch() returns date
language sql immutable as $$ select date '2026-11-05' $$;

-- the days before daily #1 (2026-10-26) were the previews, served from the
-- schedule's previewRotation: the rotation's first ten (ord 0 to 9). The first
-- vote days read back into them (2026-11-05 reads to 2026-10-23), so the server
-- walks the same ten that modes.js fixedPack does. 160 walked all thirty, which
-- no vote day could reach while the vote began on 2026-11-16.
create or replace function public.shutdoor_fixed_pack(p_day date) returns text
language sql stable security definer set search_path = public as $$
  select p.id from shutdoor_packs p
   where p.ord = case when p_day < date '2026-10-26'
                      then (((p_day - date '2026-10-26') % 10) + 10) % 10
                      else (((p_day - date '2026-10-26') % 30) + 30) % 30 end
$$;
revoke all on function public.shutdoor_fixed_pack(date) from public;

delete from public.shutdoor_votes where day > public.shutdoor_today();
delete from public.shutdoor_vote_days where day > public.shutdoor_today();

commit;
