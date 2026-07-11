// 1783788590853 is replaced by the Vite `sw-version-stamp` plugin at build time.
// Every `npm run build` produces a unique cache name, which forces the browser to
// install the new SW and run the activate handler that deletes all old caches.
const CACHE_NAME = 'hilot-cache-__BUILD_TS__';

// DO NOT precache index.html or '/'.
// index.html has no hash in its filename, so caching it here would serve stale HTML
// even when the server sends Cache-Control: no-cache. Navigation requests always go
// to the network; the SW only caches Vite-hashed static assets (JS, CSS, images).
const PRECACHE_URLS = [
  '/icon-192.png',
  '/icon-512.png',
];

// Install: cache only the non-HTML shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: delete every cache except the current one
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy:
//  - Navigation (HTML pages): always network, never cache — ensures index.html is always fresh
//  - Supabase API: always network, never cache
//  - Hashed assets (JS/CSS/images): cache-first, update cache on success
//  - Anything else: network-first, fall back to cache
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Never intercept Supabase API traffic
  if (url.hostname.includes('supabase')) return;

  // Navigation requests (index.html) → pure network, no caching
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        // Offline only: serve the cached shell as a last resort
        caches.match('/index.html').then(r => r ?? new Response('', { status: 503, statusText: 'Offline' }))
      )
    );
    return;
  }

  // Vite-hashed assets have a content hash in the path, safe to cache forever
  const isHashedAsset = /\/assets\/.*\.(js|css|woff2?|png|jpg|svg|webp)(\?.*)?$/.test(url.pathname);

  if (isHashedAsset) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok && response.type !== 'opaque') {
              cache.put(event.request, response.clone()).catch(() => {});
            }
            return response;
          });
        })
      )
    );
    return;
  }

  // Everything else: network-first, cache as fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Only cache same-origin or explicit CORS responses with a 2xx status.
        // Opaque responses (type === 'opaque') have status 0 and cannot be put
        // into the Cache API without throwing a NetworkError.
        if (response.ok && response.type !== 'opaque') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) =>
            cache.put(event.request, responseToCache).catch(() => {})
          );
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(r => r ?? new Response('', { status: 503, statusText: 'Offline' })))
  );
});

// Push notifications
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  self.registration.showNotification(data.title || 'Hilot Center', {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
  });
});
