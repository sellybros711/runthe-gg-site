# Stripe Payments — RunThe.gg

First Stripe integration: **Coins** (bought in packs, spent on cosmetics) and
**Extra Daily Spins** (a separate one-time product, consumed by the Daily
Challenge). Everything is **test mode** until you deliberately switch to live keys.

The design is intentionally extensible toward a later **Supporter subscription**
(#3) and a one-time **Supporter pack** (#2) — see "Growing this" at the bottom.

---

## Architecture at a glance

```
Browser (assets/js/store.js)
   │  1. buy(sku)  ── Authorization: user JWT ──▶  Edge Fn: create-checkout-session
   │                                                 • validates sku vs stripe_catalog
   │                                                 • ensures Stripe Customer
   │                                                 • creates Checkout Session
   │  2. redirect ───────────────────────────────▶  Stripe Checkout (hosted)
   │                                                       │ payment
   │                                                       ▼
   │                                              Stripe sends webhook
   │                                                       │
   ▼                                                       ▼
back on runthe.gg  ◀── credited ── DB ◀── fulfill_stripe_purchase() ◀── Edge Fn: stripe-webhook
   (store.js polls get_my_wallet)                          (signature-verified, idempotent)
```

**Golden rule:** the wallet is only ever credited by the **webhook**, from
`stripe_catalog` — never by the browser. The client just starts checkout.

### Files
| File | Purpose |
|---|---|
| `supabase/53_stripe_payments.sql` | Tables (wallets, ledgers, catalog, customers, fulfillments, cosmetics store) + RPCs (`get_my_wallet`, `fulfill_stripe_purchase`, `spend_coins_on_cosmetic`, `consume_spin`) + `set_cosmetics` v3 |
| `supabase/functions/create-checkout-session/` | Auth'd Edge Function that starts Checkout |
| `supabase/functions/stripe-webhook/` | Signature-verified Edge Function that grants |
| `supabase/functions/_shared/cors.ts` | CORS helper |
| `supabase/config.toml` | Per-function JWT settings |
| `supabase/stripe/create_products.py` | Creates the Stripe Products/Prices (stable `lookup_key`s) |
| `assets/js/store.js` | Front-end store client |

---

## One-time setup

### 1. Create the Stripe products
Stripe's API is blocked from the Claude Code sandbox, so run this from your own
machine (or Stripe dashboard). It's idempotent and keys everything on stable
`lookup_key`s that the backend already expects.

```bash
export STRIPE_KEY=sk_test_...        # your TEST secret key
python3 supabase/stripe/create_products.py
```

Creates: `coins_100`, `coins_600`, `coins_1300`, `coins_2800`, `spin_1`, `spin_5`.
Amounts must match `stripe_catalog` in `53_stripe_payments.sql` (they do by default).

### 2. Apply the SQL
Run `supabase/53_stripe_payments.sql` against your project (SQL Editor, or
`psql`). It's idempotent and safe to re-run. It seeds `stripe_catalog` and
`cosmetic_prices` (placeholder coin costs — tune freely).

### 3. Set Edge Function secrets
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically. You only add Stripe's:

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set SITE_URL=https://runthe.gg          # optional (default is this)
# STRIPE_WEBHOOK_SECRET is set in step 5, after the endpoint exists.
```

### 4. Deploy the functions
```bash
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook --no-verify-jwt
```
(`config.toml` already sets `verify_jwt=false` for the webhook; the flag is belt-and-braces.)

### 5. Register the webhook + set its signing secret
In the Stripe Dashboard → Developers → Webhooks → **Add endpoint**:

- **URL:** `https://jcrrxqfpdelrmvjuihnm.supabase.co/functions/v1/stripe-webhook`
- **Events:** `checkout.session.completed`, `checkout.session.async_payment_succeeded`

Copy the endpoint's **Signing secret** (`whsec_...`) and:
```bash
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase functions deploy stripe-webhook --no-verify-jwt   # redeploy to pick it up
```

### 6. Wire the front end
Add to any page with the store (supabase-js UMD must already be loaded):
```html
<script src="/assets/js/store.js"></script>
```
Then render packs and handle a buy:
```js
const packs = await RunTheStore.getCatalog();       // render buttons from this
document.querySelector("#buy-600").onclick = () => RunTheStore.buy("coins_600");
RunTheStore.onWallet(w => renderBalance(w.coins, w.spins));
RunTheStore.getWallet().then(w => renderBalance(w.coins, w.spins));
```
`store.js` auto-handles the `?purchase=success` return and polls the wallet
until the webhook credits it.

**Spending:**
```js
await RunTheStore.spendCoinsOnCosmetic("color:gold"); // then equip via set_cosmetics
await RunTheStore.consumeSpin();                       // when using a purchased Daily spin
```
Hook `consumeSpin()` into the Daily Challenge UI at the point a player uses an
extra spin beyond the free allotment; on success, let them re-spin.

---

## Testing (test mode)

- Card `4242 4242 4242 4242`, any future expiry, any CVC/ZIP.
- Local webhook forwarding while developing functions:
  ```bash
  stripe login
  stripe listen --forward-to https://jcrrxqfpdelrmvjuihnm.supabase.co/functions/v1/stripe-webhook
  # use the whsec_ it prints as STRIPE_WEBHOOK_SECRET for local runs
  stripe trigger checkout.session.completed
  ```
- Verify: after a test purchase, `select * from coin_ledger order by id desc limit 5;`
  and `select get_my_wallet();` (as the buying user) show the credit.

## Idempotency & safety notes
- `fulfill_stripe_purchase` is keyed on `(event_id, line-item index)` — Stripe
  retries and duplicate deliveries never double-credit.
- The webhook only grants when `payment_status = 'paid'`.
- Grants come from `stripe_catalog`, not from anything the browser sends.
- Every balance change is mirrored into `coin_ledger` / `spin_ledger`.
- **Rotate the test secret key** that was shared in chat when convenient
  (Dashboard → Developers → API keys → roll), and never commit any `sk_...`.

## Going live
1. Re-run `create_products.py` with `STRIPE_KEY=sk_live_...`.
2. `supabase secrets set STRIPE_SECRET_KEY=sk_live_...` and redeploy.
3. Add a **live** webhook endpoint, set its `whsec_...`, redeploy.
4. Use your **live** publishable key in the front end if/when you move off
   Checkout's hosted page (Checkout itself needs no publishable key here).

## Growing this
- **Supporter subscription (#3):** add a `subscription` `grant_kind`, create a
  recurring Price, handle `customer.subscription.*` events in the webhook, and
  add a Billing Portal link. The customer mapping + fulfillment log already exist.
- **Supporter pack (#2):** add a one-time `lookup_key` (e.g. `supporter`) whose
  fulfillment grants an entitlement row (e.g. `owned_cosmetics` bundle + an
  `ad_free` flag on `profiles`). No plumbing changes needed.
