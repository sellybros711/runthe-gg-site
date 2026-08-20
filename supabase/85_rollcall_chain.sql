-- Run The Arcade - two new games reach the leaderboard: Roll Call and Chain.
--
-- Roll Call : one club, one season, ninety seconds. Score is NAMES FOUND, so it
--             rides run_len like the other counting games. Sixteen is the most
--             a board can hold (the generator caps it), so 40 is headroom
--             rather than a real ceiling.
-- Chain     : two players, two teammates in between. Solve or not, so it is a
--             TIMED game like the crossword: seconds plus a penalty per wrong
--             name, and it only posts on a solve.
--
-- The run caps live inside grid_submit_run, so adding a counting game means
-- redefining it. This is 82_grid_submit_idempotent.sql's body with two lines
-- changed, both marked below. Everything else (the replay rule, the ranked cap,
-- the speed floor, the streak arithmetic) is carried over untouched.
--
-- Idempotent: safe to run more than once. Requires 82_grid_submit_idempotent.sql.

-- ---------- 1) the valid game keys ------------------------------------------
create or replace function public.grid_game_ok(p_game text)
returns boolean
language sql immutable as $$
  select public.grid_base_game(p_game) in (
    'match','crossword','wordsearch','guess','table','oddone',
    'career','rankit','almamater','sportegories','highlow',
    'rollcall','chain'
  );
$$;

-- ---------- 2) the submit RPC, with Roll Call's cap --------------------------
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
    when 'rollcall'     then 40      -- CHANGED: names found on one roster
    when 'sportegories' then 30
    else 0 end;                      -- chain is timed, so it stays here
  if v_cap > 0 then
    p_run_len := greatest(0, least(v_cap, coalesce(p_run_len, 0)));
    -- Sportegories and Roll Call run on a fixed clock, so elapsed time proves
    -- nothing about the score and a floor on it would only reject fast honest
    -- cards.  CHANGED: rollcall joins the exemption.
    if v_base not in ('sportegories', 'rollcall')
       and p_run_len >= 8 and p_seconds < ceil(p_run_len * 0.4) then
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

  -- ONE statement decides the row. A replay only claims an empty slot, so it
  -- never overwrites; any other run keeps whichever score is better.
  insert into grid_runs (user_id, game, puzzle_date, base_seconds, mistakes, reveals,
                         run_len, display_name, flawless)
  values (v_uid, p_game, p_date, p_seconds, p_mistakes, p_reveals,
          p_run_len, v_name, (p_mistakes = 0 and p_reveals = 0))
  on conflict (user_id, game, puzzle_date) do update
    set base_seconds = excluded.base_seconds, mistakes = excluded.mistakes,
        reveals      = excluded.reveals,      run_len  = excluded.run_len,
        display_name = excluded.display_name, flawless = excluded.flawless
    where not p_replay and grid_runs.score > v_new
  returning id into v_id;

  -- The DO UPDATE was skipped by its WHERE, so nothing came back. The row is
  -- there and it is better than this one: keep it and report it.
  if v_id is null then
    select id into v_id from grid_runs
      where user_id = v_uid and game = p_game and puzzle_date = p_date;
  end if;

  -- cloud streak: consecutive puzzle_dates completed for this user+game
  select streak, best_streak, last_date into v_streak, v_best, v_last
    from grid_streaks where user_id = v_uid and game = p_game;
  if not found then
    v_streak := 1; v_best := 1;
    insert into grid_streaks (user_id, game, streak, best_streak, last_date)
    values (v_uid, p_game, 1, 1, p_date)
    on conflict (user_id, game) do update
      set streak      = greatest(grid_streaks.streak,      excluded.streak),
          best_streak = greatest(grid_streaks.best_streak, excluded.best_streak),
          last_date   = greatest(grid_streaks.last_date,   excluded.last_date),
          updated_at  = now();
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
grant execute on function public.grid_game_ok(text) to authenticated, anon;

notify pgrst, 'reload schema';

-- ---------- did it work? ----------------------------------------------------
-- Both new keys accepted, and a nonsense one still refused.
select public.grid_game_ok('rollcall') as rollcall_ok,
       public.grid_game_ok('chain')    as chain_ok,
       public.grid_game_ok('nonsense') as nonsense_ok;
