const CACHE_NAME = '_hc-1788215179245';
const PRECACHE_URLS = [
  '/icon-192.png',
  '/icon-512.png',
];
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED' }));
      })
  );
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (url.hostname !== self.location.hostname) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/index.html').then(r => r ?? new Response('', { status: 503, statusText: 'Offline' }))
      )
    );
    return;
  }
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
  event.respondWith(
    fetch(event.request)
      .then((response) => {
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
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  self.registration.showNotification(data.title || 'Notification', {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
  });
});
