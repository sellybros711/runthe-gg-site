-- ---------------------------------------------------------------------------
-- nfl_scores_test.sql : 111, driven rather than read.
--
--   createdb nfl_scores
--   psql -d nfl_scores -f supabase/test/fantasy_base.sql
--   psql -d nfl_scores -f supabase/109_fantasy_challenge.sql
--   psql -d nfl_scores -f supabase/110_fantasy_live.sql
--   psql -d nfl_scores -f supabase/111_nfl_scores.sql
--   psql -d nfl_scores -f supabase/test/nfl_scores_test.sql
--
-- `check-fantasy.mjs` fabricates a scoreboard and hands it to the painter, so it says
-- nothing about what WRITES one. Everything about the write is here.
--
-- THE ONE THAT WOULD BE SILENT IS THE DOWNGRADE. Every ten minutes a tick arrives that knows
-- less than the row already does, because the fallback source can only ever say "kickoff is
-- at 8:15" about a game in its fourth quarter. Take it and the board flips a live game back
-- to pre-game, twice an hour, all afternoon, and then forward again when the feed returns.
-- Nothing throws, every row is a valid row, and the only symptom is a scoreboard that
-- flickers. So it is asserted from both ends: a lesser state must not be taken, and a
-- greater one must.
--
-- EVERY WRITE IS ITS OWN `do` BLOCK, AND THAT IS A FIX RATHER THAN A STYLE
-- ---------------------------------------------------------------------------
-- It was one block first, and the claim that an unchanged write leaves `updated_at` alone
-- PASSED WITH THE DEFECT IN. `now()` is the TRANSACTION's clock, a `do` block is one
-- transaction, so every timestamp taken inside one is the same timestamp: a writer stamping
-- `now()` on every single look, which is the whole thing that clause exists to prevent, is
-- indistinguishable from one that stamps it only on a change. The assertion could not fail.
--
-- So each write is its own statement, which is also what they are in life: the cron runs
-- once every ten minutes. A timestamp is then read back across a real transaction boundary
-- and the claim can fail. That is the same class as this repo's three wrong extractors,
-- arriving at a test fixture: a check that cannot see the thing it is about is green for
-- ever, and the only way to know is to break the thing and watch.
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

delete from public.nfl_games where season = 2026 and week in (9, 10);
delete from public.fantasy_weeks where season = 2026 and week = 9;
insert into public.fantasy_weeks (season, week, locks_at, cap_musd, slots)
  values (2026, 9, now() - interval '2 hours', 90.00,
          array['QB','RB','RB','WR','WR','TE']::text[]);

\o

do $$
declare
  v_moved int;
  v_at1 timestamptz; v_at2 timestamptz;
  v_row public.nfl_games;
  v_games jsonb;
  v_ok boolean;
begin
  -- ── 1. the grants ──────────────────────────────────────────────────────────
  --
  -- RLS NARROWS A GRANT, IT DOES NOT MAKE ONE, which is 110's own finding on three tables
  -- whose read-all policies were granting nothing at all.
  perform public.claim('anon may read the scoreboard',
    has_table_privilege('anon', 'public.nfl_games', 'select'));
  perform public.claim('authenticated may read the scoreboard',
    has_table_privilege('authenticated', 'public.nfl_games', 'select'));

  -- AND NOBODY A BROWSER CAN BE MAY WRITE ONE. The whole table is public to read and is
  -- written by a workflow holding the database url, the same split every writer in 109 is
  -- built on.
  perform public.claim('anon may not write a score',
    not has_table_privilege('anon', 'public.nfl_games', 'insert'));
  perform public.claim('authenticated may not write a score',
    not has_table_privilege('authenticated', 'public.nfl_games', 'update'));
  perform public.claim('anon may not call the writer',
    not has_function_privilege('anon', 'public.nfl_put_games(int,int,jsonb)', 'execute'));

end $$;

do $$
declare
  v_moved int;
  v_at1 timestamptz; v_at2 timestamptz;
  v_row public.nfl_games;
  v_games jsonb;
  v_ok boolean;
begin
  -- ── 2. a fresh slate ───────────────────────────────────────────────────────
  select public.nfl_put_games(2026, 9, jsonb_build_array(
    jsonb_build_object('game_id','2026_09_ATL_GB','away','ATL','home','GB',
      'kick','2026-11-06T01:15:00Z','state','pre','source','schedule'),
    jsonb_build_object('game_id','2026_09_LAC_BUF','away','LAC','home','BUF',
      'kick','2026-11-08T18:00:00Z','state','pre','source','schedule'),
    jsonb_build_object('game_id','2026_09_NYJ_DET','away','NYJ','home','DET',
      'kick','2026-11-08T18:00:00Z','state','pre','source','schedule')
  )) into v_moved;
  perform public.claim('a fresh slate is three rows written', v_moved = 3);
  perform public.claim('and three rows are there',
    (select count(*) from public.nfl_games where season = 2026 and week = 9) = 3);

end $$;

do $$
declare
  v_moved int;
  v_at1 timestamptz; v_at2 timestamptz;
  v_row public.nfl_games;
  v_games jsonb;
  v_ok boolean;
begin
  -- ── 3. the same answer again is not a change ───────────────────────────────
  --
  -- The writer runs every ten minutes whether or not anything happened, so a timestamp
  -- stamped on every look would say the board changed every time somebody looked at it.
  select updated_at into v_at1 from public.nfl_games
   where season = 2026 and week = 9 and game_id = '2026_09_ATL_GB';
  select public.nfl_put_games(2026, 9, jsonb_build_array(
    jsonb_build_object('game_id','2026_09_ATL_GB','away','ATL','home','GB',
      'kick','2026-11-06T01:15:00Z','state','pre','source','schedule')
  )) into v_moved;
  select updated_at into v_at2 from public.nfl_games
   where season = 2026 and week = 9 and game_id = '2026_09_ATL_GB';
  perform public.claim('the same answer again moves nothing', v_moved = 0);
  perform public.claim('and does not touch the clock', v_at1 = v_at2);

end $$;

do $$
declare
  v_moved int;
  v_at1 timestamptz; v_at2 timestamptz;
  v_row public.nfl_games;
  v_games jsonb;
  v_ok boolean;
begin
  -- ── 4. a game kicks off ────────────────────────────────────────────────────
  select public.nfl_put_games(2026, 9, jsonb_build_array(
    jsonb_build_object('game_id','2026_09_ATL_GB','away','ATL','home','GB',
      'kick','2026-11-06T01:15:00Z','state','in','away_score',7,'home_score',10,
      'period',2,'clock','3:21','source','espn')
  )) into v_moved;
  select * into v_row from public.nfl_games
   where season = 2026 and week = 9 and game_id = '2026_09_ATL_GB';
  perform public.claim('a game going live is one row moved', v_moved = 1);
  perform public.claim('the state is in', v_row.state = 'in');
  perform public.claim('the score is there', v_row.away_score = 7 and v_row.home_score = 10);
  perform public.claim('the clock is there', v_row.period = 2 and v_row.clock = '3:21');
  perform public.claim('and the source is recorded', v_row.source = 'espn');

  -- THE OTHER TWO WERE NOT NAMED, so they are untouched rather than reset. A writer that
  -- took the payload as the whole truth would blank every game the feed happened to miss.
  perform public.claim('a game nobody mentioned is left alone',
    (select count(*) from public.nfl_games
      where season = 2026 and week = 9 and state = 'pre') = 2);

end $$;

do $$
declare
  v_moved int;
  v_at1 timestamptz; v_at2 timestamptz;
  v_row public.nfl_games;
  v_games jsonb;
  v_ok boolean;
begin
  -- ── 5. and the tick after it, the feed is down ─────────────────────────────
  --
  -- THE DEFECT THIS FILE EXISTS FOR. `games.csv` knows a kickoff time and nothing else
  -- until hours after the whistle, so the fallback's honest answer about a game in its
  -- second quarter is "pre". Taken, the board flips backwards twice an hour.
  select updated_at into v_at1 from public.nfl_games
   where season = 2026 and week = 9 and game_id = '2026_09_ATL_GB';
  select public.nfl_put_games(2026, 9, jsonb_build_array(
    jsonb_build_object('game_id','2026_09_ATL_GB','away','ATL','home','GB',
      'kick','2026-11-06T01:15:00Z','state','pre','source','schedule')
  )) into v_moved;
  select * into v_row from public.nfl_games
   where season = 2026 and week = 9 and game_id = '2026_09_ATL_GB';
  select updated_at into v_at2 from public.nfl_games
   where season = 2026 and week = 9 and game_id = '2026_09_ATL_GB';
  perform public.claim('a source that knows less moves nothing', v_moved = 0);
  perform public.claim('the live game stays live', v_row.state = 'in');
  perform public.claim('and keeps its score', v_row.away_score = 7);
  perform public.claim('and keeps its clock', v_row.clock = '3:21');
  perform public.claim('and keeps the source that knew', v_row.source = 'espn');
  perform public.claim('and its clock is not touched', v_at1 = v_at2);

end $$;

do $$
declare
  v_moved int;
  v_at1 timestamptz; v_at2 timestamptz;
  v_row public.nfl_games;
  v_games jsonb;
  v_ok boolean;
begin
  -- ── 6. the clock ticking IS a change ───────────────────────────────────────
  select public.nfl_put_games(2026, 9, jsonb_build_array(
    jsonb_build_object('game_id','2026_09_ATL_GB','away','ATL','home','GB',
      'state','in','away_score',7,'home_score',10,
      'period',2,'clock','1:04','source','espn')
  )) into v_moved;
  perform public.claim('the clock ticking is a change', v_moved = 1);
  -- AND THE KICKOFF SURVIVES A PAYLOAD THAT DOES NOT CARRY ONE. A live feed answers the
  -- score and has no business restating the schedule.
  perform public.claim('and a missing kickoff does not erase the one we have',
    (select kick from public.nfl_games
      where season = 2026 and week = 9 and game_id = '2026_09_ATL_GB')
    = '2026-11-06T01:15:00Z'::timestamptz);

end $$;

do $$
declare
  v_moved int;
  v_at1 timestamptz; v_at2 timestamptz;
  v_row public.nfl_games;
  v_games jsonb;
  v_ok boolean;
begin
  -- ── 7. the whistle ─────────────────────────────────────────────────────────
  select public.nfl_put_games(2026, 9, jsonb_build_array(
    jsonb_build_object('game_id','2026_09_ATL_GB','away','ATL','home','GB',
      'state','post','away_score',20,'home_score',23,'overtime',true,'source','espn')
  )) into v_moved;
  select * into v_row from public.nfl_games
   where season = 2026 and week = 9 and game_id = '2026_09_ATL_GB';
  perform public.claim('the whistle is a change', v_moved = 1);
  perform public.claim('the final score is there',
    v_row.away_score = 20 and v_row.home_score = 23);
  -- A FINISHED GAME HAS NO CLOCK. Coalesced rather than cleared, the board would print a
  -- final score beside "2nd 1:04" for the rest of the week.
  perform public.claim('a final game has no quarter', v_row.period is null);
  perform public.claim('a final game has no clock', v_row.clock is null);
  perform public.claim('and overtime is recorded', v_row.overtime);

end $$;

do $$
declare
  v_moved int;
  v_at1 timestamptz; v_at2 timestamptz;
  v_row public.nfl_games;
  v_games jsonb;
  v_ok boolean;
begin
  -- ── 8. nothing comes back from the dead ────────────────────────────────────
  select public.nfl_put_games(2026, 9, jsonb_build_array(
    jsonb_build_object('game_id','2026_09_ATL_GB','away','ATL','home','GB',
      'state','in','away_score',14,'home_score',14,'period',3,'clock','9:00',
      'source','espn')
  )) into v_moved;
  select * into v_row from public.nfl_games
   where season = 2026 and week = 9 and game_id = '2026_09_ATL_GB';
  perform public.claim('a finished game does not restart', v_moved = 0);
  perform public.claim('and keeps its final score', v_row.away_score = 20);
  perform public.claim('and stays final', v_row.state = 'post');

end $$;

do $$
declare
  v_moved int;
  v_at1 timestamptz; v_at2 timestamptz;
  v_row public.nfl_games;
  v_games jsonb;
  v_ok boolean;
begin
  -- ── 9. the names are ours, at every state ──────────────────────────────────
  --
  -- ESPN writes WSH and LAR where the schedule writes WAS and LA, so what goes on the
  -- screen is read off OUR row and never off the feed. The writer takes the club codes
  -- unconditionally for that reason: even a tick that is refused for knowing less is still
  -- the schedule, and the schedule is what names a club.
  select public.nfl_put_games(2026, 9, jsonb_build_array(
    jsonb_build_object('game_id','2026_09_NYJ_DET','away','NYJ','home','DET',
      'kick','2026-11-08T18:00:00Z','state','pre','source','schedule')
  )) into v_moved;
  perform public.claim('our club codes are what is stored',
    (select away || '@' || home from public.nfl_games
      where season = 2026 and week = 9 and game_id = '2026_09_NYJ_DET') = 'NYJ@DET');

  -- ── 10. a payload that is not a slate ──────────────────────────────────────
  select public.nfl_put_games(2026, 9, '"nope"'::jsonb) into v_moved;
  perform public.claim('a payload that is not an array writes nothing', v_moved = 0);
  select public.nfl_put_games(2026, 9, null) into v_moved;
  perform public.claim('and neither does nothing at all', v_moved = 0);

  -- A ROW WITH NO CLUBS IS NOT A GAME. Written, it would be a blank line on the scoreboard
  -- that no amount of looking at the feed would explain.
  select public.nfl_put_games(2026, 9, jsonb_build_array(
    jsonb_build_object('game_id','2026_09_JUNK','state','in','away_score',3),
    jsonb_build_object('away','ARI','home','SF','state','pre')
  )) into v_moved;
  perform public.claim('a half written game is skipped', v_moved = 0);
  perform public.claim('and does not land on the board',
    (select count(*) from public.nfl_games where season = 2026 and week = 9) = 3);

  -- ── 11. the board carries the games ────────────────────────────────────────
  select public.fantasy_board(2026, 9, 50) -> 'games' into v_games;
  perform public.claim('the board carries the games', jsonb_array_length(v_games) = 3);
  -- ORDERED BY KICKOFF, because a scoreboard is read down the day. Unordered, Thursday
  -- night would sit wherever the planner happened to put it.
  perform public.claim('in kickoff order',
    (v_games -> 0 ->> 'game_id') = '2026_09_ATL_GB');
  perform public.claim('and the scoreline is in there',
    (v_games -> 0 ->> 'away_score') = '20' and (v_games -> 0 ->> 'state') = 'post');

  -- ONE WEEK'S GAMES AND NOT EVERY WEEK'S. Keyed wrongly, the scoreboard would grow all
  -- season and the first row would be the opening Thursday in September.
  select public.nfl_put_games(2026, 10, jsonb_build_array(
    jsonb_build_object('game_id','2026_10_ARI_SF','away','ARI','home','SF',
      'kick','2026-11-15T18:00:00Z','state','pre','source','schedule')
  )) into v_moved;
  select public.fantasy_board(2026, 9, 50) -> 'games' into v_games;
  perform public.claim('and only this week''s', jsonb_array_length(v_games) = 3);

  -- ── 12. the football is on whether or not the competition is ───────────────
  --
  -- A week with no `fantasy_weeks` row is a competition that was never published. The games
  -- are still being played, and a live screen that went blank for it would be saying
  -- something false about the football.
  select public.fantasy_board(2026, 10, 50) into v_games;
  perform public.claim('an unpublished week still answers its games',
    jsonb_array_length(v_games -> 'games') = 1);
  perform public.claim('and says it has no competition',
    jsonb_typeof(v_games -> 'week') = 'null');

  -- ── 13. the rest of the board is untouched by any of this ──────────────────
  --
  -- 111 restates `fantasy_board`, so the half it did not come to change is the half most
  -- likely to be lost in the restating. 110's own file asserts what these mean.
  select public.fantasy_board(2026, 9, 50) into v_games;
  select (v_games ? 'rows') and (v_games ? 'me') and (v_games ? 'week') into v_ok;
  perform public.claim('and still answers a week, its rows and the reader', v_ok);
  perform public.claim('the week still carries its two clocks',
    (v_games -> 'week') ? 'checked_at' and (v_games -> 'week') ? 'results_at');
  perform public.claim('and still says whether it is open',
    (v_games -> 'week' ->> 'open') = 'true');
end $$;

\o /dev/null
delete from public.nfl_games where season = 2026 and week in (9, 10);
delete from public.fantasy_weeks where season = 2026 and week = 9;
\o

\echo 'nfl_scores_test: every claim passed.'
