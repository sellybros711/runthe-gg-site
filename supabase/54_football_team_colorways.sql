-- ============================================================================
-- SUPERSEDED BY 55_football_avatars_setup.sql. Do not run this file.
-- ============================================================================
-- This one and 54 have to be run in order, and 54 opens by clearing values out of
-- a column that this file creates. Run on a project that had not had this one, 54
-- fails on `column "avatar_color" does not exist`, and because the Supabase SQL
-- editor runs a script as ONE TRANSACTION the failure rolls back everything after
-- it too: no columns and no ps_set_avatar, and the game reports the function
-- missing from the schema cache with no hint that the cause was file ordering.
--
-- 55 is both of these in one file, in an order that cannot trip, and safe to run
-- from any starting state including this one. Kept here only as history.
-- ============================================================================

-- ============================================================================
-- 54_football_team_colorways.sql : pick a club, not a colour
-- ============================================================================
-- Run AFTER 53_football_profile_avatars.sql. Safe to re-run.
--
-- 53 let a player choose one of nine colours. This replaces that list with the
-- thirty-two clubs: the circle is filled with the club's primary and ringed with
-- its secondary, so choosing one is choosing a team to represent rather than
-- picking a swatch.
--
-- THE COLUMN KEEPS ITS NAME and changes what may be in it. avatar_color now
-- holds a franchise code, 'KC' or 'PHI', and that reads oddly for about a second
-- until you notice the column never held a colour in the first place: 53 stored
-- 'teal', a key the client resolves to a colour, for exactly the reason spelled
-- out there. A code is the same kind of key with a longer list behind it.
-- Renaming avatar_color, display_color and three functions to improve one word,
-- on a feature that is two commits old, would be churn a comment does better.
--
-- WHY NOT KEEP THE NINE AS WELL. Because then two different kinds of thing live
-- in one column and every reader has to know which is which. The nine are still
-- there, but as the DERIVED default only: a player who has chosen nothing still
-- gets one of eight worked out from their name, and the client owns that. What is
-- storable is now exactly "the club I chose", and null still means "I have not".
--
-- A club is never derived from a name. Handing somebody the Cowboys because of
-- how their username hashes would be putting words in their mouth about the one
-- thing on this screen that is a statement.
-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The list, once, as a function, so the constraint and ps_set_avatar cannot
-- disagree about it. 53 wrote its nine names out twice and got away with it;
-- thirty-two is where that stops being safe.
-- ---------------------------------------------------------------------------
create or replace function ps_is_franchise(p text)
returns boolean
language sql
immutable
as $$
  select p in (
    'ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU',
    'IND','JAX','KC','LAC','LAR','LV','MIA','MIN','NE','NO','NYG','NYJ','PHI',
    'PIT','SEA','SF','TB','TEN','WAS')
$$;
revoke all on function ps_is_franchise(text) from public;
grant execute on function ps_is_franchise(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Clear the old values BEFORE the new constraint goes on, or adding it fails on
-- any row still holding one of the nine words. Nulling them is right rather than
-- mapping them: 'teal' was never a claim about a club, so guessing which club a
-- teal player meant would invent an allegiance they never stated. They go back to
-- the derived colour, which is what they were looking at anyway.
-- ---------------------------------------------------------------------------
update profiles set avatar_color = null
 where avatar_color is not null and not ps_is_franchise(avatar_color);
update ps_runs set display_color = null
 where display_color is not null and not ps_is_franchise(display_color);

-- ---------------------------------------------------------------------------
-- Swap the constraint
-- ---------------------------------------------------------------------------
alter table profiles drop constraint if exists profiles_avatar_color_ck;
alter table profiles add  constraint profiles_avatar_color_ck
  check (avatar_color is null or ps_is_franchise(avatar_color));

comment on column profiles.avatar_color is
  'The franchise code whose colours this account''s circle uses, or null for the '
  'colour derived from the username. Validated by ps_is_franchise(). The client '
  'owns what each code looks like.';

-- ---------------------------------------------------------------------------
-- ps_set_avatar(), against the same list
-- ---------------------------------------------------------------------------
-- Unchanged except for the one line that validates the colour, which now asks the
-- function above rather than carrying its own copy of the list. Uppercased first,
-- so a client sending 'kc' is helped rather than refused: the codes are
-- upper-case by convention and there is no lower-case code to confuse it with.
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

  return query select v_color, v_inits;
end $$;
revoke all on function ps_set_avatar(text,text) from public;
grant execute on function ps_set_avatar(text,text) to authenticated;

analyze ps_runs;
analyze profiles;

notify pgrst, 'reload schema';
