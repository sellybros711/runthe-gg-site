-- ---------------------------------------------------------------------------
-- 72_grid_game_keys.sql : let every game key the client actually posts reach
-- the leaderboard.
--
-- THE BUG. grid_runs.game and grid_streaks.game carried a CHECK constraint
-- listing nine games, and grid_submit_run repeated the same list. Neither knew
-- about:
--
--   * sportegories and highlow, added after 52_grid_daily.sql was written. Both
--     call RTG_BOARD.submit, both were refused, so neither has ever had a
--     leaderboard row. Their boards read empty because they ARE empty.
--   * the sport editions. mode.js keys a cardholder's NBA/NFL/MLB game as
--     '<base>_nba' / '_nfl' / '_mlb' (see RTGMode.key), and the page mounts its
--     leaderboard on the same key. Every one of those posts raised 'unknown
--     game'. A member playing Daily Match NBA won, posted, and watched an empty
--     board, because the only board they could see was the one nothing was
--     allowed to be written to.
--
-- The client fails soft on a refused post (board.js post() -> false -> null),
-- so this lost silently for as long as those keys have existed.
--
-- THE FIX. Validate the BASE game with the sport suffix stripped, in the
-- constraints and in the RPC, from one immutable helper. New keys are additive:
-- adding a game means adding it to grid_game_ok, not touching three lists.
--
-- Also here, because they are the same class of silent rejection:
--   * run caps now key off the base too. 'career_nba' fell to the else branch
--     and had its run_len thrown away, so sport-edition streak scores would
--     have posted as time-scored rows even once the key was allowed.
--   * almamater's cap was 1000 against a column that checks run_len <= 999.
--   * the speed floor assumed run_len counts ROUNDS. Career Path, Odd One Out
--     and Alma Mater now post POINTS, which climb faster than rounds do, so the
--     floor had quietly tightened on exactly the best runs. 0.4s per unit still
--     rejects a 200 posted with 20 seconds on the clock.
--   * Sportegories is exempt from the floor: it runs on a fixed 120s clock, so
--     its elapsed time is not something a player can inflate a score with.
--   * the free daily ranked cap was 3, matching the old shared wallet. A free
--     account now gets one go at each of four games, so 4 rows is the ceiling.
--
-- Idempotent: safe to run more than once.
-- ---------------------------------------------------------------------------

-- ---------- 1) one definition of a valid game key ---------------------------
create or replace function public.grid_base_game(p_game text)
returns text
language sql immutable as $$
  select regexp_replace(coalesce(p_game, ''), '_(nba|nfl|mlb)$', '');
$$;

create or replace function public.grid_game_ok(p_game text)
returns boolean
language sql immutable as $$
  select public.grid_base_game(p_game) in (
    'match','crossword','wordsearch','guess','table','oddone',
    'career','rankit','almamater','sportegories','highlow'
  );
$$;

-- ---------- 2) widen the table constraints ----------------------------------
alter table public.grid_runs    drop constraint if exists grid_runs_game_check;
alter table public.grid_runs    add  constraint grid_runs_game_check    check (public.grid_game_ok(game));
alter table public.grid_streaks drop constraint if exists grid_streaks_game_check;
alter table public.grid_streaks add  constraint grid_streaks_game_check check (public.grid_game_ok(game));

-- ---------- 3) the submit RPC -----------------------------------------------
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

revoke all on function grid_submit_run(text, date, integer, integer, integer, integer) from public, anon;
grant execute on function grid_submit_run(text, date, integer, integer, integer, integer) to authenticated;
grant execute on function public.grid_base_game(text) to authenticated, anon;
grant execute on function public.grid_game_ok(text)   to authenticated, anon;
