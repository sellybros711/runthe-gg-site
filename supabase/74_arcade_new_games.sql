-- ---------------------------------------------------------------------------
-- 74_arcade_new_games.sql : register 'highlow' and 'sportegories' on the boards
--
-- Both grid_runs.game and grid_streaks.game carry a CHECK listing the allowed
-- game keys, and grid_submit_run() re-validates the same list. Neither was
-- updated when High Low shipped, so every High Low result has been rejected
-- with 'unknown game' - its leaderboard could never have worked. This adds it
-- alongside Sportegories.
--
-- Sportegories scores POINTS rather than a streak. It still rides the run_len
-- column: score = 1000000 - run_len*1000 + seconds already means "higher wins,
-- faster breaks the tie", which is exactly the ordering we want, so no new
-- column or index is needed.
--
-- Caps and floors for the two new games:
--   highlow       cap 200 like the other streak games; the standard 0.7s/round
--                 pace floor applies (each round has a forced reveal).
--   sportegories  cap 60 points (8 categories, realistically <= 40); the
--                 per-round floor is meaningless for points, so it only has to
--                 clear a flat 5-second minimum.
--
-- Everything else - score formula, streak logic, date window, daily ranked cap
-- - is unchanged. Safe to re-run; idempotent.
-- ---------------------------------------------------------------------------

-- 1) allow the two new keys on both tables
alter table grid_runs    drop constraint if exists grid_runs_game_check;
alter table grid_runs    add  constraint grid_runs_game_check
  check (game in ('match','crossword','wordsearch','guess','table','oddone',
                  'career','rankit','almamater','highlow','sportegories'));

alter table grid_streaks drop constraint if exists grid_streaks_game_check;
alter table grid_streaks add  constraint grid_streaks_game_check
  check (game in ('match','crossword','wordsearch','guess','table','oddone',
                  'career','rankit','almamater','highlow','sportegories'));

-- 2) the submit RPC validates the list itself, so it has to learn them too
create or replace function grid_submit_run(
  p_game text, p_date date, p_seconds integer, p_mistakes integer, p_reveals integer,
  p_run_len integer default null
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
begin
  if v_uid is null then raise exception 'sign in to post a score'; end if;
  if p_game not in ('match','crossword','wordsearch','guess','table','oddone',
                    'career','rankit','almamater','highlow','sportegories') then
    raise exception 'unknown game';
  end if;
  if p_seconds is null or p_seconds < 0 or p_seconds >= 86400 then raise exception 'bad time'; end if;

  -- 1) date window: device-local "today" only (plus timezone slack)
  if p_date is null or p_date < current_date - 1 or p_date > current_date + 1 then
    raise exception 'bad date';
  end if;

  p_mistakes := greatest(0, least(20, coalesce(p_mistakes, 0)));
  p_reveals  := greatest(0, least(60, coalesce(p_reveals,  0)));

  -- 2) per-game run caps + 3) speed floors
  v_cap := case p_game
    when 'almamater'    then 1000
    when 'table'        then 200
    when 'oddone'       then 200
    when 'career'       then 200
    when 'rankit'       then 200
    when 'highlow'      then 200
    when 'sportegories' then 60
    else 0 end;
  if v_cap > 0 then
    p_run_len := greatest(0, least(v_cap, coalesce(p_run_len, 0)));
    if p_game = 'sportegories' then
      -- points, not rounds: one card is a fixed two-minute sitting, so a
      -- per-round pace floor means nothing here.
      if p_seconds < 5 then raise exception 'implausible time'; end if;
    elsif p_run_len >= 5 and p_seconds < ceil(p_run_len * 0.7) then
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

  -- 4) daily ranked cap for free accounts: 3 new ranked rows per day, the
  -- same allowance as the daily play wallet. Cardholders are uncapped, and
  -- re-submitting a game already on today's board is always allowed.
  if v_old is null then
    if not exists (
      select 1 from public.subscriptions s
      where s.user_id = v_uid and s.status in ('active','trialing')
    ) then
      if (select count(*) from grid_runs where user_id = v_uid and puzzle_date = p_date) >= 3 then
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

revoke all on function grid_submit_run(text, date, integer, integer, integer, integer) from public, anon;
grant execute on function grid_submit_run(text, date, integer, integer, integer, integer) to authenticated;
