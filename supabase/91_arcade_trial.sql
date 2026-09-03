-- Run The Arcade - one free play of every Arcade Card game, once, ever.
--
-- WHY: the eight card games are currently a closed door with a price on it. A
-- free player has never seen Rank It, so "get the Arcade Card for all twelve"
-- is asking them to buy eight things they have never played. This gives every
-- ACCOUNT one lifetime go at each of them. Play it once, it locks, and the
-- offer lands on somebody who now knows what they are buying.
--
-- ONCE, EVER, NOT ONCE A DAY. arcade_game_plays is keyed on (user, date, game)
-- and resets at the New York midnight, which is exactly the wrong shape for
-- this: a daily trial is just a smaller free tier. So the trial gets its own
-- table with no date in the key, and a row in it is a door that has closed.
--
-- SIGNED-IN ONLY, and that is the point rather than a limitation: the trial is
-- what a free account is FOR. A signed-out visitor gets asked for an account,
-- which is the cheapest thing we ever ask for, and the account is what makes
-- the trial un-farmable (auth.uid(), not a localStorage key anyone can clear).
--
-- The base game is the key: 'career_nba' and 'career' are one entitlement, the
-- same rule arcade_free_game() already follows. So a player cannot spend their
-- Number Game trial and then find a second one waiting under the NFL edition.
--
-- Idempotent: safe to run more than once. Requires 84_free_games_crossword.sql
-- (arcade_free_games) and 85_rollcall_chain.sql (grid_game_ok, grid_base_game).

-- ---------- 1) the doors that have closed --------------------------------
create table if not exists public.arcade_game_trial (
  user_id  uuid not null references auth.users(id) on delete cascade,
  game     text not null,                       -- base game, no sport suffix
  used_on  date not null default (now() at time zone 'America/New_York')::date,
  used_at  timestamptz not null default now(),
  primary key (user_id, game)
);
alter table public.arcade_game_trial enable row level security;
drop policy if exists "arcade_game_trial read own" on public.arcade_game_trial;
create policy "arcade_game_trial read own" on public.arcade_game_trial
  for select using (auth.uid() = user_id);
-- writes happen only through the SECURITY DEFINER function below.

-- ---------- 2) which games a trial applies to ------------------------------
-- Every real game that is not one of the free ones. Defined by subtraction so
-- there is still only ONE list to maintain (arcade_free_games), and adding a
-- game to the arcade gives it a trial without anybody remembering to.
create or replace function public.arcade_trial_game(p_game text)
returns boolean
language sql stable as $$
  select public.grid_game_ok(p_game)
     and not public.arcade_free_game(p_game);
$$;

-- ---------- 3) spend: free games daily, card games once ever ---------------
-- Supersedes the 83_referrals version. The free-game path is untouched; the
-- only change is what happens when the game is NOT free, which used to be a
-- flat refusal.
create or replace function public.arcade_spend_game(p_game text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  d   date := (now() at time zone 'America/New_York')::date;
  cap int;
  g   text := lower(coalesce(p_game, ''));
  b   text := public.grid_base_game(lower(coalesce(p_game, '')));
  v_plays int;
  v_new   int;
begin
  if uid is null then
    return json_build_object('ok', false, 'reason', 'not_signed_in');
  end if;
  if public.arcade_card_active(uid) then
    return json_build_object('ok', true, 'unlimited', true);
  end if;

  -- ---- an Arcade Card game: one look, once, ever --------------------------
  if not public.arcade_free_game(g) then
    if not public.arcade_trial_game(g) then          -- not a game we know
      return json_build_object('ok', false, 'reason', 'card_only', 'game', g);
    end if;
    -- The insert IS the check. Doing it atomically is what stops two tabs, or
    -- two phones, from each being told they have the last free play.
    with ins as (
      insert into public.arcade_game_trial (user_id, game) values (uid, b)
      on conflict (user_id, game) do nothing
      returning 1
    )
    select count(*)::int into v_new from ins;
    if v_new = 1 then
      return json_build_object('ok', true, 'unlimited', false, 'game', g,
                               'trial', true, 'used', 1, 'remaining', 0, 'cap', 1);
    end if;
    return json_build_object('ok', false, 'reason', 'card_only', 'game', g,
                             'trial_used', true);
  end if;

  -- ---- a free game: one play a day, plus today's referral bonus -----------
  cap := 1 + public.arcade_bonus_today(uid);

  insert into public.arcade_game_plays (user_id, play_date, game, plays)
    values (uid, d, g, 1)
    on conflict (user_id, play_date, game)
      do update set plays = public.arcade_game_plays.plays + 1
      where public.arcade_game_plays.plays < cap
    returning plays into v_plays;

  if v_plays is null then                    -- this game is used up for today
    select plays into v_plays from public.arcade_game_plays
      where user_id = uid and play_date = d and game = g;
    return json_build_object('ok', false, 'reason', 'spent', 'game', g,
                             'unlimited', false, 'used', coalesce(v_plays, cap), 'remaining', 0);
  end if;

  return json_build_object('ok', true, 'unlimited', false, 'game', g,
                           'used', v_plays, 'remaining', cap - v_plays, 'cap', cap);
end $$;

-- ---------- 4) status carries the spent trials -----------------------------
-- The hub paints a tile before it can afford a round trip, so the client keeps
-- a local mirror of this list. It is a mirror, not a source: the insert above
-- is the only thing that decides, and a cleared browser learns the truth again
-- on the next reconcile.
create or replace function public.arcade_game_status()
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  d   date := (now() at time zone 'America/New_York')::date;
  v_plays json;
  v_bonus int;
  v_trial json;
begin
  if uid is null then
    return json_build_object('signed_in', false);
  end if;
  if public.arcade_card_active(uid) then
    return json_build_object('signed_in', true, 'unlimited', true);
  end if;
  select coalesce(json_object_agg(game, plays), '{}'::json) into v_plays
    from public.arcade_game_plays where user_id = uid and play_date = d;
  select coalesce(json_agg(game), '[]'::json) into v_trial
    from public.arcade_game_trial where user_id = uid;
  v_bonus := public.arcade_bonus_today(uid);
  return json_build_object('signed_in', true, 'unlimited', false,
                           'cap', 1 + v_bonus, 'bonus', v_bonus, 'plays', v_plays,
                           'free', to_json(public.arcade_free_games()),
                           'trials_used', v_trial);
end $$;

-- ---------- 5) grants -------------------------------------------------------
grant execute on function public.arcade_trial_game(text) to authenticated, anon;
grant execute on function public.arcade_spend_game(text) to authenticated;
grant execute on function public.arcade_game_status()    to authenticated;

-- ---------- 6) what this does NOT change ------------------------------------
-- Nobody loses anything: the free four still get their daily play and their
-- referral bonus on top, cardholders are still unlimited, and a player who has
-- already used a card game today (they could not have) is unaffected. Existing
-- accounts start with an empty trial table, so every account that predates this
-- gets its eight free looks too.

notify pgrst, 'reload schema';
