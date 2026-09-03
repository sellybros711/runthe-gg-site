-- ---------------------------------------------------------------------------
-- A test for 88_football_crests.sql, against a real Postgres.
--
-- 88 adds two triggers to `profiles` and rewrites the one on `ps_runs`, and it
-- backfills a column onto every row of every account that has ever played. That is
-- not a file to hand somebody and hope, so this runs it against a stand-in schema
-- and checks what it does.
--
--   createdb crest_test
--   psql -d crest_test -f supabase/test/crests_base.sql
--   psql -d crest_test -f supabase/87_football_board_axes.sql
--   psql -d crest_test -f supabase/88_football_crests.sql
--   psql -d crest_test -f supabase/test/crests_test.sql
--
-- The last file prints one line per check. Every line should start with " ok ".
--
-- It needs a role called `authenticated`, which Supabase has and a bare cluster
-- does not: create role authenticated;
--
-- WHAT THE STAND-IN IS AND IS NOT. crests_base.sql has only the columns 87 and 88
-- read or write, plus auth.uid(), ps_is_franchise() and 55's ps_set_avatar. It is
-- deliberately NOT a copy of the real schema: 88 is supposed to leave
-- ps_set_avatar alone, and the way to test that is to install 55's version here
-- and check it still behaves afterwards.
-- ---------------------------------------------------------------------------

-- A stand-in for the parts of the real schema that 87 and 88 touch. Only the
-- columns those two files read or write, plus the two things Supabase provides.
drop schema if exists auth cascade;
create schema auth;
create table auth.session (uid uuid);
create or replace function auth.uid() returns uuid
  language sql stable as $$ select uid from auth.session limit 1 $$;

drop table if exists ps_runs cascade;
drop table if exists profiles cascade;

create table profiles (
  id uuid primary key,
  username text,
  avatar_color text,
  avatar_initials text
);

create table ps_runs (
  id bigserial primary key,
  user_id uuid,
  created_at timestamptz not null default now(),
  run_mode text not null,
  franchise text,
  era text,
  wins int, losses int, games int,
  regular_wins int, playoff_wins int,
  point_diff numeric,
  points_allowed numeric,
  team_rating numeric,
  gm_rating numeric,
  made_playoffs boolean,
  title_won boolean,
  perfect boolean,
  seed_label text,
  score bigint,
  display_name text,
  display_color text,
  display_initials text
);

-- 55 installs this; 88 does not create it and must not.
create or replace function ps_is_franchise(p text) returns boolean
  language sql immutable as $$ select p = any (array[
    'ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU',
    'IND','JAX','KC','LAC','LAR','LV','MIA','MIN','NE','NO','NYG','NYJ','PHI',
    'PIT','SEA','SF','TB','TEN','WAS']) $$;

-- 55's ps_set_avatar, verbatim in behaviour, so the test exercises the real one
-- rather than a version this migration wrote.
create or replace function ps_set_avatar(p_color text, p_initials text)
returns table (color text, initials text)
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_color text; v_inits text;
begin
  if v_user is null then raise exception 'sign in first'; end if;
  v_color := nullif(upper(btrim(coalesce(p_color, ''))), '');
  if v_color is not null and not ps_is_franchise(v_color) then
    raise exception 'that is not one of the thirty-two clubs';
  end if;
  v_inits := upper(regexp_replace(coalesce(p_initials, ''), '[^A-Za-z0-9]', '', 'g'));
  v_inits := nullif(left(v_inits, 2), '');
  update profiles set avatar_color = v_color, avatar_initials = v_inits where id = v_user;
  if not found then raise exception 'no profile for this account'; end if;
  update ps_runs set display_color = v_color, display_initials = v_inits where user_id = v_user;
  return query select v_color, v_inits;
end $$;

-- The trigger 55/58 install, before 88 replaces it.
create or replace function ps_runs_stamp_avatar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null then
    select username::text, avatar_color, avatar_initials
      into new.display_name, new.display_color, new.display_initials
      from profiles where id = new.user_id;
  end if;
  return new;
end $$;
drop trigger if exists ps_runs_avatar_stamp on ps_runs;
create trigger ps_runs_avatar_stamp before insert on ps_runs
  for each row execute function ps_runs_stamp_avatar();
