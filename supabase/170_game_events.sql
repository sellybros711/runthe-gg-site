-- 170: first party gameplay events for tester rounds, and the round report
-- (Last Shot's Phase 4, 2026-11-13).
--
-- A tester-only game posts small gameplay events (open, run, result, ...)
-- to its own Pages Function, which checks the tester cookie and writes the
-- rows here with the service role. No browser role can read or write this
-- table. The game column lets another tester game (4th and What) use it.
--
-- game_round_report(game, since, until, exclude_admins) returns the four
-- launch targets as json; the admin report page (/last-shot/report) calls it.
--
-- Safe to run twice: create if not exists, create or replace.
-- Keep rows no longer than the round needs: delete from game_events where
-- created_at < now() - interval '180 days';

create table if not exists public.game_events (
  id          bigserial primary key,
  game        text not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  session_id  text not null,
  name        text not null,
  client_ms   integer not null,
  props       jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  constraint game_events_game_ck check (game ~ '^[a-z0-9-]{2,30}$'),
  constraint game_events_name_ck check (name ~ '^[a-z_]{2,20}$'),
  constraint game_events_session_ck check (session_id ~ '^[A-Za-z0-9-]{8,40}$'),
  constraint game_events_props_ck check (pg_column_size(props) < 2000)
);
create index if not exists game_events_user on public.game_events (game, user_id, created_at);
create index if not exists game_events_time on public.game_events (game, created_at);

alter table public.game_events enable row level security;
revoke all on public.game_events from anon, authenticated;
revoke all on sequence public.game_events_id_seq from anon, authenticated;

-- The four numbers, over new players whose first event falls in [since, until)
-- and whose first open says this browser never opened the game before.
--   first_run_median_s  median seconds from opening to the first Run It, in
--                       their first session (never ran counts as never)
--   win_in_5            share of new players who ran at least once and won
--                       within their first 5 results
--   tries_per_session   median runs in a session with at least one run
--   day1_return         share of new players back the next Eastern day (only
--                       players whose next day has already ended)
create or replace function public.game_round_report(p_game text, p_since timestamptz, p_until timestamptz, p_exclude_admins boolean default true)
returns json language sql stable security definer set search_path = public as $$
  with skip as (
    select user_id from stumpire_testers where p_exclude_admins and role = 'admin'
  ), ev as (
    select * from game_events
     where game = p_game and user_id not in (select user_id from skip)
  ), firsts as (
    select user_id, min(created_at) as first_at from ev group by user_id
  ), newp as (
    -- new means new to the game, not new to these events: their first open
    -- says this browser never opened it before (a tester who played before
    -- the events began is a veteran, left out of the new player numbers)
    select f.user_id, f.first_at, (f.first_at at time zone 'America/New_York')::date as d0
      from firsts f
     where f.first_at >= p_since and f.first_at < p_until
       and (select (e.props->>'first')::boolean from ev e where e.user_id = f.user_id and e.name = 'open'
             order by e.created_at, e.client_ms limit 1) is true
  ), first_sess as (
    select distinct on (e.user_id) e.user_id, e.session_id
      from ev e join newp n using (user_id) order by e.user_id, e.created_at, e.client_ms
  ), ttfr as (
    select f.user_id, (select min(r.client_ms) from ev r where r.user_id = f.user_id and r.session_id = f.session_id and r.name = 'run') as ms
      from first_sess f
  ), firstres as (
    select user_id, props->>'outcome' as outcome,
           row_number() over (partition by user_id order by created_at, client_ms) as k
      from ev where name = 'result' and user_id in (select user_id from newp)
  ), ran as (
    select distinct user_id from ev where name = 'run' and user_id in (select user_id from newp)
  ), sess as (
    select session_id, count(*) filter (where name = 'run') as runs
      from ev where created_at >= p_since and created_at < p_until group by session_id
  ), ret as (
    select n.user_id,
           exists (select 1 from ev e where e.user_id = n.user_id and (e.created_at at time zone 'America/New_York')::date = n.d0 + 1) as back
      from newp n where n.d0 + 1 < (now() at time zone 'America/New_York')::date
  )
  select json_build_object(
    'game', p_game, 'since', p_since, 'until', p_until, 'exclude_admins', p_exclude_admins,
    'new_players', (select count(*) from newp),
    'veterans', (select count(*) from firsts where first_at >= p_since and first_at < p_until) - (select count(*) from newp),
    'first_run_median_s', (select round((percentile_cont(0.5) within group (order by coalesce(ms, 2147483647)) / 1000.0)::numeric, 1) from ttfr),
    'first_run_never', (select count(*) from ttfr where ms is null),
    'ran', (select count(*) from ran),
    'win_in_5', (select round(avg(case when exists (select 1 from firstres f where f.user_id = r.user_id and f.k <= 5 and f.outcome = 'win') then 1.0 else 0.0 end)::numeric, 3) from ran r),
    'sessions', (select count(*) from sess where runs > 0),
    'tries_per_session', (select percentile_cont(0.5) within group (order by runs) from sess where runs > 0),
    'tries_mean', (select round(avg(runs)::numeric, 1) from sess where runs > 0),
    'day1_eligible', (select count(*) from ret),
    'day1_return', (select round(avg(case when back then 1.0 else 0.0 end)::numeric, 3) from ret),
    'events', (select count(*) from ev where created_at >= p_since and created_at < p_until),
    'funnel', (select json_object_agg(name, c) from (select name, count(distinct user_id) as c from ev where created_at >= p_since and created_at < p_until group by name) x)
  );
$$;
revoke all on function public.game_round_report(text, timestamptz, timestamptz, boolean) from public, anon, authenticated;
