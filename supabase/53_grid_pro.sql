-- RunTheGrid Pro — Stripe subscription entitlements
-- Run once in the Supabase SQL editor (after 52_grid_daily.sql).
--
-- Written ONLY by the Stripe webhook (service role); clients read their own row.
-- board.js mirrors an active row into localStorage 'runthegrid_pro'.

create table if not exists public.subscriptions (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_sub_id      text unique,
  price_id           text,
  status             text not null default 'incomplete',  -- active | trialing | past_due | canceled | incomplete
  current_period_end timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

-- each signed-in user may read their own subscription; nobody writes from the client
drop policy if exists "subscriptions read own" on public.subscriptions;
create policy "subscriptions read own" on public.subscriptions
  for select using (auth.uid() = user_id);

-- no insert/update/delete policies: only the service-role key (webhook) writes.

create index if not exists subscriptions_customer_idx on public.subscriptions (stripe_customer_id);
