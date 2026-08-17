-- ---------------------------------------------------------------------------
-- 79_grid_replay_posts.sql : let an honest replay claim an empty board slot,
-- and stop arcade_spend_game refusing the sport editions.
--
-- THE BUG. Two separate silent-drop paths, both of which end with a player
-- finishing a puzzle, winning, opening the leaderboard and not being on it.
--
--   1. arcade_spend_game answers {ok:false, reason:'spent'} whenever the server
--      has already counted today's play for that game. tokens.js treated that
--      as proof of a forged wallet and board.js then refused to submit at all.
--      But 'spent' is the ordinary answer for a cleared cache, a second device,
--      or a sign-out (which now wipes the local wallet on purpose). Those
--      players are entitled to the game, played it fair, and got nothing: no
--      row, no streak, no explanation.
--
--      The client now posts those runs flagged as replays. p_replay says "the
--      server already counted a play for this today": fill an empty slot, never
--      overwrite a row that is already there. That is exactly the line that
--      matters, because the only thing a replay could otherwise buy is grinding
--      down your own time on a board you have already seen.
--
--   2. arcade_free_game matched the bare key, so 'match_nba' was 'card_only'
--      rather than a free game's sport edition. Only cardholders reach those
--      editions today (and they short-circuit above this check), so it has
--      never fired - but it is one entitlement change away from locking a free
--      player out of a game they own. Strip the suffix like grid_base_game does.
--
-- Also here: p_seconds < 3 rejected as 'implausible time' now says so as a
-- refusal the player can read, which it already did - the client just never
-- showed it. No change needed server-side, noted because it is the other thing
-- that can legitimately refuse a timed game.
--
-- Idempotent: safe to run more than once. Requires 72_grid_game_keys.sql.
-- ---------------------------------------------------------------------------

-- ---------- 1) the free-four list understands sport editions ----------------
create or replace function public.arcade_free_game(p_game text)
returns boolean
language sql immutable as $$
  select regexp_replace(lower(coalesce(p_game, '')), '_(nba|nfl|mlb)$', '')
         in ('match', 'sportegories', 'almamater', 'career');
$$;

-- ---------- 2) grid_submit_run gains p_replay -------------------------------
-- The old six-argument function has to go, or PostgREST cannot choose between
-- the two when a caller omits p_replay.
drop function if exists public.grid_submit_run(text, date, integer, integer, integer, integer);

create or replace function public.grid_submit_run(
  p_game text, p_date date, p_seconds integer, p_mistakes integer, p_reveals integer,
  p_run_len integer default null, p_replay boolean default false
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_name   text;
  v_streak integer; v_best integer; v_last date;
  v_id     bigint;
  v_new    integer;   -- score of this submission
  v_old    integer;   -- score already on the board today, if any
  v_cap    integer;   -- per-game run_len ceiling (0 = not a streak game)
  v_base   text;      -- game key with any sport suffix stripped
begin
  if v_uid is null then raise exception 'sign in to post a score'; end if;
  if not public.grid_game_ok(p_game) then raise exception 'unknown game'; end if;
  v_base := public.grid_base_game(p_game);
  if p_seconds is null or p_seconds < 0 or p_seconds >= 86400 then raise exception 'bad time'; end if;

  -- date window: device-local "today" only (plus timezone slack)
  if p_date is null or p_date < current_date - 1 or p_date > current_date + 1 then
    raise exception 'bad date';
  end if;

  p_mistakes := greatest(0, least(20, coalesce(p_mistakes, 0)));
  p_reveals  := greatest(0, least(60, coalesce(p_reveals,  0)));

  -- per-game run caps + speed floor, both on the BASE game so every sport
  -- edition inherits its parent's rules. 999 is the column's own ceiling.
  v_cap := case v_base
    when 'almamater'    then 999
    when 'highlow'      then 500
    when 'table'        then 200
    when 'oddone'       then 200
    when 'career'       then 200
    when 'rankit'       then 200
    when 'sportegories' then 30
    else 0 end;
  if v_cap > 0 then
    p_run_len := greatest(0, least(v_cap, coalesce(p_run_len, 0)));
    -- Sportegories runs on a fixed clock, so elapsed time proves nothing about
    -- the score and a floor on it would only reject fast honest cards.
    if v_base <> 'sportegories' and p_run_len >= 8 and p_seconds < ceil(p_run_len * 0.4) then
      raise exception 'implausible run';
    end if;
  else
    p_run_len := null;                       -- timed games carry no run length
    if p_seconds < 3 then raise exception 'implausible time'; end if;
  end if;

  -- same formula as the generated score column, so the RPC can pick the better row
  v_new := case when p_run_len is not null
                then 1000000 - p_run_len * 1000 + least(p_seconds, 999)
                else p_seconds + p_mistakes * 10 + p_reveals * 15 end;

  select username into v_name from profiles where id = v_uid;
  select score into v_old from grid_runs where user_id = v_uid and game = p_game and puzzle_date = p_date;

  -- A replay whose slot is already filled is not an error and not a refusal:
  -- the player has a row for today and this run cannot improve it. Return the
  -- row they already have so the game shows their real streak.
  if p_replay and v_old is not null then
    select id into v_id from grid_runs where user_id = v_uid and game = p_game and puzzle_date = p_date;
    select streak, best_streak into v_streak, v_best from grid_streaks where user_id = v_uid and game = p_game;
    return json_build_object('id', v_id, 'streak', coalesce(v_streak, 0),
                             'best_streak', coalesce(v_best, 0), 'replay', true);
  end if;

  -- daily ranked cap for free accounts: one row per free game, so four a day.
  -- Cardholders are uncapped, and re-submitting a game already on today's board
  -- is always allowed.
  if v_old is null then
    if not exists (
      select 1 from public.subscriptions s
      where s.user_id = v_uid and s.status in ('active','trialing')
    ) then
      if (select count(*) from grid_runs where user_id = v_uid and puzzle_date = p_date) >= 4 then
        raise exception 'daily ranked limit reached';
      end if;
    end if;
  end if;

  if v_old is null then
    insert into grid_runs (user_id, game, puzzle_date, base_seconds, mistakes, reveals, run_len, display_name, flawless)
    values (v_uid, p_game, p_date, p_seconds, p_mistakes, p_reveals, p_run_len, v_name, (p_mistakes = 0 and p_reveals = 0))
    returning id into v_id;
  elsif v_new < v_old then
    update grid_runs set base_seconds = p_seconds, mistakes = p_mistakes, reveals = p_reveals,
        run_len = p_run_len, display_name = v_name, flawless = (p_mistakes = 0 and p_reveals = 0)
      where user_id = v_uid and game = p_game and puzzle_date = p_date
      returning id into v_id;
  else
    select id into v_id from grid_runs where user_id = v_uid and game = p_game and puzzle_date = p_date;
  end if;

  -- cloud streak: consecutive puzzle_dates completed for this user+game
  select streak, best_streak, last_date into v_streak, v_best, v_last
    from grid_streaks where user_id = v_uid and game = p_game;
  if not found then
    v_streak := 1; v_best := 1;
    insert into grid_streaks (user_id, game, streak, best_streak, last_date)
    values (v_uid, p_game, 1, 1, p_date);
  else
    if v_last = p_date then
      null;                                   -- already counted today; no change
    elsif v_last = p_date - 1 then
      v_streak := coalesce(v_streak, 0) + 1;  -- next calendar day
    else
      v_streak := 1;                          -- gap: streak resets
    end if;
    v_best := greatest(coalesce(v_best, 0), v_streak);
    update grid_streaks
      set streak = v_streak, best_streak = v_best, last_date = p_date, updated_at = now()
      where user_id = v_uid and game = p_game;
  end if;

  return json_build_object('id', v_id, 'streak', v_streak, 'best_streak', v_best);
end $$;

revoke all on function public.grid_submit_run(text, date, integer, integer, integer, integer, boolean) from public, anon;
grant execute on function public.grid_submit_run(text, date, integer, integer, integer, integer, boolean) to authenticated;
grant execute on function public.arcade_free_game(text) to authenticated, anon;

notify pgrst, 'reload schema';

-- ---------- 3) who is actually being capped ---------------------------------
-- Run this after the migration to see whether your own account is treated as a
-- free account. No subscriptions row with status active/trialing means the
-- four-a-day ranked cap applies to you, which is what an empty board looks like
-- from the inside once you have posted four games in a day.
select coalesce(p.username, '(no username)') as username,
       u.email,
       coalesce(s.status, '(no subscription row)') as sub_status,
       s.price_id,
       (select count(*) from public.grid_runs r
         where r.user_id = u.id and r.puzzle_date = current_date) as rows_today
from auth.users u
left join public.profiles p on p.id = u.id
left join public.subscriptions s on s.user_id = u.id
order by rows_today desc, u.created_at desc
limit 20;
