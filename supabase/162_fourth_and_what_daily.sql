-- ---------------------------------------------------------------------------
-- 162_fourth_and_what_daily.sql : 4th and What's daily 4th down.
--
-- Safe to run more than once. Needs profiles (usernames).
--
-- One real NFL 4th down a day (4th-and-what/data/fourths.json, the play for
-- an Eastern day picked by 4th-and-what/daily.js). A player draws a call,
-- snaps it once against the day's defense, and that first snap is the day's
-- result. Snaps after it are practice and are never posted. The first post
-- for (user, day) stands and a later one changes nothing.
--
-- The drawn play and the seed are kept with the result, so any row can be
-- replayed offline with the engine (the sim is pure and deterministic: same
-- play, same seed, same result).
--
-- The streak is days played in a row (Eastern days). A missed day is only
-- seen when the next result comes in, so the readers answer 0 for a streak
-- whose last day is older than yesterday. The page says the same.
--
-- The day is the Eastern calendar day, like every daily on the site: a post
-- is taken for the Eastern day or one either side of it, so a phone a little
-- off still posts. The display name is never sent: the board reads profiles.
-- ---------------------------------------------------------------------------

create table if not exists public.faw_daily (
  user_id      uuid        not null references auth.users(id) on delete cascade,
  day          date        not null,
  daily_number int         not null check (daily_number between 1 and 100000),
  play_id      text        not null check (length(play_id) between 1 and 64),
  converted    boolean     not null,
  yards        int         not null check (yards between -99 and 110),
  call_key     text        not null check (length(call_key) between 1 and 16),
  seed         bigint      not null check (seed between 0 and 4294967295),
  drawn        jsonb       not null check (pg_column_size(drawn) <= 20000),
  created_at   timestamptz not null default now(),
  primary key (user_id, day)
);
create index if not exists faw_daily_rank on public.faw_daily (day, converted desc, yards desc, created_at);

create table if not exists public.faw_daily_streaks (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  streak     int         not null default 0,
  best       int         not null default 0,
  last_day   date,
  updated_at timestamptz not null default now()
);

-- read and written only through the functions below
alter table public.faw_daily enable row level security;
alter table public.faw_daily_streaks enable row level security;
revoke all on public.faw_daily from anon, authenticated;
revoke all on public.faw_daily_streaks from anon, authenticated;

create or replace function public.faw_today() returns date
language sql stable as $$ select (now() at time zone 'America/New_York')::date $$;

-- the day so far, for everybody: {players, converted}
create or replace function public.faw_daily_day(p_day date)
returns json
language sql security definer set search_path = public stable as $$
  select json_build_object('players', count(*), 'converted', count(*) filter (where converted))
    from faw_daily where day = p_day
$$;

-- post today's snap. The first one stands. Returns what the server holds:
-- {taken, converted, yards, streak, best, players, convertedAll}
create or replace function public.faw_daily_submit(
  p_day date, p_number int, p_play_id text, p_converted boolean, p_yards int,
  p_call text, p_seed bigint, p_drawn jsonb)
returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n int;
  s int; b int; v_last date;
  kept faw_daily%rowtype;
  t json;
begin
  if uid is null then raise exception 'sign in to post a daily'; end if;
  if p_day is null or abs(p_day - faw_today()) > 1 then raise exception 'that day is not open'; end if;
  if p_converted is null or p_yards is null or p_yards not between -99 and 110 then raise exception 'not a real snap'; end if;
  if p_play_id is null or length(p_play_id) not between 1 and 64 or p_call is null or length(p_call) not between 1 and 16 then
    raise exception 'not a real snap';
  end if;
  if p_seed is null or p_seed not between 0 and 4294967295 then raise exception 'not a real snap'; end if;
  if jsonb_typeof(p_drawn) is distinct from 'object' or pg_column_size(p_drawn) > 20000 then raise exception 'not a drawn play'; end if;

  insert into faw_daily (user_id, day, daily_number, play_id, converted, yards, call_key, seed, drawn)
    values (uid, p_day, p_number, p_play_id, p_converted, p_yards, p_call, p_seed, p_drawn)
    on conflict (user_id, day) do nothing;
  get diagnostics n = row_count;

  select streak, best, last_day into s, b, v_last from faw_daily_streaks where user_id = uid;
  if not found then s := 0; b := 0; v_last := null; end if;
  if n > 0 then
    if v_last = p_day then
      null;                                         -- already counted
    elsif v_last = p_day - 1 then
      s := coalesce(s, 0) + 1;
    elsif v_last is null or v_last < p_day then
      s := 1;
    end if;
    b := greatest(coalesce(b, 0), s);
    insert into faw_daily_streaks (user_id, streak, best, last_day, updated_at)
      values (uid, s, b, greatest(coalesce(v_last, p_day), p_day), now())
      on conflict (user_id) do update
        set streak = excluded.streak, best = excluded.best, last_day = excluded.last_day, updated_at = now();
  end if;

  select * into kept from faw_daily where user_id = uid and day = p_day;
  t := faw_daily_day(p_day);
  return json_build_object('taken', n > 0, 'converted', kept.converted, 'yards', kept.yards,
                           'streak', coalesce(s, 0), 'best', coalesce(b, 0),
                           'players', (t->>'players')::int, 'convertedAll', (t->>'converted')::int);
end $$;

-- the day's board: who converted, by yards gained, then who was first. The
-- top rows and the caller's own row wherever it is.
create or replace function public.faw_daily_board(p_day date, p_limit int default 50)
returns table (rank bigint, username text, converted boolean, yards int, call_key text, mine boolean, players bigint)
language sql security definer set search_path = public stable as $$
  with r as (
    select d.*, row_number() over (order by d.converted desc, d.yards desc, d.created_at) as rk, count(*) over () as n
      from faw_daily d where d.day = p_day
  )
  select r.rk, coalesce(p.username, 'Coach')::text, r.converted, r.yards, r.call_key, r.user_id = auth.uid(), r.n
    from r left join profiles p on p.id = r.user_id
   where r.rk <= greatest(1, least(100, coalesce(p_limit, 50))) or r.user_id = auth.uid()
   order by r.rk
$$;

-- the caller's record, and today's kept snap if there is one. null signed out.
create or replace function public.faw_daily_my_stats()
returns json
language sql security definer set search_path = public stable as $$
  select case when auth.uid() is null then null else (
    select json_build_object(
      'played', count(d.*),
      'converted', count(*) filter (where d.converted),
      'streak', coalesce((select case when s.last_day >= faw_today() - 1 then s.streak else 0 end
                            from faw_daily_streaks s where s.user_id = auth.uid()), 0),
      'best', coalesce((select s.best from faw_daily_streaks s where s.user_id = auth.uid()), 0),
      'lastDay', (select s.last_day from faw_daily_streaks s where s.user_id = auth.uid()),
      'today', (select json_build_object('day', t.day, 'converted', t.converted, 'yards', t.yards, 'callKey', t.call_key,
                                         'seed', t.seed, 'drawn', t.drawn)
                  from faw_daily t where t.user_id = auth.uid() and t.day = faw_today()))
    from faw_daily d where d.user_id = auth.uid()
  ) end
$$;

revoke all on function public.faw_daily_submit(date, int, text, boolean, int, text, bigint, jsonb) from public;
revoke all on function public.faw_daily_board(date, int) from public;
revoke all on function public.faw_daily_day(date) from public;
revoke all on function public.faw_daily_my_stats() from public;
grant execute on function public.faw_daily_submit(date, int, text, boolean, int, text, bigint, jsonb) to authenticated;
grant execute on function public.faw_daily_board(date, int) to anon, authenticated;
grant execute on function public.faw_daily_day(date) to anon, authenticated;
grant execute on function public.faw_daily_my_stats() to authenticated;
grant execute on function public.faw_today() to anon, authenticated;
