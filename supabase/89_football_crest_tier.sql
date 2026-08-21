-- ---------------------------------------------------------------------------
-- 89_football_crest_tier.sql : the rank seal, on everybody's row
--
-- Run AFTER 88_football_crests.sql. Safe to run more than once.
--
-- WHY THIS EXISTS WHEN 88 SAID IT WOULD NOT. 88 stored the colourway and the mark
-- and argued at length that the rank seal did not need storing, because the seal
-- only rendered at 40px and up and every crest that is not your own is drawn at
-- 26px on a board row or 34px on a podium step.
--
-- That argument was sound and its premise has changed. The seal now draws at every
-- size, because a rank is a fact about the person whose name is next to it rather
-- than texture, and the METAL carries it without the glyph: bronze, silver, gold
-- and the holographic one are four different colours before they are ten different
-- ranks. What obeys the size rule now is the chevrons inside the seal, which are
-- mush at 26px and are dropped there.
--
-- So the seal is on the leaderboard, and without this file it would be on the
-- leaderboard for exactly one row: yours, the only one this browser can work a rank
-- out for.
--
-- WHAT IT ADDS
--   * profiles.crest_tier      the rank you are wearing
--   * ps_runs.display_tier     copied onto the row, like display_mark
--   * ps_set_crest(text,text)  the setter, now taking both
--
-- ---------------------------------------------------------------------------
-- THE RANK IS TAKEN ON TRUST, AND THAT IS A REAL COST
-- ---------------------------------------------------------------------------
-- 88 checks the rung itself and only shape checks the mark. This is the same
-- bargain again and it is worth naming rather than sliding past: a rank is a badge
-- COUNT, the badge catalog is 387 rules living in achievements.js, and there is no
-- way to check a count here without porting all 387 into SQL and then keeping two
-- copies of every rule in step forever.
--
-- What the check constraint below CAN do is refuse anything that is not one of the
-- ten ranks, which is what stops the column becoming free text on a public board.
-- The game only ever sends a rank it worked out from rows the database itself
-- returned, so the honest path is honest. A forged one is a coloured dot: it moves
-- no score, no rank on any leaderboard, and nothing anybody else can lose.
--
-- If that ever stops being an acceptable trade, the fix is not to check it here. It
-- is to have the client send its badge COUNT, keep the count on the row, and derive
-- the rank from it in one place. The count is just as forgeable, but it is one
-- number rather than a name, and a wrong one would be visible as an absurdity
-- rather than as a plausible seal.
-- ---------------------------------------------------------------------------

alter table profiles add column if not exists crest_tier text;
alter table ps_runs  add column if not exists display_tier text;

comment on column profiles.crest_tier is
  'The rank seal: one of the ten names in profiles_crest_tier_ck, or null for '
  'unranked. Derived by the client from its badge count and shape checked here; '
  'see the header of 89_football_crest_tier.sql for what that does and does not '
  'guarantee.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_crest_tier_ck') then
    alter table profiles add constraint profiles_crest_tier_ck
      check (crest_tier is null or crest_tier in
        ('bronze1','bronze2','bronze3',
         'silver1','silver2','silver3',
         'gold1','gold2','gold3','goat'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- ps_set_crest(): two arguments now
-- ---------------------------------------------------------------------------
-- THE ONE ARGUMENT VERSION IS DROPPED RATHER THAN LEFT ALONGSIDE. Postgres would
-- happily hold both as overloads, and PostgREST resolves an RPC by the argument
-- names it is given, so a call with only p_mark would match both and 300. Dropping
-- it and giving p_tier a default means a client one version behind still resolves,
-- to this function, with the rank left as it was.
drop function if exists ps_set_crest(text);

create or replace function ps_set_crest(p_mark text, p_tier text default null)
returns table (mark text, rung smallint, tier text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_mark text;
  v_tier text;
begin
  if v_user is null then
    raise exception 'sign in first';
  end if;

  v_mark := nullif(btrim(coalesce(p_mark, '')), '');
  -- The monogram arrives as its own name from a client that does not know it is
  -- stored as absence. Taken here rather than made the client's problem.
  if v_mark = 'init' then v_mark := null; end if;
  if v_mark is not null and v_mark not in
     ('pad','posts','egg','signal','rafters','wall','headset',
      'clipboard','ticket','crown','trophy','dog') then
    raise exception 'that is not one of the marks';
  end if;

  v_tier := nullif(btrim(coalesce(p_tier, '')), '');
  if v_tier is not null and v_tier not in
     ('bronze1','bronze2','bronze3','silver1','silver2','silver3',
      'gold1','gold2','gold3','goat') then
    raise exception 'that is not one of the ranks';
  end if;

  update profiles
     set crest_mark = v_mark,
         -- NULL MEANS "LEAVE IT", not "clear it", and only for this one column. The
         -- rank moves on its own as badges are earned, so a client that is only
         -- changing the mark sends no rank and must not wipe the one it has. The
         -- mark is the opposite: it IS the thing being set, so null clears it.
         crest_tier = coalesce(v_tier, crest_tier)
   where id = v_user;
  if not found then
    raise exception 'no profile for this account';
  end if;

  return query select p.crest_mark, coalesce(p.crest_rung, 0)::smallint, p.crest_tier
    from profiles p where p.id = v_user;
end $$;
revoke all on function ps_set_crest(text,text) from public;
grant execute on function ps_set_crest(text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- The two triggers 88 installed, now carrying three fields instead of two
-- ---------------------------------------------------------------------------
-- Replaced whole rather than patched, because a trigger function has no way to add
-- a column to what it already does. Both are otherwise identical to 88's.
create or replace function profiles_crest_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.crest_mark is distinct from old.crest_mark
     or new.crest_rung is distinct from old.crest_rung
     or new.crest_tier is distinct from old.crest_tier then
    update ps_runs
       set display_mark = new.crest_mark,
           display_rung = coalesce(new.crest_rung, 0),
           display_tier = new.crest_tier
     where user_id = new.id;
  end if;
  return null;
end $$;

drop trigger if exists profiles_crest_rows on profiles;
create trigger profiles_crest_rows
  after update of crest_mark, avatar_color, crest_rung, crest_tier on profiles
  for each row execute function profiles_crest_push();

-- The insert stamp, same as 88's with the rank added to the select.
create or replace function ps_runs_stamp_avatar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club text;
  v_rung smallint;
begin
  if new.user_id is not null then
    select username::text, avatar_color, avatar_initials, crest_mark, crest_tier
      into new.display_name, new.display_color, new.display_initials,
           new.display_mark, new.display_tier
      from profiles where id = new.user_id;

    v_club := new.display_color;
    if v_club is null then
      v_rung := 0;
    else
      v_rung := ps_crest_rung(new.user_id, v_club);
      -- This run, folded in ahead of its own insert.
      if new.run_mode = 'club' and new.franchise = v_club then
        v_rung := greatest(v_rung,
          case when new.title_won then 3
               when new.made_playoffs then 2
               else 1 end);
      end if;
    end if;
    new.display_rung := v_rung;

    update profiles set crest_rung = v_rung where id = new.user_id;
  end if;
  return new;
end $$;

drop trigger if exists ps_runs_avatar_stamp on ps_runs;
create trigger ps_runs_avatar_stamp
  before insert on ps_runs
  for each row execute function ps_runs_stamp_avatar();

-- ps_rename_runs(): six display fields now.
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
         display_initials = p.avatar_initials,
         display_mark     = p.crest_mark,
         display_rung     = coalesce(p.crest_rung, 0),
         display_tier     = p.crest_tier
    from profiles p
   where p.id = v_user and r.user_id = v_user;
  get diagnostics v_rows = row_count;
  return v_rows;
end $$;
revoke all on function ps_rename_runs() from public;
grant execute on function ps_rename_runs() to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------
-- NOTHING TO BACKFILL, and this is the one column where that is genuinely true
-- rather than true for now. A rank cannot be computed here at all, so there is no
-- correct value to write: it arrives the first time each player's browser sends
-- one, which is their next visit. Until then their seal is absent on other
-- people's screens and correct on their own, which is the honest state rather than
-- a wrong one.
--
-- The copy onto the rows still needs doing for anybody who already has a rank
-- stored, which is nobody today and somebody the second time this file is run.
update ps_runs r
   set display_tier = p.crest_tier
  from profiles p
 where p.id = r.user_id
   and r.user_id is not null
   and r.display_tier is distinct from p.crest_tier;

analyze ps_runs;
analyze profiles;

notify pgrst, 'reload schema';
