-- Run The Arcade Card — server-side pieces for the play economy.
--
-- 1) stripe_events   : webhook idempotency (dedupe redelivered Stripe events)
-- 2) arcade_plays     : server-authoritative daily token counter for signed-in users
-- 3) arcade_card_active(uid) : is this user an entitled Arcade Card member?
-- 4) arcade_spend_token()    : atomically spend one daily token (source of truth)
-- 5) arcade_tokens_status()  : read remaining tokens without spending
--
-- Guests are enforced client-side (1/day in localStorage) — acceptable per spec.
-- Signed-in FREE users get 3/day, enforced HERE so clearing localStorage can't
-- grant extra plays. Arcade Card members are unlimited. The "day" is the server's
-- America/New_York date (a single, un-spoofable boundary for everyone) — the
-- client's local wallet is UX only; this function is the gate.
--
-- Idempotent: safe to run more than once.

-- ---------- 1) webhook idempotency ------------------------------------------
create table if not exists public.stripe_events (
  id         text primary key,          -- Stripe event id (evt_...)
  type       text,
  created_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
-- no policies: only the service-role webhook writes; nobody reads from the client.

-- ---------- 2) daily token counter ------------------------------------------
create table if not exists public.arcade_plays (
  user_id   uuid not null references auth.users(id) on delete cascade,
  play_date date not null,
  plays     int  not null default 0,
  primary key (user_id, play_date)
);
alter table public.arcade_plays enable row level security;
drop policy if exists "arcade_plays read own" on public.arcade_plays;
create policy "arcade_plays read own" on public.arcade_plays
  for select using (auth.uid() = user_id);
-- writes happen only through the SECURITY DEFINER function below.

-- ---------- 3) entitlement helper -------------------------------------------
-- Mirrors board.js syncPro(): active|trialing, with a 1-day grace past period end.
create or replace function public.arcade_card_active(p_uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = p_uid
      and s.status in ('active','trialing')
      and (s.current_period_end is null or s.current_period_end > now() - interval '1 day')
  );
$$;

-- ---------- 4) spend one token (atomic) -------------------------------------
create or replace function public.arcade_spend_token()
returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  d   date := (now() at time zone 'America/New_York')::date;
  cap int  := 3;
  v_plays int;
begin
  if uid is null then
    return json_build_object('ok', false, 'reason', 'not_signed_in');
  end if;
  if public.arcade_card_active(uid) then
    return json_build_object('ok', true, 'unlimited', true);
  end if;

  insert into public.arcade_plays (user_id, play_date, plays)
    values (uid, d, 1)
    on conflict (user_id, play_date)
      do update set plays = public.arcade_plays.plays + 1
      where public.arcade_plays.plays < cap
    returning plays into v_plays;

  if v_plays is null then                    -- cap already reached today
    select plays into v_plays from public.arcade_plays where user_id = uid and play_date = d;
    return json_build_object('ok', false, 'unlimited', false, 'used', coalesce(v_plays, cap), 'remaining', 0);
  end if;

  return json_build_object('ok', true, 'unlimited', false, 'used', v_plays, 'remaining', cap - v_plays);
end $$;

-- ---------- 5) read status (no spend) ---------------------------------------
create or replace function public.arcade_tokens_status()
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  d   date := (now() at time zone 'America/New_York')::date;
  cap int  := 3;
  v_plays int;
begin
  if uid is null then
    return json_build_object('signed_in', false);
  end if;
  if public.arcade_card_active(uid) then
    return json_build_object('signed_in', true, 'unlimited', true);
  end if;
  select plays into v_plays from public.arcade_plays where user_id = uid and play_date = d;
  v_plays := coalesce(v_plays, 0);
  return json_build_object('signed_in', true, 'unlimited', false, 'cap', cap, 'used', v_plays, 'remaining', greatest(0, cap - v_plays));
end $$;

revoke all on function public.arcade_spend_token()   from public, anon;
revoke all on function public.arcade_tokens_status()  from public, anon;
revoke all on function public.arcade_card_active(uuid) from public, anon;
grant execute on function public.arcade_spend_token()  to authenticated;
grant execute on function public.arcade_tokens_status() to authenticated;
grant execute on function public.arcade_card_active(uuid) to authenticated;
