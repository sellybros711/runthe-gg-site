-- ============================================================================
-- 55_football_avatars_setup.sql : profile circles, in one file
-- ============================================================================
-- RUN THIS ONE. It replaces 53_football_profile_avatars.sql and
-- 54_football_team_colorways.sql, does everything both of them do, and works
-- from any starting state: neither run, one run, both run, or a half-finished
-- attempt. Run it as many times as you like.
--
-- WHY IT EXISTS. 53 added the columns and 54 changed what may be in them, so 54
-- opened by clearing values out of a column 53 creates. Run on a project that had
-- not had 53, that line fails with `column "avatar_color" does not exist`, and
-- because the Supabase SQL editor runs a whole script as ONE TRANSACTION, the
-- failure rolls back everything after it as well: no columns, no constraints and
-- no ps_set_avatar. The game then reports
--
--     Could not find the function public.ps_set_avatar(p_color, p_initials)
--     in the schema cache
--
-- which is true, unhelpful, and gives no hint that the cause was two files in the
-- wrong order. Nothing below depends on anything above it having been run before,
-- so the ordering trap cannot happen again.
--
-- WHAT IT SETS UP
--   profiles.avatar_color        the franchise code you chose, or null
--   profiles.avatar_initials     one or two of A-Z0-9, or null
--   ps_runs.display_color        both copied onto each run at insert time, so a
--   ps_runs.display_initials     board read stays one index scan and no join
--   ps_set_avatar()              the only way either is ever written
--   ps_is_franchise()            the list of thirty-two, in one place
--   a BEFORE INSERT trigger      stamps a new run from the owner's profile
--
-- The last statement is a SELECT that reports what is now in place. If every
-- column of it says ok, the game will work.
-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The list of clubs, first, because the constraint below calls it.
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
-- 2. The columns. `if not exists` on every one, so a project that has some of
--    them keeps them and their data.
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists avatar_color    text;
alter table profiles add column if not exists avatar_initials text;
alter table ps_runs  add column if not exists display_color    text;
alter table ps_runs  add column if not exists display_initials text;

comment on column profiles.avatar_color is
  'The franchise code whose colours this account''s circle uses, or null for the '
  'one derived from the username. Validated by ps_is_franchise(). The client owns '
  'what each code looks like; nothing here is ever a colour value.';
comment on column profiles.avatar_initials is
  'One or two characters, A-Z0-9, uppercase. Null means derive them from the username.';

-- ---------------------------------------------------------------------------
-- 3. Clear anything the new rules do not allow, BEFORE the constraints go on, or
--    adding them fails on the old rows. 53 allowed nine colour words; those were
--    never a claim about a club, so guessing which club a 'teal' player meant
--    would invent an allegiance they never stated. They go back to the derived
--    colour, which is what they were looking at anyway.
-- ---------------------------------------------------------------------------
alter table profiles drop constraint if exists profiles_avatar_color_ck;
alter table profiles drop constraint if exists profiles_avatar_initials_ck;

update profiles set avatar_color = null
 where avatar_color is not null and not ps_is_franchise(avatar_color);
update profiles set avatar_initials = null
 where avatar_initials is not null and avatar_initials !~ '^[A-Z0-9]{1,2}$';
update ps_runs set display_color = null
 where display_color is not null and not ps_is_franchise(display_color);
update ps_runs set display_initials = null
 where display_initials is not null and display_initials !~ '^[A-Z0-9]{1,2}$';

alter table profiles add constraint profiles_avatar_color_ck
  check (avatar_color is null or ps_is_franchise(avatar_color));
alter table profiles add constraint profiles_avatar_initials_ck
  check (avatar_initials is null or avatar_initials ~ '^[A-Z0-9]{1,2}$');

-- ---------------------------------------------------------------------------
-- 4. ps_set_avatar(): the only way either column is ever written.
--
--    Validates, normalises, stores and propagates to the caller's existing rows in
--    one transaction, so a player never sees their old colour on half the board.
--    Initials are the one piece of free text on a public board, so they are the
--    most tightly bounded thing here: stripped to A-Z0-9, uppercased and cut to two
--    by this function rather than trusted from the client. Returns what it stored,
--    so the client draws what the database accepted rather than what it hoped for.
-- ---------------------------------------------------------------------------
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

  return query select v_color, v_inits;
end $$;
revoke all on function ps_set_avatar(text,text) from public;
grant execute on function ps_set_avatar(text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. A new run carries the avatar, stamped by a trigger rather than by editing
--    ps_submit_run(). Rewriting two hundred lines of validation to add two insert
--    columns is how validation and a copy of it drift apart. The trigger reads the
--    same profiles row that function already reads for the name, so the two cannot
--    disagree, and it does not care which version of ps_submit_run is installed.
-- ---------------------------------------------------------------------------
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
-- 6. Changing your name, or claiming a guest run, carries all three display
--    fields rather than just the name.
-- ---------------------------------------------------------------------------
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
-- 7. Existing rows get whatever their owner has chosen. A no-op on a fresh
--    install and the repair on a project where somebody chose a club between two
--    runs of this file.
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

-- `grant select` on both tables is table-wide, so the new columns need no grant of
-- their own. PostgREST does need telling that the shape changed: until its schema
-- cache reloads, calling ps_set_avatar is a 404 and selecting display_color is a
-- 400. Supabase reloads on DDL by itself; this makes it immediate.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 8. What is now in place. One row, so it reads on a phone. Every column should
--    say ok.
-- ---------------------------------------------------------------------------
select
  case when exists (select 1 from pg_attribute where attrelid=to_regclass('public.profiles')
        and attname='avatar_color' and not attisdropped) then 'ok' else 'MISSING' end
                                                                      as profiles_color,
  case when exists (select 1 from pg_attribute where attrelid=to_regclass('public.profiles')
        and attname='avatar_initials' and not attisdropped) then 'ok' else 'MISSING' end
                                                                      as profiles_initials,
  case when exists (select 1 from pg_attribute where attrelid=to_regclass('public.ps_runs')
        and attname='display_color' and not attisdropped) then 'ok' else 'MISSING' end
                                                                      as runs_color,
  case when exists (select 1 from pg_attribute where attrelid=to_regclass('public.ps_runs')
        and attname='display_initials' and not attisdropped) then 'ok' else 'MISSING' end
                                                                      as runs_initials,
  case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='ps_set_avatar') then 'ok' else 'MISSING' end
                                                                      as set_avatar_fn,
  case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='ps_set_avatar'
          and has_function_privilege('authenticated', p.oid, 'execute'))
       then 'ok' else 'NO GRANT' end                                  as signed_in_can_call,
  case when exists (select 1 from pg_trigger
        where tgrelid=to_regclass('public.ps_runs') and tgname='ps_runs_avatar_stamp')
       then 'ok' else 'MISSING' end                                   as new_run_trigger,
  (select count(*) from profiles where avatar_color is not null)      as accounts_with_a_club;
