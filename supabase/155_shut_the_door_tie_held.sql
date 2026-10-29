-- ---------------------------------------------------------------------------
-- 155_shut_the_door_tie_held.sql : Shut The Door's held tie.
--
-- Safe to run more than once. Needs 153_shut_the_door.sql.
--
-- The owner's call (2026-10-20): a run that ties no longer ends the outing.
-- Play goes on, and three outs with the game still tied is a new outcome,
-- tie_held ("HELD THE TIE"). 153 allowed only door_shut, doors_open and
-- walk_off, in the table's check and in shutdoor_submit's guard, so a held tie
-- would be refused. Run this BEFORE the page that plays the tie rule ships.
--
-- What changes:
--   shutdoor_outings   the outcome check lets tie_held in (dropped and added
--                      again under the same name, so a rerun is a no-op)
--   shutdoor_submit    its guard lets tie_held in. Everything else is 153's,
--                      line for line. The streak still counts door_shut only:
--                      a held tie is a blown save and resets it
--   shutdoor_my_stats  adds tieHeld beside doorShut, doorsOpen and walkOff
-- ---------------------------------------------------------------------------

-- the outcome check. 153 wrote it inline, so Postgres named it
-- shutdoor_outings_outcome_check; drop that (or this file's own, on a rerun)
-- and add it again with tie_held.
alter table public.shutdoor_outings drop constraint if exists shutdoor_outings_outcome_check;
alter table public.shutdoor_outings add constraint shutdoor_outings_outcome_check
  check (outcome in ('door_shut', 'tie_held', 'doors_open', 'walk_off'));

-- post today's outing. The first one stands. Returns what the server holds:
-- {taken, streak, best, rank, players}.
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
begin
  if uid is null then raise exception 'sign in to post a daily'; end if;
  if p_day is null or abs(p_day - shutdoor_today()) > 1 then raise exception 'that day is not open'; end if;
  if p_outcome is null or p_outcome not in ('door_shut', 'tie_held', 'doors_open', 'walk_off') then raise exception 'not an outcome'; end if;
  if p_pitches is null or p_pitches not between 1 and 150 then raise exception 'not a real outing'; end if;
  if jsonb_typeof(p_calls) is distinct from 'array' or jsonb_array_length(p_calls) <> p_pitches
     or exists (select 1 from jsonb_array_elements(p_calls) c
                 where jsonb_typeof(c) <> 'object'
                    or (c->>'type') is null or length(c->>'type') > 2
                    or (c->>'cell') !~ '^[0-9]+$' or (c->>'cell')::int not between 0 and 24) then
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

  if n > 0 then
    select streak, best, last_day into s, b, v_last from shutdoor_streaks where user_id = uid;
    if not found then
      s := 0; b := 0; v_last := null;
    end if;
    if p_outcome = 'door_shut' then
      if v_last = p_day then
        null;                                       -- already counted
      elsif v_last = p_day - 1 then
        s := coalesce(s, 0) + 1;
      else
        s := 1;
      end if;
    else
      s := 0;                                       -- a blown save resets it, a held tie too
    end if;
    b := greatest(coalesce(b, 0), s);
    insert into shutdoor_streaks (user_id, streak, best, last_day, updated_at)
      values (uid, s, b, greatest(coalesce(v_last, p_day), p_day), now())
      on conflict (user_id) do update
        set streak = excluded.streak, best = excluded.best, last_day = excluded.last_day, updated_at = now();
  else
    select streak, best, last_day into s, b, v_last from shutdoor_streaks where user_id = uid;
  end if;

  select x.rk, x.n into r, total from (
    select o.user_id, row_number() over (order by o.score desc, o.created_at) as rk, count(*) over () as n
      from shutdoor_outings o where o.day = p_day
  ) x where x.user_id = uid;

  return json_build_object('taken', n > 0, 'streak', coalesce(s, 0), 'best', coalesce(b, 0),
                           'rank', r, 'players', coalesce(total, 0));
end $$;

-- the caller's record. null signed out.
create or replace function public.shutdoor_my_stats()
returns json
language sql security definer set search_path = public stable as $$
  select case when auth.uid() is null then null else (
    select json_build_object(
      'played', count(o.*),
      'doorShut', count(*) filter (where o.outcome = 'door_shut'),
      'tieHeld', count(*) filter (where o.outcome = 'tie_held'),
      'doorsOpen', count(*) filter (where o.outcome = 'doors_open'),
      'walkOff', count(*) filter (where o.outcome = 'walk_off'),
      'avgPercentile', round(avg(o.percentile))::int,
      'bestScore', max(o.score),
      'streak', coalesce((select case when s.last_day >= shutdoor_today() - 1 then s.streak else 0 end
                            from shutdoor_streaks s where s.user_id = auth.uid()), 0),
      'best', coalesce((select s.best from shutdoor_streaks s where s.user_id = auth.uid()), 0),
      'lastDay', (select s.last_day from shutdoor_streaks s where s.user_id = auth.uid()))
    from shutdoor_outings o where o.user_id = auth.uid()
  ) end
$$;

-- create or replace keeps the grants 153 gave; restated so this file stands on its own
revoke all on function public.shutdoor_submit(date, int, text, jsonb, text, int, int, int, text, jsonb) from public;
revoke all on function public.shutdoor_my_stats() from public;
grant execute on function public.shutdoor_submit(date, int, text, jsonb, text, int, int, int, text, jsonb) to authenticated;
grant execute on function public.shutdoor_my_stats() to authenticated;
