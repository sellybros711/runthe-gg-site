-- ============================================================================
-- 10_accounts.sql  —  User accounts (Phase A: core accounts)
-- ============================================================================
-- Adds real user accounts on top of the existing anonymous leaderboard:
--   • profiles            — one row per auth user (username, flag, + reserved
--                           streak fields for the upcoming daily challenge)
--   • username helpers     — username_ok / username_available / set_username
--   • set_flag             — profile flag picker
--   • handle_new_user      — auto-creates a profile row the moment a user signs up
--   • drafts.user_id        — stamps each saved draft with its owner
--   • submit_draft (v10)   — now records auth.uid() and copies the player's
--                            username + flag from their profile, so a saved score
--                            is server-attributed (no client-supplied name to forge)
--
-- Policy (per product decision):
--   • Guests may PLAY and READ the board, but a draft is only ever written by a
--     SIGNED-IN user (the client simply doesn't call submit_draft for guests).
--   • Email confirmation is ON (configured in the Supabase dashboard, not here).
--   • Streak columns are created now but left untouched until the Daily Challenge.
--
-- Idempotent: safe to re-run. Run AFTER 09_record_all_completed.sql.
-- ----------------------------------------------------------------------------

create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  username        citext unique,
  flag            text not null default '',
  -- reserved for the Daily Challenge (unused in Phase A)
  current_streak  int  not null default 0,
  longest_streak  int  not null default 0,
  last_played_date date,
  created_at      timestamptz not null default now()
);

alter table profiles enable row level security;

-- Usernames + flags are shown on the public leaderboard, so the table is
-- world-readable. There is NO direct write policy: every write goes through a
-- SECURITY DEFINER function below, which keeps validation server-side.
drop policy if exists profiles_public_read on profiles;
create policy profiles_public_read on profiles for select using (true);

-- ---------------------------------------------------------------------------
-- username validation + availability
-- ---------------------------------------------------------------------------
-- 3–20 chars, letters/numbers/underscore only. Display casing is preserved but
-- uniqueness is case-insensitive (citext), so "Pele" and "pele" can't coexist.
create or replace function username_ok(p text)
returns boolean language sql immutable as $$
  select p is not null and p ~ '^[A-Za-z0-9_]{3,20}$';
$$;

-- Public check used by the sign-up form to show "username taken / available"
-- before the account is created. Returns true only if the name is well-formed
-- AND not already in use.
create or replace function username_available(p_username text)
returns boolean
language sql security definer set search_path = public stable as $$
  select username_ok(p_username)
     and not exists (select 1 from profiles where username = p_username);
$$;
revoke all on function username_available(text) from public;
grant  execute on function username_available(text) to anon, authenticated;

-- Set / change the signed-in user's username. Validates format, enforces
-- case-insensitive uniqueness, and upserts the caller's own profile row.
create or replace function set_username(p_username text)
returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'must be signed in';
  end if;
  if not username_ok(p_username) then
    raise exception 'username must be 3-20 letters, numbers or underscores';
  end if;
  insert into profiles (id, username) values (uid, p_username)
    on conflict (id) do update set username = excluded.username;
exception when unique_violation then
  raise exception 'username taken';
end;
$$;
revoke all on function set_username(text) from public;
grant  execute on function set_username(text) to authenticated;

-- Set the signed-in user's flag (a country code string the client understands).
create or replace function set_flag(p_flag text)
returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'must be signed in';
  end if;
  insert into profiles (id, flag) values (uid, coalesce(p_flag,''))
    on conflict (id) do update set flag = excluded.flag;
end;
$$;
revoke all on function set_flag(text) from public;
grant  execute on function set_flag(text) to authenticated;

-- ---------------------------------------------------------------------------
-- auto-create a profile when a user signs up
-- ---------------------------------------------------------------------------
-- Fires on auth.users insert (i.e. at sign-up, before email confirmation). If
-- the sign-up form passed a valid, free username in user metadata we adopt it;
-- otherwise the profile starts username-less and the client prompts for one.
create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare uname text := nullif(new.raw_user_meta_data->>'username','');
begin
  if uname is not null and username_ok(uname)
     and not exists (select 1 from profiles where username = uname) then
    insert into profiles (id, username) values (new.id, uname)
      on conflict (id) do nothing;
  else
    insert into profiles (id) values (new.id)
      on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- drafts.user_id  —  owner of a saved draft
-- ---------------------------------------------------------------------------
alter table drafts
  add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists drafts_user_id_idx on drafts (user_id);

-- ---------------------------------------------------------------------------
-- submit_draft (v10)  —  stamp owner + server-attribute name/flag
-- ---------------------------------------------------------------------------
-- Same signature and scoring as 09 (server-recomputed, anti-forgery intact).
-- New: records auth.uid() and copies the caller's username + flag straight from
-- their profile, so the name shown on the board is the one tied to the account —
-- it can't be spoofed via a client-supplied string. For an anonymous caller
-- (auth.uid() IS NULL) it behaves exactly as before (no owner, no name); in
-- practice the client only calls this for signed-in users now.
create or replace function submit_draft(
  p_player_ids text[],
  p_progress   int,
  p_mode       text   default 'easy',
  p_result     text   default null,
  p_furthest   text   default null,
  p_draft_type text   default 'quick',
  p_slots      text[] default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  n_ids      int := coalesce(cardinality(p_player_ids), 0);
  n_distinct int := coalesce(cardinality(ARRAY(SELECT DISTINCT unnest(p_player_ids))), 0);
  n_found    int;
  v_avg      numeric;
  v_num99    int;
  v_caps     int;
  v_awards   int;
  v_base     numeric;
  v_mult     numeric;
  v_overall  numeric;
  v_dtype    text := CASE WHEN p_draft_type = 'full' THEN 'full' ELSE 'quick' END;
  v_prog     int  := GREATEST(0, LEAST(6, coalesce(p_progress, 0)));
  v_id       bigint;
  v_user     uuid := auth.uid();
  v_name     text := null;
  v_flag     text := null;
BEGIN
  -- ---- minimal validation: only what's needed to score honestly ----
  IF v_dtype = 'full' THEN
    IF n_ids <> 11 THEN RAISE EXCEPTION 'full draft needs 11 players, got %', n_ids; END IF;
  ELSE
    IF n_ids <> 6  THEN RAISE EXCEPTION 'quick draft needs 6 players, got %',  n_ids; END IF;
  END IF;
  IF n_ids <> n_distinct THEN RAISE EXCEPTION 'duplicate players not allowed'; END IF;

  -- ---- pull authoritative ratings for the submitted ids ----
  SELECT count(*),
         avg(wc_overall),
         count(*) FILTER (WHERE wc_overall >= 99),
         count(*) FILTER (WHERE is_captain),
         coalesce(sum(coalesce(array_length(string_to_array(nullif(award,''),'|'),1),0)),0)
    INTO n_found, v_avg, v_num99, v_caps, v_awards
  FROM wc_players
  WHERE player_id = ANY(p_player_ids);

  IF n_found <> n_ids THEN
    RAISE EXCEPTION 'unknown player id(s): % of % matched', n_found, n_ids;
  END IF;

  -- ---- recompute the score (formation-independent) ----
  v_base    := round(v_avg + v_num99 * 0.15, 1);
  v_mult    := power(1.005, v_caps) * power(1.02, v_awards);
  v_overall := round(v_base * v_mult, 1);

  -- ---- server-attributed identity (signed-in only) ----
  IF v_user IS NOT NULL THEN
    SELECT username::text, nullif(flag,'') INTO v_name, v_flag
    FROM profiles WHERE id = v_user;
  END IF;

  INSERT INTO drafts (overall, progress, mode, result, furthest, draft_type,
                      player_ids, slots, user_id, name, flag)
  VALUES (v_overall, v_prog,
          CASE WHEN p_mode = 'hard' THEN 'hard' ELSE 'easy' END,
          p_result, p_furthest, v_dtype, p_player_ids,
          CASE WHEN coalesce(cardinality(p_slots),0) = n_ids THEN p_slots ELSE NULL END,
          v_user, v_name, v_flag)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION submit_draft(text[], int, text, text, text, text, text[]) FROM public;
GRANT  EXECUTE ON FUNCTION submit_draft(text[], int, text, text, text, text, text[]) TO anon, authenticated;
