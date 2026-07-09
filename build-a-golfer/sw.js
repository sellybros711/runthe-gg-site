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
const CACHE = 'runtour-v5';   // bumped: V2 aligned accessory art + head/feet-aligned overlay (CS226)

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
    // network-first: updates always win when online; cached copy is the offline fallback.
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) { const c = await caches.open(CACHE); c.put(req, res.clone()); }
        return res;
      } catch (_) {
        return (await caches.match(req)) || (await caches.match('./index.html')) || Response.error();
      }
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
