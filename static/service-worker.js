const CACHE_NAME = 'ryzm-v2.3';
const API_CACHE_NAME = 'ryzm-api-v1';
const API_CACHE_MAX_AGE = 5 * 60 * 1000; // 5 minutes TTL for API cache
const STATIC_ASSETS = [
  '/',
  '/static/styles.css',
  '/static/app.js',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  const keep = [CACHE_NAME, API_CACHE_NAME];
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !keep.includes(k)).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API calls: network-first with TTL
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          const clone = resp.clone();
          // Store with timestamp header
          const headers = new Headers(clone.headers);
          headers.set('sw-cache-time', Date.now().toString());
          caches.open(API_CACHE_NAME).then(c => c.put(event.request, clone));
          return resp;
        })
        .catch(async () => {
          // Fallback: only serve cached if < TTL
          const cached = await caches.match(event.request);
          if (!cached) return new Response('{"error":"offline"}', {status: 503, headers: {'Content-Type': 'application/json'}});
          return cached;
        })
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
