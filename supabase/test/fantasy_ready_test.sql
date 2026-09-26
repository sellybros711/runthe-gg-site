-- ---------------------------------------------------------------------------
-- fantasy_ready_test.sql : 115, driven rather than read.
--
--   createdb fantasy
--   psql -d fantasy -f supabase/test/fantasy_base.sql
--   psql -d fantasy -f supabase/109_fantasy_challenge.sql     (then 110 to 114, in order)
--   psql -d fantasy -f supabase/115_fantasy_result_when_ready.sql
--   psql -d fantasy -f supabase/test/fantasy_ready_test.sql
--
-- THE CLAIM IS THAT NOBODY IS TOLD HOW THE WEEK WENT UNTIL THE WINNER'S CODE EXISTS, and
-- that "nobody" includes second, third and the rest of the field. Then the two ways a week
-- becomes ready: a code is minted, or the week is voided because one entrant is not a
-- competition.
--
-- `fantasy_prizes_test.sql` is 114's file and asserts the old behaviour (a result the moment
-- the week is scored), so it runs BEFORE 115 is applied and is not expected to pass after.
-- This file uses its own weeks, 21 and 22, so the two never share a row.
--
-- AND THIS FILE IS THE CODE ERA TOO. It asserts a first place row waits at 'none' until a
-- code is minted, and 120 pays first place inside the settle, so it runs BEFORE 120 is
-- applied. `fantasy_pass_test.sql` is what drives the popup against 120.
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

-- Two weeks: 21 has the whole field, 22 has one entrant.
delete from public.fantasy_prizes where season = 2026 and week in (21, 22);
delete from public.fantasy_entries where season = 2026 and week in (21, 22);
delete from public.fantasy_results where season = 2026 and week in (21, 22);
delete from public.fantasy_prices where season = 2026 and week in (21, 22);
delete from public.fantasy_weeks where season = 2026 and week in (21, 22);
insert into public.fantasy_weeks (season, week, locks_at, cap_musd, slots) values
  (2026, 21, now() + interval '2 hours', 90.00, array['QB','RB','RB','WR','WR','TE']::text[]),
  (2026, 22, now() + interval '2 hours', 90.00, array['QB','RB','RB','WR','WR','TE']::text[]);

insert into public.fantasy_prices (season, week, player_id, pos, price_musd, proj)
select 2026, w, p.id, p.pos, p.price, p.proj
  from (values (21), (22)) ws(w),
       (values ('qb1','QB',28.0,20.0), ('qb2','QB',15.0,14.0),
               ('rb1','RB',18.0,12.0), ('rb2','RB',10.0,8.0),
               ('rb3','RB',6.0,6.0),   ('rb4','RB',6.0,6.0),
               ('wr1','WR',15.0,11.0), ('wr2','WR',9.0,7.0),
               ('wr3','WR',5.0,5.0),   ('wr4','WR',5.0,5.0),
               ('te1','TE',8.0,7.0),   ('te2','TE',4.0,4.0)) p(id, pos, price, proj);

do $$
begin
  perform public.become('aaaaaaaa-0000-0000-0000-00000000000a');
  perform public.fantasy_submit(2026,21, array['qb1','rb1','rb2','wr1','wr2','te1']::text[]);
  perform public.fantasy_submit(2026,22, array['qb1','rb1','rb2','wr1','wr2','te1']::text[]);
  perform public.become('bbbbbbbb-0000-0000-0000-00000000000b');
  perform public.fantasy_submit(2026,21, array['qb2','rb1','rb3','wr2','wr3','te2']::text[]);
  perform public.become('cccccccc-0000-0000-0000-00000000000c');
  perform public.fantasy_submit(2026,21, array['qb2','rb2','rb3','wr2','wr4','te2']::text[]);
  perform public.become('dddddddd-0000-0000-0000-00000000000d');
  perform public.fantasy_submit(2026,21, array['qb2','rb3','rb4','wr3','wr4','te2']::text[]);
  perform public.become(null);
end $$;

update public.fantasy_weeks set locks_at = now() - interval '1 hour'
 where season = 2026 and week in (21, 22);

insert into public.fantasy_results (season, week, player_id, half_ppr)
select 2026, w, r.id, r.pts
  from (values (21), (22)) ws(w),
       (values ('qb1',30.0), ('qb2',10.0), ('rb1',20.0), ('rb2',12.0), ('rb3',4.0),
               ('rb4',1.0),  ('wr1',18.0), ('wr2',9.0),  ('wr3',3.0),  ('wr4',2.0),
               ('te1',7.0),  ('te2',2.0)) r(id, pts)
on conflict (season, week, player_id) do update set half_ppr = excluded.half_ppr;

\o
\echo ''
\echo '---------- the week is over and nobody is told yet ----------'
do $$
declare r record; n int;
begin
  perform public.fantasy_mark_results(2026, 21, 16, 16, true);
  perform public.claim('marking the week final still settles the top three',
    (select count(*) from public.fantasy_prizes where season = 2026 and week = 21) = 3);
  perform public.claim('  and first place has no code yet',
    (select promo_state from public.fantasy_prizes
      where season = 2026 and week = 21 and place = 1) = 'none');

  /* EVERY ENTRANT, NOT ONLY THE WINNER. Second place being told before the winner has
     their prize is the same broken promise from the other side. */
  for r in select id, username from public.profiles order by username loop
    perform public.become(r.id);
    select count(*) into n from public.fantasy_my_result(2026, 21);
    perform public.claim('  ' || r.username || ' is told nothing while there is no code', n = 0);
  end loop;
  perform public.become(null);
end $$;

\echo ''
\echo '---------- once the code exists, everybody is told, and only the winner holds it ----------'
do $$
declare r record; m record; v_winner uuid; v_told int := 0;
begin
  select user_id into v_winner from public.fantasy_prizes
   where season = 2026 and week = 21 and place = 1;

  update public.fantasy_prizes
     set promo_code = 'RTG-W21-TESTONLY', promo_state = 'minted', minted_at = now()
   where season = 2026 and week = 21 and place = 1;

  for r in select id, username from public.profiles order by username loop
    perform public.become(r.id);
    select * into m from public.fantasy_my_result(2026, 21);
    if m.entered then v_told := v_told + 1; end if;
    if r.id = v_winner then
      perform public.claim('  the winner is handed their code',
        m.place = 1 and m.promo_code = 'RTG-W21-TESTONLY');
    else
      perform public.claim('  ' || r.username || ' is told where they came, with no code',
        m.place between 2 and 4 and m.promo_code is null);
    end if;
  end loop;
  perform public.become(null);
  perform public.claim('all four entrants are told', v_told = 4);
end $$;

\echo ''
\echo '---------- redeemed is still ready ----------'
do $$
declare n int;
begin
  update public.fantasy_prizes set promo_state = 'redeemed'
   where season = 2026 and week = 21 and place = 1;
  perform public.become('dddddddd-0000-0000-0000-00000000000d');
  select count(*) into n from public.fantasy_my_result(2026, 21);
  perform public.claim('a redeemed code does not take the result away again', n = 1);
  perform public.become(null);
end $$;

\echo ''
\echo '---------- one entrant: settled, then voided, then told ----------'
do $$
declare n int; m record;
begin
  perform public.fantasy_mark_results(2026, 22, 16, 16, true);
  perform public.claim('a field of one still settles a first place',
    (select count(*) from public.fantasy_prizes where season = 2026 and week = 22) = 1);

  perform public.become('aaaaaaaa-0000-0000-0000-00000000000a');
  select count(*) into n from public.fantasy_my_result(2026, 22);
  perform public.claim('  and the lone entrant is told nothing before a decision', n = 0);

  /* What the minting script writes when it declines to pay a field of one. */
  update public.fantasy_prizes set promo_state = 'void'
   where season = 2026 and week = 22 and place = 1;

  select * into m from public.fantasy_my_result(2026, 22);
  perform public.claim('  a voided week is told', m.entered and m.place = 1);
  perform public.claim('  with no code in it', m.promo_code is null);
  perform public.claim('  and a field of one', m.entries = 1);
  perform public.become(null);
end $$;

\echo ''
\echo '---------- the rest of 114 is unchanged ----------'
do $$
declare n int;
begin
  perform public.become(null);
  select count(*) into n from public.fantasy_my_result(2026, 21);
  perform public.claim('a signed out reader is told nothing', n = 0);
  perform public.become('aaaaaaaa-0000-0000-0000-00000000000a');
  select count(*) into n from public.fantasy_my_result(2026, 99);
  perform public.claim('a week that does not exist is told nothing', n = 0);
  perform public.become(null);
end $$;

\echo ''
\echo 'fantasy_ready_test: all claims hold'
