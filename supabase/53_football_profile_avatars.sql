-- ============================================================================
-- 53_football_profile_avatars.sql : a colour and initials of your own
-- ============================================================================
-- Run AFTER 50_football_perfect_season.sql and 51_football_accounts.sql.
-- Safe to re-run. Writes nothing except the two backfills at the end, which only
-- touch rows that have no avatar on them yet.
--
-- What this adds:
--   * profiles.avatar_color, profiles.avatar_initials     your choice, site-wide
--   * ps_runs.display_color, ps_runs.display_initials     copied at insert time
--   * ps_set_avatar()                                     the setter, validated
--   * ps_submit_run() / ps_claim_run() / ps_rename_runs()  carry them too
--
-- THE COLUMNS GO ON `profiles`, NOT ON `ps_runs` ALONE, and they are named for
-- the site rather than for this game. profiles already carries `flag`, which is
-- the same kind of thing: a display choice shown next to your name on a public
-- board, made once and used everywhere. A football-specific pair of columns
-- would mean the next game asks the same question again.
--
-- A COLOUR NAME, NOT A COLOUR. The check constraint below is a fixed list of
-- nine words, and the client owns what each one actually looks like. Storing
-- '#dc2626' would mean a public leaderboard rendering a value a client chose,
-- which is a styling injection surface for the sake of a freedom nobody asked
-- for. AVATAR_COLORS in football/index.html has the same nine keys; that list
-- is the single source of what they look like and this one is the single source
-- of what is allowed.
--
-- INITIALS ARE THE ONE PIECE OF FREE TEXT ON THIS BOARD, so they are the most
-- tightly bounded thing in the schema: one or two characters, A to Z and 0 to 9
-- only, uppercased here rather than trusted from the client. No spaces, no
-- punctuation, no letters from other scripts, nothing that can be a URL or a
-- tag or a lookalike glyph. Null means "work them out from my username", which
-- is what the game did before this file and is still the default.
-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The choice, on the account
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists avatar_color    text;
alter table profiles add column if not exists avatar_initials text;

comment on column profiles.avatar_color is
  'One of the nine names in the profiles_avatar_color_ck constraint, or null for '
  'the one derived from the username. The client owns what each name looks like.';
comment on column profiles.avatar_initials is
  'One or two characters, A-Z0-9, uppercase. Null means derive them from the username.';

-- Constraints added separately and idempotently: `add column if not exists` will
-- not add a constraint to a column that already exists from an earlier run.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_avatar_color_ck') then
    alter table profiles add constraint profiles_avatar_color_ck
      check (avatar_color is null or avatar_color in
        ('red','orange','amber','green','teal','blue','violet','pink','slate'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_avatar_initials_ck') then
    alter table profiles add constraint profiles_avatar_initials_ck
      check (avatar_initials is null or avatar_initials ~ '^[A-Z0-9]{1,2}$');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The copy, on the run
-- ---------------------------------------------------------------------------
-- Denormalised for the same reason display_name is, and 51 spells it out: the
-- alternative is embedding profiles in every board read, which turns the six
-- count queries and both list queries into joins, and those counts are
-- index-only scans today. The board now reads up to 500 rows at a time, so that
-- argument is stronger than it was, not weaker. ps_set_avatar() below is what
-- keeps the copy honest, exactly as ps_rename_runs() does for the name.
alter table ps_runs add column if not exists display_color    text;
alter table ps_runs add column if not exists display_initials text;

-- ---------------------------------------------------------------------------
-- ps_set_avatar(): the only way either column is ever written
-- ---------------------------------------------------------------------------
-- Validates, normalises, stores, and propagates to the caller's existing rows in
-- one transaction, so a player never sees their old colour on half the board.
-- Empty string is taken as "clear it", because that is what a cleared text field
-- sends and asking the client to send null instead is a rule somebody will
-- forget.
--
-- Returns the pair it actually stored, so the client renders what the database
-- accepted rather than what it hoped for.
create or replace function ps_set_avatar(p_color text, p_initials text)
returns table (color text, initials text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_color text;
  v_inits text;
begin
  if v_user is null then
    raise exception 'sign in first';
  end if;

  v_color := nullif(btrim(coalesce(p_color, '')), '');
  if v_color is not null and v_color not in
     ('red','orange','amber','green','teal','blue','violet','pink','slate') then
    raise exception 'that is not one of the colours';
  end if;

  -- Uppercased and stripped here, so the only thing that can reach the column is
  -- one or two characters this function itself produced.
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

  return query select v_color, v_inits;
end $$;
revoke all on function ps_set_avatar(text,text) from public;
grant execute on function ps_set_avatar(text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- ps_rename_runs(): now syncs all three display fields, not just the name
-- ---------------------------------------------------------------------------
-- Same name and same signature, because the client already calls this one after
-- a rename. It was only ever "copy my current profile onto my rows" with a
-- narrower name than its job.
create or replace function ps_rename_runs()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_rows int;
begin
  if v_user is null then return 0; end if;
  update ps_runs r
     set display_name     = p.username::text,
         display_color    = p.avatar_color,
         display_initials = p.avatar_initials
    from profiles p
   where p.id = v_user and r.user_id = v_user;
  get diagnostics v_rows = row_count;
  return v_rows;
end $$;
revoke all on function ps_rename_runs() from public;
grant execute on function ps_rename_runs() to authenticated;

-- ---------------------------------------------------------------------------
-- ps_claim_run(): a guest run taken over gets the avatar too
-- ---------------------------------------------------------------------------
create or replace function ps_claim_run(p_id bigint)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_rows int;
begin
  if v_user is null then return false; end if;
  update ps_runs r
     set user_id          = v_user,
         display_name     = p.username::text,
         display_color    = p.avatar_color,
         display_initials = p.avatar_initials
    from profiles p
   where p.id = v_user and r.id = p_id and r.user_id is null;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;
revoke all on function ps_claim_run(bigint) from public;
grant execute on function ps_claim_run(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- ps_submit_run(): two more columns on the insert
-- ---------------------------------------------------------------------------
-- NOT a copy of the whole function. Rewriting 200 lines of validation to add two
-- insert columns is how the validation and the copy of it drift apart, and this
-- file would then be the newer of two versions of rules that live in 50. So the
-- avatar is stamped by a BEFORE INSERT trigger instead, which reads the same
-- profiles row ps_submit_run() already read for the name and cannot disagree
-- with it, because it is the only thing that writes these two columns on insert.
--
-- user_id is set by ps_submit_run() from auth.uid() before this fires, and is
-- null for a guest, in which case there is nothing to look up and both columns
-- stay null.
create or replace function ps_runs_stamp_avatar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null then
    select avatar_color, avatar_initials
      into new.display_color, new.display_initials
      from profiles where id = new.user_id;
  end if;
  return new;
end $$;

-- `create trigger` has no `or replace` before Postgres 14 and no `if not exists`
-- at all, so it is dropped first to keep this file safe to run twice.
drop trigger if exists ps_runs_avatar_stamp on ps_runs;
create trigger ps_runs_avatar_stamp
  before insert on ps_runs
  for each row execute function ps_runs_stamp_avatar();

-- ---------------------------------------------------------------------------
-- Backfill: every row that already exists gets whatever its owner has chosen,
-- which is nothing yet, so this is a no-op today and correct tomorrow. Written
-- so that running this file after people have started choosing colours fixes
-- rows recorded in between rather than leaving them blank.
-- ---------------------------------------------------------------------------
update ps_runs r
   set display_color    = p.avatar_color,
       display_initials = p.avatar_initials
  from profiles p
 where p.id = r.user_id
   and r.user_id is not null
   and (r.display_color is distinct from p.avatar_color
     or r.display_initials is distinct from p.avatar_initials);

analyze ps_runs;
analyze profiles;

-- `grant select on ps_runs` in 50 and the world-read policy on profiles in 10
-- are both table-wide, so neither new column needs a grant of its own.
-- PostgREST does need to be told the tables changed shape: until its schema
-- cache reloads, selecting display_color is a 400. Supabase reloads on DDL by
-- itself; this makes it immediate rather than eventual, and is harmless if it
-- already has.
notify pgrst, 'reload schema';
