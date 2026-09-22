-- ---------------------------------------------------------------------------
-- dynasty_slot_test.sql : 108's cap, driven rather than read.
--
--   createdb dyn_slot
--   psql -d dyn_slot -f supabase/test/dynboard_base.sql
--   psql -d dyn_slot -f supabase/98_football_gauntlet_board.sql
--   psql -d dyn_slot -c 'create table public.subscriptions(user_id uuid,
--                        status text, current_period_end timestamptz);'
--   psql -d dyn_slot -f supabase/101_premium_bundles.sql
--   psql -d dyn_slot -f supabase/107_board_pro_and_live.sql
--   psql -d dyn_slot -f supabase/108_dynasty_slot.sql
--   psql -d dyn_slot -f supabase/test/dynasty_slot_test.sql
--
-- check-premium.mjs fabricates `dynasty_current` and hands it to the painters, so it says
-- nothing about what WRITES it. That is this file, the same split 107's two halves run on.
--
-- The bug: one account wore four LIVE badges on a board where two is the ceiling. The page
-- has two dynasty slots, and a run whose local save has gone can never post its own end, so
-- it reads live until the page's 48 hour window runs out. Every claim below is the shape of
-- that report: several runs by one account, and how many of them the board calls current.
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

/* Cleared rather than documented as fresh-database-only, because the run that matters is
   the one somebody does after an edit. */
delete from public.ps_runs;

-- The results are all nulls; the report is the NOTICE stream on stderr.
\o /dev/null

insert into auth.users(id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002')
on conflict do nothing;

/* One season of one run, filed the way the page files it. `created_at` is set by hand
   because the ranking is by when a run's FURTHEST season landed, and a test that inserted
   everything inside one millisecond would be ranking on the tiebreak. */
create or replace function public.file_season(
  p_user uuid, p_name text, p_dyn uuid, p_season int, p_score bigint,
  p_slot text, p_ago interval)
returns void language plpgsql as $$
declare v_row bigint;
begin
  insert into public.ps_runs(user_id, display_name, run_mode, created_at)
    values (p_user, p_name, 'dynasty', now() - p_ago)
    returning id into v_row;
  perform public.ps_dynasty_tag(v_row, p_dyn, p_season, p_score, p_slot);
end $$;

-- ---------- the report itself ----------------------------------------------
--
-- Four unfinished runs, one account. Two are the newest in their slot and two are runs
-- abandoned behind them. Before 108 all four read live.

select public.become('aaaaaaaa-0000-0000-0000-000000000001');
do $$
declare
  v_open_now uuid := gen_random_uuid();
  v_open_old uuid := gen_random_uuid();
  v_club_now uuid := gen_random_uuid();
  v_club_old uuid := gen_random_uuid();
  v_u uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
begin
  perform public.file_season(v_u, 'four', v_open_old, 3,  4000, 'open', interval '20 hours');
  perform public.file_season(v_u, 'four', v_club_old, 3,  4100, 'club', interval '18 hours');
  perform public.file_season(v_u, 'four', v_open_now, 6, 18000, 'open', interval '4 hours');
  perform public.file_season(v_u, 'four', v_club_now, 5, 12000, 'club', interval '2 hours');

  perform public.claim('all four runs are on the board',
    (select count(*) = 4 from public.ps_dynasty_board where display_name = 'four'));
  /* THE WHOLE REPORT, IN ONE LINE. */
  perform public.claim('  but only two of them are current',
    (select count(*) = 2 from public.ps_dynasty_board
      where display_name = 'four' and dynasty_current));
  perform public.claim('    and they are the newest in each slot',
    (select bool_and(dynasty_current) from public.ps_dynasty_board
      where dynasty_id in (v_open_now, v_club_now)));
  perform public.claim('    and the two behind them are not',
    (select bool_and(not dynasty_current) from public.ps_dynasty_board
      where dynasty_id in (v_open_old, v_club_old)));
  /* `dynasty_over` STILL MEANS WHAT IT MEANT. Folding the two into one column would make
     "was this ended" un-askable and take 107's own test with it. A stale run is not over:
     nobody ever ended it, and that is the whole reason this file exists. */
  perform public.claim('    and none of the four is marked ENDED',
    (select bool_and(dynasty_over is false) from public.ps_dynasty_board
      where display_name = 'four'));

  /* PLAYING THE OLD ONE AGAIN MAKES IT CURRENT AGAIN, which is what resuming a dynasty
     is. Nothing needs to be un-marked: the rank is read off the rows every time. */
  perform public.file_season(v_u, 'four', v_open_old, 4, 9000, 'open', interval '0 hours');
  perform public.claim('  resuming a run makes it the current one in its slot',
    (select dynasty_current from public.ps_dynasty_board where dynasty_id = v_open_old));
  perform public.claim('    and the one it overtook is not',
    (select not dynasty_current from public.ps_dynasty_board where dynasty_id = v_open_now));
  perform public.claim('    while the other slot is untouched',
    (select dynasty_current from public.ps_dynasty_board where dynasty_id = v_club_now));
end $$;

-- ---------- ending one is still what ending one means -----------------------
--
-- RANKED OVER ALL OF THE ACCOUNT'S RUNS, NOT ONLY THE UNFINISHED ONES, and this is the
-- clause most likely to be simplified wrongly. Rank the unfinished alone and a stale run
-- whose slot was later taken by a run that has since FINISHED floats back to the top and
-- wears the badge again.

select public.become('bbbbbbbb-0000-0000-0000-000000000002');
do $$
declare
  v_stale uuid := gen_random_uuid();
  v_done  uuid := gen_random_uuid();
  v_u uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
begin
  perform public.file_season(v_u, 'ended', v_stale, 3, 4000, 'open', interval '30 hours');
  perform public.file_season(v_u, 'ended', v_done,  8, 30000, 'open', interval '5 hours');
  perform public.ps_dynasty_end(v_done);

  perform public.claim('a finished run is not current', (select not dynasty_current
    from public.ps_dynasty_board where dynasty_id = v_done));
  perform public.claim('  and it still retires the stale run behind it in the same slot',
    (select not dynasty_current from public.ps_dynasty_board where dynasty_id = v_stale));
  perform public.claim('  so the account lights nothing at all',
    (select count(*) = 0 from public.ps_dynasty_board
      where display_name = 'ended' and dynasty_current));
end $$;

-- ---------- the history repairs itself --------------------------------------
--
-- Every row filed before today has a NULL slot and they all share one bucket, so an
-- account's older unfinished runs stop being current the moment a newer one exists. That is
-- what takes the reported account from four badges to one without anybody editing a row.

select public.become('aaaaaaaa-0000-0000-0000-000000000001');
do $$
declare
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_c uuid := gen_random_uuid();
  v_u uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
begin
  delete from public.ps_runs where user_id = v_u;
  /* A NULL SLOT IS WHAT A CLIENT THAT HAS NOT BEEN UPDATED SENDS, and it is what every row
     already on the board carries. Passed explicitly rather than by leaving the default,
     because the claim is about the null and not about the signature. */
  perform public.file_season(v_u, 'legacy', v_a, 3, 4000, null, interval '30 hours');
  perform public.file_season(v_u, 'legacy', v_b, 3, 4100, null, interval '20 hours');
  perform public.file_season(v_u, 'legacy', v_c, 6, 18000, null, interval '3 hours');
  perform public.claim('runs from before 108 share one bucket',
    (select count(*) = 1 from public.ps_dynasty_board
      where display_name = 'legacy' and dynasty_current));
  perform public.claim('  and the survivor is the one played most recently',
    (select dynasty_current from public.ps_dynasty_board where dynasty_id = v_c));
end $$;

-- ---------- a client one deploy behind does not blank a slot -----------------
--
-- A season is its own ROW and a slot belongs to the DYNASTY, so a null argument has to
-- inherit rather than overwrite. Without that, one season filed by a stale browser is the
-- furthest season, the view reads the slot off that row, and a well recorded dynasty drops
-- into the null bucket.
--
-- ASSERTED ON THE ROW THE BOARD READS, and the first draft of this claim was vacuous for a
-- reason worth keeping: written `bool_and(dynasty_slot = 'club')` over the dynasty's rows it
-- passed with the defect in, because bool_and IGNORES NULLS, so the one row that had been
-- blanked was the one row not counted. It passed on exactly the defect it was written for.

do $$
declare v_dyn uuid := gen_random_uuid(); v_u uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
begin
  perform public.file_season(v_u, 'keepslot', v_dyn, 1, 100, 'club', interval '2 hours');
  perform public.file_season(v_u, 'keepslot', v_dyn, 2, 400, null,   interval '1 hour');
  perform public.claim('a season filed with no slot inherits the dynasty''s own',
    (select dynasty_slot = 'club' from public.ps_runs
      where dynasty_id = v_dyn and dynasty_season = 2));
  perform public.claim('  and the season that recorded it still has it',
    (select dynasty_slot = 'club' from public.ps_runs
      where dynasty_id = v_dyn and dynasty_season = 1));
  /* The whole point of the inheritance, said as the board would say it: this dynasty is
     still in the club slot, so an open-slot run of the same account is current too. */
  perform public.file_season(v_u, 'keepslot', gen_random_uuid(), 1, 100, 'open',
                             interval '30 minutes');
  perform public.claim('  so it is still told apart from the other slot',
    (select count(*) = 2 from public.ps_dynasty_board
      where display_name = 'keepslot' and dynasty_current));
end $$;

-- ---------- a guest is not ranked -------------------------------------------
--
-- `user_id` is null for a run filed by nobody, so a partition on it would put every guest
-- run in the world into one bucket and leave exactly one of them current. There is no
-- account to own two slots, so the cap does not apply.

insert into public.ps_runs(user_id, display_name, run_mode, dynasty_id, dynasty_season,
                           dynasty_score, dynasty_over)
  values (null, 'aguest', 'dynasty', gen_random_uuid(), 2, 300, false),
         (null, 'aguest', 'dynasty', gen_random_uuid(), 3, 900, false);
select public.claim('two guest runs are both current, because there is no account to cap',
  (select count(*) = 2 from public.ps_dynasty_board
    where display_name = 'aguest' and dynasty_current));

-- ---------- the tag still refuses what it always refused ---------------------
--
-- 108 restates 107's body, and the clause a careless restatement drops is the one that
-- turns tagging somebody else's row from an error into a silent no-op. An exception test
-- CANNOT ASSERT INSIDE THE BLOCK IT IS WATCHING: the failure claim() raises would be caught
-- by that block's own handler and reported as a pass. 107's own test learnt this.

select public.become('bbbbbbbb-0000-0000-0000-000000000002');
do $$
declare v_row bigint; v_raised boolean := false;
begin
  insert into public.ps_runs(user_id, display_name, run_mode)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'notmine', 'dynasty')
    returning id into v_row;
  begin
    perform public.ps_dynasty_tag(v_row, gen_random_uuid(), 1, 100, 'open');
  exception when others then v_raised := true;
  end;
  perform public.claim('tagging somebody else''s row still raises', v_raised);

  v_raised := false;
  begin
    perform public.ps_dynasty_tag(v_row, gen_random_uuid(), 1, 100,
      'a-slot-name-far-too-long-to-be-real');
  exception when others then v_raised := true;
  end;
  perform public.claim('  and so does a slot nobody would type', v_raised);
end $$;

\o
\echo 'dynasty_slot_test: every claim passed'
