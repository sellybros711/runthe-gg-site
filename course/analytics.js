/* Run The Course: first party events, sent to the game's own route.
 *
 * A small queue, posted to POST /api/course/e when a shift ends and when the
 * page is hidden. Never on a timer. No cookie, nothing third party. A row
 * carries the account when one is signed in, and a random device id the page
 * keeps in rtc_device, so a guest counts too.
 *
 * NO EVENTS FROM THE EU, THE UK OR SWITZERLAND until the site has a consent
 * banner (the owner, 2026-11-23, for Last Shot; the same rule here). Once a
 * page load, before the first send and before any device id exists, the page
 * asks GET /api/course/e, which answers { on } by country. Off, or a probe
 * that fails: nothing is sent and no device id is made.
 *
 * Under a browser driver the page sends nothing, not even the probe, unless
 * a check sets window.__courseAnalytics. */
const DEVICE = 'rtc_device', SEEN = 'rtc_seen';
export function createAnalytics({ api = '/api/course/e', token }) {
  const live = !(typeof navigator !== 'undefined' && navigator.webdriver) || (typeof window !== 'undefined' && window.__courseAnalytics);
  const session = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const t0 = Date.now();
  let queue = [], on = null, probing = null, device = null, first = false;
  try { first = !localStorage.getItem(SEEN); localStorage.setItem(SEEN, '1'); } catch (e) {}
  function probe() {
    if (!live) return Promise.resolve(false);
    if (on !== null) return Promise.resolve(on);
    if (!probing) probing = fetch(api, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(j => { on = !!(j && j.on); return on; }).catch(() => { on = false; return false; })
      .then(v => {
        try { if (v) { device = localStorage.getItem(DEVICE); if (!device) { device = crypto.randomUUID(); localStorage.setItem(DEVICE, device); } } else { localStorage.removeItem(DEVICE); queue = []; } } catch (e) {}
        return v;
      });
    return probing;
  }
  function body() { const ev = queue; queue = []; return JSON.stringify({ s: session, d: device, ev }); }
  return {
    first,
    track(name, props) { if (!live || on === false) return; if (queue.length < 40) queue.push({ n: name, t: Date.now() - t0, p: props || {} }); },
    /* at rest: a shift ended */
    flush() {
      if (!queue.length) return;
      probe().then(ok => {
        if (!ok || !queue.length) return;
        const h = { 'Content-Type': 'application/json' }, t = token && token();
        if (t) h.Authorization = 'Bearer ' + t;
        fetch(api, { method: 'POST', headers: h, body: body(), keepalive: true }).catch(() => {});
      });
    },
    /* the tab is going away: only if the probe already said yes */
    last() {
      if (on !== true || !queue.length) return;
      const h = { 'Content-Type': 'application/json' }, t = token && token();
      if (t) h.Authorization = 'Bearer ' + t;
      try { fetch(api, { method: 'POST', headers: h, body: body(), keepalive: true }).catch(() => {}); } catch (e) {}
    }
  };
}
