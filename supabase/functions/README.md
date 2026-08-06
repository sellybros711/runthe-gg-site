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
supabase db push        # (or run the files directly, in order)
#   supabase/70_runtour_wallet.sql        — coin wallet
#   supabase/71_runtour_tokens_pass.sql   — Daily Tokens + the pass tables
#   supabase/72_runtour_pass_season.sql   — Tour Pass → the 60-DAY SEASON model
#                                           (also retires the founder bonus)
```

## 2. Create the products in the Stripe Dashboard

Create one **Product** per package with a one-time **Price** (USD). Amounts are
enforced server-side in `_shared/packages.ts`, not by Stripe. The webhook
branches on the package **kind** (coins / tokens / pass).

**Coin packs** (`kind: coins`) — first purchase gets **+100%** automatically.
Large / XL / Mega also grant bonus packs (handled client-side):

| Package        | Price  | Coins   | Bonus packs        |
|----------------|--------|---------|--------------------|
| Small Bucket   | $1.99  | 15,000  | —                  |
| Medium Bucket  | $4.99  | 45,000  | —                  |
| Large Bucket   | $9.99  | 102,000 | +1 Tour pack       |
| XL Bucket      | $19.99 | 285,000 | +1 Champion pack   |
| Mega Bucket    | $49.99 | 750,000 | +3 Champion packs  |

**Daily Tokens** (`kind: tokens`) — extra Daily-Challenge attempts beyond the free 3/day:

| Package        | Price  | Tokens |
|----------------|--------|--------|
| 1 Daily Token  | $1.99  | 1      |
| 3 Daily Tokens | $2.99  | 3      |
| 7 Daily Tokens | $4.99  | 7      |
| 15 Daily Tokens| $9.99  | 15     |

**Tour Pass** (`kind: pass`) — THE one and only pass: a **one-time purchase per
60-day season** (the global season matching the in-game Tour Pass track; buy
again when a new season starts). Grants the current season's pass: 30,000 coins
credited + a `tour_pass` entitlement, period `'S<n>'` (the client then unlocks
the PRO lane of the Tour Pass track, unlimited daily plays, a 1.5× reward
multiplier, and 2 seasonal packs while active). `create-checkout` refuses a
second purchase in the same season (409):

| Package                  | Price  | Grants                              |
|--------------------------|--------|-------------------------------------|
| Tour Pass (60-day season)| $14.99 | 30,000 coins + this season's pass   |

Copy each **Price ID** (`price_...`).

## 3. Set secrets

```bash
supabase secrets set \
  STRIPE_SECRET_KEY=sk_live_or_test_... \
  STRIPE_WEBHOOK_SECRET=whsec_...        `# from step 5` \
  STRIPE_PRICE_SMALL=price_... \
  STRIPE_PRICE_MEDIUM=price_... \
  STRIPE_PRICE_LARGE=price_... \
  STRIPE_PRICE_XL=price_... \
  STRIPE_PRICE_MEGA=price_... \
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

## 7. Flip the client launch flags (Buy Coins / Tokens / Tour Pass)

The client ships these features **behind launch flags, default OFF**, so the
store never shows checkout buttons that error before the Stripe products exist.
In `build-a-golfer/build-a-golfer.html`, once steps 1–6 above are done for each
feature, set:

- `const BUCKETS_ENABLED=false;`  → `true`   (needs `STRIPE_PRICE_SMALL/MEDIUM/LARGE/XL/MEGA`)
- `const TOKENS_ENABLED=false;`   → `true`   (needs `STRIPE_PRICE_TOK1/3/7/15`)
- `const TOURPASS_ENABLED=false;` → `true`   (needs `STRIPE_PRICE_TOURPASS` **and** migrations 71 + 72)

then redeploy the client (copy `build-a-golfer.html` → `golf/index.html`). Each
flag is an independent kill-switch. `runtour_wallet()` returns `daily_tokens`/
`pass_active` only after migration 71 — before it, tokens read 0 and the pass
reads inactive, so the daily gate behaves exactly as today.

## Tour Pass model (60-day season — migration 72)

- **One pass, one purchase per 60-day season.** Seasons are global and match the
  in-game Tour Pass track exactly: Season 1 began **Jul 1 2026** (US Eastern day
  boundary, like the Daily); `runtour_pass_season()` in the DB is the server's
  source of truth (`period = 'S<n>'`). Buying grants **this season only**
  (`tour_pass(user_id, period='S<n>')`); it lapses at the season rollover and
  the new season's pass must be bought.
- **Double-purchase guard**: `create-checkout` calls `runtour_pass_status()`
  with the buyer's JWT and returns **409** if the season's pass is already
  active. The DB is also safe if a duplicate ever slips through (coins still
  credited; the pass row conflict is a no-op).
- Server credits the pass **coins** (30,000) into `paid_coins` at purchase. The
  **2 seasonal packs** are granted client-side once per season
  (`bag_pass.claimed = 'S<n>'`, cloud-synced) — packs are an inherently
  client-side store.
- While active the client unlocks: the **PRO lane** of the Tour Pass track (the
  ONLY way regular players get PRO — the old 30,000-coin unlock is removed),
  **unlimited daily plays** (bypasses the free 3/day cap), and a **1.5×** coin
  reward multiplier on play. The dev accounts (CSel8/RunnyJ) get PRO free via
  `devMode()` for testing and never need to purchase.
- Refunds/disputes revoke the season's entitlement (`runtour_refund_purchase`
  deletes the `tour_pass` row for the period stored on the purchase) and claw
  back the 30,000 coins.
- The founder bonus (`runtour_claim_founder`) is **retired** by migration 72
  (owner decision; the cutoff passed and the client never called it).

## Still open / tunable

- Pass reward magnitude/mult, token counts, and coin-bucket amounts are all in
  `_shared/packages.ts` (server, authoritative) + the client config constants
  (`TOURPASS`, `DAILY_TOKENS`, `PASS_REWARD_MULT`, `BUCKETS`) — keep them in sync.
- The season anchor/length live in `runtour_pass_season()` (SQL) and
  `TOURPASS_EPOCH`/`TOURPASS_LEN` (client) — they MUST stay identical.
