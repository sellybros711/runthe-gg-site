-- ---------------------------------------------------------------------------
-- fantasy_live_test.sql : 110, driven rather than read.
--
--   createdb fantasy
--   psql -d fantasy -f supabase/test/fantasy_base.sql
--   psql -d fantasy -f supabase/109_fantasy_challenge.sql
--   psql -d fantasy -f supabase/110_fantasy_live.sql
--   psql -d fantasy -f supabase/test/fantasy_live_test.sql
--
-- `check-fantasy.mjs` fabricates a board and hands it to the painter, so it says nothing
-- about what MOVES one. Everything that makes the board live is here: the two clocks, what
-- counts as a change, how many of a lineup have played, and whether a reader is still found
-- in their own row once the answer is wrapped in another function.
--
-- THE ONE THAT WOULD BE SILENT IS `results_at`. A writer that stamped it on every look
-- would leave a board reading "as of a moment ago" all afternoon while nothing moved, and
-- there is no screen anywhere that would look wrong. So it is asserted in both directions:
-- an unchanged write must NOT move it, and a changed one must.
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

-- THE WEEK IS OPENED, ENTERED, AND THEN THE LOCK IS MOVED INTO THE PAST, rather than
-- starting locked and inserting rows by hand. `fantasy_submit` refuses a locked week, which
-- is 109's whole point, so a fixture that wrote straight into `fantasy_entries` would be
-- testing a board built out of lineups the server would never have accepted.
delete from public.fantasy_weeks where season = 2026 and week = 9;
insert into public.fantasy_weeks (season, week, locks_at, cap_musd, slots)
  values (2026, 9, now() + interval '2 hours', 90.00,
          array['QB','RB','RB','WR','WR','TE']::text[]);

-- Priced so all three lineups are LEGAL against the $90M cap: Ada spends 88, Bo 75, Cy 49.
-- A fixture that squeaked over would be refused by `fantasy_submit` and report the live
-- board as broken, which is a whole round of reading the wrong file.
insert into public.fantasy_prices (season, week, player_id, pos, price_musd, proj) values
  (2026,9,'qb1','QB',28.0,20.0), (2026,9,'qb2','QB',15.0,14.0),
  (2026,9,'rb1','RB',18.0,12.0), (2026,9,'rb2','RB',10.0,8.0),
  (2026,9,'rb3','RB',6.0,6.0),   (2026,9,'wr1','WR',15.0,11.0),
  (2026,9,'wr2','WR',9.0,7.0),   (2026,9,'wr3','WR',5.0,5.0),
  (2026,9,'te1','TE',8.0,6.0),   (2026,9,'te2','TE',4.0,4.0)
on conflict (season, week, player_id) do update set proj = excluded.proj;

-- Three entries. Ada and Bo share five men and differ at one, so a single result row can
-- put either above the other: that is what makes the reorder below a real one rather than
-- two independent boards.
select public.become('aaaaaaaa-0000-0000-0000-00000000000a');
select public.fantasy_submit(2026, 9, array['qb1','rb1','rb2','wr1','wr2','te1']);
select public.become('bbbbbbbb-0000-0000-0000-00000000000b');
select public.fantasy_submit(2026, 9, array['qb2','rb1','rb2','wr1','wr2','te1']);
select public.become('cccccccc-0000-0000-0000-00000000000c');
select public.fantasy_submit(2026, 9, array['qb2','rb3','rb2','wr3','wr2','te2']);

-- Kickoff.
update public.fantasy_weeks set locks_at = now() - interval '1 minute'
 where season = 2026 and week = 9;

\o

\echo ''
\echo '---------- nothing has been played yet ----------'
do $$
declare v jsonb;
begin
  perform public.become('aaaaaaaa-0000-0000-0000-00000000000a');
  v := public.fantasy_board(2026, 9, 50);
  perform public.claim('a locked week with no results still answers a board',
    jsonb_array_length(v->'rows') = 3);
  /* EVERY SCORE IS ZERO AND THAT IS NOT THE SAME AS NO BOARD. A page that treated an
     all-zero board as "nothing yet" would show nothing for the whole first quarter of the
     Thursday game, which is exactly when somebody is most likely to be looking. */
  perform public.claim('  every score is zero',
    (select bool_and((r->>'score')::numeric = 0)
       from jsonb_array_elements(v->'rows') r));
  perform public.claim('  and every lineup has played nobody',
    (select bool_and((r->>'played')::int = 0)
       from jsonb_array_elements(v->'rows') r));
  perform public.claim('  the week is open', (v->'week'->>'open')::boolean);
  perform public.claim('  and it has never been checked', v->'week'->>'checked_at' is null);
  perform public.claim('  and never scored', v->'week'->>'scored_at' is null);
end $$;

\echo ''
\echo '---------- the first game lands ----------'
do $$
declare a jsonb; b jsonb; v jsonb;
begin
  /* qb1 plays and is good, qb2 plays and is not. That is the ONLY difference between Ada
     and Bo, so this is the whole of the reorder. */
  insert into public.fantasy_results (season, week, player_id, half_ppr) values
    (2026,9,'qb1',24.0), (2026,9,'qb2',6.0)
    on conflict (season, week, player_id) do update set half_ppr = excluded.half_ppr;
  select to_jsonb(m) into a from public.fantasy_mark_results(2026, 9, 1, 13, false) m;

  perform public.claim('the first write is a change', (a->>'changed')::boolean);
  perform public.claim('  and it counted the rows', (a->>'rows_in')::int = 2);

  perform public.become('aaaaaaaa-0000-0000-0000-00000000000a');
  v := public.fantasy_board(2026, 9, 50);
  perform public.claim('  the clocks are both set',
    v->'week'->>'checked_at' is not null and v->'week'->>'results_at' is not null);
  perform public.claim('  the week is not scored, because the schedule says 1 of 13',
    v->'week'->>'scored_at' is null
    and (v->'week'->>'games_final')::int = 1 and (v->'week'->>'games_total')::int = 13);
  perform public.claim('  Ada leads on her quarterback',
    (v->'rows'->0->>'display_name') = 'Ada'
    and (v->'rows'->0->>'score')::numeric = 24.0);
  perform public.claim('  and one of her six has played',
    (v->'rows'->0->>'played')::int = 1);
  /* THE KEY THE ANIMATION HANGS ON. Without it a board can only be keyed on place, and
     every row moves whenever anybody's score does. */
  perform public.claim('  every row carries a stable key',
    (select bool_and((r->>'entry_no') is not null)
       from jsonb_array_elements(v->'rows') r)
    and (select count(distinct r->>'entry_no') from jsonb_array_elements(v->'rows') r) = 3);
end $$;

\echo ''
\echo '---------- looking again, with nothing new ----------'
do $$
declare was timestamptz; chk timestamptz; a jsonb; now2 timestamptz;
begin
  select results_at, checked_at into was, chk
    from public.fantasy_weeks where season = 2026 and week = 9;
  perform pg_sleep(0.05);
  /* The writer upserts the SAME rows it sent last time, which is what it will really do
     every few minutes all afternoon. */
  insert into public.fantasy_results (season, week, player_id, half_ppr) values
    (2026,9,'qb1',24.0), (2026,9,'qb2',6.0)
    on conflict (season, week, player_id) do update set half_ppr = excluded.half_ppr;
  select to_jsonb(m) into a from public.fantasy_mark_results(2026, 9, 1, 13, false) m;

  perform public.claim('an unchanged write reports no change', not (a->>'changed')::boolean);
  select results_at into now2 from public.fantasy_weeks where season = 2026 and week = 9;
  /* THE ONE THAT WOULD BE SILENT. A board stamped "as of now" on every look is a frozen
     feed that reads as a live one, and no screen would show it. */
  perform public.claim('  and results_at did NOT move', now2 = was);
  perform public.claim('  while checked_at DID',
    (select checked_at from public.fantasy_weeks where season = 2026 and week = 9) > chk);
end $$;

\echo ''
\echo '---------- a correction moves somebody DOWN ----------'
do $$
declare was timestamptz; a jsonb; v jsonb;
begin
  select results_at into was from public.fantasy_weeks where season = 2026 and week = 9;
  perform pg_sleep(0.05);
  /* A REVISION IS A REAL EVENT AND THE BOARD MUST FOLLOW IT DOWN. nflverse corrects stats,
     so a score that only ever climbs would be a board that cannot be right. */
  update public.fantasy_results set half_ppr = 11.0
   where season = 2026 and week = 9 and player_id = 'qb1';
  select to_jsonb(m) into a from public.fantasy_mark_results(2026, 9, 2, 13, false) m;

  perform public.claim('a corrected stat is a change', (a->>'changed')::boolean);
  perform public.claim('  and results_at moved with it',
    (select results_at from public.fantasy_weeks where season = 2026 and week = 9) > was);

  perform public.become('bbbbbbbb-0000-0000-0000-00000000000b');
  v := public.fantasy_board(2026, 9, 50);
  perform public.claim('  Ada is still ahead, by less',
    (v->'rows'->0->>'display_name') = 'Ada'
    and (v->'rows'->0->>'score')::numeric = 11.0);
end $$;

\echo ''
\echo '---------- the lead actually changes hands ----------'
do $$
declare v jsonb; ada_id text; bo_id text;
begin
  perform public.become('aaaaaaaa-0000-0000-0000-00000000000a');
  v := public.fantasy_board(2026, 9, 50);
  select r->>'entry_no' into ada_id from jsonb_array_elements(v->'rows') r
   where r->>'display_name' = 'Ada';
  select r->>'entry_no' into bo_id from jsonb_array_elements(v->'rows') r
   where r->>'display_name' = 'Bo';

  /* qb1 is revised down under qb2, which is the only slot Ada and Bo differ at. */
  update public.fantasy_results set half_ppr = 2.0
   where season = 2026 and week = 9 and player_id = 'qb1';
  perform public.fantasy_mark_results(2026, 9, 3, 13, false);

  v := public.fantasy_board(2026, 9, 50);
  perform public.claim('the lead changes hands', (v->'rows'->0->>'display_name') = 'Bo');

  /* THE KEYS FOLLOW THE PEOPLE AND NOT THE PLACES, which is the property the page's
     animation is built on: the row that led is the SAME row, further down.

     LOOKED UP BY KEY RATHER THAN READ OFF A POSITION, which is what this assertion got
     wrong first. Ada falls to THIRD and not second: Bo and Cy hold the same quarterback,
     tie on 6.0, and the tiebreak puts the earlier entry above. Indexing `rows->1` was
     encoding a guess about a tie rather than the claim it meant, and the claim is about
     identity. */
  perform public.claim('  the key that led is still on the board, lower down',
    (select (r->>'place')::int from jsonb_array_elements(v->'rows') r
      where r->>'entry_no' = ada_id) > 1);
  perform public.claim('  and the key now leading is the one that was behind it',
    (v->'rows'->0->>'entry_no') = bo_id);
  /* NOBODY LEFT AND NOBODY ARRIVED, which is what lets the page animate a reorder rather
     than a rebuild. It cannot happen here: no entry can be made after the lock. */
  perform public.claim('  and it is the same three keys either side of the move',
    (select count(distinct r->>'entry_no') from jsonb_array_elements(v->'rows') r) = 3
    and jsonb_array_length(v->'rows') = 3);
end $$;

\echo ''
\echo '---------- the reader is found through the wrapper ----------'
do $$
declare v jsonb;
begin
  /* `auth.uid()` HAS TO SURVIVE ONE SECURITY DEFINER FUNCTION CALLING ANOTHER. If it did
     not, `is_me` would be false for everybody and `me` would be null, and the board would
     render perfectly while never once finding the person reading it. */
  perform public.become('cccccccc-0000-0000-0000-00000000000c');
  v := public.fantasy_board(2026, 9, 50);
  perform public.claim('exactly one row is the reader',
    (select count(*) from jsonb_array_elements(v->'rows') r
      where (r->>'is_me')::boolean) = 1);
  perform public.claim('  and it is Cy',
    (select r->>'display_name' from jsonb_array_elements(v->'rows') r
      where (r->>'is_me')::boolean) = 'Cy');
  /* `jsonb_typeof` AND NOT `is not null`, because `jsonb_build_object('me', NULL)` stores
     a jsonb null, so `v->'me' is not null` is TRUE for the empty answer and the assertion
     passes on exactly the case it is written to catch. Same trap as the three valued
     columns elsewhere in this repo, arriving inside a json document. */
  perform public.claim('  and their own place came back too',
    jsonb_typeof(v->'me') = 'object' and (v->'me'->>'entries')::int = 3);
  perform public.claim('  which agrees with the row they are in',
    (v->'me'->>'place')::int =
    (select (r->>'place')::int from jsonb_array_elements(v->'rows') r
      where (r->>'is_me')::boolean));

  perform public.become_nobody();
  v := public.fantasy_board(2026, 9, 50);
  perform public.claim('a signed out reader still sees the board',
    jsonb_array_length(v->'rows') = 3);
  perform public.claim('  and is nobody on it',
    (select bool_and(not (r->>'is_me')::boolean)
       from jsonb_array_elements(v->'rows') r));
  perform public.claim('  with no place of their own', jsonb_typeof(v->'me') = 'null');
end $$;

\echo ''
\echo '---------- the reader gets their own six, live ----------'
do $$
declare v jsonb;
begin
  perform public.become('aaaaaaaa-0000-0000-0000-00000000000a');
  v := public.fantasy_board(2026, 9, 50);
  perform public.claim('the reader gets six lines',
    jsonb_array_length(v->'me'->'lines') = 6);
  /* IN THE ORDER THEY WERE DRAFTED, which is the slot order the screen prints them in.
     `unnest ... with ordinality` is what keeps that; unnest alone has no defined order and
     the six would shuffle between polls, which on an animated screen reads as the lineup
     rearranging itself. */
  perform public.claim('  in the order they were drafted',
    (select string_agg(l->>'player_id', ',')
       from jsonb_array_elements(v->'me'->'lines') l) = 'qb1,rb1,rb2,wr1,wr2,te1');
  /* At this point only the two quarterbacks have rows. */
  perform public.claim('  one has played and five have not',
    (select count(*) from jsonb_array_elements(v->'me'->'lines') l
      where (l->>'played')::boolean) = 1);
  perform public.claim('  a man with no row is zero and says he did not play',
    (select bool_and((l->>'half_ppr')::numeric = 0)
       from jsonb_array_elements(v->'me'->'lines') l
      where not (l->>'played')::boolean));
  /* THE LINES HAVE TO ADD UP TO THE BOARD, or the screen shows a total the six under it
     do not make. They are computed in two different places, so this is the one claim that
     catches them coming apart. */
  perform public.claim('  and the six add up to the score on the board',
    (select sum((l->>'half_ppr')::numeric) from jsonb_array_elements(v->'me'->'lines') l)
    = (select (r->>'score')::numeric from jsonb_array_elements(v->'rows') r
        where (r->>'is_me')::boolean));

  perform public.become_nobody();
  v := public.fantasy_board(2026, 9, 50);
  perform public.claim('  and a signed out reader gets none', jsonb_typeof(v->'me') = 'null');
end $$;

\echo ''
\echo '---------- three tables that a policy alone never opened ----------'
do $$
declare n int;
begin
  /* 109 gives all three a `for select using (true)` policy and no grant, so anon was
     refused by the GRANT before the policy was ever consulted. Asserted as a real read as
     the real role, because the thing that was wrong was invisible in the policy. */
  set local role anon;
  select count(*) into n from public.fantasy_weeks;   perform public.claim('anon can read fantasy_weeks', n >= 1);
  select count(*) into n from public.fantasy_prices;  perform public.claim('  and fantasy_prices', n >= 1);
  select count(*) into n from public.fantasy_results; perform public.claim('  and fantasy_results', n >= 1);
  reset role;
end $$;

do $$
declare n int; denied boolean := false;
begin
  /* AND THE ONE THAT MUST STAY SHUT. The board is the sanctioned way to see somebody
     else's lineup and it does not open until the lock. */
  begin
    set local role anon;
    select count(*) into n from public.fantasy_entries;
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  perform public.claim('but anon still cannot read the entries table', denied);
end $$;

\echo ''
\echo '---------- the week finishes, and stays finished ----------'
do $$
declare v jsonb; first_scored timestamptz;
begin
  insert into public.fantasy_results (season, week, player_id, half_ppr) values
    (2026,9,'rb1',14.0), (2026,9,'rb2',9.0), (2026,9,'rb3',3.0),
    (2026,9,'wr1',16.0), (2026,9,'wr2',7.0), (2026,9,'wr3',4.0),
    (2026,9,'te1',5.0),  (2026,9,'te2',2.0)
    on conflict (season, week, player_id) do update set half_ppr = excluded.half_ppr;
  perform public.fantasy_mark_results(2026, 9, 13, 13, true);

  perform public.become('aaaaaaaa-0000-0000-0000-00000000000a');
  v := public.fantasy_board(2026, 9, 50);
  perform public.claim('a final write marks the week scored',
    v->'week'->>'scored_at' is not null);
  perform public.claim('  and all six of every lineup have played',
    (select bool_and((r->>'played')::int = 6)
       from jsonb_array_elements(v->'rows') r));
  select scored_at into first_scored
    from public.fantasy_weeks where season = 2026 and week = 9;

  /* A STAT CORRECTION AFTER THE WEEK IS SETTLED MUST NOT UN-SETTLE IT. Written as a plain
     `case when p_final then now() else null end`, the Tuesday correction that re-scores
     everybody would put every screen back to "still being played". */
  perform pg_sleep(0.05);
  update public.fantasy_results set half_ppr = 15.0
   where season = 2026 and week = 9 and player_id = 'rb1';
  perform public.fantasy_mark_results(2026, 9, 13, 13, false);

  v := public.fantasy_board(2026, 9, 50);
  perform public.claim('  a later partial write does not un-score it',
    v->'week'->>'scored_at' is not null
    and (v->'week'->>'scored_at')::timestamptz = first_scored);
  perform public.claim('  but the board followed the correction',
    (select (r->>'score')::numeric from jsonb_array_elements(v->'rows') r
      where r->>'display_name' = 'Ada') = 2.0 + 15.0 + 9.0 + 16.0 + 7.0 + 5.0);
end $$;

\echo ''
\echo '---------- a week nobody has published ----------'
do $$
declare v jsonb;
begin
  /* NO WEEK IS NOT AN EMPTY WEEK. The page draws a different sentence for each, and an
     object full of nulls would read as a week that exists and has not started. */
  v := public.fantasy_board(2026, 44, 50);
  perform public.claim('an unpublished week answers a null week',
    jsonb_typeof(v->'week') = 'null');
  perform public.claim('  with no rows', jsonb_array_length(v->'rows') = 0);
end $$;

\echo ''
\echo '---------- a week that has not locked shows nobody ----------'
do $$
declare v jsonb;
begin
  insert into public.fantasy_weeks (season, week, locks_at, cap_musd, slots)
    values (2026, 45, now() + interval '2 days', 90.00,
            array['QB','RB','RB','WR','WR','TE']::text[])
    on conflict (season, week) do update set locks_at = excluded.locks_at;
  v := public.fantasy_board(2026, 45, 50);
  perform public.claim('an open week answers a week and no rows',
    jsonb_typeof(v->'week') = 'object' and (v->'week'->>'open')::boolean is false
    and jsonb_array_length(v->'rows') = 0);
end $$;

\echo ''
\echo 'ALL LIVE BOARD CLAIMS PASSED'
