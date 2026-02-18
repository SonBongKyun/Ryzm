/* ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�
   Ryzm Terminal ??Service Worker v4.7
   ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?� */
const CACHE_NAME = 'ryzm-v7.0';
const API_CACHE_NAME = 'ryzm-api-v7.0';

// ?�?� Precache: actual files loaded by index.html ?�?�
// No ?v= suffix ??SW uses ignoreSearch for cache matching
// NOTE: '/' is NOT in precache ??HTML is always network-first
const STATIC_ASSETS = [
  '/static/styles.css',
  '/static/js/api.js',
  '/static/js/chart.js',
  '/static/js/core.js',
  '/static/js/data.js',
  '/static/js/council.js',
  '/static/js/ui.js',
  '/static/js/portfolio.js',
  '/manifest.json'
];

// ?�?� API caching whitelist + TTL (ms) ?�?�
// User-specific / auth endpoints are NEVER cached.
const API_CACHE_RULES = {
  '/api/market':          5 * 60_000,
  '/api/news':            5 * 60_000,
  '/api/fear-greed':      5 * 60_000,
  '/api/heatmap':         5 * 60_000,
  '/api/funding-rate':    3 * 60_000,
  '/api/liquidations':    2 * 60_000,
  '/api/calendar':       10 * 60_000,
  '/api/risk-gauge':      3 * 60_000,
  '/api/scars':          30 * 60_000,
  '/api/health-check':    1 * 60_000,
  '/api/multi-timeframe': 5 * 60_000,
  '/api/onchain':         5 * 60_000,
  '/api/scanner':         3 * 60_000,
  '/api/regime':          5 * 60_000,
  '/api/correlation':    10 * 60_000,
  '/api/whale-wallets':   3 * 60_000,
  '/api/liq-zones':       5 * 60_000,
  '/api/kimchi':          3 * 60_000,
  '/api/long-short':      3 * 60_000,
  '/api/briefing':        5 * 60_000,
};

// Never cache these (user-specific / auth / mutations)
const API_NEVER_CACHE = [
  '/api/me', '/api/layout', '/api/alerts', '/api/council',
  '/api/validate', '/api/chat', '/api/auth/', '/api/payments/',
  '/api/export/', '/api/journal', '/api/risk-gauge/simulate',
  '/api/portfolio', '/api/council/accuracy', '/api/onboarding',
  '/api/events'
];

// ?�?� Install: precache static assets ?�?�
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ?�?� Activate: purge old caches ?�?�
self.addEventListener('activate', event => {
  const keep = new Set([CACHE_NAME, API_CACHE_NAME]);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !keep.has(k)).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ?�?� Fetch handler ?�?�
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;         // skip external
  if (event.request.method !== 'GET') return;              // skip mutations

  // ?� API routes ?�
  if (url.pathname.startsWith('/api/')) {
    // Block caching for user-specific endpoints
    if (API_NEVER_CACHE.some(p => url.pathname.startsWith(p))) {
      return; // let browser handle normally (network-only)
    }

    const rule = Object.entries(API_CACHE_RULES).find(([p]) => url.pathname.startsWith(p));
    if (!rule) return; // unknown API ??network-only

    const maxAge = rule[1];

    event.respondWith((async () => {
      const apiCache = await caches.open(API_CACHE_NAME);
      const cached = await apiCache.match(event.request);
      const cacheAge = cached
        ? Date.now() - Number(cached.headers.get('sw-cache-time') || 0)
        : Infinity;

      // Helper: fetch from network and store with timestamp
      const fetchAndCache = async () => {
        const netResp = await fetch(event.request);
        const body = await netResp.clone().arrayBuffer();
        const wrapped = new Response(body, {
          status: netResp.status,
          statusText: netResp.statusText,
          headers: new Headers([...netResp.headers.entries(),
                                ['sw-cache-time', String(Date.now())]])
        });
        apiCache.put(event.request, wrapped);
        return netResp;
      };

      // Stale-while-revalidate: if cache is fresh, return it + revalidate only when >50% stale
      if (cached && cacheAge < maxAge) {
        // Background revalidate only when cache is more than half-stale
        if (cacheAge > maxAge * 0.5) {
          fetchAndCache().catch(() => {});
        }
        return cached;
      }

      // Cache is stale or missing ??try network first
      try {
        return await fetchAndCache();
      } catch {
        // Offline: serve stale cache if available (even if expired), else 503
        if (cached) return cached;
        return new Response(JSON.stringify({ error: 'offline' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } });
      }
    })());
    return;
  }

  // ?� HTML navigation: always network-first (so template changes apply immediately) ?�
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(event.request).then(c => c || caches.match('/'))
      )
    );
    return;
  }

  // ?� Static assets: network-first, cache fallback for offline ?�
  // (ignoreSearch only used as offline fallback so ?v= busting always works)
  event.respondWith(
    fetch(event.request).then(resp => {
      const clone = resp.clone();
      caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
      return resp;
    }).catch(() =>
      caches.match(event.request, { ignoreSearch: true })
    )
  );
});
