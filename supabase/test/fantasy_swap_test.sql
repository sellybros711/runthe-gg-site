-- ---------------------------------------------------------------------------
-- fantasy_swap_test.sql : 119, driven rather than read.
--
--   createdb fantasy
--   psql -d fantasy -f supabase/test/fantasy_base.sql
--   psql -d fantasy -f supabase/109_fantasy_challenge.sql     (then 110 to 115, in order)
--   psql -d fantasy -f supabase/119_fantasy_swap.sql
--   psql -d fantasy -f supabase/test/fantasy_swap_test.sql
--
-- THE CLAIM IS THAT A MAN RULED OUT CAN BE SWAPPED BEFORE HIS GAME AND NOTHING ELSE CAN.
-- Every refusal is driven, and each is asserted by its own sentence rather than by "it
-- raised", because a swap refused for the wrong reason is a rule that is not being checked.
-- Week 23 is this file's own.
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

/* THE EXCEPTION IS CAUGHT AND ITS TEXT RETURNED, and asserted OUTSIDE the block. A claim
   made inside the `begin` arm would be caught by the block's own handler and read as a
   pass, which is the exact shape 107's test shipped with. */
create or replace function public.swap_says(p_out text, p_in text)
returns text language plpgsql as $$
begin
  perform public.fantasy_swap(2026, 23, p_out, p_in);
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

\o /dev/null

insert into auth.users(id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-00000000000b')
on conflict do nothing;
insert into public.profiles(id, username) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Ada'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Bo')
on conflict (id) do update set username = excluded.username;

delete from public.fantasy_out where season = 2026 and week = 23;
delete from public.fantasy_entries where season = 2026 and week = 23;
delete from public.fantasy_results where season = 2026 and week = 23;
delete from public.fantasy_prices where season = 2026 and week = 23;
delete from public.fantasy_weeks where season = 2026 and week = 23;
insert into public.fantasy_weeks (season, week, locks_at, cap_musd, slots) values
  (2026, 23, now() + interval '2 hours', 90.00, array['QB','RB','RB','WR','WR','TE']::text[]);

-- A week of three kickoffs: one played, one this afternoon, one tonight.
insert into public.fantasy_prices (season, week, player_id, pos, price_musd, proj, team, kick)
values
  (2026,23,'qb1','QB',28.0,20.0,'AAA', now() + interval '3 hours'),
  (2026,23,'qb2','QB',15.0,14.0,'BBB', now() + interval '6 hours'),
  (2026,23,'qb3','QB',40.0,24.0,'CCC', now() + interval '6 hours'),
  (2026,23,'rb1','RB',18.0,12.0,'AAA', now() + interval '3 hours'),
  (2026,23,'rb2','RB',10.0,8.0, 'BBB', now() + interval '6 hours'),
  (2026,23,'rb3','RB', 6.0,6.0, 'CCC', now() + interval '6 hours'),
  (2026,23,'rb4','RB', 7.0,7.5, 'DDD', now() - interval '1 hour'),
  (2026,23,'wr1','WR',15.0,11.0,'AAA', now() + interval '3 hours'),
  (2026,23,'wr2','WR', 9.0,7.0, 'BBB', now() + interval '6 hours'),
  (2026,23,'wr3','WR', 5.0,5.0, 'CCC', now() + interval '6 hours'),
  (2026,23,'te1','TE', 8.0,7.0, 'AAA', now() + interval '3 hours'),
  (2026,23,'te2','TE', 4.0,4.0, 'BBB', now() + interval '6 hours'),
  (2026,23,'te3','TE', 5.0,5.0, null,  null);

do $$
begin
  perform public.become('aaaaaaaa-0000-0000-0000-00000000000a');
  perform public.fantasy_submit(2026,23, array['qb1','rb1','rb2','wr1','wr2','te1']::text[]);
  perform public.become(null);
end $$;

\o
\echo ''
\echo '---------- the rule ----------'
do $$
declare s text; e public.fantasy_entries%rowtype;
begin
  perform public.become('aaaaaaaa-0000-0000-0000-00000000000a');

  s := public.swap_says('rb1', 'rb3');
  perform public.claim('a healthy man cannot be swapped: ' || s,
    s = 'only a player ruled out can be swapped');

  insert into public.fantasy_out (season, week, player_id, status) values
    (2026,23,'rb1','out'), (2026,23,'wr2','doubtful'), (2026,23,'rb2','out'),
    (2026,23,'te1','off');

  s := public.swap_says('qb2', 'qb3');
  perform public.claim('a man not in the lineup cannot be swapped out: ' || s,
    s = 'that player is not in your lineup');
  s := public.swap_says('rb1', 'wr3');
  perform public.claim('a swap keeps the position: ' || s,
    s = 'a swap has to be the same position');
  s := public.swap_says('rb1', 'rb2');
  perform public.claim('the man coming in cannot already be in the lineup: ' || s,
    s = 'he is already in your lineup');
  s := public.swap_says('wr2', 'nobody');
  perform public.claim('the man coming in has to be on the board: ' || s,
    s = 'that player is not on this week''s board');
  s := public.swap_says('rb1', 'rb4');
  perform public.claim('the man coming in cannot have kicked off: ' || s,
    s = 'his game has already started');
  s := public.swap_says('te1', 'te3');
  perform public.claim('an unknown kickoff is refused, never read as not started: ' || s,
    s = 'his game has already started');

  /* The cap. The lineup is 88 of 90 (qb1 28, rb1 18, rb2 10, wr1 15, wr2 9, te1 8), so
     rb1's 18 back and a 21 in is 91. */
  insert into public.fantasy_prices (season, week, player_id, pos, price_musd, proj, team, kick)
  values (2026,23,'rb9','RB',21.0,15.0,'CCC', now() + interval '6 hours');
  s := public.swap_says('rb1', 'rb9');
  perform public.claim('a swap that breaks the cap is refused: ' || s,
    s = 'that swap puts your lineup over the cap');

  /* And a replacement ruled out himself. */
  insert into public.fantasy_out (season, week, player_id, status) values (2026,23,'rb3','out');
  s := public.swap_says('rb1', 'rb3');
  perform public.claim('a man ruled out cannot come in: ' || s, s = 'he is ruled out too');
  delete from public.fantasy_out where season = 2026 and week = 23 and player_id = 'rb3';

  -- The one that is allowed.
  s := public.swap_says('rb1', 'rb3');
  perform public.claim('a man ruled out is swapped for one who is not: ' || s, s = 'ok');
  select * into e from public.fantasy_entries
   where season = 2026 and week = 23 and user_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  perform public.claim('  the new man is in the lineup, in the old man''s place',
    e.picks = array['qb1','rb3','rb2','wr1','wr2','te1']::text[]);
  perform public.claim('  the spend is the lineup as it now stands (88 - 18 + 6)',
    e.spend = 76.00);
  perform public.claim('  and so is the projection (65 - 12 + 6)', e.projected = 59.00);
  perform public.claim('  the swap is on the row',
    jsonb_array_length(e.swaps) = 1 and e.swaps->0->>'out' = 'rb1'
      and e.swaps->0->>'in' = 'rb3');

  s := public.swap_says('rb1', 'rb4');
  perform public.claim('the same man cannot be swapped twice: ' || s,
    s = 'that player is not in your lineup');

  -- A game already under way.
  update public.fantasy_prices set kick = now() - interval '5 minutes'
   where season = 2026 and week = 23 and player_id = 'wr2';
  s := public.swap_says('wr2', 'wr3');
  perform public.claim('a man whose game has started cannot be swapped: ' || s,
    s = 'his game has started, so he cannot be swapped');

  -- And one with no kickoff published.
  update public.fantasy_prices set kick = null
   where season = 2026 and week = 23 and player_id = 'rb2';
  s := public.swap_says('rb2', 'rb9');
  perform public.claim('a man with no known kickoff is refused: ' || s,
    s = 'his kickoff is not known yet, so he cannot be swapped');

  perform public.become('bbbbbbbb-0000-0000-0000-00000000000b');
  s := public.swap_says('te1', 'te2');
  perform public.claim('somebody with no entry cannot swap: ' || s,
    s = 'you have not entered this week');
  perform public.become(null);
  s := public.swap_says('te1', 'te2');
  perform public.claim('a stranger cannot swap: ' || s, s = 'sign in to swap a player');

  /* AFTER THE LOCK, which is when it matters most: a man ruled out on the Sunday morning of
     a week that locked on the Thursday. */
  update public.fantasy_weeks set locks_at = now() - interval '1 hour'
   where season = 2026 and week = 23;
  perform public.become('aaaaaaaa-0000-0000-0000-00000000000a');
  s := public.swap_says('te1', 'te2');
  perform public.claim('a swap is allowed after the lock, before his game: ' || s, s = 'ok');
  perform public.become(null);
end $$;

\echo ''
\echo '---------- the score follows the swap ----------'
insert into public.fantasy_results (season, week, player_id, half_ppr) values
  (2026,23,'rb1',25.0), (2026,23,'rb3',4.0), (2026,23,'te1',9.0), (2026,23,'te2',2.0)
on conflict (season, week, player_id) do update set half_ppr = excluded.half_ppr;
do $$
declare v numeric;
begin
  select s.score into v from public.fantasy_standings(2026, 23, 50) s;
  perform public.claim('the board scores the men now in the lineup, not the men swapped out',
    v = 6.0);
end $$;

\echo ''
\echo '---------- who may do what ----------'
do $$
begin
  perform public.claim('an account may call the swap',
    has_function_privilege('authenticated', 'public.fantasy_swap(int,int,text,text)', 'execute'));
  perform public.claim('a stranger may not',
    not has_function_privilege('anon', 'public.fantasy_swap(int,int,text,text)', 'execute'));
  perform public.claim('anybody may read who is out',
    has_table_privilege('anon', 'public.fantasy_out', 'select'));
  perform public.claim('nobody may write it',
    not has_table_privilege('authenticated', 'public.fantasy_out', 'insert')
      and not has_table_privilege('anon', 'public.fantasy_out', 'insert'));
end $$;

delete from public.fantasy_out where season = 2026 and week = 23;
delete from public.fantasy_entries where season = 2026 and week = 23;
delete from public.fantasy_results where season = 2026 and week = 23;
delete from public.fantasy_prices where season = 2026 and week = 23;
delete from public.fantasy_weeks where season = 2026 and week = 23;
\echo 'all swap checks passed'
