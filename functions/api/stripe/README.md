# Run The Arcade Pro — Stripe rollout runbook

Free tier: one ranked play per game per day (8 games). Pro: unlimited plays +
the full past-day archive (back to launch, 2026-07-22).

## One-time setup

1. **Supabase** — run `supabase/52_grid_daily.sql` (boards) and
   `supabase/53_grid_pro.sql` (subscriptions) in the SQL editor.
2. **Stripe** — create a Product ("Run The Arcade Pro") with a recurring Price;
   copy the `price_...` id. Add a webhook endpoint pointed at
   `https://runthe.gg/api/stripe/webhook` with events:
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`. Copy the `whsec_...` secret.
3. **Cloudflare Pages → Settings → Environment variables** (Production):
   - `STRIPE_SECRET_KEY`   = sk_live_... (use sk_test_ while testing)
   - `STRIPE_PRICE_ID`     = price_...
   - `STRIPE_WEBHOOK_SECRET` = whsec_...
   - `SUPABASE_URL`        = https://<project>.supabase.co
   - `SUPABASE_SERVICE_ROLE` = service-role key (server-side only)
   - `SITE_URL`            = https://runthe.gg

## Flow

- `/arcade/archive/` → **Get Pro** → POST `/api/stripe/checkout`
  (carries the signed-in Supabase user id) → Stripe Checkout → webhook
  upserts `subscriptions` → `grid/board.js` mirrors an active row into
  `localStorage.runthegrid_pro` on the next page load → tokens.js
  (unlimited plays) and archive.js (past days) honor it.

## Before public launch

- Remove the "Preview unlock (testing)" link on `/arcade/archive/`.
- Test end-to-end with `sk_test_` + Stripe test cards, then flip to live keys.
- Optional: add a Stripe Customer Portal link for cancellations.
