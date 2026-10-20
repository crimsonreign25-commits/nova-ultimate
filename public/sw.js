
const CACHE = 'nova-v21.5.1';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css?v=21.5.1',
  '/app.js?v=21.5.1',
  '/manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => /^nova-v\d/.test(key) && key !== CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Do not intercept private APIs, AI responses, or external requests.
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    [
      '/assist',
      '/research',
      '/scan-url',
      '/predict',
      '/health'
    ].includes(url.pathname)
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const isAppAsset = ASSETS.some(
          asset => url.pathname === asset.split('?')[0]
        );

        if (response.ok && isAppAsset) {
          const copy = response.clone();

          event.waitUntil(
            caches.open(CACHE)
              .then(cache => cache.put(event.request, copy))
          );
        }

        return response;
      })
      .catch(() =>
        caches.match(event.request)
          .then(cached => cached || caches.match('/'))
      )
  );
});
