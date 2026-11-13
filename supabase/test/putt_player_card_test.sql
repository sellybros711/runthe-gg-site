-- The Putt Putt player card (165). Chain:
--   createdb card
--   psql -d card -f supabase/test/ps_saves_base.sql
--   psql -d card -f supabase/103_cloud_saves.sql
--   psql -d card -f supabase/143_ps_save_put_fix.sql
--   psql -d card -c "create table public.profiles (id uuid primary key, username text)"
--   psql -d card -f supabase/148_putt_daily_board.sql
--   psql -d card -f supabase/165_putt_player_card.sql
--   psql -d card -f supabase/test/putt_player_card_test.sql
\set ON_ERROR_STOP on
create table if not exists public.profiles (id uuid primary key, username text);
insert into public.profiles values
  ('11111111-1111-1111-1111-111111111111', 'MalikWillisLover'),
  ('22222222-2222-2222-2222-222222222222', 'swoop337') on conflict do nothing;

create or replace function pg_temp.claim(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; raise notice 'ok  %', what; end $$;

\i supabase/165_putt_player_card.sql
select pg_temp.claim(true, 'running 165 twice is safe');

delete from public.putt_daily; delete from public.ps_saves;
-- the first player saves with a card and has posted two Daily Holes
set test.uid = '11111111-1111-1111-1111-111111111111';
select ok from ps_save_put('putt', 'tour', '{"v":2,"tours":{},"secret":"never read","card":{"v":1,"lv":12,"levels":90,"stars":31,"starsMax":270}}'::jsonb, 40);
insert into putt_daily (day, user_id, strokes, par, ms) values
  ((now() at time zone 'utc')::date, '11111111-1111-1111-1111-111111111111', 4, 3, 20200),
  ((now() at time zone 'utc')::date - 1, '11111111-1111-1111-1111-111111111111', 3, 3, 15000);
-- the second has an old save with no card, and has never posted
set test.uid = '22222222-2222-2222-2222-222222222222';
select ok from ps_save_put('putt', 'tour', '{"v":2,"tours":{}}'::jsonb, 5);

-- anyone can read a card, signed in or not
set test.uid = '';
select pg_temp.claim((select (card->>'lv')::int from putt_player_card('MalikWillisLover')) = 12, 'the card reads back from the save');
select pg_temp.claim((select (card->>'starsMax')::int from putt_player_card('malikwillislover')) = 270, 'the username matches in any case');
select pg_temp.claim((select card ? 'secret' from putt_player_card('MalikWillisLover')) = false, 'only the card key leaves, not the rest of the save');
select pg_temp.claim((select board_days from putt_player_card('MalikWillisLover')) = 2, 'the Daily Holes posted are counted');
select pg_temp.claim((select card is null and board_days = 0 and username = 'swoop337' from putt_player_card('swoop337')), 'an old save with no card answers with the name alone');
select pg_temp.claim((select count(*) from putt_player_card('nobody')) = 0, 'an unknown name is no row');
select pg_temp.claim((select count(*) from putt_player_card(null)) = 0, 'no name is no row');
select pg_temp.claim((select count(*) from putt_player_card(repeat('x', 200))) = 0, 'a long name is no row');
select pg_temp.claim(has_function_privilege('anon', 'public.putt_player_card(text)', 'execute'), 'a guest can read cards');
