-- ---------------------------------------------------------------------------
-- 121_baseball_pro.sql : Run The Diamond Pro, and one free play a day of each
-- extra mode
--
--   psql ... -f supabase/121_baseball_pro.sql
--
-- Needs 101 (premium_unlocks). Safe to run more than once.
--
-- RUN THIS BEFORE STRIPE_PRICE_RTD_PRO IS SET, for the reason 101 gives: the
-- webhook grants a paid session by inserting into premium_unlocks, and until the
-- constraint below allows 'rtd_premium' every such insert is refused, the webhook
-- answers 500, and Stripe retries into the same wall. Nobody loses money (the
-- retry lands once this has run), but the order is migration, env var, sell.
--
-- WHAT IS SOLD. 'rtd_premium' is a permanent unlock bought once for $9.99 (the
-- amount lives in Stripe, see scripts/stripe/setup-premium-bundles.mjs). It
-- removes the daily limit on the six extra modes. Classic and the daily are
-- never metered and never sold.
--
-- WHAT IS COUNTED. Starting a run in one of the six modes: Eras, One Franchise,
-- Division, Cap Survivor, All-Time Pitching Staff and the Trade Machine. One
-- start per mode per Eastern day, so six free plays a day across the six. The
-- key is the mode name the board already files under (runModeOf in the page),
-- so there is one spelling of each mode on the whole server.
--
-- WHY THE SERVER HOLDS IT, and not only the browser: 99_daily_attempts.sql says
-- it at length. A limit that gates a paid tier is worth bypassing, and in a
-- browser it is bypassed by clearing site data. A guest has no account and so is
-- counted on the device alone, which is the most this game can do for somebody it
-- does not know.
--
-- IT FAILS OPEN, like every allowance on this site. The page lets the run
-- through when this cannot be reached. A wrongly granted run costs a fraction of
-- a sale; a wrongly refused one costs a player who came back.
-- ---------------------------------------------------------------------------

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The product
-- ─────────────────────────────────────────────────────────────────────────────
-- 101's list plus one. scripts/stripe/verify-bundles.mjs reads the LAST
-- definition of this constraint across every migration, so this is the one it
-- holds the catalog to now.

alter table public.premium_unlocks
  drop constraint if exists premium_unlocks_product_ck;
alter table public.premium_unlocks
  add constraint premium_unlocks_product_ck
    check (product in ('ps_premium', 'cfb_premium', 'arcade_card_year', 'runtour_pack', 'rtd_premium'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The ledger
-- ─────────────────────────────────────────────────────────────────────────────
-- One row per player per mode per day, and the row IS the play: the primary key
-- is the whole rule, so a second start on one day cannot be written at all.

create table if not exists public.rtd_mode_plays (
  user_id   uuid not null references auth.users(id) on delete cascade,
  mode      text not null,
  day       date not null,
  played_at timestamptz not null default now(),
  primary key (user_id, mode, day),
  constraint rtd_mode_plays_mode_ck
    check (mode in ('era', 'franchise', 'division', 'capsurvivor', 'staff', 'trade'))
);

alter table public.rtd_mode_plays enable row level security;

-- Read your own; every write goes through rtd_mode_spend below.
drop policy if exists "rtd_mode_plays read own" on public.rtd_mode_plays;
create policy "rtd_mode_plays read own" on public.rtd_mode_plays
  for select using (auth.uid() = user_id);
grant select on public.rtd_mode_plays to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The day and the pass
-- ─────────────────────────────────────────────────────────────────────────────
-- The Eastern day, which is the page's easternISO() and the board's
-- rtd_board_day(). Written out rather than borrowed so this file needs nothing
-- but 101.

create or replace function public.rtd_mode_day()
returns date
language sql stable
as $$ select (now() at time zone 'America/New_York')::date $$;

-- Pro, read off the table the webhook writes. An end date is honoured, so a
-- comp or a prize given with one ends when it says.
create or replace function public.rtd_is_pro(p_uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.premium_unlocks u
     where u.user_id = p_uid
       and u.product = 'rtd_premium'
       and (u.expires_at is null or u.expires_at > now()));
$$;
revoke all on function public.rtd_is_pro(uuid) from public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. What the page asks
-- ─────────────────────────────────────────────────────────────────────────────
-- { pro, day, used: [modes played today], next_at } for the caller. `next_at` is
-- the next Eastern midnight as a real instant, so a countdown runs off the
-- server's clock rather than the phone's.

create or replace function public.rtd_mode_state()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day date := public.rtd_mode_day();
begin
  if v_uid is null then
    return jsonb_build_object('signed_in', false);
  end if;
  return jsonb_build_object(
    'signed_in', true,
    'pro', public.rtd_is_pro(v_uid),
    'day', v_day,
    'used', coalesce((select jsonb_agg(p.mode order by p.mode)
                        from public.rtd_mode_plays p
                       where p.user_id = v_uid and p.day = v_day), '[]'::jsonb),
    'next_at', ((v_day + 1)::timestamp at time zone 'America/New_York'));
end;
$$;
grant execute on function public.rtd_mode_state() to authenticated;

-- Starting a run. { ok, pro, mode }. A Pro account is never written to the
-- ledger at all, so a client bug cannot meter somebody who paid.
create or replace function public.rtd_mode_spend(p_mode text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_n   int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'signed_out');
  end if;
  if p_mode is null or p_mode not in ('era', 'franchise', 'division', 'capsurvivor', 'staff', 'trade') then
    return jsonb_build_object('ok', false, 'reason', 'unknown_mode');
  end if;
  if public.rtd_is_pro(v_uid) then
    return jsonb_build_object('ok', true, 'pro', true, 'mode', p_mode);
  end if;
  insert into public.rtd_mode_plays (user_id, mode, day)
  values (v_uid, p_mode, public.rtd_mode_day())
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n = 1, 'pro', false, 'mode', p_mode,
                            'reason', case when v_n = 1 then null else 'used_today' end);
end;
$$;
grant execute on function public.rtd_mode_spend(text) to authenticated;
