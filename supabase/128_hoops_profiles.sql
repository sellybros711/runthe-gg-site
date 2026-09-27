-- ---------------------------------------------------------------------------
-- 128_hoops_profiles.sql : Run The Floor profiles, held by the server
--
--   psql ... -f supabase/128_hoops_profiles.sql
--
-- Needs 10 (profiles). Safe to run more than once.
--
-- The owner's instruction, in as many words: everything is attached to the
-- profile and the server, not the device. The career, the run in progress, the
-- daily and every mode's progress already ride in ps_saves (103) under the game
-- 'rtf'. What was left in the browser alone is what the player CHOSE: a jersey
-- and its number, the arena the draft is played in, the camera, the last club
-- and decade picked, and whether the first-time guide has been seen. This table
-- is those, one row an account.
--
-- PUBLIC TO READ, because a jersey is a thing other players see: a board row
-- can draw the jersey of whoever filed it. It publishes a club code, a number
-- of one or two digits and a few ids from fixed lists. Nothing a player typed
-- but the number, and the number is held to two digits.
--
-- WHAT THE SERVER DOES NOT CHECK, said plainly. The arenas and the club colors
-- are earned off the career, and plpgsql cannot run hoops/courts.js, so what is
-- sent is checked for SHAPE (one of the known ids) and not for whether it has
-- been earned. The page falls back to the home arena and the house colors for
-- anything the account cannot back, so a forged choice changes one thing: what
-- that account's own screen draws. baseball (127) and the NFL crest make the
-- same trade.
-- ---------------------------------------------------------------------------

create table if not exists public.rtf_profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  jersey_club text,           -- a club playing today, or 'house' or null for the house colors
  jersey_num  text,           -- one or two digits
  arena       text,           -- the arena the courts are drawn in
  camera      text,           -- 'tq' three-quarter or 'top' overhead
  last_club   text,           -- the One Franchise door's club
  last_era    text,           -- the Decades door's decade
  guide_seen  boolean,        -- the first-time guide has been dismissed
  updated_at  timestamptz not null default now(),
  constraint rtf_profiles_club_ck check (jersey_club is null or jersey_club in (
    'house','ATL','BOS','BRK','CHO','CHI','CLE','DAL','DEN','DET','GSW',
    'HOU','IND','LAC','LAL','MEM','MIA','MIL','MIN','NOP','NYK',
    'OKC','ORL','PHI','PHO','POR','SAC','SAS','TOR','UTA','WAS')),
  constraint rtf_profiles_num_ck check (jersey_num is null or jersey_num ~ '^[0-9]{1,2}$'),
  constraint rtf_profiles_arena_ck check (arena is null or arena in (
    'home','rec','blacktop','parquet','sunset','fieldhouse','boardwalk',
    'altitude','rooftop','cathedral','banners','neon','glass')),
  constraint rtf_profiles_camera_ck check (camera is null or camera in ('tq','top')),
  constraint rtf_profiles_last_club_ck check (last_club is null or last_club ~ '^[A-Z]{2,4}$'),
  constraint rtf_profiles_last_era_ck check (last_era is null or last_era in (
    'seventies','eighties','nineties','aughts','tens','twenties'))
);

alter table public.rtf_profiles enable row level security;

drop policy if exists "rtf_profiles read" on public.rtf_profiles;
create policy "rtf_profiles read" on public.rtf_profiles for select using (true);
revoke all on public.rtf_profiles from anon, authenticated;
grant select on public.rtf_profiles to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- rtf_set_profile(): the one writer
-- ─────────────────────────────────────────────────────────────────────────────
-- NULL MEANS LEAVE IT ALONE and the empty string means clear it. So changing the
-- camera never resends the jersey, and a page a version behind that knows
-- nothing about a column added later cannot wipe it by leaving it out.
-- Returns the whole row, so a device that has just written holds the answer.
create or replace function public.rtf_set_profile(
  p_club text default null, p_num text default null, p_arena text default null,
  p_camera text default null, p_last_club text default null, p_last_era text default null,
  p_guide boolean default null)
returns public.rtf_profiles
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.rtf_profiles;
begin
  if v_uid is null then raise exception 'sign in to save your profile'; end if;
  insert into public.rtf_profiles (user_id) values (v_uid) on conflict (user_id) do nothing;
  update public.rtf_profiles set
    jersey_club = case when p_club      is null then jersey_club else nullif(p_club, '') end,
    jersey_num  = case when p_num       is null then jersey_num  else nullif(p_num, '') end,
    arena       = case when p_arena     is null then arena       else nullif(p_arena, '') end,
    camera      = case when p_camera    is null then camera      else nullif(p_camera, '') end,
    last_club   = case when p_last_club is null then last_club   else nullif(upper(p_last_club), '') end,
    last_era    = case when p_last_era  is null then last_era    else nullif(p_last_era, '') end,
    guide_seen  = coalesce(p_guide, guide_seen),
    updated_at  = now()
  where user_id = v_uid
  returning * into v_row;
  return v_row;
end $$;
revoke all on function public.rtf_set_profile(text,text,text,text,text,text,boolean) from public;
grant execute on function public.rtf_set_profile(text,text,text,text,text,text,boolean) to authenticated;
