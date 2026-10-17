-- ---------------------------------------------------------------------------
-- 149_putt_lives_buy.sql : Putt Putt lives bought with real money.
--
-- Safe to run more than once. Needs 146_putt_lives_nine.sql.
--
-- The owner's call (2026-10-16): a player who runs out of lives can buy nine
-- lives back for $4.99. It supersedes "no paid refill at launch" (146).
--
-- WHO WRITES. Only the Stripe webhook, through putt_lives_buy(), with the
-- service role. A paid checkout session (functions/api/stripe/_bundles.js
-- PUTT_LIVES) is filed once, keyed on the session, so Stripe retrying the same
-- delivery hands lives back once. No browser role can insert or read.
--
-- WHAT A BUY DOES. It cancels the clocks of p_lives lost lives, the ones due
-- back LAST, so whatever is still on a clock comes back as soon as it would
-- have. lives is then the max less what is still on a clock, which is what
-- putt_lives_state() answers the page. Checkout only sells to a player missing
-- at least p_lives lives, so a buy never hands back fewer than it says; if the
-- clocks ran out between checkout and payment, it cancels what is left.
-- ---------------------------------------------------------------------------

create table if not exists public.putt_lives_buys (
  session_id  text primary key check (session_id ~ '^[A-Za-z0-9_]{6,200}$'),
  user_id     uuid not null,
  lives       int  not null check (lives between 1 and 18),
  given       int  not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists putt_lives_buys_user on public.putt_lives_buys (user_id);

alter table public.putt_lives_buys enable row level security;
revoke all on public.putt_lives_buys from anon, authenticated;

-- the webhook's writer. True when this session was new, false on a retry.
create or replace function public.putt_lives_buy(p_session text, p_user uuid, p_lives int)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  kept timestamptz[];
  n    int;
  give int;
begin
  insert into putt_lives_buys (session_id, user_id, lives) values (p_session, p_user, p_lives)
    on conflict (session_id) do nothing;
  if not found then return false; end if;

  insert into putt_lives as pl (user_id, lives, back_at, refill_at, nine)
    values (p_user, 9, '{}', null, true)
    on conflict (user_id) do nothing;
  perform 1 from putt_lives pl where pl.user_id = p_user for update;

  kept := coalesce((select array_agg(b order by b) from putt_lives pl, unnest(pl.back_at) b
                     where pl.user_id = p_user and b > now()), '{}');
  n    := coalesce(array_length(kept, 1), 0);
  give := least(n, p_lives);
  kept := case when n > give then kept[1:n - give] else '{}'::timestamptz[] end;

  update putt_lives pl
     set back_at    = kept,
         -- nine less what is still on a clock; putt_lives_state() redoes it with the
         -- player's own max (18 with a Tour Pass) the next time the page asks
         lives      = greatest(0, 9 - coalesce(array_length(kept, 1), 0)),
         refill_at  = kept[1],
         updated_at = now()
   where pl.user_id = p_user;
  update putt_lives_buys set given = give where session_id = p_session;
  return true;
end $$;
revoke all on function public.putt_lives_buy(text, uuid, int) from public, anon, authenticated;
