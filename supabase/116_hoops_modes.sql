-- ---------------------------------------------------------------------------
-- 116_hoops_modes.sql: the boards for Run The Floor's three other modes
-- ---------------------------------------------------------------------------
--
--   Fix History   the daily: one real team, one move, the title odds it buys
--   Six Passes    the daily: one player to another through real teammates
--   Conquest      winners stay on: how many real teams in a row
--
-- ONE TABLE, NOT THREE, and not rtf_runs. rtf_runs is a finished SEASON and
-- every column on it is about one; none of these is a season. What the three
-- share is exactly what a board needs (who, when, which day, and a number to
-- rank on), so they share a table and keep their own columns beside it.
--
-- `score` IS DERIVED HERE AND NEVER SENT, the rule 108 argues at length. Each
-- mode has its own submit function, the client sends the RESULT (the odds, the
-- chain, the wins) and the function works out what it is worth. Higher is
-- always better, so every board reads one index the same way:
--
--   fix        the title odds, 0 to 1, to four places
--   passes     100 minus the passes for a solved chain, 0 for a shot clock
--   conquest   the wins
--
-- Ties go to whoever got there first.
--
-- WHAT IT DOES NOT DO is replay the play. A Fix History score is a thousand
-- seasons of the engine and a Six Passes chain is a walk over sixteen thousand
-- player-seasons, and neither belongs in plpgsql. So the odds and the wins are
-- trusted within their bounds, which is 108's position on a season's record,
-- and what IS checked is everything that can be: the day is today, a chain is
-- no longer than the shot clock, and one account files one of each daily.
--
-- Idempotent: safe to run twice.
-- ---------------------------------------------------------------------------

create table if not exists rtf_plays (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  -- Nullable, so a play finished signed out records and can be claimed.
  user_id       uuid,
  -- Read out of profiles for auth.uid(), never sent.
  display_name  text,
  mode          text not null,
  -- The Eastern day the play belongs to, counted from the same epoch as 108's
  -- daily. For Conquest it is the day the run ended, which is what a "today"
  -- board reads; set by the server there, not by the client.
  day           integer not null,
  score         numeric(10,4) not null,

  -- Fix History
  fix_ts        text,          -- the team, 'BOS_2009'
  fix_slot      smallint,      -- 0 to 4, PG to C
  fix_out       text,          -- the man traded away, as a pkey
  fix_in        text,          -- the man brought in, as a pkey
  fix_odds      numeric(6,4),
  fix_base      numeric(6,4),
  replay_wins   smallint,
  replay_title  boolean,

  -- Six Passes
  passes        smallint,
  par           smallint,
  solved        boolean,
  chain         text[],

  -- Conquest
  cq_wins       integer,
  cq_lives      smallint,
  cq_cleared    boolean,
  cq_lost_to    text,          -- the team that ended it
  cq_roster     text[],        -- the five it finished with, as pkeys
  cq_took       text[],        -- every man taken, in order
  seed          text,

  constraint rtf_plays_mode_chk check (mode in ('fix','passes','conquest')),
  constraint rtf_plays_day_chk check (day > 0)
);

alter table rtf_plays enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'rtf_plays'
                    and policyname = 'rtf_plays_read') then
    create policy rtf_plays_read on rtf_plays for select using (true);
  end if;
end $$;

-- RLS narrows a grant, it does not make one. Read only for both roles; the
-- three functions below are the only writers.
revoke all on rtf_plays from anon, authenticated;
grant select on rtf_plays to anon, authenticated;

-- Every query the page makes: one board is (mode, day) ranked, the other is
-- (mode) ranked for the all-time Conquest list.
create index if not exists rtf_plays_day_idx
  on rtf_plays (mode, day, score desc, created_at asc);
create index if not exists rtf_plays_all_idx
  on rtf_plays (mode, score desc, created_at asc);
create index if not exists rtf_plays_user_idx
  on rtf_plays (user_id, created_at desc) where user_id is not null;
create index if not exists rtf_plays_move_idx
  on rtf_plays (day, fix_in) where mode = 'fix';

-- ONE OF EACH DAILY PER ACCOUNT, and the first stands. Built only when the
-- table does not already break it, the way 108 builds its own.
do $$
begin
  if not exists (select 1 from pg_indexes where indexname = 'rtf_plays_daily_one_idx') then
    if exists (select 1 from rtf_plays where mode in ('fix','passes') and user_id is not null
                group by user_id, mode, day having count(*) > 1) then
      raise notice 'rtf_plays holds a second daily for some account; one-a-day index not created';
    else
      create unique index rtf_plays_daily_one_idx
        on rtf_plays (user_id, mode, day)
        where mode in ('fix','passes') and user_id is not null;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The day, in Eastern time, from the epoch 108 uses. One function so the three
-- submits cannot disagree about what today is.
-- ---------------------------------------------------------------------------
create or replace function rtf_play_today()
returns integer
language sql stable as $$
  select (((now() at time zone 'America/New_York')::date - date '2026-09-18') + 1)::int
$$;

-- A day either side of today, for a play in progress across midnight.
create or replace function rtf_play_day_ok(p_day int)
returns boolean
language sql stable as $$
  select p_day is not null and p_day >= 1
     and p_day between rtf_play_today() - 1 and rtf_play_today() + 1
$$;

-- ---------------------------------------------------------------------------
-- Fix History
-- ---------------------------------------------------------------------------
create or replace function rtf_submit_fix(
  p_day int, p_ts text, p_slot int, p_out text, p_in text,
  p_odds numeric, p_base numeric, p_replay_wins int, p_replay_title boolean
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_id bigint;
begin
  if not rtf_play_day_ok(p_day) then
    raise exception 'day % is not close enough to today (day %)', p_day, rtf_play_today();
  end if;
  if p_ts is null or p_ts !~ '^[A-Z]{2,4}_[0-9]{4}$' then raise exception 'team looks wrong'; end if;
  if p_slot is null or p_slot < 0 or p_slot > 4 then raise exception 'slot must be 0 to 4'; end if;
  if p_out is null or p_out !~ '^[a-z0-9.''-]{2,16}\|[0-9]{4}\|[A-Z]{2,4}$' then raise exception 'traded player looks wrong'; end if;
  if p_in is null or p_in !~ '^[a-z0-9.''-]{2,16}\|[0-9]{4}\|[A-Z]{2,4}$' then raise exception 'new player looks wrong'; end if;
  if p_odds is null or p_odds < 0 or p_odds > 1 then raise exception 'odds must be 0 to 1'; end if;
  if p_base is null or p_base < 0 or p_base > 1 then raise exception 'base odds must be 0 to 1'; end if;
  if p_replay_wins is not null and (p_replay_wins < 0 or p_replay_wins > 82) then
    raise exception 'replay wins must be 0 to 82';
  end if;

  if v_user is not null then
    select username::text into v_name from profiles where id = v_user;
    select id into v_id from rtf_plays
     where user_id = v_user and mode = 'fix' and day = p_day order by created_at limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  -- A retry after a timeout lands on the row already there.
  select id into v_id from rtf_plays
   where mode = 'fix' and day = p_day and fix_in = p_in and fix_slot = p_slot
     and user_id is not distinct from v_user and created_at > now() - interval '1 minute'
   limit 1;
  if v_id is not null then return v_id; end if;

  insert into rtf_plays (user_id, display_name, mode, day, score,
    fix_ts, fix_slot, fix_out, fix_in, fix_odds, fix_base, replay_wins, replay_title)
  values (v_user, v_name, 'fix', p_day, round(p_odds, 4),
    p_ts, p_slot, p_out, p_in, round(p_odds, 4), round(p_base, 4), p_replay_wins, p_replay_title)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function rtf_submit_fix(int,text,int,text,text,numeric,numeric,int,boolean) from public;
grant execute on function rtf_submit_fix(int,text,int,text,text,numeric,numeric,int,boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Six Passes
-- ---------------------------------------------------------------------------
-- The chain includes the man who starts with the ball, so passes are its
-- length minus one. Ten is the shot clock.
create or replace function rtf_submit_passes(
  p_day int, p_chain text[], p_par int, p_solved boolean
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_id bigint;
  v_passes int;
  v_i int;
begin
  if not rtf_play_day_ok(p_day) then
    raise exception 'day % is not close enough to today (day %)', p_day, rtf_play_today();
  end if;
  v_passes := coalesce(array_length(p_chain, 1), 0) - 1;
  if v_passes < 1 or v_passes > 10 then raise exception 'a chain is 1 to 10 passes'; end if;
  if p_par is null or p_par < 1 or p_par > 6 then raise exception 'par must be 1 to 6'; end if;
  if p_solved is null then raise exception 'solved must be said'; end if;
  -- Solved cannot beat par, because par is the shortest chain there is.
  if p_solved and v_passes < p_par then raise exception 'a solved chain cannot be under par'; end if;
  for v_i in 1 .. array_length(p_chain, 1) loop
    if p_chain[v_i] is null or p_chain[v_i] !~ '^[a-z0-9.''-]{2,16}$' then
      raise exception 'player id looks wrong: %', p_chain[v_i];
    end if;
  end loop;

  if v_user is not null then
    select username::text into v_name from profiles where id = v_user;
    select id into v_id from rtf_plays
     where user_id = v_user and mode = 'passes' and day = p_day order by created_at limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  select id into v_id from rtf_plays
   where mode = 'passes' and day = p_day and chain = p_chain
     and user_id is not distinct from v_user and created_at > now() - interval '1 minute'
   limit 1;
  if v_id is not null then return v_id; end if;

  insert into rtf_plays (user_id, display_name, mode, day, score, passes, par, solved, chain)
  values (v_user, v_name, 'passes', p_day,
    case when p_solved then 100 - v_passes else 0 end,
    v_passes, p_par, p_solved, p_chain)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function rtf_submit_passes(int,text[],int,boolean) from public;
grant execute on function rtf_submit_passes(int,text[],int,boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Conquest
-- ---------------------------------------------------------------------------
-- A run is filed once, when it ends. The seed is what identifies it, so a
-- second submit of the same run hands back the first row.
create or replace function rtf_submit_conquest(
  p_wins int, p_lives int, p_cleared boolean, p_lost_to text,
  p_roster text[], p_took text[], p_seed text
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_id bigint;
begin
  if p_wins is null or p_wins < 0 or p_wins > 1000 then raise exception 'wins must be 0 to 1000'; end if;
  if p_lives is null or p_lives < 0 or p_lives > 3 then raise exception 'lives must be 0 to 3'; end if;
  if p_seed is null or p_seed !~ '^[a-z0-9]{6,40}$' then raise exception 'seed looks wrong'; end if;
  if p_lost_to is not null and p_lost_to !~ '^[A-Z]{2,4}_[0-9]{4}$' then raise exception 'team looks wrong'; end if;
  if p_roster is not null and coalesce(array_length(p_roster, 1), 0) <> 5 then
    raise exception 'a roster is five';
  end if;
  if coalesce(array_length(p_took, 1), 0) > p_wins then raise exception 'more steals than wins'; end if;

  select id into v_id from rtf_plays
   where mode = 'conquest' and seed = p_seed and user_id is not distinct from v_user limit 1;
  if v_id is not null then return v_id; end if;

  if v_user is not null then
    select username::text into v_name from profiles where id = v_user;
  end if;

  insert into rtf_plays (user_id, display_name, mode, day, score,
    cq_wins, cq_lives, cq_cleared, cq_lost_to, cq_roster, cq_took, seed)
  values (v_user, v_name, 'conquest', rtf_play_today(), p_wins,
    p_wins, p_lives, coalesce(p_cleared, false), p_lost_to, p_roster, p_took, p_seed)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function rtf_submit_conquest(int,int,boolean,text,text[],text[],text) from public;
grant execute on function rtf_submit_conquest(int,int,boolean,text,text[],text[],text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Claiming a play finished signed out, and keeping names honest on a rename.
-- Same guards as rtf_claim_run: only an unowned row, and never a second daily.
-- ---------------------------------------------------------------------------
create or replace function rtf_claim_play(p_id bigint)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_rows int;
begin
  if v_user is null then return false; end if;
  select username::text into v_name from profiles where id = v_user;
  update rtf_plays r
     set user_id = v_user, display_name = v_name
   where r.id = p_id and r.user_id is null
     and not (r.mode in ('fix','passes') and exists (
       select 1 from rtf_plays o
        where o.user_id = v_user and o.mode = r.mode and o.day = r.day));
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;
revoke all on function rtf_claim_play(bigint) from public;
grant execute on function rtf_claim_play(bigint) to authenticated;

create or replace function rtf_rename_plays()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_rows int;
begin
  if v_user is null then return 0; end if;
  select username::text into v_name from profiles where id = v_user;
  update rtf_plays set display_name = v_name where user_id = v_user;
  get diagnostics v_rows = row_count;
  return v_rows;
end $$;
revoke all on function rtf_rename_plays() from public;
grant execute on function rtf_rename_plays() to authenticated;

analyze rtf_plays;
