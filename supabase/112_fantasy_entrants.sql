-- ---------------------------------------------------------------------------
-- 112_fantasy_entrants.sql : who has entered, before anybody can see a lineup
--
--   psql ... -f supabase/112_fantasy_entrants.sql
--
-- Needs: 109_fantasy_challenge.sql, 110_fantasy_live.sql, 111_nfl_scores.sql.
-- APPLY IT AFTER 111, because it restates `fantasy_board` and 111's copy has no `entrants`
-- key in it. The other order leaves a board that says nobody is there until kickoff, with
-- nothing anywhere saying why. That is 111's own ordering hazard arriving a second time.
--
-- WHAT WAS WRONG WITH THE BOARD BEFORE THE LOCK
-- ---------------------------------------------------------------------------
-- `fantasy_standings` returns NO ROWS until `locks_at`, and the argument for that is sound
-- and is not being weakened here: every entrant meets their own wheel, so a list of
-- everybody's lineups and their projections before kickoff is the answer key handed to
-- whoever enters last.
--
-- But "no lineups" was implemented as "no rows", and those are different claims. What a
-- reader actually wants at the moment they enter is whether anybody else has, and the only
-- answer the board could give was a count on a label. Reported by a player, who asked to
-- land on the board after submitting and see who else was in.
--
-- SO THE PRE-LOCK ANSWER IS A LIST OF NAMES AND NOTHING ELSE, and it is a SEPARATE function
-- rather than a flag on the standings, because the guarantee is what matters here: this
-- query selects no pick, no projection, no spend and no score, so the payload a reader gets
-- before kickoff CANNOT carry a lineup. Nulling those columns out of the standings would be
-- one `case` away from leaking the thing the lock exists to protect, and the way that fails
-- is silent: a correct looking board with the answer key in the network tab.
--
-- IT DISCLOSES NOTHING NEW. These are the same display names the board publishes after the
-- lock, and the entry count is already public before it. What changes is that the count has
-- the names in it.
--
-- EXACTLY ONE OF THE TWO IS EVER POPULATED. `entrants` before the lock, `rows` after, and
-- the lock is the one thing that decides. Two lists of names would be two answers to one
-- question, and they would disagree the first time either was edited.
-- ---------------------------------------------------------------------------

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Who is in
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `entry_no` is the board's own key, counted WITHIN the week, for the reason 110 gives at
-- length: `fantasy_entries.id` is a bigserial over every entry ever made, so putting it on
-- a public list publishes how many entries this mode has taken in total. It is the same
-- number the board uses after the lock, so a row does not change key at kickoff and the
-- animation has something to hold on to.
--
-- ORDERED BY ENTRY, because there is nothing to rank. A place implies a score and there is
-- no score yet, so a numbered board before the games would be inventing a standing out of
-- who happened to press first.

create or replace function public.fantasy_entrants(
  p_season int, p_week int, p_limit int default 200)
returns table (entry_no int, display_name text, is_me boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_locks timestamptz;
begin
  select w.locks_at into v_locks from public.fantasy_weeks w
   where w.season = p_season and w.week = p_week;
  /* No week at all: nothing to list. AFTER the lock this is also empty, deliberately, so
     that the board and this list can never both be answering at once. */
  if v_locks is null or now() >= v_locks then
    return;
  end if;

  return query
    select (dense_rank() over (order by e.id))::int,
           e.display_name,
           /* COALESCED, because `user_id = auth.uid()` is NULL rather than false for a
              signed out reader, which is 109's own finding on this exact comparison. */
           coalesce(e.user_id = auth.uid(), false)
      from public.fantasy_entries e
     where e.season = p_season and e.week = p_week
     order by e.id
     limit greatest(1, least(coalesce(p_limit, 200), 500));
end;
$$;

grant execute on function public.fantasy_entrants(int,int,int) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The board, carrying it
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 111'S FUNCTION WITH ONE KEY ADDED, restated whole rather than wrapped, because a wrapper
-- would be a second function answering the same question and that is how the two come to
-- disagree about what a board is. Everything except `v_entrants` is byte for byte 111's.
--
-- A PAGE ONE DEPLOY BEHIND IGNORES IT, and a page one deploy AHEAD reads it as undefined
-- and falls back to the sentence it has always drawn. Both directions are safe, which is
-- what lets this migration and the deploy that reads it land in either order.

create or replace function public.fantasy_board(
  p_season int, p_week int, p_limit int default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_week     jsonb;
  v_rows     jsonb;
  v_me       jsonb;
  v_games    jsonb;
  v_entrants jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(g) order by g.kick nulls last, g.game_id), '[]'::jsonb)
    into v_games
    from (
      select n.game_id, n.away, n.home, n.kick, n.state,
             n.away_score, n.home_score, n.period, n.clock, n.overtime, n.updated_at
        from public.nfl_games n
       where n.season = p_season and n.week = p_week
    ) g;

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
    return jsonb_build_object('week', null, 'rows', '[]'::jsonb, 'me', null,
                              'games', v_games, 'entrants', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.place), '[]'::jsonb) into v_rows
    from public.fantasy_standings(p_season, p_week, p_limit) s;

  /* NAMES ONLY, AND ONLY BEFORE THE LOCK. The function itself is what enforces both: it
     selects no lineup column at all and returns nothing once the week has locked. */
  select coalesce(jsonb_agg(to_jsonb(n) order by n.entry_no), '[]'::jsonb) into v_entrants
    from public.fantasy_entrants(p_season, p_week, 500) n;

  select to_jsonb(m) into v_me
    from public.fantasy_my_place(p_season, p_week) m;

  /* THE READER'S OWN SIX, LIVE, because a screen whose total is climbing while the six men
     under it show nothing is a screen arguing with itself. See 110 for the whole argument.
     THIS IS THE READER'S OWN ENTRY AND NOBODY ELSE'S, which is what makes it safe before
     the lock: `auth.uid()` is the only row it can reach. */
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

  return jsonb_build_object('week', v_week, 'rows', v_rows, 'me', v_me,
                            'games', v_games, 'entrants', v_entrants);
end;
$$;

grant execute on function public.fantasy_board(int,int,int) to anon, authenticated;

notify pgrst, 'reload schema';
