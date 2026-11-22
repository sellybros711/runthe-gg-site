-- 175: Last Shot's events from guests, a cap, a trim, and a report that
-- counts them (2026-11-16, the Advisor's review, approved through the hub).
--
-- 170 kept Last Shot's events on a signed in account: the game is tester
-- only, so every player had one. After the launch most players never sign
-- in, and they would send nothing. 171 (4th and What's) made user_id optional
-- and added device_id. This lets Last Shot write a row with an account, a
-- device id, or both, through one service role function:
--
--   last_shot_events_add(user, device, rows)   rows for one batch; nothing
--     once that player (account, else device) wrote CAP rows in the last day;
--     and each call trims at most 200 of Last Shot's rows older than 120 days
--     (the same keep and trim as 173 for 4th and What; no pg_cron needed)
--
-- game_round_report keeps its signature and now keys a player on the account,
-- else the device, so a guest counts. Its admin filter used `user_id not in
-- (...)`, which drops every row with no account; it now keeps them.
--
-- No browser role can reach either function. Safe to run twice.
-- Needs 170 and 171 (device_id, and user_id optional).

create or replace function public.last_shot_events_add(p_user uuid, p_device text, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int; cap constant int := 3000; keep constant interval := interval '120 days'; trim_n constant int := 200;
begin
  if p_device is not null and p_device !~ '^[A-Za-z0-9-]{8,40}$' then p_device := null; end if;
  if p_user is null and p_device is null then return 0; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 40 then return 0; end if;
  if (select count(*) from game_events where game = 'last-shot' and created_at > now() - interval '1 day'
        and (case when p_user is not null then user_id = p_user else user_id is null and device_id = p_device end)) >= cap then return 0; end if;
  insert into game_events (game, user_id, device_id, session_id, name, client_ms, props)
    select 'last-shot', p_user, p_device, r->>'session_id', r->>'name', (r->>'client_ms')::int, coalesce(r->'props', '{}'::jsonb)
      from jsonb_array_elements(p_rows) r;
  get diagnostics n = row_count;
  delete from game_events where id in (
    select id from game_events where game = 'last-shot' and created_at < now() - keep
     order by created_at limit trim_n);
  return n;
end $$;
revoke all on function public.last_shot_events_add(uuid, text, jsonb) from public, anon, authenticated;

-- The four numbers, as 170 defined them, over new players: an account, else a
-- device. Admins are left out by account; guests are always kept.
create or replace function public.game_round_report(p_game text, p_since timestamptz, p_until timestamptz, p_exclude_admins boolean default true)
returns json language sql stable security definer set search_path = public as $$
  with skip as (
    select user_id from stumpire_testers where p_exclude_admins and role = 'admin'
  ), ev as (
    select *, coalesce(user_id::text, device_id) as who from game_events
     where game = p_game and (user_id is null or user_id not in (select user_id from skip))
       and coalesce(user_id::text, device_id) is not null
  ), firsts as (
    select who, min(created_at) as first_at from ev group by who
  ), newp as (
    select f.who, f.first_at, (f.first_at at time zone 'America/New_York')::date as d0
      from firsts f
     where f.first_at >= p_since and f.first_at < p_until
       and (select (e.props->>'first')::boolean from ev e where e.who = f.who and e.name = 'open'
             order by e.created_at, e.client_ms limit 1) is true
  ), first_sess as (
    select distinct on (e.who) e.who, e.session_id
      from ev e join newp n using (who) order by e.who, e.created_at, e.client_ms
  ), ttfr as (
    select f.who, (select min(r.client_ms) from ev r where r.who = f.who and r.session_id = f.session_id and r.name = 'run') as ms
      from first_sess f
  ), firstres as (
    select who, props->>'outcome' as outcome,
           row_number() over (partition by who order by created_at, client_ms) as k
      from ev where name = 'result' and who in (select who from newp)
  ), ran as (
    select distinct who from ev where name = 'run' and who in (select who from newp)
  ), sess as (
    select session_id, count(*) filter (where name = 'run') as runs
      from ev where created_at >= p_since and created_at < p_until group by session_id
  ), ret as (
    select n.who,
           exists (select 1 from ev e where e.who = n.who and (e.created_at at time zone 'America/New_York')::date = n.d0 + 1) as back
      from newp n where n.d0 + 1 < (now() at time zone 'America/New_York')::date
  )
  select json_build_object(
    'game', p_game, 'since', p_since, 'until', p_until, 'exclude_admins', p_exclude_admins,
    'new_players', (select count(*) from newp),
    'veterans', (select count(*) from firsts where first_at >= p_since and first_at < p_until) - (select count(*) from newp),
    'guests', (select count(*) from newp where who !~ '^[0-9a-f]{8}-[0-9a-f]{4}-'),
    'first_run_median_s', (select round((percentile_cont(0.5) within group (order by coalesce(ms, 2147483647)) / 1000.0)::numeric, 1) from ttfr),
    'first_run_never', (select count(*) from ttfr where ms is null),
    'ran', (select count(*) from ran),
    'win_in_5', (select round(avg(case when exists (select 1 from firstres f where f.who = r.who and f.k <= 5 and f.outcome = 'win') then 1.0 else 0.0 end)::numeric, 3) from ran r),
    'sessions', (select count(*) from sess where runs > 0),
    'tries_per_session', (select percentile_cont(0.5) within group (order by runs) from sess where runs > 0),
    'tries_mean', (select round(avg(runs)::numeric, 1) from sess where runs > 0),
    'day1_eligible', (select count(*) from ret),
    'day1_return', (select round(avg(case when back then 1.0 else 0.0 end)::numeric, 3) from ret),
    'events', (select count(*) from ev where created_at >= p_since and created_at < p_until),
    'funnel', (select json_object_agg(name, c) from (select name, count(distinct who) as c from ev where created_at >= p_since and created_at < p_until group by name) x)
  );
$$;
revoke all on function public.game_round_report(text, timestamptz, timestamptz, boolean) from public, anon, authenticated;
