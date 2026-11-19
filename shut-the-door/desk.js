/* Shut The Door: the home on a desk (980 px and up). window.STD_DESK.
 *
 * The owner's layout (2026-11-18, mockup E): one centred container under the headline, three columns
 * that start and end on the same lines, then the slim Pro bar, then the footer.
 *   left    Survivor (what it is, today's run, its start button), then the archive's month calendar
 *   centre  today's daily card with take the mound, then today's top 3
 *   right   tomorrow's situation (the vote), then the voice of the ump as one row
 * The daily, survivor and archive tabs go: each mode has its own place. The menu's six rows move into a
 * drawer that slides in from the left, behind a button at the left of the header. Only a tap opens it.
 *
 * A PHONE NEVER SEES ANY OF IT. Below 980 px this file does nothing, and the page is exactly the markup
 * in index.html. On a desk it moves the real nodes (so every id, listener and render stays theirs) into
 * the columns, leaving a marker where each one was; crossing back under 980 px puts every node back at
 * its marker and takes the columns, the drawer and its button away again.
 *
 * ui.js listens (onChange) to draw Survivor and the archive together on a desk, and to paint the Pro
 * card as the bar (pro-card.js bar()). The styles are style.css's THE HOME ON A DESK block, all under
 * body.std-desk.
 */
(function () {
'use strict';

var Q = '(min-width: 980px)';
var on = false, back = [], made = [], subs = [], wired = false;

function $(id) { return document.getElementById(id); }
function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; }
/* move a node into place, leaving a marker where it was, so leave() can put it back exactly */
function put(node, into, before) {
  if (!node) return;
  var mark = document.createComment('std-desk');
  node.parentNode.insertBefore(mark, node);
  back.push([mark, node]);
  if (before) into.insertBefore(node, before); else into.appendChild(node);
}

var MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="3" width="7" height="11" rx="3.5"/><path d="M11 7.4h2M11 10.4h2M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7"/></svg>';
var BARS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
var CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

/* ---- the drawer ------------------------------------------------------------------------------ */

function isOpen() { return document.body.classList.contains('d-menu-on'); }
function setMenu(open, focusBack) {
  var b = $('d-menu-b'), d = $('d-drawer'), app = $('app');
  if (!b || !d) return;
  document.body.classList.toggle('d-menu-on', open);
  b.setAttribute('aria-expanded', open ? 'true' : 'false');
  d.inert = !open;
  d.setAttribute('aria-hidden', open ? 'false' : 'true');
  if (app) app.inert = open;
  if (open) { var f = d.querySelector('.t-list button'); if (f) f.focus(); }
  else if (focusBack) b.focus();
}
function onKey(e) {
  if (!isOpen()) return;
  if (e.key === 'Escape') { e.preventDefault(); setMenu(false, true); return; }
  if (e.key !== 'Tab') return;
  /* the focus stays in the drawer while it is open */
  var fs = [].slice.call($('d-drawer').querySelectorAll('button')).filter(function (x) { return !x.disabled && x.offsetParent; });
  if (!fs.length) return;
  var i = fs.indexOf(document.activeElement);
  if (e.shiftKey && i <= 0) { e.preventDefault(); fs[fs.length - 1].focus(); }
  else if (!e.shiftKey && i === fs.length - 1) { e.preventDefault(); fs[0].focus(); }
}

/* ---- in and out ------------------------------------------------------------------------------ */

function enter() {
  var main = $('h-main'), daily = $('hp-daily');
  if (on || !main || !daily) return;
  var sit = daily.querySelector('.t-sit'), surv = $('hp-surv'), arc = $('hp-arc');
  if (!sit || !surv || !arc) return;
  on = true;
  document.body.classList.add('std-desk');

  var cols = el('div', 'd-cols'), L = el('div', 'd-col d-l'), M = el('div', 'd-col d-m'), R = el('div', 'd-col d-r');
  cols.id = 'd-cols';
  cols.appendChild(L); cols.appendChild(M); cols.appendChild(R);
  main.insertBefore(cols, $('h-head').nextSibling);
  made.push(cols);

  /* centre: the daily card, with the pitcher and the batter as a pair and take the mound in it, then the top 3 */
  var pair = el('div', 'd-match');
  sit.insertBefore(pair, $('h-pitcher'));
  made.push(pair);
  put($('h-pitcher'), pair); put($('h-due'), pair);
  put($('h-go'), sit); put($('h-done'), sit);
  put(sit, M); put($('h-top'), M);

  /* left: Survivor's own hero (its run, its button) and the line under it, then the archive's card */
  var sv = el('section', 'd-surv');
  sv.id = 'd-surv'; sv.setAttribute('aria-labelledby', 'sv-head');
  L.appendChild(sv);
  put(surv.querySelector('.sv-hero'), sv); put(surv.querySelector('.bd-note'), sv);
  var ac = arc.querySelector('.hp-arc-c');
  put(ac, L);
  if (ac) ac.classList.add('d-arc');

  /* right: the vote, then the ump as one row. Its button opens the sheet the menu's row opens */
  put($('h-vote'), R);
  var ump = el('section', 'd-ump', '<span class="d-ump-i" aria-hidden="true">' + MIC + '</span>' +
    '<h2 class="d-ump-h" id="d-ump-h">Voice of the ump</h2>' +
    '<button class="btn d-ump-go" type="button" id="d-ump-go">record a call</button>');
  ump.setAttribute('aria-labelledby', 'd-ump-h');
  R.appendChild(ump);
  ump.querySelector('#d-ump-go').addEventListener('click', function () { if (window.STD_MENUS) window.STD_MENUS.show('voice'); });

  /* the Pro bar under the columns (ui.js paints it), then the footer, across the container */
  put($('h-pro'), main, cols.nextSibling);
  var legal = document.querySelector('#h-side .legal');
  put(legal, main, $('h-pro') ? $('h-pro').nextSibling : cols.nextSibling);

  /* the drawer and its button, at the left of the header */
  var hdr = document.querySelector('.hdr');
  var btn = el('button', 'hdr-btn d-menu-b', BARS);
  btn.id = 'd-menu-b'; btn.type = 'button';
  btn.setAttribute('aria-label', 'Menu'); btn.setAttribute('title', 'Menu');
  btn.setAttribute('aria-controls', 'd-drawer'); btn.setAttribute('aria-expanded', 'false');
  hdr.insertBefore(btn, hdr.firstChild);
  var scrim = el('div', 'd-scrim');
  scrim.id = 'd-scrim';
  var dr = el('aside', 'd-drawer', '<div class="d-dh"><b>menu</b><button class="hdr-btn d-dx" type="button" aria-label="Close the menu" title="Close">' + CROSS + '</button></div>');
  dr.id = 'd-drawer'; dr.setAttribute('aria-label', 'Menu'); dr.setAttribute('role', 'dialog'); dr.setAttribute('aria-modal', 'true');
  dr.inert = true; dr.setAttribute('aria-hidden', 'true');
  document.body.appendChild(scrim); document.body.appendChild(dr);
  made.push(btn, scrim, dr);
  put($('h-menu'), dr);
  /* the unlock row under the menu, for anybody who is not Pro (ui.js paints it with the Pro card) */
  var dp = el('div', 'd-pro');
  dp.id = 'd-pro'; dp.hidden = true;
  dr.appendChild(dp);
  btn.addEventListener('click', function () { setMenu(!isOpen()); });
  scrim.addEventListener('click', function () { setMenu(false, true); });
  dr.querySelector('.d-dx').addEventListener('click', function () { setMenu(false, true); });
  /* a row opens its sheet (menus.js) and the drawer goes */
  dr.querySelectorAll('.t-list button').forEach(function (b) { b.addEventListener('click', onRow); });
  /* signed out, the unlock row asks to sign in (pro.js), so the drawer goes; signed in it stays for "opening checkout..." */
  dp.addEventListener('click', function (e) {
    var P = window.STD_PRO;
    if (e.target.closest && e.target.closest('[data-pro-buy]') && !(P && P.signedIn())) setMenu(false);
  });
  if (!wired) { document.addEventListener('keydown', onKey); wired = true; }
  tell();
}
function onRow() { setMenu(false); }

function leave() {
  if (!on) return;
  setMenu(false);
  var dr = $('d-drawer');
  if (dr) dr.querySelectorAll('.t-list button').forEach(function (b) { b.removeEventListener('click', onRow); });
  var ac = document.querySelector('.hp-arc-c.d-arc');
  if (ac) ac.classList.remove('d-arc');
  /* every node back at its marker, the last moved first */
  for (var i = back.length - 1; i >= 0; i--) {
    var m = back[i][0], n = back[i][1];
    if (m.parentNode) { m.parentNode.insertBefore(n, m); m.parentNode.removeChild(m); }
  }
  back = [];
  made.forEach(function (x) { if (x.parentNode) x.parentNode.removeChild(x); });
  made = [];
  document.body.classList.remove('std-desk');
  on = false;
  tell();
}

function tell() { subs.forEach(function (f) { try { f(on); } catch (e) { if (window.console) console.warn(e); } }); }
function sync() { var want = false; try { want = matchMedia(Q).matches; } catch (e) {} if (want) enter(); else leave(); }

var mq = null;
try { mq = matchMedia(Q); } catch (e) {}
if (mq) { if (mq.addEventListener) mq.addEventListener('change', sync); else if (mq.addListener) mq.addListener(sync); }
sync();

window.STD_DESK = {
  API_VERSION: 1,
  on: function () { return on; },
  onChange: function (f) { if (typeof f === 'function') subs.push(f); },
  open: function () { return isOpen(); },
  close: function () { setMenu(false); },
};
})();
