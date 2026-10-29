-- Run The Diamond: the ballpark ladder.
--
-- 127 lists the thirteen parks an account could choose, as a check constraint on
-- rtd_profiles.park. The shelf is twenty seven now: a road from the sandlot to the
-- Show (Little League, high school, college, Single-A, Double-A, Triple-A), four
-- seasonal parks and three hidden ones. Without this file the page offers a park
-- the server refuses, so choosing one works on the device and never reaches the
-- account, and the next phone opens on the old park. Nothing on screen says so.
--
-- A check constraint cannot be widened in place, so it is dropped and made again
-- with the whole list. Every id 127 allowed is still allowed, so no stored choice
-- is refused. Safe to run twice.

alter table public.rtd_profiles drop constraint if exists rtd_profiles_park_ck;
alter table public.rtd_profiles add constraint rtd_profiles_park_ck check (park is null or park in (
  'sandlot','littleleague','varsity','campus','singlea','doublea','triplea','home',
  'cornfield','ivy','warehouse','fountains','ravine','milehigh','frieze','horseshoe',
  'opener','fireworks','haunted','winter',
  'bayside','monster',
  'moonlight','rainout','golden',
  'dome','neon'));
