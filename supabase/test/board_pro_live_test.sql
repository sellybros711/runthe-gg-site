-- ---------------------------------------------------------------------------
-- board_pro_live_test.sql : 107's two columns, driven rather than read.
--
--   createdb pro_live
--   psql -d pro_live -f supabase/test/dynboard_base.sql
--   psql -d pro_live -f supabase/98_football_gauntlet_board.sql
--   psql -d pro_live -c 'create table public.subscriptions(user_id uuid,
--                        status text, current_period_end timestamptz);'
--   psql -d pro_live -f supabase/101_premium_bundles.sql
--   psql -d pro_live -f supabase/107_board_pro_and_live.sql
--   psql -d pro_live -f supabase/test/board_pro_live_test.sql
--
-- Every fault 107 can have is silent on the page: a mark that never appears
-- looks exactly like last week's board, and a mark that appears on the wrong
-- row is a valid pill on a valid row. So each claim is made here as an insert
-- and a select rather than as a reading of the file.
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

/* Every claim below reads ONE row by name, so a second run against the same
   database would find two of everything and fail on the subquery rather than on
   anything 107 did. Cleared rather than documented as fresh-database-only,
   because the run that matters is the one somebody does after an edit. */
delete from public.ps_runs;
delete from public.premium_unlocks;

-- The results are all nulls; the report is the NOTICE stream on stderr.
\o /dev/null

-- three accounts: one who never paid, one who buys later, one with an Arcade
-- Card and nothing else.
insert into auth.users(id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333'),
  ('44444444-4444-4444-4444-444444444444')
on conflict do nothing;

-- ---------- display_pro is stamped on the way in ----------------------------
insert into public.ps_runs(user_id, display_name, run_mode)
  values ('11111111-1111-1111-1111-111111111111', 'freebie', 'dynasty');
select public.claim('a free account is not marked',
  (select display_pro is false from public.ps_runs where display_name = 'freebie'));

insert into public.premium_unlocks(user_id, product, source)
  values ('22222222-2222-2222-2222-222222222222', 'ps_premium', 'comp');
insert into public.ps_runs(user_id, display_name, run_mode)
  values ('22222222-2222-2222-2222-222222222222', 'payer', 'dynasty');
select public.claim('an account holding the bundle is marked',
  (select display_pro from public.ps_runs where display_name = 'payer'));

-- THE OTHER TWO PRODUCTS ARE NOT A PRO TIER IN THIS GAME. An Arcade Card buyer
-- marked on a football leaderboard is the board saying something false.
insert into public.premium_unlocks(user_id, product, source, expires_at)
  values ('33333333-3333-3333-3333-333333333333', 'arcade_card_year', 'stripe',
          now() + interval '300 days');
insert into public.ps_runs(user_id, display_name, run_mode)
  values ('33333333-3333-3333-3333-333333333333', 'cardholder', 'dynasty');
select public.claim('an Arcade Card is not a Pro name',
  (select display_pro is false from public.ps_runs where display_name = 'cardholder'));

-- AN EXPIRY IS HONOURED, because a mark has to stop when the thing it marks does.
insert into public.premium_unlocks(user_id, product, source, expires_at)
  values ('44444444-4444-4444-4444-444444444444', 'cfb_premium', 'comp',
          now() - interval '1 day');
insert into public.ps_runs(user_id, display_name, run_mode)
  values ('44444444-4444-4444-4444-444444444444', 'lapsed', 'dynasty');
select public.claim('an unlock that has run out is not a Pro name',
  (select display_pro is false from public.ps_runs where display_name = 'lapsed'));

-- ---------- and buying lights up what is already on the board ---------------
-- Without this the mark would mean "was Pro when this season was played", which
-- reads as a bug to the person who just paid and looked at their own row.
select public.claim('the free account has nothing yet',
  (select display_pro is false from public.ps_runs where display_name = 'freebie'));
insert into public.premium_unlocks(user_id, product, source)
  values ('11111111-1111-1111-1111-111111111111', 'ps_premium', 'stripe');
select public.claim('  and buying gilds the rows already filed',
  (select display_pro from public.ps_runs where display_name = 'freebie'));

-- ---------- a guest run has nobody to ask about -----------------------------
insert into public.ps_runs(user_id, display_name, run_mode)
  values (null, 'aguest', 'dynasty');
select public.claim('a run with no account is not marked',
  (select display_pro is false from public.ps_runs where display_name = 'aguest'));

-- ---------- dynasty_over: three values, and only one of them is live --------
-- A row nobody ever tagged is the entire history before this file, and a board
-- of LIVE badges on runs from six months ago is worse than no badge at all.
select public.claim('an untagged row says nothing either way',
  (select dynasty_over is null from public.ps_runs where display_name = 'aguest'));

select public.become('22222222-2222-2222-2222-222222222222');
do $$
declare v_row bigint; v_dyn uuid := gen_random_uuid(); v_raised boolean := false;
begin
  insert into public.ps_runs(user_id, display_name, run_mode)
    values ('22222222-2222-2222-2222-222222222222', 'runner', 'dynasty')
    returning id into v_row;
  perform public.ps_dynasty_tag(v_row, v_dyn, 1, 100);
  perform public.claim('a tagged season is a run that is going',
    (select dynasty_over is false from public.ps_runs where id = v_row));

  -- a second season of the same run, and then the end
  insert into public.ps_runs(user_id, display_name, run_mode)
    values ('22222222-2222-2222-2222-222222222222', 'runner', 'dynasty')
    returning id into v_row;
  perform public.ps_dynasty_tag(v_row, v_dyn, 2, 250);
  perform public.ps_dynasty_end(v_dyn);
  perform public.claim('  ending it stamps EVERY season of the run',
    (select bool_and(dynasty_over) from public.ps_runs where dynasty_id = v_dyn));

  -- THE SEASON THAT LANDS AFTER THE END MUST NOT RESURRECT IT. ps_dynasty_tag
  -- coalesces rather than writing a plain false, so a replayed or late tag on a
  -- finished run leaves it finished.
  perform public.ps_dynasty_tag(v_row, v_dyn, 3, 400);
  perform public.claim('  and a late tag does not put it back on air',
    (select bool_and(dynasty_over) from public.ps_runs where dynasty_id = v_dyn));
  perform public.claim('    while still recording the season',
    (select dynasty_season = 3 from public.ps_runs where id = v_row));

  -- 98's own guard, restated rather than rewritten. Dropping it would turn a tag
  -- of somebody else's row into a silent no-op.
  --
  -- THE FLAG IS OUTSIDE THE HANDLER AND THAT IS NOT TIDINESS. Written as a
  -- claim(false) in the try arm, the failure it raises is caught by its own
  -- `when others` and reported as a pass: the check certified the guard while
  -- the guard was deleted, and proving it by deleting the raise is how that
  -- came to light. An exception test cannot assert inside the block it is
  -- watching.
  --
  perform public.become('11111111-1111-1111-1111-111111111111');
  begin
    perform public.ps_dynasty_tag(v_row, v_dyn, 4, 500);
  exception when others then v_raised := true;
  end;
  perform public.claim('tagging somebody else''s row still raises', v_raised);

  -- ps_dynasty_end deliberately does NOT raise: it is fire and forget from a
  -- screen that never reads the answer, and it runs again on Draft again.
  perform public.ps_dynasty_end(v_dyn);
  perform public.claim('  and ending somebody else''s run is a quiet no-op', true);
  perform public.become('22222222-2222-2222-2222-222222222222');
end $$;

-- ---------- the view carries both, at the end of its select list ------------
select public.claim('the board view hands both columns over',
  (select count(*) = 2 from information_schema.columns
    where table_name = 'ps_dynasty_board'
      and column_name in ('dynasty_over', 'display_pro')));
select public.claim('  with the run''s state on its furthest season',
  (select dynasty_over and display_pro from public.ps_dynasty_board
    where display_name = 'runner'));

-- ---------- and the whole file runs twice -----------------------------------
\i 107_board_pro_and_live.sql
select public.claim('107 is safe to run again', true);
select public.claim('  and re-running it did not unmark the payer',
  (select display_pro from public.ps_runs where display_name = 'payer'));
select public.claim('  or reopen a finished run',
  (select bool_and(dynasty_over) from public.ps_runs where dynasty_id is not null));

drop function public.claim(text, boolean);
\o

