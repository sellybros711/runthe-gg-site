/* WHO DOES THE ARCADE THINK HOLDS A CARD?
 *
 * The card is the paid thing on this site, and the client decides what a
 * member SEES: tokens.js reads localStorage 'runthegrid_pro' for the tiles and
 * the play gates, archive.js reads it for the vault. The server decides what a
 * member may DO. When those two disagree, a paying account gets locked tiles
 * and a locked archive while the database happily says yes, and nothing
 * anywhere throws.
 *
 * That happened. board.js used to select from `subscriptions` and work out for
 * itself whether the row was live, which made it a second copy of a rule the
 * database already owns in arcade_card_active(). An account holding a year of
 * the card from a one-time purchase has no subscriptions row at all, so the
 * read succeeded, found nothing, took the "no row, therefore free" branch and
 * DELETED the flag. card.js set it back from the status RPC, so the two raced,
 * and board's ran on every auth event while card's ran once.
 *
 * This drives the REAL board.js against a stubbed Supabase, one scenario per
 * way of holding (or not holding) a card, and asserts the flag it leaves
 * behind. It also pins the copy rule: a member with no subscription must not
 * be offered one.
 *
 * Run: node scripts/check-card-entitlement.mjs      (no network, no browser)
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

let bad = 0;
const fail = (m) => { console.error('  FAIL ' + m); bad++; };
const ok = (m) => console.log('  ok   ' + m);

const SESSION = { user: { id: 'u1' } };

/* A Supabase stub thin enough to boot board.js and answer the two reads it
   makes: the status RPC and the subscriptions row. `status` and `sub` are what
   the server would say for the account under test; null means the call fails,
   which is the offline case. */
function boot({ status, sub, flag }) {
  const store = {};
  if (flag) store.runthegrid_pro = '1';
  const LS = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    key: (i) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; }
  };
  const resolved = [];
  const P = (v) => { const p = Promise.resolve(v); resolved.push(p); return p; };
  const client = {
    auth: {
      onAuthStateChange(fn) { client._authFn = fn; },
      getSession: () => P({ data: { session: SESSION } })
    },
    rpc(name) {
      if (name !== 'arcade_game_status') return P({ data: null, error: 'unexpected rpc ' + name });
      if (status === null) return P({ data: null, error: { message: 'offline' } });
      return P({ data: status });
    },
    from(table) {
      const q = {
        select: () => q, eq: () => q, order: () => q, limit: () => q,
        maybeSingle: () => {
          if (table !== 'subscriptions') return P({ data: null });
          if (sub === null) return P({ data: null, error: { message: 'offline' } });
          return P({ data: sub });
        },
        single: () => P({ data: null, error: { message: 'none' } }),
        then: (f) => P({ data: null }).then(f)
      };
      return q;
    }
  };
  const box = {
    localStorage: LS, console, Date, JSON, Math, String, Object, Array, Promise,
    setTimeout, clearTimeout, navigator: { onLine: true },
    supabase: { createClient: () => client },
    document: { addEventListener() {}, hidden: false, dispatchEvent() {} },
    addEventListener() {},
    fetch: () => Promise.reject(new Error('no net'))
  };
  box.self = box; box.window = box; box.globalThis = box;
  createContext(box);
  runInContext(readFileSync('arcade/board.js', 'utf8'), box, { filename: 'board.js' });
  box.RTG_BOARD.boot();
  /* Let every stubbed promise settle. The reads chain a few deep, so this
     drains the microtask queue rather than awaiting any one of them. */
  return new Promise((res) => setTimeout(() => res({ box, store }), 50));
}

const ACTIVE_SUB = { status: 'active', current_period_end: new Date(Date.now() + 30 * 86400000).toISOString() };
const MEMBER = { signed_in: true, unlimited: true };
const FREE = { signed_in: true, plays: {}, bonus: 0 };

/* ---- 1. every way of holding a card ends up a member ------------------- */
console.log('\n1) the flag the tiles and the vault read');
{
  const CASES = [
    ['a subscriber', { status: MEMBER, sub: ACTIVE_SUB }, '1'],
    /* The one that was broken. A year of the card bought outright writes no
       subscriptions row on purpose, so the old code read "no row" as "free". */
    ['a card held with no subscription', { status: MEMBER, sub: null_row() }, '1'],
    ['a free account', { status: FREE, sub: null_row() }, null],
    ['a free account with a stale flag', { status: FREE, sub: null_row(), flag: true }, null]
  ];
  for (const [label, opts, want] of CASES) {
    const { store } = await boot(opts);
    const got = 'runthegrid_pro' in store ? store.runthegrid_pro : null;
    if (got !== want) {
      fail(label + ': flag is ' + JSON.stringify(got) + ', want ' + JSON.stringify(want) +
        (want === '1' ? '. The server says they are a member and the arcade would show them locked tiles and a locked vault.'
                      : '. A free account would get unlimited plays.'));
    } else ok(label + ': ' + (got ? 'member' : 'not a member'));
  }
}
function null_row() { return undefined; }   // a successful read that found nothing

/* ---- 2. it fails OPEN, never closed ------------------------------------ */
/* A flaky network must not strip a paying member mid-session. The old code
   held this property and so must the new one. */
console.log('\n2) an unanswered read leaves the flag alone');
{
  const a = await boot({ status: null, sub: null, flag: true });
  if (a.store.runthegrid_pro !== '1') fail('offline with a card: the flag was cleared, which locks a paying member out');
  else ok('offline with a card: left alone');
  const b = await boot({ status: null, sub: null, flag: false });
  if ('runthegrid_pro' in b.store) fail('offline with no card: a flag appeared from nowhere');
  else ok('offline with no card: left alone');
}

/* ---- 3. is Stripe billing them, which is a different question ----------- */
console.log('\n3) billing() answers only what the subscriptions table knows');
{
  const s = await boot({ status: MEMBER, sub: ACTIVE_SUB });
  if (s.box.RTG_BOARD.billing() !== true) fail('a subscriber: billing() is ' + s.box.RTG_BOARD.billing() + ', want true');
  else ok('a subscriber: billing() true');
  const u = await boot({ status: MEMBER, sub: null_row() });
  if (u.box.RTG_BOARD.billing() !== false) fail('a card with no subscription: billing() is ' + u.box.RTG_BOARD.billing() + ', want false');
  else ok('a card with no subscription: billing() false');
  const o = await boot({ status: MEMBER, sub: null });
  if (o.box.RTG_BOARD.billing() !== null) fail('offline: billing() is ' + o.box.RTG_BOARD.billing() + ', want null (not known)');
  else ok('offline: billing() null, so no claim either way');
}

/* ---- 4. nothing offers a subscription to somebody who has none ---------- */
/* Asserted in the source, because the failure is a string in a template and
   is wrong before it ever renders. A card can be held without a subscription,
   and "Manage subscription" both names a thing they do not have and implies a
   renewal that is not coming. For a membership somebody bought outright that
   is a false statement about a paid product. */
console.log('\n4) a member with no subscription is not offered one');
{
  const card = readFileSync('arcade/card.js', 'utf8');
  const my = readFileSync('arcade/mycard.js', 'utf8');
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const [name, src] of [['card.js', strip(card)], ['mycard.js', strip(my)]]) {
    const at = src.indexOf('Manage subscription');
    if (at < 0) { fail(name + ': the manage button is gone entirely, which is not the fix'); continue; }
    /* The button has to sit behind the billing answer. Looking back from it
       for the gate rather than forward, because the gate is what decides
       whether the string is ever built. */
    const before = src.slice(Math.max(0, at - 900), at);
    if (!/billing\s*\(\s*\)/.test(before) && !/\bbilled\s*\(\s*\)/.test(before)) {
      fail(name + ': "Manage subscription" is not gated on whether Stripe is billing the account');
    } else ok(name + ': gated on billing()');
  }
  /* And it must not go the other way either: no copy telling a member their
     card renews, whichever way they hold it. */
  const RENEW = /\brenew(s|al|ing)?\b/i;
  for (const [name, src] of [['card.js', card], ['mycard.js', my]]) {
    if (RENEW.test(strip(src))) fail(name + ': says the card renews. A card bought outright runs its term and stops.');
    else ok(name + ': claims no renewal');
  }
}

if (bad) { console.error('\n' + bad + ' problem' + (bad === 1 ? '' : 's')); process.exit(1); }
console.log('\ncard entitlement ok');
