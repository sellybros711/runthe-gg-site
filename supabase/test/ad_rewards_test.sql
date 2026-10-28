-- Rewarded videos paying a Putt Putt life or an arcade play (158). Chain (stripe-checks.yml):
--   fantasy_base.sql, a subscriptions table, the arcade migrations, 138, 146, 149, 150, 151,
--   158 twice, then this file.
\set ON_ERROR_STOP on
insert into auth.users values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000a3')
  on conflict do nothing;
insert into public.profiles (id, username) values
  ('00000000-0000-0000-0000-0000000000a1', 'csel8'),        -- a tester
  ('00000000-0000-0000-0000-0000000000a2', 'somebody'),     -- not a tester
  ('00000000-0000-0000-0000-0000000000a3', 'runnyj')        -- a tester
  on conflict do nothing;

create or replace function pg_temp.claim(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; raise notice 'ok  %', what; end $$;
-- the video took a minute
create or replace function pg_temp.watched() returns void language sql as $$
  update public.ad_rewards set issued_at = now() - interval '1 minute' where claimed_at is null $$;
create or replace function pg_temp.code(j json) returns uuid language sql as $$ select (j->>'code')::uuid $$;

delete from public.ad_rewards;
delete from public.putt_lives where user_id::text like '00000000-0000-0000-0000-0000000000a%';
delete from public.arcade_game_plays where user_id::text like '00000000-0000-0000-0000-0000000000a%';

-- WHO MAY ASK
select become_nobody();
select pg_temp.claim(ad_reward_issue('putt_life')->>'reason' = 'sign_in', 'a guest is asked to sign in');
select become('00000000-0000-0000-0000-0000000000a2');
select putt_lives_spend(9);
select pg_temp.claim(ad_reward_issue('putt_life')->>'reason' = 'off', 'the switch is off: not a tester, no video');
select become('00000000-0000-0000-0000-0000000000a1');
select pg_temp.claim(ad_reward_issue('fantasy_swap')->>'reason' = 'unknown_kind', 'a kind nobody built is refused');

-- PUTT PUTT: never past the max
select putt_lives_state(9);
select pg_temp.claim(ad_reward_issue('putt_life')->>'reason' = 'full', 'hearts full: no video offered');
select pg_temp.claim((ad_reward_status('putt_life')->>'ok')::boolean = false, 'and the status says so');

-- one lost, one paid back
select putt_lives_spend(9);
select putt_lives_spend(9);
create temp table c1 as select pg_temp.code(ad_reward_issue('putt_life')) as code;
select pg_temp.claim((select code from c1) is not null, 'a life down: a code');
select pg_temp.claim(ad_reward_claim((select code from c1))->>'reason' = 'too_soon', 'sent back at once: too soon');
select pg_temp.watched();
select pg_temp.claim((ad_reward_claim((select code from c1))->>'ok')::boolean, 'after the video: paid');
select pg_temp.claim((select lives from putt_lives_state(9)) = 8, 'two lost, one back: eight');
select pg_temp.claim(array_length((select back_at from putt_lives_state(9)), 1) = 1, 'one clock still running');
select pg_temp.claim(ad_reward_claim((select code from c1))->>'reason' = 'used', 'the same code twice pays nothing');

-- a code is its account's
create temp table c2 as select pg_temp.code(ad_reward_issue('putt_life')) as code;
select pg_temp.watched();
select become('00000000-0000-0000-0000-0000000000a3');
select pg_temp.claim(ad_reward_claim((select code from c2))->>'reason' = 'no_code', 'another account cannot use my code');
select become('00000000-0000-0000-0000-0000000000a1');
select pg_temp.claim((ad_reward_claim((select code from c2))->>'ok')::boolean, 'I can');
select pg_temp.claim((select lives from putt_lives_state(9)) = 9, 'back to nine');

-- full by the time it is claimed: nothing paid, nothing counted
select putt_lives_spend(9);
create temp table c3 as select pg_temp.code(ad_reward_issue('putt_life')) as code;
select pg_temp.watched();
update putt_lives set back_at = '{}', lives = 9, refill_at = null where user_id = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.claim(ad_reward_claim((select code from c3))->>'reason' = 'full', 'full when claimed: refused');
select pg_temp.claim((select result from ad_rewards where id = (select code from c3)) = 'full', 'filed as full, not granted');

-- THE CAP: three a day
select putt_lives_spend(9);
select putt_lives_spend(9);
select pg_temp.claim((ad_reward_status('putt_life')->>'left')::int = 1, 'two paid today, one left');
create temp table c4 as select pg_temp.code(ad_reward_issue('putt_life')) as code;
select pg_temp.watched();
select pg_temp.claim((ad_reward_claim((select code from c4))->>'left')::int = 0, 'the third: none left');
select pg_temp.claim(ad_reward_issue('putt_life')->>'reason' = 'cap', 'a fourth is refused');

-- two codes out when the third is paid: the other is refused at the claim
select become('00000000-0000-0000-0000-0000000000a3');
select putt_lives_state(9);
select putt_lives_spend(9) from generate_series(1, 4);
create temp table c5 as select n, pg_temp.code(ad_reward_issue('putt_life')) as code from generate_series(1, 3) n;
select pg_temp.claim(ad_reward_issue('putt_life')->>'reason' = 'busy', 'three codes waiting: no fourth');
select pg_temp.watched();
select ad_reward_claim(code) from c5 where n < 3;
create temp table c6 as select pg_temp.code(ad_reward_issue('putt_life')) as code;
select pg_temp.watched();
select pg_temp.claim((ad_reward_claim((select code from c6))->>'ok')::boolean, 'the third paid');
select pg_temp.claim(ad_reward_claim((select code from c5 where n = 3))->>'reason' = 'cap', 'a code past the cap pays nothing');
select pg_temp.claim(ad_rewards_today('00000000-0000-0000-0000-0000000000a3', 'putt_life') = 3, 'exactly three paid');

-- an old code
delete from public.ad_rewards where user_id = '00000000-0000-0000-0000-0000000000a3';
create temp table c7 as select pg_temp.code(ad_reward_issue('putt_life')) as code;
update public.ad_rewards set issued_at = now() - interval '11 minutes' where id = (select code from c7);
select pg_temp.claim(ad_reward_claim((select code from c7))->>'reason' = 'expired', 'a code over ten minutes old is refused');

-- THE ARCADE: one more play of the game named
select become('00000000-0000-0000-0000-0000000000a1');
select pg_temp.claim(ad_reward_issue('arcade_play', 'crossword')->>'reason' = 'has_play', 'a play left: no video');
select pg_temp.claim((arcade_spend_game('crossword')->>'ok')::boolean, 'today''s play');
select pg_temp.claim(arcade_spend_game('crossword')->>'reason' = 'spent', 'then spent');
select pg_temp.claim(ad_reward_issue('arcade_play', 'grid')->>'reason' = 'card_only', 'a card game is never offered');
create temp table c8 as select pg_temp.code(ad_reward_issue('arcade_play', 'crossword')) as code;
select pg_temp.watched();
select pg_temp.claim((ad_reward_claim((select code from c8))->>'ok')::boolean, 'the video pays a play');
select pg_temp.claim((arcade_game_status()->'ad'->>'crossword')::int = 1, 'the status shows it');
select pg_temp.claim((arcade_spend_game('crossword')->>'ok')::boolean, 'and the game plays again');
select pg_temp.claim(arcade_spend_game('crossword')->>'reason' = 'spent', 'once');
select pg_temp.claim(arcade_spend_game('sportegories')->>'ok' = 'true', 'other games are untouched');
select pg_temp.claim(ad_rewards_today('00000000-0000-0000-0000-0000000000a1', 'arcade_play') = 1, 'the arcade cap counts on its own');

-- NOBODY ELSE WRITES
select pg_temp.claim(not has_function_privilege('anon', 'public.ad_reward_claim(uuid, int)', 'execute'), 'a guest cannot claim');
select pg_temp.claim(not has_table_privilege('authenticated', 'public.ad_rewards', 'insert'), 'nor write the ledger');
select pg_temp.claim(not has_function_privilege('authenticated', 'public.ad_rewards_open(uuid)', 'execute'), 'nor ask about the switch for another');
select pg_temp.claim(has_function_privilege('authenticated', 'public.ad_reward_issue(text, text, int)', 'execute'), 'a signed in player can ask');

-- THE SWITCH ON: everybody
create or replace function public.ad_rewards_live() returns boolean language sql stable as $$ select true $$;
select become('00000000-0000-0000-0000-0000000000a2');
select pg_temp.claim((ad_reward_issue('putt_life')->>'ok')::boolean, 'switch on: not a tester, a code');
