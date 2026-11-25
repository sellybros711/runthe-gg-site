-- Run The Arcade: a guest's run on the daily board, with no Supabase anonymous
-- sign-in. Run once in the Supabase SQL editor. Idempotent: safe to re-run.
-- Order: after 131_arcade_generated_names.sql (the name every guest row is
-- filed under) and 125 (grid_submit_run's rules, repeated here).
--
-- WHY
-- 132 put guests on the board through Supabase's anonymous sign-ins. QA's audit
-- (2026-11-23) found that switch would hand anyone a scriptable stream of
-- `authenticated` sessions, and 115 writing functions check only that
-- auth.uid() is not null: Fantasy entries, referrals, votes, usernames, a fresh
-- daily allowance per session. So anonymous sign-ins stay off, and 132's two
-- functions go unused.
--
-- INSTEAD
-- The page posts a guest's finished run to a Cloudflare Function
-- (functions/api/arcade-guest.js). The Function, holding the service role,
-- derives the guest's id from a random device id with a server secret, keys
-- the caller's IP with the same secret (the raw IP is never stored), and calls
-- arcade_guest_submit below. Nothing here is callable by anon or authenticated,
-- so no browser can reach it except through the Function.
--
--   1. arcade_guest_posts: new guest rows per IP key per day. No policies.
--   2. arcade_guest_submit(...): the four free games only, the same bounds and
--      score formula as grid_submit_run (125), never a row that belongs to a
--      real account, at most 12 new rows a day from one IP key, and the better
--      score kept. No streak row: a guest's streak lives on the device.
--   3. arcade_guest_claim(account, guest): when that device signs in, the
--      guest's days move onto the account (only days the account has no row
--      for), and the account's streaks are rebuilt from the dates it now holds.
--
-- WHAT IT DOES NOT DO
-- No auth user, no profile and no ticket row is ever made for a guest. A guest
-- row's user_id is a uuid no account has (grid_runs.user_id has no foreign key).

-- ---------- 1) the per-IP cap ---------------------------------------------------
create table if not exists public.arcade_guest_posts (
  ip_key text    not null,
  day    date    not null,
  n      integer not null default 0,
  primary key (ip_key, day)
);
alter table public.arcade_guest_posts enable row level security;
revoke all on public.arcade_guest_posts from public, anon, authenticated;

-- ---------- 2) a guest's run -----------------------------------------------------
create or replace function public.arcade_guest_submit(
  p_guest uuid, p_ip_key text, p_game text, p_date date,
  p_seconds integer, p_mistakes integer, p_reveals integer, p_run_len integer default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_cap  integer;
  v_base text;
  v_new  integer;
  v_old  integer;
  v_id   bigint;
  v_n    integer;
begin
  if p_guest is null then raise exception 'no guest'; end if;
  if p_ip_key is null or length(p_ip_key) < 16 then raise exception 'no ip key'; end if;
  -- a guest id is never an account's: that row is the account's to write
  if exists (select 1 from auth.users where id = p_guest) then raise exception 'not a guest'; end if;
  if not (p_game = any (public.arcade_free_games())) then raise exception 'not a free game'; end if;
  v_base := p_game;
  if p_seconds is null or p_seconds < 0 or p_seconds >= 86400 then raise exception 'bad time'; end if;
  if p_date is null or p_date < current_date - 1 or p_date > current_date + 1 then
    raise exception 'bad date';
  end if;

  p_mistakes := greatest(0, least(20, coalesce(p_mistakes, 0)));
  p_reveals  := greatest(0, least(60, coalesce(p_reveals,  0)));

  -- 125's caps and floors, for the four free games
  v_cap := case v_base
    when 'almamater'    then 999
    when 'career'       then 200
    when 'sportegories' then 30
    else 0 end;
  if v_cap > 0 then
    p_run_len := greatest(0, least(v_cap, coalesce(p_run_len, 0)));
    if v_base <> 'sportegories' and p_run_len >= 8 and p_seconds < ceil(p_run_len * 0.4) then
      raise exception 'implausible run';
    end if;
  else
    p_run_len := null;
    if p_seconds < 3 then raise exception 'implausible time'; end if;
  end if;

  v_new := case when p_run_len is not null
                then 1000000 - p_run_len * 1000 + least(p_seconds, 999)
                else p_seconds + p_mistakes * 10 + p_reveals * 15 end;

  select score into v_old from grid_runs
   where user_id = p_guest and game = p_game and puzzle_date = p_date;

  -- Only a new row counts against the IP's day. Improving a row already on the
  -- board does not. The cap's exception rolls the count back with everything else.
  if v_old is null then
    insert into arcade_guest_posts (ip_key, day, n) values (p_ip_key, current_date, 1)
      on conflict (ip_key, day) do update set n = arcade_guest_posts.n + 1
      returning n into v_n;
    if v_n > 12 then raise exception 'guest limit'; end if;
    delete from arcade_guest_posts where day < current_date - 2;
  end if;

  -- display_name stays null: 131's trigger files it under the generated name,
  -- the same string the page derives from the guest id.
  insert into grid_runs (user_id, game, puzzle_date, base_seconds, mistakes, reveals,
                         run_len, display_name, flawless)
  values (p_guest, p_game, p_date, p_seconds, p_mistakes, p_reveals,
          p_run_len, null, (p_mistakes = 0 and p_reveals = 0))
  on conflict (user_id, game, puzzle_date) do update
    set base_seconds = excluded.base_seconds, mistakes = excluded.mistakes,
        reveals      = excluded.reveals,      run_len  = excluded.run_len,
        flawless     = excluded.flawless
    where grid_runs.score > v_new
  returning id into v_id;

  if v_id is null then
    select id into v_id from grid_runs
     where user_id = p_guest and game = p_game and puzzle_date = p_date;
  end if;

  return json_build_object('id', v_id);
end $$;

revoke all on function public.arcade_guest_submit(uuid, text, text, date, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.arcade_guest_submit(uuid, text, text, date, integer, integer, integer, integer) to service_role;

-- ---------- 3) the guest's days follow the device onto an account ---------------
create or replace function public.arcade_guest_claim(p_account uuid, p_guest uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_name  text;
  v_moved integer := 0;
  v_games text[];
  r       record;
begin
  if p_account is null or p_guest is null or p_account = p_guest then return json_build_object('moved', 0); end if;
  if not exists (select 1 from auth.users where id = p_account) then raise exception 'no account'; end if;
  if exists (select 1 from auth.users where id = p_guest) then return json_build_object('moved', 0); end if;

  v_games := array(select distinct game from grid_runs where user_id = p_guest);
  if coalesce(array_length(v_games, 1), 0) = 0 then return json_build_object('moved', 0); end if;

  select username into v_name from profiles where id = p_account;

  update grid_runs g
     set user_id = p_account, display_name = v_name
   where g.user_id = p_guest
     and not exists (select 1 from grid_runs a
                      where a.user_id = p_account and a.game = g.game and a.puzzle_date = g.puzzle_date);
  get diagnostics v_moved = row_count;
  delete from grid_runs where user_id = p_guest;

  -- 132's streak rebuild: from the dates the account now holds, per game moved
  for r in
    select game,
           max(puzzle_date) as last_date,
           max(isl_len)     as longest,
           max(isl_len) filter (where isl_end = max_date) as current_len
      from (
        select game, puzzle_date, max_date,
               count(*) over (partition by game, isl) as isl_len,
               max(puzzle_date) over (partition by game, isl) as isl_end
          from (
            select game, puzzle_date,
                   puzzle_date - (row_number() over (partition by game order by puzzle_date))::int as isl,
                   max(puzzle_date) over (partition by game) as max_date
              from (select distinct game, puzzle_date from grid_runs where user_id = p_account) d
          ) s
      ) t
     where game = any (v_games)
     group by game
  loop
    insert into grid_streaks (user_id, game, streak, best_streak, last_date)
    values (p_account, r.game, coalesce(r.current_len, 1), r.longest, r.last_date)
    on conflict (user_id, game) do update
      set streak      = excluded.streak,
          best_streak = greatest(grid_streaks.best_streak, excluded.best_streak),
          last_date   = excluded.last_date,
          updated_at  = now();
  end loop;

  return json_build_object('moved', v_moved);
end $$;

revoke all on function public.arcade_guest_claim(uuid, uuid) from public, anon, authenticated;
grant execute on function public.arcade_guest_claim(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
