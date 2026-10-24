-- ---------------------------------------------------------------------------
-- 154_dynasty_day_end_lapsed.sql : a dynasty wait that has run out is never
-- started again by a late report that the day ended.
--
-- Safe to run more than once. Run 102 and 105 first. Restates one function,
-- ps_attempt_day_end, from 105's body with one branch changed.
--
-- ---------------------------------------------------------------------------
-- WHAT A PLAYER SAW
-- ---------------------------------------------------------------------------
-- Reported by a signed in player: the Dynasty spent sheet read 1 second, they
-- closed it and opened it again, and it read 24 hours. The page held the old
-- lock in a cache past its own end (fixed in football/index.html, dailyLapse),
-- and a results screen painted off that cache reports the day over again.
--
-- 102 and 105 answered that report with:
--
--   if v_dyn.locked_until is null or v_dyn.locked_until <= now() then
--     lock for another 24 hours
--
-- The second half of that test is the bug. A lock in the past is not an open
-- window: it is the END of a wait, and the row is stale until the next spend
-- rolls it forward. Nothing has been played in the new window, so nothing can
-- have ended it. Stamping it made the countdown reaching zero the moment a fresh
-- 24 hours began.
--
-- ---------------------------------------------------------------------------
-- THE RULE NOW
-- ---------------------------------------------------------------------------
--   locked_until in the future   a wait is running. Never extended (as before).
--   locked_until in the past     the wait is over. Answered as the fresh open
--                                window ps_attempts_state reports, and nothing
--                                is written. The next kickoff rolls the row.
--   locked_until null            an open window. Closed only when it has been
--                                ended: the budget is spent, or the run was
--                                fired. A report about a window with seasons
--                                still in it is a stale page, so it is answered
--                                and ignored.
--
-- The Trade Machine and Full Team branch is unchanged. Their day is the Eastern
-- calendar day, the page never calls this for them (dailyDayEnd is season
-- metering only), and no clock is started there.
-- ---------------------------------------------------------------------------

drop function if exists public.ps_attempt_day_end(text);
create or replace function public.ps_attempt_day_end(p_mode text, p_fired boolean default false)
returns table (used int, allowance int, resets_at timestamptz, unit text, ended boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_day   date := public.ps_eastern_day();
  v_dyn   public.ps_dynasty_day%rowtype;
  v_used  int;
  v_allow int;
begin
  if p_mode is null or p_mode not in ('dynasty', 'trade', 'full') then
    raise exception 'unknown mode';
  end if;
  if v_user is null then
    raise exception 'sign in to play';
  end if;

  if p_mode = 'dynasty' then
    insert into public.ps_dynasty_day (user_id) values (v_user)
    on conflict (user_id) do nothing;
    select * into v_dyn from public.ps_dynasty_day where user_id = v_user for update;

    /* THE WAIT IS OVER (v_lapsed), so this report is about a day that has
       already been served. Answered with the fresh window, exactly as
       ps_attempts_state reads it, and the row is left for the next kickoff to
       roll forward. Locking here is what turned zero into 24 hours. */
    if v_dyn.locked_until is not null and v_dyn.locked_until <= now() then
      return query select 0, public.ps_day_allowance('dynasty', false),
        null::timestamptz, 'season'::text, false;
      return;
    end if;

    v_allow := public.ps_day_allowance('dynasty', v_dyn.grace_boss);

    /* NEVER EXTENDS A WAIT THAT IS ALREADY RUNNING, and only closes a window
       that has actually ended: the budget spent, or the run fired. */
    if v_dyn.locked_until is null and (coalesce(p_fired, false) or v_dyn.used >= v_allow) then
      update public.ps_dynasty_day
         set locked_until = now() + public.ps_dynasty_wait(),
             ended_fired  = coalesce(p_fired, false),
             last_at      = now()
       where user_id = v_user
       returning * into v_dyn;
    end if;

    if v_dyn.locked_until is null then
      return query select v_dyn.used, v_allow, null::timestamptz, 'season'::text, false;
      return;
    end if;
    return query select v_allow, v_allow, v_dyn.locked_until, 'season'::text, v_dyn.ended_fired;
    return;
  end if;

  insert into public.ps_daily_attempts (user_id, mode, day, used, ended)
  values (v_user, p_mode, v_day, 0, true)
  on conflict (user_id, mode, day)
    do update set ended = true, last_at = now();

  select a.used, public.ps_day_allowance(p_mode, a.grace_boss)
    into v_used, v_allow
    from public.ps_daily_attempts a
   where a.user_id = v_user and a.mode = p_mode and a.day = v_day;

  return query select v_used, v_allow, public.ps_eastern_reset(),
    public.ps_day_unit(p_mode), true;
end $$;

-- Restated because a dropped and recreated function loses its grants.
revoke all on function public.ps_attempt_day_end(text, boolean) from public;
grant execute on function public.ps_attempt_day_end(text, boolean) to authenticated;

notify pgrst, 'reload schema';
