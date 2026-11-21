/* VGSync service worker: keeps the app's pages and files so it opens without internet.
   Data is not kept here (the app keeps it in IndexedDB); API calls are never touched. */
const VERSION = 'v1';
const CACHE = 'vgsync-app-' + VERSION;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('vgsync-app-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  const isPage = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  const isAsset = url.pathname.startsWith('/_astro/') || /\.(css|js|svg|png|jpe?g|webp|ico|woff2?)$/.test(url.pathname);
  if (!isPage && !isAsset) return;

  // Show what we have at once, refresh it in the background (pages), or keep it for good (hashed files).
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const key = isPage ? new Request(url.origin + url.pathname.replace(/\/+$/, '')) : req;
      const hit = await cache.match(key);
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(key, res.clone());
          return res;
        })
        .catch(() => null);
      if (hit) {
        if (/\/_astro\//.test(url.pathname)) return hit; // hashed: never changes
        event.waitUntil(fresh);
        return hit;
      }
      return (await fresh) || hit || new Response('Offline', { status: 503, statusText: 'Offline' });
    }),
  );
});
