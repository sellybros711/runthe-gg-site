-- ---------------------------------------------------------------------------
-- 169_fourth_and_what_go_daily.sql : 4th and What's daily Go For It run.
--
-- Safe to run more than once. Needs 162 (faw_today) and profiles (usernames).
--
-- One run a day, the same for everybody: every snap of the day's run is
-- seeded from the Eastern day and the snap's number (4th-and-what/goforit.js),
-- so two players who make the same calls see the same looks and the same
-- hands. A run is 4th downs until three stops (an interception costs two).
-- The first run a player finishes is the day's; runs after it are practice
-- and are never posted. The first post for (user, day) stands.
--
-- The run's log (each snap's seed, call, result and yards) is kept with it,
-- so a row can be replayed offline with the engine (the sim is pure and
-- deterministic). The board ranks by conversions, then yards, then who was
-- first. The display name is never sent: the board reads profiles.
-- ---------------------------------------------------------------------------

create table if not exists public.faw_go_daily (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  day        date        not null,
  converted  int         not null check (converted between 0 and 200),
  yards      int         not null check (yards between 0 and 20000),
  tds        int         not null check (tds between 0 and 200),
  snaps      int         not null check (snaps between 1 and 400),
  log        jsonb       not null check (jsonb_typeof(log) = 'array' and pg_column_size(log) <= 60000),
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
create index if not exists faw_go_daily_rank on public.faw_go_daily (day, converted desc, yards desc, created_at);

-- read and written only through the functions below
alter table public.faw_go_daily enable row level security;
revoke all on public.faw_go_daily from anon, authenticated;

-- post today's run. The first one stands. Returns what the server holds:
-- {taken, converted, yards, tds, rank, players}
create or replace function public.faw_go_submit(
  p_day date, p_converted int, p_yards int, p_tds int, p_snaps int, p_log jsonb)
returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n int;
  kept faw_go_daily%rowtype;
  rk bigint; total bigint;
begin
  if uid is null then raise exception 'sign in to post a run'; end if;
  if p_day is null or abs(p_day - faw_today()) > 1 then raise exception 'that day is not open'; end if;
  if p_converted is null or p_converted not between 0 and 200 or p_yards is null or p_yards not between 0 and 20000
     or p_tds is null or p_tds not between 0 and 200 or p_snaps is null or p_snaps not between 1 and 400 then
    raise exception 'not a real run';
  end if;
  if p_tds > p_converted or p_converted >= p_snaps then raise exception 'not a real run'; end if;
  if jsonb_typeof(p_log) is distinct from 'array' or jsonb_array_length(p_log) <> p_snaps or pg_column_size(p_log) > 60000 then
    raise exception 'not a real run';
  end if;

  insert into faw_go_daily (user_id, day, converted, yards, tds, snaps, log)
    values (uid, p_day, p_converted, p_yards, p_tds, p_snaps, p_log)
    on conflict (user_id, day) do nothing;
  get diagnostics n = row_count;

  select * into kept from faw_go_daily where user_id = uid and day = p_day;
  select count(*) + 1 into rk from faw_go_daily d
   where d.day = p_day and (d.converted > kept.converted
      or (d.converted = kept.converted and d.yards > kept.yards)
      or (d.converted = kept.converted and d.yards = kept.yards and d.created_at < kept.created_at));
  select count(*) into total from faw_go_daily where day = p_day;
  return json_build_object('taken', n > 0, 'converted', kept.converted, 'yards', kept.yards, 'tds', kept.tds,
                           'rank', rk, 'players', total);
end $$;

-- the day's board: the top rows and the caller's own row wherever it is
create or replace function public.faw_go_board(p_day date, p_limit int default 10)
returns table (rank bigint, username text, converted int, yards int, tds int, mine boolean, players bigint)
language sql security definer set search_path = public stable as $$
  with r as (
    select d.*, row_number() over (order by d.converted desc, d.yards desc, d.created_at) as rk, count(*) over () as n
      from faw_go_daily d where d.day = p_day
  )
  select r.rk, coalesce(p.username, 'Coach')::text, r.converted, r.yards, r.tds, r.user_id = auth.uid(), r.n
    from r left join profiles p on p.id = r.user_id
   where r.rk <= greatest(1, least(100, coalesce(p_limit, 10))) or r.user_id = auth.uid()
   order by r.rk
$$;

revoke all on function public.faw_go_submit(date, int, int, int, int, jsonb) from public;
revoke all on function public.faw_go_board(date, int) from public;
grant execute on function public.faw_go_submit(date, int, int, int, int, jsonb) to authenticated;
grant execute on function public.faw_go_board(date, int) to anon, authenticated;
