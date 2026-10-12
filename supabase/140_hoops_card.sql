-- ---------------------------------------------------------------------------
-- 140_hoops_card.sql : the Run The Floor player card, on the account's public
-- profile
--
--   psql ... -f supabase/140_hoops_card.sql
--
-- Needs 129 (rtf_profiles) and 139 (the two loadouts). Safe to run more than
-- once.
--
-- TWO THINGS.
--
-- 1. THE LOADOUTS TAKE THE THREE SLOTS THAT ARE NOT CLOTHES. 139 listed the
--    twelve street slots and the thirteen court slots a man wears, and the
--    closet also keeps an idle in each loadout, and now a nameplate and a card
--    backdrop in the street one. A loadout naming any of them broke 139's
--    check, the WHOLE call was refused, and the player went undrawn on every
--    board from the day he picked an idle. Nothing threw on the page: a
--    profile write fails soft. The page sends the loadout again without them
--    against a database still on 139 (hoops/wardrobe.js wearOnly), and this
--    widens the lists so it never has to.
--
-- 2. THE PLAYER. A board row filed by an account draws that account's player
--    in what he wears, and a tap on him opens his card. The wardrobe says what
--    he wears; this says who he is: the look (skin, hair, build and the rest,
--    the small numbers and short ids hoops/baller.js normal() keeps), the
--    invented name under the Career board's own name rule (130), the number,
--    the position, the club colours his card is printed in, and his Floor Rep
--    rank. Nothing a real player owns, and no free text but the name, which
--    already appears on the public Career board.
--
-- WHAT THE SERVER DOES NOT CHECK, said plainly. The rank is derived from the
-- badge cabinet, which plpgsql cannot read, so it is checked for SHAPE (a
-- whole number from 0 to 19) and not earned. That is 129's trade for the
-- jersey and 139's for the loadout: a forged rank changes how one account's
-- card is drawn and decides nothing.
-- ---------------------------------------------------------------------------

-- rtf_wear_ok counts at most 13 keys, which the street look now passes at 15.
create or replace function public.rtf_wear_ok(j jsonb, slots text[])
returns boolean language sql immutable as $$
  select j is null or (
    jsonb_typeof(j) = 'object'
    and (select count(*) from jsonb_object_keys(j)) <= 16
    and not exists (
      select 1 from jsonb_each(j) e
      where not (e.key = any(slots))
         or jsonb_typeof(e.value) <> 'string'
         or (e.value #>> '{}') !~ '^[a-z0-9_]{2,40}$'
    )
  )
$$;

alter table public.rtf_profiles drop constraint if exists rtf_profiles_wear_street_ck;
alter table public.rtf_profiles add constraint rtf_profiles_wear_street_ck check (public.rtf_wear_ok(wear_street,
  array['hat','eyes','top','outer','bottom','shoes','socks','chain','watch','bag','phones','held','idle','plate','bg']));
alter table public.rtf_profiles drop constraint if exists rtf_profiles_wear_court_ck;
alter table public.rtf_profiles add constraint rtf_profiles_wear_court_ck check (public.rtf_wear_ok(wear_court,
  array['band','goggles','guard','sleeveL','sleeveR','wrist','tape','tights','knee','ankle','csocks','shoes','under','idle']));

-- The shape of a player: only these keys, each its own shape.
create or replace function public.rtf_player_ok(j jsonb)
returns boolean language sql immutable as $$
  select j is null or (
    jsonb_typeof(j) = 'object'
    and not exists (select 1 from jsonb_object_keys(j) k where not (k = any(array['look','name','num','pos','c1','c2','rep'])))
    and (not (j ? 'look') or (
      jsonb_typeof(j -> 'look') = 'object'
      and (select count(*) from jsonb_object_keys(j -> 'look')) <= 16
      and not exists (
        select 1 from jsonb_each(j -> 'look') e
        where e.key !~ '^[a-z]{1,8}$'
           or not (
             (jsonb_typeof(e.value) = 'number' and (e.value #>> '{}')::numeric between -1 and 400)
             or (jsonb_typeof(e.value) = 'string' and (e.value #>> '{}') ~ '^[a-z0-9_]{0,24}$')
           )
      )))
    and (not (j ? 'name') or (jsonb_typeof(j -> 'name') = 'string' and (j ->> 'name') ~ '^[[:alpha:]][[:alpha:] .''-]{0,27}$'))
    and (not (j ? 'num') or (jsonb_typeof(j -> 'num') = 'number' and (j ->> 'num')::numeric between 0 and 99 and (j ->> 'num') ~ '^[0-9]{1,2}$'))
    and (not (j ? 'pos') or (jsonb_typeof(j -> 'pos') = 'string' and (j ->> 'pos') ~ '^(PG|SG|SF|PF|C)$'))
    and (not (j ? 'c1') or (jsonb_typeof(j -> 'c1') = 'string' and (j ->> 'c1') ~ '^#[0-9a-fA-F]{6}$'))
    and (not (j ? 'c2') or (jsonb_typeof(j -> 'c2') = 'string' and (j ->> 'c2') ~ '^#[0-9a-fA-F]{6}$'))
    and (not (j ? 'rep') or (jsonb_typeof(j -> 'rep') = 'number' and (j ->> 'rep') ~ '^[0-9]{1,2}$' and (j ->> 'rep')::int between 0 and 19))
  )
$$;

alter table public.rtf_profiles add column if not exists player jsonb;
alter table public.rtf_profiles drop constraint if exists rtf_profiles_player_ck;
alter table public.rtf_profiles add constraint rtf_profiles_player_ck check (public.rtf_player_ok(player));

-- ─────────────────────────────────────────────────────────────────────────────
-- rtf_set_profile(): the one writer, with the player
-- ─────────────────────────────────────────────────────────────────────────────
-- 129's rules hold: NULL leaves a field alone. 139's nine argument function is
-- dropped rather than left beside this one, for 139's own reason: two
-- overloads sharing every argument name make PostgREST's resolution by name
-- ambiguous. A page a version behind calls this one by the names it knows.
drop function if exists public.rtf_set_profile(text,text,text,text,text,text,boolean,jsonb,jsonb);
create or replace function public.rtf_set_profile(
  p_club text default null, p_num text default null, p_arena text default null,
  p_camera text default null, p_last_club text default null, p_last_era text default null,
  p_guide boolean default null, p_wear_street jsonb default null, p_wear_court jsonb default null,
  p_player jsonb default null)
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
    player      = coalesce(p_player, player),
    updated_at  = now()
  where user_id = v_uid
  returning * into v_row;
  return v_row;
end $$;
revoke all on function public.rtf_set_profile(text,text,text,text,text,text,boolean,jsonb,jsonb,jsonb) from public;
grant execute on function public.rtf_set_profile(text,text,text,text,text,text,boolean,jsonb,jsonb,jsonb) to authenticated;
