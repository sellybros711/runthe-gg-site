# Run The Arcade Card — Stripe rollout runbook

Access tiers: **Guest** 1 play/day (client-side), **Free account** 3 plays/day
(server-enforced), **Arcade Card** (paid) unlimited plays + full past-day
archive. Arcade Card is the single subscription entitlement — it reuses the
existing `subscriptions` table and the `runthegrid_pro` client flag (kept for
back-compat; consumer-facing name is "Arcade Card").

## One-time setup

1. **Supabase** — run in the SQL editor, in order:
   - `supabase/52_grid_daily.sql` (daily boards/leaderboards)
   - `supabase/53_grid_pro.sql` (subscriptions table)
   - `supabase/69_arcade_card.sql` (webhook dedupe `stripe_events`, the
     server token counter `arcade_plays`, and the RPCs `arcade_spend_token`,
     `arcade_tokens_status`, `arcade_card_active`)
2. **Stripe** — create ONE Product **"Run The Arcade Card"** with TWO recurring
   Prices: Monthly $5.99 and Annual $49.99. (No free trial — the free tier is the
   try-before-you-buy.) Set **Monthly** as the product's default
   price. Copy both `price_...` ids. Point a webhook endpoint at
   `https://runthe.gg/api/stripe/webhook` with events:
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`. Copy the `whsec_...` secret. Enable the
   **Customer Portal** (Settings → Billing → Customer portal) with cancel +
   update-payment. Stripe Tax: leave on (checkout sends `automatic_tax`).
3. **Cloudflare Pages → Settings → Environment variables** (Production):
   - `STRIPE_SECRET_KEY`            = sk_live_... (sk_test_ while testing)
   - `STRIPE_PRICE_ARCADE_MONTHLY`  = price_... (Monthly)
   - `STRIPE_PRICE_ARCADE_ANNUAL`   = price_... (Annual)
   - `STRIPE_WEBHOOK_SECRET`        = whsec_...
   - `SUPABASE_URL`                 = https://<project>.supabase.co
   - `SUPABASE_SERVICE_ROLE`        = service-role key (server-side only)
   - `SITE_URL`                     = https://runthe.gg
   (The old single `STRIPE_PRICE_ID` is no longer used by the Arcade Card flow.)

## Flow

- Paywall / archive → **Get Arcade Card** (monthly or annual) → POST
  `/api/stripe/checkout` `{ user_id, plan, return_path }` → Stripe Checkout
  (tax, existing customer reused) → `checkout.session.completed`
  webhook upserts `subscriptions` (status `active`) → `board.js` mirrors the
  active/trialing row into `localStorage.runthegrid_pro` → tokens.js (unlimited)
  and archive.js (past days) honor it. active, past_due, canceled all flow
  through `customer.subscription.updated/deleted`. Duplicate deliveries are
  ignored via `stripe_events`.
- Manage/cancel → POST `/api/stripe/portal` `{ user_id, return_path }` → Stripe
  Customer Portal.

## Before public launch

- Flip `arcade/tokens.js` `TESTING = false` to enforce the tiers.
- Remove the "Preview unlock (testing)" link on `/arcade/archive/`.
- Repeat the Stripe steps in **Live mode** (new live `price_...` ids + live
  `sk_live_`/`whsec_`), and swap the Cloudflare env values from test to live.
- Test end-to-end with `sk_test_` + Stripe test cards / test clocks first.
