-- ---------------------------------------------------------------------------
-- 158_ad_rewards.sql : a rewarded video pays a Putt Putt life or an arcade play.
--
-- Safe to run more than once. Needs 146_putt_lives_nine.sql, 151_putt_lives_extra.sql
-- and 91_arcade_trial.sql.
--
-- The owner's calls (2026-10-28, through the Ads Agent):
--   - A rewarded video gives one Putt Putt life, or one more play of an arcade game.
--   - Three a day of each, per account. Signed in only: a guest is asked to sign in.
--   - The ad network may not tell this server that a video was watched (Google's
--     web rewarded ads report it only in the browser). So the server cannot prove a
--     view. The owner approved this fallback: the server hands out a single use code
--     just before the video plays, the page sends it back when the video ends, and
--     the cap is held here. A cheater gets at most what an honest player gets by
--     watching three videos, and nothing behind it is sold goods past the max.
--
-- THE SWITCH. ad_rewards_live() answers false, so only the tester accounts (the
-- same list as putt_lives_refill and the golf page's PUTT_TESTERS) can be paid.
-- Turning it on for everybody is the owner's step: re-create that one function
-- answering true. Nothing else changes.
--
-- HOW IT GOES.
--   1. ad_reward_issue(kind, target, max) before the video. It says no (and the
--      page shows no button) when the switch is off, the cap is reached, the
--      hearts are full or the arcade game still has a play. Otherwise a code.
--   2. The video plays.
--   3. ad_reward_claim(code, max) after it. The code must be this account's, at
--      least 5 seconds old, under 10 minutes old and never used. The cap is asked
--      again, under a lock, so two tabs cannot both take the third.
--
-- WHAT IT PAYS.
--   putt_life    cancels the clock due back last, like a spare (150). Never past the
--                max: extras are only bought. Full by the time it is claimed, the
--                code is used and nothing is paid or counted ('full').
--   arcade_play  one more play today of the free game named at issue. It lifts
--                that game's cap in arcade_spend_game by one. Card games are not
--                offered: a look at one is what the Arcade Card sells.
--
-- TWO RE-RUN HAZARDS. Re-running 91 after this file puts back an arcade cap that ignores
-- the ad plays (preflight row 67 reads NO). Re-running this file turns the switch off.
--
-- A NEW KIND (a Fantasy swap, a golf mulligan) is the owning agent's grant: add the
-- kind to ad_reward_kind_ok() and its branch in ad_reward_claim(), with its test.
-- ---------------------------------------------------------------------------

create table if not exists public.ad_rewards (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,
  target     text,
  day        date not null default (now() at time zone 'America/New_York')::date,
  issued_at  timestamptz not null default now(),
  claimed_at timestamptz,
  result     text check (result in ('granted', 'full', 'spent'))
);
create index if not exists ad_rewards_user_day on public.ad_rewards (user_id, day, kind);

alter table public.ad_rewards enable row level security;
revoke all on public.ad_rewards from anon, authenticated;
-- No policy and no grant: a browser writes only through the functions below.

-- THE SWITCH. False: testers only.
create or replace function public.ad_rewards_live()
returns boolean language sql stable as $$ select false $$;

create or replace function public.ad_reward_cap()
returns int language sql stable as $$ select 3 $$;

create or replace function public.ad_reward_kind_ok(p_kind text)
returns boolean language sql stable as $$ select p_kind in ('putt_life', 'arcade_play') $$;

create or replace function public.ad_rewards_open(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.ad_rewards_live() or exists (
    select 1 from profiles p where p.id = p_uid
       and lower(p.username::text) in ('csel8','runnyj','malikwillislover','slimeyb3','jordantest'));
$$;

-- rewards paid today of one kind (and one arcade game, when p_target is given)
create or replace function public.ad_rewards_today(p_uid uuid, p_kind text, p_target text default null)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.ad_rewards
   where user_id = p_uid and kind = p_kind and result = 'granted'
     and day = (now() at time zone 'America/New_York')::date
     and (p_target is null or target = p_target);
$$;

-- the arcade game's cap today: one play, the referral bonus, and its ad plays
create or replace function public.arcade_game_cap(p_uid uuid, p_game text)
returns int language sql stable security definer set search_path = public as $$
  select 1 + public.arcade_bonus_today(p_uid)
           + public.ad_rewards_today(p_uid, 'arcade_play', lower(coalesce(p_game, '')));
$$;

-- why a video may not be offered now, or null when it may
create or replace function public.ad_reward_refusal(p_uid uuid, p_kind text, p_target text, p_max int)
returns text language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_plays int;
begin
  if p_uid is null then return 'sign_in'; end if;
  if not public.ad_reward_kind_ok(p_kind) then return 'unknown_kind'; end if;
  if not public.ad_rewards_open(p_uid) then return 'off'; end if;
  if public.ad_rewards_today(p_uid, p_kind) >= public.ad_reward_cap() then return 'cap'; end if;
  if p_kind = 'putt_life' then
    select * into r from putt_lives_state(p_max, null);
    if r.lives >= r.max_lives then return 'full'; end if;
  elsif p_kind = 'arcade_play' then
    if public.arcade_card_active(p_uid) then return 'unlimited'; end if;
    if not public.arcade_free_game(lower(coalesce(p_target, ''))) then return 'card_only'; end if;
    select plays into v_plays from public.arcade_game_plays
     where user_id = p_uid and game = lower(p_target)
       and play_date = (now() at time zone 'America/New_York')::date;
    if coalesce(v_plays, 0) < public.arcade_game_cap(p_uid, p_target) then return 'has_play'; end if;
  end if;
  return null;
end $$;

-- 1. before the video: a single use code, or the reason there is none
create or replace function public.ad_reward_issue(p_kind text, p_target text default null, p_max int default 9)
returns json language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  why text;
  v_id uuid;
begin
  why := public.ad_reward_refusal(uid, p_kind, p_target, p_max);
  if why is not null then return json_build_object('ok', false, 'reason', why); end if;
  -- three codes waiting at once is plenty; more is a script asking
  if (select count(*) from public.ad_rewards
       where user_id = uid and claimed_at is null and issued_at > now() - interval '10 minutes') >= 3 then
    return json_build_object('ok', false, 'reason', 'busy');
  end if;
  insert into public.ad_rewards (user_id, kind, target)
    values (uid, p_kind, case when p_kind = 'arcade_play' then lower(p_target) end)
    returning id into v_id;
  return json_build_object('ok', true, 'code', v_id,
                           'left', public.ad_reward_cap() - public.ad_rewards_today(uid, p_kind));
end $$;

-- 3. after the video: pay it, once
create or replace function public.ad_reward_claim(p_code uuid, p_max int default 9)
returns json language plpgsql security definer set search_path = public as $$
declare
  uid  uuid := auth.uid();
  a    public.ad_rewards;
  why  text;
  r    record;
  n    int;
  kept timestamptz[];
begin
  if uid is null then return json_build_object('ok', false, 'reason', 'sign_in'); end if;
  perform pg_advisory_xact_lock(hashtext('ad_rewards:' || uid::text));
  select * into a from public.ad_rewards where id = p_code and user_id = uid for update;
  if not found then return json_build_object('ok', false, 'reason', 'no_code'); end if;
  if a.claimed_at is not null then return json_build_object('ok', false, 'reason', 'used'); end if;
  if a.issued_at > now() - interval '5 seconds' then
    return json_build_object('ok', false, 'reason', 'too_soon');
  end if;
  if a.issued_at < now() - interval '10 minutes' then
    update public.ad_rewards set claimed_at = now(), result = 'spent' where id = a.id;
    return json_build_object('ok', false, 'reason', 'expired');
  end if;

  -- the day it is claimed is the day it counts
  update public.ad_rewards set day = (now() at time zone 'America/New_York')::date where id = a.id;
  why := public.ad_reward_refusal(uid, a.kind, a.target, p_max);
  if why is not null then
    update public.ad_rewards set claimed_at = now(),
           result = case when why = 'full' then 'full' else 'spent' end where id = a.id;
    return json_build_object('ok', false, 'reason', why);
  end if;

  if a.kind = 'putt_life' then
    select * into r from putt_lives_state(p_max, null);
    n    := coalesce(array_length(r.back_at, 1), 0);
    kept := case when n > 1 then r.back_at[1:n - 1] else '{}'::timestamptz[] end;
    update putt_lives pl
       set back_at    = kept,
           lives      = greatest(0, r.max_lives - coalesce(array_length(kept, 1), 0)),
           refill_at  = kept[1],
           updated_at = now()
     where pl.user_id = uid;
  end if;
  -- arcade_play needs no write of its own: the granted row lifts arcade_game_cap

  update public.ad_rewards set claimed_at = now(), result = 'granted' where id = a.id;
  return json_build_object('ok', true, 'kind', a.kind, 'target', a.target,
                           'left', public.ad_reward_cap() - public.ad_rewards_today(uid, a.kind));
end $$;

-- what the page asks to decide whether to show the button at all
create or replace function public.ad_reward_status(p_kind text, p_target text default null, p_max int default 9)
returns json language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  why text := public.ad_reward_refusal(auth.uid(), p_kind, p_target, p_max);
begin
  return json_build_object('ok', why is null, 'reason', why,
                           'left', case when uid is null then 0
                                        else public.ad_reward_cap() - public.ad_rewards_today(uid, p_kind) end);
end $$;

-- ---------- the arcade: 91's spend and status, with the ad plays in the cap -------
-- Only `cap :=` changes in arcade_spend_game, and arcade_game_status adds 'ad'.
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

  -- ---- a free game: one play a day, today's referral bonus, today's ad plays
  cap := public.arcade_game_cap(uid, g);

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

create or replace function public.arcade_game_status()
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  d   date := (now() at time zone 'America/New_York')::date;
  v_plays json;
  v_bonus int;
  v_trial json;
  v_ad    json;
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
  select coalesce(json_object_agg(target, n), '{}'::json) into v_ad
    from (select target, count(*)::int n from public.ad_rewards
           where user_id = uid and kind = 'arcade_play' and result = 'granted' and day = d
           group by target) t;
  v_bonus := public.arcade_bonus_today(uid);
  return json_build_object('signed_in', true, 'unlimited', false,
                           'cap', 1 + v_bonus, 'bonus', v_bonus, 'plays', v_plays,
                           'ad', v_ad,
                           'free', to_json(public.arcade_free_games()),
                           'trials_used', v_trial);
end $$;

-- ---------- grants ---------------------------------------------------------------
revoke all on function public.ad_rewards_open(uuid)                    from public, anon, authenticated;
revoke all on function public.ad_rewards_today(uuid, text, text)       from public, anon, authenticated;
revoke all on function public.arcade_game_cap(uuid, text)              from public, anon, authenticated;
revoke all on function public.ad_reward_refusal(uuid, text, text, int) from public, anon, authenticated;
revoke all on function public.ad_reward_issue(text, text, int)         from public, anon;
revoke all on function public.ad_reward_claim(uuid, int)               from public, anon;
revoke all on function public.ad_reward_status(text, text, int)        from public, anon;
grant execute on function public.ad_reward_issue(text, text, int)  to authenticated;
grant execute on function public.ad_reward_claim(uuid, int)        to authenticated;
grant execute on function public.ad_reward_status(text, text, int) to authenticated;
grant execute on function public.arcade_spend_game(text)           to authenticated;
grant execute on function public.arcade_game_status()              to authenticated;

notify pgrst, 'reload schema';
