-- ---------------------------------------------------------------------------
-- 110_fantasy_live.sql : the board moves while the games are being played
--
--   psql ... -f supabase/110_fantasy_live.sql
--
-- Needs: 109_fantasy_challenge.sql.
--
-- WHAT THIS ADDS, AND WHAT IT DELIBERATELY DOES NOT
-- ---------------------------------------------------------------------------
-- 109 already scores a board correctly: `fantasy_standings` sums an entry's six ids out of
-- `fantasy_results`, so the instant a result row lands the board is right. A SCORE IS
-- DERIVED AND NEVER STORED, which is what makes this cheap: nothing here re-scores
-- anything, adds a settle job or caches a total. The board was always live. What it had no
-- way to say was WHEN it last moved, HOW MUCH of the week is in, and how many of a reader's
-- own six have played, and without those three a frozen feed and a quiet afternoon look
-- exactly alike.
--
-- THE CADENCE IS MEASURED RATHER THAN ASSUMED, WHICH IS WHY THERE ARE TWO CLOCKS
-- ---------------------------------------------------------------------------
-- nflverse fills its weekly stats file in as games finish rather than in one batch at the
-- end of the week. Measured on the real 2026 file: at 11:25pm ET on the Sunday of week 2 it
-- held 975 rows across 28 clubs, and once the Sunday night and Monday night games were in it
-- held 1,107 across 32. So the file moves during a weekend. What is NOT yet measured is
-- whether it moves DURING a game or only when one ends, and the difference decides whether
-- this board ticks over continuously or jumps a game at a time.
--
-- Rather than guess, the writer records both:
--
--   checked_at   the last time anything LOOKED at the source
--   results_at   the last time the answer actually CHANGED
--
-- One weekend of those two columns answers the question with data. They are also what the
-- page needs anyway: `results_at` is the honest "as of" on a live board, and `checked_at`
-- going stale while `results_at` does not is the only way to tell a feed that has stopped
-- from a game nobody has scored in.
--
-- `results_sig` is what makes the pair honest. The writer upserts the same rows every few
-- minutes whether or not anything moved, so a `results_at = now()` on every write would say
-- the board had changed every time it was checked, which is the frozen-feed defect wearing
-- a fresh timestamp. The signature is taken over the week's rows AS STORED, after the write,
-- so the comparison is against the table rather than against the writer's opinion of what it
-- just sent.
-- ---------------------------------------------------------------------------

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. What a week knows about its own scoring
-- ─────────────────────────────────────────────────────────────────────────────
--
-- ADDED RATHER THAN RESTATED, and every one is nullable with no default. A week published
-- before this migration reads null on all five, which every reader below treats as "not
-- known" rather than as zero. That is 107's own rule about `dynasty_over`: a column
-- defaulted to 0 would have told every reader that no game of any past week was ever
-- played, which is worse than saying nothing.

alter table public.fantasy_weeks
  add column if not exists checked_at  timestamptz,
  add column if not exists results_at  timestamptz,
  add column if not exists results_sig text,
  add column if not exists games_final int,
  add column if not exists games_total int;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1b. Three read policies that were granting nothing
-- ─────────────────────────────────────────────────────────────────────────────
--
-- RLS NARROWS A GRANT, IT DOES NOT MAKE ONE. 109 found this once already, on
-- `fantasy_entries`, where reading your own entry raised permission denied behind a
-- perfectly good read-own policy. The same thing is true of three more tables and was
-- missed because nothing has ever needed it: every screen reads them through a security
-- definer function, which runs as its owner and never consults the policy at all.
--
-- So nothing is broken today. What is wrong is that 109 SAYS otherwise, in as many words,
-- over `fantasy_prices`: "PUBLIC READ, deliberately, and it gives nothing away". Verified
-- against a real database, `anon` is denied on all three. A comment claiming an access rule
-- the database does not have is the dangerous direction, because the next person to want a
-- direct read will find it refused and go looking at the POLICY, which was never the
-- problem.
--
-- The grants discloses nothing new: all three tables are already published wholesale
-- through `fantasy_board` and `fantasy_standings`, and `fantasy_prices` is the same JSON
-- every visitor downloads to draw the wheel.
--
-- `fantasy_entries` IS DELIBERATELY NOT WIDENED. Its grant is to `authenticated` and its
-- policy is read-own, and the sanctioned way to see anybody else's lineup is the board,
-- which opens at the lock. That gate is the competition.

grant select on public.fantasy_weeks   to anon, authenticated;
grant select on public.fantasy_prices  to anon, authenticated;
grant select on public.fantasy_results to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The writer's one statement
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Called by `football/build/publish-week.mjs --results` AFTER it has upserted the rows, in
-- the same transaction. It owns every clock on the week so there is one place that decides
-- what "the board moved" means.
--
-- IT IS THE ONE THING HERE THAT WRITES, and it is security definer for the same reason
-- every writer in 109 is: the live path runs from a workflow over `SUPABASE_DB_URL`, and
-- nothing that a browser can reach may move a score.
--
-- `p_final` IS THE SCHEDULE'S ANSWER AND NOT AN INFERENCE FROM THE ROWS. A week where every
-- game is in and a week where the stats for the last game have not landed look identical
-- from `fantasy_results`: both are "some men have rows". Only `games.csv` knows a game has
-- been played, which is why `weekly-results.mjs` refuses an unfinished week off the
-- SCHEDULE rather than off the stats, and this carries that same answer through.

create or replace function public.fantasy_mark_results(
  p_season int, p_week int,
  p_games_final int, p_games_total int, p_final boolean)
returns table (changed boolean, rows_in int)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_sig  text;
  v_was  text;
  v_rows int;
begin
  /* The signature is over the week's rows as they now STAND, ordered, so it is a fact about
     the table rather than about the order a writer happened to send things in. A null
     answer (no rows at all) is its own signature and must not collide with "unset", or the
     first write of a week would report no change. */
  select coalesce(md5(string_agg(t.player_id || ':' || t.half_ppr::text, ',' order by t.player_id)), 'empty'),
         count(*)::int
    into v_sig, v_rows
    from public.fantasy_results t
   where t.season = p_season and t.week = p_week;

  select w.results_sig into v_was
    from public.fantasy_weeks w
   where w.season = p_season and w.week = p_week;

  update public.fantasy_weeks w
     set checked_at  = now(),
         results_at  = case when v_was is distinct from v_sig then now() else w.results_at end,
         results_sig = v_sig,
         games_final = p_games_final,
         games_total = p_games_total,
         /* A WEEK IS MARKED SCORED ONLY BY A FINAL WRITE AND IS NEVER UNMARKED. Set null on
            every partial write, a stat correction arriving on the Tuesday after a week was
            settled would drop it back to "still being played" on every screen. */
         scored_at   = case when p_final then coalesce(w.scored_at, now()) else w.scored_at end
   where w.season = p_season and w.week = p_week;

  return query select (v_was is distinct from v_sig), v_rows;
end;
$$;

revoke all on function public.fantasy_mark_results(int,int,int,int,boolean) from public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The board, with the two things a live one needs
-- ─────────────────────────────────────────────────────────────────────────────
--
-- RESTATED RATHER THAN JOINED BY A SECOND FUNCTION, because the ordering is the thing most
-- likely to drift here and 96's `commish_my_tenure` is the standing warning: two
-- implementations of one ordering disagree the first time either is touched.
--
-- THE TWO NEW COLUMNS ARE APPENDED AT THE END, which is the same discipline 108's view
-- needed for a different reason. A function's return type cannot be changed by `create or
-- replace`, so this drops and recreates (and re-grants, because a drop takes the grants
-- with it). Appending means a PAGE ONE DEPLOY BEHIND reads exactly the board it read
-- before and ignores two fields it has never heard of. The signature is untouched, so
-- PostgREST resolves the same rpc by the same argument names and there is no PGRST202
-- window of the kind 108's tag had.
--
--   entry_no   a stable key for a ROW, which a board that animates cannot do without.
--              Keyed on place, every row "moves" when anybody's score changes and the
--              animation is nonsense; keyed on display_name, two readers sharing a name are
--              one row and a rename is a row that vanished.
--
--              IT IS NOT `fantasy_entries.id`, and the reason is disclosure. That column is
--              a bigserial over every entry ever made, so putting it on a public board
--              publishes how many entries this mode has taken in total and roughly when
--              each one arrived. This is the same number counted WITHIN the week instead,
--              which gives away only the order people entered, and the board's own tiebreak
--              already publishes that by putting the earlier entry above on a tie.
--
--              A HASH OF THE ID WOULD HAVE BEEN WORSE THAN EITHER. md5 over a small integer
--              is brute forced in a second, so it would have looked like a defence and been
--              none, which is a claim this file would rather not make than make falsely.
--
--              It is stable for exactly as long as it needs to be, and that rests on a
--              property this mode already has: NO ENTRY CAN ARRIVE AFTER THE LOCK, and the
--              board does not open until the lock. So the set of entries in a live week is
--              frozen from the first kickoff, and a number counted over that set cannot
--              shift under a reader who is watching it. Across WEEKS it means nothing, and
--              nothing asks it to.
--   played     how many of the six have a result row. THE HALF THAT MAKES A LOW SCORE
--              READABLE: 12.4 from two men who have played is a different afternoon from
--              12.4 from six who have, and the board cannot say which without it.
--              `count()` over a LEFT JOIN counts the non-null side, so this is exactly the
--              men nflverse has written a row for, which is the same definition
--              `weekly-results.mjs` pays on.

drop function if exists public.fantasy_standings(int, int, int);

create or replace function public.fantasy_standings(
  p_season int, p_week int, p_limit int default 50)
returns table (
  place int, display_name text, score numeric, projected numeric,
  spend numeric, picks text[], is_me boolean,
  entry_no int, played int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_locks timestamptz;
begin
  select w.locks_at into v_locks from public.fantasy_weeks w
   where w.season = p_season and w.week = p_week;
  /* No week, or the week has not locked: no rows. NOT an exception, because the page asks
     this on the way in and an empty board is a state it already draws a sentence for. */
  if v_locks is null or now() < v_locks then
    return;
  end if;

  return query
    with scored as (
      select e.id, e.user_id, e.display_name, e.projected, e.spend, e.picks,
             /* Counted over every entry in the WEEK, inside the CTE, so the limit below
                cannot change it: a key that renumbered when the top fifty changed would be
                a key that moves for reasons the reader cannot see. */
             (dense_rank() over (order by e.id))::int as entry_no,
             (select coalesce(sum(r.half_ppr), 0)
                from unnest(e.picks) pid
                left join public.fantasy_results r
                  on r.season = e.season and r.week = e.week and r.player_id = pid) as score,
             (select count(r.player_id)::int
                from unnest(e.picks) pid
                left join public.fantasy_results r
                  on r.season = e.season and r.week = e.week and r.player_id = pid) as played
        from public.fantasy_entries e
       where e.season = p_season and e.week = p_week
    )
    select (row_number() over (order by s.score desc, s.id asc))::int,
           s.display_name, s.score, s.projected, s.spend, s.picks,
           /* COALESCED, because `user_id = auth.uid()` is NULL rather than false for a
              signed out reader, and this column is a yes or a no. */
           coalesce(s.user_id = auth.uid(), false),
           s.entry_no, s.played
      from scored s
     order by s.score desc, s.id asc
     limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

grant execute on function public.fantasy_standings(int,int,int) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. One call for a board that polls
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A live board asks three questions every time it looks: the rows, the reader's own place
-- against everybody, and how far into the week the scoring has got. Three round trips every
-- twenty seconds, per reader, for one screen, is three times the cost of the thing it is
-- measuring.
--
-- SO IT WRAPS THE TWO THAT ALREADY EXIST RATHER THAN RE-ASKING THEM. `fantasy_standings`
-- and `fantasy_my_place` are called, not copied, so the ordering stays written once. That
-- is the whole reason this is a wrapper and not a fourth query.
--
-- `auth.uid()` SURVIVES THE NESTING, which is the one thing worth checking before trusting
-- it: the uid comes off the request's JWT claims, which are request scoped rather than role
-- scoped, so a security definer function calling another still sees the caller. The test
-- file asserts that from both sides rather than taking it on trust, because `is_me` coming
-- back false for everybody is a board that renders perfectly and never finds the reader.
--
-- JSONB and not a table, because the three answers have three different shapes and a row
-- set would have to flatten the week's state onto every row of the board.

create or replace function public.fantasy_board(
  p_season int, p_week int, p_limit int default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_week jsonb;
  v_rows jsonb;
  v_me   jsonb;
begin
  select to_jsonb(x) into v_week from (
    select w.locks_at, w.scored_at, w.checked_at, w.results_at,
           w.games_final, w.games_total,
           (now() >= w.locks_at) as open,
           (select count(*)::int from public.fantasy_entries e
             where e.season = w.season and e.week = w.week) as entries
      from public.fantasy_weeks w
     where w.season = p_season and w.week = p_week
  ) x;

  /* No week at all is not an empty week. The page draws a different sentence for each, so
     this answers null rather than an object full of nulls. */
  if v_week is null then
    return jsonb_build_object('week', null, 'rows', '[]'::jsonb, 'me', null);
  end if;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.place), '[]'::jsonb) into v_rows
    from public.fantasy_standings(p_season, p_week, p_limit) s;

  select to_jsonb(m) into v_me
    from public.fantasy_my_place(p_season, p_week) m;

  /* THE READER'S OWN SIX, LIVE, because a screen whose total is climbing while the six men
     under it show nothing is a screen arguing with itself. The static
     `results_<season>_w<week>.json` the entry screen already reads is written once, at the
     end of the week, by the Tuesday build: during the games it does not exist yet, so
     without this the six sit blank all afternoon under a number that moves.
     ONLY FOR THE READER. Everybody's picks are already on the board, so this is not a
     disclosure; it is left out of the rows because six extra objects per row is a payload
     that grows with the board for a thing only one row's owner will look at.
     A man with no row is `played: false` and scores nothing, which is the same definition
     `weekly-results.mjs` pays on: inactive, hurt, benched and cut are all nought, and
     telling them apart is the whole of what the drafter was judging. */
  if v_me is not null then
    v_me := v_me || jsonb_build_object('lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'player_id', pid,
               'half_ppr', coalesce(r.half_ppr, 0),
               'played', (r.player_id is not null))
             order by ord)
        from public.fantasy_entries e
        cross join lateral unnest(e.picks) with ordinality as u(pid, ord)
        left join public.fantasy_results r
          on r.season = e.season and r.week = e.week and r.player_id = u.pid
       where e.season = p_season and e.week = p_week and e.user_id = auth.uid()
    ), '[]'::jsonb));
  end if;

  return jsonb_build_object('week', v_week, 'rows', v_rows, 'me', v_me);
end;
$$;

grant execute on function public.fantasy_board(int,int,int) to anon, authenticated;

notify pgrst, 'reload schema';
