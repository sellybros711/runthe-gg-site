-- Run The Arcade - ONE streak for the arcade, not twelve for the games.
--
-- Today there are twelve per-game streaks in grid_streaks and no streak for
-- the arcade itself. The hub's flame shows the LARGEST of the twelve, which is
-- a number that goes up while somebody skips eleven games, and it is labelled
-- as though it were the arcade's. So the one number a daily habit is built on
-- does not exist, and the number standing in for it is not true.
--
-- This adds it, and adds nothing else: days in a row on which you finished at
-- least one arcade game. The per-game streaks stay exactly as they are, on
-- each game's own result screen, where they belong.
--
-- WHY IT IS COMPUTED AND NOT STORED. A stored counter needs a writer on every
-- submit path, and there are three of them (grid_submit_run, the replay path,
-- and the outbox flush), so a fourth place to forget. The dates are already in
-- grid_runs, one row per user per game per day, indexed on (user_id). Counting
-- backwards from today over a distinct-date list is a few hundred rows for the
-- most devoted player alive and it cannot drift, because there is nothing to
-- keep in step.
--
-- THE DAY BOUNDARY is America/New_York, the same clock arcade_game_status()
-- and arcade_spend_game() already use. The client's day is its own local date,
-- so for a few hours around midnight a player outside Eastern can see a streak
-- that has not ticked over yet. That is the existing skew and this does not
-- widen it; see the plan's "one clock" pass, which is where it gets fixed for
-- everything at once.
--
-- Idempotent: safe to run more than once. Requires 52_grid_daily.sql.

-- ---------- the streak ------------------------------------------------------
-- Returns { streak, best, last_date, played_today }.
--   streak       days in a row ending today or yesterday. Yesterday still
--                counts: a streak is not broken until the day is over, and a
--                player who opens the hub at 9am has not lost anything yet.
--   best         the longest such run they have ever had.
--   played_today whether today is already in it, which is what the hub needs
--                to decide between "keep it going" and "kept".
create or replace function public.arcade_day_streak()
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  uid   uuid := auth.uid();
  today date := (now() at time zone 'America/New_York')::date;
  v_cur   int := 0;
  v_best  int := 0;
  v_last  date;
  v_today boolean := false;
  r       record;
  prev    date;
  run     int := 0;
begin
  if uid is null then
    return json_build_object('signed_in', false);
  end if;

  -- every distinct day this user finished any arcade game, newest first
  for r in
    select distinct puzzle_date as d
      from public.grid_runs
     where user_id = uid
     order by 1 desc
  loop
    if v_last is null then
      v_last := r.d;
      v_today := (r.d = today);
      -- the current run only counts if it reaches today or yesterday
      if r.d = today or r.d = today - 1 then v_cur := 1; end if;
      run := 1;
    elsif r.d = prev - 1 then
      run := run + 1;
      if v_cur > 0 and run > v_cur then v_cur := run; end if;
    else
      if run > v_best then v_best := run; end if;
      run := 1;
    end if;
    prev := r.d;
  end loop;
  if run > v_best then v_best := run; end if;
  if v_cur > v_best then v_best := v_cur; end if;

  return json_build_object(
    'signed_in', true,
    'streak', v_cur,
    'best', v_best,
    'last_date', v_last,
    'played_today', v_today
  );
end $$;

grant execute on function public.arcade_day_streak() to authenticated;

-- ---------- the index the loop leans on -------------------------------------
-- grid_runs is already indexed for the leaderboard's (game, puzzle_date). This
-- walk is the other direction: one user, every date. Without it the scan is the
-- whole table once per result screen.
create index if not exists grid_runs_user_date_idx
  on public.grid_runs (user_id, puzzle_date desc);

-- ---------- what this does NOT do -------------------------------------------
-- No backfill, because nothing is stored: the answer is derived from rows that
-- have been accumulating since the arcade opened, so every existing player has
-- their real streak the moment this lands.
-- No writes, no triggers, no new table. Dropping this function returns the
-- site to exactly where it is now, and the client already falls back to the
-- per-game streak when the RPC is missing.
