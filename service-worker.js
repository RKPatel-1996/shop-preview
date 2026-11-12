/*
 * Amul Shop fictional preview service worker.
 *
 * The preview build injects one cache name and one approved path list
 * into the executable declarations below.
 *
 * No application data-storage access is permitted.
 * No runtime caching of unknown requests is permitted.
 */

'use strict';

const APP_ROOT = '/shop-preview/';
const CACHE_PREFIX = 'amul-shop-preview-';

const CACHE_NAME = "amul-shop-preview-v0.2-5b58dbac3c04489b46ca";
const PRECACHE_PATHS = ["/shop-preview/","/shop-preview/index.html","/shop-preview/assets/index-5nQhMkUe.css","/shop-preview/assets/index-CZtv7Mb7.js","/shop-preview/register-pwa.js","/shop-preview/preview-fonts.css","/shop-preview/manifest.webmanifest","/shop-preview/icons/icon-192.png","/shop-preview/icons/icon-512.png","/shop-preview/fonts/plus-jakarta-sans-variable.woff2","/shop-preview/fonts/noto-sans-devanagari-variable.woff2","/shop-preview/fonts/noto-sans-gujarati-variable.woff2","/shop-preview/fonts/FONT_LICENSES.txt"];

function validateConfiguration() {
  if (
    typeof CACHE_NAME !== 'string' ||
    !CACHE_NAME.startsWith(CACHE_PREFIX) ||
    !Array.isArray(PRECACHE_PATHS) ||
    PRECACHE_PATHS.length === 0
  ) {
    throw new Error('INVALID_PREVIEW_CACHE_CONFIGURATION');
  }

  const unique = new Set(PRECACHE_PATHS);

  if (
    unique.size !== PRECACHE_PATHS.length ||
    !unique.has(APP_ROOT)
  ) {
    throw new Error('INVALID_PREVIEW_ASSET_LIST');
  }

  for (const path of PRECACHE_PATHS) {
    if (
      typeof path !== 'string' ||
      !path.startsWith(APP_ROOT) ||
      path.startsWith(APP_ROOT + 'api/') ||
      path.includes('?') ||
      path.includes('#') ||
      path.includes('\\') ||
      path.split('/').includes('..')
    ) {
      throw new Error('UNSAFE_PREVIEW_ASSET_PATH');
    }
  }

  const scope = new URL(self.registration.scope);

  if (
    scope.origin !== self.location.origin ||
    scope.pathname !== APP_ROOT ||
    self.location.pathname !==
      APP_ROOT + 'service-worker.js'
  ) {
    throw new Error('UNEXPECTED_SERVICE_WORKER_SCOPE');
  }
}

validateConfiguration();

const approvedPaths = new Set(PRECACHE_PATHS);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    try {
      /*
       * addAll rejects if an essential response cannot be
       * fetched successfully. Verify every required entry
       * before allowing installation to finish.
       */
      await cache.addAll(PRECACHE_PATHS);

      for (const path of PRECACHE_PATHS) {
        const response = await cache.match(path);

        if (!response || !response.ok) {
          throw new Error(
            'INCOMPLETE_OFFLINE_SHELL: ' + path
          );
        }
      }
    } catch (error) {
      /*
       * Delete only this attempted version's cache.
       * Existing active-version caches remain intact.
       */
      await caches.delete(CACHE_NAME);
      throw error;
    }
  })());

  /*
   * Intentionally no skipWaiting().
   * An updated worker waits for existing clients to close.
   */
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const current = await caches.open(CACHE_NAME);

    /*
     * Never discard the old shell unless the replacement
     * contains its complete approved asset inventory.
     */
    for (const path of PRECACHE_PATHS) {
      const response = await current.match(path);

      if (!response || !response.ok) {
        throw new Error(
          'ACTIVATION_CACHE_INCOMPLETE: ' + path
        );
      }
    }

    const names = await caches.keys();

    await Promise.all(
      names
        .filter(name =>
          name.startsWith(CACHE_PREFIX) &&
          name !== CACHE_NAME
        )
        .map(name => caches.delete(name))
    );

    /*
     * This also permits first-install clients to become
     * controlled without a second online navigation.
     */
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (
    url.origin !== self.location.origin ||
    !url.pathname.startsWith(APP_ROOT) ||
    url.search !== '' ||
    !approvedPaths.has(url.pathname)
  ) {
    return;
  }

  /*
   * Never substitute the app shell for an unrelated
   * navigation or future backend endpoint.
   */
  if (
    request.mode === 'navigate' &&
    url.pathname !== APP_ROOT
  ) {
    return;
  }

  /*
   * Range requests should not receive incomplete
   * or incorrectly transformed cached responses.
   */
  if (request.headers.has('range')) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(url.pathname);

    if (cached) return cached;

    /*
     * Missing assets may be fetched online, but are never
     * dynamically cached. Only the verified build manifest
     * determines the offline inventory.
     */
    return fetch(request);
  })());
});
