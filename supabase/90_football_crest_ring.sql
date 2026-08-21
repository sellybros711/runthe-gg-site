-- ---------------------------------------------------------------------------
-- 90_football_crest_ring.sql : the honour ring, on everybody's row
--
-- Run AFTER 89_football_crest_tier.sql. Safe to run more than once.
--
-- WHY THIS EXISTS WHEN 88 AND 89 BOTH SAID IT WOULD NOT. Both files argued that the
-- ring did not need storing, and both leaned on the same premise the seal leaned on:
-- the ring only rendered at 40px and up, and every crest that is not your own is
-- drawn at 26px on a board row or 34px on a podium step. So a stored ring would have
-- been a column nothing could ever read.
--
-- The premise was wrong about this layer, and it was wrong in the opposite direction
-- from the seal. The ring was grouped with the pattern as texture. A pattern IS
-- texture: it is a surface treatment across the whole face, and at 26px it is a
-- smudge. The ring is a band of a second colour around the outside of the disc,
-- which is the most visible thing on a small circle rather than the least, and what
-- it says is a fact about the person: a title, two in a row, a perfect season.
--
-- So the ring draws at every size now, and without this file it would draw on the
-- leaderboard for exactly one row: yours, the only one this browser can work an
-- honour out for. That is the same sentence 89 opens with, and it is the same fix.
--
-- WHAT IT ADDS
--   * profiles.crest_ring          the honour you are wearing
--   * ps_runs.display_ring         copied onto the row, like display_tier
--   * ps_set_crest(text,text,text) the setter, now taking all three
--
-- 'club' IS STORED AS NULL, the same bargain 'init' gets in 88. Club colours are the
-- absence of an honour rather than an honour named "club", and a column that can say
-- so in two ways is a column that will eventually be asked which one it means.
--
-- ---------------------------------------------------------------------------
-- THE HONOUR IS TAKEN ON TRUST, WHICH IS THE THIRD TIME AND STILL WORTH SAYING
-- ---------------------------------------------------------------------------
-- 88 checks the rung and shape checks the mark; 89 shape checks the rank. This is
-- the same trade a third time. A ring is granted by one of three badges (a title,
-- titles in two straight seasons, an unbeaten title season), the badge catalog is
-- 387 rules living in achievements.js, and checking one here means porting rules
-- into SQL and keeping two copies in step forever.
--
-- This one is closer to checkable than the rank was, and it is worth writing down
-- why it still is not checked. ps_runs holds title_won and a record, so a title and
-- back to back titles could in principle be counted right here. What that would buy
-- is a check that agrees with achievements.js today and drifts from it the first
-- time either definition is touched, which is a worse failure than the one it
-- prevents: a wrong ring that the database insists is right.
--
-- What the check constraint below DOES do is refuse anything that is not one of the
-- three honours, which is what stops the column becoming free text on a public
-- board. A forged one is a gold circle: it moves no score, no rank on any
-- leaderboard, and nothing anybody else can lose.
-- ---------------------------------------------------------------------------

alter table profiles add column if not exists crest_ring text;
alter table ps_runs  add column if not exists display_ring text;

comment on column profiles.crest_ring is
  'The honour ring: gold, btb or perfect, or null for club colours (no honour). '
  'Derived by the client from its badges and shape checked here; see the header of '
  '90_football_crest_ring.sql for what that does and does not guarantee.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_crest_ring_ck') then
    alter table profiles add constraint profiles_crest_ring_ck
      check (crest_ring is null or crest_ring in ('gold','btb','perfect'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- ps_set_crest(): three arguments now
-- ---------------------------------------------------------------------------
-- THE TWO ARGUMENT VERSION IS DROPPED RATHER THAN LEFT ALONGSIDE, for the reason 89
-- dropped the one argument version. PostgREST resolves an RPC by the argument names
-- in the body, so a call carrying only p_mark and p_tier would match both overloads
-- and 300. Dropping it and defaulting p_ring means a client one version behind still
-- resolves, to this function, with the honour left as it was.
drop function if exists ps_set_crest(text,text);

create or replace function ps_set_crest(p_mark text, p_tier text default null,
                                        p_ring text default null)
returns table (mark text, rung smallint, tier text, ring text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_mark text;
  v_tier text;
  v_ring text;
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

  v_ring := nullif(btrim(coalesce(p_ring, '')), '');
  -- Club colours are the absence of an honour, taken here the same way 'init' is.
  if v_ring = 'club' then v_ring := null; end if;
  if v_ring is not null and v_ring not in ('gold','btb','perfect') then
    raise exception 'that is not one of the rings';
  end if;

  update profiles
     set crest_mark = v_mark,
         -- NULL MEANS "LEAVE IT", not "clear it", for these two and not for the mark.
         -- Both move on their own as badges are earned, so a client that is only
         -- changing the mark sends neither and must not wipe what it has. The mark is
         -- the opposite: it IS the thing being set, so null clears it.
         crest_tier = coalesce(v_tier, crest_tier),
         crest_ring = coalesce(v_ring, crest_ring)
   where id = v_user;
  if not found then
    raise exception 'no profile for this account';
  end if;

  return query select p.crest_mark, coalesce(p.crest_rung, 0)::smallint,
                      p.crest_tier, p.crest_ring
    from profiles p where p.id = v_user;
end $$;
revoke all on function ps_set_crest(text,text,text) from public;
grant execute on function ps_set_crest(text,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- ONE HONOUR IS ONLY EVER GIVEN UP DELIBERATELY, WHICH THIS FILE CANNOT DO
-- ---------------------------------------------------------------------------
-- coalesce above means there is no way to go back to club colours through this
-- function, and that is the right default for a value that only ever climbs: the
-- client sends the best honour it has found, and a page load that has not finished
-- reading the run history must not wipe a ring because it has not got there yet.
-- Clearing one is an admin update on profiles, deliberately not a call anybody can
-- make from a browser.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The two triggers, now carrying four fields instead of three
-- ---------------------------------------------------------------------------
-- Replaced whole rather than patched, because a trigger function has no way to add a
-- column to what it already does. Both are otherwise identical to 89's.
create or replace function profiles_crest_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.crest_mark is distinct from old.crest_mark
     or new.crest_rung is distinct from old.crest_rung
     or new.crest_tier is distinct from old.crest_tier
     or new.crest_ring is distinct from old.crest_ring then
    update ps_runs
       set display_mark = new.crest_mark,
           display_rung = coalesce(new.crest_rung, 0),
           display_tier = new.crest_tier,
           display_ring = new.crest_ring
     where user_id = new.id;
  end if;
  return null;
end $$;

drop trigger if exists profiles_crest_rows on profiles;
create trigger profiles_crest_rows
  after update of crest_mark, avatar_color, crest_rung, crest_tier, crest_ring on profiles
  for each row execute function profiles_crest_push();

-- The insert stamp, same as 89's with the honour added to the select.
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
    select username::text, avatar_color, avatar_initials, crest_mark, crest_tier, crest_ring
      into new.display_name, new.display_color, new.display_initials,
           new.display_mark, new.display_tier, new.display_ring
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

-- ps_rename_runs(): seven display fields now.
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
         display_tier     = p.crest_tier,
         display_ring     = p.crest_ring
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
-- NOTHING TO BACKFILL, for the reason 89 gives about the rank: an honour is derived
-- from badges, the badges live in the client, and there is no correct value to write
-- here. It arrives the first time each player's browser sends one, which is their
-- next visit. Until then their ring is club colours on other people's screens and
-- correct on their own, which is the honest state rather than a wrong one.
--
-- Every title ever won is sitting in ps_runs.title_won, so a backfill IS possible
-- here in a way it was not for the rank, and it is deliberately not done. See the
-- header: a value written from a rule that lives in two places is worse than an
-- absent one, because it looks settled.
--
-- The copy onto the rows still needs doing for anybody who already has an honour
-- stored, which is nobody today and somebody the second time this file is run.
update ps_runs r
   set display_ring = p.crest_ring
  from profiles p
 where p.id = r.user_id
   and r.user_id is not null
   and r.display_ring is distinct from p.crest_ring;

analyze ps_runs;
analyze profiles;

notify pgrst, 'reload schema';
