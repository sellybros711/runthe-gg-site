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
      const netP = fetch(req).then(res => { if (res && res.ok) cache.put('./index.html', res.clone()); return res; }).catch(() => null);
      if (!cached) return (await netP) || Response.error();   // first-ever load: nothing cached → must wait for network
      const winner = await Promise.race([ netP, new Promise(r => setTimeout(() => r('__slow'), 2500)) ]);
      if (winner && winner !== '__slow') return winner;       // network responded in time → fresh
      return cached;                                          // slow network → cached now; netP still refreshes the cache
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
