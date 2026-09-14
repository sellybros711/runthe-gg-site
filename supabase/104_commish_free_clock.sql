-- ---------------------------------------------------------------------------
-- 104_commish_free_clock.sql : one season of Commissioner Simulator every 24
-- hours for a free account, counted where the client cannot edit it.
--
-- Safe to run more than once.
--
-- ---------------------------------------------------------------------------
-- WHAT IS BEING COUNTED
-- ---------------------------------------------------------------------------
-- A SEASON. Not a start, not a term, not a session: the single act of moving
-- the sport forward one year. A free account plays one, waits a day, plays the
-- next. A five season term therefore takes five days, and it is a whole term
-- rather than a demo that stops.
--
-- METERING THE SEASON AND NOT THE START is what makes the rule impossible to
-- walk around. 99_daily_attempts.sql meters STARTS, which is right for Dynasty
-- because a dynasty is one long run and the impatient act there is rerolling
-- the draft. Commissioner is the other shape: a term is five seasons and the
-- impatient act is the NEXT one. Meter the start here and a player quits after
-- season one, takes the job again, and plays season one again forever.
--
-- THE FIRST SEASON IS FREE, and that falls out rather than being a case. A new
-- account has no row, no row means no clock, and no clock means play. The wait
-- is charged on the way out of a season rather than on the way in, so the thing
-- somebody meets first is the game.
--
-- ---------------------------------------------------------------------------
-- WHY THIS CANNOT LIVE IN localStorage
-- ---------------------------------------------------------------------------
-- The same reason 99_daily_attempts.sql gives, and it is worth repeating rather
-- than cross referencing: the moment a limit gates a paid tier it is worth
-- bypassing, and in a browser it is bypassed by clearing site data or opening a
-- private window. A wait that anybody who knows that can skip is not a wait, and
-- the thing it is meant to sell is worth nothing. So the clock lives here, keyed
-- on auth.uid(), and the page asks rather than decides.
--
-- ---------------------------------------------------------------------------
-- A ROLLING 24 HOURS, NOT A CALENDAR DAY, AND THE COST OF THAT
-- ---------------------------------------------------------------------------
-- 99_daily_attempts.sql rolls over at midnight Eastern, because what it meters
-- sits beside a LEADERBOARD and a board where everyone's day starts at a
-- different moment is not one board. Nothing here touches a board: this is a
-- private clock between one account and one save, so it runs from when that
-- account last played (owner's call, and the countdown is the point of it).
--
-- THE KNOWN COST, written down rather than discovered later: a rolling window
-- drifts. Play at 6pm and tomorrow opens at 6pm, but you will not tap it at
-- exactly 6pm, so the day after opens at 6:20, then 6:50. A player who plays at
-- a fixed time each evening is slowly pushed out of it. The fix, if it ever
-- bites, is to shorten the wait to about twenty hours rather than to move to a
-- calendar day: twenty hours always reopens earlier in the day than the last
-- play, so the window walks backwards into the player's evening instead of out
-- of it. COMMISH_FREE_WAIT is the one place that changes.
--
-- ---------------------------------------------------------------------------
-- THE SERVER DECIDES WHO IS PRO. THE PAGE IS NOT ASKED.
-- ---------------------------------------------------------------------------
-- Every function here reads premium_unlocks itself. A paying account is never
-- written to this table at all, so cancelling the meter cannot be done by
-- lying about a flag, and a client bug cannot start charging a customer a wait
-- they paid to not have. It also means an account that buys mid term is
-- unmetered on its very next tap with nothing to clear.
-- ---------------------------------------------------------------------------

-- ---------- 1) the wait, in one place ---------------------------------------
-- Named rather than inlined so the countdown, the spend and any future change
-- all read the same number. See the drift note above before moving it.
create or replace function public.commish_free_wait()
returns interval
language sql
immutable
as $$ select interval '24 hours' $$;

-- ---------- 2) is this account paying --------------------------------------
-- The same test premium_products() makes, narrowed to the one product that
-- matters here and written as its own function so every path below asks it the
-- same way. Unexpired only: cfb_premium is permanent today and the expiry check
-- costs nothing, but a product that is permanent by convention rather than by
-- schema is one webhook change away from not being.
create or replace function public.commish_is_pro()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.premium_unlocks
     where user_id = auth.uid()
       and product = 'cfb_premium'
       and (expires_at is null or expires_at > now())
  )
$$;

-- ---------- 3) the clock ----------------------------------------------------
-- One row per free account, created on the first season they finish. A paying
-- account never gets one.
create table if not exists public.commish_free_clock (
  user_id  uuid not null primary key references auth.users(id) on delete cascade,
  -- The earliest this account may play its next season.
  next_at  timestamptz not null,
  -- Telemetry, and the only reason it is here is to answer "is anybody actually
  -- coming back on day two" without joining anything.
  seasons  int not null default 0,
  -- FINISHED CONTRACTS, and this one is not telemetry: it is the free tier's other
  -- limit. A free account plays ONE five season term and the career ends there;
  -- renewal is the paid half. It lives here rather than in the browser for the same
  -- reason the clock does, and it is a separate count from `seasons` on purpose,
  -- because a term that ended early (removed, or walked away) still spends it.
  terms    int not null default 0,
  first_at timestamptz not null default now(),
  last_at  timestamptz not null default now(),
  constraint commish_free_clock_seasons_ck check (seasons >= 0),
  constraint commish_free_clock_terms_ck check (terms >= 0)
);

alter table public.commish_free_clock enable row level security;

-- Read your own and nothing else. There is no insert, update or delete policy at
-- all: the functions below are security definer and are the only writers, so a
-- client cannot move its own clock forward by any route.
drop policy if exists "own clock" on public.commish_free_clock;
create policy "own clock" on public.commish_free_clock
  for select using (auth.uid() = user_id);

grant select on public.commish_free_clock to authenticated;

-- ---------- 4) how the clock stands, without spending anything --------------
-- What the screen reads on every paint. Never writes, so drawing a year in
-- review can never cost somebody a day.
--
-- `now_at` IS RETURNED ON PURPOSE. The countdown has to run off the server's
-- clock rather than the device's, or a phone with the wrong date talks itself
-- into a season. The page measures the gap once and counts down locally from
-- there, which is the same trick ps_eastern_reset() exists for.
create or replace function public.commish_clock_state()
returns table (pro boolean, locked boolean, next_at timestamptz,
               now_at timestamptz, seasons int, terms int)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.commish_free_clock%rowtype;
begin
  /* A guest cannot reach the mode at all, and answering "not locked" keeps the
     screen drawable rather than making it depend on being signed in. Nothing is
     given away: the gate in front of the mode is a separate question. */
  if v_user is null then
    return query select false, false, null::timestamptz, now(), 0, 0;
    return;
  end if;
  if public.commish_is_pro() then
    return query select true, false, null::timestamptz, now(), 0, 0;
    return;
  end if;
  select * into v_row from public.commish_free_clock where user_id = v_user;
  if not found then
    return query select false, false, null::timestamptz, now(), 0, 0;
  else
    return query select false, (v_row.next_at > now()), v_row.next_at, now(),
                        v_row.seasons, v_row.terms;
  end if;
end $$;

-- ---------- 5) spending a season -------------------------------------------
-- Called when a free account actually moves the sport forward a year, and the
-- answer is what the screen draws next. One round trip both decides and reports.
--
-- IT IS CALLED ON THE WAY OUT OF A SEASON, not on the way into one. Both work
-- and only one of them is kind: charging on the way in means a player who opens
-- the game, looks around and closes it has lost the day. Charging on the way out
-- means the wait always has a season behind it.
create or replace function public.commish_clock_spend()
returns table (ok boolean, pro boolean, locked boolean, next_at timestamptz,
               now_at timestamptz, seasons int, terms int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.commish_free_clock%rowtype;
  v_next timestamptz;
  v_seas int;
begin
  if v_user is null then
    raise exception 'sign in to play';
  end if;

  /* A PAYING ACCOUNT IS NEVER WRITTEN TO THIS TABLE. Not "written and ignored":
     no row at all, so cancelling a subscription cannot uncover a stale clock
     that has been quietly ticking behind the paid tier the whole time. */
  if public.commish_is_pro() then
    return query select true, true, false, null::timestamptz, now(), 0, 0;
    return;
  end if;

  /* Created on the first spend and locked for the rest of this statement, so
     two taps in the same second cannot both read an open clock and both be
     allowed through. */
  insert into public.commish_free_clock (user_id, next_at, seasons)
  values (v_user, now(), 0)
  on conflict (user_id) do nothing;

  select * into v_row from public.commish_free_clock
   where user_id = v_user for update;

  if v_row.next_at > now() then
    return query select false, false, true, v_row.next_at, now(), v_row.seasons,
                        v_row.terms;
    return;
  end if;

  /* THE WAIT RUNS FROM NOW, NOT FROM THE OLD next_at. Adding the interval to a
     stale deadline would hand back every hour the player did not come and claim
     it, so somebody who waits three days would bank three more seasons. The
     clock is a cooldown, not a balance. */
  /* ALIASED, AND NOT FOR NEATNESS. next_at and seasons are both OUT parameters of
     this function AND columns of this table, so an unqualified `returning next_at`
     is ambiguous and Postgres refuses the whole function at call time rather than
     at create time. It creates cleanly and throws the first time anybody plays. */
  update public.commish_free_clock c
     set next_at = now() + public.commish_free_wait(),
         seasons = c.seasons + 1,
         last_at = now()
   where c.user_id = v_user
   returning c.next_at, c.seasons into v_next, v_seas;

  return query select true, false, true, v_next, now(), v_seas,
                      (select c2.terms from public.commish_free_clock c2
                        where c2.user_id = v_user);
end $$;

-- ---------- 6) a finished contract -----------------------------------------
-- Called once when a term ends, however it ended. The free tier gets ONE, and
-- what is bought is the renewal: a paying commissioner signs an extension and
-- keeps the sport they built, a free one reaches the end of a whole five season
-- term and the career stops there.
--
-- IT COUNTS A TERM THAT ENDED BADLY TOO. Removed in year two is a finished
-- contract, and so is walking away. Anything else makes quitting a free reroll,
-- which is the same hole metering starts would have left in the clock.
--
-- IDEMPOTENCE IS THE CALLER'S, NOT THIS FUNCTION'S, and that is a deliberate
-- split. The page already guards logTerm against running twice for one term
-- (`careerLogged` on the save), because a reload of a finished ending must not
-- file a second row on the career shelf. This is the same event, so it is
-- guarded by the same flag in the same place. Counting here as well would need a
-- term id this table has no reason to know.
create or replace function public.commish_term_done()
returns table (pro boolean, terms int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_terms int;
begin
  if v_user is null then
    raise exception 'sign in to play';
  end if;

  /* A paying account is never written to this table, the same rule the spend
     follows. Their terms are not counted because nothing is capped. */
  if public.commish_is_pro() then
    return query select true, 0;
    return;
  end if;

  /* next_at is now() rather than a wait: finishing a term does not itself cost a
     day. The season that ended it already did, through commish_clock_spend(). */
  /* QUALIFIED, for the reason the spend's update is: `terms` is both an OUT
     parameter of this function and a column of this table, so a bare
     `returning terms` is ambiguous. It creates cleanly and throws the first time
     a term ends, which is the worst possible moment to find out. */
  insert into public.commish_free_clock as c (user_id, next_at, terms)
  values (v_user, now(), 1)
  on conflict (user_id)
    do update set terms = c.terms + 1, last_at = now()
  returning c.terms into v_terms;

  return query select false, v_terms;
end $$;

-- ---------- 7) grants ------------------------------------------------------
revoke all on function public.commish_free_wait() from public;
revoke all on function public.commish_is_pro() from public;
revoke all on function public.commish_clock_state() from public;
revoke all on function public.commish_clock_spend() from public;
revoke all on function public.commish_term_done() from public;
grant execute on function public.commish_free_wait() to anon, authenticated;
grant execute on function public.commish_is_pro() to authenticated;
grant execute on function public.commish_clock_state() to anon, authenticated;
grant execute on function public.commish_clock_spend() to authenticated;
grant execute on function public.commish_term_done() to authenticated;

notify pgrst, 'reload schema';
