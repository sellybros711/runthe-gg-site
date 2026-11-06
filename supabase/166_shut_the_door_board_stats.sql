-- ---------------------------------------------------------------------------
-- 166_shut_the_door_board_stats.sql : a stat line under each name on the boards
--
-- Run AFTER 165_shut_the_door_ump_voices.sql. Safe to run more than once.
--
-- The owner's ask (2026-11-05): "The leaderboard should have some stats below
-- your name like strikes, balls, strikeouts, hits, runs."
--
-- WHY A NEW COLUMN. A stored outing is its calls (type, cell, aim, release,
-- effort), its strip and its outcome. What each pitch DID (a ball, a foul, a
-- single) comes from the engine and the day's pack, which only the page runs.
-- So the page sends the outing's box line, read off the engine's own log
-- (shut-the-door/postgame.js summary), and the server keeps it beside the row.
--
-- WHAT IS CHECKED. The shape and ranges (shutdoor_stats_ok, the same rules as
-- postgame.js valid): version 1, the ten keys and no others, whole numbers,
-- pitches equal to the row's own pitches, strikes plus balls equal to pitches,
-- no more strikeouts, walks, hit batters and hits than plate appearances. The
-- first line kept for a row stands. A row from before 166 has none, and its
-- board line stays off.
--
-- A SEPARATE CALL, ON PURPOSE. shutdoor_submit keeps its ten arguments, so a
-- page cached from before this still posts, and a page from after it still
-- posts its score if this file has not been run yet (only the line is missing).
--
-- WHAT IT ADDS
--   * shutdoor_outings.stats             jsonb, null until the page sends it
--   * shutdoor_stats_ok(stats, pitches)  the check above
--   * shutdoor_post_stats(day, stats)    the caller's daily row, once
--   * shutdoor_survivor_stats(day, run, index, stats)   one Survivor situation, once
--   * shutdoor_board                     one more column: stats
--   * shutdoor_survivor_board            one more column: stats, the run's lines
--                                        added up (null unless every one is there)
-- ONE TRANSACTION: the boards are dropped and made again, so a failure part way
-- leaves 162's boards standing.
-- ---------------------------------------------------------------------------

begin;

alter table public.shutdoor_outings add column if not exists stats jsonb;

-- the box line's shape: {v: 1, p, s, b, k, bb, h, r, hbp, pa, fps}. Each read as a number only
-- once it is one, so a string never reaches a cast
create or replace function public.shutdoor_stats_ok(p_stats jsonb, p_pitches int) returns boolean
language plpgsql immutable set search_path = public as $$
declare
  ks text[] := array['p', 's', 'b', 'k', 'bb', 'h', 'r', 'hbp', 'pa', 'fps'];
  k text; v jsonb;
  p int; s int; b int; kk int; bb int; h int; r int; hbp int; pa int; fps int;
begin
  if p_stats is null or jsonb_typeof(p_stats) <> 'object' then return false; end if;
  if jsonb_typeof(p_stats->'v') is distinct from 'number' or (p_stats->>'v') <> '1' then return false; end if;
  if exists (select 1 from jsonb_object_keys(p_stats) x where x <> 'v' and not (x = any(ks))) then return false; end if;
  foreach k in array ks loop
    v := p_stats->k;
    if v is null or jsonb_typeof(v) <> 'number' or (v #>> '{}') !~ '^[0-9]{1,3}$' then return false; end if;
  end loop;
  p := (p_stats->>'p')::int; s := (p_stats->>'s')::int; b := (p_stats->>'b')::int;
  kk := (p_stats->>'k')::int; bb := (p_stats->>'bb')::int; h := (p_stats->>'h')::int;
  r := (p_stats->>'r')::int; hbp := (p_stats->>'hbp')::int; pa := (p_stats->>'pa')::int; fps := (p_stats->>'fps')::int;
  if p < 1 or p > 150 or (p_pitches is not null and p <> p_pitches) then return false; end if;
  if s + b <> p or pa < 1 or pa > p or fps > pa or r > 99 then return false; end if;
  if kk + bb + hbp + h > pa or hbp > b or bb > b or kk > s then return false; end if;
  return true;
end $$;

-- the column holds only a line that passes, on a row of its own pitches
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'shutdoor_outings_stats_ck') then
    alter table public.shutdoor_outings add constraint shutdoor_outings_stats_ck
      check (stats is null or shutdoor_stats_ok(stats, pitches));
  end if;
end $$;

-- the caller's kept daily for a day gets its line, once. {taken}: false when it already had one
create or replace function public.shutdoor_post_stats(p_day date, p_stats jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_pitches int; n int;
begin
  if uid is null then raise exception 'sign in first'; end if;
  select o.pitches into v_pitches from shutdoor_outings o where o.user_id = uid and o.day = p_day;
  if not found then raise exception 'no outing that day'; end if;
  if not shutdoor_stats_ok(p_stats, v_pitches) then raise exception 'the stats do not match the outing'; end if;
  update shutdoor_outings set stats = p_stats where user_id = uid and day = p_day and stats is null;
  get diagnostics n = row_count;
  return json_build_object('taken', n > 0);
end $$;

-- one finished situation of the caller's run gets its line, once. The run's order and its
-- updated_at (the board's tie break) do not move. {taken}
create or replace function public.shutdoor_survivor_stats(p_day date, p_run int, p_index int, p_stats jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_entries jsonb; e jsonb;
begin
  if uid is null then raise exception 'sign in first'; end if;
  select x.entries into v_entries from shutdoor_survivor x
   where x.user_id = uid and x.day = p_day and x.run = p_run for update;
  if not found then raise exception 'no such run'; end if;
  if p_index is null or p_index < 0 or p_index >= jsonb_array_length(v_entries) then raise exception 'no such situation'; end if;
  e := v_entries->p_index;
  if e ? 'stats' then return json_build_object('taken', false); end if;
  if jsonb_typeof(e->'pitches') is distinct from 'number' or not shutdoor_stats_ok(p_stats, (e->>'pitches')::int) then
    raise exception 'the stats do not match the outing';
  end if;
  update shutdoor_survivor set entries = jsonb_set(entries, array[p_index::text, 'stats'], p_stats)
   where user_id = uid and day = p_day and run = p_run;
  return json_build_object('taken', true);
end $$;

-- the boards: 162's rows with the line on the end. The return type changes, so they are dropped
-- and made again (with their grants, as 162 has them)
drop function if exists public.shutdoor_board(date, int);
create function public.shutdoor_board(p_day date, p_limit int default 50)
returns table (rank bigint, username text, outcome text, pitches int, score int, percentile int,
               pitched_like text, strip jsonb, mine boolean, players bigint, plate text, initials text,
               stats jsonb)
language sql security definer set search_path = public stable as $$
  with r as (
    select o.*, row_number() over (order by o.score desc, o.created_at) as rk, count(*) over () as n
      from shutdoor_outings o where o.day = p_day
  )
  select r.rk, coalesce(p.username, 'Closer')::text, r.outcome, r.pitches, r.score, r.percentile,
         r.pitched_like, r.strip, r.user_id = auth.uid(), r.n,
         case when p.shutdoor_plate = any(shutdoor_unlocked(r.user_id)) then p.shutdoor_plate end,
         p.avatar_initials,
         r.stats
    from r left join profiles p on p.id = r.user_id
   where r.rk <= greatest(1, least(100, coalesce(p_limit, 50))) or r.user_id = auth.uid()
   order by r.rk
$$;

drop function if exists public.shutdoor_survivor_board(date, int);
create function public.shutdoor_survivor_board(p_day date, p_limit int default 50)
returns table (rank bigint, username text, saves int, points int, over boolean, mine boolean, players bigint,
               plate text, initials text, stats jsonb)
language sql security definer set search_path = public stable as $$
  with r as (
    select s.*, row_number() over (order by s.saves desc, s.points desc, s.updated_at) as rk, count(*) over () as n
      from shutdoor_survivor s where s.day = p_day and s.run = 0
  )
  select r.rk, coalesce(p.username, 'Closer')::text, r.saves, r.points, r.over, r.user_id = auth.uid(), r.n,
         case when p.shutdoor_plate = any(shutdoor_unlocked(r.user_id)) then p.shutdoor_plate end,
         p.avatar_initials,
         st.stats
    from r left join profiles p on p.id = r.user_id
    left join lateral (
      select case when count(*) > 0 and count(*) = count(e->'stats') then jsonb_build_object('v', 1,
               'p', sum((e->'stats'->>'p')::int), 's', sum((e->'stats'->>'s')::int), 'b', sum((e->'stats'->>'b')::int),
               'k', sum((e->'stats'->>'k')::int), 'bb', sum((e->'stats'->>'bb')::int), 'h', sum((e->'stats'->>'h')::int),
               'r', sum((e->'stats'->>'r')::int), 'hbp', sum((e->'stats'->>'hbp')::int), 'pa', sum((e->'stats'->>'pa')::int),
               'fps', sum((e->'stats'->>'fps')::int)) end as stats
        from jsonb_array_elements(r.entries) e
    ) st on true
   where r.rk <= greatest(1, least(100, coalesce(p_limit, 50))) or r.user_id = auth.uid()
   order by r.rk
$$;

revoke all on function public.shutdoor_stats_ok(jsonb, int) from public;
revoke all on function public.shutdoor_post_stats(date, jsonb) from public;
revoke all on function public.shutdoor_survivor_stats(date, int, int, jsonb) from public;
revoke all on function public.shutdoor_board(date, int) from public;
revoke all on function public.shutdoor_survivor_board(date, int) from public;
grant execute on function public.shutdoor_post_stats(date, jsonb) to authenticated;
grant execute on function public.shutdoor_survivor_stats(date, int, int, jsonb) to authenticated;
grant execute on function public.shutdoor_board(date, int) to anon, authenticated;
grant execute on function public.shutdoor_survivor_board(date, int) to anon, authenticated;

commit;
