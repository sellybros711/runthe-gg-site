-- ---------------------------------------------------------------------------
-- 159_shut_the_door_boards.sql : Shut The Door's daily board, end to end.
--
-- Safe to run more than once. Needs 153, 155, 156 and 157 (shut_the_door).
-- Run it BEFORE the page that calls shutdoor_my_day ships. The page treats a
-- missing function as "could not ask" and plays as before, so the order only
-- decides when the fixes start working.
--
-- What a walk through the whole path found (2026-10-30), and what this fixes:
--
--   1. The streak was updated in arrival order. A post for yesterday that
--      arrived after today's (a guest who signs in late, a second device)
--      reset the streak to 1. shutdoor_streak_of() now reads it from the kept
--      rows, so the order posts arrive in no longer matters. The best is
--      never lowered.
--   2. A second device had no way to learn the day was already played on the
--      first. shutdoor_my_day(day) answers the caller's kept outing for a day
--      (its calls, so the page replays it to the same result), or null.
--   3. A repeat post said only taken: false. shutdoor_submit now also answers
--      keptScore and keptOutcome, the row that counts, so the page can say so.
--
-- What changes:
--   shutdoor_streak_of   new, security definer, not granted to anyone
--   shutdoor_submit      the streak block and the reply. The guard, the insert
--                        and the rank are 157's, line for line
--   shutdoor_my_day      new, granted to authenticated
-- ---------------------------------------------------------------------------

-- the doors shut streak from the kept rows: the run of consecutive door_shut
-- days that ends on the last day played (0 if that day was not a door shut),
-- the longest such run, and the last day played
create or replace function public.shutdoor_streak_of(p_uid uuid)
returns table (streak int, best int, last_day date)
language sql stable security definer set search_path = public as $$
  with d as (
    select o.day from shutdoor_outings o where o.user_id = p_uid and o.outcome = 'door_shut'
  ), g as (
    select d.day, d.day - (row_number() over (order by d.day))::int as grp from d
  ), isl as (
    select count(*)::int as n, max(g.day) as hi from g group by g.grp
  ), lst as (
    select max(o.day) as ld from shutdoor_outings o where o.user_id = p_uid
  )
  select coalesce((select isl.n from isl, lst where isl.hi = lst.ld), 0),
         coalesce((select max(isl.n) from isl), 0),
         (select lst.ld from lst)
$$;
revoke all on function public.shutdoor_streak_of(uuid) from public;

-- post today's outing. The first one stands. Returns what the server holds:
-- {taken, streak, best, rank, players, keptScore, keptOutcome}.
create or replace function public.shutdoor_submit(
  p_day date, p_number int, p_scenario text, p_calls jsonb, p_outcome text,
  p_pitches int, p_score int, p_percentile int, p_pitched_like text, p_strip jsonb)
returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n int;
  s int; b int; v_last date;
  r bigint; total bigint;
  k_score int; k_outcome text;
begin
  if uid is null then raise exception 'sign in to post a daily'; end if;
  if p_day is null or abs(p_day - shutdoor_today()) > 1 then raise exception 'that day is not open'; end if;
  if p_outcome is null or p_outcome not in ('door_shut', 'tie_held', 'doors_open', 'walk_off') then raise exception 'not an outcome'; end if;
  if p_pitches is null or p_pitches not between 1 and 150 then raise exception 'not a real outing'; end if;
  if jsonb_typeof(p_calls) is distinct from 'array' or jsonb_array_length(p_calls) <> p_pitches
     or exists (select 1 from jsonb_array_elements(p_calls) c
                 where jsonb_typeof(c) <> 'object'
                    or (c->>'type') is null or length(c->>'type') > 2
                    or (c->>'cell') !~ '^[0-9]+$' or (c->>'cell')::int not between 0 and 24
                    -- the release (156): absent or null is 1.0x; present, a number 0..1. The case
                    -- reads the number only once it is one, so a string never reaches the cast
                    or case jsonb_typeof(c->'q')
                         when 'number' then (c->>'q')::numeric not between 0 and 1
                         when 'null' then false
                         else c ? 'q' end
                    -- the effort (157): absent or null is his ordinary pitch; present, a number
                    -- 0..1 on a call with a number q. Read as a number only once it is one
                    or case jsonb_typeof(c->'e')
                         when 'number' then (c->>'e')::numeric not between 0 and 1
                                            or jsonb_typeof(c->'q') is distinct from 'number'
                         when 'null' then false
                         else c ? 'e' end
                    -- the free aim point (157): absent or null is the cell's centre; present, two
                    -- numbers -0.5..0.5. Each read as a number only once it is one
                    or case jsonb_typeof(c->'at')
                         when 'array' then jsonb_array_length(c->'at') <> 2
                                           or exists (select 1 from jsonb_array_elements(c->'at') a
                                                       where case when jsonb_typeof(a) = 'number'
                                                                  then (a #>> '{}')::numeric not between -0.5 and 0.5
                                                                  else true end)
                         when 'null' then false
                         else c ? 'at' end) then
    raise exception 'the calls do not make an outing';
  end if;
  if jsonb_typeof(p_strip) is distinct from 'array' or jsonb_array_length(p_strip) <> p_pitches
     or exists (select 1 from jsonb_array_elements_text(p_strip) x where x not in ('green', 'yellow', 'orange', 'red')) then
    raise exception 'the strip does not match the calls';
  end if;
  if p_score is null or p_score not between 0 and 1000 or p_percentile is null or p_percentile not between 0 and 100 then
    raise exception 'not a real score';
  end if;

  insert into shutdoor_outings (user_id, day, daily_number, scenario_id, calls, outcome, pitches, score,
                                percentile, pitched_like, strip)
    values (uid, p_day, p_number, left(p_scenario, 64), p_calls, p_outcome, p_pitches, p_score,
            p_percentile, nullif(left(coalesce(p_pitched_like, ''), 60), ''), p_strip)
    on conflict (user_id, day) do nothing;
  get diagnostics n = row_count;

  -- TODO(v2 trophies): the result is written here; trophies hang off this insert.

  -- the streak from the kept rows, whatever order they came in (159): a late post for
  -- yesterday, from a second device or a guest who signed in, no longer resets it
  select z.streak, z.best, z.last_day into s, b, v_last from shutdoor_streak_of(uid) z;
  if n > 0 then
    select greatest(coalesce(max(t.best), 0), b) into b from shutdoor_streaks t where t.user_id = uid;
    insert into shutdoor_streaks (user_id, streak, best, last_day, updated_at)
      values (uid, s, b, v_last, now())
      on conflict (user_id) do update
        set streak = excluded.streak, best = excluded.best, last_day = excluded.last_day, updated_at = now();
  else
    select t.streak, t.best, t.last_day into s, b, v_last from shutdoor_streaks t where t.user_id = uid;
  end if;

  select x.rk, x.n into r, total from (
    select o.user_id, row_number() over (order by o.score desc, o.created_at) as rk, count(*) over () as n
      from shutdoor_outings o where o.day = p_day
  ) x where x.user_id = uid;

  -- what the server keeps for the day, so a second device can say which outing counts (159)
  select o.score, o.outcome into k_score, k_outcome from shutdoor_outings o where o.user_id = uid and o.day = p_day;
  return json_build_object('taken', n > 0, 'streak', coalesce(s, 0), 'best', coalesce(b, 0),
                           'rank', r, 'players', coalesce(total, 0), 'keptScore', k_score, 'keptOutcome', k_outcome);
end $$;

-- the caller's kept outing for a day, so a second device replays it rather than
-- playing the day again: {day, scenarioId, calls, outcome, pitches, score,
-- percentile}, or null (signed out, or nothing kept for that day)
create or replace function public.shutdoor_my_day(p_day date)
returns json
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then null else (
    select json_build_object('day', o.day, 'scenarioId', o.scenario_id, 'calls', o.calls, 'outcome', o.outcome,
                             'pitches', o.pitches, 'score', o.score, 'percentile', o.percentile)
      from shutdoor_outings o where o.user_id = auth.uid() and o.day = p_day
  ) end
$$;

-- create or replace keeps the grants 153 gave; restated so this file stands on its own
revoke all on function public.shutdoor_submit(date, int, text, jsonb, text, int, int, int, text, jsonb) from public;
grant execute on function public.shutdoor_submit(date, int, text, jsonb, text, int, int, int, text, jsonb) to authenticated;
revoke all on function public.shutdoor_my_day(date) from public;
grant execute on function public.shutdoor_my_day(date) to authenticated;
