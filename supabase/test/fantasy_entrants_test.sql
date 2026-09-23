-- ---------------------------------------------------------------------------
-- fantasy_entrants_test.sql : 112, driven rather than read.
--
--   createdb fantasy
--   psql -d fantasy -f supabase/test/fantasy_base.sql
--   psql -d fantasy -f supabase/109_fantasy_challenge.sql
--   psql -d fantasy -f supabase/110_fantasy_live.sql
--   psql -d fantasy -f supabase/111_nfl_scores.sql
--   psql -d fantasy -f supabase/112_fantasy_entrants.sql
--   psql -d fantasy -f supabase/test/fantasy_entrants_test.sql
--
-- `check-fantasy.mjs` fabricates an `entrants` array and hands it to the painter, so it says
-- nothing about what the server actually sends. The one claim that matters is here, and it
-- is a claim about the PAYLOAD rather than about the screen: before the lock, what comes
-- back may not contain a lineup, a projection or a spend, however the page chooses to draw
-- it. A guard that only asked whether the page PRINTS a lineup would pass on an answer with
-- the whole answer key in the network tab.
--
-- SO THE KEY SET IS ASSERTED AS A SET, not as three absences. Written as "no picks key" it
-- goes quiet the day somebody adds a fourth field, which is exactly how a leak of this shape
-- would arrive.
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

\o /dev/null

insert into auth.users(id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-00000000000b'),
  ('cccccccc-0000-0000-0000-00000000000c')
on conflict do nothing;
insert into public.profiles(id, username) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Ada'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Bo'),
  ('cccccccc-0000-0000-0000-00000000000c', 'Cy')
on conflict (id) do update set username = excluded.username;

-- ENTERED THROUGH `fantasy_submit` AND NOT WRITTEN BY HAND, which is 110's own rule: a
-- fixture that inserted straight into `fantasy_entries` would be listing lineups the server
-- would never have accepted.
delete from public.fantasy_weeks where season = 2026 and week = 12;
insert into public.fantasy_weeks (season, week, locks_at, cap_musd, slots)
  values (2026, 12, now() + interval '2 hours', 90.00,
          array['QB','RB','RB','WR','WR','TE']::text[]);

insert into public.fantasy_prices (season, week, player_id, pos, price_musd, proj) values
  (2026,12,'qb1','QB',28.0,20.0), (2026,12,'qb2','QB',15.0,14.0),
  (2026,12,'rb1','RB',18.0,12.0), (2026,12,'rb2','RB',10.0,8.0),
  (2026,12,'rb3','RB',6.0,6.0),   (2026,12,'wr1','WR',15.0,11.0),
  (2026,12,'wr2','WR',9.0,7.0),   (2026,12,'wr3','WR',5.0,5.0),
  (2026,12,'te1','TE',8.0,7.0),   (2026,12,'te2','TE',4.0,4.0)
on conflict (season, week, player_id) do update
  set price_musd = excluded.price_musd, proj = excluded.proj;

do $$
begin
  perform public.become('aaaaaaaa-0000-0000-0000-00000000000a');
  perform public.fantasy_submit(2026, 12,
    array['qb1','rb1','rb2','wr1','wr2','te1']::text[]);
  perform public.become('bbbbbbbb-0000-0000-0000-00000000000b');
  perform public.fantasy_submit(2026, 12,
    array['qb2','rb1','rb3','wr2','wr3','te2']::text[]);
  perform public.become('cccccccc-0000-0000-0000-00000000000c');
  perform public.fantasy_submit(2026, 12,
    array['qb2','rb2','rb3','wr2','wr3','te2']::text[]);
  perform public.become(null);
end $$;

\o
\echo ''
\echo '---------- who is in, before the lock ----------'
do $$
declare v jsonb; n int;
begin
  v := public.fantasy_board(2026, 12, 50);
  perform public.claim('the board has no rows before the lock',
    jsonb_array_length(v->'rows') = 0);
  perform public.claim('  and the entrants are all three of them',
    jsonb_array_length(v->'entrants') = 3);
  /* IN ENTRY ORDER AND NUMBERED FROM ONE, which is the board's own key rather than
     `fantasy_entries.id`: a bigserial on a public list publishes how many entries this mode
     has taken in total, which is 110's argument for `entry_no` arriving at a second reader. */
  perform public.claim('  numbered 1, 2, 3 in the order they entered',
    (select array_agg((e->>'entry_no')::int order by ord)
       from jsonb_array_elements(v->'entrants') with ordinality as t(e, ord))
    = array[1,2,3]);
  perform public.claim('  and named',
    (select array_agg(e->>'display_name' order by (e->>'entry_no')::int)
       from jsonb_array_elements(v->'entrants') e) = array['Ada','Bo','Cy']);

  /* THE CLAIM THE WHOLE MIGRATION IS FOR. Three keys, asserted as a set, so a fourth one
     fails here rather than shipping. */
  perform public.claim('AN ENTRANT CARRIES THREE KEYS AND NONE OF THEM IS A LINEUP',
    (select bool_and(k = array['display_name','entry_no','is_me'])
       from (select array(select jsonb_object_keys(e) order by 1) as k
               from jsonb_array_elements(v->'entrants') e) z));
end $$;

\echo ''
\echo '---------- a signed out reader is nobody, and that is FALSE rather than null ----------'
do $$
declare v jsonb;
begin
  /* 109 FOUND THIS EXACT COMPARISON ON `fantasy_entries`: `user_id = auth.uid()` is NULL
     when the uid is, and a page reading it as falsy looks right while carrying a three
     valued answer to a two valued question. */
  perform public.become(null);
  v := public.fantasy_board(2026, 12, 50);
  perform public.claim('nobody is marked for a signed out reader',
    (select count(*) from jsonb_array_elements(v->'entrants') e
      where (e->>'is_me')::boolean) = 0);
  perform public.claim('  and not one of them is null',
    (select bool_and(jsonb_typeof(e->'is_me') = 'boolean')
       from jsonb_array_elements(v->'entrants') e));

  perform public.become('bbbbbbbb-0000-0000-0000-00000000000b');
  v := public.fantasy_board(2026, 12, 50);
  perform public.claim('exactly one entrant is the reader',
    (select count(*) from jsonb_array_elements(v->'entrants') e
      where (e->>'is_me')::boolean) = 1);
  perform public.claim('  and it is Bo',
    (select e->>'display_name' from jsonb_array_elements(v->'entrants') e
      where (e->>'is_me')::boolean) = 'Bo');
  perform public.become(null);
end $$;

\echo ''
\echo '---------- a stranger gets the list and cannot get the lineups ----------'
begin;
set local role anon;
do $$
declare n int; m int;
begin
  /* THE DEFINER IS WHAT MAKES THIS WORK, AND IT IS WHAT MAKES IT SAFE. `fantasy_entries` is
     RLS'd to its owner, so a signed out reader cannot select a single row of it; the list of
     names comes back because the function runs as the owner and hands over three columns.
     Both halves have to be asserted together, or the pair is one careless `security invoker`
     from being a list nobody can read, and one careless policy from being a table anybody
     can. A GRANT IS NOT WHAT IS ASKED HERE: Postgres gives PUBLIC execute on a new function
     by default, so an assertion that anon may CALL it can never fail and would be worth
     nothing. */
  /* CAUGHT, because the way this claim fails is a `security invoker` function, and that
     refuses rather than answering short: the raw "permission denied for table
     fantasy_entries" is a true report of a defect and is not a sentence, and a suite that
     goes red on machinery makes the next person read the wrong file first. */
  begin
    select count(*) into n from public.fantasy_entrants(2026, 12, 500);
  exception when insufficient_privilege then n := -1;
  end;
  perform public.claim('a signed out reader is told who has entered', n = 3);
  /* REFUSED OUTRIGHT RATHER THAN ANSWERING NOTHING, because `anon` holds no select grant on
     that table at all, and a grant is what RLS narrows rather than what it makes. Caught in
     a handler because the raise is the pass: `m` set to a count would be the weaker world
     where the grant exists and only a policy stands between a stranger and a lineup.
     THE FLAG IS READ AFTER THE BLOCK AND NOT INSIDE IT. 107's own finding: a `claim` that
     fails inside the arm it is watching raises an exception that arm then catches, and the
     check reports a pass on exactly the defect it is written for. */
  begin
    select count(*) into m from public.fantasy_entries where season = 2026 and week = 12;
  exception when insufficient_privilege then m := -1;
  end;
  perform public.claim('  and cannot read one lineup out of the table', m <= 0);
end $$;
rollback;

\echo ''
\echo '---------- the lock is the switch, and only one side answers ----------'
do $$
declare v jsonb; v_before jsonb; v_after jsonb;
begin
  v_before := public.fantasy_board(2026, 12, 50)->'entrants';

  update public.fantasy_weeks set locks_at = now() - interval '1 hour'
   where season = 2026 and week = 12;

  v := public.fantasy_board(2026, 12, 50);
  perform public.claim('once it locks the entrants list is empty',
    jsonb_array_length(v->'entrants') = 0);
  perform public.claim('  and the board has the three rows instead',
    jsonb_array_length(v->'rows') = 3);
  /* EXACTLY ONE OF THE TWO IS EVER POPULATED. Two lists of names would be two answers to
     one question, and they would disagree the first time either was edited. */
  perform public.claim('  so the two are never both answering',
    (jsonb_array_length(v->'rows') = 0) != (jsonb_array_length(v->'entrants') = 0));

  /* A ROW DOES NOT CHANGE KEY AT KICKOFF, which is what lets the board animate rather than
     rebuild: no entry can arrive after the lock, so the set is frozen from the first
     kickoff and the numbering either side of it has to be the same numbering. */
  v_after := v->'rows';
  perform public.claim('  and an entry keeps its number across the lock',
    (select array_agg((e->>'entry_no')::int order by (e->>'entry_no')::int)
       from jsonb_array_elements(v_before) e)
    = (select array_agg((e->>'entry_no')::int order by (e->>'entry_no')::int)
         from jsonb_array_elements(v_after) e));

  /* AND THE FUNCTION ITSELF REFUSES, not just the board that wraps it. */
  perform public.claim('  fantasy_entrants answers nothing after the lock',
    (select count(*) from public.fantasy_entrants(2026, 12, 500)) = 0);
end $$;

\echo ''
\echo '---------- a week nobody published ----------'
do $$
declare v jsonb;
begin
  v := public.fantasy_board(2026, 47, 50);
  perform public.claim('an unpublished week answers an empty entrants list',
    jsonb_typeof(v->'entrants') = 'array' and jsonb_array_length(v->'entrants') = 0);
  perform public.claim('  and no week',  jsonb_typeof(v->'week') = 'null');
end $$;

\echo ''
\echo 'ALL ENTRANTS CLAIMS PASSED'
