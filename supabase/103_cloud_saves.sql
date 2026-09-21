-- ---------------------------------------------------------------------------
-- 103_cloud_saves.sql : a run in progress belongs to the ACCOUNT, not to the
-- browser it was started in.
--
-- Safe to run more than once.
--
-- ---------------------------------------------------------------------------
-- WHAT localStorage LOSES, AND HOW QUIETLY
-- ---------------------------------------------------------------------------
-- A dynasty and a commissioner's term have both lived in localStorage since
-- they were written, which means they are lost by:
--
--   clearing site data, or a browser doing it for you on low disk
--   private browsing, where the write throws and the game carries on regardless
--   signing in on a phone after playing on a laptop
--   iOS evicting a site's storage after seven days without a visit
--   a second account signing in on the same browser and starting a run
--
-- None of those throws. The player simply arrives at a front page that says
-- Start a Dynasty over a run they were forty seasons into, and there is nothing
-- in the game that can tell them what happened, because nothing in the game
-- knows.
--
-- So the save moves here. The browser copy stays, and stays authoritative for
-- SPEED: every autosave still writes locally and returns, because a run that
-- had to wait for the network on every action would be a worse game. What
-- changes is that the local copy is now a cache of this table rather than the
-- only copy of anything.
--
-- ---------------------------------------------------------------------------
-- PROGRESS IS WHAT DECIDES A CONFLICT, NOT A CLOCK
-- ---------------------------------------------------------------------------
-- Two devices holding the same account will disagree eventually, and the usual
-- answer is last-write-wins on a wall clock. That is the wrong answer here in
-- both directions: device clocks are wrong often enough to matter, and the
-- failure mode is the one thing this file exists to prevent, an old copy
-- landing on top of a newer one and taking the run with it.
--
-- So every write carries how far the run has got, and a write that would move a
-- save BACKWARDS is refused and hands back what is stored. The page then adopts
-- it. The rule is "more play wins", which is never the wrong thing to keep.
--
-- THE ONE THING IT COSTS is a deliberate restart on a second device: a fresh
-- run is progress 0, so a stale browser holding season 40 would win the
-- argument. That is why starting over DELETES rather than overwrites, and the
-- trade is the right way round. Losing a restart costs a redraft. Losing a
-- forty season dynasty cannot be undone at all.
-- ---------------------------------------------------------------------------

-- ---------- 1) the shelf ----------------------------------------------------
-- One row per account per game per slot. The payload is whatever the game packs
-- and this file has no opinion about it: the shape belongs to the page, which
-- already versions its own saves and refuses one it cannot open.
create table if not exists public.ps_saves (
  user_id  uuid        not null references auth.users(id) on delete cascade,
  -- WHICH GAME AND WHICH OF ITS SLOTS. The football game has two dynasties at
  -- once (open and one franchise) and the college game has a term and a career,
  -- so neither the game nor the slot alone is a key.
  game     text        not null,
  slot     text        not null,
  -- HOW FAR THE RUN HAS GOT, as a number the page derives and only the page
  -- understands. See the note above: this is the whole conflict rule.
  progress int         not null default 0,
  payload  jsonb       not null,
  saved_at timestamptz not null default now(),
  primary key (user_id, game, slot),
  constraint ps_saves_game_ck check (game ~ '^[a-z0-9_]{1,32}$'),
  constraint ps_saves_slot_ck check (slot ~ '^[a-z0-9_-]{1,32}$'),
  constraint ps_saves_progress_ck check (progress >= 0)
);

alter table public.ps_saves enable row level security;

-- A player may read their own shelf and nothing else. Every write goes through
-- the functions below, which is what makes the progress rule a rule rather than
-- a suggestion a client can decline to follow.
drop policy if exists "own saves" on public.ps_saves;
create policy "own saves" on public.ps_saves
  for select using (auth.uid() = user_id);

grant select on public.ps_saves to authenticated;

-- ---------- 2) reading one --------------------------------------------------
-- Answers an empty set rather than raising when there is nothing stored, so the
-- page's "no save here" and "not signed in" are the same harmless answer.
create or replace function public.ps_save_get(p_game text, p_slot text)
returns table (slot text, progress int, payload jsonb, saved_at timestamptz)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then return; end if;
  return query
    select s.slot, s.progress, s.payload, s.saved_at
      from public.ps_saves s
     where s.user_id = v_user and s.game = p_game and s.slot = p_slot;
end $$;

-- Every slot of one game in a single round trip, which is what the front page
-- actually wants: the football door has two dynasties to ask about and asking
-- twice on every boot is two round trips for one screen.
create or replace function public.ps_save_all(p_game text)
returns table (slot text, progress int, payload jsonb, saved_at timestamptz)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then return; end if;
  return query
    select s.slot, s.progress, s.payload, s.saved_at
      from public.ps_saves s
     where s.user_id = v_user and s.game = p_game
     order by s.slot;
end $$;

-- ---------- 3) writing one --------------------------------------------------
-- Returns what is stored AFTER the call along with whether this write was the
-- thing that landed, so one round trip both writes and tells the page whether
-- it is now behind. A refused write is not an error: it means another device
-- has played further, and `payload` in the answer is the run the page should
-- adopt.
--
-- THE SIZE LIMIT IS HERE RATHER THAN IN A CONSTRAINT because a CHECK has to be
-- immutable and jsonb's text cast is not. 512KB is roughly fifty times the
-- largest dynasty anybody has played and still small enough that a runaway
-- payload is caught rather than billed for.
create or replace function public.ps_save_put(
  p_game text, p_slot text, p_payload jsonb, p_progress int)
returns table (ok boolean, slot text, progress int, payload jsonb, saved_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.ps_saves%rowtype;
  v_prog int := greatest(0, coalesce(p_progress, 0));
begin
  if v_user is null then
    raise exception 'sign in to save';
  end if;
  if p_game is null or p_game !~ '^[a-z0-9_]{1,32}$' then
    raise exception 'unknown game';
  end if;
  if p_slot is null or p_slot !~ '^[a-z0-9_-]{1,32}$' then
    raise exception 'unknown slot';
  end if;
  if p_payload is null then
    raise exception 'nothing to save';
  end if;
  if octet_length(p_payload::text) > 524288 then
    raise exception 'save too large';
  end if;

  /* Locked for the rest of the statement, so two devices writing in the same
     second cannot both read the old progress and both decide they are ahead. */
  select * into v_row from public.ps_saves
   where user_id = v_user and game = p_game and slot = p_slot
   for update;

  if found and v_row.progress > v_prog then
    return query select false, v_row.slot, v_row.progress, v_row.payload, v_row.saved_at;
    return;
  end if;

  insert into public.ps_saves (user_id, game, slot, progress, payload, saved_at)
  values (v_user, p_game, p_slot, v_prog, p_payload, now())
  on conflict (user_id, game, slot) do update
    set progress = excluded.progress,
        payload  = excluded.payload,
        saved_at = excluded.saved_at
  returning * into v_row;

  return query select true, v_row.slot, v_row.progress, v_row.payload, v_row.saved_at;
end $$;

-- ---------- 4) throwing one away --------------------------------------------
-- The only way a save leaves this table, and the reason the progress rule above
-- can be as blunt as it is. Starting over, quitting, and being fired all end a
-- run for real, so they delete it rather than writing a smaller one over it.
create or replace function public.ps_save_drop(p_game text, p_slot text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'sign in to save';
  end if;
  delete from public.ps_saves
   where user_id = v_user and game = p_game and slot = p_slot;
  return true;
end $$;

-- ---------- 5) grants -------------------------------------------------------
-- Nothing here is readable or writable by a guest. A save belongs to an account
-- and there is no such thing as one without a signed in player.
revoke all on function public.ps_save_get(text, text) from public;
revoke all on function public.ps_save_all(text) from public;
revoke all on function public.ps_save_put(text, text, jsonb, int) from public;
revoke all on function public.ps_save_drop(text, text) from public;
grant execute on function public.ps_save_get(text, text) to authenticated;
grant execute on function public.ps_save_all(text) to authenticated;
grant execute on function public.ps_save_put(text, text, jsonb, int) to authenticated;
grant execute on function public.ps_save_drop(text, text) to authenticated;

notify pgrst, 'reload schema';
