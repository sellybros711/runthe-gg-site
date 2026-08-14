-- Run The Arcade — all-time leaderboard: paging + "where do I stand".
-- Run once in the Supabase SQL editor (after 73_alltime_board.sql).
-- Idempotent — safe to re-run.
--
-- WHY
-- The all-time board was capped at the top 25, so every player outside it saw
-- a wall they weren't on. It now pages: the sheet fetches 50 at a time and
-- keeps going as you scroll, all the way to the last player.
--
-- Two changes:
--   1. grid_alltime_board gains p_offset, and its page cap goes 100 -> 200.
--      The old two-argument version is DROPPED first, because leaving both
--      would make a named-argument call (p_game, p_limit) ambiguous. Clients
--      still calling with two arguments resolve fine against the new one —
--      p_offset defaults to 0 — so a cached copy of board.js keeps working.
--   2. grid_alltime_stats: one call for the field size and the caller's own
--      best + rank, so the sheet can pin "you" at the bottom without walking
--      the whole board to find yourself. Uses auth.uid(), never a client-
--      supplied id, so a signed-out or spoofed caller simply gets nulls.

drop function if exists public.grid_alltime_board(text, int);

create or replace function public.grid_alltime_board(p_game text, p_limit int default 10,
                                                     p_offset int default 0)
returns table(display_name text, run_len smallint, base_seconds integer,
              flawless boolean, played_on date, score integer)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(p.username, ''), 'Player') as display_name,
         best.run_len,
         best.base_seconds,
         best.flawless,
         best.puzzle_date as played_on,
         best.score
  from (
    select distinct on (r.user_id)
           r.user_id, r.run_len, r.base_seconds, r.flawless, r.puzzle_date, r.score
    from grid_runs r
    where r.game = p_game
    order by r.user_id, r.score asc, r.created_at asc
  ) best
  left join profiles p on p.id = best.user_id
  order by best.score asc, best.puzzle_date asc
  limit least(greatest(coalesce(p_limit, 10), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.grid_alltime_board(text, int, int) from public;
grant execute on function public.grid_alltime_board(text, int, int) to anon, authenticated;

-- How big is the field, and where does the caller sit in it?
--
-- Returns exactly one row. total is always present. Every my_* column is null
-- for a signed-out caller, or for one who has never posted a result in this
-- game. Rank counts the players strictly ahead: a better score, or the same
-- score set on an earlier day — the same ordering the board itself uses, so
-- the pinned row and the list can never disagree.
create or replace function public.grid_alltime_stats(p_game text)
returns table(total integer, my_rank integer, display_name text,
              run_len smallint, base_seconds integer, flawless boolean,
              played_on date, score integer)
language sql
stable
security definer
set search_path = public
as $$
  with best as (
    select distinct on (r.user_id)
           r.user_id, r.run_len, r.base_seconds, r.flawless, r.puzzle_date, r.score
    from grid_runs r
    where r.game = p_game
    order by r.user_id, r.score asc, r.created_at asc
  ),
  mine as (
    select * from best where user_id = auth.uid()
  )
  select (select count(*)::int from best) as total,
         case when m.user_id is null then null else (
           select count(*)::int + 1 from best b
           where b.score < m.score
              or (b.score = m.score and b.puzzle_date < m.puzzle_date)
         ) end as my_rank,
         case when m.user_id is null then null
              else coalesce(nullif(p.username, ''), 'Player') end as display_name,
         m.run_len, m.base_seconds, m.flawless, m.puzzle_date as played_on, m.score
  from (select 1) anchor(x)
  left join mine m on true
  left join profiles p on p.id = m.user_id;
$$;

revoke all on function public.grid_alltime_stats(text) from public;
grant execute on function public.grid_alltime_stats(text) to anon, authenticated;

-- PostgREST caches the function signatures; nudge it so the new arguments are
-- callable immediately instead of after the next natural reload.
notify pgrst, 'reload schema';
