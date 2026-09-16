-- ============================================================================
-- 106_dynasty_one_run_a_day.sql
--
-- ONE NEW DYNASTY A DAY, ON TOP OF THE THREE SEASONS.
--
-- 101 gave a free account three dynasty SEASONS a day, spent one per kickoff on
-- whatever run they are in, and 102 put that on a rolling 24 hours per account.
-- That meters how much you PLAY and it does not meter how often you START, and
-- those are two different things the moment somebody does not like their draft.
--
-- What the budget allows today: draft a team, play a season, abandon it, draft
-- again, play, abandon, draft again. Three seasons, three different rosters, and
-- the mode that is meant to be "one team, one life" becomes three rolls of the
-- wheel with a season in between each. A firing already ends the day outright,
-- which is what stops the cheapest version of this, but abandoning a run that is
-- going badly costs nothing but the season it took to find out.
--
-- So a NEW run is its own allowance: one per rolling day.
--
--   seasons   three a day, plus one for a boss battle won   101 and 102
--   new runs  ONE a day                                     this file
--
-- A run in progress is untouched. Resuming costs nothing here and never did,
-- and the three seasons are spent on it exactly as before: what is capped is the
-- act of throwing one away and starting another.
--
-- ---------------------------------------------------------------------------
-- WHY THIS ADDS A COLUMN AND RESTATES NOTHING.
--
-- The obvious shape is a `runs` counter beside `used`, reset wherever the window
-- rolls forward. That reset lives inside ps_attempt_spend, so taking it would
-- mean restating that function, and ps_attempt_spend has already been restated
-- once by 105_fullteam_daily.sql. Copying 102's body over the top would silently
-- undo 105 and take Full Team's meter with it, which is a class of mistake this
-- schema has made before and which nothing on screen would report.
--
-- A TIMESTAMP NEEDS NO RESET. `run_at` is when the last new run was started, so
-- "may I start one" is arithmetic on it and nothing anywhere has to remember to
-- clear it. No existing function is touched by this file at all.
--
-- It is the same shape commish_free_clock uses for the same reason.
--
-- ---------------------------------------------------------------------------
-- IT FAILS OPEN, like every other meter here.
--
-- The page calls this and carries on if it cannot. A wrongly granted redraft
-- costs nothing anybody would notice; a wrongly refused one tells somebody who
-- came back to play that they cannot, which is the mistake that loses a player.
-- See clock.js's header, which argues it at length.
--
-- A PAYING ACCOUNT IS NEVER WRITTEN TO THIS TABLE, the same rule 102 keeps: the
-- check reads premium_unlocks itself rather than believing the page.
--
-- Read-only preflight: supabase/test/launch_preflight.sql
-- Counting test:       supabase/test/dynasty_run_day_test.sql
-- ============================================================================

-- ---------- 1) where the last new run is remembered -------------------------
-- On ps_dynasty_day rather than a table of its own, because the row is already
-- read on every boot for the season window and a second table would be a second
-- round trip on every visit to ask one question.
alter table public.ps_dynasty_day
  add column if not exists run_at timestamptz;

comment on column public.ps_dynasty_day.run_at is
  'When the last NEW dynasty run was started. Null means never. One new run per '
  'ps_dynasty_wait(); see 106_dynasty_one_run_a_day.sql.';

-- ---------- 2) is this account paying ---------------------------------------
-- READ OFF premium_unlocks HERE rather than believing the page, which is the rule
-- every meter in this schema keeps: a limit that gates a paid tier is worth
-- bypassing, and in a browser it is bypassed by clearing site data. Same body as
-- commish_is_pro(), against this game's product.
create or replace function public.ps_dynasty_is_pro()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.premium_unlocks
     where user_id = auth.uid()
       and product = 'ps_premium'
       and (expires_at is null or expires_at > now())
  )
$$;

-- ---------- 3) how long between new runs, named once ------------------------
-- Its own function rather than a literal, so the wait can be tuned in one place
-- the way ps_dynasty_wait() and commish_free_wait() both can. It DEFAULTS to the
-- season window so the two clocks agree unless somebody deliberately parts them.
create or replace function public.ps_dynasty_run_wait()
returns interval
language sql
immutable
as $$ select public.ps_dynasty_wait() $$;

-- ---------- 4) may this account start a new dynasty --------------------------
-- A READ. Declared stable and writing nothing, so the front page can draw the
-- door from it without the drawing ever costing somebody a run.
create or replace function public.ps_dynasty_run_state()
returns table (ok boolean, pro boolean, next_at timestamptz, now_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.ps_dynasty_day%rowtype;
  v_next timestamptz;
begin
  if v_user is null then
    raise exception 'sign in to play';
  end if;

  -- An owner has no limit and is not in this table.
  if public.ps_dynasty_is_pro() then
    return query select true, true, null::timestamptz, now();
    return;
  end if;

  select * into v_row from public.ps_dynasty_day where user_id = v_user;

  -- No row, or never started one: the first is free.
  if not found or v_row.run_at is null then
    return query select true, false, null::timestamptz, now();
    return;
  end if;

  v_next := v_row.run_at + public.ps_dynasty_run_wait();
  if v_next > now() then
    return query select false, false, v_next, now();
  else
    return query select true, false, null::timestamptz, now();
  end if;
end $$;

-- ---------- 5) take it ------------------------------------------------------
-- The one place a new run is bought with a day. Called at the moment the draft
-- actually begins, never when the door is drawn.
create or replace function public.ps_dynasty_run_start()
returns table (ok boolean, pro boolean, next_at timestamptz, now_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.ps_dynasty_day%rowtype;
  v_next timestamptz;
begin
  if v_user is null then
    raise exception 'sign in to play';
  end if;

  if public.ps_dynasty_is_pro() then
    return query select true, true, null::timestamptz, now();
    return;
  end if;

  -- Created on the first run ever started and locked for the rest of this
  -- statement, so two taps in the same second cannot both read an open day and
  -- both be allowed through.
  insert into public.ps_dynasty_day (user_id) values (v_user)
  on conflict (user_id) do nothing;

  select * into v_row from public.ps_dynasty_day
   where user_id = v_user for update;

  if v_row.run_at is not null then
    v_next := v_row.run_at + public.ps_dynasty_run_wait();
    if v_next > now() then
      return query select false, false, v_next, now();
      return;
    end if;
  end if;

  -- ALIASED, AND THAT IS NOT A STYLE CHOICE. next_at and now_at are OUT
  -- parameters of this function, and run_at is a column; an unqualified
  -- reference to a name that is both is ambiguous and Postgres refuses the whole
  -- statement AT CALL TIME rather than at create time. That is exactly how
  -- ps_attempt_spend('dynasty') shipped broken in 102: it created cleanly and
  -- threw on every kickoff, and nothing said so because the page fails open.
  update public.ps_dynasty_day d
     set run_at = now(), last_at = now()
   where d.user_id = v_user
   returning d.* into v_row;

  return query select true, false, null::timestamptz, now();
end $$;

-- ---------- 6) who may call them --------------------------------------------
revoke all on function public.ps_dynasty_is_pro()     from public;
revoke all on function public.ps_dynasty_run_wait()  from public;
revoke all on function public.ps_dynasty_run_state() from public;
revoke all on function public.ps_dynasty_run_start() from public;
grant execute on function public.ps_dynasty_is_pro()     to authenticated;
grant execute on function public.ps_dynasty_run_wait()  to authenticated;
grant execute on function public.ps_dynasty_run_state() to authenticated;
grant execute on function public.ps_dynasty_run_start() to authenticated;
