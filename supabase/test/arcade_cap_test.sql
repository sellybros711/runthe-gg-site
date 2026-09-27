-- ---------------------------------------------------------------------------
-- arcade_cap_test.sql : the four-a-day ranked cap asks arcade_card_active (125).
--
--   createdb capt
--   psql -d capt -f supabase/test/fantasy_base.sql
--   psql -d capt -c 'create table public.subscriptions(user_id uuid, status text, current_period_end timestamptz);'
--   psql -d capt -f supabase/101_premium_bundles.sql
--   psql -d capt -f supabase/52_grid_daily.sql      (then 70_grid_integrity, 72_grid_game_keys,
--                                                    74, 76, 82 and 85, in that order)
--   psql -d capt -f supabase/125_arcade_cap_and_bonus_refund.sql
--   psql -d capt -f supabase/test/arcade_cap_test.sql
--
-- 79 is left out of the chain on purpose: its last statement is a diagnostic that
-- reads auth.users.email, which the stand in auth schema does not have, and 82
-- restates everything of 79's that this needs.
--
-- The claim that matters is the third account: an Arcade year held as a
-- premium_unlocks row, with no subscriptions row at all, which is what Run The
-- Bundle grants. Before 125 its fifth game was refused.
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

/* Plays five different games today as p_user and answers how many the server took. */
create or replace function public.five_games(p_user uuid)
returns int language plpgsql as $$
declare
  g text;
  n int := 0;
begin
  perform public.become(p_user);
  foreach g in array array['match', 'crossword', 'guess', 'match_nba', 'crossword_nba'] loop
    begin
      perform public.grid_submit_run(g, current_date, 60, 0, 0, null, false);
      n := n + 1;
    exception when others then
      if sqlerrm <> 'daily ranked limit reached' then raise; end if;
    end;
  end loop;
  perform public.become_nobody();
  return n;
end $$;

insert into auth.users (id) values
  ('a1000000-0000-0000-0000-000000000001'),   -- free
  ('a2000000-0000-0000-0000-000000000002'),   -- Arcade Card subscription
  ('a3000000-0000-0000-0000-000000000003'),   -- Arcade year from a bundle
  ('a4000000-0000-0000-0000-000000000004'),   -- Arcade year that has ended
  ('a5000000-0000-0000-0000-000000000005');   -- card subscription past its period
insert into public.profiles (id, username) values
  ('a1000000-0000-0000-0000-000000000001', 'free'),
  ('a2000000-0000-0000-0000-000000000002', 'card'),
  ('a3000000-0000-0000-0000-000000000003', 'bundle'),
  ('a4000000-0000-0000-0000-000000000004', 'ended'),
  ('a5000000-0000-0000-0000-000000000005', 'lapsed');

insert into public.subscriptions (user_id, status, current_period_end) values
  ('a2000000-0000-0000-0000-000000000002', 'active', now() + interval '20 days'),
  ('a5000000-0000-0000-0000-000000000005', 'active', now() - interval '3 days');
insert into public.premium_unlocks (user_id, product, source, expires_at) values
  ('a3000000-0000-0000-0000-000000000003', 'arcade_card_year', 'bundle:run-the-bundle', now() + interval '300 days'),
  ('a4000000-0000-0000-0000-000000000004', 'arcade_card_year', 'bundle:run-the-bundle', now() - interval '1 day');

select public.claim('a free account gets four ranked runs a day',
  public.five_games('a1000000-0000-0000-0000-000000000001') = 4);
select public.claim('an Arcade Card subscriber gets all five',
  public.five_games('a2000000-0000-0000-0000-000000000002') = 5);
select public.claim('an Arcade year from Run The Bundle, with no subscriptions row, gets all five',
  public.five_games('a3000000-0000-0000-0000-000000000003') = 5);
select public.claim('an Arcade year that has ended is capped again',
  public.five_games('a4000000-0000-0000-0000-000000000004') = 4);
select public.claim('a card whose period ended days ago is capped, as every other reader treats it',
  public.five_games('a5000000-0000-0000-0000-000000000005') = 4);

/* The cap must still let a game already on today's board be submitted again. */
select public.become('a1000000-0000-0000-0000-000000000001');
select public.claim('a free account can still resubmit a game it already posted today',
  (public.grid_submit_run('match', current_date, 50, 0, 0, null, false)->>'id') is not null);
select public.become_nobody();

\echo 'arcade_cap_test: all claims passed'
