-- ---------------------------------------------------------------------------
-- 70_grid_integrity.sql : leaderboard integrity hardening for grid_submit_run
--
-- Scores are client-reported, so the submit RPC is the only place that can
-- keep the boards honest. This replaces grid_submit_run with four new guards
-- on top of the existing clamps (everything else - score formula, streak
-- logic, one-row-per-user-per-game-per-day upsert - is unchanged):
--
--   1) DATE WINDOW      p_date must be within a day of the server's date.
--                       Clients submit their device-local "today", so the
--                       [-1, +1] window covers every real timezone while
--                       blocking streak backfills and future-board posts.
--   2) RUN CAPS         per-game ceilings that mirror the clients' own
--                       maximums (streak games serve at most 200 rounds per
--                       run, Alma Mater up to 1000). A 5,000-run submission
--                       cannot exist legitimately.
--   3) SPEED FLOOR      each streak answer takes at least ~1.5s of forced
--                       reveal animation; we require 0.7s per round (half
--                       that, deliberately generous) so a 200-run posted
--                       with 20 seconds on the clock is rejected. Timed
--                       games get a loose 3-second minimum.
--   4) DAILY RANKED CAP a free account gets 3 plays per day, so it can have
--                       at most 3 NEW ranked rows per day. Cardholders
--                       (subscriptions active/trialing, same check as
--                       arcade_spend_token) are uncapped. Improving an
--                       existing row is always allowed.
--
-- Rejections raise; the client's board post fails soft (the game continues,
-- the run just doesn't hit the leaderboard). Safe to re-run; idempotent.
-- ---------------------------------------------------------------------------

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
  if p_game not in ('match','crossword','wordsearch','guess','table','oddone','career','rankit','almamater') then raise exception 'unknown game'; end if;
  if p_seconds is null or p_seconds < 0 or p_seconds >= 86400 then raise exception 'bad time'; end if;

  -- 1) date window: device-local "today" only (plus timezone slack)
  if p_date is null or p_date < current_date - 1 or p_date > current_date + 1 then
    raise exception 'bad date';
  end if;

  p_mistakes := greatest(0, least(20, coalesce(p_mistakes, 0)));
  p_reveals  := greatest(0, least(60, coalesce(p_reveals,  0)));

  -- 2) per-game run caps + 3) speed floors
  v_cap := case p_game
    when 'almamater' then 1000
    when 'table'     then 200
    when 'oddone'    then 200
    when 'career'    then 200
    when 'rankit'    then 200
    else 0 end;
  if v_cap > 0 then
    p_run_len := greatest(0, least(v_cap, coalesce(p_run_len, 0)));
    if p_run_len >= 5 and p_seconds < ceil(p_run_len * 0.7) then
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
