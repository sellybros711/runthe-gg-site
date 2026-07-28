-- ============================================================================
-- 58_football_stamp_display.sql : put the name back on recorded runs
-- ============================================================================
-- Run this one. It is small, it is safe to run twice, and it fixes runs that
-- have already been played as well as every run from here on.
--
-- ----------------------------------------------------------------------------
-- WHAT WENT WRONG
-- ----------------------------------------------------------------------------
-- The board read "1 draft played this week, 0 on the board" for a run played
-- while signed in. The run was recorded, with the right user_id, and it was
-- counted; it just had no display_name, and the list only shows named runs
-- because a row nobody owns cannot be defended or beaten.
--
-- The cause is mine. ps_submit_run() has been rewritten twice for One Franchise mode,
-- and both times it was rewritten from the version in
-- 50_football_perfect_season.sql, which predates accounts. The version actually
-- installed was 51_football_accounts.sql's, which does one thing more:
--
--     if v_user is not null then
--       select username::text into v_name from profiles where id = v_user;
--     end if;
--     ... insert into ps_runs (user_id, display_name, ...) values (v_user, v_name, ...)
--
-- Rebuilding from the older text silently dropped the name. Nothing failed, no
-- error was raised, and the run went in unnamed.
--
-- ----------------------------------------------------------------------------
-- WHY THE FIX IS A TRIGGER AND NOT ANOTHER COPY OF THE FUNCTION
-- ----------------------------------------------------------------------------
-- Because the same mistake is available to the next person who rewrites that
-- function, and it will not announce itself when they make it.
--
-- 55 already installs a BEFORE INSERT trigger on ps_runs that reads the row's
-- profile and stamps display_color and display_initials. The name belongs in
-- exactly the same place and for exactly the same reason. Once it is there, the
-- three display fields are filled from the profile no matter which version of
-- ps_submit_run is installed, and a rewrite cannot lose them.
--
-- ps_submit_run is left alone by this file. It may or may not set the name
-- itself; the trigger writes the same value over it either way.
-- ----------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. One trigger function for all three display fields.
--
--    Named ps_runs_stamp_display now rather than ps_runs_stamp_avatar, because
--    it is no longer only about the avatar and a name that lies about what a
--    function does is how the next reader gets it wrong.
-- ---------------------------------------------------------------------------
create or replace function ps_runs_stamp_display()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A guest run has no user, so it has no name and no colours. That is the whole
  -- reason the board lists named runs only, and it is left exactly as it is.
  if new.user_id is not null then
    select username::text, avatar_color, avatar_initials
      into new.display_name, new.display_color, new.display_initials
      from profiles where id = new.user_id;
  end if;
  return new;
end $$;

-- `create trigger` has no `or replace` before Postgres 14 and no `if not exists`
-- at all, so both the old trigger and the new one are dropped first to keep this
-- file safe to run twice.
drop trigger if exists ps_runs_avatar_stamp on ps_runs;
drop trigger if exists ps_runs_display_stamp on ps_runs;
create trigger ps_runs_display_stamp
  before insert on ps_runs
  for each row execute function ps_runs_stamp_display();

-- The old function goes only after nothing points at it any more.
drop function if exists ps_runs_stamp_avatar();


-- ---------------------------------------------------------------------------
-- 2. The runs already played unnamed.
--
--    Every one of these was played by somebody signed in: they carry a user_id,
--    which is only ever set from auth.uid(). So the name is not being invented,
--    it is being restored to rows that should have had it, and they appear on the
--    board they were always meant to be on.
--
--    Guest runs are untouched. They have no user_id, so they match nothing here
--    and stay off the list, which is correct: a player can still claim one later
--    with ps_claim_run() and that stamps all three fields.
-- ---------------------------------------------------------------------------
update ps_runs r
   set display_name     = p.username::text,
       display_color    = coalesce(r.display_color, p.avatar_color),
       display_initials = coalesce(r.display_initials, p.avatar_initials)
  from profiles p
 where p.id = r.user_id
   and r.display_name is null;


-- ---------------------------------------------------------------------------
-- 3. The partial indexes are over `display_name is not null`, so rows that just
--    gained a name have to be added to them. An insert does that on its own; an
--    update of the indexed predicate does too, but the planner's row estimates
--    for those indexes are now stale by however many rows moved.
-- ---------------------------------------------------------------------------
analyze ps_runs;


-- ---------------------------------------------------------------------------
-- 4. What is now true. One row, so it reads on a phone.
-- ---------------------------------------------------------------------------
select
  case when exists (select 1 from pg_trigger
        where tgrelid = to_regclass('public.ps_runs')
          and tgname = 'ps_runs_display_stamp')
       then 'ok' else 'MISSING' end                                    as stamp_trigger,
  case when exists (select 1 from pg_trigger
        where tgrelid = to_regclass('public.ps_runs')
          and tgname = 'ps_runs_avatar_stamp')
       then 'STILL THERE' else 'gone, good' end                        as old_trigger,
  (select count(*) from ps_runs where user_id is not null
     and display_name is null)                                         as signed_in_but_unnamed,
  (select count(*) from ps_runs where display_name is not null)         as runs_on_the_board,
  (select count(*) from ps_runs where user_id is null)                  as guest_runs;
