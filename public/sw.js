// Service Worker for "On mange quoi?" PWA
// Bump CACHE_NAME on every change that should invalidate clients — the new SW
// skips waiting, claims open tabs, and the activate handler purges old caches.
const CACHE_NAME = 'omq-v2';

// Install: take over immediately. We intentionally do NOT pre-cache '/', so the
// HTML document is never served stale — navigations are always network-first.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// Fetch: always network-first. Static assets get cached for offline; HTML
// documents are NEVER cached, so the page shell can't be served stale.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET and cross-origin Convex/API requests
  if (event.request.method !== 'GET') return;
  if (url.hostname.includes('convex.cloud')) return;
  if (url.hostname.includes('pollinations.ai')) return;

  // Never intercept navigations / HTML — let the browser fetch a fresh document.
  if (event.request.mode === 'navigate') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses for static, fingerprinted assets only.
        if (response.ok && url.pathname.match(/\.(js|css|png|jpg|webp|svg|ico|woff2?)$/)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
