-- ============================================================================
-- 66_cfb_profile_avatars.sql : your school and your initials, on your account
-- ============================================================================
-- Run AFTER 62_cfb_leaderboard.sql (and 63/64, which only replace cfb_submit_run).
-- Safe to run twice. Writes nothing except the backfills at the end, which only
-- touch rows whose copy has drifted from the profile it was copied from.
--
-- WHAT THIS FIXES. The college game let a player pick a school to play in and
-- kept that choice in localStorage and nowhere else, so it did not survive a
-- cleared browser and did not follow the account to a second device -- and it
-- could not appear on the leaderboard at all, because the board reads rows and
-- the rows had never heard of it. Every row on that board is a name and two
-- numbers; the NFL board has carried a profile circle since
-- 55_football_avatars_setup.sql.
--
--   * profiles.cfb_school          the school you play in, on the account
--   * cfb_runs.display_school      copied onto the row at insert time
--   * cfb_runs.display_initials    likewise
--   * cfb_set_avatar()             the setter, validated, propagating
--   * cfb_rename_runs()            now syncs all three display fields
--   * cfb_claim_run()              a claimed guest run gets them too
--   * ps_set_avatar()              extended, because initials are site-wide
--
-- INITIALS ARE SHARED WITH THE NFL GAME AND THE SCHOOL IS NOT, and the split is
-- deliberate. profiles.avatar_initials already exists and is already documented
-- as a site-wide display choice: your initials are your initials in every game on
-- RunThe.GG, so this file reuses that column rather than adding a second one that
-- could disagree with it. A school is not: profiles.avatar_color holds an NFL
-- franchise code ('KC', 'PHI') and putting 'Virginia' in it would silently cost
-- somebody the club they had chosen in the other game. So the school gets a
-- column of its own, named for the game it belongs to.
--
-- A SCHOOL NAME, NOT A COLOUR, for exactly the reason 53/55 give for storing
-- 'KC' rather than '#e31837': the client owns what a key looks like. cfb resolves
-- this string against the school table it builds from its own data files, and a
-- value it does not recognise resolves to null and draws the default circle. No
-- value from this column ever reaches a style attribute, so a public board cannot
-- be made to render something a client chose. The check below is therefore a
-- shape, not a whitelist of the eighty-three: a whitelist in SQL would have to be
-- edited every time the data files gain a school, and it is not what makes this
-- safe.
-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The choice, on the account
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists cfb_school text;

comment on column profiles.cfb_school is
  'The school this account plays in on College Football: Perfect Season. A key the '
  'client resolves against its own school table, never a colour. Null means none picked.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_cfb_school_ck') then
    alter table profiles add constraint profiles_cfb_school_ck
      check (cfb_school is null or cfb_school ~ '^[A-Za-z0-9 .&''()-]{2,40}$');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The copy, on the run
-- ---------------------------------------------------------------------------
-- Denormalised for the same reason display_name is, and 62 spells it out: the
-- alternative is embedding profiles in every board read, which turns the count
-- queries and both list queries into joins. cfb_set_avatar() and
-- cfb_rename_runs() are what keep the copy honest.
alter table cfb_runs add column if not exists display_school   text;
alter table cfb_runs add column if not exists display_initials text;

-- ---------------------------------------------------------------------------
-- cfb_set_avatar(): the only way either choice is ever written from this game
-- ---------------------------------------------------------------------------
-- Validates, normalises, stores and propagates in one transaction, so a player
-- never sees their old circle on half the board. Empty string is taken as "clear
-- it", because that is what a cleared field sends and asking the client to send
-- null instead is a rule somebody will forget.
--
-- IT WRITES ps_runs AS WELL, and that is not overreach. The initials it just
-- stored are site-wide -- the same profiles.avatar_initials the NFL game stamps
-- onto its own rows -- so leaving ps_runs alone would show the new letters here
-- and the old ones there until the player happened to save something in the other
-- game. It touches only the initials column there, never the club.
--
-- Returns the pair it actually stored, so the client renders what the database
-- accepted rather than what it hoped for.
create or replace function cfb_set_avatar(p_school text, p_initials text)
returns table (school text, initials text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_school text;
  v_inits  text;
begin
  if v_user is null then
    raise exception 'sign in first';
  end if;

  v_school := nullif(btrim(coalesce(p_school, '')), '');
  if v_school is not null and v_school !~ '^[A-Za-z0-9 .&''()-]{2,40}$' then
    raise exception 'that is not a school name';
  end if;

  -- Uppercased and stripped here, so the only thing that can reach the column is
  -- one or two characters this function itself produced.
  v_inits := upper(regexp_replace(coalesce(p_initials, ''), '[^A-Za-z0-9]', '', 'g'));
  v_inits := nullif(left(v_inits, 2), '');

  update profiles
     set cfb_school = v_school, avatar_initials = v_inits
   where id = v_user;
  if not found then
    raise exception 'no profile for this account';
  end if;

  update cfb_runs
     set display_school = v_school, display_initials = v_inits
   where user_id = v_user;

  -- The other game's rows carry the same initials. Guarded, so this file still
  -- runs on a project that has the college game and not the NFL one.
  if to_regclass('public.ps_runs') is not null then
    execute 'update ps_runs set display_initials = $1 where user_id = $2'
      using v_inits, v_user;
  end if;

  return query select v_school, v_inits;
end $$;
revoke all on function cfb_set_avatar(text,text) from public;
grant execute on function cfb_set_avatar(text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- ps_set_avatar(): the mirror image, so neither game can leave the other stale
-- ---------------------------------------------------------------------------
-- THE BODY IS 55_football_avatars_setup.sql's, CHARACTER FOR CHARACTER, with one
-- statement added at the end. It is repeated rather than altered in place because
-- Postgres has no way to append to a function body, and it is copied rather than
-- rewritten because the club check is ps_is_franchise() and the uppercasing in
-- front of it are rules that live in 55: retyping them from memory is how two
-- versions of one validation start to disagree.
--
-- The addition: initials set in the NFL game now reach cfb_runs too. Without it
-- the propagation was one-way, and a player who changed their letters there would
-- see the old ones on every college row until they changed them again here.
create or replace function ps_set_avatar(p_color text, p_initials text)
returns table (color text, initials text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_color text;
  v_inits text;
begin
  if v_user is null then
    raise exception 'sign in first';
  end if;

  -- Uppercased first, so a client sending 'kc' is helped rather than refused.
  v_color := nullif(upper(btrim(coalesce(p_color, ''))), '');
  if v_color is not null and not ps_is_franchise(v_color) then
    raise exception 'that is not one of the thirty-two clubs';
  end if;

  v_inits := upper(regexp_replace(coalesce(p_initials, ''), '[^A-Za-z0-9]', '', 'g'));
  v_inits := nullif(left(v_inits, 2), '');

  update profiles
     set avatar_color = v_color, avatar_initials = v_inits
   where id = v_user;
  if not found then
    raise exception 'no profile for this account';
  end if;

  update ps_runs
     set display_color = v_color, display_initials = v_inits
   where user_id = v_user;

  if to_regclass('public.cfb_runs') is not null then
    execute 'update cfb_runs set display_initials = $1 where user_id = $2'
      using v_inits, v_user;
  end if;

  return query select v_color, v_inits;
end $$;
revoke all on function ps_set_avatar(text,text) from public;
grant execute on function ps_set_avatar(text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- cfb_rename_runs(): now syncs all three display fields, not just the name
-- ---------------------------------------------------------------------------
-- Same name and same signature, because the client already calls this one after
-- a rename. It was only ever "copy my current profile onto my rows" under a
-- narrower name than its job.
create or replace function cfb_rename_runs()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_rows int;
begin
  if v_user is null then return 0; end if;
  update cfb_runs r
     set display_name     = p.username::text,
         display_school   = p.cfb_school,
         display_initials = p.avatar_initials
    from profiles p
   where p.id = v_user and r.user_id = v_user;
  get diagnostics v_rows = row_count;
  return v_rows;
end $$;
revoke all on function cfb_rename_runs() from public;
grant execute on function cfb_rename_runs() to authenticated;

-- ---------------------------------------------------------------------------
-- cfb_claim_run(): a guest season taken over gets the circle too
-- ---------------------------------------------------------------------------
-- Still only ever stamps a row that is unowned, which is what makes it impossible
-- to take somebody else's: the id travels through the browser, so the id alone
-- must not be enough to own a row.
create or replace function cfb_claim_run(p_id bigint)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_rows int;
begin
  if v_user is null then return false; end if;
  update cfb_runs r
     set user_id          = v_user,
         display_name     = p.username::text,
         display_school   = p.cfb_school,
         display_initials = p.avatar_initials
    from profiles p
   where p.id = v_user and r.id = p_id and r.user_id is null;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;
revoke all on function cfb_claim_run(bigint) from public;
grant execute on function cfb_claim_run(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- The stamp on insert
-- ---------------------------------------------------------------------------
-- NOT a rewrite of cfb_submit_run(). Copying two hundred lines of validation in
-- order to add two insert columns is how validation and a copy of it drift apart,
-- and this file would then hold the newer of two versions of rules that live in
-- 62/63/64. So the circle is stamped by a BEFORE INSERT trigger, which reads the
-- same profiles row cfb_submit_run() already read for the name and therefore
-- cannot disagree with it -- and is the only thing that writes these two columns
-- on insert.
--
-- user_id is set by cfb_submit_run() from auth.uid() before this fires and is
-- null for a guest, in which case there is nothing to look up and both columns
-- stay null.
create or replace function cfb_runs_stamp_avatar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null then
    select cfb_school, avatar_initials
      into new.display_school, new.display_initials
      from profiles where id = new.user_id;
  end if;
  return new;
end $$;

-- `create trigger` has no `or replace` before Postgres 14 and no `if not exists`
-- at all, so it is dropped first to keep this file safe to run twice.
drop trigger if exists cfb_runs_avatar_stamp on cfb_runs;
create trigger cfb_runs_avatar_stamp
  before insert on cfb_runs
  for each row execute function cfb_runs_stamp_avatar();

-- ---------------------------------------------------------------------------
-- Backfill: every row that already exists gets whatever its owner has chosen,
-- which is nothing yet, so this is a no-op today and correct tomorrow. Written
-- so that running this file again after people have started choosing fixes rows
-- recorded in between rather than leaving them blank.
-- ---------------------------------------------------------------------------
update cfb_runs r
   set display_school   = p.cfb_school,
       display_initials = p.avatar_initials
  from profiles p
 where p.id = r.user_id
   and r.user_id is not null
   and (r.display_school   is distinct from p.cfb_school
     or r.display_initials is distinct from p.avatar_initials);

analyze cfb_runs;
analyze profiles;

-- `grant select on cfb_runs` in 62 and the world-read policy on profiles in 10
-- are both table-wide, so neither new column needs a grant of its own. PostgREST
-- does need telling that the table changed shape: until its schema cache reloads,
-- selecting display_school is a 400. Supabase reloads on DDL by itself; this makes
-- it immediate rather than eventual, and is harmless if it already has.
notify pgrst, 'reload schema';
