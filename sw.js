// sw.js

// A version number for your cache. Change this every time you deploy major updates.
const CACHE_NAME = 'dcdl-cache-v2';

// A list of essential files to cache when the service worker installs.
const urlsToCache = [];

// --- INSTALL: Fired when the new Service Worker is first installed. ---
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        // Force the new service worker to become active immediately.
        return self.skipWaiting();
      })
  );
});

// --- ACTIVATE: Fired when the new Service Worker takes control. ---
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // If the cache name is old (i.e., not our current CACHE_NAME), delete it.
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Tell the active service worker to take control of the page immediately.
      return self.clients.claim();
    })
  );
});

// --- FETCH: Fired every time the page requests a resource (CSS, JS, images, etc.). ---
self.addEventListener('fetch', event => {
  // We'll use a "Network falling back to cache" strategy.
  // This ensures users always get the latest version if they are online.
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});