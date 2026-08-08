-- ============================================================================
-- 68_setlist_username.sql : a name for Segue specifically (/setlist)
-- ============================================================================
-- Additive and idempotent. Adds ONE nullable column to profiles and four
-- functions; alters no existing table, policy or grant, and rewrites the three
-- Segue functions from 67 to read the new name when there is one.
--
-- Run it after supabase/67_setlist_leaderboard.sql. Until it is run, the board
-- keeps showing site usernames and the "change your name" panel reports itself
-- unavailable, which is the truth.
--
-- WHY A COLUMN ON profiles AND NOT A NEW TABLE. The site already scopes things
-- to a game this way: soccer_h2h_wins, soccer_wc_titles, avatar_color and
-- avatar_initials all live on profiles. A separate table would mean a join on
-- every name read for a facility that is one nullable string per person.
--
-- STILL ONE ACCOUNT. This is a display name, not a login. The email, the
-- password, the session and the RunThe.GG account are all unchanged, and
-- profiles.username stays exactly what it was: a player who sets a Segue name
-- keeps their name on the football and college boards.
--
-- THE FALLBACK IS THE POINT. segue_name is nullable and every read is
-- coalesce(segue_name, username), so a player who never touches this is
-- unaffected and every show already on the board keeps the name it has. Setting
-- one is opt-in and reversible: clearing it falls straight back to the site
-- username.
--
-- ---------------------------------------------------------------------------
-- UNIQUENESS IS ACROSS BOTH NAMESPACES, and this is the one real decision here.
-- ---------------------------------------------------------------------------
-- The obvious implementation is to make segue_name unique among segue_names and
-- stop. Do not do that. The Segue board prints coalesce(segue_name, username),
-- so the two namespaces are rendered into the SAME column of the SAME list. If
-- they were independent, anyone could take "coachprime" as a Segue name while a
-- different person's site username was already "coachprime", and the board would
-- show two rows under one name with no way to tell them apart. That is
-- impersonation, and it arrives by accident as much as by intent.
--
-- So a name is claimed globally, whichever field holds it. Taking your OWN site
-- username as your Segue name is allowed, because you already own it.
--
-- The honest caveat: this is enforced by a check inside a SECURITY DEFINER
-- function plus a unique index per column, not by one constraint spanning both.
-- Postgres has no cross-column unique, and the structure that would give one is
-- a site-wide names table, which is a refactor of the shared account system
-- rather than a change to this game. Two people claiming the same name in the
-- same instant can therefore both pass the check. The unique index stops that
-- within a column; across columns the residual window is a few milliseconds
-- wide and the worst outcome is two rows sharing a display name, which is a
-- cosmetic bug and not an escalation. Worth knowing, not worth a refactor.
-- ----------------------------------------------------------------------------

alter table profiles add column if not exists segue_name citext;

comment on column profiles.segue_name is
  'Display name for Segue (/setlist) only. Null means fall back to username.';

-- Uniqueness within the column. The cross-column half is in segue_name_free().
create unique index if not exists profiles_segue_name_key
  on profiles (segue_name) where segue_name is not null;

-- ---------------------------------------------------------------------------
-- The format
-- ---------------------------------------------------------------------------
-- DELIBERATELY THE SAME RULE username_ok() USES: 3 to 20 characters, letters,
-- numbers and underscores. Not because the two have to match, but because they
-- share a column on the board, and a Segue board that could show punctuation
-- and emoji next to names that cannot would be two different products in one
-- list. It also keeps the share card, which draws these names onto a canvas at
-- a fixed width, working with one measurement.
create or replace function segue_name_ok(p text)
returns boolean language sql immutable as $$
  select p is not null and p ~ '^[A-Za-z0-9_]{3,20}$';
$$;

-- ---------------------------------------------------------------------------
-- segue_name_free(): is this name available to THIS caller
-- ---------------------------------------------------------------------------
-- Checks both namespaces, and excludes the caller's own row from both, so:
--   * your own site username is available to you as a Segue name
--   * re-submitting the Segue name you already have is not "taken"
--
-- Callable signed out (it is what the form checks as you type), in which case
-- there is no own row to exclude and every name in use is simply taken.
create or replace function segue_name_free(p_name text)
returns boolean
language sql security definer set search_path = public stable as $$
  select segue_name_ok(p_name)
     and not exists (
       select 1 from profiles
        where id is distinct from auth.uid()
          and (username = p_name or segue_name = p_name));
$$;
revoke all on function segue_name_free(text) from public;
grant execute on function segue_name_free(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- segue_set_name(): set it, clear it, and fix what is already on the board
-- ---------------------------------------------------------------------------
-- NULL OR EMPTY CLEARS IT, which is how a player goes back to their site
-- username. That is a real thing to want and it needs no second function.
--
-- The rename runs inside the same call rather than being left to the client.
-- 67's segue_rename_runs() exists because the board stores a copy of the name
-- rather than joining profiles on every read, and a rename that only applies to
-- future shows leaves a player looking at their own history under two names.
--
-- Returns the name now in effect, which is what the caller should display:
-- sending 'Newname' and rendering 'Newname' while the database holds something
-- else is how a settings screen starts lying.
create or replace function segue_set_name(p_name text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_name citext := nullif(trim(coalesce(p_name, '')), '')::citext;
begin
  if v_user is null then
    raise exception 'sign in first';
  end if;
  if not exists (select 1 from profiles where id = v_user) then
    raise exception 'no profile for this account';
  end if;

  if v_name is not null then
    if not segue_name_ok(v_name::text) then
      raise exception 'a name is 3 to 20 letters, numbers or underscores';
    end if;
    -- Both namespaces, excluding this caller. See the header.
    if exists (select 1 from profiles
                where id <> v_user
                  and (username = v_name or segue_name = v_name)) then
      raise exception 'that name is taken';
    end if;
  end if;

  update profiles set segue_name = v_name where id = v_user;

  -- Everything already on the board follows the change.
  perform segue_rename_runs();

  return (select coalesce(segue_name, username)::text from profiles where id = v_user);
end $$;
revoke all on function segue_set_name(text) from public;
grant execute on function segue_set_name(text) to authenticated;

-- ---------------------------------------------------------------------------
-- The whole switch: one function, three lines
-- ---------------------------------------------------------------------------
-- 67 routes every name read through segue_display_name(), for exactly this.
-- Replacing it here changes the name on a newly recorded show, on a claimed
-- one, and on every row segue_rename_runs() rewrites, without restating a line
-- of segue_submit_run()'s validation.
--
-- THE NAME IS STILL NEVER SENT BY THE CLIENT. That property is why a public
-- board is not a forgery surface, and it survives this file untouched: the only
-- thing a client can do is ask segue_set_name() to change what the server will
-- read for auth.uid() next time.
create or replace function segue_display_name(p_user uuid)
returns text
language sql security definer set search_path = public stable as $$
  select coalesce(segue_name, username)::text from profiles where id = p_user;
$$;
revoke all on function segue_display_name(uuid) from public;
grant execute on function segue_display_name(uuid) to anon, authenticated;
