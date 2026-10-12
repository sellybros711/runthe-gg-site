-- ---------------------------------------------------------------------------
-- 139_hoops_wardrobe.sql : what a Run The Floor player is wearing, on the
-- account's public profile
--
--   psql ... -f supabase/139_hoops_wardrobe.sql
--
-- Needs 129 (rtf_profiles). Safe to run more than once.
--
-- WHAT THE PLAYER OWNS is not here. That is the closet record (hoops/
-- wardrobe.js), kept in ps_saves (103) under the game 'rtf', slot 'ward',
-- private to the account like every other record. This adds only what he
-- WEARS, the two loadouts, to the row other players can read, so a board row
-- or a card can draw him dressed (ECONOMY.md section 9).
--
-- A loadout is { slot: item id }. It publishes a few ids from the catalogue
-- and nothing a player typed.
--
-- WHAT THE SERVER DOES NOT CHECK, said plainly. Owning an item is decided by
-- the closet record and the catalogue, which plpgsql cannot read, so a loadout
-- is checked for SHAPE (known slots, short ids) and not for ownership. That is
-- 129's trade for the jersey and the arena: every page that draws a loadout
-- resolves it through hoops/catalog.js, which falls back for an unknown id,
-- so a forged loadout changes only how that one account is drawn.
-- ---------------------------------------------------------------------------

-- The shape of a loadout: an object of at most 13 slots from the look's list,
-- each naming an id of 2 to 40 lower case letters, digits and underscores.
create or replace function public.rtf_wear_ok(j jsonb, slots text[])
returns boolean language sql immutable as $$
  select j is null or (
    jsonb_typeof(j) = 'object'
    and (select count(*) from jsonb_object_keys(j)) <= 13
    and not exists (
      select 1 from jsonb_each(j) e
      where not (e.key = any(slots))
         or jsonb_typeof(e.value) <> 'string'
         or (e.value #>> '{}') !~ '^[a-z0-9_]{2,40}$'
    )
  )
$$;

alter table public.rtf_profiles add column if not exists wear_street jsonb;
alter table public.rtf_profiles add column if not exists wear_court jsonb;

alter table public.rtf_profiles drop constraint if exists rtf_profiles_wear_street_ck;
alter table public.rtf_profiles add constraint rtf_profiles_wear_street_ck check (public.rtf_wear_ok(wear_street,
  array['hat','eyes','top','outer','bottom','shoes','socks','chain','watch','bag','phones','held']));
alter table public.rtf_profiles drop constraint if exists rtf_profiles_wear_court_ck;
alter table public.rtf_profiles add constraint rtf_profiles_wear_court_ck check (public.rtf_wear_ok(wear_court,
  array['band','goggles','guard','sleeveL','sleeveR','wrist','tape','tights','knee','ankle','csocks','shoes','under']));

-- ─────────────────────────────────────────────────────────────────────────────
-- rtf_set_profile(): the one writer, with the two loadouts
-- ─────────────────────────────────────────────────────────────────────────────
-- 129's rules hold: NULL leaves a field alone. For a loadout the empty object
-- means "the starters", which is a choice, so it is stored rather than cleared.
--
-- The old seven argument function is dropped, not left beside this one: two
-- overloads sharing every argument name would make PostgREST's resolution by
-- name ambiguous. A page a version behind calls this one by the names it
-- knows, and the two new arguments default to null, which is "leave it alone".
drop function if exists public.rtf_set_profile(text,text,text,text,text,text,boolean);
create or replace function public.rtf_set_profile(
  p_club text default null, p_num text default null, p_arena text default null,
  p_camera text default null, p_last_club text default null, p_last_era text default null,
  p_guide boolean default null, p_wear_street jsonb default null, p_wear_court jsonb default null)
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
    wear_street = coalesce(p_wear_street, wear_street),
    wear_court  = coalesce(p_wear_court, wear_court),
    updated_at  = now()
  where user_id = v_uid
  returning * into v_row;
  return v_row;
end $$;
revoke all on function public.rtf_set_profile(text,text,text,text,text,text,boolean,jsonb,jsonb) from public;
grant execute on function public.rtf_set_profile(text,text,text,text,text,text,boolean,jsonb,jsonb) to authenticated;
