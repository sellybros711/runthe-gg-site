-- ---------------------------------------------------------------------------
-- 124_premium_yearly.sql : Perfect Season and Run The Bundle go yearly, and
-- every lifetime buyer keeps exactly what they have
--
--   psql ... -f supabase/124_premium_yearly.sql
--
-- Needs 101, 103 (runtour redeem), 107, 120 and 65. Safe to run more than once.
--
-- RUN IT BEFORE THE YEARLY SWITCH IS TURNED ON, and it does nothing to anybody
-- until then. With this file in and the switch off, the store keeps selling the
-- one-time bundles exactly as before. With the switch on and this file missing,
-- /api/stripe/offer answers 'once' and the store keeps selling the one-time
-- bundles too, because the server asks for premium_yearly_ready() before it will
-- sell a plan this database cannot record. So the order is: this file, then the
-- switch, and getting it wrong in either direction sells the old product rather
-- than a broken new one.
--
-- ---------------------------------------------------------------------------
-- THE RULE THAT WINS OVER EVERYTHING ELSE IN THIS FILE
-- ---------------------------------------------------------------------------
-- A lifetime row (premium_unlocks with expires_at null) is never given an end
-- date, never overwritten and never deleted by anything this file adds: not a
-- checkout, a renewal, a cancel, a refund, a lapse, a plan change in the portal
-- or a Fantasy Challenge prize. Every writer below says `where expires_at is not
-- null`, AND a trigger (section 2) refuses the update if a writer forgets. Two
-- guards, because the first one is a clause somebody can delete while tidying.
--
-- ---------------------------------------------------------------------------
-- ONE ROW PER PRODUCT STILL HOLDS, because the row now keeps its parts
-- ---------------------------------------------------------------------------
-- premium_unlocks is keyed (user_id, product), so a lifetime unlock, a yearly
-- plan and a 30 day Fantasy pass for the same product are ONE row. That can hold
-- "the latest of all grants" only if the row remembers where each end came from,
-- because a refund has to take the plan's time back without taking the pass's.
-- One number cannot do that: once a 30 day pass is folded into a plan's end
-- date, nothing can say which days were the prize. So the row keeps two:
--
--   sub_until    what the account's yearly plans grant, grace included
--   grant_until  what fixed grants give: a Fantasy pass, a bundle Arcade year,
--                a comp with an end date
--   expires_at   the answer every reader already asks, and always
--                greatest(sub_until, grant_until) on a row that ends
--
-- premium_products(), arcade_card_active(), the commish clock and the dynasty
-- meter all read expires_at and none of them changes. That is the whole reason
-- this is two columns rather than a second table of grants.
--
-- ---------------------------------------------------------------------------
-- A SECOND TABLE FOR THE PLANS, NOT THE ARCADE CARD'S subscriptions TABLE
-- ---------------------------------------------------------------------------
-- public.subscriptions (53) is keyed by user_id, so one account holds one row,
-- and EIGHT readers treat any active row there as an Arcade Card member: the
-- grid submit functions (70, 72, 74, 76, 79, 82, 85), arcade_card_active (101),
-- arcade/board.js and the Arcade checkout. A Perfect Season plan written there
-- would hand its buyer unlimited ranked arcade plays, break board.js's
-- maybeSingle() the moment an account held two rows, and make the Arcade
-- checkout refuse a real card buyer as already subscribed. So the plans live in
-- premium_subscriptions, keyed by stripe_sub_id, which is what lets an account
-- hold several. The Arcade table and every one of its readers are untouched.
-- ---------------------------------------------------------------------------

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The row keeps its parts
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.premium_unlocks add column if not exists sub_until   timestamptz;
alter table public.premium_unlocks add column if not exists grant_until timestamptz;

/* EVERY ROW THAT ENDS TODAY IS A FIXED GRANT, because no yearly plan has ever been
   sold. A Fantasy pass, a bundle's Arcade year and a comp with an end date all end
   where they end whatever a plan does, so today's end is their grant_until. Written
   only where both parts are still empty, so a second run of this file leaves alone
   anything a plan has since written. */
update public.premium_unlocks
   set grant_until = expires_at
 where expires_at is not null
   and grant_until is null
   and sub_until is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The guard: a lifetime row does not move
-- ─────────────────────────────────────────────────────────────────────────────
--
-- ONE THING MAY CHANGE ON A LIFETIME ROW, and only once: fulfilled_at going from
-- null to a time. runtour_redeem_bundle (103) stamps the Run The Tour bonus row
-- that way when the coins land, and that row has no end date. Everything else on
-- a row with expires_at null comes back exactly as it was, whatever the UPDATE
-- asked for, including an attempt to clear a fulfilled_at that is already set:
-- a merge-duplicates upsert that re-sent the bonus row would otherwise hand the
-- coins out a second time.
--
-- A ROW THAT ENDS MAY BECOME LIFETIME. That is somebody buying the one-time bundle
-- while a pass or a plan is running, and it is the one direction nothing needs
-- protecting from.
--
-- IT DOES NOT GUARD DELETE, deliberately. Deleting an account cascades through
-- this table from auth.users (65), and a player who deletes their account is the
-- one legitimate way a lifetime row goes. Nothing in this file deletes a row.
--
-- AND ON INSERT it fills grant_until for a writer that only knows expires_at. The
-- webhook deployed before this file writes the bundle's Arcade year that way, so
-- a row it inserts between this file and the new code still says where its end
-- came from.

create or replace function public.premium_unlocks_keep_lifetime()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.expires_at is null then
    new.user_id      := old.user_id;
    new.product      := old.product;
    new.source       := old.source;
    new.payload      := old.payload;
    new.expires_at   := null;
    new.granted_at   := old.granted_at;
    new.sub_until    := old.sub_until;
    new.grant_until  := old.grant_until;
    new.fulfilled_at := coalesce(old.fulfilled_at, new.fulfilled_at);
    return new;
  end if;
  if tg_op = 'INSERT' and new.expires_at is not null
     and new.grant_until is null and new.sub_until is null then
    new.grant_until := new.expires_at;
  end if;
  /* AND A WRITER THAT MOVES ONLY THE END. The deployed webhook's merge upsert, a pass
     revoked by hand in the SQL editor, and fantasy_pass_test.sql's own "day 31" all set
     expires_at and nothing else. Whoever did that meant the new end, so it becomes the
     fixed grant: left alone, grant_until would still hold the old end and the next
     recompute would quietly put it back. Every writer in this file moves one of the two
     parts, so none of them lands here. */
  if tg_op = 'UPDATE' and new.expires_at is not null
     and new.expires_at is distinct from old.expires_at
     and new.sub_until is not distinct from old.sub_until
     and new.grant_until is not distinct from old.grant_until then
    new.grant_until := new.expires_at;
  end if;
  return new;
end;
$$;

drop trigger if exists premium_unlocks_keep_lifetime_trg on public.premium_unlocks;
create trigger premium_unlocks_keep_lifetime_trg
  before insert or update on public.premium_unlocks
  for each row execute function public.premium_unlocks_keep_lifetime();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The plans
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.premium_subscriptions (
  stripe_sub_id        text primary key,
  user_id              uuid not null references auth.users(id) on delete cascade,
  bundle               text not null,
  stripe_customer_id   text,
  price_id             text,
  status               text not null default 'incomplete',
  current_period_end   timestamptz,
  cancel_at_period_end boolean not null default false,
  ended_at             timestamptz,
  -- The period end a refund or a chargeback took back. An event about that same
  -- period arriving late cannot grant it again; a renewal for a later one can.
  refunded_through     timestamptz,
  -- What this plan grants: the paid period plus grace while it is live, cut
  -- short by a refund, stopped at the end on a cancel.
  access_until         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint premium_subscriptions_bundle_ck
    check (bundle in ('perfect-season', 'run-the-bundle'))
);

create index if not exists premium_subscriptions_user_idx
  on public.premium_subscriptions (user_id);

alter table public.premium_subscriptions enable row level security;

-- The owner reads their own plans: the receipt says when one renews or ends from
-- this. Nobody writes from the client.
drop policy if exists "premium_subscriptions read own" on public.premium_subscriptions;
create policy "premium_subscriptions read own" on public.premium_subscriptions
  for select using (auth.uid() = user_id);

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on public.premium_subscriptions to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on public.premium_subscriptions to service_role;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The two numbers a plan is made of, written once
-- ─────────────────────────────────────────────────────────────────────────────

/* WHAT EACH YEARLY PLAN UNLOCKS WHILE IT IS PAID FOR. The Run The Tour bonus is not
   here: it is handed over once per account and never ends, so it is not something
   a plan keeps alive. functions/api/stripe/_bundles.js is the catalog and
   scripts/stripe/verify-bundles.mjs holds this list to it. */
create or replace function public.premium_bundle_products(p_bundle text)
returns text[]
language sql
immutable
as $$
  select case p_bundle
    when 'perfect-season' then array['ps_premium', 'cfb_premium']
    when 'run-the-bundle' then array['ps_premium', 'cfb_premium', 'arcade_card_year']
    else array[]::text[]
  end;
$$;

/* HOW LONG PRO STAYS ON PAST THE PAID PERIOD WHILE STRIPE RETRIES A CARD. Seven
   days, the owner's call (2026-09). It also covers a renewal webhook that lands
   late. It is NOT added after a cancel: a plan that ends at the end of its period
   ends there. */
create or replace function public.premium_yearly_grace()
returns interval
language sql
immutable
as $$ select interval '7 days' $$;

/* WHAT THE SERVER ASKS BEFORE IT WILL SELL A YEARLY PLAN. A database without this
   file answers "function does not exist", and /api/stripe/offer reads that as
   "keep selling the one-time bundles". */
create or replace function public.premium_yearly_ready()
returns int
language sql
immutable
as $$ select 1 $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Recomputing an account's rows from its plans
-- ─────────────────────────────────────────────────────────────────────────────
--
-- sub_until for a product is the latest access_until over EVERY plan this
-- account holds that unlocks it, so two plans (a Perfect Season plan and a Run
-- The Bundle plan, bought in that order) cannot shorten each other, and a plan
-- that ends leaves the other's time where it is.
--
-- A row that does not exist yet is only created by a plan that is still paid for.
-- A refund for a product the account never had a row for writes nothing.

create or replace function public.premium_recompute(p_user uuid, p_products text[],
                                                    p_source text, p_payload jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_prod text;
  v_sub  timestamptz;
begin
  foreach v_prod in array p_products loop
    select max(s.access_until) into v_sub
      from public.premium_subscriptions s
     where s.user_id = p_user
       and v_prod = any (public.premium_bundle_products(s.bundle));

    if v_sub is null or v_sub <= now() then
      -- Nothing to add. Only an existing row that ends is brought down to what is
      -- left of its fixed grants.
      update public.premium_unlocks u
         set sub_until  = v_sub,
             expires_at = coalesce(greatest(v_sub, u.grant_until), least(u.expires_at, now()))
       where u.user_id = p_user and u.product = v_prod
         and u.expires_at is not null;
      continue;
    end if;

    insert into public.premium_unlocks
      (user_id, product, source, payload, sub_until, expires_at, fulfilled_at, granted_at)
    values
      (p_user, v_prod, p_source, coalesce(p_payload, '{}'::jsonb), v_sub, v_sub, now(), now())
    on conflict (user_id, product) do update
       set sub_until  = excluded.sub_until,
           expires_at = greatest(excluded.sub_until, public.premium_unlocks.grant_until),
           /* A PASS KEEPS ITS NAME. A row a Fantasy prize made says so for as long as
              the prize has time on it, so the receipt still says Won and ps_is_pro
              still skips it; the plan is recorded in sub_until either way. */
           source     = case when public.premium_unlocks.grant_until > now()
                             then public.premium_unlocks.source else excluded.source end,
           payload    = public.premium_unlocks.payload || excluded.payload,
           fulfilled_at = coalesce(public.premium_unlocks.fulfilled_at, now())
     where public.premium_unlocks.expires_at is not null;
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. The webhook's one door
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Every Stripe event about a yearly plan comes through here, as one of five kinds:
--
--   grant   checkout.session.completed / async_payment_succeeded
--   renew   invoice.paid
--   update  customer.subscription.updated
--   delete  customer.subscription.deleted
--   refund  a full refund or a chargeback on the plan's invoice
--
-- THE STATUS DECIDES, NOT THE KIND, for everything but a refund. Stripe delivers
-- events out of order and more than once, so each call reads the plan as it now
-- stands and moves access_until by the rules below, which are safe to apply twice
-- and in any order:
--
--   active, trialing        access_until = max(what it was, period end + grace)
--   past_due, incomplete,   left where it is: the grace already on it is the
--   paused                  whole of what a failing card gets
--   canceled, unpaid,       access_until = min(what it was, ended_at or now)
--   incomplete_expired      and a finished plan stays finished: a stale
--                           "active" arriving after the delete grants nothing
--   refund                  access_until = min(what it was, now), and the period
--                           it covered is remembered so a late "active" for that
--                           same period grants nothing either
--
-- THE BONUS. p_bonus is what the catalog says Run The Bundle hands over once
-- (100,000 coins and a Tour Pack). It is written as the runtour_pack row with
-- ON CONFLICT DO NOTHING, which is the whole of "once per account, ever": a
-- renewal, a second plan, a plan change and a buyer who already got it from the
-- one-time bundle all find the row there and write nothing. Never a merge: a
-- merge re-sends fulfilled_at as null and 103's redeem would pay the coins again.
-- Only a plan that is paid for right now hands it over.

create or replace function public.premium_sub_apply(
  p_sub_id      text,
  p_user        uuid,
  p_bundle      text,
  p_status      text,
  p_period_end  timestamptz,
  p_cancel      boolean,
  p_ended_at    timestamptz,
  p_customer    text,
  p_price       text,
  p_kind        text,
  p_bonus       jsonb default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_old      public.premium_subscriptions%rowtype;
  v_found    boolean;
  v_user     uuid;
  v_bundle   text;
  v_status   text;
  v_until    timestamptz;
  v_refunded timestamptz;
  v_period   timestamptz;
  v_prods    text[];
  v_bonus    boolean := false;
  v_n        int;
begin
  if p_kind not in ('grant', 'renew', 'update', 'delete', 'refund') then
    raise exception 'premium_sub_apply: unknown kind %', p_kind;
  end if;
  if p_sub_id is null or p_sub_id = '' then
    raise exception 'premium_sub_apply: no subscription id';
  end if;

  select * into v_old from public.premium_subscriptions
   where stripe_sub_id = p_sub_id for update;
  v_found := found;

  v_user := case when v_found then v_old.user_id else p_user end;
  if v_user is null then
    -- A plan this site never sold, or one whose first event has not arrived. There
    -- is nobody to grant to, and retrying will not find anybody either.
    return jsonb_build_object('ok', false, 'reason', 'no_user');
  end if;
  if v_found and p_user is not null and p_user <> v_old.user_id then
    raise exception 'premium_sub_apply: % belongs to another account', p_sub_id;
  end if;

  v_bundle := coalesce(p_bundle, v_old.bundle);
  if cardinality(public.premium_bundle_products(v_bundle)) = 0 then
    raise exception 'premium_sub_apply: unknown bundle %', v_bundle;
  end if;

  v_status   := coalesce(p_status, v_old.status, 'incomplete');
  v_period   := greatest(p_period_end, v_old.current_period_end);
  v_until    := v_old.access_until;
  v_refunded := v_old.refunded_through;

  if p_kind = 'refund' then
    v_refunded := greatest(v_refunded, coalesce(p_period_end, v_old.current_period_end, now()));
    v_until    := least(coalesce(v_until, now()), now());
    v_status   := coalesce(v_old.status, v_status);
  elsif v_found and v_old.status in ('canceled', 'incomplete_expired') then
    -- Finished. Stripe never brings one back, so nothing after this moves it.
    v_status := v_old.status;
    v_bundle := v_old.bundle;
  elsif v_status in ('active', 'trialing') and p_kind <> 'delete' then
    if v_refunded is not null and p_period_end is not null and p_period_end <= v_refunded then
      null;   -- the period a refund took back is not granted twice
    else
      v_until := greatest(v_until, p_period_end + public.premium_yearly_grace());
    end if;
  elsif v_status in ('canceled', 'unpaid', 'incomplete_expired') or p_kind = 'delete' then
    v_until := least(coalesce(v_until, coalesce(p_ended_at, now())), coalesce(p_ended_at, now()));
    if p_kind = 'delete' and v_status not in ('canceled', 'unpaid', 'incomplete_expired') then
      v_status := 'canceled';
    end if;
  end if;

  insert into public.premium_subscriptions
    (stripe_sub_id, user_id, bundle, stripe_customer_id, price_id, status,
     current_period_end, cancel_at_period_end, ended_at, refunded_through,
     access_until, updated_at)
  values
    (p_sub_id, v_user, v_bundle, p_customer, p_price, v_status,
     v_period, coalesce(p_cancel, false), p_ended_at, v_refunded,
     v_until, now())
  on conflict (stripe_sub_id) do update
     set bundle               = excluded.bundle,
         stripe_customer_id   = coalesce(excluded.stripe_customer_id, public.premium_subscriptions.stripe_customer_id),
         price_id             = coalesce(excluded.price_id, public.premium_subscriptions.price_id),
         status               = excluded.status,
         current_period_end   = excluded.current_period_end,
         cancel_at_period_end = case when p_cancel is null
                                     then public.premium_subscriptions.cancel_at_period_end
                                     else excluded.cancel_at_period_end end,
         ended_at             = coalesce(excluded.ended_at, public.premium_subscriptions.ended_at),
         refunded_through     = excluded.refunded_through,
         access_until         = excluded.access_until,
         updated_at           = now();

  /* THE OLD BUNDLE'S PRODUCTS TOO, so a plan changed in the portal from Run The
     Bundle down to Perfect Season takes the Arcade Card back off with it. */
  v_prods := array(select distinct unnest(
               public.premium_bundle_products(v_bundle) ||
               public.premium_bundle_products(coalesce(v_old.bundle, v_bundle))));
  perform public.premium_recompute(
    v_user, v_prods, 'sub:' || v_bundle,
    jsonb_build_object('stripe_sub', p_sub_id, 'stripe_customer', p_customer));

  if p_bonus is not null and v_bundle = 'run-the-bundle' and p_kind <> 'refund'
     and v_status in ('active', 'trialing') and v_until > now() then
    insert into public.premium_unlocks
      (user_id, product, source, payload, expires_at, fulfilled_at, granted_at)
    values
      (v_user, 'runtour_pack', 'sub:run-the-bundle',
       p_bonus || jsonb_build_object('stripe_sub', p_sub_id, 'stripe_customer', p_customer),
       null, null, now())
    on conflict (user_id, product) do nothing;
    get diagnostics v_n = row_count;
    v_bonus := v_n > 0;
  end if;

  return jsonb_build_object('ok', true, 'user', v_user, 'bundle', v_bundle,
    'status', v_status, 'access_until', v_until, 'bonus', v_bonus);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. The one-time bundles go through the same rules
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The webhook's old path was one merge-duplicates upsert over every product, and
-- two things in it are wrong once plans exist. A bundle's Arcade year written as
-- now() + 12 months over a row a plan keeps alive can SHORTEN it. And the
-- runtour_pack row sent as a merge re-sends fulfilled_at as null. So a paid
-- one-time bundle comes here: permanent products become lifetime (a row that
-- ends is upgraded, a lifetime row is left alone), a timed product adds its
-- months to the later of now and what it already had, and the bonus is insert
-- if absent. The webhook falls back to its old upsert only against a database
-- without this function, where no plan can exist.

create or replace function public.premium_grant_bundle(
  p_user uuid, p_bundle text, p_grants jsonb, p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  g        jsonb;
  v_prod   text;
  v_months int;
  v_src    text := 'bundle:' || p_bundle;
  v_pay    jsonb;
begin
  if p_user is null then raise exception 'premium_grant_bundle: no user'; end if;
  for g in select * from jsonb_array_elements(coalesce(p_grants, '[]'::jsonb)) loop
    v_prod   := g->>'product';
    v_months := nullif(g->>'months', '')::int;
    v_pay    := coalesce(p_payload, '{}'::jsonb) || coalesce(g->'payload', '{}'::jsonb);

    if v_prod = 'runtour_pack' then
      insert into public.premium_unlocks
        (user_id, product, source, payload, expires_at, fulfilled_at, granted_at)
      values (p_user, v_prod, v_src, v_pay, null, null, now())
      on conflict (user_id, product) do nothing;
    elsif v_months is not null then
      insert into public.premium_unlocks
        (user_id, product, source, payload, grant_until, expires_at, fulfilled_at, granted_at)
      values (p_user, v_prod, v_src, v_pay,
              now() + make_interval(months => v_months),
              now() + make_interval(months => v_months), now(), now())
      on conflict (user_id, product) do update
         set grant_until = greatest(public.premium_unlocks.grant_until, now())
                           + make_interval(months => v_months),
             expires_at  = greatest(public.premium_unlocks.sub_until,
                                    greatest(public.premium_unlocks.grant_until, now())
                                    + make_interval(months => v_months)),
             source      = excluded.source,
             payload     = public.premium_unlocks.payload || excluded.payload,
             granted_at  = now(),
             fulfilled_at = now()
       where public.premium_unlocks.expires_at is not null;
    else
      insert into public.premium_unlocks
        (user_id, product, source, payload, expires_at, fulfilled_at, granted_at)
      values (p_user, v_prod, v_src, v_pay, null, now(), now())
      on conflict (user_id, product) do update
         set expires_at   = null,
             source       = excluded.source,
             payload      = public.premium_unlocks.payload || excluded.payload,
             granted_at   = now(),
             fulfilled_at = now()
       where public.premium_unlocks.expires_at is not null;
    end if;
  end loop;
  return jsonb_build_object('ok', true);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. The Fantasy prize stacks on its own time, never on a plan's
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 120's function, with three changes. The 30 days go on grant_until, stacked from
-- the later of the running pass and now, so a win during a paid plan is still 30
-- days of its own after the plan ends and a renewal cannot swallow it. expires_at
-- is the later of the two. And the payload is merged rather than replaced, so a
-- plan's Stripe customer on the same row survives the prize.
--
-- pass_until reports the PASS, not the row: a winner who also holds a plan is told
-- when the prize ends, which is the thing they won.

create or replace function public.fantasy_grant_pass(
  p_season int, p_week int, p_force boolean default false)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_prize   public.fantasy_prizes%rowtype;
  v_entries int;
  v_tag     text := 'fantasy:' || p_season || '-w' || p_week;
  v_until   timestamptz;
begin
  select * into v_prize from public.fantasy_prizes
   where season = p_season and week = p_week and place = 1
   for update;
  if not found then return 'no winner'; end if;
  if v_prize.promo_state <> 'none' then return v_prize.promo_state; end if;

  select count(*)::int into v_entries from public.fantasy_entries
   where season = p_season and week = p_week;
  if v_entries < 2 and not p_force then
    update public.fantasy_prizes set promo_state = 'void'
     where season = p_season and week = p_week and place = 1;
    return 'void';
  end if;

  insert into public.premium_unlocks
    (user_id, product, source, payload, grant_until, expires_at, fulfilled_at)
  select v_prize.user_id, pr.product, v_tag,
         jsonb_build_object('season', p_season, 'week', p_week),
         now() + interval '30 days', now() + interval '30 days', now()
    from unnest(array['ps_premium', 'cfb_premium']) as pr(product)
  on conflict (user_id, product) do update
     set grant_until = greatest(public.premium_unlocks.grant_until, now()) + interval '30 days',
         expires_at  = greatest(public.premium_unlocks.sub_until,
                                greatest(public.premium_unlocks.grant_until, now()) + interval '30 days'),
         source      = excluded.source,
         payload     = public.premium_unlocks.payload || excluded.payload,
         granted_at  = now(),
         fulfilled_at = now()
   where public.premium_unlocks.expires_at is not null;

  select case when bool_or(u.expires_at is null) then null else max(u.grant_until) end
    into v_until
    from public.premium_unlocks u
   where u.user_id = v_prize.user_id and u.product in ('ps_premium', 'cfb_premium');

  update public.fantasy_prizes
     set promo_state = 'granted', pass_until = v_until, minted_at = now()
   where season = p_season and week = p_week and place = 1;
  return 'granted';
end;
$$;

revoke all on function public.fantasy_grant_pass(int, int, boolean) from public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Gold names: while a plan is paid for, and never backwards
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The owner's call (2026-09): a yearly subscriber's name is gold on the rows they
-- file while subscribed, and those rows stay gold. So ps_is_pro, which stamps a
-- row as it is filed (107), answers yes while sub_until is ahead. The backfill
-- that gilds an account's OLDER rows is for a lifetime purchase only: subscribing
-- does not reach back and gild seasons played before it, and a pass never did.
--
-- AND THE BACKFILL ONLY ANSWERS TO THE TWO FOOTBALL PRODUCTS, which it did not.
-- 107 fired on any insert, so buying Run The Diamond Pro or Run The Floor Pro gilded
-- every football board row that account had, for a product with no Pro tier there.

create or replace function public.ps_is_pro(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.premium_unlocks u
     where u.user_id = p_user
       and u.product in ('ps_premium', 'cfb_premium')
       and (
             (u.expires_at is null and u.source not like 'fantasy:%')
          or coalesce(u.sub_until, '-infinity'::timestamptz) > now()
          or (u.expires_at > now() and u.source not like 'fantasy:%'
              and u.source not like 'sub:%')
       )
  );
$$;

create or replace function public.premium_unlocks_backfill_pro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.product not in ('ps_premium', 'cfb_premium') then
    return new;
  end if;
  if new.expires_at is not null
     and (new.source like 'fantasy:%' or new.source like 'sub:%' or new.sub_until is not null) then
    return new;
  end if;
  update public.ps_runs r
     set display_pro = true
   where r.user_id = new.user_id
     and r.display_pro is distinct from true;
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Deleting an account with a plan that will charge again is refused
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 65's function with the plans added to the check. premium_subscriptions cascades
-- off auth.users exactly as subscriptions does, so deleting the account would drop
-- the only record of a plan Stripe goes on billing. A plan cancelled at the end of
-- its period will not charge again, so it does not block.

create or replace function public.rtg_delete_my_account()
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid  uuid := auth.uid();
  v_sub  text;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  select status into v_sub
    from public.subscriptions
   where user_id = v_uid
     and status in ('active', 'trialing', 'past_due')
   limit 1;

  if v_sub is null and to_regclass('public.premium_subscriptions') is not null then
    select status into v_sub
      from public.premium_subscriptions
     where user_id = v_uid
       and status in ('active', 'trialing', 'past_due')
       and not cancel_at_period_end
     limit 1;
  end if;

  if v_sub is not null then
    return json_build_object('ok', false, 'reason', 'active_subscription', 'status', v_sub);
  end if;

  delete from public.profiles where id = v_uid;
  delete from auth.users where id = v_uid;
  return json_build_object('ok', true);
end;
$$;

revoke all on function public.rtg_delete_my_account() from public, anon;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.rtg_delete_my_account() to authenticated;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Who may call what
-- ─────────────────────────────────────────────────────────────────────────────
-- The webhook's functions are the service role's alone: a browser that could call
-- premium_sub_apply could grant itself a year.

revoke all on function public.premium_sub_apply(text, uuid, text, text, timestamptz, boolean,
  timestamptz, text, text, text, jsonb) from public;
revoke all on function public.premium_grant_bundle(uuid, text, jsonb, jsonb) from public;
revoke all on function public.premium_recompute(uuid, text[], text, jsonb) from public;
revoke all on function public.premium_yearly_ready() from public;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.premium_sub_apply(text, uuid, text, text, timestamptz, boolean,
      timestamptz, text, text, text, jsonb) from anon;
    revoke all on function public.premium_grant_bundle(uuid, text, jsonb, jsonb) from anon;
    revoke all on function public.premium_recompute(uuid, text[], text, jsonb) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.premium_sub_apply(text, uuid, text, text, timestamptz, boolean,
      timestamptz, text, text, text, jsonb) from authenticated;
    revoke all on function public.premium_grant_bundle(uuid, text, jsonb, jsonb) from authenticated;
    revoke all on function public.premium_recompute(uuid, text[], text, jsonb) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.premium_sub_apply(text, uuid, text, text, timestamptz, boolean,
      timestamptz, text, text, text, jsonb) to service_role;
    grant execute on function public.premium_grant_bundle(uuid, text, jsonb, jsonb) to service_role;
    grant execute on function public.premium_recompute(uuid, text[], text, jsonb) to service_role;
    grant execute on function public.premium_yearly_ready() to service_role;
  end if;
end $$;

notify pgrst, 'reload schema';
