-- ============================================================================
-- 71_runtour_tokens_pass.sql  —  Daily-Challenge tokens + monthly Tour Pass
-- ============================================================================
-- Extends the server-authoritative wallet (70_runtour_wallet.sql) with two new
-- real-money products, both credited ONLY by the signed Stripe webhook:
--
--   • daily_tokens  — extra Daily-Challenge attempts (beyond the free 3/day).
--                     Bought as consumables; spent one at a time to play again.
--   • Tour Pass     — a ONE-TIME monthly purchase. Buying grants THIS calendar
--                     month's pass: passCoins credited to the wallet + a
--                     tour_pass row for the period. Active = a row exists for
--                     the current month; it lapses at month end (buy again next
--                     month). The client reads pass-active to unlock unlimited
--                     daily plays, grant the seasonal packs, and apply a reward
--                     multiplier.
--
-- Shared idempotency/refund plumbing: coin_purchase gains `tokens` + `pass_period`
-- columns so one purchases table records every kind (idempotent on stripe_event).
--
-- Money-critical functions are service_role only (the webhook); reads are the
-- caller's own. Run AFTER 70_runtour_wallet.sql. Idempotent; safe to re-run.
-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Schema additions
-- ---------------------------------------------------------------------------
alter table coin_wallet   add column if not exists daily_tokens int not null default 0;
alter table coin_wallet   drop constraint if exists coin_wallet_tokens_nonneg;
alter table coin_wallet   add  constraint coin_wallet_tokens_nonneg check (daily_tokens >= 0);
alter table coin_purchase add column if not exists tokens      int  not null default 0;
alter table coin_purchase add column if not exists pass_period text;

-- one row per (user, calendar month) that the player holds the Tour Pass for
create table if not exists tour_pass (
  user_id    uuid not null references auth.users(id) on delete cascade,
  period     text not null,                       -- 'YYYY-MM' (UTC calendar month)
  granted_at timestamptz not null default now(),
  primary key (user_id, period)
);
alter table tour_pass enable row level security;
drop policy if exists tour_pass_owner_read on tour_pass;
create policy tour_pass_owner_read on tour_pass
  for select to authenticated using (auth.uid() = user_id);
grant select on table tour_pass to authenticated;   -- read only; granted by the webhook

-- extend the ledger kinds to include token grants/refunds (drop+recreate check)
alter table coin_ledger drop constraint if exists coin_ledger_kind_check;
alter table coin_ledger add constraint coin_ledger_kind_check
  check (kind in ('purchase','refund','grant','founder','spend','adjust','token','pass'));

-- ---------------------------------------------------------------------------
-- runtour_wallet()  —  read your own balances + pass status (0 / false if none)
-- Return shape CHANGED (added daily_tokens, pass_active, pass_period) → drop first.
-- ---------------------------------------------------------------------------
drop function if exists runtour_wallet();
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
                   and p.period = to_char(now() at time zone 'utc','YYYY-MM')),
         to_char(now() at time zone 'utc','YYYY-MM')
  from (select auth.uid() as uid) u
  left join coin_wallet w on w.user_id = u.uid;
$$;
revoke all on function runtour_wallet() from public;
grant execute on function runtour_wallet() to authenticated;

-- ---------------------------------------------------------------------------
-- runtour_spend_token(day)  —  spend ONE daily token to play an extra round
-- beyond the free cap. Row-locked, clamps at zero. Returns the new balance, or
-- raises if none available. (The extra play itself is gated by the token here;
-- the free 3/day cap is enforced separately by runtour_daily_attempt_start.)
-- ---------------------------------------------------------------------------
create or replace function runtour_spend_token(p_day text default null)
returns int
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_bal int;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  insert into coin_wallet (user_id) values (v_uid) on conflict (user_id) do nothing;
  select daily_tokens into v_bal from coin_wallet where user_id = v_uid for update;
  if coalesce(v_bal,0) < 1 then
    raise exception 'no tokens' using errcode = '23514';
  end if;
  update coin_wallet
     set daily_tokens = daily_tokens - 1, updated_at = now()
   where user_id = v_uid
   returning daily_tokens into v_bal;
  insert into coin_ledger (user_id, delta, balance, kind, ref)
    values (v_uid, -1, coalesce((select paid_coins from coin_wallet where user_id=v_uid),0), 'token', 'daily:'||coalesce(p_day,''));
  return v_bal;
end $$;
revoke all on function runtour_spend_token(text) from public;
grant execute on function runtour_spend_token(text) to authenticated;

-- ---------------------------------------------------------------------------
-- runtour_credit_tokens(...)  —  service_role only (the Stripe webhook).
-- Idempotent on the Stripe event id (shared coin_purchase table).
-- ---------------------------------------------------------------------------
create or replace function runtour_credit_tokens(
  p_user text, p_event text, p_session text, p_pi text,
  p_package text, p_tokens int, p_amount_cents int, p_currency text
) returns int
language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_bal int;
begin
  if p_user is null then raise exception 'missing user'; end if;
  v_uid := p_user::uuid;
  if p_tokens is null or p_tokens <= 0 then raise exception 'invalid token amount'; end if;

  if p_event is not null and exists (select 1 from coin_purchase where stripe_event = p_event) then
    select daily_tokens into v_bal from coin_wallet where user_id = v_uid;
    return coalesce(v_bal, 0);                     -- already fulfilled
  end if;

  begin
    insert into coin_purchase (user_id, stripe_event, stripe_session, stripe_pi,
                               package_id, coins, tokens, amount_cents, currency, status)
      values (v_uid, p_event, p_session, p_pi,
              p_package, 0, p_tokens, p_amount_cents, coalesce(p_currency,'usd'), 'paid');
  exception when unique_violation then             -- duplicate event delivered concurrently
    select daily_tokens into v_bal from coin_wallet where user_id = v_uid;
    return coalesce(v_bal, 0);
  end;

  insert into coin_wallet (user_id) values (v_uid) on conflict (user_id) do nothing;
  update coin_wallet set daily_tokens = daily_tokens + p_tokens, updated_at = now()
   where user_id = v_uid returning daily_tokens into v_bal;
  insert into coin_ledger (user_id, delta, balance, kind, ref)
    values (v_uid, p_tokens, coalesce((select paid_coins from coin_wallet where user_id=v_uid),0), 'token', coalesce(p_event,p_session));
  return v_bal;
end $$;
revoke all on function runtour_credit_tokens(text,text,text,text,text,int,int,text) from public, anon, authenticated;
grant execute on function runtour_credit_tokens(text,text,text,text,text,int,int,text) to service_role;

-- ---------------------------------------------------------------------------
-- runtour_grant_pass(...)  —  service_role only (the Stripe webhook).
-- Grants the CURRENT calendar month's Tour Pass: records the entitlement +
-- credits the pass coin reward. Idempotent on the Stripe event id.
-- ---------------------------------------------------------------------------
create or replace function runtour_grant_pass(
  p_user text, p_event text, p_session text, p_pi text,
  p_package text, p_coins bigint, p_amount_cents int, p_currency text
) returns text
language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_period text := to_char(now() at time zone 'utc','YYYY-MM');
begin
  if p_user is null then raise exception 'missing user'; end if;
  v_uid := p_user::uuid;

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
-- runtour_refund_purchase(ref)  —  extend the clawback to tokens + pass.
-- Same signature as 70; redefined to also remove tokens / revoke the pass.
-- ---------------------------------------------------------------------------
create or replace function runtour_refund_purchase(p_ref text, p_status text default 'refunded')
returns bigint
language plpgsql security definer set search_path = public as $$
declare r coin_purchase%rowtype; v_new bigint;
begin
  select * into r from coin_purchase
   where stripe_event = p_ref or stripe_pi = p_ref
   order by created_at desc limit 1;
  if not found then return null; end if;
  if r.status <> 'paid' then                       -- already refunded/disputed
    select paid_coins into v_new from coin_wallet where user_id = r.user_id;
    return coalesce(v_new, 0);
  end if;
  update coin_purchase set status = coalesce(p_status,'refunded') where id = r.id;

  -- tokens: remove up to the granted amount (clamp at zero)
  if coalesce(r.tokens,0) > 0 then
    update coin_wallet set daily_tokens = greatest(0, daily_tokens - r.tokens), updated_at = now()
     where user_id = r.user_id;
    insert into coin_ledger (user_id, delta, balance, kind, ref)
      values (r.user_id, -r.tokens, coalesce((select paid_coins from coin_wallet where user_id=r.user_id),0), 'token', 'refund:'||p_ref);
  end if;
  -- pass: revoke the period's entitlement
  if r.pass_period is not null then
    delete from tour_pass where user_id = r.user_id and period = r.pass_period;
  end if;
  -- coins: claw back any credited coins (pass reward or coin pack)
  if coalesce(r.coins,0) > 0 then
    return runtour_wallet_apply(r.user_id, -r.coins, 'refund', p_ref);
  end if;
  select paid_coins into v_new from coin_wallet where user_id = r.user_id;
  return coalesce(v_new, 0);
end $$;
revoke all on function runtour_refund_purchase(text,text) from public, anon, authenticated;
grant execute on function runtour_refund_purchase(text,text) to service_role;
