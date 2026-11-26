-- Run The Pitch: a guest's Daily Challenge on the day's board, under a generated
-- name, with no Supabase anonymous sign-in. Run once in the Supabase SQL editor.
-- Idempotent: safe to re-run. Order: after 12_daily_challenge.sql and 02 (wc_players).
--
-- WHY
-- Guests make 45% of the game's drafts and could not play the Daily, its one
-- daily hook. The owner's call (2026-11-26): "I want a guest to get a generated
-- name 'Dragontail52' 'SillyShortstop46'. If they create an account, it will
-- remember the games they played and change the spot on that leaderboard."
-- Anonymous sign-ins stay off (QA's audit, see 185), so this is 185's shape: the
-- page posts to a Cloudflare Function (functions/api/pitch-guest.js) that holds
-- the service role, derives the guest's id from a device id with a server
-- secret, keys the caller's IP with the same secret, and calls the functions
-- below. Nothing here is callable by anon or authenticated.
--
-- WHY ITS OWN TABLE
-- daily_results.user_id references auth.users(id) on delete cascade, and account
-- deletion relies on that cascade, so a guest's uuid cannot go there (QA's design
-- check, 2026-11-26). Guest days live in soccer_daily_guest. The board reads
-- daily_board, a view of both. A claim moves the days into daily_results.
--
--   1. _soccer_squad_overall(ids): the Daily's score, one copy. submit_daily (12)
--      now calls it too, so an account and a guest are scored by the same code.
--   2. soccer_guest_name(guest): "SillyStriker46". Two words run together and two
--      digits, never a name an account holds.
--   3. soccer_daily_guest (+ soccer_daily_guest_posts, the per-IP cap).
--   4. soccer_daily_guest_submit(...): eleven distinct known players, the score
--      the server's, the day the server's UTC day, the first attempt kept, at
--      most 3 new rows a day from one IP key.
--   5. soccer_daily_guest_claim(account, guest): the guest's days the account has
--      no row for move onto the account under its name; the rest are dropped;
--      the streak is rebuilt from the dates.
--   6. daily_board: accounts and guests on one board.
--
-- WHAT IT DOES NOT DO
-- A guest gets no auth user, profile, streak, badge, stat or cosmetic: 13, 14 and
-- 19 read daily_results by account and never see this table. Guests enter no
-- contest (186 guards those tables; nothing here writes them).

-- ---------- 1) the Daily's score, one copy ---------------------------------------
-- avg(wc_overall) + 0.15 per 99, times 1.005 per captain and 1.02 per award: the
-- same sum submit_daily has always done. Raises on anything but 11 distinct
-- known players.
create or replace function public._soccer_squad_overall(p_player_ids text[])
returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  n_ids      int := coalesce(cardinality(p_player_ids), 0);
  n_distinct int := coalesce(cardinality(array(select distinct unnest(p_player_ids))), 0);
  n_found    int;
  v_avg      numeric;
  v_num99    int;
  v_caps     int;
  v_awards   int;
begin
  if n_ids <> 11 then raise exception 'daily needs 11 players, got %', n_ids; end if;
  if n_ids <> n_distinct then raise exception 'duplicate players not allowed'; end if;
  select count(*),
         avg(wc_overall),
         count(*) filter (where wc_overall >= 99),
         count(*) filter (where is_captain),
         coalesce(sum(coalesce(array_length(string_to_array(nullif(award,''),'|'),1),0)),0)
    into n_found, v_avg, v_num99, v_caps, v_awards
    from wc_players
   where player_id = any(p_player_ids);
  if n_found <> n_ids then
    raise exception 'unknown player id(s): % of % matched', n_found, n_ids;
  end if;
  return round(round(v_avg + v_num99 * 0.15, 1) * power(1.005, v_caps) * power(1.02, v_awards), 1);
end $$;

revoke all on function public._soccer_squad_overall(text[]) from public, anon, authenticated;

-- submit_daily (12), unchanged in what it does: its score now comes from the
-- function above instead of its own copy of the sum.
create or replace function submit_daily(
  p_player_ids text[],
  p_progress   int,
  p_result     text   default null,
  p_furthest   text   default null,
  p_slots      text[] default null,
  p_theme      text   default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  n_ids      int := coalesce(cardinality(p_player_ids), 0);
  v_overall  numeric;
  v_prog     int  := greatest(0, least(6, coalesce(p_progress, 0)));
  v_user     uuid := auth.uid();
  v_today    date := (now() at time zone 'utc')::date;
  v_name     text;
  v_flag     text;
  v_id       bigint;
  v_last     date;
  v_cur      int;
  v_long     int;
begin
  if v_user is null then raise exception 'must be signed in'; end if;

  v_overall := public._soccer_squad_overall(p_player_ids);

  select username::text, nullif(flag,'') into v_name, v_flag
    from profiles where id = v_user;

  insert into daily_results (user_id, date, theme_id, overall, progress, result,
                             furthest, player_ids, slots, name, flag)
  values (v_user, v_today, p_theme, v_overall, v_prog, p_result, p_furthest,
          p_player_ids,
          case when coalesce(cardinality(p_slots),0) = n_ids then p_slots else null end,
          v_name, v_flag)
  on conflict (user_id, date) do nothing
  returning id into v_id;

  -- Streak only moves on the FIRST completion of the day (v_id is not null).
  if v_id is not null then
    select last_played_date, current_streak, longest_streak
      into v_last, v_cur, v_long
      from profiles where id = v_user for update;
    if v_last = v_today then
      null;                                   -- already counted (defensive)
    elsif v_last = v_today - 1 then
      v_cur := coalesce(v_cur, 0) + 1;        -- consecutive day: extend
    else
      v_cur := 1;                             -- gap (or first ever): restart
    end if;
    v_long := greatest(coalesce(v_long, 0), v_cur);
    update profiles
       set current_streak = v_cur,
           longest_streak = v_long,
           last_played_date = v_today
     where id = v_user;
  end if;

  return v_id;  -- null: today's attempt was already on record
end;
$$;

revoke all on function submit_daily(text[], int, text, text, text[], text) from public;
grant  execute on function submit_daily(text[], int, text, text, text[], text) to authenticated;

-- ---------- 2) a guest's name ------------------------------------------------------
-- The owner's shape: two words run together and two digits ("SillyStriker46").
-- Derived from the guest id, so one device keeps one name. p_salt steps to the
-- next name when an account already holds the first.
create or replace function public.soccer_guest_name(p_guest uuid, p_salt int default 0)
returns text
language sql immutable as $$
  select (array['Silly','Golden','Lucky','Swift','Sneaky','Mighty','Clever','Brave',
                'Cosmic','Fancy','Jolly','Rapid','Royal','Sunny','Turbo','Wild',
                'Dizzy','Electric','Frosty','Gritty','Happy','Iron','Jumbo','Magic',
                'Noble','Proud','Quick','Rowdy','Salty','Thunder','Velvet','Zesty'])[(n % 32) + 1]
      || (array['Striker','Keeper','Sweeper','Winger','Captain','Dragontail','Volley','Nutmeg',
                'Header','Tackle','Dribbler','Poacher','Playmaker','Fullback','Libero','Gaffer',
                'Corner','Crossbar','Hattrick','Backheel','Rabona','Stepover','Panenka','Screamer',
                'Tekkers','Rocket','Falcon','Tiger','Wizard','Maestro','Shortstop','Comet'])[((n / 32) % 32) + 1]
      || lpad((((n / 1024) + coalesce(p_salt, 0) * 7) % 90 + 10)::text, 2, '0')
  from (select ('x' || substr(md5(p_guest::text), 1, 7))::bit(28)::int as n) t;
$$;

revoke all on function public.soccer_guest_name(uuid, int) from public, anon, authenticated;

-- ---------- 3) the guest table and the per-IP cap ----------------------------------
create table if not exists public.soccer_daily_guest (
  id          bigint generated always as identity primary key,
  guest       uuid not null,                 -- HMAC(server secret, device id). No account has it. No foreign key.
  date        date not null,                 -- the UTC challenge day (server-set)
  theme_id    text,
  overall     numeric(5,1) not null,
  progress    int  not null default 0,
  result      text,
  furthest    text,
  player_ids  text[],
  slots       text[],
  name        text not null,                 -- the generated name
  created_at  timestamptz not null default now(),
  unique (guest, date)                       -- first attempt of the day wins
);
create index if not exists soccer_daily_guest_board_idx
  on public.soccer_daily_guest (date, overall desc, progress desc, created_at asc);
alter table public.soccer_daily_guest enable row level security;
revoke all on public.soccer_daily_guest from public, anon, authenticated;

create table if not exists public.soccer_daily_guest_posts (
  ip_key text    not null,                   -- HMAC of the caller's IP. The raw IP is never stored.
  day    date    not null,
  n      integer not null default 0,
  primary key (ip_key, day)
);
alter table public.soccer_daily_guest_posts enable row level security;
revoke all on public.soccer_daily_guest_posts from public, anon, authenticated;

-- ---------- 4) a guest's Daily ------------------------------------------------------
create or replace function public.soccer_daily_guest_submit(
  p_guest uuid, p_ip_key text, p_player_ids text[], p_progress int,
  p_result text default null, p_furthest text default null,
  p_slots text[] default null, p_theme text default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_today   date := (now() at time zone 'utc')::date;
  v_overall numeric;
  v_prog    int := greatest(0, least(6, coalesce(p_progress, 0)));
  v_name    text;
  v_id      bigint;
  v_n       integer;
  v_salt    int := 0;
begin
  if p_guest is null then raise exception 'no guest'; end if;
  if p_ip_key is null or length(p_ip_key) < 16 then raise exception 'no ip key'; end if;
  -- a guest id is never an account's: that day is the account's to write
  if exists (select 1 from auth.users where id = p_guest) then raise exception 'not a guest'; end if;

  -- the score is the server's, from the eleven ids (raises on a bad squad)
  v_overall := public._soccer_squad_overall(p_player_ids);

  -- only the words the game itself files; anything else is dropped, not stored
  if p_result is not null and p_result not in ('World Cup Winners','Runners-up','Third Place','Fourth Place',
       'Semi-Finalists','Quarter-Finalists','Round of 16','Round of 32','Group Stage Exit') then p_result := null; end if;
  if p_furthest is not null and p_furthest not in ('Group Stage','Round of 32','Round of 16','Quarter-final',
       'Semi-final','Final') then p_furthest := null; end if;
  if p_theme is not null and (length(p_theme) > 40 or p_theme !~ '^[A-Za-z0-9 ]+$') then p_theme := null; end if;
  if coalesce(cardinality(p_slots), 0) <> 11
     or exists (select 1 from unnest(p_slots) s where s is null or s not in ('GK','DEF','MID','FWD','FLEX')) then
    p_slots := null;
  end if;

  -- First attempt kept: a second post the same day changes nothing and costs
  -- nothing against the cap.
  select id, name into v_id, v_name from soccer_daily_guest where guest = p_guest and date = v_today;
  if v_id is not null then
    return json_build_object('id', v_id, 'name', v_name, 'first', false);
  end if;

  -- At most 3 new guest rows a day from one IP key. The exception rolls the
  -- count back with everything else.
  insert into soccer_daily_guest_posts (ip_key, day, n) values (p_ip_key, v_today, 1)
    on conflict (ip_key, day) do update set n = soccer_daily_guest_posts.n + 1
    returning n into v_n;
  if v_n > 3 then raise exception 'guest limit'; end if;
  delete from soccer_daily_guest_posts where day < v_today - 2;
  -- Guests never sign in, so their rows would pile up for ever: unclaimed days
  -- past 60 are pruned as new ones arrive.
  delete from soccer_daily_guest where date < v_today - 60;

  -- one device, one name; step past any name an account holds
  select coalesce((select name from soccer_daily_guest where guest = p_guest order by date desc limit 1), null) into v_name;
  if v_name is null then
    loop
      v_name := public.soccer_guest_name(p_guest, v_salt);
      exit when v_salt >= 20 or not exists (select 1 from profiles where lower(username::text) = lower(v_name));
      v_salt := v_salt + 1;
    end loop;
  end if;

  insert into soccer_daily_guest (guest, date, theme_id, overall, progress, result, furthest, player_ids, slots, name)
  values (p_guest, v_today, p_theme, v_overall, v_prog, p_result, p_furthest, p_player_ids, p_slots, v_name)
  on conflict (guest, date) do nothing
  returning id into v_id;
  if v_id is null then   -- a second post raced the first
    select id, name into v_id, v_name from soccer_daily_guest where guest = p_guest and date = v_today;
    return json_build_object('id', v_id, 'name', v_name, 'first', false);
  end if;

  return json_build_object('id', v_id, 'name', v_name, 'first', true);
end $$;

revoke all on function public.soccer_daily_guest_submit(uuid, text, text[], int, text, text, text[], text) from public, anon, authenticated;
grant execute on function public.soccer_daily_guest_submit(uuid, text, text[], int, text, text, text[], text) to service_role;

-- ---------- 5) the guest's days follow the device onto an account -----------------
create or replace function public.soccer_daily_guest_claim(p_account uuid, p_guest uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_name  text;
  v_flag  text;
  v_moved integer := 0;
  v_last  date;
  v_cur   int;
  v_long  int;
begin
  if p_account is null or p_guest is null or p_account = p_guest then return json_build_object('moved', 0); end if;
  if not exists (select 1 from auth.users where id = p_account) then raise exception 'no account'; end if;
  if exists (select 1 from auth.users where id = p_guest) then return json_build_object('moved', 0); end if;
  if not exists (select 1 from soccer_daily_guest where guest = p_guest) then return json_build_object('moved', 0); end if;

  select username::text, nullif(flag,'') into v_name, v_flag from profiles where id = p_account;

  -- Only days the account has no row for: the account's own first attempt wins.
  -- The row keeps its score and its time, so it keeps its spot, under the account's name.
  insert into daily_results (user_id, date, theme_id, overall, progress, result, furthest, player_ids, slots, name, flag, created_at)
  select p_account, g.date, g.theme_id, g.overall, g.progress, g.result, g.furthest, g.player_ids, g.slots, v_name, v_flag, g.created_at
    from soccer_daily_guest g
   where g.guest = p_guest
  on conflict (user_id, date) do nothing;
  get diagnostics v_moved = row_count;
  delete from soccer_daily_guest where guest = p_guest;

  -- The streak, rebuilt from the days the account now holds (as 185 does): the
  -- run of consecutive days ending at its latest day, and the longest run ever.
  if v_moved > 0 then
    select max(d) , max(len) filter (where isl_end = max_d), max(len)
      into v_last, v_cur, v_long
      from (
        select d, max_d,
               count(*) over (partition by isl) as len,
               max(d)   over (partition by isl) as isl_end
          from (
            select date as d,
                   date - (row_number() over (order by date))::int as isl,
                   max(date) over () as max_d
              from (select distinct date from daily_results where user_id = p_account) x
          ) s
      ) t;
    update profiles
       set current_streak   = coalesce(v_cur, 1),
           longest_streak   = greatest(coalesce(longest_streak, 0), coalesce(v_long, 1)),
           last_played_date = v_last
     where id = p_account;
  end if;

  return json_build_object('moved', v_moved);
end $$;

revoke all on function public.soccer_daily_guest_claim(uuid, uuid) from public, anon, authenticated;
grant execute on function public.soccer_daily_guest_claim(uuid, uuid) to service_role;

-- ---------- 6) one board: accounts and guests --------------------------------------
-- The page reads this for the day's list and for its rank counts. A guest row's
-- id is negative, so it never collides with an account row's. The guest uuid is
-- not shown. The view runs as its owner on purpose: it is the only window onto
-- soccer_daily_guest, and it shows board columns only.
create or replace view public.daily_board as
  select r.id, r.date, r.name, r.flag, r.overall, r.progress, r.result, r.furthest,
         r.player_ids, r.slots, r.created_at, false as guest
    from public.daily_results r
  union all
  select -g.id, g.date, g.name, null::text, g.overall, g.progress, g.result, g.furthest,
         g.player_ids, g.slots, g.created_at, true
    from public.soccer_daily_guest g;

grant select on public.daily_board to anon, authenticated;

notify pgrst, 'reload schema';
