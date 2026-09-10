-- ---------------------------------------------------------------------------
-- 98_football_gauntlet_board.sql : the Gauntlet's leaderboard, on the board the
-- rest of the football game already uses.
--
-- Safe to run more than once.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS NOT A NEW TABLE
-- ---------------------------------------------------------------------------
-- The Gauntlet already writes to ps_runs: every season it survives is one row,
-- validated by ps_submit_run exactly like a classic season (see 97). So the runs
-- are already on the board's own table, with the same display name, the same
-- crest, the same anti-cheat. What was missing is only a way to read them as RUNS
-- rather than as loose seasons, and to rank them the way this mode is played: by
-- how many seasons a run survived, ties broken by the run's total score.
--
-- So this file adds THREE nullable columns to ps_runs and nothing structural:
--
--   dynasty_id      the run a season belongs to, a uuid the client mints once
--   dynasty_season  seasons survived at that point, which for the latest row is
--                   the run's length
--   dynasty_score   the run's cumulative Gauntlet score at that point
--
-- ps_submit_run is left exactly as it is. It has twenty-five parameters and a
-- signature the grants name in full; widening it to carry three more would mean
-- dropping and recreating four hundred lines to add a stamp that has nothing to
-- do with validating a season. Instead the client tags the row it just wrote,
-- through the small function below, which can only touch a dynasty row of its
-- own. The view then reads the best row per run.
-- ---------------------------------------------------------------------------

-- ---------- 1) the three columns -------------------------------------------
alter table public.ps_runs add column if not exists dynasty_id     uuid;
alter table public.ps_runs add column if not exists dynasty_season int;
alter table public.ps_runs add column if not exists dynasty_score  bigint;

-- The board's own read: the best row per run, newest first inside a run so the
-- view's DISTINCT ON keeps the furthest season. Partial, because every read
-- filters to tagged rows and the index should carry no others.
create index if not exists ps_runs_dynasty_idx
  on public.ps_runs (dynasty_id, dynasty_season desc, dynasty_score desc)
  where dynasty_id is not null;

-- ---------- 2) the tag -----------------------------------------------------
-- Stamp a run's identity onto the season row ps_submit_run just returned. It can
-- only reach a dynasty row the caller owns, so it is not a second way to write a
-- score: the season was already validated on the way in, and this only says which
-- run it belongs to and how far that run has gone.
--
-- The bounds are a floor, not a rule: reachable with the anon key like everything
-- else here, so the range check lives in the database and not only in the page.
-- 500 seasons is far past anything the data can sustain; the score ceiling is a
-- hundred billion, which a real run does not approach.
create or replace function public.ps_dynasty_tag(
  p_row bigint, p_dynasty_id uuid, p_season int, p_score bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'sign in to record a run';
  end if;
  if p_dynasty_id is null then
    raise exception 'a run needs an id';
  end if;
  if p_season is null or p_season < 1 or p_season > 500 then
    raise exception 'that is not a number of seasons';
  end if;
  if p_score is null or p_score < 0 or p_score > 100000000000 then
    raise exception 'that is not a score';
  end if;

  update public.ps_runs
     set dynasty_id = p_dynasty_id,
         dynasty_season = p_season,
         dynasty_score = p_score
   where id = p_row
     and user_id = v_user
     and run_mode = 'dynasty';

  if not found then
    raise exception 'no dynasty run of yours to tag';
  end if;
end $$;

revoke all on function public.ps_dynasty_tag(bigint,uuid,int,bigint) from public;
grant execute on function public.ps_dynasty_tag(bigint,uuid,int,bigint) to authenticated;

-- ---------- 3) reading it as runs ------------------------------------------
-- ONE ROW PER RUN, the furthest season it reached, carrying the seasons survived,
-- the run's total score, and the same name and crest the classic board draws off
-- the same columns. A run appears once however many seasons it played, which is
-- what turns a table of seasons into a table of runs.
--
-- SECURITY INVOKER, so the view is not a way to read a ps_runs row the caller
-- could not read directly. ps_runs is already world readable for the board, so the
-- grant below is on the same terms the board has always had.
create or replace view public.ps_dynasty_board
with (security_invoker = true) as
  select distinct on (r.dynasty_id)
         r.dynasty_id,
         r.dynasty_season as seasons,
         r.dynasty_score  as score,
         r.display_name,
         r.created_at,
         r.user_id,
         r.display_color,
         r.display_initials,
         r.display_mark,
         r.display_rung,
         r.display_tier,
         r.display_ring
    from public.ps_runs r
   where r.dynasty_id is not null
     and r.display_name is not null
   order by r.dynasty_id, r.dynasty_season desc, r.dynasty_score desc;

grant select on public.ps_dynasty_board to anon, authenticated;

-- AND ON THE TABLE UNDER IT, which security_invoker makes a precondition rather
-- than an option: the reader's own privileges apply to ps_runs too. ps_runs is
-- already granted to these roles for the classic board, so this is a no-op on a
-- live database and the safety net on a fresh one. See 92_ideas_board.sql for the
-- outage this line prevents.
grant select on public.ps_runs to anon, authenticated;

analyze public.ps_runs;

notify pgrst, 'reload schema';
