/* pro-welcome.js: the welcome to Shut The Door Pro (the owner, 2026-11-18). window.STD_PRO_WELCOME.
 *
 * The UI's file. One full page over everything, shown ONCE: right after a checkout comes back and the
 * server says Pro (pro.js returned(), the "pro is on" moment, which this replaces). It is the answer to
 * the purchase the player just made, so it is the one screen that opens without a tap. Nothing else
 * calls show(): not the boot of a Pro member, not a timer, not a reload (the flag is off the address by
 * then, and SEEN keeps it from coming back for the same account on this device).
 *
 * What it says is what the gate opens (shutdoor_is_pro, agents/store/decisions 2026-11-18): unlimited
 * Survivor runs, every past daily, your history, the Diamond plate by your name, no video ads. Custom
 * challenges are not live in the code, so they say soon. The pair (Run The Diamond + Shut The Door)
 * adds a line and a link to /baseball/.
 *
 * Each row with a place is a button to it; ui.js owns the places (init({go})). The primary button is
 * the archive: the biggest thing Pro opens and the one a new member can play right now. Back to home,
 * the cross, Escape and the browser's back close it to the home. While it is up the page under it is
 * inert and the focus stays inside. Reduced motion: no confetti, no shine, no slide, everything in place.
 */
(function () {
'use strict';

var SEEN = 'std_pro_welcome_v1';
var ctx = { go: null, onChange: null };
var box = null, lastFocus = null, timers = [];

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function still() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
function seenMap() { try { return JSON.parse(localStorage.getItem(SEEN) || '{}') || {}; } catch (e) { return {}; } }
function seen(uid) { return !!seenMap()[uid || 'device']; }
function markSeen(uid) {
  var m = seenMap(); m[uid || 'device'] = new Date().toISOString().slice(0, 10);
  try { localStorage.setItem(SEEN, JSON.stringify(m)); } catch (e) {}
}

var I = {
  surv: '<path d="M6.5 8.5c-2.5 0-4 1.6-4 3.5s1.5 3.5 4 3.5c3.5 0 7.5-7 11-7 2.5 0 4 1.6 4 3.5s-1.5 3.5-4 3.5c-3.5 0-7.5-7-11-7z"/>',
  arc: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2"/>',
  hist: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4.5v4h4"/><path d="M12 8v4.3l3 1.8"/>',
  ads: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M10.5 9.5v5l4-2.5z"/><path d="M4 20L20 4"/>',
  soon: '<path d="M5 21V4h11l-1.5 3.5L16 11H5"/>',
  go: '<path d="M9 6l6 6-6 6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
};
function ico(k) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + I[k] + '</svg>'; }

/* what Pro opens, one row each. go: the place a tap takes the player (ui.js) */
var ROWS = [
  { go: 'surv', i: 'surv', t: 'Unlimited Survivor runs', s: 'Every day. Your first run counts on the board.' },
  { go: 'arc', i: 'arc', t: 'Every past daily', s: 'The whole archive. Play any day again.' },
  { go: 'hist', i: 'hist', t: 'Your history', s: 'Every daily and Survivor run, kept.' },
  { go: 'plate', i: 'plate', t: 'The Diamond plate', s: 'By your name on the boards. Pick it now.' },
  { i: 'ads', t: 'No video ads', s: 'Survivor runs straight through.' },
  { i: 'soon', t: 'Custom challenges', s: 'Build your own spot and send the link.', soon: true },
];

function gem(letters, cls) {
  var PL = window.STD_PLATE;
  return PL ? PL.svg(PL.DIAMOND, letters || '', { cls: cls }) : '';
}
/* the shine: one band of light across the gem, clipped to the plate's own shield */
var SHINE = '<svg class="pw-shine" viewBox="40 40 432 440" aria-hidden="true" focusable="false"><defs>' +
  '<clipPath id="pw-clip"><path d="M70 64H442V283.52L256 456L70 283.52Z"/></clipPath>' +
  '<linearGradient id="pw-band" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>' +
  '<g clip-path="url(#pw-clip)"><rect class="pw-band" x="-60" y="0" width="120" height="560" fill="url(#pw-band)" transform="rotate(18 256 260)"/></g></svg>';
var GLINT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0l2.2 9.8L24 12l-9.8 2.2L12 24l-2.2-9.8L0 12l9.8-2.2z"/></svg>';

/* the shards: ice, white, data blue and signal, spread by the golden angle so every welcome falls alike */
function shards() {
  var cols = ['#bfe6ff', '#ffffff', '#5b82ff', '#ff4f1f', '#8fc9f2', '#d9d2ff'], h = '';
  for (var i = 0; i < 46; i++) {
    var f = (i * 0.618034) % 1, g = (i * 0.414214) % 1;
    h += '<i style="left:' + (f * 100).toFixed(1) + '%;background:' + cols[i % cols.length] + ';animation-delay:' + (0.15 + g * 0.7).toFixed(2) +
      's;animation-duration:' + (2.2 + ((i * 7) % 10) / 8).toFixed(2) + 's;--dx:' + Math.round((g - 0.5) * 160) + 'px;--r:' + Math.round((f - 0.5) * 900) + 'deg;--s:' + (0.7 + ((i * 3) % 5) / 8).toFixed(2) + '"></i>';
  }
  return '<div class="pw-shards" aria-hidden="true">' + h + '</div>';
}

function rowHTML(r, k, letters) {
  var icon = r.i === 'plate' ? gem(letters, 'pw-ri-gem') : ico(r.i);
  var body = '<span class="pw-ri">' + icon + '</span><span class="pw-rt"><b>' + esc(r.t) + (r.soon ? ' <em>soon</em>' : '') + '</b><small>' + esc(r.s) + '</small></span>';
  return r.go
    ? '<li style="--k:' + k + '"><button type="button" class="pw-row" data-pw-go="' + r.go + '">' + body + '<span class="pw-ch">' + ico('go') + '</span></button></li>'
    : '<li style="--k:' + k + '"><div class="pw-row flat' + (r.soon ? ' soon' : '') + '">' + body + '</div></li>';
}

function html(o) {
  var L = o.letters || '';
  return '<div class="pw-bg" aria-hidden="true"><i class="pw-rays"></i><i class="pw-glow"></i></div>' +
    (still() ? '' : shards()) +
    '<button type="button" class="pw-x" data-pw-close aria-label="Back to home">' + ico('x') + '</button>' +
    '<div class="pw-in">' +
      '<div class="pw-hero">' +
        '<div class="pw-gem">' + gem('', 'pw-plate') + SHINE + '<i class="pw-gl a">' + GLINT + '</i><i class="pw-gl b">' + GLINT + '</i><i class="pw-gl c">' + GLINT + '</i></div>' +
        '<p class="pw-chip">You\'re in</p>' +
        '<h2 class="pw-h" id="pw-h"><span>Welcome to</span> Shut The Door <em>Pro</em></h2>' +
        '<p class="pw-sub">Thanks for joining. Everything here is open now.</p>' +
        (o.pair ? '<a class="pw-pair" href="/baseball/"><img src="/baseball/icon-192.png?v=3" alt="" width="40" height="40"><span><b>Run The Diamond Pro is unlocked too.</b><small>Open Run The Diamond</small></span>' + ico('go') + '</a>' : '') +
      '</div>' +
      '<div class="pw-side">' +
        '<ul class="pw-list" aria-label="What Pro opens">' + ROWS.map(function (r, k) { return rowHTML(r, k, L); }).join('') + '</ul>' +
        '<div class="pw-act">' +
          '<button type="button" class="btn pw-go" data-pw-go="arc">Play a past daily</button>' +
          '<button type="button" class="btn pw-home" data-pw-close>Back to home</button>' +
        '</div>' +
      '</div>' +
    '</div>';
}

function focusables() { return box ? [].slice.call(box.querySelectorAll('button, a[href]')).filter(function (b) { return b.offsetParent !== null; }) : []; }
function onKey(e) {
  if (!box) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
  if (e.key !== 'Tab') return;
  var f = focusables(); if (!f.length) return;
  var a = f[0], z = f[f.length - 1];
  if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
  else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
}
function onClick(e) {
  var t = e.target && e.target.closest ? e.target : null;
  if (!t) return;
  var g = t.closest('[data-pw-go]');
  if (g) { var where = g.getAttribute('data-pw-go'); close(true); if (ctx.go) ctx.go(where); return; }
  if (t.closest('[data-pw-close]')) close();
}

/* o: {uid, name, letters, pair}. Marks the account seen, so it shows once. Returns whether it showed */
function show(o) {
  o = o || {};
  if (box || seen(o.uid)) return false;
  markSeen(o.uid);
  lastFocus = document.activeElement;
  box = document.createElement('section');
  box.className = 'pw' + (still() ? ' still' : '');
  box.id = 'pro-welcome';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'pw-h');
  box.innerHTML = html(o);
  document.body.appendChild(box);
  document.body.classList.add('pw-open');
  var app = document.getElementById('app'); if (app) app.setAttribute('inert', '');
  box.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey, true);
  void box.offsetWidth;
  box.classList.add('on');
  timers.push(setTimeout(function () { var s = box && box.querySelector('.pw-shards'); if (s) s.remove(); }, 4200));
  var go = box.querySelector('.pw-go'); if (go) try { go.focus({ preventScroll: true }); } catch (e) { go.focus(); }
  if (ctx.onChange) ctx.onChange();
  return true;
}
/* moving: a row or the primary button is taking the player somewhere, so the focus is theirs */
function close(moving) {
  if (!box) return;
  timers.forEach(clearTimeout); timers = [];
  document.removeEventListener('keydown', onKey, true);
  box.remove(); box = null;
  document.body.classList.remove('pw-open');
  var app = document.getElementById('app'); if (app) app.removeAttribute('inert');
  if (!moving && lastFocus && lastFocus.focus && document.contains(lastFocus)) try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
  lastFocus = null;
  if (ctx.onChange) ctx.onChange();
}

window.STD_PRO_WELCOME = {
  API_VERSION: 1,
  init: function (c) { for (var k in c) ctx[k] = c[k]; },
  show: show, close: function () { close(); }, seen: seen,
  isOpen: function () { return !!box; },
  ROWS: ROWS, SEEN: SEEN,
};
})();
