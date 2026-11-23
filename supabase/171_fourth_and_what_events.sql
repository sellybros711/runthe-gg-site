-- 171: 4th and What's launch numbers, on the shared game_events (170).
--
-- The owner, 2026-11-14: "use the Supabase table". 170 keys every event on a
-- signed in account (Last Shot is tester only). 4th and What is public and
-- most players never sign in, so this lets an event carry a device id
-- instead: a random id the page keeps in its own storage, nothing personal.
-- user_id becomes optional and one of the two must be set. Last Shot's rows
-- and its report (game_round_report) are unchanged: they always carry an
-- account, and that report only reads its own game.
--
-- faw_events_add(device, rows) is how 4th and What's Pages Function writes
-- (functions/api/faw/e.js, with the service role): one device's rows
-- for one batch, and nothing once that device has written CAP rows in the
-- last day, so one browser cannot flood the table.
--
-- faw_round_report(since, until) returns the launch plan's targets as json,
-- over new players (their first open says this browser never opened the
-- game before) whose first event is in [since, until):
--   snaps_per_session   median snaps in a session with at least one snap
--                       (target 8 or more)
--   run_finish          share of new players who started a Go For It run
--                       and finished one (target over half)
--   share_save          share of sessions with a snap that shared or saved
--                       (target 1 in 10)
--   first_snap_median_s median seconds from the first open to the first
--                       snap in that session (never snapped counts as never)
--   day1_return         share of new players back the next Eastern day
--                       (only players whose next day has ended)
--
-- No browser role can reach the table or either function. Safe to run twice.
-- Needs 170 (game_events).

alter table public.game_events add column if not exists device_id text;
alter table public.game_events alter column user_id drop not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'game_events_who_ck') then
    alter table public.game_events add constraint game_events_who_ck
      check (user_id is not null or (device_id is not null and device_id ~ '^[A-Za-z0-9-]{8,40}$'));
  end if;
end $$;
create index if not exists game_events_device on public.game_events (game, device_id, created_at);

create or replace function public.faw_events_add(p_device text, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int; cap constant int := 3000;
begin
  if p_device is null or p_device !~ '^[A-Za-z0-9-]{8,40}$' or jsonb_typeof(p_rows) is distinct from 'array' then return 0; end if;
  if jsonb_array_length(p_rows) > 40 then return 0; end if;
  if (select count(*) from game_events where game = '4th-and-what' and device_id = p_device and created_at > now() - interval '1 day') >= cap then return 0; end if;
  insert into game_events (game, device_id, session_id, name, client_ms, props)
    select '4th-and-what', p_device, r->>'session_id', r->>'name', (r->>'client_ms')::int, coalesce(r->'props', '{}'::jsonb)
      from jsonb_array_elements(p_rows) r;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.faw_round_report(p_since timestamptz, p_until timestamptz)
returns json language sql stable security definer set search_path = public as $$
  with ev as (
    select *, coalesce(user_id::text, device_id) as who from game_events where game = '4th-and-what'
  ), firsts as (
    select who, min(created_at) as first_at from ev group by who
  ), newp as (
    select f.who, f.first_at, (f.first_at at time zone 'America/New_York')::date as d0
      from firsts f
     where f.first_at >= p_since and f.first_at < p_until
       and (select (e.props->>'first')::boolean from ev e where e.who = f.who and e.name = 'open'
             order by e.created_at, e.client_ms limit 1) is true
  ), first_sess as (
    select distinct on (e.who) e.who, e.session_id, e.client_ms as open_ms
      from ev e join newp n using (who) order by e.who, e.created_at, e.client_ms
  ), tts as (
    select f.who, (select min(s.client_ms) from ev s where s.who = f.who and s.session_id = f.session_id and s.name = 'snap') - f.open_ms as ms
      from first_sess f
  ), sess as (
    select session_id, count(*) filter (where name = 'snap') as snaps,
           bool_or(name in ('share', 'save')) as kept
      from ev where created_at >= p_since and created_at < p_until group by session_id
  ), started as (
    select distinct who from ev where name = 'run_start' and who in (select who from newp)
  ), finished as (
    select distinct who from ev where name = 'run_end' and who in (select who from started)
  ), ret as (
    select n.who, exists (select 1 from ev e where e.who = n.who and (e.created_at at time zone 'America/New_York')::date = n.d0 + 1) as back
      from newp n where n.d0 + 1 < (now() at time zone 'America/New_York')::date
  )
  select json_build_object(
    'game', '4th-and-what', 'since', p_since, 'until', p_until,
    'new_players', (select count(*) from newp),
    'veterans', (select count(*) from firsts where first_at >= p_since and first_at < p_until) - (select count(*) from newp),
    'first_snap_median_s', (select round((percentile_cont(0.5) within group (order by coalesce(ms, 2147483647)) / 1000.0)::numeric, 1) from tts),
    'first_snap_never', (select count(*) from tts where ms is null),
    'sessions', (select count(*) from sess where snaps > 0),
    'snaps_per_session', (select percentile_cont(0.5) within group (order by snaps) from sess where snaps > 0),
    'started_run', (select count(*) from started),
    'run_finish', (select case when count(*) = 0 then null else round((select count(*) from finished)::numeric / count(*), 3) end from started),
    'share_save', (select round(avg(case when kept then 1.0 else 0.0 end)::numeric, 3) from sess where snaps > 0),
    'day1_eligible', (select count(*) from ret),
    'day1_return', (select round(avg(case when back then 1.0 else 0.0 end)::numeric, 3) from ret),
    'events', (select count(*) from ev where created_at >= p_since and created_at < p_until),
    'funnel', (select json_object_agg(name, c) from (select name, count(distinct who) as c from ev where created_at >= p_since and created_at < p_until group by name) x)
  );
$$;

revoke all on function public.faw_events_add(text, jsonb) from public, anon, authenticated;
revoke all on function public.faw_round_report(timestamptz, timestamptz) from public, anon, authenticated;
