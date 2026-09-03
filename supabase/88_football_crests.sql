-- ---------------------------------------------------------------------------
-- 88_football_crests.sql : the profile crest, on everybody's row
--
-- Run AFTER 55_football_avatars_setup.sql. Safe to run more than once.
--
-- WHAT THIS IS FOR. The crest has been drawing for a while, and only ever for the
-- person looking at it. A crest is built out of what somebody has actually done,
-- and this browser knows what THIS player has done and nothing about anybody else,
-- so a leaderboard rendered one crest and nineteen flat discs. These two columns
-- are what let a row carry its own.
--
-- WHAT IT ADDS
--   * profiles.crest_mark            the shape you wear, your choice
--   * profiles.crest_rung            how far up your club's ladder you are, derived
--   * ps_runs.display_mark           copied onto the row, like display_color
--   * ps_runs.display_rung           same
--   * ps_crest_rung()                the ladder, computed from the rows themselves
--   * ps_set_crest()                 the setter, validated
--   * ps_runs_stamp_avatar()         extended to stamp all five display fields
--
-- ---------------------------------------------------------------------------
-- WHY ONLY TWO OF THE FIVE LAYERS ARE STORED
-- ---------------------------------------------------------------------------
-- A crest has a colourway, a pattern, a mark, a rank seal and a ring. Only the
-- colourway and the mark are here, and that is the size rule doing its job rather
-- than an omission.
--
-- The renderer draws a pattern, a seal and a ring treatment at 40px and up, and
-- below that a crest is colourway and mark only, because on a 26px board row the
-- rest is a smudge. Every crest belonging to somebody else is drawn at 26px on a
-- board row or 34px on a podium step. So the three layers this file does not store
-- are three layers nobody else's crest can render anyway.
--
-- That is worth stating because of what it saves. The rank seal is a badge COUNT,
-- and the badge catalog is 387 rules living in achievements.js. Storing the seal
-- would have meant either porting all 387 into SQL, or taking the client's word for
-- a number nobody can check. The size rule means neither, and the day something
-- renders another player at 40px is the day this file needs a third column, not
-- before.
--
-- ---------------------------------------------------------------------------
-- WHAT IS VERIFIED AND WHAT IS TAKEN ON TRUST
-- ---------------------------------------------------------------------------
-- THE RUNG IS COMPUTED HERE, from the caller's own rows, and the client cannot
-- send it. It is what gates a club's colours, and it is three flags over ps_runs,
-- so there is no reason for it to be anything but exact.
--
-- THE MARK IS SHAPE CHECKED AND NOT EARNING CHECKED. It has to be one of the
-- thirteen names below; whether the player has unlocked it is not asked. Every
-- mark is unlocked by a badge, and those badges are the same 387 rules, so
-- verifying here would mean the same port and the same drift. The game only ever
-- SENDS a mark it has verified, so the honest path is honest; a forged one costs a
-- shape in a circle and touches no score, no rank and no leaderboard.
--
-- This is exactly the bargain avatar_color already makes: a fixed list of allowed
-- values, and no claim that the value was deserved.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The choice, on the account
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists crest_mark text;
alter table profiles add column if not exists crest_rung smallint;

comment on column profiles.crest_mark is
  'The shape inside the crest: one of the names in profiles_crest_mark_ck, or null '
  'for the monogram. The client owns what each one looks like.';
comment on column profiles.crest_rung is
  'How far up avatar_color''s ladder this account is: 0 none, 1 played a draft with '
  'them, 2 reached the playoffs, 3 won it all. Derived by ps_crest_rung(), never '
  'accepted from a client.';

-- Constraints separately and idempotently: `add column if not exists` will not add
-- a constraint to a column an earlier run already created.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_crest_mark_ck') then
    alter table profiles add constraint profiles_crest_mark_ck
      check (crest_mark is null or crest_mark in
        ('pad','posts','egg','signal','rafters','wall','headset',
         'clipboard','ticket','crown','trophy','dog'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_crest_rung_ck') then
    alter table profiles add constraint profiles_crest_rung_ck
      check (crest_rung is null or crest_rung between 0 and 3);
  end if;
end $$;

-- 'init' is the monogram and is NOT in the list above, deliberately. It is the
-- absence of a mark rather than one of them, so it is stored as null and there is
-- only one way to say "no mark" instead of two that have to agree.

-- ---------------------------------------------------------------------------
-- The copy, on the run
-- ---------------------------------------------------------------------------
-- Denormalised for the reason 51 and 53 both spell out: the alternative is
-- embedding profiles in every board read, which turns the counting queries and both
-- list queries into joins, and those counts are index-only scans today.
alter table ps_runs add column if not exists display_mark text;
alter table ps_runs add column if not exists display_rung smallint;

-- ---------------------------------------------------------------------------
-- ps_crest_rung(): the ladder, from the rows
-- ---------------------------------------------------------------------------
-- One Franchise is the only mode where a club is chosen, so it is the only mode
-- that can earn a club's colours. A row is one season with that club, and the rung
-- is the best any of them reached.
--
-- Rung 1 is ONE draft, not five. A colourway is the crest's identity rather than a
-- reward, and gating identity behind five sittings means a new player's first four
-- runs are played by somebody who looks like nobody. The two rungs above it are the
-- hard ones.
create or replace function ps_crest_rung(p_user uuid, p_club text)
returns smallint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(
    case when title_won then 3
         when made_playoffs then 2
         else 1 end), 0)::smallint
    from ps_runs
   where user_id = p_user
     and run_mode = 'club'
     and franchise = p_club;
$$;
revoke all on function ps_crest_rung(uuid,text) from public;
grant execute on function ps_crest_rung(uuid,text) to authenticated;

-- ---------------------------------------------------------------------------
-- ps_set_crest(): the only way crest_mark is ever written
-- ---------------------------------------------------------------------------
-- Validates and stores, and nothing else. The rung and the copy onto ps_runs are
-- both handled by the two triggers below, so this function cannot forget either of
-- them and neither can anything else that writes profiles.
--
-- Empty string is taken as "clear it", because that is what a cleared field sends
-- and asking the client to send null instead is a rule somebody will forget.
--
-- Returns what it actually stored, so the client renders what the database accepted
-- rather than what it hoped for.
create or replace function ps_set_crest(p_mark text)
returns table (mark text, rung smallint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_mark text;
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

  update profiles set crest_mark = v_mark where id = v_user;
  if not found then
    raise exception 'no profile for this account';
  end if;

  return query select p.crest_mark, coalesce(p.crest_rung, 0)::smallint
    from profiles p where p.id = v_user;
end $$;
revoke all on function ps_set_crest(text) from public;
grant execute on function ps_set_crest(text) to authenticated;

-- ---------------------------------------------------------------------------
-- THE RUNG FOLLOWS THE CLUB, and ps_set_avatar is NOT the place to do it
-- ---------------------------------------------------------------------------
-- Picking a different club is picking a different ladder, so the stored rung has
-- to move or somebody who swaps to a club they have never drafted with keeps the
-- rung they earned with the last one.
--
-- THIS IS A TRIGGER AND NOT AN EDIT TO ps_set_avatar, and 58 is the reason. That
-- function has been rewritten from an older copy of itself twice, and both times
-- the rewrite silently dropped a field nobody noticed for weeks. The version
-- installed by 55 uppercases the club and checks it against ps_is_franchise(); a
-- copy of it in this file would be a third version to keep in step, and the first
-- draft of this file had already lost both of those lines before it was read back.
--
-- So nothing here touches it. A write to profiles recomputes the rung whatever made
-- the write, which also covers the next thing that sets avatar_color.
create or replace function profiles_crest_rung_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.avatar_color is distinct from old.avatar_color then
    new.crest_rung := case when new.avatar_color is null then 0::smallint
                           else ps_crest_rung(new.id, new.avatar_color) end;
  end if;
  return new;
end $$;

drop trigger if exists profiles_crest_rung on profiles;
create trigger profiles_crest_rung
  before insert or update of avatar_color on profiles
  for each row execute function profiles_crest_rung_sync();

-- And the copy onto the rows, after the write has landed. A separate AFTER trigger
-- rather than more work in the BEFORE one: this touches a different table, and
-- doing it before profiles has committed its own change would copy a value that may
-- still be rolled back.
create or replace function profiles_crest_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.crest_mark is distinct from old.crest_mark
     or new.crest_rung is distinct from old.crest_rung then
    update ps_runs
       set display_mark = new.crest_mark,
           display_rung = coalesce(new.crest_rung, 0)
     where user_id = new.id;
  end if;
  return null;
end $$;

drop trigger if exists profiles_crest_rows on profiles;
create trigger profiles_crest_rows
  after update of crest_mark, avatar_color, crest_rung on profiles
  for each row execute function profiles_crest_push();

-- ---------------------------------------------------------------------------
-- The stamp trigger: five display fields now, not three
-- ---------------------------------------------------------------------------
-- 55 installs this to stamp the colour and the initials, and 58 added the name for
-- the reason it explains at length: ps_submit_run() has been rewritten twice from a
-- version that predated accounts, and both times it silently dropped a display
-- field. A trigger cannot be lost that way, so everything display goes here.
--
-- THE RUNG IS RECOMPUTED ON EVERY INSERT, and that is the point of doing it here.
-- The run being inserted can be the one that earns the next rung: the first draft
-- with a club, the first playoff berth, the first title. Reading the stored rung
-- would stamp the row one step behind the season that just changed it.
--
-- It reads NEW rather than the table for that row, because the row is not in the
-- table yet: a BEFORE INSERT trigger fires ahead of the write, so ps_crest_rung()
-- cannot see it. The case below folds this run in by hand.
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
    select username::text, avatar_color, avatar_initials, crest_mark
      into new.display_name, new.display_color, new.display_initials, new.display_mark
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

    -- And keep the account's own copy level with the row, so the profile and the
    -- board agree without a second round trip from the client.
    update profiles set crest_rung = v_rung where id = new.user_id;
  end if;
  return new;
end $$;

-- `create trigger` has no `or replace` before Postgres 14 and no `if not exists` at
-- all, so it is dropped first to keep this file safe to run twice.
drop trigger if exists ps_runs_avatar_stamp on ps_runs;
create trigger ps_runs_avatar_stamp
  before insert on ps_runs
  for each row execute function ps_runs_stamp_avatar();

-- ---------------------------------------------------------------------------
-- ps_rename_runs(): syncs all five now
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
         display_initials = p.avatar_initials,
         display_mark     = p.crest_mark,
         display_rung     = coalesce(p.crest_rung, 0)
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
-- THE RUNG IS THE PART THAT MATTERS. Nobody has a mark yet, so that half is a
-- no-op today and correct tomorrow. The rung is not: every account that has ever
-- played One Franchise has already earned one, and shipping without this would show
-- every one of them the generic slate crest until their next run stamped a row.
--
-- Written as one pass over profiles rather than per row of ps_runs, because the
-- rung is a property of the account and its club, not of the season.
update profiles p
   set crest_rung = case when p.avatar_color is null then 0::smallint
                         else ps_crest_rung(p.id, p.avatar_color) end
 where p.crest_rung is distinct from
       (case when p.avatar_color is null then 0::smallint
             else ps_crest_rung(p.id, p.avatar_color) end);

update ps_runs r
   set display_mark = p.crest_mark,
       display_rung = coalesce(p.crest_rung, 0)
  from profiles p
 where p.id = r.user_id
   and r.user_id is not null
   and (r.display_mark is distinct from p.crest_mark
     or r.display_rung is distinct from coalesce(p.crest_rung, 0));

analyze ps_runs;
analyze profiles;

-- No grants needed on the two new columns: `grant select on ps_runs` in 50 and the
-- world-read policy on profiles in 10 are both table wide. PostgREST does have to
-- be told the tables changed shape, or selecting display_mark is a 400 until its
-- schema cache reloads on its own.
notify pgrst, 'reload schema';
