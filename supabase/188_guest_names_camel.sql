-- Run The Games: one guest name style for the whole site, "SwiftShortstop48".
-- Run once in the Supabase SQL editor. Idempotent: safe to re-run.
-- Order: after 131_arcade_generated_names.sql and 185_arcade_guest_runs_server.sql.
--
-- WHY
-- The owner chose guest names like "Dragontail52" and "SillyShortstop46" for
-- Run The Pitch's Daily (2026-11-26): two words run together, two digits, no
-- spaces. The arcade's guest names match, so a guest looks the same everywhere.
--
-- WHAT
--   1. rtg_guest_name(uuid): the one generator. The same 32 adjectives and 32
--      nouns as 131 (the two nouns with a space are now Winger and Sweeper),
--      run together, then a number from 10 to 99. The same id always gets the
--      same name. Any game's guest board files a guest under it.
--   2. arcade_generated_name(uuid) now returns rtg_guest_name. 131's trigger,
--      185's guest submit and the two all-time boards all read it, so every new
--      unnamed row gets the new style with nothing else restated.
--   3. Rows already on the board under the old style are renamed. Only a row
--      whose display_name is exactly the 131 name for its own user_id changes.
--      An old style name has spaces and a username never does (username_ok), so
--      no real username can be caught. A second run finds nothing to rename.
--
-- KEEP IN STEP WITH arcade/board.js (ADJ, NOUN, generatedName). The lists and
-- the arithmetic must match, or the page cannot find its own row to mark
-- "(you)". scripts/check-arcade-names.mjs fails if they drift.

create or replace function public.rtg_guest_name(p uuid)
returns text
language sql
immutable
as $$
  select (array['Swift','Clutch','Steady','Bold','Quick','Sharp','Lucky','Calm',
                'Fearless','Fresh','Veteran','Golden','Iron','Silent','Rapid','Brave',
                'Crafty','Mighty','Nimble','Gritty','Slick','Sneaky','Smooth','Wild',
                'Cool','Hot','Prime','Super','Fast','Big','Little','Sly'])[(n % 32) + 1]
      ||
         (array['Shortstop','Closer','Slugger','Pitcher','Catcher','Rookie','Captain','Winger',
                'Center','Forward','Quarterback','Linebacker','Receiver','Kicker','Safety','Tackle',
                'Coach','Scout','Umpire','Ace','Sweeper','Leadoff','Anchor','Playmaker',
                'Rebounder','Shooter','Blocker','Runner','Batter','Fielder','Striker','Keeper'])[((n / 32) % 32) + 1]
      || ((n / 1024) % 90 + 10)::text
  from (select ('x' || substr(replace(p::text, '-', ''), 1, 7))::bit(28)::int as n) t;
$$;

grant execute on function public.rtg_guest_name(uuid) to anon, authenticated;

-- 131's old style, kept only to find the rows that still carry it.
create or replace function pg_temp.old_131_name(p uuid)
returns text
language sql
immutable
as $$
  select (array['Swift','Clutch','Steady','Bold','Quick','Sharp','Lucky','Calm',
                'Fearless','Fresh','Veteran','Golden','Iron','Silent','Rapid','Brave',
                'Crafty','Mighty','Nimble','Gritty','Slick','Sneaky','Smooth','Wild',
                'Cool','Hot','Prime','Super','Fast','Big','Little','Sly'])[(n % 32) + 1]
      || ' ' ||
         (array['Shortstop','Closer','Slugger','Pitcher','Catcher','Rookie','Captain','Point Guard',
                'Center','Forward','Quarterback','Linebacker','Receiver','Kicker','Safety','Tackle',
                'Coach','Scout','Umpire','Ace','Sixth Man','Leadoff','Anchor','Playmaker',
                'Rebounder','Shooter','Blocker','Runner','Batter','Fielder','Striker','Keeper'])[((n / 32) % 32) + 1]
      || ' ' || ((n / 1024) % 900 + 100)::text
  from (select ('x' || substr(replace(p::text, '-', ''), 1, 7))::bit(28)::int as n) t;
$$;

create or replace function public.arcade_generated_name(p uuid)
returns text
language sql
immutable
as $$
  select public.rtg_guest_name(p);
$$;

grant execute on function public.arcade_generated_name(uuid) to anon, authenticated;

update public.grid_runs
   set display_name = public.rtg_guest_name(user_id)
 where position(' ' in display_name) > 0
   and display_name = pg_temp.old_131_name(user_id);

notify pgrst, 'reload schema';
