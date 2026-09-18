/**
 * Zorvex ERP 2.0 - Production Service Worker
 * Architecture: Online-First / PWA App Shell
 *
 * SECURITY & CACHING POLICY:
 * - NEVER cache authenticated API responses (/api/*)
 * - NEVER cache payroll, finance, HR, tenant tokens, or user data
 * - NEVER cache protected uploads or media (/media/*)
 * - NEVER cache Django admin routes (/admin/*)
 * - Navigation requests: Network-First with offline fallback to /app/index.html
 * - Versioned static assets (/app/assets/*, fonts, icons): Stale-While-Revalidate / Cache-First
 */

const CACHE_NAME = 'zorvex-shell-v2.0.1';

const PRECACHE_ASSETS = [
  '/app/',
  '/app/index.html',
  '/app/manifest.webmanifest',
  '/app/assets/logo-icon.png',
  '/app/assets/icon-192x192.png',
  '/app/assets/icon-512x512.png',
  '/app/assets/maskable-icon-512x512.png',
  '/app/assets/apple-touch-icon.png'
];

// 1. Install: Precache shell assets & activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        // Continue install even if individual assets fail precaching in dev
        console.warn('[Zorvex SW] Precache warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate: Purge stale caches from previous deployments & claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key.startsWith('zorvex-shell-') && key !== CACHE_NAME) {
            console.log('[Zorvex SW] Deleting obsolete cache:', key);
            return caches.delete(key);
          }
          return null;
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Allow clients to trigger skipWaiting on new deployment
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 4. Fetch: Safe Online-First routing
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // STRICT RULE: Only intercept GET requests
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // STRICT RULE: Never intercept or cache API, admin, or media routes
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/app/api/') ||
    url.pathname.startsWith('/admin/') ||
    url.pathname.startsWith('/media/')
  ) {
    return; // Let browser perform direct network fetch without SW interception
  }

  // Handle SPA Navigation requests (HTML navigation within /app)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // If valid network response received, clone and update shell cache if index.html
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put('/app/index.html', clone);
            });
          }
          return response;
        })
        .catch(async () => {
          // Offline fallback: serve cached app shell
          const cachedShell = await caches.match('/app/index.html');
          if (cachedShell) {
            return cachedShell;
          }
          return caches.match('/app/');
        })
    );
    return;
  }

  // Handle static app shell assets (hashed JS, CSS, fonts, public icons)
  const isStaticAsset =
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/app/assets/') ||
     url.pathname.endsWith('.js') ||
     url.pathname.endsWith('.css') ||
     url.pathname.endsWith('.woff2') ||
     url.pathname.endsWith('.png') ||
     url.pathname.endsWith('.ico') ||
     url.pathname.endsWith('.webmanifest'));

  const isThirdPartyFont =
    url.origin.includes('fonts.googleapis.com') ||
    url.origin.includes('fonts.gstatic.com') ||
    url.origin.includes('unpkg.com');

  if (isStaticAsset || isThirdPartyFont) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        // Network fetch to revalidate / cache-miss
        const networkFetch = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, clone);
              });
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        // Stale-while-revalidate: return cached if available, else wait for network
        return cachedResponse || networkFetch;
      })
    );
    return;
  }

  // Default: online-first direct network fetch
  event.respondWith(fetch(request));
});
