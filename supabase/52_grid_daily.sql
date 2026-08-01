-- ============================================================================
-- 52_grid_daily.sql : per-game daily boards + cloud streaks for RunTheGrid (/grid)
-- ============================================================================
-- New and self-contained. Touches nothing that already exists: no existing table,
-- function, policy or grant is altered. Safe and idempotent; re-running does nothing
-- new. Run it once in the Supabase SQL editor.
--
-- Until it is run, grid/board.js gets a 404 from every call, reports itself
-- offline, and the games show the "Sample" board and the local (device-only) streak
-- instead of wrong numbers. Nothing here is ever allowed to break a finished puzzle.
--
-- WHAT IS TRUSTED AND WHAT IS NOT
-- -------------------------------
-- The puzzle is solved in the browser, so completion time, mistakes and reveals are
-- CLIENT-REPORTED. This is a comparison board, not the basis for a prize. What the
-- server owns and the client cannot forge: the score formula, the flawless flag, the
-- streak, and the display name (read from profiles for auth.uid(); never sent by the
-- client). Writes are signed-in only; reads are public.
--
-- BOARD SHAPE: one row per (user, game, puzzle_date). Independent per-game
-- boards (Match, Crossword, Word Search), each ranked by score ascending (lower
-- = better).
-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- grid_runs : one completed puzzle per user per day per game
-- ---------------------------------------------------------------------------
create table if not exists grid_runs (
  id           bigserial primary key,
  created_at   timestamptz not null default now(),
  user_id      uuid not null,
  game         text not null check (game in ('match','crossword','wordsearch')),
  puzzle_date  date not null,

  -- raw, client-reported inputs
  base_seconds integer  not null check (base_seconds >= 0 and base_seconds < 86400),
  mistakes     smallint not null default 0 check (mistakes >= 0 and mistakes <= 20),
  reveals      smallint not null default 0 check (reveals  >= 0 and reveals  <= 60),

  -- server-owned, never sent by the client
  display_name text,
  flawless     boolean not null default false,

  -- THE one sortable key. Lower is better: raw time + 10s per mistake + 15s per
  -- reveal. Generated so the client can never post a score that disagrees with its
  -- own inputs.
  score integer generated always as (base_seconds + mistakes * 10 + reveals * 15) stored,

  unique (user_id, game, puzzle_date)
);

comment on table grid_runs is
  'RunTheGrid daily results (/grid). One row per user per game per day. Written only by grid_submit_run().';

-- Every board query is (game, puzzle_date) equality then score asc, created_at asc
-- as the tiebreak (earliest solve wins a tie). One index covers the board list and
-- the "count better than me" rank query.
create index if not exists grid_runs_board_idx on grid_runs (game, puzzle_date, score asc, created_at asc);
create index if not exists grid_runs_user_idx  on grid_runs (user_id, created_at desc);

-- RLS: everyone reads, nobody writes directly. The RPC is the only writer.
alter table grid_runs enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='grid_runs' and policyname='grid_runs_read') then
    create policy grid_runs_read on grid_runs for select using (true);
  end if;
end $$;
revoke all on grid_runs from anon, authenticated;
grant select on grid_runs to anon, authenticated;

-- ---------------------------------------------------------------------------
-- grid_streaks : cloud streak per user per game (source of truth when signed in)
-- ---------------------------------------------------------------------------
create table if not exists grid_streaks (
  user_id     uuid not null,
  game        text not null check (game in ('match','crossword','wordsearch')),
  streak      integer not null default 0,
  best_streak integer not null default 0,
  last_date   date,
  updated_at  timestamptz not null default now(),
  primary key (user_id, game)
);

alter table grid_streaks enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='grid_streaks' and policyname='grid_streaks_read') then
    create policy grid_streaks_read on grid_streaks for select using (true);
  end if;
end $$;
revoke all on grid_streaks from anon, authenticated;
grant select on grid_streaks to anon, authenticated;

-- ---------------------------------------------------------------------------
-- grid_submit_run() : the only writer. Owns score/flawless/streak/name.
-- Signed-in only; raises a readable message on anything incoherent so a client
-- bug shows up as a failed submit rather than a wrong board. Returns the row id
-- plus the freshly-computed streak so the client can show it immediately.
-- ---------------------------------------------------------------------------
create or replace function grid_submit_run(
  p_game text, p_date date, p_seconds integer, p_mistakes integer, p_reveals integer
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_name   text;
  v_streak integer; v_best integer; v_last date;
  v_id     bigint;
begin
  if v_uid is null then raise exception 'sign in to post a score'; end if;
  if p_game not in ('match','crossword','wordsearch') then raise exception 'unknown game'; end if;
  if p_seconds is null or p_seconds < 0 or p_seconds >= 86400 then raise exception 'bad time'; end if;
  p_mistakes := greatest(0, least(20, coalesce(p_mistakes, 0)));
  p_reveals  := greatest(0, least(60, coalesce(p_reveals,  0)));

  select username into v_name from profiles where id = v_uid;

  insert into grid_runs (user_id, game, puzzle_date, base_seconds, mistakes, reveals, display_name, flawless)
  values (v_uid, p_game, p_date, p_seconds, p_mistakes, p_reveals, v_name, (p_mistakes = 0 and p_reveals = 0))
  on conflict (user_id, game, puzzle_date) do update
    set base_seconds = least(grid_runs.base_seconds, excluded.base_seconds),
        mistakes     = case when excluded.base_seconds < grid_runs.base_seconds then excluded.mistakes else grid_runs.mistakes end,
        reveals      = case when excluded.base_seconds < grid_runs.base_seconds then excluded.reveals  else grid_runs.reveals  end,
        display_name = excluded.display_name,
        flawless     = grid_runs.flawless or excluded.flawless
  returning id into v_id;

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

revoke all on function grid_submit_run(text, date, integer, integer, integer) from public, anon;
grant execute on function grid_submit_run(text, date, integer, integer, integer) to authenticated;
