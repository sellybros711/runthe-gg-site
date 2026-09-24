/* Mint the weekly winner's promotion code, and record it against their prize.
 *
 *   node scripts/stripe/mint-winner-code.mjs --season 2026 --week 3            what it would do
 *   node scripts/stripe/mint-winner-code.mjs --season 2026 --week 3 --mint     do it
 *   node scripts/stripe/mint-winner-code.mjs --pending                         every finished
 *   node scripts/stripe/mint-winner-code.mjs --pending --mint                  week still unpaid
 *
 * Needs SUPABASE_DB_URL always, and STRIPE_SECRET_KEY plus STRIPE_PRICE_PS_PREMIUM_BUNDLE
 * once there is a code to make.
 *
 * IT RUNS ON ITS OWN NOW, AT THE END OF EVERY LIVE SCORING TICK.
 * ---------------------------------------------------------------------------
 * `.github/workflows/fantasy-live.yml` calls `--pending --mint` after it writes the scores.
 * The tick that marks a week final (the Monday night game over and its stats in) settles the
 * top three by trigger, and the same tick then makes the code. Asked for by the site's
 * owner: the code is produced when the week closes, and `115_fantasy_result_when_ready.sql`
 * keeps every entrant's popup shut until it has been. So a slow or failed mint delays
 * everybody's result, which is loud (the workflow goes red), where a winner shown a sheet
 * with no code on it was a failure only the winner ever saw.
 *
 * `--pending` asks the database rather than being told a week, so a week missed by one run
 * is picked up by the next, and a tick with nothing to do costs one query.
 *
 * A FIELD OF ONE IS VOIDED RATHER THAN PAID, automatically. It used to refuse and wait for a
 * person, which was right while a person was running this. Unattended, refusing would leave
 * that week's lone entrant with no result for ever (115 waits on this row), and would turn
 * the live job red every ten minutes until somebody noticed. `void` releases the result with
 * no code in it. `--force` still pays a field of one when run by hand.
 *
 * WHAT IT MAKES, AND WHY IT IS NOT A GRANT
 * ---------------------------------------------------------------------------
 * A Stripe promotion code, 100% off, redeemable ONCE, restricted to the Perfect Season
 * Premium Bundle's own product. The winner pastes it at the ordinary store checkout:
 * `functions/api/stripe/checkout-bundle.js` already sends `allow_promotion_codes` and
 * `webhook.js` already grants a bundle on `payment_status = 'no_payment_required'`, which
 * is exactly what a 100% off code produces, with a comment saying so.
 *
 * So this adds NO payment path and NO unlock path. That is the whole reason it is a code
 * rather than a `premium_unlocks` row: the store has exactly one way in on purpose, and a
 * function that wrote the grant directly would be a second one, reachable by whatever
 * reaches that function.
 *
 * IT IS A SEPARATE, DELIBERATE STEP AND IT IS MEANT TO BE
 * ---------------------------------------------------------------------------
 * `114_fantasy_prizes.sql` settles the top three automatically, by trigger, because placing
 * is arithmetic. This is not arithmetic: it is $19.99, and how many people entered is
 * something a person should look at before it moves. The dry run prints the field size and
 * the winner's margin and writes nothing.
 *
 * THE DRY RUN IS A REAL RUN up to the point of spending. It reads the prize, checks the
 * week is settled, resolves the price and its product, and refuses everything it would
 * refuse for real. What `--mint` adds is the two writes.
 *
 * WHAT IS NOT VERIFIED HERE, SAID PLAINLY
 * ---------------------------------------------------------------------------
 * api.stripe.com is refused by this repo's development sandbox, the same as ESPN, so
 * nothing in this file has ever been run against Stripe. What IS checked is the SQL either
 * side of it (`supabase/test/fantasy_prizes_test.sql` drives a minted code end to end) and
 * the argument shapes below, which are read off Stripe's own API and could still be wrong.
 * THE FIRST REAL VERIFICATION IS A DRY RUN OF THE WORKFLOW, and what to read in its log is
 * the resolved product id: a price that resolves to no product means the restriction below
 * is silently absent and the code would be 100% off ANYTHING in the account.
 *
 * STRIPE IS LIVE AND HAS NO TEST MODE HERE. A minted code is real money. Nothing in this
 * file runs without `--mint`.
 */

import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const argOf = (name) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : null;
};
const PENDING = args.includes('--pending');
const MINT = args.includes('--mint');
const FORCE = args.includes('--force');

const KEY = process.env.STRIPE_SECRET_KEY;
const DB = process.env.SUPABASE_DB_URL;
/* The bundle is named here rather than taken as an argument. A prize is one product by
   decision (the owner's, 2026-09), and a script that would mint 100% off whatever it was
   pointed at is a script one typo away from giving away the $34.99 one. */
const BUNDLE_KEY = 'perfect-season';
const PRICE_ENV = 'STRIPE_PRICE_PS_PREMIUM_BUNDLE';

if (!DB) { console.error('SUPABASE_DB_URL is not set'); process.exit(2); }

const sql = (q) => execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-tAc', q],
  { encoding: 'utf8' }).trim();

/* A STAND-IN FOR THE HARNESS AND NOTHING ELSE. api.stripe.com is refused by the development
   sandbox, so the success path (price to product, coupon, code, write back) can only be
   exercised here against a local fake. Refused unless it is a loopback address, so no
   setting anywhere can send a real secret key to somebody else's server. */
const API = process.env.STRIPE_API_BASE || 'https://api.stripe.com';
if (API !== 'https://api.stripe.com' && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API)) {
  console.error('STRIPE_API_BASE may only point at a local stand-in');
  process.exit(2);
}

async function stripe(method, path, params) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + KEY,
      ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(method + ' ' + path + ' -> ' + res.status + ': '
      + (data.error && data.error.message));
  }
  return data;
}

/* A HUMAN READABLE CODE, because the winner types or pastes it. No I, O, 0 or 1: a code
   read off a phone screen and typed on a laptop is where those four become each other. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rand = (n) => {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join('');
};

/* One week. Answers 'minted', 'void', 'nothing', 'dry' or 'refused', and throws on a
   Stripe or database failure so the caller can go on to the next week and still fail the
   run at the end. */
async function settleWeek(SEASON, WEEK) {
  const row = sql(`select coalesce(p.promo_code, ''), p.promo_state, p.display_name, p.score,
                          (select count(*) from public.fantasy_entries e
                            where e.season = p.season and e.week = p.week)
                     from public.fantasy_prizes p
                    where p.season = ${SEASON} and p.week = ${WEEK} and p.place = 1`);

  if (!row) {
    /* NOT AN ERROR. A week nobody has settled is the ordinary state for most of the week. */
    console.log(`week ${WEEK} of ${SEASON} has no winner recorded yet. Nothing to do.`);
    return 'nothing';
  }

  const [code, state, name, score, entries] = row.split('|');
  console.log(`week ${WEEK} of ${SEASON}`);
  console.log(`  winner   ${name} on ${score} points`);
  console.log(`  field    ${entries} ${entries === '1' ? 'entry' : 'entries'}`);
  console.log(`  state    ${state}`);

  if (code || state !== 'none') {
    /* NEVER A SECOND CODE FOR ONE PRIZE, and never a code for a week already voided. Two
       live codes for one win is one of them arriving at a checkout somebody else already
       spent, and there is no way to tell from the winner's side which they were given. */
    console.log(`  already ${state}${code ? ': ' + code : ''}. Nothing to do.`);
    return 'nothing';
  }

  /* A FIELD OF ONE IS A COMPETITION WITH NOBODY IN IT. Voided unattended, paid only when a
     person passes --force. */
  if (Number(entries) < 2 && !FORCE) {
    if (!MINT) {
      console.log(`  would void it: ${entries} entry is not a competition.`);
      return 'dry';
    }
    sql(`update public.fantasy_prizes set promo_state = 'void'
          where season = ${SEASON} and week = ${WEEK} and place = 1 and promo_state = 'none'`);
    console.log(`  voided: ${entries} entry. The result is released with no code in it.`);
    return 'void';
  }

  const PRICE = process.env[PRICE_ENV];
  if (!PRICE) throw new Error(`${PRICE_ENV} is not set, so a winner is waiting on a code`);

  const CODE = `RTG-W${WEEK}-${rand(6)}`;

  if (!MINT) {
    console.log(`  would mint  ${CODE}`);
    console.log(`  would be    100% off, once, restricted to ${BUNDLE_KEY} (${PRICE})`);
    return 'dry';
  }
  if (!KEY) throw new Error('STRIPE_SECRET_KEY is not set, so a winner is waiting on a code');

  /* THE RESTRICTION IS ON THE PRODUCT, NOT THE PRICE, because that is what Stripe's coupon
     model takes. Resolving it from the price is what keeps the two from drifting: the env var
     is the one place the bundle's price is named, and a product id written out here would be a
     second copy that survives the next price change. */
  const price = await stripe('GET', '/v1/prices/' + encodeURIComponent(PRICE));
  const product = typeof price.product === 'string' ? price.product : (price.product || {}).id;
  if (!product) {
    /* WITHOUT IT THE CODE IS 100% OFF EVERYTHING IN THE ACCOUNT, including the $34.99 bundle
       and every Arcade Card subscription. Refusing is the only safe answer. */
    throw new Error(`${PRICE} resolved to no product, so the code could not be `
      + 'restricted to the bundle. Nothing was minted.');
  }
  console.log(`  product  ${product}`);

  const coupon = await stripe('POST', '/v1/coupons', {
    percent_off: '100',
    duration: 'once',
    name: `Fantasy Challenge week ${WEEK} winner`,
    'applies_to[products][0]': product,
    /* The coupon itself is single use as well as the code, so a second promotion code
       accidentally attached to it cannot double the giveaway. */
    max_redemptions: '1',
    'metadata[season]': String(SEASON),
    'metadata[week]': String(WEEK),
    'metadata[reason]': 'fantasy_weekly_winner',
  });

  const promo = await stripe('POST', '/v1/promotion_codes', {
    coupon: coupon.id,
    code: CODE,
    max_redemptions: '1',
    'metadata[season]': String(SEASON),
    'metadata[week]': String(WEEK),
  });

  /* WRITTEN BACK LAST, and that order is the one that fails in the safe direction. A code
     recorded but never created is a winner shown a string that does not work, which reads as
     the prize being a lie. A code created but never recorded is an unused coupon in Stripe and
     a re-run that mints a second one: recoverable, visible, and nobody is misled. */
  sql(`update public.fantasy_prizes
          set promo_code = '${promo.code.replace(/'/g, "''")}',
              promo_state = 'minted', minted_at = now()
        where season = ${SEASON} and week = ${WEEK} and place = 1`);

  console.log(`  minted ${promo.code} (${promo.id}) and recorded it against the prize.`);
  return 'minted';
}

/* ─── which weeks ─────────────────────────────────────────────────────────────────── */

let weeks;
if (PENDING) {
  const rows = sql(`select season || '|' || week from public.fantasy_prizes
                     where place = 1 and promo_state = 'none' and promo_code is null
                     order by season, week`);
  weeks = rows ? rows.split('\n').map((l) => l.split('|').map(Number)) : [];
  if (!weeks.length) {
    console.log('No finished week is waiting on its prize. Nothing to do.');
    process.exit(0);
  }
} else {
  const SEASON = Number(argOf('season'));
  const WEEK = Number(argOf('week'));
  if (!Number.isFinite(SEASON) || !Number.isFinite(WEEK)) {
    console.error('usage: --season 2026 --week 3 [--mint] [--force]   or   --pending [--mint]');
    process.exit(2);
  }
  weeks = [[SEASON, WEEK]];
}

let failed = 0;
for (const [s, w] of weeks) {
  try { await settleWeek(s, w); }
  catch (e) { failed++; console.error(`  FAILED week ${w} of ${s}: ${e.message}`); }
}
if (!MINT) console.log('\nDry run. Nothing was written. Pass --mint to do it.');
process.exit(failed ? 1 : 0);
