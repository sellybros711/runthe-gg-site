/* 4th and What: the launch events, the page side (the owner, 2026-11-14:
 * "use the Supabase table"). What the soft launch is judged on: snaps a
 * session, new players finishing a run, sessions that share or save, the time
 * to the first snap, the day 1 return (supabase/171 faw_round_report).
 *
 *   FAW_EVENTS.track(name, props)
 *
 * Batched to POST /api/faw/e (functions/api/faw/e.js), which keeps
 * only known names and props. A row carries a device id (a random id kept in
 * this browser's storage, 'faw_device'), a session id per page load and the
 * time since the page opened. Nothing personal, no cookie, nothing third party.
 * 'faw_opened' says whether this browser opened the game before, so a player
 * who played before the events began is never counted as new.
 *
 * Sent when 20 are queued, every 15 seconds while any are, and when the page
 * is hidden (sendBeacon). A failed post is dropped, never retried.
 *
 * Only on runthe.gg itself: a preview, a dev server and the browser checks
 * never write a row. A check can set window.__fawEvents = true to watch the
 * queue (window.__fawSent) without a request leaving the page.
 *
 * Plain script: window.FAW_EVENTS.
 */
(function (root) {
  'use strict';
  var ENDPOINT = '/api/faw/e', FLUSH_AT = 20, FLUSH_MS = 15000, MAX_POST = 40;
  var queue = [], timer = null, t0 = (root.performance && performance.now) ? performance.now() : 0;
  var LIVE = /^(www\.)?runthe\.gg$/.test(location.hostname) && !navigator.webdriver;
  var WATCH = root.__fawEvents === true;
  if (WATCH) root.__fawSent = [];

  function rid() {
    try { var b = new Uint8Array(12); crypto.getRandomValues(b); return Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
    catch (e) { return 'x' + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36); }
  }
  var device = null, first = true, session = rid();
  try { device = localStorage.getItem('faw_device'); first = !localStorage.getItem('faw_opened'); } catch (e) {}
  if (!device || !/^[A-Za-z0-9-]{8,40}$/.test(device)) { device = rid(); try { localStorage.setItem('faw_device', device); } catch (e) {} }
  try { localStorage.setItem('faw_opened', '1'); } catch (e) {}

  function now() { return Math.max(0, Math.round(((root.performance && performance.now) ? performance.now() : 0) - t0)); }
  function track(n, p) {
    if (!LIVE && !WATCH) return;
    try {
      queue.push({ n: n, t: now(), p: p || {} });
      if (queue.length >= FLUSH_AT) flush(false);
      else if (!timer) timer = setTimeout(function () { flush(false); }, FLUSH_MS);
    } catch (e) {}
  }
  function flush(beacon) {
    try {
      clearTimeout(timer); timer = null;
      if (!queue.length) return;
      var all = queue; queue = [];
      for (var i = 0; i < all.length; i += MAX_POST) send(JSON.stringify({ d: device, s: session, ev: all.slice(i, i + MAX_POST) }), beacon);
    } catch (e) {}
  }
  function send(body, beacon) {
    if (WATCH) { root.__fawSent.push(JSON.parse(body)); return; }
    try {
      if (beacon && navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }))) return;
      fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(function () {});
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(true); });
  root.addEventListener('pagehide', function () { flush(true); });

  /* the first open: where it landed, and whether this browser is new to the game */
  var h = (location.hash || '').slice(1);
  track('open', { first: first, entry: ['home', 'play', 'call', 'daily', 'coach'].indexOf(h) >= 0 ? h : h ? 'other' : 'home' });

  root.FAW_EVENTS = { track: track, flush: flush, device: function () { return device; } };
})(typeof window !== 'undefined' ? window : this);
