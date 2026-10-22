-- ---------------------------------------------------------------------------
-- 157_shut_the_door_effort.sql : Shut The Door's effort, the meter's first stop.
--
-- Safe to run more than once. Needs 153_shut_the_door.sql,
-- 155_shut_the_door_tie_held.sql and 156_shut_the_door_release.sql.
--
-- The owner's call (2026-10-22): the release meter has two stops. The first
-- is effort, e, a number 0..1 (CONTRACT.md section 5c, shut-the-door/contract.js
-- EFFORT). It moves the pitch along the pitcher's own real speed and loads the
-- arm, so check-replays.mjs needs it to replay a row exactly. A call without
-- e is his ordinary pitch: every row already stored, and every call thrown
-- with the meter off, has none.
--
-- 156's guard already lets e through (a jsonb call keeps every key), so the
-- page works before this runs. This file makes the guard check e: absent, or
-- null, or a number between 0 and 1 on a call that also carries a number q
-- (the engine refuses an effort without a timed release, and so does this).
-- Anything else (a string, a 2, an e with no q) is refused with the same
-- message as a bad cell. Run it any time, before or after the page ships.
--
-- What changes:
--   shutdoor_submit   one more clause in its calls guard. Everything else is
--                     156's, line for line
-- ---------------------------------------------------------------------------

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
                         else c ? 'e' end) then
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

-- create or replace keeps the grants 153 gave; restated so this file stands on its own
revoke all on function public.shutdoor_submit(date, int, text, jsonb, text, int, int, int, text, jsonb) from public;
grant execute on function public.shutdoor_submit(date, int, text, jsonb, text, int, int, int, text, jsonb) to authenticated;
