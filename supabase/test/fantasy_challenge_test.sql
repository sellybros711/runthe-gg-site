-- ---------------------------------------------------------------------------
-- fantasy_challenge_test.sql : 109, driven rather than read.
--
--   createdb fantasy
--   psql -d fantasy -f supabase/test/fantasy_base.sql
--   psql -d fantasy -f supabase/109_fantasy_challenge.sql
--   psql -d fantasy -f supabase/test/fantasy_challenge_test.sql
--
-- `check-fantasy.mjs` drives the page and knows nothing about what the server accepts, so
-- everything that makes this a competition rather than a feel test is here: the lock, the
-- cap, the shape, one entry an account, and who may read whose lineup.
--
-- EVERY REFUSAL IS ASSERTED BY ITS MESSAGE, not just by the fact that something raised. Six
-- of the seven guards in `fantasy_submit` refuse the same call for different reasons, and a
-- test that only asked "did it raise" would pass with five of them deleted, because the
-- sixth would still catch the call.
--
-- AND AN EXCEPTION TEST CANNOT ASSERT INSIDE THE BLOCK IT IS WATCHING. Written as a
-- `claim(false)` in the `begin` arm, the failure claim() raises is caught by that block's
-- own handler and reported as a pass. `board_pro_live_test.sql` learnt this the hard way, so
-- `refuses()` below captures SQLERRM in the handler and every assertion reads it afterwards.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\pset pager off

create or replace function public.claim(p_label text, p_ok boolean)
returns void language plpgsql as $$
begin
  if p_ok then raise notice 'ok    %', p_label;
  else raise exception 'FAILED: %', p_label;
  end if;
end $$;

/* Runs a submit and answers with the message it refused with, or null if it went through.
   The assertion is always made on the RETURN VALUE, outside the handler. */
create or replace function public.refuses(p_season int, p_week int, p_picks text[])
returns text language plpgsql as $$
begin
  perform public.fantasy_submit(p_season, p_week, p_picks);
  return null;
exception when others then return sqlerrm;
end $$;

\o /dev/null

insert into auth.users(id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-00000000000b'),
  ('cccccccc-0000-0000-0000-00000000000c')
on conflict do nothing;
insert into public.profiles(id, display_name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Ada'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Bo'),
  ('cccccccc-0000-0000-0000-00000000000c', 'Cy')
on conflict (id) do update set display_name = excluded.display_name;

-- ---------- a week with no row refuses, and that is the point ---------------
--
-- FAILS CLOSED, which is the reversal 109's header argues at length. Every other allowance
-- on this site waves somebody through when it cannot answer. This one must not, so the
-- FIRST thing asserted is that an unpublished week takes no entries.

select public.become('aaaaaaaa-0000-0000-0000-00000000000a');
do $$
declare v_said text;
begin
  v_said := public.refuses(2026, 3, array['q1','r1','r2','w1','w2','t1']);
  perform public.claim('a week that was never published takes no entries',
    v_said like '%not open for entries%');
end $$;

-- ---------- the week, and a board to draft off ------------------------------
--
-- Priced the way the publisher will: the week carries its own cap and slots, so nothing
-- below is checked against a constant written in the migration.

insert into public.fantasy_weeks(season, week, locks_at, cap_musd, slots)
  values (2026, 3, now() + interval '2 days', 90, array['QB','RB','RB','WR','WR','TE']);

insert into public.fantasy_prices(season, week, player_id, pos, price_musd, proj) values
  (2026,3,'q1','QB',48,22), (2026,3,'q2','QB',10,14),
  (2026,3,'r1','RB',30,16), (2026,3,'r2','RB',12,11), (2026,3,'r3','RB',3,4),
  (2026,3,'w1','WR',25,15), (2026,3,'w2','WR',9,10), (2026,3,'w3','WR',3,5),
  (2026,3,'t1','TE',8,8),   (2026,3,'t2','TE',3,4);

-- ---------- what a legal lineup costs is the SERVER'S answer -----------------
--
-- The client sends six ids and nothing else, so the row that lands has to carry the
-- server's own sum. q2+r2+r3+w2+w3+t2 is 40 against a cap of 90, and 48 projected.

do $$
declare e public.fantasy_entries%rowtype;
begin
  perform public.fantasy_submit(2026, 3, array['q2','r2','r3','w2','w3','t2']);
  select * into e from public.fantasy_entries
   where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  perform public.claim('a legal lineup is accepted', found);
  perform public.claim('  and the spend is the board''s, not the client''s', e.spend = 40);
  perform public.claim('  and so is the projection', e.projected = 48);
  perform public.claim('  and the name is read off the profile', e.display_name = 'Ada');
end $$;

-- ---------- one an account, and it is final ---------------------------------
--
-- A LEGAL SECOND LINEUP, and that matters. The count is the LAST thing `fantasy_submit`
-- checks, so an over-cap second entry is refused by the cap and says so: written that way
-- the first draft of this claim passed with the unique index dropped.

do $$
declare v_said text;
begin
  v_said := public.refuses(2026, 3, array['q2','r2','r3','w2','w3','t1']);
  perform public.claim('a second entry is refused', v_said like '%already entered%');
  perform public.claim('  and the first one is untouched',
    (select spend = 40 from public.fantasy_entries
      where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a'));
end $$;

-- ---------- every way a lineup can be wrong, told apart ----------------------
--
-- All six of these are the same call to the same function and each has to come back with
-- its OWN sentence, or a guard could be deleted and the next one along would cover for it.

select public.become('bbbbbbbb-0000-0000-0000-00000000000b');
do $$
declare v_said text;
begin
  /* Over the cap: 48+30+12+25+9+8 is 132 against 90. */
  v_said := public.refuses(2026, 3, array['q1','r1','r2','w1','w2','t1']);
  perform public.claim('over the cap is refused', v_said like '%over the cap%');

  /* THE CAP IS THE WEEK'S. Raised, the identical lineup goes through, which is what proves
     the function read the row rather than a number written in the migration. */
  update public.fantasy_weeks set cap_musd = 200 where season = 2026 and week = 3;
  v_said := public.refuses(2026, 3, array['q1','r1','r2','w1','w2','t1']);
  perform public.claim('  and the cap it is checked against is the WEEK''s', v_said is null);
  delete from public.fantasy_entries where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
  update public.fantasy_weeks set cap_musd = 90 where season = 2026 and week = 3;

  /* Two quarterbacks and no tight end. */
  v_said := public.refuses(2026, 3, array['q1','q2','r1','r2','w1','w2']);
  perform public.claim('the wrong shape is refused', v_said like '%wrong shape%');
  perform public.claim('  and it names the positions that are wrong',
    v_said like '%QB%' and v_said like '%TE%');

  /* The same man twice. It is also the wrong shape, so the ORDER of the two guards is what
     is being asserted here: a lineup naming one player twice should say so. */
  v_said := public.refuses(2026, 3, array['q2','r2','r2','w2','w3','t2']);
  perform public.claim('the same player twice is refused as a duplicate',
    v_said like '%same player twice%');

  /* Five. */
  v_said := public.refuses(2026, 3, array['q2','r2','r3','w2','w3']);
  perform public.claim('five players is refused', v_said like '%is 6 players%');

  /* A man who is not on this week's board: idle club, or an id somebody typed. */
  v_said := public.refuses(2026, 3, array['q2','r2','r3','w2','w3','nobody']);
  perform public.claim('a man who is not on the board is refused',
    v_said like '%not on this week''s board%');

  /* Nobody at all. */
  perform public.become_nobody();
  v_said := public.refuses(2026, 3, array['q2','r2','r3','w2','w3','t2']);
  perform public.claim('a signed out visitor is refused', v_said like '%sign in%');
end $$;

-- ---------- the lock is the server's ----------------------------------------
--
-- The page has a clock and it is a hint. This is the one that decides, because a lineup
-- entered after the Thursday kickoff is a lineup entered knowing how one of its men did.

select public.become('bbbbbbbb-0000-0000-0000-00000000000b');
do $$
declare v_said text;
begin
  update public.fantasy_weeks set locks_at = now() - interval '1 minute'
   where season = 2026 and week = 3;
  v_said := public.refuses(2026, 3, array['q1','r2','r3','w2','w3','t1']);
  perform public.claim('a lineup after the lock is refused', v_said like '%closed%');
  update public.fantasy_weeks set locks_at = now() + interval '2 days'
   where season = 2026 and week = 3;
  v_said := public.refuses(2026, 3, array['q1','r2','r3','w2','w3','t1']);
  perform public.claim('  and before it, the same lineup is not', v_said is null);
end $$;

-- ---------- the board opens AT the lock -------------------------------------
--
-- Not privacy: every entrant meets their own wheel, so a board of everybody's lineups and
-- projections before kickoff is the answer key handed to whoever enters last.

select public.become('cccccccc-0000-0000-0000-00000000000c');
do $$
begin
  perform public.claim('before the lock the board is empty',
    (select count(*) = 0 from public.fantasy_standings(2026, 3)));
  perform public.claim('  but the entry count is not',
    public.fantasy_entry_count(2026, 3) = 2);
  perform public.claim('  and nobody has a place yet',
    (select count(*) = 0 from public.fantasy_my_place(2026, 3)));
end $$;

-- ---------- the score is the join, and it is scoped to the week ---------------
--
-- Ada has q2 r2 r3 w2 w3 t2 and Bo has q1 r2 r3 w2 w3 t1, so they differ by two men, and t1
-- and t2 are deliberately given no result: an id with no row scored nothing, which is the
-- honest reading of inactive, hurt, benched or cut.
--
-- THE FIRST VERSION OF THIS SECTION ASSERTED THAT A LEFT JOIN WAS LOAD BEARING AND IT IS
-- NOT. Swapped for an inner join the totals come back byte identical, because a missing row
-- contributes null to a `sum` and null adds the same as nothing, and the `coalesce` outside
-- already answers the all-absent case. The claim passed with the defect it named
-- reintroduced, which is the vacuous-assertion trap this repo keeps meeting. What is real
-- here is the ARITHMETIC and the join KEY: a join that forgets the week pulls another
-- week's points into this one, and the totals below are what catch that.

insert into public.fantasy_prices(season, week, player_id, pos, price_musd, proj)
  values (2026,3,'q3','QB',5,6) on conflict do nothing;

update public.fantasy_weeks set locks_at = now() - interval '1 hour', scored_at = now()
 where season = 2026 and week = 3;

insert into public.fantasy_results(season, week, player_id, half_ppr) values
  (2026,3,'q1',30), (2026,3,'r1',12), (2026,3,'r2',8), (2026,3,'w1',20), (2026,3,'w2',6),
  (2026,3,'q2',15), (2026,3,'r3',4),  (2026,3,'w3',9);
  /* t1 and t2 are deliberately absent. */

do $$
declare v_ada numeric; v_bo numeric;
begin
  select score into v_ada from public.fantasy_standings(2026,3) where display_name = 'Ada';
  select score into v_bo  from public.fantasy_standings(2026,3) where display_name = 'Bo';
  /* Ada: q2 15 + r2 8 + r3 4 + w2 6 + w3 9 + (t2 absent) 0 = 42. */
  perform public.claim('the score is the sum over the entry''s own six', v_ada = 42);
  /* Bo: q1 30 + r2 8 + r3 4 + w2 6 + w3 9 + (t1 absent) 0 = 57. */
  perform public.claim('  and the other lineup adds up too', v_bo = 57);
  perform public.claim('  so the board is sorted by what they scored',
    (select display_name from public.fantasy_standings(2026,3) limit 1) = 'Bo');
  perform public.claim('  and it is open now that the week has locked',
    (select count(*) = 2 from public.fantasy_standings(2026,3)));
  /* A man who did not play is still ON the lineup, and the total cannot say so, because
     zero and absent add the same. So the six are counted rather than summed. */
  perform public.claim('  and a man who did not play is still one of the six',
    (select bool_and(array_length(picks,1) = 6) from public.fantasy_standings(2026,3)));
end $$;

/* THE JOIN IS SCOPED TO THE WEEK, and the totals above are what prove it. Week 2 gets the
   same ids with wild numbers on them, so a join matching on the player alone would put a
   hundred points a man onto week 3's board. */
insert into public.fantasy_weeks(season, week, locks_at, cap_musd, slots)
  values (2026, 2, now() - interval '9 days', 90, array['QB','RB','RB','WR','WR','TE']);
insert into public.fantasy_results(season, week, player_id, half_ppr)
  select 2026, 2, player_id, 100 from public.fantasy_results where season = 2026 and week = 3;

do $$
begin
  perform public.claim('another week''s results do not reach this one',
    (select score = 42 from public.fantasy_standings(2026,3) where display_name = 'Ada'));
end $$;

-- ---------- a correction moves the board with nothing to re-run --------------
--
-- The whole reason the score is derived. Stored, this would need a settle job and every row
-- it forgot would be wrong for ever.

do $$
begin
  update public.fantasy_results set half_ppr = 0 where season = 2026 and week = 3
    and player_id = 'q1';
  perform public.claim('a corrected stat re-scores the board on the next read',
    (select display_name from public.fantasy_standings(2026,3) limit 1) = 'Ada');
  update public.fantasy_results set half_ppr = 30 where season = 2026 and week = 3
    and player_id = 'q1';
end $$;

-- ---------- your place is counted against everybody --------------------------
--
-- `fantasy_my_place` writes the ordering out a SECOND TIME by hand, which is the thing here
-- most likely to rot, and it has to: a page working out "you are 51st" by failing to find
-- itself in the top fifty would tell the two hundredth entrant the same thing as the fifty
-- first. `commish_my_tenure` carries the same argument and the same walk.

do $$
declare u record; v_place int; v_board int; v_n int;
begin
  for u in select id, display_name from public.profiles loop
    perform public.become(u.id);
    select place into v_place from public.fantasy_my_place(2026,3);
    select place into v_board from public.fantasy_standings(2026,3,200)
     where display_name = u.display_name;
    perform public.claim('  the two orderings agree for ' || u.display_name,
      v_place is not distinct from v_board);
  end loop;
  perform public.become('aaaaaaaa-0000-0000-0000-00000000000a');
  select entries into v_n from public.fantasy_my_place(2026,3);
  perform public.claim('  and the denominator is everybody, not the page''s fifty',
    v_n = 2);
end $$;

-- ---------- is_me is the reader's own row, and only theirs -------------------

do $$
begin
  perform public.become('aaaaaaaa-0000-0000-0000-00000000000a');
  perform public.claim('the board marks the reader''s own row',
    (select is_me from public.fantasy_standings(2026,3) where display_name = 'Ada'));
  perform public.claim('  and nobody else''s',
    (select not is_me from public.fantasy_standings(2026,3) where display_name = 'Bo'));
  perform public.become_nobody();
  perform public.claim('  and a signed out reader owns none of them',
    (select bool_and(not is_me) from public.fantasy_standings(2026,3)));
end $$;

-- ---------- a lineup is nobody else's business until the lock ----------------
--
-- The policy is read-your-own. The board is a security definer function precisely because
-- the table cannot be, so the table itself has to stay shut.

do $$
begin
  perform public.become('aaaaaaaa-0000-0000-0000-00000000000a');
  perform set_config('role', 'authenticated', true);
  perform public.claim('an account reads its own entry row',
    (select count(*) = 1 from public.fantasy_entries));
  perform set_config('role', 'none', true);
  reset role;
  perform public.become('cccccccc-0000-0000-0000-00000000000c');
  perform set_config('role', 'authenticated', true);
  perform public.claim('  and sees nobody else''s, having entered nothing',
    (select count(*) = 0 from public.fantasy_entries));
  reset role;
end $$;

-- ---------- the name on a finished board does not move -----------------------
--
-- Copied at submit time rather than joined live, because a board of a finished week is a
-- record of who entered it. Every other board on this site reads the name live, and is
-- ranking a run rather than settling a competition.

do $$
begin
  update public.profiles set display_name = 'Ada Renamed'
   where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  perform public.claim('a rename does not rewrite a week already entered',
    (select count(*) = 1 from public.fantasy_standings(2026,3) where display_name = 'Ada'));
end $$;

-- ---------- my own entry, before anybody else can see it ---------------------

do $$
declare r record;
begin
  perform public.become('aaaaaaaa-0000-0000-0000-00000000000a');
  select * into r from public.fantasy_my_entry(2026, 3);
  perform public.claim('an account can always read its own entry', found);
  perform public.claim('  with the score the board gives it', r.score = 42);
  perform public.claim('  and the week says it has been scored', r.scored);
  perform public.become('cccccccc-0000-0000-0000-00000000000c');
  perform public.claim('  and somebody who did not enter gets nothing',
    (select count(*) = 0 from public.fantasy_my_entry(2026, 3)));
end $$;

\o
\echo 'fantasy_challenge_test: every claim passed'
