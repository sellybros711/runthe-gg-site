-- ---------------------------------------------------------------------------
-- 153_shut_the_door.sql : Shut The Door's daily outings, streaks and board.
--
-- Safe to run more than once. Needs profiles (usernames).
--
-- One daily per player per Eastern day (CONTRACT.md section 12). The page
-- submits a finished daily outing once, signed in; the first submit for
-- (user, day) stands and a later one changes nothing, so a replay can never
-- improve a result. The calls are kept with the result, so
-- shut-the-door/check-replays.mjs can replay any row offline with the engine
-- and flag a score the calls do not produce.
--
-- The streak is doors shut in a row: a door shut on consecutive days. A blown
-- save or a missed day resets it. A missed day is only seen when the next
-- result comes in, so the readers below answer 0 for a streak whose last day
-- is older than yesterday (Eastern), the same rule the page uses.
--
-- The day is the Eastern calendar day, like every daily on the site
-- (108_hoops_leaderboard.sql): a post is taken for the Eastern day or one
-- either side of it, so a phone a little off still posts. The display name is
-- never sent: the board reads it from profiles.
-- ---------------------------------------------------------------------------

create table if not exists public.shutdoor_outings (
  user_id      uuid        not null references auth.users(id) on delete cascade,
  day          date        not null,
  daily_number int         not null check (daily_number between 1 and 100000),
  scenario_id  text        not null check (length(scenario_id) between 1 and 64),
  calls        jsonb       not null,
  outcome      text        not null check (outcome in ('door_shut', 'doors_open', 'walk_off')),
  pitches      int         not null check (pitches between 1 and 150),
  score        int         not null check (score between 0 and 1000),
  percentile   int         not null check (percentile between 0 and 100),
  pitched_like text        check (pitched_like is null or length(pitched_like) <= 60),
  strip        jsonb       not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, day)
);
create index if not exists shutdoor_outings_rank on public.shutdoor_outings (day, score desc, created_at);

create table if not exists public.shutdoor_streaks (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  streak     int         not null default 0,
  best       int         not null default 0,
  last_day   date,
  updated_at timestamptz not null default now()
);

-- read and written only through the functions below
alter table public.shutdoor_outings enable row level security;
alter table public.shutdoor_streaks enable row level security;
revoke all on public.shutdoor_outings from anon, authenticated;
revoke all on public.shutdoor_streaks from anon, authenticated;

create or replace function public.shutdoor_today() returns date
language sql stable as $$ select (now() at time zone 'America/New_York')::date $$;

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
  if p_outcome is null or p_outcome not in ('door_shut', 'doors_open', 'walk_off') then raise exception 'not an outcome'; end if;
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
      s := 0;                                       -- a blown save resets it
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

-- the day's board: the top rows, and the caller's own row wherever it is
create or replace function public.shutdoor_board(p_day date, p_limit int default 50)
returns table (rank bigint, username text, outcome text, pitches int, score int, percentile int,
               pitched_like text, strip jsonb, mine boolean, players bigint)
language sql security definer set search_path = public stable as $$
  with r as (
    select o.*, row_number() over (order by o.score desc, o.created_at) as rk, count(*) over () as n
      from shutdoor_outings o where o.day = p_day
  )
  select r.rk, coalesce(p.username, 'Closer')::text, r.outcome, r.pitches, r.score, r.percentile,
         r.pitched_like, r.strip, r.user_id = auth.uid(), r.n
    from r left join profiles p on p.id = r.user_id
   where r.rk <= greatest(1, least(100, coalesce(p_limit, 50))) or r.user_id = auth.uid()
   order by r.rk
$$;

-- the caller's record. null signed out.
create or replace function public.shutdoor_my_stats()
returns json
language sql security definer set search_path = public stable as $$
  select case when auth.uid() is null then null else (
    select json_build_object(
      'played', count(o.*),
      'doorShut', count(*) filter (where o.outcome = 'door_shut'),
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

revoke all on function public.shutdoor_submit(date, int, text, jsonb, text, int, int, int, text, jsonb) from public;
revoke all on function public.shutdoor_board(date, int) from public;
revoke all on function public.shutdoor_my_stats() from public;
grant execute on function public.shutdoor_submit(date, int, text, jsonb, text, int, int, int, text, jsonb) to authenticated;
grant execute on function public.shutdoor_board(date, int) to anon, authenticated;
grant execute on function public.shutdoor_my_stats() to authenticated;
grant execute on function public.shutdoor_today() to anon, authenticated;
