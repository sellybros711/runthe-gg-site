/* pro-card.js: the Pro promo cards (the owner's pick, direction A, 2026-11-18). window.STD_PRO_CARD.
 *
 * The UI's file. Two blocks a screen drops in where the player chose to look, never anything that opens:
 *   home()  Shut The Door Pro, on the daily tab under today's top 3, for anybody who is not Pro (ui.js)
 *   pair()  Shut The Door Pro and Run The Diamond Pro together, in the archive tab under the store's own
 *           Get Pro, while the past dailies are locked (menus.js)
 *
 * The headlines are the plain product names (the owner, 2026-11-18). The Diamond plate is the picture:
 * it is the one thing on the list a player sees by somebody else's name.
 *
 * EVERY PRICE IS THE CATALOG'S. They are read off pro.js's PRICES, which verify-bundles.mjs holds to
 * functions/api/stripe/_bundles.js cent for cent, and the saving is arithmetic on those, never typed.
 * The buttons are the store's: data-pro-buy, wired by pro.js's one listener (the pair names its
 * bundle in the attribute). Signed out, a button asks to sign in first, as the store's does.
 */
(function () {
'use strict';

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function P() { return window.STD_PRO || null; }
function st() { try { return (window.STD_AUTH && window.STD_AUTH.state()) || {}; } catch (e) { return {}; } }
function gem(letters, cls) {
  var PL = window.STD_PLATE;
  return PL ? PL.svg(PL.DIAMOND, letters || '', { cls: cls }) : '';
}
/* the player's own row, as the board would draw it with Diamond on */
function you() {
  var s = st(), PL = window.STD_PLATE;
  var name = s.signedIn && s.name ? s.name : 'Your name';
  var L = s.signedIn && PL ? PL.initials(s.name, s.initials) : '';
  return '<div class="pc-you">' + gem(L, 'pc-yg') + '<span class="pc-yn"><b>' + esc(name) + '</b><small>with the Diamond plate</small></span><i class="pc-chip">pro</i></div>';
}
var TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
var FLAG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4h11l-1.5 3.5L16 11H5"/></svg>';
/* what Pro opens, as the gate has it (shutdoor_is_pro): Survivor without the one a day, the archive,
   your history, no video break. Custom challenges are coming, so they say soon. */
var LIST = ['Unlimited Survivor runs every day', 'Every past daily', 'Your history', 'No video ads'];
function soon() { return '<li class="soon"><i>' + FLAG + '</i>Custom challenges<em>soon</em></li>'; }

function home() {
  var p = P();
  if (!p) return '';
  var signed = p.signedIn();
  return '<section class="pc-card pro-offer" aria-labelledby="pc-h">' +
    '<div class="pc-top">' + gem('', 'pc-big') + '<div><i class="pc-chip">pro</i><h2 class="pc-h" id="pc-h">Shut The Door <em>Pro</em></h2><p class="pc-sub">Become a member.</p></div></div>' +
    you() +
    '<ul class="pc-list">' + LIST.map(function (t) { return '<li><i>' + TICK + '</i>' + esc(t) + '</li>'; }).join('') + soon() + '</ul>' +
    '<div class="pc-buy"><p class="pc-price"><b>' + esc(p.money(p.PRICES[p.BUNDLE])) + '</b><span>a year</span></p>' +
    '<button class="btn pc-go" type="button" data-pro-buy>' + (signed ? 'get pro' : 'sign in to get pro') + '</button></div>' +
    '<p class="au-err" data-pro-err role="alert"></p></section>';
}

function pair() {
  var p = P();
  if (!p) return '';
  var C = p.PRICES, both = C[p.PAIR], apart = C[p.BUNDLE] + C['diamond-pro'];
  var signed = p.signedIn();
  return '<section class="pc-card pc-pair pro-offer" aria-labelledby="pc-ph">' +
    '<div class="pc-duo">' + gem('', 'pc-mid') + '<span aria-hidden="true">+</span><img src="/baseball/icon-192.png?v=3" alt="" width="52" height="52" loading="lazy"></div>' +
    '<i class="pc-chip">both games · pro</i>' +
    '<h2 class="pc-h" id="pc-ph">Run The Diamond + <em>Shut The Door package</em></h2>' +
    '<div class="pc-two"><div><b>Shut The Door Pro</b><span>Unlimited Survivor runs every day. Every past daily. No video ads.</span><em>soon: custom challenges</em></div>' +
    '<div><b>Run The Diamond Pro</b><span>All six modes, as often as you like. Your batting order. Two Pro parks.</span></div></div>' +
    you() +
    '<div class="pc-buy"><p class="pc-price"><b>' + esc(p.money(both)) + '</b><span>a year for both</span></p>' +
    '<button class="btn pc-go" type="button" data-pro-buy="' + esc(p.PAIR) + '">' + (signed ? 'get both' : 'sign in to get both') + '</button></div>' +
    (apart > both ? '<p class="pc-save">' + esc(p.money(apart)) + ' bought one by one. Save ' + esc(p.money(apart - both)) + '.</p>' : '') +
    '<p class="au-err" data-pro-err role="alert"></p></section>';
}

window.STD_PRO_CARD = { API_VERSION: 1, home: home, pair: pair };
})();
