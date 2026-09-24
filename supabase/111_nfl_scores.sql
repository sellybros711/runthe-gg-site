-- ---------------------------------------------------------------------------
-- 111_nfl_scores.sql : the real games, beside the challenge board
--
--   psql ... -f supabase/111_nfl_scores.sql
--
-- Needs: 109_fantasy_challenge.sql, 110_fantasy_live.sql. APPLY IT AFTER 110, because it
-- restates `fantasy_board`: 110's copy has no `games` key in it, so applying them the other
-- way round leaves a live screen whose scoreboard is permanently empty and nothing anywhere
-- saying why. That is the one ordering hazard in this file.
--
-- WHY THE SCORES LIVE IN THE SAME ANSWER AS THE BOARD
-- ---------------------------------------------------------------------------
-- The live screen shows two things that are about one instant: what the games are doing,
-- and what that has done to the standings. Asked as two calls they are two instants, and on
-- a poll they are two instants about twenty seconds apart in an order nobody controls. The
-- reader then gets a board that has already paid for a touchdown the scoreboard beside it
-- has not shown, or the reverse, and both of those read as one of the two being broken.
--
-- So `fantasy_board` carries the games. It is also the argument 110 already makes about
-- three round trips a tick, arriving at a fourth.
--
-- NOTHING HERE IS SCORED OR DERIVED FROM. A fantasy score is the sum of six men's rows in
-- `fantasy_results` and it stays that: a club's score moves nothing on the board, and a
-- board that cannot see this table is exactly the board it was. This is the picture beside
-- the number, and if it goes dark the competition is unaffected.
--
-- THE JOIN KEY IS ESPN'S EVENT ID AND THE NAMES ARE OURS
-- ---------------------------------------------------------------------------
-- `games.csv` carries an `espn` column holding the event id of every game, so a live feed is
-- joined to our schedule by that id and never by a club code. It matters: ESPN writes WSH
-- and LAR where nflverse writes WAS and LA, so a name-matched join would have quietly
-- dropped two clubs every week and looked like two clubs on a bye. What this table stores
-- for `away` and `home` is OUR code off OUR schedule. A feed cannot put a wrong club on the
-- screen; the worst it can do is fail to say anything about one.
-- ---------------------------------------------------------------------------

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A week's slate
-- ─────────────────────────────────────────────────────────────────────────────
--
-- ONE ROW A GAME, KEYED ON THE SCHEDULE'S OWN ID (`2026_03_ATL_GB`), which is stable, is
-- already what every other file here calls a game, and needs nothing from the feed to
-- compute. The espn id is deliberately NOT the key: it is how the writer joins, and a key
-- taken from a source that can be absent is a row that cannot be written without it.
--
-- `kick`, `away` and `home` are the schedule's and never move. Everything from `state` down
-- is the feed's and moves all afternoon.

create table if not exists public.nfl_games (
  season      int  not null,
  week        int  not null,
  game_id     text not null,
  away        text not null,
  home        text not null,
  kick        timestamptz,
  /* pre, in, post. Nothing else, because the page draws three things and a fourth state
     would arrive as a row it has no treatment for. */
  state       text not null default 'pre',
  away_score  int,
  home_score  int,
  period      int,
  clock       text,
  overtime    boolean,
  /* Which source last moved it, so a weekend of these answers "did the feed work" without
     anybody having to read a workflow log. */
  source      text,
  updated_at  timestamptz not null default now(),
  primary key (season, week, game_id),
  constraint nfl_games_state_ck check (state in ('pre', 'in', 'post'))
);

create index if not exists nfl_games_week_idx on public.nfl_games (season, week, kick);

-- PUBLIC READ, and this one really is public: it is the score of a football game. The
-- grant is what makes the policy mean anything, which is 110's own lesson about three
-- tables whose read-all policies were granting nothing. Nothing is granted write, ever:
-- the only writer is the security definer function below.

alter table public.nfl_games enable row level security;

drop policy if exists nfl_games_read on public.nfl_games;
create policy nfl_games_read on public.nfl_games for select using (true);

grant select on public.nfl_games to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. A game only ever moves forwards
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The writer has two sources and they know different things. A live feed knows a game is in
-- the third quarter; the schedule only knows a kickoff time and, some hours after the
-- whistle, a final score. So on any tick where the feed is unreachable the fallback would
-- happily say "this game has not kicked off" about a game in its fourth quarter, because
-- from `games.csv` alone that is indistinguishable.
--
-- Hence a rank, and an upsert that keeps the furthest along answer. A tick that knows less
-- than the row already does leaves it alone, which is what turns a feed outage into a board
-- that goes stale (and says so, off `checked_at`) rather than one that goes backwards.
--
-- THE COST IS THAT A CORRECTION CANNOT BE WRITTEN BY THE CRON. A game wrongly marked final
-- stays final. That has to be an `update` by hand, and it is the right way round: the
-- failure this prevents happens every time the feed blinks, and the one it causes needs the
-- feed to be wrong.

create or replace function public.nfl_state_rank(p_state text)
returns int
language sql
immutable
as $$ select case p_state when 'post' then 3 when 'in' then 2 else 1 end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The writer's one statement
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Called by `football/build/live-results.mjs` on the same cron tick that scores the week, so
-- the scores and the standings are written inside one run against one snapshot.
--
-- IT TAKES THE WHOLE SLATE AT ONCE, as an array, rather than a row at a time. Sixteen
-- statements a tick would be sixteen round trips from a workflow, and half a slate written
-- because the seventh statement failed is a scoreboard that is internally inconsistent with
-- nothing to say so.
--
-- @returns how many rows it actually MOVED, which is not how many it was handed: a quiet
-- ten minutes hands it sixteen games and moves none, and the difference between those two
-- numbers is the whole of what a workflow log is for.

create or replace function public.nfl_put_games(
  p_season int, p_week int, p_games jsonb)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_moved int;
begin
  if p_games is null or jsonb_typeof(p_games) <> 'array' then
    return 0;
  end if;

  /*
   * THE MERGE IS DONE BEFORE THE WRITE, NOT INSIDE THE `on conflict`, and that is the one
   * structural decision in this function.
   *
   * Written as a `do update set` full of rank comparisons, every column carries its own copy
   * of the same "does this source know more" test, and then whether the row MOVED has to be
   * asked a third time, by comparing the old row against an expression that restates all of
   * them again. It was written that way first: the comparison ran to thirty lines and was
   * its own third implementation of the rule, which is exactly the shape that drifts.
   *
   * Resolved in a CTE, the rule is written ONCE, `moved` is a comparison of two rows rather
   * than of a row against an expression, and `excluded` below is already the answer.
   */
  with incoming as (
    select g.game_id, g.away, g.home, g.kick,
           coalesce(g.state, 'pre') as state,
           g.away_score, g.home_score, g.period, g.clock, g.overtime,
           coalesce(g.source, 'unknown') as source
      from jsonb_to_recordset(p_games) as g(
        game_id text, away text, home text, kick timestamptz, state text,
        away_score int, home_score int, period int, clock text,
        overtime boolean, source text)
     where g.game_id is not null and g.away is not null and g.home is not null
  ),
  /* MATERIALIZED, so the row it reads is the row as it stood before this statement wrote
     anything. Every read in a statement sees one snapshot anyway, so this is belt and
     braces on a thing that would be invisible if it were ever wrong. */
  paired as materialized (
    select i.game_id, i.away, i.home, i.kick, i.state, i.away_score, i.home_score,
           i.period, i.clock, i.overtime, i.source,
           t.game_id as had, t.away as t_away_c, t.home as t_home_c, t.kick as t_kick,
           t.state as t_state, t.away_score as t_away, t.home_score as t_home,
           t.period as t_period, t.clock as t_clock, t.overtime as t_ot,
           t.source as t_source, t.updated_at as t_at,
           (t.game_id is null
            or public.nfl_state_rank(coalesce(i.state, 'pre'))
               >= public.nfl_state_rank(t.state)) as take
      from incoming i
      left join public.nfl_games t
        on t.season = p_season and t.week = p_week and t.game_id = i.game_id
  ),
  merged as (
    select p.game_id,
           /* The schedule's half is always taken: our club codes and our kickoff, so a
              feed cannot put a wrong name on the board. */
           p.away, p.home, coalesce(p.kick, p.t_kick) as kick,
           case when p.take then p.state else p.t_state end as state,
           case when p.take then coalesce(p.away_score, p.t_away)
                else p.t_away end as away_score,
           case when p.take then coalesce(p.home_score, p.t_home)
                else p.t_home end as home_score,
           /* A finished game has no clock, so these two are CLEARED by a post rather than
              coalesced: kept, the board would show a final score beside "3rd 4:12". */
           case when p.take and p.state = 'post' then null
                when p.take then coalesce(p.period, p.t_period)
                else p.t_period end as period,
           case when p.take and p.state = 'post' then null
                when p.take then coalesce(p.clock, p.t_clock)
                else p.t_clock end as clock,
           coalesce(p.overtime, p.t_ot) as overtime,
           case when p.take then p.source else p.t_source end as source,
           p.had, p.t_away_c, p.t_home_c, p.t_kick, p.t_state, p.t_away, p.t_home,
           p.t_period, p.t_clock, p.t_ot, p.t_at
      from paired p
  ),
  /* MOVED IS A COMPARISON OF TWO ROWS. `is distinct from` over the whole tuple, so a null
     going to a number counts and a re-send of the same answer does not. It is what
     `updated_at` means, and 110 makes the same argument about `results_at`: a timestamp
     written on every check says the board changed every time anybody looked at it, which is
     a frozen feed wearing a fresh clock. */
  final as (
    select m.*,
           (m.had is null
            or (m.state, m.away_score, m.home_score, m.period, m.clock, m.overtime,
                m.away, m.home, m.kick)
               is distinct from
               (m.t_state, m.t_away, m.t_home, m.t_period, m.t_clock, m.t_ot,
                m.t_away_c, m.t_home_c, m.t_kick)) as moved
      from merged m
  ),
  put as (
    insert into public.nfl_games
      (season, week, game_id, away, home, kick, state,
       away_score, home_score, period, clock, overtime, source, updated_at)
    select p_season, p_week, f.game_id, f.away, f.home, f.kick, f.state,
           f.away_score, f.home_score, f.period, f.clock, f.overtime, f.source,
           case when f.moved then now() else f.t_at end
      from final f
    /* Every value is already resolved, so this is a plain assignment. */
    on conflict (season, week, game_id) do update set
      away = excluded.away, home = excluded.home, kick = excluded.kick,
      state = excluded.state, away_score = excluded.away_score,
      home_score = excluded.home_score, period = excluded.period,
      clock = excluded.clock, overtime = excluded.overtime,
      source = excluded.source, updated_at = excluded.updated_at
    returning 1
  )
  select count(*)::int into v_moved from final where moved;

  return coalesce(v_moved, 0);
end;
$$;

revoke all on function public.nfl_put_games(int, int, jsonb) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The board, with the games in it
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 110'S FUNCTION WITH ONE KEY ADDED, and it is restated whole rather than wrapped because a
-- wrapper would be a second function answering the same question, which is how the two come
-- to disagree about what a board is. Everything above `v_games` is byte for byte 110's.
--
-- THE GAMES ARE ANSWERED EVEN WHEN THE WEEK IS NOT. A week with no `fantasy_weeks` row is a
-- competition that has not been published, and the football is on regardless: the live
-- screen draws the scoreboard and says the board is not open, which is two true sentences
-- rather than one blank screen.
--
-- NOT GATED ON THE LOCK, unlike the rows. The board is shut before kickoff because every
-- entrant meets their own wheel and a list of lineups is the answer key. A scoreline gives
-- nothing away about anybody's lineup, and before the lock there is nothing to give: the
-- lock IS the first kickoff.

create or replace function public.fantasy_board(
  p_season int, p_week int, p_limit int default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_week  jsonb;
  v_rows  jsonb;
  v_me    jsonb;
  v_games jsonb;
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
                              'games', v_games);
  end if;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.place), '[]'::jsonb) into v_rows
    from public.fantasy_standings(p_season, p_week, p_limit) s;

  select to_jsonb(m) into v_me
    from public.fantasy_my_place(p_season, p_week) m;

  /* THE READER'S OWN SIX, LIVE, because a screen whose total is climbing while the six men
     under it show nothing is a screen arguing with itself. See 110 for the whole argument. */
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

  return jsonb_build_object('week', v_week, 'rows', v_rows, 'me', v_me, 'games', v_games);
end;
$$;

grant execute on function public.fantasy_board(int,int,int) to anon, authenticated;

notify pgrst, 'reload schema';
