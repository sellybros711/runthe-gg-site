-- ---------------------------------------------------------------------------
-- cfb_fantasy_test.sql : 128, driven rather than read.
--
--   createdb cfbf
--   psql -d cfbf -f supabase/test/fantasy_base.sql
--   sed -n '20,$p' supabase/test/dynboard_base.sql | psql -d cfbf
--   psql -d cfbf -f supabase/98_football_gauntlet_board.sql
--   psql -d cfbf -c 'create table public.subscriptions(user_id uuid, status text, current_period_end timestamptz);'
--   psql -d cfbf -f supabase/101_premium_bundles.sql       (then 107, 109 to 115, 119, 120, 124, 126)
--   psql -d cfbf -f supabase/128_cfb_fantasy.sql
--   psql -d cfbf -f supabase/test/cfb_fantasy_test.sql
--
-- Three claims carry the file. The college swap takes ANY man before his game, never for a
-- dearer one and never for one outside the week's band. The college competition is its own:
-- an NFL entry and a college entry for the same week number never see each other. And the
-- winner is paid 30 days of Pro through `premium_products()`, under a `fantasy:cfb-` source.
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

/* What a call refuses with, or null when it did not refuse. An exception test cannot assert
   inside the block it is watching (107's lesson), so the message comes out and is read after. */
create or replace function public.refusal(p_sql text)
returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end $$;

create or replace function public.pro_of(p_user uuid)
returns text[] language plpgsql as $$
declare v text[];
begin
  perform public.become(p_user);
  v := public.premium_products();
  perform public.become(null);
  return v;
end $$;

\o /dev/null
insert into auth.users(id) values
  ('a1000000-0000-0000-0000-00000000000a'),
  ('b1000000-0000-0000-0000-00000000000b'),
  ('c1000000-0000-0000-0000-00000000000c')
on conflict do nothing;
insert into public.profiles(id, username) values
  ('a1000000-0000-0000-0000-00000000000a', 'Ace'),
  ('b1000000-0000-0000-0000-00000000000b', 'Bea'),
  ('c1000000-0000-0000-0000-00000000000c', 'Cal')
on conflict (id) do update set username = excluded.username;
delete from public.premium_unlocks where user_id in (
  'a1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-00000000000b',
  'c1000000-0000-0000-0000-00000000000c');
delete from public.cfb_fantasy_weeks where season = 2026 and week in (6, 7);
delete from public.fantasy_weeks where season = 2026 and week = 6;
\o

\echo ''
\echo '---------- the college week is its own ----------'
do $$
declare
  ace uuid := 'a1000000-0000-0000-0000-00000000000a';
  bea uuid := 'b1000000-0000-0000-0000-00000000000b';
  early timestamptz := now() + interval '3 hours';
  late  timestamptz := now() + interval '9 hours';
  r text;
begin
  insert into public.cfb_fantasy_weeks (season, week, locks_at, cap_musd, slots, swap_pct, swap_floor_musd)
  values (2026, 6, early, 110, array['QB','RB','RB','WR','WR','TE'], 0.25, 5);
  insert into public.cfb_fantasy_prices (season, week, player_id, pos, price_musd, proj, team, kick) values
    (2026,6,'qb1','QB',40.0,28.0,'UGA',early), (2026,6,'qb2','QB',32.0,24.0,'OSU',late),
    (2026,6,'qb3','QB',20.0,18.0,'LSU',late),  (2026,6,'qb4','QB',33.0,25.0,'UGA',early),
    (2026,6,'rb1','RB',20.0,15.0,'UGA',early), (2026,6,'rb2','RB',12.0,11.0,'OSU',late),
    (2026,6,'rb3','RB',8.0,8.0,'LSU',late),    (2026,6,'rb4','RB',6.0,6.0,'OSU',late),
    (2026,6,'wr1','WR',15.0,13.0,'UGA',early), (2026,6,'wr2','WR',9.0,9.0,'OSU',late),
    (2026,6,'wr3','WR',5.0,5.0,'LSU',late),    (2026,6,'wr4','WR',4.0,4.0,'LSU',late),
    (2026,6,'te1','TE',6.0,6.0,'OSU',late),    (2026,6,'te2','TE',4.0,4.0,'LSU',late);

  /* The NFL table holds a week 6 of its own. */
  insert into public.fantasy_weeks (season, week, locks_at, cap_musd, slots)
  values (2026, 6, early, 110, array['QB','RB','RB','WR','WR','TE']);

  perform public.become(ace);
  perform public.cfb_fantasy_submit(2026, 6, array['qb1','rb1','rb2','wr1','wr2','te1']);
  perform public.become(bea);
  perform public.cfb_fantasy_submit(2026, 6, array['qb3','rb3','rb4','wr3','wr4','te2']);
  perform public.become(null);

  perform public.claim('two college entries', public.cfb_fantasy_entry_count(2026, 6) = 2);
  perform public.claim('  and none on the NFL week of the same number',
    public.fantasy_entry_count(2026, 6) = 0);

  perform public.become(ace);
  r := public.refusal($q$select public.cfb_fantasy_submit(2026, 6,
          array['qb2','rb1','rb2','wr1','wr2','te1'])$q$);
  perform public.claim('a second entry is refused: ' || coalesce(r, 'NOT REFUSED'),
    r = 'you have already entered this week');
  perform public.become(bea);
  delete from public.cfb_fantasy_entries where user_id = bea and season = 2026 and week = 6;
  r := public.refusal($q$select public.cfb_fantasy_submit(2026, 6,
          array['qb1','qb4','rb2','wr1','wr2','te1'])$q$);
  perform public.claim('the wrong shape is refused', r like 'that lineup is the wrong shape%');
  r := public.refusal($q$select public.cfb_fantasy_submit(2026, 6,
          array['qb1','rb1','rb2','wr1','wr2','nope'])$q$);
  perform public.claim('a man not on the board is refused', r like '%not on this week''s board');
  perform public.cfb_fantasy_submit(2026, 6, array['qb3','rb3','rb4','wr3','wr4','te2']);
  perform public.become(null);

  perform public.become(null);
  r := public.refusal($q$select public.cfb_fantasy_submit(2026, 6,
          array['qb3','rb3','rb4','wr3','wr4','te2'])$q$);
  perform public.claim('a signed out submit is refused', r = 'sign in to enter');
end $$;

\echo ''
\echo '---------- the swap: any man, before his game, same tier or a little below ----------'
do $$
declare
  ace uuid := 'a1000000-0000-0000-0000-00000000000a';
  r text;
  e record;
begin
  perform public.become(ace);
  /* qb1 costs 40. The band is max(25% of 40, 5) = 10, so 30 to 40 is in range. */
  r := public.refusal($q$select public.cfb_fantasy_swap(2026, 6, 'qb1', 'qb3')$q$);
  perform public.claim('a man far below him in price is refused: ' || coalesce(r, 'NOT REFUSED'),
    r = 'that player is too far below him in price');
  r := public.refusal($q$select public.cfb_fantasy_swap(2026, 6, 'rb2', 'rb1')$q$);
  perform public.claim('a man already in the lineup is refused',
    r = 'he is already in your lineup');
  r := public.refusal($q$select public.cfb_fantasy_swap(2026, 6, 'te1', 'wr3')$q$);
  perform public.claim('another position is refused', r = 'a swap has to be the same position');
  r := public.refusal($q$select public.cfb_fantasy_swap(2026, 6, 'qb3', 'qb2')$q$);
  perform public.claim('a man not in the lineup is refused',
    r = 'that player is not in your lineup');

  /* A healthy swap: qb1 (40, early) for qb2 (32, late). 32 is inside 30 to 40. */
  perform public.cfb_fantasy_swap(2026, 6, 'qb1', 'qb2');
  select * into e from public.cfb_fantasy_my_entry(2026, 6);
  perform public.claim('the swap lands', 'qb2' = any (e.picks) and not ('qb1' = any (e.picks)));
  perform public.claim('  spend drops by the difference', e.spend = 120.0 - 40 + 32 - 8
    or e.spend = (select sum(price_musd) from public.cfb_fantasy_prices
                   where season = 2026 and week = 6 and player_id = any (e.picks)));
  perform public.claim('  projection follows', e.projected = (select sum(proj)
    from public.cfb_fantasy_prices where season = 2026 and week = 6 and player_id = any (e.picks)));
  perform public.claim('  and the history is kept', jsonb_array_length(e.swaps) = 1);
  /* qb2 is 32 now and qb4 is 33: a dollar dearer, in the band, not started. */
  r := public.refusal($q$select public.cfb_fantasy_swap(2026, 6, 'qb2', 'qb4')$q$);
  perform public.claim('an upgrade is refused: ' || coalesce(r, 'NOT REFUSED'),
    r = 'a swap cannot cost more than the man going out');

  /* The band's floor: a $6M man has a band of $5M, so $4M... te1 is 6, te2 is 4, in range. */
  perform public.cfb_fantasy_swap(2026, 6, 'te1', 'te2');
  select * into e from public.cfb_fantasy_my_entry(2026, 6);
  perform public.claim('the floor of the band lets a cheap man step down',
    'te2' = any (e.picks));

  /* After his game starts, no swap. */
  update public.cfb_fantasy_prices set kick = now() - interval '1 minute'
   where season = 2026 and week = 6 and player_id = 'rb1';
  r := public.refusal($q$select public.cfb_fantasy_swap(2026, 6, 'rb1', 'rb2')$q$);
  perform public.claim('a man whose game has started cannot go out',
    r = 'his game has started, so he cannot be swapped');
  update public.cfb_fantasy_prices set kick = now() - interval '1 minute'
   where season = 2026 and week = 6 and player_id = 'wr3';
  r := public.refusal($q$select public.cfb_fantasy_swap(2026, 6, 'wr2', 'wr3')$q$);
  perform public.claim('a man whose game has started cannot come in',
    r = 'his game has already started');
  update public.cfb_fantasy_prices set kick = null
   where season = 2026 and week = 6 and player_id = 'wr2';
  r := public.refusal($q$select public.cfb_fantasy_swap(2026, 6, 'wr2', 'wr4')$q$);
  perform public.claim('an unknown kickoff is refused, never read as not started',
    r = 'his kickoff is not known yet, so he cannot be swapped');
  perform public.become(null);
end $$;

\echo ''
\echo '---------- the board opens at the lock, and the winner is paid ----------'
do $$
declare
  ace uuid := 'a1000000-0000-0000-0000-00000000000a';
  bea uuid := 'b1000000-0000-0000-0000-00000000000b';
  b jsonb;
  m record;
  pz public.cfb_fantasy_prizes%rowtype;
begin
  b := public.cfb_fantasy_board(2026, 6, 50);
  perform public.claim('before the lock, no rows', jsonb_array_length(b->'rows') = 0);
  perform public.claim('  and the entrants by name only',
    jsonb_array_length(b->'entrants') = 2
    and (select bool_and((x ?& array['entry_no','display_name','is_me'])
                         and (select count(*) from jsonb_object_keys(x)) = 3)
           from jsonb_array_elements(b->'entrants') x));

  update public.cfb_fantasy_weeks set locks_at = now() - interval '1 minute'
   where season = 2026 and week = 6;
  insert into public.cfb_fantasy_results (season, week, player_id, half_ppr, line) values
    (2026,6,'qb2',30.0,'300 pass yds, 3 TD'), (2026,6,'rb1',18.0,null), (2026,6,'rb2',12.0,null),
    (2026,6,'wr1',20.0,null), (2026,6,'wr2',5.0,null), (2026,6,'te2',2.0,null),
    (2026,6,'qb3',10.0,null), (2026,6,'rb3',4.0,null), (2026,6,'rb4',3.0,null),
    (2026,6,'wr3',3.0,null), (2026,6,'wr4',1.0,null);
  b := public.cfb_fantasy_board(2026, 6, 50);
  perform public.claim('after the lock, two rows', jsonb_array_length(b->'rows') = 2);
  perform public.claim('  and no entrants', jsonb_array_length(b->'entrants') = 0);
  perform public.claim('  scored off the swapped lineup',
    ((b->'rows'->0->>'score')::numeric) = 87.0);

  perform public.claim('before the week is final, nobody is told',
    not exists (select 1 from public.cfb_fantasy_prizes where season = 2026 and week = 6));
  perform public.cfb_fantasy_mark_results(2026, 6, 20, 20, true);

  select * into pz from public.cfb_fantasy_prizes where season = 2026 and week = 6 and place = 1;
  perform public.claim('first place is the account that scored most', pz.user_id = ace);
  perform public.claim('  and it is paid by the settle itself', pz.promo_state = 'granted');
  perform public.claim('  the winner has both products', pro_of(ace) @> array['ps_premium','cfb_premium']);
  perform public.claim('  under a college fantasy source',
    (select bool_and(u.source = 'fantasy:cfb-2026-w6') from public.premium_unlocks u
      where u.user_id = ace));
  perform public.claim('  the loser holds nothing', pro_of(bea) = '{}');

  perform public.become(ace);
  select * into m from public.cfb_fantasy_my_result(2026, 6);
  perform public.claim('the winner reads first', m.place = 1 and m.prize_place = 1);
  perform public.claim('  and the pass end', m.pass_until > now() + interval '29 days');
  perform public.claim('the ack is the server''s', public.cfb_fantasy_ack_result(2026, 6));
  select * into m from public.cfb_fantasy_my_result(2026, 6);
  perform public.claim('  and it is remembered', m.seen);
  perform public.claim('the wins list', (select count(*) from public.cfb_fantasy_my_wins()) = 1);
  perform public.become(null);

  perform public.claim('the NFL prize table is untouched',
    not exists (select 1 from public.fantasy_prizes where season = 2026 and week = 6));
end $$;

\echo ''
\echo '---------- a field of one is voided, and the writers are not for browsers ----------'
do $$
declare
  cal uuid := 'c1000000-0000-0000-0000-00000000000c';
  pz public.cfb_fantasy_prizes%rowtype;
  anon_can boolean;
begin
  insert into public.cfb_fantasy_weeks (season, week, locks_at, cap_musd, slots)
  values (2026, 7, now() + interval '1 hour', 110, array['QB','RB','RB','WR','WR','TE']);
  insert into public.cfb_fantasy_prices (season, week, player_id, pos, price_musd, proj, team, kick)
  select 2026, 7, player_id, pos, price_musd, proj, team, now() + interval '2 hours'
    from public.cfb_fantasy_prices where season = 2026 and week = 6;
  perform public.become(cal);
  perform public.cfb_fantasy_submit(2026, 7, array['qb3','rb3','rb4','wr3','wr4','te2']);
  perform public.become(null);
  update public.cfb_fantasy_weeks set locks_at = now() - interval '1 minute'
   where season = 2026 and week = 7;
  perform public.cfb_fantasy_mark_results(2026, 7, 20, 20, true);
  select * into pz from public.cfb_fantasy_prizes where season = 2026 and week = 7 and place = 1;
  perform public.claim('a field of one is voided', pz.promo_state = 'void');
  perform public.claim('  and pays nobody', pro_of(cal) = '{}');

  select has_function_privilege('anon', 'public.cfb_fantasy_put_games(int,int,jsonb)', 'execute')
    into anon_can;
  perform public.claim('a browser cannot write the scoreboard', not anon_can);
  select has_function_privilege('anon', 'public.cfb_fantasy_mark_results(int,int,int,int,boolean)', 'execute')
    into anon_can;
  perform public.claim('a browser cannot mark a week final', not anon_can);
  select has_table_privilege('anon', 'public.cfb_fantasy_entries', 'select') into anon_can;
  perform public.claim('a browser cannot read the entries table', not anon_can);
  select has_table_privilege('anon', 'public.cfb_fantasy_results', 'select') into anon_can;
  perform public.claim('a browser can read the results table', anon_can);
end $$;

\echo ''
\echo '---------- a game only moves forwards ----------'
do $$
declare n int; g record;
begin
  n := public.cfb_fantasy_put_games(2026, 6, '[{"game_id":"1","away":"OSU","home":"UGA",
        "kick":"2026-10-03T19:30:00Z","state":"in","away_score":7,"home_score":3,"period":2,
        "clock":"4:00","source":"espn"}]'::jsonb);
  n := public.cfb_fantasy_put_games(2026, 6, '[{"game_id":"1","away":"OSU","home":"UGA",
        "kick":"2026-10-03T19:30:00Z","state":"pre","source":"schedule"}]'::jsonb);
  select * into g from public.cfb_fantasy_games where season = 2026 and week = 6 and game_id = '1';
  perform public.claim('a pre-game tick does not rewind a live game', g.state = 'in' and g.away_score = 7);
end $$;

\echo ''
\echo 'all claims passed'
