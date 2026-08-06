-- ============================================================================
-- 72_runtour_pass_season.sql  —  Tour Pass becomes the 60-DAY SEASON pass
-- ============================================================================
-- OWNER DECISION (2026-08): the monthly calendar-month Tour Pass is REMOVED.
-- The ONLY pass sold is the 60-day Tour Pass at $14.99, and everything is
-- built around it. This migration reworks the server entitlement from
-- "one calendar month" (71_runtour_tokens_pass.sql) to the game's own 60-day
-- season, matching the in-game Tour Pass track EXACTLY:
--
--   • Season 1 began (US Eastern) Jul 1 2026; each season lasts 60 days.
--   • The season key stored/compared everywhere is 'S<n>'  (e.g. 'S1', 'S2').
--   • Buying the pass grants THIS season's entitlement + 30,000 coins.
--     It lapses when the season rolls over; a new pass must be bought.
--
-- The math mirrors the client (build-a-golfer.html):
--   TOURPASS_LEN=60; TOURPASS_EPOCH=Jul 1 2026;
--   day boundaries follow the game's day = midnight US Eastern (todayKey()).
-- In SQL:  elapsed = (now() AT TIME ZONE 'America/New_York')::date - '2026-07-01'
--          season  = floor(elapsed/60)+1   (elapsed clamped at 0)
--
-- What this file does (idempotent; safe to re-run):
--   1. runtour_pass_season(p_at)   — the ONE season-math helper (SQL is the
--      source of truth server-side; p_at is overridable for tests only).
--   2. runtour_pass_status()       — (authenticated) caller's own pass state;
--      used by create-checkout to refuse a double purchase (409).
--   3. runtour_wallet()            — pass_active/pass_period now report the
--      60-day season instead of the calendar month.
--   4. runtour_grant_pass(...)     — webhook grant now stores period='S<n>'.
--      Same signature as 71, so the deployed webhook keeps working.
--   5. Retires runtour_claim_founder() (owner decision: founder bonus is
--      retired; the cutoff has passed and the client never called it).
--
-- Unchanged and still correct:
--   • runtour_refund_purchase (71) revokes the pass by the period STORED on
--     the purchase row — it deletes tour_pass(user_id, 'S<n>') the same way it
--     deleted a month row. No change needed.
--   • tour_pass table/RLS (71): period is text, so 'S<n>' keys drop straight
--     in. Any legacy 'YYYY-MM' rows (test-mode only; the pass never launched)
--     simply never match a season key again — inert history.
--
-- Run AFTER 70_runtour_wallet.sql and 71_runtour_tokens_pass.sql.
-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. runtour_pass_season(p_at)  —  season math, mirrors the client exactly.
--    Returns the season number, day-of-season (1..60), days left, and the
--    storage key 'S<n>'. Before the epoch it clamps to Season 1, Day 1
--    (the client clamps the same way). p_at exists ONLY so tests can probe
--    boundaries; callers use the default now().
-- ---------------------------------------------------------------------------
create or replace function runtour_pass_season(p_at timestamptz default now())
returns table (season int, season_day int, days_left int, period text)
language sql stable security definer set search_path = public as $$
  with e as (
    select greatest(0, (p_at at time zone 'America/New_York')::date
                       - date '2026-07-01')::int as el
  )
  select (el / 60) + 1                as season,
         (el % 60) + 1               as season_day,
         60 - (el % 60)              as days_left,
         'S' || ((el / 60) + 1)::text as period
  from e;
$$;
revoke all on function runtour_pass_season(timestamptz) from public;
grant execute on function runtour_pass_season(timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. runtour_pass_status()  —  the caller's own pass state for THIS season.
--    create-checkout calls this (with the buyer's JWT) before starting a pass
--    checkout and refuses with 409 if pass_active is already true, so a player
--    can't accidentally buy the same season twice. The client may also use it
--    for display.
-- ---------------------------------------------------------------------------
create or replace function runtour_pass_status()
returns table (pass_active boolean, season int, season_day int, days_left int, period text)
language sql stable security definer set search_path = public as $$
  select exists (select 1 from tour_pass tp
                 where tp.user_id = auth.uid() and tp.period = s.period),
         s.season, s.season_day, s.days_left, s.period
  from runtour_pass_season() s;
$$;
revoke all on function runtour_pass_status() from public;
grant execute on function runtour_pass_status() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. runtour_wallet()  —  same return shape as 71; pass_active/pass_period
--    now follow the 60-day season ('S<n>') instead of the calendar month.
-- ---------------------------------------------------------------------------
create or replace function runtour_wallet()
returns table (
  paid_coins bigint, lifetime_purchased bigint, lifetime_granted bigint,
  daily_tokens int, pass_active boolean, pass_period text
)
language sql security definer set search_path = public as $$
  select coalesce(w.paid_coins,0), coalesce(w.lifetime_purchased,0), coalesce(w.lifetime_granted,0),
         coalesce(w.daily_tokens,0),
         exists (select 1 from tour_pass p
                 where p.user_id = u.uid
                   and p.period = (select period from runtour_pass_season())),
         (select period from runtour_pass_season())
  from (select auth.uid() as uid) u
  left join coin_wallet w on w.user_id = u.uid;
$$;
revoke all on function runtour_wallet() from public;
grant execute on function runtour_wallet() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. runtour_grant_pass(...)  —  service_role only (the Stripe webhook).
--    Grants the CURRENT 60-day season's Tour Pass: records the entitlement
--    (period 'S<n>') + credits the pass coin reward. Idempotent on the Stripe
--    event id. Signature identical to 71's version, so the deployed webhook
--    needs no change. If the same user somehow pays twice in one season
--    (checkout guard bypassed / webhook race), the coins are still credited —
--    they paid — and the pass row conflict is a no-op.
-- ---------------------------------------------------------------------------
create or replace function runtour_grant_pass(
  p_user text, p_event text, p_session text, p_pi text,
  p_package text, p_coins bigint, p_amount_cents int, p_currency text
) returns text
language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_period text;
begin
  if p_user is null then raise exception 'missing user'; end if;
  v_uid := p_user::uuid;
  select period into v_period from runtour_pass_season();

  if p_event is not null and exists (select 1 from coin_purchase where stripe_event = p_event) then
    return v_period;                               -- already fulfilled
  end if;

  begin
    insert into coin_purchase (user_id, stripe_event, stripe_session, stripe_pi,
                               package_id, coins, pass_period, amount_cents, currency, status)
      values (v_uid, p_event, p_session, p_pi,
              p_package, coalesce(p_coins,0), v_period, p_amount_cents, coalesce(p_currency,'usd'), 'paid');
  exception when unique_violation then             -- duplicate event delivered concurrently
    return v_period;
  end;

  insert into tour_pass (user_id, period) values (v_uid, v_period)
    on conflict (user_id, period) do nothing;
  if coalesce(p_coins,0) > 0 then
    perform runtour_wallet_apply(v_uid, p_coins, 'purchase', coalesce(p_event, p_session));
  end if;
  return v_period;
end $$;
revoke all on function runtour_grant_pass(text,text,text,text,text,bigint,int,text) from public, anon, authenticated;
grant execute on function runtour_grant_pass(text,text,text,text,text,bigint,int,text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Retire the founder bonus (owner decision C). The cutoff (2026-08-01)
--    has passed and the client never shipped a call site. The 'founder'
--    ledger kind + the one-founder partial index stay (history stays valid);
--    only the claim path is removed.
-- ---------------------------------------------------------------------------
drop function if exists runtour_claim_founder();
