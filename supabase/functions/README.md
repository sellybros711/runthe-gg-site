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

## 1. Apply the database migration

```bash
# via Supabase SQL editor, or:
supabase db push        # (or run supabase/52_runtour_wallet.sql directly)
```

## 2. Create the products in the Stripe Dashboard

Create one **Product** per package with a one-time **Price** (USD). Ladder =
"Revenue-Focused" from the audit (coin amounts are enforced server-side in
`_shared/packages.ts`, not by Stripe):

| Package        | Price  | Coins delivered |
|----------------|--------|-----------------|
| Warm-up        | $1.99  | 15,000          |
| Clubhouse      | $4.99  | 45,000          |
| Tour           | $9.99  | 102,000         |
| Championship   | $24.99 | 285,000         |

First purchase gets **+100%** automatically (applied in the webhook).

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

## Not yet wired (next steps)

- Client UI: a Pro Shop "Buy Coins" panel calling `create-checkout`, showing
  `paid_coins` folded into the displayed balance, routing spends through
  `runtour_spend_paid`, and a one-time "Founder thank-you" using
  `runtour_claim_founder`.
- Tune `runtour_claim_founder` (`v_amount`, `v_cutoff` in the migration) to the
  real founder bonus + launch instant.
- Harden the pre-existing `runtour_daily_attempt_start` (currently fails open)
  and the client-clock streak — a separate migration, pending confirmation of
  the live function definitions.
