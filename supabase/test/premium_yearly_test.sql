-- ---------------------------------------------------------------------------
-- premium_yearly_test.sql : 124, driven rather than read.
--
--   createdb yr
--   psql -d yr -f supabase/test/fantasy_base.sql
--   sed -n '20,$p' supabase/test/dynboard_base.sql | psql -d yr     (ps_runs, for 107)
--   psql -d yr -f supabase/98_football_gauntlet_board.sql
--   psql -d yr -c 'create table public.subscriptions(user_id uuid, status text, current_period_end timestamptz);'
--   psql -d yr -f supabase/101_premium_bundles.sql
--   psql -d yr -f supabase/107_board_pro_and_live.sql
--   psql -d yr -f supabase/109_fantasy_challenge.sql     (then 110 to 115, 119, 120, 121, 123)
--   psql -d yr -c 'create table public.coin_wallet(user_id uuid primary key, paid_coins int default 0, lifetime_granted int default 0);'
--   psql -d yr -f supabase/103_runtour_bundle_redeem.sql
--   psql -d yr -f supabase/65_delete_account.sql
--   psql -d yr -f supabase/124_premium_yearly.sql
--   psql -d yr -f supabase/124_premium_yearly.sql          (twice: it has to re-run)
--   psql -d yr -f supabase/test/premium_yearly_test.sql
--
-- EVERY CLAIM IS ASKED OF premium_products(), which is the one question every Pro door
-- on the site asks, as well as of the row. A row with the right date on it that the gate
-- did not honour would pass a test of the row.
--
-- now() cannot be moved inside a test, so time is moved the other way: a plan that
-- LAPSED is a plan whose period ended a month ago, handed in as such.
--
-- Weeks 40 to 42 are this file's own.
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

create or replace function public.pro_of(p_user uuid)
returns text[] language plpgsql as $$
declare v text[];
begin
  perform public.become(p_user);
  v := public.premium_products();
  perform public.become(null);
  return v;
end $$;

create or replace function public.row_of(p_user uuid, p_prod text)
returns public.premium_unlocks language sql as $$
  select * from public.premium_unlocks where user_id = p_user and product = p_prod $$;

create or replace function public.apply(p_sub text, p_user uuid, p_bundle text, p_status text,
  p_end timestamptz, p_cancel boolean, p_ended timestamptz, p_kind text)
returns jsonb language sql as $$
  select public.premium_sub_apply(p_sub, p_user, p_bundle, p_status, p_end, p_cancel,
    p_ended, 'cus_' || p_sub, 'price_x', p_kind,
    '{"coins":100000,"packs":[{"tier":"tour","n":1}]}'::jsonb) $$;

/* One won week, the way fantasy_pass_test.sql plays one, so the prize goes through the
   real settle and the real grant rather than an insert that agrees with this file. */
create or replace function public.win_week(p_week int, p_winner uuid, p_other uuid)
returns void language plpgsql as $$
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
  perform public.become(p_winner);
  perform public.fantasy_submit(2026, p_week, array['qb1','rb1','rb2','wr1','wr2','te1']::text[]);
  perform public.become(p_other);
  perform public.fantasy_submit(2026, p_week, array['qb2','rb3','rb4','wr3','wr4','te2']::text[]);
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

\o /dev/null
insert into auth.users(id) values
  ('a1000000-0000-0000-0000-000000000001'),   -- L   lifetime Perfect Season owner
  ('a2000000-0000-0000-0000-000000000002'),   -- P   Fantasy pass holder
  ('a3000000-0000-0000-0000-000000000003'),   -- Y   yearly subscriber who cancels
  ('a4000000-0000-0000-0000-000000000004'),   -- Lp  lapses on a failed card
  ('a5000000-0000-0000-0000-000000000005'),   -- R   refunded
  ('a6000000-0000-0000-0000-000000000006'),   -- B   Run The Bundle yearly, the bonus
  ('a7000000-0000-0000-0000-000000000007'),   -- Q   lifetime Run The Bundle owner
  ('a8000000-0000-0000-0000-000000000008'),   -- Two plans at once
  ('a9000000-0000-0000-0000-000000000009'),   -- the other entrant
  ('aa000000-0000-0000-0000-00000000000a')    -- G   gold names
on conflict do nothing;
insert into public.profiles(id, username) values
  ('a1000000-0000-0000-0000-000000000001','yr_l'), ('a2000000-0000-0000-0000-000000000002','yr_p'),
  ('a3000000-0000-0000-0000-000000000003','yr_y'), ('a4000000-0000-0000-0000-000000000004','yr_lp'),
  ('a5000000-0000-0000-0000-000000000005','yr_r'), ('a6000000-0000-0000-0000-000000000006','yr_b'),
  ('a7000000-0000-0000-0000-000000000007','yr_q'), ('a8000000-0000-0000-0000-000000000008','yr_two'),
  ('a9000000-0000-0000-0000-000000000009','yr_other'), ('aa000000-0000-0000-0000-00000000000a','yr_g')
on conflict do nothing;
delete from public.premium_subscriptions where user_id::text like 'a_000000%' or user_id::text like 'aa000000%';
delete from public.premium_unlocks where user_id::text like 'a_000000%' or user_id::text like 'aa000000%';
\o

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. A lifetime row does not move, on any path
-- ═══════════════════════════════════════════════════════════════════════════
\set L '''a1000000-0000-0000-0000-000000000001'''
select public.premium_grant_bundle(:L, 'perfect-season',
  '[{"product":"ps_premium"},{"product":"cfb_premium"}]'::jsonb, '{"checkout_session":"cs_1"}'::jsonb);

select public.claim('a one-time bundle is lifetime',
  (select expires_at is null from public.row_of(:L, 'ps_premium')));

-- A lifetime Perfect Season owner may buy Run The Bundle yearly, and every event that
-- plan can produce leaves the two lifetime rows exactly as they were.
select public.apply('yt_sub_L', :L, 'run-the-bundle', 'active', now() + interval '365 days', false, null, 'grant');
select public.claim('the plan adds the Arcade Card',
  'arcade_card_year' = any (public.pro_of(:L)));
select public.claim('the plan hands over the bonus',
  (select count(*) = 1 from public.premium_unlocks where user_id = :L and product = 'runtour_pack'));
select public.apply('yt_sub_L', :L, 'run-the-bundle', 'active', now() + interval '730 days', true, null, 'renew');
select public.apply('yt_sub_L', :L, 'run-the-bundle', 'past_due', now() + interval '730 days', null, null, 'update');
select public.apply('yt_sub_L', :L, 'run-the-bundle', null, null, null, null, 'refund');
select public.apply('yt_sub_L', :L, 'run-the-bundle', 'canceled', null, null, now(), 'delete');
select public.claim('after grant, renew, past due, refund and delete the lifetime rows are lifetime',
  (select bool_and(expires_at is null and sub_until is null and source = 'bundle:perfect-season')
     from public.premium_unlocks where user_id = :L and product in ('ps_premium','cfb_premium')));
select public.claim('and the gate still opens both games',
  public.pro_of(:L) @> array['ps_premium','cfb_premium']);
select public.claim('the refunded Arcade Card is gone',
  not ('arcade_card_year' = any (public.pro_of(:L))));

-- A writer that forgets the clause cannot give a lifetime row an end date.
update public.premium_unlocks set expires_at = now() - interval '1 day', source = 'oops'
 where user_id = :L and product = 'ps_premium';
select public.claim('an UPDATE that sets an end date on a lifetime row changes nothing',
  (select expires_at is null and source = 'bundle:perfect-season' from public.row_of(:L, 'ps_premium')));

-- A Fantasy prize for a lifetime owner leaves it alone.
select public.win_week(40, :L, 'a9000000-0000-0000-0000-000000000009');
select public.claim('a prize does not touch a lifetime row',
  (select expires_at is null and grant_until is null from public.row_of(:L, 'ps_premium')));
select public.claim('and the prize sheet says they own it for good',
  (select pass_until is null from public.fantasy_prizes where season = 2026 and week = 40 and place = 1));

-- The bonus row: stamped once, never unstamped.
select public.become(:L);
select public.claim('the bonus coins redeem', public.runtour_redeem_bundle() is not null);
select public.become(null);
update public.premium_unlocks set fulfilled_at = null where user_id = :L and product = 'runtour_pack';
select public.claim('fulfilled_at cannot be cleared, so the coins cannot be paid twice',
  (select fulfilled_at is not null from public.row_of(:L, 'runtour_pack')));
select public.become(:L);
select public.claim('a second redeem pays nothing', public.runtour_redeem_bundle() is null);
select public.become(null);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. A Fantasy pass and a plan: the latest of the two, and a refund takes only its own
-- ═══════════════════════════════════════════════════════════════════════════
\set P '''a2000000-0000-0000-0000-000000000002'''
select public.win_week(41, :P, 'a9000000-0000-0000-0000-000000000009');
select public.claim('the winner has a 30 day pass',
  (select grant_until between now() + interval '29 days' and now() + interval '31 days'
          and expires_at = grant_until and source like 'fantasy:%'
     from public.row_of(:P, 'ps_premium')));

-- A short plan (its period ends in 10 days) does not cut the pass short.
select public.apply('yt_sub_P', :P, 'perfect-season', 'active', now() + interval '10 days', false, null, 'grant');
select public.claim('the pass still sets the end when it is later',
  (select expires_at = grant_until from public.row_of(:P, 'ps_premium')));
select public.claim('the prize keeps its name, so the receipt still says Won',
  (select source like 'fantasy:%' from public.row_of(:P, 'ps_premium')));
-- The renewal runs past the pass: the plan sets the end now.
select public.apply('yt_sub_P', :P, 'perfect-season', 'active', now() + interval '375 days', false, null, 'renew');
select public.claim('a renewal past the pass sets the end',
  (select expires_at = sub_until and sub_until > now() + interval '370 days' from public.row_of(:P, 'ps_premium')));
select public.claim('a subscriber holding a pass is a gold name',
  public.ps_is_pro(:P));
-- A second win WHILE THE PLAN RUNS stacks on the pass, never on the plan. Asked here and
-- not after the refund below, because once the plan is gone the two readings agree and a
-- prize stacked on the plan's end would pass.
select public.win_week(42, :P, 'a9000000-0000-0000-0000-000000000009');
select public.claim('a second win during a plan adds 30 days to the pass, not to the plan',
  (select grant_until between now() + interval '59 days' and now() + interval '61 days'
          and expires_at = sub_until
     from public.row_of(:P, 'ps_premium')));
select public.claim('the prize sheet reports the pass, not the row',
  (select pass_until > now() + interval '59 days' and pass_until < now() + interval '61 days'
     from public.fantasy_prizes where season = 2026 and week = 42 and place = 1));
-- A refund takes the plan's time back and leaves the prize's.
select public.apply('yt_sub_P', :P, 'perfect-season', null, null, null, null, 'refund');
select public.claim('a refund lands the end back on the pass, not on today',
  (select expires_at = grant_until and grant_until > now() + interval '59 days' from public.row_of(:P, 'ps_premium')));
select public.claim('and the gate is still open for the pass',
  'ps_premium' = any (public.pro_of(:P)));

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. A yearly subscriber: renews, cancels at the period end, and a late event cannot revive it
-- ═══════════════════════════════════════════════════════════════════════════
\set Y '''a3000000-0000-0000-0000-000000000003'''
select public.apply('yt_sub_Y', :Y, 'perfect-season', 'active', now() + interval '365 days', false, null, 'grant');
select public.claim('a yearly plan opens both games',
  public.pro_of(:Y) @> array['ps_premium','cfb_premium']);
select public.claim('with the grace on top of the period',
  (select expires_at = current_period_end + interval '7 days'
     from public.row_of(:Y, 'ps_premium'), public.premium_subscriptions where stripe_sub_id = 'yt_sub_Y'));
select public.claim('and no bonus on Perfect Season',
  (select count(*) = 0 from public.premium_unlocks where user_id = :Y and product = 'runtour_pack'));
select public.apply('yt_sub_Y', :Y, 'perfect-season', 'active', now() + interval '365 days', true, null, 'update');
select public.claim('cancelling at the period end keeps access to the end',
  (select cancel_at_period_end and access_until > now() + interval '364 days'
     from public.premium_subscriptions where stripe_sub_id = 'yt_sub_Y'));
select public.apply('yt_sub_Y', :Y, 'perfect-season', 'canceled', now() + interval '365 days', true,
  now() + interval '365 days', 'delete');
select public.claim('the end of a cancelled plan is the period end, with no grace added',
  (select access_until = current_period_end from public.premium_subscriptions where stripe_sub_id = 'yt_sub_Y'));
select public.apply('yt_sub_Y', :Y, 'perfect-season', 'active', now() + interval '730 days', false, null, 'update');
select public.claim('a stale "active" after the delete grants nothing',
  (select status = 'canceled' and access_until < now() + interval '366 days'
     from public.premium_subscriptions where stripe_sub_id = 'yt_sub_Y'));

-- An immediate cancel ends it now.
select public.apply('yt_sub_Y2', :Y, 'perfect-season', 'active', now() + interval '800 days', false, null, 'grant');
select public.apply('yt_sub_Y2', :Y, 'perfect-season', 'canceled', now() + interval '800 days', false, now(), 'delete');
select public.claim('an immediate cancel leaves only the other plan''s time',
  (select expires_at < now() + interval '366 days' from public.row_of(:Y, 'ps_premium')));

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. A lapse: back to the free allowance, and back again on a late payment
-- ═══════════════════════════════════════════════════════════════════════════
\set Lp '''a4000000-0000-0000-0000-000000000004'''
select public.apply('yt_sub_Lp', :Lp, 'perfect-season', 'active', now() - interval '30 days', false, null, 'grant');
select public.apply('yt_sub_Lp', :Lp, 'perfect-season', 'past_due', now() - interval '30 days', false, null, 'update');
select public.claim('a card that failed a month ago is past its grace',
  not ('ps_premium' = any (public.pro_of(:Lp))));
select public.claim('and no unlock row is made for time that is already over',
  (select count(*) = 0 from public.premium_unlocks where user_id = :Lp));
select public.claim('a lapsed subscriber is not a gold name', not public.ps_is_pro(:Lp));
select public.apply('yt_sub_Lp', :Lp, 'perfect-season', 'active', now() + interval '335 days', false, null, 'renew');
select public.claim('a late payment turns it back on',
  public.pro_of(:Lp) @> array['ps_premium','cfb_premium']);

-- past_due inside the grace keeps Pro on, and does not extend it.
select public.apply('yt_sub_Lp2', :Lp, 'run-the-bundle', 'active', now() - interval '2 days', false, null, 'grant');
select public.apply('yt_sub_Lp2', :Lp, 'run-the-bundle', 'past_due', now() - interval '2 days', false, null, 'update');
select public.claim('a failed card inside the grace keeps the Arcade Card',
  'arcade_card_year' = any (public.pro_of(:Lp)));
select public.claim('only until the grace runs out',
  (select access_until between current_period_end + interval '7 days' - interval '1 minute'
                           and current_period_end + interval '7 days' + interval '1 minute'
          and access_until < now() + interval '6 days'
     from public.premium_subscriptions where stripe_sub_id = 'yt_sub_Lp2'));
select public.claim('a plan still inside its grace is paid for, so its bonus is handed over once',
  (select count(*) = 1 from public.premium_unlocks where user_id = :Lp and product = 'runtour_pack'));

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. A refund, and the late event about the period it took back
-- ═══════════════════════════════════════════════════════════════════════════
\set R '''a5000000-0000-0000-0000-000000000005'''
select public.apply('yt_sub_R', :R, 'perfect-season', 'active', now() + interval '365 days', false, null, 'grant');
select public.apply('yt_sub_R', :R, 'perfect-season', null, null, null, null, 'refund');
select public.claim('a refund ends Pro now', not ('ps_premium' = any (public.pro_of(:R))));
-- Stripe sends the SAME period end again, to the second, so the fixture reads it back.
select public.apply('yt_sub_R', :R, 'perfect-season', 'active',
  (select current_period_end from public.premium_subscriptions where stripe_sub_id = 'yt_sub_R'),
  false, null, 'update');
select public.claim('an "active" for the refunded period arriving late grants nothing',
  not ('ps_premium' = any (public.pro_of(:R))));
select public.apply('yt_sub_R', :R, 'perfect-season', 'active', now() + interval '730 days', false, null, 'renew');
select public.claim('a renewal for the next period does',
  'ps_premium' = any (public.pro_of(:R)));

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. The bonus is once per account, ever
-- ═══════════════════════════════════════════════════════════════════════════
\set B '''a6000000-0000-0000-0000-000000000006'''
select public.apply('yt_sub_B', :B, 'run-the-bundle', 'active', now() + interval '365 days', false, null, 'grant');
select public.apply('yt_sub_B', :B, 'run-the-bundle', 'active', now() + interval '365 days', false, null, 'grant');
select public.apply('yt_sub_B', :B, 'run-the-bundle', 'active', now() + interval '730 days', false, null, 'renew');
select public.claim('Run The Bundle yearly opens all three',
  public.pro_of(:B) @> array['ps_premium','cfb_premium','arcade_card_year']);
select public.claim('one bonus row, unfulfilled, for the golf side to redeem',
  (select count(*) = 1 and bool_and(fulfilled_at is null and expires_at is null
          and (payload->>'coins')::int = 100000)
     from public.premium_unlocks where user_id = :B and product = 'runtour_pack'));
select public.become(:B);
select public.claim('it redeems once', public.runtour_redeem_bundle() is not null);
select public.become(null);
select public.apply('yt_sub_B2', :B, 'run-the-bundle', 'active', now() + interval '900 days', false, null, 'grant');
select public.claim('a second plan hands over nothing new',
  (select count(*) = 1 and bool_and(fulfilled_at is not null)
     from public.premium_unlocks where user_id = :B and product = 'runtour_pack'));
select public.become(:B);
select public.claim('and there is nothing left to redeem', public.runtour_redeem_bundle() is null);
select public.become(null);

-- A lifetime Run The Bundle buyer already has the bonus row, so even a plan (which the
-- checkout refuses them) could not hand a second one over.
\set Q '''a7000000-0000-0000-0000-000000000007'''
select public.premium_grant_bundle(:Q, 'run-the-bundle',
  '[{"product":"ps_premium"},{"product":"cfb_premium"},{"product":"arcade_card_year","months":12},{"product":"runtour_pack","payload":{"coins":100000,"packs":[{"tier":"tour","n":1}]}}]'::jsonb,
  '{}'::jsonb);
select public.claim('the one-time bundle''s Arcade year is a fixed grant',
  (select grant_until is not null and expires_at = grant_until from public.row_of(:Q, 'arcade_card_year')));
select public.premium_grant_bundle(:Q, 'run-the-bundle',
  '[{"product":"runtour_pack","payload":{"coins":999}}]'::jsonb, '{}'::jsonb);
select public.claim('a replayed one-time grant does not rewrite the bonus row',
  (select (payload->>'coins')::int = 100000 from public.row_of(:Q, 'runtour_pack')));
select public.apply('yt_sub_Q', :Q, 'run-the-bundle', 'active', now() + interval '365 days', false, null, 'grant');
select public.claim('no second bonus for a lifetime Run The Bundle owner',
  (select count(*) = 1 and bool_and(source = 'bundle:run-the-bundle')
     from public.premium_unlocks where user_id = :Q and product = 'runtour_pack'));
select public.claim('and their Arcade year runs to the later of the two',
  (select expires_at = greatest(grant_until, sub_until) from public.row_of(:Q, 'arcade_card_year')));

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. A plan changed in the portal, and two plans at once
-- ═══════════════════════════════════════════════════════════════════════════
select public.apply('yt_sub_B', :B, 'perfect-season', 'active', now() + interval '730 days', false, null, 'update');
select public.claim('switching down to Perfect Season keeps the second plan''s Arcade Card',
  'arcade_card_year' = any (public.pro_of(:B)));
select public.apply('yt_sub_B2', :B, 'run-the-bundle', 'canceled', null, false, now(), 'delete');
select public.claim('and with that plan gone, the Arcade Card goes too',
  not ('arcade_card_year' = any (public.pro_of(:B))));
select public.claim('while the switched plan keeps both games',
  public.pro_of(:B) @> array['ps_premium','cfb_premium']);

\set T '''a8000000-0000-0000-0000-000000000008'''
select public.apply('yt_sub_T1', :T, 'perfect-season', 'active', now() + interval '600 days', false, null, 'grant');
select public.apply('yt_sub_T2', :T, 'run-the-bundle', 'active', now() + interval '100 days', false, null, 'grant');
select public.apply('yt_sub_T2', :T, 'run-the-bundle', null, null, null, null, 'refund');
select public.claim('refunding one plan does not shorten the other',
  (select sub_until > now() + interval '600 days' from public.row_of(:T, 'ps_premium')));

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Gold names: while subscribed, and never reaching back
-- ═══════════════════════════════════════════════════════════════════════════
\set G '''aa000000-0000-0000-0000-00000000000a'''
insert into public.ps_runs(user_id, display_name, run_mode) values (:G, 'before', 'dynasty');
select public.apply('yt_sub_G', :G, 'perfect-season', 'active', now() + interval '365 days', false, null, 'grant');
insert into public.ps_runs(user_id, display_name, run_mode) values (:G, 'during', 'dynasty');
select public.claim('a season filed while subscribed is gold',
  (select display_pro from public.ps_runs where display_name = 'during' and user_id = :G));
select public.claim('subscribing does not gild the seasons before it',
  (select display_pro is false from public.ps_runs where display_name = 'before' and user_id = :G));
select public.apply('yt_sub_G', :G, 'perfect-season', null, null, null, null, 'refund');
insert into public.ps_runs(user_id, display_name, run_mode) values (:G, 'after', 'dynasty');
select public.claim('a season filed after it ended is not',
  (select display_pro is false from public.ps_runs where display_name = 'after' and user_id = :G));
select public.claim('and the gold it earned stays',
  (select display_pro from public.ps_runs where display_name = 'during' and user_id = :G));
insert into public.premium_unlocks(user_id, product, source) values (:G, 'rtd_premium', 'comp');
select public.claim('buying another game''s Pro does not gild football rows',
  (select display_pro is false from public.ps_runs where display_name = 'before' and user_id = :G));
select public.premium_grant_bundle(:G, 'perfect-season',
  '[{"product":"ps_premium"},{"product":"cfb_premium"}]'::jsonb, '{}'::jsonb);
select public.claim('a lifetime purchase still gilds everything already on the board',
  (select bool_and(display_pro) from public.ps_runs where user_id = :G));

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Deleting an account with a plan that will charge again
-- ═══════════════════════════════════════════════════════════════════════════
select public.become(:Lp);
select public.claim('a plan that renews blocks deleting the account',
  (public.rtg_delete_my_account()->>'reason') = 'active_subscription');
select public.become(null);
update public.premium_subscriptions set cancel_at_period_end = true where user_id = :Lp;
select public.become(:Lp);
select public.claim('a plan cancelled at its period end does not',
  (public.rtg_delete_my_account()->>'ok')::boolean);
select public.become(null);

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. Who may call it
-- ═══════════════════════════════════════════════════════════════════════════
select public.claim('a browser cannot grant itself a year',
  not has_function_privilege('authenticated',
    'public.premium_sub_apply(text, uuid, text, text, timestamptz, boolean, timestamptz, text, text, text, jsonb)',
    'execute'));
select public.claim('nor a one-time bundle',
  not has_function_privilege('authenticated', 'public.premium_grant_bundle(uuid, text, jsonb, jsonb)', 'execute'));
-- AN EXCEPTION TEST CANNOT ASSERT INSIDE THE BLOCK IT IS WATCHING: a claim raised in the
-- `begin` arm is caught by that block's own handler and reads as a pass. The flag is set
-- in the handler and read after the block, which is 107's test's lesson.
do $$
declare v_raised boolean := false;
begin
  begin
    perform public.premium_sub_apply('yt_sub_bad', 'a3000000-0000-0000-0000-000000000003', 'perfect-season',
      'active', now(), false, null, null, null, 'nonsense', null);
  exception when others then v_raised := true;
  end;
  perform public.claim('an unknown event kind raises', v_raised);
end $$;

do $$
declare v_raised boolean := false;
begin
  begin
    perform public.premium_sub_apply('yt_sub_Y', 'a4000000-0000-0000-0000-000000000004', 'perfect-season',
      'active', now() + interval '999 days', false, null, null, null, 'update', null);
  exception when others then v_raised := true;
  end;
  perform public.claim('a plan cannot change hands', v_raised);
end $$;

select public.claim('a plan with nobody to grant to writes nothing',
  (public.premium_sub_apply('yt_sub_nobody', null, 'perfect-season', 'active',
     now() + interval '9 days', false, null, null, null, 'update', null)->>'ok')::boolean is false);

\echo 'premium_yearly_test: every claim held'
