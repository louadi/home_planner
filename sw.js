// Service worker: makes the planner work with no internet at all, which matters for a
// tablet in a kitchen.
//
// Strategy, chosen so that a deploy is picked up promptly without losing offline use:
//   - App code (JS/CSS/HTML): network-first with a short timeout, falling back to cache.
//     Serving cache-first here meant a new version only appeared on the *second* visit,
//     which is confusing when you have just published a fix.
//   - Icons and other static assets: cache-first, since they rarely change.
//   - Navigations: network-first, falling back to the cached shell when offline.
//
// Bump CACHE_VERSION whenever the file list changes.

const CACHE_VERSION = 'v7';
const CACHE_NAME = `home-planner-${CACHE_VERSION}`;
const NETWORK_TIMEOUT_MS = 3500;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './css/base.css',
  './css/components.css',
  './css/forms.css',
  './js/app.js',
  './js/state.js',
  './js/storage.js',
  './js/week.js',
  './js/data.js',
  './js/allocate.js',
  './js/dom.js',
  './js/dragdrop.js',
  './js/ics.js',
  './js/share.js',
  './js/tasks-ui.js',
  './js/view-today.js',
  './js/view-week.js',
  './js/view-balance.js',
  './js/view-groceries.js',
  './js/view-setup.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // addAll fails the whole install if any single file 404s, so add individually.
      await Promise.all(
        APP_SHELL.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => {
            /* a missing optional asset must not break installation */
          })
        )
      );
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

/** Race the network against a timeout so a flaky connection cannot hang the app. */
function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request).then(
      (response) => {
        clearTimeout(timer);
        resolve(response);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Let cross-origin requests (fonts) use the browser's own HTTP cache.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
          const cache = await caches.open(CACHE_NAME);
          cache.put('./index.html', fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match('./index.html')) || new Response('Offline', { status: 503 });
        }
      })()
    );
    return;
  }

  // Code must be fresh when the network allows it, or a published fix never arrives.
  const isCode = /\.(?:js|mjs|css|html|webmanifest)$/i.test(url.pathname);

  if (isCode) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const fresh = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
          if (fresh && fresh.ok) cache.put(request, fresh.clone());
          return fresh;
        } catch {
          return (await cache.match(request)) || new Response('Offline', { status: 503 });
        }
      })()
    );
    return;
  }

  // Everything else (icons, images): cache-first, refreshed quietly in the background.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) {
        event.waitUntil(
          fetch(request)
            .then((response) => {
              if (response && response.ok) return cache.put(request, response.clone());
            })
            .catch(() => {})
        );
        return cached;
      }
      try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok) cache.put(request, fresh.clone());
        return fresh;
      } catch {
        return new Response('Offline', { status: 503 });
      }
    })()
  );
});
