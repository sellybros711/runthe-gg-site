-- ---------------------------------------------------------------------------
-- 182_shut_the_door_history.sql : Shut The Door's history, a Pro perk.
--
-- Safe to run more than once. Needs 153, 155, 159, 160 and 166 (shut_the_door).
-- Run it BEFORE the page that calls it ships. The page reads a missing function
-- as "could not ask" and shows the history as it would offline, so nothing
-- breaks while it is missing.
--
-- The owner (2026-11-18): Pro keeps "every daily outing and Survivor run the
-- player has played, saved for them to look back on". Both are already kept:
-- shutdoor_outings (153) holds each daily with its calls, and shutdoor_survivor
-- (160) each run with its entries and their calls. Nothing new is stored. These
-- two functions only read them back, and only the caller's own rows: neither
-- takes a user id, both read auth.uid(), and both answer nothing for a player
-- who is not Pro (shutdoor_is_pro, 160, which answers false for everyone until
-- the store's migration turns it on).
--
--   shutdoor_history(p_before, p_days)
--     The list, newest first: {pro, items, more, oldest}. null signed out.
--     Not Pro: {pro: false, items: [], more: false, oldest: null}.
--     items, one per daily and one per Survivor run, on the p_days most recent
--     days the caller played anything before p_before (null: every day), 1..60:
--       {kind: 'daily', day, number, scenarioId, outcome, pitches, score, percentile, at}
--       {kind: 'survivor', day, run, saves, points, over, at,
--        spots: [{index, scenarioId, outcome, pitches, score}]}
--     The calls stay out of the list. more says older days remain; pass oldest
--     as p_before to read them.
--
--   shutdoor_history_outing(p_day, p_run, p_index)
--     One kept outing with its calls, so the page can replay it on its own seed
--     (the day's for a daily, modes.js survivorAt for a Survivor spot) and show
--     its result: {kind, day, number, run, index, scenarioId, calls, outcome,
--     pitches, score, percentile}. p_run null is the daily of p_day. null signed
--     out, not Pro, or no such row of the caller's.
--
-- What changes:
--   shutdoor_history          new, granted to authenticated
--   shutdoor_history_outing   new, granted to authenticated
--   no table, no column, no other function
-- ---------------------------------------------------------------------------

create or replace function public.shutdoor_history(p_before date default null, p_days int default 30)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n int := greatest(1, least(60, coalesce(p_days, 30)));
  kept date[];
  last date;
begin
  if uid is null then return null; end if;
  if not shutdoor_is_pro(uid) then
    return json_build_object('pro', false, 'items', '[]'::json, 'more', false, 'oldest', null);
  end if;
  -- the p_days most recent days with a daily or a run, before p_before
  select array_agg(d order by d desc) into kept from (
    select d from (
      select o.day as d from shutdoor_outings o where o.user_id = uid and (p_before is null or o.day < p_before)
      union
      select s.day from shutdoor_survivor s where s.user_id = uid and (p_before is null or s.day < p_before)
    ) u order by d desc limit n
  ) k;
  if kept is null then
    return json_build_object('pro', true, 'items', '[]'::json, 'more', false, 'oldest', null);
  end if;
  last := kept[array_length(kept, 1)];
  return json_build_object(
    'pro', true,
    'items', coalesce((select json_agg(x.j order by x.day desc, x.at desc) from (
      select o.day, o.created_at as at, json_build_object(
          'kind', 'daily', 'day', o.day, 'number', o.daily_number, 'scenarioId', o.scenario_id,
          'outcome', o.outcome, 'pitches', o.pitches, 'score', o.score, 'percentile', o.percentile,
          'at', o.created_at) as j
        from shutdoor_outings o where o.user_id = uid and o.day = any(kept)
      union all
      select s.day, s.created_at, json_build_object(
          'kind', 'survivor', 'day', s.day, 'run', s.run, 'saves', s.saves, 'points', s.points, 'over', s.over,
          'at', s.created_at,
          'spots', coalesce((select json_agg(json_build_object('index', e.i - 1, 'scenarioId', e.v->>'scenarioId',
                                   'outcome', e.v->>'outcome', 'pitches', (e.v->>'pitches')::int, 'score', (e.v->>'score')::int)
                                   order by e.i)
                               from jsonb_array_elements(s.entries) with ordinality e(v, i)), '[]'::json))
        from shutdoor_survivor s where s.user_id = uid and s.day = any(kept)
    ) x), '[]'::json),
    'more', exists (select 1 from shutdoor_outings o where o.user_id = uid and o.day < last)
            or exists (select 1 from shutdoor_survivor s where s.user_id = uid and s.day < last),
    'oldest', last);
end $$;

create or replace function public.shutdoor_history_outing(p_day date, p_run int default null, p_index int default null)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  e jsonb;
  out json;
begin
  if uid is null or p_day is null or not shutdoor_is_pro(uid) then return null; end if;
  if p_run is null then
    select json_build_object('kind', 'daily', 'day', o.day, 'number', o.daily_number, 'run', null, 'index', null,
                             'scenarioId', o.scenario_id, 'calls', o.calls, 'outcome', o.outcome, 'pitches', o.pitches,
                             'score', o.score, 'percentile', o.percentile)
      into out from shutdoor_outings o where o.user_id = uid and o.day = p_day;
    return out;
  end if;
  if p_index is null or p_index < 0 then return null; end if;
  select s.entries -> p_index into e from shutdoor_survivor s where s.user_id = uid and s.day = p_day and s.run = p_run;
  if e is null then return null; end if;
  return json_build_object('kind', 'survivor', 'day', p_day, 'number', null, 'run', p_run, 'index', p_index,
                           'scenarioId', e->>'scenarioId', 'calls', e->'calls', 'outcome', e->>'outcome',
                           'pitches', (e->>'pitches')::int, 'score', (e->>'score')::int, 'percentile', null);
end $$;

revoke all on function public.shutdoor_history(date, int) from public;
revoke all on function public.shutdoor_history_outing(date, int, int) from public;
grant execute on function public.shutdoor_history(date, int) to authenticated;
grant execute on function public.shutdoor_history_outing(date, int, int) to authenticated;
