-- ---------------------------------------------------------------------------
-- fantasy_prizes_test.sql : 114, driven rather than read.
--
--   createdb fantasy
--   psql -d fantasy -f supabase/test/fantasy_base.sql
--   psql -d fantasy -f supabase/109_fantasy_challenge.sql
--   psql -d fantasy -f supabase/110_fantasy_live.sql
--   psql -d fantasy -f supabase/114_fantasy_prizes.sql
--   psql -d fantasy -f supabase/test/fantasy_prizes_test.sql
--
-- THE CLAIM THIS FILE EXISTS FOR IS THAT THE PRIZE AND THE BOARD AGREE. 96's
-- `commish_my_tenure` is the standing warning: one ordering with two implementations
-- disagrees the first time either is touched, and here the disagreement is a player told
-- they came second on the board and third in the popup. So the top three are asserted
-- against `fantasy_standings`' own answer, walked row by row, rather than against three
-- names somebody typed into the fixture.
--
-- The second claim is about money: a promotion code is handed to exactly one account and is
-- invisible to everybody else, including the other two people who placed.
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
  ('cccccccc-0000-0000-0000-00000000000c'),
  ('dddddddd-0000-0000-0000-00000000000d')
on conflict do nothing;
insert into public.profiles(id, username) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Ada'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Bo'),
  ('cccccccc-0000-0000-0000-00000000000c', 'Cy'),
  ('dddddddd-0000-0000-0000-00000000000d', 'Di')
on conflict (id) do update set username = excluded.username;

-- FOUR ENTRANTS AND THREE PLACES, so "the top three" is a cut rather than "everybody", and
-- the account that placed nowhere is the one that proves the popup still has something to
-- say to somebody who did not win.
delete from public.fantasy_weeks where season = 2026 and week = 20;
insert into public.fantasy_weeks (season, week, locks_at, cap_musd, slots)
  values (2026, 20, now() + interval '2 hours', 90.00,
          array['QB','RB','RB','WR','WR','TE']::text[]);

insert into public.fantasy_prices (season, week, player_id, pos, price_musd, proj) values
  (2026,20,'qb1','QB',28.0,20.0), (2026,20,'qb2','QB',15.0,14.0),
  (2026,20,'rb1','RB',18.0,12.0), (2026,20,'rb2','RB',10.0,8.0),
  (2026,20,'rb3','RB',6.0,6.0),   (2026,20,'rb4','RB',6.0,6.0),
  (2026,20,'wr1','WR',15.0,11.0), (2026,20,'wr2','WR',9.0,7.0),
  (2026,20,'wr3','WR',5.0,5.0),   (2026,20,'wr4','WR',5.0,5.0),
  (2026,20,'te1','TE',8.0,7.0),   (2026,20,'te2','TE',4.0,4.0)
on conflict (season, week, player_id) do update
  set price_musd = excluded.price_musd, proj = excluded.proj;

-- Entered through `fantasy_submit`, never written by hand: a fixture that inserted straight
-- into `fantasy_entries` would be settling lineups the server would have refused.
do $$
begin
  perform public.become('aaaaaaaa-0000-0000-0000-00000000000a');
  perform public.fantasy_submit(2026,20, array['qb1','rb1','rb2','wr1','wr2','te1']::text[]);
  perform public.become('bbbbbbbb-0000-0000-0000-00000000000b');
  perform public.fantasy_submit(2026,20, array['qb2','rb1','rb3','wr2','wr3','te2']::text[]);
  perform public.become('cccccccc-0000-0000-0000-00000000000c');
  perform public.fantasy_submit(2026,20, array['qb2','rb2','rb3','wr2','wr4','te2']::text[]);
  perform public.become('dddddddd-0000-0000-0000-00000000000d');
  perform public.fantasy_submit(2026,20, array['qb2','rb3','rb4','wr3','wr4','te2']::text[]);
  perform public.become(null);
end $$;

update public.fantasy_weeks set locks_at = now() - interval '1 hour'
 where season = 2026 and week = 20;

\o
\echo ''
\echo '---------- a week still being played has no winner ----------'
do $$
declare n int;
begin
  n := public.fantasy_settle_week(2026, 20);
  perform public.claim('settling an unscored week writes nothing', n = 0);
  perform public.claim('  and there is no prize row',
    (select count(*) from public.fantasy_prizes where season = 2026 and week = 20) = 0);
  /* AND A READER IS TOLD NOTHING, which is the half that would otherwise announce a
     placement that is still moving. */
  perform public.become('aaaaaaaa-0000-0000-0000-00000000000a');
  perform public.claim('  and nobody is told where they finished',
    (select count(*) from public.fantasy_my_result(2026, 20)) = 0);
  perform public.become(null);
end $$;

\o /dev/null
-- The games happen. Spread so the four finish in a known order with no tie.
insert into public.fantasy_results (season, week, player_id, half_ppr) values
  (2026,20,'qb1',30.0), (2026,20,'qb2',10.0),
  (2026,20,'rb1',20.0), (2026,20,'rb2',12.0), (2026,20,'rb3',4.0), (2026,20,'rb4',1.0),
  (2026,20,'wr1',18.0), (2026,20,'wr2',9.0),  (2026,20,'wr3',3.0), (2026,20,'wr4',2.0),
  (2026,20,'te1',7.0),  (2026,20,'te2',2.0)
on conflict (season, week, player_id) do update set half_ppr = excluded.half_ppr;
\o

\echo ''
\echo '---------- marking it final settles it, with nobody calling anything ----------'
do $$
declare v_n int;
begin
  /* THE TRIGGER IS THE CLAIM. Nothing below calls `fantasy_settle_week`: the week is marked
     final the way the live writer marks it, and the prizes have to be there afterwards. */
  perform public.fantasy_mark_results(2026, 20, 16, 16, true);
  select count(*) into v_n from public.fantasy_prizes where season = 2026 and week = 20;
  perform public.claim('marking a week final settles the top three', v_n = 3);
  perform public.claim('  and four entrants give three places, not four',
    (select count(*) from public.fantasy_entries where season = 2026 and week = 20) = 4);
end $$;

\echo ''
\echo '---------- THE PRIZE AND THE BOARD ARE THE SAME ORDERING ----------'
do $$
declare v_board text; v_prize text;
begin
  /* Read the board the way a reader does, take its top three, and compare NAME BY NAME
     against what was settled. This is the assertion the whole file is for: two orderings
     that disagree is a player told two different things about one week. */
  select string_agg(s.display_name, '|' order by s.place)
    into v_board
    from public.fantasy_standings(2026, 20, 3) s
   where s.place <= 3;

  select string_agg(p.display_name, '|' order by p.place)
    into v_prize
    from public.fantasy_prizes p
   where p.season = 2026 and p.week = 20;

  perform public.claim('the settled three are the board''s own three, in the board''s order',
    v_board = v_prize);
  perform public.claim('  and it is three names',
    array_length(string_to_array(v_prize, '|'), 1) = 3);

  /* AND THE SCORES CAME ACROSS, rather than being recomputed into something close. */
  perform public.claim('  and each score is the board''s score',
    not exists (
      select 1 from public.fantasy_standings(2026, 20, 3) s
      join public.fantasy_prizes p
        on p.season = 2026 and p.week = 20 and p.place = s.place
      where p.score is distinct from s.score));

  /* THE ENTRY IS THE ONE THAT EARNED IT, which is what lets a placement be traced back to
     six men after the fact. Joined through the board's own key rather than through a name. */
  perform public.claim('  and each prize names the entry that won it',
    not exists (
      select 1 from public.fantasy_prizes p
       where p.season = 2026 and p.week = 20
         and not exists (select 1 from public.fantasy_entries e
                          where e.id = p.entry_id and e.user_id = p.user_id)));
end $$;

\echo ''
\echo '---------- every entrant is told where they finished ----------'
do $$
declare r record; v_seen int := 0;
begin
  for r in select id, username from public.profiles order by username loop
    perform public.become(r.id);
    declare m record;
    begin
      select * into m from public.fantasy_my_result(2026, 20);
      perform public.claim(r.username || ' is told they entered', m.entered);
      perform public.claim('  ' || r.username || ' is told the field size', m.entries = 4);
      perform public.claim('  ' || r.username || ' has a place in 1..4',
        m.place between 1 and 4);
      if m.place <= 3 then
        perform public.claim('  ' || r.username || ' has a prize place matching it',
          m.prize_place = m.place);
        v_seen := v_seen + 1;
      else
        /* THE ONE WHO PLACED NOWHERE STILL GETS A SENTENCE, and gets no prize place. A
           popup that only spoke to the podium would be silent for most of the field. */
        perform public.claim('  ' || r.username || ' placed and won nothing',
          m.prize_place is null and m.promo_code is null);
      end if;
    end;
  end loop;
  perform public.become(null);
  perform public.claim('three of the four are on the podium', v_seen = 3);
end $$;

\echo ''
\echo '---------- the code is one account''s, and invisible to the other two ----------'
do $$
declare v_winner uuid; v_second uuid; m record;
begin
  select user_id into v_winner from public.fantasy_prizes
   where season = 2026 and week = 20 and place = 1;
  select user_id into v_second from public.fantasy_prizes
   where season = 2026 and week = 20 and place = 2;

  /* BEFORE ANYTHING IS MINTED THERE IS NO CODE, which is 114's whole split: the placement
     is automatic and the money is not. */
  perform public.become(v_winner);
  select * into m from public.fantasy_my_result(2026, 20);
  perform public.claim('the winner has no code until one is minted', m.promo_code is null);
  perform public.claim('  but they know they won', m.prize_place = 1);

  update public.fantasy_prizes
     set promo_code = 'RTG-WEEK20-TESTONLY', promo_state = 'minted', minted_at = now()
   where season = 2026 and week = 20 and place = 1;

  perform public.become(v_winner);
  select * into m from public.fantasy_my_result(2026, 20);
  perform public.claim('once minted the winner is handed it',
    m.promo_code = 'RTG-WEEK20-TESTONLY');

  perform public.become(v_second);
  select * into m from public.fantasy_my_result(2026, 20);
  perform public.claim('  and second place is handed nothing', m.promo_code is null);
  perform public.claim('  while still being told they came second', m.prize_place = 2);
  perform public.become(null);
end $$;

\echo ''
\echo '---------- and nobody can read the table around the function ----------'
begin;
set local role anon;
do $$
declare n int;
begin
  /* THE TABLE HAS NO SELECT POLICY AT ALL, so RLS answers nothing and the grant answers
     nothing either. Asserted as a real read as the real role, because RLS narrows a grant
     and does not make one, and this is the one column in the mode worth money. */
  begin
    select count(*) into n from public.fantasy_prizes;
  exception when insufficient_privilege then n := -1;
  end;
  perform public.claim('a stranger reads no prize row at all', n <= 0);
end $$;
rollback;

\echo ''
\echo '---------- seen is written once, by its owner, and never unwritten ----------'
/*
 * THE TWO ACKS ARE SEPARATE STATEMENTS, AND THAT IS THE WHOLE TEETH OF THIS SECTION.
 *
 * A `do $$ ... $$` block is one transaction, so `now()` inside it is ONE timestamp however
 * many times it is read and whatever `pg_sleep` is put between the reads. Written as a
 * single block, this passed with `set result_seen_at = now()` in place of the coalesce:
 * a function that restamps on every call and one that stamps once are indistinguishable
 * inside one transaction. 110's own test found this exact trap on `updated_at`, and it
 * found it here again one file later.
 *
 * Each `do` below is its own transaction, which is also what it is in life: the page calls
 * this twice from two closes, minutes apart.
 */
do $$
declare v_winner uuid; m record;
begin
  select user_id into v_winner from public.fantasy_prizes
   where season = 2026 and week = 20 and place = 1;
  perform public.become(v_winner);
  select * into m from public.fantasy_my_result(2026, 20);
  perform public.claim('the popup has not been seen yet', m.seen is false);
  perform public.fantasy_ack_result(2026, 20);
end $$;

do $$
declare m record;
begin
  select * into m from public.fantasy_my_result(2026, 20);
  perform public.claim('  and once acknowledged it is seen', m.seen is true);
end $$;

-- A SECOND ACK MUST NOT MOVE THE CLOCK. The page calls this on every close, and a stamp
-- that reset would make "when did they first see it" unanswerable for ever.
create temporary table ack_t1 as
  select e.result_seen_at as t from public.fantasy_entries e
   where e.season = 2026 and e.week = 20 and e.result_seen_at is not null;

do $$ begin perform public.fantasy_ack_result(2026, 20); end $$;

do $$
declare t1 timestamptz; t2 timestamptz;
begin
  select t into t1 from ack_t1;
  select e.result_seen_at into t2 from public.fantasy_entries e
   where e.season = 2026 and e.week = 20 and e.result_seen_at is not null;
  perform public.claim('  and acknowledging twice does not move the stamp', t1 = t2);

  /* IT MARKS ONLY THE CALLER. */
  perform public.claim('  and nobody else was marked',
    (select count(*) from public.fantasy_entries
      where season = 2026 and week = 20 and result_seen_at is not null) = 1);
  perform public.become(null);
end $$;

\echo ''
\echo '---------- settling again is safe, and cannot move a minted prize ----------'
do $$
declare v_code text; v_n int;
begin
  v_n := public.fantasy_settle_week(2026, 20);
  perform public.claim('a second settle writes no new row', v_n = 0);
  select promo_code into v_code from public.fantasy_prizes
   where season = 2026 and week = 20 and place = 1;
  perform public.claim('  and the minted code is untouched',
    v_code = 'RTG-WEEK20-TESTONLY');
  perform public.claim('  and there are still three prizes',
    (select count(*) from public.fantasy_prizes where season = 2026 and week = 20) = 3);

  /* ONE PRIZE PER ACCOUNT PER WEEK, asserted as the constraint rather than as a count: a
     second row for one person is a settle that ran against a changed board, and it has to
     be loud rather than a duplicate popup. */
  begin
    insert into public.fantasy_prizes (season, week, place, user_id, entry_id, score)
    select 2026, 20, 3, p.user_id, p.entry_id, p.score
      from public.fantasy_prizes p
     where p.season = 2026 and p.week = 20 and p.place = 1;
    perform public.claim('  a second prize for one account is refused', false);
  exception when unique_violation then
    perform public.claim('  a second prize for one account is refused', true);
  end;
end $$;

\echo ''
\echo '---------- the profile mark is the reader''s own and nobody else''s ----------'
do $$
declare v_winner uuid; v_none uuid; n int;
begin
  select user_id into v_winner from public.fantasy_prizes
   where season = 2026 and week = 20 and place = 1;
  select e.user_id into v_none from public.fantasy_entries e
   where e.season = 2026 and e.week = 20
     and not exists (select 1 from public.fantasy_prizes p where p.user_id = e.user_id)
   limit 1;

  perform public.become(v_winner);
  select count(*) into n from public.fantasy_my_wins();
  perform public.claim('a winner''s profile carries the win', n = 1);
  perform public.claim('  and it is first place',
    (select place from public.fantasy_my_wins() limit 1) = 1);

  perform public.become(v_none);
  select count(*) into n from public.fantasy_my_wins();
  perform public.claim('  and somebody who placed nowhere carries none', n = 0);

  perform public.become(null);
  select count(*) into n from public.fantasy_my_wins();
  perform public.claim('  and a signed out reader carries none', n = 0);
end $$;

\echo ''
\echo 'ALL PRIZE CLAIMS PASSED'
