const CACHE_NAME = 'crickscore-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
  '/logo192.png',
  '/logo512.png',
];

// Install Event - Pre-cache essential static shell assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Pre-caching offline assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up old cache versions and claim clients
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Handle offline routing & request caching
self.addEventListener('fetch', event => {
  // Only handle standard HTTP/HTTPS GET requests
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);

  // SPA Navigation Fallback (Document navigation requests)
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          // Cache the latest navigate response
          if (networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          // Offline fallback: try to find cached index.html or root
          return caches.match('/') || caches.match('/index.html') || caches.match(event.request);
        })
    );
    return;
  }

  // Handle application assets (JS, CSS, fonts, images)
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const isSelfAsset = url.origin === self.location.origin;
      const isCodeResource = event.request.destination === 'script' || event.request.destination === 'style';

      if (isSelfAsset && isCodeResource) {
        // Network-First for core JS/CSS files so code updates arrive instantly when online
        return fetch(event.request)
          .then(networkResponse => {
            if (networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
            }
            return networkResponse;
          })
          .catch(() => cachedResponse || Response.error());
      }

      // Stale-While-Revalidate for other static assets (images, fonts, manifests, favicon)
      const fetchPromise = fetch(event.request)
        .then(networkResponse => {
          if (networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          // Fail silently on background fetch errors
        });

      return cachedResponse || fetchPromise;
    })
  );
});
