-- ---------------------------------------------------------------------------
-- fantasy_pass_test.sql : 120, driven rather than read.
--
--   createdb pass
--   psql -d pass -f supabase/test/fantasy_base.sql
--   sed -n '20,$p' supabase/test/dynboard_base.sql | psql -d pass     (ps_runs, for 107)
--   psql -d pass -f supabase/98_football_gauntlet_board.sql
--   psql -d pass -c 'create table public.subscriptions(user_id uuid, status text, current_period_end timestamptz);'
--   psql -d pass -f supabase/101_premium_bundles.sql
--   psql -d pass -f supabase/107_board_pro_and_live.sql
--   psql -d pass -f supabase/109_fantasy_challenge.sql     (then 110 to 115, and 119)
--   psql -d pass -f supabase/120_fantasy_pro_pass.sql
--   psql -d pass -f supabase/test/fantasy_pass_test.sql
--
-- THE CLAIM IS THAT FIRST PLACE GETS PRO FOR 30 DAYS AND THEN DOES NOT HAVE IT. Both
-- halves are asserted through `premium_products()`, which is the one question every Pro
-- door on the site asks, rather than by reading the row, because a row with the right date
-- on it that the gate did not honour would pass a test of the row.
--
-- Weeks 24, 25 and 26 are this file's own.
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

/* One week of two, three or one entrants, played and marked final the way the live writer
   marks it. The first account listed wins, because its lineup is the one that scores. */
create or replace function public.pass_week(p_week int, p_users uuid[])
returns void language plpgsql as $$
declare i int;
begin
  delete from public.fantasy_prizes where season = 2026 and week = p_week;
  delete from public.fantasy_entries where season = 2026 and week = p_week;
  delete from public.fantasy_results where season = 2026 and week = p_week;
  delete from public.fantasy_prices where season = 2026 and week = p_week;
  delete from public.fantasy_weeks where season = 2026 and week = p_week;
  insert into public.fantasy_weeks (season, week, locks_at, cap_musd, slots) values
    (2026, p_week, now() + interval '2 hours', 90.00,
     array['QB','RB','RB','WR','WR','TE']::text[]);
  insert into public.fantasy_prices (season, week, player_id, pos, price_musd, proj) values
    (2026,p_week,'qb1','QB',20.0,20.0), (2026,p_week,'qb2','QB',10.0,10.0),
    (2026,p_week,'rb1','RB',12.0,12.0), (2026,p_week,'rb2','RB',8.0,8.0),
    (2026,p_week,'rb3','RB',6.0,6.0),   (2026,p_week,'rb4','RB',5.0,5.0),
    (2026,p_week,'wr1','WR',12.0,11.0), (2026,p_week,'wr2','WR',8.0,7.0),
    (2026,p_week,'wr3','WR',5.0,5.0),   (2026,p_week,'wr4','WR',4.0,4.0),
    (2026,p_week,'te1','TE',8.0,7.0),   (2026,p_week,'te2','TE',4.0,4.0);
  for i in 1 .. coalesce(array_length(p_users, 1), 0) loop
    perform public.become(p_users[i]);
    if i = 1 then
      perform public.fantasy_submit(2026, p_week, array['qb1','rb1','rb2','wr1','wr2','te1']::text[]);
    elsif i = 2 then
      perform public.fantasy_submit(2026, p_week, array['qb2','rb3','rb4','wr3','wr4','te2']::text[]);
    else
      perform public.fantasy_submit(2026, p_week, array['qb2','rb2','rb4','wr3','wr4','te2']::text[]);
    end if;
  end loop;
  perform public.become(null);
  update public.fantasy_weeks set locks_at = now() - interval '1 hour'
   where season = 2026 and week = p_week;
  insert into public.fantasy_results (season, week, player_id, half_ppr) values
    (2026,p_week,'qb1',30.0), (2026,p_week,'qb2',5.0),
    (2026,p_week,'rb1',20.0), (2026,p_week,'rb2',10.0), (2026,p_week,'rb3',3.0),
    (2026,p_week,'rb4',1.0),  (2026,p_week,'wr1',18.0), (2026,p_week,'wr2',9.0),
    (2026,p_week,'wr3',3.0),  (2026,p_week,'wr4',2.0),  (2026,p_week,'te1',7.0),
    (2026,p_week,'te2',2.0);
  perform public.fantasy_mark_results(2026, p_week, 16, 16, true);
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
delete from public.premium_unlocks where user_id in (
  'aaaaaaaa-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-00000000000b',
  'cccccccc-0000-0000-0000-00000000000c', 'dddddddd-0000-0000-0000-00000000000d');
\o

\echo ''
\echo '---------- the week closes and the winner is Pro, with nobody running anything ----------'
do $$
declare
  ada uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
  bo  uuid := 'bbbbbbbb-0000-0000-0000-00000000000b';
  pz  public.fantasy_prizes%rowtype;
  m   record;
  e   timestamptz;
begin
  perform public.claim('before the week, the winner holds nothing', pro_of(ada) = '{}');
  perform public.pass_week(24, array[ada, bo]);

  select * into pz from public.fantasy_prizes where season = 2026 and week = 24 and place = 1;
  perform public.claim('first place is the account that scored most', pz.user_id = ada);
  perform public.claim('  and it is paid by the settle itself', pz.promo_state = 'granted');
  perform public.claim('  with no code, because there is no code any more', pz.promo_code is null);

  perform public.claim('the winner is Pro on both games',
    pro_of(ada) @> array['ps_premium','cfb_premium']);
  perform public.claim('  and second place is not', pro_of(bo) = '{}');

  select max(expires_at) into e from public.premium_unlocks where user_id = ada;
  perform public.claim('  for 30 days',
    e between now() + interval '29 days 23 hours' and now() + interval '30 days 1 hour');
  perform public.claim('  and the prize row says the same day', pz.pass_until = e);
  perform public.claim('  and each row says which week paid it',
    (select bool_and(source = 'fantasy:2026-w24') from public.premium_unlocks where user_id = ada));

  /* The popup is ready at once, which is 115's gate honouring the new state. */
  perform public.become(ada);
  select * into m from public.fantasy_my_result(2026, 24);
  perform public.become(null);
  perform public.claim('the winner is told at once', m.entered and m.place = 1);
  perform public.claim('  that the prize is the pass', m.prize_state = 'granted');
  perform public.claim('  and when it ends', m.pass_until = e);
  perform public.become(bo);
  select * into m from public.fantasy_my_result(2026, 24);
  perform public.become(null);
  perform public.claim('second place is told too, and is handed no pass date',
    m.place = 2 and m.pass_until is null);
end $$;

\echo ''
\echo '---------- and after 30 days it is an ordinary account again ----------'
do $$
declare ada uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
begin
  /* Time cannot be moved, so the end is. This is exactly the row day 31 reads. */
  update public.premium_unlocks set expires_at = now() - interval '1 minute' where user_id = ada;
  perform public.claim('the pass has run out, and no Pro door answers', pro_of(ada) = '{}');
  perform public.claim('  and the rows are still there as a record of the win',
    (select count(*) from public.premium_unlocks where user_id = ada) = 2);
end $$;

\echo ''
\echo '---------- a pass is never a gold name on a board ----------'
do $$
declare ada uuid := 'aaaaaaaa-0000-0000-0000-00000000000a'; r bigint;
begin
  update public.premium_unlocks set expires_at = now() + interval '10 days' where user_id = ada;
  perform public.claim('a running pass is Pro to every gate',
    pro_of(ada) @> array['ps_premium']);
  perform public.claim('  and is not a gold name', public.ps_is_pro(ada) is false);
  r := public.mkrun(ada, 'Ada');
  perform public.claim('  so a season filed during it is not gilded',
    (select display_pro from public.ps_runs where id = r) is false);
  perform public.claim('  and granting it gilded none of their old rows',
    not exists (select 1 from public.ps_runs where user_id = ada and display_pro));
end $$;

\echo ''
\echo '---------- a winner who then buys it owns it for good ----------'
do $$
declare cy uuid := 'cccccccc-0000-0000-0000-00000000000c'; r bigint;
begin
  /* The webhook's upsert, as PostgREST's merge-duplicates writes it. */
  insert into public.premium_unlocks (user_id, product, source, expires_at)
  values (cy, 'ps_premium', 'fantasy:2026-w9', now() + interval '5 days');
  r := public.mkrun(cy, 'Cy');
  insert into public.premium_unlocks (user_id, product, source, expires_at)
  values (cy, 'ps_premium', 'bundle:perfect-season', null)
  on conflict (user_id, product) do update
    set source = excluded.source, expires_at = excluded.expires_at;
  perform public.claim('buying over a pass leaves no end date',
    (select expires_at is null from public.premium_unlocks
      where user_id = cy and product = 'ps_premium'));
  perform public.claim('  and gilds the rows filed during the pass',
    (select display_pro from public.ps_runs where id = r));
  delete from public.premium_unlocks where user_id = cy;
  update public.ps_runs set display_pro = false where user_id = cy;
end $$;

\echo ''
\echo '---------- two wins are two passes, end to end ----------'
do $$
declare ada uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
        cy  uuid := 'cccccccc-0000-0000-0000-00000000000c';
        before timestamptz; after timestamptz;
begin
  select max(expires_at) into before from public.premium_unlocks where user_id = ada;
  perform public.pass_week(25, array[ada, cy]);
  select max(expires_at) into after from public.premium_unlocks where user_id = ada;
  perform public.claim('a win while a pass is running adds 30 days to its end',
    after = before + interval '30 days');
  perform public.claim('  and the prize row carries the new end',
    (select pass_until from public.fantasy_prizes
      where season = 2026 and week = 25 and place = 1) = after);

  perform public.claim('settling again pays nobody twice',
    public.fantasy_grant_pass(2026, 25) = 'granted'
    and (select max(expires_at) from public.premium_unlocks where user_id = ada) = after);
  perform public.fantasy_settle_week(2026, 25);
  perform public.claim('  nor does a second settle',
    (select max(expires_at) from public.premium_unlocks where user_id = ada) = after);
end $$;

\echo ''
\echo '---------- somebody who bought it keeps it for good ----------'
do $$
declare di uuid := 'dddddddd-0000-0000-0000-00000000000d';
        bo uuid := 'bbbbbbbb-0000-0000-0000-00000000000b';
        m  record;
begin
  insert into public.premium_unlocks (user_id, product, source, expires_at)
  values (di, 'ps_premium', 'bundle:perfect-season', null),
         (di, 'cfb_premium', 'bundle:perfect-season', null);
  perform public.pass_week(26, array[di, bo]);
  perform public.claim('an owner who wins is still an owner, with no end date',
    (select bool_and(expires_at is null and source = 'bundle:perfect-season')
       from public.premium_unlocks where user_id = di));
  perform public.claim('  and the prize row has no pass date to print',
    (select pass_until is null and promo_state = 'granted' from public.fantasy_prizes
      where season = 2026 and week = 26 and place = 1));
  perform public.become(di);
  select * into m from public.fantasy_my_result(2026, 26);
  perform public.become(null);
  perform public.claim('  and is told they won, with no end date',
    m.place = 1 and m.prize_state = 'granted' and m.pass_until is null);
  perform public.claim('  and is still a gold name', public.ps_is_pro(di));
end $$;

\echo ''
\echo '---------- a field of one is not a competition ----------'
do $$
declare bo uuid := 'bbbbbbbb-0000-0000-0000-00000000000b'; m record;
begin
  delete from public.premium_unlocks where user_id = bo;
  perform public.pass_week(24, array[bo]);
  perform public.claim('a lone entrant is voided, not paid',
    (select promo_state from public.fantasy_prizes
      where season = 2026 and week = 24 and place = 1) = 'void'
    and pro_of(bo) = '{}');
  perform public.become(bo);
  select * into m from public.fantasy_my_result(2026, 24);
  perform public.become(null);
  perform public.claim('  and is still told they came first',
    m.place = 1 and m.prize_state = 'void');

  update public.fantasy_prizes set promo_state = 'none'
   where season = 2026 and week = 24 and place = 1;
  perform public.claim('a person can pay one by hand',
    public.fantasy_grant_pass(2026, 24, true) = 'granted'
    and pro_of(bo) @> array['ps_premium','cfb_premium']);
end $$;

\echo ''
\echo '---------- who may pay ----------'
do $$
begin
  perform public.claim('an account may not call the grant',
    not has_function_privilege('authenticated',
      'public.fantasy_grant_pass(int,int,boolean)', 'execute'));
  perform public.claim('  nor may a stranger',
    not has_function_privilege('anon', 'public.fantasy_grant_pass(int,int,boolean)', 'execute'));
  perform public.claim('an account may still ask for its own result',
    has_function_privilege('authenticated', 'public.fantasy_my_result(int,int)', 'execute'));
end $$;

\o /dev/null
delete from public.premium_unlocks where user_id in (
  'aaaaaaaa-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-00000000000b',
  'cccccccc-0000-0000-0000-00000000000c', 'dddddddd-0000-0000-0000-00000000000d');
delete from public.fantasy_prizes where season = 2026 and week in (24, 25, 26);
delete from public.fantasy_entries where season = 2026 and week in (24, 25, 26);
delete from public.fantasy_results where season = 2026 and week in (24, 25, 26);
delete from public.fantasy_prices where season = 2026 and week in (24, 25, 26);
delete from public.fantasy_weeks where season = 2026 and week in (24, 25, 26);
\o
\echo 'ALL PASS CLAIMS PASSED'
