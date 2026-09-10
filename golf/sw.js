/* RunTheTour service worker.
   Goal: kill the stale-cache problem (no more manual ?v= after every deploy) WITHOUT ever trapping a
   player on a bad version. Strategy:
     - Navigations / HTML  -> NETWORK-FIRST: always try the network so a new deploy lands immediately;
                              fall back to the cached copy only when offline.
     - Same-origin static  -> CACHE-FIRST with background refresh (icons, avatars, manifest).
     - Cross-origin        -> PASS-THROUGH (fonts, Supabase, AdSense, GA, flagcdn keep their own
                              caching/CORS; the SW never intercepts them).
   skipWaiting + clients.claim mean a newly-deployed SW takes over on the next load. Bump CACHE to
   force-invalidate everything on a breaking change. */
const CACHE = 'runtour-v7';   // CS430: network-first-with-timeout for HTML (fast loads on slow networks)
// How long a returning player waits for a fresh download before we hand them the cached page. The whole
// game is one file, so on a mid-tier phone the gzipped body alone takes ~2s - at the old 2500ms the
// network still won and nobody ever got the fast path. 1200ms means a decent connection is still served
// fresh (desktop lands in ~200ms) while a slow one opens instantly and picks the new build up next load.
const HTML_WAIT_MS = 1200;

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;   // never touch cross-origin

  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    // CS430: network-first WITH a fast cache fallback. A healthy network still wins (fresh deploys land
    // immediately), but if the network is slow/flaky we serve the cached copy after a short timeout so the
    // game opens fast instead of waiting on the full ~2MB download. The background fetch keeps updating the
    // cache for next time. Single cache entry ('./index.html') so any navigation URL (?h2h=, ?ref=…) hits it.
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match('./index.html');
      // fetch() resolves on RESPONSE HEADERS, not the body. The page is one ~3.8MB file (~1MB gzipped),
      // so on a slow connection the headers land in ~150ms, the race below picks "network" every time,
      // and the browser then sits for seconds streaming the body while a perfectly good cached copy is
      // right there - i.e. the fallback below could only ever fire if the SERVER was slow to answer, not
      // if the download was slow, which is the case that actually hurts. So read the body here: netP now
      // genuinely means "the whole page has arrived", and the timeout means what it says.
      const netP = fetch(req).then(async res => {
        if (!res || !res.ok) return res || null;
        const buf = await res.arrayBuffer();
        // Only carry content-type across: the original headers describe the COMPRESSED transfer
        // (content-encoding/content-length), and buf is already decoded.
        const h = new Headers();
        const ct = res.headers.get('content-type'); if (ct) h.set('content-type', ct);
        const init = { status: res.status, statusText: res.statusText, headers: h };
        cache.put('./index.html', new Response(buf, init));
        return new Response(buf, init);
      }).catch(() => null);
      if (!cached) return (await netP) || Response.error();   // first-ever load: nothing cached → must wait for network
      const winner = await Promise.race([ netP, new Promise(r => setTimeout(() => r('__slow'), HTML_WAIT_MS)) ]);
      if (winner && winner !== '__slow') return winner;       // whole page arrived in time → fresh
      return cached;                                          // slow download → cached now; netP still refreshes the cache
    })());
    return;
  }

  // same-origin static assets: serve cached fast, refresh in the background.
  e.respondWith((async () => {
    const cached = await caches.match(req);
    const net = fetch(req).then(res => {
      if (res && res.ok) { caches.open(CACHE).then(c => c.put(req, res.clone())); }
      return res;
    }).catch(() => null);
    return cached || (await net) || Response.error();
  })());
});
