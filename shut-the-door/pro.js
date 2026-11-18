/* pro.js: Shut The Door Pro, the buy button and the way back from Stripe. window.STD_PRO.
 *
 * The store's file (.claude/agents/store.md). The screens around a button are the UI's; this
 * only hands them a block to drop in where it fits (the archive tab, a Survivor run that is
 * over, the plate picker's Diamond) and wires the buttons inside it.
 *
 * WHAT PRO IS lives on the server, never here: shutdoor_is_pro (supabase/160, switched on by
 * 181) answers every Pro door, and the page only asks entitlements(). A button this file
 * draws sells; it never opens anything by itself.
 *
 * THE PRICE IS THE CATALOG'S. PRICES below is a copy of `cents` on the catalog rows in
 * functions/api/stripe/_bundles.js, and scripts/stripe/verify-bundles.mjs fails when the two
 * disagree. The amount charged is the Stripe Price minted from that same number.
 *
 * ONE POST TO THE SITE'S ONE CHECKOUT (functions/api/stripe/checkout-bundle.js), the verdict
 * read off the `error` field and never the status. Signed in only: the account keeps Pro.
 *
 * COMING BACK. Stripe returns to /shut-the-door/?checkout=success (or =cancelled). The flag
 * comes off the address first, so a reload cannot replay it. The webhook writes the grant
 * and the redirect races it, so the page asks again for about ten seconds and never says the
 * payment failed: it cannot know that.
 */
(function () {
'use strict';

/* a copy of the catalog's cents (verify-bundles.mjs holds the two together) */
var PRICES = { 'door-pro': 999 };
var BUNDLE = 'door-pro';
var TERM = ' a year';
var RETURN = '/shut-the-door/';

function money(cents) { return '$' + (cents / 100).toFixed(2); }
function price() { return money(PRICES[BUNDLE]); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function auth() { return window.STD_AUTH || null; }
function signedIn() { var a = auth(); try { return !!(a && a.state && a.state().signedIn); } catch (e) { return false; } }
function token() { var a = auth(); try { return a && a.token ? a.token() : null; } catch (e) { return null; } }

/* what the page around it does: sign in, ask entitlements again (answers them), a toast */
var ctx = { signIn: null, refresh: null, toast: null };

/* The block a screen drops in. `where` is which screen, for the line above the button.
   Plain: one line and one button in the game's own classes. */
var LINES = {
  archive: 'pro opens every past daily. they never go on the leaderboard.',
  survivor: 'pro starts another run right away. only your first run counts on the board.',
  plate: 'diamond comes with pro.',
};
function label() { return signedIn() ? 'get pro · ' + price() + TERM : 'sign in to get pro'; }
function offer(where) {
  return '<div class="pro-offer" data-pro-where="' + esc(where) + '">' +
    '<p class="sv-say">' + esc(LINES[where] || '') + '</p>' +
    '<button class="btn take sm" type="button" data-pro-buy>' + esc(label()) + '</button>' +
    '<p class="au-err" data-pro-err role="alert"></p></div>';
}
/* for a Pro account: the one way to cancel or change the card, Stripe's own portal */
function billing() {
  return '<div class="pro-offer" data-pro-where="billing">' +
    '<button class="btn ghost sm" type="button" data-pro-billing>manage billing</button>' +
    '<p class="au-err" data-pro-err role="alert"></p></div>';
}

function errIn(btn) { var b = btn.closest('.pro-offer'); return b ? b.querySelector('[data-pro-err]') : null; }
function say(el, msg) { if (el) el.textContent = msg; }

function buy(btn) {
  if (!signedIn() || !token()) { if (ctx.signIn) ctx.signIn(); return; }
  var err = errIn(btn);
  say(err, '');
  btn.disabled = true;
  btn.textContent = 'opening checkout...';
  var st = {}; try { st = auth().state() || {}; } catch (e) {}
  fetch('/api/stripe/checkout-bundle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
    body: JSON.stringify({ bundle: BUNDLE, return_path: RETURN, email: st.email || undefined }),
  }).then(function (r) { return r.json().catch(function () { return {}; }); }, function () { return {}; }).then(function (d) {
    if (d && d.url) { location.href = d.url; return; }
    btn.disabled = false;
    btn.textContent = label();
    if (d && d.error === 'already_owned' && ctx.refresh) ctx.refresh();
    say(err, d && d.error === 'stripe_not_configured' ? 'pro isn\'t on sale yet. try again soon.'
      : d && d.error === 'already_owned' ? 'this account already has pro.'
      : d && d.error === 'unauthorized' ? 'sign in again, then try once more.'
      : 'checkout didn\'t open. try again.');
  });
}

function manage(btn) {
  if (!token()) { if (ctx.signIn) ctx.signIn(); return; }
  var err = errIn(btn), was = btn.textContent;
  say(err, '');
  btn.disabled = true;
  btn.textContent = 'opening billing...';
  fetch('/api/stripe/portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
    body: JSON.stringify({ return_path: RETURN }),
  }).then(function (r) { return r.json().catch(function () { return {}; }); }, function () { return {}; }).then(function (d) {
    if (d && d.url) { location.href = d.url; return; }
    btn.disabled = false;
    btn.textContent = was;
    say(err, d && d.error === 'no_customer' ? 'there\'s no billing on this account.' : 'billing didn\'t open. try again.');
  });
}

/* one listener for every block, wherever a screen put it */
document.addEventListener('click', function (e) {
  var t = e.target && e.target.closest ? e.target : null;
  if (!t) return;
  var b = t.closest('[data-pro-buy]');
  if (b && !b.disabled) { buy(b); return; }
  var m = t.closest('[data-pro-billing]');
  if (m && !m.disabled) manage(m);
});

/* the way back from Stripe: called once by the page when it has booted */
var back = null;
try { back = new URLSearchParams(location.search).get('checkout'); } catch (e) {}
function strip() {
  try {
    var u = new URL(location.href);
    u.searchParams.delete('checkout');
    history.replaceState(null, '', u.pathname + (u.searchParams.toString() ? '?' + u.searchParams.toString() : '') + u.hash);
  } catch (e) {}
}
function returned() {
  if (!back) return;
  var what = back;
  back = null;
  strip();
  if (what !== 'success') return;
  var toast = ctx.toast || function () {};
  toast('payment went through. pro lands in a few seconds.');
  var waits = [800, 1200, 2000, 3000, 3500], i = 0;
  (function next() {
    if (i >= waits.length || !ctx.refresh) return;
    setTimeout(function () {
      Promise.resolve(ctx.refresh()).then(function (e) {
        if (e && e.pro) { toast('pro is on. have at it.'); return; }
        i++; next();
      }, function () { i++; next(); });
    }, waits[i]);
  })();
}

window.STD_PRO = {
  API_VERSION: 1,
  init: function (c) { for (var k in c) ctx[k] = c[k]; },
  offer: offer, billing: billing, returned: returned,
  price: price, PRICES: PRICES, BUNDLE: BUNDLE,
};
})();
