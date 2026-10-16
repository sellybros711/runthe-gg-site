-- ---------------------------------------------------------------------------
-- 148_putt_daily_board.sql : the Putt Putt Daily Hole leaderboard.
--
-- Safe to run more than once. Needs profiles (usernames).
--
-- Everybody plays the same Daily Hole each day. Fewest strokes wins and the
-- clock breaks a tie, as the page has always said. A player's first round of
-- the day is the one that counts: a later post for the same day is ignored, so
-- a replay can never improve it.
--
-- The page posts only a round played on the day itself (a hole played late from
-- the calendar does not), and the day must be the server's day or one either
-- side of it, so a player in any time zone can post. Strokes, par and time are
-- held to what a real round can be. The golfer's look is kept with the round
-- (lookForBoard on the page, at most 4 KB) so the board can draw their golfer.
-- ---------------------------------------------------------------------------

create table if not exists public.putt_daily (
  day        date        not null,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  strokes    int         not null check (strokes between 1 and 12),
  par        int         not null check (par between 2 and 6),
  ms         int         check (ms is null or ms between 1000 and 3600000),
  look       jsonb,
  created_at timestamptz not null default now(),
  primary key (day, user_id)
);
create index if not exists putt_daily_rank on public.putt_daily (day, strokes, ms);

-- read and written only through the functions below
alter table public.putt_daily enable row level security;

-- post today's round. The first one stands; returns true when it was taken.
create or replace function public.putt_daily_submit(p_day date, p_strokes int, p_par int, p_ms int default null, p_look jsonb default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n   int;
begin
  if uid is null then raise exception 'sign in to post a Daily Hole'; end if;
  if p_day is null or abs(p_day - (now() at time zone 'utc')::date) > 1 then raise exception 'that day is not open'; end if;
  if p_strokes is null or p_strokes not between 1 and 12 or p_par is null or p_par not between 2 and 6 then raise exception 'not a real round'; end if;
  if p_ms is not null and p_ms not between 1000 and 3600000 then raise exception 'not a real time'; end if;
  insert into putt_daily (day, user_id, strokes, par, ms, look)
    values (p_day, uid, p_strokes, p_par, p_ms,
            case when p_look is not null and length(p_look::text) <= 4096 then p_look end)
    on conflict (day, user_id) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- the day's board: the top rows, and the caller's own row wherever it is
create or replace function public.putt_daily_board(p_day date, p_limit int default 50)
returns table (rank bigint, username text, strokes int, par int, ms int, look jsonb, mine boolean, players bigint)
language sql security definer set search_path = public stable as $$
  with r as (
    select d.*, row_number() over (order by d.strokes, d.ms nulls last, d.created_at) as rk,
           count(*) over () as n
      from putt_daily d where d.day = p_day
  )
  select r.rk, coalesce(p.username, 'Golfer')::text, r.strokes, r.par, r.ms, r.look, r.user_id = auth.uid(), r.n
    from r left join profiles p on p.id = r.user_id
   where r.rk <= greatest(1, least(100, coalesce(p_limit, 50))) or r.user_id = auth.uid()
   order by r.rk
$$;

revoke all on function public.putt_daily_submit(date, int, int, int, jsonb) from public;
revoke all on function public.putt_daily_board(date, int) from public;
grant execute on function public.putt_daily_submit(date, int, int, int, jsonb) to authenticated;
grant execute on function public.putt_daily_board(date, int) to anon, authenticated;
