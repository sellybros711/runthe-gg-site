-- ---------------------------------------------------------------------------
-- 108_hoops_leaderboard.sql against a real Postgres.
--
--   createdb hoops_board
--   psql -d hoops_board -c 'create role authenticated; create role anon;'
--   psql -d hoops_board -f supabase/test/hoops_board_base.sql
--   psql -d hoops_board -f supabase/108_hoops_leaderboard.sql
--   psql -d hoops_board -f supabase/test/hoops_board_test.sql
--
-- One line per check, every one starting " ok ".
--
-- WHAT THIS FILE IS ACTUALLY FOR. Everything the function refuses, it refuses
-- SILENTLY from the page's point of view: hoops/board.js fails soft by design,
-- so a rejected run resolves to null and the screen says the board is not
-- reachable. So a coherence check that stopped working would not be a visible
-- failure, it would be a board quietly filling with rows the game cannot
-- produce. The rejections are most of what is below, and each is written as
-- the thing a forger or a client bug would actually send.
--
-- The four-board split is the other half. One board per mode with the two
-- locked modes scoped again by key is the whole design, and it is one `where`
-- clause away from being one board for everybody, which would render
-- perfectly.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\pset pager off

create or replace function pg_temp.ck(label text, cond boolean) returns void
language plpgsql as $$
begin
  raise notice '%', (case when cond then ' ok  ' else ' FAIL ' end) || label;
end $$;

-- Did this call raise? Returns the message, or null when it went through, so
-- a check can assert BOTH that it was refused and that it was refused for the
-- reason meant. A bare "it threw" passes when the function throws on a typo.
create or replace function pg_temp.boom(sql text) returns text
language plpgsql as $$
begin
  execute sql;
  return null;
exception when others then
  return sqlerrm;
end $$;

-- A whole legal submit in one line, so a check about one argument does not
-- have to restate the other eighteen.
create or replace function pg_temp.sub(
  wins int, po int default 0, club text default null, era text default null,
  day int default null, tag text default 'a', diff numeric default 3.5,
  rating numeric default 60)
returns bigint language sql as $$
  select rtf_submit_run(wins, po, diff, club, era, day, rating,
    118.0, 112.0, 1.40, 1.02, 'Triangle', 120.0, 1, 400,
    six(tag), array['PG','SG','SF','PF','C','6TH']::text[], 'seed-' || tag, 900)
$$;

-- IT RESETS ITS OWN FIXTURE, because it changes one. The rename check near
-- the bottom moves jordan to mj, so a second run of this file against the same
-- database read three name checks as failures on code that had not changed:
-- the classic shape of a suite that only passes on a fresh database, and the
-- classic way half an hour goes into a fault that was never in the migration.
update public.profiles set username = 'jordan'
 where id = '00000000-0000-0000-0000-000000000001';
update public.profiles set username = 'pippen'
 where id = '00000000-0000-0000-0000-000000000002';
truncate public.rtf_runs;
select be(null);

-- ── the day the function thinks it is ──────────────────────────────────────
-- The base file works out today's day number a second time, by hand, because
-- a hardcoded day would start failing on a date nobody chose. Two
-- implementations of one line is the shape this repo distrusts most, so the
-- first thing asked is that a real submit agrees with it.
select pg_temp.sub(55, 2, null, null, today_day(), 'day');
select pg_temp.ck('a daily run is filed under today''s day number',
  (select daily_day from rtf_runs where run_mode = 'daily') = today_day());
select pg_temp.ck('and its iso date is the day it says it is',
  (select daily_iso from rtf_runs where run_mode = 'daily')
    = (now() at time zone 'America/New_York')::date);

-- ── the record is the server's ─────────────────────────────────────────────
truncate public.rtf_runs;
select pg_temp.sub(58, 2);
select pg_temp.ck('losses are 82 minus the wins, not sent',
  (select losses from rtf_runs) = 24);
select pg_temp.ck('and the games are the regular season alone',
  (select games from rtf_runs) = 82);
-- A round here is a SERIES, so a bracket loss is four wins and three losses
-- for somebody and the games it took are in nothing the client sends. 58-24 is
-- the record a basketball fan means.
select pg_temp.ck('a playoff win is not a win in the record',
  (select wins from rtf_runs) = 58);
select pg_temp.ck('50 wins is a top six seed',
  (select seed_label from rtf_runs) = 'Top six seed');
select pg_temp.ck('and it made the playoffs',
  (select made_playoffs from rtf_runs));

truncate public.rtf_runs;
select pg_temp.sub(45, 1);
select pg_temp.ck('43 wins is the play-in',
  (select seed_label from rtf_runs) = 'Play-in');
truncate public.rtf_runs;
select pg_temp.sub(30, 0);
select pg_temp.ck('42 wins and under is the lottery',
  (select seed_label from rtf_runs) = 'Lottery');
select pg_temp.ck('and it did not make the playoffs',
  not (select made_playoffs from rtf_runs));

-- ── a ring is four series, or five from the play-in ────────────────────────
truncate public.rtf_runs;
select pg_temp.sub(60, 4);
select pg_temp.ck('four series off a top six seed is a ring',
  (select title_won from rtf_runs));
truncate public.rtf_runs;
select pg_temp.sub(45, 5);
select pg_temp.ck('and five from the play-in is the same ring',
  (select title_won from rtf_runs));
truncate public.rtf_runs;
select pg_temp.sub(60, 3);
select pg_temp.ck('three of four is not',
  not (select title_won from rtf_runs));

-- ── what it refuses, which is the half nothing else would notice ───────────
select pg_temp.ck('83 wins in an 82 game season is refused',
  pg_temp.boom($$ select pg_temp.sub(83, 0) $$) like '%0..82%');
select pg_temp.ck('a negative record is refused',
  pg_temp.boom($$ select pg_temp.sub(-1, 0) $$) is not null);
select pg_temp.ck('a lottery team cannot win a playoff series',
  pg_temp.boom($$ select pg_temp.sub(30, 1) $$) like '%misses the playoffs%');
select pg_temp.ck('a top six seed cannot win the play-in''s five rounds',
  pg_temp.boom($$ select pg_temp.sub(60, 5) $$) like '%0..4%');
select pg_temp.ck('a play-in team cannot win six',
  pg_temp.boom($$ select pg_temp.sub(45, 6) $$) like '%0..5%');
select pg_temp.ck('a differential off the scale is refused',
  pg_temp.boom($$ select pg_temp.sub(50, 0, null, null, null, 'a', 900) $$)
    like '%differential%');
select pg_temp.ck('a rating off the scale is refused',
  pg_temp.boom($$ select pg_temp.sub(50, 0, null, null, null, 'a', 3.5, 9000) $$)
    like '%rating%');

-- The roster, which is the one thing here that is never re-derivable and so is
-- the one place a malformed value would sit on the board for ever.
select pg_temp.ck('five picks is not a roster',
  pg_temp.boom($$ select rtf_submit_run(50, 0, 1.0, null, null, null, 60,
    118, 112, 1.4, 1.02, 'x', 120, 0, null,
    array['a|1996|CHI','b|1996|CHI','c|1996|CHI','d|1996|CHI','e|1996|CHI']::text[]) $$) like '%6 picks%');
select pg_temp.ck('the same player cannot be signed twice',
  pg_temp.boom($$ select rtf_submit_run(50, 0, 1.0, null, null, null, 60,
    118, 112, 1.4, 1.02, 'x', 120, 0, null,
    array['a|1996|CHI','a|1996|CHI','c|1996|CHI','d|1996|CHI','e|1996|CHI','f|1996|CHI']::text[]) $$)
    like '%twice%');
select pg_temp.ck('a pick that is not <id>|<season>|<CLUB> is refused',
  pg_temp.boom($$ select rtf_submit_run(50, 0, 1.0, null, null, null, 60,
    118, 112, 1.4, 1.02, 'x', 120, 0, null,
    array['a|1996|CHI','b|1996|CHI','c|1996|CHI','d|1996|CHI','e|1996|CHI','<script>']::text[]) $$)
    like '%player_id%');
select pg_temp.ck('an unknown slot name is refused',
  pg_temp.boom($$ select rtf_submit_run(50, 0, 1.0, null, null, null, 60,
    118, 112, 1.4, 1.02, 'x', 120, 0, null, six('a'),
    array['PG','SG','SF','PF','C','QB']::text[]) $$) like '%slot%');
select pg_temp.ck('spending over the cap is refused',
  pg_temp.boom($$ select rtf_submit_run(50, 0, 1.0, null, null, null, 60,
    118, 112, 1.4, 1.02, 'x', 400, 0, null, six('a')) $$) like '%cap%');

-- ── the mode is derived, and two locks is a mode the game has no door for ──
truncate public.rtf_runs;
select pg_temp.sub(50, 0, 'CHI');
select pg_temp.ck('a club makes it a One Franchise run',
  (select run_mode from rtf_runs) = 'club'
  and (select lock_key from rtf_runs) = 'CHI');
truncate public.rtf_runs;
select pg_temp.sub(50, 0, null, 'eighties');
select pg_temp.ck('an era makes it a Decades run',
  (select run_mode from rtf_runs) = 'era'
  and (select lock_key from rtf_runs) = 'eighties');
truncate public.rtf_runs;
select pg_temp.sub(50, 0);
select pg_temp.ck('neither makes it a league run',
  (select run_mode from rtf_runs) = 'league'
  and (select lock_key from rtf_runs) is null);

select pg_temp.ck('a club AND an era is refused',
  pg_temp.boom($$ select pg_temp.sub(50, 0, 'CHI', 'eighties') $$) like '%never to both%');
select pg_temp.ck('a daily carrying a lock is refused',
  pg_temp.boom($$ select pg_temp.sub(50, 0, 'CHI', null, today_day()) $$)
    like '%carries no lock%');
select pg_temp.ck('a club code that is not a club code is refused',
  pg_temp.boom($$ select pg_temp.sub(50, 0, 'Chicago Bulls') $$) like '%club code%');
select pg_temp.ck('an era key that is not an era key is refused',
  pg_temp.boom($$ select pg_temp.sub(50, 0, null, '1980s') $$) like '%era key%');

-- ── AN OLD PUZZLE CANNOT BE BACK-FILLED once its answers are known ─────────
select pg_temp.ck('last week''s day is refused',
  pg_temp.boom(format('select pg_temp.sub(50, 0, null, null, %s)', today_day() - 7))
    like '%not close enough%');
select pg_temp.ck('next week''s day is refused',
  pg_temp.boom(format('select pg_temp.sub(50, 0, null, null, %s)', today_day() + 7))
    like '%not close enough%');
-- A DAY EITHER SIDE IS ALLOWED, and deliberately: a run in progress across
-- midnight was yesterday's puzzle, and a clock that is an hour out is a real
-- browser rather than a forger.
truncate public.rtf_runs;
select pg_temp.sub(50, 0, null, null, today_day() - 1, 'y');
select pg_temp.ck('yesterday''s day still lands, for a run that crossed midnight',
  (select count(*) from rtf_runs where run_mode = 'daily') = 1);

-- ── the four boards do not see each other ──────────────────────────────────
-- This is the whole design and it is one `where` clause away from being one
-- board for everybody, which would render perfectly and would retire the
-- league record to whoever picked the deepest franchise.
truncate public.rtf_runs;
select pg_temp.sub(41, 0, null, null, null, 'l');          -- league
select pg_temp.sub(70, 0, 'CHI', null, null, 'c1');        -- Bulls
select pg_temp.sub(44, 0, 'BOS', null, null, 'c2');        -- Celtics
select pg_temp.sub(66, 0, null, 'eighties', null, 'e1');   -- the eighties
select pg_temp.sub(55, 0, null, null, today_day(), 'd');   -- today
select pg_temp.ck('the league board holds only league runs',
  (select count(*) from rtf_runs where run_mode = 'league') = 1);
select pg_temp.ck('a Bulls board does not show the Celtics',
  (select max(wins) from rtf_runs where run_mode = 'club' and lock_key = 'CHI') = 70
  and (select max(wins) from rtf_runs where run_mode = 'club' and lock_key = 'BOS') = 44);
select pg_temp.ck('and the 70 win Bulls run is not the league record',
  (select max(wins) from rtf_runs where run_mode = 'league') = 41);
select pg_temp.ck('the decade board is its own',
  (select count(*) from rtf_runs where run_mode = 'era' and lock_key = 'eighties') = 1);
select pg_temp.ck('and today is its own again',
  (select count(*) from rtf_runs where daily_day = today_day()) = 1);

-- ── the score orders the board, and wins always outrank a differential ─────
-- The whole reason the differential is shifted and clamped rather than added
-- raw: a 49 win blowout season must never outrank a 50 win grind.
truncate public.rtf_runs;
select pg_temp.sub(49, 0, null, null, null, 'hi', 30.0);
select pg_temp.sub(50, 0, null, null, null, 'lo', -30.0);
select pg_temp.ck('50 wins outranks 49 however lopsided the scores',
  (select wins from rtf_runs order by score desc limit 1) = 50);
truncate public.rtf_runs;
select pg_temp.sub(50, 0, null, null, null, 'a', 1.0);
select pg_temp.sub(50, 0, null, null, null, 'b', 9.0);
select pg_temp.ck('and the differential breaks a tie on wins',
  (select point_diff from rtf_runs order by score desc limit 1) = 9.0);
select pg_temp.ck('a differential at the clamp does not carry into the wins digit',
  (select max(score) - min(score) from rtf_runs) < 10000);

-- ── the name is read here and can never be sent ────────────────────────────
truncate public.rtf_runs;
select be(null);
select pg_temp.sub(50, 0, null, null, null, 'anon');
select pg_temp.ck('a signed out run records with no name and no owner',
  (select display_name from rtf_runs) is null
  and (select user_id from rtf_runs) is null);
select be(1);
select pg_temp.sub(51, 0, null, null, null, 'named');
select pg_temp.ck('a signed in run wears the name out of profiles',
  (select display_name from rtf_runs where wins = 51) = 'jordan');
-- THE CLIENT HAS NO ARGUMENT FOR THIS, which is the point: nothing reachable
-- from a browser can put text on a row. Asked structurally, because a test
-- that tried to pass one would simply fail to compile.
select pg_temp.ck('and there is no display name argument to send',
  not exists (
    select 1 from pg_proc p
     where p.proname = 'rtf_submit_run'
       and array_to_string(p.proargnames, ',') ~ 'name'));

-- ── claiming: only ever a row nobody owns ──────────────────────────────────
truncate public.rtf_runs;
select be(null);
select pg_temp.sub(47, 0, null, null, null, 'claim');
select be(1);
select pg_temp.ck('the run you finished before signing in can be claimed',
  rtf_claim_run((select id from rtf_runs)));
select pg_temp.ck('and it now wears your name',
  (select display_name from rtf_runs) = 'jordan');
select be(2);
select pg_temp.ck('somebody else cannot claim it',
  not rtf_claim_run((select id from rtf_runs)));
select pg_temp.ck('and it is still yours',
  (select display_name from rtf_runs) = 'jordan');
select be(null);
select pg_temp.ck('a signed out visitor cannot claim anything',
  not rtf_claim_run((select id from rtf_runs)));

-- ── renaming keeps the denormalised copy honest ────────────────────────────
update public.profiles set username = 'mj' where id = '00000000-0000-0000-0000-000000000001';
select be(1);
-- TWO STATEMENTS, NOT ONE `and`. Written as `rtf_rename_runs() = 1 and (select
-- display_name ...) = 'mj'` this failed, and the function was right: Postgres
-- does not promise to evaluate the two sides of an `and` in the order they are
-- written, so the subselect read the name before the update it was meant to be
-- checking. The rename is a side effect, so it has to finish before anything
-- asks what it did.
select pg_temp.ck('a rename reaches every past run', rtf_rename_runs() = 1);
select pg_temp.ck('and the row wears the new name',
  (select display_name from rtf_runs) = 'mj');
-- Keyed on the id rather than the old username, so re-running this file
-- against a database it has already renamed still renames somebody.
select be(2);
select pg_temp.ck('and never anybody else''s', rtf_rename_runs() = 0);

-- ── the double submit guard is idempotency, not a rate limit ───────────────
truncate public.rtf_runs;
select be(null);
select pg_temp.ck('a retry inside a minute hands back the same row',
  pg_temp.sub(52, 1, null, null, null, 'same') = pg_temp.sub(52, 1, null, null, null, 'same'));
select pg_temp.ck('so the board has one row for it',
  (select count(*) from rtf_runs) = 1);
select pg_temp.ck('a different roster a second later is a different run',
  pg_temp.sub(52, 1, null, null, null, 'other') <> (select id from rtf_runs limit 1));
-- The same roster and result in two DIFFERENT competitions is two runs, and
-- has to be: the guard keys on the competition as well, or a Bulls run would
-- silently swallow the league run played a moment before it.
truncate public.rtf_runs;
select pg_temp.sub(52, 1, null, null, null, 'x');
select pg_temp.sub(52, 1, 'CHI', null, null, 'x');
select pg_temp.ck('the same roster on two boards is two rows',
  (select count(*) from rtf_runs) = 2);

-- ── the table refuses an incoherent row even if a second writer appears ────
-- The constraints say this rather than the function, because the function is
-- one writer and a constraint is the table's own promise.
select pg_temp.ck('a locked mode with no key is refused by the table',
  pg_temp.boom($$ insert into rtf_runs
    (run_mode, lock_key, regular_wins, playoff_wins, wins, losses, games,
     made_playoffs, title_won, beat_record, is_goat, seed_label, point_diff, picks)
    values ('club', null, 50, 0, 50, 32, 82, true, false, false, false, 'x', 1.0,
            array['a|1996|CHI']) $$) like '%rtf_runs_lock_chk%');
select pg_temp.ck('a league run carrying a key is refused by the table',
  pg_temp.boom($$ insert into rtf_runs
    (run_mode, lock_key, regular_wins, playoff_wins, wins, losses, games,
     made_playoffs, title_won, beat_record, is_goat, seed_label, point_diff, picks)
    values ('league', 'CHI', 50, 0, 50, 32, 82, true, false, false, false, 'x', 1.0,
            array['a|1996|CHI']) $$) like '%rtf_runs_lock_chk%');
-- WHICH constraint catches this is not the claim. A mode the table has never
-- heard of satisfies neither branch of the lock rule either, so it trips
-- whichever of the two Postgres evaluates first, and pinning one of them would
-- be a test of the evaluation order rather than of the table.
select pg_temp.ck('a mode the game has no door for is refused by the table',
  pg_temp.boom($$ insert into rtf_runs
    (run_mode, regular_wins, playoff_wins, wins, losses, games,
     made_playoffs, title_won, beat_record, is_goat, seed_label, point_diff, picks)
    values ('dynasty', 50, 0, 50, 32, 82, true, false, false, false, 'x', 1.0,
            array['a|1996|CHI']) $$) like '%rtf_runs_%_chk%');

-- ── 72 and 74 are columns, not a threshold every reader carries ────────────
truncate public.rtf_runs;
select pg_temp.sub(71, 0, null, null, null, 'n71');
select pg_temp.sub(72, 0, null, null, null, 'n72');
select pg_temp.sub(74, 0, null, null, null, 'n74');
select pg_temp.ck('72 wins beats the record and 71 does not',
  (select beat_record from rtf_runs where wins = 72)
  and not (select beat_record from rtf_runs where wins = 71));
select pg_temp.ck('74 is the one nobody has done',
  (select is_goat from rtf_runs where wins = 74)
  and not (select is_goat from rtf_runs where wins = 72));

-- ── the picker's counts ────────────────────────────────────────────────────
truncate public.rtf_runs;
select pg_temp.sub(41, 0, null, null, null, 'l');
select pg_temp.sub(70, 0, 'CHI', null, null, 'c1');
select pg_temp.sub(60, 0, 'CHI', null, null, 'c2');
select pg_temp.sub(44, 0, 'BOS', null, null, 'c3');
select pg_temp.sub(66, 0, null, 'eighties', null, 'e1');
select pg_temp.ck('the picker is told which locked boards have runs on them',
  (select count(*) from rtf_board_modes()) = 3);
select pg_temp.ck('with the count and the best on each',
  (select runs from rtf_board_modes() where lock_key = 'CHI') = 2
  and (select best_wins from rtf_board_modes() where lock_key = 'CHI') = 70);
select pg_temp.ck('and it does not report the two unlocked boards',
  not exists (select 1 from rtf_board_modes() where run_mode in ('league','daily')));

-- ── the grants ─────────────────────────────────────────────────────────────
-- READ ONLY IS THE WHOLE SECURITY MODEL. A direct insert grant would make
-- every coherence check above advisory.
select pg_temp.ck('anon may read the board',
  has_table_privilege('anon', 'rtf_runs', 'select'));
select pg_temp.ck('and may not write a row directly',
  not has_table_privilege('anon', 'rtf_runs', 'insert')
  and not has_table_privilege('anon', 'rtf_runs', 'update')
  and not has_table_privilege('anon', 'rtf_runs', 'delete'));
select pg_temp.ck('nor may a signed in account',
  not has_table_privilege('authenticated', 'rtf_runs', 'insert')
  and not has_table_privilege('authenticated', 'rtf_runs', 'update')
  and not has_table_privilege('authenticated', 'rtf_runs', 'delete'));
select pg_temp.ck('a signed out visitor may still submit a run',
  has_function_privilege('anon',
    'rtf_submit_run(int,int,numeric,text,text,int,numeric,numeric,numeric,numeric,'
    || 'numeric,text,numeric,int,int,text[],text[],text,int)', 'execute'));
select pg_temp.ck('only a signed in account may claim or rename',
  not has_function_privilege('anon', 'rtf_claim_run(bigint)', 'execute')
  and has_function_privilege('authenticated', 'rtf_claim_run(bigint)', 'execute')
  and not has_function_privilege('anon', 'rtf_rename_runs()', 'execute'));
select pg_temp.ck('row level security is on',
  (select relrowsecurity from pg_class where relname = 'rtf_runs'));

-- ── every board query is an index scan ─────────────────────────────────────
-- Not a timing, which would flap on a loaded machine, but the plan itself: the
-- one thing that quietly turns a 2ms board into a 250ms one is a sequential
-- scan, and it arrives the day somebody windows on a column the index does not
-- carry. Asked at a size where the planner would genuinely rather scan a small
-- table, so the index is forced off to make the question honest.
truncate public.rtf_runs;
insert into rtf_runs
  (run_mode, lock_key, daily_day, regular_wins, playoff_wins, wins, losses, games,
   made_playoffs, title_won, beat_record, is_goat, seed_label, point_diff, rating, picks)
select 'league', null, null, i % 80, 0, i % 80, 82 - (i % 80), 82,
       (i % 80) >= 43, false, false, false, 'x', 1.0, 50 + (i % 40),
       array['p' || i || '|1996|CHI']
  from generate_series(1, 4000) i;
analyze rtf_runs;
set enable_seqscan = off;
create or replace function pg_temp.plan(sql text) returns text
language plpgsql as $$
declare v text; out text := '';
begin
  for v in execute 'explain ' || sql loop out := out || v || E'\n'; end loop;
  return out;
end $$;
select pg_temp.ck('the score board is an index scan',
  pg_temp.plan($$ select id from rtf_runs where run_mode = 'league'
                   order by score desc, created_at asc limit 50 $$) like '%rtf_runs_mode_score_idx%');
select pg_temp.ck('the rating board is an index scan',
  pg_temp.plan($$ select id from rtf_runs where run_mode = 'league'
                   order by rating desc, created_at asc limit 50 $$) like '%rtf_runs_mode_rating_idx%');
select pg_temp.ck('counting better runs is an index scan',
  pg_temp.plan($$ select count(*) from rtf_runs where run_mode = 'league' and score > 500000 $$)
    like '%rtf_runs_mode_score_idx%');
-- THE BOARD READ BACKWARDS IS THE SAME INDEX, which is what lets there be no
-- ascending twin of any of these. It only holds because the tiebreak reverses
-- with the sort key: `score asc, created_at asc` is a backward scan plus an
-- incremental sort, and `score asc, created_at desc` is a clean backward scan.
select pg_temp.ck('and reading it backwards needs no second index and no sort',
  pg_temp.plan($$ select id from rtf_runs where run_mode = 'league'
                   order by score asc, created_at desc limit 50 $$) like '%Backward%'
  and pg_temp.plan($$ select id from rtf_runs where run_mode = 'league'
                   order by score asc, created_at desc limit 50 $$) not like '%Sort%');
reset enable_seqscan;

\echo ''
\echo 'Every line above should start with " ok ".'
