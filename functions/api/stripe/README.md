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
   update-payment. Tax is OFF for launch (checkout no longer sends
   `automatic_tax`); to enable later, restore it and configure Stripe Tax.
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
  (existing customer reused) → `checkout.session.completed`
  webhook upserts `subscriptions` (status `active`) → `board.js` mirrors the
  active/trialing row into `localStorage.runthegrid_pro` → tokens.js (unlimited)
  and archive.js (past days) honor it. active, past_due, canceled all flow
  through `customer.subscription.updated/deleted`. Duplicate deliveries are
  ignored via `stripe_events`.
- Manage/cancel → POST `/api/stripe/portal` `{ return_path }` plus the Supabase
  session token → Stripe Customer Portal. (The user is resolved from the token;
  a body `user_id` is ignored and always was, see `_verify.js`.)

## Premium bundles (Perfect Season Premium Bundle, Run The Bundle)

Two one-time products, NOT LIVE: no env vars are set, no game page links a buy
button, and both endpoints answer 503 until the vars exist. Everything below is
backend setup that can sit finished and inert.

**What they contain:**

- **Perfect Season Premium Bundle**: dynasty mode + one franchise dynasty
  (Perfect Season NFL) and commissioner mode (CFB). Permanent unlock.
- **Run The Bundle**: everything above, plus 12 months of the Arcade Card and
  100,000 Run The Tour coins + 1 **Tour Pack** (the `tour` tier: 22,000 coins in
  the golf shop, one step above the base Pro Shop Pack and one below Champion).
  Valued at the $9.99 Large Bucket, which is the cheapest way to buy that.

**THE "$80 OF VALUE" CLAIM IS LOAD-BEARING AND HAS TO STAY TRUE.** Run The
Bundle is marketed as $80 of value for $34.99, and that is not a slogan: it is
the sum of the parts at prices this site actually charges. $19.99 for the
Perfect Season bundle, $49.99 for a year of the Arcade Card
(`STRIPE_PRICE_ARCADE_ANNUAL`), and $9.99 for the Large Bucket in Run The Tour.
That is $79.97, so 56% off.

The coin figure was rounded to a flat 100,000 by the owner in 2026-09, from the
102,000 the Large Bucket holds, and the $9.99 line SURVIVES that. The claim is
what a player would have to spend to get what the bundle grants, and the buckets
are fixed sizes: the one below Large is Medium at 45,000 coins with no pack at
all. So the Large Bucket is still the cheapest way to buy 100,000 coins and a
Tour Pack, and the arithmetic above does not move. Do not "correct" it down. Move any of those three prices, or change what the
bundle grants, and the claim moves with it. Re-check it before repeating it in
any copy, because a stale comparison price is the kind of thing a consumer
regulator treats as a real problem rather than a typo.

**THE ARCADE CARD IN RUN THE BUNDLE IS TWELVE MONTHS, AND NO SCREEN MAY SAY
OTHERWISE.** Three of the four grants are permanent (`expires_at` null);
`arcade_card_year` is not, and it is the only one that ever lapses. The football
store used to lead with "one payment, lifetime access" over BOTH cards, which
made the strongest claim on the screen false about the more expensive product.
The term now lives on each line of the breakdown rather than over the sheet, so
the two bundles can be compared on it:

| line | term shown |
|---|---|
| Dynasty + Franchise | Lifetime access |
| Commissioner | Lifetime access |
| Arcade Card | 12 months. It does not renew. |
| Run The Tour coins | Yours to spend |

"Lifetime" is allowed only where the subject named is entirely permanent, which
is why it still appears on the entry cards (they name the three modes and nothing
else). "No subscription" is the claim that covers everything and is true of both
bundles: mode is `payment`, no `subscriptions` row is written, and nothing
renews. Both halves matter to a buyer, and they are not the same promise: the
year ENDS, and it also never CHARGES again.

**Pricing: one-time, $19.99 and $34.99. Decided by the owner (2026-09).** The
reasoning, so the numbers can be argued with rather than rediscovered:

- One-time, not subscription. These are feature unlocks in single-player games
  with no per-user running cost; nothing renews monthly for the player, and a
  sub that delivers nothing new each month churns and generates refund mail.
  The site already splits exactly this way: the Arcade Card is a subscription
  because unlimited daily plays are an ongoing service, while the Tour Pass
  ($14.99 per 60-day season) and every coin bucket are one-time.
- $19.99 for the football bundle: three substantial modes across two games,
  priced above the $14.99 Tour Pass (one game, one season). Room to run a
  launch promotion code down to $14.99.
- $34.99 for Run The Bundle, a $15 step up from the football bundle, sold on
  the $80-of-parts comparison above. Two things are true at once and both
  matter. The comparison is real and worth leading with, since every one of
  those three prices is charged somewhere on this site today. But the Arcade
  year and the Run The Tour coins are still throw-ins rather than the thing
  being paid for: Arcade Cards are not selling in volume, so the bundle
  prices the football content and lets the rest do the persuading. That is
  why the step up is $15 and not the $60 the parts would suggest.
- The amounts live in `scripts/stripe/setup-premium-bundles.mjs` and nowhere
  else in code; the endpoints only ever see `price_...` ids from env.

**One-time setup:**

1. **Supabase**: run `supabase/101_premium_bundles.sql` (the `premium_unlocks`
   table, `premium_products()`, and the Arcade-honors-the-bundle-year version
   of `arcade_card_active`), then `supabase/104_runtour_bundle_redeem.sql` (the
   Run The Tour redemption, see below). Run both BEFORE setting any price env
   var: the 101 header says why, and 104 is what stops a Run The Bundle buyer
   paying for coins that never arrive.
2. **Stripe**: `STRIPE_SECRET_KEY=sk_test_... node scripts/stripe/setup-premium-bundles.mjs`
   creates both Products and Prices idempotently (lookup keys
   `ps_premium_bundle_once`, `run_the_bundle_once`) and prints the env lines.
   Or create them by hand in the Dashboard; either way the endpoint only needs
   the two `price_...` ids. Add `checkout.session.async_payment_succeeded` to
   the existing webhook endpoint's event list.
3. **Cloudflare Pages env vars.** THE PRICE VARS ARE THE LAST STEP OF LAUNCH,
   NOT AN EARLY ONE, and the reason is that THIS REPOSITORY IS PUBLIC. The
   endpoint path is readable by anybody at
   `functions/api/stripe/checkout-bundle.js`, so there is no such thing as a
   quietly configured endpoint that only we know about: the moment these two
   vars exist, a signed-in stranger who read the repo can complete a real
   purchase. That is survivable only if the modes actually open on payment.
   Until `premium_products()` is what gates the paid modes (which modes those
   are is itself undecided, see the open decisions below), a buyer is charged
   in full and sees NOTHING, because the tester lists still decide. Set these when the gating
   ships, not before, and if you set them temporarily to test, remove them
   again in the same sitting.
   - `STRIPE_PRICE_PS_PREMIUM_BUNDLE` = `price_1UCublHiw1zsFcnXxntEyM1s` (live, $19.99)
   - `STRIPE_PRICE_RUN_THE_BUNDLE`    = `price_1UCue1Hiw1zsFcnXoTW2Cdyj` (live, $34.99)

   Both live Products exist in Stripe already, created 2026-09-06. Price ids
   are not secrets (they identify a price, they cannot charge anybody, and
   they ship in client-side Stripe integrations routinely), so they are
   recorded here rather than rediscovered. The SECRET key is what must never
   appear in this repository.
4. **Checks**: `node scripts/stripe/verify-bundles.mjs` (no network; catches
   the catalog, the SQL constraint, the setup script and the webhook drifting
   apart).

**Flow:** game page POSTs `/api/stripe/checkout-bundle` `{ bundle, return_path }`
with the Supabase session token, gets a hosted Checkout URL (mode `payment`).
The webhook grants on `checkout.session.completed` with `payment_status: paid`
(or `async_payment_succeeded` for delayed methods): one `premium_unlocks` row
per product. Game pages ask `premium_products()`; the Arcade asks
`arcade_card_active()` as it always has. One bundle per account: checkout
answers 409 `already_owned` to anyone holding any of the bundle's products.

**After the sale, the buyer has a screen.** The football profile carries a Your
Pro access page listing every `premium_unlocks` row the account holds, when it
was bought, whether it ends, and a Receipts and billing button into
`/api/stripe/portal`. Two things had to change for that button to be able to
work at all, and both are easy to undo by accident:

- **The portal now finds a bundle buyer.** It read `subscriptions` and nothing
  else, and a one-time bundle writes no subscriptions row, so every bundle
  buyer got 404 `no_customer`. `findCustomer()` tries that row, then
  `premium_unlocks.payload.stripe_customer` (written by the webhook since
  2026-09-08), then the checkout session itself via the Stripe API, which is
  the path that covers grants written before the webhook recorded it.
- **`return_path` is an allow-list of four game roots**, not `/arcade/` alone.
  A football buyer opening their receipts was being returned to the Arcade.

`no_customer` is still a real answer and the page says so plainly rather than
retrying: an account comped by hand never went through Stripe and has no
receipt. The **Customer Portal must be enabled in the Stripe Dashboard** (step
2 of the Arcade setup above) or this button 502s for everybody.

**Testing an end-to-end purchase without charging anybody.** The site's
`STRIPE_SECRET_KEY` is a live key, so test cards and test price ids are not
available: a test id against a live key fails with "No such price". The free
route is a 100% off promotion code, which checkout already allows. Restrict
the coupon to these two products and cap it at one redemption, buy through it,
and Stripe reports the session as `no_payment_required`, which the webhook
grants on (that is not incidental: it was fixed for exactly this, and
`verify-bundles.mjs` now guards it).

Do the whole thing in one sitting, because of the public-repo point in step 3:
set the vars, buy, check `premium_unlocks`, then delete the test rows, expire
the coupon and REMOVE the vars again. A window measured in minutes is a
different risk from a window measured in weeks.

**VERIFIED END TO END ON 2026-09-06, in live mode, for $0.00.** Run The Bundle
bought through a 100% off promotion code: checkout opened, the webhook fired,
and all four `premium_unlocks` rows landed correctly (both premiums permanent,
the Arcade year dated twelve months out, `runtour_pack` left unfulfilled for
the golf side). A second attempt returned 409 `already_owned`. So the payment
path, the webhook, the `no_payment_required` grant and the double-purchase
guard are all known good, and the env vars were removed again afterwards.

Two things cost an hour and are worth knowing before the next test:

- **A promotion code carries its own Customer restriction, separate from the
  coupon.** One created against a specific customer reads as "This code is
  invalid" at checkout for everybody else, with nothing saying why. Check the
  promotion code, not just the coupon.
- **A stale `stripe_customer_id` used to block checkout entirely.** Fixed in
  code (the endpoint drops the stored id and retries), but the underlying
  split is permanent: that column does not record which Stripe mode wrote it.

What this did NOT prove: the ordinary `paid` path with a real card, the
perfect-season bundle (only run-the-bundle was bought), and anything at all
about the modes opening, since nothing reads `premium_products()` yet.

### Run The Tour redemption (the `runtour_pack` row)

Built 2026-09-09 in `supabase/104_runtour_bundle_redeem.sql`. The names this
side asked for:

| | |
|---|---|
| queue read | `public.premium_unlocks`, `product = 'runtour_pack'`, `fulfilled_at is null` |
| wallet credited | `public.coin_wallet` |
| columns credited | `paid_coins` (the spendable balance) and `lifetime_granted` |
| RPC | `public.runtour_redeem_unlocks()`, no arguments |
| returns | one row `(coins bigint, packs jsonb, paid_coins bigint)` |
| security | `security definer`, `search_path = public`, execute granted to `authenticated` only |

`lifetime_purchased` is deliberately NOT credited. This is a grant that arrived
with a purchase of something else rather than a coin purchase, and keeping the
two apart is the reason both columns exist.

**Exactly once.** The claim is the update:

```sql
update premium_unlocks set fulfilled_at = now()
 where user_id = auth.uid() and product = 'runtour_pack' and fulfilled_at is null
returning payload
```

and only what that statement returned is paid. A second caller blocks on the
row lock, re-checks its own WHERE against the committed row, matches nothing
and credits nothing. `supabase/test/bundle_test.sql` and
`supabase/test/bundle_concurrent.sh` drive that against a real Postgres,
including eight sessions firing at one grant at once.

**Amounts come out of the payload**, never out of the function, so the 100,000
in `_bundles.js` can move again without a migration.

**The pack is granted client-side, on purpose.** Packs are a client-side store,
the way the coin-bucket bonus packs already are. `maybeBundleDrop()` in
`golf/index.html` reads the `premium_unlocks` row itself (owner-read RLS) and
grants `payload.packs` into the same grow-only cloud-synced set the bucket packs
use, keyed `bundle:<granted_at>`. So the coins and the pack settle
independently: a client that dies between them loses nothing, because the row
outlives the redemption and the pack can still be re-derived from it. It is
called on sign-in and on opening the golf store.

**One thing the golf side could not verify from here.** The Run The Tour store
migrations (`coin_wallet`, `runtour_wallet()`, `runtour_spend_paid()`) are not
in this repository, so 104's column names come from what `golf/index.html`
reads back out of `runtour_wallet()`. The migration is one transaction that
opens with a preflight checking them, so if it is wrong it aborts having
changed nothing and prints the columns `coin_wallet` actually has. Running it
is itself the check. `supabase/test/bundle_preflight.sh` drives that.

**Open decisions, on purpose, before go-live:**

- ~~**Run The Tour fulfillment is recorded, not delivered.**~~ **BUILT
  (2026-09-09), and this no longer blocks the sale.** Names and mechanics in
  the section above.
- **No upgrade path.** A Perfect Season Premium owner who wants Run The Bundle
  hits the 409. Options when it matters: a personal promotion code for the
  difference, or a dedicated upgrade Price. Decide before launch, not in code
  first.
- **WHAT `ps_premium` AND `cfb_premium` UNLOCK AT LAUNCH IS STILL THE OWNER'S
  CALL, but the TESTER REHEARSAL of the premium model is now wired
  (2026-09-08) and it reads `premium_products()` for real.** Who sees the
  premium doors at all is still the tester lists, so nothing here reaches the
  public; whether a door opens or pitches is now the database row. The
  rehearsal implements the owner's described bundle:

  - `ps_premium` opens Open Dynasty and One Franchise Dynasty in Perfect
    Season. A tester without the row gets the paywall sheet (the bundle, both
    prices, a real Buy button that truthfully says "Not on sale yet" while
    the endpoint answers 503).
  - `cfb_premium` IS Commish Simulator. Owner decision (2026-09-08): the mode
    is fully premium, not free with paid dials. A tester without the row stops
    at the gate with the pitch and both prices, exactly what a visitor who has
    not bought sees after launch. The free/pro dial split stays in docket.js
    unused by the public model; `?tier=free` remains an inspection switch for
    an owner.
  - Full Team is untouched: tester preview, no premium relationship yet.

  Grants come from `supabase/102_premium_comp.sql`: runnyj holds both rows
  and plays as a buyer; csel8 is on the tester lists with NO row and plays as
  somebody who has not bought. malikwillislover and slimeyb3 hold no row
  either until added to that file.

  The product keys stay opaque in the payment layer on purpose: the bundles,
  the webhook and the table still name no mode, so re-scoping at launch (the
  three questions below) means editing the page gates, never the payments.

  Three questions have to be answered together, and the code currently
  disagrees with the pricing conversation on two of them:

  1. **Open Dynasty.** `canPlayClubDynasty` in football/index.html says in its
     own comment that One Franchise Dynasty is the premium one and that
     flipping `DYNASTY_LIVE` "must not hand this one out with it", i.e. open
     dynasty was built to become FREE at launch. The bundle was described as
     containing both. Those are different products.
  2. **Full Team.** fullteam-access.js calls itself "the first paid mode in
     this game" but was not named in the bundle. In, or sold separately?
  3. **Commish: ANSWERED (2026-09-08).** Fully premium. The gate pitches
     anyone without `cfb_premium`; the free/pro dial data stays in docket.js
     against a future free tier.

- **Gating the modes themselves.** Once the above is settled: the pages gate on
  `premium_products()` and (per the dynasty-access.js header) the submit RPCs
  must check the table server-side too, because a list shipped in the page is a
  feature flag and never a permission. That wiring belongs with each game's
  launch, not here.

## Before public launch

- Flip `arcade/tokens.js` `TESTING = false` to enforce the tiers.
- Remove the "Preview unlock (testing)" link on `/arcade/archive/`.
- Repeat the Stripe steps in **Live mode** (new live `price_...` ids + live
  `sk_live_`/`whsec_`), and swap the Cloudflare env values from test to live.
- Test end-to-end with `sk_test_` + Stripe test cards / test clocks first.
