/* TESTER-ROUND ANALYTICS, the page side (Phase 4, 2026-11-13). First party
 * events for the four numbers the tester round must hit before Last Shot can
 * go anywhere: time to the first Run It, wins within five tries, tries a
 * session and day-1 return.
 *
 *   POST /last-shot/e   { s: <session id>, ev: [{ n, t, p }, ...] }
 *
 * Same origin, behind the tester gate, so the gate cookie says who it is. The
 * events carry no personal data, this sets no cookie of its own and nothing
 * here talks to a third party. s is a random id per page load; t is
 * Math.round(performance.now()) when the event happened.
 *
 * SENDING: track(n, p) queues. The queue goes out when it reaches FLUSH_AT,
 * every FLUSH_MS while anything is queued, and when the page is hidden or
 * goes away (sendBeacon, a text/plain Blob, falling back to fetch with
 * keepalive). At most MAX_POST events a post. The answer is ignored and a
 * failed post is dropped, never retried.
 *
 * INERT under automation (navigator.webdriver) unless the page sets
 * window.__lastShotAnalytics = true, so the browser checks need no endpoint
 * and check-analytics.mjs turns it on. Nothing here ever throws into the
 * game. */

export const ENDPOINT = '/last-shot/e';
export const NAMES = Object.freeze(['open', 'run', 'result', 'level_open', 'daily_open', 'daily_filed', 'plays_load', 'save', 'share', 'beat_open']);
export const FLUSH_AT = 20, FLUSH_MS = 15000, MAX_POST = 40, MAX_P = 600;

const hasWin = typeof window !== 'undefined';
let queue = [], timer = null, wired = false, sid = null;

function sessionId() {
  if (sid) return sid;
  try {
    const b = new Uint8Array(16); crypto.getRandomValues(b);
    sid = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  } catch (e) { sid = 'x' + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36); }
  return sid;
}

/* On, unless a browser driver runs the page and has not asked for it. */
function live() {
  try {
    if (!hasWin || typeof navigator === 'undefined') return false;
    if (navigator.webdriver && window.__lastShotAnalytics !== true) return false;
    return true;
  } catch (e) { return false; }
}

/* Props as plain values (strings, numbers, booleans, null), and none at all
   when they would run past MAX_P characters of JSON. */
function cleanP(p) {
  const out = {};
  try {
    if (p && typeof p === 'object') {
      for (const k of Object.keys(p)) {
        const v = p[k];
        if (v === undefined) continue;
        if (v === null || typeof v === 'boolean' || typeof v === 'string') out[k] = typeof v === 'string' ? v.slice(0, 80) : v;
        else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
      }
    }
    if (JSON.stringify(out).length > MAX_P) return {};
  } catch (e) { return {}; }
  return out;
}

function bodyOf(ev) { return JSON.stringify({ s: sessionId(), ev }); }

/* Every batch of MAX_POST. beacon: the page is going, so sendBeacon first. */
function flush(beacon) {
  try {
    clearTimeout(timer); timer = null;
    if (!queue.length || !live()) { queue = []; return; }
    const all = queue; queue = [];
    for (let i = 0; i < all.length; i += MAX_POST) send(bodyOf(all.slice(i, i + MAX_POST)), beacon);
  } catch (e) {}
}
function send(body, beacon) {
  try {
    if (beacon && navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }))) return;
  } catch (e) {}
  try {
    const r = fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'same-origin' });
    if (r && r.catch) r.catch(() => {});
  } catch (e) {}
}

function wire() {
  if (wired || !hasWin) return;
  wired = true;
  try {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });
    window.addEventListener('pagehide', () => flush(true));
  } catch (e) {}
}

/* Queue an event. Unknown names are dropped here, as the server would. */
export function track(n, p) {
  try {
    if (!live() || !NAMES.includes(n)) return;
    wire();
    queue.push({ n, t: Math.round(performance.now()), p: cleanP(p) });
    if (queue.length >= FLUSH_AT) flush(false);
    else if (!timer) timer = setTimeout(() => flush(false), FLUSH_MS);
  } catch (e) {}
}

/* For check-analytics.mjs: send what is queued now. */
export function flushNow() { flush(false); }

/* THE FIRST OPEN: true only when this browser never opened Last Shot
   before. The key is set after the event is queued; a localStorage that
   fails says false, so a blocked one never counts as new every load.
   Inert, it neither reads nor sets the key. */
export const SEEN_KEY = 'last_shot_seen';
export function trackOpen(entry) {
  if (!live()) return;
  let first = false;
  try { first = localStorage.getItem(SEEN_KEY) == null; } catch (e) { first = false; }
  track('open', { first, entry });
  try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) {}
}
