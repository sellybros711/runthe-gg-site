-- ---------------------------------------------------------------------------
-- 125_baseball_profiles.sql : Run The Diamond profiles, held by the server
--
--   psql ... -f supabase/125_baseball_profiles.sql
--
-- Needs 10 (profiles) and 97 (rtd_runs). Safe to run more than once.
--
-- TWO TABLES, and the reason for each is the owner's instruction in as many
-- words: run it through the server, so a player never loses anything.
--
--   rtd_profiles   what the player CHOSE: a club, two initials, a mark, a
--                  ballpark, plus the rank and ring their cabinet has earned.
--                  Public to read, because every board row draws the circle.
--   rtd_career     what the player PLAYED: every finished season as the page's
--                  own compact row. Private to its owner. Every badge, every
--                  career number, every club rung and every ballpark unlock is
--                  derived from these rows, so this table IS the cabinet.
--
-- Before this file, both lived in the browser alone (localStorage), which loses
-- them to clearing site data, a private window, iOS evicting a site nobody has
-- opened in a week, and a second phone. None of those throws. The only symptom
-- is an empty trophy case somebody spent a summer filling.
--
-- NOTHING IS EVER OVERWRITTEN. The career is MERGED: a season a device sends is
-- added if the server does not have it and ignored if it does, so two devices
-- that each played seasons the other never saw both keep everything. That is
-- hoops' cloud save argument (a career is not one run at two points, it is two
-- sets of runs), held here in SQL rather than in the page.
--
-- WHAT THE SERVER DOES NOT CHECK, said plainly. The badges are derived in the
-- page from the career, and plpgsql cannot run achievements.js, so a mark or a
-- rank the page sends is checked for SHAPE (one of the known ids) and not for
-- whether the badge behind it is earned. It is the same trust the NFL crest
-- makes (ps_set_crest), and it is enough for a circle, which decides nothing.
-- ---------------------------------------------------------------------------

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. What the player chose
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.rtd_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  club       text,                -- one of the thirty playing today, or null
  initials   text,                -- one or two of A-Z 0-9, or null for the name's
  mark       text,                -- the shape inside the circle
  park       text,                -- the ballpark the draft is played on
  tier       text,                -- the rank seal, from the badge count
  ring       text,                -- the honour ring, from the titles
  rung       smallint,            -- how far up the chosen club's ladder: 1 to 3
  updated_at timestamptz not null default now(),
  constraint rtd_profiles_club_ck check (club is null or club in (
    'ARI','ATH','ATL','BAL','BOS','CHC','CHW','CIN','CLE','COL',
    'DET','HOU','KCR','LAA','LAD','MIA','MIL','MIN','NYM','NYY',
    'PHI','PIT','SDP','SEA','SFG','STL','TBR','TEX','TOR','WSN')),
  constraint rtd_profiles_initials_ck check (initials is null or initials ~ '^[A-Z0-9]{1,2}$'),
  constraint rtd_profiles_mark_ck check (mark is null or mark in (
    'init','ball','pennant','diamond','cap','bats','glove','plate','flame',
    'trophy','rings','star','crown')),
  constraint rtd_profiles_park_ck check (park is null or park in (
    'home','cornfield','ivy','warehouse','ravine','fountains','bayside',
    'milehigh','frieze','monster','horseshoe','dome','neon')),
  constraint rtd_profiles_tier_ck check (tier is null or tier in (
    'bronze1','bronze2','bronze3','silver1','silver2','silver3',
    'gold1','gold2','gold3','goat')),
  constraint rtd_profiles_ring_ck check (ring is null or ring in ('club','gold','btb','perfect')),
  constraint rtd_profiles_rung_ck check (rung is null or rung between 0 and 3)
);
-- A table created by an earlier copy of this file has no rung, and `create table if not
-- exists` skips the whole statement, so the column is added on its own as well.
alter table public.rtd_profiles add column if not exists rung smallint;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'rtd_profiles_rung_ck') then
    alter table public.rtd_profiles add constraint rtd_profiles_rung_ck check (rung is null or rung between 0 and 3);
  end if;
end $$;

alter table public.rtd_profiles enable row level security;

-- Everybody reads, because a board row draws the circle of whoever filed it.
-- It publishes a club, two letters and a shape: nothing a player typed but the
-- letters, and those are held to two characters of A-Z and 0-9.
drop policy if exists "rtd_profiles read" on public.rtd_profiles;
create policy "rtd_profiles read" on public.rtd_profiles for select using (true);
revoke all on public.rtd_profiles from anon, authenticated;
grant select on public.rtd_profiles to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. What the player played
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.rtd_career (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  rows       jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint rtd_career_rows_ck check (jsonb_typeof(rows) = 'array')
);

alter table public.rtd_career enable row level security;

-- Your own and nobody else's: a career is every roster somebody drafted.
drop policy if exists "rtd_career read own" on public.rtd_career;
create policy "rtd_career read own" on public.rtd_career
  for select using (auth.uid() = user_id);
revoke all on public.rtd_career from anon, authenticated;
grant select on public.rtd_career to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. rtd_set_profile(): the one writer of the choices
-- ─────────────────────────────────────────────────────────────────────────────
-- NULL MEANS LEAVE IT ALONE and the empty string means clear it. So changing the
-- mark never has to resend the club, and a page a version behind that knows
-- nothing about ballparks cannot wipe the park by leaving it out.
-- The rung is the club ladder (1 played it, 2 reached October with it, 3 won the
-- World Series with it). It is stored so a board row can draw somebody ELSE'S
-- circle at the rung they have earned, which nobody but them can derive.
drop function if exists public.rtd_set_profile(text,text,text,text,text,text);
create or replace function public.rtd_set_profile(
  p_club text default null, p_initials text default null, p_mark text default null,
  p_park text default null, p_tier text default null, p_ring text default null,
  p_rung int default null)
returns public.rtd_profiles
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.rtd_profiles;
begin
  if v_uid is null then raise exception 'sign in to save your profile'; end if;
  insert into public.rtd_profiles (user_id) values (v_uid) on conflict (user_id) do nothing;
  update public.rtd_profiles set
    club     = case when p_club     is null then club     else nullif(p_club, '') end,
    initials = case when p_initials is null then initials else nullif(upper(p_initials), '') end,
    mark     = case when p_mark     is null then mark     else nullif(p_mark, '') end,
    park     = case when p_park     is null then park     else nullif(p_park, '') end,
    tier     = case when p_tier     is null then tier     else nullif(p_tier, '') end,
    ring     = case when p_ring     is null then ring     else nullif(p_ring, '') end,
    rung     = case when p_rung     is null then rung     else p_rung end,
    updated_at = now()
  where user_id = v_uid
  returning * into v_row;
  return v_row;
end $$;
revoke all on function public.rtd_set_profile(text,text,text,text,text,text,int) from public;
grant execute on function public.rtd_set_profile(text,text,text,text,text,text,int) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. rtd_career_merge(): the one writer of the career, and it only adds
-- ─────────────────────────────────────────────────────────────────────────────
-- A season is identified by `ts`, the millisecond the page filed it. Two devices
-- cannot file one season, and one device cannot file two in one millisecond, so
-- the key is the season. A row already held is never replaced: what the server
-- first heard about a season is what it keeps.
--
-- Every row is stamped with the caller's id as `u`, whatever the page sent. The
-- page's cabinet reads only rows whose `u` is the account signed in, so a row
-- claiming another account would be invisible anyway; stamping it means a row
-- can never be filed under somebody else.
--
-- THE CAP IS 1000 SEASONS, the newest kept. The deepest badge counts 250, and a
-- thousand seasons at about a kilobyte each is a megabyte, which is the most a
-- read of one row should cost. The page's own cache keeps the same number.
--
-- Returns the whole merged career, so a device that has just sent its seasons
-- comes back holding every other device's too, in one round trip.
create or replace function public.rtd_career_merge(p_rows jsonb default '[]'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_have jsonb;
  v_out  jsonb;
begin
  if v_uid is null then raise exception 'sign in to keep your career'; end if;
  if p_rows is null then p_rows := '[]'::jsonb; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be an array'; end if;
  if jsonb_array_length(p_rows) > 1000 then raise exception 'too many rows at once'; end if;
  if octet_length(p_rows::text) > 2500000 then raise exception 'rows too large'; end if;

  insert into public.rtd_career (user_id) values (v_uid) on conflict (user_id) do nothing;
  select rows into v_have from public.rtd_career where user_id = v_uid for update;

  with incoming as (
    select jsonb_set(r, '{u}', to_jsonb(v_uid::text)) as r, (r->>'ts')::bigint as ts
    from jsonb_array_elements(p_rows) as r
    where jsonb_typeof(r) = 'object'
      and (r->>'ts') ~ '^[0-9]{10,15}$'
  ),
  held as (
    select r, (r->>'ts')::bigint as ts from jsonb_array_elements(v_have) as r
  ),
  unioned as (
    select distinct on (ts) r, ts, pri from (
      select r, ts, 0 as pri from held
      union all
      select r, ts, 1 as pri from incoming
    ) x
    order by ts, pri
  ),
  kept as (
    select r, ts from unioned order by ts desc limit 1000
  )
  select coalesce(jsonb_agg(r order by ts), '[]'::jsonb) into v_out from kept;

  update public.rtd_career set rows = v_out, updated_at = now() where user_id = v_uid;
  return v_out;
end $$;
revoke all on function public.rtd_career_merge(jsonb) from public;
grant execute on function public.rtd_career_merge(jsonb) to authenticated;
