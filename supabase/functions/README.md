# RunTheTour — Stripe coin purchases (Phase 0, model A)

Server-authoritative path for **real-money coins**. Earned/gameplay coins are
unchanged; only *purchased* coins live on the server and can never be set from
the browser.

```
browser ──(JWT)──▶ create-checkout ──▶ Stripe Checkout (hosted page)
                                            │  payment
                                            ▼
                         Stripe ──(signed webhook)──▶ stripe-webhook
                                            │  runtour_credit_purchase()  [service_role]
                                            ▼
                                   coin_wallet / coin_ledger  (52_runtour_wallet.sql)
                                            ▲
browser ──(JWT)──▶ runtour_wallet() / runtour_spend_paid() / runtour_claim_founder()
```

## 1. Apply the database migrations

```bash
# via Supabase SQL editor, or:
supabase db push        # (or run the files directly)
#   supabase/70_runtour_wallet.sql        — coin wallet (already applied)
#   supabase/71_runtour_tokens_pass.sql   — Daily Tokens + monthly Tour Pass
```

## 2. Create the products in the Stripe Dashboard

Create one **Product** per package with a one-time **Price** (USD). Amounts are
enforced server-side in `_shared/packages.ts`, not by Stripe. The webhook
branches on the package **kind** (coins / tokens / pass).

**Coin packs** (`kind: coins`) — first purchase gets **+100%** automatically:

| Package        | Price  | Coins delivered |
|----------------|--------|-----------------|
| Warm-up        | $1.99  | 15,000          |
| Clubhouse      | $4.99  | 45,000          |
| Tour           | $9.99  | 102,000         |
| Championship   | $24.99 | 285,000         |
| Biggest Bucket | $49.99 | 625,000         |

**Daily Tokens** (`kind: tokens`) — extra Daily-Challenge attempts beyond the free 3/day:

| Package        | Price  | Tokens |
|----------------|--------|--------|
| 1 Daily Token  | $0.99  | 1      |
| 3 Daily Tokens | $1.99  | 3      |
| 7 Daily Tokens | $2.99  | 7      |
| 15 Daily Tokens| $4.99  | 15     |

**Tour Pass** (`kind: pass`) — a **one-time monthly** purchase (buy again each
calendar month). Grants the current month's pass: 30,000 coins credited + a
`tour_pass` entitlement (the client then unlocks unlimited daily plays, a 1.5×
reward multiplier, and 2 seasonal packs while active):

| Package        | Price  | Grants                              |
|----------------|--------|-------------------------------------|
| Tour Pass      | $9.99  | 30,000 coins + this month's pass    |

Copy each **Price ID** (`price_...`).

## 3. Set secrets

```bash
supabase secrets set \
  STRIPE_SECRET_KEY=sk_live_or_test_... \
  STRIPE_WEBHOOK_SECRET=whsec_...        `# from step 5` \
  STRIPE_PRICE_WARMUP=price_... \
  STRIPE_PRICE_CLUBHOUSE=price_... \
  STRIPE_PRICE_TOUR=price_... \
  STRIPE_PRICE_CHAMPIONSHIP=price_... \
  STRIPE_PRICE_BIGGEST=price_... \
  STRIPE_PRICE_TOK1=price_... \
  STRIPE_PRICE_TOK3=price_... \
  STRIPE_PRICE_TOK7=price_... \
  STRIPE_PRICE_TOK15=price_... \
  STRIPE_PRICE_TOURPASS=price_... \
  SITE_URL=https://runthe.gg
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
injected by the platform — no need to set them.

## 4. Deploy

```bash
supabase functions deploy create-checkout                 # JWT enforced (buyers must be signed in)
supabase functions deploy stripe-webhook --no-verify-jwt  # public; secured by Stripe signature
```

## 5. Register the webhook

In **Stripe → Developers → Webhooks**, add an endpoint pointing to the deployed
`stripe-webhook` URL, subscribed to:

- `checkout.session.completed`
- `charge.refunded`
- `charge.dispute.created`

Copy the signing secret (`whsec_...`) back into `STRIPE_WEBHOOK_SECRET` (step 3)
and redeploy the webhook.

## 6. Test before going live

Use **test-mode** keys/prices first. Trigger a full flow with the Stripe CLI:

```bash
stripe listen --forward-to <stripe-webhook-url>
stripe trigger checkout.session.completed
```

Verify: `coin_purchase` gets one row, `coin_wallet.paid_coins` increases once
(even if the event is delivered twice), and a refund zeroes it back out.

## Safety properties

- **Fulfilment only on the signed webhook**, never the browser redirect.
- **Idempotent twice over**: skip-if-seen on `event.id` + a `unique(stripe_event)`
  constraint, so duplicate deliveries never double-credit.
- **Coins are server-defined** per `package_id`; a tampered client cannot change
  the amount.
- **Refunds/disputes claw coins back** (`runtour_refund_purchase`), clamped at 0.
- Credit/refund/grant RPCs are **`service_role`-only**; the browser can only
  *read* its wallet and *spend* what it holds.

## 7. Flip the client launch flags (Biggest Bucket / Tokens / Tour Pass)

The client ships these three features **behind launch flags, default OFF**, so
the store never shows checkout buttons that error before the Stripe products
exist. In `build-a-golfer/build-a-golfer.html`, once steps 1–6 above are done
for each feature, set:

- `const BIGGEST_ENABLED=false;` → `true`   (needs `STRIPE_PRICE_BIGGEST`)
- `const TOKENS_ENABLED=false;`  → `true`   (needs `STRIPE_PRICE_TOK1/3/7/15`)
- `const TOURPASS_ENABLED=false;`→ `true`   (needs `STRIPE_PRICE_TOURPASS` **and** migration 71)

then redeploy the client (copy `build-a-golfer.html` → `golf/index.html`). Each
flag is an independent kill-switch. `runtour_wallet()` returns `daily_tokens`/
`pass_active` only after migration 71 — before it, tokens read 0 and the pass
reads inactive, so the daily gate behaves exactly as today.

## Tour Pass model

- A **new themed pass each calendar month**; buying grants **this month only**
  (`tour_pass(user_id, period='YYYY-MM')`). Active = a row for the current UTC
  month; it lapses at month end and a new one must be bought.
- Server credits the pass **coins** into `paid_coins` at purchase. The **seasonal
  packs** are granted client-side once per period (`bag_pass.claimed`, cloud-
  synced) — packs are an inherently client-side store.
- While active: unlimited daily plays (bypasses the free 3/day cap), a **1.5×**
  coin reward multiplier on play, and the seasonal packs.
- Month boundary uses **UTC** (`to_char(now() at time zone 'utc','YYYY-MM')`),
  a few hours off the daily's ET reset — acceptable; note it if strict alignment
  is ever needed.

## Still open / tunable

- Tune `runtour_claim_founder` (`v_amount`, `v_cutoff` in `70_...`) to the real
  founder bonus + launch instant.
- Pass reward magnitude/mult, token counts, and Biggest Bucket coins are all in
  `_shared/packages.ts` (server, authoritative) + the client config constants
  (`TOURPASS`, `DAILY_TOKENS`, `PASS_REWARD_MULT`, `BUCKETS`) — keep them in sync.
